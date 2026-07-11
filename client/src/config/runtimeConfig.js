const isAllowedApiBase = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const s = raw.trim();
  // Same-origin relative API root (preferred for Workers SPA).
  if (s.startsWith('/') && !s.startsWith('//')) return true;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

export const resolveRuntimeConfig = (env = {}) => {
  const apiUrl = typeof env.VITE_API_URL === 'string' ? env.VITE_API_URL.trim() : '';
  const googleClientId = typeof env.VITE_GOOGLE_CLIENT_ID === 'string'
    ? env.VITE_GOOGLE_CLIENT_ID.trim()
    : '';
  const warnings = [];

  let apiBaseUrl = '/api';
  if (apiUrl) {
    if (isAllowedApiBase(apiUrl)) {
      apiBaseUrl = apiUrl;
    } else {
      warnings.push('VITE_API_URL is not a valid http(s) URL or absolute path; falling back to /api.');
    }
  } else if (!env.DEV) {
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
