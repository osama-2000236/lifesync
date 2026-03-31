import { Link } from 'react-router-dom';
import {
  Activity,
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

const features = [
  {
    icon: Brain,
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    title: 'AI-Powered Insights',
    desc: 'Natural language understanding lets you log health and finances just by describing your day. LifeSync figures out the rest.',
  },
  {
    icon: Heart,
    bg: 'bg-coral-50',
    text: 'text-coral-500',
    title: 'Health Tracking',
    desc: 'Steps, sleep, mood, hydration, and exercise in one place. Spot wellness patterns and correlations you never knew existed.',
  },
  {
    icon: Wallet,
    bg: 'bg-amber-50',
    text: 'text-amber-500',
    title: 'Finance Management',
    desc: 'Track spending, categorize transactions, and watch your financial health improve with AI-driven recommendations.',
  },
  {
    icon: BarChart3,
    bg: 'bg-navy-50',
    text: 'text-navy-600',
    title: 'Smart Dashboard',
    desc: 'Your health and finances visualized together. Discover how your spending affects your wellness and vice versa.',
  },
  {
    icon: MessageCircle,
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    title: 'Conversational Assistant',
    desc: 'Ask anything. "How was my sleep this week?" or "Where did most of my money go?" Get instant, intelligent answers.',
  },
  {
    icon: Lock,
    bg: 'bg-navy-50',
    text: 'text-navy-600',
    title: 'Private & Secure',
    desc: 'Your data stays encrypted and private. We never sell your information. You own your data, period.',
  },
];

const stats = [
  { value: '1 dashboard', label: 'for health + finances' },
  { value: 'NLP-powered', label: 'natural input' },
  { value: 'Real-time', label: 'AI insights' },
  { value: '100% private', label: 'your data' },
];

function NavBar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-navy-100/60">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
            <Activity className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display text-lg font-bold text-navy-900">LifeSync</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-1 rounded-xl border border-navy-100 bg-white/70 px-1 py-1">
            <Link
              to="/privacy"
              className="text-sm font-medium text-navy-500 hover:text-navy-900 px-3 py-1.5 rounded-lg hover:bg-navy-50 transition-all"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-sm font-medium text-navy-500 hover:text-navy-900 px-3 py-1.5 rounded-lg hover:bg-navy-50 transition-all"
            >
              Terms
            </Link>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-navy-600 hover:text-navy-900 px-4 py-2 rounded-lg hover:bg-navy-50 transition-all"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 rounded-xl shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all"
          >
            Get started free
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16">
      <div className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800">
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
          AI-powered life management
        </div>

        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.05] tracking-tight mb-6">
          Your health and finances,
          {' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-300">
            one conversation
          </span>
          {' '}
          away.
        </h1>

        <p className="text-navy-300 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
          LifeSync connects your wellness and financial data through natural language.
          {' '}
          Just talk. Our AI handles the rest.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-base shadow-xl shadow-emerald-500/25 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-emerald-500/35 transition-all"
          >
            Get started free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <Link
            to="/login"
            className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-navy-600 text-navy-300 font-medium text-base hover:border-navy-400 hover:text-white hover:bg-navy-800/50 transition-all"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-2xl mx-auto">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display font-bold text-xl text-white">{stat.value}</div>
              <div className="text-navy-400 text-xs mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 text-navy-500 flex flex-col items-center gap-1">
        <span className="text-xs tracking-widest uppercase">Explore</span>
        <ChevronDown className="w-4 h-4 animate-bounce" />
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="py-24 px-6 bg-surface">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-sm font-medium mb-4">
            <Zap className="w-3.5 h-3.5" />
            Everything you need
          </div>
          <h2 className="font-display text-4xl font-bold text-navy-900 mb-4">
            One app. Complete life picture.
          </h2>
          <p className="text-navy-500 text-lg max-w-xl mx-auto">
            Stop juggling five apps. LifeSync brings your health and finances into a single intelligent dashboard.
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
  const steps = [
    {
      num: '01',
      title: 'Create your account',
      desc: 'Sign up with Google or email in seconds. No credit card and no commitments.',
    },
    {
      num: '02',
      title: 'Start logging naturally',
      desc: 'Just type: "Ran 5k, feeling great" or "Spent $40 on groceries." LifeSync handles the categorization.',
    },
    {
      num: '03',
      title: 'Discover hidden patterns',
      desc: 'Watch your dashboard reveal connections between your habits and finances you never noticed.',
    },
  ];

  return (
    <section className="py-24 px-6 bg-white border-y border-navy-100">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-navy-900 mb-4">
            Simple by design
          </h2>
          <p className="text-navy-500 text-lg">Up and running in under 2 minutes.</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={step.num} className="relative">
              {index < steps.length - 1 && (
                <div className="hidden sm:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-emerald-200 to-transparent -z-0 translate-x-[-50%]" />
              )}
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-navy-900 to-navy-800 flex items-center justify-center mb-5 shadow-lg">
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

function CTASection() {
  return (
    <section className="py-24 px-6 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-15"
        style={{ backgroundImage: 'radial-gradient(circle at 60% 50%, #10b981 0%, transparent 60%)' }}
      />
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-6">
          <Star className="w-3.5 h-3.5" />
          Free to get started
        </div>
        <h2 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          Take control of your life today
        </h2>
        <p className="text-navy-300 text-lg mb-10">
          Join the next generation of people who manage health and money intelligently.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/register"
            className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-base shadow-xl shadow-emerald-500/25 hover:from-emerald-600 hover:to-emerald-700 transition-all"
          >
            Create free account
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
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
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          <Link to="/login" className="hover:text-white transition-colors">Sign In</Link>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <NavBar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </div>
  );
}
