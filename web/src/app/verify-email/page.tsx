'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail } from '@/lib/api';
import { useLang, type LangCode } from '@/lib/useLang';

const DICT: Record<LangCode, {
  loading: string; verifiedTitle: string; verifiedBody: string; goToDash: string;
  invalidTitle: string; noToken: string; alreadyUsed: string;
}> = {
  es: {
    loading: 'Verificando tu email…',
    verifiedTitle: '¡Email verificado!',
    verifiedBody: 'Tu dirección de email ha sido confirmada correctamente. Ya puedes usar todas las funciones del CRM.',
    goToDash: 'Ir al dashboard →',
    invalidTitle: 'Enlace inválido',
    noToken: 'No se encontró el token de verificación en el enlace.',
    alreadyUsed: 'El enlace es inválido o ya fue usado.',
  },
  en: {
    loading: 'Verifying your email…',
    verifiedTitle: 'Email verified!',
    verifiedBody: 'Your email address has been confirmed. You can now use all CRM features.',
    goToDash: 'Go to dashboard →',
    invalidTitle: 'Invalid link',
    noToken: 'No verification token found in the link.',
    alreadyUsed: 'The link is invalid or has already been used.',
  },
  pt: {
    loading: 'Verificando seu e-mail…',
    verifiedTitle: 'E-mail verificado!',
    verifiedBody: 'Seu endereço de e-mail foi confirmado. Você já pode usar todos os recursos do CRM.',
    goToDash: 'Ir ao painel →',
    invalidTitle: 'Link inválido',
    noToken: 'Nenhum token de verificação encontrado no link.',
    alreadyUsed: 'O link é inválido ou já foi usado.',
  },
  tr: {
    loading: 'E-postanız doğrulanıyor…',
    verifiedTitle: 'E-posta doğrulandı!',
    verifiedBody: 'E-posta adresiniz onaylandı. Artık tüm CRM özelliklerini kullanabilirsiniz.',
    goToDash: 'Panele git →',
    invalidTitle: 'Geçersiz bağlantı',
    noToken: 'Bağlantıda doğrulama jetonu bulunamadı.',
    alreadyUsed: 'Bağlantı geçersiz veya zaten kullanılmış.',
  },
  ar: {
    loading: 'جارٍ التحقق من بريدك الإلكتروني…',
    verifiedTitle: 'تم التحقق من البريد الإلكتروني!',
    verifiedBody: 'تم تأكيد عنوان بريدك الإلكتروني. يمكنك الآن استخدام جميع ميزات CRM.',
    goToDash: '← الذهاب إلى لوحة التحكم',
    invalidTitle: 'رابط غير صالح',
    noToken: 'لم يتم العثور على رمز التحقق في الرابط.',
    alreadyUsed: 'الرابط غير صالح أو تم استخدامه بالفعل.',
  },
};

type Status = 'loading' | 'success' | 'error';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const { lang } = useLang();
  const t = DICT[lang];

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg(t.noToken);
      return;
    }
    verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: Error) => {
        setErrorMsg(err.message || t.alreadyUsed);
        setStatus('error');
      });
  }, [token]);

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: 24,
  };
  const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 20, padding: '48px 40px',
    maxWidth: 440, width: '100%', textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  };
  const btnStyle: React.CSSProperties = {
    display: 'inline-block', padding: '12px 28px',
    background: '#6366f1', color: '#fff', borderRadius: 10,
    textDecoration: 'none', fontWeight: 600, fontSize: 15, marginTop: 28,
  };

  if (status === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: '#1e1b4b', margin: 0 }}>{t.loading}</h2>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1 style={{ margin: '0 0 12px', color: '#1e1b4b', fontSize: 24, fontWeight: 700 }}>
            {t.verifiedTitle}
          </h1>
          <p style={{ color: '#64748b', margin: 0, lineHeight: 1.6 }}>
            {t.verifiedBody}
          </p>
          <Link href="/dashboard" style={btnStyle}>
            {t.goToDash}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>❌</div>
        <h1 style={{ margin: '0 0 12px', color: '#1e1b4b', fontSize: 24, fontWeight: 700 }}>
          {t.invalidTitle}
        </h1>
        <p style={{ color: '#64748b', margin: 0, lineHeight: 1.6 }}>
          {errorMsg}
        </p>
        <Link href="/dashboard" style={btnStyle}>
          {t.goToDash}
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
