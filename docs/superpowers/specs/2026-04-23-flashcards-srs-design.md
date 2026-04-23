# Mille Mots — Flashcards & Spaced Repetition Design Spec

**Date:** 2026-04-23
**Status:** Approved, proceeding to implementation
**Author:** brainstorming session with Claude

## 1. Overview

Add a spaced-repetition flashcard feature to Mille Mots. Users can study the 1000-word corpus as flashcards, filter a session by part of speech, and practice recall in both directions (French ↔ English). Scheduling uses the FSRS algorithm. All state is local (localStorage). No backend.

This feature was explicitly out of scope in the original Mille Mots spec; this document adds it.

## 2. Scope

### In scope (v1)

- FSRS-based scheduling for each (word, direction) pair
- Two cards per word: FR → EN and EN → FR, tracked independently
- Self-grade UI with 4 buttons (Again / Hard / Good / Easy)
- Optional typed-check mode (accent-insensitive)
- Session setup: multi-select PoS filter, direction toggle, session goal (10 / 20 / 50 / Unlimited)
- Due-first scheduling with configurable new-per-day cap
- TopBar due badge, full-screen modal entry, session summary
- Stats panel: totals, mature/young, retention (last 30 days), per-PoS breakdown
- Settings panel: new-per-day, target retention, typed-check, export/import JSON, reset
- Keyboard shortcuts: Space = flip, 1–4 = grade
- Accessibility: focus management, ARIA on interactive elements

### Out of scope (v1)

- Cloud sync / accounts / multi-device
- Audio-only, image, or cloze cards
- Custom learning steps
- Leech detection, card suspension
- Per-word SRS indicator on the browse-list rows
- Import from Anki / CSV

## 3. Data model

Types live in `src/flashcards/types.ts`.

```ts
export type Direction = 'fr-en' | 'en-fr';
export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface CardState {
  wordId: number;
  direction: Direction;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  lastReview: string | null; // ISO
  due: string;               // ISO
}

export interface ReviewLog {
  wordId: number;
  direction: Direction;
  grade: Grade;
  reviewedAt: string;        // ISO
  elapsedDays: number;
  scheduledDays: number;
  state: CardState['state']; // state AFTER review
}

export interface StudySettings {
  newPerDay: number;               // default 20, range 0–50
  requestRetention: number;        // default 0.9, range 0.80–0.95
  typedCheck: boolean;             // default false
  lastGoal: 10 | 20 | 50 | 'unlimited';
  lastFilter: PartOfSpeech[];      // empty = all
  lastDirections: Direction[];     // empty = both
}
```

**Storage blob** (`localStorage` key `mille-mots-srs-v1`):

```ts
{
  version: 1,
  cards: Record<string, CardState>,  // key: `${wordId}:${direction}`
  log: ReviewLog[],                  // FIFO, capped at 1000
  settings: StudySettings,
  daily: { date: string; newIntroduced: number },
}
```

### Design decisions

1. **Lazy card creation.** No `CardState` exists until first review. `getCardState(wordId, dir)` returns a fresh "new" stub otherwise. Keeps storage tiny.
2. **Review log capped at 1000 entries.** Retention stats use recent history only.
3. **Daily counter is independent of log.** Enforces new-per-day cap without walking history.
4. **Schema versioned** via `version` field. Unknown versions → fallback to empty state, preserve the original blob under `mille-mots-srs-v1-backup`.

## 4. Architecture

New folder, isolated from existing browse code:

```
src/
  flashcards/
    fsrs.ts                  // pure scheduler — thin wrapper over ts-fsrs
    fsrs.test.ts
    types.ts
    storage.ts               // localStorage I/O (versioned, safe fallbacks)
    storage.test.ts
    useFlashcardState.ts     // reads FlashcardContext
    useSession.ts            // derived session queue (filter + goal + state)
    useSession.test.ts
    components/
      StudyModal.tsx         // full-screen overlay, 3 tabs
      SessionSetup.tsx
      Card.tsx
      GradeButtons.tsx
      TypedAnswer.tsx
      SessionSummary.tsx
      StatsPanel.tsx
      DueBadge.tsx
      SettingsPanel.tsx
  contexts/
    FlashcardContext.tsx     // provider: cards, log, settings, daily
    FlashcardContext.test.tsx
```

**Integration touches** (minimal):
- `main.tsx`: wrap `<App>` in `<FlashcardProvider>` (inside `<PreferencesProvider>`).
- `App.tsx`: render `<StudyModal>` when an `isStudyOpen` state is true; pass open/close.
- `TopBar.tsx`: add `<DueBadge onClick={openStudy} />` in the right-hand icon cluster.

Files *not* changed: `types.ts`, `useFilteredWords.ts`, `WordList.tsx`, `WordRow.tsx`, `WordRowExpanded.tsx`, `FilterChips.tsx`, `SortMenu.tsx`, `SearchInput.tsx`.

**FSRS library:** use [`ts-fsrs`](https://www.npmjs.com/package/ts-fsrs) (MIT). `fsrs.ts` wraps it so only our types cross module boundaries.

**Why context for state:** `DueBadge` (TopBar), `StudyModal`, `Card`, `StatsPanel` all need the same state. Mirrors the existing `PreferencesContext` pattern.

## 5. User flow

### Entry

`<DueBadge>` renders in the TopBar:
- 0 due: "Study"
- ≥1 due: "Study · N due"

Tap → `StudyModal` opens, full-screen overlay, 3 tabs: **Study** (default) / **Stats** / **Settings**.

### Study tab

**SessionSetup** (shown when no active session):
- Direction chips: FR → EN, EN → FR (multi-select, default: both)
- PoS chips: Noun / Verb / Adj / Adv / Pronoun / Conj / Prep (multi-select, empty = all)
- Session goal: 10 / 20 / 50 / Unlimited (segmented)
- Live preview: "12 due · 8 new available · session will draw 20 cards (12 due + 8 new)"
- Start button (disabled + hint when preview is empty)

**Card loop:**
- Front (FR → EN): large French word, IPA small, play-word button, "Show answer" (or tap-to-flip)
- Front (EN → FR): English meaning + PoS tag, "Show answer"
- Back: French + IPA + English + example sentence FR/EN + play-sentence button + GradeButtons
- Typed-check on: input above "Show answer"; Enter triggers accent-insensitive match, auto-flips, pre-highlights Good or Again; user still confirms with a grade button.
- Grade button captions show the next interval ("10m" / "1d" / "3d" / "7d") from `fsrs.preview(card, now)`.
- Progress bar: `N / total`.
- Keyboard: Space flips, 1–4 grade (only when flipped).
- Close (X) exits; grades already applied persist, queue rebuilds on re-enter.

**SessionSummary:**
- Cards reviewed, Good+Easy %, bucket counts, time spent.
- "Start another session" returns to SessionSetup; "Close" exits modal.

### Session-queue rules

- Pool = (due cards matching filter + direction) ∪ (new cards matching filter + direction).
- Due cards sorted by `due` ascending, random tiebreak.
- If `goal > due count`: fill with new cards up to `newPerDay - newIntroducedToday`.
- `goal = Unlimited`: serve all due + up to `newPerDay` remaining.
- Empty pool: Start disabled, hint shown.
- `newIntroduced` increments only on first grade for a (word, direction) — switching days (local midnight) resets it.

### Stats tab

- Totals: new / learning / review / relearning counts
- Mature (interval ≥ 21d) vs young
- Retention (last 30 days): % graded Good or Easy, from log
- Per-PoS table: seen / mature / due today
- Action: **Reset all progress** (confirm dialog)

### Settings tab

- New-per-day slider (0–50, default 20)
- Target retention slider (0.80–0.95, default 0.90) — under "Advanced" collapse
- Typed-check toggle
- Export JSON / Import JSON (full SRS blob round-trip)

## 6. State & persistence

- `FlashcardProvider` owns: `cards`, `log`, `settings`, `daily`.
- Exposes actions: `grade(wordId, direction, grade)`, `resetAll()`, `updateSettings(...)`, `importJson(str)`, `exportJson()`.
- Writes to `localStorage` debounced 250 ms to coalesce rapid grading.
- `useSession(filter, goal, directions)` is a derived hook: builds a queue from context + params; rebuilds when inputs change or cards mutate.
- Due-count selector for `DueBadge` memoized over `cards`.

## 7. Testing

Vitest + Testing Library, matching existing suite structure.

- `fsrs.test.ts`: scheduler matches reference outputs from `ts-fsrs` fixtures for known inputs/grades.
- `storage.test.ts`: round-trip save/load; unknown version → empty state + backup key preserved; malformed JSON → empty state; settings clamped to valid ranges on load.
- `useSession.test.ts`: queue ordering (due-first); new-per-day cap; multi-PoS filter; direction filter; goal honored; unlimited mode; empty pool.
- `FlashcardContext.test.tsx`: grade mutates card + appends log + increments daily; daily resets on new local date; review-log FIFO at 1000 cap.
- `Card.test.tsx`: renders correct front/back per direction; keyboard shortcuts; typed-check accent-insensitive match; typed-check disabled on front (can't type before the answer is visible? — no, user types while front is shown, Enter flips).
- `DueBadge.test.tsx`: shows "Study" when 0, "Study · N due" when ≥1.
- Smoke: keyboard-only traversal of a full card; focus returns to Study button when modal closes.

## 8. Performance

- FSRS math: O(1) per grade.
- Due count: memoized; linear scan over ≤2000 cards when cards mutate.
- Session-queue build: one linear pass on filter/cards change.
- No list virtualization needed — at most one card rendered at a time.

## 9. Open questions / resolved decisions

| Question | Decision |
|---|---|
| SRS algorithm | FSRS (via `ts-fsrs`) |
| Card direction | FR→EN and EN→FR as separate cards |
| Grading UI | Self-grade 4-button; optional typed-check |
| Card pool | All 1000 eligible; session filtered by PoS (multi-select) |
| Entry point | Full-screen modal |
| Session length | User-picked goal, due-first then new |
| Progress visibility | Full stats panel + TopBar badge + session summary |
| Persistence | localStorage, schema-versioned |
| Per-row SRS indicators | Out of scope for v1 |

## 10. Risks

- **localStorage quota.** 2000 cards + 1000 log entries + settings ≈ under 300 KB — well under the ~5 MB typical limit. Low risk.
- **FSRS parameter correctness.** Using the library's defaults; don't expose custom weights in v1.
- **Date arithmetic and timezones.** All dates stored as ISO strings; local "today" derived via `new Date().toISOString().slice(0, 10)` + timezone offset. Daily counter uses local date.
- **Test flakiness around time-based FSRS math.** Inject a `now` parameter into `fsrs.grade(...)` and `fsrs.preview(...)` so tests are deterministic.
