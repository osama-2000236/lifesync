jest.mock('../server/services/ai/providerClient', () => ({
  classifyText: jest.fn(),
}));

const { classifyText } = require('../server/services/ai/providerClient');
const {
  parseMessageWithBert,
  _detectRuleLabel,
  _extractFinance,
  _extractFinanceEntities,
  _extractHealth,
  _extractBudget,
} = require('../server/services/ai/bertNlpService');

const classification = (label, confidence = 0.95) => ({
  label,
  confidence,
  provider: 'cpu',
  model: 'bert_best_model_10pct',
  latency_ms: 40,
});

describe('BERT intent routing and deterministic extraction', () => {
  beforeEach(() => classifyText.mockResolvedValue(classification('general_chat')));

  test('high-precision finance rule corrects a wrong raw model label', async () => {
    classifyText.mockResolvedValue(classification('set_goal', 0.98));
    const result = await parseMessageWithBert('I spent $15 on lunch.');
    expect(result).toMatchObject({ intent: 'log_finance', domain: 'finance', needs_clarification: false });
    expect(result.entities[0]).toMatchObject({ type: 'expense', amount: 15, category: 'Food & Dining' });
    expect(result.model_runtime).toMatchObject({ raw_label: 'set_goal', routed_label: 'log_expense', rule_override: true });
  });

  test('cross-domain message extracts health and finance atomically', async () => {
    const result = await parseMessageWithBert('I slept 7 hours and spent $15 on breakfast.');
    expect(result).toMatchObject({
      intent: 'log_both', domain: 'both', needs_clarification: false, is_cross_domain: true,
    });
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: 'health', type: 'sleep', value: 7 }),
      expect.objectContaining({ domain: 'finance', type: 'expense', amount: 15 }),
    ]));
  });

  test('walked 5k parses as 5000 steps (not phantom nutrition with coffee spend)', async () => {
    const result = await parseMessageWithBert('walked 5k then bought coffee for 4 dollars');
    expect(result.is_cross_domain).toBe(true);
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'steps', value: 5000 }),
      expect.objectContaining({ type: 'expense', amount: 4 }),
    ]));
    expect(result.entities.some((e) => e.type === 'nutrition')).toBe(false);
  });

  test('healthy dinner nutrition is meal presence (value 1), never 0 kcal', async () => {
    const result = await parseMessageWithBert('I spent $50 on a healthy dinner.');
    const nut = result.entities.find((e) => e.type === 'nutrition');
    expect(nut).toMatchObject({ value: 1, unit: 'meal' });
    expect(result.is_cross_domain).toBe(true);
  });

  test('Arabic spend query routes to query_finance (EN/AR parity)', async () => {
    const result = await parseMessageWithBert('كم أنفقت هذا الأسبوع؟');
    expect(result).toMatchObject({
      intent: 'query_finance', domain: 'finance', is_cross_domain: false, needs_clarification: false,
    });
  });

  test('missing finance purpose asks before any write', async () => {
    const result = await parseMessageWithBert('I spent 10.');
    expect(result.needs_clarification).toBe(true);
    expect(result.entities).toEqual([]);
    expect(result.confidence).toBeLessThan(0.5);
  });

  test('ambiguous gym statement exposes no entities', async () => {
    const result = await parseMessageWithBert('50 for the gym.');
    expect(result).toMatchObject({
      intent: 'unclear',
      candidate_intent: 'log_both',
      needs_clarification: true,
    });
    expect(result.entities).toEqual([]);
  });

  test('gym clarification can resolve to expense', async () => {
    const result = await parseMessageWithBert('expense', {
      originalMessage: '50 for the gym.',
      clarificationQuestion: 'Expense, exercise, or both?',
      clarificationOptions: ['Gym expense', 'Exercise minutes', 'Both'],
    });
    expect(result).toMatchObject({ intent: 'log_finance', needs_clarification: false });
    expect(result.entities[0]).toMatchObject({ type: 'expense', amount: 50, category: 'Healthcare' });
  });

  test('water normalizes milliliters to liters', () => {
    expect(_extractHealth('I drank 500 ml of water.')[0]).toMatchObject({ type: 'water', value: 0.5, unit: 'liters' });
  });

  test('sleep converts hours to duration minutes', () => {
    expect(_extractHealth('I slept 7.5 hours.')[0]).toMatchObject({ type: 'sleep', value: 7.5, duration: 450 });
  });

  test('soft sleep phrases (EN + AR) map to a 5h marker', () => {
    expect(_extractHealth('slept a little last night')[0]).toMatchObject({
      type: 'sleep', value: 5, value_text: 'poor sleep', unit: 'hours',
    });
    expect(_extractHealth('نمت قليل الليلة')[0]).toMatchObject({
      type: 'sleep', value: 5, value_text: 'poor sleep',
    });
    expect(_extractHealth('poor sleep last night')[0]).toMatchObject({ type: 'sleep', value: 5 });
  });

  test('distance runs/walks become exercise minutes (not steps)', () => {
    expect(_extractHealth('I ran 5 km')[0]).toMatchObject({
      type: 'exercise', value: 30, value_text: '5 km run', unit: 'minutes', activity: 'running',
    });
    expect(_extractHealth('walked 3 miles')[0]).toMatchObject({
      type: 'exercise', value: 60, value_text: '3 mi walk', unit: 'minutes', activity: 'walking',
    });
    // "5k" still means thousand steps, not kilometers
    expect(_extractHealth('walked 5k')[0]).toMatchObject({ type: 'steps', value: 5000 });
  });

  test('heart rate extracts bpm', () => {
    expect(_extractHealth('My heart rate was 72 bpm.')[0]).toMatchObject({ type: 'heart_rate', value: 72, unit: 'bpm' });
  });

  test('ran + spend is true cross-domain (HEALTH_SIGNAL includes ran)', async () => {
    const result = await parseMessageWithBert('I ran 5 km then spent $12 on a smoothie');
    expect(result).toMatchObject({
      intent: 'log_both', domain: 'both', is_cross_domain: true, needs_clarification: false,
    });
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'exercise', value: 30 }),
      expect.objectContaining({ type: 'expense', amount: 12 }),
    ]));
  });

  test('income extracts amount and income category', () => {
    expect(_extractFinance('I earned $500 from freelance work.')).toMatchObject({
      type: 'income', amount: 500, category: 'Income - Freelance',
    });
  });

  test('extracts multiple finance records from one long message', async () => {
    const result = await parseMessageWithBert('I spent $5 on breakfast and paid $3 for the bus.');
    expect(result).toMatchObject({ intent: 'log_finance', needs_clarification: false });
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 5, category: 'Food & Dining' }),
      expect.objectContaining({ amount: 3, category: 'Transportation' }),
    ]));
    expect(_extractFinanceEntities('Spent $5 on food and paid $3 for bus.')).toHaveLength(2);
  });

  test('builds cross-domain budget advice from structured local context without logging budget as expense', async () => {
    const context = {
      window_days: 30,
      health: {
        mood: { average: 4.5, count: 4, latest: 4 },
        sleep: { average: 6.2, count: 5, latest: 6 },
      },
      finance: { ILS: { expense: 120, income: 200, net: 80, transactions: 8 } },
      source_counts: { messages: 6, health_logs: 9, finance_logs: 8 },
    };
    const result = await parseMessageWithBert(
      'I have 20 ILS. What should I buy for healthy food and a better mood?',
      null,
      context
    );
    expect(result).toMatchObject({
      intent: 'get_insight',
      domain: 'both',
      entities: [],
      needs_clarification: false,
      // Advice-only turns are domain "both" but not linked-log cross-domain.
      is_cross_domain: false,
      context_used: { messages: 6, health_logs: 9, finance_logs: 8 },
    });
    expect(result.response).toContain('For ILS 20');
    expect(result.response).toContain('sleep averages 6.2 hours');
    expect(result.response).toContain('mood average is 4.5/10');
    expect(_extractBudget('I have 20 ILS left.')).toEqual({ amount: 20, currency: 'ILS' });
  });

  test('logs explicit facts from long advice message and then gives advice', async () => {
    const result = await parseMessageWithBert(
      'I slept 5 hours, my mood was 3/10, and spent 7 ILS on breakfast. What should I improve?',
      null,
      { health: {}, finance: {}, source_counts: {} }
    );
    expect(result).toMatchObject({ intent: 'log_both', domain: 'both', needs_clarification: false });
    expect(result.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'sleep', value: 5 }),
      expect.objectContaining({ type: 'mood', value: 3 }),
      expect.objectContaining({ type: 'expense', amount: 7, currency: 'ILS' }),
    ]));
    expect(result.response).toContain('Logged 2 health and 1 finance item(s)');
  });

  test('retains multi-chunk BERT evidence in runtime diagnostics', async () => {
    classifyText.mockResolvedValue({
      ...classification('log_health', 0.82),
      detected_labels: ['log_health', 'log_expense'],
      chunk_count: 3,
      chunk_results: [
        { index: 0, label: 'log_health', confidence: 0.82 },
        { index: 1, label: 'log_expense', confidence: 0.76 },
      ],
    });
    const result = await parseMessageWithBert('Completed 30 minutes and handled 12 later.');
    expect(result.model_runtime).toMatchObject({
      detected_labels: ['log_health', 'log_expense'],
      routed_label: 'log_both',
      chunk_count: 3,
    });
  });

  test('query rule overrides logging classes', async () => {
    classifyText.mockResolvedValue(classification('log_expense'));
    const result = await parseMessageWithBert('Show my weekly summary.');
    expect(result).toMatchObject({ intent: 'get_insight', domain: 'both', needs_clarification: false });
    expect(result.entities).toEqual([]);
  });

  test('rule detector separates six supported intents', () => {
    expect(_detectRuleLabel('hello')).toBe('general_chat');
    expect(_detectRuleLabel('walked 5000 steps')).toBe('log_health');
    expect(_detectRuleLabel('paid $12 for lunch')).toBe('log_expense');
    expect(_detectRuleLabel('slept 8 hours and paid $12')).toBe('log_both');
    expect(_detectRuleLabel('show my dashboard')).toBe('query_summary');
    expect(_detectRuleLabel('set a savings goal')).toBe('set_goal');
  });

  test('runtime failure degrades to deterministic routing', async () => {
    classifyText.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await parseMessageWithBert('I walked 6000 steps.');
    expect(result).toMatchObject({ intent: 'log_health', needs_clarification: false });
    expect(result.model_runtime).toMatchObject({ status: 'deterministic_fallback', error: 'ECONNREFUSED' });
  });
});
