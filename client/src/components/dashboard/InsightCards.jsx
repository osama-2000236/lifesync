// src/components/dashboard/InsightCards.jsx
import { Lightbulb, TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowUpRight } from 'lucide-react';

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

export default function InsightCards({ insights, loading }) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 skeleton rounded-xl" />
        ))}
      </div>
    );
  }

  // Show empty state when no real insights exist
  if (!insights) {
    return (
      <div className="p-5 rounded-2xl bg-navy-50 border border-navy-100 text-center py-10">
        <p className="text-navy-400 text-sm">
          No insights yet — log some health or finance data to get started.
        </p>
      </div>
    );
  }
  const data = insights;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <h3 className="font-display font-semibold text-sm">AI Weekly Insight</h3>
        </div>
        <p className="text-navy-200 text-sm leading-relaxed">{data.summary}</p>

        {/* Scores */}
        <div className="flex gap-4 mt-4">
          {data.health_score && (
            <div className="flex-1 text-center py-2 rounded-xl bg-white/10 backdrop-blur">
              <p className="text-2xl font-bold">{data.health_score}</p>
              <p className="text-[10px] uppercase tracking-wider text-navy-300 mt-0.5">Health</p>
            </div>
          )}
          {data.financial_health_score && (
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
