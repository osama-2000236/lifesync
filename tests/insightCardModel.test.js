import { getInsightCardsViewModel } from '../client/src/components/dashboard/insightCardModel';

describe('insight card model', () => {
  it('does not fabricate demo insights when the insights request fails', () => {
    const view = getInsightCardsViewModel({
      insights: null,
      error: 'Insights service unavailable',
    });

    expect(view.kind).toBe('error');
    expect(view.data).toBeNull();
    expect(view.error).toBe('Insights service unavailable');
  });

  it('returns real insight data when available', () => {
    const insights = {
      summary: 'Real backend summary',
      recommendations: [{ text: 'Real recommendation' }],
    };

    const view = getInsightCardsViewModel({ insights, error: null });

    expect(view.kind).toBe('data');
    expect(view.data).toBe(insights);
    expect(view.error).toBeNull();
  });

  it('keeps showing the last real insight data when refresh errors happen later', () => {
    const insights = {
      summary: 'Cached Gemma summary',
      recommendations: [{ text: 'Keep going' }],
    };

    const view = getInsightCardsViewModel({
      insights,
      error: 'Local Gemma could not generate insight cards right now.',
    });

    expect(view.kind).toBe('data');
    expect(view.data).toBe(insights);
    expect(view.error).toBeNull();
  });
});
