// tests/outingFollowup.test.js
// Cross-domain "outing" follow-up: going somewhere -> ask car/bus/walk ->
// connect to finance (cost) and health (movement).

jest.mock('../server/services/ai/providerClient', () => ({
  classifyText: jest.fn(),
}));

const { classifyText } = require('../server/services/ai/providerClient');
const {
  parseMessageWithBert,
  _detectOuting,
  _transportModeFromText,
} = require('../server/services/ai/bertNlpService');

const classification = (label, confidence = 0.9) => ({
  label, confidence, provider: 'cpu', model: 'bert_best_model_10pct', latency_ms: 30,
});

describe('outing detection helpers', () => {
  test('detects an outing without a transport mode', () => {
    expect(_detectOuting('I am going to town later')).toMatchObject({ place: 'town', modeAlready: false });
  });
  test('does not treat a logged walk as an outing', () => {
    expect(_detectOuting('I walked 6000 steps')).toBeNull();
  });
  test('does not treat a finance message as an outing', () => {
    expect(_detectOuting('I spent $5 going to the market')).toBeNull();
  });
  test('reads transport mode from an answer', () => {
    expect(_transportModeFromText('by car')).toBe('car');
    expect(_transportModeFromText('walking')).toBe('walk');
    expect(_transportModeFromText('the bus')).toBe('bus');
  });
});

describe('outing follow-up flow', () => {
  beforeEach(() => classifyText.mockResolvedValue(classification('general_chat')));

  test('asks how the user will travel', async () => {
    const result = await parseMessageWithBert('I am going to town');
    expect(result.needs_clarification).toBe(true);
    expect(result.clarification_options).toEqual(['By car', 'By bus', 'Walking']);
    expect(result.entities).toEqual([]);
  });

  test('walking answer gives a cross-domain reply and remembers the commute', async () => {
    const result = await parseMessageWithBert('walking', {
      originalMessage: 'I am going to town',
      clarificationQuestion: 'How are you getting to the town?',
      clarificationOptions: ['By car', 'By bus', 'Walking'],
    });
    expect(result.needs_clarification).toBe(false);
    expect(result.is_cross_domain).toBe(true);
    expect(result.response.toLowerCase()).toContain('walking');
    expect(result._memory_writes[0]).toMatchObject({ category: 'routine' });
    expect(result._memory_writes[0].value).toContain('on foot');
  });

  test('car answer steers toward logging the cost', async () => {
    const result = await parseMessageWithBert('by car', {
      originalMessage: 'heading to the market',
      clarificationQuestion: 'How are you getting to the market?',
      clarificationOptions: ['By car', 'By bus', 'Walking'],
    });
    expect(result.is_cross_domain).toBe(true);
    expect(result.response.toLowerCase()).toMatch(/fuel|parking|amount/);
    expect(result._memory_writes[0].value).toContain('by car');
  });
});

describe('cross-domain food expense', () => {
  beforeEach(() => classifyText.mockResolvedValue(classification('log_both')));

  test('"$50 on a healthy dinner" logs finance + nutrition without clarifying', async () => {
    const result = await parseMessageWithBert('Spent $50 on a healthy dinner');
    expect(result.needs_clarification).toBe(false);
    expect(result.intent).toBe('log_both');
    expect(result.is_cross_domain).toBe(true);
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: 'finance', amount: 50 }),
      expect.objectContaining({ domain: 'health', type: 'nutrition' }),
    ]));
  });
});

describe('sentiment small-talk logs mood and replies supportively', () => {
  beforeEach(() => classifyText.mockResolvedValue(classification('log_health')));

  test('"I\'m feeling tired" logs a low mood without asking for a number', async () => {
    const result = await parseMessageWithBert("I'm feeling tired");
    expect(result.needs_clarification).toBe(false);
    expect(result.intent).toBe('log_health');
    expect(result.entities[0]).toMatchObject({ type: 'mood', value: 4 });
    expect(result.response.toLowerCase()).toMatch(/sorry|mood/);
  });

  test('"I\'m great today" logs a high mood', async () => {
    const result = await parseMessageWithBert("I'm great today");
    expect(result.needs_clarification).toBe(false);
    expect(result.entities[0]).toMatchObject({ type: 'mood', value: 8 });
  });

  test('"feeling 8" still logs the explicit numeric mood', async () => {
    const result = await parseMessageWithBert('feeling 8');
    expect(result.entities[0]).toMatchObject({ type: 'mood', value: 8 });
  });
});

describe('stale clarification is abandoned on a fresh log statement', () => {
  beforeEach(() => classifyText.mockResolvedValue(classification('general_chat')));

  test('a new "earned $500" is logged, not consumed as the previous answer', async () => {
    const result = await parseMessageWithBert('earned $500 from freelance work', {
      originalMessage: 'Spent $50 on a healthy dinner',
      clarificationQuestion: 'I need both a measurable health value and a financial amount.',
      clarificationOptions: ['Add health value', 'Add financial amount', 'Log one domain only'],
    });
    expect(result.needs_clarification).toBe(false);
    expect(result.intent).toBe('log_finance');
    expect(result.entities[0]).toMatchObject({ type: 'income', amount: 500 });
  });
});
