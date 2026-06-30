import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StepProgress, StepWizard } from './StepWizard';

const steps = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

describe('StepProgress', () => {
  it('marks the current step with aria-current=step', () => {
    render(<StepProgress steps={steps} currentStep={1} />);
    const current = screen.getByText('2');
    expect(current).toHaveAttribute('aria-current', 'step');
  });

  it('renders a checkmark instead of a number for completed steps', () => {
    render(<StepProgress steps={steps} currentStep={2} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('StepWizard', () => {
  it('renders the active step content', () => {
    render(
      <StepWizard steps={steps} currentStep={0}>
        Step one content
      </StepWizard>
    );
    expect(screen.getByText('Step one content')).toBeInTheDocument();
  });
});
