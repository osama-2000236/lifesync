// Shared reply TTS for Chat (+ any non-loop surface).
// FACT: Voice assistant already uses cloud TTS when the device has no local
// voice for the reply language (Arabic on Windows/Chrome). Chat used only
// speechSynthesis — so Arabic chat was silent. Same rule here.

import { voiceAPI } from '../services/api';
import {
  stripMarkdownForSpeech, chunkForSpeech, pickVoice, detectLang, speechLangTag, hasVoiceForLang,
} from './speech';
import { attachBlobUrl, stopAndRevokeAudio } from './cloudAudio';

let cloudTtsKnown = null; // null = untried, true/false after first attempt

const playCloudChunk = (text, lang) => voiceAPI.speak(text, lang).then((res) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(res.data);
  const audio = attachBlobUrl(new Audio(url), url);
  const done = (ok) => {
    stopAndRevokeAudio(audio);
    if (ok) resolve();
    else reject(new Error('audio play failed'));
  };
  audio.onended = () => done(true);
  audio.onerror = () => done(false);
  audio.play().catch(() => done(false));
}));

const speakBrowser = (clean, lang) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const pool = window.speechSynthesis.getVoices() || [];
    const voice = pickVoice(pool, lang);
    for (const chunk of chunkForSpeech(clean)) {
      const u = new SpeechSynthesisUtterance(chunk);
      u.lang = speechLangTag(lang);
      if (voice) u.voice = voice;
      window.speechSynthesis.speak(u);
    }
  } catch { /* best-effort */ }
};

/**
 * Speak assistant text. Uses cloud TTS when no local voice for the language
 * (same contract as useVoiceAssistant). Falls back to browser on cloud failure.
 */
export const speakReply = async (text, { locale = 'en' } = {}) => {
  const clean = stripMarkdownForSpeech(text);
  if (!clean || typeof window === 'undefined') return { via: null };

  const lang = detectLang(clean, locale);
  const pool = ('speechSynthesis' in window)
    ? (window.speechSynthesis.getVoices() || [])
    : [];
  const needCloud = !hasVoiceForLang(pool, lang);

  if (needCloud && cloudTtsKnown !== false) {
    try {
      for (const chunk of chunkForSpeech(clean)) {
        // eslint-disable-next-line no-await-in-loop -- sequential audio chunks
        await playCloudChunk(chunk, lang);
      }
      cloudTtsKnown = true;
      return { via: 'cloud', lang };
    } catch (err) {
      // Parity with useVoiceAssistant: only 501 (provider unconfigured) turns
      // cloud TTS off for the session. A transient 5xx/network blip must not
      // leave Arabic chat silent until reload — retry cloud on the next reply.
      if (err?.response?.status === 501) cloudTtsKnown = false;
    }
  }

  speakBrowser(clean, lang);
  return { via: 'browser', lang };
};

/** Test helper */
export const _resetCloudTtsKnown = () => { cloudTtsKnown = null; };
