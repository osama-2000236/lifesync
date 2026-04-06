const AUTH_ENTRY_PATH_PREFIXES = [
  '/auth/login',
  '/auth/google',
  '/auth/register/',
  '/auth/forgot-password/',
];

const getRequestPathname = (url = '') => {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return String(url).split('?')[0];
  }
};

export const isAuthEntryEndpoint = (url) => {
  const pathname = getRequestPathname(url);
  return AUTH_ENTRY_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
};

export const shouldAttemptTokenRefresh = (error) => {
  const originalRequest = error?.config;

  return Boolean(
    error?.response?.status === 401
    && originalRequest
    && !originalRequest._retry
    && !isAuthEntryEndpoint(originalRequest.url)
  );
};
