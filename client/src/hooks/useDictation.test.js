import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// voiceAPI is mocked; each fresh import (after resetModules) gets this factory.
vi.mock('../services/api', () => ({ voiceAPI: { transcribe: vi.fn() } }));

class FakeSR {
  constructor() { FakeSR.last = this; }
  start() { if (FakeSR.throwOnStart) throw new Error('nope'); this.started = true; }
  stop() { if (this.onend) this.onend(); }
  abort() { this.aborted = true; }
}

class FakeRecorder {
  constructor(stream) { this.stream = stream; this.state = 'recording'; FakeRecorder.last = this; }
  start() { this.started = true; }
  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) this.ondataavailable({ data: { size: FakeRecorder.chunkSize } });
    if (this.onstop) this.onstop();
  }
}

const setMediaDevices = (value) =>
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });

const clearGlobals = () => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  delete window.MediaRecorder;
  setMediaDevices(undefined);
};

const loadHook = async () => {
  const { useDictation } = await import('./useDictation');
  const { voiceAPI } = await import('../services/api');
  return { useDictation, voiceAPI };
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  clearGlobals();
  FakeSR.throwOnStart = false;
  FakeSR.last = null;
  FakeRecorder.last = null;
  FakeRecorder.chunkSize = 5;
});
afterEach(() => clearGlobals());

describe('useDictation — native path', () => {
  beforeEach(() => { window.SpeechRecognition = FakeSR; });

  it('falls back to webkitSpeechRecognition when SpeechRecognition is absent', async () => {
    delete window.SpeechRecognition;
    window.webkitSpeechRecognition = FakeSR;
    const { useDictation } = await loadHook();
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    expect(result.current.nativeSupported).toBe(true);
  });

  it('emits final transcript, keeps interim as partial', async () => {
    const { useDictation } = await loadHook();
    const onText = vi.fn();
    const { result } = renderHook(() => useDictation({ locale: 'ar', onText }));
    expect(result.current.supported).toBe(true);
    expect(result.current.nativeSupported).toBe(true);

    act(() => result.current.start());
    expect(result.current.state).toBe('listening');

    // interim only → partial set, no emit
    act(() => FakeSR.last.onresult({ results: [{ 0: { transcript: 'typing' }, isFinal: false }] }));
    expect(result.current.partial).toBe('typing');
    expect(onText).not.toHaveBeenCalled();

    // final → emit
    act(() => FakeSR.last.onresult({ results: [{ 0: { transcript: 'hello there' }, isFinal: true }] }));
    expect(onText).toHaveBeenCalledWith('hello there');
  });

  it('handles empty transcript (missing alternative) without emitting', async () => {
    const { useDictation } = await loadHook();
    const onText = vi.fn();
    const { result } = renderHook(() => useDictation({ onText }));
    act(() => result.current.start());
    act(() => FakeSR.last.onresult({ results: [{ 0: undefined, isFinal: true }] }));
    expect(onText).not.toHaveBeenCalled();
  });

  it('does not emit whitespace-only final transcripts', async () => {
    const { useDictation } = await loadHook();
    const onText = vi.fn();
    const { result } = renderHook(() => useDictation({ onText }));
    act(() => result.current.start());
    act(() => FakeSR.last.onresult({ results: [{ 0: { transcript: '   ' }, isFinal: true }] }));
    expect(onText).not.toHaveBeenCalled();
  });

  it('tolerates a missing onText callback and a recognizer without abort()', async () => {
    class NoAbortSR extends FakeSR { }
    NoAbortSR.prototype.abort = undefined;
    window.SpeechRecognition = NoAbortSR;
    const { useDictation } = await loadHook();
    const { result, unmount } = renderHook(() => useDictation({})); // no onText
    act(() => result.current.start());
    act(() => NoAbortSR.last.onresult({ results: [{ 0: { transcript: 'hi' }, isFinal: true }] }));
    unmount(); // abort is undefined → optional-call short-circuits
  });

  it('records onerror (with + without error code) and onend transitions', async () => {
    const { useDictation } = await loadHook();
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    act(() => result.current.start());
    act(() => FakeSR.last.onerror({ error: 'not-allowed' }));
    expect(result.current.error).toBe('not-allowed');
    // onend when not listening → stays idle (else branch)
    act(() => FakeSR.last.onend());
    expect(result.current.state).toBe('idle');

    act(() => result.current.start());
    act(() => FakeSR.last.onerror({}));
    expect(result.current.error).toBe('speech_error');
  });

  it('onend from listening returns to idle', async () => {
    const { useDictation } = await loadHook();
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    act(() => result.current.start());
    act(() => FakeSR.last.onend());
    expect(result.current.state).toBe('idle');
  });

  it('handles start() throwing', async () => {
    FakeSR.throwOnStart = true;
    const { useDictation } = await loadHook();
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    act(() => result.current.start());
    expect(result.current.error).toBe('start_failed');
    expect(result.current.state).toBe('idle');
  });

  it('swallows errors thrown by recognizer stop() and abort()', async () => {
    window.SpeechRecognition = class extends FakeSR {
      stop() { throw new Error('stop fail'); }
      abort() { throw new Error('abort fail'); }
    };
    const { useDictation } = await loadHook();
    const { result, unmount } = renderHook(() => useDictation({ onText: vi.fn() }));
    act(() => result.current.start());
    act(() => result.current.stop()); // catch on stop()
    unmount();                        // catch on abort()
  });

  it('stop() stops recognition; unmount aborts', async () => {
    const { useDictation } = await loadHook();
    const { result, unmount } = renderHook(() => useDictation({ onText: vi.fn() }));
    act(() => result.current.start());
    const rec = FakeSR.last;
    act(() => result.current.stop());
    expect(result.current.state).toBe('idle');
    unmount();
    expect(rec.aborted).toBe(true);
  });
});

describe('useDictation — cloud fallback path', () => {
  beforeEach(() => {
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) });
    window.MediaRecorder = FakeRecorder;
  });

  it('records, transcribes, and emits text', async () => {
    const { useDictation, voiceAPI } = await loadHook();
    voiceAPI.transcribe.mockResolvedValue({ data: { data: { text: 'cloud words' } } });
    const onText = vi.fn();
    const { result } = renderHook(() => useDictation({ locale: 'en', onText }));
    expect(result.current.nativeSupported).toBe(false);
    expect(result.current.supported).toBe(true);

    await act(async () => { result.current.start(); });
    expect(result.current.state).toBe('listening');

    await act(async () => { result.current.stop(); });
    await waitFor(() => expect(onText).toHaveBeenCalledWith('cloud words'));
    expect(result.current.state).toBe('idle');
  });

  it('sets no_transcript when provider returns empty text + ignores zero-size chunks', async () => {
    FakeRecorder.chunkSize = 0; // falsy → chunk skipped
    const { useDictation, voiceAPI } = await loadHook();
    voiceAPI.transcribe.mockResolvedValue({ data: { data: { text: '' } } });
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    await act(async () => { result.current.start(); });
    await act(async () => { result.current.stop(); });
    await waitFor(() => expect(result.current.error).toBe('no_transcript'));
  });

  it('sets transcribe_failed when provider throws', async () => {
    const { useDictation, voiceAPI } = await loadHook();
    voiceAPI.transcribe.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    await act(async () => { result.current.start(); });
    await act(async () => { result.current.stop(); });
    await waitFor(() => expect(result.current.error).toBe('transcribe_failed'));
  });

  it('sets mic_denied when getUserMedia rejects', async () => {
    setMediaDevices({ getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) });
    const { useDictation } = await loadHook();
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    await act(async () => { result.current.start(); });
    await waitFor(() => expect(result.current.error).toBe('mic_denied'));
  });

  it('swallows errors when releasing the media stream', async () => {
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => { throw new Error('track fail'); } }) });
    const { useDictation, voiceAPI } = await loadHook();
    voiceAPI.transcribe.mockResolvedValue({ data: { data: { text: 'ok' } } });
    const onText = vi.fn();
    const { result } = renderHook(() => useDictation({ onText }));
    await act(async () => { result.current.start(); });
    await act(async () => { result.current.stop(); });
    await waitFor(() => expect(onText).toHaveBeenCalledWith('ok'));
  });

  it('swallows errors thrown by recorder stop()', async () => {
    window.MediaRecorder = class extends FakeRecorder { stop() { throw new Error('stop fail'); } };
    const { useDictation } = await loadHook();
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    await act(async () => { result.current.start(); });
    await act(async () => { result.current.stop(); }); // catch on recorder.stop()
    expect(result.current.state).toBe('listening');
  });

  it('unmount cleans up when no native recognizer exists', async () => {
    const { useDictation } = await loadHook();
    const { result, unmount } = renderHook(() => useDictation({ onText: vi.fn() }));
    await act(async () => { result.current.start(); });
    unmount(); // recognitionRef is null here → optional-chain abort branch
  });

  it('stop() is a no-op once the recorder is inactive', async () => {
    const { useDictation, voiceAPI } = await loadHook();
    voiceAPI.transcribe.mockResolvedValue({ data: { data: { text: 'x' } } });
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    await act(async () => { result.current.start(); });
    await act(async () => { result.current.stop(); });
    // recorder now inactive → second stop hits the guard branch
    await act(async () => { result.current.stop(); });
    expect(result.current.state).toBe('idle');
  });
});

describe('useDictation — unsupported', () => {
  it('reports unsupported when neither native nor recording is available', async () => {
    const { useDictation } = await loadHook();
    const { result } = renderHook(() => useDictation({ onText: vi.fn() }));
    expect(result.current.supported).toBe(false);
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe('unsupported');
  });
});
