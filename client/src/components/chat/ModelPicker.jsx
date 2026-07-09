// src/components/chat/ModelPicker.jsx
// ============================================
// Model picker — every entry is either the private in-server BERT or a
// VERIFIED FREE OpenRouter model (server catalog is the source of truth;
// static MODEL_OPTIONS only seeds labels until it loads). Selection is
// per-turn: the chosen model answers the next message, with memory, history
// and cross-domain context carried over.
//
// Menu is portaled to document.body with fixed positioning so parent
// overflow-hidden shells (AppLayout, voice studio card) never clip it.
// ============================================
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Cpu, Sparkles } from 'lucide-react';

const TAG_STYLES = {
  free: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  paid: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  local: 'bg-navy-50 text-navy-600 border-navy-200 dark:text-navy-500',
};

const MENU_WIDTH = 320;

/** Place the menu under the trigger, flip up if needed, clamp to viewport. */
export const placeMenu = (triggerRect, { menuWidth = MENU_WIDTH, maxHeight = 384, gap = 8, pad = 8 } = {}) => {
  if (!triggerRect) return null;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const height = Math.min(maxHeight, vh * 0.7);

  let left = triggerRect.right - menuWidth; // end-aligned (matches prior end-0)
  if (left < pad) left = pad;
  if (left + menuWidth > vw - pad) left = Math.max(pad, vw - menuWidth - pad);

  let top = triggerRect.bottom + gap;
  let openUp = false;
  if (top + height > vh - pad && triggerRect.top - gap - height >= pad) {
    top = triggerRect.top - gap - height;
    openUp = true;
  } else if (top + height > vh - pad) {
    top = Math.max(pad, vh - height - pad);
  }

  return {
    top,
    left,
    width: menuWidth,
    maxHeight: height,
    openUp,
  };
};

export default function ModelPicker({ models, value, onChange, disabled, t, variant = 'default' }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const btnRef = useRef(null);
  const onDark = variant === 'onDark';

  const updatePosition = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setCoords(placeMenu(r));
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    // capture scroll from any ancestor (chat thread, layout, etc.)
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, models?.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      const inTrigger = rootRef.current?.contains(e.target);
      const inMenu = menuRef.current?.contains(e.target);
      if (!inTrigger && !inMenu) setOpen(false);
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
  // Prefer server `pricing` (free|paid|local); fall back to static tag.
  const tagOf = (m) => {
    if (m?.pricing === 'paid') return 'paid';
    if (m?.pricing === 'free' || m?.tag === 'free') return 'free';
    return 'local';
  };

  const triggerClass = onDark
    ? 'inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 transition-colors disabled:opacity-50'
    : 'inline-flex items-center gap-2 rounded-full border border-navy-100 bg-surface-raised dark:bg-surface-dark-raised px-3 py-1.5 text-xs font-semibold text-navy-700 hover:border-emerald-300 transition-colors disabled:opacity-50';

  const menu = open && coords && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label={t('model.chooseModel')}
        className="rounded-2xl border border-navy-100 bg-surface-raised dark:bg-surface-dark-raised shadow-xl shadow-navy-900/10 p-2 text-navy-900 overflow-y-auto"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          width: coords.width,
          maxHeight: coords.maxHeight,
          zIndex: 80,
        }}
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
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TAG_STYLES[tag] || TAG_STYLES.local}`}>
                  {tag === 'free' ? t('chat.model.free') : tag === 'paid' ? t('chat.model.paid') : t('chat.model.local')}
                </span>
                {selected && <Check className="w-4 h-4 text-emerald-500 ms-auto" />}
              </span>
              {m.model && (
                <span className="mt-0.5 block text-[10px] font-mono text-navy-400 truncate" title={m.model}>{m.model}</span>
              )}
              {(m.description || m.desc) && (
                <span className="mt-0.5 block text-xs leading-5 text-navy-400">{m.description || m.desc}</span>
              )}
            </button>
          );
        })}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="relative" ref={rootRef} data-testid="model-picker">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('model.chooseModel')}
        title={t('model.chooseModel')}
        className={triggerClass}
        data-testid="model-picker-button"
      >
        {tagOf(current) === 'free'
          ? <Sparkles className={`w-3.5 h-3.5 ${onDark ? 'text-emerald-300' : 'text-emerald-500'}`} />
          : <Cpu className={`w-3.5 h-3.5 ${onDark ? 'text-white/60' : 'text-navy-400'}`} />}
        <span className="max-w-[9rem] truncate">{current?.label || t('model.noModel')}</span>
        <ChevronDown className={`w-3.5 h-3.5 ${onDark ? 'text-white/50' : 'text-navy-400'} transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  );
}
