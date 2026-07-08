// tests/detectLang.test.js
// Per-turn language detection: the reply must mirror the language the user
// actually wrote, independent of the app's UI locale.
const { _detectLang: detectLang } = require('../server/services/ai/nlpService');

describe('detectLang', () => {
  test('Arabic script → ar', () => {
    expect(detectLang('مرحبا كيف حالك')).toBe('ar');
    expect(detectLang('صرفت ٢٠ دولار على الغداء')).toBe('ar');
  });

  test('Latin → en', () => {
    expect(detectLang('hello how are you')).toBe('en');
    expect(detectLang('I spent 20 on lunch')).toBe('en');
  });

  test('mixed with any Arabic → ar (user is conversing in Arabic)', () => {
    expect(detectLang('اشتريت iPhone اليوم')).toBe('ar');
  });

  test('script-less input → null (keep prior/UI language)', () => {
    expect(detectLang('123 45.6')).toBeNull();
    expect(detectLang('👍😀')).toBeNull();
    expect(detectLang('')).toBeNull();
    expect(detectLang(null)).toBeNull();
  });
});
