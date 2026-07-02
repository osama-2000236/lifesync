// src/components/chat/ChatComposer.jsx
// ============================================
// Chat composer — text + voice-to-text in ONE input (the ChatGPT/Gemini
// pattern): tap the mic, speak, words stream into the editable field, review,
// then submit. Powered by useDictation (browser STT first, server Whisper
// fallback), so it works on every browser.
// ============================================
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, SendHorizonal, Loader2 } from 'lucide-react';
import { useDictation } from '../../hooks/useDictation';

export default function ChatComposer({ locale, busy, onSubmit, t, inputRef: externalRef }) {
  const [value, setValue] = useState('');
  const innerRef = useRef(null);
  const inputRef = externalRef || innerRef;

  // Dictated words append to whatever the user already typed — they review
  // and edit freely before sending; nothing auto-submits. (useDictation keeps
  // the latest callback in a ref, so a fresh identity per render is fine.)
  const onText = (text) => {
    setValue((prev) => (prev ? `${prev.trim()} ${text}` : text));
    inputRef.current?.focus();
  };

  const dictation = useDictation({ locale, onText });
  const listening = dictation.state === 'listening';
  const transcribing = dictation.state === 'transcribing';

  // Auto-grow the textarea up to ~6 lines. The ref is always attached (the
  // textarea renders unconditionally), so the effect can use it directly.
  useEffect(() => {
    const el = inputRef.current;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, inputRef]);

  const submit = () => {
    const text = value.trim();
    if (!text || busy) return;
    if (listening) dictation.stop();
    setValue('');
    onSubmit(text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const toggleMic = () => {
    if (listening) dictation.stop();
    else dictation.start();
  };

  return (
    <div
      className={`relative rounded-2xl border bg-surface-raised dark:bg-surface-dark-raised shadow-lg shadow-navy-900/5 transition-colors ${listening ? 'border-coral-400 ring-2 ring-coral-400/30' : 'border-navy-100 dark:border-navy-800 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-400/20'}`}
      data-testid="chat-composer"
    >
      {(listening || transcribing) && (
        <div className="flex items-center gap-2 px-4 pt-3 text-xs font-medium" data-testid="dictation-status">
          {listening ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coral-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-coral-500" />
              </span>
              <span className="text-coral-500">{t('chat.dictate.listening')}</span>
              {dictation.partial && <span className="text-navy-400 truncate" dir="auto">{dictation.partial}</span>}
            </>
          ) : (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-navy-400" />
              <span className="text-navy-400">{t('chat.dictate.transcribing')}</span>
            </>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 p-2.5">
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.placeholder')}
          dir="auto"
          className="flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-navy-900 dark:text-navy-100 placeholder:text-navy-300 dark:placeholder:text-navy-500 focus:outline-none"
          data-testid="chat-input"
        />

        {dictation.supported && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={transcribing}
            aria-label={listening ? t('chat.dictate.stop') : t('chat.dictate.start')}
            aria-pressed={listening}
            title={listening ? t('chat.dictate.stop') : t('chat.dictate.start')}
            className={`shrink-0 h-10 w-10 rounded-xl inline-flex items-center justify-center transition-all ${listening ? 'bg-coral-500 text-white shadow-md shadow-coral-500/30' : 'text-navy-400 hover:text-navy-600 hover:bg-navy-50 dark:hover:bg-navy-800'} disabled:opacity-40`}
            data-testid="mic-button"
          >
            {listening ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy || !value.trim()}
          aria-label={t('chat.send')}
          className="shrink-0 h-10 w-10 rounded-xl inline-flex items-center justify-center bg-emerald-500 text-white shadow-md shadow-emerald-500/25 transition-all hover:bg-emerald-600 disabled:opacity-30 disabled:shadow-none rtl:-scale-x-100"
          data-testid="send-button"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizonal className="w-4.5 h-4.5" />}
        </button>
      </div>

      {dictation.error && (
        <p className="px-4 pb-2 text-xs text-coral-500" data-testid="dictation-error">
          {t(dictation.error === 'mic_denied' || dictation.error === 'not-allowed' ? 'chat.dictate.denied' : 'chat.dictate.error')}
        </p>
      )}
    </div>
  );
}
