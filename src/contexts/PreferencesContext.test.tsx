import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreferencesProvider } from './PreferencesContext';
import { usePreferences } from '../hooks/usePreferences';

function Probe() {
  const { theme, hideTranslation, setTheme, setHideTranslation } = usePreferences();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="hide">{hideTranslation ? 'hidden' : 'shown'}</span>
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>toggle-theme</button>
      <button onClick={() => setHideTranslation(!hideTranslation)}>toggle-hide</button>
    </div>
  );
}

describe('PreferencesContext', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to light + translation shown when no stored prefs', () => {
    render(<PreferencesProvider><Probe /></PreferencesProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('hide').textContent).toBe('shown');
  });

  it('persists changes to localStorage', async () => {
    render(<PreferencesProvider><Probe /></PreferencesProvider>);
    await userEvent.click(screen.getByText('toggle-theme'));
    await userEvent.click(screen.getByText('toggle-hide'));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('hide').textContent).toBe('hidden');
    const stored = JSON.parse(localStorage.getItem('mille-mots-prefs')!);
    expect(stored).toEqual({ theme: 'dark', hideTranslation: true });
  });

  it('rehydrates from localStorage on mount', () => {
    localStorage.setItem('mille-mots-prefs', JSON.stringify({ theme: 'dark', hideTranslation: true }));
    render(<PreferencesProvider><Probe /></PreferencesProvider>);
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('hide').textContent).toBe('hidden');
  });

  it('sets data-theme attribute on <html>', async () => {
    render(<PreferencesProvider><Probe /></PreferencesProvider>);
    await userEvent.click(screen.getByText('toggle-theme'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
