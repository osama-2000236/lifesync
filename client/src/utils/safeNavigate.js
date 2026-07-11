/**
 * Client-side navigation guards for untrusted URL strings (API payloads, env).
 * Never assign window.location to a URL that fails these checks.
 */

/** Absolute http(s) or same-origin relative path starting with /. */
export const isSafeHttpUrl = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  const s = raw.trim();
  if (s.startsWith('/') && !s.startsWith('//')) return true; // relative path, not protocol-relative
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * OAuth authorization URLs we will assign to window.location.
 * Today only Google Fit connect returns a browser URL.
 */
export const isAllowedOAuthAuthorizeUrl = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return (
      host === 'accounts.google.com'
      || host === 'oauth2.googleapis.com'
      || host.endsWith('.google.com')
    );
  } catch {
    return false;
  }
};

/**
 * @returns {boolean} true if navigation started
 */
export const navigateToOAuthAuthorizeUrl = (raw, assign = (href) => { window.location.href = href; }) => {
  if (!isAllowedOAuthAuthorizeUrl(raw)) return false;
  assign(String(raw).trim());
  return true;
};
