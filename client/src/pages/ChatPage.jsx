// src/pages/ChatPage.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { chatAPI } from '../services/api';
import { subscribeToChatSession } from '../services/firebase';
import { Send, Loader2, Sparkles, Plus, Clock, MessageCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// ─── Typing Indicator ───
function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 max-w-[80%]">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-navy-200 to-navy-300 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-navy-600" />
      </div>
      <div className="chat-bubble-assistant px-5 py-3.5">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-navy-400 typing-dot" />
          <div className="w-2 h-2 rounded-full bg-navy-400 typing-dot" />
          <div className="w-2 h-2 rounded-full bg-navy-400 typing-dot" />
        </div>
      </div>
    </div>
  );
}

// ─── Single Message Bubble ───
function ChatBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : ''} animate-fade-up`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-navy-200 to-navy-300 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-navy-600" />
        </div>
      )}
      <div className={`max-w-[75%] px-4 py-3 text-sm leading-relaxed ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
        {message.content}
      </div>
    </div>
  );
}

// ─── Clarification Quick-Action Buttons ───
function ClarificationButtons({ options, onSelect, disabled }) {
  if (!options || options.length === 0) return null;

  return (
    <div className="flex items-end gap-2 animate-fade-up">
      <div className="w-7 h-7" /> {/* Spacer to align with bot avatar */}
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

// ─── Logged Entities Badge ───
function EntitiesBadge({ entities }) {
  if (!entities) return null;
  const { health = [], finance = [], linked = [] } = entities;
  if (health.length === 0 && finance.length === 0) return null;

  return (
    <div className="flex items-end gap-2 animate-fade-up">
      <div className="w-7 h-7" />
      <div className="flex flex-wrap gap-2">
        {health.map((e, i) => (
          <span key={`h-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-xs font-medium text-emerald-700">
            ❤️ {e.type}: {e.value}
          </span>
        ))}
        {finance.map((e, i) => (
          <span key={`f-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs font-medium text-blue-700">
            💰 {e.type}: ${e.amount}
          </span>
        ))}
        {linked.length > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-purple-50 border border-purple-100 text-xs font-medium text-purple-700">
            🔗 Cross-linked
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Session Sidebar Item ───
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

// ============================================
// MAIN CHAT PAGE
// ============================================

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(() => uuidv4());
  const [sessions, setSessions] = useState([]);
  const [clarificationOptions, setClarificationOptions] = useState(null);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
      // Only use Firebase if we have no local messages (real-time sync for other devices)
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

  // ─── Send Message ───
  const sendMessage = useCallback(async (text) => {
    const messageText = text || input.trim();
    if (!messageText || sending) return;

    setInput('');
    setClarificationOptions(null);

    // Add user message
    const userMsg = { id: Date.now(), role: 'user', content: messageText };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const { data } = await chatAPI.sendMessage(messageText, sessionId);
      const result = data.data;

      // Update session ID if server assigned one
      if (result.session_id && result.session_id !== sessionId) {
        setSessionId(result.session_id);
      }

      // Add assistant response
      const assistantMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.response,
        entities: result.entities_logged,
        needsClarification: result.needs_clarification,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Set clarification options if needed
      if (result.needs_clarification && result.clarification_options) {
        setClarificationOptions(result.clarification_options);
      }
    } catch (err) {
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: err.response?.data?.message || 'Something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, sessionId]);

  // ─── Handle Quick Action ───
  const handleQuickAction = (option) => {
    sendMessage(option);
  };

  // ─── New Session ───
  const startNewSession = () => {
    setMessages([]);
    setSessionId(uuidv4());
    setClarificationOptions(null);
    setShowSessions(false);
  };

  // ─── Load Session ───
  const loadSession = async (sid) => {
    setSessionId(sid);
    setClarificationOptions(null);
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
    <div className="flex h-full">
      {/* ─── Sessions Sidebar (Desktop) ─── */}
      <aside className={`
        ${showSessions ? 'block' : 'hidden'} lg:block
        w-64 border-r border-navy-100 bg-white flex-shrink-0 flex flex-col
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
      <div className="flex-1 flex flex-col">
        {/* Chat Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-navy-100 bg-white">
          <button onClick={() => setShowSessions(!showSessions)} className="lg:hidden p-1.5 rounded-lg hover:bg-navy-50 text-navy-500">
            <MessageCircle className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-navy-800">LifeSync Assistant</h2>
            <p className="text-[11px] text-navy-400">Track health & finances through conversation</p>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-surface">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="font-display text-lg font-bold text-navy-800 mb-2">Welcome to LifeSync!</h3>
              <p className="text-navy-500 text-sm max-w-sm mb-6">
                Tell me about your day — spending, exercise, sleep, mood — and I&apos;ll track everything for you.
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {[
                  'I walked 8000 steps today',
                  'Spent $15 on lunch',
                  'Slept 7 hours last night',
                  'Feeling great, mood 8/10',
                  'Spent $50 on a healthy dinner',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className="px-4 py-2 rounded-2xl bg-white border border-navy-100 text-navy-600 text-sm hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <ChatBubble message={msg} />
              {msg.entities && <div className="mt-2"><EntitiesBadge entities={msg.entities} /></div>}
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

          {sending && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-6 py-4 bg-white border-t border-navy-100">
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
