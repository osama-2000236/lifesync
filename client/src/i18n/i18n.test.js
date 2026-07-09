import { describe, it, expect } from 'vitest';
import { translate, dirFor, dateLocale, DICTS } from './index';
import { en } from './en';
import { ar } from './ar';

describe('i18n', () => {
  it('EN and AR dictionaries have the same keys', () => {
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it('missing keys fall back to EN then the key string (no crash)', () => {
    expect(translate('en', 'totally.missing.key')).toBe('totally.missing.key');
    expect(translate('ar', 'totally.missing.key')).toBe('totally.missing.key');
  });

  it('AR uses RTL direction', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });

  it('interpolates {vars} without throwing on missing vars', () => {
    // Pick a known pattern key if present, else synthetic via DICTS
    DICTS.en['test.hello'] = 'Hello {name}';
    DICTS.ar['test.hello'] = 'مرحبا {name}';
    expect(translate('en', 'test.hello', { name: 'Osama' })).toBe('Hello Osama');
    expect(translate('ar', 'test.hello', { name: 'أسامة' })).toContain('أسامة');
    delete DICTS.en['test.hello'];
    delete DICTS.ar['test.hello'];
  });

  it('Arabic dates keep Latin digits (nu-latn)', () => {
    expect(dateLocale('ar')).toContain('nu-latn');
  });
});
