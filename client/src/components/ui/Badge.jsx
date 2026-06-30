// src/components/ui/Badge.jsx
// Tailwind's scanner needs literal class strings, so tones are a static map (no
// `bg-${tone}-50` interpolation) — see Card.jsx for the same constraint.
const TONE_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  coral: 'bg-coral-50 text-coral-500 border-coral-200',
  amber: 'bg-amber-50 text-amber-600 border-amber-200',
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
  navy: 'bg-navy-50 text-navy-600 border-navy-200',
  neutral: 'bg-navy-50 text-navy-500 border-navy-200',
};

const SIZE_CLASSES = {
  sm: 'text-[11px] px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
};

/** Small pill for domain/status/category labels. */
export function Badge({ tone = 'neutral', size = 'md', icon: Icon, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-badge)] border font-medium
        ${TONE_CLASSES[tone] || TONE_CLASSES.neutral} ${SIZE_CLASSES[size]} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}
