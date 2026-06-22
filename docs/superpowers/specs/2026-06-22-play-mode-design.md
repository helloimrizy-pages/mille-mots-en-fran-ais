# Play Mode — Design

**Date:** 2026-06-22
**Status:** Approved, pending implementation plan

## Summary

A new **Play** feature: an ad-hoc practice game over a user-selected set of
words. The user checks words from the main list, then plays a session that
auto-mixes several activity types (flashcard learn, multiple choice,
type-to-answer, listen-and-guess). Correct/incorrect answers feed the existing
FSRS spaced-repetition scheduler.

This is distinct from the existing **Study** feature (`StudyModal`), which is a
scheduled FSRS review queue. Play is selection-driven, casual, and replayable,
but shares the same FSRS card store so results count toward the user's progress.

## Decisions (from brainstorming)

1. **Selection:** checkboxes on the word list (a "select mode"), within the
   current search/filter view.
2. **Activity flow:** auto-mix — each word cycles through varied activities
   automatically; user may toggle which activity types are enabled before start.
3. **FSRS link:** Play feeds FSRS. Correct = "Good" (grade 3), wrong = "Again"
   (grade 1). The flashcard/learn activity is exposure only and is not graded.
4. **Session length:** multiple activities per word — each selected word appears
   2–3 times across different activity types.

## Existing building blocks (reused, not rebuilt)

- `Word` type (`src/types.ts`): `french`, `english`, `ipa`, `pos`,
  `example.{fr,en}`, `audio.{word,sentence}`.
- `useAudio()` (`src/hooks/useAudio.ts`): shared single-audio player,
  `play(id, src)` / `isPlaying(id)`.
- `useFlashcardState()` → `FlashcardApi.grade(wordId, direction, grade, now)`
  (`src/contexts/FlashcardContext.tsx`). Available app-wide; `FlashcardProvider`
  wraps `App` in `main.tsx`.
- `Direction = 'fr-en' | 'en-fr'` and `Grade = 1|2|3|4` (`src/flashcards/types.ts`).
- `isTypedAnswerCorrect(typed, expected)` + `normalizeForCompare`
  (`src/flashcards/components/TypedAnswer.tsx`): accent/case-insensitive match.
- `StudyModal` (`src/flashcards/components/StudyModal.tsx`): structural template
  for the modal (overlay, header tabs/progress, focus management, Esc to close).

## Architecture

New directory `src/play/`, mirroring `src/flashcards/`:

```
src/play/
  types.ts                       # ActivityType, PlayItem, PlaySettings, PlayResult, defaults
  buildPlayQueue.ts              # pure: selected words -> shuffled PlayItem[]
  buildPlayQueue.test.ts
  distractors.ts                 # pure: pickDistractors(answer, pool, n, rng)
  distractors.test.ts
  playStorage.ts                 # persist PlaySettings in its own localStorage key
  components/
    PlayModal.tsx                # container: setup -> session -> summary
    PlaySetup.tsx                # selected count, activity toggles, reps, Start
    PlaySummary.tsx              # accuracy %, correct/wrong, max streak, replay/done
    PlayBar.tsx                  # sticky bottom bar shown in select mode
    activities/
      FlashcardActivity.tsx
      MultipleChoiceActivity.tsx
      TypeActivity.tsx
      ListenActivity.tsx
```

Selection state lives in `App`. `WordList`/`WordRow` gain optional select props.

### Types (`src/play/types.ts`)

```ts
export type ActivityType = 'flashcard' | 'choice' | 'type' | 'listen';

export interface PlayItem {
  word: Word;
  activity: ActivityType;
  direction: Direction;     // flashcard: presentation only (fr-en), not graded
  choices?: Word[];         // present for 'choice' and 'listen' (4 incl. answer)
}

export interface PlaySettings {
  activities: ActivityType[];   // enabled types; default all four
  repsPerWord: 2 | 3;           // default 2
}

export interface PlayResult {
  correct: number;
  wrong: number;
  exposed: number;              // flashcard activities (ungraded)
  total: number;                // graded items only
  streakMax: number;
  startedAt: number;
  endedAt: number;
}

export const DEFAULT_PLAY_SETTINGS: PlaySettings = {
  activities: ['flashcard', 'choice', 'type', 'listen'],
  repsPerWord: 2,
};
```

### Queue construction (`buildPlayQueue.ts`)

`buildPlayQueue({ selected, pool, settings, rng })` — pure, deterministic given
an injected `rng: () => number` (so tests are seedable; never call `Math.random`
inside the pure function directly — pass it in).

Algorithm:
1. For each selected word, pick `repsPerWord` activity types from
   `settings.activities`. Prefer distinct types; if fewer enabled types than
   reps, allow a repeat but vary the `direction` so the item still differs.
2. For each item:
   - `direction`: `flashcard` → `'fr-en'` (presentation). `listen` → `'fr-en'`
     (hear French, give English). `choice`/`type` → randomly `'fr-en'` or
     `'en-fr'`.
   - `choice`/`listen`: `choices = shuffle([answer, ...pickDistractors(word, pool, 3, rng)])`.
3. Flatten all items and shuffle, with a best-effort pass to avoid the same word
   in adjacent positions.

Returns `PlayItem[]`.

### Distractors (`distractors.ts`)

`pickDistractors(answer: Word, pool: Word[], n: number, rng): Word[]`:
- Exclude the answer (by `id`).
- Prefer candidates with the same `pos`; if fewer than `n`, top up from the rest.
- No duplicates. If the pool is smaller than `n+1`, return as many as available
  (callers render whatever choices exist).

### Activities

Each activity component receives its `PlayItem`, the shared `useAudio` api, and an
`onResult(outcome: 'correct' | 'wrong' | 'exposed')` callback. They own their own
local reveal/feedback state and call `onResult` once, then the container advances.

1. **FlashcardActivity** — front: French word (audio button + IPA). Reveal shows
   English + example sentence (with sentence-audio button). Single "Got it →"
   button calls `onResult('exposed')`. Not graded.
2. **MultipleChoiceActivity** — prompt depends on direction: fr-en shows the
   French word (+audio) and 4 English options; en-fr shows English and 4 French
   options. Tapping an option locks in, highlights correct/chosen, then advances
   (Next button or short auto-advance). Calls `onResult('correct'|'wrong')`.
3. **TypeActivity** — prompt as above; a `TypedAnswer` input. Submit compares with
   `isTypedAnswerCorrect`, shows the expected answer + correct/wrong feedback,
   then advances. Calls `onResult`.
4. **ListenActivity** — auto-plays the French word audio on mount; a large
   replay button. 4 English-meaning options. fr-en. Calls `onResult`.

### Container (`PlayModal.tsx`)

Mirrors `StudyModal`: fixed overlay, header with progress (`i+1 / N`) + live
score/streak + close button, focus trap on open, Esc to close.

State machine:
- `setup` → renders `PlaySetup` (toggle activities, choose reps, Start). Start
  calls `buildPlayQueue` and transitions to `session` (empty queue → stay).
- `session` → renders the current activity. On `onResult`:
  - `'exposed'`: increment `exposed`, advance.
  - `'correct'`: `api.grade(word.id, direction, 3)`, increment `correct`, bump
    streak, advance.
  - `'wrong'`: `api.grade(word.id, direction, 1)`, increment `wrong`, reset
    streak, advance.
  - When the last item is consumed, transition to `summary`.
- `summary` → renders `PlaySummary`. "Play again" returns to `setup` with the
  same selection; "Done" closes.

### Selection UI

- `App`: `selectMode` boolean, `selectedIds: Set<number>`, `playOpen` boolean.
- `TopBar`: a "Select" toggle button. (Pass `selectMode`, `onToggleSelectMode`.)
- `WordList`/`WordRow`: optional `selectMode`, `selected`, `onToggleSelect`. In
  select mode a checkbox renders on the left of each row; the row click toggles
  selection instead of expand (expand still available via its own affordance).
- `PlayBar`: sticky bottom bar visible only in select mode. Shows count,
  "Select all" (the currently filtered list), "Clear", and **Play ▶** (disabled
  when count is 0). Play opens `PlayModal` with the selected `Word[]`.
- Selection persists after a session so the user can replay; "Clear" resets it.

### Persistence (`playStorage.ts`)

`PlaySettings` stored under its own key (e.g. `mille-mots-play-v1`), loaded with
defaults and clamped on read. Selection itself is ephemeral App state (not
persisted). The FSRS card store is untouched except through `api.grade`.

## FSRS interaction notes

- Only `choice`, `type`, `listen` grade. `flashcard` is exposure only.
- Correct → grade 3 (Good); wrong → grade 1 (Again), via existing `api.grade`.
- Grading a word with no prior card introduces it as new and counts toward the
  daily new-words limit (existing `FlashcardContext` behavior). This is intended:
  playing new words should advance learning.

## Testing

Vitest:
- `buildPlayQueue.test.ts`: produces `repsPerWord` items per selected word; only
  enabled activity types appear; `choice`/`listen` items have a `choices` array
  containing the answer plus up to 3 distinct distractors; `listen` and
  `flashcard` directions are always `'fr-en'`; deterministic given a fixed `rng`.
- `distractors.test.ts`: correct count, excludes the answer, prefers same `pos`,
  no duplicates, safe on a pool smaller than `n+1`.
- A component test (Testing Library) for `MultipleChoiceActivity` and
  `TypeActivity`: selecting/typing the right answer fires `onResult('correct')`,
  a wrong one fires `onResult('wrong')`.

## Out of scope (YAGNI)

- Per-direction or per-activity manual scheduling controls.
- Saved/named word sets or favorites (selection is ephemeral per the decision).
- Leaderboards, timers, or multiplayer.
```

