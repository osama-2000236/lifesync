// Browser-native voice: Web Speech API for STT + speechSynthesis for TTS.
// Zero extra keys; works in Chrome/Edge/Safari. The assistant reply still comes
// from the selected OpenRouter/BERT model via the normal chat path — this hook
// only handles microphone capture and reading replies aloud. For production-grade
// transcription, swap startListening() to POST audio to /api/voice/transcribe.
import { useCallback, useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

const SPEAK_KEY = 'lifesync.voice.speak';
const langTag = (locale) => (locale === 'ar' ? 'ar-SA' : 'en-US');

export function useVoice({ locale = 'en', onTranscript } = {}) {
  const sttSupported = Boolean(SR);
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [speakReplies, setSpeakReplies] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem(SPEAK_KEY) === '1');
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);
  const voicesRef = useRef([]);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Voices load asynchronously; cache them so the first speak() can pick the
  // correct language voice (Arabic especially, which often loads late).
  useEffect(() => {
    if (!ttsSupported) return undefined;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices() || []; };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [ttsSupported]);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(SPEAK_KEY, speakReplies ? '1' : '0');
  }, [speakReplies]);

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!sttSupported) { setError('unsupported'); return; }
    setError(null);
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    const rec = new SR();
    rec.lang = langTag(locale);
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0]?.transcript || '').join(' ').trim();
      if (transcript) onTranscriptRef.current?.(transcript);
    };
    // e.error: 'not-allowed'/'service-not-allowed' (mic blocked),
    // 'language-not-supported' (e.g. ar-SA on desktop Chrome), 'no-speech', etc.
    rec.onerror = (e) => { setError(e?.error || 'speech_error'); setListening(false); };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setError('start_failed'); setListening(false); }
  }, [sttSupported, locale]);

  const speak = useCallback((text) => {
    if (!ttsSupported || !speakReplies || !text) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = langTag(locale);
      const wanted = langTag(locale).slice(0, 2);
      const pool = voicesRef.current.length ? voicesRef.current : (window.speechSynthesis.getVoices() || []);
      const voice = pool.find((v) => v.lang?.toLowerCase().startsWith(wanted));
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }, [ttsSupported, speakReplies, locale]);

  const cancelSpeech = useCallback(() => {
    if (ttsSupported) try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }, [ttsSupported]);

  useEffect(() => () => { stopListening(); cancelSpeech(); }, [stopListening, cancelSpeech]);

  return {
    sttSupported, ttsSupported,
    listening, error, startListening, stopListening,
    speakReplies, setSpeakReplies, speak, cancelSpeech,
  };
}
