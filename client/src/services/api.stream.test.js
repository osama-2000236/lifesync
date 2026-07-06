import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatAPI } from './api';

const enc = new TextEncoder();

const sseResponse = (events) => {
  const raw = events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  let served = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (served) return { done: true, value: undefined };
          served = true;
          return { done: false, value: enc.encode(raw) };
        },
      }),
    },
  };
};

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.setItem('accessToken', 'tok');
});

describe('chatAPI.sendMessageStream — silent retry', () => {
  it('retries once silently on a pre-ack network failure, then succeeds', async () => {
    const onAck = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(sseResponse([
        { event: 'ack', data: { session_id: 's1' } },
        { event: 'complete', data: { response: 'hi' } },
        { event: 'done', data: {} },
      ]));

    chatAPI.sendMessageStream('hello', 's1', { onAck, onComplete, onError });
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(onAck).toHaveBeenCalledWith({ session_id: 's1' });
    expect(onComplete).toHaveBeenCalledWith({ response: 'hi' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces the error after the second network failure', async () => {
    const onError = vi.fn();
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    chatAPI.sendMessageStream('hello', 's1', { onError });
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].retryable).toBe(true);
  });

  it('never retries after ack — a duplicate POST would duplicate DB rows', async () => {
    const onAck = vi.fn();
    const onError = vi.fn();
    // First response acks, then the connection dies mid-stream.
    const failingBody = {
      ok: true,
      body: {
        getReader: () => {
          let step = 0;
          return {
            read: async () => {
              step += 1;
              if (step === 1) return { done: false, value: enc.encode('event: ack\ndata: {"session_id":"s1"}\n\n') };
              throw new TypeError('NetworkError when attempting to fetch resource.');
            },
          };
        },
      },
    };
    global.fetch = vi.fn().mockResolvedValue(failingBody);

    chatAPI.sendMessageStream('hello', 's1', { onAck, onError });
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onAck).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('non-network errors surface immediately without retry', async () => {
    const onError = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });

    chatAPI.sendMessageStream('hello', 's1', { onError });
    await flush();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toContain('Connection failed');
  });

  it('user abort stays silent', async () => {
    const onError = vi.fn();
    global.fetch = vi.fn().mockImplementation((_url, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        rej(e);
      });
    }));

    const abort = chatAPI.sendMessageStream('hello', 's1', { onError });
    abort();
    await flush();

    expect(onError).not.toHaveBeenCalled();
  });
});
