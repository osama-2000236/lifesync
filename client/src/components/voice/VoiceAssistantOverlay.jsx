// Full-screen hands-free voice assistant, Gemini-app style. SEPARATE from the
// chat's push-to-talk mic. A reactive orb responds to mic level; the loop is:
// listen → (silence) → think → speak → listen again. Replies come from the same
// model the chat uses, through the normal /api/chat/stream path, so memory +
// context + native Arabic all carry over.
import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Mic, Sparkles, Volume2 } from 'lucide-react';
import { chatAPI } from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import { useVoiceAssistant } from '../../hooks/useVoiceAssistant';

// Sentence boundary for flushing streamed text to speech as it arrives
// (English . ! ? plus Arabic ؟) — keeps real-time latency low without waiting
// for the full reply.
const SENTENCE_END = /[.!?؟\n]/;
const MAX_CHUNK_CHARS = 140;

export default function VoiceAssistantOverlay({ open, onClose, sessionId, model }) {
  const { t, locale } = useSettings();
  const [turns, setTurns] = useState([]); // {role, text, streaming?}
  const voiceRef = useRef(null);
  const abortRef = useRef(null);

  const handleBargeIn = useCallback(() => {
    if (abortRef.current) { abortRef.current(); abortRef.current = null; }
  }, []);

  const handleUtterance = useCallback((text) => {
    if (abortRef.current) abortRef.current(); // cancel any in-flight reply first
    setTurns((prev) => [...prev.slice(-4), { role: 'user', text }]);

    let full = '';
    let cursor = 0;
    const flushSentences = (force) => {
      for (;;) {
        let idx = -1;
        for (let i = cursor; i < full.length; i += 1) {
          if (SENTENCE_END.test(full[i])) { idx = i; break; }
        }
        if (idx === -1) {
          if (!force && full.length - cursor > MAX_CHUNK_CHARS) {
            const windowText = full.slice(cursor, cursor + MAX_CHUNK_CHARS);
            const spaceIdx = windowText.lastIndexOf(' ');
            if (spaceIdx > 40) {
              const chunk = full.slice(cursor, cursor + spaceIdx).trim();
              cursor += spaceIdx + 1;
              if (chunk) voiceRef.current?.enqueueSpeech(chunk);
              continue;
            }
          }
          break;
        }
        const chunk = full.slice(cursor, idx + 1).trim();
        cursor = idx + 1;
        if (chunk) voiceRef.current?.enqueueSpeech(chunk);
      }
      if (force) {
        const rest = full.slice(cursor).trim();
        cursor = full.length;
        if (rest) voiceRef.current?.enqueueSpeech(rest);
      }
    };

    abortRef.current = chatAPI.sendMessageStream(text, sessionId, {
      onDelta: (delta) => {
        full += delta.text || '';
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), { role: 'assistant', text: full, streaming: true }];
          }
          return [...prev.slice(-4), { role: 'assistant', text: full, streaming: true }];
        });
        flushSentences(false);
      },
      onComplete: (result) => {
        const reply = result.response || '';
        if (!full.trim() && reply) full = reply;
        flushSentences(true);
        voiceRef.current?.finishSpeechStream();
        const finalText = full.trim() ? full : reply;
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), { role: 'assistant', text: finalText }];
          }
          return [...prev.slice(-4), { role: 'assistant', text: finalText }];
        });
      },
      onError: () => {
        const msg = t('va.err.streamFailed');
        setTurns((prev) => [...prev.slice(-4), { role: 'assistant', text: msg }]);
        voiceRef.current?.enqueueSpeech(msg);
        voiceRef.current?.finishSpeechStream();
      },
    }, { model, lang: locale });
  }, [sessionId, model, locale, t]);

  const voice = useVoiceAssistant({ locale, onUtterance: handleUtterance, onBargeIn: handleBargeIn });
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  // Open/close drives the mic session.
  useEffect(() => {
    if (open) { setTurns([]); voice.start(); }
    return () => { voice.stop(); if (abortRef.current) abortRef.current(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const phase = voice.state;
  // When errored, the footer shows the reason — don't show the misleading
  // "Starting…" idle label under the orb.
  const phaseLabel = voice.error ? '' : ({
    listening: t('va.listening'),
    thinking: t('va.thinking'),
    speaking: t('va.speaking'),
    idle: t('va.tapToStart'),
  }[phase] || '');
  const PhaseIcon = phase === 'speaking' ? Volume2 : phase === 'thinking' ? Sparkles : Mic;

  // Orb scales with mic level when listening; gentle auto-pulse otherwise.
  const scale = phase === 'listening' ? 1 + Math.min(0.6, voice.level * 1.8) : 1;
  const ringColor = phase === 'thinking' ? 'var(--color-amber-400)'
    : phase === 'speaking' ? '#6366f1' : 'var(--color-emerald-500)';

  const lastUser = [...turns].reverse().find((x) => x.role === 'user');
  const lastAssistant = [...turns].reverse().find((x) => x.role === 'assistant');

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 text-white p-6"
      role="dialog" aria-modal="true" aria-label={t('va.title')}>
      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-lg">
        <span className="text-sm font-semibold text-white/70 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" /> {t('va.title')}
        </span>
        <button onClick={onClose} aria-label={t('va.close')}
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Orb + phase */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
          {/* glow rings */}
          <div className="absolute rounded-full blur-2xl opacity-40 transition-[transform,background] duration-300"
            style={{ width: 200, height: 200, background: ringColor, transform: `scale(${scale})` }} />
          <div className={`absolute rounded-full blur-xl opacity-60 transition-[background] duration-300 ${phase === 'thinking' ? 'animate-pulse' : ''}`}
            style={{ width: 150, height: 150, background: ringColor, transform: `scale(${scale})` }} />
          {/* Silence countdown — restarts (via key) each time new speech resets the
              hook's real 1300ms silence timer. Purely presentational: an approximate
              visual of an existing constant, not a second source of truth for it. */}
          {phase === 'listening' && voice.transcript && (
            <svg key={voice.transcript} className="absolute -rotate-90" width={240} height={240} viewBox="0 0 240 240">
              <circle
                cx={120} cy={120} r={115} fill="none" stroke="var(--color-emerald-400)"
                strokeWidth={2} strokeLinecap="round" opacity={0.5}
                strokeDasharray={2 * Math.PI * 115}
                className="voice-silence-ring"
              />
            </svg>
          )}
          {/* core orb */}
          <div className="relative rounded-full shadow-2xl flex items-center justify-center transition-[transform,background] duration-300"
            style={{
              width: 120, height: 120, transform: `scale(${scale})`,
              background: `radial-gradient(circle at 35% 30%, #fff6, ${ringColor})`,
            }}>
            <PhaseIcon className={`w-9 h-9 text-white ${phase === 'speaking' ? 'animate-pulse' : ''}`} />
          </div>
        </div>
        <p className="text-lg font-medium text-white/90">{phaseLabel}</p>

        {/* live transcript / last turns */}
        <div className="min-h-[4rem] max-w-md text-center px-4" dir="auto">
          {voice.transcript && phase === 'listening' ? (
            <p className="text-emerald-200 text-base">{voice.transcript}</p>
          ) : (
            <>
              {lastUser && <p className="text-white/50 text-sm mb-1">{lastUser.text}</p>}
              {lastAssistant && <p className="text-white text-base leading-relaxed">{lastAssistant.text}</p>}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-lg text-center">
        {voice.error ? (
          <p className="text-coral-400 text-sm mb-3">
            {voice.error === 'mic-denied' ? t('va.micDenied')
              : voice.error === 'unsupported' ? t('voice.unsupported') : t('va.micFailed')}
          </p>
        ) : (
          <p className="text-white/50 text-xs mb-3">{t('va.hint')}</p>
        )}
        <button onClick={onClose}
          className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors inline-flex items-center gap-2">
          <X className="w-4 h-4" /> {t('va.end')}
        </button>
      </div>
    </div>
  );
}
