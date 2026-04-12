// src/pages/ChatPage.jsx
// ============================================
// Cross-Domain Chat — Health + Finance in one conversation
// Features: SSE streaming, domain indicators, entity badges,
//           retry on error, animated transitions, status stages
// ============================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { chatAPI } from '../services/api';
import { getAssistantMessageContent } from '../utils/chatResponse';
import { subscribeToChatSession } from '../services/firebase';
import {
  Send, Loader2, Sparkles, Plus, Clock, MessageCircle,
  Heart, Wallet, Link2, RotateCcw, AlertCircle, Zap,
  ArrowRight, TrendingUp, Activity,
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
        {health.map((e, i) => {
          const displayValue = typeof e.value === 'number'
            ? e.value.toLocaleString()
            : (e.value || '');
          const unitLabels = {
            steps: 'steps', hours: 'hrs', rating: '/10',
            kcal: 'kcal', liters: 'L', minutes: 'min', bpm: 'bpm',
          };
          const unitLabel = unitLabels[e.unit] || (e.unit || '');
          return (
            <span
              key={`h-${i}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-medium text-emerald-700 shadow-sm animate-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <Heart className="w-3 h-3 text-emerald-500" />
              {displayValue}{unitLabel ? ' ' + unitLabel : ''} {e.type}
            </span>
          );
        })}
        {finance.map((e, i) => {
          const displayAmount = typeof e.amount === 'number'
            ? e.amount % 1 === 0 ? `$${e.amount}` : `$${e.amount.toFixed(2)}`
            : `$${e.amount}`;
          return (
            <span
              key={`f-${i}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-100 text-xs font-medium text-blue-700 shadow-sm animate-fade-up"
              style={{ animationDelay: `${(health.length + i) * 80}ms` }}
            >
              <Wallet className="w-3 h-3 text-blue-500" />
              {displayAmount} {e.type}
            </span>
          );
        })}
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

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : ''} animate-fade-up`}>
      {!isUser && (
        <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${
          isError ? 'from-red-200 to-red-300' : 'from-navy-200 to-navy-300'
        } flex items-center justify-center flex-shrink-0`}>
          {isError ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-600" />
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
              ? 'chat-bubble-assistant border border-red-200 bg-red-50/80'
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
          <button
            onClick={() => onRetry(message.originalText)}
            className="flex items-center gap-1.5 mt-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Tap to retry
          </button>
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
  const preview = session.preview
    ? session.preview.length > 38 ? session.preview.slice(0, 38) + '…' : session.preview
    : `${session.message_count} messages`;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all ${
        isActive ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-navy-600 hover:bg-navy-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
        <span className="truncate text-xs font-medium">{preview}</span>
      </div>
      <p className="text-[11px] text-navy-400 mt-0.5 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {new Date(session.last_message_at || session.started_at).toLocaleDateString()}
        <span className="ml-auto">{session.message_count} msgs</span>
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
  const [postLogSuggestions, setPostLogSuggestions] = useState(null);
  const [showSessions, setShowSessions] = useState(false);
  const [lastUserText, setLastUserText] = useState(''); // for retry
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

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
    setPostLogSuggestions(null);
    setStatusText(null);
    setLastUserText(messageText);

    // Add user message to UI immediately
    const userMsg = { id: Date.now(), role: 'user', content: messageText };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

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
          content: getAssistantMessageContent(result),
          entities: result.entities_logged,
          domain: result.domain,
          isCrossDomain: result.is_cross_domain,
          needsClarification: result.needs_clarification,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (result.needs_clarification && result.clarification_options) {
          setClarificationOptions(result.clarification_options);
        } else if (!result.needs_clarification && result.suggestions?.length) {
          setPostLogSuggestions(result.suggestions);
        }

        if (result.session_id && result.session_id !== sessionId) {
          setSessionId(result.session_id);
        }

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
        setSending(false);
        setStatusText(null);
        inputRef.current?.focus();
      },
    });

    abortRef.current = abort;
  }, [input, sending, sessionId]);

  // Cleanup abort on unmount or session switch
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current();
    };
  }, []);

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
    setMessages([]);
    setSessionId(uuidv4());
    setClarificationOptions(null);
    setStatusText(null);
    setShowSessions(false);
  };

  // ─── Load Session ───
  const loadSession = async (sid) => {
    if (abortRef.current) abortRef.current();
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

          {/* Connection status indicator */}
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            sending ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
          }`} title={sending ? 'Processing...' : 'Connected'} />
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

              {/* Post-Log Suggestion Chips */}
              {postLogSuggestions && !clarificationOptions && !sending && (
                <div className="flex items-end gap-2 animate-fade-up">
                  <div className="w-7 h-7" />
                  <div className="flex flex-wrap gap-2 max-w-[75%]">
                    {postLogSuggestions.map((option, i) => (
                      <button
                        key={i}
                        onClick={() => handleQuickAction(option)}
                        className="px-4 py-2 rounded-2xl bg-navy-50 border border-navy-200 text-navy-600 text-xs font-medium hover:bg-navy-100 hover:border-navy-300 transition-all active:scale-[0.97]"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
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
