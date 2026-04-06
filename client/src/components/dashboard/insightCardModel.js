export const getInsightCardsViewModel = ({ insights, error }) => {
  if (error) {
    return {
      kind: 'error',
      data: null,
      error,
    };
  }

  if (!insights) {
    return {
      kind: 'empty',
      data: null,
      error: null,
    };
  }

  return {
    kind: 'data',
    data: insights,
    error: null,
  };
};
