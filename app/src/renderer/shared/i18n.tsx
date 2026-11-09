import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { format, t, type StringKey, type UiLanguage } from '../../shared/strings';

interface I18n {
  lang: UiLanguage;
  dir: 'ltr' | 'rtl';
  t: (key: StringKey) => string;
  f: (key: StringKey, vars: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ lang, children }: { lang: UiLanguage; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t: (key) => t(lang, key),
      f: (key, vars) => format(lang, key, vars),
    }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (value === null) throw new Error('I18nProvider missing');
  return value;
}
