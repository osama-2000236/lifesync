import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { healthAPI, financeAPI, insightsAPI } from '../services/api';
import { getApiErrorMessage } from '../utils/apiErrors';
import { getPaginatedItems } from '../utils/paginatedResponse';
// The three Chart.js components are ~80% of this page's chunk (96KB gz).
// Lazy them so the shell (KPIs, streak, insights) paints without Chart.js;
// each slot shows the same skeleton the charts use for data-loading.
const HealthCorrelationChart = lazy(() => import('../components/dashboard/HealthCorrelationChart'));
const SpendingChart = lazy(() => import('../components/dashboard/SpendingChart'));
const MoodActivityChart = lazy(() => import('../components/dashboard/MoodActivityChart'));
const chartSkeleton = <div className="h-64 skeleton rounded-xl" />;
import InsightCards from '../components/dashboard/InsightCards';
import SecondMindCard from '../components/dashboard/SecondMindCard';
import StreakCard from '../components/dashboard/StreakCard';
import CorrelationPanel from '../components/dashboard/CorrelationPanel';
import CrossDomainTimeline from '../components/dashboard/CrossDomainTimeline';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Card } from '../components/ui';
import {
  Footprints, Moon, SmilePlus, Droplets,
  Wallet, Heart, BarChart3, Activity, Link2,
} from 'lucide-react';

const STAT_ACCENT = {
  'text-emerald-500': 'bg-emerald-500',
  'text-indigo-500': 'bg-indigo-500',
  'text-amber-500': 'bg-amber-500',
  'text-sky-500': 'bg-sky-500',
};

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

const DASHBOARD_REFRESH_INTERVAL_MS = 30_000;
const INSIGHTS_REFRESH_INTERVAL_MS = 5 * 60_000;

export default function DashboardPage() {
  const { user } = useAuth();
  const { t } = useSettings();
  const [healthData, setHealthData] = useState([]);
  const [financeData, setFinanceData] = useState([]);
  const [healthSummary, setHealthSummary] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [insights, setInsights] = useState(null);
  const [gamification, setGamification] = useState(null);
  const [insightsError, setInsightsError] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [spendingView, setSpendingView] = useState('doughnut');
  const dashboardFetchInFlightRef = useRef(false);
  const insightsFetchInFlightRef = useRef(false);
  // If chat logs XD data while a fetch is already running, don't drop the refresh.
  const dashboardRefreshQueuedRef = useRef(false);
  const insightsRefreshQueuedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async ({ isInitial = false } = {}) => {
      if (dashboardFetchInFlightRef.current) {
        dashboardRefreshQueuedRef.current = true;
        return;
      }
      dashboardFetchInFlightRef.current = true;

      if (isInitial && isMounted) {
        setDashboardLoading(true);
      }

      try {
        const [healthRes, financeRes, healthSummaryRes, financeSummaryRes, gamificationRes] = await Promise.allSettled([
          healthAPI.getLogs({ limit: 100 }),
          financeAPI.getLogs({ limit: 100 }),
          healthAPI.getWeeklySummary(),
          financeAPI.getWeeklySummary(),
          insightsAPI.getGamification(),
        ]);

        if (!isMounted) return;

        if (gamificationRes.status === 'fulfilled') {
          setGamification(gamificationRes.value.data.data || null);
        }

        if (healthRes.status === 'fulfilled') {
          setHealthData(getPaginatedItems(healthRes.value.data, 'logs'));
        }
        if (financeRes.status === 'fulfilled') {
          setFinanceData(getPaginatedItems(financeRes.value.data, 'logs'));
        }
        if (healthSummaryRes.status === 'fulfilled') {
          setHealthSummary(healthSummaryRes.value.data.data);
        }
        if (financeSummaryRes.status === 'fulfilled') {
          setFinanceSummary(financeSummaryRes.value.data.data);
        }
      } catch (err) {
        console.warn('Dashboard data fetch error:', err);
      } finally {
        dashboardFetchInFlightRef.current = false;
        if (isInitial && isMounted) {
          setDashboardLoading(false);
        }
        // Chat logged while we were fetching → pull again so XD values show up.
        if (dashboardRefreshQueuedRef.current && isMounted) {
          dashboardRefreshQueuedRef.current = false;
          fetchDashboardData();
        }
      }
    };

    const fetchInsights = async ({ isInitial = false } = {}) => {
      if (insightsFetchInFlightRef.current) {
        insightsRefreshQueuedRef.current = true;
        return;
      }
      insightsFetchInFlightRef.current = true;

      if (isInitial && isMounted) {
        setInsightsLoading(true);
      }

      try {
        const insightsRes = await insightsAPI.getCurrent();
        if (!isMounted) return;

        setInsights(insightsRes.data.data?.insights || null);
        setInsightsError('');
      } catch (err) {
        if (!isMounted) return;

        setInsights((currentInsights) => currentInsights || null);
        setInsightsError(getApiErrorMessage(err, t('errors.insightsLoad')));
      } finally {
        insightsFetchInFlightRef.current = false;
        if (isMounted) {
          setInsightsLoading(false);
        }
        if (insightsRefreshQueuedRef.current && isMounted) {
          insightsRefreshQueuedRef.current = false;
          fetchInsights();
        }
      }
    };

    fetchDashboardData({ isInitial: true });
    fetchInsights({ isInitial: true });

    const dashboardInterval = setInterval(() => fetchDashboardData(), DASHBOARD_REFRESH_INTERVAL_MS);
    const insightsInterval = setInterval(() => fetchInsights(), INSIGHTS_REFRESH_INTERVAL_MS);

    // Instant refresh when the assistant logs something in chat (records an
    // intent → the dashboard reflects it right away instead of waiting 30s).
    const onDataChanged = () => {
      fetchDashboardData();
      fetchInsights();
    };
    window.addEventListener('lifesync:data-changed', onDataChanged);
    // Also refresh when the tab becomes visible again (user switched from chat).
    const onVisible = () => {
      if (document.visibilityState === 'visible') onDataChanged();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      isMounted = false;
      // Reset in-flight guards so a remount (e.g. React StrictMode's
      // mount→unmount→remount in dev) can fetch again instead of deadlocking.
      dashboardFetchInFlightRef.current = false;
      insightsFetchInFlightRef.current = false;
      dashboardRefreshQueuedRef.current = false;
      insightsRefreshQueuedRef.current = false;
      clearInterval(dashboardInterval);
      clearInterval(insightsInterval);
      window.removeEventListener('lifesync:data-changed', onDataChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Mount-only by design: intervals + the data-changed listener must not be
    // torn down and re-created on locale switches (`t` is only used for
    // fallback error copy inside the fetchers).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedHealthSummary = useMemo(() => mapHealthSummary(healthSummary), [healthSummary]);

  const quickStats = [
    {
      label: t('dash.steps7d'),
      value: normalizedHealthSummary.steps?.total ? normalizedHealthSummary.steps.total.toLocaleString() : '—',
      icon: Footprints,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: t('dash.avgSleep'),
      value: normalizedHealthSummary.sleep?.avg ? `${normalizedHealthSummary.sleep.avg.toFixed(1)}h` : '—',
      icon: Moon,
      color: 'text-indigo-500',
      bg: 'bg-indigo-50',
    },
    {
      label: t('dash.avgMood'),
      value: normalizedHealthSummary.mood?.avg ? normalizedHealthSummary.mood.avg.toFixed(1) : '—',
      icon: SmilePlus,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
    {
      label: t('dash.avgWater'),
      value: normalizedHealthSummary.water?.avg ? `${normalizedHealthSummary.water.avg.toFixed(1)}L` : '—',
      icon: Droplets,
      color: 'text-sky-500',
      bg: 'bg-sky-50',
    },
  ];

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dash.goodMorning');
    if (hour < 17) return t('dash.goodAfternoon');
    return t('dash.goodEvening');
  };

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-navy-900">
          {greeting()}, {user?.name || user?.username} 👋
        </h1>
        <p className="text-navy-500 mt-1">{t('dash.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {dashboardLoading ? (
          [1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)
        ) : (
          quickStats.map(({ label, value, icon: Icon, color, bg }, i) => (
            <Card
              key={label}
              interactive
              padding="none"
              className="p-5 overflow-hidden relative animate-fade-up"
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' }}
            >
              <span className={`absolute top-0 inset-x-0 h-0.5 ${STAT_ACCENT[color] || 'bg-navy-300'}`} />
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-navy-900 tabular-nums">{value}</p>
              <p className="text-xs text-navy-400 mt-1 font-medium">{label}</p>
            </Card>
          ))
        )}
      </div>

      {(gamification || dashboardLoading) && (
        <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SecondMindCard horizon={gamification?.horizon} goals={gamification?.goals} loading={dashboardLoading && !gamification} />
          <StreakCard data={gamification} loading={dashboardLoading && !gamification} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-navy-50 animate-fade-up" style={{ animationDelay: '120ms', animationFillMode: 'backwards' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" />
                <h2 className="font-display text-lg font-bold text-navy-800">{t('dash.healthTrends')}</h2>
              </div>
              <span className="text-xs text-navy-400 font-medium px-3 py-1 rounded-full bg-navy-50">{t('dash.last7days')}</span>
            </div>
            <Suspense fallback={chartSkeleton}>
              <HealthCorrelationChart healthData={healthData} loading={dashboardLoading} />
            </Suspense>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-navy-50 animate-fade-up" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-indigo-500" />
                <h2 className="font-display text-lg font-bold text-navy-800">{t('dash.correlations')}</h2>
              </div>
              <span className="text-xs text-navy-400 font-medium px-3 py-1 rounded-full bg-navy-50">{t('dash.correlationsSub')}</span>
            </div>
            <CrossDomainTimeline healthData={healthData} financeData={financeData} loading={dashboardLoading} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-navy-50 animate-fade-up" style={{ animationDelay: '280ms', animationFillMode: 'backwards' }}>
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-coral-500" />
                  <h2 className="font-display text-base font-bold text-navy-800">{t('dash.spending')}</h2>
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
              <Suspense fallback={chartSkeleton}>
                <SpendingChart
                  financeData={financeData}
                  financeSummary={financeSummary}
                  loading={dashboardLoading}
                  view={spendingView}
                />
              </Suspense>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-navy-50 animate-fade-up" style={{ animationDelay: '340ms', animationFillMode: 'backwards' }}>
              <div className="flex items-center gap-2 mb-5">
                <Heart className="w-5 h-5 text-purple-500" />
                <h2 className="font-display text-base font-bold text-navy-800">{t('dash.moodVsActivity')}</h2>
              </div>
              <Suspense fallback={chartSkeleton}>
                <MoodActivityChart healthData={healthData} loading={dashboardLoading} />
              </Suspense>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-navy-500" />
            <h2 className="font-display text-lg font-bold text-navy-800">{t('dash.insights')}</h2>
          </div>
          <InsightCards insights={insights} loading={insightsLoading} error={insightsError} />
          <CorrelationPanel patterns={insights?.patterns || []} loading={insightsLoading} />
        </div>
      </div>
    </div>
    </div>
  );
}
