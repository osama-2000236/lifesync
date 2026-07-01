// src/components/dashboard/CorrelationPanel.jsx
// Renders insights.patterns[] — real structured data the API already returns
// (domain/trend/severity/observation) but that no UI surfaced before this.
// Deliberately NOT a numeric bar chart: the API exposes qualitative severity/
// trend, not a raw correlation coefficient, so a bar-length-by-strength chart
// would fabricate precision the data doesn't have.
import { Heart, Wallet, Link2, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { Card, Badge } from '../ui';
import ChartEmptyState from './ChartEmptyState';

const DOMAIN_CONFIG = {
  health: { icon: Heart, tone: 'coral' },
  finance: { icon: Wallet, tone: 'amber' },
  both: { icon: Link2, tone: 'purple' },
};

const SEVERITY_BORDER = {
  positive: 'border-s-emerald-400',
  concerning: 'border-s-coral-400',
  informative: 'border-s-blue-400',
  neutral: 'border-s-navy-300',
};

const TREND_ICON = {
  improving: TrendingUp,
  declining: TrendingDown,
  stable: Minus,
  insufficient_data: AlertTriangle,
};

export default function CorrelationPanel({ patterns = [], loading }) {
  const { t } = useSettings();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <div key={i} className="h-20 skeleton rounded-xl" />)}
      </div>
    );
  }

  if (!patterns.length) {
    return (
      <ChartEmptyState
        title={t('chart.noCorrelations')}
        description={t('chart.noCorrelationsDesc')}
      />
    );
  }

  return (
    <div className="space-y-3">
      {patterns.map((pattern, i) => {
        const domain = DOMAIN_CONFIG[pattern.domain] || DOMAIN_CONFIG.both;
        const DomainIcon = domain.icon;
        const TrendIcon = TREND_ICON[pattern.trend] || Minus;
        const borderClass = SEVERITY_BORDER[pattern.severity] || SEVERITY_BORDER.neutral;

        return (
          <Card
            key={i}
            interactive
            padding="sm"
            className={`border-s-4 ${borderClass} flex items-start gap-3`}
          >
            <div className="flex-shrink-0 flex items-center gap-1.5">
              <Badge tone={domain.tone} icon={DomainIcon} size="sm" />
              <TrendIcon className="w-3.5 h-3.5 text-navy-400" />
            </div>
            <p className="text-sm text-navy-700 leading-relaxed flex-1">{pattern.observation}</p>
          </Card>
        );
      })}
    </div>
  );
}
