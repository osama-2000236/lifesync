export const shouldInitializeGoogleIdentity = (initializedClientId, nextClientId) => {
  return Boolean(nextClientId) && initializedClientId !== nextClientId;
};

export const buildGoogleButtonRenderKey = (clientId, text, locale) => `${clientId}:${text}:${locale || ''}`;

let currentInitializedClientId = '';

export const googleIdentityState = {
  shouldInitialize(nextClientId) {
    return shouldInitializeGoogleIdentity(currentInitializedClientId, nextClientId);
  },
  markInitialized(nextClientId) {
    currentInitializedClientId = nextClientId || '';
  },
};
