import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ModelPicker from './ModelPicker';

const t = (k) => k;
const MODELS = [
  { id: 'bert_local', label: 'LifeSync BERT', pricing: 'local', description: 'private' },
  { id: 'gemma4_local', label: 'Gemma 4 31B', pricing: 'free', description: 'free gemma' },
  { id: 'legacy', label: 'Legacy', tag: 'free', desc: 'legacy desc shape' },
];

describe('ModelPicker', () => {
  it('shows the current model label on the trigger', () => {
    render(<ModelPicker models={MODELS} value="gemma4_local" onChange={() => {}} t={t} />);
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('Gemma 4 31B');
  });

  it('falls back to the first model when value is unknown', () => {
    render(<ModelPicker models={MODELS} value="nope" onChange={() => {}} t={t} />);
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('LifeSync BERT');
  });

  it('opens the menu, selects a model, and closes', () => {
    const onChange = vi.fn();
    render(<ModelPicker models={MODELS} value="bert_local" onChange={onChange} t={t} />);
    fireEvent.click(screen.getByTestId('model-picker-button'));
    expect(screen.getByTestId('model-picker-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('model-option-gemma4_local'));
    expect(onChange).toHaveBeenCalledWith('gemma4_local');
    expect(screen.queryByTestId('model-picker-menu')).not.toBeInTheDocument();
  });

  it('marks free and local entries with the right badges', () => {
    render(<ModelPicker models={MODELS} value="bert_local" onChange={() => {}} t={t} />);
    fireEvent.click(screen.getByTestId('model-picker-button'));
    expect(screen.getByTestId('model-option-bert_local')).toHaveTextContent('chat.model.local');
    expect(screen.getByTestId('model-option-gemma4_local')).toHaveTextContent('chat.model.free');
    expect(screen.getByTestId('model-option-legacy')).toHaveTextContent('legacy desc shape');
  });

  it('closes on Escape and on outside click', () => {
    render(
      <div>
        <button type="button" data-testid="outside">out</button>
        <ModelPicker models={MODELS} value="bert_local" onChange={() => {}} t={t} />
      </div>
    );
    fireEvent.click(screen.getByTestId('model-picker-button'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('model-picker-menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('model-picker-button'));
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('model-picker-menu')).not.toBeInTheDocument();

    // clicking inside keeps it open
    fireEvent.click(screen.getByTestId('model-picker-button'));
    fireEvent.mouseDown(screen.getByTestId('model-picker-menu'));
    expect(screen.getByTestId('model-picker-menu')).toBeInTheDocument();
  });

  it('toggles closed from the trigger and respects disabled', () => {
    render(<ModelPicker models={MODELS} value="bert_local" onChange={() => {}} disabled t={t} />);
    const btn = screen.getByTestId('model-picker-button');
    expect(btn).toBeDisabled();
  });

  it('shows a placeholder when the catalog is empty', () => {
    render(<ModelPicker models={[]} value="anything" onChange={() => {}} t={t} />);
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('model.noModel');
  });
});
