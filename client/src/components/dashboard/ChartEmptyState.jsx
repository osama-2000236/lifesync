import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

export default function ChartEmptyState({ title, description, actionTo, actionLabel }) {
  return (
    <div className="h-56 rounded-2xl border border-dashed border-navy-200 bg-navy-50/50 flex flex-col items-center justify-center text-center px-6">
      <div className="w-12 h-12 rounded-2xl bg-white border border-navy-100 flex items-center justify-center mb-4">
        <BarChart3 className="w-5 h-5 text-navy-400" />
      </div>
      <h3 className="text-sm font-semibold text-navy-800">{title}</h3>
      <p className="text-sm text-navy-500 max-w-xs mt-1">{description}</p>
      {actionTo && actionLabel && (
        <Link
          to={actionTo}
          className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white border border-navy-200 text-sm font-medium text-navy-700 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
