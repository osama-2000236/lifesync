// src/services/api.js
import axios from 'axios';

const DEFAULT_PROD_API_URL = 'https://lifesync-production-6f3e.up.railway.app/api';

const API_BASE = (
  import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? '/api' : DEFAULT_PROD_API_URL)
).replace(/\/$/, '');

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request Interceptor: Attach JWT ───
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response Interceptor: Handle token refresh & errors ───
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ─── Auth API ───
export const authAPI = {
  sendOTP: (email) => api.post('/auth/register/send-otp', { email }),
  verifyOTP: (email, code) => api.post('/auth/register/verify-otp', { email, code }),
  completeRegistration: (payload) => api.post('/auth/register/complete', payload),
  login: (email, password) => api.post('/auth/login', { email, password }),
  googleLogin: (credential) => api.post('/auth/google', { credential }),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  getProfile: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
};

// ─── Chat API ───
export const chatAPI = {
  sendMessage: (message, session_id) => api.post('/chat', { message, session_id }),
  getHistory: (params) => api.get('/chat/history', { params }),
  getSessions: () => api.get('/chat/sessions'),
};

// ─── Health API ───
export const healthAPI = {
  getLogs: (params) => api.get('/health-logs', { params }),
  getLog: (id) => api.get(`/health-logs/${id}`),
  createLog: (data) => api.post('/health-logs', data),
  updateLog: (id, data) => api.put(`/health-logs/${id}`, data),
  deleteLog: (id) => api.delete(`/health-logs/${id}`),
  getWeeklySummary: () => api.get('/health-logs/summary/weekly'),
};

// ─── Finance API ───
export const financeAPI = {
  getLogs: (params) => api.get('/finance', { params }),
  getLog: (id) => api.get(`/finance/${id}`),
  createLog: (data) => api.post('/finance', data),
  updateLog: (id, data) => api.put(`/finance/${id}`, data),
  deleteLog: (id) => api.delete(`/finance/${id}`),
  getWeeklySummary: () => api.get('/finance/summary/weekly'),
};

// ─── Admin API ───
export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  getUsers: (params) => api.get('/admin/users', { params }),
  updateUserStatus: (id, isActive) => api.put(`/admin/users/${id}/status`, { is_active: isActive }),
  getLogs: (params) => api.get('/admin/logs', { params }),
};

// ─── Insights API ───
export const insightsAPI = {
  getCurrent: () => api.get('/insights'),
  getHistory: (limit) => api.get('/insights/history', { params: { limit } }),
  generate: () => api.post('/insights/generate'),
  markRead: (id) => api.put(`/insights/${id}/read`),
};

// ─── External Integrations API ───
export const externalAPI = {
  connect: (platform) => api.get(`/external/connect/${platform}`),
  sync: (platform, payload) => api.post(`/external/sync/${platform}`, payload),
  disconnect: (platform) => api.post(`/external/disconnect/${platform}`),
  getStatus: () => api.get('/external/status'),
};

export default api;
