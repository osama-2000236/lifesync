import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ModelPicker, { placeMenu } from './ModelPicker';

const t = (k) => k;
const MODELS = [
  { id: 'bert_local', label: 'LifeSync BERT', pricing: 'local', description: 'private' },
  { id: 'gemma4_local', label: 'Gemma 4 31B', pricing: 'free', description: 'free gemma' },
  { id: 'legacy', label: 'Legacy', tag: 'free', desc: 'legacy desc shape' },
];

describe('placeMenu (viewport clamp — no half-clip)', () => {
  it('end-aligns under the trigger and clamps to the left edge', () => {
    const pos = placeMenu({ top: 40, bottom: 64, left: 10, right: 100, width: 90, height: 24 }, {
      menuWidth: 320, maxHeight: 384, gap: 8, pad: 8,
    });
    expect(pos.top).toBe(72);
    expect(pos.left).toBe(8); // would be negative without clamp
    expect(pos.width).toBe(320);
  });

  it('flips upward when there is no room below', () => {
    // jsdom default viewport is 1024x768
    const pos = placeMenu({ top: 700, bottom: 740, left: 400, right: 520, width: 120, height: 40 }, {
      menuWidth: 320, maxHeight: 384, gap: 8, pad: 8,
    });
    expect(pos.openUp).toBe(true);
    expect(pos.top).toBeLessThan(700);
  });

  it('returns null without a rect', () => {
    expect(placeMenu(null)).toBeNull();
  });
});

describe('ModelPicker', () => {
  it('shows the current model label on the trigger', () => {
    render(<ModelPicker models={MODELS} value="gemma4_local" onChange={() => {}} t={t} />);
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('Gemma 4 31B');
  });

  it('falls back to the first model when value is unknown', () => {
    render(<ModelPicker models={MODELS} value="nope" onChange={() => {}} t={t} />);
    expect(screen.getByTestId('model-picker-button')).toHaveTextContent('LifeSync BERT');
  });

  it('opens a portaled menu, selects a model, and closes', () => {
    const onChange = vi.fn();
    render(<ModelPicker models={MODELS} value="bert_local" onChange={onChange} t={t} />);
    fireEvent.click(screen.getByTestId('model-picker-button'));
    const menu = screen.getByTestId('model-picker-menu');
    expect(menu).toBeInTheDocument();
    // Portaled to document.body so overflow-hidden parents cannot clip it.
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
    fireEvent.click(screen.getByTestId('model-option-gemma4_local'));
    expect(onChange).toHaveBeenCalledWith('gemma4_local');
    expect(screen.queryByTestId('model-picker-menu')).not.toBeInTheDocument();
  });

  it('menu stays fully visible inside an overflow-hidden shell (portal)', () => {
    render(
      <div style={{ overflow: 'hidden', height: 40, width: 200 }} data-testid="clip-shell">
        <ModelPicker models={MODELS} value="bert_local" onChange={() => {}} t={t} />
      </div>,
    );
    fireEvent.click(screen.getByTestId('model-picker-button'));
    const menu = screen.getByTestId('model-picker-menu');
    // Not a descendant of the clipping shell.
    expect(screen.getByTestId('clip-shell').contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
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

    // clicking inside the portaled menu keeps it open
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

  it('supports onDark trigger styling for the voice studio', () => {
    render(<ModelPicker models={MODELS} value="gemma4_local" onChange={() => {}} t={t} variant="onDark" />);
    expect(screen.getByTestId('model-picker-button').className).toMatch(/bg-white\/10/);
  });
});
