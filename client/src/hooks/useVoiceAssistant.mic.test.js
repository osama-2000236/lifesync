import { describe, it, expect } from 'vitest';
import { classifyMicError, sttFailurePlan } from './useVoiceAssistant';

describe('classifyMicError', () => {
  it('maps permission denials', () => {
    expect(classifyMicError({ name: 'NotAllowedError' })).toBe('mic-denied');
    expect(classifyMicError({ name: 'PermissionDeniedError' })).toBe('mic-denied');
    expect(classifyMicError({ name: 'Error', message: 'Permission denied' })).toBe('mic-denied');
  });

  it('maps missing devices', () => {
    expect(classifyMicError({ name: 'NotFoundError' })).toBe('mic-none');
    expect(classifyMicError({ name: 'DevicesNotFoundError' })).toBe('mic-none');
  });

  it('maps busy / exclusive-use mics (common Windows case)', () => {
    expect(classifyMicError({ name: 'NotReadableError' })).toBe('mic-busy');
    expect(classifyMicError({ name: 'TrackStartError' })).toBe('mic-busy');
    expect(classifyMicError({ name: 'Error', message: 'Could not start audio source' })).toBe('mic-busy');
  });

  it('maps insecure context (HTTP, non-localhost)', () => {
    expect(classifyMicError({ name: 'SecurityError' })).toBe('mic-insecure');
    expect(classifyMicError({}, { isSecureContext: false })).toBe('mic-insecure');
    expect(classifyMicError({ message: 'only secure origins' })).toBe('mic-insecure');
  });

  it('falls back to mic-failed for unknown errors', () => {
    expect(classifyMicError({ name: 'TypeError', message: 'boom' })).toBe('mic-failed');
    expect(classifyMicError(null)).toBe('mic-failed');
  });
});

describe('sttFailurePlan', () => {
  it('501 (unconfigured) stops immediately — never retries', () => {
    expect(sttFailurePlan(501, 1)).toBe('stt-unavailable');
    expect(sttFailurePlan(501, 5)).toBe('stt-unavailable');
  });

  it('one transient failure recycles the turn instead of killing the session', () => {
    expect(sttFailurePlan(502, 1)).toBe('retry');
    expect(sttFailurePlan(undefined, 1)).toBe('retry'); // network blip, no status
  });

  it('repeated failures stop honestly with stt-failed', () => {
    expect(sttFailurePlan(502, 2)).toBe('stt-failed');
    expect(sttFailurePlan(undefined, 3)).toBe('stt-failed');
  });
});
