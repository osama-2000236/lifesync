import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SessionsRail from './SessionsRail';

const t = (k) => k;
const SESSIONS = [
  { session_id: 's1', message_count: 4, last_message_at: '2026-07-01T10:00:00Z' },
  { session_id: 's2', message_count: 2, last_message_at: null },
];

describe('SessionsRail', () => {
  it('shows the empty state when there are no sessions', () => {
    render(<SessionsRail sessions={[]} activeId="x" onSelect={() => {}} onNew={() => {}} open={false} onClose={() => {}} t={t} />);
    expect(screen.getByText('chat.noChats')).toBeInTheDocument();
  });

  it('lists sessions, highlights the active one, and selects on click', () => {
    const onSelect = vi.fn();
    render(<SessionsRail sessions={SESSIONS} activeId="s1" onSelect={onSelect} onNew={() => {}} open={false} onClose={() => {}} t={t} />);
    expect(screen.getByTestId('session-s1')).toBeInTheDocument();
    expect(screen.getByTestId('session-s2')).toHaveTextContent('chat.title'); // no date → app title
    fireEvent.click(screen.getByTestId('session-s2'));
    expect(onSelect).toHaveBeenCalledWith('s2');
  });

  it('starts a new chat', () => {
    const onNew = vi.fn();
    render(<SessionsRail sessions={SESSIONS} activeId="s1" onSelect={() => {}} onNew={onNew} open={false} onClose={() => {}} t={t} />);
    fireEvent.click(screen.getAllByTestId('new-chat-button')[0]);
    expect(onNew).toHaveBeenCalled();
  });

  it('renders the mobile sheet when open and closes on backdrop', () => {
    const onClose = vi.fn();
    render(<SessionsRail sessions={SESSIONS} activeId="s1" onSelect={() => {}} onNew={() => {}} open onClose={onClose} t={t} />);
    expect(screen.getByTestId('sessions-sheet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('common.close')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render the sheet when closed', () => {
    render(<SessionsRail sessions={SESSIONS} activeId="s1" onSelect={() => {}} onNew={() => {}} open={false} onClose={() => {}} t={t} />);
    expect(screen.queryByTestId('sessions-sheet')).not.toBeInTheDocument();
  });
});
