# Google sign-in and Firestore sync

**Date:** 2026-07-22
**Status:** Approved

## Problem

Every byte of user data lives in `localStorage` on one machine. Months of FSRS
review history disappear if the browser's site data is cleared, and there is no
way to study on a phone and a laptop and have them agree.

Three independent stores exist today:

| Key | Contents | Owner |
|---|---|---|
| `mille-mots-srs-v1` | `StoredBlob` v2 — cards, review log, study settings | `FlashcardContext` |
| `mille-mots-play-v1` | Play settings | `playStorage` |
| `mille-mots-prefs` | theme, hideTranslation | `PreferencesContext` |

Only the SRS blob is painful to lose.

## Scope

Follows the Play sources work (`2026-07-22-play-sources-design.md`), which
settled the shape of the data this spec has to persist.

The app is not deployed — there is no hosting config in the repo, and it runs
only via `npm run dev`. Firebase authorizes `localhost` by default, so Google
sign-in works in development immediately. Actual multi-device sync requires
deploying the app, which is out of scope here. The merge is nonetheless designed
for two devices from the start, because retrofitting conflict handling onto a
last-write-wins store after real divergent data exists means reconciling it by
hand.

## Decisions

| Question | Decision |
|---|---|
| Goal | Backup now, correct multi-device merge designed in from the start |
| Merge model | One Firestore document per user, merged card-by-card client-side |
| Sync timing | On sign-in, on change (debounced 250 ms), on tab focus |
| What syncs | SRS blob and Play settings; theme and hideTranslation stay device-local |
| Review log | Not synced |
| Testing | Pure merge function plus a mocked adapter; no Firebase in the suite |
| Auth UI | Account controls in the Settings Backup section, status dot in `TopBar` |

### Why the review log is not synced

`ReviewLogEntry[]` is written on every grade and capped at 1000 entries, but no
component reads it — the only references are the write in `FlashcardContext`,
the cap in `storage.ts`, and the type declaration. It accounts for ~133 KB of a
~591 KB payload. Excluding it drops the synced document to ~459 KB and removes
the append-merge problem entirely.

If the log gains a consumer later, syncing it needs its own decision: it is
append-only, so a union keyed on `(wordId, direction, reviewedAt)` would work,
but it would push the document back toward the 1 MiB cap.

### Why theme stays device-local

Dark mode on a phone at night and light on a laptop is a feature. Play settings
do sync — re-picking activities and session size on every new device is friction
with no upside.

## Data model

### Firestore

```
users/{uid} → {
  version: 1,
  epoch: number,
  cards:    Record<"wordId:direction", CardState>,
  settings: StudySettings,
  settingsUpdatedAt: number,   // epoch millis, client clock
  play:     PlaySettings,
  playUpdatedAt:     number,
  syncedAt: <server timestamp>,   // diagnostic only, never used for merge
}
```

`settings` and `play` carry their **own** timestamps rather than sharing one
document-level `updatedAt`. A single document timestamp cannot answer "are my
local settings newer than the remote ones" — it only says when the document was
last written, which is true of both objects at once and of the cards as well.
Two independent last-write-wins decisions need two independent timestamps.

They are client clock values, not server timestamps, because the comparison
happens client-side during the merge, before any write. A skewed device clock
can therefore win or lose a settings race incorrectly. That is acceptable: the
worst case is a preference object reverting, which is visible and one tap to
fix. Card merges do not depend on these timestamps at all.

One document per user. ~459 KB at a full deck of 1998 cards, 45% of Firestore's
1 MiB document cap. One read and one write per sync — negligible against the
50k reads/day free tier.

Per-card documents were rejected: ~2000 reads on every cold load is about 4% of
the daily free quota per app open, and it complicates offline behavior for no
benefit at this scale.

### Merge rules — `mergeBlobs(local, remote): SyncedBlob`

Pure function, no Firebase import.

- **cards** — union of keys. For a key present in both, the entry with the newer
  `lastReview` wins. If those are equal or both `null`, the entry with more
  `reps` wins. If still tied, local wins — deterministic, and local is what the
  user is looking at.
- **settings and play** — whole-object last-write-wins, each on its own
  timestamp. Not per-field: these objects are small, and per-field merge yields
  combinations neither device chose.
- **Nothing is ever deleted.** A card present on one side and absent on the
  other survives the merge.

### Local sync metadata

The merge needs local state that `StoredBlob` does not carry: the local `epoch`,
the two settings timestamps, `lastUid`, and the last successful sync time.

This lives in its **own** `localStorage` key, `mille-mots-sync-v1`:

```ts
interface SyncMeta {
  version: 1;
  lastUid: string | null;
  epoch: number;
  settingsUpdatedAt: number;
  playUpdatedAt: number;
  lastSyncedAt: number | null;
}
```

Deliberately not added to `StoredBlob`. That blob was migrated v1→v2 in the
previous piece of work, and extending it again would force a v3 migration of
every user's SRS data purely to carry bookkeeping that is not SRS data. A
separate key keeps the two concerns independent and makes this feature
removable without touching the store that matters.

Missing or corrupt metadata degrades safely: treat it as
`{ lastUid: null, epoch: 0, timestamps: 0, lastSyncedAt: null }`, which makes
the next sign-in behave like a first sign-in — merge local into remote, and let
remote settings win on the zero timestamps.

### `SyncedBlob`

The wire type is assembled at sync time from three local sources and split back
apart on the way in:

```
StoredBlob.cards    ←→  SyncedBlob.cards
StoredBlob.settings ←→  SyncedBlob.settings
PlaySettings        ←→  SyncedBlob.play
SyncMeta.epoch      ←→  SyncedBlob.epoch
```

`StoredBlob.log` is not part of `SyncedBlob`. Neither are the `PreferencesContext`
values.

## Two consequences of never deleting

### Reset must survive the merge

Under a never-delete merge, `resetAll` on one device is undone by the next sync,
which faithfully restores every card from the cloud.

A monotonically increasing `epoch` integer resolves this. `resetAll` bumps
`epoch` and writes an empty card map. A client whose local `epoch` is behind the
remote one discards its own cards *before* merging, rather than contributing
them. Reset becomes correctly destructive across devices at the cost of one
integer.

### A shared browser must not leak data between accounts

Sign in as user A and local data merges up correctly. Sign out, let user B sign
in on the same browser, and a naive merge would push A's cards into B's account.

The client persists `lastUid` alongside the blob. On sign-in:

- `lastUid` absent, or equal to the new uid → merge local into remote. This is
  the normal first sign-in and the normal returning sign-in.
- `lastUid` present and different → **replace** local with remote (or with an
  empty blob if remote has none). Do not merge.

Sign-out leaves local data untouched and retains `lastUid`, so signing back into
the same account still merges correctly.

## Architecture

### New files

| File | Responsibility |
|---|---|
| `src/sync/firebase.ts` | SDK initialization from `VITE_*` env; exports `auth` and `db`. The only file importing Firebase init. |
| `src/sync/adapter.ts` | The boundary interface — `loadRemote(uid)`, `saveRemote(uid, blob)`, `onAuthChange(cb)`, `signIn()`, `signOut()`. Real implementation plus a mock used by tests. |
| `src/sync/merge.ts` | `mergeBlobs`. Pure, exhaustively tested. |
| `src/sync/types.ts` | `SyncedBlob`, `SyncMeta`, `SyncStatus`. |
| `src/sync/syncMeta.ts` | Load/save `mille-mots-sync-v1`, with the same defensive validation style as `playStorage.ts`. |
| `src/contexts/AuthContext.tsx` | Auth state and sync orchestration. |
| `firestore.rules` | Security rules, committed for review. |

Isolating every Firebase call behind `adapter.ts` is what keeps the merge — the
only logic that can lose data — testable as a pure function, matching how
`strength.ts` and `selectWords.ts` are already built.

### `AuthContext`

Exposes `user | null`, `status`, `signIn()`, `signOut()`, `syncNow()`.

`status` is one of `'signed-out' | 'syncing' | 'synced' | 'offline' | 'error'`.

Three triggers:

- auth state change → pull, merge, push
- blob change, debounced 250 ms → push. Same pattern `FlashcardContext` already
  uses for its `localStorage` write.
- `visibilitychange` to visible → pull, merge

All three are serialized through a single promise chain, so a push can never
overtake an in-flight pull-merge.

### Wiring into the existing stores

`FlashcardContext` owns `blob` privately, and `importJson(str)` is currently the
only way to replace it. `FlashcardApi` gains two members so the sync layer does
not have to round-trip objects through JSON:

```ts
getBlob: () => StoredBlob;
replaceBlob: (blob: StoredBlob) => void;
```

`importJson` becomes a thin wrapper over `replaceBlob`.

Provider order in `main.tsx` becomes `Preferences > Flashcard > Auth > App`,
since `AuthContext` reads and writes the flashcard store.

## UI

- **`TopBar`** — one status control, roughly 24 px: outline circle when signed
  out, pulsing when syncing, the Google avatar when synced, a red dot on error.
  Tapping it opens Study → Settings.
- **`SettingsPanel`, Backup section** — "Sign in with Google", or the signed-in
  email with a Sign out button; last-synced time; a "Sync now" button; and any
  error text. It sits beside the existing Export/Import JSON controls, which
  address the same concern.

## Error handling

Sync failure is never fatal. Every path falls back to local-only operation, and
the app behaves exactly as it does today. Failures surface in the status control
and the settings panel — never as a modal, never blocking an interaction.

Offline is a normal state rather than an error. Firestore's IndexedDB
persistence is enabled; writes queue and flush on reconnect.

## Security

Firebase web config values (`apiKey`, `projectId`, and the rest) are public by
design. They go in `.env` as `VITE_*` variables and ship in the bundle, matching
the pattern `.env.example` already establishes. Security comes from the rules,
not from concealing the key:

```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Deploying the rules is manual for now, since no CI exists.

## Testing

No Firebase in the test suite. It stays offline and fast.

**`src/sync/merge.test.ts`** carries the weight:

- disjoint cards from both sides
- overlapping cards, newer and older `lastReview` in each direction
- `null` `lastReview` on one side and on both
- the `reps` tie-break, and the local-wins final tie-break
- epoch reset discarding local cards before merge
- settings and play last-write-wins in both directions, and independently of
  each other — newer local `play` with older local `settings` must keep local
  play and take remote settings
- account switch replacing rather than merging
- absent or corrupt `SyncMeta` degrading to first-sign-in behavior

**`src/contexts/AuthContext.test.tsx`** runs against the mock adapter:

- sign-in pulls, merges and pushes
- a change pushes once after the debounce, not per keystroke
- returning to the tab pulls
- adapter failure sets `status: 'error'` and leaves local state intact

## Scope

**New** — `src/sync/{firebase,adapter,merge,types,syncMeta}.ts`,
`src/contexts/AuthContext.tsx`, `firestore.rules`, and 3 test files
(`merge.test.ts`, `syncMeta.test.ts`, `AuthContext.test.tsx`)

**Modified** — `src/contexts/FlashcardContext.tsx` (adds `getBlob`/`replaceBlob`),
`src/play/playStorage.ts` (change notification), `src/components/TopBar.tsx`,
`src/flashcards/components/SettingsPanel.tsx`, `src/main.tsx`, `.env.example`

**Untouched** — all Play selection logic (`strength.ts`, `selectWords.ts`,
`buildPlayQueue.ts`), `fsrs.ts`, the four activity components, `WordList`

**Dependency added** — `firebase`. It is a heavy package; a manual Vite chunk
keeps it out of the main bundle.

## Follow-up

Deploying the app, which multi-device sync depends on in practice. Not specced
here.
