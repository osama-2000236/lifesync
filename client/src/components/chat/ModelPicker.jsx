// src/components/chat/ModelPicker.jsx
// ============================================
// Model picker — every entry is either the private in-server BERT or a
// VERIFIED FREE OpenRouter model (server catalog is the source of truth;
// static MODEL_OPTIONS only seeds labels until it loads). Selection is
// per-turn: the chosen model answers the next message, with memory, history
// and cross-domain context carried over.
// ============================================
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Cpu, Sparkles } from 'lucide-react';

const TAG_STYLES = {
  free: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  local: 'bg-navy-50 text-navy-600 border-navy-200 dark:text-navy-500',
};

export default function ModelPicker({ models, value, onChange, disabled, t }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // While the menu is open the root div is mounted, so the ref is always set.
    const onDocClick = (e) => {
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const current = models.find((m) => m.id === value) || models[0];
  const tagOf = (m) => (m?.pricing === 'free' || m?.tag === 'free' ? 'free' : 'local');

  return (
    <div className="relative" ref={rootRef} data-testid="model-picker">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-navy-100 bg-surface-raised dark:bg-surface-dark-raised px-3 py-1.5 text-xs font-semibold text-navy-700 hover:border-emerald-300 transition-colors disabled:opacity-50"
        data-testid="model-picker-button"
      >
        {tagOf(current) === 'free'
          ? <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
          : <Cpu className="w-3.5 h-3.5 text-navy-400" />}
        <span className="max-w-[9rem] truncate">{current?.label || t('model.noModel')}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-navy-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('model.chooseModel')}
          className="absolute z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] end-0 rounded-2xl border border-navy-100 bg-surface-raised dark:bg-surface-dark-raised shadow-xl shadow-navy-900/10 p-2"
          data-testid="model-picker-menu"
        >
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-400">
            {t('model.chooseModel')}
          </p>
          <p className="px-3 pb-2 text-[11px] text-navy-400">{t('model.switchAnytime')}</p>
          {models.map((m) => {
            const tag = tagOf(m);
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={`w-full text-start rounded-xl px-3 py-2.5 transition-colors ${selected ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'hover:bg-navy-50'}`}
                data-testid={`model-option-${m.id}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-navy-900">{m.label}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TAG_STYLES[tag]}`}>
                    {tag === 'free' ? t('chat.model.free') : t('chat.model.local')}
                  </span>
                  {selected && <Check className="w-4 h-4 text-emerald-500 ms-auto" />}
                </span>
                {(m.description || m.desc) && (
                  <span className="mt-0.5 block text-xs leading-5 text-navy-400">{m.description || m.desc}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
