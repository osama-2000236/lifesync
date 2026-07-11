import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeeklyReportCard from './WeeklyReportCard';

vi.mock('../../services/api', () => ({
  reportsAPI: {
    generate: vi.fn(),
    download: vi.fn(),
  },
}));

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({
    t: (k, vars) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
  }),
}));

vi.mock('../../utils/apiErrors', () => ({
  getApiErrorMessage: (_e, fb) => fb,
}));

import { reportsAPI } from '../../services/api';

describe('WeeklyReportCard (component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom lacks URL.createObjectURL in some setups
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('renders CTA and triggers generate + download', async () => {
    reportsAPI.generate.mockResolvedValue({
      data: { data: { report: { id: 5, week_key: '2026-W28' }, created: true } },
    });
    reportsAPI.download.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    });

    render(<WeeklyReportCard />);
    expect(screen.getByTestId('weekly-report-card')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('report-download-btn'));

    await waitFor(() => {
      expect(reportsAPI.generate).toHaveBeenCalledWith(true);
      expect(reportsAPI.download).toHaveBeenCalledWith(5);
    });
  });

  it('shows error when generate fails', async () => {
    reportsAPI.generate.mockRejectedValue(new Error('boom'));
    render(<WeeklyReportCard />);
    await userEvent.click(screen.getByTestId('report-download-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('report-error')).toBeInTheDocument();
    });
  });
});
