import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Heart } from 'lucide-react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Health</Badge>);
    expect(screen.getByText('Health')).toBeInTheDocument();
  });

  it('applies the requested tone classes', () => {
    render(<Badge tone="coral">Finance</Badge>);
    expect(screen.getByText('Finance').className).toContain('bg-coral-50');
  });

  it('falls back to the neutral tone for an unknown value', () => {
    render(<Badge tone="not-a-tone">X</Badge>);
    expect(screen.getByText('X').className).toContain('bg-navy-50');
  });

  it('renders a leading icon when provided', () => {
    const { container } = render(<Badge icon={Heart}>Health</Badge>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
