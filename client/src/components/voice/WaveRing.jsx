// Audio-reactive ring of radial bars around the voice orb. Reads the live
// frequency bands straight from a ref (mutated by useVoiceAssistant's meter
// loop) inside its own rAF loop — zero React re-renders per frame.
// Lives in components/voice/ (outside the 100%-coverage gate): canvas drawing
// isn't practical to branch-cover; it gets a smoke test instead.
import { useEffect, useRef } from 'react';

export default function WaveRing({ bandsRef, ring, size = 200, active = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!ctx) return undefined; // jsdom / very old browsers: render nothing

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const inner = size * 0.36;
    const maxBar = size * 0.13;
    let raf = 0;
    const eased = new Float32Array(bandsRef?.current?.length || 24);

    const draw = () => {
      const bands = bandsRef?.current;
      ctx.clearRect(0, 0, size, size);
      if (bands) {
        ctx.strokeStyle = ring;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.85;
        const n = bands.length;
        for (let i = 0; i < n; i += 1) {
          // Ease toward the live value; decay to a calm ring when not listening.
          const target = active ? bands[i] : 0;
          eased[i] = eased[i] * 0.8 + target * 0.2;
          const len = 2 + eased[i] * maxBar;
          const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
          const x1 = center + Math.cos(angle) * inner;
          const y1 = center + Math.sin(angle) * inner;
          const x2 = center + Math.cos(angle) * (inner + len);
          const y2 = center + Math.sin(angle) * (inner + len);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [bandsRef, ring, size, active]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
      data-testid="wave-ring"
    />
  );
}
