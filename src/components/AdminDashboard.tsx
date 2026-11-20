import {
  Activity,
  BarChart3,
  BellRing,
  BriefcaseMedical,
  Calendar,
  Camera,
  CreditCard,
  DatabaseBackup,
  Download,
  KeyRound,
  LogOut,
  Pencil,
  Plus,
  QrCode,
  RotateCcw,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  APPOINTMENT_STATUS_META,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_META,
  ROLE_LABELS,
  api,
  formatDateTimeVi,
  formatDateVi,
  formatVnd,
  resizeImageFileToDataUrl,
} from '../lib/api';
import type {
  Appointment,
  AppointmentStatus,
  AuditLogItem,
  BackupMeta,
  DoctorProfile,
  PaymentMethod,
  PaymentStatus,
  ServiceItem,
  Specialty,
  User,
  UserRole,
} from '../types/clinic';
import { ChangePasswordModal } from './ChangePasswordModal';
import { DoctorAvatar } from './DoctorAvatar';
import { StatusText } from './StatusText';

interface AdminDashboardProps {
  user: User;
  onLogout: () => void;
  onBackToPortal: () => void;
  onCatalogChanged: () => void;
}

export function AdminDashboard({
  user,
  onLogout,
  onBackToPortal,
  onCatalogChanged,
}: AdminDashboardProps) {
  const [tab, setTab] = useState<
    'overview' | 'appointments' | 'catalog' | 'doctors' | 'users' | 'audit'
  >('overview');

  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.getAdminDashboard>> | null>(
    null,
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // QR Check-in input + Camera QR scanner
  const [qrInput, setQrInput] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Payment modal
  const [paymentTarget, setPaymentTarget] = useState<Appointment | null>(null);
  const [payStatus, setPayStatus] = useState<PaymentStatus>('PAID');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('VIETQR');
  const [payVietQrUrl, setPayVietQrUrl] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Specialty form
  const [specName, setSpecName] = useState('');
  const [specRoom, setSpecRoom] = useState('');
  const [specDesc, setSpecDesc] = useState('');

  // Service form
  const [srvSpecId, setSrvSpecId] = useState('');
  const [srvName, setSrvName] = useState('');
  const [srvPrice, setSrvPrice] = useState('350000');
  const [srvDesc, setSrvDesc] = useState('');

  // Doctor form
  const [docName, setDocName] = useState('');
  const [docEmail, setDocEmail] = useState('');
  const [docPhone, setDocPhone] = useState('');
  const [docTitle, setDocTitle] = useState('Bác sĩ chuyên khoa');
  const [docQualifications, setDocQualifications] = useState('');
  const [docSpecId, setDocSpecId] = useState('');
  const [docExp, setDocExp] = useState('8');
  const [docFee, setDocFee] = useState('350000');
  const [docRoom, setDocRoom] = useState('P.205');
  const [docAvatarUrl, setDocAvatarUrl] = useState('');
  const [docAvatarPublicId, setDocAvatarPublicId] = useState<string | undefined>(undefined);
  const [uploadingCreateAvatar, setUploadingCreateAvatar] = useState(false);

  // Edit Doctor modal state
  const [editingDoctor, setEditingDoctor] = useState<DoctorProfile | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editDocPhone, setEditDocPhone] = useState('');
  const [editDocEmail, setEditDocEmail] = useState('');
  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocQualifications, setEditDocQualifications] = useState('');
  const [editDocSpecId, setEditDocSpecId] = useState('');
  const [editDocExp, setEditDocExp] = useState('0');
  const [editDocFee, setEditDocFee] = useState('300000');
  const [editDocRoom, setEditDocRoom] = useState('');
  const [editDocAvatarUrl, setEditDocAvatarUrl] = useState('');
  const [editDocAvatarPublicId, setEditDocAvatarPublicId] = useState<string | undefined>(undefined);
  const [editDocBio, setEditDocBio] = useState('');
  const [editDocActive, setEditDocActive] = useState(true);
  const [uploadingEditAvatar, setUploadingEditAvatar] = useState(false);
  const [savingEditDoctor, setSavingEditDoctor] = useState(false);

  const [aptFilter, setAptFilter] = useState<'ALL' | AppointmentStatus>('ALL');
  const [backingUp, setBackingUp] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dashRes, aptRes, ovRes, adminDocsRes, usrRes, logRes] = await Promise.all([
        api.getAdminDashboard(),
        api.getAppointments(),
        api.getPublicOverview(),
        api.getAdminDoctors(),
        api.getAdminUsers(),
        api.getAuditLogs(),
      ]);
      setDashboard(dashRes);
      setAppointments(aptRes.appointments);
      setSpecialties(ovRes.specialties);
      setDoctors(adminDocsRes.doctors);
      setServices(ovRes.services);
      setUsers(usrRes.users);
      setLogs(logRes.logs);
      setBackups(logRes.backups);
      if (ovRes.specialties.length > 0) {
        setSrvSpecId((prev) => prev || ovRes.specialties[0].id);
        setDocSpecId((prev) => prev || ovRes.specialties[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  const openEditDoctor = (doc: DoctorProfile) => {
    const linkedUser = users.find((u) => u.id === doc.userId);
    setEditingDoctor(doc);
    setEditDocName(doc.fullName);
    setEditDocPhone(linkedUser?.phone || '');
    setEditDocEmail(doc.contactEmail || linkedUser?.email || '');
    setEditDocTitle(doc.title);
    setEditDocQualifications(doc.qualifications || '');
    setEditDocSpecId(doc.specialtyId);
    setEditDocExp(String(doc.experienceYears));
    setEditDocFee(String(doc.consultationFeeVnd));
    setEditDocRoom(doc.roomNumber);
    setEditDocAvatarUrl(doc.avatarUrl);
    setEditDocAvatarPublicId(doc.avatarPublicId);
    setEditDocBio(doc.bio);
    setEditDocActive(doc.active);
  };

  const handleCreateAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingCreateAvatar(true);
    setFeedback(null);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 600);
      const uploaded = await api.uploadDoctorAvatar(dataUrl, docEmail || 'new-doctor');
      setDocAvatarUrl(uploaded.url);
      setDocAvatarPublicId(uploaded.publicId);
      setFeedback(
        uploaded.storage === 'cloudinary'
          ? 'Đã tải ảnh đại diện lên Cloudinary.'
          : 'Đã tải ảnh đại diện lên máy chủ.',
      );
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setUploadingCreateAvatar(false);
    }
  };

  const handleEditAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editingDoctor) return;
    setUploadingEditAvatar(true);
    setFeedback(null);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file, 600);
      const uploaded = await api.uploadDoctorAvatar(dataUrl, editingDoctor.id);
      setEditDocAvatarUrl(uploaded.url);
      setEditDocAvatarPublicId(uploaded.publicId);
      setFeedback(
        uploaded.storage === 'cloudinary'
          ? 'Đã tải ảnh đại diện lên Cloudinary. Nhấn "Lưu cập nhật" để áp dụng.'
          : 'Đã tải ảnh đại diện lên máy chủ. Nhấn "Lưu cập nhật" để áp dụng.',
      );
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setUploadingEditAvatar(false);
    }
  };

  const handleSaveEditDoctor = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingDoctor) return;
    setSavingEditDoctor(true);
    try {
      await api.updateDoctor(editingDoctor.id, {
        fullName: editDocName,
        phone: editDocPhone,
        contactEmail: editDocEmail,
        title: editDocTitle,
        qualifications: editDocQualifications,
        specialtyId: editDocSpecId,
        experienceYears: Number(editDocExp),
        consultationFeeVnd: Number(editDocFee),
        roomNumber: editDocRoom,
        avatarUrl: editDocAvatarUrl,
        avatarPublicId: editDocAvatarPublicId,
        bio: editDocBio,
        active: editDocActive,
      });
      setEditingDoctor(null);
      setFeedback(`Đã cập nhật thông tin bác sĩ ${editDocName}.`);
      onCatalogChanged();
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSavingEditDoctor(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const performQrCheckIn = async (rawPayload: string) => {
    if (!rawPayload.trim()) return;
    setCheckingIn(true);
    try {
      const res = await api.checkInQr(rawPayload.trim());
      setFeedback(
        `Check-in thành công: ${res.appointment.patientName} (${res.appointment.code}) - ${res.appointment.doctorName}`,
      );
      setQrInput('');
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setCheckingIn(false);
    }
  };

  useEffect(() => {
    if (!cameraOpen || tab !== 'appointments') {
      return;
    }
    let cancelled = false;
    let rafId = 0;
    let stream: MediaStream | null = null;
    setCameraError(null);

    const startScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Trình duyệt không hỗ trợ truy cập Camera. Vui lòng nhập mã thủ công.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const scanFrame = () => {
          if (cancelled) return;
          const v = videoRef.current;
          const canvas = canvasRef.current;
          if (v && canvas && v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
                inversionAttempts: 'dontInvert',
              });
              if (decoded?.data) {
                setCameraOpen(false);
                setQrInput(decoded.data);
                performQrCheckIn(decoded.data);
                return;
              }
            }
          }
          rafId = requestAnimationFrame(scanFrame);
        };
        rafId = requestAnimationFrame(scanFrame);
      } catch {
        setCameraError(
          'Không thể mở Camera (chưa cấp quyền hoặc thiết bị không có camera). Vui lòng nhập mã hẹn.',
        );
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraOpen, tab]);

  const handleQrCheckIn = async (e: FormEvent) => {
    e.preventDefault();
    await performQrCheckIn(qrInput);
  };

  const openPaymentModal = async (apt: Appointment) => {
    setPaymentTarget(apt);
    setPayStatus(apt.paymentStatus || 'UNPAID');
    setPayMethod(apt.paymentMethod || 'VIETQR');
    setPayVietQrUrl(apt.vietQrDataUrl || '');
    if (!apt.vietQrDataUrl) {
      const res = await api.getAppointmentVietQr(apt.id).catch(() => null);
      if (res) setPayVietQrUrl(res.vietQrDataUrl);
    }
  };

  const handleSavePayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!paymentTarget) return;
    setSavingPayment(true);
    try {
      await api.updateAppointmentPayment(paymentTarget.id, payStatus, payMethod);
      setFeedback(
        `Đã cập nhật thanh toán cho lịch hẹn ${paymentTarget.code}: ${PAYMENT_STATUS_META[payStatus].label}.`,
      );
      setPaymentTarget(null);
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDispatchReminders = async () => {
    setSendingReminders(true);
    try {
      const res = await api.dispatchReminders();
      setFeedback(
        res.sentCount > 0
          ? `Đã gửi nhắc lịch tự động cho ${res.sentCount} lịch hẹn sắp diễn ra trong 24h tới.`
          : 'Hiện không có lịch hẹn CONFIRMED mới nào cần gửi nhắc lịch trong 24h tới.',
      );
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setSendingReminders(false);
    }
  };

  const handleCreateSpecialty = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createSpecialty({ name: specName, roomNumber: specRoom, description: specDesc });
      setSpecName('');
      setSpecRoom('');
      setSpecDesc('');
      setFeedback('Đã thêm chuyên khoa mới.');
      onCatalogChanged();
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const handleCreateService = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createService({
        specialtyId: srvSpecId,
        name: srvName,
        description: srvDesc,
        priceVnd: Number(srvPrice),
        durationMinutes: 30,
      });
      setSrvName('');
      setSrvDesc('');
      setFeedback('Đã thêm dịch vụ khám mới.');
      onCatalogChanged();
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const handleCreateDoctor = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createDoctor({
        fullName: docName,
        email: docEmail,
        phone: docPhone,
        title: docTitle,
        qualifications: docQualifications,
        specialtyId: docSpecId,
        experienceYears: Number(docExp),
        consultationFeeVnd: Number(docFee),
        roomNumber: docRoom,
        avatarUrl: docAvatarUrl.trim() || undefined,
        avatarPublicId: docAvatarPublicId,
        bio: `${docTitle} giàu kinh nghiệm tại phòng khám ClinicCare.`,
      });
      setDocName('');
      setDocEmail('');
      setDocPhone('');
      setDocQualifications('');
      setDocAvatarUrl('');
      setDocAvatarPublicId(undefined);
      setFeedback('Đã tạo tài khoản và hồ sơ bác sĩ mới (Mật khẩu mặc định: Doctor@123).');
      onCatalogChanged();
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    }
  };

  const handleCreateBackup = async () => {
    setBackingUp(true);
    try {
      const { meta, content } = await api.createBackup();
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta.filename;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback(`Đã tạo và tải xuống bản sao lưu ${meta.filename}.`);
      await loadAll();
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setBackingUp(false);
    }
  };

  const navItems = [
    { id: 'overview' as const, label: 'Thống kê tổng quan', icon: BarChart3 },
    { id: 'appointments' as const, label: 'Lịch hẹn & QR Check-in', icon: Calendar },
    { id: 'catalog' as const, label: 'Chuyên khoa & Dịch vụ', icon: BriefcaseMedical },
    { id: 'doctors' as const, label: 'Đội ngũ bác sĩ', icon: Stethoscope },
    { id: 'users' as const, label: 'Tài khoản & Phân quyền', icon: Users },
    { id: 'audit' as const, label: 'Nhật ký & Sao lưu', icon: DatabaseBackup },
  ];

  const filteredAppointments = appointments.filter(
    (a) => aptFilter === 'ALL' || a.status === aptFilter,
  );

  const maxDailyCount = Math.max(
    1,
    ...(dashboard?.dailyTrend.map((d) => d.count) ?? [1]),
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-slate-900 text-slate-200 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToPortal}
            className="font-display text-lg font-bold tracking-tight text-white"
          >
            ClinicCare
          </button>
          <span className="text-xs font-medium text-teal-400">Quản trị</span>
        </div>

        <div className="p-4 border-b border-slate-800">
          <div className="text-sm font-semibold text-white truncate">{user.fullName}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{user.email}</div>
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
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800 hidden lg:block space-y-1">
          <button
            type="button"
            onClick={() => setPasswordModalOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Đổi mật khẩu</span>
          </button>
          <button
            type="button"
            onClick={onBackToPortal}
            className="w-full text-left px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 rounded-lg"
          >
            Xem cổng công khai
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-slate-800 rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm text-slate-500">
            <span>Quản trị ClinicCare</span>
            <span className="mx-2">/</span>
            <span className="font-medium text-slate-900">
              {navItems.find((i) => i.id === tab)?.label}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCreateBackup}
            disabled={backingUp}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{backingUp ? 'Đang sao lưu...' : 'Sao lưu DB ngay'}</span>
          </button>
        </header>

        <main className="p-6 space-y-6 flex-1">
          {feedback && (
            <div className="flex items-center justify-between px-4 py-3 text-sm bg-teal-50 text-teal-900 border border-teal-200 rounded-xl">
              <span>{feedback}</span>
              <button type="button" onClick={() => setFeedback(null)} aria-label="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading || !dashboard ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              Đang tổng hợp số liệu quản trị...
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <div className="space-y-6">
                  {/* 4 KPI cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Tổng lịch hẹn</div>
                      <div className="text-2xl font-semibold font-mono text-slate-900 tabular-nums mt-2">
                        {dashboard.kpis.totalAppointments}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 tabular-nums">
                        Hôm nay: {dashboard.kpis.todayAppointments} lượt
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Bệnh nhân đăng ký</div>
                      <div className="text-2xl font-semibold font-mono text-slate-900 tabular-nums mt-2">
                        {dashboard.kpis.totalPatients}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 tabular-nums">
                        {dashboard.kpis.totalMedicalRecords} hồ sơ bệnh án
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Bác sĩ hoạt động</div>
                      <div className="text-2xl font-semibold font-mono text-slate-900 tabular-nums mt-2">
                        {dashboard.kpis.totalDoctors}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {specialties.length} chuyên khoa
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs font-medium text-slate-500">Doanh thu đã thu</div>
                      <div className="text-2xl font-semibold font-mono text-teal-700 tabular-nums mt-2">
                        {formatVnd(dashboard.kpis.estimatedRevenueVnd)}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 tabular-nums">
                        {appointments.filter((a) => a.paymentStatus === 'PAID').length} đơn đã thu ·{' '}
                        {dashboard.kpis.completedCount} ca xong
                      </div>
                    </div>
                  </div>

                  {/* Charts row */}
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-semibold text-slate-900">
                          Lưu lượng lịch hẹn 7 ngày quanh hôm nay
                        </h3>
                        <Activity className="w-4 h-4 text-teal-700" />
                      </div>
                      <div className="grid grid-cols-7 gap-3 items-end h-44 pt-4">
                        {dashboard.dailyTrend.map((day) => {
                          const heightPct = Math.max(8, Math.round((day.count / maxDailyCount) * 100));
                          return (
                            <div key={day.date} className="flex flex-col items-center gap-2 h-full justify-end">
                              <span className="text-xs font-mono font-semibold text-slate-700 tabular-nums">
                                {day.count}
                              </span>
                              <div className="w-full max-w-[36px] bg-slate-100 rounded-md h-28 flex items-end overflow-hidden">
                                <div
                                  style={{ height: `${heightPct}%` }}
                                  className="w-full bg-teal-700 rounded-md transition-all"
                                />
                              </div>
                              <span className="text-xs font-mono text-slate-500 tabular-nums">
                                {day.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                      <h3 className="text-base font-semibold text-slate-900">
                        Phân bổ trạng thái lịch hẹn
                      </h3>
                      <div className="space-y-3">
                        {(Object.keys(APPOINTMENT_STATUS_META) as AppointmentStatus[]).map((st) => {
                          const count = dashboard.statusCounts[st] || 0;
                          const pct =
                            dashboard.kpis.totalAppointments > 0
                              ? Math.round((count / dashboard.kpis.totalAppointments) * 100)
                              : 0;
                          return (
                            <div key={st} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <StatusText status={st} />
                                <span className="font-mono text-slate-600 tabular-nums">
                                  {count} ({pct}%)
                                </span>
                              </div>
                              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className="h-full bg-slate-800 rounded-full"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Specialty utilization */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-900">
                      Hiệu suất theo chuyên khoa
                    </div>
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Chuyên khoa</th>
                          <th className="py-3 px-4">Phòng khám</th>
                          <th className="py-3 px-4 text-right">Số bác sĩ</th>
                          <th className="py-3 px-4 text-right">Lịch hẹn ghi nhận</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {dashboard.specialtyStats.map((s) => (
                          <tr key={s.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{s.name}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-600">{s.roomNumber}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{s.doctorCount}</td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-teal-700 tabular-nums">
                              {s.appointmentCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'appointments' && (
                <div className="space-y-5">
                  {/* Reception QR Check-in verification + Camera QR Scanner */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <form
                      onSubmit={handleQrCheckIn}
                      className="flex flex-wrap items-end gap-3"
                    >
                      <div className="flex-1 min-w-[240px]">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-1.5">
                          <QrCode className="w-4 h-4 text-teal-700" />
                          <span>Quét Camera QR hoặc nhập mã lịch hẹn tại quầy tiếp nhận</span>
                        </label>
                        <input
                          type="text"
                          value={qrInput}
                          onChange={(e) => setQrInput(e.target.value)}
                          placeholder='Nhập mã CC-260102 hoặc dán chuỗi JSON từ máy quét QR...'
                          className="w-full px-3.5 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCameraOpen((prev) => !prev)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap ${
                          cameraOpen
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        <Camera className="w-4 h-4" />
                        <span>{cameraOpen ? 'Tắt Camera QR' : 'Quét Camera QR'}</span>
                      </button>
                      <button
                        type="submit"
                        disabled={checkingIn || !qrInput.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
                      >
                        {checkingIn ? 'Đang kiểm tra...' : 'Xác nhận Check-in'}
                      </button>
                    </form>

                    {cameraOpen && (
                      <div className="pt-3 border-t border-slate-200 space-y-2">
                        {cameraError ? (
                          <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                            {cameraError}
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="relative w-64 h-48 bg-slate-950 rounded-xl overflow-hidden border border-slate-300 shrink-0">
                              <video
                                ref={videoRef}
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                              />
                              <canvas ref={canvasRef} className="hidden" />
                            </div>
                            <div className="text-xs text-slate-600 space-y-1.5">
                              <div className="font-semibold text-slate-900">
                                Camera quét QR đang hoạt động
                              </div>
                              <p>
                                Đưa mã QR trên phiếu hẹn hoặc điện thoại bệnh nhân vào khung hình. Hệ
                                thống sẽ tự động giải mã và chuyển sang trạng thái Đã đến phòng khám.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                    {(['ALL', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'] as const).map(
                      (st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setAptFilter(st)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                            aptFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                          }`}
                        >
                          {st === 'ALL' ? 'Tất cả' : APPOINTMENT_STATUS_META[st].label}
                        </button>
                      ),
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                            <th className="py-3 px-4">Mã hẹn</th>
                            <th className="py-3 px-4">Ngày giờ</th>
                            <th className="py-3 px-4">Bệnh nhân</th>
                            <th className="py-3 px-4">Bác sĩ & Khoa</th>
                            <th className="py-3 px-4">Thanh toán</th>
                            <th className="py-3 px-4">Trạng thái</th>
                            <th className="py-3 px-4 text-right">Cập nhật nhanh</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredAppointments.map((apt) => {
                            const payMeta = PAYMENT_STATUS_META[apt.paymentStatus || 'UNPAID'];
                            return (
                              <tr key={apt.id} className="hover:bg-slate-50/70">
                                <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                                  {apt.code}
                                </td>
                                <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                                  {apt.timeSlot} · {formatDateVi(apt.date)}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-medium text-slate-900">{apt.patientName}</div>
                                  <div className="text-xs font-mono text-slate-500">{apt.patientPhone}</div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="text-slate-900">{apt.doctorName}</div>
                                  <div className="text-xs text-slate-500">{apt.specialtyName}</div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="font-mono text-xs text-slate-900 tabular-nums">
                                    {formatVnd(apt.servicePriceVnd)}
                                  </div>
                                  <div className={`text-xs font-medium ${payMeta.colorClass}`}>
                                    {payMeta.label}
                                    {apt.paymentMethod ? ` · ${apt.paymentMethod}` : ''}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <StatusText status={apt.status} />
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openPaymentModal(apt)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg"
                                    >
                                      <CreditCard className="w-3.5 h-3.5" />
                                      <span>Thu phí</span>
                                    </button>
                                    <select
                                      value={apt.status}
                                      onChange={async (e) => {
                                        await api.updateAppointmentStatus(
                                          apt.id,
                                          e.target.value as AppointmentStatus,
                                        );
                                        await loadAll();
                                      }}
                                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                                    >
                                      {(Object.keys(APPOINTMENT_STATUS_META) as AppointmentStatus[]).map(
                                        (s) => (
                                          <option key={s} value={s}>
                                            {APPOINTMENT_STATUS_META[s].label}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'catalog' && (
                <div className="grid lg:grid-cols-2 gap-6 items-start">
                  {/* Specialties */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                    <h3 className="text-base font-semibold text-slate-900">Quản lý Chuyên khoa</h3>
                    <form onSubmit={handleCreateSpecialty} className="space-y-3 pb-4 border-b border-slate-200">
                      <div className="grid grid-cols-[1fr_110px] gap-2">
                        <input
                          type="text"
                          required
                          value={specName}
                          onChange={(e) => setSpecName(e.target.value)}
                          placeholder="Tên chuyên khoa (VD: Nội tổng quát)"
                          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                        <input
                          type="text"
                          required
                          value={specRoom}
                          onChange={(e) => setSpecRoom(e.target.value)}
                          placeholder="Phòng (P.108)"
                          className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                      <input
                        type="text"
                        value={specDesc}
                        onChange={(e) => setSpecDesc(e.target.value)}
                        placeholder="Mô tả phạm vi khám bệnh..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm chuyên khoa</span>
                      </button>
                    </form>

                    <div className="divide-y divide-slate-200">
                      {specialties.map((s) => (
                        <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {s.name} · <span className="font-mono text-xs text-slate-500">{s.roomNumber}</span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">{s.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              await api.archiveSpecialty(s.id);
                              onCatalogChanged();
                              await loadAll();
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                            aria-label={`Ẩn chuyên khoa ${s.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Services */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                    <h3 className="text-base font-semibold text-slate-900">Quản lý Dịch vụ & Bảng giá</h3>
                    <form onSubmit={handleCreateService} className="space-y-3 pb-4 border-b border-slate-200">
                      <select
                        value={srvSpecId}
                        onChange={(e) => setSrvSpecId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                      >
                        {specialties.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-[1fr_140px] gap-2">
                        <input
                          type="text"
                          required
                          value={srvName}
                          onChange={(e) => setSrvName(e.target.value)}
                          placeholder="Tên dịch vụ khám"
                          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                        <input
                          type="number"
                          required
                          min={50000}
                          step={10000}
                          value={srvPrice}
                          onChange={(e) => setSrvPrice(e.target.value)}
                          placeholder="Giá (VNĐ)"
                          className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                      <input
                        type="text"
                        value={srvDesc}
                        onChange={(e) => setSrvDesc(e.target.value)}
                        placeholder="Mô tả ngắn dịch vụ..."
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm dịch vụ</span>
                      </button>
                    </form>

                    <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
                      {services.map((srv) => {
                        const spec = specialties.find((s) => s.id === srv.specialtyId);
                        return (
                          <div key={srv.id} className="py-3 flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-slate-900">{srv.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {spec?.name} ·{' '}
                                <span className="font-mono font-semibold text-teal-700 tabular-nums">
                                  {formatVnd(srv.priceVnd)}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await api.archiveService(srv.id);
                                onCatalogChanged();
                                await loadAll();
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600"
                              aria-label={`Ẩn dịch vụ ${srv.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'doctors' && (
                <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
                  <form
                    onSubmit={handleCreateDoctor}
                    className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
                  >
                    <h3 className="text-base font-semibold text-slate-900 pb-2 border-b border-slate-200">
                      Thêm bác sĩ mới
                    </h3>
                    <input
                      type="text"
                      required
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="Họ và tên (VD: BS. CKI Phạm Quốc Bảo)"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <input
                      type="email"
                      required
                      value={docEmail}
                      onChange={(e) => setDocEmail(e.target.value)}
                      placeholder="Email đăng nhập bác sĩ"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="tel"
                        required
                        value={docPhone}
                        onChange={(e) => setDocPhone(e.target.value)}
                        placeholder="Số điện thoại"
                        className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                      <input
                        type="text"
                        value={docRoom}
                        onChange={(e) => setDocRoom(e.target.value)}
                        placeholder="Phòng khám"
                        className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>
                    <select
                      value={docSpecId}
                      onChange={(e) => setDocSpecId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      {specialties.map((s) => (
                        <option key={s.id} value={s.id}>
                          Chuyên khoa: {s.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="Chức danh"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <input
                      type="text"
                      value={docQualifications}
                      onChange={(e) => setDocQualifications(e.target.value)}
                      placeholder="Bằng cấp & chứng chỉ (tùy chọn)"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={docExp}
                        onChange={(e) => setDocExp(e.target.value)}
                        placeholder="Số năm KN"
                        className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                      <input
                        type="number"
                        value={docFee}
                        onChange={(e) => setDocFee(e.target.value)}
                        placeholder="Phí khám (VNĐ)"
                        className="px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                      />
                    </div>

                    {/* Avatar upload on Create Doctor */}
                    <div className="pt-2 border-t border-slate-200 space-y-2.5">
                      <div className="flex items-center gap-3">
                        <DoctorAvatar
                          src={docAvatarUrl}
                          name={docName || 'Bác sĩ mới'}
                          className="w-14 h-14"
                        />
                        <div className="flex-1 space-y-1.5">
                          <label
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                              uploadingCreateAvatar ? 'opacity-60 pointer-events-none' : ''
                            }`}
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingCreateAvatar ? 'Đang tải ảnh...' : 'Tải ảnh đại diện'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingCreateAvatar}
                              onChange={handleCreateAvatarUpload}
                              className="sr-only"
                            />
                          </label>
                          <p className="text-[11px] text-slate-500">
                            Ảnh được lưu trên Cloudinary dưới dạng liên kết URL.
                          </p>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={docAvatarUrl}
                        onChange={(e) => setDocAvatarUrl(e.target.value)}
                        placeholder="Hoặc dán URL ảnh đại diện (https://...)"
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={uploadingCreateAvatar}
                      className="w-full py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg"
                    >
                      Tạo hồ sơ bác sĩ
                    </button>
                  </form>

                  <div className="grid sm:grid-cols-2 gap-4">
                    {doctors.map((doc) => {
                      const spec = specialties.find((s) => s.id === doc.specialtyId);
                      const linkedUser = users.find((u) => u.id === doc.userId);
                      return (
                        <div
                          key={doc.id}
                          className={`bg-white border rounded-xl p-4 flex gap-4 items-start ${
                            doc.active ? 'border-slate-200' : 'border-slate-200 opacity-75'
                          }`}
                        >
                          <DoctorAvatar src={doc.avatarUrl} name={doc.fullName} className="w-16 h-16" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="text-sm font-semibold text-slate-900">{doc.fullName}</h4>
                              <button
                                type="button"
                                onClick={() => openEditDoctor(doc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Sửa</span>
                              </button>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {spec?.name} · {doc.experienceYears} năm KN
                              {!doc.active && ' · Tạm ngưng'}
                            </div>
                            {linkedUser && (
                              <div className="text-xs font-mono text-slate-500 mt-0.5 truncate">
                                {linkedUser.phone} · {linkedUser.email}
                              </div>
                            )}
                            <div className="text-xs font-mono text-teal-700 mt-1.5 tabular-nums">
                              {formatVnd(doc.consultationFeeVnd)} · {doc.roomNumber}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === 'users' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                          <th className="py-3 px-4">Họ tên</th>
                          <th className="py-3 px-4">Email & SĐT</th>
                          <th className="py-3 px-4">Vai trò</th>
                          <th className="py-3 px-4">Trạng thái</th>
                          <th className="py-3 px-4 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td className="py-3 px-4 font-medium text-slate-900">{u.fullName}</td>
                            <td className="py-3 px-4">
                              <div className="font-mono text-xs text-slate-700">{u.email}</div>
                              <div className="font-mono text-xs text-slate-500">{u.phone}</div>
                            </td>
                            <td className="py-3 px-4">
                              <select
                                value={u.role}
                                disabled={u.id === user.id}
                                onChange={async (e) => {
                                  await api.updateAdminUser(u.id, {
                                    role: e.target.value as UserRole,
                                  });
                                  await loadAll();
                                }}
                                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white disabled:opacity-60"
                              >
                                {(['PATIENT', 'DOCTOR', 'ADMIN'] as UserRole[]).map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-3 px-4 text-xs font-medium">
                              <span className={u.active ? 'text-emerald-700' : 'text-rose-700'}>
                                {u.active ? 'Đang hoạt động' : 'Đã khóa'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {u.id !== user.id && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await api.updateAdminUser(u.id, { active: !u.active });
                                    await loadAll();
                                  }}
                                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                                >
                                  {u.active ? 'Khóa tài khoản' : 'Mở khóa'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === 'audit' && (
                <div className="space-y-6">
                  <div className="grid lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
                      <div className="max-w-sm">
                        <h3 className="text-base font-semibold text-slate-900">
                          Sao lưu cơ sở dữ liệu (NFR06)
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Xuất toàn bộ dữ liệu bệnh nhân, bác sĩ, lịch hẹn, hồ sơ bệnh án và nhật ký kiểm toán dưới dạng JSON.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleCreateBackup}
                        disabled={backingUp}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                      >
                        <DatabaseBackup className="w-4 h-4" />
                        <span>{backingUp ? 'Đang tạo...' : 'Tạo & Tải bản sao lưu'}</span>
                      </button>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
                      <div className="max-w-sm">
                        <h3 className="text-base font-semibold text-slate-900">
                          Nhắc lịch khám tự động (24h)
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Gửi thông báo trong cổng bệnh nhân và email SMTP (nếu đã cấu hình) cho các lịch CONFIRMED trong 24 giờ tới.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDispatchReminders}
                        disabled={sendingReminders}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg whitespace-nowrap"
                      >
                        <BellRing className="w-4 h-4" />
                        <span>{sendingReminders ? 'Đang gửi...' : 'Gửi nhắc lịch 24h'}</span>
                      </button>
                    </div>
                  </div>

                  {backups.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <h4 className="text-xs font-semibold text-slate-600 mb-3">
                        Lịch sử các bản sao lưu gần đây
                      </h4>
                      <div className="divide-y divide-slate-200 text-xs">
                        {backups.map((b) => (
                          <div key={b.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono font-medium text-slate-900">{b.filename}</span>
                            <span className="font-mono text-slate-500 tabular-nums">
                              {(b.sizeBytes / 1024).toFixed(1)} KB · {b.createdBy} · {formatDateTimeVi(b.createdAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <ShieldAlert className="w-4 h-4 text-teal-700" />
                      <span>Nhật ký hoạt động hệ thống (NFR08)</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/50">
                            <th className="py-2.5 px-4">Thời gian</th>
                            <th className="py-2.5 px-4">Người thực hiện</th>
                            <th className="py-2.5 px-4">Hành động</th>
                            <th className="py-2.5 px-4">Chi tiết</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {logs.map((log) => (
                            <tr key={log.id}>
                              <td className="py-2.5 px-4 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                                {formatDateTimeVi(log.timestamp)}
                              </td>
                              <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                                {log.actorName} · <span className="text-slate-500">{log.actorRole}</span>
                              </td>
                              <td className="py-2.5 px-4 font-mono text-teal-800 whitespace-nowrap">
                                {log.action}
                              </td>
                              <td className="py-2.5 px-4 text-slate-700">{log.detail}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Edit Doctor Modal */}
      {editingDoctor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEditDoctor}
            className="w-full max-w-xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-semibold text-slate-900">
                Chỉnh sửa thông tin bác sĩ
              </h3>
              <button
                type="button"
                onClick={() => setEditingDoctor(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Avatar editor inside Admin Edit Doctor modal */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-200">
                <DoctorAvatar
                  src={editDocAvatarUrl}
                  name={editDocName || editingDoctor.fullName}
                  className="w-20 h-20"
                />
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                        uploadingEditAvatar ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {uploadingEditAvatar ? 'Đang tải ảnh lên...' : 'Tải ảnh đại diện mới'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingEditAvatar}
                        onChange={handleEditAvatarUpload}
                        className="sr-only"
                      />
                    </label>
                    {editDocAvatarUrl !== editingDoctor.avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setEditDocAvatarUrl(editingDoctor.avatarUrl)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Hoàn tác ảnh</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editDocAvatarUrl}
                    onChange={(e) => setEditDocAvatarUrl(e.target.value)}
                    placeholder="Liên kết URL ảnh đại diện (Cloudinary hoặc /src/...)"
                    className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Họ và tên bác sĩ
                  </label>
                  <input
                    type="text"
                    required
                    value={editDocName}
                    onChange={(e) => setEditDocName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    required
                    value={editDocPhone}
                    onChange={(e) => setEditDocPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Chuyên khoa phụ trách
                  </label>
                  <select
                    value={editDocSpecId}
                    onChange={(e) => setEditDocSpecId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {specialties.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Chức danh
                  </label>
                  <input
                    type="text"
                    required
                    value={editDocTitle}
                    onChange={(e) => setEditDocTitle(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Số năm kinh nghiệm
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editDocExp}
                    onChange={(e) => setEditDocExp(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phí khám (VNĐ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10000}
                    required
                    value={editDocFee}
                    onChange={(e) => setEditDocFee(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phòng khám
                  </label>
                  <input
                    type="text"
                    required
                    value={editDocRoom}
                    onChange={(e) => setEditDocRoom(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editDocActive}
                      onChange={(e) => setEditDocActive(e.target.checked)}
                      className="w-4 h-4 accent-teal-700"
                    />
                    <span>Hiển thị tiếp nhận đặt lịch</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email liên hệ & Bằng cấp chuyên môn
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <input
                    type="email"
                    value={editDocEmail}
                    onChange={(e) => setEditDocEmail(e.target.value)}
                    placeholder="Email liên hệ"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                  <input
                    type="text"
                    value={editDocQualifications}
                    onChange={(e) => setEditDocQualifications(e.target.value)}
                    placeholder="Bằng cấp & chứng chỉ"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Giới thiệu chuyên môn
                </label>
                <textarea
                  rows={3}
                  value={editDocBio}
                  onChange={(e) => setEditDocBio(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingDoctor(null)}
                className="px-4 py-2 text-sm text-slate-700 bg-white border border-slate-200 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingEditDoctor || uploadingEditAvatar}
                className="px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg"
              >
                {savingEditDoctor ? 'Đang lưu...' : 'Lưu cập nhật'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Payment Update Modal */}
      {paymentTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSavePayment}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Xác nhận thanh toán · {paymentTarget.code}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {paymentTarget.patientName} · {formatVnd(paymentTarget.servicePriceVnd)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {payVietQrUrl && (
                <div className="flex flex-col items-center p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <img
                    src={payVietQrUrl}
                    alt={`VietQR ${paymentTarget.code}`}
                    className="w-40 h-40 bg-white p-1.5 rounded border border-slate-200"
                  />
                  <span className="text-[11px] font-mono text-slate-600 mt-1.5">
                    ND: TT {paymentTarget.code}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Trạng thái thanh toán
                </label>
                <select
                  value={payStatus}
                  onChange={(e) => setPayStatus(e.target.value as PaymentStatus)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {(Object.keys(PAYMENT_STATUS_META) as PaymentStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {PAYMENT_STATUS_META[st].label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Phương thức thanh toán
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingPayment}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg"
              >
                {savingPayment ? 'Đang lưu...' : 'Lưu thanh toán'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        onSuccess={(msg) => setFeedback(msg)}
      />
    </div>
  );
}
