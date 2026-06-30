import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { authAPI, aiAPI } from '../services/api';
import { MODEL_OPTIONS } from '../config/models';
import {
  Activity, Heart, Wallet, MessageCircle, ArrowRight, Check,
  Footprints, Moon, Droplets, SmilePlus, Target,
  BrainCircuit, Cpu,
} from 'lucide-react';
import { Button } from '../components/ui';

const TOTAL_STEPS = 4;

function WelcomeStep({ user, onNext }) {
  const { t } = useSettings();
  const domains = [
    { icon: Heart, label: t('onboard.health'), color: 'text-coral-500', bg: 'bg-coral-50' },
    { icon: Wallet, label: t('onboard.finance'), color: 'text-amber-500', bg: 'bg-amber-50' },
    { icon: MessageCircle, label: t('onboard.aiChat'), color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="text-center space-y-6 animate-fade-up">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/25">
        <Activity className="w-10 h-10 text-white" strokeWidth={2} />
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold text-navy-900 mb-2">
          {t('onboard.welcomeTitle', { name: user?.name?.split(' ')[0] || user?.username })}
        </h1>
        <p className="text-navy-500 text-lg leading-relaxed max-w-sm mx-auto">
          {t('onboard.welcomeSub')}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
        {domains.map(({ icon: Icon, label, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl p-4 flex flex-col items-center gap-2 transition-transform duration-200 ease-[var(--ease-out-snap)] hover:-translate-y-0.5`}>
            <Icon className={`w-6 h-6 ${color}`} />
            <span className="text-xs font-semibold text-navy-600">{label}</span>
          </div>
        ))}
      </div>

      <Button onClick={onNext} rightIcon={ArrowRight} size="lg" className="mx-auto">
        {t('onboard.letsGo')}
      </Button>
    </div>
  );
}

function ModelStep({ selectedId, onNext, onBack }) {
  const { t } = useSettings();
  const [selected, setSelected] = useState(selectedId || 'bert_local');

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-navy-50 flex items-center justify-center mx-auto mb-4">
          <BrainCircuit className="w-7 h-7 text-navy-600" />
        </div>
        <h2 className="font-display text-2xl font-bold text-navy-900 mb-2">{t('onboard.pickModel')}</h2>
        <p className="text-navy-500 text-sm">{t('onboard.pickModelSub')}</p>
      </div>

      <div className="space-y-2.5">
        {MODEL_OPTIONS.map((m) => {
          const active = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelected(m.id)}
              className={`w-full text-start p-4 rounded-2xl border-2 transition-all duration-200 ease-[var(--ease-out-snap)] ${
                active ? 'border-emerald-500 bg-emerald-50/60' : 'border-navy-100 bg-white hover:border-navy-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-navy-800 flex items-center gap-2">
                  {m.label}
                  {m.tag && <span className="text-[10px] font-medium text-navy-400 uppercase tracking-wider">{m.tag}</span>}
                </span>
                {active && (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-xs text-navy-400 mt-1">{m.desc}</p>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-navy-400 flex items-start gap-2">
        <Cpu className="w-4 h-4 mt-0.5 flex-shrink-0" />
        {t('onboard.modelNote')}
      </p>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          {t('reg.back')}
        </Button>
        <Button onClick={() => onNext(selected)} rightIcon={ArrowRight} className="flex-1">
          {t('onboard.continue')}
        </Button>
      </div>
    </div>
  );
}

function GoalsStep({ selectedIds, onNext, onBack }) {
  const { t } = useSettings();
  const [selected, setSelected] = useState(new Set(selectedIds));
  const healthGoals = [
    { id: 'steps', icon: Footprints, label: t('onboard.goal.steps'), desc: t('onboard.goal.stepsDesc') },
    { id: 'sleep', icon: Moon, label: t('onboard.goal.sleep'), desc: t('onboard.goal.sleepDesc') },
    { id: 'hydration', icon: Droplets, label: t('onboard.goal.hydration'), desc: t('onboard.goal.hydrationDesc') },
    { id: 'mood', icon: SmilePlus, label: t('onboard.goal.mood'), desc: t('onboard.goal.moodDesc') },
  ];

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
        <h2 className="font-display text-2xl font-bold text-navy-900 mb-2">{t('onboard.healthGoalsTitle')}</h2>
        <p className="text-navy-500 text-sm">{t('onboard.healthGoalsSub')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {healthGoals.map(({ id, icon: Icon, label, desc }) => {
          const active = selected.has(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={`text-start p-4 rounded-2xl border-2 transition-all duration-200 ease-[var(--ease-out-snap)] ${
                active ? 'border-emerald-500 bg-emerald-50/60' : 'border-navy-100 bg-white hover:border-navy-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]'
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
        <Button variant="secondary" onClick={onBack} className="flex-1">
          {t('reg.back')}
        </Button>
        <Button onClick={() => onNext([...selected])} rightIcon={ArrowRight} className="flex-1">
          {t('onboard.continue')}
        </Button>
      </div>
    </div>
  );
}

function FinanceStep({ initialCurrency, initialGoals, onNext, onBack, loading }) {
  const { t } = useSettings();
  const [selected, setSelected] = useState(new Set(initialGoals));
  const [currency, setCurrency] = useState(initialCurrency);
  const currencies = ['USD', 'EUR', 'GBP', 'JOD', 'ILS', 'SAR', 'AED', 'EGP'];
  const financeGoals = [
    { id: 'track', label: t('onboard.fin.track'), desc: t('onboard.fin.trackDesc') },
    { id: 'budget', label: t('onboard.fin.budget'), desc: t('onboard.fin.budgetDesc') },
    { id: 'savings', label: t('onboard.fin.savings'), desc: t('onboard.fin.savingsDesc') },
    { id: 'analysis', label: t('onboard.fin.analysis'), desc: t('onboard.fin.analysisDesc') },
  ];

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
        <h2 className="font-display text-2xl font-bold text-navy-900 mb-2">{t('onboard.financeTitle')}</h2>
        <p className="text-navy-500 text-sm">{t('onboard.financeSub')}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-navy-700 mb-2">{t('onboard.currency')}</label>
        <div className="grid grid-cols-4 gap-2">
          {currencies.map((option) => (
            <button
              key={option}
              onClick={() => setCurrency(option)}
              className={`py-2 rounded-xl border text-sm font-semibold transition-all duration-200 ease-[var(--ease-out-snap)] ${
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
        <label className="block text-sm font-medium text-navy-700 mb-2">{t('onboard.whatDo')}</label>
        <div className="space-y-2">
          {financeGoals.map(({ id, label, desc }) => {
            const active = selected.has(id);
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className={`w-full flex items-center gap-4 p-3.5 rounded-xl border-2 text-start transition-all duration-200 ease-[var(--ease-out-snap)] ${
                  active ? 'border-emerald-500 bg-emerald-50/60' : 'border-navy-100 bg-white hover:border-navy-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]'
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
        <Button variant="secondary" onClick={onBack} className="flex-1">
          {t('reg.back')}
        </Button>
        <Button onClick={() => onNext({ currency, goals: [...selected] })} loading={loading} rightIcon={ArrowRight} className="flex-1">
          {t('onboard.goToDashboard')}
        </Button>
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
  const { t } = useSettings();
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
  const [preferredModel, setPreferredModel] = useState(user?.preferred_model || 'bert_local');

  const finishOnboarding = async (nextFinancePreferences) => {
    setLoading(true);
    try {
      const profileUpdates = { preferred_model: preferredModel };
      if (user && !user.name && user.username) profileUpdates.name = user.username;
      const { data } = await authAPI.updateProfile(profileUpdates);
      updateCurrentUser(data.data.user);
      // Activate the chosen model so chat + dashboard use it right away.
      aiAPI.start(preferredModel).catch(() => {});
    } catch {
      // Best-effort only.
    }

    localStorage.setItem(storageKeys.health, JSON.stringify(healthGoals));
    localStorage.setItem(storageKeys.finance, JSON.stringify(nextFinancePreferences));
    localStorage.setItem(storageKeys.done, '1');
    navigate('/dashboard');
  };

  return (
    <div className="flex-1 overflow-y-auto">
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
            <ModelStep
              selectedId={preferredModel}
              onNext={(modelId) => {
                setPreferredModel(modelId);
                setStep(2);
              }}
              onBack={() => setStep(0)}
            />
          )}
          {step === 2 && (
            <GoalsStep
              selectedIds={healthGoals}
              onNext={(selectedGoals) => {
                setHealthGoals(selectedGoals);
                setStep(3);
              }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <FinanceStep
              initialCurrency={initialFinancePreferences.currency || 'USD'}
              initialGoals={initialFinancePreferences.goals || []}
              onNext={finishOnboarding}
              onBack={() => setStep(2)}
              loading={loading}
            />
          )}
        </div>

        <p className="text-center text-xs text-navy-400 mt-4">
          {t('onboard.stepOf', { n: step + 1, total: TOTAL_STEPS })}
        </p>
      </div>
    </div>
    </div>
  );
}
