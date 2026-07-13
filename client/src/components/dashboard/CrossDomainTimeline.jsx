// src/components/dashboard/CrossDomainTimeline.jsx
// Linked health+finance timeline with a synchronized hover crosshair. React
// owns the DOM and renders <path>/<circle> JSX from plain linear-scale math.
// Fed entirely from healthData/financeData already fetched by DashboardPage —
// no backend change (the API's `patterns` field has no per-day series, so
// this reads the raw logs directly instead).
import { useMemo, useState, useRef } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { dateLocale } from '../../i18n';
import ChartEmptyState from './ChartEmptyState';
import { chartTheme } from './chartTheme';

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 24, left: 16 };

const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

// ponytail: linear scales + straight-segment path replace d3 (its only use in
// the app) — bring back d3-shape's curveMonotoneX only if smooth curves are asked for.
const makeScale = (d0, d1, r0, r1) => {
  const scale = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  scale.invert = (p) => d0 + ((p - r0) / (r1 - r0 || 1)) * (d1 - d0);
  return scale;
};

const linePath = (points) => points.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join('');

export function buildDailySeries(healthData, financeData) {
  const sleepByDay = new Map();
  const spendByDay = new Map();

  healthData.forEach((entry) => {
    if (entry.type !== 'sleep') return;
    const key = dateKey(entry.logged_at || entry.created_at);
    sleepByDay.set(key, (sleepByDay.get(key) || 0) + (Number(entry.value) || 0));
  });

  financeData.forEach((entry) => {
    if (entry.type !== 'expense') return;
    const key = dateKey(entry.logged_at || entry.created_at);
    spendByDay.set(key, (spendByDay.get(key) || 0) + (Number(entry.amount) || 0));
  });

  const allDays = [...new Set([...sleepByDay.keys(), ...spendByDay.keys()])].sort();

  return allDays.map((key) => ({
    date: new Date(key),
    sleep: sleepByDay.get(key) || 0,
    spend: spendByDay.get(key) || 0,
  }));
}

export default function CrossDomainTimeline({ healthData = [], financeData = [], loading }) {
  const { t, isRTL, locale, theme } = useSettings();
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);
  // Canvas/SVG stroke literals can't inherit the CSS `.dark` ramp, so pull the
  // theme-varying axis/guide colors from the same source Chart.js charts use.
  const c = chartTheme(theme === 'dark');

  const series = useMemo(() => buildDailySeries(healthData, financeData), [healthData, financeData]);

  if (loading) return <div className="h-56 skeleton rounded-xl" />;

  if (series.length < 3) {
    return (
      <ChartEmptyState
        title={t('chart.noCorrelations')}
        description={t('chart.noCorrelationsDesc')}
      />
    );
  }

  const innerW = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const times = series.map((d) => d.date.getTime());
  const x = makeScale(Math.min(...times), Math.max(...times), 0, innerW);
  const ySleep = makeScale(0, Math.max(8, ...series.map((d) => d.sleep)), innerH, 0);
  const ySpend = makeScale(0, Math.max(1, ...series.map((d) => d.spend)), innerH, 0);

  const sleepPath = linePath(series.map((d) => [x(d.date), ySleep(d.sleep)]));
  const spendPath = linePath(series.map((d) => [x(d.date), ySpend(d.spend)]));

  const handleMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = (isRTL ? rect.right - e.clientX : e.clientX - rect.left) - MARGIN.left;
    const targetDate = x.invert(px);
    let closest = 0;
    let closestDiff = Infinity;
    series.forEach((d, i) => {
      const diff = Math.abs(d.date - targetDate);
      if (diff < closestDiff) { closestDiff = diff; closest = i; }
    });
    setHoverIndex(closest);
  };

  const hovered = hoverIndex !== null ? series[hoverIndex] : null;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs">
        <span className="flex items-center gap-1.5 text-navy-500">
          <span className="w-2.5 h-0.5 rounded-full bg-indigo-500 inline-block" /> {t('chart.sleepHrs')}
        </span>
        <span className="flex items-center gap-1.5 text-navy-500">
          <span className="w-2.5 h-0.5 rounded-full bg-coral-500 inline-block" /> {t('chart.spent')}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-56"
        style={{ direction: 'ltr' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke={c.grid} />
          <path d={sleepPath} fill="none" stroke="#6366f1" strokeWidth={2.5} />
          <path d={spendPath} fill="none" stroke="#f43f5e" strokeWidth={2.5} />
          {series.map((d, i) => (
            <g key={i}>
              <circle cx={x(d.date)} cy={ySleep(d.sleep)} r={hoverIndex === i ? 4.5 : 2.5} fill="#6366f1" />
              <circle cx={x(d.date)} cy={ySpend(d.spend)} r={hoverIndex === i ? 4.5 : 2.5} fill="#f43f5e" />
            </g>
          ))}
          {hovered && (
            <line
              x1={x(hovered.date)} x2={x(hovered.date)}
              y1={0} y2={innerH}
              stroke={c.tick} strokeDasharray="3,3"
            />
          )}
        </g>
      </svg>
      {hovered && (
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-navy-600">
          <span className="font-semibold">{hovered.date.toLocaleDateString(dateLocale(locale))}</span>
          <span>{t('chart.sleepHrs')}: {hovered.sleep.toFixed(1)}h</span>
          <span>{t('chart.spent')}: ${hovered.spend.toFixed(0)}</span>
        </div>
      )}
    </div>
  );
}
