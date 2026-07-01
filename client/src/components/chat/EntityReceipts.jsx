// src/components/chat/EntityReceipts.jsx
// ============================================
// "Receipts" for what a chat turn actually logged — the visible proof of
// LifeSync's cross-domain idea. Health chips are emerald, finance chips are
// amber, and when the turn LINKED both domains the receipt row carries a
// gradient badge. Everything logged here is already on the dashboard.
// ============================================
import { HeartPulse, Wallet, Link2 } from 'lucide-react';

const healthLabel = (e) => `${e.type}${e.value != null ? ` · ${e.value}` : ''}`;
const financeLabel = (e) => `${e.type}${e.amount != null ? ` · $${e.amount}` : ''}`;

export default function EntityReceipts({ entities, t }) {
  const health = entities?.health || [];
  const finance = entities?.finance || [];
  const linked = entities?.linked || [];
  if (!health.length && !finance.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="entity-receipts">
      {linked.length > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
          data-testid="cross-domain-badge"
        >
          <Link2 className="w-3 h-3" /> {t('chat.domain.crossLinked')}
        </span>
      )}
      {health.map((e, i) => (
        <span
          key={`h-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
          data-testid="health-chip"
        >
          <HeartPulse className="w-3 h-3" /> {healthLabel(e)}
        </span>
      ))}
      {finance.map((e, i) => (
        <span
          key={`f-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400"
          data-testid="finance-chip"
        >
          <Wallet className="w-3 h-3" /> {financeLabel(e)}
        </span>
      ))}
      <span className="text-[11px] text-navy-300 dark:text-navy-500">{t('chat.receipts.onDashboard')}</span>
    </div>
  );
}
