'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { submitCsat } from '@/lib/api';
import { useLang, type LangCode } from '@/lib/useLang';

const DICT: Record<LangCode, {
  title: string; subtitle: string; comment: string;
  sending: string; submit: string;
  thanks: string; thanksBody: string; error: string;
  labels: Record<number, string>;
}> = {
  es: {
    title: '¿Cómo fue tu experiencia?',
    subtitle: 'Comparte tu valoración sobre la atención recibida.',
    comment: 'Comentario opcional…',
    sending: 'Enviando…',
    submit: 'Enviar valoración',
    thanks: '¡Gracias por tu valoración!',
    thanksBody: 'Tu opinión nos ayuda a mejorar.',
    error: 'Error al enviar. Por favor intenta de nuevo.',
    labels: { 1: '😞 Muy insatisfecho', 2: '😕 Insatisfecho', 3: '😐 Neutral', 4: '😊 Satisfecho', 5: '😄 Muy satisfecho' },
  },
  en: {
    title: 'How was your experience?',
    subtitle: 'Share your rating about the service received.',
    comment: 'Optional comment…',
    sending: 'Sending…',
    submit: 'Submit rating',
    thanks: 'Thank you for your rating!',
    thanksBody: 'Your feedback helps us improve.',
    error: 'Error sending. Please try again.',
    labels: { 1: '😞 Very unsatisfied', 2: '😕 Unsatisfied', 3: '😐 Neutral', 4: '😊 Satisfied', 5: '😄 Very satisfied' },
  },
  pt: {
    title: 'Como foi sua experiência?',
    subtitle: 'Compartilhe sua avaliação sobre o atendimento recebido.',
    comment: 'Comentário opcional…',
    sending: 'Enviando…',
    submit: 'Enviar avaliação',
    thanks: 'Obrigado pela sua avaliação!',
    thanksBody: 'Sua opinião nos ajuda a melhorar.',
    error: 'Erro ao enviar. Por favor tente novamente.',
    labels: { 1: '😞 Muito insatisfeito', 2: '😕 Insatisfeito', 3: '😐 Neutro', 4: '😊 Satisfeito', 5: '😄 Muito satisfeito' },
  },
  tr: {
    title: 'Deneyiminiz nasıldı?',
    subtitle: 'Aldığınız hizmet hakkındaki değerlendirmenizi paylaşın.',
    comment: 'İsteğe bağlı yorum…',
    sending: 'Gönderiliyor…',
    submit: 'Değerlendirme gönder',
    thanks: 'Değerlendirmeniz için teşekkürler!',
    thanksBody: 'Geri bildiriminiz iyileşmemize yardımcı olur.',
    error: 'Gönderim hatası. Lütfen tekrar deneyin.',
    labels: { 1: '😞 Çok memnun değilim', 2: '😕 Memnun değilim', 3: '😐 Nötr', 4: '😊 Memnunum', 5: '😄 Çok memnunum' },
  },
  ar: {
    title: 'كيف كانت تجربتك؟',
    subtitle: 'شارك تقييمك حول الخدمة المقدمة.',
    comment: 'تعليق اختياري…',
    sending: 'جارٍ الإرسال…',
    submit: 'إرسال التقييم',
    thanks: 'شكراً لتقييمك!',
    thanksBody: 'رأيك يساعدنا على التحسين.',
    error: 'خطأ في الإرسال. يرجى المحاولة مرة أخرى.',
    labels: { 1: '😞 غير راضٍ جداً', 2: '😕 غير راضٍ', 3: '😐 محايد', 4: '😊 راضٍ', 5: '😄 راضٍ جداً' },
  },
};

const STARS = [1, 2, 3, 4, 5];

export default function SurveyPage() {
  const { token } = useParams<{ token: string }>();
  const { lang } = useLang();
  const t = DICT[lang];

  const [score,   setScore]   = useState(0);
  const [comment, setComment] = useState('');
  const [state,   setState]   = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errMsg,  setErrMsg]  = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!score) return;
    setState('sending');
    try {
      const res = await submitCsat(token, score, comment || undefined);
      if (res?.error) { setErrMsg(res.error); setState('error'); return; }
      setState('done');
    } catch {
      setErrMsg(t.error);
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '48px 40px', maxWidth: 420, textAlign: 'center', boxShadow: '0 4px 32px rgba(0,0,0,.08)' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>{t.thanks}</h2>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 15 }}>{t.thanksBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px', maxWidth: 440, width: '100%', boxShadow: '0 4px 32px rgba(0,0,0,.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
          <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>{t.title}</h2>
          <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>{t.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Star picker */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 8 }}>
            {STARS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScore(s)}
                style={{
                  fontSize: 36, background: 'none', border: 'none', cursor: 'pointer',
                  opacity: s <= score ? 1 : 0.3, transition: 'all .15s',
                  transform: s === score ? 'scale(1.25)' : 'scale(1)',
                }}
              >
                ★
              </button>
            ))}
          </div>
          {score > 0 && (
            <p style={{ textAlign: 'center', fontSize: 14, color: '#374151', margin: '0 0 20px', fontWeight: 500 }}>
              {t.labels[score]}
            </p>
          )}

          {/* Comment */}
          <div style={{ marginBottom: 20 }}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t.comment}
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8,
                border: '1px solid #d1d5db', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {state === 'error' && (
            <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{errMsg}</p>
          )}

          <button
            type="submit"
            disabled={!score || state === 'sending'}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              background: score ? '#2563eb' : '#e5e7eb',
              color: score ? '#fff' : '#9ca3af',
              fontWeight: 600, fontSize: 15, cursor: score ? 'pointer' : 'not-allowed',
              transition: 'background .2s',
            }}
          >
            {state === 'sending' ? t.sending : t.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
