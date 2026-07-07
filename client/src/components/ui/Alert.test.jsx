import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Alert } from './Alert';

describe('Alert', () => {
  it('renders title and children', () => {
    render(<Alert title="Heads up">Something happened</Alert>);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Something happened')).toBeInTheDocument();
  });

  it('uses an assertive alert role for the error tone', () => {
    render(<Alert tone="error">Failed</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });

  it('uses a polite status role for non-error tones', () => {
    render(<Alert tone="success">Saved</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    render(<Alert onDismiss={onDismiss}>Saved</Alert>);
    screen.getByLabelText('Close').click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
