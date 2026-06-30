import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ArrowRight, Heart } from 'lucide-react';
import { Button } from './Button';

describe('Button', () => {
  it('renders children and responds to click', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables and blocks clicks while loading', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables when disabled prop is set', () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('renders a leftIcon when not loading, and hides it while loading', () => {
    const { rerender, container } = render(<Button leftIcon={Heart}>Save</Button>);
    expect(container.querySelectorAll('svg').length).toBe(1);
    rerender(<Button leftIcon={Heart} loading>Save</Button>);
    // loading swaps the leftIcon for the spinner — still exactly one icon, not two.
    expect(container.querySelectorAll('svg').length).toBe(1);
  });

  it('renders a rightIcon when not loading, and hides it while loading', () => {
    const { rerender, container } = render(<Button rightIcon={ArrowRight}>Next</Button>);
    expect(container.querySelectorAll('svg').length).toBe(1);
    rerender(<Button rightIcon={ArrowRight} loading>Next</Button>);
    expect(container.querySelectorAll('svg').length).toBe(1);
  });
});
