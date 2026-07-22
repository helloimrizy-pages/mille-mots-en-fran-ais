# Play sources: New and Review

**Date:** 2026-07-22
**Status:** Approved

## Problem

Play mode only runs on an explicit selection. You must enter select mode, tick
words one by one, then press Play. There is no way to say "just give me words I
haven't seen" or "drill the ones I'm about to forget".

The data needed for both already exists. Every answer in Play calls
`api.grade()`, so FSRS state — `stability`, `difficulty`, `state`, `due`,
`lapses` — is already accumulating per `wordId:direction`. It is simply never
surfaced or used to pick words.

## Scope

This spec covers play sources only. Google sign-in and Firestore sync are a
separate subsystem and get their own spec afterwards.

## Decisions

| Question | Decision |
|---|---|
| What does Review pull in? | Due cards first, then top up with the weakest not-yet-due words |
| Strength buckets | Shown with live counts; optionally tappable to filter the session |
| Entry point | One Play button; source picked on the setup screen |
| Session size | Chooser: 10 / 20 / 50 / all |
| Daily new-word cap | Removed entirely — `newPerDay` and the daily counter are deleted |
| Direction handling | Review queues by word; `buildPlayQueue` restricts each word's quiz direction to directions already studied |

### Why Review queues by word, not by card

FSRS tracks each direction as its own card, so the strictly correct design would
queue `(word, direction)` pairs and quiz each in its own direction. That was
rejected as too invasive for the value: it forces `buildPlayQueue` to stop
picking directions freely, and flashcard/listen activities are hardcoded
`fr-en` so they would have to be withheld from words never studied that way.

The accepted cost: `buildPlayQueue` restricts direction (and, for
flashcard/listen, the whole activity) to what a word has actually been studied
in — a genuinely new word is unrestricted, but a word only ever studied `en-fr`
is never quizzed `fr-en`, and never gets flashcard/listen at all unless doing
so would otherwise leave nothing to play. What is *not* guaranteed is that the
specific card quizzed is the one that was due — a word can still be pulled
because its `fr-en` card is overdue and then be quizzed `en-fr` if both
directions have been studied. No new cards are manufactured in a direction the
user has never seen. Acceptable because both directions of a word are learned
together in practice, and Study mode remains available for strict per-card
scheduling.

## Core logic

### `src/play/strength.ts` (new)

```ts
export type Strength =
  | 'new' | 'almost-forgotten' | 'just-seen'
  | 'shaky' | 'getting-solid' | 'solid';
```

Retrievability is delegated to `ts-fsrs`'s own `forgetting_curve(w, t, S)`,
called with the weights from `generatorParameters()` computed once at module
scope, rather than a formula written out by hand. This keeps it in lockstep
with whichever FSRS version the pinned `ts-fsrs` release implements — a
hard-coded curve goes stale the moment the library's default version changes,
which is exactly what happened here (the code shipped with the FSRS-5 curve
while `ts-fsrs@5.3.2`'s defaults are already FSRS-6). Under FSRS-6 the `R < 0.7`
threshold below fires near `t ≈ 9.3·S`, not the `t ≈ 4.4·S` an FSRS-5 curve
would give.

`t` is days since `lastReview` and `S` is `stability`. For a card with no
`lastReview`, `R` is treated as `0`.

Bucket for a **card**, first match wins:

| Bucket | Rule |
|---|---|
| `new` | no stored card, or `state === 'new'` |
| `almost-forgotten` | `state === 'relearning'`, or `R < 0.7` |
| `just-seen` | `state === 'learning'`, or `stability < 1` |
| `shaky` | `stability < 7` |
| `getting-solid` | `stability < 30` |
| `solid` | otherwise |

Bucket for a **word** is the weakest bucket across its **non-new** cards, where
"weakest" follows the table order top to bottom. If every card for the word is
new, the word is `new`.

Ignoring new cards during aggregation matters: a word whose `fr-en` card is
`solid` but whose `en-fr` card has never been seen must not be labelled `new`,
or it would vanish from every Review bucket despite being reviewable.

Exports:

- `retrievability(card, now): number`
- `cardStrength(card | undefined, now): Strength`
- `wordStrength(word, cards, now): Strength`
- `bucketCounts(words, cards, now): Record<Strength, number>`

`bucketCounts` counts every word by its `wordStrength`, including the `new`
bucket. The Review setup screen renders only the five non-`new` buckets, since
unseen words belong to the New source; the `new` count is still returned so the
New source can show its "N remaining" line from the same call.

### `src/play/selectWords.ts` (new)

One pure function, no React:

```ts
selectPlayWords({
  source, words, cards, selected, buckets, count, now
}): Word[]
```

- **`selected`** — returns `selected` verbatim. `count` and `buckets` ignored.
- **`new`** — words where both directions are unseen (`cardStrength === 'new'`
  for each), sorted by `rank` ascending, take `count`. Rank order matches how
  `useSession` already orders fresh cards, so the most frequent words come
  first.
- **`review`** — words with at least one non-new card. If `buckets` is
  non-empty, keep only words whose `wordStrength` is in it. Then partition:
  - **due** — the word has at least one non-new card with `due <= now`. Sorted
    by that word's *earliest* card due date, ties broken by `rank` ascending.
  - **not due** — sorted by retrievability ascending (weakest memory first),
    using the *lowest* retrievability among the word's non-new cards.

  Concatenate due-then-weakest and take `count`.

`count` is `10 | 20 | 50 | 'all'`.

### `buildPlayQueue` — direction restricted to studied directions

It takes an optional `cards` map. For each word, `choice`/`type` direction is
picked at random from the directions actually studied (a card with `state !==
'new'`) instead of from both; `flashcard`/`listen` stay hardcoded `fr-en`, and
are dropped for a word studied only `en-fr` — unless that would leave no
activity enabled at all, in which case the full enabled list is used rather
than emitting nothing for the word. A word with no studied directions (a
genuinely new word) is unrestricted, exactly as before this fix, and so is any
caller that omits `cards`. `selectPlayWords` feeds its existing `selected`
parameter. `distractors.ts` and all four activity components are untouched.

### Extended settings — `src/play/types.ts`

```ts
export type PlaySource = 'new' | 'review' | 'selected';

interface PlaySettings {
  activities: ActivityType[];
  repsPerWord: 2 | 3;
  wordCount: 10 | 20 | 50 | 'all';   // new
  source: PlaySource;                 // new
  buckets: Strength[];                // new — empty means all
}
```

`playStorage.clamp()` validates the three new fields. Defaults:
`wordCount: 20`, `source: 'review'`, `buckets: []`. Settings persisted under the
old shape load without error and pick up the defaults.

## UI

### Entry point — `App.tsx`

A floating Play button at `fixed bottom-5 right-5`, hidden while `selectMode` is
on because the sticky `PlayBar` already owns that corner. It opens `PlayModal`
with no preset source, so the setup screen restores the last-used source.

`PlayBar`'s Play button opens the same modal but forces `source: 'selected'`.

`PlayModal` props change from `{ selected, pool }` to
`{ words, selected, forceSource? }`. It already pulls `cards` from
`useFlashcardState()`, so `selectPlayWords` has everything it needs at
`start()`.

### `PlaySetup`

Three sections above the existing Activities and Rounds-per-word controls:

- **Source** — segmented control `New · Review · Selected`. *Selected* renders
  only when `selected.length > 0`.
- **Words** — chips `10 / 20 / 50 / All`. Hidden for *Selected*, whose size is
  fixed by what was ticked.
- **Strength** — Review only. Live counts per bucket, each tappable to filter.
  Nothing tapped means all buckets.

The "Playing with N selected words" line becomes a resolved count for the chosen
source:

- Review — `Playing 20 words · 14 due, 6 topped up`
- New — `Playing 20 new words · 4,812 remaining`
- Selected — unchanged

**Empty states** disable Start and explain why:

| Condition | Message |
|---|---|
| New, none left | You've seen every word. Try Review. |
| Review, nothing played yet | Nothing to review yet — play some new words first. |
| Review, bucket filter empty | No words in the selected strengths. |

## Removing the daily cap

Deleted:

- `StudySettings.newPerDay`
- `DailyCounter` and `StoredBlob.daily`
- `rolloverDaily` and the `wasNew` bookkeeping in `FlashcardContext.grade`
- `dailyRemaining` in `useSession` — `newAvailable` becomes
  `shuffledFresh.length`
- the new-words-per-day slider in `SettingsPanel`
- `FlashcardApi.daily`

### Migration

`storage.ts` goes to `CURRENT_VERSION = 2`. A real migration is required: the
current mismatch path (`storage.ts:54-57`) backs up and returns an **empty
blob**, so bumping the version without one would silently wipe existing SRS
history.

```
version 2      → load normally
version 1      → strip `daily` and `settings.newPerDay`,
                 keep cards/log/remaining settings, stamp version 2
anything else  → existing backup-and-reset path
```

`importJson` accepts both v1 and v2 through the same migration.

## Testing

**New**

- `strength.test.ts` — forgetting-curve values, every bucket boundary,
  weakest-of-two-directions aggregation, missing-card and no-`lastReview` cases.
- `selectWords.test.ts` — each source; due-before-topup ordering; topup sorted
  weakest-first; bucket filtering; `count` vs `'all'`; empty pools.
- `PlaySetup` cases for source switching, bucket chips, and each empty state.

**Updated**

- `storage.test.ts` — v1→v2 migration preserves cards and log, drops `daily` and
  `newPerDay`.
- `playStorage.test.ts` — the three new fields, plus loading old-shape settings.
- `FlashcardContext.test.tsx` — drop 3 daily-counter tests.
- `useSession.test.ts` — drop 5 `newPerDay` cap tests.
- `buildPlayQueue.test.ts` — direction and activity list restricted to
  directions already studied, plus the empty-list fallback.

## Files

**New** — `src/play/strength.ts`, `src/play/selectWords.ts`, and their tests

**Modified** — `src/play/types.ts`, `src/play/playStorage.ts`,
`src/play/buildPlayQueue.ts`, `src/play/components/PlayModal.tsx`,
`src/play/components/PlaySetup.tsx`, `src/play/components/PlayBar.tsx`,
`src/App.tsx`, `src/flashcards/types.ts`, `src/flashcards/storage.ts`,
`src/flashcards/useSession.ts`, `src/flashcards/components/SettingsPanel.tsx`,
`src/contexts/FlashcardContext.tsx`, and 4 test files

**Untouched** — `distractors.ts`, all four activity components, `fsrs.ts`

## Follow-up

Google sign-in and Firestore persistence, specced separately once this data
shape is settled.
