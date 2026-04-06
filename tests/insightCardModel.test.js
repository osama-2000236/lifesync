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
});
