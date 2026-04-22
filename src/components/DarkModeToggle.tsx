import { Moon, Sun } from 'lucide-react';
import { usePreferences } from '../hooks/usePreferences';

export function DarkModeToggle() {
  const { theme, setTheme } = usePreferences();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="p-1.5 rounded-pill text-text-subtle hover:text-text hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
