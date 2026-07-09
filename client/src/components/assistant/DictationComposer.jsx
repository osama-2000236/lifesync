// src/components/assistant/DictationComposer.jsx
// Voice-to-text composer: tap the mic to dictate, the words fill the box, the
// user edits/reviews, then submits. Matches the ChatGPT/Gemini input pattern.
import { useState } from 'react';
import { Mic, Square, Send, Loader2 } from 'lucide-react';
import { useDictation } from '../../hooks/useDictation';

export default function DictationComposer({ locale, busy, onSubmit, t }) {
  const [text, setText] = useState('');
  const dictation = useDictation({
    locale,
    onText: (heard) => setText((prev) => (prev ? `${prev} ${heard}` : heard)),
  });

  const listening = dictation.state === 'listening';
  const transcribing = dictation.state === 'transcribing';

  const toggleMic = () => {
    if (listening || transcribing) dictation.stop();
    else dictation.start();
  };

  const submit = () => {
    const clean = text.trim();
    if (!clean || busy) return;
    onSubmit(clean);
    setText('');
  };

  return (
    <div className="rounded-2xl border border-navy-100/70 bg-white p-3 shadow-[var(--shadow-card)]" data-testid="dictation-composer">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
        rows={3}
        dir="auto"
        placeholder={t('assistant.dictatePlaceholder')}
        className="w-full resize-none bg-transparent px-2 py-1 text-navy-900 placeholder:text-navy-300 dark:placeholder:text-navy-500 focus:outline-none text-[15px] leading-relaxed"
        data-testid="dictation-text"
      />
      {listening && (
        <p className="px-2 text-xs text-emerald-500 animate-pulse" data-testid="dictation-live">
          {dictation.partial || t('assistant.listening')}
        </p>
      )}
      {dictation.error && (
        <p className="px-2 text-xs text-coral-500" data-testid="dictation-error">
          {({
            unsupported: t('assistant.micUnsupported'),
            mic_denied: t('assistant.micDeniedTitle'),
            'not-allowed': t('assistant.micDeniedTitle'),
            'stt-unavailable': t('assistant.sttUnavailable'),
            'language-not-supported': t('assistant.sttUnavailable'),
            transcribe_failed: t('assistant.sttFailed'),
            no_transcript: t('assistant.sttFailed'),
          })[dictation.error] || t('assistant.micError')}
        </p>
      )}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={toggleMic}
          disabled={!dictation.supported || busy}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-50 ${
            listening ? 'bg-coral-500 text-white shadow-md shadow-coral-500/20' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
          }`}
          data-testid="dictation-mic"
          aria-pressed={listening}
        >
          {transcribing ? <Loader2 className="w-4 h-4 animate-spin" /> : listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {transcribing ? t('assistant.transcribing') : listening ? t('assistant.stop') : t('assistant.dictate')}
        </button>
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50 transition-all active:scale-[0.97]"
          data-testid="dictation-send"
        >
          <Send className="w-4 h-4" /> {t('assistant.send')}
        </button>
      </div>
    </div>
  );
}
