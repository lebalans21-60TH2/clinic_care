import { v2 as cloudinary } from 'cloudinary';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const UPLOADS_ROOT_DIR = path.resolve(process.cwd(), 'data', 'uploads');
const AVATAR_UPLOAD_DIR = path.join(UPLOADS_ROOT_DIR, 'avatars');

function configureCloudinary(): boolean {
  const cloudUrl = process.env.CLOUDINARY_URL?.trim();
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (cloudUrl) {
    cloudinary.config({ secure: true });
    return true;
  }
  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    return true;
  }
  return false;
}

export function isCloudinaryConfigured(): boolean {
  return configureCloudinary();
}

function sanitizePublicId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'doctor';
}

export async function uploadDoctorAvatar(
  imageInput: string,
  doctorIdentifier = 'doctor',
): Promise<{ url: string; publicId?: string; storage: 'cloudinary' | 'local' | 'external' }> {
  const trimmed = imageInput.trim();
  if (!trimmed) {
    throw new Error('Vui lòng cung cấp dữ liệu hoặc đường dẫn hình ảnh hợp lệ.');
  }

  const isDataUri = /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(trimmed);
  const isRemoteUrl = /^https?:\/\//i.test(trimmed);
  const isLocalAsset = trimmed.startsWith('/');

  if (!isDataUri && !isRemoteUrl && !isLocalAsset) {
    throw new Error('Định dạng hình ảnh không hợp lệ.');
  }

  if (configureCloudinary() && (isDataUri || isRemoteUrl)) {
    const safeId = sanitizePublicId(doctorIdentifier);
    const result = await cloudinary.uploader.upload(trimmed, {
      folder: 'cliniccare/doctors',
      public_id: `${safeId}_${Date.now()}`,
      overwrite: true,
      resource_type: 'image',
      transformation: [
        { width: 512, height: 512, crop: 'fill', gravity: 'face' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
    });
    return {
      url: result.secure_url,
      publicId: result.public_id,
      storage: 'cloudinary',
    };
  }

  if (isDataUri) {
    const match = trimmed.match(/^data:image\/(png|jpe?g|webp|gif|avif);base64,(.+)$/i);
    if (!match) {
      throw new Error('Dữ liệu ảnh base64 không hợp lệ.');
    }
    const rawExt = match[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('Dung lượng ảnh vượt quá giới hạn 5MB.');
    }

    if (!fs.existsSync(AVATAR_UPLOAD_DIR)) {
      fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });
    }
    const filename = `${sanitizePublicId(doctorIdentifier)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const filePath = path.join(AVATAR_UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    return {
      url: `/uploads/avatars/${filename}`,
      storage: 'local',
    };
  }

  return {
    url: trimmed,
    storage: 'external',
  };
}

export async function deleteDoctorAvatar(publicId?: string, previousUrl?: string): Promise<void> {
  if (publicId && configureCloudinary()) {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (err) {
      console.warn('[ClinicCare Cloudinary] Không thể xóa ảnh cũ:', (err as Error).message);
    }
  }
  if (previousUrl && previousUrl.startsWith('/uploads/avatars/')) {
    const filename = path.basename(previousUrl);
    const localPath = path.join(AVATAR_UPLOAD_DIR, filename);
    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
      } catch {
        // Ignore cleanup failure
      }
    }
  }
}
