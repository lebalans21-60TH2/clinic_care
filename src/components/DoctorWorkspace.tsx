import {
  Bell,
  Calendar,
  CalendarClock,
  Check,
  FileText,
  KeyRound,
  LogOut,
  Plus,
  Printer,
  RotateCcw,
  Stethoscope,
  Trash2,
  Upload,
  UserCog,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { api, formatDateTimeVi, formatDateVi, resizeImageFileToDataUrl } from '../lib/api';
import type {
  Appointment,
  AppointmentStatus,
  DoctorProfile,
  DoctorSchedule,
  MedicalRecord,
  NotificationItem,
  PrescriptionItem,
  User,
} from '../types/clinic';
import { ChangePasswordModal } from './ChangePasswordModal';
import { DoctorAvatar } from './DoctorAvatar';
import { PrescriptionPrintModal } from './PrescriptionPrintModal';
import { StatusText } from './StatusText';

interface DoctorWorkspaceProps {
  user: User;
  doctorProfile: DoctorProfile;
  onLogout: () => void;
  onBackToPortal: () => void;
  onProfileUpdated: (user: User, doctor: DoctorProfile) => void;
}

const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export function DoctorWorkspace({
  user,
  doctorProfile,
  onLogout,
  onBackToPortal,
  onProfileUpdated,
}: DoctorWorkspaceProps) {
  const [tab, setTab] = useState<
    'appointments' | 'records' | 'schedule' | 'notifications' | 'profile'
  >('appointments');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [schedule, setSchedule] = useState<DoctorSchedule | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | AppointmentStatus>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<Appointment | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Clinical exam / Medical record modal
  const [examApt, setExamApt] = useState<Appointment | null>(null);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | null>(null);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [icdCode, setIcdCode] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [bloodPressure, setBloodPressure] = useState('120/80 mmHg');
  const [heartRate, setHeartRate] = useState('76 bpm');
  const [temperature, setTemperature] = useState('36.6 °C');
  const [weight, setWeight] = useState('65 kg');
  const [followUpDate, setFollowUpDate] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([
    { medicine: '', dosage: '', frequency: '', duration: '', note: '' },
  ]);
  const [savingRecord, setSavingRecord] = useState(false);

  // Blocked date input
  const [newBlockedDate, setNewBlockedDate] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Doctor profile edit state
  const [profFullName, setProfFullName] = useState(doctorProfile.fullName);
  const [profPhone, setProfPhone] = useState(user.phone);
  const [profContactEmail, setProfContactEmail] = useState(
    doctorProfile.contactEmail || user.email,
  );
  const [profTitle, setProfTitle] = useState(doctorProfile.title);
  const [profQualifications, setProfQualifications] = useState(
    doctorProfile.qualifications || '',
  );
  const [profExp, setProfExp] = useState(String(doctorProfile.experienceYears));
  const [profFee, setProfFee] = useState(String(doctorProfile.consultationFeeVnd));
  const [profRoom, setProfRoom] = useState(doctorProfile.roomNumber);
  const [profAvatarUrl, setProfAvatarUrl] = useState(doctorProfile.avatarUrl);
  const [profAvatarPublicId, setProfAvatarPublicId] = useState<string | undefined>(
    doctorProfile.avatarPublicId,
  );
  const [profBio, setProfBio] = useState(doctorProfile.bio);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [printRecord, setPrintRecord] = useState<MedicalRecord | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    setProfFullName(doctorProfile.fullName);
    setProfPhone(user.phone);
    setProfContactEmail(doctorProfile.contactEmail || user.email);
    setProfTitle(doctorProfile.title);
    setProfQualifications(doctorProfile.qualifications || '');
    setProfExp(String(doctorProfile.experienceYears));
    setProfFee(String(doctorProfile.consultationFeeVnd));
    setProfRoom(doctorProfile.roomNumber);
    setProfAvatarUrl(doctorProfile.avatarUrl);
    setProfAvatarPublicId(doctorProfile.avatarPublicId);
    setProfBio(doctorProfile.bio);
  }, [doctorProfile, user.phone, user.email]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [aptRes, recRes, schRes, notiRes] = await Promise.all([
        api.getAppointments(),
        api.getMedicalRecords(),
        api.getSchedule(doctorProfile.id),
        api.getNotifications(),
      ]);
      setAppointments(aptRes.appointments);
      setRecords(recRes.records);
      setSchedule(schRes.schedule);
      setNotifications(notiRes.notifications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [doctorProfile.id]);

  const handleStatusChange = async (id: string, status: AppointmentStatus, reason?: string) => {
    try {
      await api.updateAppointmentStatus(id, status, reason);
      setFeedback('Đã cập nhật trạng thái lịch hẹn.');
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const openCreateRecord = (apt: Appointment) => {
    setEditingRecord(null);
    setExamApt(apt);
    setChiefComplaint(apt.symptoms);
    setDiagnosis('');
    setIcdCode('');
    setClinicalNotes('');
    setBloodPressure('120/80 mmHg');
    setHeartRate('76 bpm');
    setTemperature('36.6 °C');
    setWeight('65 kg');
    setFollowUpDate('');
    setPrescriptions([{ medicine: '', dosage: '', frequency: '', duration: '', note: '' }]);
  };

  const openEditRecord = async (recId: string) => {
    try {
      const res = await api.getMedicalRecordDetail(recId);
      const r = res.record;
      setExamApt(null);
      setEditingRecord(r);
      setChiefComplaint(r.chiefComplaint);
      setDiagnosis(r.diagnosis);
      setIcdCode(r.icdCode || '');
      setClinicalNotes(r.clinicalNotes);
      setBloodPressure(r.vitalSigns.bloodPressure);
      setHeartRate(r.vitalSigns.heartRate);
      setTemperature(r.vitalSigns.temperature);
      setWeight(r.vitalSigns.weight);
      setFollowUpDate(r.followUpDate || '');
      setPrescriptions(
        r.prescriptions.length > 0
          ? r.prescriptions
          : [{ medicine: '', dosage: '', frequency: '', duration: '', note: '' }],
      );
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const handleSaveRecord = async (e: FormEvent) => {
    e.preventDefault();
    setSavingRecord(true);
    const cleanedPrescriptions = prescriptions.filter((p) => p.medicine.trim() !== '');
    try {
      if (editingRecord) {
        await api.updateMedicalRecord(editingRecord.id, {
          chiefComplaint,
          diagnosis,
          icdCode,
          clinicalNotes,
          vitalSigns: { bloodPressure, heartRate, temperature, weight },
          prescriptions: cleanedPrescriptions,
          followUpDate: followUpDate || undefined,
        });
        setFeedback('Đã cập nhật hồ sơ bệnh án.');
      } else if (examApt) {
        await api.createMedicalRecord({
          appointmentId: examApt.id,
          chiefComplaint,
          diagnosis,
          icdCode,
          clinicalNotes,
          vitalSigns: { bloodPressure, heartRate, temperature, weight },
          prescriptions: cleanedPrescriptions,
          followUpDate: followUpDate || undefined,
        });
        setFeedback(`Đã lưu hồ sơ bệnh án cho lịch hẹn ${examApt.code}.`);
      }
      setExamApt(null);
      setEditingRecord(null);
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSavingRecord(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!schedule) return;
    setSavingSchedule(true);
    try {
      await api.updateSchedule(doctorProfile.id, schedule);
      setFeedback('Đã lưu cấu hình lịch làm việc.');
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleAvatarFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    setFeedback(null);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 600);
      const uploaded = await api.uploadDoctorAvatar(dataUrl, doctorProfile.id);
      setProfAvatarUrl(uploaded.url);
      setProfAvatarPublicId(uploaded.publicId);
      setFeedback(
        uploaded.storage === 'cloudinary'
          ? 'Đã tải ảnh đại diện lên Cloudinary. Nhấn "Lưu thông tin cá nhân" để hoàn tất.'
          : 'Đã tải ảnh đại diện lên máy chủ. Nhấn "Lưu thông tin cá nhân" để hoàn tất.',
      );
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveDoctorProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setFeedback(null);
    try {
      const res = await api.updateDoctor(doctorProfile.id, {
        fullName: profFullName,
        phone: profPhone,
        contactEmail: profContactEmail,
        title: profTitle,
        qualifications: profQualifications,
        experienceYears: Number(profExp),
        consultationFeeVnd: Number(profFee),
        roomNumber: profRoom,
        avatarUrl: profAvatarUrl,
        avatarPublicId: profAvatarPublicId,
        bio: profBio,
      });
      onProfileUpdated(res.user || user, res.doctor);
      setFeedback('Đã lưu thay đổi thông tin cá nhân của bác sĩ.');
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const filteredAppointments = appointments.filter((a) => {
    const matchStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      a.patientName.toLowerCase().includes(q) ||
      a.code.toLowerCase().includes(q) ||
      a.patientPhone.includes(q);
    return matchStatus && matchSearch;
  });

  const unreadNoti = notifications.filter((n) => !n.read).length;

  const navItems = [
    { id: 'appointments' as const, label: 'Lịch hẹn khám', icon: Calendar },
    { id: 'records' as const, label: 'Hồ sơ bệnh án', icon: FileText },
    { id: 'schedule' as const, label: 'Lịch làm việc', icon: CalendarClock },
    { id: 'profile' as const, label: 'Chỉnh sửa thông tin', icon: UserCog },
    {
      id: 'notifications' as const,
      label: unreadNoti > 0 ? `Thông báo (${unreadNoti})` : 'Thông báo',
      icon: Bell,
    },
  ];

  const tabTitles = {
    appointments: 'Quản lý lịch hẹn khám',
    records: 'Hồ sơ bệnh án được phân công',
    schedule: 'Cấu hình ca làm việc',
    profile: 'Chỉnh sửa thông tin cá nhân',
    notifications: 'Thông báo bác sĩ',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToPortal}
            className="font-display text-lg font-bold tracking-tight text-slate-900"
          >
            ClinicCare
          </button>
          <span className="text-xs font-medium text-teal-700">Bác sĩ</span>
        </div>

        <div className="p-4 border-b border-slate-200">
          <div className="text-sm font-semibold text-slate-900 truncate">{doctorProfile.fullName}</div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {doctorProfile.title} · {doctorProfile.roomNumber}
          </div>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 hidden lg:block space-y-1">
          <button
            type="button"
            onClick={() => setPasswordModalOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Đổi mật khẩu</span>
          </button>
          <button
            type="button"
            onClick={onBackToPortal}
            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Xem cổng công khai
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất ({user.email})</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            <span>Không gian Bác sĩ</span>
            <span className="mx-2">/</span>
            <span className="font-medium text-slate-900">{tabTitles[tab]}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {appointments.filter((a) => a.status === 'PENDING').length} lịch chờ xác nhận
            </span>
          </div>
        </header>

        <main className="p-6 space-y-5 flex-1">
          {feedback && (
            <div className="flex items-center justify-between px-4 py-3 text-sm bg-teal-50 text-teal-900 border border-teal-200 rounded-xl">
              <span>{feedback}</span>
              <button type="button" onClick={() => setFeedback(null)} aria-label="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              Đang tải dữ liệu phòng khám...
            </div>
          ) : (
            <>
              {tab === 'appointments' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                      {(
                        [
                          { id: 'ALL', label: 'Tất cả' },
                          { id: 'PENDING', label: 'Chờ xác nhận' },
                          { id: 'CONFIRMED', label: 'Đã xác nhận' },
                          { id: 'CHECKED_IN', label: 'Đã đến' },
                          { id: 'COMPLETED', label: 'Đã xong' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setStatusFilter(f.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                            statusFilter === f.id
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Tìm mã hẹn, tên hoặc SĐT bệnh nhân..."
                      className="w-full sm:w-72 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    {filteredAppointments.length === 0 ? (
                      <div className="p-8 text-center text-sm text-slate-500">
                        Không có lịch hẹn phù hợp với bộ lọc hiện tại.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                              <th className="py-3 px-4">Mã hẹn</th>
                              <th className="py-3 px-4">Ngày & Giờ</th>
                              <th className="py-3 px-4">Bệnh nhân</th>
                              <th className="py-3 px-4">Triệu chứng ban đầu</th>
                              <th className="py-3 px-4">Trạng thái</th>
                              <th className="py-3 px-4 text-right">Xử lý</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-sm">
                            {filteredAppointments.map((apt) => {
                              const existingRecord = records.find((r) => r.appointmentId === apt.id);
                              return (
                                <tr key={apt.id} className="hover:bg-slate-50/70">
                                  <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                                    {apt.code}
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                                    {apt.timeSlot} · {formatDateVi(apt.date)}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="font-medium text-slate-900">{apt.patientName}</div>
                                    <div className="text-xs font-mono text-slate-500">{apt.patientPhone}</div>
                                  </td>
                                  <td className="py-3.5 px-4 max-w-xs">
                                    <p className="text-xs text-slate-700 line-clamp-2">{apt.symptoms}</p>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <StatusText status={apt.status} />
                                  </td>
                                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                                    {apt.status === 'PENDING' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleStatusChange(apt.id, 'CONFIRMED')}
                                          className="px-2.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                                        >
                                          Xác nhận
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setRejectTarget(apt)}
                                          className="px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
                                        >
                                          Từ chối
                                        </button>
                                      </>
                                    )}
                                    {apt.status === 'CONFIRMED' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleStatusChange(apt.id, 'CHECKED_IN')}
                                          className="px-2.5 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg"
                                        >
                                          Đã đến
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleStatusChange(apt.id, 'NO_SHOW')}
                                          className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                                        >
                                          Vắng mặt
                                        </button>
                                      </>
                                    )}
                                    {['CONFIRMED', 'CHECKED_IN'].includes(apt.status) && !existingRecord && (
                                      <button
                                        type="button"
                                        onClick={() => openCreateRecord(apt)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                                      >
                                        <Stethoscope className="w-3.5 h-3.5" />
                                        <span>Khám & Ghi bệnh án</span>
                                      </button>
                                    )}
                                    {existingRecord && (
                                      <button
                                        type="button"
                                        onClick={() => openEditRecord(existingRecord.id)}
                                        className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg"
                                      >
                                        Xem / Sửa bệnh án
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'records' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                    Hồ sơ bệnh nhân thuộc phạm vi phụ trách ({records.length}) — Mọi thao tác đọc & sửa đều được ghi nhật ký bảo mật.
                  </div>
                  {records.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">Chưa có hồ sơ khám bệnh nào.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                            <th className="py-3 px-4">Mã khám</th>
                            <th className="py-3 px-4">Ngày khám</th>
                            <th className="py-3 px-4">Bệnh nhân</th>
                            <th className="py-3 px-4">Chẩn đoán</th>
                            <th className="py-3 px-4">Đơn thuốc</th>
                            <th className="py-3 px-4 text-right">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-sm">
                          {records.map((rec) => (
                            <tr key={rec.id} className="hover:bg-slate-50/70">
                              <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900">
                                {rec.appointmentCode}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums">
                                {formatDateVi(rec.visitDate)}
                              </td>
                              <td className="py-3.5 px-4 font-medium text-slate-900">{rec.patientName}</td>
                              <td className="py-3.5 px-4 text-slate-700">
                                {rec.diagnosis}
                                {rec.icdCode ? ` (${rec.icdCode})` : ''}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-xs text-slate-600 tabular-nums">
                                {rec.prescriptions.length} thuốc
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setPrintRecord(rec)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>In đơn</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditRecord(rec.id)}
                                    className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg"
                                  >
                                    Chi tiết / Cập nhật
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === 'schedule' && schedule && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">Lịch làm việc hàng tuần</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Hệ thống tự động chia khung giờ {schedule.slotDurationMinutes} phút theo ca sáng & chiều.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={savingSchedule}
                      onClick={handleSaveSchedule}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                    >
                      <Check className="w-4 h-4" />
                      <span>{savingSchedule ? 'Đang lưu...' : 'Lưu lịch làm việc'}</span>
                    </button>
                  </div>

                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6, 0].map((dayIdx) => {
                      const shift = schedule.weeklyShifts[dayIdx];
                      return (
                        <div
                          key={dayIdx}
                          className="grid sm:grid-cols-[140px_1fr_1fr] gap-3 items-center p-3.5 border border-slate-200 rounded-lg"
                        >
                          <label className="flex items-center gap-2.5 text-sm font-medium text-slate-900 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={shift.enabled}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  weeklyShifts: {
                                    ...schedule.weeklyShifts,
                                    [dayIdx]: { ...shift, enabled: e.target.checked },
                                  },
                                })
                              }
                              className="w-4 h-4 accent-teal-700"
                            />
                            <span>{DAY_NAMES[dayIdx]}</span>
                          </label>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 w-10">Sáng:</span>
                            <input
                              type="time"
                              disabled={!shift.enabled}
                              value={shift.morningStart}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  weeklyShifts: {
                                    ...schedule.weeklyShifts,
                                    [dayIdx]: { ...shift, morningStart: e.target.value },
                                  },
                                })
                              }
                              className="px-2 py-1.5 font-mono border border-slate-200 rounded-md disabled:opacity-40"
                            />
                            <span>-</span>
                            <input
                              type="time"
                              disabled={!shift.enabled}
                              value={shift.morningEnd}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  weeklyShifts: {
                                    ...schedule.weeklyShifts,
                                    [dayIdx]: { ...shift, morningEnd: e.target.value },
                                  },
                                })
                              }
                              className="px-2 py-1.5 font-mono border border-slate-200 rounded-md disabled:opacity-40"
                            />
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 w-10">Chiều:</span>
                            <input
                              type="time"
                              disabled={!shift.enabled}
                              value={shift.afternoonStart}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  weeklyShifts: {
                                    ...schedule.weeklyShifts,
                                    [dayIdx]: { ...shift, afternoonStart: e.target.value },
                                  },
                                })
                              }
                              className="px-2 py-1.5 font-mono border border-slate-200 rounded-md disabled:opacity-40"
                            />
                            <span>-</span>
                            <input
                              type="time"
                              disabled={!shift.enabled}
                              value={shift.afternoonEnd}
                              onChange={(e) =>
                                setSchedule({
                                  ...schedule,
                                  weeklyShifts: {
                                    ...schedule.weeklyShifts,
                                    [dayIdx]: { ...shift, afternoonEnd: e.target.value },
                                  },
                                })
                              }
                              className="px-2 py-1.5 font-mono border border-slate-200 rounded-md disabled:opacity-40"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-slate-200 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">Ngày nghỉ đột xuất</h3>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="date"
                        value={newBlockedDate}
                        onChange={(e) => setNewBlockedDate(e.target.value)}
                        className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newBlockedDate || schedule.blockedDates.includes(newBlockedDate)) return;
                          setSchedule({
                            ...schedule,
                            blockedDates: [...schedule.blockedDates, newBlockedDate],
                          });
                          setNewBlockedDate('');
                        }}
                        className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
                      >
                        Thêm ngày nghỉ
                      </button>
                    </div>
                    {schedule.blockedDates.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {schedule.blockedDates.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              setSchedule({
                                ...schedule,
                                blockedDates: schedule.blockedDates.filter((x) => x !== d),
                              })
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono bg-slate-100 text-slate-800 rounded-lg hover:bg-rose-50 hover:text-rose-700"
                          >
                            <span>{formatDateVi(d)}</span>
                            <X className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'notifications' && (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">Không có thông báo mới.</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="p-4 flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                          <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                          <p className="text-xs font-mono text-slate-400 mt-1">
                            {formatDateTimeVi(n.createdAt)}
                          </p>
                        </div>
                        {!n.read && (
                          <button
                            type="button"
                            onClick={async () => {
                              await api.markNotificationRead(n.id);
                              await loadAll();
                            }}
                            className="text-xs font-medium text-teal-700 hover:underline whitespace-nowrap"
                          >
                            Đánh dấu đã đọc
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'profile' && (
                <form
                  onSubmit={handleSaveDoctorProfile}
                  className="bg-white border border-slate-200 rounded-xl p-6 max-w-3xl space-y-6"
                >
                  <div className="pb-4 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">
                      Chỉnh sửa thông tin cá nhân
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Cập nhật ảnh đại diện, bằng cấp chuyên môn, tiểu sử (bio) và thông tin liên lạc hiển thị cho bệnh nhân.
                    </p>
                  </div>

                  {/* Ảnh đại diện */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-5 pb-6 border-b border-slate-200">
                    <DoctorAvatar
                      src={profAvatarUrl}
                      name={profFullName || doctorProfile.fullName}
                      className="w-24 h-24"
                    />
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <label
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                            uploadingAvatar ? 'opacity-60 pointer-events-none' : ''
                          }`}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{uploadingAvatar ? 'Đang tải ảnh lên...' : 'Tải ảnh từ thiết bị'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingAvatar}
                            onChange={handleAvatarFileChange}
                            className="sr-only"
                          />
                        </label>
                        {profAvatarUrl !== doctorProfile.avatarUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setProfAvatarUrl(doctorProfile.avatarUrl);
                              setProfAvatarPublicId(doctorProfile.avatarPublicId);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Hoàn tác ảnh</span>
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Hoặc nhập đường dẫn ảnh đại diện (URL)
                        </label>
                        <input
                          type="text"
                          value={profAvatarUrl.startsWith('data:') ? '' : profAvatarUrl}
                          onChange={(e) => {
                            setProfAvatarUrl(e.target.value);
                            setProfAvatarPublicId(undefined);
                          }}
                          placeholder={
                            profAvatarUrl.startsWith('data:')
                              ? 'Đang dùng ảnh tải lên từ thiết bị (nhập URL mới để thay thế)'
                              : 'https://... hoặc /src/assets/images/...'
                          }
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Thông tin liên lạc */}
                  <div className="space-y-4 pb-6 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">Thông tin liên lạc</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Họ và tên bác sĩ
                        </label>
                        <input
                          type="text"
                          required
                          value={profFullName}
                          onChange={(e) => setProfFullName(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Số điện thoại liên hệ
                        </label>
                        <input
                          type="tel"
                          required
                          value={profPhone}
                          onChange={(e) => setProfPhone(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Email liên hệ
                        </label>
                        <input
                          type="email"
                          required
                          value={profContactEmail}
                          onChange={(e) => setProfContactEmail(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Phòng khám tiếp nhận
                        </label>
                        <input
                          type="text"
                          required
                          value={profRoom}
                          onChange={(e) => setProfRoom(e.target.value)}
                          className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bằng cấp & Chuyên môn */}
                  <div className="space-y-4 pb-6 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">Bằng cấp & Chuyên môn</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          Chức danh / Học vị
                        </label>
                        <input
                          type="text"
                          required
                          value={profTitle}
                          onChange={(e) => setProfTitle(e.target.value)}
                          placeholder="Ví dụ: Trưởng khoa Tim mạch"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Số năm kinh nghiệm
                          </label>
                          <input
                            type="number"
                            min={0}
                            required
                            value={profExp}
                            onChange={(e) => setProfExp(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            Phí khám (VNĐ)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={10000}
                            required
                            value={profFee}
                            onChange={(e) => setProfFee(e.target.value)}
                            className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1.5">
                        Bằng cấp & Chứng chỉ hành nghề
                      </label>
                      <input
                        type="text"
                        value={profQualifications}
                        onChange={(e) => setProfQualifications(e.target.value)}
                        placeholder="Ví dụ: Thạc sĩ Y khoa ĐH Y Dược TP.HCM · Chứng chỉ Nội soi chẩn đoán"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>

                  {/* Bio */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Tiểu sử & Giới thiệu chuyên môn (Bio)
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={profBio}
                      onChange={(e) => setProfBio(e.target.value)}
                      placeholder="Giới thiệu quá trình đào tạo, kinh nghiệm công tác và lĩnh vực chuyên sâu..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-2">
                    <span className="text-xs text-slate-500">
                      Tài khoản đăng nhập: <span className="font-mono">{user.email}</span>
                    </span>
                    <button
                      type="submit"
                      disabled={savingProfile || uploadingAvatar}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg whitespace-nowrap"
                    >
                      {savingProfile ? 'Đang lưu thay đổi...' : 'Lưu thông tin cá nhân'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </main>
      </div>

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Từ chối lịch hẹn {rejectTarget.code}
            </h3>
            <input
              type="text"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nhập lý do từ chối (ví dụ: Bận hội chẩn đột xuất)..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-sm text-slate-700 bg-slate-100 rounded-lg"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleStatusChange(
                    rejectTarget.id,
                    'REJECTED',
                    rejectReason.trim() || 'Bác sĩ thay đổi lịch đột xuất',
                  );
                  setRejectTarget(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg"
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clinical Exam / Medical Record Modal */}
      {(examApt || editingRecord) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveRecord}
            className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {editingRecord
                    ? `Cập nhật hồ sơ bệnh án ${editingRecord.appointmentCode}`
                    : `Khám bệnh & Tạo hồ sơ (${examApt?.code})`}
                </h3>
                <p className="text-xs text-slate-500">
                  Bệnh nhân: {editingRecord ? editingRecord.patientName : examApt?.patientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExamApt(null);
                  setEditingRecord(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Huyết áp</label>
                  <input
                    type="text"
                    value={bloodPressure}
                    onChange={(e) => setBloodPressure(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nhịp tim</label>
                  <input
                    type="text"
                    value={heartRate}
                    onChange={(e) => setHeartRate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nhiệt độ</label>
                  <input
                    type="text"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Cân nặng</label>
                  <input
                    type="text"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Triệu chứng lâm sàng</label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid sm:grid-cols-[1fr_140px] gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Chẩn đoán chính *</label>
                  <input
                    type="text"
                    required
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Ví dụ: Viêm xoang cấp, Tăng huyết áp độ 1..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mã ICD-10</label>
                  <input
                    type="text"
                    value={icdCode}
                    onChange={(e) => setIcdCode(e.target.value)}
                    placeholder="J01.9"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ghi chú thăm khám & Dặn dò
                </label>
                <textarea
                  rows={3}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800">Đơn thuốc kê cho bệnh nhân</label>
                  <button
                    type="button"
                    onClick={() =>
                      setPrescriptions([
                        ...prescriptions,
                        { medicine: '', dosage: '', frequency: '', duration: '', note: '' },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm dòng thuốc</span>
                  </button>
                </div>

                {prescriptions.map((p, idx) => (
                  <div key={idx} className="grid sm:grid-cols-[1.5fr_0.8fr_1.2fr_0.8fr_32px] gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Tên thuốc & hàm lượng"
                      value={p.medicine}
                      onChange={(e) => {
                        const copy = [...prescriptions];
                        copy[idx].medicine = e.target.value;
                        setPrescriptions(copy);
                      }}
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Liều (1 viên)"
                      value={p.dosage}
                      onChange={(e) => {
                        const copy = [...prescriptions];
                        copy[idx].dosage = e.target.value;
                        setPrescriptions(copy);
                      }}
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Cách dùng (Sáng 1, Tối 1)"
                      value={p.frequency}
                      onChange={(e) => {
                        const copy = [...prescriptions];
                        copy[idx].frequency = e.target.value;
                        setPrescriptions(copy);
                      }}
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="7 ngày"
                      value={p.duration}
                      onChange={(e) => {
                        const copy = [...prescriptions];
                        copy[idx].duration = e.target.value;
                        setPrescriptions(copy);
                      }}
                      className="px-2.5 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setPrescriptions(prescriptions.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                      aria-label="Xóa thuốc"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="max-w-xs">
                <label className="block text-xs font-medium text-slate-700 mb-1">Ngày hẹn tái khám (tùy chọn)</label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div>
                {editingRecord && (
                  <button
                    type="button"
                    onClick={() => setPrintRecord(editingRecord)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In đơn thuốc</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExamApt(null);
                    setEditingRecord(null);
                  }}
                  className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingRecord}
                  className="px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                >
                  {savingRecord ? 'Đang lưu...' : 'Lưu hồ sơ & Hoàn tất khám'}
                </button>
              </div>
            </div>
          </form>
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
