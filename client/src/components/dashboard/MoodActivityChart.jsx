import { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import { Chart as ChartJS, LinearScale, PointElement, Tooltip, Legend } from 'chart.js';
import ChartEmptyState from './ChartEmptyState';

ChartJS.register(LinearScale, PointElement, Tooltip, Legend);

export default function MoodActivityChart({ healthData = [], loading }) {
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
      label: 'Mood vs. Activity',
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
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#102a43',
        titleFont: { family: "'DM Sans'", size: 13, weight: '600' },
        bodyFont: { family: "'DM Sans'", size: 12 },
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          title: () => 'Daily Correlation',
          label: (ctx) => [`Activity: ${ctx.parsed.x.toFixed(0)} min`, `Mood: ${ctx.parsed.y.toFixed(1)}/10`],
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Activity (minutes)', font: { family: "'DM Sans'", size: 11, weight: '500' }, color: '#627d98' },
        grid: { color: 'rgba(188, 204, 220, 0.2)', drawBorder: false },
        ticks: { font: { family: "'DM Sans'", size: 11 }, color: '#829ab1' },
        min: 0,
      },
      y: {
        title: { display: true, text: 'Mood (1-10)', font: { family: "'DM Sans'", size: 11, weight: '500' }, color: '#627d98' },
        grid: { color: 'rgba(188, 204, 220, 0.2)', drawBorder: false },
        ticks: { font: { family: "'DM Sans'", size: 11 }, color: '#829ab1', stepSize: 1 },
        min: 0,
        max: 10,
      },
    },
  };

  if (loading) return <div className="h-64 skeleton rounded-xl" />;

  if (!points.length) {
    return (
      <ChartEmptyState
        title="Not enough mood and activity data"
        description="Log mood and exercise or steps on the same day to unlock this chart."
        actionTo="/health"
        actionLabel="Add health data"
      />
    );
  }

  return (
    <div>
      <div className="flex gap-3 mb-4">
        {[
          { label: 'Great', color: '#10b981' },
          { label: 'Good', color: '#6366f1' },
          { label: 'Okay', color: '#f59e0b' },
          { label: 'Low', color: '#f43f5e' },
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
