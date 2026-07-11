// Resolve the public SPA origin for redirects / deep links.
// CORS_ORIGIN may be a comma-separated list — use the first absolute http(s) entry.

const frontendUrl = () => {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.APP_PUBLIC_URL,
    ...(process.env.CORS_ORIGIN || '').split(','),
    'http://localhost:5173',
  ];
  for (const raw of candidates) {
    const v = String(raw || '').trim().replace(/\/$/, '');
    if (/^https?:\/\//i.test(v)) return v;
  }
  return 'http://localhost:5173';
};

const apiPublicUrl = () => {
  const candidates = [
    process.env.API_PUBLIC_URL,
    process.env.APP_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : null,
    'http://localhost:5000',
  ];
  for (const raw of candidates) {
    const v = String(raw || '').trim().replace(/\/$/, '');
    if (/^https?:\/\//i.test(v)) return v;
    // bare host from Railway
    if (v && !v.includes('://') && v.includes('.')) return `https://${v}`;
  }
  return 'http://localhost:5000';
};

module.exports = { frontendUrl, apiPublicUrl };
