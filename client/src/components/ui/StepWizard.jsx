// src/components/ui/StepWizard.jsx
import { Check } from 'lucide-react';

/**
 * Step indicator (dots + connecting bar + checkmarks for completed steps) shared by the
 * Register / ForgotPassword / Onboarding flows. Owns only the progress chrome — each page keeps
 * its own per-step validation and next/back logic, since those genuinely differ flow to flow.
 */
export function StepProgress({ steps, currentStep, className = '' }) {
  return (
    <div className={`flex items-center ${className}`}>
      {steps.map((step, i) => {
        const isDone = i < currentStep;
        const isActive = i === currentStep;
        const StepIcon = step.icon;
        return (
          <div key={step.key ?? i} className="flex items-center flex-1 last:flex-none">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold flex-shrink-0
                transition-all duration-200 ease-[var(--ease-out-snap)]
                ${isDone ? 'bg-emerald-500 text-white' : isActive
                  ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/30 scale-110'
                  : 'bg-navy-100 text-navy-400'}`}
              aria-current={isActive ? 'step' : undefined}
            >
              {isDone ? <Check className="w-4 h-4" /> : StepIcon ? <StepIcon className="w-4 h-4" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 rounded-full transition-colors duration-300
                  ${isDone ? 'bg-emerald-500' : 'bg-navy-100'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Wraps `StepProgress` + an animated content slot for the active step. */
export function StepWizard({ steps, currentStep, children, className = '' }) {
  return (
    <div className={className}>
      <StepProgress steps={steps} currentStep={currentStep} className="mb-8" />
      <div key={currentStep} className="animate-fade-up">
        {children}
      </div>
    </div>
  );
}
