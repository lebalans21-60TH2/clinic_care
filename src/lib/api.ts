import type {
  Appointment,
  AppointmentStatus,
  AuditLogItem,
  BackupMeta,
  ChatMessage,
  DoctorProfile,
  DoctorReview,
  DoctorSchedule,
  MedicalRecord,
  NotificationItem,
  PaymentMethod,
  PaymentStatus,
  ServiceItem,
  Specialty,
  TimeSlotAvailability,
  User,
  UserRole,
  WorkloadDashboardResponse,
} from '../types/clinic';

const TOKEN_KEY = 'cliniccare_jwt_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Lỗi máy chủ (${res.status})`);
  }
  return data as T;
}

export function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

export function formatDateVi(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeVi(isoTimestamp: string): string {
  if (!isoTimestamp) return '';
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return isoTimestamp;
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function resizeImageFileToDataUrl(file: File, maxSide = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WEBP).'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh đã chọn.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Không thể đọc dữ liệu ảnh.'));
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp hình ảnh bị lỗi hoặc không được hỗ trợ.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } else {
          resolve(result);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export const APPOINTMENT_STATUS_META: Record<
  AppointmentStatus,
  { label: string; colorClass: string }
> = {
  PENDING: { label: 'Chờ xác nhận', colorClass: 'text-amber-700' },
  CONFIRMED: { label: 'Đã xác nhận', colorClass: 'text-teal-700' },
  CHECKED_IN: { label: 'Đã đến phòng khám', colorClass: 'text-sky-700' },
  COMPLETED: { label: 'Đã khám xong', colorClass: 'text-emerald-700' },
  CANCELLED: { label: 'Đã hủy', colorClass: 'text-slate-500' },
  REJECTED: { label: 'Bị từ chối', colorClass: 'text-rose-700' },
  NO_SHOW: { label: 'Không đến khám', colorClass: 'text-rose-600' },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; colorClass: string }> = {
  UNPAID: { label: 'Chưa thanh toán', colorClass: 'text-amber-700' },
  PAID: { label: 'Đã thanh toán', colorClass: 'text-emerald-700' },
  REFUNDED: { label: 'Đã hoàn tiền', colorClass: 'text-slate-500' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Tiền mặt tại quầy',
  VIETQR: 'Chuyển khoản VietQR',
  CARD: 'Thẻ ngân hàng / POS',
};

export const ROLE_LABELS: Record<UserRole, string> = {
  PATIENT: 'Bệnh nhân',
  DOCTOR: 'Bác sĩ',
  ADMIN: 'Quản trị viên',
};

export const api = {
  getPublicOverview: () =>
    request<{ specialties: Specialty[]; doctors: DoctorProfile[]; services: ServiceItem[] }>(
      '/api/public/overview',
    ),

  getWorkloadDashboard: (period: 'week' | 'month', doctorId = 'ALL') =>
    request<WorkloadDashboardResponse>(
      `/api/public/workload-dashboard?period=${encodeURIComponent(period)}&doctorId=${encodeURIComponent(doctorId)}`,
    ),

  getAvailableSlots: (doctorId: string, date: string) =>
    request<{ doctorId: string; date: string; slots: TimeSlotAvailability[] }>(
      `/api/schedules/available-slots?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`,
    ),

  login: (email: string, password: string) =>
    request<{ token: string; user: User; doctorProfile: DoctorProfile | null }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    gender?: string;
    dateOfBirth?: string;
    address?: string;
  }) =>
    request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () => request<{ user: User; doctorProfile: DoctorProfile | null }>('/api/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  updateMyProfile: (payload: Partial<User>) =>
    request<{ user: User }>('/api/patients/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getAppointments: () => request<{ appointments: Appointment[] }>('/api/appointments'),

  createAppointment: (payload: {
    specialtyId: string;
    doctorId: string;
    serviceId?: string;
    date: string;
    timeSlot: string;
    symptoms: string;
  }) =>
    request<{ appointment: Appointment }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  rescheduleAppointment: (id: string, date: string, timeSlot: string) =>
    request<{ appointment: Appointment }>(`/api/appointments/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ date, timeSlot }),
    }),

  getAppointmentVietQr: (id: string) =>
    request<{ vietQrDataUrl: string }>(`/api/appointments/${id}/vietqr`),

  updateAppointmentPayment: (
    id: string,
    paymentStatus: PaymentStatus,
    paymentMethod?: PaymentMethod,
  ) =>
    request<{ appointment: Appointment }>(`/api/appointments/${id}/payment`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentStatus, paymentMethod }),
    }),

  updateAppointmentStatus: (id: string, status: AppointmentStatus, reason?: string) =>
    request<{ appointment: Appointment }>(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),

  checkInQr: (codeOrPayload: string) =>
    request<{ appointment: Appointment }>('/api/appointments/checkin-qr', {
      method: 'POST',
      body: JSON.stringify({ codeOrPayload }),
    }),

  getSchedule: (doctorId: string) =>
    request<{ schedule: DoctorSchedule }>(`/api/schedules/${doctorId}`),

  updateSchedule: (doctorId: string, schedule: Partial<DoctorSchedule>) =>
    request<{ schedule: DoctorSchedule }>(`/api/schedules/${doctorId}`, {
      method: 'PUT',
      body: JSON.stringify(schedule),
    }),

  getMedicalRecords: () => request<{ records: MedicalRecord[] }>('/api/medical-records'),

  getMedicalRecordDetail: (id: string) =>
    request<{ record: MedicalRecord }>(`/api/medical-records/${id}`),

  createMedicalRecord: (payload: Omit<MedicalRecord, 'id' | 'appointmentCode' | 'patientId' | 'patientName' | 'doctorId' | 'doctorName' | 'specialtyName' | 'visitDate' | 'createdAt' | 'updatedAt'>) =>
    request<{ record: MedicalRecord; appointment: Appointment }>('/api/medical-records', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMedicalRecord: (id: string, payload: Partial<MedicalRecord>) =>
    request<{ record: MedicalRecord }>(`/api/medical-records/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getNotifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),

  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  getDoctorReviews: (doctorId: string) =>
    request<{ reviews: DoctorReview[] }>(`/api/doctors/${doctorId}/reviews`),

  createReview: (payload: { appointmentId: string; rating: number; comment: string }) =>
    request<{ review: DoctorReview; doctorRating: number }>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  chatWithAi: (message: string, history: ChatMessage[]) =>
    request<{ reply: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    }),

  getAdminDashboard: () =>
    request<{
      kpis: {
        totalPatients: number;
        totalDoctors: number;
        totalAppointments: number;
        todayAppointments: number;
        completedCount: number;
        estimatedRevenueVnd: number;
        totalMedicalRecords: number;
      };
      statusCounts: Record<AppointmentStatus, number>;
      dailyTrend: Array<{ date: string; label: string; count: number }>;
      specialtyStats: Array<{
        id: string;
        name: string;
        roomNumber: string;
        appointmentCount: number;
        doctorCount: number;
      }>;
    }>('/api/admin/dashboard'),

  getAdminUsers: () => request<{ users: User[] }>('/api/admin/users'),

  updateAdminUser: (id: string, payload: Partial<User>) =>
    request<{ user: User }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createSpecialty: (payload: { name: string; description: string; roomNumber: string }) =>
    request<{ specialty: Specialty }>('/api/admin/specialties', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  archiveSpecialty: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/specialties/${id}`, { method: 'DELETE' }),

  createDoctor: (payload: {
    email: string;
    password?: string;
    fullName: string;
    phone: string;
    title: string;
    qualifications?: string;
    contactEmail?: string;
    specialtyId: string;
    experienceYears: number;
    consultationFeeVnd: number;
    roomNumber: string;
    bio: string;
    avatarUrl?: string;
    avatarPublicId?: string;
  }) =>
    request<{ doctor: DoctorProfile }>('/api/admin/doctors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadDoctorAvatar: (imageData: string, doctorId?: string) =>
    request<{ url: string; publicId?: string; storage: 'cloudinary' | 'local' | 'external' }>(
      '/api/uploads/doctor-avatar',
      {
        method: 'POST',
        body: JSON.stringify({ imageData, doctorId }),
      },
    ),

  getAdminDoctors: () => request<{ doctors: DoctorProfile[] }>('/api/admin/doctors'),

  updateDoctor: (
    id: string,
    payload: Partial<DoctorProfile> & { phone?: string },
  ) =>
    request<{ doctor: DoctorProfile; user: User | null }>(`/api/doctors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createService: (payload: {
    specialtyId: string;
    name: string;
    description: string;
    priceVnd: number;
    durationMinutes: number;
  }) =>
    request<{ service: ServiceItem }>('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  archiveService: (id: string) =>
    request<{ ok: boolean }>(`/api/admin/services/${id}`, { method: 'DELETE' }),

  getAuditLogs: () => request<{ logs: AuditLogItem[]; backups: BackupMeta[] }>('/api/admin/audit-logs'),

  createBackup: () =>
    request<{ meta: BackupMeta; content: string }>('/api/admin/backup', { method: 'POST' }),

  dispatchReminders: () =>
    request<{ sentCount: number }>('/api/admin/send-reminders', { method: 'POST' }),
};
