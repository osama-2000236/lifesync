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

export default function VoiceAssistantOverlay({ open, onClose, sessionId, model }) {
  const { t, locale } = useSettings();
  const [turns, setTurns] = useState([]); // {role, text}
  const speakRef = useRef(null);
  const abortRef = useRef(null);

  const handleUtterance = useCallback((text) => {
    if (abortRef.current) abortRef.current(); // cancel any in-flight reply first
    setTurns((prev) => [...prev.slice(-4), { role: 'user', text }]);
    abortRef.current = chatAPI.sendMessageStream(text, sessionId, {
      onComplete: (result) => {
        const reply = result.response || '';
        setTurns((prev) => [...prev.slice(-4), { role: 'assistant', text: reply }]);
        speakRef.current?.(reply);
      },
      onError: () => {
        const msg = locale === 'ar' ? 'تعذّر الوصول للمساعد. حاول مرة أخرى.' : "Couldn't reach the assistant. Try again.";
        setTurns((prev) => [...prev.slice(-4), { role: 'assistant', text: msg }]);
        speakRef.current?.(msg);
      },
    }, { model, lang: locale });
  }, [sessionId, model, locale]);

  const voice = useVoiceAssistant({ locale, onUtterance: handleUtterance });
  useEffect(() => { speakRef.current = voice.speak; }, [voice.speak]);

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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 text-white p-6"
      role="dialog" aria-modal="true" aria-label={t('va.title')}>
      {/* Header */}
      <div className="w-full flex items-center justify-between max-w-lg">
        <span className="text-sm font-semibold text-navy-300 flex items-center gap-2">
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
          <div className="absolute rounded-full blur-2xl opacity-40 transition-transform duration-100"
            style={{ width: 200, height: 200, background: ringColor, transform: `scale(${scale})` }} />
          <div className={`absolute rounded-full blur-xl opacity-60 ${phase === 'thinking' ? 'animate-pulse' : ''}`}
            style={{ width: 150, height: 150, background: ringColor, transform: `scale(${scale})` }} />
          {/* core orb */}
          <div className="relative rounded-full shadow-2xl flex items-center justify-center transition-transform duration-100"
            style={{
              width: 120, height: 120, transform: `scale(${scale})`,
              background: `radial-gradient(circle at 35% 30%, #fff6, ${ringColor})`,
            }}>
            <PhaseIcon className={`w-9 h-9 text-white ${phase === 'speaking' ? 'animate-pulse' : ''}`} />
          </div>
        </div>
        <p className="text-lg font-medium text-navy-100">{phaseLabel}</p>

        {/* live transcript / last turns */}
        <div className="min-h-[4rem] max-w-md text-center px-4" dir="auto">
          {voice.transcript && phase === 'listening' ? (
            <p className="text-emerald-200 text-base">{voice.transcript}</p>
          ) : (
            <>
              {lastUser && <p className="text-navy-400 text-sm mb-1">{lastUser.text}</p>}
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
          <p className="text-navy-400 text-xs mb-3">{t('va.hint')}</p>
        )}
        <button onClick={onClose}
          className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors inline-flex items-center gap-2">
          <X className="w-4 h-4" /> {t('va.end')}
        </button>
      </div>
    </div>
  );
}
