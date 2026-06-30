import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FormField, Input, Textarea, Select } from './FormField';

describe('FormField', () => {
  it('associates the label with the control via htmlFor/id', () => {
    render(
      <FormField id="email" label="Email">
        <Input id="email" />
      </FormField>
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows the required marker', () => {
    render(
      <FormField id="email" label="Email" required>
        <Input id="email" />
      </FormField>
    );
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('renders the error message with role=alert and prefers it over the hint', () => {
    render(
      <FormField id="email" label="Email" hint="We will never share this" error="Required">
        <Input id="email" />
      </FormField>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.queryByText('We will never share this')).not.toBeInTheDocument();
  });

  it('renders the hint when there is no error', () => {
    render(
      <FormField id="email" label="Email" hint="We will never share this">
        <Input id="email" />
      </FormField>
    );
    expect(screen.getByText('We will never share this')).toBeInTheDocument();
  });
});

describe('Input', () => {
  it('marks aria-invalid and applies the error ring when error is true', () => {
    render(<Input error placeholder="x" />);
    expect(screen.getByPlaceholderText('x')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByPlaceholderText('x').className).toContain('border-coral-500');
  });
});

describe('Textarea', () => {
  it('renders and applies the error ring when error is true', () => {
    render(<Textarea error placeholder="notes" />);
    expect(screen.getByPlaceholderText('notes').className).toContain('border-coral-500');
  });
});

describe('Select', () => {
  it('renders its options', () => {
    render(
      <Select aria-label="Currency">
        <option value="usd">USD</option>
        <option value="eur">EUR</option>
      </Select>
    );
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });
});
