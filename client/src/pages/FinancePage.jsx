// src/pages/FinancePage.jsx
import { useState, useEffect } from 'react';
import { financeAPI } from '../services/api';
import { getPaginatedItems, getPaginatedTotalPages } from '../utils/paginatedResponse';
import { SkeletonCard } from '../components/ui/Skeleton';
import {
  Wallet, TrendingUp, TrendingDown, Search, Trash2,
  ChevronLeft, ChevronRight
} from 'lucide-react';

export default function FinancePage() {
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

        const { data } = await financeAPI.getLogs(params);
        setLogs(getPaginatedItems(data, 'logs'));
        setTotalPages(getPaginatedTotalPages(data));
      } catch (err) {
        console.error('Failed to load finance logs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [page, typeFilter, search]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this financial entry?')) return;
    try {
      await financeAPI.deleteLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-up">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-emerald-500" /> Finance Logs
        </h1>
        <p className="text-navy-500 text-sm mt-1">Your tracked income and expenses</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-300" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search descriptions..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-navy-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
        </div>
        <div className="flex gap-2">
          {['all', 'expense', 'income'].map((t) => (
            <button key={t} onClick={() => { setTypeFilter(t); setPage(1); }}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                typeFilter === t ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border border-navy-100 text-navy-500 hover:bg-navy-50'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
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
            <Wallet className="w-12 h-12 text-navy-200 mx-auto mb-3" />
            <p className="text-navy-500 font-medium">No financial logs yet</p>
            <p className="text-navy-400 text-sm mt-1">Start tracking by telling the Assistant about your spending!</p>
          </div>
        ) : (
          logs.map((log) => {
            const isIncome = log.type === 'income';
            return (
              <div key={log.id} className="bg-white rounded-2xl p-4 shadow-sm border border-navy-50 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isIncome ? 'bg-emerald-50' : 'bg-coral-500/5'}`}>
                  {isIncome
                    ? <TrendingUp className="w-5 h-5 text-emerald-500" />
                    : <TrendingDown className="w-5 h-5 text-coral-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-800">{log.description || log.type}</p>
                  <p className="text-xs text-navy-400 mt-0.5">
                    {log.category?.name || 'Uncategorized'} · {new Date(log.logged_at || log.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-lg font-bold ${isIncome ? 'text-emerald-600' : 'text-coral-500'}`}>
                    {isIncome ? '+' : '-'}${Number(log.amount).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-navy-300 uppercase">{log.currency || 'USD'}</p>
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
    </div>
  );
}
