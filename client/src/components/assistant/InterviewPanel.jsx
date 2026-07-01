// src/components/assistant/InterviewPanel.jsx
// Renders the current interview question with a number or choice control and a
// progress indicator. Controlled component — the page owns interview state.
import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

export default function InterviewPanel({ question, busy, onSubmit, t }) {
  const [value, setValue] = useState('');
  useEffect(() => { setValue(''); }, [question?.id, question?.step]);

  if (!question) return null;
  const { step, total, prompt, input_type: inputType, options, min, max } = question;

  const submitNumber = () => {
    if (value === '' || busy) return;
    onSubmit(Number(value));
  };

  return (
    <div className="rounded-2xl border border-navy-100/70 bg-white p-5 shadow-[var(--shadow-card)]" dir="auto" data-testid="interview-panel">
      <div className="flex items-center gap-2 mb-3">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full flex-1 transition-colors ${i <= step ? 'bg-emerald-500' : 'bg-navy-100'}`}
            data-testid="progress-seg"
          />
        ))}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-300 mb-1">
        {t('assistant.stepOf', { current: step + 1, total })}
      </p>
      <h3 className="font-display text-lg font-semibold text-navy-900 leading-snug">{prompt}</h3>

      {inputType === 'choice' ? (
        <div className="grid gap-2 mt-4">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => !busy && onSubmit(opt.value)}
              disabled={busy}
              className="text-start px-4 py-3 rounded-xl border border-navy-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 text-sm font-medium text-navy-700 disabled:opacity-50 transition-all active:scale-[0.99]"
              data-testid="choice-option"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-4">
          <input
            type="number"
            inputMode="decimal"
            min={min ?? undefined}
            max={max ?? undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitNumber(); }}
            className="flex-1 px-4 py-3 rounded-xl border border-navy-200 bg-white text-navy-900 text-lg font-semibold focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/20"
            placeholder={t('assistant.numberPlaceholder')}
            aria-label={prompt}
            data-testid="number-input"
          />
          <button
            onClick={submitNumber}
            disabled={busy || value === ''}
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 transition-all active:scale-[0.97]"
            data-testid="number-submit"
          >
            {t('assistant.next')} <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}
