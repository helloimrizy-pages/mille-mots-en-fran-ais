import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        border: 'var(--border)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-subtle': 'var(--text-subtle)',
        emphasis: 'var(--emphasis)',
        // shadcn compatibility
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        input: 'var(--input)',
        ring: 'var(--ring)',
        'tag-noun-bg': 'var(--tag-noun-bg)',
        'tag-noun-fg': 'var(--tag-noun-fg)',
        'tag-verb-bg': 'var(--tag-verb-bg)',
        'tag-verb-fg': 'var(--tag-verb-fg)',
        'tag-adj-bg': 'var(--tag-adj-bg)',
        'tag-adj-fg': 'var(--tag-adj-fg)',
        'tag-adv-bg': 'var(--tag-adv-bg)',
        'tag-adv-fg': 'var(--tag-adv-fg)',
        'tag-pron-bg': 'var(--tag-pron-bg)',
        'tag-pron-fg': 'var(--tag-pron-fg)',
        'tag-conj-bg': 'var(--tag-conj-bg)',
        'tag-conj-fg': 'var(--tag-conj-fg)',
        'tag-prep-bg': 'var(--tag-prep-bg)',
        'tag-prep-fg': 'var(--tag-prep-fg)',
        'tag-m-bg': 'var(--tag-m-bg)',
        'tag-m-fg': 'var(--tag-m-fg)',
        'tag-f-bg': 'var(--tag-f-bg)',
        'tag-f-fg': 'var(--tag-f-fg)',
        'tag-mf-bg': 'var(--tag-mf-bg)',
        'tag-mf-fg': 'var(--tag-mf-fg)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        pill: '999px',
      },
    },
  },
  plugins: [animate],
};

export default config;
