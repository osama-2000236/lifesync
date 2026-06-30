// tests/arabicNlp.test.js
// Native-Arabic logging through the deterministic extractor: Arabic-Indic
// numerals + Arabic stems are normalized to the English tokens the rule router
// and entity extractors already understand. The raw Arabic message is preserved
// for storage/display; only the matching copy is normalized.

jest.mock('../server/services/ai/providerClient', () => ({
  // Force the offline path so routing uses the deterministic rule label.
  classifyText: jest.fn(() => Promise.reject(new Error('bert offline'))),
}));

const { parseMessageWithBert, _extractFinanceEntities, _extractHealth } = require('../server/services/ai/bertNlpService');

describe('Arabic deterministic logging', () => {
  test('logs an Arabic expense with category', async () => {
    const r = await parseMessageWithBert('صرفت ٢٠ دولار على الغداء', null, {});
    expect(r.intent).toBe('log_finance');
    expect(r.entities).toHaveLength(1);
    expect(r.entities[0]).toMatchObject({ domain: 'finance', type: 'expense', amount: 20, currency: 'USD', category: 'Food & Dining' });
    // Raw Arabic is preserved for storage/display.
    expect(r.original_message).toBe('صرفت ٢٠ دولار على الغداء');
  });

  test('logs Arabic income', async () => {
    const r = await parseMessageWithBert('ربحت ١٠٠ دولار', null, {});
    expect(r.intent).toBe('log_finance');
    expect(r.entities[0]).toMatchObject({ type: 'income', amount: 100 });
  });

  test('logs Arabic steps', async () => {
    const r = await parseMessageWithBert('مشيت ٥٠٠٠ خطوة', null, {});
    expect(r.intent).toBe('log_health');
    expect(r.entities[0]).toMatchObject({ type: 'steps', value: 5000 });
  });

  test('logs Arabic sleep hours', async () => {
    const r = await parseMessageWithBert('نمت ٧ ساعات', null, {});
    expect(r.entities[0]).toMatchObject({ type: 'sleep', value: 7 });
  });

  test('logs Arabic mood', async () => {
    const r = await parseMessageWithBert('مزاجي ٨', null, {});
    expect(r.intent).toBe('log_health');
    expect(r.entities[0]).toMatchObject({ type: 'mood', value: 8 });
  });

  test('Arabic "healthy dinner" expense is REAL cross-domain (finance + nutrition)', async () => {
    const r = await parseMessageWithBert('صرفت ٥٠ دولار على عشاء صحي', null, {});
    expect(r.is_cross_domain).toBe(true);
    expect(r.entities.some((e) => e.domain === 'finance' && e.amount === 50)).toBe(true);
    expect(r.entities.some((e) => e.domain === 'health' && e.type === 'nutrition')).toBe(true);
  });

  test('Western digits in Arabic text still parse', async () => {
    const r = await parseMessageWithBert('صرفت 30 دولار على القهوة', null, {});
    expect(r.entities[0]).toMatchObject({ type: 'expense', amount: 30 });
  });

  test('confirms a logged Arabic entry in Arabic, not English', async () => {
    const r = await parseMessageWithBert('صرفت ٢٠ دولار على الغداء', null, {});
    expect(r.response).toMatch(/[؀-ۿ]/);          // contains Arabic
    expect(r.response).not.toMatch(/logged|Done —/); // not the English template
  });

  test('Arabic general chat replies in Arabic (locale hint, no Arabic verb)', async () => {
    const r = await parseMessageWithBert('شكرا', null, { locale: 'ar' });
    expect(r.response).toMatch(/[؀-ۿ]/);
  });

  test('Arabic feeling auto-logs mood + replies in Arabic', async () => {
    const r = await parseMessageWithBert('أنا حزين اليوم', null, {});
    expect(r.intent).toBe('log_health');
    expect(r.entities[0]).toMatchObject({ type: 'mood', value: 3 });
    expect(r.response).toMatch(/[؀-ۿ]/);
  });

  test('Arabic positive feeling logs a high mood', async () => {
    const r = await parseMessageWithBert('أنا سعيد', null, {});
    expect(r.entities[0]).toMatchObject({ type: 'mood', value: 8 });
  });

  test('incomplete Arabic expense asks for purpose in Arabic', async () => {
    const r = await parseMessageWithBert('صرفت ٢٠', null, {});
    expect(r.needs_clarification).toBe(true);
    expect(r.clarification_question).toMatch(/[؀-ۿ]/);
    expect(r.clarification_question).not.toMatch(/What was/i);
  });

  test('English logging still confirms in English', async () => {
    const r = await parseMessageWithBert('spent $12 on lunch', null, {});
    expect(r.response).toMatch(/logged/i);
    expect(r.response).not.toMatch(/[؀-ۿ]/);
  });

  test('does not disturb English extraction', () => {
    const fin = _extractFinanceEntities('spent $12 on lunch', {});
    expect(fin[0]).toMatchObject({ amount: 12, category: 'Food & Dining' });
    const hea = _extractHealth('walked 8000 steps', {});
    expect(hea[0]).toMatchObject({ type: 'steps', value: 8000 });
  });
});
