export const resolveRuntimeConfig = (env = {}) => {
  const apiUrl = typeof env.VITE_API_URL === 'string' ? env.VITE_API_URL.trim() : '';
  const googleClientId = typeof env.VITE_GOOGLE_CLIENT_ID === 'string'
    ? env.VITE_GOOGLE_CLIENT_ID.trim()
    : '';
  const warnings = [];

  let apiBaseUrl = apiUrl || '/api';
  if (!env.DEV && !apiUrl) {
    warnings.push('VITE_API_URL is not set for this production build. Falling back to same-origin /api.');
  }

  if (!env.DEV && !googleClientId) {
    warnings.push('VITE_GOOGLE_CLIENT_ID is not set for this production build. Google sign-in is disabled.');
  }

  apiBaseUrl = apiBaseUrl.replace(/\/$/, '');

  return {
    apiBaseUrl,
    googleClientId,
    warnings,
  };
};
