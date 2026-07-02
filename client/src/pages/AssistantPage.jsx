// src/pages/AssistantPage.jsx
// ============================================
// Voice-first assistant "studio" — a dedicated surface (route /assistant),
// SEPARATE from the chat page. Three capabilities:
//   1. Converse — hands-free talk loop (reuses useVoiceAssistant + chat stream).
//   2. Dictate — mic → words → review → submit (DictationComposer + useDictation).
//   3. Proactive cross-domain interview — the assistant asks for CONSENT, then
//      collects info; answers are logged and reflected on the dashboard, and it
//      replies with real advice from the Insight Engine.
// ============================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Mic, MessageSquareText, Square, RefreshCw, MessageCircle } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { chatAPI, assistantAPI } from '../services/api';
import { DEFAULT_CHAT_MODEL_ID } from '../config/models';
import VoiceOrb from '../components/assistant/VoiceOrb';
import ConsentCard from '../components/assistant/ConsentCard';
import InterviewPanel from '../components/assistant/InterviewPanel';
import AdviceCards from '../components/assistant/AdviceCards';
import DictationComposer from '../components/assistant/DictationComposer';

const SENTENCE_END = /[.!?؟\n]/;

// The voice assistant must CONVERSE, so it uses the user's chat model choice
// (or the free generative default) — never the template-reply BERT classifier.
const voiceModel = () => {
  try {
    const stored = localStorage.getItem('lifesync.chat.model');
    // BERT is a classifier with template replies — useless to talk to.
    return stored && stored !== 'bert_local' ? stored : DEFAULT_CHAT_MODEL_ID;
  } catch { return DEFAULT_CHAT_MODEL_ID; }
};

// Let the dashboard (and other tabs) know new data landed so they refresh.
const notifyDataChanged = () => window.dispatchEvent(new CustomEvent('lifesync:data-changed'));

export default function AssistantPage() {
  const { t, locale, isRTL } = useSettings();
  const [mode, setMode] = useState('converse'); // converse | dictate
  const [messages, setMessages] = useState([]); // {role, text, streaming?}
  const [sessionId] = useState(() => `assistant-${Date.now()}`);

  // Interview flow state.
  const [flow, setFlow] = useState('idle'); // idle | consent | interview | advice | dismissed
  const [suggestion, setSuggestion] = useState(null);
  const [question, setQuestion] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [busy, setBusy] = useState(false);

  const voiceRef = useRef(null);
  const abortRef = useRef(null);

  // ─── Streamed chat reply (used by both converse + dictate) ───
  const streamReply = useCallback((text, { speak } = {}) => {
    if (abortRef.current) abortRef.current();
    setMessages((prev) => [...prev.slice(-5), { role: 'user', text }]);

    let full = '';
    let cursor = 0;
    const flush = (force) => {
      if (!speak) return;
      for (;;) {
        let idx = -1;
        for (let i = cursor; i < full.length; i += 1) {
          if (SENTENCE_END.test(full[i])) { idx = i; break; }
        }
        if (idx === -1) break;
        const chunk = full.slice(cursor, idx + 1).trim();
        cursor = idx + 1;
        if (chunk) voiceRef.current?.enqueueSpeech(chunk);
      }
      if (force) {
        const rest = full.slice(cursor).trim();
        cursor = full.length;
        if (rest) voiceRef.current?.enqueueSpeech(rest);
      }
    };

    abortRef.current = chatAPI.sendMessageStream(text, sessionId, {
      onDelta: (delta) => {
        full += delta.text || '';
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), { role: 'assistant', text: full, streaming: true }];
          }
          return [...prev.slice(-5), { role: 'assistant', text: full, streaming: true }];
        });
        flush(false);
      },
      onComplete: (result) => {
        const reply = full.trim() || result.response;
        flush(true);
        if (speak) voiceRef.current?.finishSpeechStream();
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const finalMsg = { role: 'assistant', text: reply };
          if (last && last.role === 'assistant' && last.streaming) return [...prev.slice(0, -1), finalMsg];
          return [...prev.slice(-5), finalMsg];
        });
        if (result.entities_logged && (result.entities_logged.health?.length || result.entities_logged.finance?.length)) {
          notifyDataChanged();
        }
      },
      onError: (err) => {
        setMessages((prev) => [...prev.slice(-5), { role: 'assistant', text: err.message || t('va.err.streamFailed') }]);
      },
    }, { model: voiceModel(), lang: locale });
  }, [sessionId, locale, t]);

  // ─── Converse: hands-free loop ───
  const handleUtterance = useCallback((text) => streamReply(text, { speak: true }), [streamReply]);
  const voice = useVoiceAssistant({
    locale,
    onUtterance: handleUtterance,
    onBargeIn: () => { if (abortRef.current) { abortRef.current(); abortRef.current = null; } },
  });
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  const talking = voice.state !== 'idle';
  const toggleConverse = () => { if (talking) voice.stop(); else voice.start(); };

  useEffect(() => () => {
    voiceRef.current?.stop?.();
    if (abortRef.current) abortRef.current();
  }, []);

  // ─── Proactive suggestion on mount ───
  const loadSuggestion = useCallback(async () => {
    try {
      const { data } = await assistantAPI.getSuggestion(locale);
      const payload = data.data;
      if (payload.topic) { setSuggestion(payload); setFlow('consent'); setAdvice(null); }
      else { setSuggestion(null); setFlow('idle'); }
    } catch { setFlow('idle'); }
  }, [locale]);

  useEffect(() => { loadSuggestion(); }, [loadSuggestion]);

  const acceptConsent = async () => {
    setBusy(true);
    try {
      const { data } = await assistantAPI.startInterview(suggestion.topic, true, locale);
      setQuestion(data.data.question);
      setFlow('interview');
    } catch { /* keep consent card */ } finally { setBusy(false); }
  };

  const declineConsent = async () => {
    setBusy(true);
    try { await assistantAPI.startInterview(suggestion.topic, false, locale); } catch { /* ignore */ }
    setFlow('dismissed'); setBusy(false);
  };

  const submitAnswer = async (answer) => {
    setBusy(true);
    try {
      const { data } = await assistantAPI.answer(question.step, answer, locale);
      const payload = data.data;
      if (payload.done) {
        setAdvice(payload.advice);
        setQuestion(null);
        setFlow('advice');
        notifyDataChanged();
      } else {
        setQuestion(payload.question);
      }
    } catch { /* keep current question */ } finally { setBusy(false); }
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const micErrorTitle = voice.error === 'mic-denied' ? t('assistant.micDeniedTitle')
    : voice.error === 'mic-none' ? t('assistant.micNone')
      : t('assistant.micError');
  const phaseLabel = voice.error ? micErrorTitle
    : ({ listening: t('va.listening'), thinking: t('va.thinking'), speaking: t('va.speaking'), idle: t('assistant.tapConverse') }[voice.state] || '');

  return (
    <div className="flex-1 overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-5 gap-6">
        {/* ── Voice studio (hero) ── */}
        <section className="lg:col-span-3">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 text-white p-6 sm:p-8 min-h-[26rem] flex flex-col">
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white/70">
                <Sparkles className="w-4 h-4 text-emerald-400" /> {t('assistant.title')}
                <Link
                  to="/chat"
                  className="ms-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                  data-testid="back-to-chat"
                >
                  <MessageCircle className="w-3 h-3" /> {t('assistant.backToChat')}
                </Link>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-full bg-white/10">
                <button
                  onClick={() => setMode('converse')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${mode === 'converse' ? 'bg-paper text-ink-900' : 'text-white/70 hover:text-white'}`}
                  data-testid="mode-converse"
                >
                  <Mic className="w-3.5 h-3.5" /> {t('assistant.modeConverse')}
                </button>
                <button
                  onClick={() => setMode('dictate')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${mode === 'dictate' ? 'bg-paper text-ink-900' : 'text-white/70 hover:text-white'}`}
                  data-testid="mode-dictate"
                >
                  <MessageSquareText className="w-3.5 h-3.5" /> {t('assistant.modeDictate')}
                </button>
              </div>
            </div>

            {mode === 'converse' ? (
              <div className="relative flex-1 flex flex-col items-center justify-center gap-6 py-4">
                <VoiceOrb phase={voice.state} level={voice.level} size={200} />
                <p className="text-lg font-medium text-white/90">{phaseLabel}</p>
                <div className="min-h-[3.5rem] max-w-md text-center px-2" dir="auto">
                  {voice.transcript && voice.state === 'listening' ? (
                    <p className="text-emerald-200">{voice.transcript}</p>
                  ) : (
                    <>
                      {lastUser && <p className="text-white/50 text-sm mb-1">{lastUser.text}</p>}
                      {lastAssistant && <p className="text-white leading-relaxed">{lastAssistant.text}</p>}
                    </>
                  )}
                </div>
                {voice.error === 'mic-denied' && (
                  <p className="max-w-sm text-center text-xs leading-5 text-white/50" data-testid="mic-denied-help">
                    {t('assistant.micDeniedBody')}
                  </p>
                )}
                <button
                  onClick={toggleConverse}
                  className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-colors inline-flex items-center gap-2"
                  data-testid="converse-toggle"
                >
                  {talking ? <><Square className="w-4 h-4" /> {t('assistant.stop')}</>
                    : voice.error ? <><RefreshCw className="w-4 h-4" /> {t('assistant.retryMic')}</>
                      : <><Mic className="w-4 h-4" /> {t('assistant.startTalking')}</>}
                </button>
              </div>
            ) : (
              <div className="relative flex-1 flex flex-col justify-end gap-4 py-4">
                <div className="flex-1 overflow-y-auto space-y-3 max-h-64" data-testid="dictate-transcript">
                  {messages.length === 0 && <p className="text-white/40 text-sm">{t('assistant.dictateHint')}</p>}
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === 'user' ? 'text-white/70 text-sm' : 'text-white'} dir="auto">
                      <span className="text-[10px] uppercase tracking-wide text-white/40 me-2">{m.role === 'user' ? t('assistant.you') : t('assistant.title')}</span>
                      {m.text}
                    </div>
                  ))}
                </div>
                <DictationComposer locale={locale} busy={false} onSubmit={(txt) => streamReply(txt, { speak: false })} t={t} />
              </div>
            )}
          </div>
        </section>

        {/* ── Cross-domain interview column ── */}
        <aside className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-navy-900">{t('assistant.crossDomainTitle')}</h2>
            <button onClick={loadSuggestion} className="p-2 rounded-lg hover:bg-navy-50 text-navy-400" title={t('assistant.refresh')} data-testid="refresh-suggestion">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {flow === 'consent' && suggestion && (
            <ConsentCard prompt={suggestion.prompt} crossDomain={suggestion.cross_domain} busy={busy} onAccept={acceptConsent} onDecline={declineConsent} t={t} />
          )}
          {flow === 'interview' && (
            <InterviewPanel question={question} busy={busy} onSubmit={submitAnswer} t={t} />
          )}
          {flow === 'advice' && <AdviceCards advice={advice} t={t} />}
          {flow === 'dismissed' && (
            <div className="rounded-2xl border border-navy-100 bg-white p-5 text-sm text-navy-500" data-testid="dismissed-note">{t('assistant.dismissed')}</div>
          )}
          {flow === 'idle' && (
            <div className="rounded-2xl border border-dashed border-navy-200 bg-white/50 dark:bg-white/5 p-5 text-sm text-navy-400" data-testid="idle-note">{t('assistant.noSuggestion')}</div>
          )}
        </aside>
      </div>
    </div>
  );
}
