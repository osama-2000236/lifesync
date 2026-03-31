// src/contexts/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';
import { getGoogleClientId } from '../config/runtime';

const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const googleAuthEnabled = Boolean(getGoogleClientId());

  const persistSession = useCallback((payload) => {
    localStorage.setItem('accessToken', payload.accessToken);
    localStorage.setItem('refreshToken', payload.refreshToken);
    setUser(payload.user);
    return payload;
  }, []);

  // ─── Load user on mount ───
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      authAPI.getProfile()
        .then(({ data }) => setUser(data.data.user))
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

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
    }}
    >
      {children}
    </AuthContext.Provider>
  );
}
