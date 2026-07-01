import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DictationComposer from './DictationComposer';

const t = (k) => k;

// Controllable useDictation mock.
let dict;
let capturedOnText;
vi.mock('../../hooks/useDictation', () => ({
  useDictation: (opts) => { capturedOnText = opts.onText; return dict; },
}));

beforeEach(() => {
  dict = {
    supported: true, nativeSupported: false, state: 'idle', partial: '',
    error: null, start: vi.fn(), stop: vi.fn(), setPartial: vi.fn(),
  };
});

describe('DictationComposer', () => {
  it('types and submits, then clears', () => {
    const onSubmit = vi.fn();
    render(<DictationComposer locale="en" onSubmit={onSubmit} t={t} />);
    const box = screen.getByTestId('dictation-text');
    fireEvent.change(box, { target: { value: '  hello  ' } });
    fireEvent.click(screen.getByTestId('dictation-send'));
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(box.value).toBe('');
  });

  it('submit disabled when empty; Ctrl+Enter is a no-op on empty text', () => {
    const onSubmit = vi.fn();
    render(<DictationComposer locale="en" onSubmit={onSubmit} t={t} />);
    expect(screen.getByTestId('dictation-send')).toBeDisabled();
    // submit() runs but bails on empty text (!clean branch)
    fireEvent.keyDown(screen.getByTestId('dictation-text'), { key: 'Enter', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit() bails while busy even via keyboard', () => {
    const onSubmit = vi.fn();
    render(<DictationComposer locale="en" busy onSubmit={onSubmit} t={t} />);
    const box = screen.getByTestId('dictation-text');
    fireEvent.change(box, { target: { value: 'x' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true }); // busy branch
    fireEvent.click(screen.getByTestId('dictation-send')); // disabled → no-op
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with Cmd/Ctrl+Enter', () => {
    const onSubmit = vi.fn();
    render(<DictationComposer locale="en" onSubmit={onSubmit} t={t} />);
    const box = screen.getByTestId('dictation-text');
    fireEvent.change(box, { target: { value: 'hi' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith('hi');
  });

  it('appends dictated text via onText', () => {
    render(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    act(() => capturedOnText('hello'));
    act(() => capturedOnText('world'));
    expect(screen.getByTestId('dictation-text').value).toBe('hello world');
  });

  it('mic toggles start when idle', () => {
    render(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    fireEvent.click(screen.getByTestId('dictation-mic'));
    expect(dict.start).toHaveBeenCalled();
  });

  it('listening state shows live transcript and stops on toggle', () => {
    dict.state = 'listening';
    dict.partial = 'listening words';
    render(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-live')).toHaveTextContent('listening words');
    fireEvent.click(screen.getByTestId('dictation-mic'));
    expect(dict.stop).toHaveBeenCalled();
  });

  it('listening with no partial shows the listening label', () => {
    dict.state = 'listening';
    dict.partial = '';
    render(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-live')).toHaveTextContent('assistant.listening');
  });

  it('transcribing state disables + shows spinner label', () => {
    dict.state = 'transcribing';
    render(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByText('assistant.transcribing')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dictation-mic'));
    expect(dict.stop).toHaveBeenCalled();
  });

  it('shows unsupported vs generic mic error', () => {
    dict.error = 'unsupported';
    const { rerender } = render(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-error')).toHaveTextContent('assistant.micUnsupported');
    dict = { ...dict, error: 'mic_denied' };
    rerender(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-error')).toHaveTextContent('assistant.micError');
  });

  it('disables mic when unsupported', () => {
    dict.supported = false;
    render(<DictationComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-mic')).toBeDisabled();
  });
});
