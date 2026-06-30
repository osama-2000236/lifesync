// Compact language (EN/ع) + theme (sun/moon) switch buttons. Drop anywhere;
// reads/writes global settings. `compact` hides the text labels for tight bars.
import { Sun, Moon, Languages } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';

export default function SettingsControls({ compact = false, className = '' }) {
  const { theme, locale, toggleTheme, toggleLocale, t } = useSettings();
  const isDark = theme === 'dark';

  const btn = 'flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-navy-200 ' +
    'text-navy-600 hover:bg-navy-50 hover:text-navy-800 transition-colors text-xs font-semibold ' +
    'focus:outline-none focus:ring-2 focus:ring-emerald-500/30';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={toggleLocale}
        className={btn}
        aria-label={t('settings.language')}
        title={t('settings.language')}
      >
        <Languages className="w-4 h-4" />
        <span className={compact ? 'sr-only' : ''}>{locale === 'ar' ? 'ع' : 'EN'}</span>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className={btn}
        aria-label={t('settings.theme')}
        title={isDark ? t('settings.light') : t('settings.dark')}
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <span className={compact ? 'sr-only' : ''}>{isDark ? t('settings.light') : t('settings.dark')}</span>
      </button>
    </div>
  );
}
