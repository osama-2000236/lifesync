// src/pages/ChatPage.jsx
// ============================================
// LifeSync Chat — rebuilt from scratch around the project's core idea:
// ONE cross-domain conversation (health + money together) with
//   • voice-to-text in the composer (speak → review → send),
//   • an honest model picker (in-server BERT or verified FREE OpenRouter
//     models — each turn really answers with the model you picked),
//   • streamed replies with per-message model attribution,
//   • "receipts" showing exactly what was logged, mirrored to the dashboard,
//   • switchable context depth (standard / deep / max) and DB-backed memory.
// ============================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, History, Volume2, VolumeX, Layers, HeartPulse, Wallet, Link2, AudioLines, Square, Copy, Check,
} from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { chatAPI, aiAPI, authAPI } from '../services/api';
import { MODEL_OPTIONS, DEFAULT_CHAT_MODEL_ID, DEFAULT_CONTEXT_WINDOW } from '../config/models';
import ChatComposer from '../components/chat/ChatComposer';
import Markdown from '../components/chat/Markdown';
import { detectLang } from '../utils/speech';
import { speakReply } from '../utils/speakReply';
import { loadChatModelId, saveChatModelId, canChangeModel, voiceModelsOnly } from '../utils/chatModel';
import ModelPicker from '../components/chat/ModelPicker';
import EntityReceipts from '../components/chat/EntityReceipts';
import SessionsRail from '../components/chat/SessionsRail';

const DEPTHS = ['standard', 'deep', 'max'];
// Chat picker: voice trio + BERT (logging-only templates).
const chatPickerModels = (list) => {
  const trio = voiceModelsOnly(list);
  const bert = (list || []).find((m) => m.id === 'bert_local');
  return bert ? [bert, ...trio] : trio;
};

const newSessionId = () => `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function ChatPage() {
  const { t, locale, isRTL } = useSettings();

  // ─── Model + depth ───
  const [models, setModels] = useState(() => chatPickerModels(MODEL_OPTIONS));
  const [modelId, setModelId] = useState(() => loadChatModelId());
  const [depth, setDepth] = useState(DEFAULT_CONTEXT_WINDOW); // shared max harness with voice
  const [speakReplies, setSpeakReplies] = useState(false);

  // ─── Conversation state ───
  const [sessionId, setSessionId] = useState(newSessionId);
  const [sessions, setSessions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [statusText, setStatusText] = useState(null);
  const [clarification, setClarification] = useState(null);
  const [railOpen, setRailOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [modelLockHint, setModelLockHint] = useState(null);

  const abortRef = useRef(null);
  const streamBufRef = useRef('');
  const streamRafRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const chooseModel = useCallback((id) => {
    if (id === modelId) return;
    if (!canChangeModel({ busy: sending })) {
      setModelLockHint(t('model.lockedBusy'));
      setTimeout(() => setModelLockHint(null), 5000);
      return;
    }
    setModelLockHint(null);
    setModelId(id);
    saveChatModelId(id);
    authAPI.updateProfile({ preferred_model: id }).catch(() => { /* offline OK */ });
  }, [modelId, sending, t]);

  // ─── Load the live server catalog (fallback: static options) ───
  useEffect(() => {
    let alive = true;
    aiAPI.getModels()
      .then(({ data }) => {
        const list = chatPickerModels(data?.data?.models || []);
        if (alive && list.length) {
          setModels(list);
          setModelId((cur) => (list.some((m) => m.id === cur) ? cur : DEFAULT_CHAT_MODEL_ID));
        }
      })
      .catch(() => { /* static MODEL_OPTIONS already seeded */ });
    return () => { alive = false; };
  }, []);

  // ─── Sessions ───
  const refreshSessions = useCallback(() => {
    chatAPI.getSessions()
      .then(({ data }) => setSessions(data?.data?.sessions || []))
      .catch(() => { /* rail stays empty */ });
  }, []);
  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  const openSession = useCallback((id) => {
    setRailOpen(false);
    if (id === sessionId) return;
    if (abortRef.current) abortRef.current();
    setSessionId(id);
    setMessages([]);
    setClarification(null);
    chatAPI.getHistory({ session_id: id, limit: 100 })
      .then(({ data }) => {
        const rows = data?.data?.messages || [];
        setMessages(rows
          .filter((r) => r.message && String(r.message).trim())
          .map((r) => ({
            id: r.id,
            role: r.role === 'assistant' ? 'assistant' : 'user',
            content: r.message,
          })));
      })
      .catch(() => { /* empty thread is fine */ });
  }, [sessionId]);

  const startNewChat = useCallback(() => {
    if (abortRef.current) abortRef.current();
    setSessionId(newSessionId());
    setMessages([]);
    setClarification(null);
    setStreamingText('');
    setRailOpen(false);
    inputRef.current?.focus();
  }, []);

  // ─── Speech output (optional) ───
  // FACT: browser speechSynthesis has no ar-* voice on many Windows/Chrome
  // setups — voice studio already falls back to cloud /api/voice/speak.
  // Chat must use the same path or Arabic replies are silent (code, not model).
  const speak = useCallback((text) => {
    if (!speakReplies || !text) return;
    speakReply(text, { locale }).catch(() => { /* best-effort */ });
  }, [speakReplies, locale]);
  useEffect(() => () => {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
  }, []);

  // ─── Streaming plumbing ───
  const resetStreaming = useCallback(() => {
    streamBufRef.current = '';
    if (streamRafRef.current) { cancelAnimationFrame(streamRafRef.current); streamRafRef.current = null; }
    setStreamingText('');
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current();
    if (streamRafRef.current) cancelAnimationFrame(streamRafRef.current);
  }, []);

  const sendMessage = useCallback((rawText) => {
    const text = String(rawText).trim();
    if (!text || sending) return;

    setClarification(null);
    setSending(true);
    setStatusText(t('chat.status.processing'));
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }]);

    const currentModel = modelId;
    abortRef.current = chatAPI.sendMessageStream(text, sessionId, {
      onAck: (data) => {
        if (data.session_id && data.session_id !== sessionId) setSessionId(data.session_id);
      },
      onStatus: (data) => setStatusText(data.message || t('chat.status.default')),
      onDelta: (data) => {
        streamBufRef.current += data.text || '';
        if (!streamRafRef.current) {
          streamRafRef.current = requestAnimationFrame(() => {
            setStreamingText(streamBufRef.current);
            streamRafRef.current = null;
          });
        }
      },
      onComplete: (result) => {
        resetStreaming();
        // Prefer server response; if empty, use what we streamed (same text user saw).
        const replyText = String(result.response || streamBufRef.current || '').trim();
        setMessages((prev) => [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: replyText || result.response,
          entities: result.entities_logged,
          isCrossDomain: result.is_cross_domain,
          modelRuntime: result.model_runtime || null,
          modelId: currentModel,
        }]);

        if (result.needs_clarification && result.clarification_options?.length) {
          setClarification(result.clarification_options);
        } else {
          speak(replyText);
        }

        const logged = result.entities_logged || {};
        if (logged.health?.length || logged.finance?.length) {
          window.dispatchEvent(new CustomEvent('lifesync:data-changed', { detail: logged }));
        }

        setSending(false);
        setStatusText(null);
        refreshSessions();
        inputRef.current?.focus();
      },
      onError: (data) => {
        resetStreaming();
        setMessages((prev) => [...prev, {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: data.message || t('chat.err.generic'),
          isError: true,
          retryText: data.retryable === false ? null : text,
          modelRuntime: data.model_runtime || {
            responder: 'model_error',
            model: models.find((m) => m.id === currentModel)?.model || currentModel,
          },
          modelId: currentModel,
        }]);
        // Facts may still have been logged even when the model failed to reply.
        const logged = data.entities_logged || {};
        if (logged.health?.length || logged.finance?.length) {
          window.dispatchEvent(new CustomEvent('lifesync:data-changed', { detail: logged }));
        }
        setSending(false);
        setStatusText(null);
      },
    // lang = language of THIS message (real-time AR↔EN), not only the UI locale.
    }, { model: currentModel, lang: detectLang(text, locale), context_window: depth === 'standard' ? undefined : depth });
  }, [sending, sessionId, modelId, models, locale, depth, t, speak, resetStreaming, refreshSessions]);

  // ─── Stop generation ───
  // Abort the SSE request (server keeps the partial reply in history too) and
  // commit whatever streamed so far as a normal message.
  const stopStreaming = useCallback(() => {
    if (abortRef.current) abortRef.current();
    const partial = streamBufRef.current;
    if (partial) {
      setMessages((prev) => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', content: partial, stopped: true,
      }]);
    }
    resetStreaming();
    setSending(false);
    setStatusText(null);
    refreshSessions();
    inputRef.current?.focus();
  }, [resetStreaming, refreshSessions]);

  // ─── Copy message ───
  const copyMessage = useCallback(async (id, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* clipboard unavailable (permissions, http) — button is best-effort */ }
  }, []);

  // ─── Presentation helpers ───
  const modelLabel = useMemo(() => {
    const m = models.find((x) => x.id === modelId);
    return m?.label || modelId;
  }, [models, modelId]);

  const attributionFor = (msg) => {
    if (msg.role !== 'assistant') return null;
    const rt = msg.modelRuntime;
    // Errors still show which model failed (honest — never pretend BERT answered).
    if (msg.isError || rt?.responder === 'model_error') {
      const slug = rt?.model && rt.model !== 'model' && !/bert/i.test(rt.model)
        ? rt.model
        : (models.find((m) => m.id === msg.modelId)?.model || msg.modelId);
      return slug ? `${slug} · ${t('chat.attribution.failed')}` : t('chat.attribution.failed');
    }
    if (rt?.model && rt.model !== 'model' && !/bert_best|bert_local/i.test(rt.model)) return rt.model;
    if (rt?.provider === 'bert_local') return t('chat.attribution.bert');
    return null;
  };

  const suggestions = [1, 2, 3, 4].map((n) => t(`chat.welcome.suggestion${n}`));

  return (
    <div className="flex-1 flex min-h-0" dir={isRTL ? 'rtl' : 'ltr'} data-testid="chat-page">
      <SessionsRail
        sessions={sessions}
        activeId={sessionId}
        onSelect={openSession}
        onNew={startNewChat}
        open={railOpen}
        onClose={() => setRailOpen(false)}
        t={t}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* ── Header ── */}
        <header className="flex items-center gap-2 border-b border-navy-100 bg-surface-raised/80 dark:bg-surface-dark-raised/80 backdrop-blur px-4 py-2.5">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label={t('chat.newChat')}
            className="lg:hidden p-2 rounded-lg text-navy-400 hover:bg-navy-50"
            data-testid="open-rail-button"
          >
            <History className="w-4.5 h-4.5" />
          </button>

          <div className="min-w-0">
            <h1 className="font-display text-sm font-bold text-navy-900 truncate">{t('chat.title')}</h1>
            <p className="hidden sm:block text-[11px] text-navy-400 truncate">{t('chat.welcome.tagline')}</p>
          </div>

          <div className="ms-auto flex items-center gap-1.5">
            {/* Hands-free voice studio lives on its own page */}
            <Link
              to="/assistant"
              title={t('chat.openVoice')}
              aria-label={t('chat.openVoice')}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm shadow-emerald-500/30 hover:from-emerald-600 hover:to-emerald-700 transition-colors"
              data-testid="open-voice-studio"
            >
              <AudioLines className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('nav.voice')}</span>
            </Link>

            {/* Context depth: standard → deep → max */}
            <button
              type="button"
              onClick={() => setDepth((d) => DEPTHS[(DEPTHS.indexOf(d) + 1) % DEPTHS.length])}
              title={t('chat.depth.hint')}
              aria-label={t('chat.depth.hint')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${depth === 'standard' ? 'border-navy-100 text-navy-500' : 'border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}
              data-testid="depth-toggle"
            >
              <Layers className="w-3.5 h-3.5" /> {t(`chat.depth.${depth}`)}
            </button>

            <button
              type="button"
              onClick={() => setSpeakReplies((s) => !s)}
              aria-pressed={speakReplies}
              aria-label={t('chat.speakReplies')}
              title={t('chat.speakReplies')}
              className={`p-2 rounded-full transition-colors ${speakReplies ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600' : 'text-navy-400 hover:bg-navy-50'}`}
              data-testid="speak-toggle"
            >
              {speakReplies ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <ModelPicker
              models={models}
              value={modelId}
              onChange={chooseModel}
              disabled={!canChangeModel({ busy: sending })}
              t={t}
            />
          </div>
        </header>
        {modelLockHint && (
          <div className="px-4 py-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-100 dark:border-amber-500/20" role="status" data-testid="model-lock-hint">
            {modelLockHint}
          </div>
        )}

        {/* ── Thread ── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto" data-testid="chat-thread">
          <div className="mx-auto max-w-3xl px-4 py-6 space-y-5" role="log" aria-live="polite" aria-atomic="false">
            {messages.length === 0 && !streamingText && (
              <div className="pt-10 text-center" data-testid="chat-welcome">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-ink-800 shadow-lg shadow-emerald-500/20">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <h2 className="font-display text-xl font-bold text-navy-900">{t('chat.welcome.tagline')}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-navy-400">{t('chat.welcome.desc')}</p>

                <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sendMessage(s)}
                      className="rounded-full border border-navy-100 bg-surface-raised dark:bg-surface-dark-raised px-3.5 py-2 text-xs font-medium text-navy-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
                      data-testid="welcome-suggestion"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <p className="mt-6 inline-flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-navy-300 dark:text-navy-500">
                  <HeartPulse className="w-3.5 h-3.5 text-emerald-400" />
                  <Link2 className="w-3 h-3" />
                  <Wallet className="w-3.5 h-3.5 text-amber-400" />
                  {t('chat.welcome.hintPrefix')} “{t('chat.welcome.hintExample')}” — {t('chat.welcome.hintSuffix')}
                </p>
              </div>
            )}

            {messages.map((m) => (
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end msg-in">
                  <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-navy-900 dark:bg-emerald-600 px-4 py-2.5 text-[15px] leading-6 text-white shadow-sm" dir="auto" data-testid="user-message">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5 msg-in" data-testid="assistant-message">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-ink-800 shadow-sm" aria-hidden="true" data-testid="assistant-avatar">
                    <Sparkles className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className={`min-w-0 max-w-[92%] border-s-2 ps-4 ${m.isError ? 'border-coral-400' : m.isCrossDomain ? 'border-amber-400' : 'border-emerald-400'}`}>
                    {m.isError ? (
                      <div className="whitespace-pre-wrap text-[15px] leading-7 text-coral-500" dir="auto">
                        {m.content}
                      </div>
                    ) : (
                      <div className="text-[15px] leading-7 text-navy-800" dir="auto">
                        <Markdown text={m.content} />
                      </div>
                    )}
                    {m.entities && <EntityReceipts entities={m.entities} t={t} />}
                    {m.stopped && (
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-navy-400 dark:text-navy-500" data-testid="stopped-note">
                        {t('chat.stopped')}
                      </p>
                    )}
                    {attributionFor(m) && (
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-navy-400 dark:text-navy-500" data-testid="model-attribution">
                        {attributionFor(m)}
                      </p>
                    )}
                    {m.isError && m.retryText && (
                      <button
                        type="button"
                        onClick={() => sendMessage(m.retryText)}
                        className="mt-2 rounded-lg border border-coral-200 px-3 py-1.5 text-xs font-semibold text-coral-500 hover:bg-coral-50 transition-colors"
                        data-testid="retry-button"
                      >
                        {t('chat.retry.button')}
                      </button>
                    )}
                    {!m.isError && (
                      <button
                        type="button"
                        onClick={() => copyMessage(m.id, m.content)}
                        aria-label={t('chat.copy')}
                        title={t('chat.copy')}
                        className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-navy-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                        data-testid="copy-button"
                      >
                        {copiedId === m.id
                          ? (<><Check className="h-3 w-3" /> {t('chat.copied')}</>)
                          : (<><Copy className="h-3 w-3" /> {t('chat.copy')}</>)}
                      </button>
                    )}
                  </div>
                </div>
              )
            ))}

            {streamingText && (
              // aria-hidden keeps token spam away from screen readers; the
              // finalized message announces once via the role=log container.
              <div className="flex gap-2.5" aria-hidden="true" data-testid="streaming-message">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-ink-800 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="min-w-0 border-s-2 border-emerald-400 ps-4">
                  <div className="text-[15px] leading-7 text-navy-800" dir="auto">
                    <Markdown text={streamingText} />
                    <span className="stream-cursor ms-0.5 inline-block h-4 w-1.5 rounded-sm bg-emerald-400 align-middle" />
                  </div>
                </div>
              </div>
            )}

            {sending && !streamingText && statusText && (
              <p className="flex items-center gap-2 text-xs text-navy-400" role="status" data-testid="status-text">
                <span className="inline-flex items-end gap-0.5" aria-hidden="true">
                  <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                {statusText}
              </p>
            )}

            {sending && (
              <button
                type="button"
                onClick={stopStreaming}
                className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-surface-raised dark:bg-surface-dark-raised px-3.5 py-1.5 text-xs font-semibold text-navy-600 hover:border-coral-300 hover:text-coral-500 transition-colors"
                data-testid="stop-button"
              >
                <Square className="h-3 w-3 fill-current" />
                {t('chat.stop')}
              </button>
            )}

            {clarification && (
              <div className="flex flex-wrap gap-2" data-testid="clarification-options">
                {clarification.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => sendMessage(opt)}
                    className="rounded-full border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 hover:border-amber-400 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Composer ── */}
        <div className="border-t border-navy-100 bg-surface/80 dark:bg-surface-dark/80 backdrop-blur px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <ChatComposer locale={locale} busy={sending} onSubmit={sendMessage} t={t} inputRef={inputRef} />
            <p className="mt-1.5 text-center text-[10px] text-navy-400 dark:text-navy-500">
              {t('chat.footer.modelNote')} · {modelLabel}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
