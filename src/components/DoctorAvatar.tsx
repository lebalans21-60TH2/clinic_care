import { Stethoscope } from 'lucide-react';
import { useState } from 'react';

interface DoctorAvatarProps {
  src: string;
  name: string;
  className?: string;
}

export function DoctorAvatar({ src, name, className = 'w-16 h-16' }: DoctorAvatarProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`${className} rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-teal-700 shrink-0`}
        aria-label={name}
      >
        <Stethoscope className="w-6 h-6" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Ảnh chân dung ${name}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} rounded-xl object-cover object-top border border-slate-200 bg-slate-100 shrink-0`}
    />
  );
}
