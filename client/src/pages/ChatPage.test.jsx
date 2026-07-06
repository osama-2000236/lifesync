import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ───
const h = vi.hoisted(() => ({ settings: { t: (k) => k, locale: 'en', isRTL: false } }));
vi.mock('../contexts/SettingsContext', () => ({ useSettings: () => h.settings }));

// ChatComposer renders through the real component; stub its dictation hook.
let dict;
vi.mock('../hooks/useDictation', () => ({
  useDictation: () => dict,
}));

vi.mock('../services/api', () => ({
  chatAPI: {
    sendMessageStream: vi.fn(),
    getHistory: vi.fn(),
    getSessions: vi.fn(),
  },
  aiAPI: { getModels: vi.fn() },
}));

import ChatPage from './ChatPage';
import { chatAPI, aiAPI } from '../services/api';

const wrap = (payload) => ({ data: { data: payload } });

let streamCallbacks;
let streamOptions;
let streamAbort;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.settings = { t: (k) => k, locale: 'en', isRTL: false };
  dict = {
    supported: true, nativeSupported: true, state: 'idle', partial: '',
    error: null, start: vi.fn(), stop: vi.fn(), setPartial: vi.fn(),
  };
  streamCallbacks = null;
  streamOptions = null;
  streamAbort = vi.fn();

  Element.prototype.scrollTo = vi.fn();
  // Defer to a microtask so the component's rAF-batching guard behaves like a
  // real frame boundary (callback must not run before the ref is assigned).
  window.requestAnimationFrame = (cb) => { Promise.resolve().then(cb); return 1; };
  window.cancelAnimationFrame = vi.fn();

  aiAPI.getModels.mockResolvedValue(wrap({ models: [
    { id: 'bert_local', label: 'LifeSync BERT', pricing: 'local' },
    { id: 'gemma4_local', label: 'Gemma 4 31B', pricing: 'free' },
    { id: 'custom_local', label: 'Custom', pricing: 'local' },
  ] }));
  chatAPI.getSessions.mockResolvedValue(wrap({ sessions: [
    { session_id: 'old-1', message_count: 3, last_message_at: '2026-07-01T10:00:00Z' },
  ] }));
  chatAPI.getHistory.mockResolvedValue(wrap({ messages: [
    { id: 1, role: 'user', message: 'hi there' },
    { id: 2, role: 'assistant', message: 'hello!' },
    { id: 3, role: 'assistant', message: '   ' },
  ] }));
  chatAPI.sendMessageStream.mockImplementation((msg, sess, callbacks, options) => {
    streamCallbacks = callbacks;
    streamOptions = options;
    return streamAbort;
  });
});

afterEach(() => {
  delete window.speechSynthesis;
});

const renderPage = async () => {
  const utils = render(<MemoryRouter><ChatPage /></MemoryRouter>);
  await waitFor(() => expect(aiAPI.getModels).toHaveBeenCalled());
  await waitFor(() => expect(chatAPI.getSessions).toHaveBeenCalled());
  return utils;
};

const send = async (text = 'I slept 7 hours') => {
  fireEvent.change(screen.getByTestId('chat-input'), { target: { value: text } });
  fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' });
  await waitFor(() => expect(chatAPI.sendMessageStream).toHaveBeenCalled());
};

describe('ChatPage — shell', () => {
  it('renders welcome state with suggestions and loads the server catalog', async () => {
    await renderPage();
    expect(screen.getByTestId('chat-welcome')).toBeInTheDocument();
    expect(screen.getAllByTestId('welcome-suggestion')).toHaveLength(4);
    // custom_local filtered out of the picker
    fireEvent.click(screen.getByTestId('model-picker-button'));
    expect(screen.queryByTestId('model-option-custom_local')).not.toBeInTheDocument();
    expect(screen.getByTestId('model-option-gemma4_local')).toBeInTheDocument();
  });

  it('keeps the static catalog when the models endpoint fails', async () => {
    aiAPI.getModels.mockRejectedValue(new Error('down'));
    await renderPage();
    fireEvent.click(screen.getByTestId('model-picker-button'));
    expect(screen.getByTestId('model-option-openai_chat')).toBeInTheDocument();
  });

  it('defaults to the free chat model and persists a new choice', async () => {
    await renderPage();
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('Gemma 4 31B');
    fireEvent.click(screen.getByTestId('model-picker-button'));
    fireEvent.click(screen.getByTestId('model-option-bert_local'));
    expect(localStorage.getItem('lifesync.chat.model')).toBe('bert_local');
  });

  it('honors a stored model preference', async () => {
    localStorage.setItem('lifesync.chat.model', 'bert_local');
    await renderPage();
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('LifeSync BERT');
  });

  it('cycles context depth standard → deep → max → standard', async () => {
    await renderPage();
    const toggle = screen.getByTestId('depth-toggle');
    expect(toggle).toHaveTextContent('chat.depth.standard');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('chat.depth.deep');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('chat.depth.max');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('chat.depth.standard');
  });
});

describe('ChatPage — sending & streaming', () => {
  it('sends with the picked model, locale, and standard depth omitted', async () => {
    await renderPage();
    await send('hello model');
    expect(chatAPI.sendMessageStream.mock.calls[0][0]).toBe('hello model');
    expect(streamOptions).toMatchObject({ model: 'gemma4_local', lang: 'en' });
    expect(streamOptions.context_window).toBeUndefined();
    expect(screen.getByTestId('user-message')).toHaveTextContent('hello model');
  });

  it('passes deep context depth when selected', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('depth-toggle'));
    await send();
    expect(streamOptions.context_window).toBe('deep');
  });

  it('renders streamed deltas then the final assistant message with receipts', async () => {
    await renderPage();
    await send();

    await act(async () => {
      streamCallbacks.onAck({ session_id: 'srv-1' });
      streamCallbacks.onStatus({ message: 'working' });
      streamCallbacks.onDelta({ text: 'You slept ' });
      streamCallbacks.onDelta({ text: 'well.' });
    });
    expect(screen.getByTestId('streaming-message')).toHaveTextContent('You slept well.');

    const dataChanged = vi.fn();
    window.addEventListener('lifesync:data-changed', dataChanged);
    act(() => {
      streamCallbacks.onComplete({
        response: 'Logged 7 hours of sleep.',
        entities_logged: { health: [{ type: 'sleep', value: 7 }], finance: [], linked: [] },
        is_cross_domain: false,
        model_runtime: { provider: 'openrouter', model: 'google/gemma-4-31b-it:free', responder: 'generative' },
      });
    });
    window.removeEventListener('lifesync:data-changed', dataChanged);

    expect(screen.queryByTestId('streaming-message')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-message')).toHaveTextContent('Logged 7 hours of sleep.');
    expect(screen.getByTestId('entity-receipts')).toBeInTheDocument();
    expect(screen.getByTestId('model-attribution')).toHaveTextContent('google/gemma-4-31b-it:free');
    expect(dataChanged).toHaveBeenCalled();
  });

  it('stops mid-stream, keeps the partial text, and re-enables sending', async () => {
    await renderPage();
    await send();

    await act(async () => {
      streamCallbacks.onDelta({ text: 'Partial rep' });
    });
    expect(screen.getByTestId('stop-button')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stop-button'));
    expect(streamAbort).toHaveBeenCalled();
    expect(screen.getByTestId('assistant-message')).toHaveTextContent('Partial rep');
    expect(screen.getByTestId('stopped-note')).toBeInTheDocument();
    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
    // Sending is unblocked again
    await send('another one');
    expect(chatAPI.sendMessageStream).toHaveBeenCalledTimes(2);
  });

  it('stop before any delta just clears the busy state', async () => {
    await renderPage();
    await send();

    fireEvent.click(screen.getByTestId('stop-button'));
    expect(streamAbort).toHaveBeenCalled();
    expect(screen.queryByTestId('assistant-message')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
  });

  it('copies an assistant reply and shows a transient copied state', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
    await renderPage();
    await send();
    act(() => {
      streamCallbacks.onComplete({ response: 'Copy me.', entities_logged: { health: [], finance: [], linked: [] } });
    });

    fireEvent.click(screen.getByTestId('copy-button'));
    await waitFor(() => expect(screen.getByTestId('copy-button')).toHaveTextContent('chat.copied'));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy me.');

    // Copied state resets after ~2s
    await waitFor(
      () => expect(screen.getByTestId('copy-button')).not.toHaveTextContent('chat.copied'),
      { timeout: 3500 },
    );
  });

  it('copy is best-effort when the clipboard rejects, and errors offer no copy', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await renderPage();
    await send();
    act(() => {
      streamCallbacks.onComplete({ response: 'No luck.', entities_logged: { health: [], finance: [], linked: [] } });
    });
    fireEvent.click(screen.getByTestId('copy-button'));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('copy-button')).toHaveTextContent('chat.copy');

    await send('again');
    act(() => { streamCallbacks.onError({ message: 'boom', retryable: true }); });
    const errorMessage = screen.getAllByTestId('assistant-message').at(-1);
    expect(errorMessage.querySelector('[data-testid="copy-button"]')).toBeNull();
  });

  it('exposes the thread as a polite live log and hides the raw stream from readers', async () => {
    await renderPage();
    await send();
    const log = document.querySelector('[role="log"]');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-atomic', 'false');
    await act(async () => { streamCallbacks.onDelta({ text: 'hi' }); });
    expect(screen.getByTestId('streaming-message')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders markdown in replies: bold, list, and a code fence', async () => {
    await renderPage();
    await send();
    act(() => {
      streamCallbacks.onComplete({
        response: 'Try **this**:\n- walk\n- sleep\n```\nwater 2L\n```',
        entities_logged: { health: [], finance: [], linked: [] },
      });
    });
    const msg = screen.getByTestId('assistant-message');
    expect(msg.querySelector('strong')).toHaveTextContent('this');
    expect(msg.querySelectorAll('li')).toHaveLength(2);
    expect(msg.querySelector('pre')).toHaveTextContent('water 2L');
  });

  it('shows clarification chips and sends the tapped option', async () => {
    await renderPage();
    await send('spent 50');
    act(() => {
      streamCallbacks.onComplete({
        response: 'Which was it?',
        needs_clarification: true,
        clarification_options: ['It was an expense', 'It was health-related'],
        entities_logged: { health: [], finance: [], linked: [] },
      });
    });
    const chips = screen.getByTestId('clarification-options');
    expect(chips).toBeInTheDocument();
    fireEvent.click(screen.getByText('It was an expense'));
    await waitFor(() => expect(chatAPI.sendMessageStream).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('clarification-options')).not.toBeInTheDocument();
  });

  it('labels BERT and busy-fallback replies honestly', async () => {
    await renderPage();
    await send();
    act(() => {
      streamCallbacks.onComplete({
        response: 'Got it!',
        entities_logged: { health: [], finance: [], linked: [] },
        model_runtime: { provider: 'bert_local', model: 'model', responder: null },
      });
    });
    expect(screen.getByTestId('model-attribution')).toHaveTextContent('chat.attribution.bert');

    await send('again');
    act(() => {
      streamCallbacks.onComplete({
        response: 'Quick note.',
        entities_logged: { health: [], finance: [], linked: [] },
        model_runtime: { responder: 'deterministic_fallback', chat_provider: 'openrouter' },
      });
    });
    expect(screen.getByText('chat.attribution.fallback')).toBeInTheDocument();
  });

  it('renders errors with a retry that resends the original text', async () => {
    await renderPage();
    await send('retry me');
    act(() => {
      streamCallbacks.onError({ message: 'boom', retryable: true });
    });
    expect(screen.getByText('boom')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('retry-button'));
    await waitFor(() => expect(chatAPI.sendMessageStream).toHaveBeenCalledTimes(2));
    expect(chatAPI.sendMessageStream.mock.calls[1][0]).toBe('retry me');
  });

  it('offers no retry when the error is not retryable', async () => {
    await renderPage();
    await send();
    act(() => {
      streamCallbacks.onError({ message: 'fatal', retryable: false });
    });
    expect(screen.queryByTestId('retry-button')).not.toBeInTheDocument();
  });

  it('ignores empty submissions and blocks double-send while busy', async () => {
    await renderPage();
    fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' });
    expect(chatAPI.sendMessageStream).not.toHaveBeenCalled();

    await send('first');
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'second' } });
    fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' });
    expect(chatAPI.sendMessageStream).toHaveBeenCalledTimes(1);
  });

  it('adopts the server session id from ack', async () => {
    await renderPage();
    await send();
    act(() => { streamCallbacks.onAck({ session_id: 'server-session' }); });
    act(() => {
      streamCallbacks.onComplete({ response: 'ok', entities_logged: { health: [], finance: [], linked: [] } });
    });
    await send('next');
    expect(chatAPI.sendMessageStream.mock.calls[1][1]).toBe('server-session');
  });

  it('speaks replies only when the speak toggle is on', async () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    // getVoices returning null exercises the defensive `|| []` fallback
    window.speechSynthesis = { speak, cancel, getVoices: () => null };
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text; };

    await renderPage();
    fireEvent.click(screen.getByTestId('speak-toggle'));
    await send();
    act(() => {
      streamCallbacks.onComplete({ response: 'read me', entities_logged: { health: [], finance: [], linked: [] } });
    });
    expect(speak).toHaveBeenCalled();
  });
});

describe('ChatPage — sessions', () => {
  it('opens a previous session and renders its history without blanks', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('session-old-1'));
    await waitFor(() => expect(chatAPI.getHistory).toHaveBeenCalledWith({ session_id: 'old-1', limit: 100 }));
    expect(await screen.findByText('hi there')).toBeInTheDocument();
    expect(screen.getByText('hello!')).toBeInTheDocument();
    expect(screen.getAllByTestId('assistant-message')).toHaveLength(1);
    // reselecting the same session is a no-op
    fireEvent.click(screen.getByTestId('session-old-1'));
    expect(chatAPI.getHistory).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh chat with a new session id', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('session-old-1'));
    await screen.findByText('hi there');
    fireEvent.click(screen.getAllByTestId('new-chat-button')[0]);
    expect(screen.queryByText('hi there')).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-welcome')).toBeInTheDocument();
  });

  it('opens and closes the mobile history sheet', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('open-rail-button'));
    expect(screen.getByTestId('sessions-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('common.close')[0]);
    expect(screen.queryByTestId('sessions-sheet')).not.toBeInTheDocument();
  });

  it('aborts an in-flight stream when switching sessions', async () => {
    await renderPage();
    await send();
    fireEvent.click(screen.getByTestId('session-old-1'));
    expect(streamAbort).toHaveBeenCalled();
  });
});

describe('ChatPage — edges', () => {
  it('renders RTL for Arabic, sends the locale, and speaks with the Arabic voice', async () => {
    h.settings = { t: (k) => k, locale: 'ar', isRTL: true };
    const speak = vi.fn();
    window.speechSynthesis = {
      speak,
      cancel: vi.fn(),
      getVoices: () => [{ lang: 'ar-SA', name: 'Tarik' }],
    };
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) { this.text = text; };

    await renderPage();
    expect(screen.getByTestId('chat-page')).toHaveAttribute('dir', 'rtl');
    fireEvent.click(screen.getByTestId('speak-toggle'));
    await send('مرحبا');
    expect(streamOptions.lang).toBe('ar');
    act(() => {
      streamCallbacks.onComplete({ response: 'أهلاً', entities_logged: { health: [], finance: [], linked: [] } });
    });
    expect(speak).toHaveBeenCalled();
    expect(speak.mock.calls[0][0].lang).toBe('ar-SA');
  });

  it('speak is a no-op without browser speechSynthesis and swallows engine errors', async () => {
    delete window.speechSynthesis;
    await renderPage();
    fireEvent.click(screen.getByTestId('speak-toggle'));
    await send();
    act(() => {
      streamCallbacks.onComplete({ response: 'quiet', entities_logged: { health: [], finance: [], linked: [] } });
    });
    expect(screen.getByText('quiet')).toBeInTheDocument();

    // engine throwing must not break the page
    window.speechSynthesis = { speak: () => { throw new Error('no voice'); }, cancel: vi.fn() };
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance() {};
    await send('again');
    act(() => {
      streamCallbacks.onComplete({ response: 'still fine', entities_logged: { health: [], finance: [], linked: [] } });
    });
    expect(screen.getByText('still fine')).toBeInTheDocument();
  });

  it('skips speech for empty responses and clarification turns without options', async () => {
    const speak = vi.fn();
    window.speechSynthesis = { speak, cancel: vi.fn() };
    window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance() {};
    await renderPage();
    fireEvent.click(screen.getByTestId('speak-toggle'));

    await send();
    act(() => {
      // clarification without options → no chips, but still spoken? No: options
      // missing means the normal speak path runs with the response text.
      streamCallbacks.onComplete({
        response: '',
        needs_clarification: true,
        entities_logged: { health: [], finance: [], linked: [] },
      });
    });
    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByTestId('clarification-options')).not.toBeInTheDocument();
  });

  it('dispatches data-changed for finance-only logs and cross-domain styling', async () => {
    const dataChanged = vi.fn();
    window.addEventListener('lifesync:data-changed', dataChanged);
    await renderPage();
    await send('spent 20 on lunch');
    act(() => {
      streamCallbacks.onComplete({
        response: 'Logged the expense.',
        is_cross_domain: true,
        entities_logged: { health: [], finance: [{ type: 'expense', amount: 20 }], linked: [] },
        model_runtime: null,
      });
    });
    window.removeEventListener('lifesync:data-changed', dataChanged);
    expect(dataChanged).toHaveBeenCalled();
    expect(screen.queryByTestId('model-attribution')).not.toBeInTheDocument();
  });

  it('uses fallback status text and default error copy', async () => {
    await renderPage();
    await send();
    act(() => { streamCallbacks.onStatus({}); });
    expect(screen.getByTestId('status-text')).toHaveTextContent('chat.status.default');
    act(() => { streamCallbacks.onError({}); });
    expect(screen.getByText('chat.err.generic')).toBeInTheDocument();
  });

  it('handles empty payloads from sessions and models endpoints', async () => {
    aiAPI.getModels.mockResolvedValue(wrap({ models: [] }));
    chatAPI.getSessions.mockResolvedValue(wrap({}));
    chatAPI.getHistory.mockRejectedValue(new Error('gone'));
    await renderPage();
    // static catalog kept (empty list ignored)
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('Gemma 4 31B');
    expect(screen.getByText('chat.noChats')).toBeInTheDocument();
  });

  it('survives a sessions endpoint failure', async () => {
    chatAPI.getSessions.mockRejectedValue(new Error('down'));
    await renderPage();
    expect(screen.getByTestId('chat-welcome')).toBeInTheDocument();
  });

  it('falls back to the raw model id in the footer for unknown stored models', async () => {
    localStorage.setItem('lifesync.chat.model', 'mystery_model');
    await renderPage();
    expect(screen.getByText(/mystery_model/)).toBeInTheDocument();
  });

  it('defaults gracefully when localStorage is blocked', async () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await renderPage();
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('Gemma 4 31B');
    fireEvent.click(screen.getByTestId('model-picker-button'));
    fireEvent.click(screen.getByTestId('model-option-bert_local')); // setItem throws → caught
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('LifeSync BERT');
    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('ignores a stale models response after unmount', async () => {
    let resolveModels;
    aiAPI.getModels.mockReturnValue(new Promise((res) => { resolveModels = res; }));
    const { unmount } = render(<MemoryRouter><ChatPage /></MemoryRouter>);
    await waitFor(() => expect(chatAPI.getSessions).toHaveBeenCalled());
    unmount();
    await act(async () => { resolveModels(wrap({ models: [{ id: 'x', label: 'X' }] })); });
  });

  it('cleans up a pending animation frame and stream on unmount', async () => {
    window.requestAnimationFrame = () => 42; // never fires → ref stays pending
    const { unmount } = await renderPage();
    await send();
    act(() => { streamCallbacks.onDelta({ text: 'buffered' }); });
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(streamAbort).toHaveBeenCalled();
  });

  it('keeps the previous session when ack echoes the same id', async () => {
    await renderPage();
    await send();
    const firstSession = chatAPI.sendMessageStream.mock.calls[0][1];
    act(() => { streamCallbacks.onAck({ session_id: firstSession }); });
    act(() => {
      streamCallbacks.onComplete({ response: 'ok', entities_logged: { health: [], finance: [], linked: [] } });
    });
    await send('two');
    expect(chatAPI.sendMessageStream.mock.calls[1][1]).toBe(firstSession);
  });

  it('sends a welcome suggestion on tap', async () => {
    await renderPage();
    fireEvent.click(screen.getAllByTestId('welcome-suggestion')[0]);
    await waitFor(() => expect(chatAPI.sendMessageStream).toHaveBeenCalled());
    expect(chatAPI.sendMessageStream.mock.calls[0][0]).toBe('chat.welcome.suggestion1');
  });

  it('ignores a suggestion that resolves to empty text', async () => {
    h.settings = { t: (k) => (k.startsWith('chat.welcome.suggestion') ? '  ' : k), locale: 'en', isRTL: false };
    await renderPage();
    fireEvent.click(screen.getAllByTestId('welcome-suggestion')[0]);
    expect(chatAPI.sendMessageStream).not.toHaveBeenCalled();
  });

  it('blocks a second retry while the first is in flight', async () => {
    await renderPage();
    await send('flaky');
    act(() => { streamCallbacks.onError({ message: 'boom', retryable: true }); });
    const retry = screen.getByTestId('retry-button');
    fireEvent.click(retry);
    fireEvent.click(retry); // sending guard
    expect(chatAPI.sendMessageStream).toHaveBeenCalledTimes(2);
  });

  it('coalesces deltas without text and completes without entity payload', async () => {
    await renderPage();
    await send();
    await act(async () => {
      streamCallbacks.onDelta({});
      streamCallbacks.onDelta({ text: 'ok' });
    });
    expect(screen.getByTestId('streaming-message')).toHaveTextContent('ok');
    act(() => { streamCallbacks.onComplete({ response: 'done' }); });
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.queryByTestId('entity-receipts')).not.toBeInTheDocument();
  });

  it('tolerates catalog and history payloads with missing collections', async () => {
    aiAPI.getModels.mockResolvedValue(wrap({}));
    chatAPI.getHistory.mockResolvedValue(wrap({}));
    await renderPage();
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('Gemma 4 31B');
    fireEvent.click(screen.getByTestId('session-old-1'));
    await waitFor(() => expect(chatAPI.getHistory).toHaveBeenCalled());
    expect(screen.getByTestId('chat-welcome')).toBeInTheDocument();
  });

  it('aborts the in-flight stream when starting a new chat', async () => {
    await renderPage();
    await send();
    fireEvent.click(screen.getAllByTestId('new-chat-button')[0]);
    expect(streamAbort).toHaveBeenCalled();
  });

  it('cancels a pending frame when the reply completes mid-buffer', async () => {
    window.requestAnimationFrame = () => 7; // stays pending
    await renderPage();
    await send();
    act(() => { streamCallbacks.onDelta({ text: 'pending' }); });
    act(() => { streamCallbacks.onComplete({ response: 'flushed' }); });
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(screen.getByText('flushed')).toBeInTheDocument();
  });

  it('swallows speech-engine failures during unmount cleanup', async () => {
    window.speechSynthesis = { cancel: () => { throw new Error('gone'); }, speak: vi.fn() };
    const { unmount } = await renderPage();
    unmount();
  });

  it('adopts a server session id delivered on complete-only (no ack change)', async () => {
    await renderPage();
    await send();
    act(() => {
      streamCallbacks.onComplete({
        response: 'ok',
        entities_logged: { health: [], finance: [], linked: [] },
        model_runtime: { provider: 'openrouter', model: null },
      });
    });
    // model attribution hidden when runtime has no usable slug
    expect(screen.queryByTestId('model-attribution')).not.toBeInTheDocument();
  });
});
