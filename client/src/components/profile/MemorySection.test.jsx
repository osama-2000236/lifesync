import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MemorySection from './MemorySection';
import { memoryAPI } from '../../services/api';

vi.mock('../../contexts/SettingsContext', () => ({
  useSettings: () => ({ t: (k) => k, locale: 'en' }),
}));

vi.mock('../../services/api', () => ({
  memoryAPI: {
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
}));

const rows = (memories) => ({ data: { data: { memories } } });

describe('MemorySection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('empty state when nothing is remembered', async () => {
    memoryAPI.list.mockResolvedValue(rows([]));
    render(<MemorySection />);
    await waitFor(() => expect(screen.getByTestId('memory-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('memory-clear')).not.toBeInTheDocument();
  });

  it('lists facts with source honesty and forgets one on delete', async () => {
    memoryAPI.list.mockResolvedValue(rows([
      { id: 1, mem_key: 'name', category: 'profile', value: 'Osama', source: 'chat' },
      { id: 2, mem_key: 'diet.vegetarian', category: 'preference', value: 'vegetarian', source: 'user' },
    ]));
    memoryAPI.remove.mockResolvedValue({ data: { data: { deleted: true } } });
    render(<MemorySection />);
    await waitFor(() => expect(screen.getByText('Osama')).toBeInTheDocument());
    expect(screen.getByTestId('memory-row-1')).toHaveTextContent('profile.memory.sourceChat');
    expect(screen.getByTestId('memory-row-2')).toHaveTextContent('profile.memory.sourceUser');
    fireEvent.click(screen.getByTestId('memory-delete-1'));
    await waitFor(() => expect(screen.queryByText('Osama')).not.toBeInTheDocument());
    expect(memoryAPI.remove).toHaveBeenCalledWith(1);
  });

  it('edits a wrong fact and shows the corrected row', async () => {
    memoryAPI.list.mockResolvedValue(rows([
      { id: 1, mem_key: 'name', category: 'profile', value: 'Osana', source: 'chat' },
    ]));
    memoryAPI.update.mockResolvedValue({
      data: { data: { memory: { id: 1, mem_key: 'name', category: 'profile', value: 'Osama', source: 'user' } } },
    });
    render(<MemorySection />);
    await waitFor(() => expect(screen.getByText('Osana')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('memory-edit-1'));
    fireEvent.change(screen.getByTestId('memory-edit-input'), { target: { value: 'Osama' } });
    fireEvent.click(screen.getByTestId('memory-save'));
    await waitFor(() => expect(screen.getByText('Osama')).toBeInTheDocument());
    expect(memoryAPI.update).toHaveBeenCalledWith(1, 'Osama');
    expect(screen.getByTestId('memory-row-1')).toHaveTextContent('profile.memory.sourceUser');
  });

  it('clear-all needs a confirm step, then wipes', async () => {
    memoryAPI.list.mockResolvedValue(rows([
      { id: 1, mem_key: 'name', category: 'profile', value: 'Osama', source: 'chat' },
    ]));
    memoryAPI.clear.mockResolvedValue({ data: { data: { deleted: 1 } } });
    render(<MemorySection />);
    await waitFor(() => expect(screen.getByTestId('memory-clear')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('memory-clear'));
    expect(memoryAPI.clear).not.toHaveBeenCalled(); // no wipe without confirm
    fireEvent.click(screen.getByTestId('memory-clear-confirm'));
    await waitFor(() => expect(screen.getByTestId('memory-empty')).toBeInTheDocument());
    expect(memoryAPI.clear).toHaveBeenCalledTimes(1);
  });
});
