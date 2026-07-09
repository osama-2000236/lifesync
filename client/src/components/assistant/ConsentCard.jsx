// src/components/assistant/ConsentCard.jsx
// Consent gate for a proactive cross-domain interview. The assistant only
// collects information after the user explicitly agrees.
import { Sparkles, Check, X } from 'lucide-react';

export default function ConsentCard({ prompt, crossDomain, busy, onAccept, onDecline, t }) {
  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-500/10 dark:to-surface-raised p-5 shadow-[var(--shadow-card)] dark:border-emerald-500/20" dir="auto" data-testid="consent-card">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-navy-900">{t('assistant.consentTitle')}</h3>
            {crossDomain && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600">
                {t('assistant.crossDomain')}
              </span>
            )}
          </div>
          <p className="text-sm text-navy-600 mt-1.5 leading-relaxed">{prompt}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={onAccept}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 transition-all active:scale-[0.97]"
          data-testid="consent-accept"
        >
          <Check className="w-4 h-4" /> {t('assistant.consentYes')}
        </button>
        <button
          onClick={onDecline}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-navy-600 hover:bg-navy-50 disabled:opacity-50 transition-colors"
          data-testid="consent-decline"
        >
          <X className="w-4 h-4" /> {t('assistant.consentNo')}
        </button>
      </div>
    </div>
  );
}
