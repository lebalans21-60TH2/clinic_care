import { ArrowLeft, Calendar, Check, Clock, Download, Printer, QrCode, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, formatDateVi, formatVnd } from '../lib/api';
import type {
  Appointment,
  DoctorProfile,
  ServiceItem,
  Specialty,
  TimeSlotAvailability,
  User,
} from '../types/clinic';
import { DoctorAvatar } from './DoctorAvatar';
import { StatusText } from './StatusText';

interface BookingWizardProps {
  user: User | null;
  specialties: Specialty[];
  doctors: DoctorProfile[];
  services: ServiceItem[];
  preselectedDoctorId?: string | null;
  preselectedSpecialtyId?: string | null;
  preselectedDate?: string | null;
  onRequireAuth: () => void;
  onBooked: (appointment: Appointment) => void;
  onCancelFlow: () => void;
}

function getDefaultDate(preselected?: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (preselected && preselected >= today) {
    return preselected;
  }
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function BookingWizard({
  user,
  specialties,
  doctors,
  services,
  preselectedDoctorId,
  preselectedSpecialtyId,
  preselectedDate,
  onRequireAuth,
  onBooked,
  onCancelFlow,
}: BookingWizardProps) {
  const initialDoctor = preselectedDoctorId
    ? doctors.find((d) => d.id === preselectedDoctorId)
    : undefined;
  const initialSpecId =
    initialDoctor?.specialtyId || preselectedSpecialtyId || specialties[0]?.id || '';

  const [step, setStep] = useState<number>(initialDoctor ? 3 : 1);
  const [specialtyId, setSpecialtyId] = useState<string>(initialSpecId);
  const [serviceId, setServiceId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>(initialDoctor?.id || '');
  const [date, setDate] = useState<string>(getDefaultDate(preselectedDate));
  const [slots, setSlots] = useState<TimeSlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [timeSlot, setTimeSlot] = useState<string>('');
  const [symptoms, setSymptoms] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAppointment, setCreatedAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    if (preselectedDoctorId) {
      const doc = doctors.find((d) => d.id === preselectedDoctorId);
      if (doc) {
        setDoctorId(doc.id);
        setSpecialtyId(doc.specialtyId);
        setStep(3);
      }
    } else if (preselectedSpecialtyId) {
      setSpecialtyId(preselectedSpecialtyId);
      setStep(1);
    }
    if (preselectedDate) {
      setDate(getDefaultDate(preselectedDate));
    }
  }, [preselectedDoctorId, preselectedSpecialtyId, preselectedDate, doctors]);

  const filteredServices = services.filter((s) => s.specialtyId === specialtyId);
  const filteredDoctors = doctors.filter((d) => d.specialtyId === specialtyId);
  const selectedSpecialty = specialties.find((s) => s.id === specialtyId);
  const selectedDoctor = doctors.find((d) => d.id === doctorId);
  const selectedService =
    services.find((s) => s.id === serviceId) || filteredServices[0] || undefined;

  useEffect(() => {
    if (filteredServices.length > 0 && !filteredServices.some((s) => s.id === serviceId)) {
      setServiceId(filteredServices[0].id);
    }
  }, [specialtyId, filteredServices, serviceId]);

  useEffect(() => {
    if (!doctorId || !date) {
      setSlots([]);
      return;
    }
    let active = true;
    setLoadingSlots(true);
    setTimeSlot('');
    api
      .getAvailableSlots(doctorId, date)
      .then((res) => {
        if (active) setSlots(res.slots);
      })
      .catch(() => {
        if (active) setSlots([]);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [doctorId, date]);

  const handleConfirmBooking = async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.createAppointment({
        specialtyId,
        doctorId,
        serviceId: selectedService?.id,
        date,
        timeSlot,
        symptoms,
      });
      setCreatedAppointment(res.appointment);
      onBooked(res.appointment);
    } catch (err) {
      setError((err as Error).message);
      // Re-fetch slots in case of 409 conflict
      if (doctorId && date) {
        const refreshed = await api.getAvailableSlots(doctorId, date).catch(() => null);
        if (refreshed) setSlots(refreshed.slots);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadQr = () => {
    if (!createdAppointment) return;
    const link = document.createElement('a');
    link.href = createdAppointment.qrCodeDataUrl;
    link.download = `ClinicCare-${createdAppointment.code}.png`;
    link.click();
  };

  if (createdAppointment) {
    return (
      <div
        id="printable-clinic-sheet"
        className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-6 md:p-8"
      >
        <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <p className="text-xs font-medium text-teal-700 mb-1">Xác nhận đặt lịch thành công</p>
            <h2 className="text-2xl font-semibold text-slate-900">
              Phiếu hẹn khám bệnh {createdAppointment.code}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Xuất trình mã QR bên dưới tại quầy lễ tân khi đến phòng khám.
            </p>
          </div>
          <StatusText status={createdAppointment.status} />
        </div>

        <div className="grid md:grid-cols-[220px_1fr] gap-6 py-6 items-center">
          <div className="flex flex-col items-center p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <img
              src={createdAppointment.qrCodeDataUrl}
              alt={`Mã QR lịch hẹn ${createdAppointment.code}`}
              className="w-44 h-44 bg-white p-2 rounded-lg border border-slate-200"
            />
            <span className="mt-2 font-mono text-xs font-semibold text-slate-700 tabular-nums">
              {createdAppointment.code}
            </span>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
              <dt className="text-slate-500">Bệnh nhân</dt>
              <dd className="font-medium text-slate-900 text-right">{createdAppointment.patientName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
              <dt className="text-slate-500">Chuyên khoa</dt>
              <dd className="font-medium text-slate-900 text-right">{createdAppointment.specialtyName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
              <dt className="text-slate-500">Bác sĩ phụ trách</dt>
              <dd className="font-medium text-slate-900 text-right">{createdAppointment.doctorName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
              <dt className="text-slate-500">Thời gian khám</dt>
              <dd className="font-mono font-medium text-slate-900 tabular-nums text-right">
                {createdAppointment.timeSlot} · {formatDateVi(createdAppointment.date)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100">
              <dt className="text-slate-500">Dịch vụ & phí dự kiến</dt>
              <dd className="font-mono font-medium text-teal-700 tabular-nums text-right">
                {formatVnd(createdAppointment.servicePriceVnd)}
              </dd>
            </div>
            <div className="pt-1">
              <dt className="text-slate-500 mb-1">Triệu chứng ban đầu</dt>
              <dd className="text-slate-800 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs leading-relaxed">
                {createdAppointment.symptoms}
              </dd>
            </div>
          </dl>
        </div>

        <div className="no-print flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadQr}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Tải mã QR (PNG)</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>In phiếu hẹn</span>
            </button>
          </div>
          <button
            type="button"
            onClick={onCancelFlow}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <QrCode className="w-4 h-4" />
            <span>Xem lịch hẹn của tôi</span>
          </button>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, title: 'Chuyên khoa' },
    { num: 2, title: 'Bác sĩ' },
    { num: 3, title: 'Ngày & Giờ' },
    { num: 4, title: 'Triệu chứng & Xác nhận' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onCancelFlow}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Quay lại</span>
        </button>

        {!user && (
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-4 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 whitespace-nowrap"
          >
            Đăng nhập để hoàn tất đặt lịch
          </button>
        )}
      </div>

      {/* Stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {steps.map((s) => {
            const active = step === s.num;
            const done = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                disabled={s.num > step}
                onClick={() => s.num < step && setStep(s.num)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                  active
                    ? 'bg-teal-700 text-white'
                    : done
                      ? 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                      : 'bg-slate-50 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono font-semibold border border-current/20 shrink-0">
                  {done ? <Check className="w-3.5 h-3.5" /> : s.num}
                </span>
                <span className="text-xs font-medium whitespace-nowrap truncate">{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-6">
        {error && (
          <div className="p-3.5 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Bước 1: Chọn chuyên khoa & dịch vụ</h2>
              <p className="text-sm text-slate-600 mt-1">
                Lựa chọn chuyên khoa phù hợp với nhu cầu thăm khám của bạn.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {specialties.map((spec) => {
                const selected = spec.id === specialtyId;
                return (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => {
                      setSpecialtyId(spec.id);
                      setDoctorId('');
                    }}
                    className={`p-4 text-left rounded-xl border transition-colors ${
                      selected
                        ? 'border-teal-700 bg-teal-50/60'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold text-slate-900">{spec.name}</span>
                      <span className="text-xs font-mono text-slate-500">{spec.roomNumber}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{spec.description}</p>
                  </button>
                );
              })}
            </div>

            {filteredServices.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <label className="block text-sm font-medium text-slate-800">
                  Dịch vụ khám dự kiến ({selectedSpecialty?.name})
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  {filteredServices.map((srv) => {
                    const selected = srv.id === selectedService?.id;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => setServiceId(srv.id)}
                        className={`p-3.5 text-left rounded-lg border transition-colors ${
                          selected
                            ? 'border-teal-700 bg-teal-50/50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-sm font-medium text-slate-900">{srv.name}</span>
                          <span className="text-xs font-mono font-semibold text-teal-700 tabular-nums whitespace-nowrap">
                            {formatVnd(srv.priceVnd)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Thời lượng {srv.durationMinutes} phút · {srv.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={!specialtyId}
                onClick={() => setStep(2)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                Tiếp tục chọn bác sĩ
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Bước 2: Chọn bác sĩ chuyên khoa {selectedSpecialty?.name}
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Chọn bác sĩ phụ trách thăm khám trực tiếp cho bạn.
              </p>
            </div>

            {filteredDoctors.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                Hiện chưa có bác sĩ hoạt động trong chuyên khoa này.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {filteredDoctors.map((doc) => {
                  const selected = doc.id === doctorId;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setDoctorId(doc.id)}
                      className={`p-4 text-left rounded-xl border transition-colors flex gap-4 items-start ${
                        selected
                          ? 'border-teal-700 bg-teal-50/60'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <DoctorAvatar src={doc.avatarUrl} name={doc.fullName} className="w-16 h-16" />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-slate-900">{doc.fullName}</h3>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {doc.title} · {doc.experienceYears} năm kinh nghiệm · ★ {doc.rating.toFixed(1)}
                        </div>
                        <p className="text-xs text-slate-600 mt-2 line-clamp-2">{doc.bio}</p>
                        <div className="mt-2.5 text-xs font-mono font-medium text-teal-700 tabular-nums">
                          {formatVnd(doc.consultationFeeVnd)} · Phòng {doc.roomNumber}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={!doctorId}
                onClick={() => setStep(3)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
              >
                Chọn ngày & khung giờ
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Bước 3: Chọn ngày khám & khung giờ</h2>
              <p className="text-sm text-slate-600 mt-1">
                Bác sĩ phụ trách: <strong className="text-slate-900">{selectedDoctor?.fullName}</strong> · Phòng{' '}
                {selectedDoctor?.roomNumber}
              </p>
            </div>

            <div className="grid md:grid-cols-[260px_1fr] gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Ngày đến khám
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Hệ thống tự động kiểm tra ca làm việc và loại trừ các khung giờ đã có bệnh nhân đặt.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-700">
                    Khung giờ khám ngày {formatDateVi(date)}
                  </span>
                  <span className="text-xs text-slate-500">Mỗi lượt 30 phút</span>
                </div>

                {loadingSlots ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : slots.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                    Bác sĩ không có lịch làm việc vào ngày {formatDateVi(date)}. Vui lòng chọn ngày khác.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {slots.map((slot) => {
                      const active = slot.time === timeSlot;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => setTimeSlot(slot.time)}
                          title={slot.reason || 'Còn trống'}
                          className={`py-2.5 px-3 rounded-lg text-sm font-mono tabular-nums border transition-colors flex items-center justify-center gap-1.5 ${
                            !slot.available
                              ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                              : active
                                ? 'bg-teal-700 text-white border-teal-700 font-medium'
                                : 'bg-white text-slate-800 border-slate-200 hover:border-teal-600'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{slot.time}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={!timeSlot}
                onClick={() => setStep(4)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg whitespace-nowrap"
              >
                Nhập triệu chứng & Xác nhận
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Bước 4: Lý do khám & Xác nhận đặt lịch
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Mô tả ngắn triệu chứng để bác sĩ chuẩn bị trước khi tiếp nhận.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  Lý do khám / Triệu chứng ban đầu
                </label>
                <textarea
                  rows={5}
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                  placeholder="Ví dụ: Đau họng, ho khan 3 ngày nay, sốt nhẹ về chiều..."
                  className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                {!user && (
                  <div className="mt-3 p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between gap-3">
                    <span>Bạn cần đăng nhập tài khoản bệnh nhân để hoàn tất lưu lịch hẹn.</span>
                    <button
                      type="button"
                      onClick={onRequireAuth}
                      className="px-3 py-1.5 font-medium bg-amber-700 text-white rounded-md whitespace-nowrap"
                    >
                      Đăng nhập ngay
                    </button>
                  </div>
                )}
              </div>

              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-sm">
                <div className="flex items-center gap-2 text-slate-900 font-semibold pb-2 border-b border-slate-200">
                  <ShieldCheck className="w-4 h-4 text-teal-700" />
                  <span>Tóm tắt lịch hẹn</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Bệnh nhân</span>
                  <span className="font-medium text-slate-900">{user ? user.fullName : 'Chưa đăng nhập'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Chuyên khoa</span>
                  <span className="font-medium text-slate-900">{selectedSpecialty?.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Bác sĩ</span>
                  <span className="font-medium text-slate-900">{selectedDoctor?.fullName}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Dịch vụ</span>
                  <span className="font-medium text-slate-900 text-right">{selectedService?.name}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Ngày & Giờ</span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {timeSlot} · {formatDateVi(date)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 pt-2 border-t border-slate-200">
                  <span className="text-slate-700 font-medium">Chi phí dự kiến</span>
                  <span className="font-mono font-semibold text-teal-700 tabular-nums">
                    {formatVnd(selectedService?.priceVnd ?? selectedDoctor?.consultationFeeVnd ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
              >
                Đổi khung giờ
              </button>
              <button
                type="button"
                disabled={submitting || !symptoms.trim()}
                onClick={handleConfirmBooking}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {submitting
                  ? 'Đang kiểm tra khung giờ & tạo QR...'
                  : user
                    ? 'Xác nhận đặt lịch & Nhận mã QR'
                    : 'Đăng nhập để xác nhận'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
