import { render } from '@testing-library/react';
import { SettingsProvider } from '../contexts/SettingsContext';

/** Wraps ui in the app's real context providers a component under test needs. */
export function renderWithSettings(ui) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}
