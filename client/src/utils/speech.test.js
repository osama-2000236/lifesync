import { describe, it, expect } from 'vitest';
import { stripMarkdownForSpeech, chunkForSpeech, pickVoice, detectLang, speechLangTag } from './speech';

describe('detectLang', () => {
  it('detects Arabic, English, and falls back for script-less input', () => {
    expect(detectLang('مرحبا كيف حالك')).toBe('ar');
    expect(detectLang('hello there')).toBe('en');
    expect(detectLang('اشتريت iPhone')).toBe('ar'); // any Arabic → ar
    expect(detectLang('123', 'ar')).toBe('ar');      // fallback when no letters
    expect(detectLang('')).toBe('en');               // default fallback
  });
  it('maps to a BCP-47 speech tag', () => {
    expect(speechLangTag('ar')).toBe('ar-SA');
    expect(speechLangTag('en')).toBe('en-US');
  });
});

describe('stripMarkdownForSpeech', () => {
  it('removes bold, inline code, list markers, and whole code blocks', () => {
    const text = 'Try **this**:\n- walk `5k`\n```\nignored code\n```\ndone';
    const out = stripMarkdownForSpeech(text);
    expect(out).toContain('this');
    expect(out).toContain('walk 5k');
    expect(out).not.toContain('ignored code');
    expect(out).not.toContain('**');
    expect(out).not.toContain('`');
  });

  it('handles empty input', () => {
    expect(stripMarkdownForSpeech('')).toBe('');
    expect(stripMarkdownForSpeech(null)).toBe('');
  });
});

describe('chunkForSpeech', () => {
  it('returns short text as a single chunk and empty for blank', () => {
    expect(chunkForSpeech('Hello.')).toEqual(['Hello.']);
    expect(chunkForSpeech('   ')).toEqual([]);
  });

  it('splits long text at sentence boundaries under the limit', () => {
    const sentence = 'This sentence is about forty characters. ';
    const text = sentence.repeat(10);
    const chunks = chunkForSpeech(text, 180);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(180));
    expect(chunks.join(' ')).toContain('forty characters.');
  });

  it('falls back to commas when no sentence end fits', () => {
    const text = `${'word '.repeat(30)}, ${'word '.repeat(30)}`;
    const chunks = chunkForSpeech(text, 120);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(120));
  });

  it('hard-splits a single unbroken run', () => {
    const chunks = chunkForSpeech('x'.repeat(500), 180);
    expect(chunks.length).toBe(3);
  });

  it('respects Arabic sentence enders and commas', () => {
    const ar = `${'كلمة '.repeat(30)}؟ ${'كلمة '.repeat(30)}،${'كلمة '.repeat(10)}`;
    const chunks = chunkForSpeech(ar, 120);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(120));
    expect(chunks.length).toBeGreaterThan(1);
  });
});

describe('pickVoice', () => {
  const voices = [
    { lang: 'en-US', name: 'Sam' },
    { lang: 'ar-SA', name: 'Tarik' },
  ];

  it('matches by language prefix', () => {
    expect(pickVoice(voices, 'ar').name).toBe('Tarik');
    expect(pickVoice(voices, 'en').name).toBe('Sam');
  });

  it('returns null when nothing matches or voices missing', () => {
    expect(pickVoice([], 'ar')).toBeNull();
    expect(pickVoice(null, 'en')).toBeNull();
    expect(pickVoice([{ name: 'NoLang' }], 'en')).toBeNull();
  });
});
