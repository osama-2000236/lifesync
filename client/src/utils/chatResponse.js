export const getChatErrorMessage = (error) => {
  const responseError = error?.response?.data?.error;
  if (typeof responseError === 'string' && responseError.trim()) {
    return responseError.trim();
  }

  const responseMessage = error?.response?.data?.message;
  if (typeof responseMessage === 'string' && responseMessage.trim()) {
    return responseMessage.trim();
  }

  const requestMessage = error?.message;
  if (typeof requestMessage === 'string' && requestMessage.trim() && requestMessage !== 'Network Error') {
    return requestMessage.trim();
  }

  return 'Something went wrong. Please try again.';
};

export const getAssistantMessageContent = (result) => {
  if (result?.needs_clarification && typeof result?.clarification_question === 'string' && result.clarification_question.trim()) {
    return result.clarification_question.trim();
  }

  return result?.response || '';
};
