import { Eye, EyeOff } from 'lucide-react';
import { usePreferences } from '../hooks/usePreferences';

export function HideTranslationToggle() {
  const { hideTranslation, setHideTranslation } = usePreferences();
  return (
    <button
      type="button"
      aria-label={hideTranslation ? 'Show translations' : 'Hide translations'}
      aria-pressed={hideTranslation}
      onClick={() => setHideTranslation(!hideTranslation)}
      className="p-1.5 rounded-pill text-text-subtle hover:text-text hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
    >
      {hideTranslation ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}
