// "This week at a glance" — the second-mind strip. Week-level health + money
// with WoW deltas plus one real cross-domain line, from gamification.horizon
// (buildHorizon over the same rows as the streak). Rides the dashboard's
// existing 30s / lifesync:data-changed refresh — no extra fetch, no model call.
import { Link } from 'react-router-dom';
import { Brain, TrendingUp, TrendingDown, Minus, MessageCircle } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { SkeletonCard } from '../ui/Skeleton';

// goodWhenUp: sleep/mood improving = up; spend improving = down.
const TrendBadge = ({ trend, pct, goodWhenUp }) => {
  if (!trend || pct == null) return null;
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const good = trend === 'flat' ? null : (trend === 'up') === goodWhenUp;
  const tone = good == null ? 'text-navy-400' : good ? 'text-emerald-600' : 'text-coral-500';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`} data-testid="trend-badge">
      <Icon className="w-3 h-3" aria-hidden="true" />
      {Math.abs(pct)}%
    </span>
  );
};

// Known parser metrics get a localized label; anything else shows raw.
const GOAL_LABEL_KEYS = {
  steps: 'dash.goals.steps',
  sleep: 'dash.goals.sleep',
  water: 'dash.goals.water',
  budget: 'dash.goals.budget',
  savings: 'dash.goals.savings',
};

// current is server-computed from real logs (goalProgress) — never invented.
const GoalRow = ({ goal, t }) => {
  const pct = Math.max(0, Math.round((goal.current / goal.target) * 100));
  // Budget counts spend against a cap: over 100% is bad; every other goal
  // hitting 100% is good.
  const overBudget = goal.metric === 'budget' && pct > 100;
  const barTone = overBudget ? 'bg-coral-500' : pct >= 100 ? 'bg-emerald-500' : 'bg-navy-400';
  const labelKey = GOAL_LABEL_KEYS[goal.metric];
  return (
    <div data-testid={`mind-goal-${goal.metric}`}>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-navy-500">
        <span>{labelKey ? t(labelKey) : goal.metric} · {t(`dash.goals.${goal.period}`)}</span>
        <span className="tabular-nums font-semibold text-navy-700">
          {Number(goal.current).toLocaleString()}/{Number(goal.target).toLocaleString()}{goal.unit ? ` ${goal.unit}` : ''}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-navy-100 overflow-hidden">
        <div className={`h-full rounded-full ${barTone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
};

export default function SecondMindCard({ horizon, goals, loading }) {
  const { t } = useSettings();
  if (loading) return <SkeletonCard />;

  const w = horizon?.week || {};
  const goalRows = (goals || []).filter((g) => g.target > 0).slice(0, 3);
  const tiles = [
    { key: 'sleep', label: t('dash.mind.sleep'), value: w.sleep_avg != null ? `${w.sleep_avg}h` : null, trend: w.sleep_trend, pct: w.sleep_delta_pct, goodWhenUp: true },
    { key: 'mood', label: t('dash.mind.mood'), value: w.mood_avg != null ? `${w.mood_avg}/10` : null, trend: w.mood_trend, pct: w.mood_delta_pct, goodWhenUp: true },
    { key: 'spend', label: t('dash.mind.spend'), value: w.expense_total > 0 ? w.expense_total.toLocaleString() : null, trend: w.expense_trend, pct: w.expense_delta_pct, goodWhenUp: false },
  ].filter((m) => m.value != null);

  // All three XD patterns mirror longHorizon xd_hints — same thresholds, same
  // order; first match wins like the server's xd_hints[0].
  const hasExercise = (horizon?.coverage_week?.health || []).includes('exercise');
  const xdLine = (w.sleep_avg != null && w.sleep_avg < 6.5
    && w.expense_trend === 'up' && w.expense_delta_pct > 15 && w.expense_prev > 0)
    ? t('dash.mind.xdSleepSpend', { sleep: w.sleep_avg, pct: Math.abs(w.expense_delta_pct) })
    : (w.mood_avg != null && w.mood_avg <= 4 && w.expense_prev > 0 && w.expense_total > w.expense_prev)
      ? t('dash.mind.xdMoodSpend', { mood: w.mood_avg })
      : (w.mood_avg != null && w.mood_avg >= 7 && hasExercise)
        ? t('dash.mind.xdMoodExercise', { mood: w.mood_avg })
        : null;

  return (
    <div className="bg-white rounded-2xl border border-navy-100 p-5 shadow-card" data-testid="second-mind-card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-display text-base font-bold text-navy-800 flex items-center gap-2">
          <Brain className="w-5 h-5 text-emerald-500" aria-hidden="true" />
          {t('dash.mind.title')}
        </h3>
        <Link
          to="/chat"
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:border-emerald-400 transition-colors"
          data-testid="second-mind-cta"
        >
          <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
          {t('dash.mind.cta')}
        </Link>
      </div>

      {tiles.length === 0 ? (
        <p className="text-sm text-navy-400" data-testid="second-mind-empty">{t('dash.mind.empty')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {tiles.map((m) => (
              <div key={m.key} className="rounded-xl bg-navy-50/70 p-3.5" data-testid={`mind-tile-${m.key}`}>
                <p className="text-xl font-bold text-navy-900 tabular-nums flex items-baseline gap-2">
                  {m.value}
                  <TrendBadge trend={m.trend} pct={m.pct} goodWhenUp={m.goodWhenUp} />
                </p>
                <p className="text-[11px] text-navy-500 mt-1">{m.label} · {t('dash.mind.vsPrior')}</p>
              </div>
            ))}
          </div>
          {xdLine && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-300" data-testid="second-mind-xd">
              {xdLine}
            </p>
          )}
        </>
      )}

      {goalRows.length > 0 && (
        <div className="mt-4 space-y-2.5" data-testid="mind-goals">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{t('dash.goals.title')}</p>
          {goalRows.map((g) => (
            <GoalRow key={`${g.domain}-${g.metric}-${g.period}`} goal={g} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
