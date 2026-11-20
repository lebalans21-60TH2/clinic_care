import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type {
  AppointmentStatus,
  ChatMessage,
  DoctorReview,
  MedicalRecord,
  PaymentMethod,
  PaymentStatus,
  User,
  UserRole,
} from './src/types/clinic.ts';
import { generateClinicAssistantReply } from './server/ai.ts';
import { UPLOADS_ROOT_DIR, deleteDoctorAvatar, uploadDoctorAvatar } from './server/cloudinary.ts';
import {
  appendAuditLog,
  computeAvailableSlots,
  createBackupSnapshot,
  generateAppointmentQr,
  generateVietQrDataUrl,
  getDb,
  saveDb,
  withDbLock,
} from './server/db.ts';
import { sendAppointmentEmail } from './server/mailer.ts';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'cliniccare-dev-secret-key-2026';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  fullName: string;
}

interface AuthedRequest extends Request {
  auth?: JwtPayload;
}

function sanitizeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

function signToken(user: User): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Yêu cầu đăng nhập để thực hiện thao tác này.' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const db = await getDb();
    const user = db.users.find((u) => u.id === decoded.sub);
    if (!user || !user.active) {
      res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị tạm khóa.' });
      return;
    }
    req.auth = {
      sub: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  }
}

function authorize(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Bạn không có quyền truy cập chức năng này.' });
      return;
    }
    next();
  };
}

function createRateLimiter(windowMs: number, maxRequests: number, message: string) {
  const buckets = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const history = (buckets.get(ip) || []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      res.status(429).json({ error: message });
      return;
    }
    history.push(now);
    buckets.set(ip, history);
    next();
  };
}

const authRateLimiter = createRateLimiter(
  5 * 60 * 1000,
  25,
  'Bạn đã gửi quá nhiều yêu cầu xác thực. Vui lòng thử lại sau ít phút.',
);

const aiChatRateLimiter = createRateLimiter(
  5 * 60 * 1000,
  30,
  'Bạn đã gửi quá nhiều câu hỏi cho trợ lý AI. Vui lòng đợi một lát rồi thử lại.',
);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.use('/uploads', express.static(UPLOADS_ROOT_DIR));

  // Initialize database on startup
  await getDb();

  // ==================== FR01: AUTHENTICATION ====================
  app.post('/api/auth/register', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password, fullName, phone, gender, dateOfBirth, address } = req.body as {
        email?: string;
        password?: string;
        fullName?: string;
        phone?: string;
        gender?: 'Nam' | 'Nữ' | 'Khác';
        dateOfBirth?: string;
        address?: string;
      };

      if (!email || !password || !fullName || !phone) {
        res.status(400).json({ error: 'Vui lòng nhập đầy đủ họ tên, email, số điện thoại và mật khẩu.' });
        return;
      }
      if (password.length < 6) {
        res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();

      const result = await withDbLock(async () => {
        const db = await getDb();
        if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          return { error: 'Email này đã được đăng ký trong hệ thống.', status: 409 as const };
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser: User = {
          id: `usr-${crypto.randomUUID().slice(0, 8)}`,
          email: normalizedEmail,
          passwordHash,
          fullName: fullName.trim(),
          phone: phone.trim(),
          role: 'PATIENT',
          active: true,
          gender: gender || 'Khác',
          dateOfBirth: dateOfBirth || '',
          address: address || '',
          createdAt: new Date().toISOString(),
        };
        db.users.push(newUser);
        appendAuditLog(db, {
          actorId: newUser.id,
          actorName: newUser.fullName,
          actorRole: 'PATIENT',
          action: 'REGISTER_PATIENT',
          targetType: 'AUTH',
          targetId: newUser.id,
          detail: `Đăng ký tài khoản bệnh nhân mới (${newUser.email})`,
        });
        await saveDb(db);
        const token = signToken(newUser);
        return { user: sanitizeUser(newUser), token };
      });

      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/auth/login', authRateLimiter, async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email || !password) {
        res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu.' });
        return;
      }
      const db = await getDb();
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user || !user.passwordHash) {
        res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
        return;
      }
      if (!user.active) {
        res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.' });
        return;
      }
      const matched = await bcrypt.compare(password, user.passwordHash);
      if (!matched) {
        res.status(401).json({ error: 'Email hoặc mật khẩu không chính xác.' });
        return;
      }

      await withDbLock(async () => {
        const latestDb = await getDb();
        appendAuditLog(latestDb, {
          actorId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          action: 'LOGIN',
          targetType: 'AUTH',
          targetId: user.id,
          detail: `Đăng nhập hệ thống với vai trò ${user.role}`,
        });
        await saveDb(latestDb);
      });

      const doctorProfile =
        user.role === 'DOCTOR' ? db.doctors.find((d) => d.userId === user.id) ?? null : null;

      res.json({
        token: signToken(user),
        user: sanitizeUser(user),
        doctorProfile,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/auth/me', authenticate, async (req: AuthedRequest, res: Response) => {
    const db = await getDb();
    const user = db.users.find((u) => u.id === req.auth!.sub);
    if (!user) {
      res.status(404).json({ error: 'Không tìm thấy người dùng.' });
      return;
    }
    const doctorProfile =
      user.role === 'DOCTOR' ? db.doctors.find((d) => d.userId === user.id) ?? null : null;
    res.json({ user: sanitizeUser(user), doctorProfile });
  });

  app.post('/api/auth/change-password', authenticate, async (req: AuthedRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' });
        return;
      }
      if (newPassword.length < 6) {
        res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
        return;
      }

      const result = await withDbLock(async () => {
        const db = await getDb();
        const user = db.users.find((u) => u.id === req.auth!.sub);
        if (!user || !user.passwordHash) {
          return { error: 'Không tìm thấy tài khoản.', status: 404 as const };
        }
        const matched = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!matched) {
          return { error: 'Mật khẩu hiện tại không chính xác.', status: 400 as const };
        }
        user.passwordHash = await bcrypt.hash(newPassword, 10);
        appendAuditLog(db, {
          actorId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          action: 'CHANGE_PASSWORD',
          targetType: 'AUTH',
          targetId: user.id,
          detail: `Đổi mật khẩu tài khoản ${user.email}`,
        });
        await saveDb(db);
        return { ok: true };
      });

      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== FR02: PATIENT PROFILE ====================
  app.patch('/api/patients/me', authenticate, async (req: AuthedRequest, res: Response) => {
    try {
      const { fullName, phone, gender, dateOfBirth, address, bloodType, allergies } = req.body as Partial<User>;
      const updated = await withDbLock(async () => {
        const db = await getDb();
        const user = db.users.find((u) => u.id === req.auth!.sub);
        if (!user) return null;
        if (fullName !== undefined) user.fullName = fullName.trim();
        if (phone !== undefined) user.phone = phone.trim();
        if (gender !== undefined) user.gender = gender;
        if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
        if (address !== undefined) user.address = address;
        if (bloodType !== undefined) user.bloodType = bloodType;
        if (allergies !== undefined) user.allergies = allergies;
        appendAuditLog(db, {
          actorId: user.id,
          actorName: user.fullName,
          actorRole: user.role,
          action: 'UPDATE_PROFILE',
          targetType: 'USER',
          targetId: user.id,
          detail: 'Cập nhật thông tin cá nhân & tiền sử dị ứng',
        });
        await saveDb(db);
        return sanitizeUser(user);
      });
      if (!updated) {
        res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
        return;
      }
      res.json({ user: updated });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== PUBLIC CATALOG & SLOTS ====================
  app.get('/api/public/overview', async (_req: Request, res: Response) => {
    const db = await getDb();
    res.json({
      specialties: db.specialties.filter((s) => s.active),
      doctors: db.doctors.filter((d) => d.active),
      services: db.services.filter((s) => s.active),
    });
  });

  app.get('/api/public/workload-dashboard', async (req: Request, res: Response) => {
    const periodParam = req.query.period === 'month' ? 'month' : 'week';
    const doctorIdParam =
      typeof req.query.doctorId === 'string' && req.query.doctorId.trim()
        ? req.query.doctorId.trim()
        : 'ALL';

    const db = await getDb();
    const activeDoctors = db.doctors.filter((d) => d.active);
    const selectedDoctorId =
      doctorIdParam !== 'ALL' && activeDoctors.some((d) => d.id === doctorIdParam)
        ? doctorIdParam
        : 'ALL';

    const toUtcIso = (d: Date): string => d.toISOString().slice(0, 10);
    const formatShortVi = (d: Date): string =>
      `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    type BucketDef = {
      key: string;
      label: string;
      rangeLabel: string;
      matches: (aptDate: string) => boolean;
    };
    const buckets: BucketDef[] = [];

    if (periodParam === 'week') {
      const dayOfWeek = todayUtc.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const currentMonday = new Date(todayUtc);
      currentMonday.setUTCDate(todayUtc.getUTCDate() + diffToMonday);

      for (let w = -6; w <= 1; w++) {
        const start = new Date(currentMonday);
        start.setUTCDate(currentMonday.getUTCDate() + w * 7);
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 6);
        const startIso = toUtcIso(start);
        const endIso = toUtcIso(end);
        const label = w === 0 ? `Tuần này` : w === 1 ? `Tuần tới` : `${formatShortVi(start)}`;
        buckets.push({
          key: startIso,
          label,
          rangeLabel: `${formatShortVi(start)} – ${formatShortVi(end)}`,
          matches: (aptDate: string) => aptDate >= startIso && aptDate <= endIso,
        });
      }
    } else {
      for (let m = -5; m <= 0; m++) {
        const d = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() + m, 1));
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const ymKey = `${year}-${String(month).padStart(2, '0')}`;
        buckets.push({
          key: ymKey,
          label: `Thg ${month}`,
          rangeLabel: `Tháng ${String(month).padStart(2, '0')}/${year}`,
          matches: (aptDate: string) => aptDate.slice(0, 7) === ymKey,
        });
      }
    }

    const filteredAppointments =
      selectedDoctorId === 'ALL'
        ? db.appointments
        : db.appointments.filter((a) => a.doctorId === selectedDoctorId);

    const series = buckets.map((b) => {
      const inBucket = filteredAppointments.filter((a) => b.matches(a.date));
      const completed = inBucket.filter((a) => a.status === 'COMPLETED').length;
      const upcoming = inBucket.filter((a) =>
        ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(a.status),
      ).length;
      const cancelled = inBucket.filter((a) =>
        ['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(a.status),
      ).length;
      return {
        key: b.key,
        label: b.label,
        rangeLabel: b.rangeLabel,
        total: inBucket.length,
        completed,
        upcoming,
        cancelled,
      };
    });

    const totalAppointments = series.reduce((acc, s) => acc + s.total, 0);
    const completedCount = series.reduce((acc, s) => acc + s.completed, 0);
    const upcomingCount = series.reduce((acc, s) => acc + s.upcoming, 0);
    const cancelledCount = series.reduce((acc, s) => acc + s.cancelled, 0);
    const peakPoint = series.reduce(
      (best, item) => (item.total > best.total ? item : best),
      series[0] || { rangeLabel: '-', total: 0 },
    );

    const doctorBreakdown = activeDoctors
      .map((doc) => {
        const spec = db.specialties.find((s) => s.id === doc.specialtyId);
        const docAppointmentsInWindow = db.appointments.filter(
          (a) => a.doctorId === doc.id && buckets.some((b) => b.matches(a.date)),
        );
        return {
          doctorId: doc.id,
          doctorName: doc.fullName,
          specialtyName: spec?.name || '',
          roomNumber: doc.roomNumber,
          total: docAppointmentsInWindow.length,
          completed: docAppointmentsInWindow.filter((a) => a.status === 'COMPLETED').length,
          upcoming: docAppointmentsInWindow.filter((a) =>
            ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(a.status),
          ).length,
        };
      })
      .sort((a, b) => b.total - a.total);

    res.json({
      period: periodParam,
      doctorId: selectedDoctorId,
      summary: {
        totalAppointments,
        completedCount,
        upcomingCount,
        cancelledCount,
        peakLabel: peakPoint.rangeLabel,
        peakCount: peakPoint.total,
        avgPerBucket: series.length > 0 ? Number((totalAppointments / series.length).toFixed(1)) : 0,
      },
      series,
      doctorBreakdown,
    });
  });

  app.get('/api/schedules/available-slots', async (req: Request, res: Response) => {
    const { doctorId, date } = req.query as { doctorId?: string; date?: string };
    if (!doctorId || !date) {
      res.status(400).json({ error: 'Thiếu tham số doctorId hoặc date.' });
      return;
    }
    const db = await getDb();
    const slots = computeAvailableSlots(db, doctorId, date);
    res.json({ doctorId, date, slots });
  });

  // ==================== FR04: DOCTOR SCHEDULES ====================
  app.get('/api/schedules/:doctorId', authenticate, async (req: AuthedRequest, res: Response) => {
    const db = await getDb();
    const schedule = db.schedules.find((s) => s.doctorId === req.params.doctorId);
    if (!schedule) {
      res.status(404).json({ error: 'Không tìm thấy lịch làm việc bác sĩ.' });
      return;
    }
    res.json({ schedule });
  });

  app.put(
    '/api/schedules/:doctorId',
    authenticate,
    authorize('DOCTOR', 'ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const doctorId = req.params.doctorId;
        const result = await withDbLock(async () => {
          const db = await getDb();
          if (req.auth!.role === 'DOCTOR') {
            const doc = db.doctors.find((d) => d.userId === req.auth!.sub);
            if (!doc || doc.id !== doctorId) {
              return { error: 'Bạn chỉ có thể chỉnh sửa lịch làm việc của chính mình.', status: 403 as const };
            }
          }
          const idx = db.schedules.findIndex((s) => s.doctorId === doctorId);
          if (idx === -1) {
            return { error: 'Không tìm thấy bác sĩ.', status: 404 as const };
          }
          const { slotDurationMinutes, weeklyShifts, blockedDates } = req.body;
          if (slotDurationMinutes) db.schedules[idx].slotDurationMinutes = Number(slotDurationMinutes);
          if (weeklyShifts) db.schedules[idx].weeklyShifts = weeklyShifts;
          if (Array.isArray(blockedDates)) db.schedules[idx].blockedDates = blockedDates;

          appendAuditLog(db, {
            actorId: req.auth!.sub,
            actorName: req.auth!.fullName,
            actorRole: req.auth!.role,
            action: 'UPDATE_SCHEDULE',
            targetType: 'SCHEDULE',
            targetId: doctorId,
            detail: `Cập nhật lịch làm việc bác sĩ ${doctorId}`,
          });
          await saveDb(db);
          return { schedule: db.schedules[idx] };
        });

        if ('error' in result) {
          res.status(result.status ?? 400).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // ==================== FR04 / 3.1: APPOINTMENTS & QR ====================
  app.get('/api/appointments', authenticate, async (req: AuthedRequest, res: Response) => {
    const db = await getDb();
    let list = db.appointments;
    if (req.auth!.role === 'PATIENT') {
      list = list.filter((a) => a.patientId === req.auth!.sub);
    } else if (req.auth!.role === 'DOCTOR') {
      const doc = db.doctors.find((d) => d.userId === req.auth!.sub);
      list = doc ? list.filter((a) => a.doctorId === doc.id) : [];
    }
    const sorted = [...list].sort((a, b) => `${b.date} ${b.timeSlot}`.localeCompare(`${a.date} ${a.timeSlot}`));
    res.json({ appointments: sorted });
  });

  app.post('/api/appointments', authenticate, async (req: AuthedRequest, res: Response) => {
    try {
      const { specialtyId, doctorId, serviceId, date, timeSlot, symptoms } = req.body as {
        specialtyId?: string;
        doctorId?: string;
        serviceId?: string;
        date?: string;
        timeSlot?: string;
        symptoms?: string;
      };

      if (!specialtyId || !doctorId || !date || !timeSlot || !symptoms?.trim()) {
        res.status(400).json({ error: 'Vui lòng điền đầy đủ chuyên khoa, bác sĩ, ngày giờ và triệu chứng.' });
        return;
      }

      const result = await withDbLock(async () => {
        const db = await getDb();
        const patient = db.users.find((u) => u.id === req.auth!.sub);
        const doctor = db.doctors.find((d) => d.id === doctorId && d.active);
        const specialty = db.specialties.find((s) => s.id === specialtyId && s.active);
        const service = serviceId
          ? db.services.find((sv) => sv.id === serviceId && sv.active)
          : db.services.find((sv) => sv.specialtyId === specialtyId && sv.active);

        if (!patient || !doctor || !specialty) {
          return { error: 'Thông tin chuyên khoa hoặc bác sĩ không hợp lệ.', status: 400 as const };
        }

        // NFR04: Final atomic slot check before saving
        const availableSlots = computeAvailableSlots(db, doctorId, date);
        const targetSlot = availableSlots.find((s) => s.time === timeSlot);
        if (!targetSlot || !targetSlot.available) {
          return {
            error: `Khung giờ ${timeSlot} ngày ${date} không còn trống (${targetSlot?.reason || 'Bác sĩ không có lịch làm việc'}). Vui lòng chọn khung giờ khác.`,
            status: 409 as const,
          };
        }

        const id = `apt-${crypto.randomUUID().slice(0, 8)}`;
        const code = `CC-${Math.floor(100000 + Math.random() * 900000)}`;
        const { qrPayload, qrCodeDataUrl } = await generateAppointmentQr({
          code,
          appointmentId: id,
          patientId: patient.id,
          doctorId: doctor.id,
          date,
          timeSlot,
        });
        const amountVnd = service?.priceVnd ?? doctor.consultationFeeVnd;
        const vietQrDataUrl = await generateVietQrDataUrl({
          code,
          amountVnd,
          patientName: patient.fullName,
        });

        const now = new Date().toISOString();
        const appointment = {
          id,
          code,
          patientId: patient.id,
          patientName: patient.fullName,
          patientPhone: patient.phone,
          doctorId: doctor.id,
          doctorName: doctor.fullName,
          specialtyId: specialty.id,
          specialtyName: specialty.name,
          serviceId: service?.id || '',
          serviceName: service?.name || `Khám chuyên khoa ${specialty.name}`,
          servicePriceVnd: amountVnd,
          date,
          timeSlot,
          symptoms: symptoms.trim(),
          status: 'PENDING' as AppointmentStatus,
          qrCodeDataUrl,
          qrPayload,
          paymentStatus: 'UNPAID' as PaymentStatus,
          vietQrDataUrl,
          createdAt: now,
          updatedAt: now,
        };

        db.appointments.unshift(appointment);

        // Notify Patient & Doctor
        db.notifications.unshift(
          {
            id: `noti-${crypto.randomUUID().slice(0, 8)}`,
            userId: patient.id,
            title: `Đặt lịch thành công (${code})`,
            message: `Lịch khám với ${doctor.fullName} vào ${timeSlot} ngày ${date} đang chờ xác nhận. Vui lòng mang mã QR khi đến khám.`,
            type: 'APPOINTMENT',
            relatedId: id,
            read: false,
            createdAt: now,
          },
          {
            id: `noti-${crypto.randomUUID().slice(0, 8)}`,
            userId: doctor.userId,
            title: `Lịch hẹn mới ${code}`,
            message: `Bệnh nhân ${patient.fullName} đặt khám lúc ${timeSlot} ngày ${date}. Triệu chứng: ${symptoms.trim()}`,
            type: 'APPOINTMENT',
            relatedId: id,
            read: false,
            createdAt: now,
          },
        );

        appendAuditLog(db, {
          actorId: patient.id,
          actorName: patient.fullName,
          actorRole: patient.role,
          action: 'CREATE_APPOINTMENT',
          targetType: 'APPOINTMENT',
          targetId: id,
          detail: `Đặt lịch ${code} với ${doctor.fullName} (${date} ${timeSlot})`,
        });

        await saveDb(db);
        return {
          appointment,
          patientEmail: patient.email,
          roomNumber: doctor.roomNumber,
        };
      });

      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }

      // Non-blocking SMTP confirmation email if configured
      sendAppointmentEmail({
        toEmail: result.patientEmail,
        patientName: result.appointment.patientName,
        appointmentCode: result.appointment.code,
        doctorName: result.appointment.doctorName,
        specialtyName: result.appointment.specialtyName,
        date: result.appointment.date,
        timeSlot: result.appointment.timeSlot,
        roomNumber: result.roomNumber,
        type: 'CONFIRMATION',
      }).catch(() => undefined);

      res.status(201).json({ appointment: result.appointment });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.patch('/api/appointments/:id/reschedule', authenticate, async (req: AuthedRequest, res: Response) => {
    try {
      const { date, timeSlot } = req.body as { date?: string; timeSlot?: string };
      if (!date || !timeSlot) {
        res.status(400).json({ error: 'Vui lòng chọn ngày và khung giờ mới.' });
        return;
      }

      const result = await withDbLock(async () => {
        const db = await getDb();
        const apt = db.appointments.find((a) => a.id === req.params.id);
        if (!apt) {
          return { error: 'Không tìm thấy lịch hẹn.', status: 404 as const };
        }
        if (req.auth!.role === 'PATIENT' && apt.patientId !== req.auth!.sub) {
          return { error: 'Bạn không có quyền đổi lịch hẹn của người khác.', status: 403 as const };
        }
        if (!['PATIENT', 'ADMIN'].includes(req.auth!.role)) {
          return { error: 'Không có quyền thực hiện đổi lịch.', status: 403 as const };
        }
        if (!['PENDING', 'CONFIRMED'].includes(apt.status)) {
          return {
            error: 'Chỉ có thể đổi lịch hẹn đang chờ xác nhận hoặc đã xác nhận.',
            status: 400 as const,
          };
        }

        const availableSlots = computeAvailableSlots(db, apt.doctorId, date);
        const targetSlot = availableSlots.find((s) => s.time === timeSlot);
        if (!targetSlot || !targetSlot.available) {
          return {
            error: `Khung giờ ${timeSlot} ngày ${date} không còn trống (${targetSlot?.reason || 'Bác sĩ không có lịch làm việc'}).`,
            status: 409 as const,
          };
        }

        const oldDate = apt.date;
        const oldSlot = apt.timeSlot;
        const { qrPayload, qrCodeDataUrl } = await generateAppointmentQr({
          code: apt.code,
          appointmentId: apt.id,
          patientId: apt.patientId,
          doctorId: apt.doctorId,
          date,
          timeSlot,
        });

        apt.date = date;
        apt.timeSlot = timeSlot;
        apt.qrPayload = qrPayload;
        apt.qrCodeDataUrl = qrCodeDataUrl;
        apt.reminderSentAt = undefined;
        if (req.auth!.role === 'PATIENT') {
          apt.status = 'PENDING';
        }
        apt.updatedAt = new Date().toISOString();

        const doctor = db.doctors.find((d) => d.id === apt.doctorId);
        const now = new Date().toISOString();

        db.notifications.unshift({
          id: `noti-${crypto.randomUUID().slice(0, 8)}`,
          userId: apt.patientId,
          title: `Đã đổi lịch hẹn ${apt.code}`,
          message: `Lịch hẹn với ${apt.doctorName} đã chuyển từ ${oldSlot} (${oldDate}) sang ${timeSlot} (${date}).`,
          type: 'APPOINTMENT',
          relatedId: apt.id,
          read: false,
          createdAt: now,
        });

        if (doctor) {
          db.notifications.unshift({
            id: `noti-${crypto.randomUUID().slice(0, 8)}`,
            userId: doctor.userId,
            title: `Bệnh nhân đổi lịch hẹn ${apt.code}`,
            message: `${apt.patientName} đã đổi lịch khám sang ${timeSlot} ngày ${date}.`,
            type: 'APPOINTMENT',
            relatedId: apt.id,
            read: false,
            createdAt: now,
          });
        }

        appendAuditLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: req.auth!.role,
          action: 'RESCHEDULE_APPOINTMENT',
          targetType: 'APPOINTMENT',
          targetId: apt.id,
          detail: `Đổi lịch ${apt.code}: ${oldDate} ${oldSlot} -> ${date} ${timeSlot}`,
        });

        await saveDb(db);
        return { appointment: apt };
      });

      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/appointments/:id/vietqr', authenticate, async (req: AuthedRequest, res: Response) => {
    try {
      const db = await getDb();
      const apt = db.appointments.find((a) => a.id === req.params.id);
      if (!apt) {
        res.status(404).json({ error: 'Không tìm thấy lịch hẹn.' });
        return;
      }
      if (req.auth!.role === 'PATIENT' && apt.patientId !== req.auth!.sub) {
        res.status(403).json({ error: 'Không có quyền truy cập lịch hẹn này.' });
        return;
      }
      if (!apt.vietQrDataUrl) {
        apt.vietQrDataUrl = await generateVietQrDataUrl({
          code: apt.code,
          amountVnd: apt.servicePriceVnd,
          patientName: apt.patientName,
        });
        await saveDb(db);
      }
      res.json({ vietQrDataUrl: apt.vietQrDataUrl });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.patch(
    '/api/appointments/:id/payment',
    authenticate,
    authorize('ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const { paymentStatus, paymentMethod } = req.body as {
          paymentStatus?: PaymentStatus;
          paymentMethod?: PaymentMethod;
        };
        if (!paymentStatus || !['UNPAID', 'PAID', 'REFUNDED'].includes(paymentStatus)) {
          res.status(400).json({ error: 'Trạng thái thanh toán không hợp lệ.' });
          return;
        }

        const result = await withDbLock(async () => {
          const db = await getDb();
          const apt = db.appointments.find((a) => a.id === req.params.id);
          if (!apt) {
            return { error: 'Không tìm thấy lịch hẹn.', status: 404 as const };
          }
          apt.paymentStatus = paymentStatus;
          if (paymentMethod && ['CASH', 'VIETQR', 'CARD'].includes(paymentMethod)) {
            apt.paymentMethod = paymentMethod;
          }
          apt.paidAt = paymentStatus === 'PAID' ? new Date().toISOString() : undefined;
          apt.updatedAt = new Date().toISOString();

          if (paymentStatus === 'PAID') {
            db.notifications.unshift({
              id: `noti-${crypto.randomUUID().slice(0, 8)}`,
              userId: apt.patientId,
              title: `Xác nhận thanh toán (${apt.code})`,
              message: `Khoản phí ${apt.servicePriceVnd.toLocaleString('vi-VN')} ₫ cho dịch vụ "${apt.serviceName}" đã được thanh toán thành công.`,
              type: 'APPOINTMENT',
              relatedId: apt.id,
              read: false,
              createdAt: new Date().toISOString(),
            });
          }

          appendAuditLog(db, {
            actorId: req.auth!.sub,
            actorName: req.auth!.fullName,
            actorRole: 'ADMIN',
            action: 'UPDATE_PAYMENT',
            targetType: 'APPOINTMENT',
            targetId: apt.id,
            detail: `Cập nhật thanh toán ${apt.code}: ${paymentStatus}${apt.paymentMethod ? ` (${apt.paymentMethod})` : ''}`,
          });

          await saveDb(db);
          return { appointment: apt };
        });

        if ('error' in result) {
          res.status(result.status ?? 400).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  app.patch('/api/appointments/:id/status', authenticate, async (req: AuthedRequest, res: Response) => {
    try {
      const { status, reason } = req.body as { status?: AppointmentStatus; reason?: string };
      const validStatuses: AppointmentStatus[] = [
        'PENDING',
        'CONFIRMED',
        'CHECKED_IN',
        'COMPLETED',
        'CANCELLED',
        'REJECTED',
        'NO_SHOW',
      ];
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({ error: 'Trạng thái lịch hẹn không hợp lệ.' });
        return;
      }

      const result = await withDbLock(async () => {
        const db = await getDb();
        const apt = db.appointments.find((a) => a.id === req.params.id);
        if (!apt) {
          return { error: 'Không tìm thấy lịch hẹn.', status: 404 as const };
        }

        if (req.auth!.role === 'PATIENT') {
          if (apt.patientId !== req.auth!.sub) {
            return { error: 'Không có quyền thao tác lịch hẹn của người khác.', status: 403 as const };
          }
          if (status !== 'CANCELLED' || !['PENDING', 'CONFIRMED'].includes(apt.status)) {
            return { error: 'Bệnh nhân chỉ được hủy lịch đang chờ xác nhận hoặc đã xác nhận.', status: 403 as const };
          }
        } else if (req.auth!.role === 'DOCTOR') {
          const doc = db.doctors.find((d) => d.userId === req.auth!.sub);
          if (!doc || apt.doctorId !== doc.id) {
            return { error: 'Bác sĩ chỉ được xử lý lịch hẹn thuộc phân công của mình.', status: 403 as const };
          }
          if (!['CONFIRMED', 'REJECTED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'].includes(status)) {
            return { error: 'Trạng thái không hợp lệ cho vai trò bác sĩ.', status: 403 as const };
          }
        }

        const prevStatus = apt.status;
        apt.status = status;
        apt.updatedAt = new Date().toISOString();
        if (status === 'REJECTED' && reason) apt.rejectionReason = reason;
        if (status === 'CANCELLED' && reason) apt.cancelReason = reason;
        if (status === 'CHECKED_IN' && !apt.checkedInAt) apt.checkedInAt = new Date().toISOString();

        const statusLabels: Record<AppointmentStatus, string> = {
          PENDING: 'Chờ xác nhận',
          CONFIRMED: 'Đã xác nhận',
          CHECKED_IN: 'Đã đến phòng khám',
          COMPLETED: 'Đã khám xong',
          CANCELLED: 'Đã hủy',
          REJECTED: 'Bị từ chối',
          NO_SHOW: 'Không đến khám',
        };

        db.notifications.unshift({
          id: `noti-${crypto.randomUUID().slice(0, 8)}`,
          userId: apt.patientId,
          title: `Cập nhật lịch hẹn ${apt.code}: ${statusLabels[status]}`,
          message:
            reason && (status === 'REJECTED' || status === 'CANCELLED')
              ? `Lịch khám ngày ${apt.date} (${apt.timeSlot}) đã chuyển sang trạng thái ${statusLabels[status]}. Lý do: ${reason}`
              : `Lịch khám với ${apt.doctorName} ngày ${apt.date} lúc ${apt.timeSlot} đã chuyển sang trạng thái ${statusLabels[status]}.`,
          type: 'APPOINTMENT',
          relatedId: apt.id,
          read: false,
          createdAt: new Date().toISOString(),
        });

        appendAuditLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: req.auth!.role,
          action: `APPOINTMENT_${status}`,
          targetType: 'APPOINTMENT',
          targetId: apt.id,
          detail: `Chuyển trạng thái ${apt.code}: ${prevStatus} -> ${status}${reason ? ` (${reason})` : ''}`,
        });

        await saveDb(db);
        return { appointment: apt };
      });

      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // QR Check-in verification endpoint for Reception / Admin / Doctor
  app.post(
    '/api/appointments/checkin-qr',
    authenticate,
    authorize('ADMIN', 'DOCTOR'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const { codeOrPayload } = req.body as { codeOrPayload?: string };
        if (!codeOrPayload?.trim()) {
          res.status(400).json({ error: 'Vui lòng nhập mã lịch hẹn hoặc nội dung QR.' });
          return;
        }
        let lookupCode = codeOrPayload.trim();
        try {
          const parsed = JSON.parse(lookupCode);
          if (parsed && parsed.code) lookupCode = parsed.code;
        } catch {
          // treat as plain code like CC-260102
        }

        const result = await withDbLock(async () => {
          const db = await getDb();
          const apt = db.appointments.find(
            (a) => a.code.toLowerCase() === lookupCode.toLowerCase() || a.id === lookupCode,
          );
          if (!apt) {
            return { error: `Không tìm thấy lịch hẹn với mã "${lookupCode}".`, status: 404 as const };
          }
          if (['CANCELLED', 'REJECTED', 'COMPLETED'].includes(apt.status)) {
            return { error: `Lịch hẹn ${apt.code} hiện ở trạng thái ${apt.status}, không thể check-in.`, status: 400 as const };
          }
          apt.status = 'CHECKED_IN';
          apt.checkedInAt = new Date().toISOString();
          apt.updatedAt = new Date().toISOString();

          db.notifications.unshift({
            id: `noti-${crypto.randomUUID().slice(0, 8)}`,
            userId: apt.patientId,
            title: `Check-in thành công (${apt.code})`,
            message: `Bạn đã check-in thành công. Vui lòng chờ gọi tên vào phòng ${apt.specialtyName}.`,
            type: 'APPOINTMENT',
            relatedId: apt.id,
            read: false,
            createdAt: new Date().toISOString(),
          });

          appendAuditLog(db, {
            actorId: req.auth!.sub,
            actorName: req.auth!.fullName,
            actorRole: req.auth!.role,
            action: 'QR_CHECK_IN',
            targetType: 'APPOINTMENT',
            targetId: apt.id,
            detail: `Quét mã QR tiếp nhận bệnh nhân ${apt.patientName} (${apt.code})`,
          });

          await saveDb(db);
          return { appointment: apt };
        });

        if ('error' in result) {
          res.status(result.status ?? 400).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // ==================== FR05: MEDICAL RECORDS (NFR05 + NFR08 STRICT PRIVACY) ====================
  app.get('/api/medical-records', authenticate, async (req: AuthedRequest, res: Response) => {
    const result = await withDbLock(async () => {
      const db = await getDb();
      let records: MedicalRecord[] = [];

      if (req.auth!.role === 'PATIENT') {
        records = db.medicalRecords.filter((r) => r.patientId === req.auth!.sub);
      } else if (req.auth!.role === 'DOCTOR') {
        const doc = db.doctors.find((d) => d.userId === req.auth!.sub);
        if (doc) {
          // Doctor sees records they created OR records of patients assigned to them via appointments
          const assignedPatientIds = new Set(
            db.appointments.filter((a) => a.doctorId === doc.id).map((a) => a.patientId),
          );
          records = db.medicalRecords.filter(
            (r) => r.doctorId === doc.id || assignedPatientIds.has(r.patientId),
          );
        }
      } else {
        // Admin only sees metadata list for audit/management, or wait: requirement says medical records are sensitive
        // Doctor only views assigned patients, Patient only views own. We log Admin read if requested.
        records = db.medicalRecords;
      }

      appendAuditLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.role,
        action: 'LIST_MEDICAL_RECORDS',
        targetType: 'MEDICAL_RECORD',
        targetId: 'scope:' + req.auth!.role,
        detail: `Truy cập danh sách hồ sơ bệnh án (${records.length} hồ sơ thuộc phạm vi phân quyền)`,
      });
      await saveDb(db);

      return [...records].sort((a, b) => b.visitDate.localeCompare(a.visitDate));
    });

    res.json({ records: result });
  });

  app.get('/api/medical-records/:id', authenticate, async (req: AuthedRequest, res: Response) => {
    const result = await withDbLock(async () => {
      const db = await getDb();
      const record = db.medicalRecords.find((r) => r.id === req.params.id);
      if (!record) {
        return { error: 'Không tìm thấy hồ sơ bệnh án.', status: 404 as const };
      }

      let allowed = false;
      if (req.auth!.role === 'PATIENT') {
        allowed = record.patientId === req.auth!.sub;
      } else if (req.auth!.role === 'DOCTOR') {
        const doc = db.doctors.find((d) => d.userId === req.auth!.sub);
        if (doc) {
          const hasAppointment = db.appointments.some(
            (a) => a.doctorId === doc.id && a.patientId === record.patientId,
          );
          allowed = record.doctorId === doc.id || hasAppointment;
        }
      } else if (req.auth!.role === 'ADMIN') {
        allowed = true;
      }

      if (!allowed) {
        appendAuditLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: req.auth!.role,
          action: 'UNAUTHORIZED_RECORD_ACCESS',
          targetType: 'MEDICAL_RECORD',
          targetId: record.id,
          detail: `Từ chối truy cập trái phép hồ sơ bệnh án ${record.id}`,
        });
        await saveDb(db);
        return { error: 'Bạn không có quyền xem hồ sơ bệnh án này.', status: 403 as const };
      }

      appendAuditLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: req.auth!.role,
        action: 'READ_MEDICAL_RECORD',
        targetType: 'MEDICAL_RECORD',
        targetId: record.id,
        detail: `Xem chi tiết hồ sơ bệnh án ${record.appointmentCode} của ${record.patientName}`,
      });
      await saveDb(db);
      return { record };
    });

    if ('error' in result) {
      res.status(result.status ?? 400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post(
    '/api/medical-records',
    authenticate,
    authorize('DOCTOR'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const {
          appointmentId,
          chiefComplaint,
          diagnosis,
          icdCode,
          clinicalNotes,
          vitalSigns,
          prescriptions,
          followUpDate,
        } = req.body;

        if (!appointmentId || !diagnosis?.trim()) {
          res.status(400).json({ error: 'Vui lòng chọn lịch hẹn và nhập chẩn đoán bệnh.' });
          return;
        }

        const result = await withDbLock(async () => {
          const db = await getDb();
          const doc = db.doctors.find((d) => d.userId === req.auth!.sub);
          if (!doc) {
            return { error: 'Không tìm thấy hồ sơ bác sĩ.', status: 404 as const };
          }
          const apt = db.appointments.find((a) => a.id === appointmentId);
          if (!apt || apt.doctorId !== doc.id) {
            return { error: 'Bạn chỉ được tạo hồ sơ cho lịch hẹn thuộc phân công của mình.', status: 403 as const };
          }

          const existing = db.medicalRecords.find((r) => r.appointmentId === appointmentId);
          if (existing) {
            return { error: 'Lịch hẹn này đã có hồ sơ bệnh án. Vui lòng sử dụng chức năng cập nhật.', status: 409 as const };
          }

          const now = new Date().toISOString();
          const record: MedicalRecord = {
            id: `rec-${crypto.randomUUID().slice(0, 8)}`,
            appointmentId: apt.id,
            appointmentCode: apt.code,
            patientId: apt.patientId,
            patientName: apt.patientName,
            doctorId: doc.id,
            doctorName: doc.fullName,
            specialtyName: apt.specialtyName,
            visitDate: apt.date,
            chiefComplaint: chiefComplaint?.trim() || apt.symptoms,
            diagnosis: diagnosis.trim(),
            icdCode: icdCode?.trim() || '',
            clinicalNotes: clinicalNotes?.trim() || '',
            vitalSigns: {
              bloodPressure: vitalSigns?.bloodPressure || '120/80 mmHg',
              heartRate: vitalSigns?.heartRate || '75 bpm',
              temperature: vitalSigns?.temperature || '36.6 °C',
              weight: vitalSigns?.weight || '-- kg',
            },
            prescriptions: Array.isArray(prescriptions) ? prescriptions : [],
            followUpDate: followUpDate || undefined,
            createdAt: now,
            updatedAt: now,
          };

          db.medicalRecords.unshift(record);
          apt.status = 'COMPLETED';
          apt.updatedAt = now;

          db.notifications.unshift({
            id: `noti-${crypto.randomUUID().slice(0, 8)}`,
            userId: apt.patientId,
            title: `Hồ sơ khám bệnh ${apt.code} đã sẵn sàng`,
            message: `${doc.fullName} đã hoàn tất chẩn đoán và đơn thuốc cho lần khám ngày ${apt.date}.`,
            type: 'MEDICAL_RECORD',
            relatedId: record.id,
            read: false,
            createdAt: now,
          });

          appendAuditLog(db, {
            actorId: req.auth!.sub,
            actorName: req.auth!.fullName,
            actorRole: 'DOCTOR',
            action: 'CREATE_MEDICAL_RECORD',
            targetType: 'MEDICAL_RECORD',
            targetId: record.id,
            detail: `Tạo hồ sơ bệnh án cho ${apt.patientName} (${apt.code}) - Chẩn đoán: ${record.diagnosis}`,
          });

          await saveDb(db);
          return { record, appointment: apt };
        });

        if ('error' in result) {
          res.status(result.status ?? 400).json({ error: result.error });
          return;
        }
        res.status(201).json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  app.patch(
    '/api/medical-records/:id',
    authenticate,
    authorize('DOCTOR'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const result = await withDbLock(async () => {
          const db = await getDb();
          const doc = db.doctors.find((d) => d.userId === req.auth!.sub);
          const record = db.medicalRecords.find((r) => r.id === req.params.id);
          if (!record) return { error: 'Không tìm thấy hồ sơ.', status: 404 as const };
          if (!doc || record.doctorId !== doc.id) {
            return { error: 'Chỉ bác sĩ phụ trách mới được chỉnh sửa hồ sơ này.', status: 403 as const };
          }

          const { chiefComplaint, diagnosis, icdCode, clinicalNotes, vitalSigns, prescriptions, followUpDate } =
            req.body;
          if (chiefComplaint !== undefined) record.chiefComplaint = chiefComplaint;
          if (diagnosis !== undefined) record.diagnosis = diagnosis;
          if (icdCode !== undefined) record.icdCode = icdCode;
          if (clinicalNotes !== undefined) record.clinicalNotes = clinicalNotes;
          if (vitalSigns !== undefined) record.vitalSigns = vitalSigns;
          if (Array.isArray(prescriptions)) record.prescriptions = prescriptions;
          if (followUpDate !== undefined) record.followUpDate = followUpDate;
          record.updatedAt = new Date().toISOString();

          appendAuditLog(db, {
            actorId: req.auth!.sub,
            actorName: req.auth!.fullName,
            actorRole: 'DOCTOR',
            action: 'UPDATE_MEDICAL_RECORD',
            targetType: 'MEDICAL_RECORD',
            targetId: record.id,
            detail: `Cập nhật hồ sơ bệnh án ${record.appointmentCode} (${record.patientName})`,
          });

          await saveDb(db);
          return { record };
        });

        if ('error' in result) {
          res.status(result.status ?? 400).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  // ==================== FR06: NOTIFICATIONS ====================
  app.get('/api/notifications', authenticate, async (req: AuthedRequest, res: Response) => {
    const db = await getDb();
    const list = db.notifications
      .filter((n) => n.userId === req.auth!.sub)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ notifications: list });
  });

  app.patch('/api/notifications/:id/read', authenticate, async (req: AuthedRequest, res: Response) => {
    await withDbLock(async () => {
      const db = await getDb();
      const item = db.notifications.find((n) => n.id === req.params.id && n.userId === req.auth!.sub);
      if (item) {
        item.read = true;
        await saveDb(db);
      }
    });
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', authenticate, async (req: AuthedRequest, res: Response) => {
    await withDbLock(async () => {
      const db = await getDb();
      for (const n of db.notifications) {
        if (n.userId === req.auth!.sub) n.read = true;
      }
      await saveDb(db);
    });
    res.json({ ok: true });
  });

  // ==================== DOCTOR REVIEWS ====================
  app.get('/api/doctors/:id/reviews', async (req: Request, res: Response) => {
    const db = await getDb();
    const reviews = (db.reviews || [])
      .filter((r) => r.doctorId === req.params.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ reviews });
  });

  app.post('/api/reviews', authenticate, authorize('PATIENT'), async (req: AuthedRequest, res: Response) => {
    try {
      const { appointmentId, rating, comment } = req.body as {
        appointmentId?: string;
        rating?: number;
        comment?: string;
      };
      const numericRating = Number(rating);
      if (!appointmentId || Number.isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
        res.status(400).json({ error: 'Vui lòng chọn số sao đánh giá từ 1 đến 5.' });
        return;
      }

      const result = await withDbLock(async () => {
        const db = await getDb();
        const apt = db.appointments.find((a) => a.id === appointmentId);
        if (!apt) {
          return { error: 'Không tìm thấy lịch hẹn.', status: 404 as const };
        }
        if (apt.patientId !== req.auth!.sub) {
          return { error: 'Bạn chỉ có thể đánh giá lịch hẹn của chính mình.', status: 403 as const };
        }
        if (apt.status !== 'COMPLETED') {
          return { error: 'Chỉ có thể đánh giá bác sĩ sau khi lịch khám đã hoàn tất.', status: 400 as const };
        }
        if (db.reviews.some((r) => r.appointmentId === apt.id)) {
          return { error: 'Bạn đã gửi đánh giá cho lần khám này rồi.', status: 409 as const };
        }

        const review: DoctorReview = {
          id: `rev-${crypto.randomUUID().slice(0, 8)}`,
          appointmentId: apt.id,
          doctorId: apt.doctorId,
          patientId: apt.patientId,
          patientName: apt.patientName,
          rating: Math.round(numericRating),
          comment: comment?.trim() || '',
          createdAt: new Date().toISOString(),
        };

        db.reviews.unshift(review);
        apt.reviewId = review.id;

        const doctor = db.doctors.find((d) => d.id === apt.doctorId);
        if (doctor) {
          const docReviews = db.reviews.filter((r) => r.doctorId === doctor.id);
          const avg =
            docReviews.reduce((sum, r) => sum + r.rating, 0) / Math.max(1, docReviews.length);
          doctor.rating = Number(avg.toFixed(1));
          doctor.reviewCount = docReviews.length;

          db.notifications.unshift({
            id: `noti-${crypto.randomUUID().slice(0, 8)}`,
            userId: doctor.userId,
            title: `Đánh giá mới (${review.rating}★)`,
            message: `${apt.patientName} đã đánh giá ${review.rating} sao cho ca khám ${apt.code}${review.comment ? `: "${review.comment}"` : '.'}`,
            type: 'APPOINTMENT',
            relatedId: apt.id,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }

        appendAuditLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: 'PATIENT',
          action: 'CREATE_REVIEW',
          targetType: 'APPOINTMENT',
          targetId: apt.id,
          detail: `Đánh giá ${review.rating} sao cho ${apt.doctorName} (${apt.code})`,
        });

        await saveDb(db);
        return { review, doctorRating: doctor?.rating ?? review.rating };
      });

      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== FR07: AI CHATBOT ====================
  app.post('/api/ai/chat', aiChatRateLimiter, async (req: Request, res: Response) => {
    try {
      const { message, history } = req.body as { message?: string; history?: ChatMessage[] };
      if (!message?.trim()) {
        res.status(400).json({ error: 'Vui lòng nhập nội dung câu hỏi.' });
        return;
      }
      const db = await getDb();
      const reply = await generateClinicAssistantReply(db, message.trim(), Array.isArray(history) ? history : []);
      res.json({ reply });
    } catch (error) {
      const errMsg = (error as Error).message || 'Lỗi kết nối trợ lý AI.';
      res.status(500).json({ error: errMsg });
    }
  });

  // ==================== FR08 & ADMIN MANAGEMENT ====================
  app.get('/api/admin/dashboard', authenticate, authorize('ADMIN'), async (_req: AuthedRequest, res: Response) => {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    const totalPatients = db.users.filter((u) => u.role === 'PATIENT').length;
    const totalDoctors = db.doctors.filter((d) => d.active).length;
    const totalAppointments = db.appointments.length;
    const todayAppointments = db.appointments.filter((a) => a.date === today).length;
    const completedAppointments = db.appointments.filter((a) => a.status === 'COMPLETED');
    const paidAppointments = db.appointments.filter((a) => a.paymentStatus === 'PAID');
    const estimatedRevenueVnd = paidAppointments.reduce((sum, a) => sum + (a.servicePriceVnd || 0), 0);

    const statusCounts: Record<AppointmentStatus, number> = {
      PENDING: 0,
      CONFIRMED: 0,
      CHECKED_IN: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      REJECTED: 0,
      NO_SHOW: 0,
    };
    for (const apt of db.appointments) {
      statusCounts[apt.status] = (statusCounts[apt.status] || 0) + 1;
    }

    // 7-day window (-3 to +3 days around today) for realistic clinic chart
    const dailyTrend: Array<{ date: string; label: string; count: number }> = [];
    for (let offset = -3; offset <= 3; offset++) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const iso = d.toISOString().slice(0, 10);
      const count = db.appointments.filter((a) => a.date === iso).length;
      dailyTrend.push({
        date: iso,
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        count,
      });
    }

    const specialtyStats = db.specialties.map((spec) => ({
      id: spec.id,
      name: spec.name,
      roomNumber: spec.roomNumber,
      appointmentCount: db.appointments.filter((a) => a.specialtyId === spec.id).length,
      doctorCount: db.doctors.filter((d) => d.specialtyId === spec.id && d.active).length,
    }));

    res.json({
      kpis: {
        totalPatients,
        totalDoctors,
        totalAppointments,
        todayAppointments,
        completedCount: completedAppointments.length,
        estimatedRevenueVnd,
        totalMedicalRecords: db.medicalRecords.length,
      },
      statusCounts,
      dailyTrend,
      specialtyStats,
    });
  });

  app.get('/api/admin/users', authenticate, authorize('ADMIN'), async (_req: AuthedRequest, res: Response) => {
    const db = await getDb();
    res.json({ users: db.users.map(sanitizeUser) });
  });

  app.patch('/api/admin/users/:id', authenticate, authorize('ADMIN'), async (req: AuthedRequest, res: Response) => {
    const { role, active, fullName, phone } = req.body as Partial<User>;
    const result = await withDbLock(async () => {
      const db = await getDb();
      const target = db.users.find((u) => u.id === req.params.id);
      if (!target) return { error: 'Không tìm thấy tài khoản.', status: 404 as const };
      if (role) target.role = role;
      if (active !== undefined) target.active = active;
      if (fullName !== undefined) target.fullName = fullName;
      if (phone !== undefined) target.phone = phone;

      appendAuditLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: 'ADMIN',
        action: 'UPDATE_USER_ACCOUNT',
        targetType: 'USER',
        targetId: target.id,
        detail: `Cập nhật tài khoản ${target.email} (Vai trò: ${target.role}, Trạng thái: ${target.active ? 'Hoạt động' : 'Khóa'})`,
      });
      await saveDb(db);
      return { user: sanitizeUser(target) };
    });

    if ('error' in result) {
      res.status(result.status ?? 400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  app.post('/api/admin/specialties', authenticate, authorize('ADMIN'), async (req: AuthedRequest, res: Response) => {
    const { name, description, roomNumber } = req.body as { name?: string; description?: string; roomNumber?: string };
    if (!name?.trim() || !roomNumber?.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập tên chuyên khoa và số phòng.' });
      return;
    }
    const spec = await withDbLock(async () => {
      const db = await getDb();
      const item = {
        id: `spec-${crypto.randomUUID().slice(0, 6)}`,
        name: name.trim(),
        slug: name
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '-'),
        description: description?.trim() || '',
        roomNumber: roomNumber.trim(),
        active: true,
      };
      db.specialties.push(item);
      appendAuditLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: 'ADMIN',
        action: 'CREATE_SPECIALTY',
        targetType: 'SPECIALTY',
        targetId: item.id,
        detail: `Thêm chuyên khoa ${item.name} (${item.roomNumber})`,
      });
      await saveDb(db);
      return item;
    });
    res.status(201).json({ specialty: spec });
  });

  app.delete('/api/admin/specialties/:id', authenticate, authorize('ADMIN'), async (req: AuthedRequest, res: Response) => {
    await withDbLock(async () => {
      const db = await getDb();
      const item = db.specialties.find((s) => s.id === req.params.id);
      if (item) {
        item.active = false;
        appendAuditLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: 'ADMIN',
          action: 'ARCHIVE_SPECIALTY',
          targetType: 'SPECIALTY',
          targetId: item.id,
          detail: `Ngừng kích hoạt chuyên khoa ${item.name}`,
        });
        await saveDb(db);
      }
    });
    res.json({ ok: true });
  });

  app.post(
    '/api/uploads/doctor-avatar',
    authenticate,
    authorize('DOCTOR', 'ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const { imageData, doctorId } = req.body as { imageData?: string; doctorId?: string };
        if (!imageData || !imageData.trim()) {
          res.status(400).json({ error: 'Vui lòng cung cấp dữ liệu hoặc đường dẫn ảnh.' });
          return;
        }
        const uploaded = await uploadDoctorAvatar(imageData, doctorId || req.auth!.sub);
        res.status(201).json(uploaded);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    },
  );

  app.post('/api/admin/doctors', authenticate, authorize('ADMIN'), async (req: AuthedRequest, res: Response) => {
    try {
      const {
        email,
        password,
        fullName,
        phone,
        title,
        qualifications,
        contactEmail,
        specialtyId,
        experienceYears,
        consultationFeeVnd,
        roomNumber,
        bio,
        avatarUrl,
      } = req.body as {
        email?: string;
        password?: string;
        fullName?: string;
        phone?: string;
        title?: string;
        qualifications?: string;
        contactEmail?: string;
        specialtyId?: string;
        experienceYears?: number;
        consultationFeeVnd?: number;
        roomNumber?: string;
        bio?: string;
        avatarUrl?: string;
      };
      if (!email || !fullName || !specialtyId) {
        res.status(400).json({ error: 'Thiếu thông tin bắt buộc của bác sĩ.' });
        return;
      }

      const doctorId = `doc-${crypto.randomUUID().slice(0, 6)}`;
      let resolvedAvatarUrl = '/src/assets/images/doctor_portrait_cardiology_1795142594653.jpg';
      let resolvedAvatarPublicId: string | undefined;
      if (avatarUrl && avatarUrl.trim()) {
        if (avatarUrl.trim().startsWith('data:image/')) {
          const uploaded = await uploadDoctorAvatar(avatarUrl.trim(), doctorId);
          resolvedAvatarUrl = uploaded.url;
          resolvedAvatarPublicId = uploaded.publicId;
        } else {
          resolvedAvatarUrl = avatarUrl.trim();
        }
      }

      const result = await withDbLock(async () => {
        const db = await getDb();
        const normalizedEmail = String(email).trim().toLowerCase();
        if (db.users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
          return { error: 'Email tài khoản bác sĩ đã tồn tại.', status: 409 as const };
        }
        const passwordHash = await bcrypt.hash(password || 'Doctor@123', 10);
        const userId = `usr-doc-${crypto.randomUUID().slice(0, 6)}`;
        const spec = db.specialties.find((s) => s.id === specialtyId);

        const newUser: User = {
          id: userId,
          email: normalizedEmail,
          passwordHash,
          fullName: fullName.trim(),
          phone: phone || '0900000000',
          role: 'DOCTOR',
          active: true,
          createdAt: new Date().toISOString(),
        };
        const newDoctor = {
          id: doctorId,
          userId,
          fullName: fullName.trim(),
          title: title || 'Bác sĩ chuyên khoa',
          qualifications: qualifications?.trim() || '',
          specialtyId,
          experienceYears: Number(experienceYears) || 5,
          bio: bio || `Bác sĩ chuyên khoa ${spec?.name || ''} tại ClinicCare.`,
          consultationFeeVnd: Number(consultationFeeVnd) || 300000,
          avatarUrl: resolvedAvatarUrl,
          avatarPublicId: resolvedAvatarPublicId,
          roomNumber: roomNumber || spec?.roomNumber || 'P.101',
          contactEmail: contactEmail?.trim() || normalizedEmail,
          rating: 5.0,
          reviewCount: 0,
          active: true,
        };

        const defaultShifts: Record<number, { enabled: boolean; morningStart: string; morningEnd: string; afternoonStart: string; afternoonEnd: string }> = {};
        for (let d = 0; d <= 6; d++) {
          defaultShifts[d] = {
            enabled: d >= 1 && d <= 6,
            morningStart: '08:00',
            morningEnd: '11:30',
            afternoonStart: '13:30',
            afternoonEnd: '17:00',
          };
        }

        db.users.push(newUser);
        db.doctors.push(newDoctor);
        db.schedules.push({
          doctorId,
          slotDurationMinutes: 30,
          weeklyShifts: defaultShifts,
          blockedDates: [],
        });

        appendAuditLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: 'ADMIN',
          action: 'CREATE_DOCTOR',
          targetType: 'USER',
          targetId: doctorId,
          detail: `Thêm bác sĩ ${newDoctor.fullName} (${spec?.name || specialtyId})`,
        });
        await saveDb(db);
        return { doctor: newDoctor };
      });

      if ('error' in result) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/admin/doctors', authenticate, authorize('ADMIN'), async (_req: AuthedRequest, res: Response) => {
    const db = await getDb();
    res.json({ doctors: db.doctors });
  });

  app.patch(
    '/api/doctors/:id',
    authenticate,
    authorize('DOCTOR', 'ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      try {
        const doctorId = req.params.id;
        const {
          fullName,
          phone,
          title,
          qualifications,
          specialtyId,
          experienceYears,
          bio,
          consultationFeeVnd,
          roomNumber,
          contactEmail,
          avatarUrl,
          active,
        } = req.body as {
          fullName?: string;
          phone?: string;
          title?: string;
          qualifications?: string;
          specialtyId?: string;
          experienceYears?: number;
          bio?: string;
          consultationFeeVnd?: number;
          roomNumber?: string;
          contactEmail?: string;
          avatarUrl?: string;
          active?: boolean;
        };

        const preCheckDb = await getDb();
        const existingDoctor = preCheckDb.doctors.find((d) => d.id === doctorId);
        if (!existingDoctor) {
          res.status(404).json({ error: 'Không tìm thấy hồ sơ bác sĩ.' });
          return;
        }
        if (req.auth!.role === 'DOCTOR' && existingDoctor.userId !== req.auth!.sub) {
          res.status(403).json({
            error: 'Bạn chỉ được phép chỉnh sửa thông tin hồ sơ của chính mình.',
          });
          return;
        }

        let resolvedAvatarUrl = avatarUrl?.trim();
        let resolvedAvatarPublicId: string | undefined = req.body.avatarPublicId;
        if (resolvedAvatarUrl && resolvedAvatarUrl.startsWith('data:image/')) {
          const uploaded = await uploadDoctorAvatar(resolvedAvatarUrl, doctorId);
          resolvedAvatarUrl = uploaded.url;
          resolvedAvatarPublicId = uploaded.publicId;
        }

        const prevAvatarPublicId = existingDoctor.avatarPublicId;
        const prevAvatarUrl = existingDoctor.avatarUrl;

        const result = await withDbLock(async () => {
          const db = await getDb();
          const doctor = db.doctors.find((d) => d.id === doctorId);
          if (!doctor) {
            return { error: 'Không tìm thấy hồ sơ bác sĩ.', status: 404 as const };
          }

          if (req.auth!.role === 'DOCTOR' && doctor.userId !== req.auth!.sub) {
            return {
              error: 'Bạn chỉ được phép chỉnh sửa thông tin hồ sơ của chính mình.',
              status: 403 as const,
            };
          }

          const linkedUser = db.users.find((u) => u.id === doctor.userId);

          if (fullName !== undefined && fullName.trim()) {
            doctor.fullName = fullName.trim();
            if (linkedUser) linkedUser.fullName = fullName.trim();
            for (const apt of db.appointments) {
              if (
                apt.doctorId === doctor.id &&
                ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(apt.status)
              ) {
                apt.doctorName = doctor.fullName;
              }
            }
          }
          if (phone !== undefined && linkedUser) {
            linkedUser.phone = phone.trim();
          }
          if (title !== undefined) doctor.title = title.trim();
          if (qualifications !== undefined) doctor.qualifications = qualifications.trim();
          if (experienceYears !== undefined && !Number.isNaN(Number(experienceYears))) {
            doctor.experienceYears = Math.max(0, Number(experienceYears));
          }
          if (bio !== undefined) doctor.bio = bio.trim();
          if (consultationFeeVnd !== undefined && !Number.isNaN(Number(consultationFeeVnd))) {
            doctor.consultationFeeVnd = Math.max(0, Number(consultationFeeVnd));
          }
          if (roomNumber !== undefined) doctor.roomNumber = roomNumber.trim();
          if (contactEmail !== undefined) doctor.contactEmail = contactEmail.trim();
          if (resolvedAvatarUrl) {
            doctor.avatarUrl = resolvedAvatarUrl;
            doctor.avatarPublicId = resolvedAvatarPublicId;
          }

          if (req.auth!.role === 'ADMIN') {
            if (specialtyId !== undefined) {
              const spec = db.specialties.find((s) => s.id === specialtyId);
              if (!spec) {
                return { error: 'Chuyên khoa không tồn tại.', status: 400 as const };
              }
              doctor.specialtyId = specialtyId;
            }
            if (active !== undefined) {
              doctor.active = Boolean(active);
            }
          }

          appendAuditLog(db, {
            actorId: req.auth!.sub,
            actorName: req.auth!.fullName,
            actorRole: req.auth!.role,
            action: 'UPDATE_DOCTOR_PROFILE',
            targetType: 'USER',
            targetId: doctor.id,
            detail: `Cập nhật thông tin bác sĩ ${doctor.fullName} (${doctor.roomNumber})`,
          });

          await saveDb(db);
          return {
            doctor,
            user: linkedUser ? sanitizeUser(linkedUser) : null,
          };
        });

        if ('error' in result) {
          res.status(result.status ?? 400).json({ error: result.error });
          return;
        }

        if (resolvedAvatarUrl && resolvedAvatarUrl !== prevAvatarUrl) {
          deleteDoctorAvatar(prevAvatarPublicId, prevAvatarUrl).catch(() => undefined);
        }

        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    },
  );

  app.post('/api/admin/services', authenticate, authorize('ADMIN'), async (req: AuthedRequest, res: Response) => {
    const { specialtyId, name, description, priceVnd, durationMinutes } = req.body;
    if (!specialtyId || !name || !priceVnd) {
      res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin dịch vụ.' });
      return;
    }
    const service = await withDbLock(async () => {
      const db = await getDb();
      const item = {
        id: `srv-${crypto.randomUUID().slice(0, 6)}`,
        specialtyId,
        name: String(name).trim(),
        description: String(description || '').trim(),
        priceVnd: Number(priceVnd),
        durationMinutes: Number(durationMinutes) || 30,
        active: true,
      };
      db.services.push(item);
      appendAuditLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: 'ADMIN',
        action: 'CREATE_SERVICE',
        targetType: 'SERVICE',
        targetId: item.id,
        detail: `Thêm dịch vụ "${item.name}" (${item.priceVnd.toLocaleString('vi-VN')}đ)`,
      });
      await saveDb(db);
      return item;
    });
    res.status(201).json({ service });
  });

  app.delete('/api/admin/services/:id', authenticate, authorize('ADMIN'), async (req: AuthedRequest, res: Response) => {
    await withDbLock(async () => {
      const db = await getDb();
      const srv = db.services.find((s) => s.id === req.params.id);
      if (srv) {
        srv.active = false;
        appendAuditLog(db, {
          actorId: req.auth!.sub,
          actorName: req.auth!.fullName,
          actorRole: 'ADMIN',
          action: 'ARCHIVE_SERVICE',
          targetType: 'SERVICE',
          targetId: srv.id,
          detail: `Ngừng áp dụng dịch vụ "${srv.name}"`,
        });
        await saveDb(db);
      }
    });
    res.json({ ok: true });
  });

  app.get('/api/admin/audit-logs', authenticate, authorize('ADMIN'), async (_req: AuthedRequest, res: Response) => {
    const db = await getDb();
    res.json({ logs: db.auditLogs, backups: db.backups });
  });

  app.post('/api/admin/backup', authenticate, authorize('ADMIN'), async (req: AuthedRequest, res: Response) => {
    const result = await withDbLock(async () => {
      const db = await getDb();
      const { meta, content } = createBackupSnapshot(db, req.auth!.fullName);
      appendAuditLog(db, {
        actorId: req.auth!.sub,
        actorName: req.auth!.fullName,
        actorRole: 'ADMIN',
        action: 'CREATE_DB_BACKUP',
        targetType: 'BACKUP',
        targetId: meta.id,
        detail: `Tạo bản sao lưu cơ sở dữ liệu (${meta.filename})`,
      });
      await saveDb(db);
      return { meta, content };
    });
    res.status(201).json(result);
  });

  async function dispatchUpcomingReminders(actorName = 'Hệ thống tự động'): Promise<number> {
    const emailJobs: Array<Parameters<typeof sendAppointmentEmail>[0]> = [];

    const sentCount = await withDbLock(async () => {
      const db = await getDb();
      const now = new Date();
      const todayIso = now.toISOString().slice(0, 10);
      const tomorrow = new Date(now);
      tomorrow.setUTCDate(now.getUTCDate() + 1);
      const tomorrowIso = tomorrow.toISOString().slice(0, 10);

      const targets = db.appointments.filter(
        (a) =>
          a.status === 'CONFIRMED' &&
          !a.reminderSentAt &&
          a.date >= todayIso &&
          a.date <= tomorrowIso,
      );

      if (targets.length === 0) return 0;

      const timestamp = now.toISOString();
      for (const apt of targets) {
        apt.reminderSentAt = timestamp;
        const patient = db.users.find((u) => u.id === apt.patientId);
        const doctor = db.doctors.find((d) => d.id === apt.doctorId);

        db.notifications.unshift({
          id: `noti-${crypto.randomUUID().slice(0, 8)}`,
          userId: apt.patientId,
          title: `Nhắc lịch khám ${apt.code}`,
          message: `Bạn có lịch khám với ${apt.doctorName} vào ${apt.timeSlot} ngày ${apt.date}${doctor ? ` tại ${doctor.roomNumber}` : ''}. Vui lòng mang mã QR Check-in.`,
          type: 'APPOINTMENT',
          relatedId: apt.id,
          read: false,
          createdAt: timestamp,
        });

        if (patient?.email) {
          emailJobs.push({
            toEmail: patient.email,
            patientName: apt.patientName,
            appointmentCode: apt.code,
            doctorName: apt.doctorName,
            specialtyName: apt.specialtyName,
            date: apt.date,
            timeSlot: apt.timeSlot,
            roomNumber: doctor?.roomNumber,
            type: 'REMINDER_24H',
          });
        }
      }

      appendAuditLog(db, {
        actorId: 'system',
        actorName,
        actorRole: 'SYSTEM',
        action: 'DISPATCH_REMINDERS',
        targetType: 'APPOINTMENT',
        targetId: 'batch-reminders',
        detail: `Gửi nhắc lịch tự động cho ${targets.length} lịch hẹn sắp tới`,
      });

      await saveDb(db);
      return targets.length;
    });

    for (const job of emailJobs) {
      sendAppointmentEmail(job).catch(() => undefined);
    }
    return sentCount;
  }

  app.post(
    '/api/admin/send-reminders',
    authenticate,
    authorize('ADMIN'),
    async (req: AuthedRequest, res: Response) => {
      const sentCount = await dispatchUpcomingReminders(req.auth!.fullName);
      res.json({ sentCount });
    },
  );

  // Dispatch 24h reminders at startup and every 30 minutes
  dispatchUpcomingReminders().catch(() => undefined);
  const reminderTimer = setInterval(() => {
    dispatchUpcomingReminders().catch(() => undefined);
  }, 30 * 60 * 1000);
  reminderTimer.unref();

  // ==================== VITE / STATIC SERVING ====================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ClinicCare server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ClinicCare server:', err);
  process.exit(1);
});
