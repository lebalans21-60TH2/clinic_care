import { Bot, MessageSquare, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api';
import type { ChatMessage } from '../types/clinic';

const SUGGESTIONS = [
  'Quy trình đặt lịch khám tại ClinicCare?',
  'Khám Tim mạch có những bác sĩ và phí thế nào?',
  'Tôi bị nghẹt mũi kéo dài nên khám khoa nào?',
];

export function AiChatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: 'Xin chào! Tôi là Trợ lý Y tế ClinicCare. Tôi có thể hỗ trợ bạn tra cứu chuyên khoa, bác sĩ, chi phí khám hoặc hướng dẫn đặt lịch hẹn trực tuyến.',
      timestamp: new Date().toISOString(),
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const sendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      role: 'user',
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const { reply } = await api.chatWithAi(trimmed, messages);
      setMessages([
        ...nextHistory,
        {
          role: 'model',
          text: reply,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-3 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-xl shadow-lg transition-transform hover:-translate-y-0.5 whitespace-nowrap"
          aria-label="Mở trợ lý y tế AI"
        >
          <MessageSquare className="w-4 h-4 shrink-0" />
          <span>Trợ lý y tế AI</span>
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-5 right-5 z-50 w-[min(400px,calc(100vw-2rem))] h-[min(560px,calc(100vh-3rem))] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Trợ lý Y tế AI ClinicCare"
        >
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white">
            <div className="flex items-center gap-2.5">
              <Bot className="w-5 h-5 text-teal-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold leading-tight">Trợ lý Y tế ClinicCare</div>
                <div className="text-xs text-slate-300">Hỗ trợ tra cứu & hướng dẫn đặt lịch</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg transition-colors"
              aria-label="Thu gọn trợ lý AI"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-teal-700 text-white'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-xl text-sm bg-white text-slate-500 border border-slate-200">
                  Đang tra cứu thông tin phòng khám...
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                {error}
              </div>
            )}

            {messages.length === 1 && (
              <div className="pt-2 space-y-1.5">
                <p className="text-xs text-slate-500">Gợi ý câu hỏi nhanh:</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage(s)}
                    className="block w-full text-left px-3 py-2 text-xs text-teal-800 bg-white hover:bg-teal-50 border border-slate-200 rounded-lg transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-200 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập triệu chứng hoặc câu hỏi..."
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-3.5 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg transition-colors"
              aria-label="Gửi tin nhắn"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
