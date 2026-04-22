import { createContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

export interface Preferences {
  theme: Theme;
  hideTranslation: boolean;
  setTheme: (t: Theme) => void;
  setHideTranslation: (v: boolean) => void;
}

export const PreferencesContext = createContext<Preferences | null>(null);

const STORAGE_KEY = 'mille-mots-prefs';

interface Stored {
  theme: Theme;
  hideTranslation: boolean;
}

function loadStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.theme !== 'light' && parsed.theme !== 'dark') return null;
    if (typeof parsed.hideTranslation !== 'boolean') return null;
    return parsed;
  } catch {
    return null;
  }
}

function defaultTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(() => loadStored() ?? {
    theme: defaultTheme(),
    hideTranslation: false,
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    document.documentElement.setAttribute('data-theme', state.theme);
  }, [state]);

  const value: Preferences = {
    theme: state.theme,
    hideTranslation: state.hideTranslation,
    setTheme: (t) => setState((s) => ({ ...s, theme: t })),
    setHideTranslation: (v) => setState((s) => ({ ...s, hideTranslation: v })),
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
