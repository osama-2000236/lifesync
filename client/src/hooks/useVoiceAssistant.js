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

export function useVoiceAssistant({ locale = 'en', onUtterance, onBargeIn } = {}) {
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
  const voicesRef = useRef([]);
  const smoothRef = useRef(0);
  const lastSetRef = useRef(0);

  // Cache TTS voices (load async) so the first reply picks the right language
  // voice — Arabic especially, which often loads late.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() || []; };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  const activeRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  useEffect(() => { onUtteranceRef.current = onUtterance; }, [onUtterance]);
  const onBargeInRef = useRef(onBargeIn);
  useEffect(() => { onBargeInRef.current = onBargeIn; }, [onBargeIn]);
  const stateRef = useRef('idle');
  const setPhase = useCallback((s) => { stateRef.current = s; setState(s); }, []);

  // ─── Sentence-queue TTS (real-time): speaks each finished sentence as soon as
  // it arrives from the streaming reply, instead of waiting for the full text.
  const speechQueueRef = useRef([]);
  const speakingRef = useRef(false);
  const streamDoneRef = useRef(true);
  const bargeRecRef = useRef(null);

  // ─── Mic level metering (drives the orb) ───
  const startMeter = useCallback(async () => {
    try {
      // Echo cancellation keeps the spoken reply from re-triggering the mic.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
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
        smoothRef.current = smoothRef.current * 0.6 + avg * 0.4;
        // Throttle React state to ~20fps (orb has a CSS transition for smoothing)
        // so the overlay doesn't re-render 60×/sec.
        const now = performance.now();
        if (now - lastSetRef.current > 50) {
          lastSetRef.current = now;
          setLevel(Math.round(smoothRef.current * 100) / 100);
        }
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

  // ─── Barge-in: while the assistant is speaking, a separate recognizer listens
  // for the user starting to talk. On detection it cuts the reply short and
  // hands control back to the normal listening loop (Gemini-app style interrupt).
  const stopBargeListener = useCallback(() => {
    const rec = bargeRecRef.current;
    bargeRecRef.current = null;
    try { rec?.abort(); } catch { /* ignore */ }
  }, []);

  const startBargeListener = useCallback(() => {
    if (!SR || !activeRef.current) return;
    stopBargeListener();
    const rec = new SR();
    rec.lang = langTag(locale);
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const txt = (last?.[0]?.transcript || '').trim();
      if (txt.length < 3) return;
      stopBargeListener();
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      speechQueueRef.current = [];
      speakingRef.current = false;
      streamDoneRef.current = true;
      onBargeInRef.current?.();
      if (activeRef.current) startListening();
    };
    rec.onerror = () => { /* benign in a best-effort listener */ };
    rec.onend = () => {
      if (activeRef.current && stateRef.current === 'speaking' && bargeRecRef.current === rec) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    bargeRecRef.current = rec;
    try { rec.start(); } catch { /* ignore */ }
  }, [locale, stopBargeListener, startListening]);

  // Speaks the queue sequentially; resumes listening once it's drained AND the
  // caller has signaled no more chunks are coming (finishSpeechStream).
  const drainQueue = useCallback(() => {
    if (speakingRef.current || !activeRef.current) return;
    const next = speechQueueRef.current.shift();
    if (!next) {
      stopBargeListener();
      if (streamDoneRef.current && activeRef.current) startListening();
      return;
    }
    speakingRef.current = true;
    setPhase('speaking');
    if (!bargeRecRef.current) startBargeListener(); // keep one barge listener alive across the whole speaking turn, not per-sentence
    try {
      const u = new SpeechSynthesisUtterance(next);
      u.lang = langTag(locale);
      const wanted = langTag(locale).slice(0, 2);
      const pool = voicesRef.current.length ? voicesRef.current : (window.speechSynthesis.getVoices() || []);
      const voice = pool.find((v) => v.lang?.toLowerCase().startsWith(wanted));
      if (voice) u.voice = voice;
      u.onend = () => { speakingRef.current = false; drainQueue(); };
      u.onerror = () => { speakingRef.current = false; drainQueue(); };
      window.speechSynthesis.speak(u);
    } catch { speakingRef.current = false; drainQueue(); }
  }, [locale, setPhase, startListening, startBargeListener, stopBargeListener]);

  // Enqueue one finished sentence/chunk for speech (called as the reply streams in).
  const enqueueSpeech = useCallback((text) => {
    const t = String(text || '').trim();
    if (!t || !activeRef.current) return;
    speechQueueRef.current.push(t);
    streamDoneRef.current = false;
    drainQueue();
  }, [drainQueue]);

  // Signal that no more chunks are coming for this turn — resumes listening
  // once whatever is queued finishes speaking.
  const finishSpeechStream = useCallback(() => {
    streamDoneRef.current = true;
    if (!speakingRef.current && speechQueueRef.current.length === 0 && activeRef.current) {
      stopBargeListener();
      startListening();
    }
  }, [startListening, stopBargeListener]);

  // Back-compat single-shot speak (BERT path / error messages): one chunk, done.
  const speak = useCallback((text) => {
    if (!text || !activeRef.current) return;
    enqueueSpeech(text);
    finishSpeechStream();
  }, [enqueueSpeech, finishSpeechStream]);

  const start = useCallback(async () => {
    if (!supported) { setError('unsupported'); return; }
    if (activeRef.current) return; // guard against double-start (StrictMode / re-open)
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
    stopBargeListener();
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    speechQueueRef.current = [];
    speakingRef.current = false;
    streamDoneRef.current = true;
    stopMeter();
    setTranscript('');
    setPhase('idle');
    setActive(false);
  }, [stopMeter, setPhase, stopBargeListener]);

  useEffect(() => () => { stop(); }, [stop]);

  return {
    supported, active, state, transcript, level, error,
    start, stop, speak, enqueueSpeech, finishSpeechStream, setPhase,
  };
}
