'use client';

import Link from 'next/link';
import { useLang, type LangCode } from '@/lib/useLang';

const DICT: Record<LangCode, {
  title: string; body: string; spamHint: string; hours: string;
  cta: string; wrongEmail: string; createAccount: string;
}> = {
  es: {
    title: 'Revisa tu email',
    body: 'Te enviamos un enlace de verificación. Haz clic en él para activar tu cuenta.',
    spamHint: 'Si no lo ves en tu bandeja de entrada, revisa la carpeta de spam. El enlace es válido por',
    hours: '24 horas',
    cta: 'Configurar mi workspace →',
    wrongEmail: '¿Equivocaste el email?',
    createAccount: 'Crear otra cuenta',
  },
  en: {
    title: 'Check your email',
    body: 'We sent you a verification link. Click it to activate your account.',
    spamHint: "If you don't see it in your inbox, check your spam folder. The link is valid for",
    hours: '24 hours',
    cta: 'Set up my workspace →',
    wrongEmail: 'Wrong email?',
    createAccount: 'Create another account',
  },
  pt: {
    title: 'Verifique seu e-mail',
    body: 'Enviamos um link de verificação para você. Clique nele para ativar sua conta.',
    spamHint: 'Se não estiver na caixa de entrada, verifique a pasta de spam. O link é válido por',
    hours: '24 horas',
    cta: 'Configurar meu workspace →',
    wrongEmail: 'E-mail errado?',
    createAccount: 'Criar outra conta',
  },
  tr: {
    title: 'E-postanızı kontrol edin',
    body: 'Size bir doğrulama bağlantısı gönderdik. Hesabınızı etkinleştirmek için tıklayın.',
    spamHint: 'Gelen kutunuzda görmüyorsanız spam klasörünü kontrol edin. Bağlantı geçerliliği:',
    hours: '24 saat',
    cta: 'Çalışma alanımı kur →',
    wrongEmail: 'E-postayı yanlış mı girdiniz?',
    createAccount: 'Başka bir hesap oluştur',
  },
  ar: {
    title: 'تحقق من بريدك الإلكتروني',
    body: 'أرسلنا لك رابط تحقق. انقر عليه لتفعيل حسابك.',
    spamHint: 'إذا لم تجده في صندوق الوارد، تحقق من مجلد البريد العشوائي. الرابط صالح لمدة',
    hours: '٢٤ ساعة',
    cta: '← إعداد مساحة العمل',
    wrongEmail: 'أدخلت بريداً خاطئاً؟',
    createAccount: 'إنشاء حساب آخر',
  },
};

export default function VerifyEmailSentPage() {
  const { lang } = useLang();
  const t = DICT[lang];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '48px 40px',
        maxWidth: 480, width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📧</div>
        <h1 style={{ margin: '0 0 12px', color: '#1e1b4b', fontSize: 24, fontWeight: 700 }}>
          {t.title}
        </h1>
        <p style={{ color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
          {t.body}
        </p>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 32px' }}>
          {t.spamHint} <strong>{t.hours}</strong>.
        </p>
        <Link
          href="/onboarding"
          style={{
            display: 'inline-block', padding: '12px 28px',
            background: '#6366f1', color: '#fff', borderRadius: 10,
            textDecoration: 'none', fontWeight: 600, fontSize: 15,
          }}
        >
          {t.cta}
        </Link>
        <p style={{ marginTop: 24, color: '#94a3b8', fontSize: 13 }}>
          {t.wrongEmail}{' '}
          <Link href="/register" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 500 }}>
            {t.createAccount}
          </Link>
        </p>
      </div>
    </div>
  );
}
