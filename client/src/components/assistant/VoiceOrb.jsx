// src/components/assistant/VoiceOrb.jsx
// Reactive voice orb. Scales with mic `level` while listening; the ring color
// encodes the phase (emerald=listening, amber=thinking, indigo=speaking).
import { Mic, Sparkles, Volume2 } from 'lucide-react';

const RING = {
  listening: 'var(--color-emerald-500)',
  thinking: 'var(--color-amber-400)',
  speaking: '#6366f1',
  idle: 'var(--color-emerald-500)',
};

export default function VoiceOrb({ phase = 'idle', level = 0, size = 200 }) {
  const scale = phase === 'listening' ? 1 + Math.min(0.55, level * 1.8) : 1;
  const ring = RING[phase] || RING.idle;
  const Icon = phase === 'speaking' ? Volume2 : phase === 'thinking' ? Sparkles : Mic;
  const core = Math.round(size * 0.5);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} data-testid="voice-orb" data-phase={phase}>
      <div
        className="absolute rounded-full blur-2xl opacity-40 transition-[transform,background] duration-300"
        style={{ width: size * 0.85, height: size * 0.85, background: ring, transform: `scale(${scale})` }}
      />
      <div
        className={`absolute rounded-full blur-xl opacity-60 transition-[background] duration-300 ${phase === 'thinking' ? 'animate-pulse' : ''}`}
        style={{ width: size * 0.62, height: size * 0.62, background: ring, transform: `scale(${scale})` }}
      />
      <div
        className="relative rounded-full shadow-2xl flex items-center justify-center transition-[transform,background] duration-300"
        style={{ width: core, height: core, transform: `scale(${scale})`, background: `radial-gradient(circle at 35% 30%, #ffffff88, ${ring})` }}
      >
        <Icon className={`text-white ${phase === 'speaking' ? 'animate-pulse' : ''}`} style={{ width: core * 0.32, height: core * 0.32 }} />
      </div>
    </div>
  );
}
