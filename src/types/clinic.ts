export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'NO_SHOW';

export type PaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'VIETQR' | 'CARD';

export interface User {
  id: string;
  email: string;
  passwordHash?: string;
  fullName: string;
  phone: string;
  role: UserRole;
  active: boolean;
  gender?: 'Nam' | 'Nữ' | 'Khác';
  dateOfBirth?: string;
  address?: string;
  bloodType?: string;
  allergies?: string;
  createdAt: string;
}

export interface Specialty {
  id: string;
  name: string;
  slug: string;
  description: string;
  roomNumber: string;
  active: boolean;
}

export interface ServiceItem {
  id: string;
  specialtyId: string;
  name: string;
  description: string;
  priceVnd: number;
  durationMinutes: number;
  active: boolean;
}

export interface DoctorProfile {
  id: string;
  userId: string;
  fullName: string;
  title: string;
  qualifications?: string;
  specialtyId: string;
  experienceYears: number;
  bio: string;
  consultationFeeVnd: number;
  avatarUrl: string;
  avatarPublicId?: string;
  roomNumber: string;
  contactEmail?: string;
  rating: number;
  reviewCount?: number;
  active: boolean;
}

export interface DayShiftConfig {
  enabled: boolean;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
}

export interface DoctorSchedule {
  doctorId: string;
  slotDurationMinutes: number;
  weeklyShifts: Record<number, DayShiftConfig>;
  blockedDates: string[];
}

export interface TimeSlotAvailability {
  time: string;
  available: boolean;
  reason?: string;
}

export interface Appointment {
  id: string;
  code: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  specialtyId: string;
  specialtyName: string;
  serviceId: string;
  serviceName: string;
  servicePriceVnd: number;
  date: string;
  timeSlot: string;
  symptoms: string;
  status: AppointmentStatus;
  rejectionReason?: string;
  cancelReason?: string;
  qrCodeDataUrl: string;
  qrPayload: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  paidAt?: string;
  vietQrDataUrl?: string;
  reminderSentAt?: string;
  reviewId?: string;
  checkedInAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorReview {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  patientName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface VitalSigns {
  bloodPressure: string;
  heartRate: string;
  temperature: string;
  weight: string;
}

export interface PrescriptionItem {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  note: string;
}

export interface MedicalRecord {
  id: string;
  appointmentId: string;
  appointmentCode: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  specialtyName: string;
  visitDate: string;
  chiefComplaint: string;
  diagnosis: string;
  icdCode?: string;
  clinicalNotes: string;
  vitalSigns: VitalSigns;
  prescriptions: PrescriptionItem[];
  followUpDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'APPOINTMENT' | 'MEDICAL_RECORD' | 'SYSTEM';
  relatedId?: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole | 'SYSTEM';
  action: string;
  targetType: 'AUTH' | 'USER' | 'APPOINTMENT' | 'MEDICAL_RECORD' | 'SCHEDULE' | 'SPECIALTY' | 'SERVICE' | 'BACKUP';
  targetId: string;
  detail: string;
  timestamp: string;
}

export interface BackupMeta {
  id: string;
  filename: string;
  createdBy: string;
  createdAt: string;
  sizeBytes: number;
  summary: {
    users: number;
    doctors: number;
    appointments: number;
    medicalRecords: number;
    auditLogs: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface WorkloadChartPoint {
  key: string;
  label: string;
  rangeLabel: string;
  total: number;
  completed: number;
  upcoming: number;
  cancelled: number;
}

export interface WorkloadDoctorSummary {
  doctorId: string;
  doctorName: string;
  specialtyName: string;
  roomNumber: string;
  total: number;
  completed: number;
  upcoming: number;
}

export interface WorkloadDashboardResponse {
  period: 'week' | 'month';
  doctorId: string;
  summary: {
    totalAppointments: number;
    completedCount: number;
    upcomingCount: number;
    cancelledCount: number;
    peakLabel: string;
    peakCount: number;
    avgPerBucket: number;
  };
  series: WorkloadChartPoint[];
  doctorBreakdown: WorkloadDoctorSummary[];
}
