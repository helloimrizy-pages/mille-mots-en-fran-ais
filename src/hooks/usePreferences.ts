import { useContext } from 'react';
import { PreferencesContext, type Preferences } from '../contexts/PreferencesContext';

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
