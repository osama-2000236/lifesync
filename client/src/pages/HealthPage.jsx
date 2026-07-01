// src/pages/HealthPage.jsx
import { useState, useEffect } from 'react';
import { healthAPI } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';
import { getPaginatedItems, getPaginatedTotalPages } from '../utils/paginatedResponse';
import { SkeletonCard } from '../components/ui/Skeleton';
import { Card, FilterBar, EmptyListState, Pagination } from '../components/ui';
import {
  Heart, Footprints, Moon, SmilePlus, Droplets, Dumbbell,
  ActivitySquare, Trash2,
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
  const { t } = useSettings();
  const typeLabel = (type) => (type === 'all' ? t('common.all') : t(`health.type.${type}`));
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
        setLogs(getPaginatedItems(data, 'logs'));
        setTotalPages(getPaginatedTotalPages(data));
      } catch (err) {
        console.error('Failed to load health logs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [page, typeFilter, search]);

  const handleDelete = async (id) => {
    if (!confirm(t('healthpage.deleteConfirm'))) return;
    try {
      await healthAPI.deleteLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const filters = ['all', ...Object.keys(typeConfig)].map((tp) => ({
    key: tp,
    label: typeLabel(tp),
    active: typeFilter === tp,
    onClick: () => { setTypeFilter(tp); setPage(1); },
  }));

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-emerald-500" /> {t('healthpage.title')}
          </h1>
          <p className="text-navy-500 text-sm mt-1">{t('healthpage.subtitle')}</p>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        searchPlaceholder={t('healthpage.search')}
        filters={filters}
        className="mb-6"
      />

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          [1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)
        ) : logs.length === 0 ? (
          <EmptyListState icon={Heart} title={t('healthpage.empty')} subtitle={t('healthpage.emptyHint')} />
        ) : (
          logs.map((log) => {
            const config = typeConfig[log.type] || typeConfig.steps;
            const Icon = config.icon;
            return (
              <Card key={log.id} interactive padding="sm" className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl ${config.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${config.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy-800 capitalize">{typeLabel(log.type)}</p>
                  <p className="text-xs text-navy-400 mt-0.5">
                    {log.value_text || log.notes || ''} · {new Date(log.logged_at || log.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-end flex-shrink-0">
                  <p className="text-lg font-bold text-navy-800">{log.value}<span className="text-xs text-navy-400 ms-1">{config.unit}</span></p>
                  {log.duration && <p className="text-xs text-navy-400">{log.duration} {t('common.min')}</p>}
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
