import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WaveRing from './WaveRing';

describe('WaveRing', () => {
  it('renders a canvas and survives jsdom (no 2d context)', () => {
    const bandsRef = { current: new Float32Array(24) };
    const { getByTestId, unmount } = render(
      <WaveRing bandsRef={bandsRef} ring="var(--color-emerald-500)" />,
    );
    expect(getByTestId('wave-ring')).toBeInTheDocument();
    unmount(); // no crash on cleanup
  });

  it('draws bars when a 2d context exists and cancels its rAF on unmount', () => {
    const calls = { stroke: 0 };
    const fakeCtx = new Proxy({}, {
      get: (t, prop) => {
        if (prop === 'stroke') return () => { calls.stroke += 1; };
        return () => {};
      },
      set: () => true,
    });
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    let rafCb;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rafCb = cb; return 7; });

    const bandsRef = { current: new Float32Array([0.5, 0.9, 0.1]) };
    const { unmount } = render(<WaveRing bandsRef={bandsRef} ring="#fff" active={false} />);
    expect(calls.stroke).toBe(3); // one bar per band on the first frame
    rafCb(); // a second frame keeps drawing
    expect(calls.stroke).toBe(6);

    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
    vi.restoreAllMocks();
  });
});
