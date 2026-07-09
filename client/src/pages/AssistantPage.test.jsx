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
  aiAPI: { getModels: vi.fn() },
}));

import AssistantPage from './AssistantPage';
import { chatAPI, assistantAPI, aiAPI } from '../services/api';

const wrap = (payload) => ({ data: { data: payload } });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  h.settings = {
    t: (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    locale: 'en',
    isRTL: false,
  };
  voiceStub = {
    state: 'idle', level: 0, transcript: '', error: null,
    start: vi.fn(), stop: vi.fn(), enqueueSpeech: vi.fn(), finishSpeechStream: vi.fn(),
  };
  assistantAPI.getSuggestion.mockResolvedValue(wrap({ topic: null }));
  chatAPI.sendMessageStream.mockReturnValue(vi.fn());
  aiAPI.getModels.mockResolvedValue(wrap({
    models: [
      { id: 'bert_local', label: 'BERT', pricing: 'local' },
      { id: 'gemma4_local', label: 'Gemma 4 31B', pricing: 'free', description: 'free' },
      { id: 'openai_chat', label: 'GPT-OSS', pricing: 'free' },
    ],
  }));
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

  it('answer error keeps the current question and surfaces an error', async () => {
    assistantAPI.startInterview.mockResolvedValue(wrap({ question: { id: 'q0', step: 0, total: 2, prompt: 'Hours?', input_type: 'number', options: [] } }));
    const err = Object.assign(new Error('boom'), { response: { status: 500, data: { code: 'SERVER' } } });
    assistantAPI.answer.mockRejectedValue(err);
    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-accept'));
    await screen.findByTestId('interview-panel');
    fireEvent.change(screen.getByTestId('number-input'), { target: { value: '7' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    await waitFor(() => expect(assistantAPI.answer).toHaveBeenCalled());
    expect(await screen.findByTestId('interview-panel')).toBeInTheDocument();
    expect(await screen.findByTestId('interview-error')).toHaveTextContent('assistant.answerError');
  });

  it('invalid answer (422) shows invalidAnswer, not a silent freeze', async () => {
    assistantAPI.startInterview.mockResolvedValue(wrap({ question: { id: 'q0', step: 0, total: 2, prompt: 'Hours?', input_type: 'number', options: [] } }));
    const err = Object.assign(new Error('bad'), { response: { status: 422, data: { code: 'INVALID_ANSWER' } } });
    assistantAPI.answer.mockRejectedValue(err);
    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-accept'));
    await screen.findByTestId('interview-panel');
    fireEvent.change(screen.getByTestId('number-input'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    expect(await screen.findByTestId('interview-error')).toHaveTextContent('assistant.invalidAnswer');
  });

  it('mood_nutrition 3-step (number → number → choice) never stalls', async () => {
    assistantAPI.getSuggestion.mockResolvedValue(wrap({ topic: 'mood_nutrition', prompt: 'Food?', cross_domain: false }));
    assistantAPI.startInterview.mockResolvedValue(wrap({
      question: { id: 'mood', step: 0, total: 3, prompt: 'Mood?', input_type: 'number', options: [] },
    }));
    assistantAPI.answer
      .mockResolvedValueOnce(wrap({
        done: false,
        question: { id: 'water', step: 1, total: 3, prompt: 'Water?', input_type: 'number', options: [] },
      }))
      .mockResolvedValueOnce(wrap({
        done: false,
        question: {
          id: 'meal', step: 2, total: 3, prompt: 'Meals?', input_type: 'choice',
          options: [{ value: 'healthy', label: 'Healthy' }, { value: 'junk', label: 'Junk' }],
        },
      }))
      .mockResolvedValueOnce(wrap({
        done: true,
        advice: { advice: [{ text: 'Drink more', priority: 'medium', domain: 'health' }], scores: null },
      }));

    await renderPage();
    fireEvent.click(await screen.findByTestId('consent-accept'));
    await screen.findByText('Mood?');
    fireEvent.change(screen.getByTestId('number-input'), { target: { value: '6' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    await screen.findByText('Water?');
    fireEvent.change(screen.getByTestId('number-input'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    await screen.findByText('Meals?');
    fireEvent.click(screen.getByText('Healthy'));
    expect(await screen.findByTestId('advice-cards')).toBeInTheDocument();
    expect(assistantAPI.answer).toHaveBeenCalledTimes(3);
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

  it('shows denied-mic guidance with a retry that restarts the loop', async () => {
    voiceStub.error = 'mic-denied';
    await renderPage();
    expect(screen.getByText('assistant.micDeniedTitle')).toBeInTheDocument();
    expect(screen.getByTestId('mic-error-help')).toHaveTextContent('assistant.micDeniedBody');
    // Idle + error → the toggle becomes "try again" and calls start.
    fireEvent.click(screen.getByTestId('converse-toggle'));
    expect(voiceStub.start).toHaveBeenCalled();
    expect(screen.getByText('assistant.retryMic')).toBeInTheDocument();
  });

  it('labels a missing microphone distinctly', async () => {
    voiceStub.error = 'mic-none';
    await renderPage();
    expect(screen.getByText('assistant.micNone')).toBeInTheDocument();
    expect(screen.getByTestId('mic-error-help')).toHaveTextContent('assistant.micNoneBody');
  });

  it('labels busy and insecure mic failures distinctly (not a bare "تعذّر")', async () => {
    voiceStub.error = 'mic-busy';
    const { unmount } = await renderPage();
    expect(screen.getByText('assistant.micBusy')).toBeInTheDocument();
    expect(screen.getByTestId('mic-error-help')).toHaveTextContent('assistant.micBusyBody');
    unmount();
    voiceStub = { ...voiceStub, error: 'mic-insecure' };
    await renderPage();
    expect(screen.getByText('assistant.micInsecure')).toBeInTheDocument();
    expect(screen.getByTestId('mic-error-help')).toHaveTextContent('assistant.micInsecureBody');
  });

  it('falls back to the generic mic-error label for other failures', async () => {
    voiceStub.error = 'mic-failed';
    await renderPage();
    expect(screen.getByText('assistant.micError')).toBeInTheDocument();
    expect(screen.getByTestId('mic-error-help')).toHaveTextContent('assistant.micErrorBody');
  });

  it('maps unsupported browser to the right copy, not a mic failure', async () => {
    voiceStub.error = 'unsupported';
    await renderPage();
    expect(screen.getByText('assistant.micUnsupported')).toBeInTheDocument();
    expect(screen.getByTestId('mic-error-help')).toHaveTextContent('assistant.micUnsupportedBody');
  });

  it('maps stt-unavailable (Arabic without cloud STT) away from the generic mic line', async () => {
    voiceStub.error = 'stt-unavailable';
    await renderPage();
    expect(screen.getByText('assistant.sttUnavailable')).toBeInTheDocument();
    expect(screen.getByTestId('mic-error-help')).toHaveTextContent('assistant.sttUnavailableBody');
    expect(screen.queryByText('assistant.micError')).not.toBeInTheDocument();
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
  });

  it('never converses with BERT — a stored bert pick maps to the free default', async () => {
    localStorage.setItem('lifesync.chat.model', 'bert_local');
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    expect(chatAPI.sendMessageStream.mock.calls[0][3].model).toBe('gemma4_local');
  });

  it('falls back to the free default when storage is unavailable', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    expect(chatAPI.sendMessageStream.mock.calls[0][3].model).toBe('gemma4_local');
    spy.mockRestore();
  });

  it('shows a model picker and powered-by status (no BERT in the menu)', async () => {
    await renderPage();
    expect(screen.getByTestId('model-picker')).toBeInTheDocument();
    expect(screen.getByTestId('voice-model-status')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('model-picker-button'));
    expect(screen.getByTestId('model-option-gemma4_local')).toBeInTheDocument();
    expect(screen.getByTestId('model-option-openai_chat')).toBeInTheDocument();
    expect(screen.queryByTestId('model-option-bert_local')).not.toBeInTheDocument();
  });

  it('switching the picker persists and is used on the next turn', async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId('model-picker-button'));
    fireEvent.click(screen.getByTestId('model-option-openai_chat'));
    expect(localStorage.getItem('lifesync.chat.model')).toBe('openai_chat');
    act(() => voiceArgs.onUtterance('hello'));
    expect(chatAPI.sendMessageStream.mock.calls[0][3].model).toBe('openai_chat');
  });

  it('attributes the reply model after onComplete', async () => {
    await renderPage();
    act(() => voiceArgs.onUtterance('hi'));
    const cbs = chatAPI.sendMessageStream.mock.calls[0][2];
    act(() => {
      cbs.onDelta({ text: 'Hello there' });
      cbs.onComplete({
        response: 'Hello there',
        model_runtime: { model: 'google/gemma-4-31b-it:free', provider: 'openrouter', conversational: true },
      });
    });
    expect(await screen.findByTestId('voice-model-attribution')).toHaveTextContent('google/gemma-4-31b-it:free');
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
