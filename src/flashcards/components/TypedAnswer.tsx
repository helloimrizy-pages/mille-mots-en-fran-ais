import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
}

export function TypedAnswer({ value, onChange, onSubmit, placeholder, disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="w-full"
    >
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full text-base px-3 py-2 rounded-md bg-surface border border-border focus:outline-none focus:ring-2 focus:ring-emphasis/40"
        aria-label="Type your answer"
      />
    </form>
  );
}
