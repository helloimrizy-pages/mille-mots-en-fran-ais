# Mille Mots — Design Spec

**Date:** 2026-04-21
**Status:** Draft, pending user review
**Author:** brainstorming session with Claude

## 1. Overview

A single-page web app that lists the 1000 most frequent French words with English meanings, parts of speech, gender/article, example sentences, and native-quality audio pronunciation. Users can filter by part of speech, search by French or English, sort alphabetically or by frequency, toggle a hide-translation mode for self-testing, and switch between light/dark themes.

**Placeholder product name:** *Mille Mots*. Rename freely during implementation.

## 2. Scope

### In scope

- Long-scrolling virtualized list of 1000 words
- Per-row display: French word, English meaning, part of speech tag, gender/article tag (nouns only)
- Row expand: reveals IPA phonetic, example sentence (French + English), "Play sentence" audio button, synonyms with registration notes, plural form (nouns)
- Tap French word → play word audio
- Tap elsewhere on row → toggle expand
- Live text search (French or English)
- Filter by part of speech: All / Noun / Verb / Adjective / Adverb / Pronoun / Conjunction / Preposition
- Sort: alphabetical (A–Z) or by frequency rank (most common first)
- Dark mode toggle (respects `prefers-color-scheme` on first visit, then user choice persists)
- Hide-translation toggle: English text blurs until hovered
- Mobile responsive
- Keyboard accessible (Tab, Space/Enter to expand, focus outlines)

### Out of scope

- User accounts / login
- Backend / database
- Analytics
- Service worker / offline PWA mode (app works offline naturally after first load since everything is static, but no explicit offline-first caching)
- Internationalization of UI chrome (UI is English)
- Quizzes, flashcards, spaced repetition, progress tracking
- Favorites / bookmarking
- Keyboard shortcuts beyond standard navigation

## 3. Data

### 3.1 Source of the word list

Top 1000 French lemmas are pulled from [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords) (CC-BY-SA, corpus-derived from OpenSubtitles). This is an empirically-grounded, widely-used frequency list for French.

Post-processing:
- Drop proper nouns
- Drop entries that are only function-word artifacts (e.g., clitic pronouns already covered by their lemma)
- Pull 1200 lemmas to leave a buffer after exclusions

### 3.2 Enrichment

A single LLM (OpenAI or Anthropic, whichever the user has a key for) is called in batches of ~20 words. For each word it returns:

- English primary meaning
- Part of speech
- Gender + plural form (if noun)
- IPA phonetic transcription
- Example sentence in French (natural, learner-appropriate, using the word in its primary sense)
- English translation of the sentence
- 0–2 synonyms with registration notes ("informal", "formal", "regional")

Each LLM call is validated against a Zod schema; batches that fail to parse are retried. Resumable — partial progress is written to disk after each batch.

### 3.3 Schema

```ts
type PartOfSpeech =
  | "noun" | "verb" | "adjective" | "adverb"
  | "pronoun" | "conjunction" | "preposition";

type Gender = "m" | "f" | "mf"; // mf = ambiguous/common gender

interface Word {
  id: number;          // stable identifier (never changes)
  rank: number;        // frequency rank, 1 = most common
  french: string;      // lemma, e.g. "livre"
  english: string;     // primary meaning
  pos: PartOfSpeech;
  gender?: Gender;     // nouns only
  plural?: string;     // nouns only
  ipa: string;         // phonetic, e.g. "livʁ"
  example: { fr: string; en: string };
  synonyms?: Array<{ word: string; note?: string }>;
  audio: {
    word: string;      // "/audio/words/livre.mp3"
    sentence: string;  // "/audio/sentences/livre.mp3"
  };
}

type Dataset = Word[];
```

### 3.4 Audio generation

**Provider:** Google Cloud Text-to-Speech, WaveNet voice (`fr-FR-Wavenet-C` or equivalent). Chosen because:

- First 1M characters/month is free; entire dataset (~42K chars) fits trivially
- Voice quality at single-word and short-sentence level is effectively native
- Single provider covers both word-level and sentence-level audio
- Simple SDK (`@google-cloud/text-to-speech`)

Output files:
- `public/audio/words/<french>.mp3` — one per word (~7K chars total)
- `public/audio/sentences/<french>.mp3` — one per example sentence (~35K chars total)

Filenames are slugified (`é` → `e`, space → `-`, etc.) to stay URL-safe.

**Estimated one-time cost:** $0 (free tier).
**Estimated generation time:** 15–20 minutes for both audio sets combined.

### 3.5 Pipeline

All scripts run under `tsx` (TypeScript execution without a compile step). Each is idempotent and resumable.

| Script | Input | Output |
|---|---|---|
| `scripts/01-fetch-frequency.ts` | hermitdave/FrequencyWords (public GitHub) | `data/raw-frequency.json` |
| `scripts/02-enrich.ts` | `data/raw-frequency.json` | `data/enriched.json` |
| `scripts/03-validate.ts` | `data/enriched.json` | `data/validated.json` + `data/review-report.md` |
| `scripts/04-tts-words.ts` | `data/validated.json` | `public/audio/words/*.mp3` |
| `scripts/05-tts-sentences.ts` | `data/validated.json` | `public/audio/sentences/*.mp3` |
| `scripts/06-build-words-json.ts` | `data/validated.json` | `public/words.json` (minified) |

`data/review-report.md` flags suspicious entries (noun without gender, missing IPA, etc.) for human review before TTS burns API budget.

## 4. Architecture

### 4.1 Runtime model

Pure static site. No backend, no API calls at runtime.

```
Page load
  ├─ index.html + bundle (~150 KB gzipped JS)
  ├─ fetch /words.json (~100 KB gzipped)
  └─ render virtualized list

Click French word
  └─ new Audio("/audio/words/livre.mp3").play()

Expand row + click "Play sentence"
  └─ new Audio("/audio/sentences/livre.mp3").play()
```

### 4.2 Stack

**Runtime:**
- Vite + React 19 + TypeScript
- Tailwind CSS
- shadcn/ui (Button, Input, Badge, DropdownMenu, Switch, Toggle)
- react-virtuoso (virtualized list, supports variable heights and inline expand)
- Lucide icons

**Build-time (pipeline only):**
- tsx (execute TypeScript directly)
- `@google-cloud/text-to-speech`
- An LLM SDK (OpenAI or Anthropic)
- Zod (schema validation)

### 4.3 Component tree

```
<App>
  <PreferencesProvider>              // theme, hideTranslation (persisted)
    <TopBar>
      <Brand />
      <UtilsRow>
        <SortMenu />
        <DarkModeToggle />
        <HideTranslationToggle />
      </UtilsRow>
      <SearchInput />
      <FilterChips />
    </TopBar>
    <WordList>                        // react-virtuoso wrapper
      <WordRow>                       // collapsed header
        <WordRowExpanded />           // inline expanded content when open
      </WordRow>
    </WordList>
  </PreferencesProvider>
</App>
```

### 4.4 State

| State | Location | Persisted? |
|---|---|---|
| `words: Word[]` (all 1000) | `App` — loaded once on mount | no (from `/words.json`) |
| `search`, `pos`, `sort` (filters) | `App` via `useReducer` | no |
| `expandedIds: Set<number>` | `App` | no |
| current playing audio id | module-level singleton | no |
| `theme`, `hideTranslation` | `PreferencesContext` | ✅ `localStorage` |

Derived state: `filteredWords = useMemo(...)` runs search → POS filter → sort. Keyed on `[words, search, pos, sort]`. Cheap over 1000 items.

### 4.5 Audio handling

A single `useAudio()` hook backed by a module-level `HTMLAudioElement`:

```ts
function useAudio() {
  const play = (id: string, src: string) => { /* stop current, start new */ };
  const isPlaying = (id: string) => currentId === id && !audioEl.paused;
  return { play, isPlaying };
}
```

Playing a new clip stops the current. Buttons can subscribe to `isPlaying(id)` for a playing-state animation.

### 4.6 Click-split on a row

```tsx
<div onClick={() => toggleExpand(word.id)}>
  <button onClick={(e) => { e.stopPropagation(); playWord(word); }}>
    {word.french}
  </button>
  {/* English, POS tag, gender tag, chevron */}
</div>
```

The French-word button swallows its click so it doesn't also expand. This is the single interaction worth a dedicated test.

### 4.7 Hide-translation mode

When the preference is on, English text renders with `filter: blur(4px)` and a `:hover { filter: none }` rule. Applies to:
- Collapsed row English meaning
- Expanded row English translation of the example

## 5. UI / UX

### 5.1 Visual direction

**Soft Warm** style — warm off-white background, pill-shaped muted pastel tags, soft rounded white cards, Notion-ish friendly feel.

### 5.2 Theme tokens

```css
/* Light */
--bg:            #F7F3EC;
--surface:       #FFFFFF;
--surface-muted: #FAF6EF;
--border:        #F0EDE7;
--text:          #2A2826;
--text-muted:    #7D7468;
--text-subtle:   #97907F;
--accent:        #2A2826;

/* Dark (via [data-theme="dark"]) */
--bg:            #1C1B19;
--surface:       #27251F;
--surface-muted: #201E19;
--border:        #2F2C26;
--text:          #EAE6DC;
--text-muted:    #B0A99A;
--text-subtle:   #8C8578;
--accent:        #EAE6DC;
```

Tag palettes (per POS and per gender) use muted pastels in light mode and slightly saturated dark versions in dark mode. Exact hex values to be finalized during implementation; the design principle is "muted, low-saturation, warm-leaning."

### 5.3 Typography

- **Inter** (variable, self-hosted via `@fontsource-variable/inter`) for all UI and French/English content
- **JetBrains Mono** (variable, self-hosted) only for IPA phonetic transcriptions

### 5.4 Top bar (layout T2)

Three vertical zones, all sticky on scroll:

1. Brand row: title "Mille Mots" + subtitle "1000 essential French words" on the left; sort dropdown, dark-mode icon button, hide-translation icon button on the right.
2. Search input row: full-width text input with search icon.
3. Filter chips row: 8 pills (All + 7 POS), horizontally scrollable on narrow screens.

### 5.5 Row layout (variant V2)

**Collapsed:**
- French word (bold) — the word text itself is the audio trigger; cursor becomes a pointer on hover
- English meaning (smaller, muted)
- POS tag pill (color per POS)
- Gender tag pill (m / f / mf — nouns only)
- Chevron indicating expand state

**Expanded (inline, below the collapsed header):**
- Same French-word audio button, with a small speaker icon rendered inline after it to reinforce the audio affordance
- IPA phonetic in monospace (e.g., `[livʁ]`)
- Example sentence in French (medium weight, larger)
- English translation (muted)
- "Play sentence" button (separate from the word audio)
- "Also:" line with synonyms (`bouquin (informal)`) and plural form (`livres (pl)`) as pills

**Affordance note:** the speaker icon only appears in the expanded view (matching the chosen mockup). In the collapsed view, the French word indicates its clickability via the pointer cursor and a subtle underline on hover. The same click-split rule applies in both states — tapping the word plays audio; tapping elsewhere on the row toggles expand.

### 5.6 Responsive behavior

- Filter chips row: `overflow-x: auto`, horizontal scroll on narrow viewports
- Utility row: dark-mode and hide-translation become icon-only (no label) below ~640px
- Row tags wrap to a second line if necessary
- List virtualization preserves smooth scrolling on mobile

### 5.7 Accessibility

- Each row is a `<button>` with `aria-expanded` reflecting state; Space/Enter toggle
- Audio buttons carry `aria-label="Play pronunciation of livre"` (or the word in question)
- Focus-visible outlines from shadcn defaults preserved
- First visit respects `prefers-color-scheme`; explicit user toggle thereafter persists
- Sufficient contrast maintained in both light and dark palettes (target WCAG AA)

## 6. File structure

```
french-app/
├── public/
│   ├── words.json
│   └── audio/
│       ├── words/*.mp3
│       └── sentences/*.mp3
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── types.ts
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
│   │   └── ui/                   (shadcn primitives)
│   ├── hooks/
│   │   ├── useAudio.ts
│   │   ├── usePreferences.ts
│   │   └── useFilteredWords.ts
│   ├── contexts/
│   │   └── PreferencesContext.tsx
│   ├── lib/utils.ts              (cn() from shadcn)
│   └── styles/globals.css        (Tailwind layers + theme tokens)
├── scripts/
│   ├── 01-fetch-frequency.ts
│   ├── 02-enrich.ts
│   ├── 03-validate.ts
│   ├── 04-tts-words.ts
│   ├── 05-tts-sentences.ts
│   └── 06-build-words-json.ts
├── data/                         (gitignored intermediates)
├── .env.example
├── tailwind.config.ts
├── components.json               (shadcn config)
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 7. Deployment

- **Target:** Vercel (recommended). Netlify, Cloudflare Pages, GitHub Pages all work identically.
- **Build:** `npm run build` → `dist/` of static files
- **Bandwidth:** ~15 MB of audio + ~250 KB of app assets. Easily within any free tier.
- **Custom domain:** optional, configured through the host.

## 8. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | `useFilteredWords` — search/filter/sort edge cases |
| Component | Vitest + React Testing Library | `WordRow` click-split test: clicking the word button fires audio but does NOT expand; clicking the rest expands but does NOT fire audio |
| Schema | Zod in `03-validate.ts` | Runs during data pipeline; fails build on missing required fields |
| E2E | Skipped | Overkill at this scope; TypeScript strict + the two above cover primary risk |

## 9. Estimated costs

| Item | Cost |
|---|---|
| LLM enrichment of 1000 words (~50K–80K tokens) | ~$0.50–$2 (one-time, depends on provider) |
| Google Cloud TTS (~42K chars) | $0 (free tier) |
| Hosting (Vercel free tier) | $0 |
| **Total one-time + ongoing** | **Under $2** |

## 10. Open questions / followups

- Exact choice of LLM provider (OpenAI vs Anthropic) — defer to whichever API key the implementer has
- Exact Google TTS voice (Wavenet-C vs Wavenet-D vs Neural2) — try a few during implementation
- Whether to add interjections (e.g., "oui", "non") as an 8th POS filter — currently classified under their natural POS (pronoun, adverb) per most frequency lists
- Final app name — "Mille Mots" is a placeholder
