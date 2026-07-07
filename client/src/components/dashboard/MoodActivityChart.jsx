import { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import { Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend } from 'chart.js';
import { useSettings } from '../../contexts/SettingsContext';
import ChartEmptyState from './ChartEmptyState';
import { chartTheme, chartMotion } from './chartTheme';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

export default function MoodActivityChart({ healthData = [], loading }) {
  const { t, theme } = useSettings();
  const c = chartTheme(theme === 'dark');
  const points = useMemo(() => {
    const dayBuckets = {};

    healthData.forEach((entry) => {
      const day = new Date(entry.logged_at || entry.created_at).toDateString();
      if (!dayBuckets[day]) dayBuckets[day] = { moods: [], exercises: [] };
      if (entry.type === 'mood') dayBuckets[day].moods.push(Number(entry.value) || 0);
      if (entry.type === 'exercise') dayBuckets[day].exercises.push(Number(entry.duration || entry.value) || 0);
      if (entry.type === 'steps') dayBuckets[day].exercises.push(Math.round((Number(entry.value) || 0) / 100));
    });

    return Object.values(dayBuckets)
      .filter((bucket) => bucket.moods.length > 0 && bucket.exercises.length > 0)
      .map((bucket) => ({
        x: bucket.exercises.reduce((sum, value) => sum + value, 0) / bucket.exercises.length,
        y: bucket.moods.reduce((sum, value) => sum + value, 0) / bucket.moods.length,
      }));
  }, [healthData]);

  const chartData = {
    datasets: [{
      label: t('dash.moodVsActivity'),
      data: points,
      backgroundColor: points.map((point) => {
        if (point.y >= 8) return 'rgba(16, 185, 129, 0.7)';
        if (point.y >= 6) return 'rgba(99, 102, 241, 0.7)';
        if (point.y >= 4) return 'rgba(245, 158, 11, 0.7)';
        return 'rgba(244, 63, 94, 0.7)';
      }),
      borderColor: 'transparent',
      pointRadius: 8,
      pointHoverRadius: 11,
    }],
  };

  const options = {
    ...chartMotion(),
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg,
        titleFont: { family: "'DM Sans'", size: 13, weight: '600' },
        bodyFont: { family: "'DM Sans'", size: 12 },
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          title: () => t('chart.dailyCorrelation'),
          label: (ctx) => [`${t('chart.activityMin')}: ${ctx.parsed.x.toFixed(0)}`, `${t('insight.mood')}: ${ctx.parsed.y.toFixed(1)}/10`],
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: t('chart.activityMin'), font: { family: "'DM Sans'", size: 11, weight: '500' }, color: c.legend },
        grid: { color: c.grid, drawBorder: false },
        ticks: { font: { family: "'DM Sans'", size: 11 }, color: c.tick },
        min: 0,
      },
      y: {
        title: { display: true, text: t('chart.moodScale'), font: { family: "'DM Sans'", size: 11, weight: '500' }, color: c.legend },
        grid: { color: c.grid, drawBorder: false },
        ticks: { font: { family: "'DM Sans'", size: 11 }, color: c.tick, stepSize: 1 },
        min: 0,
        max: 10,
      },
    },
  };

  if (loading) return <div className="h-64 skeleton rounded-xl" />;

  if (!points.length) {
    return (
      <ChartEmptyState
        title={t('chart.noMoodActivity')}
        description={t('chart.noMoodActivityDesc')}
        actionTo="/health"
        actionLabel={t('chart.addHealthData')}
      />
    );
  }

  return (
    <div>
      <div className="flex gap-3 mb-4">
        {[
          { label: t('chart.moodGreat'), color: '#10b981' },
          { label: t('chart.moodGood'), color: '#6366f1' },
          { label: t('chart.moodOkay'), color: '#f59e0b' },
          { label: t('chart.moodLow'), color: '#f43f5e' },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-navy-500">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
      <div className="h-56">
        <Scatter data={chartData} options={options} />
      </div>
    </div>
  );
}
