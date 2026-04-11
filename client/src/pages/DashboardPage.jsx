import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { healthAPI, financeAPI, insightsAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiErrors';
import { getPaginatedItems } from '../utils/paginatedResponse';
import HealthCorrelationChart from '../components/dashboard/HealthCorrelationChart';
import SpendingChart from '../components/dashboard/SpendingChart';
import MoodActivityChart from '../components/dashboard/MoodActivityChart';
import InsightCards from '../components/dashboard/InsightCards';
import { SkeletonCard } from '../components/ui/Skeleton';
import {
  Footprints, Moon, SmilePlus, Droplets,
  Wallet, Heart, BarChart3, Activity,
} from 'lucide-react';

const mapHealthSummary = (payload) => {
  const rows = payload?.summary || [];
  return rows.reduce((acc, row) => {
    acc[row.type] = {
      avg: Number(row.avg_value) || 0,
      total: Number(row.total_value) || 0,
      count: Number(row.entry_count) || 0,
    };
    return acc;
  }, {});
};

export default function DashboardPage() {
  const { user } = useAuth();
  const [healthData, setHealthData] = useState([]);
  const [financeData, setFinanceData] = useState([]);
  const [healthSummary, setHealthSummary] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [insights, setInsights] = useState(null);
  const [insightsError, setInsightsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [spendingView, setSpendingView] = useState('doughnut');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [healthRes, financeRes, healthSummaryRes, financeSummaryRes, insightsRes] = await Promise.allSettled([
          healthAPI.getLogs({ limit: 100 }),
          financeAPI.getLogs({ limit: 100 }),
          healthAPI.getWeeklySummary(),
          financeAPI.getWeeklySummary(),
          insightsAPI.getCurrent(),
        ]);

        if (healthRes.status === 'fulfilled') setHealthData(getPaginatedItems(healthRes.value.data, 'logs'));
        if (financeRes.status === 'fulfilled') setFinanceData(getPaginatedItems(financeRes.value.data, 'logs'));
        if (healthSummaryRes.status === 'fulfilled') setHealthSummary(healthSummaryRes.value.data.data);
        if (financeSummaryRes.status === 'fulfilled') setFinanceSummary(financeSummaryRes.value.data.data);
        if (insightsRes.status === 'fulfilled') {
          setInsights(insightsRes.value.data.data?.insights || null);
          setInsightsError('');
        } else {
          setInsights(null);
          setInsightsError(getApiErrorMessage(insightsRes.reason, 'Unable to load insights right now.'));
        }
      } catch (err) {
        console.warn('Dashboard data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Auto-revalidate every 30s so chat-logged data appears without manual reload
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, []);

  const normalizedHealthSummary = useMemo(() => mapHealthSummary(healthSummary), [healthSummary]);

  const quickStats = [
    {
      label: '7-Day Steps',
      value: normalizedHealthSummary.steps?.total ? normalizedHealthSummary.steps.total.toLocaleString() : '—',
      icon: Footprints,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Avg Sleep',
      value: normalizedHealthSummary.sleep?.avg ? `${normalizedHealthSummary.sleep.avg.toFixed(1)}h` : '—',
      icon: Moon,
      color: 'text-indigo-500',
      bg: 'bg-indigo-50',
    },
    {
      label: 'Avg Mood',
      value: normalizedHealthSummary.mood?.avg ? normalizedHealthSummary.mood.avg.toFixed(1) : '—',
      icon: SmilePlus,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
    {
      label: 'Avg Water',
      value: normalizedHealthSummary.water?.avg ? `${normalizedHealthSummary.water.avg.toFixed(1)}L` : '—',
      icon: Droplets,
      color: 'text-sky-500',
      bg: 'bg-sky-50',
    },
  ];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-navy-900">
          {greeting()}, {user?.name || user?.username} 👋
        </h1>
        <p className="text-navy-500 mt-1">Here&apos;s your unified lifestyle overview.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading ? (
          [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
        ) : (
          quickStats.map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border border-navy-50">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-navy-900">{value}</p>
              <p className="text-xs text-navy-400 mt-1 font-medium">{label}</p>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-navy-50">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" />
                <h2 className="font-display text-lg font-bold text-navy-800">Health Trends</h2>
              </div>
              <span className="text-xs text-navy-400 font-medium px-3 py-1 rounded-full bg-navy-50">Last 7 days</span>
            </div>
            <HealthCorrelationChart healthData={healthData} loading={loading} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-navy-50">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-coral-500" />
                  <h2 className="font-display text-base font-bold text-navy-800">Spending</h2>
                </div>
                <div className="flex gap-1 bg-navy-50 rounded-lg p-0.5">
                  {['doughnut', 'bar'].map((value) => (
                    <button
                      key={value}
                      onClick={() => setSpendingView(value)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        spendingView === value ? 'bg-white shadow text-navy-700' : 'text-navy-400 hover:text-navy-600'
                      }`}
                    >
                      {value === 'doughnut' ? '◐' : '☰'}
                    </button>
                  ))}
                </div>
              </div>
              <SpendingChart
                financeData={financeData}
                financeSummary={financeSummary}
                loading={loading}
                view={spendingView}
              />
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-navy-50">
              <div className="flex items-center gap-2 mb-5">
                <Heart className="w-5 h-5 text-purple-500" />
                <h2 className="font-display text-base font-bold text-navy-800">Mood vs. Activity</h2>
              </div>
              <MoodActivityChart healthData={healthData} loading={loading} />
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-navy-500" />
            <h2 className="font-display text-lg font-bold text-navy-800">Insights</h2>
          </div>
          <InsightCards insights={insights} loading={loading} error={insightsError} />
        </div>
      </div>
    </div>
    </div>
  );
}
