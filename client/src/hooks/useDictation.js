// src/hooks/useDictation.js
// ============================================
// Dictation hook — mic → words, review-before-submit (ChatGPT/Gemini pattern).
// ============================================
// Hybrid engine: browser-native Web Speech API is the default (fast, free, no
// keys). When native STT is unavailable (e.g. Firefox, or ar-SA on desktop
// Chrome), it falls back to recording a short clip with MediaRecorder and POSTing
// it to /api/voice/transcribe (server Whisper). The final text is handed to
// `onText` so the caller can drop it into an editable composer for review.
import { useCallback, useEffect, useRef, useState } from 'react';
import { voiceAPI } from '../services/api';

// Browser-only hook (Vite client bundle) — window/navigator always exist.
const NativeSR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

const langTag = (locale) => (locale === 'ar' ? 'ar-SA' : 'en-US');

const canRecord = () =>
  !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';

// Native SR errors that mean "this engine will never work here" (Arabic on
// desktop Chrome reports language-not-supported or network) — fall back to
// recording + server Whisper instead of surfacing a dead mic.
const NATIVE_FATAL = ['language-not-supported', 'network', 'service-not-allowed', 'audio-capture'];
// Remember per-locale native failures for the session so the next tap goes
// straight to the cloud path instead of failing once per attempt.
const nativeBroken = new Set();

// idle | listening | transcribing
export function useDictation({ locale = 'en', onText } = {}) {
  const nativeSupported = Boolean(NativeSR);
  const supported = nativeSupported || canRecord();

  const [state, setState] = useState('idle');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState(null);

  const recognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  const emit = useCallback((text) => {
    const clean = text.trim();
    if (clean) onTextRef.current?.(clean);
  }, []);

  const releaseStream = useCallback(() => {
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
    streamRef.current = null;
  }, []);

  // Forward declaration: native error handler falls back to the cloud path.
  const startCloudRef = useRef(() => {});

  // ─── Native path ───
  const startNative = useCallback(() => {
    const rec = new NativeSR();
    rec.lang = langTag(locale);
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      let finalText = '';
      for (let i = 0; i < e.results.length; i += 1) {
        const chunk = e.results[i][0]?.transcript || '';
        if (e.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      setPartial(finalText || interim);
      if (finalText) emit(finalText);
    };
    rec.onerror = (e) => {
      const code = e?.error || 'speech_error';
      // Engine can't do this language/network here — switch to record+Whisper
      // transparently so the mic still works (Arabic on desktop Chrome).
      if (NATIVE_FATAL.includes(code) && canRecord()) {
        nativeBroken.add(locale);
        try { rec.abort(); } catch { /* ignore */ }
        startCloudRef.current();
        return;
      }
      if (code === 'no-speech' || code === 'aborted') { setState('idle'); return; }
      setError(code);
      setState('idle');
    };
    rec.onend = () => setState((s) => (s === 'listening' ? 'idle' : s));
    recognitionRef.current = rec;
    setState('listening');
    try { rec.start(); } catch { setError('start_failed'); setState('idle'); }
  }, [locale, emit]);

  // ─── Cloud fallback path ───
  const finishCloud = useCallback(async () => {
    setState('transcribing');
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    chunksRef.current = [];
    releaseStream();
    try {
      const { data } = await voiceAPI.transcribe(blob, locale);
      const text = data?.data?.text || '';
      setState('idle');
      if (text) { setPartial(text); emit(text); }
      else setError('no_transcript');
    } catch {
      setState('idle');
      setError('transcribe_failed');
    }
  }, [locale, emit, releaseStream]);

  const startCloud = useCallback(async () => {
    if (!canRecord()) { setError('unsupported'); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new window.MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => { finishCloud(); };
      recorderRef.current = recorder;
      setState('listening');
      recorder.start();
    } catch {
      setError('mic_denied');
      setState('idle');
    }
  }, [finishCloud]);

  useEffect(() => { startCloudRef.current = startCloud; }, [startCloud]);

  const start = useCallback(() => {
    setError(null);
    setPartial('');
    if (nativeSupported && !nativeBroken.has(locale)) return startNative();
    return startCloud();
  }, [nativeSupported, locale, startNative, startCloud]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => () => {
    try { recognitionRef.current?.abort?.(); } catch { /* ignore */ }
    releaseStream();
  }, [releaseStream]);

  return { supported, nativeSupported, state, partial, error, start, stop, setPartial };
}
