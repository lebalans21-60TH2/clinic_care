import { ArrowRight, Calendar, LogOut, Search, ShieldCheck, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { AiChatbot } from './components/AiChatbot';
import { AuthModal } from './components/AuthModal';
import { BookingWizard } from './components/BookingWizard';
import { DoctorAvatar } from './components/DoctorAvatar';
import { DoctorWorkspace } from './components/DoctorWorkspace';
import { PatientPortal } from './components/PatientPortal';
import { WorkloadDashboard } from './components/WorkloadDashboard';
import { api, formatDateTimeVi, formatVnd, getStoredToken, setStoredToken } from './lib/api';
import type { DoctorProfile, DoctorReview, ServiceItem, Specialty, User } from './types/clinic';

type ActiveView = 'home' | 'booking' | 'workspace';

export default function App() {
  const [view, setView] = useState<ActiveView>('home');
  const [user, setUser] = useState<User | null>(null);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Filters on Home Directory
  const [selectedSpecFilter, setSelectedSpecFilter] = useState<string>('ALL');
  const [doctorSearch, setDoctorSearch] = useState('');

  // Preselection for Booking Wizard
  const [preselectedDoctorId, setPreselectedDoctorId] = useState<string | null>(null);
  const [preselectedSpecId, setPreselectedSpecId] = useState<string | null>(null);
  const [preselectedDate, setPreselectedDate] = useState<string | null>(null);
  const [workloadRefreshKey, setWorkloadRefreshKey] = useState(0);

  // Doctor Reviews modal
  const [reviewDoctor, setReviewDoctor] = useState<DoctorProfile | null>(null);
  const [doctorReviews, setDoctorReviews] = useState<DoctorReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const loadOverview = async () => {
    setLoadingCatalog(true);
    try {
      const data = await api.getPublicOverview();
      setSpecialties(data.specialties);
      setDoctors(data.doctors);
      setServices(data.services);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadOverview();
    const token = getStoredToken();
    if (token) {
      api
        .getMe()
        .then((res) => {
          setUser(res.user);
          setDoctorProfile(res.doctorProfile);
        })
        .catch(() => {
          setStoredToken(null);
        });
    }
  }, []);

  const handleLogout = () => {
    setStoredToken(null);
    setUser(null);
    setDoctorProfile(null);
    setView('home');
  };

  const handleOpenBooking = (doctorId?: string, specialtyId?: string, dateIso?: string) => {
    setPreselectedDoctorId(doctorId || null);
    setPreselectedSpecId(specialtyId || null);
    setPreselectedDate(dateIso || null);
    setView('booking');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDoctorReviews = async (doc: DoctorProfile) => {
    setReviewDoctor(doc);
    setLoadingReviews(true);
    try {
      const res = await api.getDoctorReviews(doc.id);
      setDoctorReviews(res.reviews);
    } catch {
      setDoctorReviews([]);
    } finally {
      setLoadingReviews(false);
    }
  };

  const filteredDoctors = doctors.filter((doc) => {
    const matchSpec = selectedSpecFilter === 'ALL' || doc.specialtyId === selectedSpecFilter;
    const q = doctorSearch.trim().toLowerCase();
    const specName = specialties.find((s) => s.id === doc.specialtyId)?.name.toLowerCase() || '';
    const matchQuery =
      !q ||
      doc.fullName.toLowerCase().includes(q) ||
      doc.title.toLowerCase().includes(q) ||
      specName.includes(q);
    return matchSpec && matchQuery;
  });

  // Render full-screen role dashboards when active
  if (view === 'workspace' && user) {
    if (user.role === 'ADMIN') {
      return (
        <AdminDashboard
          user={user}
          onLogout={handleLogout}
          onBackToPortal={() => {
            setWorkloadRefreshKey((k) => k + 1);
            setView('home');
          }}
          onCatalogChanged={loadOverview}
        />
      );
    }
    if (user.role === 'DOCTOR' && doctorProfile) {
      return (
        <DoctorWorkspace
          user={user}
          doctorProfile={doctorProfile}
          onLogout={handleLogout}
          onBackToPortal={() => {
            setWorkloadRefreshKey((k) => k + 1);
            setView('home');
          }}
          onProfileUpdated={(updatedUser, updatedDoctor) => {
            setUser(updatedUser);
            setDoctorProfile(updatedDoctor);
            loadOverview();
          }}
        />
      );
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setView('home')}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ClinicCare
          </button>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#trang-chu"
              onClick={(e) => {
                e.preventDefault();
                setView('home');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Trang chủ
            </a>
            <a
              href="#thong-ke-lich-hen"
              onClick={() => setView('home')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Thống kê
            </a>
            <a
              href="#chuyen-khoa"
              onClick={() => setView('home')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Chuyên khoa
            </a>
            <a
              href="#bac-si"
              onClick={() => setView('home')}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Đội ngũ bác sĩ
            </a>
            <button
              type="button"
              onClick={() => handleOpenBooking()}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Đặt lịch khám
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-3 shrink-0">
            {!user ? (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Đăng nhập
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setView('workspace')}
                  className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {user.role === 'ADMIN'
                    ? 'Trang Quản trị'
                    : user.role === 'DOCTOR'
                      ? 'Trang Bác sĩ'
                      : 'Hồ sơ của tôi'}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 text-slate-500 hover:text-slate-900 rounded-lg transition-colors"
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {view === 'booking' && (
          <section className="max-w-6xl mx-auto px-6 py-8">
            <BookingWizard
              user={user}
              specialties={specialties}
              doctors={doctors}
              services={services}
              preselectedDoctorId={preselectedDoctorId}
              preselectedSpecialtyId={preselectedSpecId}
              preselectedDate={preselectedDate}
              onRequireAuth={() => setAuthModalOpen(true)}
              onBooked={() => {
                // Booking saved, ticket visible inside wizard
                setWorkloadRefreshKey((k) => k + 1);
              }}
              onCancelFlow={() => {
                if (user) {
                  setView('workspace');
                } else {
                  setView('home');
                }
              }}
            />
          </section>
        )}

        {view === 'workspace' && user && user.role === 'PATIENT' && (
          <section className="max-w-6xl mx-auto px-6 py-8">
            <PatientPortal
              user={user}
              onUserUpdated={(updated) => setUser(updated)}
              onStartNewBooking={() => handleOpenBooking()}
              onStartFollowUpBooking={(doctorId, followUpDate) =>
                handleOpenBooking(doctorId, undefined, followUpDate)
              }
              onReviewSubmitted={() => loadOverview()}
            />
          </section>
        )}

        {view === 'home' && (
          <>
            {/* Hero Section */}
            <section id="trang-chu" className="bg-white border-b border-slate-200">
              <div className="max-w-6xl mx-auto px-6 py-12 lg:py-16 grid lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                  <p className="text-xs font-medium text-teal-700">
                    Phòng khám Đa khoa Tư nhân ClinicCare · TP. Hồ Chí Minh
                  </p>
                  <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.12] [text-wrap:balance]">
                    Đặt lịch khám đúng chuyên khoa, chủ động thời gian
                  </h1>
                  <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                    Chọn bác sĩ theo khung giờ thực tế, nhận mã QR tiếp nhận nhanh tại quầy và theo
                    dõi hồ sơ bệnh án điện tử bảo mật sau mỗi lần thăm khám.
                  </p>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenBooking()}
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Đặt lịch khám ngay</span>
                    </button>
                    <a
                      href="#bac-si"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
                    >
                      <span>Tìm bác sĩ chuyên khoa</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    {!heroImgFailed ? (
                      <img
                        src="/src/assets/images/clinic_hero_lobby_1795142595380.jpg"
                        alt="Không gian sảnh tiếp đón hiện đại tại Phòng khám ClinicCare"
                        referrerPolicy="no-referrer"
                        onError={() => setHeroImgFailed(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                        <ShieldCheck className="w-10 h-10 text-teal-700 mb-3" />
                        <span className="text-sm font-medium text-slate-700">
                          Không gian thăm khám tiêu chuẩn y khoa ClinicCare
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 4-column clinic strip below hero */}
              <div className="border-t border-slate-200 bg-slate-50">
                <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                      {specialties.length || 4} Chuyên khoa
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Tim mạch · Nhi · Da liễu · Tai Mũi Họng
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                      30 Phút / Lượt
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Khung giờ riêng biệt, không đặt trùng lịch
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                      Mã QR Check-in
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Cấp tự động ngay khi xác nhận lịch hẹn
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-xl font-semibold text-slate-900 tabular-nums">
                      Bảo mật bệnh án
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Phân quyền bác sĩ phụ trách & ghi nhật ký
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Workload Dashboard with Recharts */}
            <WorkloadDashboard
              doctors={doctors}
              loggedInDoctorId={doctorProfile?.id}
              refreshKey={workloadRefreshKey}
              onOpenDoctorWorkspace={() => setView('workspace')}
            />

            {/* Section 01: Chuyên khoa & Bảng giá dịch vụ */}
            <section id="chuyen-khoa" className="max-w-6xl mx-auto px-6 py-14 space-y-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    Chuyên khoa & Dịch vụ khám bệnh
                  </h2>
                  <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
                    Chi phí khám niêm yết minh bạch theo từng chuyên khoa và dịch vụ kỹ thuật.
                  </p>
                </div>
              </div>

              {loadingCatalog ? (
                <div className="grid md:grid-cols-2 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  {specialties.map((spec, idx) => {
                    const specServices = services.filter((s) => s.specialtyId === spec.id);
                    return (
                      <div
                        key={spec.id}
                        className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-slate-900">
                              0{idx + 1}. {spec.name}
                            </h3>
                            <span className="font-mono text-xs text-slate-500">
                              Phòng {spec.roomNumber}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                            {spec.description}
                          </p>
                        </div>

                        {specServices.length > 0 && (
                          <div className="pt-3 border-t border-slate-100 space-y-2">
                            {specServices.map((srv) => (
                              <div
                                key={srv.id}
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <span className="text-slate-700">{srv.name}</span>
                                <span className="font-mono font-semibold text-teal-700 tabular-nums whitespace-nowrap">
                                  {formatVnd(srv.priceVnd)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenBooking(undefined, spec.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800"
                          >
                            <span>Đặt lịch khoa {spec.name}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 02: Đội ngũ bác sĩ */}
            <section id="bac-si" className="bg-white border-y border-slate-200">
              <div className="max-w-6xl mx-auto px-6 py-14 space-y-8">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                      Đội ngũ bác sĩ chuyên khoa
                    </h2>
                    <p className="text-sm text-slate-600 mt-1.5">
                      Tìm kiếm bác sĩ theo tên hoặc chuyên khoa để xem lịch trống và đặt hẹn trực tiếp.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={doctorSearch}
                      onChange={(e) => setDoctorSearch(e.target.value)}
                      placeholder="Tìm tên bác sĩ, chuyên khoa..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                {/* Specialty Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                  <button
                    type="button"
                    onClick={() => setSelectedSpecFilter('ALL')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      selectedSpecFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tất cả chuyên khoa
                  </button>
                  {specialties.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSpecFilter(s.id)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                        selectedSpecFilter === s.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                {filteredDoctors.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                    Không tìm thấy bác sĩ phù hợp với từ khóa "{doctorSearch}".
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-6">
                    {filteredDoctors.map((doc) => {
                      const spec = specialties.find((s) => s.id === doc.specialtyId);
                      return (
                        <article
                          key={doc.id}
                          className="border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row gap-5 items-start bg-white"
                        >
                          <DoctorAvatar
                            src={doc.avatarUrl}
                            name={doc.fullName}
                            className="w-24 h-24"
                          />
                          <div className="flex-1 min-w-0 space-y-2">
                            <div>
                              <h3 className="text-base font-semibold text-slate-900">{doc.fullName}</h3>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {spec?.name} · {doc.title} · {doc.experienceYears} năm kinh nghiệm
                              </p>
                              {doc.qualifications && (
                                <p className="text-xs text-teal-800 mt-1">{doc.qualifications}</p>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 leading-relaxed">{doc.bio}</p>
                            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                              <div className="space-y-0.5">
                                <div className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                                  Phí khám {formatVnd(doc.consultationFeeVnd)} · {doc.roomNumber}
                                </div>
                                <div className="text-xs text-slate-500">
                                  <span className="font-mono font-semibold text-amber-600 tabular-nums">
                                    ★ {doc.rating.toFixed(1)}
                                  </span>
                                  <span className="mx-1.5">·</span>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDoctorReviews(doc)}
                                    className="text-teal-700 hover:underline font-medium"
                                  >
                                    {doc.reviewCount ?? 0} đánh giá từ bệnh nhân
                                  </button>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenBooking(doc.id, doc.specialtyId)}
                                className="px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                              >
                                Đặt lịch khám
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            {/* Section 03: Quy trình đặt lịch & Check-in QR */}
            <section className="max-w-6xl mx-auto px-6 py-14 space-y-8">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  Quy trình thăm khám chuẩn hóa
                </h2>
                <p className="text-sm text-slate-600 mt-1.5">
                  Từ bước chọn khung giờ trực tuyến đến khi nhận hồ sơ bệnh án điện tử.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    step: '01',
                    title: 'Chọn khoa & bác sĩ',
                    desc: 'Tra cứu thông tin chuyên môn và bảng giá công khai trước khi đặt.',
                  },
                  {
                    step: '02',
                    title: 'Khóa khung giờ trống',
                    desc: 'Kiểm tra lịch rảnh theo thời gian thực, ngăn chặn đặt trùng giờ.',
                  },
                  {
                    step: '03',
                    title: 'Nhận mã QR Check-in',
                    desc: 'Xuất trình mã QR tại quầy lễ tân để xác nhận có mặt trong 5 giây.',
                  },
                  {
                    step: '04',
                    title: 'Lưu bệnh án điện tử',
                    desc: 'Xem lại đơn thuốc, sinh hiệu và lịch tái khám mọi lúc trên cổng cá nhân.',
                  },
                ].map((item) => (
                  <div key={item.step} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                    <span className="font-mono text-xs font-semibold text-teal-700">{item.step}</span>
                    <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span className="font-display font-semibold text-slate-900">ClinicCare</span>
            <span className="mx-2">·</span>
            <span>Hệ thống đặt lịch khám & quản lý phòng khám tư nhân</span>
          </div>
          <div className="font-mono tabular-nums">
            Thứ 2 – Thứ 7: 08:00 – 17:00 · Hotline: 1900 6868
          </div>
        </div>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(loggedUser, docProf) => {
          setUser(loggedUser);
          setDoctorProfile(docProf);
          if (view !== 'booking') {
            setView('workspace');
          }
        }}
      />

      {/* Doctor Reviews Modal */}
      {reviewDoctor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Đánh giá về {reviewDoctor.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Điểm trung bình {reviewDoctor.rating.toFixed(1)}/5 · {doctorReviews.length} nhận
                  xét đã xác thực sau khám
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewDoctor(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto divide-y divide-slate-200">
              {loadingReviews ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Đang tải đánh giá từ bệnh nhân...
                </div>
              ) : doctorReviews.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Chưa có đánh giá nào cho bác sĩ này.
                </div>
              ) : (
                doctorReviews.map((rev) => (
                  <div key={rev.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900">{rev.patientName}</span>
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-amber-600 tabular-nums">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{rev.rating}.0</span>
                      </span>
                    </div>
                    {rev.comment && (
                      <p className="text-sm text-slate-600 leading-relaxed">{rev.comment}</p>
                    )}
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      {formatDateTimeVi(rev.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  const d = reviewDoctor;
                  setReviewDoctor(null);
                  handleOpenBooking(d.id, d.specialtyId);
                }}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                Đặt lịch với bác sĩ này
              </button>
              <button
                type="button"
                onClick={() => setReviewDoctor(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <AiChatbot />
    </div>
  );
}
