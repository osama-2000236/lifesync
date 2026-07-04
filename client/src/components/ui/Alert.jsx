// src/components/ui/Alert.jsx
import { CheckCircle2, Info, AlertTriangle, AlertCircle, X } from 'lucide-react';

const TONE_CONFIG = {
  info: { classes: 'bg-navy-50 border-navy-200 text-navy-700', icon: Info },
  success: { classes: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: CheckCircle2 },
  warning: { classes: 'bg-amber-50 border-amber-200 text-amber-700', icon: AlertTriangle },
  error: { classes: 'bg-coral-500/10 border-coral-500/20 text-coral-500', icon: AlertCircle },
};

/** Inline banner for form/page-level feedback. Sets the right `role`/`aria-live` per tone. */
export function Alert({ tone = 'info', title, children, onDismiss, className = '' }) {
  const { classes, icon: Icon } = TONE_CONFIG[tone] || TONE_CONFIG.info;
  const isAssertive = tone === 'error';

  return (
    <div
      className={`flex items-start gap-2.5 p-4 rounded-xl border text-sm ${classes} ${className}`}
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="focus-ring flex-shrink-0 p-0.5 rounded-md hover:bg-black/5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
