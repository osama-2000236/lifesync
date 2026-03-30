// src/components/dashboard/HealthCorrelationChart.jsx
import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function HealthCorrelationChart({ healthData = [], loading }) {
  const chartData = useMemo(() => {
    // Group health data by day, extract steps and sleep
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayMap = {};

    // Initialize
    days.forEach((d) => { dayMap[d] = { steps: 0, sleep: 0 }; });

    // If we have real data, map it
    if (healthData.length > 0) {
      healthData.forEach((entry) => {
        const date = new Date(entry.logged_at || entry.created_at);
        const dayName = days[date.getDay() === 0 ? 6 : date.getDay() - 1];
        if (entry.type === 'steps') dayMap[dayName].steps += Number(entry.value) || 0;
        if (entry.type === 'sleep') dayMap[dayName].sleep += Number(entry.value) || 0;
      });
    } else {
      // Demo data for visualization
      const demoSteps = [6200, 8400, 5100, 9800, 7300, 11200, 4500];
      const demoSleep = [7.2, 6.5, 8.1, 5.8, 7.0, 6.3, 8.5];
      days.forEach((d, i) => {
        dayMap[d].steps = demoSteps[i];
        dayMap[d].sleep = demoSleep[i];
      });
    }

    return {
      labels: days,
      datasets: [
        {
          label: 'Steps',
          data: days.map((d) => dayMap[d].steps),
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
          data: days.map((d) => dayMap[d].sleep),
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

  if (loading) {
    return <div className="h-64 skeleton rounded-xl" />;
  }

  return (
    <div className="h-72">
      <Line data={chartData} options={options} />
    </div>
  );
}
