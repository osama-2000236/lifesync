import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatComposer from './ChatComposer';

const t = (k) => k;

let dict;
let capturedOnText;
vi.mock('../../hooks/useDictation', () => ({
  useDictation: (opts) => { capturedOnText = opts.onText; return dict; },
}));

beforeEach(() => {
  dict = {
    supported: true, nativeSupported: true, state: 'idle', partial: '',
    error: null, start: vi.fn(), stop: vi.fn(), setPartial: vi.fn(),
  };
});

describe('ChatComposer', () => {
  it('types then submits with Enter and clears the field', () => {
    const onSubmit = vi.fn();
    render(<ChatComposer locale="en" onSubmit={onSubmit} t={t} />);
    const box = screen.getByTestId('chat-input');
    fireEvent.change(box, { target: { value: '  hello  ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(box.value).toBe('');
  });

  it('Shift+Enter inserts a newline instead of submitting', () => {
    const onSubmit = vi.fn();
    render(<ChatComposer locale="en" onSubmit={onSubmit} t={t} />);
    const box = screen.getByTestId('chat-input');
    fireEvent.change(box, { target: { value: 'line' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('send button submits and is disabled when empty or busy', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ChatComposer locale="en" onSubmit={onSubmit} t={t} />);
    expect(screen.getByTestId('send-button')).toBeDisabled();
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'go' } });
    fireEvent.click(screen.getByTestId('send-button'));
    expect(onSubmit).toHaveBeenCalledWith('go');

    rerender(<ChatComposer locale="en" busy onSubmit={onSubmit} t={t} />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'wait' } });
    fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' }); // busy → bail
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('mic starts dictation when idle and stops while listening', () => {
    const { rerender } = render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    fireEvent.click(screen.getByTestId('mic-button'));
    expect(dict.start).toHaveBeenCalled();

    dict.state = 'listening';
    rerender(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    fireEvent.click(screen.getByTestId('mic-button'));
    expect(dict.stop).toHaveBeenCalled();
  });

  it('shows the live partial transcript while listening', () => {
    dict.state = 'listening';
    dict.partial = 'spoken words';
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-status')).toHaveTextContent('spoken words');
  });

  it('shows the transcribing state for the cloud fallback', () => {
    dict.state = 'transcribing';
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-status')).toHaveTextContent('chat.dictate.transcribing');
  });

  it('appends dictated text to what was already typed', () => {
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'typed' } });
    act(() => capturedOnText('spoken'));
    expect(screen.getByTestId('chat-input').value).toBe('typed spoken');
  });

  it('sets dictated text directly when the field was empty', () => {
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    act(() => capturedOnText('first words'));
    expect(screen.getByTestId('chat-input').value).toBe('first words');
  });

  it('stops dictation when submitting mid-listen', () => {
    dict.state = 'listening';
    const onSubmit = vi.fn();
    render(<ChatComposer locale="en" onSubmit={onSubmit} t={t} />);
    fireEvent.change(screen.getByTestId('chat-input'), { target: { value: 'send now' } });
    fireEvent.keyDown(screen.getByTestId('chat-input'), { key: 'Enter' });
    expect(dict.stop).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith('send now');
  });

  it('hides the mic when dictation is unsupported', () => {
    dict.supported = false;
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.queryByTestId('mic-button')).not.toBeInTheDocument();
  });

  it('surfaces a permission-specific message when the mic is blocked', () => {
    dict.error = 'mic_denied';
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-error')).toHaveTextContent('chat.dictate.denied');
  });

  it('surfaces a generic message for other dictation errors', () => {
    dict.error = 'no_transcript';
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} />);
    expect(screen.getByTestId('dictation-error')).toHaveTextContent('chat.dictate.error');
  });

  it('uses an external input ref when provided', () => {
    const ref = { current: null };
    render(<ChatComposer locale="en" onSubmit={() => {}} t={t} inputRef={ref} />);
    expect(ref.current).toBe(screen.getByTestId('chat-input'));
  });
});
