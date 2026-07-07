// src/pages/FinancePage.jsx
import { useState, useEffect } from 'react';
import { financeAPI } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { localizeCategory } from '../i18n/categoryNames';
import { dateLocale } from '../i18n';
import { getPaginatedItems, getPaginatedTotalPages } from '../utils/paginatedResponse';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Card, FilterBar, EmptyListState, Pagination } from '../components/ui';
import { Wallet, TrendingUp, TrendingDown, Trash2 } from 'lucide-react';

export default function FinancePage() {
  const { t, locale } = useSettings();
  const typeLabel = (type) => (type === 'all' ? t('common.all') : t(`fin.type.${type}`));
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
    if (!confirm(t('financepage.deleteConfirm'))) return;
    try {
      await financeAPI.deleteLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filters = ['all', 'expense', 'income'].map((tp) => ({
    key: tp,
    label: typeLabel(tp),
    active: typeFilter === tp,
    onClick: () => { setTypeFilter(tp); setPage(1); },
  }));

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-up">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-2">
          <Wallet className="w-6 h-6 text-emerald-500" /> {t('financepage.title')}
        </h1>
        <p className="text-navy-500 text-sm mt-1">{t('financepage.subtitle')}</p>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder={t('financepage.search')}
        filters={filters}
        className="mb-6"
      />

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)
        ) : logs.length === 0 ? (
          <EmptyListState icon={Wallet} title={t('financepage.empty')} subtitle={t('financepage.emptyHint')} />
        ) : (
          logs.map((log) => {
            const isIncome = log.type === 'income';
            return (
              <Card key={log.id} interactive padding="sm" className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${isIncome ? 'bg-emerald-50' : 'bg-coral-500/5'}`}>
                  {isIncome
                    ? <TrendingUp className="w-5 h-5 text-emerald-500" />
                    : <TrendingDown className="w-5 h-5 text-coral-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-800">{log.description || log.type}</p>
                  <p className="text-xs text-navy-400 mt-0.5">
                    {localizeCategory(log.category?.name, locale) || t('financepage.uncategorized')} · {new Date(log.logged_at || log.created_at).toLocaleDateString(dateLocale(locale))}
                  </p>
                </div>
                <div className="text-end flex-shrink-0">
                  <p className={`text-lg font-bold ${isIncome ? 'text-emerald-600' : 'text-coral-500'}`}>
                    {isIncome ? '+' : '-'}${Number(log.amount).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-navy-300 uppercase">{log.currency || 'USD'}</p>
                </div>
                <button onClick={() => handleDelete(log.id)} className="p-2 rounded-lg hover:bg-coral-500/5 text-navy-300 hover:text-coral-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </Card>
            );
          })
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-6" />
    </div>
    </div>
  );
}
