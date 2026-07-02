// Hands-free voice assistant loop, Gemini-app style. SEPARATE from the chat's
// push-to-talk mic (useVoice): this drives a full-screen conversational mode —
// continuous listening with live interim transcript, silence-based turn-taking,
// a mic-level signal for the reactive orb, and spoken replies, then auto-resumes
// listening. The orchestration (sending the utterance to the model) lives in the
// overlay; this hook owns the microphone, recognition, audio metering, and TTS.
import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceAPI } from '../services/api';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const langTag = (locale) => (locale === 'ar' ? 'ar-SA' : 'en-US');
const SILENCE_MS = 1300; // pause after speech that finalizes a turn

// Native SR errors meaning "this engine can't do this language here" (Arabic
// on desktop Chrome). The loop then switches to the cloud engine: record the
// turn with MediaRecorder, detect the pause from the mic level meter, and
// transcribe via /api/voice/transcribe (server Whisper).
const NATIVE_FATAL = ['language-not-supported', 'network', 'service-not-allowed'];
const canRecord = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
// VAD thresholds against the 0..1 smoothed mic level (hysteresis).
const VOICE_START_LEVEL = 0.06;
const VOICE_KEEP_LEVEL = 0.035;
const MAX_TURN_MS = 30_000; // hard cap per recorded turn

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
      return true;
    } catch (e) {
      setError(
        e?.name === 'NotAllowedError' ? 'mic-denied'
          : e?.name === 'NotFoundError' ? 'mic-none'
            : 'mic-failed'
      );
      return false;
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

  // ─── Cloud engine (record → server Whisper) ───
  // Chosen automatically when native SR proves broken for the locale; sticky
  // for the rest of the session so every turn doesn't re-fail first.
  const engineRef = useRef('native'); // 'native' | 'cloud'
  const cloudRecorderRef = useRef(null);
  const vadTimerRef = useRef(null);
  const startCloudTurnRef = useRef(() => {});
  const startListeningRef = useRef(() => {});

  const stopCloudTurn = useCallback(() => {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
    const rec = cloudRecorderRef.current;
    cloudRecorderRef.current = null;
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch { /* ignore */ }
  }, []);

  const startCloudTurn = useCallback(() => {
    if (!activeRef.current || !streamRef.current || !canRecord()) return;
    stopCloudTurn();
    setTranscript('');
    const recorder = new window.MediaRecorder(streamRef.current);
    const chunks = [];
    let spoke = false;
    let lastVoice = 0;
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
      if (!activeRef.current) return;
      if (!spoke || chunks.length === 0) {
        // Nothing said — keep the loop alive.
        if (activeRef.current) startCloudTurnRef.current();
        return;
      }
      setPhase('thinking');
      try {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const { data } = await voiceAPI.transcribe(blob, locale);
        const text = String(data?.data?.text || '').trim();
        if (!activeRef.current) return;
        if (text) {
          setTranscript(text);
          onUtteranceRef.current?.(text);
        } else if (activeRef.current) {
          startCloudTurnRef.current();
        }
      } catch {
        setError('stt-failed');
        if (activeRef.current) startCloudTurnRef.current();
      }
    };

    cloudRecorderRef.current = recorder;
    setPhase('listening');
    try { recorder.start(250); } catch { setError('mic-failed'); return; }

    // Level-meter VAD: turn ends after SILENCE_MS of quiet following speech.
    vadTimerRef.current = setInterval(() => {
      if (!activeRef.current || cloudRecorderRef.current !== recorder) return;
      const now = Date.now();
      const level = smoothRef.current;
      if (level >= VOICE_START_LEVEL) { spoke = true; lastVoice = now; }
      else if (spoke && level >= VOICE_KEEP_LEVEL) { lastVoice = now; }
      const tooLong = now - startedAt > MAX_TURN_MS;
      const paused = spoke && now - lastVoice > SILENCE_MS;
      // A silent turn hitting the cap just recycles: onstop sees !spoke and
      // starts a fresh recorder, keeping memory bounded while idle.
      if (paused || tooLong) {
        cloudRecorderRef.current = null;
        try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
        if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
      }
    }, 100);
  }, [locale, setPhase, stopCloudTurn]);
  useEffect(() => { startCloudTurnRef.current = startCloudTurn; }, [startCloudTurn]);

  // ─── Recognition ───
  const clearSilence = () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; };

  const startNativeListening = useCallback(() => {
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
      if (e?.error === 'not-allowed') { setError('mic-denied'); return; }
      // Engine can't handle this language/network — switch to the cloud loop
      // instead of restarting a recognizer that will never produce results.
      if (NATIVE_FATAL.includes(e?.error) && canRecord() && activeRef.current) {
        engineRef.current = 'cloud';
        clearSilence();
        try { rec.abort(); } catch { /* ignore */ }
        recRef.current = null;
        startCloudTurnRef.current();
      }
      // 'no-speech'/'aborted' are benign in a continuous loop.
    };
    rec.onend = () => {
      // If we're still meant to be listening (not thinking/speaking), restart.
      if (activeRef.current && stateRef.current === 'listening' && engineRef.current === 'native' && recRef.current === rec) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };
    recRef.current = rec;
    setPhase('listening');
    try { rec.start(); } catch { /* ignore */ }
  }, [locale, setPhase]);

  // Engine dispatcher: every "resume listening" goes through here.
  const startListening = useCallback(() => {
    if (!activeRef.current) return;
    if (engineRef.current === 'cloud') startCloudTurnRef.current();
    else startListeningRef.current();
  }, []);
  useEffect(() => { startListeningRef.current = startNativeListening; }, [startNativeListening]);

  // ─── Barge-in: while the assistant is speaking, a separate recognizer listens
  // for the user starting to talk. On detection it cuts the reply short and
  // hands control back to the normal listening loop (Gemini-app style interrupt).
  const stopBargeListener = useCallback(() => {
    const rec = bargeRecRef.current;
    bargeRecRef.current = null;
    try { rec?.abort(); } catch { /* ignore */ }
  }, []);

  const startBargeListener = useCallback(() => {
    // Barge-in rides on native SR; in cloud mode the reply just plays out and
    // the record loop resumes right after.
    if (!SR || !activeRef.current || engineRef.current === 'cloud') return;
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
  // caller has signaled no more chunks are coming (finishSpeechStream). Recurses
  // through a ref (not its own name) so the self-call doesn't reference the
  // `const` binding before it's fully assigned.
  const drainQueueImplRef = useRef(() => {});
  useEffect(() => {
    drainQueueImplRef.current = () => {
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
        u.onend = () => { speakingRef.current = false; drainQueueImplRef.current(); };
        u.onerror = () => { speakingRef.current = false; drainQueueImplRef.current(); };
        window.speechSynthesis.speak(u);
      } catch { speakingRef.current = false; drainQueueImplRef.current(); }
    };
  }, [locale, setPhase, startListening, startBargeListener, stopBargeListener]);
  const drainQueue = useCallback(() => drainQueueImplRef.current(), []);

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
    const micOk = await startMeter();
    if (!micOk) {
      // No microphone → don't pretend to listen; surface the error + retry UX.
      activeRef.current = false;
      setActive(false);
      setPhase('idle');
      return;
    }
    startListening();
  }, [supported, startMeter, startListening, setPhase]);

  // Retry the native engine when the language changes — it may work for the
  // new locale even if it was broken for the previous one.
  useEffect(() => { engineRef.current = 'native'; }, [locale]);

  const stop = useCallback(() => {
    activeRef.current = false;
    clearSilence();
    stopCloudTurn();
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
  }, [stopMeter, setPhase, stopBargeListener, stopCloudTurn]);

  useEffect(() => () => { stop(); }, [stop]);

  return {
    supported, active, state, transcript, level, error,
    start, stop, speak, enqueueSpeech, finishSpeechStream, setPhase,
  };
}
