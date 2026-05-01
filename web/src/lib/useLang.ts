'use client';
import { useState, useEffect } from 'react';

export type LangCode = 'es' | 'en' | 'pt' | 'tr' | 'ar';

export const LANGS = [
  { code: 'es' as LangCode, label: 'Español',   flag: '🇪🇸', dir: 'ltr' as const },
  { code: 'en' as LangCode, label: 'English',   flag: '🇬🇧', dir: 'ltr' as const },
  { code: 'pt' as LangCode, label: 'Português', flag: '🇧🇷', dir: 'ltr' as const },
  { code: 'tr' as LangCode, label: 'Türkçe',    flag: '🇹🇷', dir: 'ltr' as const },
  { code: 'ar' as LangCode, label: 'العربية',   flag: '🇸🇦', dir: 'rtl' as const },
];

export function setStoredLang(code: LangCode) {
  localStorage.setItem('lang', code);
  document.documentElement.setAttribute('lang', code);
  document.documentElement.setAttribute('dir', code === 'ar' ? 'rtl' : 'ltr');
}

export function useLang() {
  const [lang, setLangState] = useState<LangCode>('es');
  useEffect(() => {
    const saved = localStorage.getItem('lang') as LangCode | null;
    if (saved && LANGS.some((l) => l.code === saved)) setLangState(saved);
    else {
      const browser = navigator.language.split('-')[0] as LangCode;
      if (LANGS.some((l) => l.code === browser)) {
        setLangState(browser);
        localStorage.setItem('lang', browser);
      }
    }
  }, []);

  function setLang(code: LangCode) {
    setLangState(code);
    setStoredLang(code);
  }

  return { lang, setLang };
}

// Helper: pick translation with fallback to Spanish
export function tr<K extends string>(dict: Record<LangCode, Record<K, string>>, lang: LangCode, key: K): string {
  return (dict[lang] as Record<K, string>)?.[key] ?? (dict['es'] as Record<K, string>)[key] ?? key;
}
