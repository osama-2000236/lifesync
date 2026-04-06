export const getPaginatedItems = (response, collectionKey) => {
  const payload = response?.data;

  if (Array.isArray(payload)) {
    return payload;
  }

  if (collectionKey && Array.isArray(payload?.[collectionKey])) {
    return payload[collectionKey];
  }

  return [];
};

export const getPaginatedTotalPages = (response) => {
  return response?.pagination?.totalPages || response?.data?.pagination?.totalPages || 1;
};
