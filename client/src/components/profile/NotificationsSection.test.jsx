import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsSection from './NotificationsSection';

vi.mock('../../services/api', () => ({
  reportsAPI: {
    listNotifications: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    markNotificationRead: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ t: (k) => k }),
}));

vi.mock('../../utils/apiErrors', () => ({
  getApiErrorMessage: (_e, fb) => fb,
}));

import { reportsAPI } from '../../services/api';

describe('NotificationsSection (component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportsAPI.listNotifications.mockResolvedValue({
      data: {
        data: {
          notifications: [
            { id: 1, title: 'Report ready', body: 'Week 28', read_at: null },
          ],
          unread_count: 1,
        },
      },
    });
    reportsAPI.updatePreferences.mockResolvedValue({ data: { success: true } });
    reportsAPI.markAllNotificationsRead.mockResolvedValue({ data: { success: true } });
  });

  it('lists notifications and shows unread count', async () => {
    render(<NotificationsSection />);
    await waitFor(() => {
      expect(screen.getByTestId('notify-list')).toBeInTheDocument();
      expect(screen.getByTestId('unread-count')).toHaveTextContent('1');
    });
    expect(screen.getByText('Report ready')).toBeInTheDocument();
  });

  it('toggles notify preference', async () => {
    render(<NotificationsSection />);
    await waitFor(() => screen.getByTestId('notify-toggle'));
    await userEvent.click(screen.getByTestId('notify-toggle'));
    await waitFor(() => {
      expect(reportsAPI.updatePreferences).toHaveBeenCalledWith({ report_notify_enabled: false });
    });
  });
});
