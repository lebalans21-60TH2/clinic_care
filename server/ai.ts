import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { ChatMessage } from '../src/types/clinic.ts';
import type { DatabaseSchema } from './db.ts';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function generateClinicAssistantReply(
  db: DatabaseSchema,
  message: string,
  history: ChatMessage[],
): Promise<string> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      'Chưa cấu hình GEMINI_API_KEY trên máy chủ. Vui lòng thiết lập khóa API trong Settings > Secrets.',
    );
  }

  const specialtiesSummary = db.specialties
    .filter((s) => s.active)
    .map((s) => `- ${s.name} (Phòng ${s.roomNumber}): ${s.description}`)
    .join('\n');

  const doctorsSummary = db.doctors
    .filter((d) => d.active)
    .map((d) => {
      const spec = db.specialties.find((s) => s.id === d.specialtyId)?.name ?? 'Đa khoa';
      return `- ${d.fullName} (${d.title} - Chuyên khoa ${spec}, kinh nghiệm ${d.experienceYears} năm, phí khám ${d.consultationFeeVnd.toLocaleString('vi-VN')}đ, Phòng ${d.roomNumber})`;
    })
    .join('\n');

  const servicesSummary = db.services
    .filter((s) => s.active)
    .map((s) => `- ${s.name}: ${s.priceVnd.toLocaleString('vi-VN')}đ (${s.durationMinutes} phút)`)
    .join('\n');

  const systemInstruction = `Bạn là Trợ lý Y tế Ảo chính thức của phòng khám tư nhân ClinicCare.
Nhiệm vụ của bạn:
1. Hướng dẫn bệnh nhân quy trình đặt lịch khám trực tuyến trên ClinicCare (Đăng nhập -> Chọn chuyên khoa -> Chọn bác sĩ -> Chọn ngày & khung giờ còn trống -> Nhập triệu chứng -> Xác nhận & nhận mã QR Check-in).
2. Tra cứu thông tin chính xác về chuyên khoa, bác sĩ, dịch vụ, chi phí và giờ làm việc dựa trên dữ liệu thực tế của phòng khám bên dưới.
3. Gợi ý chuyên khoa phù hợp dựa trên triệu chứng ban đầu mà bệnh nhân mô tả, NHƯNG luôn kèm lưu ý ngắn gọn rằng gợi ý chỉ mang tính tham khảo và không thay thế chẩn đoán trực tiếp của bác sĩ. Nếu có dấu hiệu cấp cứu (đau ngực dữ dội, khó thở cấp, mất ý thức...), khuyên đến cơ sở cấp cứu ngay.
4. Trả lời bằng tiếng Việt lịch sự, rõ ràng, súc tích, không bịa đặt thông tin bác sĩ hay dịch vụ không có trong danh sách.

Giờ làm việc phòng khám: Thứ 2 - Thứ 6 (08:00 - 11:30 và 13:30 - 17:00), Thứ 7 (08:00 - 11:30 và 13:30 - 16:30), Chủ nhật nghỉ.

DANH SÁCH CHUYÊN KHOA HIỆN CÓ:
${specialtiesSummary}

ĐỘI NGŨ BÁC SĨ:
${doctorsSummary}

DỊCH VỤ & BẢNG GIÁ THAM KHẢO:
${servicesSummary}`;

  const recentHistory = history
    .slice(-8)
    .map((item) => `${item.role === 'user' ? 'Bệnh nhân' : 'Trợ lý ClinicCare'}: ${item.text}`)
    .join('\n');

  const prompt = recentHistory
    ? `Lịch sử hội thoại gần đây:\n${recentHistory}\n\nCâu hỏi mới của bệnh nhân: ${message}`
    : message;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Không nhận được phản hồi từ trợ lý AI. Vui lòng thử lại.');
  }
  return text;
}
