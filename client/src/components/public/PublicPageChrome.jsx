import { Link } from 'react-router-dom';
import { Activity, ArrowRight, MessageCircle } from 'lucide-react';
import SettingsControls from '../common/SettingsControls';
import { useSettings } from '../../contexts/SettingsContext';

const resolveMarketingHomeHref = (user) => (user ? '/landing' : '/');
const resolveLogoHref = (user) => (user ? '/dashboard' : '/login');

const navLinkClass = (isActive) => (
  `text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-all duration-200 ease-[var(--ease-out-snap)] whitespace-nowrap ${
    isActive
      ? 'text-emerald-700 bg-emerald-50'
      : 'text-navy-500 hover:text-navy-900 hover:bg-navy-50'
  }`
);

export function PublicPageNavBar({ activePage, user }) {
  const { t } = useSettings();
  const marketingHomeHref = resolveMarketingHomeHref(user);
  const logoHref = resolveLogoHref(user);
  const primaryAction = user
    ? { to: '/dashboard', label: t('nav.dashboard') }
    : { to: '/login', label: t('auth.signin') };
  const secondaryAction = user
    ? { to: '/chat', label: t('nav.assistant'), icon: MessageCircle }
    : { to: '/register', label: t('public.getStarted'), icon: ArrowRight };

  const SecondaryIcon = secondaryAction.icon;

  return (
    <nav className="sticky top-0 inset-x-0 z-50 bg-white/90 backdrop-blur-xl border-b border-navy-100/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <Link to={logoHref} className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-bold text-navy-900 truncate">LifeSync</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-navy-100 bg-white/70 px-1 py-1">
            <Link to={marketingHomeHref} className={navLinkClass(activePage === 'landing')}>
              {t('nav.home')}
            </Link>
            <Link to="/privacy" className={navLinkClass(activePage === 'privacy')}>
              {t('nav.privacy')}
            </Link>
            <Link to="/terms" className={navLinkClass(activePage === 'terms')}>
              {t('nav.terms')}
            </Link>
          </div>

          <SettingsControls compact />

          <Link
            to={primaryAction.to}
            className="inline-flex items-center justify-center text-sm font-medium text-navy-600 hover:text-navy-900 px-3 sm:px-4 py-2 rounded-lg hover:bg-navy-50 transition-all whitespace-nowrap"
          >
            {primaryAction.label}
          </Link>

          <Link
            to={secondaryAction.to}
            className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 rounded-xl shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.97] transition-all duration-200 ease-[var(--ease-out-snap)] whitespace-nowrap"
          >
            {secondaryAction.label}
            {SecondaryIcon ? <SecondaryIcon className="w-4 h-4 rtl:rotate-180" /> : null}
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function PublicPageFooter({ user }) {
  const { t } = useSettings();
  const marketingHomeHref = resolveMarketingHomeHref(user);
  const authLink = user
    ? { to: '/dashboard', label: t('nav.dashboard') }
    : { to: '/login', label: t('public.signIn') };

  return (
    <footer className="bg-ink-950 text-white/60 px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-white text-sm">LifeSync</span>
          <span className="text-white/50 text-xs ms-2">· {t('public.gradProject')}</span>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <Link to={marketingHomeHref} className="hover:text-white transition-colors">{t('nav.home')}</Link>
          <Link to="/privacy" className="hover:text-white transition-colors">{t('public.privacyPolicy')}</Link>
          <Link to="/terms" className="hover:text-white transition-colors">{t('public.termsOfService')}</Link>
          <Link to={authLink.to} className="hover:text-white transition-colors">{authLink.label}</Link>
        </div>
      </div>
    </footer>
  );
}
