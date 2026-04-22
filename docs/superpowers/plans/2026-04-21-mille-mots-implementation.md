# Mille Mots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static web app that lists the 1000 most frequent French words with filtering, expand-for-example, and native-quality audio pronunciation, plus the data pipeline that generates its dataset and audio files.

**Architecture:** Fully static Vite + React + TypeScript SPA fetching a single `words.json` at runtime and playing pre-generated mp3s from `public/audio/`. A separate set of `tsx` pipeline scripts generates `words.json` from a public frequency list, enriches it via an LLM, and produces audio via Google Cloud TTS. App and pipeline share the `Word` type.

**Tech Stack:** Vite, React 19, TypeScript (strict), Tailwind CSS, shadcn/ui, react-virtuoso, Lucide icons, Vitest, React Testing Library, Zod, Google Cloud Text-to-Speech, Anthropic SDK (or OpenAI — whichever the implementer has).

---

## Reference: Design spec

This plan implements `docs/superpowers/specs/2026-04-21-mille-mots-design.md`. Read it first if any task feels under-specified.

---

## Phases at a glance

- **Phase 0 — Bootstrap:** tasks 1-4 (project init, Tailwind, shadcn, types+seed)
- **Phase 1 — Core list:** tasks 5-8 (filter hook, row, expanded, virtualized list)
- **Phase 2 — Preferences + top bar:** tasks 9-13
- **Phase 3 — App shell + audio:** tasks 14-15
- **Phase 4 — Data pipeline:** tasks 16-22
- **Phase 5 — Swap + deploy:** tasks 23-24

---

## File Structure (lock-in)

```
french-app/
├── public/
│   ├── words.json                          # created by pipeline; seed initially
│   └── audio/{words,sentences}/            # created by pipeline
├── src/
│   ├── main.tsx                            # React entry
│   ├── App.tsx                             # root component — fetch, wire state
│   ├── types.ts                            # Word, PartOfSpeech, Gender
│   ├── seed-data.ts                        # temporary in-code dataset used until pipeline runs
│   ├── lib/
│   │   ├── utils.ts                        # shadcn cn()
│   │   └── slugify.ts                      # URL-safe filename helper (shared w/ pipeline)
│   ├── contexts/
│   │   └── PreferencesContext.tsx          # theme + hideTranslation, localStorage-backed
│   ├── hooks/
│   │   ├── useFilteredWords.ts
│   │   ├── usePreferences.ts
│   │   └── useAudio.ts
│   ├── components/
│   │   ├── TopBar.tsx
│   │   ├── SearchInput.tsx
│   │   ├── FilterChips.tsx
│   │   ├── SortMenu.tsx
│   │   ├── DarkModeToggle.tsx
│   │   ├── HideTranslationToggle.tsx
│   │   ├── WordList.tsx
│   │   ├── WordRow.tsx
│   │   ├── WordRowExpanded.tsx
│   │   └── ui/                             # shadcn-generated primitives
│   └── styles/globals.css
├── scripts/
│   ├── _shared/
│   │   ├── schema.ts                       # Zod schemas (shared w/ validator)
│   │   └── io.ts                           # load/save JSON helpers
│   ├── 01-fetch-frequency.ts
│   ├── 02-enrich.ts
│   ├── 03-validate.ts
│   ├── 04-tts-words.ts
│   ├── 05-tts-sentences.ts
│   └── 06-build-words-json.ts
├── tests/                                  # colocate next to source where possible; integration tests here
├── data/                                   # gitignored — pipeline intermediates
├── .env.example
├── .gitignore
├── tailwind.config.ts
├── postcss.config.js
├── components.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
├── tsconfig.node.json
└── package.json
```

**Conventions:**
- Tests colocate with source as `X.test.ts(x)` next to `X.ts(x)`.
- Commit after each task completes (not each step).
- **Do not include `Co-Authored-By: Claude` or any Claude attribution in commit messages.**
- Use `npm`. Node 20+.

---

## Task 1: Initialize Vite + React + TypeScript project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: Scaffold Vite project into the current directory**

Run:
```bash
npm create vite@latest . -- --template react-ts
```
When prompted "Current directory is not empty…", choose **Ignore files and continue**. The `.git`, `.gitignore`, `docs/`, `.superpowers/`, `.claude/` already there are kept.

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install
```
Expected: dependencies install without errors.

- [ ] **Step 3: Enable TypeScript strict mode**

Open `tsconfig.json` and ensure the `compilerOptions` block contains:
```json
"strict": true,
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true
```
(Add these keys if missing. Vite's template already sets `strict: true` but the other two are extra safety we want.)

- [ ] **Step 4: Verify dev server starts**

Run:
```bash
npm run dev
```
Expected: "Local: http://localhost:5173" in the output. Open it in a browser, see the default Vite + React splash. `Ctrl+C` to stop.

- [ ] **Step 5: Install Vitest + React Testing Library**

Run:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 7: Create `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';

// jsdom does not implement HTMLMediaElement.play / pause; stub them so
// components using <audio>/new Audio() don't crash under test.
window.HTMLMediaElement.prototype.play = function () {
  return Promise.resolve();
};
window.HTMLMediaElement.prototype.pause = function () {};
```

- [ ] **Step 8: Add test script to package.json**

In `package.json`, inside `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 9: Smoke-test Vitest**

Create `src/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```
Run: `npm test`
Expected: 1 test passed. Delete `src/smoke.test.ts` after.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project with Vitest"
```

---

## Task 2: Install and configure Tailwind CSS + theme tokens + fonts

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.js`, `src/styles/globals.css`
- Modify: `src/main.tsx` (import globals.css), `index.html` (lang, title)

- [ ] **Step 1: Install Tailwind v4 and required plugins**

Run:
```bash
npm install -D tailwindcss@^3.4 postcss autoprefixer
npm install @fontsource-variable/inter @fontsource-variable/jetbrains-mono
```
(Using Tailwind 3.x for shadcn/ui compatibility. Switch to 4 later if desired.)

- [ ] **Step 2: Generate Tailwind config**

Run:
```bash
npx tailwindcss init -p --ts
```
This creates `tailwind.config.ts` and `postcss.config.js`.

- [ ] **Step 3: Write `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

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
        accent: 'var(--accent)',
        // POS tag palettes (bg / fg pairs)
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
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Write `src/styles/globals.css`**

```css
@import '@fontsource-variable/inter';
@import '@fontsource-variable/jetbrains-mono';

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #F7F3EC;
  --surface: #FFFFFF;
  --surface-muted: #FAF6EF;
  --border: #F0EDE7;
  --text: #2A2826;
  --text-muted: #7D7468;
  --text-subtle: #97907F;
  --accent: #2A2826;

  --tag-noun-bg: #E8EDE5;  --tag-noun-fg: #56684F;
  --tag-verb-bg: #F0E6DA;  --tag-verb-fg: #6E5740;
  --tag-adj-bg:  #EDE4F0;  --tag-adj-fg:  #5F4E6B;
  --tag-adv-bg:  #F0E8DA;  --tag-adv-fg:  #6E5C3A;
  --tag-pron-bg: #E6EBE4;  --tag-pron-fg: #4D6350;
  --tag-conj-bg: #EDE8DC;  --tag-conj-fg: #6E6647;
  --tag-prep-bg: #E4EBE8;  --tag-prep-fg: #4F6660;

  --tag-m-bg:  #E4EBF0;  --tag-m-fg:  #4D6378;
  --tag-f-bg:  #F3E4E8;  --tag-f-fg:  #7A4E5A;
  --tag-mf-bg: #E9E6ED;  --tag-mf-fg: #5F5868;
}

[data-theme="dark"] {
  --bg: #1C1B19;
  --surface: #27251F;
  --surface-muted: #201E19;
  --border: #2F2C26;
  --text: #EAE6DC;
  --text-muted: #B0A99A;
  --text-subtle: #8C8578;
  --accent: #EAE6DC;

  --tag-noun-bg: #2F3A2C;  --tag-noun-fg: #B7C9B0;
  --tag-verb-bg: #3B3124;  --tag-verb-fg: #D9C3A6;
  --tag-adj-bg:  #362D3D;  --tag-adj-fg:  #C6B3D3;
  --tag-adv-bg:  #3B3224;  --tag-adv-fg:  #D3BE8F;
  --tag-pron-bg: #2E3A2E;  --tag-pron-fg: #B6C5B6;
  --tag-conj-bg: #39342A;  --tag-conj-fg: #CCC29D;
  --tag-prep-bg: #2C3A35;  --tag-prep-fg: #B0C6BE;

  --tag-m-bg:  #2C3A44;  --tag-m-fg:  #B0C5D5;
  --tag-f-bg:  #3E2D33;  --tag-f-fg:  #D7B0BC;
  --tag-mf-bg: #332F39;  --tag-mf-fg: #B5AEC0;
}

html, body, #root { height: 100%; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: theme('fontFamily.sans');
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 5: Import globals.css in `src/main.tsx`**

Replace `src/main.tsx` with:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Delete `src/App.css` and `src/index.css` if present.

- [ ] **Step 6: Simplify `src/App.tsx`**

```tsx
export default function App() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">Mille Mots</h1>
      <p className="text-text-muted mt-2">Bootstrap check.</p>
    </div>
  );
}
```

- [ ] **Step 7: Update `index.html`**

Ensure `<html lang="en">` and `<title>Mille Mots</title>`.

- [ ] **Step 8: Verify visually**

Run `npm run dev`, open http://localhost:5173. You should see "Mille Mots" in dark text on warm off-white background, Inter font. Toggle DevTools → set `data-theme="dark"` on the `<html>` element — colors should invert to warm dark.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: configure Tailwind, theme tokens, Inter + JetBrains Mono"
```

---

## Task 3: Install shadcn/ui primitives

**Files:**
- Create: `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,input,badge,dropdown-menu,switch,toggle}.tsx`

- [ ] **Step 1: Install shadcn CLI and initialize**

Run:
```bash
npx shadcn@latest init
```
Answer prompts:
- Style → **Default**
- Base color → **Neutral** (we override with our own tokens)
- CSS variables → **yes**
- tailwind.config location → `tailwind.config.ts`
- components alias → `@/components`
- utils alias → `@/lib/utils`
- React Server Components → **no**

This creates `components.json` and `src/lib/utils.ts` (with the `cn()` helper). If the init overwrites `src/styles/globals.css`, revert it to our custom version from Task 2.

- [ ] **Step 2: Add path alias in tsconfig.json**

Ensure `compilerOptions` includes:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 3: Add path alias in vite.config.ts**

Install: `npm install -D @types/node`
Then replace `vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 4: Install the primitives we use**

Run:
```bash
npx shadcn@latest add button input badge dropdown-menu switch toggle
```
Accept overwrites. Components land in `src/components/ui/`.

- [ ] **Step 5: Verify compilation**

Run `npm run build`. Expected: `dist/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: install shadcn/ui primitives (button, input, badge, dropdown-menu, switch, toggle)"
```

---

## Task 4: Define Word type and seed dataset

**Files:**
- Create: `src/types.ts`, `src/seed-data.ts`, `src/lib/slugify.ts`
- Test: `src/lib/slugify.test.ts`

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type PartOfSpeech =
  | 'noun' | 'verb' | 'adjective' | 'adverb'
  | 'pronoun' | 'conjunction' | 'preposition';

export type Gender = 'm' | 'f' | 'mf';

export interface Synonym {
  word: string;
  note?: string;
}

export interface Word {
  id: number;
  rank: number;
  french: string;
  english: string;
  pos: PartOfSpeech;
  gender?: Gender;
  plural?: string;
  ipa: string;
  example: { fr: string; en: string };
  synonyms?: Synonym[];
  audio: { word: string; sentence: string };
}

export const ALL_POS: readonly PartOfSpeech[] = [
  'noun', 'verb', 'adjective', 'adverb',
  'pronoun', 'conjunction', 'preposition',
] as const;

export const POS_LABEL: Record<PartOfSpeech, string> = {
  noun: 'Noun',
  verb: 'Verb',
  adjective: 'Adj',
  adverb: 'Adv',
  pronoun: 'Pron',
  conjunction: 'Conj',
  preposition: 'Prep',
};
```

- [ ] **Step 2: Write `src/lib/slugify.test.ts` (failing test)**

```ts
import { describe, it, expect } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('lowercases plain words', () => {
    expect(slugify('Livre')).toBe('livre');
  });
  it('replaces French accents with ASCII equivalents', () => {
    expect(slugify('école')).toBe('ecole');
    expect(slugify('être')).toBe('etre');
    expect(slugify('ça')).toBe('ca');
    expect(slugify('où')).toBe('ou');
  });
  it('replaces spaces and apostrophes with dashes', () => {
    expect(slugify("qu'est-ce que")).toBe('qu-est-ce-que');
  });
  it('strips non-alphanumeric non-dash characters', () => {
    expect(slugify('bonjour!')).toBe('bonjour');
  });
  it('collapses consecutive dashes', () => {
    expect(slugify('a -- b')).toBe('a-b');
  });
});
```

- [ ] **Step 3: Run the test — expect failure**

```bash
npm test -- src/lib/slugify.test.ts
```
Expected: test fails — `slugify` module not found.

- [ ] **Step 4: Implement `src/lib/slugify.ts`**

```ts
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
```

- [ ] **Step 5: Run the test — expect pass**

```bash
npm test -- src/lib/slugify.test.ts
```
Expected: 5 tests passed.

- [ ] **Step 6: Write `src/seed-data.ts`**

A small hand-crafted dataset to develop against until the pipeline produces `words.json`.

```ts
import type { Word } from './types';

export const SEED_WORDS: Word[] = [
  {
    id: 1, rank: 1, french: 'être', english: 'to be',
    pos: 'verb', ipa: 'ɛtʁ',
    example: { fr: 'Je veux être heureux.', en: 'I want to be happy.' },
    audio: { word: '/audio/words/etre.mp3', sentence: '/audio/sentences/etre.mp3' },
  },
  {
    id: 2, rank: 2, french: 'avoir', english: 'to have',
    pos: 'verb', ipa: 'a.vwaʁ',
    example: { fr: "J'ai un livre.", en: 'I have a book.' },
    audio: { word: '/audio/words/avoir.mp3', sentence: '/audio/sentences/avoir.mp3' },
  },
  {
    id: 3, rank: 42, french: 'livre', english: 'book',
    pos: 'noun', gender: 'm', plural: 'livres', ipa: 'livʁ',
    example: { fr: "J'ai acheté un livre hier.", en: 'I bought a book yesterday.' },
    synonyms: [{ word: 'bouquin', note: 'informal' }],
    audio: { word: '/audio/words/livre.mp3', sentence: '/audio/sentences/livre.mp3' },
  },
  {
    id: 4, rank: 80, french: 'maison', english: 'house',
    pos: 'noun', gender: 'f', plural: 'maisons', ipa: 'mɛ.zɔ̃',
    example: { fr: 'Leur maison est grande.', en: 'Their house is big.' },
    audio: { word: '/audio/words/maison.mp3', sentence: '/audio/sentences/maison.mp3' },
  },
  {
    id: 5, rank: 150, french: 'rapidement', english: 'quickly',
    pos: 'adverb', ipa: 'ʁa.pid.mɑ̃',
    example: { fr: 'Il court rapidement.', en: 'He runs quickly.' },
    audio: { word: '/audio/words/rapidement.mp3', sentence: '/audio/sentences/rapidement.mp3' },
  },
  {
    id: 6, rank: 95, french: 'petit', english: 'small',
    pos: 'adjective', ipa: 'pə.ti',
    example: { fr: 'Un petit chat dort.', en: 'A small cat is sleeping.' },
    audio: { word: '/audio/words/petit.mp3', sentence: '/audio/sentences/petit.mp3' },
  },
  {
    id: 7, rank: 12, french: 'je', english: 'I',
    pos: 'pronoun', ipa: 'ʒə',
    example: { fr: 'Je parle français.', en: 'I speak French.' },
    audio: { word: '/audio/words/je.mp3', sentence: '/audio/sentences/je.mp3' },
  },
  {
    id: 8, rank: 20, french: 'mais', english: 'but',
    pos: 'conjunction', ipa: 'mɛ',
    example: { fr: 'Je veux mais je ne peux pas.', en: 'I want to but I cannot.' },
    audio: { word: '/audio/words/mais.mp3', sentence: '/audio/sentences/mais.mp3' },
  },
  {
    id: 9, rank: 9, french: 'à', english: 'to, at',
    pos: 'preposition', ipa: 'a',
    example: { fr: 'Je vais à Paris.', en: 'I am going to Paris.' },
    audio: { word: '/audio/words/a.mp3', sentence: '/audio/sentences/a.mp3' },
  },
  {
    id: 10, rank: 300, french: 'parler', english: 'to speak',
    pos: 'verb', ipa: 'paʁ.le',
    example: { fr: 'Nous aimons parler français.', en: 'We like to speak French.' },
    audio: { word: '/audio/words/parler.mp3', sentence: '/audio/sentences/parler.mp3' },
  },
];
```

Note: audio files don't exist yet. Clicking audio buttons will silently fail until Task 22. Acceptable during dev.

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```
Expected: all tests pass (slugify suite).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Word types, slugify helper, and seed dataset"
```

---

## Task 5: useFilteredWords hook (TDD)

**Files:**
- Create: `src/hooks/useFilteredWords.ts`
- Test: `src/hooks/useFilteredWords.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredWords } from './useFilteredWords';
import type { Word } from '../types';

const words: Word[] = [
  { id: 1, rank: 3, french: 'avoir', english: 'to have', pos: 'verb', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 2, rank: 1, french: 'être', english: 'to be', pos: 'verb', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 3, rank: 2, french: 'livre', english: 'book', pos: 'noun', gender: 'm', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 4, rank: 5, french: 'maison', english: 'house', pos: 'noun', gender: 'f', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
  { id: 5, rank: 4, french: 'petit', english: 'small', pos: 'adjective', ipa: '', example: { fr: '', en: '' }, audio: { word: '', sentence: '' } },
];

describe('useFilteredWords', () => {
  it('returns all words sorted by rank when no filters', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: '', pos: 'all', sort: 'rank' }));
    expect(result.current.map(w => w.id)).toEqual([2, 3, 1, 5, 4]);
  });

  it('sorts alphabetically by french', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: '', pos: 'all', sort: 'alpha' }));
    expect(result.current.map(w => w.french)).toEqual(['avoir', 'être', 'livre', 'maison', 'petit']);
  });

  it('filters by part of speech', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: '', pos: 'noun', sort: 'rank' }));
    expect(result.current.map(w => w.id)).toEqual([3, 4]);
  });

  it('searches french text case- and accent-insensitively', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'ETR', pos: 'all', sort: 'rank' }));
    expect(result.current.map(w => w.french)).toEqual(['être']);
  });

  it('searches english text', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'house', pos: 'all', sort: 'rank' }));
    expect(result.current.map(w => w.french)).toEqual(['maison']);
  });

  it('combines search and pos filter', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'small', pos: 'adjective', sort: 'rank' }));
    expect(result.current.map(w => w.french)).toEqual(['petit']);
  });

  it('returns empty list when nothing matches', () => {
    const { result } = renderHook(() => useFilteredWords(words, { search: 'xyz', pos: 'all', sort: 'rank' }));
    expect(result.current).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm test -- src/hooks/useFilteredWords.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement `src/hooks/useFilteredWords.ts`**

```ts
import { useMemo } from 'react';
import type { PartOfSpeech, Word } from '../types';

export type SortMode = 'rank' | 'alpha';
export type PosFilter = PartOfSpeech | 'all';

export interface Filters {
  search: string;
  pos: PosFilter;
  sort: SortMode;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function useFilteredWords(words: Word[], filters: Filters): Word[] {
  return useMemo(() => {
    const q = normalize(filters.search.trim());

    const filtered = words.filter((w) => {
      if (filters.pos !== 'all' && w.pos !== filters.pos) return false;
      if (q.length === 0) return true;
      return normalize(w.french).includes(q) || normalize(w.english).includes(q);
    });

    if (filters.sort === 'alpha') {
      return [...filtered].sort((a, b) => a.french.localeCompare(b.french, 'fr'));
    }
    return [...filtered].sort((a, b) => a.rank - b.rank);
  }, [words, filters.search, filters.pos, filters.sort]);
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- src/hooks/useFilteredWords.test.ts
```
Expected: 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add useFilteredWords hook with search/filter/sort"
```

---

## Task 6: WordRow component with click-split interaction

**Files:**
- Create: `src/components/WordRow.tsx`
- Test: `src/components/WordRow.test.tsx`

- [ ] **Step 1: Write failing test — the single most important interaction test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordRow } from './WordRow';
import type { Word } from '../types';

const word: Word = {
  id: 1, rank: 42, french: 'livre', english: 'book',
  pos: 'noun', gender: 'm', plural: 'livres', ipa: 'livʁ',
  example: { fr: "J'ai acheté un livre hier.", en: 'I bought a book yesterday.' },
  audio: { word: '/audio/words/livre.mp3', sentence: '/audio/sentences/livre.mp3' },
};

describe('WordRow click-split', () => {
  it('clicking the French word fires onPlayWord but NOT onToggleExpand', async () => {
    const onPlayWord = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <WordRow
        word={word} expanded={false} hideTranslation={false}
        onPlayWord={onPlayWord} onToggleExpand={onToggleExpand}
        onPlaySentence={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /play pronunciation of livre/i }));
    expect(onPlayWord).toHaveBeenCalledTimes(1);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('clicking elsewhere on the row fires onToggleExpand but NOT onPlayWord', async () => {
    const onPlayWord = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <WordRow
        word={word} expanded={false} hideTranslation={false}
        onPlayWord={onPlayWord} onToggleExpand={onToggleExpand}
        onPlaySentence={() => {}}
      />,
    );
    await userEvent.click(screen.getByText('book'));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onPlayWord).not.toHaveBeenCalled();
  });

  it('renders gender tag only for nouns', () => {
    render(
      <WordRow
        word={word} expanded={false} hideTranslation={false}
        onPlayWord={() => {}} onToggleExpand={() => {}} onPlaySentence={() => {}}
      />,
    );
    expect(screen.getByText('m')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm test -- src/components/WordRow.test.tsx
```

- [ ] **Step 3: Implement `src/components/WordRow.tsx`**

```tsx
import { ChevronDown } from 'lucide-react';
import { POS_LABEL, type Word } from '../types';
import { WordRowExpanded } from './WordRowExpanded';
import { cn } from '@/lib/utils';

interface Props {
  word: Word;
  expanded: boolean;
  hideTranslation: boolean;
  onPlayWord: () => void;
  onPlaySentence: () => void;
  onToggleExpand: () => void;
  isWordPlaying?: boolean;
  isSentencePlaying?: boolean;
}

const POS_TAG_CLASS: Record<Word['pos'], string> = {
  noun: 'bg-tag-noun-bg text-tag-noun-fg',
  verb: 'bg-tag-verb-bg text-tag-verb-fg',
  adjective: 'bg-tag-adj-bg text-tag-adj-fg',
  adverb: 'bg-tag-adv-bg text-tag-adv-fg',
  pronoun: 'bg-tag-pron-bg text-tag-pron-fg',
  conjunction: 'bg-tag-conj-bg text-tag-conj-fg',
  preposition: 'bg-tag-prep-bg text-tag-prep-fg',
};

const GENDER_TAG_CLASS = {
  m: 'bg-tag-m-bg text-tag-m-fg',
  f: 'bg-tag-f-bg text-tag-f-fg',
  mf: 'bg-tag-mf-bg text-tag-mf-fg',
} as const;

export function WordRow(props: Props) {
  const { word, expanded, hideTranslation, onPlayWord, onPlaySentence, onToggleExpand, isWordPlaying, isSentencePlaying } = props;

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <button
            type="button"
            aria-label={`Play pronunciation of ${word.french}`}
            onClick={(e) => { e.stopPropagation(); onPlayWord(); }}
            className={cn(
              'text-base font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded',
              isWordPlaying && 'text-accent',
            )}
          >
            {word.french}
          </button>
          <span className={cn('text-sm text-text-muted truncate', hideTranslation && 'blur-sm hover:blur-none transition-[filter]')}>
            {word.english}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('text-[11px] px-2 py-[2px] rounded-pill', POS_TAG_CLASS[word.pos])}>
            {POS_LABEL[word.pos].toLowerCase()}
          </span>
          {word.gender && (
            <span className={cn('text-[11px] px-2 py-[2px] rounded-pill', GENDER_TAG_CLASS[word.gender])}>
              {word.gender}
            </span>
          )}
          <ChevronDown
            size={14}
            className={cn('text-text-subtle transition-transform', expanded && 'rotate-180')}
          />
        </div>
      </div>
      {expanded && (
        <WordRowExpanded
          word={word}
          hideTranslation={hideTranslation}
          onPlayWord={onPlayWord}
          onPlaySentence={onPlaySentence}
          isSentencePlaying={isSentencePlaying}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create stub `src/components/WordRowExpanded.tsx`** so WordRow compiles

```tsx
import type { Word } from '../types';

interface Props {
  word: Word;
  hideTranslation: boolean;
  onPlayWord: () => void;
  onPlaySentence: () => void;
  isSentencePlaying?: boolean;
}

export function WordRowExpanded(_: Props) {
  return null;
}
```

- [ ] **Step 5: Install lucide-react and testing-library/user-event**

```bash
npm install lucide-react
npm install -D @testing-library/user-event
```

- [ ] **Step 6: Run test — expect pass**

```bash
npm test -- src/components/WordRow.test.tsx
```
Expected: 3 tests passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add WordRow with click-split interaction"
```

---

## Task 7: WordRowExpanded — IPA, example, play-sentence, synonyms/plural

**Files:**
- Modify: `src/components/WordRowExpanded.tsx`

(No new tests — the click-split test in Task 6 is the only interaction worth guarding. The rest is visual and covered by manual QA.)

- [ ] **Step 1: Replace `src/components/WordRowExpanded.tsx`**

```tsx
import { Play, Volume2 } from 'lucide-react';
import type { Word } from '../types';
import { cn } from '@/lib/utils';

interface Props {
  word: Word;
  hideTranslation: boolean;
  onPlayWord: () => void;
  onPlaySentence: () => void;
  isSentencePlaying?: boolean;
}

export function WordRowExpanded({ word, hideTranslation, onPlayWord, onPlaySentence, isSentencePlaying }: Props) {
  return (
    <div
      className="px-4 pb-4 bg-gradient-to-b from-surface-muted to-surface"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-baseline gap-3 flex-wrap text-sm text-text-muted pt-1">
        <button
          type="button"
          aria-label={`Play pronunciation of ${word.french}`}
          onClick={onPlayWord}
          className="flex items-center gap-1 text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
        >
          <span className="font-semibold">{word.french}</span>
          <Volume2 size={13} className="text-text-subtle" />
        </button>
        <span className="font-mono text-xs text-text-subtle">[{word.ipa}]</span>
        <span className={cn(hideTranslation && 'blur-sm hover:blur-none transition-[filter]')}>
          — {word.english}
        </span>
      </div>

      <div className="mt-3 rounded-lg bg-bg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle">Example</span>
          <button
            type="button"
            onClick={onPlaySentence}
            aria-label="Play example sentence"
            className={cn(
              'flex items-center gap-1 text-[11px] px-2 py-[2px] rounded-pill border border-border bg-surface hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              isSentencePlaying && 'text-accent',
            )}
          >
            <Play size={10} /> Play sentence
          </button>
        </div>
        <div className="text-sm font-medium">{word.example.fr}</div>
        <div className={cn('text-sm text-text-muted mt-0.5', hideTranslation && 'blur-sm hover:blur-none transition-[filter]')}>
          {word.example.en}
        </div>
      </div>

      {(word.synonyms?.length || word.plural) && (
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle mr-1">Also:</span>
          {word.plural && (
            <span className="text-[11px] px-2 py-[2px] rounded-pill bg-bg text-text-muted">
              {word.plural} (pl)
            </span>
          )}
          {word.synonyms?.map((s, i) => (
            <span key={i} className="text-[11px] px-2 py-[2px] rounded-pill bg-bg text-text-muted">
              {s.word}{s.note ? ` (${s.note})` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```
Expected: all prior tests still pass.

- [ ] **Step 3: Smoke check in the dev server**

Temporarily edit `src/App.tsx` to render one expanded row against seed data:
```tsx
import { useState } from 'react';
import { WordRow } from './components/WordRow';
import { SEED_WORDS } from './seed-data';

export default function App() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([3]));
  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Mille Mots</h1>
      <div className="bg-surface rounded-card shadow-sm overflow-hidden">
        {SEED_WORDS.map(w => (
          <WordRow
            key={w.id} word={w} expanded={expanded.has(w.id)} hideTranslation={false}
            onPlayWord={() => console.log('play', w.french)}
            onPlaySentence={() => console.log('play sentence', w.french)}
            onToggleExpand={() => {
              setExpanded(prev => {
                const next = new Set(prev);
                next.has(w.id) ? next.delete(w.id) : next.add(w.id);
                return next;
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
```
Run `npm run dev`, verify: rows render, clicking the French word logs "play <word>" only, clicking the rest expands/collapses, expanded row shows IPA + example + play-sentence + synonyms/plural.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add WordRowExpanded with IPA, example, and synonym pills"
```

---

## Task 8: WordList with react-virtuoso

**Files:**
- Create: `src/components/WordList.tsx`

- [ ] **Step 1: Install react-virtuoso**

```bash
npm install react-virtuoso
```

- [ ] **Step 2: Write `src/components/WordList.tsx`**

```tsx
import { Virtuoso } from 'react-virtuoso';
import type { Word } from '../types';
import { WordRow } from './WordRow';

interface Props {
  words: Word[];
  expandedIds: Set<number>;
  hideTranslation: boolean;
  onToggleExpand: (id: number) => void;
  onPlayWord: (word: Word) => void;
  onPlaySentence: (word: Word) => void;
  currentPlayingWordId: number | null;
  currentPlayingSentenceId: number | null;
}

export function WordList(props: Props) {
  const {
    words, expandedIds, hideTranslation,
    onToggleExpand, onPlayWord, onPlaySentence,
    currentPlayingWordId, currentPlayingSentenceId,
  } = props;

  if (words.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted">No words match your filters.</div>
    );
  }

  return (
    <div className="bg-surface rounded-card shadow-sm overflow-hidden">
      <Virtuoso
        useWindowScroll
        data={words}
        computeItemKey={(_, w) => w.id}
        itemContent={(_, word) => (
          <WordRow
            word={word}
            expanded={expandedIds.has(word.id)}
            hideTranslation={hideTranslation}
            onPlayWord={() => onPlayWord(word)}
            onPlaySentence={() => onPlaySentence(word)}
            onToggleExpand={() => onToggleExpand(word.id)}
            isWordPlaying={currentPlayingWordId === word.id}
            isSentencePlaying={currentPlayingSentenceId === word.id}
          />
        )}
      />
    </div>
  );
}
```

- [ ] **Step 3: Smoke-test in browser**

Update `src/App.tsx` to use `WordList`:
```tsx
import { useState } from 'react';
import { WordList } from './components/WordList';
import { SEED_WORDS } from './seed-data';

export default function App() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Mille Mots</h1>
      <WordList
        words={SEED_WORDS}
        expandedIds={expanded}
        hideTranslation={false}
        onToggleExpand={(id) => setExpanded(prev => {
          const next = new Set(prev);
          next.has(id) ? next.delete(id) : next.add(id);
          return next;
        })}
        onPlayWord={(w) => console.log('play', w.french)}
        onPlaySentence={(w) => console.log('sentence', w.french)}
        currentPlayingWordId={null}
        currentPlayingSentenceId={null}
      />
    </div>
  );
}
```
Run `npm run dev`. All 10 seed words render inside a rounded card. Scroll works, expand works.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add virtualized WordList using react-virtuoso"
```

---

## Task 9: PreferencesContext + usePreferences hook

**Files:**
- Create: `src/contexts/PreferencesContext.tsx`, `src/hooks/usePreferences.ts`
- Test: `src/contexts/PreferencesContext.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
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
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- src/contexts/PreferencesContext.test.tsx
```

- [ ] **Step 3: Implement `src/contexts/PreferencesContext.tsx`**

```tsx
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
```

- [ ] **Step 4: Implement `src/hooks/usePreferences.ts`**

```ts
import { useContext } from 'react';
import { PreferencesContext, type Preferences } from '../contexts/PreferencesContext';

export function usePreferences(): Preferences {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
```

- [ ] **Step 5: Run test — expect pass**

```bash
npm test -- src/contexts/PreferencesContext.test.tsx
```
Expected: 4 tests passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PreferencesContext with localStorage persistence"
```

---

## Task 10: SearchInput component

**Files:**
- Create: `src/components/SearchInput.tsx`

- [ ] **Step 1: Write component**

```tsx
import { Search } from 'lucide-react';
import { Input } from './ui/input';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function SearchInput({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2 bg-surface rounded-lg px-3 py-1.5 shadow-sm">
      <Search size={14} className="text-text-subtle shrink-0" />
      <Input
        aria-label="Search a word"
        placeholder="Search a word…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-0 shadow-none h-8 px-0 focus-visible:ring-0 bg-transparent"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add SearchInput component"
```

---

## Task 11: FilterChips component

**Files:**
- Create: `src/components/FilterChips.tsx`

- [ ] **Step 1: Write component**

```tsx
import { ALL_POS, POS_LABEL, type PartOfSpeech } from '../types';
import type { PosFilter } from '../hooks/useFilteredWords';
import { cn } from '@/lib/utils';

interface Props {
  value: PosFilter;
  onChange: (v: PosFilter) => void;
}

export function FilterChips({ value, onChange }: Props) {
  const chips: Array<{ key: PosFilter; label: string }> = [
    { key: 'all', label: 'All' },
    ...ALL_POS.map<{ key: PartOfSpeech; label: string }>((p) => ({ key: p, label: POS_LABEL[p] })),
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1" role="tablist" aria-label="Filter by part of speech">
      {chips.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              'shrink-0 text-xs px-3 py-1 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              active
                ? 'bg-accent text-surface'
                : 'bg-surface text-text-muted hover:bg-surface-muted',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add FilterChips component"
```

---

## Task 12: SortMenu, DarkModeToggle, HideTranslationToggle

**Files:**
- Create: `src/components/SortMenu.tsx`, `src/components/DarkModeToggle.tsx`, `src/components/HideTranslationToggle.tsx`

- [ ] **Step 1: Write `src/components/SortMenu.tsx`**

```tsx
import { ChevronDown, ArrowDownAZ, Hash } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from './ui/dropdown-menu';
import type { SortMode } from '../hooks/useFilteredWords';

interface Props {
  value: SortMode;
  onChange: (v: SortMode) => void;
}

const LABEL: Record<SortMode, string> = { alpha: 'A–Z', rank: 'Frequency' };

export function SortMenu({ value, onChange }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 text-xs px-3 py-1 rounded-pill bg-surface text-text-muted hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
        {LABEL[value]}
        <ChevronDown size={12} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onChange('alpha')}>
          <ArrowDownAZ size={14} className="mr-2" /> A–Z
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onChange('rank')}>
          <Hash size={14} className="mr-2" /> Frequency
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Write `src/components/DarkModeToggle.tsx`**

```tsx
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
      className="p-1.5 rounded-pill text-text-subtle hover:text-text hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
```

- [ ] **Step 3: Write `src/components/HideTranslationToggle.tsx`**

```tsx
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
      className="p-1.5 rounded-pill text-text-subtle hover:text-text hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {hideTranslation ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add SortMenu, DarkModeToggle, HideTranslationToggle"
```

---

## Task 13: TopBar assembly

**Files:**
- Create: `src/components/TopBar.tsx`

- [ ] **Step 1: Write `src/components/TopBar.tsx`**

```tsx
import { SearchInput } from './SearchInput';
import { FilterChips } from './FilterChips';
import { SortMenu } from './SortMenu';
import { DarkModeToggle } from './DarkModeToggle';
import { HideTranslationToggle } from './HideTranslationToggle';
import type { PosFilter, SortMode } from '../hooks/useFilteredWords';

interface Props {
  search: string;
  pos: PosFilter;
  sort: SortMode;
  onSearchChange: (v: string) => void;
  onPosChange: (v: PosFilter) => void;
  onSortChange: (v: SortMode) => void;
  resultCount: number;
}

export function TopBar({ search, pos, sort, onSearchChange, onPosChange, onSortChange, resultCount }: Props) {
  return (
    <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur-md px-4 py-4 border-b border-border">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <div className="font-bold text-lg leading-tight">Mille Mots</div>
          <div className="text-[11px] text-text-subtle">
            {resultCount === 1 ? '1 word' : `${resultCount} words`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SortMenu value={sort} onChange={onSortChange} />
          <DarkModeToggle />
          <HideTranslationToggle />
        </div>
      </div>
      <div className="mb-2"><SearchInput value={search} onChange={onSearchChange} /></div>
      <FilterChips value={pos} onChange={onPosChange} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: assemble TopBar with search, chips, sort, and toggles"
```

---

## Task 14: App shell — load words.json, wire everything, loading + error states

**Files:**
- Modify: `src/App.tsx`, `src/main.tsx`
- Create: `public/words.json` (temporary stub — will be replaced by pipeline)

- [ ] **Step 1: Write temporary `public/words.json`**

Use the seed dataset so the app can fetch from its final URL during dev:

```bash
mkdir -p public
```

Create `public/words.json` with this content:
```json
[
  {"id":1,"rank":1,"french":"être","english":"to be","pos":"verb","ipa":"ɛtʁ","example":{"fr":"Je veux être heureux.","en":"I want to be happy."},"audio":{"word":"/audio/words/etre.mp3","sentence":"/audio/sentences/etre.mp3"}},
  {"id":2,"rank":2,"french":"avoir","english":"to have","pos":"verb","ipa":"a.vwaʁ","example":{"fr":"J'ai un livre.","en":"I have a book."},"audio":{"word":"/audio/words/avoir.mp3","sentence":"/audio/sentences/avoir.mp3"}},
  {"id":3,"rank":42,"french":"livre","english":"book","pos":"noun","gender":"m","plural":"livres","ipa":"livʁ","example":{"fr":"J'ai acheté un livre hier.","en":"I bought a book yesterday."},"synonyms":[{"word":"bouquin","note":"informal"}],"audio":{"word":"/audio/words/livre.mp3","sentence":"/audio/sentences/livre.mp3"}},
  {"id":4,"rank":80,"french":"maison","english":"house","pos":"noun","gender":"f","plural":"maisons","ipa":"mɛ.zɔ̃","example":{"fr":"Leur maison est grande.","en":"Their house is big."},"audio":{"word":"/audio/words/maison.mp3","sentence":"/audio/sentences/maison.mp3"}},
  {"id":5,"rank":150,"french":"rapidement","english":"quickly","pos":"adverb","ipa":"ʁa.pid.mɑ̃","example":{"fr":"Il court rapidement.","en":"He runs quickly."},"audio":{"word":"/audio/words/rapidement.mp3","sentence":"/audio/sentences/rapidement.mp3"}},
  {"id":6,"rank":95,"french":"petit","english":"small","pos":"adjective","ipa":"pə.ti","example":{"fr":"Un petit chat dort.","en":"A small cat is sleeping."},"audio":{"word":"/audio/words/petit.mp3","sentence":"/audio/sentences/petit.mp3"}},
  {"id":7,"rank":12,"french":"je","english":"I","pos":"pronoun","ipa":"ʒə","example":{"fr":"Je parle français.","en":"I speak French."},"audio":{"word":"/audio/words/je.mp3","sentence":"/audio/sentences/je.mp3"}},
  {"id":8,"rank":20,"french":"mais","english":"but","pos":"conjunction","ipa":"mɛ","example":{"fr":"Je veux mais je ne peux pas.","en":"I want to but I cannot."},"audio":{"word":"/audio/words/mais.mp3","sentence":"/audio/sentences/mais.mp3"}},
  {"id":9,"rank":9,"french":"à","english":"to, at","pos":"preposition","ipa":"a","example":{"fr":"Je vais à Paris.","en":"I am going to Paris."},"audio":{"word":"/audio/words/a.mp3","sentence":"/audio/sentences/a.mp3"}},
  {"id":10,"rank":300,"french":"parler","english":"to speak","pos":"verb","ipa":"paʁ.le","example":{"fr":"Nous aimons parler français.","en":"We like to speak French."},"audio":{"word":"/audio/words/parler.mp3","sentence":"/audio/sentences/parler.mp3"}}
]
```

- [ ] **Step 2: Wrap App in provider — update `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { PreferencesProvider } from './contexts/PreferencesContext';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Replace `src/App.tsx` with the full shell**

```tsx
import { useEffect, useReducer, useState } from 'react';
import { TopBar } from './components/TopBar';
import { WordList } from './components/WordList';
import { useFilteredWords, type PosFilter, type SortMode } from './hooks/useFilteredWords';
import { usePreferences } from './hooks/usePreferences';
import type { Word } from './types';

interface FilterState { search: string; pos: PosFilter; sort: SortMode; }
type FilterAction =
  | { type: 'search'; value: string }
  | { type: 'pos'; value: PosFilter }
  | { type: 'sort'; value: SortMode };

function filterReducer(s: FilterState, a: FilterAction): FilterState {
  switch (a.type) {
    case 'search': return { ...s, search: a.value };
    case 'pos': return { ...s, pos: a.value };
    case 'sort': return { ...s, sort: a.value };
  }
}

export default function App() {
  const { hideTranslation } = usePreferences();
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, dispatch] = useReducer(filterReducer, { search: '', pos: 'all', sort: 'rank' });
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch('/words.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<Word[]>; })
      .then(setWords)
      .catch((e) => setError(e.message));
  }, []);

  const filtered = useFilteredWords(words ?? [], filters);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen max-w-2xl mx-auto">
      <TopBar
        search={filters.search}
        pos={filters.pos}
        sort={filters.sort}
        onSearchChange={(v) => dispatch({ type: 'search', value: v })}
        onPosChange={(v) => dispatch({ type: 'pos', value: v })}
        onSortChange={(v) => dispatch({ type: 'sort', value: v })}
        resultCount={filtered.length}
      />
      <main className="px-4 py-4">
        {error && <div className="p-4 text-red-700 bg-red-50 rounded">Failed to load words: {error}</div>}
        {!error && words === null && <div className="p-4 text-text-muted">Loading…</div>}
        {!error && words !== null && (
          <WordList
            words={filtered}
            expandedIds={expandedIds}
            hideTranslation={hideTranslation}
            onToggleExpand={toggleExpand}
            onPlayWord={(w) => console.log('play', w.french)}
            onPlaySentence={(w) => console.log('sentence', w.french)}
            currentPlayingWordId={null}
            currentPlayingSentenceId={null}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run the dev server and smoke-test manually**

```bash
npm run dev
```
Verify:
- Page loads, 10 rows render
- Search "book" → livre shown
- Click "Verb" chip → only verbs shown
- Toggle dark mode → theme flips, persists on reload
- Toggle hide-translation → English text blurs
- Sort by A–Z vs frequency → order changes
- Expand a row → example, IPA, synonyms visible
- Click French word → console logs "play <word>"
- Click rest of row → expands (no play log)
- Make window narrow → filter chips scroll horizontally

Fix any visual regressions before committing.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: everything passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire up App shell with data fetch, state, and TopBar+WordList"
```

---

## Task 15: useAudio hook + integration

**Files:**
- Create: `src/hooks/useAudio.ts`
- Test: `src/hooks/useAudio.test.ts`
- Modify: `src/App.tsx` (wire audio to callbacks)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAudio } from './useAudio';

describe('useAudio', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue();
    pauseSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('plays a clip and reports isPlaying for that id', async () => {
    const { result } = renderHook(() => useAudio());
    await act(async () => { await result.current.play('livre-word', '/audio/words/livre.mp3'); });
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isPlaying('livre-word')).toBe(true);
    expect(result.current.isPlaying('other')).toBe(false);
  });

  it('pauses previous clip when a new one is played', async () => {
    const { result } = renderHook(() => useAudio());
    await act(async () => { await result.current.play('a', '/a.mp3'); });
    await act(async () => { await result.current.play('b', '/b.mp3'); });
    expect(pauseSpy).toHaveBeenCalled();
    expect(result.current.isPlaying('a')).toBe(false);
    expect(result.current.isPlaying('b')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- src/hooks/useAudio.test.ts
```

- [ ] **Step 3: Implement `src/hooks/useAudio.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';

let sharedAudio: HTMLAudioElement | null = null;
let currentId: string | null = null;
const listeners = new Set<() => void>();

function notify() { for (const l of listeners) l(); }

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.addEventListener('ended', () => { currentId = null; notify(); });
    sharedAudio.addEventListener('pause', () => { notify(); });
  }
  return sharedAudio;
}

export interface AudioApi {
  play: (id: string, src: string) => Promise<void>;
  isPlaying: (id: string) => boolean;
}

export function useAudio(): AudioApi {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const play = useCallback(async (id: string, src: string) => {
    const a = getAudio();
    a.pause();
    a.src = src;
    currentId = id;
    notify();
    try { await a.play(); } catch { /* autoplay rejection or 404 — ignore */ }
  }, []);

  const isPlaying = useCallback((id: string) => {
    return currentId === id && !!sharedAudio && !sharedAudio.paused;
  }, []);

  return { play, isPlaying };
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm test -- src/hooks/useAudio.test.ts
```
Expected: 2 tests passed.

- [ ] **Step 5: Wire audio into App.tsx**

Replace the two `console.log` callbacks in `src/App.tsx`:

```tsx
import { useAudio } from './hooks/useAudio';
```

Inside the component:
```tsx
const audio = useAudio();
```

Replace the onPlayWord / onPlaySentence props:
```tsx
onPlayWord={(w) => audio.play(`w-${w.id}`, w.audio.word)}
onPlaySentence={(w) => audio.play(`s-${w.id}`, w.audio.sentence)}
currentPlayingWordId={
  words?.find((w) => audio.isPlaying(`w-${w.id}`))?.id ?? null
}
currentPlayingSentenceId={
  words?.find((w) => audio.isPlaying(`s-${w.id}`))?.id ?? null
}
```

- [ ] **Step 6: Manual smoke test**

Audio files don't exist yet, so the browser will 404 and `play()` will reject silently. That's fine — the wiring is verified by:
- Clicking a French word → Network tab shows a request to `/audio/words/<slug>.mp3` (404 expected for now)
- No expand triggered
- No console error

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add useAudio hook and wire to WordRow interactions"
```

---

## Task 16: Pipeline shared schema + IO + .env.example

**Files:**
- Create: `scripts/_shared/schema.ts`, `scripts/_shared/io.ts`, `.env.example`
- Modify: `package.json` (add pipeline deps and `scripts.pipeline:*` aliases)
- Test: `scripts/_shared/schema.test.ts`

- [ ] **Step 1: Install pipeline dependencies**

```bash
npm install -D zod tsx dotenv
npm install @google-cloud/text-to-speech @anthropic-ai/sdk
```

(We pick Anthropic as the LLM by default; substitute `openai` if you prefer. The enrich script is written against Anthropic.)

- [ ] **Step 2: Write `scripts/_shared/schema.ts`**

```ts
import { z } from 'zod';

export const partOfSpeech = z.enum([
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'conjunction', 'preposition',
]);
export const gender = z.enum(['m', 'f', 'mf']);

export const synonymSchema = z.object({
  word: z.string().min(1),
  note: z.string().optional(),
});

export const wordSchema = z.object({
  id: z.number().int().positive(),
  rank: z.number().int().positive(),
  french: z.string().min(1),
  english: z.string().min(1),
  pos: partOfSpeech,
  gender: gender.optional(),
  plural: z.string().optional(),
  ipa: z.string().min(1),
  example: z.object({
    fr: z.string().min(1),
    en: z.string().min(1),
  }),
  synonyms: z.array(synonymSchema).max(5).optional(),
  audio: z.object({
    word: z.string().startsWith('/audio/words/'),
    sentence: z.string().startsWith('/audio/sentences/'),
  }),
}).superRefine((w, ctx) => {
  if (w.pos === 'noun' && !w.gender) {
    ctx.addIssue({ code: 'custom', message: 'noun must have a gender' });
  }
  if (w.pos !== 'noun' && w.gender) {
    ctx.addIssue({ code: 'custom', message: 'only nouns carry gender' });
  }
  if (w.pos !== 'noun' && w.plural) {
    ctx.addIssue({ code: 'custom', message: 'only nouns carry a plural form' });
  }
});

export type Word = z.infer<typeof wordSchema>;
export const wordsSchema = z.array(wordSchema);
```

- [ ] **Step 3: Write `scripts/_shared/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { wordSchema } from './schema';

const base = {
  id: 1, rank: 1, french: 'livre', english: 'book',
  pos: 'noun' as const, gender: 'm' as const, plural: 'livres',
  ipa: 'livʁ',
  example: { fr: "J'ai un livre.", en: 'I have a book.' },
  audio: { word: '/audio/words/livre.mp3', sentence: '/audio/sentences/livre.mp3' },
};

describe('wordSchema', () => {
  it('accepts a valid noun', () => {
    expect(() => wordSchema.parse(base)).not.toThrow();
  });
  it('rejects a noun without gender', () => {
    const { gender, ...rest } = base;
    expect(() => wordSchema.parse(rest)).toThrow();
  });
  it('rejects a non-noun with gender', () => {
    expect(() => wordSchema.parse({ ...base, pos: 'verb', gender: 'm', plural: undefined })).toThrow();
  });
  it('rejects audio paths with wrong prefix', () => {
    expect(() => wordSchema.parse({ ...base, audio: { word: '/foo.mp3', sentence: '/bar.mp3' } })).toThrow();
  });
});
```

- [ ] **Step 4: Run test**

```bash
npm test -- scripts/_shared/schema.test.ts
```
Expected: 4 tests passed.

- [ ] **Step 5: Write `scripts/_shared/io.ts`**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';

export async function readJson<T>(p: string): Promise<T> {
  const txt = await fs.readFile(p, 'utf8');
  return JSON.parse(txt) as T;
}

export async function writeJson(p: string, data: unknown, pretty = true): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data), 'utf8');
}

export async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}
```

- [ ] **Step 6: Write `.env.example`**

```
# Anthropic (for enrichment)
ANTHROPIC_API_KEY=

# Google Cloud TTS — path to a service account JSON with TTS enabled
GOOGLE_APPLICATION_CREDENTIALS=./gcp-sa.json
```

- [ ] **Step 7: Add pipeline scripts to package.json**

```json
"pipeline:fetch":     "tsx scripts/01-fetch-frequency.ts",
"pipeline:enrich":    "tsx scripts/02-enrich.ts",
"pipeline:validate":  "tsx scripts/03-validate.ts",
"pipeline:tts-words": "tsx scripts/04-tts-words.ts",
"pipeline:tts-sent":  "tsx scripts/05-tts-sentences.ts",
"pipeline:build":     "tsx scripts/06-build-words-json.ts"
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(pipeline): add shared schema, IO helpers, and .env.example"
```

---

## Task 17: Pipeline 01 — fetch frequency list

**Files:**
- Create: `scripts/01-fetch-frequency.ts`

- [ ] **Step 1: Write `scripts/01-fetch-frequency.ts`**

```ts
import { writeJson } from './_shared/io.js';

// hermitdave/FrequencyWords fr_50k.txt — one "word count" per line
const URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt';
const OUT = 'data/raw-frequency.json';
const TARGET = 1200; // buffer for exclusions

// Obvious non-lemmas / function-word variants / contractions we drop.
// The list stays small on purpose — aggressive filtering happens during enrichment
// where the LLM can drop entries it can't meaningfully enrich.
const BLOCKLIST = new Set([
  'n', 't', 's', 'c', 'l', 'd', 'm', 'j', 'qu',
  // Proper noun artifacts common in OpenSubtitles
]);

async function main() {
  console.log(`Fetching ${URL}…`);
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const txt = await res.text();

  const entries: { french: string; freq: number }[] = [];
  for (const line of txt.split('\n')) {
    const [word, countStr] = line.trim().split(/\s+/);
    if (!word) continue;
    if (BLOCKLIST.has(word)) continue;
    if (/\d/.test(word)) continue;
    if (word.length > 25) continue;
    const freq = Number(countStr);
    if (!Number.isFinite(freq)) continue;
    entries.push({ french: word, freq });
    if (entries.length >= TARGET) break;
  }

  // rank = index + 1 after filtering
  const out = entries.map((e, i) => ({ rank: i + 1, french: e.french, freq: e.freq }));
  await writeJson(OUT, out);
  console.log(`Wrote ${out.length} entries to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
npm run pipeline:fetch
```
Expected: `data/raw-frequency.json` created with ~1200 entries. Open it, confirm realistic French words at the top (`de`, `je`, `que`, `pas`, `est`, …).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(pipeline): fetch top-1200 French lemmas from FrequencyWords"
```

---

## Task 18: Pipeline 02 — LLM enrichment (batched, resumable)

**Files:**
- Create: `scripts/02-enrich.ts`

- [ ] **Step 1: Write `scripts/02-enrich.ts`**

```ts
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readJson, writeJson, fileExists } from './_shared/io.js';
import { wordSchema, type Word } from './_shared/schema.js';
import { z } from 'zod';

const IN = 'data/raw-frequency.json';
const OUT = 'data/enriched.json';
const BATCH_SIZE = 20;
const TARGET_COUNT = 1000;

// What the LLM returns — audio paths are added by this script, not the model.
const llmItemSchema = z.object({
  french: z.string(),
  english: z.string(),
  pos: z.enum(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'conjunction', 'preposition']),
  gender: z.enum(['m', 'f', 'mf']).optional(),
  plural: z.string().optional(),
  ipa: z.string(),
  example: z.object({ fr: z.string(), en: z.string() }),
  synonyms: z.array(z.object({ word: z.string(), note: z.string().optional() })).max(3).optional(),
  drop: z.boolean().optional(), // LLM may flag an entry as not suitable
});

const SYSTEM_PROMPT = `You enrich French vocabulary entries for a learner app.
For each French word given, return ONE JSON object with:
- french: the input word (unchanged unless it was malformed)
- english: primary English meaning (short, learner-friendly)
- pos: one of noun/verb/adjective/adverb/pronoun/conjunction/preposition
- gender: "m" / "f" / "mf" — only if pos="noun". Omit otherwise.
- plural: plural form — only if pos="noun". Omit otherwise.
- ipa: IPA phonetic transcription WITHOUT surrounding brackets (e.g. "livʁ", not "[livʁ]")
- example: { fr, en } — a natural example sentence using the word in its primary sense
- synonyms: up to 2 common synonyms, each { word, note? } where note is e.g. "informal", "formal"
- drop: true ONLY if the entry is a proper noun, a spelling variant already covered by another entry, or otherwise unsuitable for a learner list

Return a JSON array, one object per input word, in the same order.
No prose. No markdown fences. Just the JSON array.`;

async function main() {
  const raw = await readJson<Array<{ rank: number; french: string }>>(IN);

  let existing: Word[] = [];
  if (await fileExists(OUT)) {
    existing = await readJson<Word[]>(OUT);
    console.log(`Resuming — ${existing.length} words already enriched`);
  }
  const done = new Set(existing.map((w) => w.french));
  const todo = raw.filter((r) => !done.has(r.french));

  const client = new Anthropic();

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    if (existing.filter((w) => !('drop' in w)).length >= TARGET_COUNT) break;

    const batch = todo.slice(i, i + BATCH_SIZE);
    const userContent = `Enrich these ${batch.length} French words:\n${batch.map((b) => b.french).join('\n')}`;

    console.log(`Batch ${i / BATCH_SIZE + 1} — ${batch[0].french}…${batch[batch.length - 1].french}`);

    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn('JSON parse failed; retrying batch once');
      continue; // next iteration same items (because we check done set only on success)
    }

    const items = z.array(llmItemSchema).safeParse(parsed);
    if (!items.success) {
      console.warn('Schema parse failed:', items.error.issues.slice(0, 3));
      continue;
    }

    for (let j = 0; j < items.data.length; j++) {
      const item = items.data[j];
      const input = batch[j];
      if (!input) continue;
      if (item.drop) {
        console.log(`  drop: ${input.french}`);
        continue;
      }
      const id = existing.length + 1;
      const wordCandidate: Word = {
        id,
        rank: input.rank,
        french: item.french,
        english: item.english,
        pos: item.pos,
        ...(item.gender ? { gender: item.gender } : {}),
        ...(item.plural ? { plural: item.plural } : {}),
        ipa: item.ipa,
        example: item.example,
        ...(item.synonyms ? { synonyms: item.synonyms } : {}),
        audio: {
          word: `/audio/words/${slug(item.french)}.mp3`,
          sentence: `/audio/sentences/${slug(item.french)}.mp3`,
        },
      };
      const vr = wordSchema.safeParse(wordCandidate);
      if (!vr.success) {
        console.warn(`  schema reject: ${input.french} — ${vr.error.issues[0]?.message}`);
        continue;
      }
      existing.push(vr.data);
    }

    await writeJson(OUT, existing);
    console.log(`  → ${existing.length} total`);
  }

  console.log(`Done. ${existing.length} entries in ${OUT}`);
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Set up Anthropic API key**

Create `.env` (gitignored) at the project root:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

- [ ] **Step 3: Run enrichment**

```bash
npm run pipeline:enrich
```
Expected: 50 batches of 20 words, ~5–10 minutes. `data/enriched.json` grows after each batch. Safe to Ctrl+C and re-run — it resumes.

Inspect `data/enriched.json` and spot-check 10 random entries for plausible gender, IPA, and example sentences.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pipeline): LLM enrichment with batching, resumability, schema guard"
```

---

## Task 19: Pipeline 03 — validate + review report

**Files:**
- Create: `scripts/03-validate.ts`

- [ ] **Step 1: Write `scripts/03-validate.ts`**

```ts
import fs from 'node:fs/promises';
import { readJson, writeJson } from './_shared/io.js';
import { wordSchema, type Word } from './_shared/schema.js';

const IN = 'data/enriched.json';
const OUT = 'data/validated.json';
const REPORT = 'data/review-report.md';

async function main() {
  const enriched = await readJson<Word[]>(IN);
  const validated: Word[] = [];
  const issues: string[] = [];

  for (const w of enriched) {
    const r = wordSchema.safeParse(w);
    if (!r.success) {
      issues.push(`- ❌ **${w.french}** (id ${w.id}): ${r.error.issues.map((i) => i.message).join('; ')}`);
      continue;
    }
    validated.push(r.data);
  }

  // Heuristic checks beyond schema
  for (const w of validated) {
    if (!w.ipa || w.ipa.length < 1) issues.push(`- ⚠ **${w.french}**: IPA empty`);
    if (w.example.fr.length < 4) issues.push(`- ⚠ **${w.french}**: example sentence suspiciously short`);
    if (!w.example.fr.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          .includes(w.french.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split('-')[0].slice(0, 4))) {
      issues.push(`- ⚠ **${w.french}**: example may not contain the word`);
    }
  }

  await writeJson(OUT, validated);

  const header = `# Review Report\n\n${validated.length} valid entries, ${issues.length} issue(s) flagged.\n\n`;
  await fs.writeFile(REPORT, header + issues.join('\n') + '\n');

  console.log(`Validated ${validated.length}. Issues: ${issues.length}. Report: ${REPORT}`);
  if (issues.length > 0) {
    console.log('Open the report, fix entries manually in data/enriched.json, then re-run validate.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run validate**

```bash
npm run pipeline:validate
```
Expected: `data/validated.json` written. Open `data/review-report.md`, scan issues. Fix any glaring ones manually in `data/enriched.json` and re-run until the report feels acceptable (small number of warnings is fine).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(pipeline): schema validation with human-readable review report"
```

---

## Task 20: Pipeline 04 — TTS word-level audio

**Files:**
- Create: `scripts/04-tts-words.ts`

- [ ] **Step 1: Set up Google Cloud TTS credentials**

Follow https://cloud.google.com/text-to-speech/docs/before-you-begin:
1. Create/select a GCP project
2. Enable the Text-to-Speech API
3. Create a service account with `roles/cloudtts.user`
4. Download its JSON key, save as `gcp-sa.json` at the project root (this file is gitignored via `.env.local` convention — add `gcp-sa.json` to `.gitignore`)

Update `.gitignore`:
```
gcp-sa.json
```
Commit `.gitignore` update now:
```bash
git add .gitignore
git commit -m "chore: gitignore gcp-sa.json"
```

Create `.env` (if not already):
```
GOOGLE_APPLICATION_CREDENTIALS=./gcp-sa.json
```

- [ ] **Step 2: Write `scripts/04-tts-words.ts`**

```ts
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import textToSpeech from '@google-cloud/text-to-speech';
import { readJson, fileExists } from './_shared/io.js';
import type { Word } from './_shared/schema.js';

const IN = 'data/validated.json';
const OUT_DIR = 'public/audio/words';
const VOICE_NAME = 'fr-FR-Wavenet-C';

async function main() {
  const words = await readJson<Word[]>(IN);
  await fs.mkdir(OUT_DIR, { recursive: true });
  const client = new textToSpeech.TextToSpeechClient();

  let done = 0, skipped = 0;
  for (const w of words) {
    const filename = path.basename(w.audio.word);
    const out = path.join(OUT_DIR, filename);
    if (await fileExists(out)) { skipped++; continue; }

    const [res] = await client.synthesizeSpeech({
      input: { text: w.french },
      voice: { languageCode: 'fr-FR', name: VOICE_NAME },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
    });
    if (!res.audioContent) throw new Error(`No audio content for ${w.french}`);
    await fs.writeFile(out, res.audioContent as Uint8Array);
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${words.length - skipped}…`);
  }

  console.log(`TTS words complete. Generated ${done}, skipped ${skipped}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it**

```bash
npm run pipeline:tts-words
```
Expected: ~1000 mp3s appear in `public/audio/words/`. Each ~10–20 KB. ~5 minutes total.

- [ ] **Step 4: Spot-check**

Play 5 random mp3s in a player. Confirm native-sounding French pronunciation.

- [ ] **Step 5: Commit audio**

```bash
git add public/audio/words scripts/04-tts-words.ts
git commit -m "feat(pipeline): generate word-level TTS audio via Google Cloud WaveNet"
```

---

## Task 21: Pipeline 05 — TTS sentence-level audio

**Files:**
- Create: `scripts/05-tts-sentences.ts`

- [ ] **Step 1: Write `scripts/05-tts-sentences.ts`**

Almost identical to 04 but uses the example sentence and the `sentence` audio path:

```ts
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import textToSpeech from '@google-cloud/text-to-speech';
import { readJson, fileExists } from './_shared/io.js';
import type { Word } from './_shared/schema.js';

const IN = 'data/validated.json';
const OUT_DIR = 'public/audio/sentences';
const VOICE_NAME = 'fr-FR-Wavenet-C';

async function main() {
  const words = await readJson<Word[]>(IN);
  await fs.mkdir(OUT_DIR, { recursive: true });
  const client = new textToSpeech.TextToSpeechClient();

  let done = 0, skipped = 0;
  for (const w of words) {
    const filename = path.basename(w.audio.sentence);
    const out = path.join(OUT_DIR, filename);
    if (await fileExists(out)) { skipped++; continue; }

    const [res] = await client.synthesizeSpeech({
      input: { text: w.example.fr },
      voice: { languageCode: 'fr-FR', name: VOICE_NAME },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
    });
    if (!res.audioContent) throw new Error(`No audio content for ${w.french}`);
    await fs.writeFile(out, res.audioContent as Uint8Array);
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${words.length - skipped}…`);
  }

  console.log(`TTS sentences complete. Generated ${done}, skipped ${skipped}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
npm run pipeline:tts-sent
```
Expected: ~1000 mp3s in `public/audio/sentences/`. Each ~30–80 KB (sentences are longer). ~10 minutes.

- [ ] **Step 3: Commit audio**

```bash
git add public/audio/sentences scripts/05-tts-sentences.ts
git commit -m "feat(pipeline): generate sentence-level TTS audio"
```

---

## Task 22: Pipeline 06 — build final words.json

**Files:**
- Create: `scripts/06-build-words-json.ts`

- [ ] **Step 1: Write `scripts/06-build-words-json.ts`**

```ts
import { readJson, writeJson } from './_shared/io.js';
import type { Word } from './_shared/schema.js';

const IN = 'data/validated.json';
const OUT = 'public/words.json';

async function main() {
  const words = await readJson<Word[]>(IN);
  // Sort by rank for stable default order; the UI re-sorts anyway.
  words.sort((a, b) => a.rank - b.rank);
  await writeJson(OUT, words, false); // minified
  console.log(`Wrote ${words.length} words to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run it**

```bash
npm run pipeline:build
```
Expected: `public/words.json` overwritten with ~1000 entries. Size ~80–120 KB.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(pipeline): build final public/words.json artifact"
```

---

## Task 23: End-to-end smoke test with real data

- [ ] **Step 1: Start dev server with real dataset**

```bash
npm run dev
```

- [ ] **Step 2: Manual checklist**

Open http://localhost:5173 and verify:

- [ ] Page loads. Result count shows ~1000 words.
- [ ] Scroll is smooth from top to bottom (virtualization works).
- [ ] Search "bonjour" (or any real word) filters the list.
- [ ] Each POS chip filters correctly.
- [ ] Sort switches between alphabetical and frequency.
- [ ] Dark mode toggles, persists on reload.
- [ ] Hide-translation blurs English columns.
- [ ] Click French word on any row → audio plays in native-sounding French.
- [ ] Clicking word does NOT expand row.
- [ ] Click row (outside the word) → expands, shows IPA, example, synonyms, plural.
- [ ] Play-sentence button plays the example sentence audio.
- [ ] Clicking a second word stops the first audio.
- [ ] Make window 375px wide: filter chips scroll horizontally, no layout breaks.
- [ ] Keyboard: Tab through, Space/Enter expands focused row, focus-visible rings render.

Any visual issue → fix in the component, re-commit.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Delete the seed data module (it's no longer needed)**

```bash
rm src/seed-data.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove seed-data module; app runs on pipeline output"
```

---

## Task 24: Production build + deploy to Vercel

- [ ] **Step 1: Production build locally**

```bash
npm run build
npm run preview
```
Open the preview URL (usually http://localhost:4173). Run through the smoke checklist from Task 23 one more time on the built artifact. Measure bundle size: Vite prints gzipped JS size at end of `npm run build`. Target: under 200 KB gzipped JS + 100 KB gzipped words.json.

- [ ] **Step 2: Create Vercel project**

Either:
1. **Vercel CLI:**
   ```bash
   npm install -g vercel
   vercel login
   vercel
   ```
   Accept defaults. It auto-detects Vite.
2. **Vercel dashboard:** push to GitHub, import the repo at https://vercel.com/new, accept defaults.

- [ ] **Step 3: Verify deployment**

Open the Vercel-provided URL. Run through the same smoke checklist. Audio files must load from `/audio/words/...` and `/audio/sentences/...`.

- [ ] **Step 4: Commit any final fixes and push**

```bash
git push
```

---

## Done

You have:

- A static web app with 1000 corpus-grounded French words
- Filter by part of speech, search in French or English, sort A–Z or by frequency
- Dark mode + hide-translation toggles, both persisted
- Click French word → native-quality audio
- Expand row → IPA, example sentence, "Play sentence", synonyms, plural
- Fully responsive, keyboard accessible, virtualized
- Deployed as a static site at near-zero cost

All generated data and audio live in `/public`. To regenerate later (e.g., swap to a different voice, update the frequency source), re-run scripts 04+ (everything is resumable).
