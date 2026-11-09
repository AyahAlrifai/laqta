import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { UiLanguage } from '../../shared/strings';
import { laqta } from './api';
import { I18nProvider } from './i18n';

/** Mounts a page with the UI language applied: `lang` and `dir` on <html> (spec section 9). */
export async function boot(render: () => ReactNode): Promise<void> {
  let lang: UiLanguage = 'en';
  try {
    lang = (await laqta.settingsGet()).settings.uiLanguage;
  } catch {
    // Settings unreadable: fall back to English.
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const root = document.getElementById('root');
  if (root === null) return;
  createRoot(root).render(
    <StrictMode>
      <I18nProvider lang={lang}>{render()}</I18nProvider>
    </StrictMode>,
  );
}
