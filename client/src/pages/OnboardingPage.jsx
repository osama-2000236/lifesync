import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import {
  Activity, Heart, Wallet, MessageCircle, ArrowRight, Check,
  Footprints, Moon, Droplets, SmilePlus, Target, Loader2,
} from 'lucide-react';

const TOTAL_STEPS = 3;

function WelcomeStep({ user, onNext }) {
  return (
    <div className="text-center space-y-6 animate-fade-up">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/25">
        <Activity className="w-10 h-10 text-white" strokeWidth={2} />
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold text-navy-900 mb-2">
          Welcome, {user?.name?.split(' ')[0] || user?.username}! 👋
        </h1>
        <p className="text-navy-500 text-lg leading-relaxed max-w-sm mx-auto">
          LifeSync connects your health and finances in one AI-powered dashboard. Let&apos;s get you set up.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {[
          { icon: Heart, label: 'Health', color: 'text-coral-500', bg: 'bg-coral-50' },
          { icon: Wallet, label: 'Finance', color: 'text-amber-500', bg: 'bg-amber-50' },
          { icon: MessageCircle, label: 'AI Chat', color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(({ icon: Icon, label, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 flex flex-col items-center gap-2`}>
            <Icon className={`w-6 h-6 ${color}`} />
            <span className="text-xs font-semibold text-navy-600">{label}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="flex items-center gap-2 mx-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all"
      >
        Let&apos;s go <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

const HEALTH_GOALS = [
  { id: 'steps', icon: Footprints, label: 'Step goals', desc: 'Track daily steps' },
  { id: 'sleep', icon: Moon, label: 'Better sleep', desc: 'Monitor sleep patterns' },
  { id: 'hydration', icon: Droplets, label: 'Hydration', desc: 'Water intake tracking' },
  { id: 'mood', icon: SmilePlus, label: 'Mood tracking', desc: 'Daily mental wellness' },
];

function GoalsStep({ selectedIds, onNext, onBack }) {
  const [selected, setSelected] = useState(new Set(selectedIds));

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-coral-50 flex items-center justify-center mx-auto mb-4">
          <Target className="w-7 h-7 text-coral-500" />
        </div>
        <h2 className="font-display text-2xl font-bold text-navy-900 mb-2">What are your health goals?</h2>
        <p className="text-navy-500 text-sm">Select all that apply. We&apos;ll save them to your dashboard preferences.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {HEALTH_GOALS.map(({ id, icon: Icon, label, desc }) => {
          const active = selected.has(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${
                active ? 'border-emerald-500 bg-emerald-50/60' : 'border-navy-100 bg-white hover:border-navy-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <Icon className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-navy-400'}`} />
                {active && (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className={`text-sm font-semibold ${active ? 'text-emerald-700' : 'text-navy-700'}`}>{label}</p>
              <p className="text-xs text-navy-400 mt-0.5">{desc}</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-600 font-medium hover:bg-navy-50 transition-colors text-sm"
        >
          Back
        </button>
        <button
          onClick={() => onNext([...selected])}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const FINANCE_GOALS = [
  { id: 'track', label: 'Track spending', desc: 'See where money goes' },
  { id: 'budget', label: 'Budget management', desc: 'Set monthly limits' },
  { id: 'savings', label: 'Savings goals', desc: 'Build an emergency fund' },
  { id: 'analysis', label: 'Spending analysis', desc: 'AI-powered breakdowns' },
];

function FinanceStep({ initialCurrency, initialGoals, onNext, onBack, loading }) {
  const [selected, setSelected] = useState(new Set(initialGoals));
  const [currency, setCurrency] = useState(initialCurrency);
  const currencies = ['USD', 'EUR', 'GBP', 'JOD', 'ILS', 'SAR', 'AED', 'EGP'];

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Wallet className="w-7 h-7 text-amber-500" />
        </div>
        <h2 className="font-display text-2xl font-bold text-navy-900 mb-2">Set up your finances</h2>
        <p className="text-navy-500 text-sm">Choose your preferences to personalize your finance dashboard.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-700 mb-2">Primary currency</label>
        <div className="grid grid-cols-4 gap-2">
          {currencies.map((option) => (
            <button
              key={option}
              onClick={() => setCurrency(option)}
              className={`py-2 rounded-xl border text-sm font-semibold transition-all ${
                currency === option
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-navy-100 text-navy-500 hover:border-navy-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-700 mb-2">What do you want to do?</label>
        <div className="space-y-2">
          {FINANCE_GOALS.map(({ id, label, desc }) => {
            const active = selected.has(id);
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className={`w-full flex items-center gap-4 p-3.5 rounded-xl border-2 text-left transition-all ${
                  active ? 'border-emerald-500 bg-emerald-50/60' : 'border-navy-100 bg-white hover:border-navy-200'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  active ? 'bg-emerald-500 border-emerald-500' : 'border-navy-200'
                }`}
                >
                  {active && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${active ? 'text-emerald-700' : 'text-navy-700'}`}>{label}</p>
                  <p className="text-xs text-navy-400">{desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onBack}
          className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-600 font-medium hover:bg-navy-50 transition-colors text-sm"
        >
          Back
        </button>
        <button
          onClick={() => onNext({ currency, goals: [...selected] })}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Go to Dashboard <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ step }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
        <div
          key={index}
          className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
            index < step ? 'bg-emerald-500' : index === step ? 'bg-emerald-200' : 'bg-navy-100'
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const { user, updateCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const storageKeys = useMemo(() => ({
    done: `onboarding_done_${user?.id}`,
    health: `onboarding_health_goals_${user?.id}`,
    finance: `onboarding_finance_preferences_${user?.id}`,
  }), [user?.id]);

  const initialHealthGoals = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKeys.health) || '[]');
    } catch {
      return [];
    }
  }, [storageKeys.health]);

  const initialFinancePreferences = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKeys.finance) || '{"currency":"USD","goals":[]}');
    } catch {
      return { currency: 'USD', goals: [] };
    }
  }, [storageKeys.finance]);

  const [healthGoals, setHealthGoals] = useState(initialHealthGoals);

  const finishOnboarding = async (nextFinancePreferences) => {
    setLoading(true);
    try {
      if (user && !user.name && user.username) {
        const { data } = await authAPI.updateProfile({ name: user.username });
        updateCurrentUser(data.data.user);
      }
    } catch {
      // Best-effort only.
    }

    localStorage.setItem(storageKeys.health, JSON.stringify(healthGoals));
    localStorage.setItem(storageKeys.finance, JSON.stringify(nextFinancePreferences));
    localStorage.setItem(storageKeys.done, '1');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <Activity className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-navy-900">LifeSync</span>
        </div>

        <ProgressBar step={step} />

        <div className="bg-white rounded-2xl shadow-lg shadow-navy-900/5 p-8">
          {step === 0 && <WelcomeStep user={user} onNext={() => setStep(1)} />}
          {step === 1 && (
            <GoalsStep
              selectedIds={healthGoals}
              onNext={(selectedGoals) => {
                setHealthGoals(selectedGoals);
                setStep(2);
              }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <FinanceStep
              initialCurrency={initialFinancePreferences.currency || 'USD'}
              initialGoals={initialFinancePreferences.goals || []}
              onNext={finishOnboarding}
              onBack={() => setStep(1)}
              loading={loading}
            />
          )}
        </div>

        <p className="text-center text-xs text-navy-400 mt-4">
          Step {step + 1} of {TOTAL_STEPS}
        </p>
      </div>
    </div>
  );
}
