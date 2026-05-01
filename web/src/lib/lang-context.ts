import { createContext, useContext } from 'react';
import type { LangCode } from './useLang';

interface LangCtx { lang: LangCode; setLang: (c: LangCode) => void }
export const LangContext = createContext<LangCtx>({ lang: 'es', setLang: () => {} });
export const useLangCtx = () => useContext(LangContext);
