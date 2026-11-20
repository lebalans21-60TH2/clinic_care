import { Printer, X } from 'lucide-react';
import { formatDateVi } from '../lib/api';
import type { MedicalRecord } from '../types/clinic';

interface PrescriptionPrintModalProps {
  record: MedicalRecord | null;
  onClose: () => void;
}

export function PrescriptionPrintModal({ record, onClose }: PrescriptionPrintModalProps) {
  if (!record) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="printable-clinic-sheet"
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl p-6 sm:p-8 my-6 space-y-6"
      >
        {/* Top bar (hidden when printing) */}
        <div className="no-print flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <span className="text-xs font-medium text-slate-500">
            Bản xem trước in đơn thuốc & phiếu khám bệnh
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In đơn thuốc (PDF / Máy in)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700"
              aria-label="Đóng bản in"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Clinic Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-4">
          <div>
            <div className="font-display text-lg font-bold text-slate-900">
              PHÒNG KHÁM ĐA KHOA TƯ NHÂN CLINICCARE
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              128 Nguyễn Thị Minh Khai, Quận 3, TP. Hồ Chí Minh · Hotline: 1900 6868
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="font-mono font-semibold text-slate-900">
              Mã phiếu: {record.appointmentCode}
            </div>
            <div className="font-mono text-slate-600 tabular-nums mt-0.5">
              Ngày khám: {formatDateVi(record.visitDate)}
            </div>
          </div>
        </div>

        <div className="text-center">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 uppercase">
            Phiếu Khám Bệnh & Đơn Thuốc
          </h2>
        </div>

        {/* Patient & Clinical Info */}
        <div className="grid sm:grid-cols-2 gap-3 text-sm bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div>
            <span className="text-slate-500 text-xs block">Bệnh nhân</span>
            <span className="font-semibold text-slate-900">{record.patientName}</span>
          </div>
          <div>
            <span className="text-slate-500 text-xs block">Bác sĩ điều trị</span>
            <span className="font-semibold text-slate-900">
              {record.doctorName} · {record.specialtyName}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500 text-xs block">Triệu chứng lâm sàng</span>
            <span className="text-slate-800">{record.chiefComplaint}</span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-slate-500 text-xs block">Chẩn đoán</span>
            <span className="font-semibold text-slate-900">
              {record.diagnosis}
              {record.icdCode ? ` (Mã ICD-10: ${record.icdCode})` : ''}
            </span>
          </div>
        </div>

        {/* Vitals */}
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 border border-slate-200 rounded-md">
            <span className="text-slate-500 block">Huyết áp</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {record.vitalSigns.bloodPressure}
            </span>
          </div>
          <div className="p-2.5 border border-slate-200 rounded-md">
            <span className="text-slate-500 block">Nhịp tim</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {record.vitalSigns.heartRate}
            </span>
          </div>
          <div className="p-2.5 border border-slate-200 rounded-md">
            <span className="text-slate-500 block">Nhiệt độ</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {record.vitalSigns.temperature}
            </span>
          </div>
          <div className="p-2.5 border border-slate-200 rounded-md">
            <span className="text-slate-500 block">Cân nặng</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {record.vitalSigns.weight}
            </span>
          </div>
        </div>

        {/* Prescriptions */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">Chỉ định thuốc điều trị</h3>
          {record.prescriptions.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Không có thuốc kê đơn.</p>
          ) : (
            <table className="w-full text-left border-collapse text-xs border border-slate-300">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                  <th className="py-2 px-3 border-r border-slate-300 w-10 text-center">STT</th>
                  <th className="py-2 px-3 border-r border-slate-300">Tên thuốc & Hàm lượng</th>
                  <th className="py-2 px-3 border-r border-slate-300">Liều</th>
                  <th className="py-2 px-3 border-r border-slate-300">Cách dùng</th>
                  <th className="py-2 px-3">Thời gian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {record.prescriptions.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2 px-3 border-r border-slate-200 text-center font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 font-medium text-slate-900">
                      {item.medicine}
                      {item.note && (
                        <span className="block text-[11px] font-normal text-slate-500">
                          Ghi chú: {item.note}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 font-mono">{item.dosage}</td>
                    <td className="py-2 px-3 border-r border-slate-200">{item.frequency}</td>
                    <td className="py-2 px-3 font-mono">{item.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Doctor Notes & Signature */}
        <div className="space-y-2 text-xs text-slate-700 pt-2 border-t border-slate-200">
          <div>
            <span className="font-semibold text-slate-900">Lời dặn của bác sĩ: </span>
            <span>{record.clinicalNotes || 'Uống thuốc đúng giờ và theo dõi thêm tại nhà.'}</span>
          </div>
          {record.followUpDate && (
            <div>
              <span className="font-semibold text-slate-900">Ngày hẹn tái khám dự kiến: </span>
              <span className="font-mono font-semibold text-teal-800">
                {formatDateVi(record.followUpDate)}
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <div className="text-center text-xs min-w-[200px]">
            <div className="text-slate-500">Ngày {formatDateVi(record.visitDate)}</div>
            <div className="font-semibold text-slate-900 mt-1">Bác sĩ điều trị</div>
            <div className="h-12" />
            <div className="font-semibold text-slate-900">{record.doctorName}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
