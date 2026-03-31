export const DEFAULT_PROD_API_URL = 'https://lifesync-production-6f3e.up.railway.app/api';
export const DEFAULT_PROD_GOOGLE_CLIENT_ID = '123174641248-1grp7s1u20ad1d3olkpg28hfe723rkut.apps.googleusercontent.com';

export const getApiBaseUrl = () => {
  return (
    import.meta.env.VITE_API_URL
    || (import.meta.env.DEV ? '/api' : DEFAULT_PROD_API_URL)
  ).replace(/\/$/, '');
};

export const getGoogleClientId = () => {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID
    || (import.meta.env.DEV ? '' : DEFAULT_PROD_GOOGLE_CLIENT_ID);
};
