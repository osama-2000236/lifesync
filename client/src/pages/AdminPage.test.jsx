import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AdminPage from './AdminPage';

vi.mock('../services/api', () => ({
  adminAPI: {
    getDashboard: vi.fn(),
    getUsers: vi.fn(),
    getLogs: vi.fn(),
    updateUserStatus: vi.fn(),
  },
}));

vi.mock('../contexts/SettingsContext', () => ({
  useSettings: () => ({
    t: (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
    locale: 'en',
  }),
}));

import { adminAPI } from '../services/api';

describe('AdminPage (UC-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAPI.getDashboard.mockResolvedValue({
      data: {
        data: {
          users: { total: 12, active: 8, new_this_week: 2, admins: 1 },
          activity_24h: { health_logs: 3, finance_logs: 4, chat_messages: 9 },
          product: {
            weekly_reports_total: 5,
            weekly_reports_this_week: 1,
            notifications_unread: 2,
            integrations_connected: 1,
          },
          runtime: {
            redis: { configured: true, ok: true, mode: 'redis' },
            ephemeral_store: 'redis',
            commit: 'abc123def456',
            ai: {
              bert_status: 'ready',
              openrouter_status: 'ready',
              google_fit_configured: false,
            },
          },
          system: {
            errors_24h: 0,
            nlp_avg_ms: 42,
            nlp_max_ms: 100,
            status: 'healthy',
          },
        },
      },
    });
    adminAPI.getUsers.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            username: 'admin_ops',
            email: 'a@test.com',
            role: 'admin',
            is_active: true,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1 },
      },
    });
    adminAPI.getLogs.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            severity: 'info',
            log_type: 'audit',
            action: 'user_activated',
            created_at: '2026-07-11T12:00:00.000Z',
          },
        ],
        pagination: { page: 1, limit: 20, total: 1 },
      },
    });
  });

  it('renders runtime/product metrics grid from dashboard payload', async () => {
    render(<AdminPage />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-runtime-grid')).toBeInTheDocument();
    });

    expect(screen.getByText('redis')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // reports this week
    expect(screen.getByText(/admin\.fitMissing/)).toBeInTheDocument();
    expect(screen.getByText(/abc123def456/)).toBeInTheDocument();
    expect(adminAPI.getDashboard).toHaveBeenCalled();
  });
});
