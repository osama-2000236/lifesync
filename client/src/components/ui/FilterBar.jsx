// src/components/ui/FilterBar.jsx
import { Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';

/** Search input + filter-pill row shared by the Health/Finance list pages. */
export function FilterBar({ search, onSearchChange, searchPlaceholder = 'Search...', filters = [], className = '' }) {
  return (
    <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
      <div className="relative flex-1">
        <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-300" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full ps-10 pe-4 py-2.5 rounded-[var(--radius-input)] border border-navy-200 bg-white
            text-sm text-navy-900 placeholder-navy-300 transition-all duration-200 ease-[var(--ease-out-snap)]
            focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
        />
      </div>
      {filters.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {filters.map(({ key, label, active, onClick }) => (
            <button
              key={key}
              type="button"
              onClick={onClick}
              className={`focus-ring px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200
                ${active ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Generic empty-state for filtered lists with no matches. */
export function EmptyListState({ title, subtitle, icon: Icon = Inbox }) {
  const { t } = useSettings();
  const heading = title || t('list.empty');
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-2xl bg-navy-50 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-navy-300" />
      </div>
      <p className="font-medium text-navy-700">{heading}</p>
      {subtitle && <p className="text-sm text-navy-400 mt-1 max-w-xs">{subtitle}</p>}
    </div>
  );
}

/** Prev/next pagination control. RTL-aware (chevrons flip, not page numbers). */
export function Pagination({ page, totalPages, onPageChange, className = '' }) {
  const { t } = useSettings();
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('list.prevPage')}
        className="focus-ring p-2 rounded-lg border border-navy-200 text-navy-500 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
      </button>
      <span className="text-sm text-navy-500 font-medium">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={t('list.nextPage')}
        className="focus-ring p-2 rounded-lg border border-navy-200 text-navy-500 hover:bg-navy-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4 rtl:rotate-180" />
      </button>
    </div>
  );
}
