// src/components/ui/Button.jsx
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const VARIANT_CLASSES = {
  primary:
    'text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/20 ' +
    'hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg hover:shadow-emerald-500/30',
  secondary:
    'text-navy-700 bg-white border border-navy-200 hover:bg-navy-50 hover:border-navy-300',
  ghost:
    'text-navy-600 bg-transparent hover:bg-navy-50 hover:text-navy-800',
  danger:
    // coral-600 (not -500): white text needs ≥4.5:1 for AA; coral-500 was 3.67.
    'text-white bg-coral-600 shadow-md shadow-coral-600/25 hover:brightness-95',
};

const SIZE_CLASSES = {
  sm: 'text-xs px-3 py-2 gap-1.5 rounded-lg',
  md: 'text-sm px-4 py-2.5 gap-2 rounded-xl',
  lg: 'text-base px-6 py-3.5 gap-2.5 rounded-xl',
};

/** Primary action control. `loading` swaps the leading icon for a spinner and disables the button. */
export const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    type = 'button',
    className = '',
    children,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-200
        ease-[var(--ease-out-snap)] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed
        disabled:active:scale-100 focus-visible:outline-none focus-visible:shadow-[var(--shadow-glow-emerald)]
        ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        LeftIcon && <LeftIcon className="w-4 h-4" />
      )}
      {children}
      {!loading && RightIcon && <RightIcon className="w-4 h-4 rtl:rotate-180" />}
    </button>
  );
});
