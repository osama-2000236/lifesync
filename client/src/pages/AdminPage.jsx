// src/pages/AdminPage.jsx
import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { SkeletonCard } from '../components/ui/Skeleton';
import {
  Users, AlertTriangle, Activity, Clock, UserPlus, Shield,
  Server, Zap, Search, ToggleLeft, ToggleRight
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, subtext, color, loading }) {
  if (loading) return <SkeletonCard />;
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-navy-50 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-navy-900">{value}</p>
      <p className="text-xs text-navy-400 mt-1">{label}</p>
      {subtext && <p className="text-xs text-navy-300 mt-0.5">{subtext}</p>}
    </div>
  );
}

export default function AdminPage() {
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
        if (usersRes.status === 'fulfilled') setUsers(usersRes.value.data.data?.users || []);
        if (logsRes.status === 'fulfilled') setLogs(logsRes.value.data.data?.logs || []);
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

  // Use demo data when no real data
  const stats = dashboard || {
    total_users: 0,
    active_users_24h: 0,
    new_users_7d: 0,
    health_logs_24h: 0,
    finance_logs_24h: 0,
    error_count_24h: 0,
    nlp_avg_processing_ms: 0,
    nlp_max_processing_ms: 0,
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

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-navy-800 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900">Admin Portal</h1>
          <p className="text-navy-500 text-sm">System monitoring & user management</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Total Users" value={stats.total_users} color="bg-indigo-50 text-indigo-500" loading={loading} />
        <StatCard icon={Activity} label="Active (24h)" value={stats.active_users_24h} color="bg-emerald-50 text-emerald-500" loading={loading} />
        <StatCard icon={UserPlus} label="New (7 days)" value={stats.new_users_7d} color="bg-sky-50 text-sky-500" loading={loading} />
        <StatCard icon={AlertTriangle} label="Errors (24h)" value={stats.error_count_24h} color="bg-coral-500/5 text-coral-500" loading={loading} />
      </div>

      {/* NLP Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <StatCard icon={Zap} label="NLP Avg Response" value={`${stats.nlp_avg_processing_ms}ms`} color="bg-amber-50 text-amber-500" loading={loading} />
        <StatCard icon={Clock} label="NLP Max Response" value={`${stats.nlp_max_processing_ms}ms`} color="bg-orange-50 text-orange-500" loading={loading} />
        <StatCard icon={Server} label="Health + Finance Logs (24h)" value={stats.health_logs_24h + stats.finance_logs_24h}
          subtext={`${stats.health_logs_24h} health · ${stats.finance_logs_24h} finance`}
          color="bg-purple-50 text-purple-500" loading={loading} />
      </div>

      {/* Users + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-navy-50 overflow-hidden">
          <div className="p-5 border-b border-navy-50">
            <h3 className="font-display font-bold text-navy-800 mb-3">Users</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-300" />
              <input
                type="text" value={userSearch} onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-navy-100 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-navy-400 text-sm py-8">No users found</p>
            ) : (
              filteredUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3 border-b border-navy-50 last:border-0 hover:bg-navy-50/50 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-200 to-navy-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
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
                    title={u.is_active ? 'Deactivate' : 'Activate'}
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
            <h3 className="font-display font-bold text-navy-800 mb-3">System Logs</h3>
            <div className="flex gap-1.5 flex-wrap">
              {['all', 'error', 'security', 'performance', 'audit'].map((type) => (
                <button key={type} onClick={() => setLogFilter(type)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    logFilter === type ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-500 hover:bg-navy-100'
                  }`}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filteredLogs.length === 0 ? (
              <p className="text-center text-navy-400 text-sm py-8">No logs found</p>
            ) : (
              filteredLogs.map((log, i) => (
                <div key={log.id || i} className="px-5 py-3 border-b border-navy-50 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${severityColor[log.severity] || 'bg-navy-100 text-navy-600'}`}>
                      {log.severity}
                    </span>
                    <span className="text-[10px] text-navy-400 uppercase tracking-wider">{log.log_type}</span>
                    <span className="text-[10px] text-navy-300 ml-auto">
                      {new Date(log.created_at).toLocaleString()}
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
  );
}
