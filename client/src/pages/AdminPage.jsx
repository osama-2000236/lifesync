// src/pages/AdminPage.jsx
import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { dateLocale } from '../i18n';
import { getPaginatedItems } from '../utils/paginatedResponse';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Card } from '../components/ui';
import {
  Users, AlertTriangle, Activity, Clock, UserPlus, Shield,
  Server, Zap, Search, ToggleLeft, ToggleRight, Database, FileText, Bell, Link2, Brain,
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, subtext, color, loading }) {
  if (loading) return <SkeletonCard />;
  return (
    <Card interactive padding="sm">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-navy-900">{value}</p>
      <p className="text-xs text-navy-400 mt-1">{label}</p>
      {subtext && <p className="text-xs text-navy-300 mt-0.5">{subtext}</p>}
    </Card>
  );
}

export default function AdminPage() {
  const { t, locale } = useSettings();
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [logFilter, setLogFilter] = useState('all');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [dashRes, usersRes, logsRes] = await Promise.allSettled([
          adminAPI.getDashboard(),
          adminAPI.getUsers({ limit: 20 }),
          adminAPI.getLogs({ limit: 20 }),
        ]);

        if (dashRes.status === 'fulfilled') setDashboard(dashRes.value.data.data);
        if (usersRes.status === 'fulfilled') setUsers(getPaginatedItems(usersRes.value.data, 'users'));
        if (logsRes.status === 'fulfilled') setLogs(getPaginatedItems(logsRes.value.data, 'logs'));
      } catch (err) {
        console.error('Admin data fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      await adminAPI.updateUserStatus(userId, !currentStatus);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: !currentStatus } : u))
      );
    } catch (err) {
      console.error('Failed to update user status:', err);
    }
  };

  // Map the API response (nested: users / activity_24h / system) into the flat
  // shape the cards use. Falls back to flat keys + 0 so nothing renders as NaN.
  const d = dashboard || {};
  const stats = {
    total_users: d.users?.total ?? d.total_users ?? 0,
    active_users_24h: d.users?.active ?? d.active_users_24h ?? 0,
    new_users_7d: d.users?.new_this_week ?? d.new_users_7d ?? 0,
    admins: d.users?.admins ?? 0,
    health_logs_24h: d.activity_24h?.health_logs ?? d.health_logs_24h ?? 0,
    finance_logs_24h: d.activity_24h?.finance_logs ?? d.finance_logs_24h ?? 0,
    chat_24h: d.activity_24h?.chat_messages ?? 0,
    error_count_24h: d.system?.errors_24h ?? d.error_count_24h ?? 0,
    nlp_avg_processing_ms: d.system?.nlp_avg_ms ?? d.nlp_avg_processing_ms ?? 0,
    nlp_max_processing_ms: d.system?.nlp_max_ms ?? d.nlp_max_processing_ms ?? 0,
    system_status: d.system?.status ?? 'unknown',
    reports_total: d.product?.weekly_reports_total ?? 0,
    reports_week: d.product?.weekly_reports_this_week ?? 0,
    notifications_unread: d.product?.notifications_unread ?? 0,
    integrations: d.product?.integrations_connected ?? 0,
    redis_mode: d.runtime?.redis?.mode ?? d.runtime?.ephemeral_store ?? '—',
    redis_ok: d.runtime?.redis?.ok,
    commit: d.runtime?.commit || '—',
    bert_status: d.runtime?.ai?.bert_status || '—',
    openrouter_status: d.runtime?.ai?.openrouter_status || '—',
    google_fit_configured: d.runtime?.ai?.google_fit_configured === true,
  };

  const filteredLogs = logFilter === 'all' ? logs : logs.filter((l) => l.log_type === logFilter);
  const filteredUsers = userSearch
    ? users.filter((u) =>
        (u.username || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  const severityColor = {
    info: 'bg-sky-100 text-sky-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-coral-500/10 text-coral-500',
    critical: 'bg-red-100 text-red-700',
  };

  const logFilterTypes = ['all', 'error', 'security', 'performance', 'audit'];

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-ink-800 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">{t('admin.title')}</h1>
          <p className="text-navy-500 text-sm">{t('admin.subtitle')}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label={t('admin.totalUsers')} value={stats.total_users} color="bg-indigo-50 text-indigo-500" loading={loading} />
        <StatCard icon={Activity} label={t('admin.active24h')} value={stats.active_users_24h} color="bg-emerald-50 text-emerald-500" loading={loading} />
        <StatCard icon={UserPlus} label={t('admin.new7d')} value={stats.new_users_7d} color="bg-sky-50 text-sky-500" loading={loading} />
        <StatCard icon={AlertTriangle} label={t('admin.errors24h')} value={stats.error_count_24h} color="bg-coral-500/5 text-coral-500" loading={loading} />
      </div>

      {/* NLP Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <StatCard icon={Zap} label={t('admin.nlpAvgResponse')} value={`${stats.nlp_avg_processing_ms}ms`} color="bg-amber-50 text-amber-500" loading={loading} />
        <StatCard icon={Clock} label={t('admin.nlpMaxResponse')} value={`${stats.nlp_max_processing_ms}ms`} color="bg-orange-50 text-orange-500" loading={loading} />
        <StatCard icon={Server} label={t('admin.healthFinanceLogs24h')} value={stats.health_logs_24h + stats.finance_logs_24h}
          subtext={t('admin.healthFinanceBreakdown', { health: stats.health_logs_24h, finance: stats.finance_logs_24h })}
          color="bg-purple-50 text-purple-500" loading={loading} />
      </div>

      {/* Runtime + product (UC-13/14/15 ops view) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" data-testid="admin-runtime-grid">
        <StatCard
          icon={Database}
          label={t('admin.redisMode')}
          value={stats.redis_mode}
          subtext={stats.redis_ok === false ? t('admin.redisDown') : t('admin.systemStatus', { status: stats.system_status })}
          color="bg-cyan-50 text-cyan-600"
          loading={loading}
        />
        <StatCard
          icon={Brain}
          label={t('admin.bertStatus')}
          value={String(stats.bert_status)}
          subtext={`OpenRouter: ${stats.openrouter_status}`}
          color="bg-violet-50 text-violet-600"
          loading={loading}
        />
        <StatCard
          icon={FileText}
          label={t('admin.reportsWeek')}
          value={stats.reports_week}
          subtext={t('admin.reportsTotal', { n: stats.reports_total })}
          color="bg-emerald-50 text-emerald-600"
          loading={loading}
        />
        <StatCard
          icon={Bell}
          label={t('admin.notificationsUnread')}
          value={stats.notifications_unread}
          subtext={t('admin.integrationsConnected', { n: stats.integrations })}
          color="bg-rose-50 text-rose-600"
          loading={loading}
        />
      </div>
      <div className="mb-6 flex flex-wrap gap-3 text-xs text-navy-500">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-navy-50">
          <Link2 className="w-3 h-3" />
          Google Fit: {stats.google_fit_configured ? t('admin.fitConfigured') : t('admin.fitMissing')}
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-navy-50">
          commit {stats.commit}
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-navy-50">
          {t('admin.chat24h', { n: stats.chat_24h })}
        </span>
      </div>

      {/* Users + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-navy-50 overflow-hidden">
          <div className="p-5 border-b border-navy-50">
            <h3 className="font-display font-bold text-navy-800 mb-3">{t('admin.users')}</h3>
            <div className="relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-300" />
              <input
                type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                placeholder={t('admin.searchUsers')}
                className="w-full ps-9 pe-4 py-2 rounded-lg border border-navy-100 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-navy-400 text-sm py-8">{t('admin.noUsersFound')}</p>
            ) : (
              filteredUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3 border-b border-navy-50 last:border-0 hover:bg-navy-50/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ink-800 to-ink-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(u.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy-800 truncate">{u.username}</p>
                    <p className="text-xs text-navy-400 truncate">{u.email}</p>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
                    u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-navy-100 text-navy-600'
                  }`}>
                    {u.role}
                  </span>
                  <button
                    onClick={() => toggleUserStatus(u.id, u.is_active)}
                    className={`p-1 rounded-lg transition-colors ${u.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-navy-300 hover:bg-navy-50'}`}
                    title={u.is_active ? t('admin.deactivate') : t('admin.activate')}
                  >
                    {u.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* System Logs */}
        <div className="bg-white rounded-2xl shadow-sm border border-navy-50 overflow-hidden">
          <div className="p-5 border-b border-navy-50">
            <h3 className="font-display font-bold text-navy-800 mb-3">{t('admin.systemLogs')}</h3>
            <div className="flex gap-1.5 flex-wrap">
              {logFilterTypes.map((type) => (
                <button key={type} onClick={() => setLogFilter(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    logFilter === type ? 'bg-ink-800 text-white' : 'bg-navy-50 text-navy-500 hover:bg-navy-100'
                  }`}>
                  {t(`admin.logFilter.${type}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <p className="text-center text-navy-400 text-sm py-8">{t('admin.noLogsFound')}</p>
            ) : (
              filteredLogs.map((log, i) => (
                <div key={log.id || i} className="px-5 py-3 border-b border-navy-50 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${severityColor[log.severity] || 'bg-navy-100 text-navy-600'}`}>
                      {log.severity}
                    </span>
                    <span className="text-[10px] text-navy-400 uppercase tracking-wider">{log.log_type}</span>
                    <span className="text-[10px] text-navy-300 ms-auto">
                      {new Date(log.created_at).toLocaleString(dateLocale(locale))}
                    </span>
                  </div>
                  <p className="text-sm text-navy-700">{log.action}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
