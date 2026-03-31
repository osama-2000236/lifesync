export const getApiErrorMessage = (error, fallbackMessage) => {
  return (
    error?.response?.data?.error
    || error?.response?.data?.message
    || error?.message
    || fallbackMessage
  );
};
