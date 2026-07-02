import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───
const h = vi.hoisted(() => ({ settings: { t: (k) => k, locale: 'en', isRTL: false } }));
vi.mock('../contexts/SettingsContext', () => ({ useSettings: () => h.settings }));

let voiceStub;
let voiceArgs;
vi.mock('../hooks/useVoiceAssistant', () => ({
  useVoiceAssistant: (args) => { voiceArgs = args; return voiceStub; },
}));

vi.mock('../services/api', () => ({
  chatAPI: { sendMessageStream: vi.fn() },
  assistantAPI: { getSuggestion: vi.fn(), startInterview: vi.fn(), answer: vi.fn() },
  voiceAPI: { transcribe: vi.fn() },
}));

import AssistantPage from './AssistantPage';
import { chatAPI, assistantAPI } from '../services/api';

const wrap = (payload) => ({ data: { data: payload } });

beforeEach(() => {
  vi.clearAllMocks();
  h.settings = { t: (k) => k, locale: 'en', isRTL: false };
  voiceStub = {
    state: 'idle', level: 0, transcript: '', error: null,
    start: vi.fn(), stop: vi.fn(), enqueueSpeech: vi.fn(), finishSpeechStream: vi.fn(),
  };
  assistantAPI.getSuggestion.mockResolvedValue(wrap({ topic: null }));
  chatAPI.sendMessageStream.mockReturnValue(vi.fn());
});

const renderPage = async () => {
  const utils = render(<MemoryRouter><AssistantPage /></MemoryRouter>);
  await waitFor(() => expect(assistantAPI.getSuggestion).toHaveBeenCalled());
  return utils;
};

describe('AssistantPage — suggestion flow', () => {
  it('shows idle note when nothing to suggest', async () => {
    await renderPage();
    expect(await screen.findByTestId('idle-note')).toBeInTheDocument();
  });

  it('shows consent card when a topic is suggested', async () => {
    assistantAPI.getSuggestion.mockResolvedValue(wrap({ topic: 'sleep_spending', prompt: 'Ask?', cross_domain: true }));
    await renderPage();
    expect(await screen.findByTestId('consent-card')).toBeInTheDocument();
  });

  it('falls back to idle when getSuggestion throws', async () => {
    assistantAPI.getSuggestion.mockRejectedValue(new Error('down'));
    await renderPage();
    expect(await screen.findByTestId('idle-note')).toBeInTheDocument();
  });

  it('refresh re-requests a suggestion', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('refresh-suggestion'));
    await waitFor(() => expect(assistantAPI.getSuggestion).toHaveBeenCalledTimes(2));
  });
});

describe('AssistantPage — interview flow', () => {
  beforeEach(() => {
    assistantAPI.getSuggestion.mockResolvedValue(wrap({ topic: 'sleep_spending', prompt: 'Ask?', cross_domain: true }));
  });

  it('accept → answer → advice, and notifies the dashboard', async () => {
    assistantAPI.startInterview.mockResolvedValue(wrap({ question: { id: 'q0', step: 0, total: 2, prompt: 'Hours?', input_type: 'number', options: [] } }));
    assistantAPI.answer
      .mockResolvedValueOnce(wrap({ done: false, question: { id: 'q1', step: 1, total: 2, prompt: 'Spend?', input_type: 'number', options: [] } }))
      .mockResolvedValueOnce(wrap({ done: true, advice: { advice: [{ text: 'Sleep more', priority: 'high', domain: 'both' }], scores: { health: 70, financial: 60 } } }));
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-accept'));
    await screen.findByTestId('interview-panel');

    fireEvent.change(screen.getByTestId('number-input'), { target: { value: '7' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    // Wait for the SECOND question to render before answering it (the panel
    // resets its input when the question changes).
    await screen.findByText('Spend?');

    fireEvent.change(screen.getByTestId('number-input'), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    expect(await screen.findByTestId('advice-cards')).toBeInTheDocument();
    expect(screen.getByText('Sleep more')).toBeInTheDocument();
    expect(dispatch).toHaveBeenCalled();
  });

  it('decline → dismissed note', async () => {
    assistantAPI.startInterview.mockResolvedValue(wrap({ dismissed: true }));
    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-decline'));
    expect(await screen.findByTestId('dismissed-note')).toBeInTheDocument();
    expect(assistantAPI.startInterview).toHaveBeenCalledWith('sleep_spending', false, 'en');
  });

  it('decline still dismisses even when the request fails', async () => {
    assistantAPI.startInterview.mockRejectedValue(new Error('offline'));
    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-decline'));
    expect(await screen.findByTestId('dismissed-note')).toBeInTheDocument();
  });

  it('accept error keeps the consent card', async () => {
    assistantAPI.startInterview.mockRejectedValue?.(new Error('x'));
    assistantAPI.startInterview.mockRejectedValue(new Error('x'));
    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-accept'));
    await waitFor(() => expect(assistantAPI.startInterview).toHaveBeenCalled());
    expect(screen.getByTestId('consent-card')).toBeInTheDocument();
  });

  it('answer error keeps the current question', async () => {
    assistantAPI.startInterview.mockResolvedValue(wrap({ question: { id: 'q0', step: 0, total: 2, prompt: 'Hours?', input_type: 'number', options: [] } }));
    assistantAPI.answer.mockRejectedValue(new Error('boom'));
    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-accept'));
    await screen.findByTestId('interview-panel');
    fireEvent.change(screen.getByTestId('number-input'), { target: { value: '7' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    await waitFor(() => expect(assistantAPI.answer).toHaveBeenCalled());
    expect(await screen.findByTestId('interview-panel')).toBeInTheDocument();
  });
});

describe('AssistantPage — converse + dictate', () => {
  it('converse toggle starts the voice loop', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('converse-toggle'));
    expect(voiceStub.start).toHaveBeenCalled();
  });

  it('stops the loop when already talking', async () => {
    voiceStub.state = 'listening';
    voiceStub.transcript = 'live words';
    await renderPage();
    expect(screen.getByText('live words')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('converse-toggle'));
    expect(voiceStub.stop).toHaveBeenCalled();
  });

  it('shows the mic-error phase label', async () => {
    voiceStub.error = 'mic-denied';
    await renderPage();
    expect(screen.getByText('assistant.micError')).toBeInTheDocument();
  });

  it('maps every voice phase to a label', async () => {
    voiceStub.state = 'thinking';
    const { unmount } = await renderPage();
    expect(screen.getByText('va.thinking')).toBeInTheDocument();
    unmount();
    voiceStub = { ...voiceStub, state: 'speaking' };
    const u2 = await renderPage();
    expect(screen.getByText('va.speaking')).toBeInTheDocument();
    u2.unmount();
    voiceStub = { ...voiceStub, state: 'weird' }; // unknown → empty label branch
    await renderPage();
    expect(screen.getByTestId('converse-toggle')).toBeInTheDocument();
  });

  it('toggles back to converse mode', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('mode-dictate'));
    fireEvent.click(screen.getByTestId('mode-converse'));
    expect(screen.getByTestId('converse-toggle')).toBeInTheDocument();
  });

  it('drives a spoken reply through the converse utterance handler', async () => {
    await renderPage();
    // handleUtterance was handed to the mocked hook — call it directly.
    act(() => voiceArgs.onUtterance('how am I doing'));
    expect(chatAPI.sendMessageStream).toHaveBeenCalled();
    const cbs = chatAPI.sendMessageStream.mock.calls[0][2];
    act(() => cbs.onDelta({})); // no text → coalesces to '' (delta.text || '')
    act(() => cbs.onDelta({ text: 'Doing great. ' }));
    act(() => cbs.onDelta({ text: 'Keep going' }));
    act(() => cbs.onComplete({ response: 'ignored', entities_logged: { health: [1], finance: [] } }));
    expect(voiceStub.enqueueSpeech).toHaveBeenCalled();
    expect(voiceStub.finishSpeechStream).toHaveBeenCalled();
    // a second utterance aborts the previous in-flight reply
    act(() => voiceArgs.onUtterance('again'));
    // barge-in aborts in-flight reply
    act(() => voiceArgs.onBargeIn());
  });

  it('converse onComplete uses response when no deltas streamed', async () => {
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    const cbs = chatAPI.sendMessageStream.mock.calls[0][2];
    act(() => cbs.onComplete({ response: 'Full reply.' }));
    expect(screen.getByText('Full reply.')).toBeInTheDocument();
  });

  it('converse onError surfaces a message', async () => {
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    const cbs = chatAPI.sendMessageStream.mock.calls[0][2];
    act(() => cbs.onError({ message: 'stream failed' }));
    expect(screen.getByText('stream failed')).toBeInTheDocument();
  });

  it('converse onError falls back to a default message', async () => {
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    const cbs = chatAPI.sendMessageStream.mock.calls[0][2];
    act(() => cbs.onError({})); // no message → fallback
    expect(screen.getByText('va.err.streamFailed')).toBeInTheDocument();
  });

  it('converses with the stored generative chat model', async () => {
    localStorage.setItem('lifesync.chat.model', 'openai_chat');
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    expect(chatAPI.sendMessageStream.mock.calls[0][3].model).toBe('openai_chat');
    localStorage.removeItem('lifesync.chat.model');
  });

  it('never converses with BERT — a stored bert pick maps to the free default', async () => {
    localStorage.setItem('lifesync.chat.model', 'bert_local');
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    expect(chatAPI.sendMessageStream.mock.calls[0][3].model).toBe('gemma4_local');
    localStorage.removeItem('lifesync.chat.model');
  });

  it('falls back to the free default when storage is unavailable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    expect(chatAPI.sendMessageStream.mock.calls[0][3].model).toBe('gemma4_local');
    spy.mockRestore();
  });

  it('dictate mode sends a typed message without speaking', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('mode-dictate'));
    const box = await screen.findByTestId('dictation-text');
    fireEvent.change(box, { target: { value: 'log my run' } });
    fireEvent.click(screen.getByTestId('dictation-send'));
    expect(chatAPI.sendMessageStream).toHaveBeenCalled();
    const cbs = chatAPI.sendMessageStream.mock.calls[0][2];
    act(() => cbs.onDelta({ text: 'ok' }));
    act(() => cbs.onComplete({ response: 'ok', entities_logged: { health: [], finance: [] } }));
    expect(screen.getByTestId('dictate-transcript')).toBeInTheDocument();
  });

  it('renders right-to-left for RTL locales', async () => {
    h.settings = { t: (k) => k, locale: 'ar', isRTL: true };
    const { container } = await renderPage();
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
  });

  it('flushes a reply that ends exactly on a sentence boundary', async () => {
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    const cbs = chatAPI.sendMessageStream.mock.calls[0][2];
    act(() => cbs.onDelta({ text: 'All done.' })); // ends on boundary → nothing left to force-flush
    act(() => cbs.onComplete({ response: 'All done.' }));
    expect(screen.getByText('All done.')).toBeInTheDocument();
  });

  it('unmounts cleanly', async () => {
    const { unmount } = await renderPage();
    unmount();
    expect(voiceStub.stop).toHaveBeenCalled();
  });
});
