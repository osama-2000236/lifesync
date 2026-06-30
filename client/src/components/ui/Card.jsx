// src/components/ui/Card.jsx
const ICON_TONE_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-600',
  coral: 'bg-coral-50 text-coral-500',
  amber: 'bg-amber-50 text-amber-500',
  navy: 'bg-navy-50 text-navy-600',
};

const PADDING_CLASSES = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

/** Base surface for grouped content. `interactive` adds the hover-lift used for clickable cards. */
export function Card({ as: Component = 'div', interactive = false, padding = 'md', className = '', children, ...rest }) {
  return (
    <Component
      className={`bg-white rounded-2xl border border-navy-100/60 shadow-[var(--shadow-card)]
        ${interactive ? 'transition-all duration-200 ease-[var(--ease-out-snap)] hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5 cursor-pointer' : ''}
        ${PADDING_CLASSES[padding]} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}

/** Standard card header: icon badge + title/subtitle + optional trailing action. */
function CardHeader({ icon: Icon, iconTone = 'emerald', title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-start gap-3 ${className}`}>
      {Icon && (
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ICON_TONE_CLASSES[iconTone] || ICON_TONE_CLASSES.emerald}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-base font-semibold text-navy-900 truncate">{title}</h3>
        {subtitle && <p className="text-sm text-navy-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

function CardBody({ className = '', children }) {
  return <div className={`mt-4 ${className}`}>{children}</div>;
}

Card.Header = CardHeader;
Card.Body = CardBody;
