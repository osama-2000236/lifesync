// src/pages/HealthPage.jsx
import { useState, useEffect } from 'react';
import { healthAPI } from '../services/api';
import { SkeletonCard } from '../components/ui/Skeleton';
import {
  Heart, Footprints, Moon, SmilePlus, Droplets, Dumbbell,
  ActivitySquare, Search, Filter, Trash2, ChevronLeft, ChevronRight
} from 'lucide-react';

const typeConfig = {
  steps: { icon: Footprints, color: 'text-emerald-500', bg: 'bg-emerald-50', unit: 'steps' },
  sleep: { icon: Moon, color: 'text-indigo-500', bg: 'bg-indigo-50', unit: 'hours' },
  mood: { icon: SmilePlus, color: 'text-amber-500', bg: 'bg-amber-50', unit: '/10' },
  nutrition: { icon: ActivitySquare, color: 'text-orange-500', bg: 'bg-orange-50', unit: 'kcal' },
  water: { icon: Droplets, color: 'text-sky-500', bg: 'bg-sky-50', unit: 'L' },
  exercise: { icon: Dumbbell, color: 'text-purple-500', bg: 'bg-purple-50', unit: 'min' },
  heart_rate: { icon: Heart, color: 'text-rose-500', bg: 'bg-rose-50', unit: 'bpm' },
};

export default function HealthPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const params = { page, limit: 20 };
        if (typeFilter !== 'all') params.type = typeFilter;
        if (search) params.search = search;

        const { data } = await healthAPI.getLogs(params);
        setLogs(data.data?.logs || []);
        setTotalPages(data.data?.pagination?.totalPages || 1);
      } catch (err) {
        console.error('Failed to load health logs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [page, typeFilter, search]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this health entry?')) return;
    try {
      await healthAPI.deleteLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-emerald-500" /> Health Logs
          </h1>
          <p className="text-navy-500 text-sm mt-1">Your tracked health metrics</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-300" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search notes..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-navy-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['all', ...Object.keys(typeConfig)].map((t) => (
            <button key={t} onClick={() => { setTypeFilter(t); setPage(1); }}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                typeFilter === t ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border border-navy-100 text-navy-500 hover:bg-navy-50'
              }`}>
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Heart className="w-12 h-12 text-navy-200 mx-auto mb-3" />
            <p className="text-navy-500 font-medium">No health logs yet</p>
            <p className="text-navy-400 text-sm mt-1">Start tracking by chatting with the Assistant!</p>
          </div>
        ) : (
          logs.map((log) => {
            const config = typeConfig[log.type] || typeConfig.steps;
            const Icon = config.icon;
            return (
              <div key={log.id} className="bg-white rounded-2xl p-4 shadow-sm border border-navy-50 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className={`w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-800 capitalize">{log.type.replace('_', ' ')}</p>
                  <p className="text-xs text-navy-400 mt-0.5">
                    {log.value_text || log.notes || ''} · {new Date(log.logged_at || log.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-navy-800">{log.value}<span className="text-xs text-navy-400 ml-1">{config.unit}</span></p>
                  {log.duration && <p className="text-xs text-navy-400">{log.duration} min</p>}
                </div>
                <button onClick={() => handleDelete(log.id)} className="p-2 rounded-lg hover:bg-coral-500/5 text-navy-300 hover:text-coral-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="p-2 rounded-lg bg-white border border-navy-100 text-navy-500 hover:bg-navy-50 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-navy-500">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="p-2 rounded-lg bg-white border border-navy-100 text-navy-500 hover:bg-navy-50 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
