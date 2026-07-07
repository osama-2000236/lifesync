import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { useSettings } from '../../contexts/SettingsContext';
import ChartEmptyState from './ChartEmptyState';
import { chartTheme, chartMotion } from './chartTheme';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Localized short weekday labels (Mon-first). 2024-01-01 is a Monday.
const dayLabels = (locale) => {
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { weekday: 'short' });
  return DAYS.map((_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
};

export default function HealthCorrelationChart({ healthData = [], loading }) {
  const { t, theme, locale } = useSettings();
  const c = chartTheme(theme === 'dark');
  const { hasData, chartData } = useMemo(() => {
    const dayMap = Object.fromEntries(DAYS.map((day) => [day, { steps: 0, sleep: 0 }]));
    let hasRelevantData = false;

    healthData.forEach((entry) => {
      const date = new Date(entry.logged_at || entry.created_at);
      const dayName = DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];

      if (entry.type === 'steps') {
        dayMap[dayName].steps += Number(entry.value) || 0;
        hasRelevantData = true;
      }

      if (entry.type === 'sleep') {
        dayMap[dayName].sleep += Number(entry.value) || 0;
        hasRelevantData = true;
      }
    });

    return {
      hasData: hasRelevantData,
      chartData: {
        labels: dayLabels(locale),
        datasets: [
          {
            label: t('chart.steps'),
            data: DAYS.map((day) => dayMap[day].steps),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#10b981',
            pointBorderColor: c.segmentBorder,
            pointBorderWidth: 2,
            tension: 0.4,
            fill: true,
            yAxisID: 'y',
          },
          {
            label: t('chart.sleepHrs'),
            data: DAYS.map((day) => dayMap[day].sleep),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#6366f1',
            pointBorderColor: c.segmentBorder,
            pointBorderWidth: 2,
            tension: 0.4,
            fill: true,
            yAxisID: 'y1',
          },
        ],
      },
    };
  }, [healthData, t, locale, c.segmentBorder]);

  const options = {
    ...chartMotion(),
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          font: { family: c.font, size: 12, weight: '500' },
          color: c.legend,
        },
      },
      tooltip: {
        backgroundColor: c.tooltipBg,
        titleFont: { family: c.font, size: 13, weight: '600' },
        bodyFont: { family: c.font, size: 12 },
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: c.font, size: 12 }, color: c.tick },
      },
      y: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: t('chart.steps'), font: { family: c.font, size: 11, weight: '500' }, color: '#10b981' },
        grid: { color: c.grid, drawBorder: false },
        ticks: { font: { family: c.font, size: 11 }, color: c.tick },
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: t('chart.sleepHrs'), font: { family: c.font, size: 11, weight: '500' }, color: '#6366f1' },
        grid: { display: false },
        ticks: { font: { family: c.font, size: 11 }, color: c.tick },
        min: 0,
        max: 12,
      },
    },
  };

  if (loading) return <div className="h-64 skeleton rounded-xl" />;

  if (!hasData) {
    return (
      <ChartEmptyState
        title={t('chart.noHealthTrends')}
        description={t('chart.noHealthTrendsDesc')}
        actionTo="/health"
        actionLabel={t('chart.addHealthData')}
      />
    );
  }

  return (
    <div className="h-72">
      <Line data={chartData} options={options} />
    </div>
  );
}
