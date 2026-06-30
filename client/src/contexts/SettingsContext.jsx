// Theme (light/dark) + locale (en/ar) + direction, persisted and applied to
// <html>. A single provider so any component can flip language/theme and read
// translations via t(). The pre-paint script in index.html sets the same
// attributes before React mounts to avoid a flash; this keeps them in sync.
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { translate, dirFor } from '../i18n';

const THEME_KEY = 'lifesync.theme';
const LOCALE_KEY = 'lifesync.locale';

const SettingsContext = createContext(null);

const readInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const readInitialLocale = () => {
  if (typeof window === 'undefined') return 'en';
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === 'ar' || saved === 'en') return saved;
  // No explicit choice yet — honor the browser's language so Arabic-speaking
  // visitors see Arabic on first load instead of having to find the toggle.
  const browserLangs = navigator.languages || [navigator.language || ''];
  return browserLangs.some((lang) => lang?.toLowerCase().startsWith('ar')) ? 'ar' : 'en';
};

const applyToDocument = (theme, locale) => {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.setAttribute('dir', dirFor(locale));
  root.setAttribute('lang', locale);
  root.style.colorScheme = theme;
};

export function SettingsProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme);
  const [locale, setLocale] = useState(readInitialLocale);

  useEffect(() => {
    applyToDocument(theme, locale);
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(LOCALE_KEY, locale);
  }, [theme, locale]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const toggleLocale = useCallback(() => setLocale((l) => (l === 'ar' ? 'en' : 'ar')), []);
  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);

  const value = useMemo(() => ({
    theme, locale, dir: dirFor(locale), isRTL: locale === 'ar',
    setTheme, setLocale, toggleTheme, toggleLocale, t,
  }), [theme, locale, toggleTheme, toggleLocale, t]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
