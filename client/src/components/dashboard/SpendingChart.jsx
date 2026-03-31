import { useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js';
import ChartEmptyState from './ChartEmptyState';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const CATEGORY_COLORS = {
  'Food & Dining': '#f43f5e',
  Transportation: '#f59e0b',
  Entertainment: '#8b5cf6',
  Shopping: '#ec4899',
  'Bills & Utilities': '#6366f1',
  Healthcare: '#10b981',
  Education: '#0ea5e9',
  Groceries: '#14b8a6',
  Other: '#94a3b8',
};

export default function SpendingChart({ financeData = [], financeSummary, loading, view = 'doughnut' }) {
  const { categoryData, totalSpent, totalIncome } = useMemo(() => {
    if (financeSummary?.categoryBreakdown?.length || financeSummary?.totals?.length) {
      const categoryRows = financeSummary.categoryBreakdown || [];
      const totalsByType = Object.fromEntries(
        (financeSummary.totals || []).map((row) => [row.type, Number(row.total) || 0])
      );

      return {
        categoryData: categoryRows
          .map((row) => [row.category?.name || 'Other', Number(row.total) || 0])
          .sort((a, b) => b[1] - a[1]),
        totalSpent: totalsByType.expense || 0,
        totalIncome: totalsByType.income || 0,
      };
    }

    const categories = {};
    let spent = 0;
    let income = 0;

    financeData.forEach((entry) => {
      const amount = Number(entry.amount) || 0;
      if (entry.type === 'expense') {
        const category = entry.category?.name || entry.category_name || 'Other';
        categories[category] = (categories[category] || 0) + amount;
        spent += amount;
      } else if (entry.type === 'income') {
        income += amount;
      }
    });

    return {
      categoryData: Object.entries(categories).sort((a, b) => b[1] - a[1]),
      totalSpent: spent,
      totalIncome: income,
    };
  }, [financeData, financeSummary]);

  const hasExpenseData = categoryData.length > 0;

  const doughnutData = {
    labels: categoryData.map(([category]) => category),
    datasets: [{
      data: categoryData.map(([, amount]) => amount),
      backgroundColor: categoryData.map(([category]) => CATEGORY_COLORS[category] || '#94a3b8'),
      borderColor: '#fff',
      borderWidth: 3,
      hoverOffset: 6,
    }],
  };

  const barData = {
    labels: categoryData.map(([category]) => category),
    datasets: [{
      label: 'Spending ($)',
      data: categoryData.map(([, amount]) => amount),
      backgroundColor: categoryData.map(([category]) => CATEGORY_COLORS[category] || '#94a3b8'),
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
          label: (ctx) => ` $${ctx.parsed.toFixed(2)} (${totalSpent ? ((ctx.parsed / totalSpent) * 100).toFixed(0) : 0}%)`,
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
      x: { grid: { color: 'rgba(188, 204, 220, 0.2)', drawBorder: false }, ticks: { font: { family: "'DM Sans'", size: 11 }, color: '#829ab1', callback: (value) => `$${value}` } },
      y: { grid: { display: false }, ticks: { font: { family: "'DM Sans'", size: 11, weight: '500' }, color: '#486581' } },
    },
  };

  if (loading) return <div className="h-64 skeleton rounded-xl" />;

  if (!hasExpenseData) {
    return (
      <ChartEmptyState
        title="No spending data yet"
        description="Add expense logs to see real category breakdowns and weekly totals."
        actionTo="/finance"
        actionLabel="Add finance data"
      />
    );
  }

  return (
    <div>
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
          <div className="flex-1 space-y-2">
            {categoryData.slice(0, 6).map(([category, amount]) => (
              <div key={category} className="flex items-center gap-2 text-sm">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[category] || '#94a3b8' }} />
                <span className="flex-1 text-navy-600 truncate">{category}</span>
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
