// tests/contextWindow.test.js
// Larger, switchable context window: env sets the standard window; a per-request
// 'deep'/'max' switch scales history + data up (clamped) so the assistant can
// reason over a longer span when asked.
const { _resolveWindow } = require('../server/services/ai/bertContextService');

const ENV_KEYS = ['CONTEXT_WINDOW_DAYS', 'CONTEXT_MESSAGES', 'CONTEXT_MAX_ENTRIES', 'CONTEXT_RECENT_ENTRIES'];

describe('context window resolver', () => {
  let saved;
  beforeEach(() => { saved = {}; ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); });
  afterEach(() => { ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

  test('standard window uses larger defaults than the old 16/100', () => {
    const w = _resolveWindow(null);
    expect(w).toMatchObject({ mode: 'standard', days: 30, messages: 20, entries: 120, recent: 16 });
  });

  test('deep switch scales history + data up', () => {
    const w = _resolveWindow('deep');
    expect(w.mode).toBe('deep');
    expect(w.days).toBe(90);       // 30 * 3
    expect(w.messages).toBe(40);   // 20 * 2
    expect(w.entries).toBe(360);   // 120 * 3
  });

  test('max switch widens days furthest, still clamped', () => {
    const w = _resolveWindow('max');
    expect(w.days).toBe(180);      // 30 * 6
    expect(w.messages).toBe(40);   // clamp 80
    expect(w.entries).toBe(360);
  });

  test('env overrides the standard window and is clamped to bounds', () => {
    process.env.CONTEXT_MESSAGES = '50';
    process.env.CONTEXT_WINDOW_DAYS = '9999'; // over max → clamped to 365
    const w = _resolveWindow(null);
    expect(w.messages).toBe(50);
    expect(w.days).toBe(365);
  });

  test('garbage env falls back to defaults', () => {
    process.env.CONTEXT_MESSAGES = 'abc';
    expect(_resolveWindow(null).messages).toBe(20);
  });
});
