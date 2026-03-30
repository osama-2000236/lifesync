// src/components/dashboard/SpendingChart.jsx
import { useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend
} from 'chart.js';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const CATEGORY_COLORS = {
  'Food & Dining': '#f43f5e',
  'Transportation': '#f59e0b',
  'Entertainment': '#8b5cf6',
  'Shopping': '#ec4899',
  'Bills & Utilities': '#6366f1',
  'Healthcare': '#10b981',
  'Education': '#0ea5e9',
  'Groceries': '#14b8a6',
  'Other': '#94a3b8',
};

export default function SpendingChart({ financeData = [], loading, view = 'doughnut' }) {
  const { categoryData, totalSpent, totalIncome } = useMemo(() => {
    const cats = {};
    let spent = 0;
    let income = 0;

    if (financeData.length > 0) {
      financeData.forEach((entry) => {
        const amount = Number(entry.amount) || 0;
        if (entry.type === 'expense') {
          const cat = entry.category?.name || entry.category_name || 'Other';
          cats[cat] = (cats[cat] || 0) + amount;
          spent += amount;
        } else {
          income += amount;
        }
      });
    } else {
      // Demo data
      Object.assign(cats, {
        'Food & Dining': 185,
        'Transportation': 65,
        'Entertainment': 45,
        'Bills & Utilities': 120,
        'Groceries': 95,
        'Shopping': 55,
      });
      spent = Object.values(cats).reduce((a, b) => a + b, 0);
      income = 1200;
    }

    return {
      categoryData: Object.entries(cats).sort((a, b) => b[1] - a[1]),
      totalSpent: spent,
      totalIncome: income,
    };
  }, [financeData]);

  const doughnutData = {
    labels: categoryData.map(([cat]) => cat),
    datasets: [{
      data: categoryData.map(([, amount]) => amount),
      backgroundColor: categoryData.map(([cat]) => CATEGORY_COLORS[cat] || '#94a3b8'),
      borderColor: '#fff',
      borderWidth: 3,
      hoverOffset: 6,
    }],
  };

  const barData = {
    labels: categoryData.map(([cat]) => cat),
    datasets: [{
      label: 'Spending ($)',
      data: categoryData.map(([, amount]) => amount),
      backgroundColor: categoryData.map(([cat]) => CATEGORY_COLORS[cat] || '#94a3b8'),
      borderRadius: 8,
      borderSkipped: false,
      barThickness: 28,
    }],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#102a43',
        titleFont: { family: "'DM Sans'", size: 13, weight: '600' },
        bodyFont: { family: "'DM Sans'", size: 12 },
        padding: 12,
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => ` $${ctx.parsed.toFixed(2)} (${((ctx.parsed / totalSpent) * 100).toFixed(0)}%)`,
        },
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#102a43',
        titleFont: { family: "'DM Sans'", size: 13 },
        bodyFont: { family: "'DM Sans'", size: 12 },
        padding: 12,
        cornerRadius: 10,
        callbacks: { label: (ctx) => ` $${ctx.parsed.x.toFixed(2)}` },
      },
    },
    scales: {
      x: { grid: { color: 'rgba(188, 204, 220, 0.2)', drawBorder: false }, ticks: { font: { family: "'DM Sans'", size: 11 }, color: '#829ab1', callback: (v) => `$${v}` } },
      y: { grid: { display: false }, ticks: { font: { family: "'DM Sans'", size: 11, weight: '500' }, color: '#486581' } },
    },
  };

  if (loading) return <div className="h-64 skeleton rounded-xl" />;

  return (
    <div>
      {/* Summary Pills */}
      <div className="flex gap-3 mb-5">
        <div className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
          <p className="text-[11px] text-emerald-600 font-medium uppercase tracking-wider">Income</p>
          <p className="text-lg font-bold text-emerald-700">${totalIncome.toFixed(0)}</p>
        </div>
        <div className="flex-1 px-4 py-2.5 rounded-xl bg-coral-500/5 border border-coral-500/10">
          <p className="text-[11px] text-coral-500 font-medium uppercase tracking-wider">Spent</p>
          <p className="text-lg font-bold text-coral-500">${totalSpent.toFixed(0)}</p>
        </div>
      </div>

      {view === 'doughnut' ? (
        <div className="flex items-center gap-6">
          <div className="w-44 h-44 relative">
            <Doughnut data={doughnutData} options={doughnutOptions} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[11px] text-navy-400 font-medium">Total</p>
              <p className="text-xl font-bold text-navy-800">${totalSpent.toFixed(0)}</p>
            </div>
          </div>
          {/* Legend */}
          <div className="flex-1 space-y-2">
            {categoryData.slice(0, 6).map(([cat, amount]) => (
              <div key={cat} className="flex items-center gap-2 text-sm">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[cat] || '#94a3b8' }} />
                <span className="flex-1 text-navy-600 truncate">{cat}</span>
                <span className="font-semibold text-navy-800">${amount.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-56">
          <Bar data={barData} options={barOptions} />
        </div>
      )}
    </div>
  );
}
