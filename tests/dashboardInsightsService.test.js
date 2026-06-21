jest.mock('../server/services/ai/insightEngine', () => ({
  runInsightEngine: jest.fn(),
}));
jest.mock('../server/services/ai/nlpService', () => ({
  generateWeeklyInsights: jest.fn(),
}));
jest.mock('../server/models/AISummary', () => ({
  create: jest.fn(),
}));

const { runInsightEngine } = require('../server/services/ai/insightEngine');
const { generateWeeklyInsights } = require('../server/services/ai/nlpService');
const AISummary = require('../server/models/AISummary');
const {
  buildDashboardInsights,
  persistDashboardInsights,
  _clearCache,
} = require('../server/services/ai/dashboardInsightsService');

const deterministic = () => ({
  summary: 'Deterministic summary',
  patterns: [{ observation: 'Verified pattern', domain: 'both', trend: 'stable', severity: 'neutral' }],
  recommendations: [{ text: 'Verified action', priority: 'medium', domain: 'both', reason: 'Verified data' }],
  cross_domain_insights: 'Verified cross-domain result',
  mood_trend: 'stable',
  spending_trend: 'decreasing',
  health_score: 72,
  financial_health_score: 81,
  budget_summary: { income: 100, expenses: 40 },
  period: { start: new Date('2026-06-12T00:00:00Z'), end: new Date('2026-06-19T00:00:00Z') },
  generated_at: '2026-06-19T00:00:00Z',
});

describe('dashboardInsightsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _clearCache();
    runInsightEngine.mockResolvedValue(deterministic());
  });

  test('uses model narrative while preserving deterministic scores and patterns', async () => {
    generateWeeklyInsights.mockResolvedValue({
      summary: 'Local-model narrative',
      recommendations: [{ text: 'Model action', priority: 'high', domain: 'both', reason: 'Pattern' }],
      cross_domain_insights: 'Model narrative correlation',
      _model_runtime: { status: 'ready', provider: 'lmstudio', model: 'lifesync-local' },
    });

    const result = await buildDashboardInsights(7);
    expect(result.summary).toBe('Local-model narrative');
    expect(result.health_score).toBe(72);
    expect(result.financial_health_score).toBe(81);
    expect(result.patterns[0].observation).toBe('Verified pattern');
    expect(result.model_runtime.operating_mode).toBe('local_model_narrative_with_deterministic_metrics');
  });

  test('falls back to deterministic output when the local model is unavailable', async () => {
    generateWeeklyInsights.mockResolvedValue({
      _model_runtime: { status: 'fallback', error: 'ECONNREFUSED' },
    });

    const result = await buildDashboardInsights(7);
    expect(result.summary).toBe('Deterministic summary');
    expect(result.recommendations).toEqual(deterministic().recommendations);
    expect(result.model_runtime.operating_mode).toBe('deterministic_fallback');
  });

  test('uses long-cache deterministic dashboard mode for classifier-only BERT', async () => {
    generateWeeklyInsights.mockResolvedValue({
      _model_runtime: { status: 'classifier_only', provider: 'bert_local', model: 'bert_best_model_10pct' },
    });

    const first = await buildDashboardInsights(7);
    const second = await buildDashboardInsights(7);
    expect(first.summary).toBe('Deterministic summary');
    expect(first.model_runtime.operating_mode).toBe('bert_classifier_with_deterministic_dashboard');
    expect(second).toBe(first);
    expect(runInsightEngine).toHaveBeenCalledTimes(1);
  });

  test('caches dashboard inference and persists a forced generation', async () => {
    generateWeeklyInsights.mockResolvedValue({
      summary: 'Cached model narrative',
      recommendations: [],
      cross_domain_insights: '',
      _model_runtime: { status: 'ready', provider: 'lmstudio', model: 'lifesync-local' },
    });
    AISummary.create.mockResolvedValue({ id: 44 });

    await buildDashboardInsights(7);
    await buildDashboardInsights(7);
    expect(runInsightEngine).toHaveBeenCalledTimes(1);

    const persisted = await persistDashboardInsights(7);
    expect(runInsightEngine).toHaveBeenCalledTimes(2);
    expect(AISummary.create).toHaveBeenCalledTimes(1);
    expect(persisted.id).toBe(44);
  });
});
