import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import ChartEmptyState from './ChartEmptyState';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function HealthCorrelationChart({ healthData = [], loading }) {
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
        labels: DAYS,
        datasets: [
          {
            label: 'Steps',
            data: DAYS.map((day) => dayMap[day].steps),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.4,
            fill: true,
            yAxisID: 'y',
          },
          {
            label: 'Sleep (hrs)',
            data: DAYS.map((day) => dayMap[day].sleep),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#6366f1',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            tension: 0.4,
            fill: true,
            yAxisID: 'y1',
          },
        ],
      },
    };
  }, [healthData]);

  const options = {
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
          font: { family: "'DM Sans', sans-serif", size: 12, weight: '500' },
          color: '#627d98',
        },
      },
      tooltip: {
        backgroundColor: '#102a43',
        titleFont: { family: "'DM Sans', sans-serif", size: 13, weight: '600' },
        bodyFont: { family: "'DM Sans', sans-serif", size: 12 },
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: "'DM Sans'", size: 12 }, color: '#829ab1' },
      },
      y: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'Steps', font: { family: "'DM Sans'", size: 11, weight: '500' }, color: '#10b981' },
        grid: { color: 'rgba(188, 204, 220, 0.3)', drawBorder: false },
        ticks: { font: { family: "'DM Sans'", size: 11 }, color: '#829ab1' },
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Sleep (hours)', font: { family: "'DM Sans'", size: 11, weight: '500' }, color: '#6366f1' },
        grid: { display: false },
        ticks: { font: { family: "'DM Sans'", size: 11 }, color: '#829ab1' },
        min: 0,
        max: 12,
      },
    },
  };

  if (loading) return <div className="h-64 skeleton rounded-xl" />;

  if (!hasData) {
    return (
      <ChartEmptyState
        title="No health trends yet"
        description="Add health logs or sync Google Fit to unlock your weekly steps and sleep chart."
        actionTo="/health"
        actionLabel="Add health data"
      />
    );
  }

  return (
    <div className="h-72">
      <Line data={chartData} options={options} />
    </div>
  );
}
