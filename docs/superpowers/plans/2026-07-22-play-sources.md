# Play Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Play run without a manual selection — either on unseen words (New) or on words you've already played, ordered by memory strength (Review).

**Architecture:** Two new pure modules under `src/play/` do all the thinking. `strength.ts` classifies a card's memory into buckets using the FSRS forgetting curve; `selectWords.ts` turns a source + count + bucket filter into a list of `Word`s. `PlayModal` calls `selectPlayWords` at start and feeds the result into the existing, unchanged `buildPlayQueue`. Separately, the daily new-word cap is deleted from the SRS store, which requires a v1→v2 storage migration.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + @testing-library/react, Tailwind, ts-fsrs.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-play-sources-design.md`
- Test runner: `npx vitest run <path>` for one file, `npm test` for all.
- Type check: `npx tsc -b --noEmit`. Lint: `npm run lint`.
- All new modules are pure functions with no React imports; components consume them.
- `buildPlayQueue.ts`, `distractors.ts`, `fsrs.ts` and all four activity components are **not** modified by any task.
- Strength bucket ids are exactly: `'new' | 'almost-forgotten' | 'just-seen' | 'shaky' | 'getting-solid' | 'solid'`.
- Forgetting curve constants are exactly `DECAY = -0.5`, `FACTOR = 19 / 81`.
- The `almost-forgotten` retrievability threshold is exactly `0.7`.
- Stability thresholds are exactly `1`, `7`, `30` days.
- Existing UI copy `Playing with N selected words.` must be preserved for the Selected source — an existing test asserts on it.
- Commit messages use Conventional Commits and carry no co-author trailer.

---

### Task 1: Storage v2 — drop the daily cap from types and storage

**Files:**
- Modify: `src/flashcards/types.ts`
- Modify: `src/flashcards/storage.ts`
- Test: `src/flashcards/storage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `StoredBlob` without `daily`; `StudySettings` without `newPerDay`; `CURRENT_VERSION = 2`; `load()`/`importJson()` that migrate v1 blobs in place. Task 2 relies on `StoredBlob` having exactly the keys `version`, `cards`, `log`, `settings`.

- [ ] **Step 1: Write the failing tests**

Replace the whole `describe('load')` block's `clamps settings` test and add three migration tests. In `src/flashcards/storage.test.ts`, replace the existing `it('clamps settings to valid ranges', ...)` with:

```ts
  it('clamps settings to valid ranges', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      cards: {},
      log: [],
      settings: { requestRetention: 2, typedCheck: 'yes', lastGoal: 20, lastFilter: null, lastDirections: null },
    }));
    const blob = load();
    expect(blob.settings.requestRetention).toBe(0.95);
    expect(blob.settings.typedCheck).toBe(true);
    expect(blob.settings.lastFilter).toEqual([]);
    expect(blob.settings.lastDirections).toEqual([]);
  });

  it('migrates a v1 blob, preserving cards and log', () => {
    const card = {
      wordId: 7, direction: 'fr-en' as const,
      stability: 4, difficulty: 6,
      elapsedDays: 1, scheduledDays: 4, reps: 3, lapses: 1,
      state: 'review' as const,
      lastReview: '2026-04-22T00:00:00.000Z', due: '2026-04-26T00:00:00.000Z',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      cards: { '7:fr-en': card },
      log: [{
        wordId: 7, direction: 'fr-en', grade: 3,
        reviewedAt: '2026-04-22T00:00:00.000Z', elapsedDays: 1, scheduledDays: 4, state: 'review',
      }],
      settings: { newPerDay: 42, requestRetention: 0.9, typedCheck: false, lastGoal: 20, lastFilter: [], lastDirections: [] },
      daily: { date: '2026-04-23', newIntroduced: 5 },
    }));
    const blob = load();
    expect(blob.version).toBe(2);
    expect(blob.cards['7:fr-en']).toEqual(card);
    expect(blob.log.length).toBe(1);
    expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
  });

  it('drops newPerDay and daily when migrating', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, cards: {}, log: [],
      settings: { newPerDay: 42, requestRetention: 0.9, typedCheck: false, lastGoal: 20, lastFilter: [], lastDirections: [] },
      daily: { date: '2026-04-23', newIntroduced: 5 },
    }));
    const blob = load();
    expect('newPerDay' in blob.settings).toBe(false);
    expect('daily' in blob).toBe(false);
  });
```

Then update the two `caps log` and `importJson` tests. Replace `it('caps log at MAX_LOG_ENTRIES when loading', ...)`'s `localStorage.setItem` payload with:

```ts
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2, cards: {}, log: bigLog, settings: DEFAULT_SETTINGS,
    }));
```

Replace the `describe('importJson')` block entirely with:

```ts
describe('importJson', () => {
  it('parses a valid export', () => {
    const blob = emptyBlob();
    blob.settings.requestRetention = 0.85;
    const json = exportJson(blob);
    const imported = importJson(json);
    expect(imported?.settings.requestRetention).toBe(0.85);
  });

  it('accepts a v1 export and migrates it', () => {
    const imported = importJson(JSON.stringify({
      version: 1, cards: {}, log: [],
      settings: { newPerDay: 42, requestRetention: 0.9, typedCheck: false, lastGoal: 20, lastFilter: [], lastDirections: [] },
      daily: { date: '2026-04-23', newIntroduced: 5 },
    }));
    expect(imported?.version).toBe(2);
    expect('newPerDay' in (imported?.settings ?? {})).toBe(false);
  });

  it('rejects wrong version', () => {
    expect(importJson(JSON.stringify({ version: 999 }))).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(importJson('{not json')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/flashcards/storage.test.ts`
Expected: FAIL — three failures. `migrates a v1 blob` fails on `expected 1 to be 2` because `CURRENT_VERSION` is still 1. `drops newPerDay and daily when migrating` fails on `expected true to be false`. `clamps settings to valid ranges` fails because `version: 2` is treated as a mismatch and gets reset to defaults.

- [ ] **Step 3: Update `src/flashcards/types.ts`**

Delete the `DailyCounter` interface, the `daily` field on `StoredBlob`, `newPerDay` from `StudySettings` and `DEFAULT_SETTINGS`, and the now-unused `localDateString` helper. The file's `SessionGoal`, `CardState`, `ReviewLogEntry`, `Grade`, `cardKey` and `makeEmptyCard` exports are unchanged.

```ts
export interface StudySettings {
  requestRetention: number;
  typedCheck: boolean;
  lastGoal: SessionGoal;
  lastFilter: PartOfSpeech[];
  lastDirections: Direction[];
}

export interface StoredBlob {
  version: 2;
  cards: Record<string, CardState>;
  log: ReviewLogEntry[];
  settings: StudySettings;
}

export const DEFAULT_SETTINGS: StudySettings = {
  requestRetention: 0.9,
  typedCheck: false,
  lastGoal: 20,
  lastFilter: [],
  lastDirections: [],
};
```

- [ ] **Step 4: Rewrite `src/flashcards/storage.ts`**

The whole file:

```ts
import {
  DEFAULT_SETTINGS,
  MAX_LOG_ENTRIES,
  type StoredBlob,
  type StudySettings,
} from './types';

export const STORAGE_KEY = 'mille-mots-srs-v1';
export const BACKUP_KEY = 'mille-mots-srs-v1-backup';
export const CURRENT_VERSION = 2;

// Builds the settings object key by key rather than spreading, so legacy fields
// such as newPerDay are dropped rather than carried forward.
function clampSettings(s: Partial<StudySettings>): StudySettings {
  const merged = { ...DEFAULT_SETTINGS, ...s };
  return {
    requestRetention: Math.max(0.80, Math.min(0.95, merged.requestRetention)),
    typedCheck: !!merged.typedCheck,
    lastGoal: merged.lastGoal,
    lastFilter: Array.isArray(merged.lastFilter) ? merged.lastFilter : [],
    lastDirections: Array.isArray(merged.lastDirections) ? merged.lastDirections : [],
  };
}

export function emptyBlob(): StoredBlob {
  return {
    version: CURRENT_VERSION,
    cards: {},
    log: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// v1 -> v2 only removes fields (settings.newPerDay and the daily counter), so a
// single reader handles both versions: unknown keys are simply never copied.
function migrate(parsed: Record<string, unknown>): StoredBlob | null {
  const version = parsed.version;
  if (version !== 1 && version !== CURRENT_VERSION) return null;
  const obj = parsed as Partial<StoredBlob>;
  return {
    version: CURRENT_VERSION,
    cards: obj.cards && typeof obj.cards === 'object' ? obj.cards : {},
    log: Array.isArray(obj.log) ? obj.log.slice(-MAX_LOG_ENTRIES) : [],
    settings: clampSettings(obj.settings ?? {}),
  };
}

export function load(): StoredBlob {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return emptyBlob();
  }
  if (!raw) return emptyBlob();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyBlob();
  }

  if (!parsed || typeof parsed !== 'object') return emptyBlob();

  const migrated = migrate(parsed as Record<string, unknown>);
  if (!migrated) {
    try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* quota */ }
    return emptyBlob();
  }
  return migrated;
}

export function save(blob: StoredBlob): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
  } catch {
    // quota or disabled storage — silently fail; runtime state still works
  }
}

export function clear(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function exportJson(blob: StoredBlob): string {
  return JSON.stringify(blob, null, 2);
}

export function importJson(str: string): StoredBlob | null {
  try {
    const parsed = JSON.parse(str);
    if (!parsed || typeof parsed !== 'object') return null;
    return migrate(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the storage tests**

Run: `npx vitest run src/flashcards/storage.test.ts`
Expected: PASS, all tests. Other files will not compile yet — that is Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/flashcards/types.ts src/flashcards/storage.ts src/flashcards/storage.test.ts
git commit -m "refactor(srs): drop daily new-word cap from stored blob

Bumps storage to v2 with a migration that preserves cards and log while
dropping settings.newPerDay and the daily counter."
```

---

### Task 2: Remove the daily cap from context, session planning and settings UI

**Files:**
- Modify: `src/contexts/FlashcardContext.tsx`
- Modify: `src/flashcards/useSession.ts`
- Modify: `src/flashcards/components/SettingsPanel.tsx`
- Test: `src/contexts/FlashcardContext.test.tsx`
- Test: `src/flashcards/useSession.test.ts`

**Interfaces:**
- Consumes: `StoredBlob` and `StudySettings` from Task 1.
- Produces: `FlashcardApi` without the `daily` property. Tasks 4, 6 and 7 read `api.cards` from this interface; it is unchanged.

- [ ] **Step 1: Update the failing tests**

In `src/contexts/FlashcardContext.test.tsx`, delete these three tests wholesale: `grading a new card increments daily.newIntroduced`, `grading an already-reviewed card does not increment newIntroduced`, and `daily counter resets when local date changes`. Then replace `it('updateSettings merges patch', ...)` with:

```ts
  it('updateSettings merges patch', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.updateSettings({ requestRetention: 0.85, typedCheck: true }); });
    expect(result.current.settings.requestRetention).toBe(0.85);
    expect(result.current.settings.typedCheck).toBe(true);
  });
```

In `src/flashcards/useSession.test.ts`, change the import on line 6 to drop `localDateString`:

```ts
import { DEFAULT_SETTINGS, cardKey } from './types';
```

Replace `makeApi` with:

```ts
function makeApi(
  cards: Record<string, CardState> = {},
  settings: Partial<StudySettings> = {},
): FlashcardApi {
  return {
    cards,
    log: [],
    settings: { ...DEFAULT_SETTINGS, ...settings },
    dueCount: () => 0,
    getCard: () => ({} as CardState),
    grade: () => {},
    updateSettings: () => {},
    resetAll: () => {},
    exportJson: () => '',
    importJson: () => true,
  };
}
```

Delete these two tests entirely: `respects newPerDay cap` and `respects newIntroduced already consumed`. Replace `it('returns new cards for a fresh deck capped by newPerDay', ...)` with:

```ts
  it('returns every new card for a fresh deck', () => {
    const words = Array.from({ length: 5 }, (_, i) => makeWord(i + 1));
    const plan = planSession({
      words, api: makeApi(),
      filter: [], directions: ['fr-en'], goal: 'unlimited', now: NOW,
    });
    expect(plan.queue.length).toBe(5);
    expect(plan.queue.every((c) => c.isNew)).toBe(true);
  });
```

In every remaining test in that file, replace `makeApi({}, { newPerDay: N })` with `makeApi()` and `makeApi(cards, { newPerDay: N })` with `makeApi(cards)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/contexts/FlashcardContext.test.tsx src/flashcards/useSession.test.ts`
Expected: FAIL — `daily` no longer exists on `StoredBlob`, so the provider throws or type-checks fail.

- [ ] **Step 3: Update `src/contexts/FlashcardContext.tsx`**

Remove `DailyCounter` and `localDateString` from the import block, delete the `daily` field from `FlashcardApi`, delete the `rolloverDaily` function, simplify `grade`, and drop `daily` from `resetAll` and the memo.

The `FlashcardApi` interface becomes:

```ts
export interface FlashcardApi {
  cards: Record<string, CardState>;
  log: ReviewLogEntry[];
  settings: StudySettings;
  dueCount: (now?: Date) => number;
  getCard: (wordId: number, direction: Direction) => CardState;
  grade: (wordId: number, direction: Direction, grade: Grade, now?: Date) => void;
  updateSettings: (patch: Partial<StudySettings>) => void;
  resetAll: () => void;
  exportJson: () => string;
  importJson: (str: string) => boolean;
}
```

`grade` becomes:

```ts
  const grade = useCallback(
    (wordId: number, direction: Direction, g: Grade, now: Date = new Date()) => {
      setBlob((prev) => {
        const key = cardKey(wordId, direction);
        const before = prev.cards[key] ?? makeEmptyCard(wordId, direction, now);
        const { card: next } = gradeCard(before, g, now, { requestRetention: prev.settings.requestRetention });
        const logEntry: ReviewLogEntry = {
          wordId,
          direction,
          grade: g,
          reviewedAt: now.toISOString(),
          elapsedDays: next.elapsedDays,
          scheduledDays: next.scheduledDays,
          state: next.state,
        };
        return {
          ...prev,
          cards: { ...prev.cards, [key]: next },
          log: [...prev.log, logEntry].slice(-MAX_LOG_ENTRIES),
        };
      });
    },
    [],
  );
```

`resetAll` becomes:

```ts
  const resetAll = useCallback(() => {
    setBlob((prev) => ({
      version: 2,
      cards: {},
      log: [],
      settings: prev.settings,
    }));
  }, []);
```

Remove `daily: blob.daily,` from the `useMemo` object.

- [ ] **Step 4: Update `src/flashcards/useSession.ts`**

Replace lines 76-77 with:

```ts
  const newAvailable = shuffledFresh.length;
```

and remove `inputs.api.settings.newPerDay`, `inputs.api.daily.newIntroduced` and `inputs.api.daily.date` from the `useMemo` dependency array, leaving:

```ts
    [
      inputs.words,
      inputs.api.cards,
      inputs.filter.join(','),
      inputs.directions.join(','),
      inputs.goal,
      inputs.now.getTime(),
    ],
```

- [ ] **Step 5: Update `src/flashcards/components/SettingsPanel.tsx`**

Delete the entire first `<section>` (lines 29-43), the one containing the "New words per day" range input. Everything else in the file is unchanged.

- [ ] **Step 6: Run the full suite and type check**

Run: `npm test && npx tsc -b --noEmit`
Expected: PASS — all tests green, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/FlashcardContext.tsx src/contexts/FlashcardContext.test.tsx src/flashcards/useSession.ts src/flashcards/useSession.test.ts src/flashcards/components/SettingsPanel.tsx
git commit -m "feat(srs): remove the daily new-word limit

New words are no longer throttled per day. Drops the daily counter from
the context, the cap from session planning, and the slider from settings."
```

---

### Task 3: Strength buckets

**Files:**
- Create: `src/play/strength.ts`
- Test: `src/play/strength.test.ts`

**Interfaces:**
- Consumes: `CardState`, `Direction`, `cardKey` from `src/flashcards/types`; `Word` from `src/types`.
- Produces:
  - `type Strength = 'new' | 'almost-forgotten' | 'just-seen' | 'shaky' | 'getting-solid' | 'solid'`
  - `STRENGTH_ORDER: Strength[]` — weakest to strongest, `new` first
  - `REVIEW_STRENGTHS: Strength[]` — `STRENGTH_ORDER` without `'new'`
  - `STRENGTH_LABELS: Record<Strength, string>`
  - `retrievability(card: CardState, now: Date): number`
  - `cardStrength(card: CardState | undefined, now: Date): Strength`
  - `seenCards(word: Word, cards: Record<string, CardState>): CardState[]`
  - `wordStrength(word: Word, cards: Record<string, CardState>, now: Date): Strength`
  - `bucketCounts(words: Word[], cards: Record<string, CardState>, now: Date): Record<Strength, number>`

  Tasks 4, 5 and 6 all import from this module.

- [ ] **Step 1: Write the failing test**

Create `src/play/strength.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import type { CardState, Direction } from '../flashcards/types';
import { cardKey } from '../flashcards/types';
import { bucketCounts, cardStrength, retrievability, wordStrength } from './strength';

const NOW = new Date('2026-07-22T12:00:00Z');
const MS_PER_DAY = 86_400_000;

function makeWord(id: number): Word {
  return {
    id, rank: id,
    french: `mot${id}`, english: `meaning${id}`,
    pos: 'noun', ipa: '/x/',
    example: { fr: 'Ex.', en: 'Ex.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
}

function makeCard(overrides: Partial<CardState> = {}): CardState {
  return {
    wordId: 1, direction: 'fr-en',
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: NOW.toISOString(),
    due: new Date(NOW.getTime() + 10 * MS_PER_DAY).toISOString(),
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * MS_PER_DAY).toISOString();
}

describe('retrievability', () => {
  it('is 1 immediately after review', () => {
    expect(retrievability(makeCard(), NOW)).toBeCloseTo(1, 6);
  });

  it('is 0.9 when elapsed time equals stability', () => {
    const card = makeCard({ stability: 10, lastReview: daysAgo(10) });
    expect(retrievability(card, NOW)).toBeCloseTo(0.9, 6);
  });

  it('is 0 for a card that has never been reviewed', () => {
    expect(retrievability(makeCard({ lastReview: null }), NOW)).toBe(0);
  });

  it('decreases as time passes', () => {
    const recent = retrievability(makeCard({ lastReview: daysAgo(5) }), NOW);
    const older = retrievability(makeCard({ lastReview: daysAgo(20) }), NOW);
    expect(older).toBeLessThan(recent);
  });
});

describe('cardStrength', () => {
  it('treats a missing card as new', () => {
    expect(cardStrength(undefined, NOW)).toBe('new');
  });

  it('treats a new-state card as new', () => {
    expect(cardStrength(makeCard({ state: 'new' }), NOW)).toBe('new');
  });

  it('treats a relearning card as almost-forgotten', () => {
    expect(cardStrength(makeCard({ state: 'relearning' }), NOW)).toBe('almost-forgotten');
  });

  it('treats retrievability below 0.7 as almost-forgotten', () => {
    const card = makeCard({ stability: 10, lastReview: daysAgo(45) });
    expect(retrievability(card, NOW)).toBeLessThan(0.7);
    expect(cardStrength(card, NOW)).toBe('almost-forgotten');
  });

  it('treats a learning card as just-seen', () => {
    expect(cardStrength(makeCard({ state: 'learning' }), NOW)).toBe('just-seen');
  });

  it('treats stability under a day as just-seen', () => {
    expect(cardStrength(makeCard({ stability: 0.5 }), NOW)).toBe('just-seen');
  });

  it('treats stability under a week as shaky', () => {
    expect(cardStrength(makeCard({ stability: 3 }), NOW)).toBe('shaky');
  });

  it('treats stability under a month as getting-solid', () => {
    expect(cardStrength(makeCard({ stability: 10 }), NOW)).toBe('getting-solid');
  });

  it('treats stability of a month or more as solid', () => {
    expect(cardStrength(makeCard({ stability: 60 }), NOW)).toBe('solid');
  });
});

describe('wordStrength', () => {
  function cardsFor(entries: Array<[Direction, Partial<CardState>]>): Record<string, CardState> {
    const out: Record<string, CardState> = {};
    for (const [direction, overrides] of entries) {
      out[cardKey(1, direction)] = makeCard({ direction, ...overrides });
    }
    return out;
  }

  it('is new when the word has no cards at all', () => {
    expect(wordStrength(makeWord(1), {}, NOW)).toBe('new');
  });

  it('is new when every card is in the new state', () => {
    const cards = cardsFor([['fr-en', { state: 'new' }], ['en-fr', { state: 'new' }]]);
    expect(wordStrength(makeWord(1), cards, NOW)).toBe('new');
  });

  it('ignores unseen directions when one direction is seen', () => {
    const cards = cardsFor([['fr-en', { stability: 60 }], ['en-fr', { state: 'new' }]]);
    expect(wordStrength(makeWord(1), cards, NOW)).toBe('solid');
  });

  it('takes the weakest of two seen directions', () => {
    const cards = cardsFor([['fr-en', { stability: 60 }], ['en-fr', { stability: 3 }]]);
    expect(wordStrength(makeWord(1), cards, NOW)).toBe('shaky');
  });
});

describe('bucketCounts', () => {
  it('tallies every word into exactly one bucket', () => {
    const words = [makeWord(1), makeWord(2), makeWord(3)];
    const cards: Record<string, CardState> = {
      [cardKey(1, 'fr-en')]: makeCard({ wordId: 1, stability: 60 }),
      [cardKey(2, 'fr-en')]: makeCard({ wordId: 2, stability: 3 }),
    };
    const counts = bucketCounts(words, cards, NOW);
    expect(counts.solid).toBe(1);
    expect(counts.shaky).toBe(1);
    expect(counts.new).toBe(1);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/play/strength.test.ts`
Expected: FAIL — `Failed to resolve import "./strength"`.

- [ ] **Step 3: Write the implementation**

Create `src/play/strength.ts`:

```ts
import type { Word } from '../types';
import { cardKey, type CardState, type Direction } from '../flashcards/types';

export type Strength =
  | 'new'
  | 'almost-forgotten'
  | 'just-seen'
  | 'shaky'
  | 'getting-solid'
  | 'solid';

/** Weakest to strongest. Aggregation and display both rely on this order. */
export const STRENGTH_ORDER: Strength[] = [
  'new', 'almost-forgotten', 'just-seen', 'shaky', 'getting-solid', 'solid',
];

/** The buckets Review can filter by — unseen words belong to the New source. */
export const REVIEW_STRENGTHS: Strength[] = STRENGTH_ORDER.filter((s) => s !== 'new');

export const STRENGTH_LABELS: Record<Strength, string> = {
  'new': 'New',
  'almost-forgotten': 'Almost forgotten',
  'just-seen': 'Just seen',
  'shaky': 'Shaky',
  'getting-solid': 'Getting solid',
  'solid': 'Solid',
};

// FSRS-5 forgetting curve. Written out rather than taken from ts-fsrs so the
// maths stays deterministic and directly testable.
const DECAY = -0.5;
const FACTOR = 19 / 81;
const MS_PER_DAY = 86_400_000;
const ALMOST_FORGOTTEN_BELOW = 0.7;

const DIRECTIONS: Direction[] = ['fr-en', 'en-fr'];

/** Predicted probability of recalling this card right now, 0..1. */
export function retrievability(card: CardState, now: Date): number {
  if (!card.lastReview || card.stability <= 0) return 0;
  const elapsedDays = Math.max(0, (now.getTime() - new Date(card.lastReview).getTime()) / MS_PER_DAY);
  return Math.pow(1 + FACTOR * (elapsedDays / card.stability), DECAY);
}

export function cardStrength(card: CardState | undefined, now: Date): Strength {
  if (!card || card.state === 'new') return 'new';
  if (card.state === 'relearning' || retrievability(card, now) < ALMOST_FORGOTTEN_BELOW) return 'almost-forgotten';
  if (card.state === 'learning' || card.stability < 1) return 'just-seen';
  if (card.stability < 7) return 'shaky';
  if (card.stability < 30) return 'getting-solid';
  return 'solid';
}

/** The word's cards that have actually been studied, in either direction. */
export function seenCards(word: Word, cards: Record<string, CardState>): CardState[] {
  const out: CardState[] = [];
  for (const direction of DIRECTIONS) {
    const card = cards[cardKey(word.id, direction)];
    if (card && card.state !== 'new') out.push(card);
  }
  return out;
}

/**
 * Weakest bucket across the word's seen cards. Unseen directions are ignored so
 * that a word with one solid direction and one untouched one still shows up in
 * Review rather than being mislabelled `new`.
 */
export function wordStrength(word: Word, cards: Record<string, CardState>, now: Date): Strength {
  const seen = seenCards(word, cards);
  if (seen.length === 0) return 'new';
  let weakest: Strength = 'solid';
  for (const card of seen) {
    const strength = cardStrength(card, now);
    if (STRENGTH_ORDER.indexOf(strength) < STRENGTH_ORDER.indexOf(weakest)) weakest = strength;
  }
  return weakest;
}

export function bucketCounts(
  words: Word[],
  cards: Record<string, CardState>,
  now: Date,
): Record<Strength, number> {
  const counts = {
    'new': 0, 'almost-forgotten': 0, 'just-seen': 0,
    'shaky': 0, 'getting-solid': 0, 'solid': 0,
  };
  for (const word of words) counts[wordStrength(word, cards, now)]++;
  return counts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/play/strength.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/play/strength.ts src/play/strength.test.ts
git commit -m "feat(play): add memory strength buckets

Classifies cards into strength buckets from the FSRS forgetting curve and
aggregates them per word, ignoring unseen directions."
```

---

### Task 4: Source selection

**Files:**
- Create: `src/play/selectWords.ts`
- Modify: `src/play/types.ts`
- Test: `src/play/selectWords.test.ts`

**Interfaces:**
- Consumes: `Strength`, `seenCards`, `wordStrength`, `retrievability` from Task 3.
- Produces:
  - In `src/play/types.ts`: `type PlaySource = 'new' | 'review' | 'selected'`, `type PlayCount = 10 | 20 | 50 | 'all'`, `ALL_COUNTS: PlayCount[]`.
  - In `src/play/selectWords.ts`: `selectPlayWords(inputs: SelectPlayWordsInputs): Word[]` and `countDue(words: Word[], cards: Record<string, CardState>, now: Date): number`.

  Tasks 6 and 7 call both functions. `PlaySource`/`PlayCount` live in `types.ts` rather than `selectWords.ts` so that `playStorage.ts` can import them without pulling in selection logic.

- [ ] **Step 1: Add the shared types to `src/play/types.ts`**

Add these exports near the top of the file, after the existing `ActivityType` and `PlayOutcome` declarations. Leave everything else in the file untouched for now — `PlaySettings` is extended in Task 5.

```ts
export type PlaySource = 'new' | 'review' | 'selected';
export type PlayCount = 10 | 20 | 50 | 'all';

export const ALL_COUNTS: PlayCount[] = [10, 20, 50, 'all'];

export const SOURCE_LABELS: Record<PlaySource, string> = {
  new: 'New',
  review: 'Review',
  selected: 'Selected',
};
```

- [ ] **Step 2: Write the failing test**

Create `src/play/selectWords.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Word } from '../types';
import type { CardState, Direction } from '../flashcards/types';
import { cardKey } from '../flashcards/types';
import { countDue, selectPlayWords } from './selectWords';

const NOW = new Date('2026-07-22T12:00:00Z');
const MS_PER_DAY = 86_400_000;

function makeWord(id: number): Word {
  return {
    id, rank: id,
    french: `mot${id}`, english: `meaning${id}`,
    pos: 'noun', ipa: '/x/',
    example: { fr: 'Ex.', en: 'Ex.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
}

function seen(
  wordId: number,
  direction: Direction,
  overrides: Partial<CardState> = {},
): [string, CardState] {
  return [cardKey(wordId, direction), {
    wordId, direction,
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: NOW.toISOString(),
    due: new Date(NOW.getTime() + 10 * MS_PER_DAY).toISOString(),
    ...overrides,
  }];
}

function base(words: Word[], cards: Record<string, CardState>) {
  return { words, cards, selected: [], buckets: [], count: 'all' as const, now: NOW };
}

describe('selectPlayWords — selected', () => {
  it('returns the selection verbatim, ignoring count', () => {
    const selection = [makeWord(3), makeWord(1)];
    const result = selectPlayWords({
      ...base([makeWord(1), makeWord(2), makeWord(3)], {}),
      source: 'selected', selected: selection, count: 10,
    });
    expect(result).toEqual(selection);
  });
});

describe('selectPlayWords — new', () => {
  it('returns only words with no seen card, sorted by rank', () => {
    const words = [makeWord(3), makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([seen(2, 'fr-en')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'new' });
    expect(result.map((w) => w.id)).toEqual([1, 3]);
  });

  it('excludes a word when only one direction is seen', () => {
    const words = [makeWord(1)];
    const cards = Object.fromEntries([seen(1, 'en-fr')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'new' });
    expect(result).toEqual([]);
  });

  it('respects a numeric count', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    const result = selectPlayWords({ ...base(words, {}), source: 'new', count: 10 });
    expect(result.length).toBe(10);
  });

  it('returns everything for count "all"', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    const result = selectPlayWords({ ...base(words, {}), source: 'new', count: 'all' });
    expect(result.length).toBe(30);
  });
});

describe('selectPlayWords — review', () => {
  it('excludes words that have never been seen', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([seen(1, 'fr-en')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([1]);
  });

  it('includes a word when only one direction is seen', () => {
    const words = [makeWord(1)];
    const cards = Object.fromEntries([seen(1, 'en-fr')]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([1]);
  });

  it('puts due words before not-due ones', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en'),
      seen(2, 'fr-en', { due: new Date(NOW.getTime() - MS_PER_DAY).toISOString() }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([2, 1]);
  });

  it('sorts due words by earliest due date', () => {
    const words = [makeWord(1), makeWord(2), makeWord(3)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { due: new Date(NOW.getTime() - 1 * MS_PER_DAY).toISOString() }),
      seen(2, 'fr-en', { due: new Date(NOW.getTime() - 9 * MS_PER_DAY).toISOString() }),
      seen(3, 'fr-en', { due: new Date(NOW.getTime() - 5 * MS_PER_DAY).toISOString() }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([2, 3, 1]);
  });

  it('uses the earliest due date across both directions', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { due: new Date(NOW.getTime() + MS_PER_DAY).toISOString() }),
      seen(1, 'en-fr', { due: new Date(NOW.getTime() - MS_PER_DAY).toISOString() }),
      seen(2, 'fr-en'),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([1, 2]);
  });

  it('tops up with the weakest not-yet-due words first', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { stability: 100 }),
      seen(2, 'fr-en', { stability: 100, lastReview: new Date(NOW.getTime() - 50 * MS_PER_DAY).toISOString() }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review' });
    expect(result.map((w) => w.id)).toEqual([2, 1]);
  });

  it('filters by bucket when buckets are given', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { stability: 60 }),
      seen(2, 'fr-en', { stability: 3 }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review', buckets: ['shaky'] });
    expect(result.map((w) => w.id)).toEqual([2]);
  });

  it('includes all buckets when the filter is empty', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { stability: 60 }),
      seen(2, 'fr-en', { stability: 3 }),
    ]);
    const result = selectPlayWords({ ...base(words, cards), source: 'review', buckets: [] });
    expect(result.length).toBe(2);
  });

  it('returns an empty list when nothing has been played', () => {
    const result = selectPlayWords({ ...base([makeWord(1)], {}), source: 'review' });
    expect(result).toEqual([]);
  });

  it('respects a numeric count', () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    const cards = Object.fromEntries(words.map((w) => seen(w.id, 'fr-en')));
    const result = selectPlayWords({ ...base(words, cards), source: 'review', count: 10 });
    expect(result.length).toBe(10);
  });
});

describe('countDue', () => {
  it('counts only words with a card due now or earlier', () => {
    const words = [makeWord(1), makeWord(2)];
    const cards = Object.fromEntries([
      seen(1, 'fr-en', { due: new Date(NOW.getTime() - MS_PER_DAY).toISOString() }),
      seen(2, 'fr-en'),
    ]);
    expect(countDue(words, cards, NOW)).toBe(1);
  });

  it('is zero for unseen words', () => {
    expect(countDue([makeWord(1)], {}, NOW)).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/play/selectWords.test.ts`
Expected: FAIL — `Failed to resolve import "./selectWords"`.

- [ ] **Step 4: Write the implementation**

Create `src/play/selectWords.ts`:

```ts
import type { Word } from '../types';
import type { CardState } from '../flashcards/types';
import { retrievability, seenCards, wordStrength, type Strength } from './strength';
import type { PlayCount, PlaySource } from './types';

export interface SelectPlayWordsInputs {
  source: PlaySource;
  words: Word[];
  cards: Record<string, CardState>;
  selected: Word[];
  buckets: Strength[];
  count: PlayCount;
  now: Date;
}

function take<T>(items: T[], count: PlayCount): T[] {
  return count === 'all' ? items : items.slice(0, count);
}

function earliestDue(seen: CardState[]): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const card of seen) earliest = Math.min(earliest, new Date(card.due).getTime());
  return earliest;
}

function lowestRetrievability(seen: CardState[], now: Date): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const card of seen) lowest = Math.min(lowest, retrievability(card, now));
  return lowest;
}

/** How many of these words have at least one card due now or earlier. */
export function countDue(words: Word[], cards: Record<string, CardState>, now: Date): number {
  const nowMs = now.getTime();
  let count = 0;
  for (const word of words) {
    const seen = seenCards(word, cards);
    if (seen.length > 0 && earliestDue(seen) <= nowMs) count++;
  }
  return count;
}

export function selectPlayWords({
  source, words, cards, selected, buckets, count, now,
}: SelectPlayWordsInputs): Word[] {
  if (source === 'selected') return selected;

  if (source === 'new') {
    const fresh = words.filter((word) => seenCards(word, cards).length === 0);
    fresh.sort((a, b) => a.rank - b.rank);
    return take(fresh, count);
  }

  const bucketSet = new Set(buckets);
  const eligible = words.filter((word) => {
    if (seenCards(word, cards).length === 0) return false;
    return bucketSet.size === 0 || bucketSet.has(wordStrength(word, cards, now));
  });

  const nowMs = now.getTime();
  const due: Word[] = [];
  const notDue: Word[] = [];
  for (const word of eligible) {
    if (earliestDue(seenCards(word, cards)) <= nowMs) due.push(word);
    else notDue.push(word);
  }

  due.sort((a, b) => {
    const at = earliestDue(seenCards(a, cards));
    const bt = earliestDue(seenCards(b, cards));
    return at !== bt ? at - bt : a.rank - b.rank;
  });

  notDue.sort((a, b) => {
    const ar = lowestRetrievability(seenCards(a, cards), now);
    const br = lowestRetrievability(seenCards(b, cards), now);
    return ar !== br ? ar - br : a.rank - b.rank;
  });

  return take([...due, ...notDue], count);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/play/selectWords.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Commit**

```bash
git add src/play/selectWords.ts src/play/selectWords.test.ts src/play/types.ts
git commit -m "feat(play): add source-based word selection

Resolves a play source into a word list: new words by rank, review words
due-first then topped up weakest-first, with optional bucket filtering."
```

---

### Task 5: Extend and persist play settings

**Files:**
- Modify: `src/play/types.ts`
- Modify: `src/play/playStorage.ts`
- Test: `src/play/playStorage.test.ts`

**Interfaces:**
- Consumes: `PlaySource`, `PlayCount`, `ALL_COUNTS` from Task 4; `REVIEW_STRENGTHS`, `Strength` from Task 3.
- Produces: `PlaySettings` with three new fields — `wordCount: PlayCount`, `source: PlaySource`, `buckets: Strength[]` — and a `loadPlaySettings()` that fills them in for settings saved under the old shape. Tasks 6 and 7 read and write this object.

- [ ] **Step 1: Write the failing test**

Replace the body of `src/play/playStorage.test.ts` with:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PLAY_SETTINGS, type PlaySettings } from './types';
import { PLAY_STORAGE_KEY, loadPlaySettings, savePlaySettings } from './playStorage';

afterEach(() => localStorage.clear());

describe('playStorage', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadPlaySettings()).toEqual(DEFAULT_PLAY_SETTINGS);
  });

  it('round-trips valid settings', () => {
    const settings: PlaySettings = {
      activities: ['choice', 'type'],
      repsPerWord: 3,
      wordCount: 50,
      source: 'new',
      buckets: ['shaky'],
    };
    savePlaySettings(settings);
    expect(loadPlaySettings()).toEqual(settings);
  });

  it('drops unknown activities and clamps reps', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: ['choice', 'bogus'], repsPerWord: 9 }));
    const loaded = loadPlaySettings();
    expect(loaded.activities).toEqual(['choice']);
    expect(loaded.repsPerWord).toBe(2);
  });

  it('falls back to default activities when none valid', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: [], repsPerWord: 2 }));
    expect(loadPlaySettings().activities).toEqual(DEFAULT_PLAY_SETTINGS.activities);
  });

  it('fills in defaults for settings saved under the old shape', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: ['choice'], repsPerWord: 3 }));
    const loaded = loadPlaySettings();
    expect(loaded.wordCount).toBe(DEFAULT_PLAY_SETTINGS.wordCount);
    expect(loaded.source).toBe(DEFAULT_PLAY_SETTINGS.source);
    expect(loaded.buckets).toEqual([]);
  });

  it('rejects an invalid word count', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ wordCount: 999 }));
    expect(loadPlaySettings().wordCount).toBe(DEFAULT_PLAY_SETTINGS.wordCount);
  });

  it('rejects an invalid source', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ source: 'bogus' }));
    expect(loadPlaySettings().source).toBe(DEFAULT_PLAY_SETTINGS.source);
  });

  it('drops unknown buckets and the new bucket', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ buckets: ['shaky', 'bogus', 'new'] }));
    expect(loadPlaySettings().buckets).toEqual(['shaky']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/play/playStorage.test.ts`
Expected: FAIL — `wordCount`, `source` and `buckets` are `undefined`.

- [ ] **Step 3: Extend `PlaySettings` in `src/play/types.ts`**

Add the `Strength` import at the top of the file:

```ts
import type { Strength } from './strength';
```

Replace the `PlaySettings` interface and `DEFAULT_PLAY_SETTINGS` constant with:

```ts
export interface PlaySettings {
  activities: ActivityType[];
  repsPerWord: 2 | 3;
  wordCount: PlayCount;
  source: PlaySource;
  buckets: Strength[];
}

export const DEFAULT_PLAY_SETTINGS: PlaySettings = {
  activities: ['flashcard', 'choice', 'type', 'listen'],
  repsPerWord: 2,
  wordCount: 20,
  source: 'review',
  buckets: [],
};
```

- [ ] **Step 4: Rewrite the clamp in `src/play/playStorage.ts`**

Replace the imports and `clamp` function; `loadPlaySettings` and `savePlaySettings` stay exactly as they are.

```ts
import { REVIEW_STRENGTHS } from './strength';
import {
  ALL_ACTIVITIES,
  ALL_COUNTS,
  DEFAULT_PLAY_SETTINGS,
  type PlayCount,
  type PlaySettings,
  type PlaySource,
} from './types';

export const PLAY_STORAGE_KEY = 'mille-mots-play-v1';

const ALL_SOURCES: PlaySource[] = ['new', 'review', 'selected'];

function clamp(s: Partial<PlaySettings>): PlaySettings {
  const requested = Array.isArray(s.activities) ? s.activities : DEFAULT_PLAY_SETTINGS.activities;
  const activities = ALL_ACTIVITIES.filter((a) => requested.includes(a));
  const repsPerWord = s.repsPerWord === 3 ? 3 : 2;
  const wordCount = ALL_COUNTS.includes(s.wordCount as PlayCount)
    ? (s.wordCount as PlayCount)
    : DEFAULT_PLAY_SETTINGS.wordCount;
  const source = ALL_SOURCES.includes(s.source as PlaySource)
    ? (s.source as PlaySource)
    : DEFAULT_PLAY_SETTINGS.source;
  const requestedBuckets = Array.isArray(s.buckets) ? s.buckets : [];
  const buckets = REVIEW_STRENGTHS.filter((b) => requestedBuckets.includes(b));
  return {
    activities: activities.length > 0 ? activities : [...DEFAULT_PLAY_SETTINGS.activities],
    repsPerWord,
    wordCount,
    source,
    buckets,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/play/playStorage.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/play/types.ts src/play/playStorage.ts src/play/playStorage.test.ts
git commit -m "feat(play): persist source, word count and bucket filter

Extends PlaySettings with the three new controls and validates them on
load, filling in defaults for settings saved under the old shape."
```

---

### Task 6: PlaySetup — source, count and strength controls

**Files:**
- Modify: `src/play/components/PlaySetup.tsx`
- Test: `src/play/components/PlaySetup.test.tsx` (create)

**Interfaces:**
- Consumes: `PlaySettings`, `PlaySource`, `PlayCount`, `ALL_COUNTS`, `SOURCE_LABELS` from Tasks 4-5; `REVIEW_STRENGTHS`, `STRENGTH_LABELS`, `Strength` from Task 3.
- Produces: a `SetupPreview` interface and a `PlaySetup` component whose props are `{ settings, onSettingsChange, onStart, preview, forceSource? }`. Task 7 constructs the `preview` object and renders this component.

```ts
export interface SetupPreview {
  words: Word[];
  dueCount: number;
  counts: Record<Strength, number>;
  selectedCount: number;
}
```

- [ ] **Step 1: Write the failing test**

Create `src/play/components/PlaySetup.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Word } from '../../types';
import type { Strength } from '../strength';
import { DEFAULT_PLAY_SETTINGS, type PlaySettings } from '../types';
import { PlaySetup, type SetupPreview } from './PlaySetup';

function makeWord(id: number): Word {
  return {
    id, rank: id,
    french: `mot${id}`, english: `meaning${id}`,
    pos: 'noun', ipa: '/x/',
    example: { fr: 'Ex.', en: 'Ex.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
}

const NO_COUNTS: Record<Strength, number> = {
  'new': 0, 'almost-forgotten': 0, 'just-seen': 0,
  'shaky': 0, 'getting-solid': 0, 'solid': 0,
};

function renderSetup(
  settings: Partial<PlaySettings> = {},
  preview: Partial<SetupPreview> = {},
  onSettingsChange = vi.fn(),
) {
  const merged: SetupPreview = {
    words: [], dueCount: 0, counts: NO_COUNTS, selectedCount: 0, ...preview,
  };
  render(
    <PlaySetup
      settings={{ ...DEFAULT_PLAY_SETTINGS, ...settings }}
      onSettingsChange={onSettingsChange}
      onStart={vi.fn()}
      preview={merged}
    />,
  );
  return onSettingsChange;
}

describe('PlaySetup', () => {
  it('offers New and Review sources', () => {
    renderSetup();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('hides the Selected source when nothing is selected', () => {
    renderSetup({}, { selectedCount: 0 });
    expect(screen.queryByRole('button', { name: 'Selected' })).not.toBeInTheDocument();
  });

  it('offers the Selected source when there is a selection', () => {
    renderSetup({}, { selectedCount: 3 });
    expect(screen.getByRole('button', { name: 'Selected' })).toBeInTheDocument();
  });

  it('changes source when a source chip is clicked', async () => {
    const onSettingsChange = renderSetup({ source: 'review' });
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ source: 'new' }));
  });

  it('toggles a strength bucket for the review source', async () => {
    const onSettingsChange = renderSetup(
      { source: 'review' },
      { words: [makeWord(1)], counts: { ...NO_COUNTS, shaky: 4 } },
    );
    await userEvent.click(screen.getByRole('button', { name: /Shaky/ }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ buckets: ['shaky'] }));
  });

  it('hides strength buckets for the new source', () => {
    renderSetup({ source: 'new' }, { words: [makeWord(1)] });
    expect(screen.queryByRole('button', { name: /Shaky/ })).not.toBeInTheDocument();
  });

  it('summarises a review session as due plus topped up', () => {
    renderSetup({ source: 'review' }, { words: [makeWord(1), makeWord(2), makeWord(3)], dueCount: 2 });
    expect(screen.getByText(/2 due, 1 topped up/)).toBeInTheDocument();
  });

  it('summarises a new session with the remaining count', () => {
    renderSetup(
      { source: 'new' },
      { words: [makeWord(1)], counts: { ...NO_COUNTS, new: 4812 } },
    );
    expect(screen.getByText(/4,812 remaining/)).toBeInTheDocument();
  });

  it('keeps the original copy for the selected source', () => {
    renderSetup(
      { source: 'selected' },
      { words: [makeWord(1), makeWord(2)], selectedCount: 2 },
    );
    expect(
      screen.getByText((_, el) => el?.textContent === 'Playing with 2 selected words.'),
    ).toBeInTheDocument();
  });

  it('explains when there are no new words left', () => {
    renderSetup({ source: 'new' }, { words: [] });
    expect(screen.getByText(/You've seen every word/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeDisabled();
  });

  it('explains when nothing has been played yet', () => {
    renderSetup({ source: 'review', buckets: [] }, { words: [] });
    expect(screen.getByText(/Nothing to review yet/)).toBeInTheDocument();
  });

  it('explains when the bucket filter matches nothing', () => {
    renderSetup({ source: 'review', buckets: ['solid'] }, { words: [] });
    expect(screen.getByText(/No words in the selected strengths/)).toBeInTheDocument();
  });

  it('enables Start when there are words and activities', () => {
    renderSetup({ source: 'new' }, { words: [makeWord(1)] });
    expect(screen.getByRole('button', { name: /start playing/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/play/components/PlaySetup.test.tsx`
Expected: FAIL — `PlaySetup` does not export `SetupPreview` and does not accept a `preview` prop.

- [ ] **Step 3: Rewrite `src/play/components/PlaySetup.tsx`**

The whole file:

```tsx
import { cn } from '@/lib/utils';
import type { Word } from '../../types';
import { REVIEW_STRENGTHS, STRENGTH_LABELS, type Strength } from '../strength';
import {
  ACTIVITY_LABELS,
  ALL_ACTIVITIES,
  ALL_COUNTS,
  SOURCE_LABELS,
  type ActivityType,
  type PlayCount,
  type PlaySettings,
  type PlaySource,
} from '../types';

export interface SetupPreview {
  /** The words this session would actually play, already resolved. */
  words: Word[];
  /** How many of those words have a card due now or earlier. */
  dueCount: number;
  counts: Record<Strength, number>;
  selectedCount: number;
}

interface Props {
  settings: PlaySettings;
  onSettingsChange: (s: PlaySettings) => void;
  onStart: () => void;
  preview: SetupPreview;
  /** When set, the source is fixed and its picker is hidden. */
  forceSource?: PlaySource;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 text-xs px-3 py-1.5 rounded-pill transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40',
        active ? 'bg-emphasis text-surface' : 'bg-surface text-text-muted hover:bg-surface-muted border border-border',
      )}
    >
      {children}
    </button>
  );
}

function countLabel(count: PlayCount): string {
  return count === 'all' ? 'All' : String(count);
}

function emptyMessage(settings: PlaySettings, source: PlaySource): string {
  if (source === 'selected') return 'Select some words to play.';
  if (source === 'new') return "You've seen every word. Try Review.";
  if (settings.buckets.length > 0) return 'No words in the selected strengths.';
  return 'Nothing to review yet — play some new words first.';
}

// Returns a fragment rather than a wrapper element: the caller's <div> must be
// the only node whose textContent is the summary, or getByText matches both the
// wrapper and the inner element and throws "found multiple elements".
function summary(settings: PlaySettings, source: PlaySource, preview: SetupPreview): React.ReactNode {
  const count = preview.words.length;
  if (count === 0) return emptyMessage(settings, source);
  const plural = count === 1 ? '' : 's';
  if (source === 'selected') {
    return <>Playing with <strong className="text-text">{count}</strong> selected word{plural}.</>;
  }
  if (source === 'new') {
    return <>Playing <strong className="text-text">{count}</strong> new word{plural} · {preview.counts.new.toLocaleString()} remaining</>;
  }
  return <>Playing <strong className="text-text">{count}</strong> word{plural} · {preview.dueCount} due, {count - preview.dueCount} topped up</>;
}

export function PlaySetup({ settings, onSettingsChange, onStart, preview, forceSource }: Props) {
  const source = forceSource ?? settings.source;
  const count = preview.words.length;
  const empty = count === 0;

  const sources: PlaySource[] = preview.selectedCount > 0
    ? ['new', 'review', 'selected']
    : ['new', 'review'];

  const toggleActivity = (a: ActivityType) => {
    const has = settings.activities.includes(a);
    const next = has ? settings.activities.filter((x) => x !== a) : [...settings.activities, a];
    onSettingsChange({ ...settings, activities: ALL_ACTIVITIES.filter((x) => next.includes(x)) });
  };

  const toggleBucket = (b: Strength) => {
    const has = settings.buckets.includes(b);
    const next = has ? settings.buckets.filter((x) => x !== b) : [...settings.buckets, b];
    onSettingsChange({ ...settings, buckets: REVIEW_STRENGTHS.filter((x) => next.includes(x)) });
  };

  const canStart = !empty && settings.activities.length > 0;

  return (
    <div className="flex flex-col gap-6 p-4">
      {forceSource === undefined && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Source</h3>
          <div className="flex gap-2">
            {sources.map((s) => (
              <Chip key={s} active={source === s} onClick={() => onSettingsChange({ ...settings, source: s })}>
                {SOURCE_LABELS[s]}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {source !== 'selected' && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Words</h3>
          <div className="flex gap-2">
            {ALL_COUNTS.map((c) => (
              <Chip key={String(c)} active={settings.wordCount === c} onClick={() => onSettingsChange({ ...settings, wordCount: c })}>
                {countLabel(c)}
              </Chip>
            ))}
          </div>
        </section>
      )}

      {source === 'review' && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Strength</h3>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_STRENGTHS.map((b) => (
              <Chip key={b} active={settings.buckets.includes(b)} onClick={() => toggleBucket(b)}>
                {STRENGTH_LABELS[b]} {preview.counts[b].toLocaleString()}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] text-text-subtle mt-1.5">Tap to narrow the session. Nothing tapped plays every strength.</p>
        </section>
      )}

      <div className="text-sm text-text-muted">{summary(settings, source, preview)}</div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Activities</h3>
        <div className="flex flex-wrap gap-1.5">
          {ALL_ACTIVITIES.map((a) => (
            <Chip key={a} active={settings.activities.includes(a)} onClick={() => toggleActivity(a)}>
              {ACTIVITY_LABELS[a]}
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-text-subtle mt-1.5">Each word is practised with a random mix of the enabled activities.</p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Rounds per word</h3>
        <div className="flex gap-2">
          {([2, 3] as const).map((r) => (
            <Chip key={r} active={settings.repsPerWord === r} onClick={() => onSettingsChange({ ...settings, repsPerWord: r })}>
              {r}
            </Chip>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        className="w-full py-3 rounded-md bg-emphasis text-surface font-medium hover:bg-emphasis/90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
      >
        Start playing
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/play/components/PlaySetup.test.tsx`
Expected: PASS, 13 tests. `PlayModal.test.tsx` will fail to compile — that is Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/play/components/PlaySetup.tsx src/play/components/PlaySetup.test.tsx
git commit -m "feat(play): add source, word count and strength controls to setup

Adds a source picker, a session size chooser and tappable strength bucket
filters, with a resolved session summary and per-source empty states."
```

---

### Task 7: Wire PlayModal to the new sources

**Files:**
- Modify: `src/play/components/PlayModal.tsx`
- Test: `src/play/components/PlayModal.test.tsx`

**Interfaces:**
- Consumes: `selectPlayWords`, `countDue` from Task 4; `bucketCounts` from Task 3; `PlaySetup`, `SetupPreview` from Task 6.
- Produces: `PlayModal` with props `{ words: Word[]; selected: Word[]; open: boolean; onClose: () => void; forceSource?: PlaySource }`. Task 8 renders it.

- [ ] **Step 1: Update the failing test**

Replace the body of `src/play/components/PlayModal.test.tsx` with:

```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import type { Word } from '../../types';
import type { PlaySource } from '../types';
import { PlayModal } from './PlayModal';

// The modal persists play settings on start and the provider reads the SRS
// blob, so tests must not inherit either from a previous case.
beforeEach(() => localStorage.clear());

function makeWord(id: number): Word {
  return { id, rank: id, french: `mot${id}`, english: `meaning${id}`, pos: 'noun', ipa: '/x/', example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' } };
}

function renderModal(words: Word[], selected: Word[] = [], forceSource?: PlaySource) {
  return render(
    <FlashcardProvider>
      <PlayModal
        words={words}
        selected={selected}
        open
        onClose={() => {}}
        {...(forceSource ? { forceSource } : {})}
      />
    </FlashcardProvider>,
  );
}

describe('PlayModal', () => {
  it('shows the setup screen with the selected word count', () => {
    const selection = [makeWord(1), makeWord(2)];
    renderModal(selection, selection, 'selected');
    expect(
      screen.getByText((_, el) => el?.textContent === 'Playing with 2 selected words.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeEnabled();
  });

  it('hides the source picker when the source is forced', () => {
    const selection = [makeWord(1)];
    renderModal(selection, selection, 'selected');
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('starts a session when Start is clicked', async () => {
    const selection = Array.from({ length: 3 }, (_, i) => makeWord(i + 1));
    renderModal(selection, selection, 'selected');
    await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
    expect(screen.getByLabelText(/session progress/i)).toBeInTheDocument();
  });

  it('plays unseen words when the source is new', async () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    renderModal(words);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
    expect(screen.getByLabelText(/session progress/i)).toBeInTheDocument();
  });

  it('cannot start Review with an untouched deck', async () => {
    const words = Array.from({ length: 5 }, (_, i) => makeWord(i + 1));
    renderModal(words);
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText(/Nothing to review yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/play/components/PlayModal.test.tsx`
Expected: FAIL — `PlayModal` still expects a `pool` prop and does not accept `words` or `forceSource`.

- [ ] **Step 3: Update `src/play/components/PlayModal.tsx`**

Change the imports to add `useMemo` and the new modules:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Word } from '../../types';
import { useFlashcardState } from '../../flashcards/useFlashcardState';
import { buildPlayQueue } from '../buildPlayQueue';
import { loadPlaySettings, savePlaySettings } from '../playStorage';
import { countDue, selectPlayWords } from '../selectWords';
import { bucketCounts } from '../strength';
import { emptyPlayResult, type PlayItem, type PlayOutcome, type PlayResult, type PlaySettings, type PlaySource } from '../types';
import { FlashcardActivity } from './activities/FlashcardActivity';
import { MultipleChoiceActivity } from './activities/MultipleChoiceActivity';
import { TypeActivity } from './activities/TypeActivity';
import { ListenActivity } from './activities/ListenActivity';
import { PlaySetup, type SetupPreview } from './PlaySetup';
import { PlaySummary } from './PlaySummary';
```

Replace the `Props` interface:

```tsx
interface Props {
  /** The full word list — the pool for both source selection and distractors. */
  words: Word[];
  selected: Word[];
  open: boolean;
  onClose: () => void;
  /** When set, the source is fixed and its picker is hidden. */
  forceSource?: PlaySource;
}
```

Replace the component signature and add the preview memo just after the `state` declaration:

```tsx
export function PlayModal({ words, selected, open, onClose, forceSource }: Props) {
  const api = useFlashcardState();
  const [settings, setSettings] = useState<PlaySettings>(() => loadPlaySettings());
  const [state, setState] = useState<PlayState>({ kind: 'setup' });

  const source = forceSource ?? settings.source;

  // Recomputed on every settings change so the setup screen's counts and empty
  // states always describe the session that Start would actually begin.
  const preview = useMemo<SetupPreview>(() => {
    const now = new Date();
    const resolved = selectPlayWords({
      source,
      words,
      cards: api.cards,
      selected,
      buckets: settings.buckets,
      count: settings.wordCount,
      now,
    });
    return {
      words: resolved,
      dueCount: countDue(resolved, api.cards, now),
      counts: bucketCounts(words, api.cards, now),
      selectedCount: selected.length,
    };
  }, [source, words, api.cards, selected, settings.buckets, settings.wordCount]);
```

Replace `start`:

```tsx
  const start = () => {
    savePlaySettings(settings);
    const queue = buildPlayQueue({ selected: preview.words, pool: words, settings });
    if (queue.length === 0) return;
    setState({ kind: 'session', queue, index: 0, streak: 0, result: emptyPlayResult(Date.now()) });
  };
```

Replace the `PlaySetup` element in the render tree:

```tsx
          {state.kind === 'setup' && (
            <PlaySetup
              settings={settings}
              onSettingsChange={setSettings}
              onStart={start}
              preview={preview}
              {...(forceSource ? { forceSource } : {})}
            />
          )}
```

Everything else in the file — the dialog shell, the `useEffect` hooks, `handleResult`, `renderActivity`, the session and summary branches — is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/play/components/PlayModal.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/play/components/PlayModal.tsx src/play/components/PlayModal.test.tsx
git commit -m "feat(play): resolve the play queue from the chosen source

PlayModal now takes the full word list and resolves New, Review or
Selected into a queue, previewing counts live on the setup screen."
```

---

### Task 8: Play button and PlayBar wiring

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PlayModal` from Task 7; `PlaySource` from Task 4.
- Produces: nothing downstream — this is the final task.

- [ ] **Step 1: Update `src/App.tsx`**

Add the `Play` icon and `PlaySource` imports at the top:

```tsx
import { Play } from 'lucide-react';
import type { PlaySource } from './play/types';
```

Replace the `playOpen` state declaration (line 36) with:

```tsx
  const [play, setPlay] = useState<{ open: boolean; force?: PlaySource }>({ open: false });
```

Replace the `PlayBar` block and the `PlayModal` element:

```tsx
      {selectMode && (
        <PlayBar
          count={selectedIds.size}
          onSelectAll={() => setSelectedIds(new Set(filtered.map((w) => w.id)))}
          onClear={() => setSelectedIds(new Set())}
          onPlay={() => setPlay({ open: true, force: 'selected' })}
        />
      )}
      {!selectMode && (
        <button
          type="button"
          onClick={() => setPlay({ open: true })}
          aria-label="Play"
          className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 px-5 py-3 rounded-pill bg-emphasis text-surface font-medium shadow-lg hover:bg-emphasis/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
        >
          <Play size={16} /> Play
        </button>
      )}
      <PlayModal
        words={words ?? []}
        selected={selectedWords}
        open={play.open}
        onClose={() => setPlay({ open: false })}
        {...(play.force ? { forceSource: play.force } : {})}
      />
```

- [ ] **Step 2: Run the full suite, type check and lint**

Run: `npm test && npx tsc -b --noEmit && npm run lint`
Expected: PASS — all tests green, no type errors, no lint errors.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`

Check each of these by hand:
1. A **Play** button sits at the bottom right of the word list.
2. Tapping it opens setup with **Source: New / Review** (no Selected chip) and a **Words** row of 10 / 20 / 50 / All.
3. Choosing **New** shows "Playing 20 new words · N remaining"; Start runs a session of unseen words.
4. Choosing **Review** on a fresh profile shows "Nothing to review yet — play some new words first." and Start is disabled.
5. After playing some new words, **Review** lists strength buckets with counts; tapping one narrows the session; tapping it again widens it.
6. Entering **Select** mode hides the Play button and shows the selection bar; its Play button opens setup with no source picker and the original "Playing with N selected words." copy.
7. Study mode (the due badge) still opens and runs, and its settings panel no longer has a "New words per day" slider.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(play): add a Play button for source-based sessions

Adds a floating Play button that opens setup with no preset source, and
routes the selection bar's Play button to the Selected source."
```

---

## Verification

After Task 8, the full check is:

```bash
npm test && npx tsc -b --noEmit && npm run lint && npm run build
```

All four must succeed before the branch is considered done.
