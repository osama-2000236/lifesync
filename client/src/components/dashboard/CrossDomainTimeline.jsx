// src/components/dashboard/CrossDomainTimeline.jsx
// Linked health+finance timeline with a synchronized hover crosshair. Built
// with D3 for scales/shape-generators only — React owns the DOM (renders the
// <path>/<circle> JSX from D3-computed coordinates), so there's no D3-vs-React
// DOM fight. Fed entirely from healthData/financeData already fetched by
// DashboardPage — no backend change (the API's `patterns` field has no
// per-day series, so this reads the raw logs directly instead).
import { useMemo, useState, useRef } from 'react';
import { scaleTime, scaleLinear, line as d3line, curveMonotoneX, extent, max } from 'd3';
import { useSettings } from '../../contexts/SettingsContext';
import ChartEmptyState from './ChartEmptyState';

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 24, left: 16 };

const dateKey = (d) => new Date(d).toISOString().slice(0, 10);

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
  const { t, isRTL } = useSettings();
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

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

  const x = scaleTime().domain(extent(series, (d) => d.date)).range([0, innerW]);
  const ySleep = scaleLinear().domain([0, Math.max(8, max(series, (d) => d.sleep))]).range([innerH, 0]);
  const ySpend = scaleLinear().domain([0, Math.max(1, max(series, (d) => d.spend))]).range([innerH, 0]);

  const sleepPath = d3line().x((d) => x(d.date)).y((d) => ySleep(d.sleep)).curve(curveMonotoneX)(series);
  const spendPath = d3line().x((d) => x(d.date)).y((d) => ySpend(d.spend)).curve(curveMonotoneX)(series);

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
          <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#e2e8f0" />
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
              stroke="#829ab1" strokeDasharray="3,3"
            />
          )}
        </g>
      </svg>
      {hovered && (
        <div className="mt-2 flex items-center justify-center gap-4 text-xs text-navy-600">
          <span className="font-semibold">{hovered.date.toLocaleDateString()}</span>
          <span>{t('chart.sleepHrs')}: {hovered.sleep.toFixed(1)}h</span>
          <span>{t('chart.spent')}: ${hovered.spend.toFixed(0)}</span>
        </div>
      )}
    </div>
  );
}
