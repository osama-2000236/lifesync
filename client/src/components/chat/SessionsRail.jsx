// src/components/chat/SessionsRail.jsx
// ============================================
// Conversation history rail. Desktop: slim column beside the thread.
// Mobile: opened as a sheet from the header button (parent controls `open`).
// ============================================
import { Plus, MessageSquareText, X } from 'lucide-react';
import { dateLocale } from '../../i18n';

const sessionTitle = (s, t) => {
  const d = s.last_message_at ? new Date(s.last_message_at) : null;
  return d ? d.toLocaleDateString(dateLocale(document.documentElement.lang), { month: 'short', day: 'numeric' }) : t('chat.title');
};

export default function SessionsRail({ sessions, activeId, onSelect, onNew, open, onClose, t }) {
  const body = (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onNew}
        className="mx-3 mt-3 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-navy-200 px-3 py-2.5 text-sm font-semibold text-navy-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
        data-testid="new-chat-button"
      >
        <Plus className="w-4 h-4" /> {t('chat.newChat')}
      </button>

      <div className="mt-3 flex-1 overflow-y-auto px-2 pb-4 space-y-0.5" data-testid="sessions-list">
        {sessions.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-navy-400 dark:text-navy-500">{t('chat.noChats')}</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.session_id}
            type="button"
            onClick={() => onSelect(s.session_id)}
            className={`w-full text-start rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-2 ${s.session_id === activeId ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-navy-600 hover:bg-navy-50'}`}
            data-testid={`session-${s.session_id}`}
          >
            <MessageSquareText className="w-3.5 h-3.5 shrink-0 opacity-60" />
            <span className="truncate">{sessionTitle(s, t)}</span>
            <span className="ms-auto text-[10px] text-navy-400 dark:text-navy-500">{s.message_count}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:block w-60 shrink-0 border-e border-navy-100" data-testid="sessions-rail">
        {body}
      </aside>

      {/* Mobile sheet */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40" data-testid="sessions-sheet">
          <button type="button" aria-label={t('common.close')} className="absolute inset-0 bg-ink-950/50" onClick={onClose} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-surface-raised dark:bg-surface-dark-raised shadow-2xl">
            <div className="flex items-center justify-between px-4 pt-4">
              <span className="font-display text-sm font-bold text-navy-900">{t('chat.newChat')}</span>
              <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-2 rounded-lg hover:bg-navy-50 text-navy-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {body}
          </div>
        </div>
      )}
    </>
  );
}
