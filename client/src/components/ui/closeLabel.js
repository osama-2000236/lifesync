// Alert/Modal are provider-free leaf primitives (unit-tested bare), so they
// can't call useSettings. Read the lang SettingsContext stamps on <html>.
export const closeLabel = () =>
  (typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'إغلاق' : 'Close');
