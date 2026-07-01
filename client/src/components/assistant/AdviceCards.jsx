// src/components/assistant/AdviceCards.jsx
// Advice produced from the Insight Engine after an interview. The same data is
// what the dashboard shows, so advice here and there stays consistent.
import { Lightbulb, TrendingUp, Heart, Wallet } from 'lucide-react';

const DOMAIN_ICON = { health: Heart, finance: Wallet, both: TrendingUp };
const PRIORITY_TONE = {
  high: 'border-coral-200 bg-coral-50/60 text-coral-600',
  medium: 'border-amber-200 bg-amber-50/60 text-amber-600',
  low: 'border-emerald-200 bg-emerald-50/60 text-emerald-600',
};

export default function AdviceCards({ advice, t }) {
  if (!advice) return null;
  const items = advice.advice || [];

  return (
    <div className="space-y-3" dir="auto" data-testid="advice-cards">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-emerald-500" />
        <h3 className="font-display text-base font-semibold text-navy-900">{t('assistant.adviceTitle')}</h3>
      </div>

      {advice.scores && (
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-emerald-200/60 bg-emerald-50/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600/80">{t('assistant.healthScore')}</p>
            <p className="text-2xl font-bold text-emerald-700">{advice.scores.health ?? '—'}</p>
          </div>
          <div className="flex-1 rounded-xl border border-blue-200/60 bg-blue-50/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600/80">{t('assistant.financeScore')}</p>
            <p className="text-2xl font-bold text-blue-700">{advice.scores.financial ?? '—'}</p>
          </div>
        </div>
      )}

      {items.map((item, i) => {
        const Icon = DOMAIN_ICON[item.domain] || Lightbulb;
        const tone = PRIORITY_TONE[item.priority] || PRIORITY_TONE.low;
        return (
          <div key={i} className={`rounded-xl border p-4 ${tone}`} data-testid="advice-item">
            <div className="flex items-start gap-3">
              <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy-800 leading-relaxed">{item.text}</p>
                {item.reason && <p className="text-xs text-navy-400 mt-1">{item.reason}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
