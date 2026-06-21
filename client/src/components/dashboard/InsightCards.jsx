// src/components/dashboard/InsightCards.jsx
import { Lightbulb, TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowUpRight, Cpu } from 'lucide-react';
import { getInsightCardsViewModel } from './insightCardModel';

const sentimentChip = {
  positive: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  neutral: 'bg-navy-500/20 text-navy-200 border-navy-400/30',
  concerning: 'bg-coral-500/20 text-coral-200 border-coral-400/30',
};

const behaviorChip = {
  disciplined: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
  balanced: 'bg-sky-500/20 text-sky-200 border-sky-400/30',
  overspending: 'bg-coral-500/20 text-coral-200 border-coral-400/30',
};

const trendIcons = {
  improving: <TrendingUp className="w-4 h-4 text-emerald-500" />,
  stable: <Minus className="w-4 h-4 text-navy-400" />,
  declining: <TrendingDown className="w-4 h-4 text-coral-500" />,
  insufficient_data: <AlertTriangle className="w-4 h-4 text-amber-500" />,
};

const trendColors = {
  improving: 'text-emerald-600 bg-emerald-50 border-emerald-100',
  stable: 'text-navy-600 bg-navy-50 border-navy-100',
  declining: 'text-coral-500 bg-coral-500/5 border-coral-500/10',
  insufficient_data: 'text-amber-600 bg-amber-50 border-amber-100',
};

const hasScore = (value) => value !== null && value !== undefined && value !== '';

export default function InsightCards({ insights, loading, error }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-navy-100 bg-white/80 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-navy-700">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold">Preparing your BERT-powered insights...</p>
          </div>
          <p className="mt-1 text-xs text-navy-400">
            The dashboard stays usable while your device generates the cards.
          </p>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 skeleton rounded-xl" />
        ))}
      </div>
    );
  }

  const view = getInsightCardsViewModel({ insights, error });

  if (view.kind === 'error') {
    return (
      <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50 space-y-2">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="w-5 h-5" />
          <h3 className="font-display font-semibold text-sm">Insights unavailable</h3>
        </div>
        <p className="text-sm text-amber-800 leading-relaxed">
          {view.error}
        </p>
        <p className="text-xs text-amber-700/80">
          Insight cards are generated locally by the BERT model. The dashboard keeps retrying automatically while everything else stays usable.
        </p>
      </div>
    );
  }

  if (view.kind === 'empty') {
    return (
      <div className="p-5 rounded-2xl border border-dashed border-navy-200 bg-navy-50/60 space-y-2">
        <div className="flex items-center gap-2 text-navy-700">
          <Lightbulb className="w-5 h-5" />
          <h3 className="font-display font-semibold text-sm">No insights yet</h3>
        </div>
        <p className="text-sm text-navy-600 leading-relaxed">
          Keep logging health and finance activity to generate real weekly insights.
        </p>
      </div>
    );
  }

  const { data } = view;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <h3 className="font-display font-semibold text-sm">AI Weekly Insight</h3>
          {data.model_used && (
            <span
              className="ml-auto inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-200 font-semibold border border-purple-400/30"
              title="Insights generated locally by the BERT model"
            >
              <Cpu className="w-2.5 h-2.5" /> {data.model_used}
            </span>
          )}
        </div>
        {data.headline && <p className="text-white font-semibold text-sm mb-1.5">{data.headline}</p>}
        <p className="text-navy-200 text-sm leading-relaxed">{data.summary}</p>

        {/* BERT sentiment chips */}
        {(data.mood_sentiment || data.spending_behavior) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {data.mood_sentiment && (
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border ${sentimentChip[data.mood_sentiment] || sentimentChip.neutral}`}>
                Mood: {data.mood_sentiment}
              </span>
            )}
            {data.spending_behavior && (
              <span className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border ${behaviorChip[data.spending_behavior] || behaviorChip.balanced}`}>
                Spending: {data.spending_behavior}
              </span>
            )}
          </div>
        )}

        {/* Scores */}
        <div className="flex gap-4 mt-4">
          {hasScore(data.health_score) && (
            <div className="flex-1 text-center py-2 rounded-xl bg-white/10 backdrop-blur">
              <p className="text-2xl font-bold">{data.health_score}</p>
              <p className="text-[10px] uppercase tracking-wider text-navy-300 mt-0.5">Health</p>
            </div>
          )}
          {hasScore(data.financial_health_score) && (
            <div className="flex-1 text-center py-2 rounded-xl bg-white/10 backdrop-blur">
              <p className="text-2xl font-bold">{data.financial_health_score}</p>
              <p className="text-[10px] uppercase tracking-wider text-navy-300 mt-0.5">Finance</p>
            </div>
          )}
        </div>
      </div>

      {/* Trend Badges */}
      <div className="flex gap-3">
        <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border ${trendColors[data.mood_trend] || trendColors.stable}`}>
          {trendIcons[data.mood_trend]}
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-70">Mood</p>
            <p className="text-sm font-semibold capitalize">{data.mood_trend?.replace('_', ' ')}</p>
          </div>
        </div>
        <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border ${trendColors[data.spending_trend] || trendColors.stable}`}>
          {trendIcons[data.spending_trend]}
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-70">Spending</p>
            <p className="text-sm font-semibold capitalize">{data.spending_trend?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* Cross-Domain Insight */}
      {data.cross_domain_insights && (
        <div className="p-4 rounded-xl bg-purple-50 border border-purple-100">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpRight className="w-4 h-4 text-purple-500" />
            <p className="text-[11px] uppercase tracking-wider font-semibold text-purple-600">Cross-Domain</p>
          </div>
          <p className="text-sm text-purple-800 leading-relaxed">{data.cross_domain_insights}</p>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations?.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-navy-400 px-1">Recommendations</p>
          {data.recommendations.map((rec, i) => (
            <div key={i} className="p-3.5 rounded-xl bg-white border border-navy-100 hover:shadow-sm transition-shadow">
              <div className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full mt-2 ${
                  rec.priority === 'high' ? 'bg-coral-500' : rec.priority === 'medium' ? 'bg-amber-500' : 'bg-navy-300'
                }`} />
                <div>
                  <p className="text-sm font-medium text-navy-800">{rec.text}</p>
                  <p className="text-xs text-navy-400 mt-1">{rec.reason}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
