import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Heart } from 'lucide-react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>content</Card>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('adds the interactive hover-lift classes when requested', () => {
    const { container } = render(<Card interactive>content</Card>);
    expect(container.firstChild.className).toContain('hover:-translate-y-0.5');
  });

  it('omits the interactive classes by default', () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild.className).not.toContain('hover:-translate-y-0.5');
  });

  it('Card.Header renders icon, title and subtitle', () => {
    render(<Card.Header icon={Heart} title="Health" subtitle="This week" />);
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
  });

  it('Card.Header falls back to the emerald tone for an unknown iconTone', () => {
    render(<Card.Header icon={Heart} iconTone="not-a-real-tone" title="Health" />);
    expect(screen.getByText('Health').parentElement.previousSibling.className).toContain('bg-emerald-50');
  });

  it('Card.Header renders an optional trailing action', () => {
    render(<Card.Header title="Health" action={<button>Edit</button>} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('Card.Body renders children', () => {
    render(<Card.Body>body content</Card.Body>);
    expect(screen.getByText('body content')).toBeInTheDocument();
  });
});
