// src/services/api.js
import axios from 'axios';
import { getApiBaseUrl } from '../config/runtime';
import { shouldAttemptTokenRefresh } from './authInterceptor';
import { CHAT_REQUEST_TIMEOUT_MS, DEFAULT_API_TIMEOUT_MS } from './requestTimeouts';

const API_BASE = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE,
  timeout: DEFAULT_API_TIMEOUT_MS,
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

    if (shouldAttemptTokenRefresh(error)) {
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
  forgotPasswordSendOTP: (email) => api.post('/auth/forgot-password/send-otp', { email }),
  forgotPasswordVerifyOTP: (email, code) => api.post('/auth/forgot-password/verify-otp', { email, code }),
  resetPassword: (email, password) => api.post('/auth/forgot-password/reset', { email, password }),
  changePassword: (currentPassword, newPassword) => api.post('/auth/change-password', { currentPassword, newPassword }),
  changeEmailSendOTP: (newEmail) => api.post('/auth/change-email/send-otp', { newEmail }),
  changeEmailVerifyOTP: (newEmail, code) => api.post('/auth/change-email/verify-otp', { newEmail, code }),
  deleteAccount: () => api.delete('/auth/me'),
};

// ─── Chat API ───
// Uses SSE streaming to bypass proxy idle timeouts and provide real-time feedback.
// Falls back to JSON endpoint if SSE fails.
export const chatAPI = {
  /**
   * Send a chat message via SSE streaming.
   * Returns callbacks for each event type.
   *
   * @param {string} message
   * @param {string} session_id
   * @param {Object} callbacks - { onAck, onStatus, onComplete, onError }
   * @returns {function} abort - call to cancel the request
   */
  sendMessageStream: (message, session_id, callbacks = {}) => {
    const controller = new AbortController();
    const token = localStorage.getItem('accessToken');

    // 3-minute safety timeout for completely hung connections
    const timeout = setTimeout(() => controller.abort(), 180_000);

    fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, session_id }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody.error || `HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        let currentEvent = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop(); // keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith(':')) continue; // heartbeat comment
            if (line.startsWith('event:')) {
              currentEvent = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              const dataStr = line.slice(5).trim();
              if (!dataStr) continue;
              try {
                const data = JSON.parse(dataStr);
                if (currentEvent === 'ack' && callbacks.onAck) callbacks.onAck(data);
                else if (currentEvent === 'status' && callbacks.onStatus) callbacks.onStatus(data);
                else if (currentEvent === 'complete' && callbacks.onComplete) callbacks.onComplete(data);
                else if (currentEvent === 'error' && callbacks.onError) callbacks.onError(data);
                else if (currentEvent === 'done') { /* stream finished */ }
              } catch { /* ignore malformed JSON */ }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          // Only fire onError if this was a timeout abort, not a user abort
          if (callbacks.onError && !controller.signal.reason) {
            callbacks.onError({
              message: 'The AI is taking longer than usual. Please try again in a moment.',
              retryable: true,
            });
          }
          return;
        }
        let message = 'Connection failed. Please try again.';
        if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
          message = 'Network error — please check your connection and try again.';
        }
        if (callbacks.onError) callbacks.onError({ message, retryable: true });
      })
      .finally(() => clearTimeout(timeout));

    return () => { clearTimeout(timeout); controller.abort('user_cancel'); };
  },

  // JSON fallback (backwards compatible)
  sendMessage: (message, session_id) => api.post('/chat', { message, session_id }, { timeout: 150000 }),

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
