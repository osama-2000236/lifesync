import { Link } from 'react-router-dom';
import {
  MessageCircle,
  Heart,
  Wallet,
  Zap,
  ArrowRight,
  Star,
  BarChart3,
  Brain,
  Lock,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import FullScreenLoader from '../components/common/FullScreenLoader';
import { PublicPageNavBar, PublicPageFooter } from '../components/public/PublicPageChrome';

function HeroSection({ user }) {
  const { t } = useSettings();
  const primaryAction = user
    ? { to: '/dashboard', label: t('public.openDashboard') }
    : { to: '/register', label: t('public.getStarted') };
  const secondaryAction = user
    ? { to: '/chat', label: t('public.openAssistant') }
    : { to: '/login', label: t('auth.signin') };
  const stats = [
    { value: t('landing.stat1Value'), label: t('landing.stat1Label') },
    { value: t('landing.stat2Value'), label: t('landing.stat2Label') },
    { value: t('landing.stat3Value'), label: t('landing.stat3Label') },
    { value: t('landing.stat4Value'), label: t('landing.stat4Label') },
  ];

  return (
    <section className="relative min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 50%, #10b981 0%, transparent 50%), radial-gradient(circle at 80% 20%, #34d399 0%, transparent 40%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl animate-pulse"
        style={{ animationDuration: '4s' }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-emerald-400/8 blur-3xl animate-pulse"
        style={{ animationDuration: '6s', animationDelay: '2s' }}
      />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          {t('landing.badge')}
        </div>

        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.05] tracking-tight mb-6">
          {t('landing.heroTitle1')}
          {' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-300">
            {t('landing.heroTitleHighlight')}
          </span>
          {' '}
          {t('landing.heroTitleEnd')}
        </h1>

        <p className="text-white/70 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
          {t('landing.heroSub')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={primaryAction.to}
            className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-base shadow-xl shadow-emerald-500/25 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-500/35 transition-all"
          >
            {primaryAction.label}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link
            to={secondaryAction.to}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/20 text-white/70 font-medium text-base hover:border-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            {secondaryAction.label}
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display font-bold text-xl text-white">{stat.value}</div>
              <div className="text-white/50 text-xs mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-white/40 flex flex-col items-center gap-1">
        <span className="text-xs tracking-widest uppercase">{t('landing.explore')}</span>
        <ChevronDown className="w-4 h-4 animate-bounce" />
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t } = useSettings();
  const features = [
    { icon: Brain, bg: 'bg-emerald-50', text: 'text-emerald-600', title: t('landing.feature1Title'), desc: t('landing.feature1Desc') },
    { icon: Heart, bg: 'bg-coral-50', text: 'text-coral-500', title: t('landing.feature2Title'), desc: t('landing.feature2Desc') },
    { icon: Wallet, bg: 'bg-amber-50', text: 'text-amber-500', title: t('landing.feature3Title'), desc: t('landing.feature3Desc') },
    { icon: BarChart3, bg: 'bg-navy-50', text: 'text-navy-600', title: t('landing.feature4Title'), desc: t('landing.feature4Desc') },
    { icon: MessageCircle, bg: 'bg-emerald-50', text: 'text-emerald-600', title: t('landing.feature5Title'), desc: t('landing.feature5Desc') },
    { icon: Lock, bg: 'bg-navy-50', text: 'text-navy-600', title: t('landing.feature6Title'), desc: t('landing.feature6Desc') },
  ];

  return (
    <section className="py-24 px-6 bg-surface">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-sm font-medium mb-4">
            <Zap className="w-3.5 h-3.5" />
            {t('landing.featuresBadge')}
          </div>
          <h2 className="font-display text-4xl font-bold text-navy-900 mb-4">
            {t('landing.featuresTitle')}
          </h2>
          <p className="text-navy-500 text-lg max-w-xl mx-auto">
            {t('landing.featuresSub')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-white rounded-2xl p-6 border border-navy-100/60 hover:border-navy-200 hover:shadow-lg hover:shadow-navy-900/5 transition-all group"
            >
              <div className={`w-11 h-11 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform`}>
                <feature.icon className={`w-5 h-5 ${feature.text}`} />
              </div>
              <h3 className="font-display font-bold text-navy-900 mb-2">{feature.title}</h3>
              <p className="text-navy-500 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const { t } = useSettings();
  const steps = [
    { num: '01', title: t('landing.step1Title'), desc: t('landing.step1Desc') },
    { num: '02', title: t('landing.step2Title'), desc: t('landing.step2Desc') },
    { num: '03', title: t('landing.step3Title'), desc: t('landing.step3Desc') },
  ];

  return (
    <section className="py-24 px-6 bg-white border-y border-navy-100">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-navy-900 mb-4">
            {t('landing.howTitle')}
          </h2>
          <p className="text-navy-500 text-lg">{t('landing.howSub')}</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={step.num} className="relative">
              {index < steps.length - 1 && (
                <div className="hidden sm:block absolute top-8 start-full w-full h-px bg-gradient-to-r rtl:bg-gradient-to-l from-emerald-200 to-transparent -z-0 -translate-x-1/2 rtl:translate-x-1/2" />
              )}
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ink-900 to-ink-800 flex items-center justify-center mb-5 shadow-lg">
                  <span className="font-display font-bold text-emerald-400 text-sm">{step.num}</span>
                </div>
                <h3 className="font-display font-bold text-navy-900 mb-2">{step.title}</h3>
                <p className="text-navy-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection({ user }) {
  const { t } = useSettings();
  const primaryAction = user
    ? { to: '/dashboard', label: t('public.openDashboard') }
    : { to: '/register', label: t('landing.createFreeAccount') };

  return (
    <section className="py-24 px-6 bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-15"
        style={{ backgroundImage: 'radial-gradient(circle at 60% 50%, #10b981 0%, transparent 60%)' }}
      />
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
          <Star className="w-3.5 h-3.5" />
          {t('landing.ctaBadge')}
        </div>
        <h2 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          {t('landing.ctaTitle')}
        </h2>
        <p className="text-white/70 text-lg mb-10">
          {t('landing.ctaSub')}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={primaryAction.to}
            className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-base shadow-xl shadow-emerald-500/25 hover:from-emerald-600 hover:to-emerald-700 transition-all"
          >
            {primaryAction.label}
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen">
      <PublicPageNavBar activePage="landing" user={user} />
      <HeroSection user={user} />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection user={user} />
      <PublicPageFooter user={user} />
    </div>
  );
}
