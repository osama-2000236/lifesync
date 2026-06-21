// src/pages/ChatPage.jsx
// ============================================
// Cross-Domain Chat — Health + Finance in one conversation
// Features: SSE streaming, domain indicators, entity badges,
//           retry on error, animated transitions, status stages
// ============================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { aiAPI, chatAPI } from '../services/api';
import { subscribeToChatSession } from '../services/firebase';
import {
  Send, Loader2, Sparkles, Plus, Clock, MessageCircle,
  Heart, Wallet, Link2, RotateCcw, AlertCircle, Zap,
  ArrowRight, TrendingUp, Activity,
  BrainCircuit, ChevronDown, RefreshCw, Cpu, ShieldCheck,
  CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// DOMAIN COLORS & CONFIG
// ============================================

const DOMAIN_CONFIG = {
  health: { label: 'Health', color: 'emerald', icon: Heart, emoji: '❤️' },
  finance: { label: 'Finance', color: 'blue', icon: Wallet, emoji: '💰' },
  both: { label: 'Cross-Domain', color: 'purple', icon: Link2, emoji: '🔗' },
  general: { label: 'General', color: 'navy', icon: MessageCircle, emoji: '💬' },
};

// ============================================
// SUB-COMPONENTS
// ============================================

/** Domain pill badges on assistant messages */
function DomainBadges({ domain, isCrossDomain }) {
  if (!domain || domain === 'general') return null;
  const badges = [];

  if (domain === 'health' || isCrossDomain) {
    badges.push(
      <span key="h" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold border border-emerald-100">
        <Heart className="w-2.5 h-2.5" /> Health
      </span>
    );
  }
  if (domain === 'finance' || isCrossDomain) {
    badges.push(
      <span key="f" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold border border-blue-100">
        <Wallet className="w-2.5 h-2.5" /> Finance
      </span>
    );
  }
  if (isCrossDomain) {
    badges.push(
      <span key="x" className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-semibold border border-purple-100 animate-pulse">
        <Link2 className="w-2.5 h-2.5" /> Cross-Linked
      </span>
    );
  }

  return <div className="flex flex-wrap gap-1 mt-1.5">{badges}</div>;
}

/** Entity badges showing what was logged */
function EntitiesBadge({ entities }) {
  if (!entities) return null;
  const { health = [], finance = [], linked = [] } = entities;
  if (health.length === 0 && finance.length === 0) return null;

  return (
    <div className="flex items-end gap-2 animate-fade-up">
      <div className="w-7 h-7" />
      <div className="flex flex-wrap gap-1.5">
        {health.map((e, i) => (
          <span
            key={`h-${i}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-medium text-emerald-700 shadow-sm animate-fade-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <Heart className="w-3 h-3 text-emerald-500" />
            {e.type}: {e.value}
          </span>
        ))}
        {finance.map((e, i) => (
          <span
            key={`f-${i}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-100 text-xs font-medium text-blue-700 shadow-sm animate-fade-up"
            style={{ animationDelay: `${(health.length + i) * 80}ms` }}
          >
            <Wallet className="w-3 h-3 text-blue-500" />
            {e.type}: ${e.amount}
          </span>
        ))}
        {linked.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-100 text-xs font-medium text-purple-700 shadow-sm animate-fade-up">
            <Link2 className="w-3 h-3 text-purple-500" />
            {linked.length} cross-domain link{linked.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

/** Single chat bubble */
function ChatBubble({ message, onRetry }) {
  const isUser = message.role === 'user';
  const isError = message.isError;
  const retryableError = isError && message.retryable;

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : ''} animate-fade-up`}>
      {!isUser && (
        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${
          isError
            ? retryableError ? 'from-amber-100 to-amber-200' : 'from-red-200 to-red-300'
            : 'from-navy-200 to-navy-300'
        } flex items-center justify-center flex-shrink-0`}>
          {isError ? (
            <AlertCircle className={`w-3.5 h-3.5 ${retryableError ? 'text-amber-600' : 'text-red-600'}`} />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-navy-600" />
          )}
        </div>
      )}
      <div className={`max-w-[75%] ${isUser ? '' : 'space-y-1'}`}>
        <div className={`px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'chat-bubble-user'
            : isError
              ? retryableError
                ? 'chat-bubble-assistant border border-amber-200 bg-amber-50/80'
                : 'chat-bubble-assistant border border-red-200 bg-red-50/80'
              : 'chat-bubble-assistant'
        }`}>
          {message.content}
        </div>

        {/* Domain badges */}
        {!isUser && !isError && message.domain && (
          <DomainBadges domain={message.domain} isCrossDomain={message.isCrossDomain} />
        )}

        {/* Retry button on errors */}
        {isError && message.retryable && onRetry && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-amber-700">
              Your message is saved here. You can retry it, or send a clearer version like "Spent $20 on food".
            </p>
            <button
              onClick={() => onRetry(message.originalText)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Retry message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Typing / status indicator */
function TypingIndicator({ statusText }) {
  return (
    <div className="flex items-end gap-2 max-w-[80%] animate-fade-up">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-navy-200 to-navy-300 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-navy-600 animate-spin-slow" />
      </div>
      <div className="chat-bubble-assistant px-5 py-3.5">
        {statusText ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin" />
            <p className="text-xs text-navy-500 font-medium">{statusText}</p>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <div className="w-2 h-2 rounded-full bg-navy-400 typing-dot" />
            <div className="w-2 h-2 rounded-full bg-navy-400 typing-dot" />
            <div className="w-2 h-2 rounded-full bg-navy-400 typing-dot" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Clarification quick-action buttons */
function ClarificationButtons({ options, onSelect, disabled }) {
  if (!options || options.length === 0) return null;
  return (
    <div className="flex items-end gap-2 animate-fade-up">
      <div className="w-7 h-7" />
      <div className="flex flex-wrap gap-2 max-w-[75%]">
        {options.map((option, i) => (
          <button
            key={i}
            onClick={() => onSelect(option)}
            disabled={disabled}
            className="px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Session sidebar item */
function SessionItem({ session, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
        isActive ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-navy-600 hover:bg-navy-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{session.message_count} messages</span>
      </div>
      <p className="text-[11px] text-navy-400 mt-0.5 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {new Date(session.last_message_at || session.started_at).toLocaleDateString()}
      </p>
    </button>
  );
}

/** Welcome screen with cross-domain suggestions */
function WelcomeScreen({ onSend }) {
  const suggestions = [
    { text: 'I walked 8000 steps today', domain: 'health', icon: Heart },
    { text: 'Spent $15 on lunch', domain: 'finance', icon: Wallet },
    { text: 'Slept 7 hours last night', domain: 'health', icon: Heart },
    { text: 'Feeling great, mood 8/10', domain: 'health', icon: Heart },
    { text: 'Spent $50 on a healthy dinner', domain: 'both', icon: Link2 },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mb-4 shadow-lg shadow-emerald-100">
        <Activity className="w-8 h-8 text-emerald-600" />
      </div>
      <h3 className="font-display text-lg font-bold text-navy-800 mb-1">LifeSync Assistant</h3>
      <p className="text-navy-400 text-xs mb-1 font-semibold uppercase tracking-wider">Cross-Domain Life Tracker</p>
      <p className="text-navy-500 text-sm max-w-sm mb-6">
        Tell me about your day — spending, exercise, sleep, mood — I track health &amp; finances together and find the connections.
      </p>

      {/* Domain legend */}
      <div className="flex gap-3 mb-6">
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
          <Heart className="w-3 h-3" /> Health
        </span>
        <span className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
          <Wallet className="w-3 h-3" /> Finance
        </span>
        <span className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full border border-purple-100">
          <Link2 className="w-3 h-3" /> Cross-Domain
        </span>
      </div>

      {/* Suggestion pills */}
      <div className="flex flex-wrap gap-2 justify-center max-w-md">
        {suggestions.map(({ text, domain, icon: Icon }) => {
          const cfg = DOMAIN_CONFIG[domain] || DOMAIN_CONFIG.general;
          return (
            <button
              key={text}
              onClick={() => onSend(text)}
              className={`group flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border text-sm transition-all hover:shadow-md active:scale-[0.97] ${
                domain === 'health'
                  ? 'border-emerald-100 text-navy-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'
                  : domain === 'finance'
                    ? 'border-blue-100 text-navy-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                    : 'border-purple-100 text-navy-600 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity ${
                domain === 'health' ? 'text-emerald-500' : domain === 'finance' ? 'text-blue-500' : 'text-purple-500'
              }`} />
              {text}
            </button>
          );
        })}
      </div>

      {/* Cross-domain hint */}
      <div className="mt-8 flex items-center gap-2 text-[11px] text-navy-400 bg-navy-50/50 px-4 py-2 rounded-xl">
        <Zap className="w-3.5 h-3.5 text-purple-400" />
        <span>Try mixing domains: <em className="text-navy-500">&quot;Spent $50 on gym membership&quot;</em> links finance → health</span>
      </div>
    </div>
  );
}

/** Compact, inspectable model state and activation menu. */
function ModelPulse({ runtime, loading, starting, error, isOpen, onToggle, onRefresh, onStart }) {
  const active = runtime?.active;
  const activation = runtime?.activation;
  const isClassifier = active?.capabilities?.classifier_only;
  const isReady = ['ready', 'configured'].includes(active?.status);
  const tone = starting ? 'amber' : isReady && !isClassifier ? 'emerald' : isClassifier ? 'amber' : 'red';
  const label = starting ? 'Starting' : isReady && !isClassifier ? 'AI ready' : isClassifier ? 'Limited' : 'AI offline';
  const toneClasses = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  const dotClasses = { emerald: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-red-500' };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`h-9 flex items-center gap-2 px-3 rounded-xl border text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${toneClasses[tone]}`}
      >
        <span className={`w-2 h-2 rounded-full ${dotClasses[tone]} ${starting ? 'animate-pulse' : ''}`} />
        <span className="hidden sm:inline">{loading ? 'Checking AI' : label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="AI model state"
          className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-navy-100 bg-white p-4 shadow-xl shadow-navy-900/10"
        >
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClasses[tone]}`}>
              <BrainCircuit className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-navy-800">Model pulse</p>
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  aria-label="Refresh AI status"
                  className="p-1.5 rounded-lg text-navy-400 hover:text-navy-700 hover:bg-navy-50 disabled:opacity-40"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-xs text-navy-500 mt-0.5 truncate">
                {active?.configured_model || 'No model selected'} · {active?.provider || 'unknown'}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-navy-50/70 p-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-navy-400">Capability</p>
              <p className="mt-1 text-xs font-semibold text-navy-700">
                {isClassifier ? 'Intent classifier' : isReady ? 'Full conversation' : 'Unavailable'}
              </p>
            </div>
            <div className="rounded-xl bg-navy-50/70 p-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-navy-400">Execution</p>
              <p className="mt-1 text-xs font-semibold text-navy-700 truncate">
                {active?.execution_provider || (active?.local ? 'Local runtime' : 'Cloud API')}
              </p>
            </div>
          </div>

          {runtime?.hardware && (
            <div className="mt-3 flex items-start gap-2 text-xs text-navy-500">
              <Cpu className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-navy-400" />
              <span>{runtime.hardware.logical_cores} CPU threads · {runtime.hardware.memory_gb} GB RAM · recommends {runtime.hardware.recommended_local_model_size}</span>
            </div>
          )}
          <div className="mt-2 flex items-start gap-2 text-xs text-navy-500">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
            <span>{runtime?.privacy || 'Only bounded LifeSync context is sent to the selected model.'}</span>
          </div>

          {(error || activation?.status === 'error') && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error || activation?.message}</span>
            </div>
          )}
          {starting && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
              <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 animate-spin" />
              <span>{activation?.message || 'Starting the best available model…'}</span>
            </div>
          )}
          {activation?.status === 'ready' && !starting && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{activation.message}</span>
            </div>
          )}

          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-navy-400 mb-2">Choose a model</p>
            <div className="space-y-2">
              {(runtime?.catalog || []).map((m) => {
                const isActive = active?.model_id === m.id;
                const etaText = active?.eta?.human;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onStart(m.id)}
                    disabled={starting}
                    className={`w-full text-left rounded-xl border p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-navy-400/40 disabled:opacity-50 disabled:cursor-wait ${
                      isActive ? 'border-emerald-300 bg-emerald-50/60' : 'border-navy-100 hover:bg-navy-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-navy-800 flex items-center gap-1.5">
                        {m.kind === 'classifier' ? <Cpu className="w-3.5 h-3.5" /> : <BrainCircuit className="w-3.5 h-3.5" />}
                        {m.label}
                        {m.is_default && <span className="text-[10px] font-medium text-navy-400">default</span>}
                      </span>
                      {isActive && (starting
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                        : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />)}
                    </div>
                    <p className="mt-1 text-xs text-navy-500">{m.description}</p>
                    {isActive && etaText && (
                      <p className="mt-1 text-[11px] font-medium text-navy-600">Replies {etaText}</p>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-navy-400">No automatic fallback — if a model can't start, you'll see the error above and stay on your current one.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN CHAT PAGE
// ============================================

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState(null);
  const [sessionId, setSessionId] = useState(() => uuidv4());
  const [sessions, setSessions] = useState([]);
  const [clarificationOptions, setClarificationOptions] = useState(null);
  const [showSessions, setShowSessions] = useState(false);
  const [showModelPulse, setShowModelPulse] = useState(false);
  const [modelRuntime, setModelRuntime] = useState(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState(null);
  const [lastUserText, setLastUserText] = useState(''); // for retry
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const statusTimersRef = useRef([]);

  const clearStatusTimers = useCallback(() => {
    statusTimersRef.current.forEach(clearTimeout);
    statusTimersRef.current = [];
  }, []);

  const loadModelStatus = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setModelLoading(true);
    try {
      const { data } = await aiAPI.getStatus();
      setModelRuntime(data.data?.runtime || null);
      setModelError(null);
    } catch (err) {
      setModelError(err.response?.data?.error || 'Could not read the model state.');
    } finally {
      if (!quiet) setModelLoading(false);
    }
  }, []);

  const startModel = useCallback(async (modelId = 'bert_local') => {
    setModelError(null);
    try {
      const { data } = await aiAPI.start(modelId);
      setModelRuntime((current) => ({
        ...(current || {}),
        activation: data.data?.activation,
      }));
    } catch (err) {
      setModelError(err.response?.data?.error || 'The model could not be started.');
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Load sessions
  useEffect(() => {
    chatAPI.getSessions()
      .then(({ data }) => setSessions(data.data?.sessions || []))
      .catch(() => {});
  }, []);

  // Runtime status on entry, then short polling only while a model is starting.
  useEffect(() => {
    loadModelStatus();
  }, [loadModelStatus]);

  useEffect(() => {
    if (modelRuntime?.activation?.status !== 'starting') return undefined;
    const timer = setInterval(() => loadModelStatus({ quiet: true }), 2000);
    return () => clearInterval(timer);
  }, [modelRuntime?.activation?.status, loadModelStatus]);

  // Firebase real-time subscription
  useEffect(() => {
    const unsubscribe = subscribeToChatSession(sessionId, (fbMessages) => {
      if (messages.length === 0 && fbMessages.length > 0) {
        setMessages(fbMessages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })));
      }
    });
    return () => unsubscribe();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Send Message via SSE ───
  const sendMessage = useCallback((text) => {
    const messageText = text || input.trim();
    if (!messageText || sending) return;

    setInput('');
    setClarificationOptions(null);
    setStatusText(null);
    setLastUserText(messageText);

    // Add user message to UI immediately
    const userMsg = { id: Date.now(), role: 'user', content: messageText };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    clearStatusTimers();

    statusTimersRef.current = [
      setTimeout(() => {
        setStatusText((current) => (
          current === 'Logging your entries...'
            ? current
            : 'Local Gemma is checking this on your device...'
        ));
      }, 15000),
      setTimeout(() => {
        setStatusText((current) => (
          current === 'Logging your entries...'
            ? current
            : 'This is taking longer than usual. The app will stay usable if you need to retry.'
        ));
      }, 35000),
    ];

    const abort = chatAPI.sendMessageStream(messageText, sessionId, {
      onAck: (data) => {
        if (data.session_id && data.session_id !== sessionId) {
          setSessionId(data.session_id);
        }
        setStatusText('Processing your message...');
      },

      onStatus: (data) => {
        setStatusText(data.message || 'Processing...');
      },

      onComplete: (result) => {
        const assistantMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: result.response,
          entities: result.entities_logged,
          domain: result.domain,
          isCrossDomain: result.is_cross_domain,
          needsClarification: result.needs_clarification,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (result.model_runtime) {
          setModelRuntime((current) => current ? ({
            ...current,
            active: {
              ...current.active,
              provider: result.model_runtime.provider || current.active?.provider,
              configured_model: result.model_runtime.model || current.active?.configured_model,
              status: result.model_runtime.status === 'deterministic_fallback' ? 'unreachable' : 'ready',
            },
          }) : current);
        }

        if (result.needs_clarification && result.clarification_options) {
          setClarificationOptions(result.clarification_options);
        }

        if (result.session_id && result.session_id !== sessionId) {
          setSessionId(result.session_id);
        }

        clearStatusTimers();
        setSending(false);
        setStatusText(null);
        inputRef.current?.focus();
      },

      onError: (data) => {
        const errorMsg = {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.message || 'Something went wrong. Please try again.',
          isError: true,
          retryable: data.retryable !== false,
          originalText: messageText,
        };
        setMessages((prev) => [...prev, errorMsg]);
        clearStatusTimers();
        setSending(false);
        setStatusText(null);
        inputRef.current?.focus();
      },
    });

    abortRef.current = abort;
  }, [clearStatusTimers, input, sending, sessionId]);

  // Cleanup abort on unmount or session switch
  useEffect(() => {
    return () => {
      clearStatusTimers();
      if (abortRef.current) abortRef.current();
    };
  }, [clearStatusTimers]);

  // ─── Retry failed message ───
  const handleRetry = useCallback((originalText) => {
    if (!originalText || sending) return;
    // Remove the error message
    setMessages((prev) => prev.filter((m) => !m.isError));
    sendMessage(originalText);
  }, [sending, sendMessage]);

  // ─── Quick Action ───
  const handleQuickAction = (option) => sendMessage(option);

  // ─── New Session ───
  const startNewSession = () => {
    if (abortRef.current) abortRef.current();
    clearStatusTimers();
    setMessages([]);
    setSessionId(uuidv4());
    setClarificationOptions(null);
    setStatusText(null);
    setShowSessions(false);
  };

  // ─── Load Session ───
  const loadSession = async (sid) => {
    if (abortRef.current) abortRef.current();
    clearStatusTimers();
    setSessionId(sid);
    setClarificationOptions(null);
    setStatusText(null);
    setShowSessions(false);
    try {
      const { data } = await chatAPI.getHistory({ session_id: sid });
      setMessages((data.data?.messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.message,
      })));
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* ─── Sessions Sidebar (Desktop) ─── */}
      <aside className={`
        ${showSessions ? 'block' : 'hidden'} lg:flex
        w-64 border-r border-navy-100 bg-white flex-shrink-0 flex-col min-h-0
        fixed lg:static inset-y-0 left-0 z-30
      `}>
        <div className="p-4 border-b border-navy-50">
          <button
            onClick={startNewSession}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-50 text-emerald-600 font-medium text-sm hover:bg-emerald-100 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {sessions.map((s) => (
            <SessionItem
              key={s.session_id}
              session={s}
              isActive={s.session_id === sessionId}
              onClick={() => loadSession(s.session_id)}
            />
          ))}
          {sessions.length === 0 && (
            <p className="text-center text-navy-400 text-xs py-8">No previous chats</p>
          )}
        </div>
      </aside>

      {/* ─── Chat Area ─── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-navy-100 bg-white flex-shrink-0">
          <button onClick={() => setShowSessions(!showSessions)} className="lg:hidden p-1.5 rounded-lg hover:bg-navy-50 text-navy-500">
            <MessageCircle className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-base font-bold text-navy-800">LifeSync Assistant</h2>
            <p className="text-[11px] text-navy-400">Track health &amp; finances through conversation</p>
          </div>

          <ModelPulse
            runtime={modelRuntime}
            loading={modelLoading}
            starting={modelRuntime?.activation?.status === 'starting'}
            error={modelError}
            isOpen={showModelPulse}
            onToggle={() => setShowModelPulse((value) => !value)}
            onRefresh={() => loadModelStatus()}
            onStart={startModel}
          />
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-surface min-h-0">
          {messages.length === 0 ? (
            <WelcomeScreen onSend={sendMessage} />
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id}>
                  <ChatBubble message={msg} onRetry={handleRetry} />
                  {msg.entities && (
                    <div className="mt-2">
                      <EntitiesBadge entities={msg.entities} />
                    </div>
                  )}
                </div>
              ))}

              {/* Clarification Quick Actions */}
              {clarificationOptions && !sending && (
                <ClarificationButtons
                  options={clarificationOptions}
                  onSelect={handleQuickAction}
                  disabled={sending}
                />
              )}

              {sending && <TypingIndicator statusText={statusText} />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-6 py-3 bg-white border-t border-navy-100 flex-shrink-0">
          <div className="flex items-end gap-3 max-w-3xl mx-auto">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tell me about your day..."
                rows={1}
                className="w-full px-4 py-3 pr-12 rounded-2xl border border-navy-200 bg-surface text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 resize-none text-sm transition-all"
                style={{ minHeight: '44px', maxHeight: '120px' }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                }}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="w-11 h-11 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white flex items-center justify-center hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 flex-shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
