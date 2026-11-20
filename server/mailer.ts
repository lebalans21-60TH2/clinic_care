import nodemailer from 'nodemailer';

interface AppointmentEmailPayload {
  toEmail: string;
  patientName: string;
  appointmentCode: string;
  doctorName: string;
  specialtyName: string;
  date: string;
  timeSlot: string;
  roomNumber?: string;
  type: 'CONFIRMATION' | 'REMINDER_24H';
}

function createTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user, pass },
  });
}

export async function sendAppointmentEmail(
  payload: AppointmentEmailPayload,
): Promise<{ sent: boolean; mode: 'smtp' | 'in_app_only' }> {
  const transporter = createTransporter();
  if (!transporter) {
    return { sent: false, mode: 'in_app_only' };
  }

  const from = process.env.SMTP_FROM?.trim() || 'ClinicCare <noreply@cliniccare.vn>';
  const subject =
    payload.type === 'CONFIRMATION'
      ? `[ClinicCare] Xác nhận lịch hẹn ${payload.appointmentCode}`
      : `[ClinicCare] Nhắc lịch khám sắp tới (${payload.appointmentCode})`;

  const heading =
    payload.type === 'CONFIRMATION'
      ? 'Lịch hẹn của bạn đã được ghi nhận'
      : 'Nhắc lịch khám bệnh trong vòng 24 giờ tới';

  const html = `
    <div style="font-family: sans-serif; color: #0f172a; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h2 style="margin: 0 0 12px; color: #0f766e;">${heading}</h2>
      <p>Kính gửi <strong>${payload.patientName}</strong>,</p>
      <p>Thông tin chi tiết lịch hẹn tại Phòng khám Đa khoa ClinicCare:</p>
      <ul style="line-height: 1.7; padding-left: 18px;">
        <li><strong>Mã lịch hẹn:</strong> ${payload.appointmentCode}</li>
        <li><strong>Bác sĩ phụ trách:</strong> ${payload.doctorName}</li>
        <li><strong>Chuyên khoa:</strong> ${payload.specialtyName}${payload.roomNumber ? ` (${payload.roomNumber})` : ''}</li>
        <li><strong>Thời gian:</strong> ${payload.timeSlot} ngày ${payload.date}</li>
      </ul>
      <p style="font-size: 13px; color: #475569;">Vui lòng mang theo mã QR Check-in trong Cổng bệnh nhân để hoàn tất tiếp nhận nhanh tại quầy lễ tân.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from,
      to: payload.toEmail,
      subject,
      html,
    });
    return { sent: true, mode: 'smtp' };
  } catch (err) {
    console.warn('[ClinicCare Mailer] Gửi email thất bại:', (err as Error).message);
    return { sent: false, mode: 'in_app_only' };
  }
}
