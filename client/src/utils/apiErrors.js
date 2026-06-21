export const getApiErrorMessage = (error, fallbackMessage) => {
  if (/timeout of \d+ms exceeded/i.test(error?.message || '')) {
    return 'Local Gemma is still generating your insight cards. The rest of the dashboard stays available while it finishes.';
  }

  return (
    error?.response?.data?.error
    || error?.response?.data?.message
    || error?.message
    || fallbackMessage
  );
};
