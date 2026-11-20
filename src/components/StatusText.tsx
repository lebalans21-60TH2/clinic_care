import {
  AlertCircle,
  CheckCircle2,
  Clock,
  QrCode,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { AppointmentStatus } from '../types/clinic';
import { APPOINTMENT_STATUS_META } from '../lib/api';

interface StatusTextProps {
  status: AppointmentStatus;
}

export function StatusText({ status }: StatusTextProps) {
  const meta = APPOINTMENT_STATUS_META[status];

  const renderIcon = () => {
    switch (status) {
      case 'PENDING':
        return <Clock className="w-3.5 h-3.5 shrink-0" />;
      case 'CONFIRMED':
        return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;
      case 'CHECKED_IN':
        return <QrCode className="w-3.5 h-3.5 shrink-0" />;
      case 'COMPLETED':
        return <UserCheck className="w-3.5 h-3.5 shrink-0" />;
      case 'CANCELLED':
      case 'REJECTED':
        return <XCircle className="w-3.5 h-3.5 shrink-0" />;
      case 'NO_SHOW':
        return <AlertCircle className="w-3.5 h-3.5 shrink-0" />;
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${meta.colorClass}`}>
      {renderIcon()}
      <span>{meta.label}</span>
    </span>
  );
}
