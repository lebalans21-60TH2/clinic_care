import {
  Bell,
  CalendarClock,
  CalendarPlus,
  CheckCheck,
  CreditCard,
  Download,
  FileText,
  KeyRound,
  Printer,
  QrCode,
  Star,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_META,
  api,
  formatDateTimeVi,
  formatDateVi,
  formatVnd,
} from '../lib/api';
import type {
  Appointment,
  MedicalRecord,
  NotificationItem,
  TimeSlotAvailability,
  User,
} from '../types/clinic';
import { ChangePasswordModal } from './ChangePasswordModal';
import { PrescriptionPrintModal } from './PrescriptionPrintModal';
import { StatusText } from './StatusText';

interface PatientPortalProps {
  user: User;
  onUserUpdated: (user: User) => void;
  onStartNewBooking: () => void;
  onStartFollowUpBooking: (doctorId: string, followUpDate?: string) => void;
  onReviewSubmitted?: () => void;
}

export function PatientPortal({
  user,
  onUserUpdated,
  onStartNewBooking,
  onStartFollowUpBooking,
  onReviewSubmitted,
}: PatientPortalProps) {
  const [tab, setTab] = useState<'appointments' | 'records' | 'notifications' | 'profile'>(
    'appointments',
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrModalApt, setQrModalApt] = useState<Appointment | null>(null);
  const [vietQrModalApt, setVietQrModalApt] = useState<Appointment | null>(null);
  const [vietQrDataUrl, setVietQrDataUrl] = useState<string>('');
  const [loadingVietQr, setLoadingVietQr] = useState(false);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlot, setRescheduleSlot] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlotAvailability[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);

  // Review modal
  const [reviewTarget, setReviewTarget] = useState<Appointment | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Cancel & Print & Password modals
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [printRecord, setPrintRecord] = useState<MedicalRecord | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Profile form state
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth || '');
  const [address, setAddress] = useState(user.address || '');
  const [bloodType, setBloodType] = useState(user.bloodType || '');
  const [allergies, setAllergies] = useState(user.allergies || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [aptRes, recRes, notiRes] = await Promise.all([
        api.getAppointments(),
        api.getMedicalRecords(),
        api.getNotifications(),
      ]);
      setAppointments(aptRes.appointments);
      setRecords(recRes.records);
      setNotifications(notiRes.notifications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!rescheduleTarget || !rescheduleDate) {
      setRescheduleSlots([]);
      return;
    }
    let active = true;
    setLoadingRescheduleSlots(true);
    setRescheduleSlot('');
    api
      .getAvailableSlots(rescheduleTarget.doctorId, rescheduleDate)
      .then((res) => {
        if (active) setRescheduleSlots(res.slots);
      })
      .catch(() => {
        if (active) setRescheduleSlots([]);
      })
      .finally(() => {
        if (active) setLoadingRescheduleSlots(false);
      });
    return () => {
      active = false;
    };
  }, [rescheduleTarget, rescheduleDate]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleOpenVietQr = async (apt: Appointment) => {
    setVietQrModalApt(apt);
    setVietQrDataUrl(apt.vietQrDataUrl || '');
    if (!apt.vietQrDataUrl) {
      setLoadingVietQr(true);
      try {
        const res = await api.getAppointmentVietQr(apt.id);
        setVietQrDataUrl(res.vietQrDataUrl);
      } catch (err) {
        setFeedback((err as Error).message);
      } finally {
        setLoadingVietQr(false);
      }
    }
  };

  const handleOpenReschedule = (apt: Appointment) => {
    const today = new Date().toISOString().slice(0, 10);
    setRescheduleTarget(apt);
    setRescheduleDate(apt.date >= today ? apt.date : today);
    setRescheduleSlot('');
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleDate || !rescheduleSlot) return;
    setSubmittingReschedule(true);
    setFeedback(null);
    try {
      await api.rescheduleAppointment(rescheduleTarget.id, rescheduleDate, rescheduleSlot);
      setFeedback(
        `Đã đổi lịch hẹn ${rescheduleTarget.code} sang ${rescheduleSlot} ngày ${formatDateVi(rescheduleDate)}.`,
      );
      setRescheduleTarget(null);
      await loadData();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setSubmittingReview(true);
    setFeedback(null);
    try {
      await api.createReview({
        appointmentId: reviewTarget.id,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setFeedback(`Cảm ơn bạn đã đánh giá ${reviewRating} sao cho ${reviewTarget.doctorName}.`);
      setReviewTarget(null);
      setReviewRating(5);
      setReviewComment('');
      await loadData();
      onReviewSubmitted?.();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!cancelTarget) return;
    try {
      await api.updateAppointmentStatus(
        cancelTarget.id,
        'CANCELLED',
        cancelReason.trim() || 'Bệnh nhân chủ động hủy lịch',
      );
      setCancelTarget(null);
      setCancelReason('');
      setFeedback('Đã hủy lịch hẹn thành công.');
      await loadData();
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const handleOpenRecordDetail = async (recId: string) => {
    try {
      const res = await api.getMedicalRecordDetail(recId);
      setSelectedRecord(res.record);
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setFeedback(null);
    try {
      const res = await api.updateMyProfile({
        fullName,
        phone,
        dateOfBirth,
        address,
        bloodType,
        allergies,
      });
      onUserUpdated(res.user);
      setFeedback('Đã cập nhật thông tin cá nhân thành công.');
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDownloadQr = (apt: Appointment) => {
    const link = document.createElement('a');
    link.href = apt.qrCodeDataUrl;
    link.download = `ClinicCare-${apt.code}.png`;
    link.click();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6">
        <div>
          <p className="text-xs font-medium text-teal-700">Cổng bệnh nhân ClinicCare</p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-0.5">Xin chào, {user.fullName}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {user.email} · {user.phone}
            {user.bloodType ? ` · Nhóm máu ${user.bloodType}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={onStartNewBooking}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <CalendarPlus className="w-4 h-4" />
          <span>Đặt lịch khám mới</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setTab('appointments')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            tab === 'appointments' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Lịch hẹn của tôi ({appointments.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('records')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            tab === 'records' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Hồ sơ bệnh án ({records.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            tab === 'notifications' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Thông báo {unreadCount > 0 ? `(${unreadCount} mới)` : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
            tab === 'profile' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Thông tin cá nhân
        </button>
      </div>

      {feedback && (
        <div className="flex items-center justify-between px-4 py-3 text-sm bg-teal-50 text-teal-900 border border-teal-200 rounded-xl">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-teal-700 hover:text-teal-900"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Đang tải dữ liệu bệnh nhân...
        </div>
      ) : (
        <>
          {tab === 'appointments' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {appointments.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm text-slate-600">Bạn chưa có lịch hẹn khám nào.</p>
                  <button
                    type="button"
                    onClick={onStartNewBooking}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800"
                  >
                    Đặt lịch khám đầu tiên
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="py-3 px-4">Mã hẹn</th>
                        <th className="py-3 px-4">Thời gian</th>
                        <th className="py-3 px-4">Chuyên khoa & Bác sĩ</th>
                        <th className="py-3 px-4">Dịch vụ / Thanh toán</th>
                        <th className="py-3 px-4">Trạng thái</th>
                        <th className="py-3 px-4 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {appointments.map((apt) => {
                        const payMeta = PAYMENT_STATUS_META[apt.paymentStatus || 'UNPAID'];
                        const canModify = ['PENDING', 'CONFIRMED'].includes(apt.status);
                        const canPayVietQr =
                          apt.paymentStatus !== 'PAID' &&
                          !['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(apt.status);
                        return (
                          <tr key={apt.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                              {apt.code}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                              {apt.timeSlot} · {formatDateVi(apt.date)}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-slate-900">{apt.doctorName}</div>
                              <div className="text-xs text-slate-500">{apt.specialtyName}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="text-xs text-slate-700">{apt.serviceName}</div>
                              <div className="text-xs mt-0.5">
                                <span className="font-mono text-teal-700 tabular-nums">
                                  {formatVnd(apt.servicePriceVnd)}
                                </span>
                                <span className="mx-1.5 text-slate-300">·</span>
                                <span className={`font-medium ${payMeta.colorClass}`}>
                                  {payMeta.label}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <StatusText status={apt.status} />
                            </td>
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setQrModalApt(apt)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                                >
                                  <QrCode className="w-3.5 h-3.5" />
                                  <span>Mã QR</span>
                                </button>
                                {canPayVietQr && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenVietQr(apt)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg whitespace-nowrap"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    <span>VietQR</span>
                                  </button>
                                )}
                                {canModify && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReschedule(apt)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-lg whitespace-nowrap"
                                  >
                                    <CalendarClock className="w-3.5 h-3.5" />
                                    <span>Đổi lịch</span>
                                  </button>
                                )}
                                {apt.status === 'COMPLETED' && !apt.reviewId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReviewTarget(apt);
                                      setReviewRating(5);
                                      setReviewComment('');
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg whitespace-nowrap"
                                  >
                                    <Star className="w-3.5 h-3.5" />
                                    <span>Đánh giá</span>
                                  </button>
                                )}
                                {apt.status === 'COMPLETED' && apt.reviewId && (
                                  <span className="text-xs text-slate-400 px-1.5">Đã đánh giá</span>
                                )}
                                {canModify && (
                                  <button
                                    type="button"
                                    onClick={() => setCancelTarget(apt)}
                                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg whitespace-nowrap"
                                  >
                                    Hủy
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'records' && (
            <div className="grid md:grid-cols-[340px_1fr] gap-6 items-start">
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 text-xs font-medium text-slate-600">
                  Lịch sử khám bệnh được bảo mật ({records.length})
                </div>
                {records.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500 text-center">
                    Chưa có hồ sơ khám bệnh hoàn tất.
                  </div>
                ) : (
                  records.map((rec) => {
                    const active = selectedRecord?.id === rec.id;
                    return (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => handleOpenRecordDetail(rec.id)}
                        className={`w-full p-4 text-left transition-colors ${
                          active ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-mono font-semibold text-slate-700">{rec.appointmentCode}</span>
                          <span className="font-mono tabular-nums">{formatDateVi(rec.visitDate)}</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 mt-1">{rec.diagnosis}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {rec.specialtyName} · {rec.doctorName}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6">
                {!selectedRecord ? (
                  <div className="py-12 text-center text-sm text-slate-500 space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <p>Chọn một lần khám ở cột bên trái để xem chẩn đoán và đơn thuốc chi tiết.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
                      <div>
                        <div className="text-xs text-slate-500">
                          Mã khám {selectedRecord.appointmentCode} · Ngày {formatDateVi(selectedRecord.visitDate)}
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 mt-1">
                          {selectedRecord.diagnosis}
                          {selectedRecord.icdCode ? ` (${selectedRecord.icdCode})` : ''}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1">
                          {selectedRecord.doctorName} · Chuyên khoa {selectedRecord.specialtyName}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPrintRecord(selectedRecord)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>In đơn thuốc</span>
                        </button>
                        {selectedRecord.followUpDate && (
                          <button
                            type="button"
                            onClick={() =>
                              onStartFollowUpBooking(
                                selectedRecord.doctorId,
                                selectedRecord.followUpDate,
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                          >
                            <CalendarPlus className="w-3.5 h-3.5" />
                            <span>
                              Đặt tái khám ({formatDateVi(selectedRecord.followUpDate)})
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500">Huyết áp</div>
                        <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                          {selectedRecord.vitalSigns.bloodPressure}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500">Nhịp tim</div>
                        <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                          {selectedRecord.vitalSigns.heartRate}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500">Nhiệt độ</div>
                        <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                          {selectedRecord.vitalSigns.temperature}
                        </div>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="text-xs text-slate-500">Cân nặng</div>
                        <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                          {selectedRecord.vitalSigns.weight}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div>
                        <h4 className="text-xs font-medium text-slate-500 mb-1">Triệu chứng ghi nhận</h4>
                        <p className="text-slate-800">{selectedRecord.chiefComplaint}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-slate-500 mb-1">Kết luận & Dặn dò bác sĩ</h4>
                        <p className="text-slate-800 leading-relaxed">{selectedRecord.clinicalNotes}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-3">Đơn thuốc điều trị</h4>
                      {selectedRecord.prescriptions.length === 0 ? (
                        <p className="text-xs text-slate-500">Không có thuốc kê đơn.</p>
                      ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                                <th className="py-2.5 px-3">Tên thuốc</th>
                                <th className="py-2.5 px-3">Liều lượng</th>
                                <th className="py-2.5 px-3">Cách dùng</th>
                                <th className="py-2.5 px-3">Thời gian</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {selectedRecord.prescriptions.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="py-2.5 px-3 font-medium text-slate-900">
                                    {item.medicine}
                                    {item.note && (
                                      <span className="block text-slate-500 font-normal mt-0.5">
                                        {item.note}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-700">{item.dosage}</td>
                                  <td className="py-2.5 px-3 text-slate-700">{item.frequency}</td>
                                  <td className="py-2.5 px-3 font-mono text-slate-700">{item.duration}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Bell className="w-4 h-4 text-teal-700" />
                  <span>Trung tâm thông báo & nhắc lịch</span>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.markAllNotificationsRead();
                      await loadData();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Đánh dấu tất cả đã đọc</span>
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Chưa có thông báo nào.</div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {notifications.map((noti) => (
                    <div
                      key={noti.id}
                      className={`p-4 flex items-start justify-between gap-4 ${
                        noti.read ? 'bg-white' : 'bg-teal-50/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{noti.title}</span>
                          {!noti.read && (
                            <span className="text-xs font-medium text-teal-700">· Mới</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{noti.message}</p>
                        <p className="text-xs font-mono text-slate-400 mt-1.5 tabular-nums">
                          {formatDateTimeVi(noti.createdAt)}
                        </p>
                      </div>
                      {!noti.read && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.markNotificationRead(noti.id);
                            await loadData();
                          }}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                        >
                          Đã đọc
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'profile' && (
            <form
              onSubmit={handleSaveProfile}
              className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-teal-700" />
                  <h2 className="text-base font-semibold text-slate-900">Hồ sơ cá nhân bệnh nhân</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Đổi mật khẩu</span>
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Số điện thoại</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Ngày sinh</label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Nhóm máu</label>
                  <select
                    value={bloodType}
                    onChange={(e) => setBloodType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="">Chưa rõ</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Địa chỉ liên hệ</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Tiền sử dị ứng thuốc / thực phẩm
                </label>
                <textarea
                  rows={3}
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg"
              >
                {savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </form>
          )}
        </>
      )}

      {/* QR Code Check-in Modal + Printable Slip */}
      {qrModalApt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            id={!printRecord ? 'printable-clinic-sheet' : undefined}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <div className="text-[11px] font-medium text-teal-700">Phiếu hẹn ClinicCare</div>
                <span className="font-mono text-sm font-semibold text-slate-900">{qrModalApt.code}</span>
              </div>
              <button
                type="button"
                onClick={() => setQrModalApt(null)}
                className="no-print p-1 text-slate-400 hover:text-slate-700"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={qrModalApt.qrCodeDataUrl}
              alt={`Mã QR lịch hẹn ${qrModalApt.code}`}
              className="w-56 h-56 mx-auto border border-slate-200 rounded-lg p-2 bg-white"
            />
            <div className="text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-900">{qrModalApt.patientName}</div>
              <div className="font-medium text-slate-800">{qrModalApt.doctorName}</div>
              <div>
                {qrModalApt.specialtyName} · {qrModalApt.timeSlot} · {formatDateVi(qrModalApt.date)}
              </div>
              <div className="font-mono text-teal-700 tabular-nums">
                {formatVnd(qrModalApt.servicePriceVnd)} ·{' '}
                {PAYMENT_STATUS_META[qrModalApt.paymentStatus || 'UNPAID'].label}
              </div>
            </div>
            <div className="no-print grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDownloadQr(qrModalApt)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải QR PNG</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>In phiếu hẹn</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VietQR Payment Modal */}
      {vietQrModalApt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Thanh toán VietQR · {vietQrModalApt.code}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{vietQrModalApt.serviceName}</p>
              </div>
              <button
                type="button"
                onClick={() => setVietQrModalApt(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-xl p-4">
              {loadingVietQr ? (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-500">
                  Đang tạo mã VietQR...
                </div>
              ) : vietQrDataUrl ? (
                <img
                  src={vietQrDataUrl}
                  alt={`Mã VietQR thanh toán ${vietQrModalApt.code}`}
                  className="w-52 h-52 bg-white p-2 rounded-lg border border-slate-200"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-rose-600">
                  Không thể hiển thị mã VietQR.
                </div>
              )}
              <div className="mt-3 text-lg font-mono font-bold text-teal-700 tabular-nums">
                {formatVnd(vietQrModalApt.servicePriceVnd)}
              </div>
            </div>

            <dl className="text-xs space-y-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Ngân hàng thụ hưởng</dt>
                <dd className="font-medium text-slate-900 text-right">Ngân hàng BIDV</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Số tài khoản</dt>
                <dd className="font-mono font-semibold text-slate-900 tabular-nums">31410002886888</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Chủ tài khoản</dt>
                <dd className="font-medium text-slate-900">PHONG KHAM DA KHOA CLINICCARE</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Nội dung chuyển khoản</dt>
                <dd className="font-mono font-semibold text-teal-800">
                  TT {vietQrModalApt.code}
                </dd>
              </div>
              {vietQrModalApt.paymentMethod && (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Hình thức</dt>
                  <dd className="text-slate-800">
                    {PAYMENT_METHOD_LABELS[vietQrModalApt.paymentMethod]}
                  </dd>
                </div>
              )}
            </dl>

            <p className="text-xs text-slate-500 leading-relaxed">
              Sau khi chuyển khoản thành công, nhân viên lễ tân sẽ đối soát và cập nhật trạng thái{' '}
              <strong className="text-slate-700">Đã thanh toán</strong> ngay trên phiếu hẹn của bạn.
            </p>
          </div>
        </div>
      )}

      {/* Reschedule Appointment Modal */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Đổi ngày / giờ khám · {rescheduleTarget.code}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {rescheduleTarget.doctorName} · Lịch cũ: {rescheduleTarget.timeSlot}{' '}
                  {formatDateVi(rescheduleTarget.date)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Chọn ngày khám mới
              </label>
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Khung giờ còn trống ngày {formatDateVi(rescheduleDate)}
              </label>
              {loadingRescheduleSlots ? (
                <div className="grid grid-cols-4 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : rescheduleSlots.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">
                  Bác sĩ không có ca làm việc vào ngày đã chọn.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-52 overflow-y-auto">
                  {rescheduleSlots.map((slot) => {
                    const active = rescheduleSlot === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={!slot.available}
                        onClick={() => setRescheduleSlot(slot.time)}
                        className={`py-2 px-2.5 text-xs font-mono tabular-nums rounded-lg border transition-colors ${
                          !slot.available
                            ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                            : active
                              ? 'bg-teal-700 text-white border-teal-700 font-semibold'
                              : 'bg-white text-slate-800 border-slate-200 hover:border-teal-600'
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={!rescheduleSlot || submittingReschedule}
                onClick={handleConfirmReschedule}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg"
              >
                {submittingReschedule ? 'Đang cập nhật...' : 'Xác nhận đổi lịch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSubmitReview}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Đánh giá bác sĩ sau buổi khám
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {reviewTarget.doctorName} · Mã {reviewTarget.code}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Mức độ hài lòng của bạn
              </label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className={`p-2 rounded-lg border transition-colors ${
                      star <= reviewRating
                        ? 'border-amber-300 bg-amber-50 text-amber-500'
                        : 'border-slate-200 bg-white text-slate-300 hover:text-slate-400'
                    }`}
                    aria-label={`${star} sao`}
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
                <span className="ml-2 text-xs font-mono font-semibold text-slate-700 tabular-nums">
                  {reviewRating}/5 sao
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Nhận xét trải nghiệm thăm khám
              </label>
              <textarea
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Bác sĩ tư vấn tận tình, thời gian chờ đợi hợp lý..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submittingReview}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg"
              >
                {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Xác nhận hủy lịch hẹn {cancelTarget.code}
            </h3>
            <p className="text-sm text-slate-600">
              Khung giờ {cancelTarget.timeSlot} ngày {formatDateVi(cancelTarget.date)} sẽ được mở lại cho bệnh nhân khác.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Lý do hủy (tùy chọn)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Bận việc đột xuất, muốn đổi giờ khám..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Giữ lại lịch
              </button>
              <button
                type="button"
                onClick={handleCancelAppointment}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Xác nhận hủy
              </button>
            </div>
          </div>
        </div>
      )}

      <PrescriptionPrintModal record={printRecord} onClose={() => setPrintRecord(null)} />
      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSuccess={(msg) => setFeedback(msg)}
      />
    </div>
  );
}

