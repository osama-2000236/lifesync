import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { getGoogleClientId } from '../config/runtime';

const AuthContext = createContext(null);
const ONBOARDING_EXEMPT_PATHS = new Set(['/landing', '/privacy', '/terms']);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

const getOnboardingKey = (userId) => `onboarding_done_${userId}`;

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const googleAuthEnabled = Boolean(getGoogleClientId());

  const clearSession = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

  const persistSession = useCallback((payload) => {
    localStorage.setItem('accessToken', payload.accessToken);
    localStorage.setItem('refreshToken', payload.refreshToken);
    setUser(payload.user);
    return payload;
  }, []);

  const updateCurrentUser = useCallback((nextUser) => {
    setUser(nextUser);
    return nextUser;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      authAPI.getProfile()
        .then(({ data }) => setUser(data.data.user))
        .catch(() => clearSession())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    if (loading || !user || user.role === 'admin') return;
    if (ONBOARDING_EXEMPT_PATHS.has(location.pathname)) return;

    const onboardingDone = localStorage.getItem(getOnboardingKey(user.id));
    if (!onboardingDone && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
      return;
    }

    if (onboardingDone && location.pathname === '/onboarding') {
      navigate('/dashboard', { replace: true });
    }
  }, [loading, user, location.pathname, navigate]);

  const login = useCallback(async (email, password) => {
    const { data } = await authAPI.login(email, password);
    return persistSession(data.data);
  }, [persistSession]);

  const loginWithGoogle = useCallback(async (credential) => {
    const { data } = await authAPI.googleLogin(credential);
    return persistSession(data.data);
  }, [persistSession]);

  const register = useCallback(async (payload) => {
    const { data } = await authAPI.completeRegistration(payload);
    return persistSession(data.data);
  }, [persistSession]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      logout,
      isAdmin,
      googleAuthEnabled,
      updateCurrentUser,
      onboardingStorageKey: user?.id ? getOnboardingKey(user.id) : null,
    }}
    >
      {children}
    </AuthContext.Provider>
  );
}
