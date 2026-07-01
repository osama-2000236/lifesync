import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InterviewPanel from './InterviewPanel';

const t = (k, vars) => (vars ? `${k}-${vars.current}/${vars.total}` : k);

const numberQ = { id: 'sleep', step: 0, total: 2, prompt: 'How many hours?', input_type: 'number', min: 0, max: 24, options: [] };
const choiceQ = {
  id: 'meal', step: 2, total: 3, prompt: 'Meal quality?', input_type: 'choice', min: null, max: null,
  options: [{ value: 'healthy', label: 'Healthy' }, { value: 'junk', label: 'Junk' }],
};

describe('InterviewPanel', () => {
  it('renders nothing without a question', () => {
    const { container } = render(<InterviewPanel question={null} onSubmit={() => {}} t={t} />);
    expect(container.firstChild).toBeNull();
  });

  it('submits a number via button and Enter', () => {
    const onSubmit = vi.fn();
    render(<InterviewPanel question={numberQ} onSubmit={onSubmit} t={t} />);
    const input = screen.getByTestId('number-input');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith(7);
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.click(screen.getByTestId('number-submit'));
    expect(onSubmit).toHaveBeenLastCalledWith(8);
  });

  it('does not submit empty number', () => {
    const onSubmit = vi.fn();
    render(<InterviewPanel question={numberQ} onSubmit={onSubmit} t={t} />);
    fireEvent.keyDown(screen.getByTestId('number-input'), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('number-submit')).toBeDisabled();
  });

  it('does not submit when busy', () => {
    const onSubmit = vi.fn();
    render(<InterviewPanel question={numberQ} busy onSubmit={onSubmit} t={t} />);
    const input = screen.getByTestId('number-input');
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders + submits choice options', () => {
    const onSubmit = vi.fn();
    render(<InterviewPanel question={choiceQ} onSubmit={onSubmit} t={t} />);
    expect(screen.getAllByTestId('choice-option')).toHaveLength(2);
    expect(screen.getAllByTestId('progress-seg')).toHaveLength(3);
    fireEvent.click(screen.getByText('Healthy'));
    expect(onSubmit).toHaveBeenCalledWith('healthy');
  });

  it('ignores choice clicks when busy', () => {
    const onSubmit = vi.fn();
    render(<InterviewPanel question={choiceQ} busy onSubmit={onSubmit} t={t} />);
    fireEvent.click(screen.getByText('Healthy'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
