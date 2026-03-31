import { Link } from 'react-router-dom';
import { Activity, ArrowRight, MessageCircle } from 'lucide-react';

const resolveMarketingHomeHref = (user) => (user ? '/landing' : '/');
const resolveLogoHref = (user) => (user ? '/dashboard' : '/login');

const navLinkClass = (isActive) => (
  `text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
    isActive
      ? 'text-emerald-700 bg-emerald-50'
      : 'text-navy-500 hover:text-navy-900 hover:bg-navy-50'
  }`
);

export function PublicPageNavBar({ activePage, user }) {
  const marketingHomeHref = resolveMarketingHomeHref(user);
  const logoHref = resolveLogoHref(user);
  const primaryAction = user
    ? { to: '/dashboard', label: 'Dashboard' }
    : { to: '/login', label: 'Sign in' };
  const secondaryAction = user
    ? { to: '/chat', label: 'Assistant', icon: MessageCircle }
    : { to: '/register', label: 'Get started free', icon: ArrowRight };

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
              Home
            </Link>
            <Link to="/privacy" className={navLinkClass(activePage === 'privacy')}>
              Privacy
            </Link>
            <Link to="/terms" className={navLinkClass(activePage === 'terms')}>
              Terms
            </Link>
          </div>

          <Link
            to={primaryAction.to}
            className="inline-flex items-center justify-center text-sm font-medium text-navy-600 hover:text-navy-900 px-3 sm:px-4 py-2 rounded-lg hover:bg-navy-50 transition-all whitespace-nowrap"
          >
            {primaryAction.label}
          </Link>

          <Link
            to={secondaryAction.to}
            className="hidden sm:inline-flex items-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 rounded-xl shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all whitespace-nowrap"
          >
            {secondaryAction.label}
            {SecondaryIcon ? <SecondaryIcon className="w-4 h-4" /> : null}
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function PublicPageFooter({ user }) {
  const marketingHomeHref = resolveMarketingHomeHref(user);
  const authLink = user
    ? { to: '/dashboard', label: 'Dashboard' }
    : { to: '/login', label: 'Sign In' };

  return (
    <footer className="bg-navy-950 text-navy-400 px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-white text-sm">LifeSync</span>
          <span className="text-navy-600 text-xs ml-2">· Birzeit University Graduation Project</span>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <Link to={marketingHomeHref} className="hover:text-white transition-colors">Home</Link>
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <Link to={authLink.to} className="hover:text-white transition-colors">{authLink.label}</Link>
        </div>
      </div>
    </footer>
  );
}
