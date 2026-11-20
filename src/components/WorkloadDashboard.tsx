import { ArrowRight, BarChart3, CalendarRange, RotateCcw, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import type { DoctorProfile, WorkloadChartPoint, WorkloadDashboardResponse } from '../types/clinic';

interface WorkloadDashboardProps {
  doctors: DoctorProfile[];
  loggedInDoctorId?: string | null;
  refreshKey?: number;
  onOpenDoctorWorkspace?: () => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: WorkloadChartPoint;
  }>;
}

function WorkloadTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs space-y-1.5 min-w-[190px]">
      <div className="font-medium text-slate-900 border-b border-slate-100 pb-1">
        {point.rangeLabel}
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-600">Tổng lịch hẹn</span>
        <span className="font-mono font-semibold text-slate-900 tabular-nums">{point.total}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-teal-700">Đã khám xong</span>
        <span className="font-mono font-medium text-teal-700 tabular-nums">{point.completed}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sky-700">Sắp tới / Đang chờ</span>
        <span className="font-mono font-medium text-sky-700 tabular-nums">{point.upcoming}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500">Hủy / Vắng mặt</span>
        <span className="font-mono text-slate-500 tabular-nums">{point.cancelled}</span>
      </div>
    </div>
  );
}

export function WorkloadDashboard({
  doctors,
  loggedInDoctorId = null,
  refreshKey = 0,
  onOpenDoctorWorkspace,
}: WorkloadDashboardProps) {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(loggedInDoctorId || 'ALL');
  const [data, setData] = useState<WorkloadDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    setSelectedDoctorId(loggedInDoctorId || 'ALL');
  }, [loggedInDoctorId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getWorkloadDashboard(period, selectedDoctorId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message || 'Không thể tải dữ liệu thống kê lịch hẹn.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [period, selectedDoctorId, refreshKey, reloadNonce]);

  const activeDoctor = doctors.find((d) => d.id === selectedDoctorId) || null;
  const maxBreakdownTotal = Math.max(
    1,
    ...(data?.doctorBreakdown.map((item) => item.total) ?? [1]),
  );

  return (
    <section id="thong-ke-lich-hen" className="max-w-6xl mx-auto px-6 pt-14 pb-4 space-y-6">
      {/* Section Heading + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-teal-700">
            Theo dõi hiệu suất & phân bổ ca khám
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
            Dashboard khối lượng lịch hẹn
          </h2>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
            Quan sát tổng số lượt khám theo từng tuần hoặc tháng, giúp bác sĩ chủ động điều phối
            lịch làm việc và thời gian tiếp nhận bệnh nhân.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Doctor filter dropdown */}
          <select
            aria-label="Lọc theo bác sĩ"
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className="px-3 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 min-w-[210px]"
          >
            <option value="ALL">Tất cả bác sĩ (Toàn phòng khám)</option>
            {doctors.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.fullName}
              </option>
            ))}
          </select>

          {/* Week / Month segmented control */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                period === 'week'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Theo tuần
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                period === 'month'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Theo tháng
            </button>
          </div>

          {/* Chart Type toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              aria-label="Biểu đồ cột"
              title="Biểu đồ cột"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartType === 'bar'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Cột</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              aria-label="Biểu đồ xu hướng"
              title="Biểu đồ xu hướng"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartType === 'area'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Xu hướng</span>
            </button>
          </div>
        </div>
      </div>

      {/* Single-elevation Dashboard Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Top KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200">
          <div className="p-5">
            <div className="text-xs text-slate-500">
              Tổng lịch hẹn ({period === 'week' ? '8 tuần' : '6 tháng'})
            </div>
            <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums mt-1">
              {loading && !data ? '—' : data?.summary.totalAppointments ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1 truncate">
              {activeDoctor ? activeDoctor.fullName : 'Toàn phòng khám'}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500">Đã hoàn thành</div>
            <div className="font-mono text-2xl font-semibold text-teal-700 tabular-nums mt-1">
              {loading && !data ? '—' : data?.summary.completedCount ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {data && data.summary.totalAppointments > 0
                ? `${Math.round((data.summary.completedCount / data.summary.totalAppointments) * 100)}% tổng lượt khám`
                : 'Chưa có lượt hoàn tất'}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500">Sắp tới / Chờ xác nhận</div>
            <div className="font-mono text-2xl font-semibold text-sky-700 tabular-nums mt-1">
              {loading && !data ? '—' : data?.summary.upcomingCount ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Cần chuẩn bị tiếp nhận
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs text-slate-500">
              Trung bình / {period === 'week' ? 'tuần' : 'tháng'}
            </div>
            <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums mt-1">
              {loading && !data ? '—' : data?.summary.avgPerBucket ?? 0}
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums truncate">
              Cao điểm: {data?.summary.peakCount ?? 0} lượt ({data?.summary.peakLabel || '—'})
            </div>
          </div>
        </div>

        {/* Chart + Doctor Breakdown Grid */}
        <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Chart Area (8 cols) */}
          <div className="lg:col-span-8 p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <CalendarRange className="w-4 h-4 text-teal-700" />
                <span>
                  {period === 'week'
                    ? 'Biểu đồ số lượng lịch hẹn theo tuần'
                    : 'Biểu đồ số lượng lịch hẹn theo tháng'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-teal-700 inline-block" />
                  <span>Đã hoàn thành</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
                  <span>Sắp khám / Chờ xác nhận</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 inline-block" />
                  <span>Hủy / Vắng mặt</span>
                </span>
              </div>
            </div>

            {error ? (
              <div className="h-[310px] flex flex-col items-center justify-center text-center space-y-3 bg-slate-50 rounded-lg border border-slate-200 p-6">
                <p className="text-sm text-rose-700">{error}</p>
                <button
                  type="button"
                  onClick={() => setReloadNonce((n) => n + 1)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Tải lại biểu đồ</span>
                </button>
              </div>
            ) : loading ? (
              <div className="h-[310px] rounded-lg bg-slate-100 animate-pulse" />
            ) : !data || data.series.every((p) => p.total === 0) ? (
              <div className="h-[310px] flex flex-col items-center justify-center text-center space-y-3 bg-slate-50 rounded-lg border border-slate-200 p-6">
                <p className="text-sm text-slate-600">
                  Chưa có lịch hẹn nào trong giai đoạn đã chọn cho bộ lọc hiện tại.
                </p>
                {selectedDoctorId !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedDoctorId('ALL')}
                    className="px-4 py-2 text-xs font-medium text-teal-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Xem dữ liệu toàn phòng khám
                  </button>
                )}
              </div>
            ) : (
              <div className="h-[310px] w-full">
                <ResponsiveContainer width="100%" height={310}>
                  {chartType === 'bar' ? (
                    <BarChart
                      data={data.series}
                      margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: '#64748B' }}
                        axisLine={{ stroke: '#E2E8F0' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        content={<WorkloadTooltip />}
                        cursor={{ fill: 'rgba(241, 245, 249, 0.7)' }}
                      />
                      <Bar
                        dataKey="completed"
                        stackId="workload"
                        name="Đã hoàn thành"
                        fill="#0F766E"
                        maxBarSize={42}
                      />
                      <Bar
                        dataKey="upcoming"
                        stackId="workload"
                        name="Sắp khám / Chờ xác nhận"
                        fill="#0284C7"
                        maxBarSize={42}
                      />
                      <Bar
                        dataKey="cancelled"
                        stackId="workload"
                        name="Hủy / Vắng mặt"
                        fill="#CBD5E1"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={42}
                      />
                    </BarChart>
                  ) : (
                    <AreaChart
                      data={data.series}
                      margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="workloadTotalGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0F766E" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#0F766E" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="workloadUpcomingGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284C7" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#0284C7" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: '#64748B' }}
                        axisLine={{ stroke: '#E2E8F0' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: '#64748B' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip content={<WorkloadTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="completed"
                        name="Đã hoàn thành"
                        stroke="#0F766E"
                        strokeWidth={2}
                        fill="url(#workloadTotalGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="upcoming"
                        name="Sắp khám / Chờ xác nhận"
                        stroke="#0284C7"
                        strokeWidth={2}
                        fill="url(#workloadUpcomingGrad)"
                      />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Doctor Workload Breakdown (4 cols) */}
          <div className="lg:col-span-4 p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Khối lượng theo bác sĩ
                </h3>
                {selectedDoctorId !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedDoctorId('ALL')}
                    className="text-xs font-medium text-teal-700 hover:text-teal-800 whitespace-nowrap"
                  >
                    Xem tất cả
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {(data?.doctorBreakdown || []).map((item) => {
                  const isSelected = selectedDoctorId === item.doctorId;
                  const ratioPct = Math.round((item.total / maxBreakdownTotal) * 100);
                  return (
                    <button
                      key={item.doctorId}
                      type="button"
                      onClick={() =>
                        setSelectedDoctorId((prev) =>
                          prev === item.doctorId ? 'ALL' : item.doctorId,
                        )
                      }
                      className={`w-full text-left py-3 px-2.5 -mx-2.5 rounded-lg transition-colors space-y-1.5 ${
                        isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {item.doctorName}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                          {item.total} lượt
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <span className="truncate">
                          {item.specialtyName} · {item.roomNumber}
                        </span>
                        <span className="font-mono tabular-nums shrink-0">
                          {item.completed} xong · {item.upcoming} chờ
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isSelected ? 'bg-teal-700' : 'bg-teal-600/80'
                          }`}
                          style={{ width: `${ratioPct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {loggedInDoctorId && onOpenDoctorWorkspace && (
              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onOpenDoctorWorkspace}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>Vào không gian làm việc Bác sĩ</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
