export const shouldInitializeGoogleIdentity = (initializedClientId, nextClientId) => {
  return Boolean(nextClientId) && initializedClientId !== nextClientId;
};

export const buildGoogleButtonRenderKey = (clientId, text) => `${clientId}:${text}`;

let currentInitializedClientId = '';

export const googleIdentityState = {
  shouldInitialize(nextClientId) {
    return shouldInitializeGoogleIdentity(currentInitializedClientId, nextClientId);
  },
  markInitialized(nextClientId) {
    currentInitializedClientId = nextClientId || '';
  },
};
