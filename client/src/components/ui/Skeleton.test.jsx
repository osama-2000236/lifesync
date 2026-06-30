import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Skeleton, SkeletonCard, SkeletonChart } from './Skeleton';

describe('Skeleton', () => {
  it('renders with default width/height', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveStyle({ width: '100%', height: '20px' });
  });

  it('respects explicit width/height', () => {
    const { container } = render(<Skeleton width="40px" height="40px" />);
    expect(container.firstChild).toHaveStyle({ width: '40px', height: '40px' });
  });
});

describe('SkeletonCard', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe('SkeletonChart', () => {
  it('renders without crashing', () => {
    const { container } = render(<SkeletonChart />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
