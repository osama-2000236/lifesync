// Hands-free voice assistant loop, Gemini-app style. SEPARATE from the chat's
// push-to-talk mic (useVoice): this drives a full-screen conversational mode —
// continuous listening with live interim transcript, silence-based turn-taking,
// a mic-level signal for the reactive orb, and spoken replies, then auto-resumes
// listening. The orchestration (sending the utterance to the model) lives in the
// overlay; this hook owns the microphone, recognition, audio metering, and TTS.
import { useCallback, useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const langTag = (locale) => (locale === 'ar' ? 'ar-SA' : 'en-US');
const SILENCE_MS = 1300; // pause after speech that finalizes a turn

export function useVoiceAssistant({ locale = 'en', onUtterance } = {}) {
  const supported = Boolean(SR) && typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [active, setActive] = useState(false);
  const [state, setState] = useState('idle'); // idle | listening | thinking | speaking
  const [transcript, setTranscript] = useState('');
  const [level, setLevel] = useState(0); // 0..1 mic amplitude for the orb
  const [error, setError] = useState(null);

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalRef = useRef('');
  const activeRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);
  const stateRef = useRef('idle');
  const setPhase = useCallback((s) => { stateRef.current = s; setState(s); }, []);

  // ─── Mic level metering (drives the orb) ───
  const startMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / data.length / 255; // 0..1
        setLevel((prev) => prev * 0.6 + avg * 0.4); // smooth
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      setError(e?.name === 'NotAllowedError' ? 'mic-denied' : 'mic-failed');
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    streamRef.current = null;
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  // ─── Recognition ───
  const clearSilence = () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; };

  const startListening = useCallback(() => {
    if (!SR || !activeRef.current) return;
    try { recRef.current?.abort(); } catch { /* ignore */ }
    finalRef.current = '';
    setTranscript('');
    const rec = new SR();
    rec.lang = langTag(locale);
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const txt = e.results[i][0]?.transcript || '';
        if (e.results[i].isFinal) finalRef.current += txt;
        else interim += txt;
      }
      setTranscript((finalRef.current + interim).trim());
      // Restart the silence timer on every chunk; fire when the user pauses.
      clearSilence();
      silenceTimerRef.current = setTimeout(() => {
        const utterance = (finalRef.current || interim).trim();
        if (utterance && activeRef.current) {
          try { rec.stop(); } catch { /* ignore */ }
          setPhase('thinking');
          onUtteranceRef.current?.(utterance);
        }
      }, SILENCE_MS);
    };
    rec.onerror = (e) => {
      if (e?.error === 'not-allowed') setError('mic-denied');
      // 'no-speech'/'aborted' are benign in a continuous loop.
    };
    rec.onend = () => {
      // If we're still meant to be listening (not thinking/speaking), restart.
      if (activeRef.current && stateRef.current === 'listening') {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    recRef.current = rec;
    setPhase('listening');
    try { rec.start(); } catch { /* ignore */ }
  }, [locale, setPhase]);

  // Speak a reply, then resume listening (hands-free turn-taking).
  const speak = useCallback((text) => new Promise((resolve) => {
    if (!text || !activeRef.current) return resolve();
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = langTag(locale);
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(langTag(locale).slice(0, 2)));
      if (voice) u.voice = voice;
      setPhase('speaking');
      u.onend = () => { resolve(); if (activeRef.current) startListening(); };
      u.onerror = () => { resolve(); if (activeRef.current) startListening(); };
      window.speechSynthesis.speak(u);
    } catch { resolve(); if (activeRef.current) startListening(); }
  }), [locale, setPhase, startListening]);

  const start = useCallback(async () => {
    if (!supported) { setError('unsupported'); return; }
    setError(null);
    activeRef.current = true;
    setActive(true);
    await startMeter();
    startListening();
  }, [supported, startMeter, startListening]);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearSilence();
    try { recRef.current?.abort(); } catch { /* ignore */ }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    stopMeter();
    setTranscript('');
    setPhase('idle');
    setActive(false);
  }, [stopMeter, setPhase]);

  useEffect(() => () => { stop(); }, [stop]);

  return { supported, active, state, transcript, level, error, start, stop, speak, setPhase };
}
