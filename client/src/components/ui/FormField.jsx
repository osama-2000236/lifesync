// src/components/ui/FormField.jsx
import { forwardRef } from 'react';

const FIELD_BASE =
  'w-full px-4 py-3 rounded-[var(--radius-input)] border bg-white text-navy-900 placeholder-navy-300 ' +
  'transition-all duration-200 ease-[var(--ease-out-snap)] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500';

const fieldClasses = (error, className) =>
  `${FIELD_BASE} ${error ? 'border-coral-500 focus:ring-coral-500/30 focus:border-coral-500' : 'border-navy-200'} ${className}`;

/** Styled `<input>`. Pass `error` to switch to the red/error ring. */
export const Input = forwardRef(function Input({ error = false, className = '', ...rest }, ref) {
  return <input ref={ref} aria-invalid={error || undefined} className={fieldClasses(error, className)} {...rest} />;
});

/** Styled `<textarea>`. Pass `error` to switch to the red/error ring. */
export const Textarea = forwardRef(function Textarea({ error = false, className = '', ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={error || undefined} className={fieldClasses(error, className)} {...rest} />;
});

/** Styled `<select>`. Pass `error` to switch to the red/error ring. */
export const Select = forwardRef(function Select({ error = false, className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} aria-invalid={error || undefined} className={fieldClasses(error, className)} {...rest}>
      {children}
    </select>
  );
});

/**
 * Label + control + hint/error wrapper. Pass the styled control (Input/Textarea/Select) as
 * `children`, cloned with the field's `id` and `error` state already wired by the caller.
 */
export function FormField({ id, label, hint, error, required = false, className = '', children }) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint && !error ? `${id}-hint` : undefined;

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-navy-700 mb-1.5">
          {label}
          {required && <span className="text-coral-500 ms-1">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-coral-500" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-navy-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
