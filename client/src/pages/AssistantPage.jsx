// src/pages/AssistantPage.jsx
// ============================================
// Voice-first assistant "studio" — a dedicated surface (route /assistant),
// SEPARATE from the chat page. Three capabilities:
//   1. Converse — hands-free talk loop (reuses useVoiceAssistant + chat stream).
//   2. Dictate — mic → words → review → submit (DictationComposer + useDictation).
//   3. Proactive cross-domain interview — the assistant asks for CONSENT, then
//      collects info; answers are logged and reflected on the dashboard, and it
//      replies with real advice from the Insight Engine.
//
// Track B: the generative model is user-visible and selectable (ModelPicker).
// BERT is never used for voice replies — only free/cloud conversational models.
// ============================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Mic, MessageSquareText, Square, RefreshCw, MessageCircle, RotateCcw } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { stripMarkdownForSpeech, detectLang } from '../utils/speech';
import { chatAPI, assistantAPI, aiAPI, authAPI } from '../services/api';
import { MODEL_OPTIONS, DEFAULT_CHAT_MODEL_ID, DEFAULT_CONTEXT_WINDOW } from '../config/models';
import {
  voiceModelsOnly,
  loadChatModelId,
  resolveVoiceModelId,
  saveChatModelId,
  canChangeModel,
} from '../utils/chatModel';
import VoiceOrb from '../components/assistant/VoiceOrb';
import ConsentCard from '../components/assistant/ConsentCard';
import InterviewPanel from '../components/assistant/InterviewPanel';
import AdviceCards from '../components/assistant/AdviceCards';
import DictationComposer from '../components/assistant/DictationComposer';
import ModelPicker from '../components/chat/ModelPicker';

const SENTENCE_END = /[.!?؟\n]/;

// Let the dashboard (and other tabs) know new data landed so they refresh.
const notifyDataChanged = () => window.dispatchEvent(new CustomEvent('lifesync:data-changed'));

const attributionLabel = (msg, models) => {
  const rt = msg?.modelRuntime;
  // Never show the BERT classifier slug as the chat model — Track A always
  // tags bert_best_model_10pct even when the user picked Gemma/GPT/Llama.
  const bertSlug = /bert_best_model|bert_local/i;
  if (rt?.responder === 'model_error') {
    const wanted = (rt.model && !bertSlug.test(rt.model))
      ? rt.model
      : (models.find((x) => x.id === msg?.modelId)?.label || msg?.modelId);
    return wanted ? `${wanted} (failed)` : 'model failed';
  }
  if (rt?.model && rt.model !== 'model' && !bertSlug.test(rt.model)) return rt.model;
  if (rt?.provider && rt.provider !== 'bert_local') return rt.provider;
  const m = models.find((x) => x.id === msg?.modelId);
  return m?.label || msg?.modelId || null;
};

export default function AssistantPage() {
  const { t, locale, isRTL } = useSettings();
  const [mode, setMode] = useState('converse'); // converse | dictate
  const [messages, setMessages] = useState([]); // {role, text, streaming?, modelId?, modelRuntime?}
  const [sessionId, setSessionId] = useState(() => `assistant-${Date.now()}`);

  // Voice trio only: GPT paid, Llama paid, Gemma free.
  const [models, setModels] = useState(() => voiceModelsOnly(MODEL_OPTIONS));
  const [modelId, setModelId] = useState(() => resolveVoiceModelId(loadChatModelId()));
  const [switching, setSwitching] = useState(false);
  const [modelLockHint, setModelLockHint] = useState(null);

  // Interview flow state.
  const [flow, setFlow] = useState('idle'); // idle | consent | interview | advice | dismissed
  const [suggestion, setSuggestion] = useState(null);
  const [question, setQuestion] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [answerError, setAnswerError] = useState(null);

  const voiceRef = useRef(null);
  const abortRef = useRef(null);
  const modelIdRef = useRef(modelId);
  useEffect(() => { modelIdRef.current = modelId; }, [modelId]);

  const modelLabel = useMemo(() => {
    const m = models.find((x) => x.id === modelId);
    return m?.label || modelId;
  }, [models, modelId]);

  // Live server catalog — voice trio only.
  useEffect(() => {
    let alive = true;
    aiAPI.getModels()
      .then(({ data }) => {
        const list = voiceModelsOnly(data?.data?.models || []);
        if (alive && list.length) {
          setModels(list);
          setModelId((cur) => (list.some((m) => m.id === cur) ? cur : resolveVoiceModelId(DEFAULT_CHAT_MODEL_ID)));
        }
      })
      .catch(() => { /* static MODEL_OPTIONS already seeded */ });
    return () => { alive = false; };
  }, []);

  // ─── Streamed chat reply (used by both converse + dictate) ───
  const streamReply = useCallback((text, { speak, lang } = {}) => {
    if (abortRef.current) abortRef.current();
    const currentModel = resolveVoiceModelId(modelIdRef.current);
    // Reply in the language actually used this turn (voice passes the detected
    // lang; dictate/text detects from the message) so replies switch with the
    // user, not the UI locale. The server also detects from text as the source
    // of truth — this hint just covers ultra-short/script-less input.
    const replyLang = lang || detectLang(text, locale);
    setMessages((prev) => [...prev.slice(-5), { role: 'user', text }]);
    setSwitching(false);

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
            return [...prev.slice(0, -1), {
              role: 'assistant', text: full, streaming: true, modelId: currentModel,
            }];
          }
          return [...prev.slice(-5), {
            role: 'assistant', text: full, streaming: true, modelId: currentModel,
          }];
        });
        flush(false);
      },
      onComplete: (result) => {
        const reply = full.trim() || result.response;
        flush(true);
        if (speak) voiceRef.current?.finishSpeechStream();
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const finalMsg = {
            role: 'assistant',
            text: reply,
            modelId: currentModel,
            modelRuntime: result.model_runtime || null,
          };
          if (last && last.role === 'assistant' && last.streaming) return [...prev.slice(0, -1), finalMsg];
          return [...prev.slice(-5), finalMsg];
        });
        if (result.entities_logged && (result.entities_logged.health?.length || result.entities_logged.finance?.length)) {
          notifyDataChanged();
        }
      },
      onError: (err) => {
        const msg = err.message || t('va.err.streamFailed');
        setMessages((prev) => [...prev.slice(-5), {
          role: 'assistant',
          text: msg,
          modelId: currentModel,
          modelRuntime: err.model_runtime || {
            responder: 'model_error',
            model: models.find((m) => m.id === currentModel)?.model || currentModel,
          },
          isError: true,
        }]);
        // Voice loop must leave "thinking" — speak the error and resume listen.
        if (speak) {
          voiceRef.current?.enqueueSpeech?.(msg);
          voiceRef.current?.finishSpeechStream?.();
        }
      },
    // Same max harness as chat (DEFAULT_CONTEXT_WINDOW) — one shared contract.
    }, { model: currentModel, lang: replyLang, context_window: DEFAULT_CONTEXT_WINDOW });
  }, [sessionId, locale, t, models]);

  // ─── Converse: hands-free loop ───
  const handleUtterance = useCallback((text, lang) => streamReply(text, { speak: true, lang }), [streamReply]);
  const voice = useVoiceAssistant({
    locale,
    onUtterance: handleUtterance,
    onBargeIn: () => { if (abortRef.current) { abortRef.current(); abortRef.current = null; } },
  });
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  const talking = voice.state !== 'idle';
  const toggleConverse = () => { if (talking) voice.stop(); else voice.start(); };

  /** New voice turn = new session_id + empty thread → model picker unlocks. */
  const startFreshConversation = useCallback(() => {
    if (abortRef.current) { abortRef.current(); abortRef.current = null; }
    try { voiceRef.current?.stop?.(); } catch { /* best-effort */ }
    setMessages([]);
    setSessionId(`assistant-${Date.now()}`);
    setModelLockHint(null);
    setSwitching(false);
  }, []);

  const modelLocked = !canChangeModel({
    messageCount: messages.length,
    busy: talking || busy || switching,
  });

  const chooseModel = useCallback((id) => {
    const next = resolveVoiceModelId(id);
    if (next === modelIdRef.current) return;
    // Mid-conversation switch feels inconsistent — deny with a friendly hint.
    if (!canChangeModel({ messageCount: messages.length, busy: talking || busy })) {
      setModelLockHint(
        (talking || busy) ? t('model.lockedBusy') : t('model.lockedMidConvo'),
      );
      setTimeout(() => setModelLockHint(null), 5000);
      return;
    }
    setModelLockHint(null);
    setModelId(next);
    saveChatModelId(next);
    authAPI.updateProfile({ preferred_model: next }).catch(() => {});
    setSwitching(true);
    setTimeout(() => setSwitching(false), 1200);
  }, [messages.length, talking, busy, t]);

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
    setAnswerError(null);
    try {
      const { data } = await assistantAPI.startInterview(suggestion.topic, true, locale);
      setQuestion(data.data.question);
      setFlow('interview');
    } catch { /* keep consent card */ } finally { setBusy(false); }
  };

  const declineConsent = async () => {
    setBusy(true);
    setAnswerError(null);
    try { await assistantAPI.startInterview(suggestion.topic, false, locale); } catch { /* ignore */ }
    setFlow('dismissed'); setBusy(false);
  };

  const submitAnswer = async (answer) => {
    if (busy || !question) return;
    setBusy(true);
    setAnswerError(null);
    try {
      const { data } = await assistantAPI.answer(question.step, answer, locale);
      const payload = data?.data;
      if (!payload) {
        setAnswerError(t('assistant.answerError'));
        return;
      }
      if (payload.done) {
        setAdvice(payload.advice);
        setQuestion(null);
        setFlow('advice');
        notifyDataChanged();
      } else if (payload.question) {
        // Always take step/id from the server so a retry never drifts.
        setQuestion(payload.question);
      } else {
        setAnswerError(t('assistant.answerError'));
      }
    } catch (err) {
      // Surface 422/409/5xx instead of silently freezing on the same question.
      const status = err?.response?.status;
      const code = err?.response?.data?.code || err?.response?.data?.error;
      if (status === 422) setAnswerError(t('assistant.invalidAnswer'));
      else if (status === 409) setAnswerError(t('assistant.stepError'));
      else setAnswerError(t('assistant.answerError'));
      if (code) { /* keep for ops if we add logging later */ }
    } finally {
      setBusy(false);
    }
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const lastAttr = attributionLabel(lastAssistant, models);
  const micErrorTitle = ({
    'mic-denied': t('assistant.micDeniedTitle'),
    'mic-none': t('assistant.micNone'),
    'mic-busy': t('assistant.micBusy'),
    'mic-insecure': t('assistant.micInsecure'),
    unsupported: t('assistant.micUnsupported'),
    'mic-failed': t('assistant.micError'),
    // Not a mic problem — browser can't STT this language and cloud STT is off.
    'stt-unavailable': t('assistant.sttUnavailable'),
    'stt-failed': t('assistant.sttFailed'),
  })[voice.error] || (voice.error ? t('assistant.micError') : '');
  const micHelpKey = ({
    'mic-denied': 'assistant.micDeniedBody',
    'mic-busy': 'assistant.micBusyBody',
    'mic-insecure': 'assistant.micInsecureBody',
    'mic-none': 'assistant.micNoneBody',
    'mic-failed': 'assistant.micErrorBody',
    unsupported: 'assistant.micUnsupportedBody',
    'stt-unavailable': 'assistant.sttUnavailableBody',
    'stt-failed': 'assistant.sttFailedBody',
  })[voice.error];
  const phaseLabel = voice.error ? micErrorTitle
    : ({ listening: t('va.listening'), thinking: t('va.thinking'), speaking: t('va.speaking'), idle: t('assistant.tapConverse') }[voice.state] || '');

  return (
    <div className="flex-1 overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-5 gap-6">
        {/* ── Voice studio (hero) ── */}
        <section className="lg:col-span-3">
          {/* overflow-visible so nothing in the hero clips floating UI; blurs are pointer-events-none. */}
          <div className="relative overflow-visible rounded-3xl bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950 text-white p-6 sm:p-8 min-h-[26rem] flex flex-col">
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none" aria-hidden="true">
              <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" />
              <div className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
            </div>

            <div className="relative flex flex-wrap items-center justify-between gap-3">
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
              <div className="flex flex-wrap items-center gap-2">
                <ModelPicker
                  models={models}
                  value={modelId}
                  onChange={chooseModel}
                  disabled={modelLocked}
                  t={t}
                  variant="onDark"
                />
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={startFreshConversation}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/15 hover:text-white transition-colors"
                    data-testid="voice-new-chat"
                    title={t('chat.newChat')}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> {t('chat.newChat')}
                  </button>
                )}
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
            </div>

            {/* Always-visible model identity — user knows who answers. */}
            <p className="relative mt-3 text-[11px] text-white/50" data-testid="voice-model-status">
              {switching
                ? t('model.switchingBefore')
                : t('assistant.poweredBy', { model: modelLabel })}
              <span className="ms-2 text-white/35">· {t('assistant.modelNote')}</span>
              {modelLocked && !modelLockHint && (
                <span className="ms-2 text-white/40" data-testid="model-locked-badge">· {t('model.lockedMidConvo').split('.')[0]}</span>
              )}
            </p>
            {modelLockHint && (
              <p className="relative mt-2 text-xs text-amber-200/90 max-w-xl" role="status" data-testid="model-lock-hint">
                {modelLockHint}
              </p>
            )}

            {mode === 'converse' ? (
              <div className="relative flex-1 flex flex-col items-center justify-center gap-6 py-4">
                <VoiceOrb phase={voice.state} level={voice.level} size={200} bandsRef={voice.bandsRef} />
                <p className="text-lg font-medium text-white/90">{phaseLabel}</p>
                <div className="min-h-[3.5rem] max-w-md text-center px-2" role="log" aria-live="polite" aria-atomic="false" dir="auto">
                  {voice.transcript && voice.state === 'listening' ? (
                    <p className="text-emerald-200 msg-in">
                      {voice.transcript}
                      <span className="inline-flex items-end gap-0.5 ms-1.5 align-baseline" aria-hidden="true">
                        <span className="typing-dot inline-block h-1 w-1 rounded-full bg-emerald-300" />
                        <span className="typing-dot inline-block h-1 w-1 rounded-full bg-emerald-300" />
                        <span className="typing-dot inline-block h-1 w-1 rounded-full bg-emerald-300" />
                      </span>
                    </p>
                  ) : (
                    <>
                      {lastUser && <p className="text-white/50 text-sm mb-1">{lastUser.text}</p>}
                      {lastAssistant && (
                        <>
                          <p className="text-white leading-relaxed">{stripMarkdownForSpeech(lastAssistant.text)}</p>
                          {lastAttr && (
                            <p className="mt-1.5 text-[10px] uppercase tracking-wide text-white/40" data-testid="voice-model-attribution">
                              {lastAttr}
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
                {micHelpKey && (
                  <p className="max-w-sm text-center text-xs leading-5 text-white/50" data-testid="mic-error-help">
                    {t(micHelpKey)}
                  </p>
                )}
                {voice.ttsVoiceMissing && !voice.error && (
                  <p className="max-w-sm text-center text-xs leading-5 text-amber-200/80" data-testid="no-arabic-voice-help">
                    {t('va.noArabicVoice')}
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
                      <span className="text-[10px] uppercase tracking-wide text-white/40 me-2">
                        {m.role === 'user' ? t('assistant.you') : t('assistant.title')}
                      </span>
                      {m.role === 'user' ? m.text : stripMarkdownForSpeech(m.text)}
                      {m.role === 'assistant' && attributionLabel(m, models) && (
                        <span className="ms-2 text-[10px] text-white/35" data-testid="dictate-model-attribution">
                          · {attributionLabel(m, models)}
                        </span>
                      )}
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
            <>
              <InterviewPanel question={question} busy={busy} onSubmit={submitAnswer} t={t} />
              {answerError && (
                <p className="text-sm text-coral-600 dark:text-coral-400 px-1" role="alert" data-testid="interview-error">
                  {answerError}
                </p>
              )}
            </>
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
