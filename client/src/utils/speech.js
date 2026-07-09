// Shared speechSynthesis helpers for chat + voice assistant.
// Chrome desktop cuts SpeechSynthesisUtterances that run past ~200-250 chars
// (or ~15s) mid-sentence — the standard fix is chunking text at natural
// boundaries and queueing the pieces. Arabic punctuation included throughout.

const SENTENCE_END = /([.!?؟…]|\n)+/;
const COMMA = /[,،;؛]/;

// Detect the language of a piece of text so speech (STT lang + TTS voice) follows
// what the user actually said, not the app's UI locale. Arabic script → 'ar',
// else Latin → 'en', else the fallback. Mirrors the server's detector so the
// spoken voice matches the model's reply language. ponytail: script regex, not a
// langdetect dependency — widen the ranges only if a third language is added.
const AR_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
/** Real-time AR↔EN: any Arabic script → ar; pure Latin → en; else fallback (UI). */
export const detectLang = (text, fallback = 'en') => {
  const s = String(text || '');
  if (AR_SCRIPT.test(s)) return 'ar';
  if (/[A-Za-z]/.test(s)) return 'en';
  return fallback;
};

/** BCP-47 tag for the Web Speech / SpeechSynthesis APIs. */
export const speechLangTag = (lang) => (lang === 'ar' ? 'ar-SA' : 'en-US');

/** Strip markdown markers so TTS doesn't read "asterisk asterisk". */
export const stripMarkdownForSpeech = (text) => String(text || '')
  .replace(/```[\s\S]*?(```|$)/g, ' ')  // drop code blocks entirely
  .replace(/`([^`]*)`?/g, '$1')
  .replace(/\*\*([^*]*)\*\*?/g, '$1')
  .replace(/^\s*([-*]|\d+\.)\s+/gm, '')
  .trim();

/**
 * Split text into utterance-sized chunks (default 180 chars — safely under
 * Chrome's cutoff). Prefers sentence boundaries, then commas, then a hard
 * split as a last resort. Never returns empty chunks.
 */
export const chunkForSpeech = (text, max = 180) => {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const chunks = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    // Last sentence end inside the window, else last comma, else last space.
    let cut = -1;
    for (let i = window.length - 1; i > 0; i -= 1) {
      if (SENTENCE_END.test(window[i])) { cut = i + 1; break; }
    }
    if (cut === -1) {
      for (let i = window.length - 1; i > 0; i -= 1) {
        if (COMMA.test(window[i])) { cut = i + 1; break; }
      }
    }
    if (cut === -1) {
      const space = window.lastIndexOf(' ');
      cut = space > 0 ? space + 1 : max;
    }
    const piece = rest.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
};

/** Pick the best available voice for a locale ('ar' / 'en'). */
export const pickVoice = (voices, locale) => {
  const wanted = locale === 'ar' ? 'ar' : 'en';
  return (voices || []).find((v) => v.lang?.toLowerCase().startsWith(wanted)) || null;
};

/** True if the device has any speechSynthesis voice for the language. Chrome on
 *  Windows ships no ar-* voice, so an Arabic reply has no local voice and must
 *  fall back to cloud TTS (or show a hint). Drives that decision. */
export const hasVoiceForLang = (voices, lang) => Boolean(pickVoice(voices, lang));
