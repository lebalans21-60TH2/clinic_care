import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dns from 'dns';
import fs from 'fs';
import { MongoClient } from 'mongodb';
import type { Db as MongoDatabase } from 'mongodb';
import path from 'path';
import QRCode from 'qrcode';
import type {
  Appointment,
  AuditLogItem,
  BackupMeta,
  DayShiftConfig,
  DoctorProfile,
  DoctorReview,
  DoctorSchedule,
  MedicalRecord,
  NotificationItem,
  ServiceItem,
  Specialty,
  TimeSlotAvailability,
  User,
} from '../src/types/clinic.ts';

export interface DatabaseSchema {
  users: User[];
  specialties: Specialty[];
  services: ServiceItem[];
  doctors: DoctorProfile[];
  schedules: DoctorSchedule[];
  appointments: Appointment[];
  medicalRecords: MedicalRecord[];
  reviews: DoctorReview[];
  notifications: NotificationItem[];
  auditLogs: AuditLogItem[];
  backups: BackupMeta[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'cliniccare_db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

let writeLock: Promise<void> = Promise.resolve();

export function withDbLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn, fn);
  writeLock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function getTodayOffset(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date.toISOString().slice(0, 10);
}

function createDefaultShifts(includeSaturday = true): Record<number, DayShiftConfig> {
  const shifts: Record<number, DayShiftConfig> = {};
  for (let day = 0; day <= 6; day++) {
    const isWorking = day >= 1 && (day <= 5 || (includeSaturday && day === 6));
    shifts[day] = {
      enabled: isWorking,
      morningStart: '08:00',
      morningEnd: '11:30',
      afternoonStart: '13:30',
      afternoonEnd: day === 6 ? '16:30' : '17:00',
    };
  }
  return shifts;
}

export async function generateAppointmentQr(payloadObj: {
  code: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  date: string;
  timeSlot: string;
}): Promise<{ qrPayload: string; qrCodeDataUrl: string }> {
  const qrPayload = JSON.stringify({
    system: 'ClinicCare',
    ...payloadObj,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 320,
    margin: 2,
    color: {
      dark: '#0F172A',
      light: '#FFFFFF',
    },
  });
  return { qrPayload, qrCodeDataUrl };
}

export async function generateVietQrDataUrl(params: {
  code: string;
  amountVnd: number;
  patientName: string;
}): Promise<string> {
  const payload = JSON.stringify({
    standard: 'VietQR-ClinicCare',
    bank: 'BIDV',
    accountNo: '31410002886888',
    accountName: 'PHONG KHAM DA KHOA CLINICCARE',
    amountVnd: params.amountVnd,
    reference: `TT ${params.code}`,
    patientName: params.patientName,
  });
  return QRCode.toDataURL(payload, {
    width: 280,
    margin: 2,
    color: {
      dark: '#0F766E',
      light: '#FFFFFF',
    },
  });
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function computeAvailableSlots(
  db: DatabaseSchema,
  doctorId: string,
  dateStr: string,
): TimeSlotAvailability[] {
  const schedule = db.schedules.find((s) => s.doctorId === doctorId);
  if (!schedule) return [];
  if (schedule.blockedDates.includes(dateStr)) return [];

  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return [];
  const dayOfWeek = parsed.getDay();
  const shift = schedule.weeklyShifts[dayOfWeek];
  if (!shift || !shift.enabled) return [];

  const duration = schedule.slotDurationMinutes || 30;
  const slots: string[] = [];

  const appendRange = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return;
    let cur = timeToMinutes(startStr);
    const end = timeToMinutes(endStr);
    while (cur + duration <= end) {
      slots.push(minutesToTime(cur));
      cur += duration;
    }
  };

  appendRange(shift.morningStart, shift.morningEnd);
  appendRange(shift.afternoonStart, shift.afternoonEnd);

  const activeBookings = db.appointments.filter(
    (a) =>
      a.doctorId === doctorId &&
      a.date === dateStr &&
      a.status !== 'CANCELLED' &&
      a.status !== 'REJECTED',
  );
  const bookedTimes = new Set(activeBookings.map((b) => b.timeSlot));

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return slots.map((time) => {
    if (bookedTimes.has(time)) {
      return { time, available: false, reason: 'Đã có người đặt' };
    }
    if (dateStr === todayStr && timeToMinutes(time) <= currentMinutes + 15) {
      return { time, available: false, reason: 'Đã qua giờ' };
    }
    if (dateStr < todayStr) {
      return { time, available: false, reason: 'Ngày đã qua' };
    }
    return { time, available: true };
  });
}

async function createSeedDatabase(): Promise<DatabaseSchema> {
  const now = new Date().toISOString();
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const doctorHash = await bcrypt.hash('Doctor@123', 10);
  const patientHash = await bcrypt.hash('Patient@123', 10);

  const users: User[] = [
    {
      id: 'usr-admin-1',
      email: 'admin@cliniccare.vn',
      passwordHash: adminHash,
      fullName: 'Nguyễn Minh Quân',
      phone: '0901000001',
      role: 'ADMIN',
      active: true,
      gender: 'Nam',
      createdAt: now,
    },
    {
      id: 'usr-doc-1',
      email: 'minh.bs@cliniccare.vn',
      passwordHash: doctorHash,
      fullName: 'BS. CKII Trần Văn Minh',
      phone: '0902000101',
      role: 'DOCTOR',
      active: true,
      gender: 'Nam',
      createdAt: now,
    },
    {
      id: 'usr-doc-2',
      email: 'linh.bs@cliniccare.vn',
      passwordHash: doctorHash,
      fullName: 'ThS. BS Nguyễn Thị Linh',
      phone: '0902000102',
      role: 'DOCTOR',
      active: true,
      gender: 'Nữ',
      createdAt: now,
    },
    {
      id: 'usr-doc-3',
      email: 'ha.bs@cliniccare.vn',
      passwordHash: doctorHash,
      fullName: 'BS. CKI Lê Thu Hà',
      phone: '0902000103',
      role: 'DOCTOR',
      active: true,
      gender: 'Nữ',
      createdAt: now,
    },
    {
      id: 'usr-doc-4',
      email: 'binh.bs@cliniccare.vn',
      passwordHash: doctorHash,
      fullName: 'BS. CKII Nguyễn Văn Bình',
      phone: '0902000104',
      role: 'DOCTOR',
      active: true,
      gender: 'Nam',
      createdAt: now,
    },
    {
      id: 'usr-pat-1',
      email: 'an.nguyen@gmail.com',
      passwordHash: patientHash,
      fullName: 'Nguyễn Văn An',
      phone: '0913456789',
      role: 'PATIENT',
      active: true,
      gender: 'Nam',
      dateOfBirth: '1992-05-14',
      address: '128 Nguyễn Đình Chiểu, Quận 3, TP.HCM',
      bloodType: 'O+',
      allergies: 'Không có tiền sử dị ứng thuốc',
      createdAt: now,
    },
    {
      id: 'usr-pat-2',
      email: 'huong.tran@gmail.com',
      passwordHash: patientHash,
      fullName: 'Trần Thu Hương',
      phone: '0918222333',
      role: 'PATIENT',
      active: true,
      gender: 'Nữ',
      dateOfBirth: '1996-11-08',
      address: '45 Phan Xích Long, Phú Nhuận, TP.HCM',
      bloodType: 'A+',
      allergies: 'Dị ứng Penicillin nhẹ',
      createdAt: now,
    },
  ];

  const specialties: Specialty[] = [
    {
      id: 'spec-cardio',
      name: 'Tim mạch',
      slug: 'tim-mach',
      description: 'Tầm soát tăng huyết áp, rối loạn nhịp tim, siêu âm tim và tư vấn phòng ngừa bệnh lý mạch vành.',
      roomNumber: 'P.201',
      active: true,
    },
    {
      id: 'spec-ped',
      name: 'Nhi khoa',
      slug: 'nhi-khoa',
      description: 'Khám sức khỏe tổng quát trẻ em, theo dõi tăng trưởng, hô hấp nhi và tư vấn dinh dưỡng.',
      roomNumber: 'P.102',
      active: true,
    },
    {
      id: 'spec-derm',
      name: 'Da liễu',
      slug: 'da-lieu',
      description: 'Điều trị viêm da cơ địa, mụn trứng cá y khoa, dị ứng da và soi da chuyên sâu.',
      roomNumber: 'P.204',
      active: true,
    },
    {
      id: 'spec-ent',
      name: 'Tai Mũi Họng',
      slug: 'tai-mui-hong',
      description: 'Nội soi tai mũi họng ống mềm không đau, điều trị viêm xoang, viêm amidan và rối loạn tiền đình.',
      roomNumber: 'P.105',
      active: true,
    },
  ];

  const services: ServiceItem[] = [
    {
      id: 'srv-1',
      specialtyId: 'spec-cardio',
      name: 'Khám & tư vấn chuyên khoa Tim mạch',
      description: 'Đánh giá huyết áp, nghe tim phổi, tư vấn phác đồ điều trị.',
      priceVnd: 350000,
      durationMinutes: 30,
      active: true,
    },
    {
      id: 'srv-2',
      specialtyId: 'spec-cardio',
      name: 'Đo điện tâm đồ (ECG) & Siêu âm tim',
      description: 'Tầm soát rối loạn nhịp và chức năng co bóp cơ tim.',
      priceVnd: 650000,
      durationMinutes: 30,
      active: true,
    },
    {
      id: 'srv-3',
      specialtyId: 'spec-ped',
      name: 'Khám Nhi khoa tổng quát',
      description: 'Kiểm tra sức khỏe định kỳ, đánh giá chiều cao cân nặng và bệnh lý hô hấp.',
      priceVnd: 300000,
      durationMinutes: 30,
      active: true,
    },
    {
      id: 'srv-4',
      specialtyId: 'spec-ped',
      name: 'Tư vấn dinh dưỡng & tiêm chủng',
      description: 'Xây dựng thực đơn theo độ tuổi và lập lịch tiêm chủng an toàn.',
      priceVnd: 280000,
      durationMinutes: 30,
      active: true,
    },
    {
      id: 'srv-5',
      specialtyId: 'spec-derm',
      name: 'Khám Da liễu & soi da kỹ thuật số',
      description: 'Chẩn đoán bệnh lý da liễu, viêm da tiếp xúc và phác đồ chăm sóc da.',
      priceVnd: 320000,
      durationMinutes: 30,
      active: true,
    },
    {
      id: 'srv-6',
      specialtyId: 'spec-derm',
      name: 'Điều trị mụn & phục hồi hàng rào da',
      description: 'Phác đồ cá nhân hóa kết hợp thuốc bôi và chăm sóc chuẩn y khoa.',
      priceVnd: 480000,
      durationMinutes: 30,
      active: true,
    },
    {
      id: 'srv-7',
      specialtyId: 'spec-ent',
      name: 'Khám & Nội soi Tai Mũi Họng',
      description: 'Nội soi bằng ống mềm độ phân giải cao phát hiện sớm viêm xoang, polyp.',
      priceVnd: 380000,
      durationMinutes: 30,
      active: true,
    },
    {
      id: 'srv-8',
      specialtyId: 'spec-ent',
      name: 'Rửa xoang & khí dung điều trị',
      description: 'Thủ thuật làm sạch hốc mũi xoang giảm nghẹt mũi kéo dài.',
      priceVnd: 250000,
      durationMinutes: 30,
      active: true,
    },
  ];

  const doctors: DoctorProfile[] = [
    {
      id: 'doc-1',
      userId: 'usr-doc-1',
      fullName: 'BS. CKII Trần Văn Minh',
      title: 'Trưởng khoa Tim mạch',
      qualifications: 'Bác sĩ Chuyên khoa II Nội Tim mạch · Chứng chỉ Siêu âm Tim – Mạch máu',
      specialtyId: 'spec-cardio',
      experienceYears: 18,
      bio: 'Nguyên bác sĩ điều trị tại Viện Tim TP.HCM, chuyên sâu về tăng huyết áp kháng trị và bệnh mạch vành.',
      consultationFeeVnd: 350000,
      avatarUrl: '/src/assets/images/doctor_portrait_cardiology_1795142594653.jpg',
      roomNumber: 'P.201',
      contactEmail: 'minh.bs@cliniccare.vn',
      rating: 4.9,
      active: true,
    },
    {
      id: 'doc-2',
      userId: 'usr-doc-2',
      fullName: 'ThS. BS Nguyễn Thị Linh',
      title: 'Bác sĩ chuyên khoa Nhi',
      qualifications: 'Thạc sĩ Nhi khoa ĐH Y Dược TP.HCM · Chứng chỉ Dinh dưỡng Nhi lâm sàng',
      specialtyId: 'spec-ped',
      experienceYears: 11,
      bio: 'Tốt nghiệp Thạc sĩ Nhi khoa Đại học Y Dược TP.HCM, tận tâm trong điều trị hô hấp nhi và dinh dưỡng.',
      consultationFeeVnd: 300000,
      avatarUrl: '/src/assets/images/doctor_portrait_pediatrics_1795142594821.jpg',
      roomNumber: 'P.102',
      contactEmail: 'linh.bs@cliniccare.vn',
      rating: 4.9,
      active: true,
    },
    {
      id: 'doc-3',
      userId: 'usr-doc-3',
      fullName: 'BS. CKI Lê Thu Hà',
      title: 'Bác sĩ chuyên khoa Da liễu',
      qualifications: 'Bác sĩ Chuyên khoa I Da liễu · Chứng chỉ Laser & Chăm sóc da thẩm mỹ y khoa',
      specialtyId: 'spec-derm',
      experienceYears: 9,
      bio: 'Chuyên gia điều trị viêm da cơ địa, mụn trứng cá mạn tính và các bệnh lý dị ứng da liễu.',
      consultationFeeVnd: 320000,
      avatarUrl: '/src/assets/images/doctor_portrait_dermatology_1795142595007.jpg',
      roomNumber: 'P.204',
      contactEmail: 'ha.bs@cliniccare.vn',
      rating: 4.8,
      active: true,
    },
    {
      id: 'doc-4',
      userId: 'usr-doc-4',
      fullName: 'BS. CKII Nguyễn Văn Bình',
      title: 'Bác sĩ chuyên khoa Tai Mũi Họng',
      qualifications: 'Bác sĩ Chuyên khoa II Tai Mũi Họng · Chứng chỉ Nội soi Tai Mũi Họng ống mềm',
      specialtyId: 'spec-ent',
      experienceYears: 15,
      bio: 'Kinh nghiệm 15 năm nội soi chẩn đoán và điều trị viêm mũi xoang, viêm tai giữa và rối loạn giọng nói.',
      consultationFeeVnd: 380000,
      avatarUrl: '/src/assets/images/doctor_portrait_ent_1795142594442.jpg',
      roomNumber: 'P.105',
      contactEmail: 'binh.bs@cliniccare.vn',
      rating: 4.9,
      active: true,
    },
  ];

  const schedules: DoctorSchedule[] = doctors.map((doc) => ({
    doctorId: doc.id,
    slotDurationMinutes: 30,
    weeklyShifts: createDefaultShifts(true),
    blockedDates: [],
  }));

  const dMinus2 = getTodayOffset(-2);
  const dMinus1 = getTodayOffset(-1);
  const dPlus1 = getTodayOffset(1);
  const dPlus2 = getTodayOffset(2);

  const apt1Qr = await generateAppointmentQr({
    code: 'CC-260101',
    appointmentId: 'apt-1',
    patientId: 'usr-pat-1',
    doctorId: 'doc-1',
    date: dMinus2,
    timeSlot: '09:00',
  });
  const apt2Qr = await generateAppointmentQr({
    code: 'CC-260102',
    appointmentId: 'apt-2',
    patientId: 'usr-pat-1',
    doctorId: 'doc-4',
    date: dPlus1,
    timeSlot: '09:30',
  });
  const apt3Qr = await generateAppointmentQr({
    code: 'CC-260103',
    appointmentId: 'apt-3',
    patientId: 'usr-pat-2',
    doctorId: 'doc-3',
    date: dPlus1,
    timeSlot: '14:00',
  });
  const apt4Qr = await generateAppointmentQr({
    code: 'CC-260104',
    appointmentId: 'apt-4',
    patientId: 'usr-pat-2',
    doctorId: 'doc-2',
    date: dMinus1,
    timeSlot: '10:00',
  });
  const apt5Qr = await generateAppointmentQr({
    code: 'CC-260105',
    appointmentId: 'apt-5',
    patientId: 'usr-pat-1',
    doctorId: 'doc-1',
    date: dPlus2,
    timeSlot: '08:30',
  });

  const appointments: Appointment[] = [
    {
      id: 'apt-1',
      code: 'CC-260101',
      patientId: 'usr-pat-1',
      patientName: 'Nguyễn Văn An',
      patientPhone: '0913456789',
      doctorId: 'doc-1',
      doctorName: 'BS. CKII Trần Văn Minh',
      specialtyId: 'spec-cardio',
      specialtyName: 'Tim mạch',
      serviceId: 'srv-1',
      serviceName: 'Khám & tư vấn chuyên khoa Tim mạch',
      servicePriceVnd: 350000,
      date: dMinus2,
      timeSlot: '09:00',
      symptoms: 'Đo huyết áp tại nhà buổi sáng thấy 142/90 mmHg, hơi nặng đầu.',
      status: 'COMPLETED',
      qrCodeDataUrl: apt1Qr.qrCodeDataUrl,
      qrPayload: apt1Qr.qrPayload,
      checkedInAt: `${dMinus2}T08:52:00.000Z`,
      createdAt: `${dMinus2}T07:30:00.000Z`,
      updatedAt: `${dMinus2}T09:35:00.000Z`,
    },
    {
      id: 'apt-2',
      code: 'CC-260102',
      patientId: 'usr-pat-1',
      patientName: 'Nguyễn Văn An',
      patientPhone: '0913456789',
      doctorId: 'doc-4',
      doctorName: 'BS. CKII Nguyễn Văn Bình',
      specialtyId: 'spec-ent',
      specialtyName: 'Tai Mũi Họng',
      serviceId: 'srv-7',
      serviceName: 'Khám & Nội soi Tai Mũi Họng',
      servicePriceVnd: 380000,
      date: dPlus1,
      timeSlot: '09:30',
      symptoms: 'Nghẹt mũi một bên kéo dài 5 ngày, đau nhẹ vùng trán vào buổi sáng.',
      status: 'CONFIRMED',
      qrCodeDataUrl: apt2Qr.qrCodeDataUrl,
      qrPayload: apt2Qr.qrPayload,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'apt-3',
      code: 'CC-260103',
      patientId: 'usr-pat-2',
      patientName: 'Trần Thu Hương',
      patientPhone: '0918222333',
      doctorId: 'doc-3',
      doctorName: 'BS. CKI Lê Thu Hà',
      specialtyId: 'spec-derm',
      specialtyName: 'Da liễu',
      serviceId: 'srv-5',
      serviceName: 'Khám Da liễu & soi da kỹ thuật số',
      servicePriceVnd: 320000,
      date: dPlus1,
      timeSlot: '14:00',
      symptoms: 'Nổi mẩn đỏ và khô ngứa vùng cổ tay sau khi đổi sữa rửa mặt.',
      status: 'PENDING',
      qrCodeDataUrl: apt3Qr.qrCodeDataUrl,
      qrPayload: apt3Qr.qrPayload,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'apt-4',
      code: 'CC-260104',
      patientId: 'usr-pat-2',
      patientName: 'Trần Thu Hương',
      patientPhone: '0918222333',
      doctorId: 'doc-2',
      doctorName: 'ThS. BS Nguyễn Thị Linh',
      specialtyId: 'spec-ped',
      specialtyName: 'Nhi khoa',
      serviceId: 'srv-3',
      serviceName: 'Khám Nhi khoa tổng quát',
      servicePriceVnd: 300000,
      date: dMinus1,
      timeSlot: '10:00',
      symptoms: 'Khám kiểm tra ho khan ban đêm cho bé Minh Khôi (5 tuổi).',
      status: 'COMPLETED',
      qrCodeDataUrl: apt4Qr.qrCodeDataUrl,
      qrPayload: apt4Qr.qrPayload,
      checkedInAt: `${dMinus1}T09:50:00.000Z`,
      createdAt: `${dMinus1}T08:10:00.000Z`,
      updatedAt: `${dMinus1}T10:30:00.000Z`,
    },
    {
      id: 'apt-5',
      code: 'CC-260105',
      patientId: 'usr-pat-1',
      patientName: 'Nguyễn Văn An',
      patientPhone: '0913456789',
      doctorId: 'doc-1',
      doctorName: 'BS. CKII Trần Văn Minh',
      specialtyId: 'spec-cardio',
      specialtyName: 'Tim mạch',
      serviceId: 'srv-2',
      serviceName: 'Đo điện tâm đồ (ECG) & Siêu âm tim',
      servicePriceVnd: 650000,
      date: dPlus2,
      timeSlot: '08:30',
      symptoms: 'Tái khám theo dõi huyết áp và làm điện tâm đồ theo lịch hẹn.',
      status: 'PENDING',
      qrCodeDataUrl: apt5Qr.qrCodeDataUrl,
      qrPayload: apt5Qr.qrPayload,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const historicalAppointments = await createHistoricalAppointments(doctors, specialties, services);
  appointments.push(...historicalAppointments);

  const medicalRecords: MedicalRecord[] = [
    {
      id: 'rec-1',
      appointmentId: 'apt-1',
      appointmentCode: 'CC-260101',
      patientId: 'usr-pat-1',
      patientName: 'Nguyễn Văn An',
      doctorId: 'doc-1',
      doctorName: 'BS. CKII Trần Văn Minh',
      specialtyName: 'Tim mạch',
      visitDate: dMinus2,
      chiefComplaint: 'Đau đầu nhẹ buổi sáng, huyết áp dao động 140/90 mmHg.',
      diagnosis: 'Tăng huyết áp độ 1 (chưa biến chứng)',
      icdCode: 'I10',
      clinicalNotes:
        'Nhịp tim đều 76 lần/phút, chưa phát hiện tiếng thổi bệnh lý. Khuyên giảm muối < 5g/ngày, theo dõi huyết áp 2 lần/ngày và tái khám đo ECG.',
      vitalSigns: {
        bloodPressure: '140/88 mmHg',
        heartRate: '76 bpm',
        temperature: '36.6 °C',
        weight: '71 kg',
      },
      prescriptions: [
        {
          medicine: 'Amlodipine 5mg',
          dosage: '1 viên',
          frequency: 'Uống sáng sau ăn',
          duration: '14 ngày',
          note: 'Theo dõi huyết áp trước khi uống',
        },
        {
          medicine: 'Magne B6',
          dosage: '1 viên',
          frequency: 'Sáng 1, Chiều 1',
          duration: '14 ngày',
          note: 'Hỗ trợ giảm căng thẳng thần kinh',
        },
      ],
      followUpDate: dPlus2,
      createdAt: `${dMinus2}T09:35:00.000Z`,
      updatedAt: `${dMinus2}T09:35:00.000Z`,
    },
    {
      id: 'rec-2',
      appointmentId: 'apt-4',
      appointmentCode: 'CC-260104',
      patientId: 'usr-pat-2',
      patientName: 'Trần Thu Hương',
      doctorId: 'doc-2',
      doctorName: 'ThS. BS Nguyễn Thị Linh',
      specialtyName: 'Nhi khoa',
      visitDate: dMinus1,
      chiefComplaint: 'Bé ho khan về đêm 3 ngày, không sốt, ăn ngủ bình thường.',
      diagnosis: 'Viêm đường hô hấp trên cấp nhẹ',
      icdCode: 'J06.9',
      clinicalNotes:
        'Phổi trong, không ran. Họng sung huyết nhẹ. Rửa mũi nước muối sinh lý ấm trước khi ngủ và giữ ấm cổ ngực.',
      vitalSigns: {
        bloodPressure: '95/60 mmHg',
        heartRate: '98 bpm',
        temperature: '36.8 °C',
        weight: '18.5 kg',
      },
      prescriptions: [
        {
          medicine: 'Siro thảo dược Prospan',
          dosage: '5 ml',
          frequency: 'Ngày 2 lần sáng - tối',
          duration: '5 ngày',
          note: 'Uống sau ăn 30 phút',
        },
        {
          medicine: 'Nước muối sinh lý NaCl 0.9%',
          dosage: '2-3 giọt/bên mũi',
          frequency: 'Ngày 3 lần',
          duration: '7 ngày',
          note: 'Vệ sinh mũi nhẹ nhàng',
        },
      ],
      createdAt: `${dMinus1}T10:30:00.000Z`,
      updatedAt: `${dMinus1}T10:30:00.000Z`,
    },
  ];

  const notifications: NotificationItem[] = [
    {
      id: 'noti-1',
      userId: 'usr-pat-1',
      title: 'Lịch hẹn CC-260102 đã được xác nhận',
      message: `BS. CKII Nguyễn Văn Bình đã xác nhận lịch khám ngày ${dPlus1} lúc 09:30 tại phòng P.105.`,
      type: 'APPOINTMENT',
      relatedId: 'apt-2',
      read: false,
      createdAt: now,
    },
    {
      id: 'noti-2',
      userId: 'usr-pat-1',
      title: 'Hồ sơ khám Tim mạch đã cập nhật',
      message: 'Đơn thuốc và chỉ số sinh tồn lần khám CC-260101 đã được bác sĩ hoàn tất.',
      type: 'MEDICAL_RECORD',
      relatedId: 'rec-1',
      read: true,
      createdAt: `${dMinus2}T09:40:00.000Z`,
    },
    {
      id: 'noti-3',
      userId: 'usr-doc-3',
      title: 'Có lịch hẹn mới chờ xác nhận',
      message: `Bệnh nhân Trần Thu Hương đặt lịch khám Da liễu ngày ${dPlus1} lúc 14:00.`,
      type: 'APPOINTMENT',
      relatedId: 'apt-3',
      read: false,
      createdAt: now,
    },
  ];

  const auditLogs: AuditLogItem[] = [
    {
      id: 'log-1',
      actorId: 'usr-doc-1',
      actorName: 'BS. CKII Trần Văn Minh',
      actorRole: 'DOCTOR',
      action: 'CREATE_MEDICAL_RECORD',
      targetType: 'MEDICAL_RECORD',
      targetId: 'rec-1',
      detail: 'Tạo hồ sơ bệnh án cho lịch hẹn CC-260101 (Bệnh nhân Nguyễn Văn An)',
      timestamp: `${dMinus2}T09:35:00.000Z`,
    },
    {
      id: 'log-2',
      actorId: 'usr-doc-4',
      actorName: 'BS. CKII Nguyễn Văn Bình',
      actorRole: 'DOCTOR',
      action: 'CONFIRM_APPOINTMENT',
      targetType: 'APPOINTMENT',
      targetId: 'apt-2',
      detail: `Xác nhận lịch hẹn CC-260102 lúc 09:30 ngày ${dPlus1}`,
      timestamp: now,
    },
  ];

  const reviews = createSeedReviews();

  return {
    users,
    specialties,
    services,
    doctors,
    schedules,
    appointments,
    medicalRecords,
    reviews,
    notifications,
    auditLogs,
    backups: [],
  };
}

function createSeedReviews(): DoctorReview[] {
  const relDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const dMinus1 = relDate(-1);
  const dMinus2 = relDate(-2);
  return [
    {
      id: 'rev-1',
      appointmentId: 'apt-hist-6',
      doctorId: 'doc-1',
      patientId: 'usr-pat-2',
      patientName: 'Phạm Minh Tuấn',
      rating: 5,
      comment: 'Bác sĩ Minh thăm khám kỹ lưỡng, giải thích rõ ràng phác đồ kiểm soát huyết áp.',
      createdAt: `${dMinus2}T10:15:00.000Z`,
    },
    {
      id: 'rev-2',
      appointmentId: 'apt-4',
      doctorId: 'doc-2',
      patientId: 'usr-pat-2',
      patientName: 'Trần Thu Hương',
      rating: 5,
      comment: 'Bác sĩ Linh rất nhẹ nhàng với trẻ nhỏ, kê đơn ít kháng sinh và tư vấn chăm sóc tại nhà chi tiết.',
      createdAt: `${dMinus1}T11:00:00.000Z`,
    },
    {
      id: 'rev-3',
      appointmentId: 'apt-hist-12',
      doctorId: 'doc-3',
      patientId: 'usr-pat-2',
      patientName: 'Vũ Thị Lan',
      rating: 5,
      comment: 'Soi da chi tiết, hướng dẫn cách phục hồi hàng rào da dễ áp dụng.',
      createdAt: `${dMinus2}T16:00:00.000Z`,
    },
    {
      id: 'rev-4',
      appointmentId: 'apt-hist-13',
      doctorId: 'doc-4',
      patientId: 'usr-pat-2',
      patientName: 'Lê Hoàng Nam',
      rating: 5,
      comment: 'Nội soi tai mũi họng nhẹ nhàng không khó chịu, phòng khám sạch sẽ đúng giờ.',
      createdAt: `${dMinus2}T15:30:00.000Z`,
    },
  ];
}

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

export async function createHistoricalAppointments(
  doctors: DoctorProfile[],
  specialties: Specialty[],
  services: ServiceItem[],
): Promise<Appointment[]> {
  const specs: Array<{
    offsetDays: number;
    doctorId: string;
    serviceId: string;
    timeSlot: string;
    status: Appointment['status'];
    patientName: string;
    patientPhone: string;
    symptoms: string;
  }> = [
      // Current week & upcoming days (+3, +4, +5, -3, -4)
      { offsetDays: 3, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '10:00', status: 'CONFIRMED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Kiểm tra huyết áp định kỳ hàng tháng.' },
      { offsetDays: 3, doctorId: 'doc-2', serviceId: 'srv-3', timeSlot: '14:30', status: 'CONFIRMED', patientName: 'Phạm Minh Tuấn', patientPhone: '0908334455', symptoms: 'Khám hô hấp định kỳ cho bé.' },
      { offsetDays: 4, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '09:30', status: 'PENDING', patientName: 'Lê Hoàng Nam', patientPhone: '0907112299', symptoms: 'Đo điện tâm đồ kiểm tra nhịp tim.' },
      { offsetDays: 4, doctorId: 'doc-3', serviceId: 'srv-5', timeSlot: '15:00', status: 'CONFIRMED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Tái khám da liễu và soi da.' },
      { offsetDays: 5, doctorId: 'doc-4', serviceId: 'srv-7', timeSlot: '08:30', status: 'PENDING', patientName: 'Đỗ Văn Hùng', patientPhone: '0983556677', symptoms: 'Nội soi kiểm tra viêm xoang.' },
      { offsetDays: -3, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '08:30', status: 'COMPLETED', patientName: 'Phạm Minh Tuấn', patientPhone: '0908334455', symptoms: 'Đau tức ngực nhẹ khi leo cầu thang.' },
      { offsetDays: -4, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '14:00', status: 'COMPLETED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Siêu âm tim kiểm tra định kỳ.' },
      { offsetDays: -4, doctorId: 'doc-3', serviceId: 'srv-6', timeSlot: '10:30', status: 'CANCELLED', patientName: 'Lê Hoàng Nam', patientPhone: '0907112299', symptoms: 'Điều trị mụn viêm vùng má.' },

      // Week -1 (-7 to -13 days)
      { offsetDays: -7, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '09:00', status: 'COMPLETED', patientName: 'Đỗ Văn Hùng', patientPhone: '0983556677', symptoms: 'Tái khám tăng huyết áp.' },
      { offsetDays: -8, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '15:00', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Khó ngủ kèm hồi hộp nhịp nhanh.' },
      { offsetDays: -9, doctorId: 'doc-2', serviceId: 'srv-3', timeSlot: '09:30', status: 'COMPLETED', patientName: 'Phạm Minh Tuấn', patientPhone: '0908334455', symptoms: 'Sốt nhẹ và ho đờm 2 ngày.' },
      { offsetDays: -10, doctorId: 'doc-3', serviceId: 'srv-5', timeSlot: '14:00', status: 'COMPLETED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Viêm da tiếp xúc vùng cổ.' },
      { offsetDays: -11, doctorId: 'doc-4', serviceId: 'srv-7', timeSlot: '10:00', status: 'COMPLETED', patientName: 'Lê Hoàng Nam', patientPhone: '0907112299', symptoms: 'Đau họng và khàn tiếng kéo dài.' },
      { offsetDays: -12, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '08:00', status: 'COMPLETED', patientName: 'Hoàng Đức Mạnh', patientPhone: '0905667788', symptoms: 'Tầm soát tim mạch tổng quát.' },

      // Week -2 (-14 to -20 days)
      { offsetDays: -15, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '09:00', status: 'COMPLETED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Chóng mặt nhẹ khi thay đổi tư thế.' },
      { offsetDays: -16, doctorId: 'doc-2', serviceId: 'srv-4', timeSlot: '10:00', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Tư vấn dinh dưỡng cho bé.' },
      { offsetDays: -17, doctorId: 'doc-4', serviceId: 'srv-8', timeSlot: '15:30', status: 'COMPLETED', patientName: 'Đỗ Văn Hùng', patientPhone: '0983556677', symptoms: 'Rửa xoang điều trị nghẹt mũi.' },
      { offsetDays: -18, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '14:30', status: 'NO_SHOW', patientName: 'Lê Hoàng Nam', patientPhone: '0907112299', symptoms: 'Đo ECG theo dõi rối loạn nhịp.' },
      { offsetDays: -19, doctorId: 'doc-3', serviceId: 'srv-6', timeSlot: '09:30', status: 'COMPLETED', patientName: 'Hoàng Đức Mạnh', patientPhone: '0905667788', symptoms: 'Chăm sóc phục hồi hàng rào da.' },

      // Week -3 (-21 to -27 days)
      { offsetDays: -22, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '08:30', status: 'COMPLETED', patientName: 'Phạm Minh Tuấn', patientPhone: '0908334455', symptoms: 'Kiểm tra huyết áp sau điều chỉnh thuốc.' },
      { offsetDays: -23, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '10:30', status: 'COMPLETED', patientName: 'Đỗ Văn Hùng', patientPhone: '0983556677', symptoms: 'Siêu âm tim Doppler màu.' },
      { offsetDays: -24, doctorId: 'doc-2', serviceId: 'srv-3', timeSlot: '14:00', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Khám sức khỏe định kỳ cho trẻ.' },
      { offsetDays: -25, doctorId: 'doc-4', serviceId: 'srv-7', timeSlot: '09:00', status: 'COMPLETED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Ù tai và đau tai phải.' },
      { offsetDays: -26, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '15:00', status: 'CANCELLED', patientName: 'Hoàng Đức Mạnh', patientPhone: '0905667788', symptoms: 'Tư vấn chỉ số mỡ máu và huyết áp.' },

      // Week -4 to -7 (-28 to -55 days, ~1-2 months ago)
      { offsetDays: -30, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '09:00', status: 'COMPLETED', patientName: 'Lê Hoàng Nam', patientPhone: '0907112299', symptoms: 'Đánh giá nhịp tim và huyết áp.' },
      { offsetDays: -32, doctorId: 'doc-2', serviceId: 'srv-3', timeSlot: '10:00', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Khám ho sốt kéo dài.' },
      { offsetDays: -35, doctorId: 'doc-3', serviceId: 'srv-5', timeSlot: '14:30', status: 'COMPLETED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Soi da và tư vấn điều trị nám.' },
      { offsetDays: -38, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '08:30', status: 'COMPLETED', patientName: 'Phạm Minh Tuấn', patientPhone: '0908334455', symptoms: 'Đo điện tâm đồ định kỳ.' },
      { offsetDays: -41, doctorId: 'doc-4', serviceId: 'srv-7', timeSlot: '15:00', status: 'COMPLETED', patientName: 'Đỗ Văn Hùng', patientPhone: '0983556677', symptoms: 'Nội soi tai mũi họng kiểm tra xoang.' },
      { offsetDays: -44, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '09:30', status: 'COMPLETED', patientName: 'Hoàng Đức Mạnh', patientPhone: '0905667788', symptoms: 'Khám tim mạch tổng quát.' },
      { offsetDays: -47, doctorId: 'doc-2', serviceId: 'srv-4', timeSlot: '10:30', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Tư vấn tiêm chủng và dinh dưỡng.' },
      { offsetDays: -51, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '14:00', status: 'COMPLETED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Theo dõi huyết áp buổi sáng.' },

      // Older months (-60 to -150 days, covering past 5 months)
      { offsetDays: -62, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '09:00', status: 'COMPLETED', patientName: 'Đỗ Văn Hùng', patientPhone: '0983556677', symptoms: 'Tái khám tăng huyết áp.' },
      { offsetDays: -68, doctorId: 'doc-3', serviceId: 'srv-5', timeSlot: '14:00', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Khám dị ứng da theo mùa.' },
      { offsetDays: -74, doctorId: 'doc-4', serviceId: 'srv-7', timeSlot: '10:00', status: 'COMPLETED', patientName: 'Lê Hoàng Nam', patientPhone: '0907112299', symptoms: 'Khám viêm mũi dị ứng.' },
      { offsetDays: -82, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '08:30', status: 'COMPLETED', patientName: 'Phạm Minh Tuấn', patientPhone: '0908334455', symptoms: 'Siêu âm tim kiểm tra định kỳ.' },
      { offsetDays: -93, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '09:30', status: 'COMPLETED', patientName: 'Hoàng Đức Mạnh', patientPhone: '0905667788', symptoms: 'Khám tim mạch và tư vấn thuốc.' },
      { offsetDays: -98, doctorId: 'doc-2', serviceId: 'srv-3', timeSlot: '15:00', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Khám hô hấp nhi.' },
      { offsetDays: -108, doctorId: 'doc-3', serviceId: 'srv-6', timeSlot: '14:30', status: 'COMPLETED', patientName: 'Vũ Thị Lan', patientPhone: '0912445566', symptoms: 'Điều trị viêm da cơ địa.' },
      { offsetDays: -122, doctorId: 'doc-1', serviceId: 'srv-1', timeSlot: '09:00', status: 'COMPLETED', patientName: 'Đỗ Văn Hùng', patientPhone: '0983556677', symptoms: 'Đo huyết áp và nghe tim phổi.' },
      { offsetDays: -128, doctorId: 'doc-4', serviceId: 'srv-8', timeSlot: '10:30', status: 'COMPLETED', patientName: 'Lê Hoàng Nam', patientPhone: '0907112299', symptoms: 'Khí dung và rửa mũi xoang.' },
      { offsetDays: -145, doctorId: 'doc-1', serviceId: 'srv-2', timeSlot: '08:30', status: 'COMPLETED', patientName: 'Phạm Minh Tuấn', patientPhone: '0908334455', symptoms: 'Đo ECG tầm soát định kỳ.' },
      { offsetDays: -152, doctorId: 'doc-2', serviceId: 'srv-3', timeSlot: '10:00', status: 'COMPLETED', patientName: 'Trần Thu Hương', patientPhone: '0918222333', symptoms: 'Khám sức khỏe tổng quát nhi.' },
    ];

  return Promise.all(
    specs.map(async (item, index) => {
      const doctor = doctors.find((d) => d.id === item.doctorId) ?? doctors[0];
      const specialty = specialties.find((s) => s.id === doctor.specialtyId) ?? specialties[0];
      const service = services.find((s) => s.id === item.serviceId) ?? services[0];
      const dateStr = getTodayOffset(item.offsetDays);
      const id = `apt-hist-${index + 1}`;
      const code = `CC-25${String(1001 + index)}`;
      const qr = await generateAppointmentQr({
        code,
        appointmentId: id,
        patientId: 'usr-pat-2',
        doctorId: doctor.id,
        date: dateStr,
        timeSlot: item.timeSlot,
      });
      const timestamp = `${dateStr}T${item.timeSlot}:00.000Z`;
      return {
        id,
        code,
        patientId: 'usr-pat-2',
        patientName: item.patientName,
        patientPhone: item.patientPhone,
        doctorId: doctor.id,
        doctorName: doctor.fullName,
        specialtyId: specialty.id,
        specialtyName: specialty.name,
        serviceId: service.id,
        serviceName: service.name,
        servicePriceVnd: service.priceVnd,
        date: dateStr,
        timeSlot: item.timeSlot,
        symptoms: item.symptoms,
        status: item.status,
        qrCodeDataUrl: qr.qrCodeDataUrl,
        qrPayload: qr.qrPayload,
        checkedInAt: item.status === 'COMPLETED' ? timestamp : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }),
  );
}

let cachedDb: DatabaseSchema | null = null;
let mongoClient: MongoClient | null = null;
let mongoDbInstance: MongoDatabase | null = null;
let mongoAttempted = false;

const COLLECTION_NAMES: Array<keyof DatabaseSchema> = [
  'users',
  'specialties',
  'services',
  'doctors',
  'schedules',
  'appointments',
  'medicalRecords',
  'reviews',
  'notifications',
  'auditLogs',
  'backups',
];

async function getMongoDb(): Promise<MongoDatabase | null> {
  if (mongoDbInstance) return mongoDbInstance;
  if (mongoAttempted) return null;
  mongoAttempted = true;

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.info('[ClinicCare DB] MONGODB_URI chưa được cấu hình — đang dùng lưu trữ cục bộ data/cliniccare_db.json');
    return null;
  }

  // Tự động cấu hình DNS nếu Node.js trên Windows trỏ vào 127.0.0.1 gây lỗi querySrv ECONNREFUSED
  if (uri.startsWith('mongodb+srv://')) {
    try {
      const currentServers = dns.getServers();
      if (!currentServers.length || currentServers.every((s) => s === '127.0.0.1' || s === '::1')) {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      }
    } catch {
      // Bỏ qua nếu môi trường không cho phép setServers
    }
  }

  const dbName = process.env.MONGODB_DB_NAME?.trim() || 'master';

  try {
    mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await mongoClient.connect();
    const database = mongoClient.db(dbName);
    await database.command({ ping: 1 });
    mongoDbInstance = database;

    await Promise.allSettled([
      database.collection('users').createIndex({ id: 1 }, { unique: true }),
      database.collection('users').createIndex({ email: 1 }, { unique: true }),
      database.collection('doctors').createIndex({ id: 1 }, { unique: true }),
      database.collection('schedules').createIndex({ doctorId: 1 }, { unique: true }),
      database.collection('appointments').createIndex({ id: 1 }, { unique: true }),
      database.collection('medicalRecords').createIndex({ id: 1 }, { unique: true }),
      database.collection('reviews').createIndex({ id: 1 }, { unique: true }),
      database.collection('reviews').createIndex({ appointmentId: 1 }, { unique: true }),
    ]);

    console.info(`[ClinicCare DB] Đã kết nối MongoDB thành công (${dbName})`);
    return mongoDbInstance;
  } catch (err) {
    // Nếu gặp lỗi DNS querySrv, thử chuyển sang DNS công cộng và kết nối lại 1 lần
    if (uri.startsWith('mongodb+srv://') && String((err as Error).message).includes('querySrv')) {
      try {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
        mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
        await mongoClient.connect();
        const database = mongoClient.db(dbName);
        await database.command({ ping: 1 });
        mongoDbInstance = database;

        await Promise.allSettled([
          database.collection('users').createIndex({ id: 1 }, { unique: true }),
          database.collection('users').createIndex({ email: 1 }, { unique: true }),
          database.collection('doctors').createIndex({ id: 1 }, { unique: true }),
          database.collection('schedules').createIndex({ doctorId: 1 }, { unique: true }),
          database.collection('appointments').createIndex({ id: 1 }, { unique: true }),
          database.collection('medicalRecords').createIndex({ id: 1 }, { unique: true }),
          database.collection('reviews').createIndex({ id: 1 }, { unique: true }),
          database.collection('reviews').createIndex({ appointmentId: 1 }, { unique: true }),
        ]);

        console.info(`[ClinicCare DB] Đã kết nối MongoDB thành công (${dbName}) sau khi cập nhật DNS`);
        return mongoDbInstance;
      } catch {
        // Tiếp tục xử lý lỗi ở dưới
      }
    }

    console.warn(
      `[ClinicCare DB] Không thể kết nối MongoDB (${(err as Error).message}). Chuyển sang lưu trữ dự phòng JSON.`,
    );
    mongoClient = null;
    mongoDbInstance = null;
    return null;
  }
}

async function readFromMongo(mongoDb: MongoDatabase): Promise<DatabaseSchema> {
  const results = await Promise.all(
    COLLECTION_NAMES.map((name) =>
      mongoDb
        .collection(name)
        .find({}, { projection: { _id: 0 } })
        .toArray(),
    ),
  );

  return {
    users: results[0] as unknown as User[],
    specialties: results[1] as unknown as Specialty[],
    services: results[2] as unknown as ServiceItem[],
    doctors: results[3] as unknown as DoctorProfile[],
    schedules: results[4] as unknown as DoctorSchedule[],
    appointments: results[5] as unknown as Appointment[],
    medicalRecords: results[6] as unknown as MedicalRecord[],
    reviews: results[7] as unknown as DoctorReview[],
    notifications: results[8] as unknown as NotificationItem[],
    auditLogs: results[9] as unknown as AuditLogItem[],
    backups: results[10] as unknown as BackupMeta[],
  };
}

async function writeToMongo(mongoDb: MongoDatabase, db: DatabaseSchema): Promise<void> {
  for (const name of COLLECTION_NAMES) {
    const col = mongoDb.collection(name);
    const items = (db[name] || []) as unknown as Array<Record<string, unknown>>;
    const keyField = name === 'schedules' ? 'doctorId' : 'id';
    const keys = items.map((item) => item[keyField]).filter((k) => k !== undefined);

    if (items.length > 0) {
      await col.bulkWrite(
        items.map((item) => ({
          replaceOne: {
            filter: { [keyField]: item[keyField] },
            replacement: { ...item },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    if (keys.length > 0) {
      await col.deleteMany({ [keyField]: { $nin: keys } });
    } else {
      await col.deleteMany({});
    }
  }
}

async function ensureSchemaMigrations(db: DatabaseSchema): Promise<boolean> {
  let dirty = false;
  if (!db.reviews || db.reviews.length === 0) {
    db.reviews = createSeedReviews();
    for (const rev of db.reviews) {
      const apt = db.appointments.find((a) => a.id === rev.appointmentId);
      if (apt && !apt.reviewId) {
        apt.reviewId = rev.id;
      }
    }
    dirty = true;
  }
  if (!db.appointments.some((a) => a.id.startsWith('apt-hist-'))) {
    const hist = await createHistoricalAppointments(db.doctors, db.specialties, db.services);
    db.appointments.push(...hist);
    dirty = true;
  }
  for (const apt of db.appointments) {
    if (!apt.paymentStatus) {
      apt.paymentStatus = apt.status === 'COMPLETED' ? 'PAID' : 'UNPAID';
      if (apt.paymentStatus === 'PAID' && !apt.paymentMethod) {
        apt.paymentMethod = 'CASH';
        apt.paidAt = apt.updatedAt;
      }
      dirty = true;
    }
  }
  for (const doc of db.doctors) {
    const docReviews = db.reviews.filter((r) => r.doctorId === doc.id);
    if (doc.reviewCount !== docReviews.length) {
      doc.reviewCount = docReviews.length;
      dirty = true;
    }
  }
  return dirty;
}

function readLocalJsonDb(): DatabaseSchema | null {
  if (!fs.existsSync(DB_FILE)) return null;
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  return JSON.parse(raw) as DatabaseSchema;
}

export async function getDb(): Promise<DatabaseSchema> {
  if (cachedDb) return cachedDb;
  ensureDirectories();

  const mongoDb = await getMongoDb();
  if (mongoDb) {
    const userCount = await mongoDb.collection('users').countDocuments();
    if (userCount === 0) {
      const initialData = readLocalJsonDb() ?? (await createSeedDatabase());
      await ensureSchemaMigrations(initialData);
      await writeToMongo(mongoDb, initialData);
      cachedDb = initialData;
      return cachedDb;
    }

    const loaded = await readFromMongo(mongoDb);
    const changed = await ensureSchemaMigrations(loaded);
    if (changed) {
      await writeToMongo(mongoDb, loaded);
    }
    cachedDb = loaded;
    return cachedDb;
  }

  const localDb = readLocalJsonDb();
  if (localDb) {
    cachedDb = localDb;
    const changed = await ensureSchemaMigrations(cachedDb);
    if (changed) {
      await saveDb(cachedDb);
    }
    return cachedDb;
  }

  const seed = await createSeedDatabase();
  await ensureSchemaMigrations(seed);
  fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
  cachedDb = seed;
  return cachedDb;
}

export async function saveDb(db: DatabaseSchema): Promise<void> {
  ensureDirectories();
  cachedDb = db;
  const mongoDb = await getMongoDb();
  if (mongoDb) {
    await writeToMongo(mongoDb, db);
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function appendAuditLog(
  db: DatabaseSchema,
  entry: Omit<AuditLogItem, 'id' | 'timestamp'>,
) {
  db.auditLogs.unshift({
    id: `log-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
}

export function createBackupSnapshot(db: DatabaseSchema, createdBy: string): {
  meta: BackupMeta;
  content: string;
} {
  ensureDirectories();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `cliniccare-backup-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);

  // Exclude passwordHashes in portable snapshot or keep intact? Keep sanitized user metadata + clinical collections
  const snapshot = {
    exportedAt: new Date().toISOString(),
    exportedBy: createdBy,
    data: {
      ...db,
      users: db.users.map(({ passwordHash: _ph, ...safe }) => safe),
    },
  };
  const content = JSON.stringify(snapshot, null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');

  const meta: BackupMeta = {
    id: `bak-${crypto.randomUUID().slice(0, 8)}`,
    filename,
    createdBy,
    createdAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    summary: {
      users: db.users.length,
      doctors: db.doctors.length,
      appointments: db.appointments.length,
      medicalRecords: db.medicalRecords.length,
      auditLogs: db.auditLogs.length,
    },
  };
  db.backups.unshift(meta);
  return { meta, content };
}
