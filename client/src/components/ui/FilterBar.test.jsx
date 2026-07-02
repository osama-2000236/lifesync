import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithSettings } from '../../test/renderWithProviders';
import { FilterBar, EmptyListState, Pagination } from './FilterBar';

describe('FilterBar', () => {
  it('calls onSearchChange as the user types', () => {
    const onSearchChange = vi.fn();
    render(<FilterBar search="" onSearchChange={onSearchChange} searchPlaceholder="Search logs" />);
    fireEvent.change(screen.getByPlaceholderText('Search logs'), { target: { value: 'coffee' } });
    expect(onSearchChange).toHaveBeenCalledWith('coffee');
  });

  it('renders filter pills and calls onClick', () => {
    const onClick = vi.fn();
    render(
      <FilterBar
        search=""
        onSearchChange={() => {}}
        filters={[{ key: 'all', label: 'All', active: true, onClick }]}
      />
    );
    fireEvent.click(screen.getByText('All'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('styles an inactive filter pill differently from the active one', () => {
    render(
      <FilterBar
        search=""
        onSearchChange={() => {}}
        filters={[
          { key: 'all', label: 'All', active: true, onClick: () => {} },
          { key: 'income', label: 'Income', active: false, onClick: () => {} },
        ]}
      />
    );
    expect(screen.getByText('All').className).toContain('bg-emerald-500');
    expect(screen.getByText('Income').className).not.toContain('bg-emerald-500');
  });
});

describe('EmptyListState', () => {
  it('renders title and subtitle', () => {
    renderWithSettings(<EmptyListState title="No logs yet" subtitle="Log something to see it here" />);
    expect(screen.getByText('No logs yet')).toBeInTheDocument();
    expect(screen.getByText('Log something to see it here')).toBeInTheDocument();
  });

  it('falls back to the localized default title', () => {
    renderWithSettings(<EmptyListState />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = renderWithSettings(<Pagination page={1} totalPages={1} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('disables prev on the first page and next on the last page', () => {
    renderWithSettings(<Pagination page={1} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).not.toBeDisabled();
  });

  it('calls onPageChange with the next page number', () => {
    const onPageChange = vi.fn();
    renderWithSettings(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
