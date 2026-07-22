# Google Sign-in and Firestore Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in with Google and keep FSRS review history and Play settings in Firestore, merged correctly across two devices.

**Architecture:** Every Firebase call sits behind a small adapter interface, so the merge — the only logic that can lose data — is a pure function tested with no Firebase at all. One Firestore document per user holds cards, study settings and play settings; the client pulls it, merges card-by-card against local state, and pushes the result. Sync bookkeeping lives in its own `localStorage` key so the SRS blob needs no further migration.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + jsdom + @testing-library/react, Tailwind, `firebase` (modular v10+ SDK).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-firestore-sync-design.md`
- Test runner: `npx vitest run <path>` for one file, `npm test` for all.
- Type check: `npx tsc -b --noEmit`.
- **Lint has a pre-existing baseline of 21 problems** (17 errors, 4 warnings) from `eslint-plugin-react-hooks` v7 in files unrelated to this feature. `npm run lint` must still report exactly 21, with none in files this feature creates.
- **No Firebase in the test suite.** Tests must run offline and fast. Every test uses the mock adapter.
- Firestore document key path is `users/{uid}`. Wire format version is `1`.
- `SyncMeta` lives in `localStorage` key `mille-mots-sync-v1`. **Never add sync fields to `StoredBlob`** — it was migrated v1→v2 in the previous feature and must not need a v3 for bookkeeping.
- The review log (`StoredBlob.log`) is **not** synced. Neither are `PreferencesContext` values (theme, hideTranslation).
- Sync failure is never fatal. Every path falls back to local-only operation.
- Firebase web config goes in `.env` as `VITE_*`. These are public by design.
- Commit messages use Conventional Commits and carry **no** Co-Authored-By trailer and no Claude attribution.

---

### Task 1: Sync types and metadata store

**Files:**
- Create: `src/sync/types.ts`
- Create: `src/sync/syncMeta.ts`
- Test: `src/sync/syncMeta.test.ts`

**Interfaces:**
- Consumes: `CardState`, `StudySettings`, `DEFAULT_SETTINGS` from `src/flashcards/types`; `PlaySettings`, `DEFAULT_PLAY_SETTINGS` from `src/play/types`.
- Produces: `SyncedBlob`, `SyncMeta`, `SyncStatus`, `emptySyncedBlob()`, `SYNC_META_KEY`, `DEFAULT_SYNC_META`, `loadSyncMeta()`, `saveSyncMeta(meta)`. Tasks 2, 5 and 6 all import from these two files.

- [ ] **Step 1: Write the failing test**

Create `src/sync/syncMeta.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SYNC_META, SYNC_META_KEY, loadSyncMeta, saveSyncMeta } from './syncMeta';
import type { SyncMeta } from './types';

afterEach(() => localStorage.clear());

describe('syncMeta', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSyncMeta()).toEqual(DEFAULT_SYNC_META);
  });

  it('defaults to a first-sign-in posture', () => {
    const meta = loadSyncMeta();
    expect(meta.lastUid).toBeNull();
    expect(meta.epoch).toBe(0);
    expect(meta.settingsUpdatedAt).toBe(0);
    expect(meta.playUpdatedAt).toBe(0);
    expect(meta.lastSyncedAt).toBeNull();
  });

  it('round-trips a full record', () => {
    const meta: SyncMeta = {
      version: 1,
      lastUid: 'uid-abc',
      epoch: 3,
      settingsUpdatedAt: 1_700_000_000_000,
      playUpdatedAt: 1_700_000_001_000,
      lastSyncedAt: 1_700_000_002_000,
    };
    saveSyncMeta(meta);
    expect(loadSyncMeta()).toEqual(meta);
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(SYNC_META_KEY, '{not json');
    expect(loadSyncMeta()).toEqual(DEFAULT_SYNC_META);
  });

  it('falls back to defaults on a wrong version', () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ version: 99, lastUid: 'x', epoch: 5 }));
    expect(loadSyncMeta()).toEqual(DEFAULT_SYNC_META);
  });

  it('coerces non-numeric counters to zero rather than NaN', () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({
      version: 1, lastUid: 'uid', epoch: 'bogus',
      settingsUpdatedAt: null, playUpdatedAt: undefined, lastSyncedAt: 'nope',
    }));
    const meta = loadSyncMeta();
    expect(meta.epoch).toBe(0);
    expect(meta.settingsUpdatedAt).toBe(0);
    expect(meta.playUpdatedAt).toBe(0);
    expect(meta.lastSyncedAt).toBeNull();
    expect(meta.lastUid).toBe('uid');
  });

  it('coerces a non-string lastUid to null', () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({ version: 1, lastUid: 42, epoch: 1 }));
    expect(loadSyncMeta().lastUid).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sync/syncMeta.test.ts`
Expected: FAIL — `Failed to resolve import "./syncMeta"`.

- [ ] **Step 3: Write `src/sync/types.ts`**

```ts
import { DEFAULT_SETTINGS, type CardState, type StudySettings } from '../flashcards/types';
import { DEFAULT_PLAY_SETTINGS, type PlaySettings } from '../play/types';

export const SYNC_VERSION = 1;

/**
 * The wire format stored at users/{uid}. Assembled at sync time from the SRS
 * blob, the play settings and the local sync metadata; split back apart on the
 * way in. Deliberately excludes StoredBlob.log (nothing reads it) and the
 * PreferencesContext values (theme is device-appropriate, not account-wide).
 */
export interface SyncedBlob {
  version: 1;
  epoch: number;
  cards: Record<string, CardState>;
  settings: StudySettings;
  /**
   * Client clock, not a server timestamp: the comparison happens client-side
   * during the merge, before any write. Carried per object because one
   * document-level timestamp cannot say whether local *settings* are newer
   * than remote ones — it only says when the document was last written.
   */
  settingsUpdatedAt: number;
  play: PlaySettings;
  playUpdatedAt: number;
}

/**
 * Local bookkeeping the merge needs but StoredBlob does not carry. Kept in its
 * own localStorage key so this feature never forces another SRS migration.
 */
export interface SyncMeta {
  version: 1;
  lastUid: string | null;
  epoch: number;
  settingsUpdatedAt: number;
  playUpdatedAt: number;
  lastSyncedAt: number | null;
}

export type SyncStatus = 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';

export function emptySyncedBlob(): SyncedBlob {
  return {
    version: SYNC_VERSION,
    epoch: 0,
    cards: {},
    settings: { ...DEFAULT_SETTINGS },
    settingsUpdatedAt: 0,
    play: { ...DEFAULT_PLAY_SETTINGS },
    playUpdatedAt: 0,
  };
}
```

- [ ] **Step 4: Write `src/sync/syncMeta.ts`**

```ts
import { SYNC_VERSION, type SyncMeta } from './types';

export const SYNC_META_KEY = 'mille-mots-sync-v1';

export const DEFAULT_SYNC_META: SyncMeta = {
  version: SYNC_VERSION,
  lastUid: null,
  epoch: 0,
  settingsUpdatedAt: 0,
  playUpdatedAt: 0,
  lastSyncedAt: null,
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Missing or corrupt metadata degrades to a first-sign-in posture: lastUid null
 * makes the next sign-in merge rather than replace, and zero timestamps let
 * remote settings win. Both are the safe direction.
 */
export function loadSyncMeta(): SyncMeta {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SYNC_META_KEY); } catch { return { ...DEFAULT_SYNC_META }; }
  if (!raw) return { ...DEFAULT_SYNC_META };

  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ...DEFAULT_SYNC_META }; }
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SYNC_META };

  const obj = parsed as Partial<SyncMeta>;
  if (obj.version !== SYNC_VERSION) return { ...DEFAULT_SYNC_META };

  const lastSyncedAt = num(obj.lastSyncedAt);
  return {
    version: SYNC_VERSION,
    lastUid: typeof obj.lastUid === 'string' ? obj.lastUid : null,
    epoch: num(obj.epoch),
    settingsUpdatedAt: num(obj.settingsUpdatedAt),
    playUpdatedAt: num(obj.playUpdatedAt),
    lastSyncedAt: lastSyncedAt === 0 ? null : lastSyncedAt,
  };
}

export function saveSyncMeta(meta: SyncMeta): void {
  try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta)); } catch { /* quota or disabled */ }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/sync/syncMeta.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Type check and commit**

Run: `npx tsc -b --noEmit` — expect clean.

```bash
git add src/sync/types.ts src/sync/syncMeta.ts src/sync/syncMeta.test.ts
git commit -m "feat(sync): add sync types and local metadata store

Sync bookkeeping lives in its own localStorage key so the SRS blob needs
no further migration to carry it."
```

---

### Task 2: The merge function

**Files:**
- Create: `src/sync/merge.ts`
- Test: `src/sync/merge.test.ts`

**Interfaces:**
- Consumes: `SyncedBlob`, `emptySyncedBlob` from Task 1; `CardState` from `src/flashcards/types`.
- Produces: `mergeBlobs(local: SyncedBlob, remote: SyncedBlob | null): MergeResult` where `MergeResult = { blob: SyncedBlob; resetApplied: boolean }`. Task 5 calls it.

This is the only logic on this branch that can lose a user's data. It is pure — no Firebase import, no `Date.now()`, no `localStorage`.

- [ ] **Step 1: Write the failing test**

Create `src/sync/merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { CardState } from '../flashcards/types';
import { DEFAULT_SETTINGS } from '../flashcards/types';
import { DEFAULT_PLAY_SETTINGS } from '../play/types';
import { mergeBlobs } from './merge';
import { emptySyncedBlob, type SyncedBlob } from './types';

function card(overrides: Partial<CardState> = {}): CardState {
  return {
    wordId: 1, direction: 'fr-en',
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: '2026-07-01T00:00:00.000Z',
    due: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

function blob(overrides: Partial<SyncedBlob> = {}): SyncedBlob {
  return { ...emptySyncedBlob(), ...overrides };
}

describe('mergeBlobs — no remote', () => {
  it('returns local unchanged when remote is null', () => {
    const local = blob({ cards: { '1:fr-en': card() } });
    const result = mergeBlobs(local, null);
    expect(result.blob).toEqual(local);
    expect(result.resetApplied).toBe(false);
  });
});

describe('mergeBlobs — cards', () => {
  it('unions disjoint cards from both sides', () => {
    const local = blob({ cards: { '1:fr-en': card({ wordId: 1 }) } });
    const remote = blob({ cards: { '2:fr-en': card({ wordId: 2 }) } });
    const { blob: merged } = mergeBlobs(local, remote);
    expect(Object.keys(merged.cards).sort()).toEqual(['1:fr-en', '2:fr-en']);
  });

  it('keeps the card with the newer lastReview when local is newer', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-05T00:00:00.000Z', reps: 9 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-01T00:00:00.000Z', reps: 1 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.reps).toBe(9);
  });

  it('keeps the card with the newer lastReview when remote is newer', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-01T00:00:00.000Z', reps: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-05T00:00:00.000Z', reps: 9 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.reps).toBe(9);
  });

  it('prefers a card with a lastReview over one without', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: null, reps: 0 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: '2026-07-01T00:00:00.000Z', reps: 4 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.reps).toBe(4);
  });

  it('breaks a lastReview tie on reps', () => {
    const local = blob({ cards: { '1:fr-en': card({ reps: 2, lapses: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ reps: 7, lapses: 3 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.lapses).toBe(3);
  });

  it('breaks a full tie in favour of local', () => {
    const local = blob({ cards: { '1:fr-en': card({ difficulty: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ difficulty: 9 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.difficulty).toBe(1);
  });

  it('breaks a both-null-lastReview tie on reps', () => {
    const local = blob({ cards: { '1:fr-en': card({ lastReview: null, reps: 0, lapses: 0 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ lastReview: null, reps: 3, lapses: 2 }) } });
    expect(mergeBlobs(local, remote).blob.cards['1:fr-en']!.lapses).toBe(2);
  });

  it('never drops a card present on only one side', () => {
    const local = blob({ cards: { '1:fr-en': card(), '2:fr-en': card({ wordId: 2 }) } });
    const remote = blob({ cards: { '1:fr-en': card() } });
    expect(mergeBlobs(local, remote).blob.cards['2:fr-en']).toBeDefined();
  });
});

describe('mergeBlobs — epoch reset', () => {
  it('discards local cards when the remote epoch is ahead', () => {
    const local = blob({ epoch: 1, cards: { '1:fr-en': card(), '2:fr-en': card({ wordId: 2 }) } });
    const remote = blob({ epoch: 2, cards: {} });
    const result = mergeBlobs(local, remote);
    expect(result.blob.cards).toEqual({});
    expect(result.blob.epoch).toBe(2);
    expect(result.resetApplied).toBe(true);
  });

  it('discards remote cards when the local epoch is ahead', () => {
    const local = blob({ epoch: 5, cards: {} });
    const remote = blob({ epoch: 4, cards: { '1:fr-en': card() } });
    const result = mergeBlobs(local, remote);
    expect(result.blob.cards).toEqual({});
    expect(result.blob.epoch).toBe(5);
    expect(result.resetApplied).toBe(false);
  });

  it('merges normally at equal epochs', () => {
    const local = blob({ epoch: 3, cards: { '1:fr-en': card() } });
    const remote = blob({ epoch: 3, cards: { '2:fr-en': card({ wordId: 2 }) } });
    const result = mergeBlobs(local, remote);
    expect(Object.keys(result.blob.cards).sort()).toEqual(['1:fr-en', '2:fr-en']);
    expect(result.blob.epoch).toBe(3);
    expect(result.resetApplied).toBe(false);
  });
});

describe('mergeBlobs — settings and play', () => {
  it('takes remote settings when remote is newer', () => {
    const local = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: false }, settingsUpdatedAt: 100 });
    const remote = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: true }, settingsUpdatedAt: 200 });
    const { blob: merged } = mergeBlobs(local, remote);
    expect(merged.settings.typedCheck).toBe(true);
    expect(merged.settingsUpdatedAt).toBe(200);
  });

  it('keeps local settings when local is newer', () => {
    const local = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: true }, settingsUpdatedAt: 300 });
    const remote = blob({ settings: { ...DEFAULT_SETTINGS, typedCheck: false }, settingsUpdatedAt: 200 });
    expect(mergeBlobs(local, remote).blob.settings.typedCheck).toBe(true);
  });

  it('keeps local settings on a timestamp tie', () => {
    const local = blob({ settings: { ...DEFAULT_SETTINGS, requestRetention: 0.85 }, settingsUpdatedAt: 500 });
    const remote = blob({ settings: { ...DEFAULT_SETTINGS, requestRetention: 0.95 }, settingsUpdatedAt: 500 });
    expect(mergeBlobs(local, remote).blob.settings.requestRetention).toBe(0.85);
  });

  it('resolves settings and play independently of each other', () => {
    const local = blob({
      settings: { ...DEFAULT_SETTINGS, typedCheck: false }, settingsUpdatedAt: 100,
      play: { ...DEFAULT_PLAY_SETTINGS, repsPerWord: 3 }, playUpdatedAt: 900,
    });
    const remote = blob({
      settings: { ...DEFAULT_SETTINGS, typedCheck: true }, settingsUpdatedAt: 800,
      play: { ...DEFAULT_PLAY_SETTINGS, repsPerWord: 2 }, playUpdatedAt: 200,
    });
    const { blob: merged } = mergeBlobs(local, remote);
    expect(merged.settings.typedCheck).toBe(true);
    expect(merged.play.repsPerWord).toBe(3);
  });
});

describe('mergeBlobs — purity', () => {
  it('does not mutate either input', () => {
    const local = blob({ cards: { '1:fr-en': card({ reps: 1 }) } });
    const remote = blob({ cards: { '1:fr-en': card({ reps: 2, lastReview: '2026-08-01T00:00:00.000Z' }) } });
    const localCopy = structuredClone(local);
    const remoteCopy = structuredClone(remote);
    mergeBlobs(local, remote);
    expect(local).toEqual(localCopy);
    expect(remote).toEqual(remoteCopy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: FAIL — `Failed to resolve import "./merge"`.

- [ ] **Step 3: Write `src/sync/merge.ts`**

```ts
import type { CardState } from '../flashcards/types';
import { SYNC_VERSION, type SyncedBlob } from './types';

export interface MergeResult {
  blob: SyncedBlob;
  /** True when the remote epoch was ahead, so local cards were discarded. */
  resetApplied: boolean;
}

function reviewedAt(card: CardState): number {
  if (!card.lastReview) return Number.NEGATIVE_INFINITY;
  const t = new Date(card.lastReview).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Newer lastReview wins. Ties fall to more reps, then to `a` — the caller
 * always passes local as `a`, so a full tie keeps what the user is looking at.
 */
function pickCard(a: CardState, b: CardState): CardState {
  const ta = reviewedAt(a);
  const tb = reviewedAt(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (a.reps !== b.reps) return a.reps > b.reps ? a : b;
  return a;
}

function mergeCards(
  local: Record<string, CardState>,
  remote: Record<string, CardState>,
): Record<string, CardState> {
  const out: Record<string, CardState> = { ...remote };
  for (const [key, localCard] of Object.entries(local)) {
    const remoteCard = remote[key];
    out[key] = remoteCard ? pickCard(localCard, remoteCard) : localCard;
  }
  return out;
}

/**
 * Merges a local blob against whatever is in the cloud.
 *
 * Cards are unioned and never deleted, which is what makes "reset all" need the
 * epoch: without it, wiping one device would be undone by the next sync
 * faithfully restoring every card. A side whose epoch is behind contributes no
 * cards at all.
 *
 * Pure: no clock, no storage, no Firebase. Neither input is mutated.
 */
export function mergeBlobs(local: SyncedBlob, remote: SyncedBlob | null): MergeResult {
  if (!remote) return { blob: { ...local }, resetApplied: false };

  const epoch = Math.max(local.epoch, remote.epoch);
  const resetApplied = remote.epoch > local.epoch;

  let cards: Record<string, CardState>;
  if (remote.epoch > local.epoch) cards = { ...remote.cards };
  else if (local.epoch > remote.epoch) cards = { ...local.cards };
  else cards = mergeCards(local.cards, remote.cards);

  const localSettingsWins = local.settingsUpdatedAt >= remote.settingsUpdatedAt;
  const localPlayWins = local.playUpdatedAt >= remote.playUpdatedAt;

  return {
    blob: {
      version: SYNC_VERSION,
      epoch,
      cards,
      settings: localSettingsWins ? { ...local.settings } : { ...remote.settings },
      settingsUpdatedAt: Math.max(local.settingsUpdatedAt, remote.settingsUpdatedAt),
      play: localPlayWins ? { ...local.play } : { ...remote.play },
      playUpdatedAt: Math.max(local.playUpdatedAt, remote.playUpdatedAt),
    },
    resetApplied,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Type check and commit**

Run: `npx tsc -b --noEmit` — expect clean.

```bash
git add src/sync/merge.ts src/sync/merge.test.ts
git commit -m "feat(sync): add the pure blob merge

Cards union with newest-lastReview winning per card; an epoch gate makes
reset survive a merge that otherwise never deletes."
```

---

### Task 3: Expose the local stores to the sync layer

**Files:**
- Modify: `src/contexts/FlashcardContext.tsx`
- Modify: `src/play/playStorage.ts`
- Test: `src/contexts/FlashcardContext.test.tsx`
- Test: `src/play/playStorage.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `FlashcardApi` gains `getBlob: () => StoredBlob` and `replaceBlob: (blob: StoredBlob) => void`. `importJson` becomes a thin wrapper over `replaceBlob`.
  - `src/contexts/FlashcardContext.tsx` gains a module-level `subscribeReset(cb: () => void): () => void`, and `resetAll` notifies subscribers.
  - `src/play/playStorage.ts` gains `subscribePlaySettings(cb: (s: PlaySettings) => void): () => void`, and `savePlaySettings` notifies subscribers.

  Task 5 uses all five.

**Why the reset signal matters.** `resetAll` is wired to a real button in
`src/flashcards/components/StatsPanel.tsx:160`. Under a merge that never
deletes, a reset with no epoch bump is undone by the very next sync, which
faithfully restores every card from the cloud. The subscription is how the sync
layer learns a reset happened so it can bump the epoch. Without it the whole
epoch mechanism is dead code.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('FlashcardProvider', ...)` block in `src/contexts/FlashcardContext.test.tsx`:

```tsx
  it('getBlob returns the current blob', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const blob = result.current.getBlob();
    expect(blob.version).toBe(2);
    expect(blob.cards['1:fr-en']).toBeDefined();
    expect(blob.log.length).toBe(1);
  });

  it('replaceBlob swaps the whole blob', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const replacement = { ...result.current.getBlob(), cards: {}, log: [] };
    act(() => { result.current.replaceBlob(replacement); });
    expect(result.current.cards).toEqual({});
    expect(result.current.log).toEqual([]);
  });

  it('importJson still works after being rerouted through replaceBlob', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const json = result.current.exportJson();
    act(() => { result.current.resetAll(); });
    expect(result.current.cards).toEqual({});
    let ok = false;
    act(() => { ok = result.current.importJson(json); });
    expect(ok).toBe(true);
    expect(result.current.cards['1:fr-en']).toBeDefined();
  });

  it('importJson rejects malformed input without touching state', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    let ok = true;
    act(() => { ok = result.current.importJson('{not json'); });
    expect(ok).toBe(false);
    expect(result.current.cards['1:fr-en']).toBeDefined();
  });

  it('resetAll notifies reset subscribers until unsubscribed', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    let count = 0;
    const unsubscribe = subscribeReset(() => { count++; });
    act(() => { result.current.resetAll(); });
    expect(count).toBe(1);
    unsubscribe();
    act(() => { result.current.resetAll(); });
    expect(count).toBe(1);
  });
```

Add `subscribeReset` to that file's import from `./FlashcardContext`:

```tsx
import { FlashcardProvider, subscribeReset } from './FlashcardContext';
```

Append to the `describe('playStorage', ...)` block in `src/play/playStorage.test.ts`, and add `subscribePlaySettings` to that file's import from `./playStorage`:

```ts
  it('notifies subscribers when settings are saved', () => {
    const seen: number[] = [];
    const unsubscribe = subscribePlaySettings((s) => seen.push(s.repsPerWord));
    savePlaySettings({ ...DEFAULT_PLAY_SETTINGS, repsPerWord: 3 });
    savePlaySettings({ ...DEFAULT_PLAY_SETTINGS, repsPerWord: 2 });
    unsubscribe();
    savePlaySettings({ ...DEFAULT_PLAY_SETTINGS, repsPerWord: 3 });
    expect(seen).toEqual([3, 2]);
  });

  it('supports multiple independent subscribers', () => {
    let a = 0;
    let b = 0;
    const un1 = subscribePlaySettings(() => { a++; });
    const un2 = subscribePlaySettings(() => { b++; });
    savePlaySettings({ ...DEFAULT_PLAY_SETTINGS });
    un1();
    savePlaySettings({ ...DEFAULT_PLAY_SETTINGS });
    un2();
    expect(a).toBe(1);
    expect(b).toBe(2);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/contexts/FlashcardContext.test.tsx src/play/playStorage.test.ts`
Expected: FAIL — `result.current.getBlob is not a function`, and `subscribePlaySettings` is not exported.

- [ ] **Step 3: Update `src/contexts/FlashcardContext.tsx`**

Add the two members to the `FlashcardApi` interface, immediately after `settings`:

```ts
  getBlob: () => StoredBlob;
  replaceBlob: (blob: StoredBlob) => void;
```

Add the reset notifier at module scope, above the `FlashcardProvider` function:

```tsx
const resetListeners = new Set<() => void>();

/**
 * Lets the sync layer learn that this device authoritatively cleared its cards.
 * Without it, a reset would be silently undone by the next sync, because the
 * merge never deletes.
 */
export function subscribeReset(cb: () => void): () => void {
  resetListeners.add(cb);
  return () => { resetListeners.delete(cb); };
}
```

Make `resetAll` notify, keeping its existing body:

```tsx
  const resetAll = useCallback(() => {
    setBlob((prev) => ({
      version: 2,
      cards: {},
      log: [],
      settings: prev.settings,
    }));
    for (const cb of resetListeners) cb();
  }, []);
```

Add the two callbacks next to the existing `exportJson`/`importJson` definitions, and reroute `importJson`:

```ts
  const getBlob = useCallback(() => blob, [blob]);

  const replaceBlob = useCallback((next: StoredBlob) => {
    setBlob(next);
  }, []);

  const exportJson = useCallback(() => storageExport(blob), [blob]);

  const importJson = useCallback((str: string): boolean => {
    const imported = storageImport(str);
    if (!imported) return false;
    replaceBlob(imported);
    return true;
  }, [replaceBlob]);
```

Add `getBlob` and `replaceBlob` to the `useMemo` object and to its dependency array:

```ts
  const api = useMemo<FlashcardApi>(() => ({
    cards: blob.cards,
    log: blob.log,
    settings: blob.settings,
    dueCount,
    getCard,
    grade,
    updateSettings,
    resetAll,
    getBlob,
    replaceBlob,
    exportJson,
    importJson,
  }), [blob, dueCount, getCard, grade, updateSettings, resetAll, getBlob, replaceBlob, exportJson, importJson]);
```

- [ ] **Step 4: Update `src/play/playStorage.ts`**

Add after the `clamp` function and before `loadPlaySettings`:

```ts
type PlaySettingsListener = (settings: PlaySettings) => void;

const listeners = new Set<PlaySettingsListener>();

/** Lets the sync layer learn about play-settings changes without polling. */
export function subscribePlaySettings(cb: PlaySettingsListener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
```

Replace `savePlaySettings` with:

```ts
export function savePlaySettings(s: PlaySettings): void {
  try { localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify(s)); } catch { /* quota or disabled */ }
  // Notify even if the write failed — the in-memory value the caller is using
  // changed regardless, and the sync layer should push it.
  for (const cb of listeners) cb(s);
}
```

- [ ] **Step 5: Run the full suite**

Run: `npm test && npx tsc -b --noEmit`
Expected: PASS — all tests green, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/FlashcardContext.tsx src/contexts/FlashcardContext.test.tsx src/play/playStorage.ts src/play/playStorage.test.ts
git commit -m "feat(sync): expose the local stores to the sync layer

Adds getBlob/replaceBlob to FlashcardApi and a change subscription to
play settings, so syncing never round-trips objects through JSON."
```

---

### Task 4: Firebase adapter and configuration

**Files:**
- Create: `src/sync/adapter.ts`
- Create: `src/sync/firebase.ts`
- Create: `firestore.rules`
- Modify: `.env.example`
- Modify: `vite.config.ts`
- Modify: `package.json` (via `npm install`)
- Test: `src/sync/adapter.test.ts`

**Interfaces:**
- Consumes: `SyncedBlob`, `emptySyncedBlob` from Task 1.
- Produces:

```ts
export interface SyncUser { uid: string; email: string | null; photoURL: string | null; }

export interface SyncAdapter {
  loadRemote(uid: string): Promise<SyncedBlob | null>;
  saveRemote(uid: string, blob: SyncedBlob): Promise<void>;
  onAuthChange(cb: (user: SyncUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export function createMockAdapter(initial?: { remote?: SyncedBlob | null }): MockAdapter;
```

  where `MockAdapter extends SyncAdapter` and additionally exposes `emitUser(user: SyncUser | null): void`, `remote: SyncedBlob | null`, `saveCount: number`, `loadCount: number`, and `failNext(error: Error): void`. Task 5's tests depend on every one of those.

- [ ] **Step 1: Install the dependency**

Run: `npm install firebase`

- [ ] **Step 2: Write the failing test**

Create `src/sync/adapter.test.ts`. Note this exercises **only the mock** — the real adapter is a thin binding to the Firebase SDK and is verified by hand in Task 7.

```ts
import { describe, expect, it } from 'vitest';
import { createFirebaseAdapter, createMockAdapter } from './adapter';
import { emptySyncedBlob } from './types';

describe('createMockAdapter', () => {
  it('starts with no remote unless given one', async () => {
    const adapter = createMockAdapter();
    expect(await adapter.loadRemote('uid')).toBeNull();
  });

  it('returns the seeded remote', async () => {
    const seeded = { ...emptySyncedBlob(), epoch: 4 };
    const adapter = createMockAdapter({ remote: seeded });
    expect((await adapter.loadRemote('uid'))?.epoch).toBe(4);
  });

  it('records saves and serves them back', async () => {
    const adapter = createMockAdapter();
    await adapter.saveRemote('uid', { ...emptySyncedBlob(), epoch: 2 });
    expect(adapter.saveCount).toBe(1);
    expect((await adapter.loadRemote('uid'))?.epoch).toBe(2);
  });

  it('counts loads', async () => {
    const adapter = createMockAdapter();
    await adapter.loadRemote('uid');
    await adapter.loadRemote('uid');
    expect(adapter.loadCount).toBe(2);
  });

  it('emits auth changes to subscribers until unsubscribed', () => {
    const adapter = createMockAdapter();
    const seen: (string | null)[] = [];
    const unsubscribe = adapter.onAuthChange((u) => seen.push(u?.uid ?? null));
    adapter.emitUser({ uid: 'a', email: 'a@example.com', photoURL: null });
    adapter.emitUser(null);
    unsubscribe();
    adapter.emitUser({ uid: 'b', email: null, photoURL: null });
    expect(seen).toEqual(['a', null]);
  });

  it('fails exactly one operation after failNext', async () => {
    const adapter = createMockAdapter();
    adapter.failNext(new Error('offline'));
    await expect(adapter.loadRemote('uid')).rejects.toThrow('offline');
    await expect(adapter.loadRemote('uid')).resolves.toBeNull();
  });

  it('does not mutate the callers blob on save', async () => {
    const adapter = createMockAdapter();
    const blob = { ...emptySyncedBlob(), epoch: 1 };
    await adapter.saveRemote('uid', blob);
    blob.epoch = 99;
    expect((await adapter.loadRemote('uid'))?.epoch).toBe(1);
  });

  it('signIn emits a user and signOut emits null', async () => {
    const adapter = createMockAdapter();
    const seen: (string | null)[] = [];
    adapter.onAuthChange((u) => seen.push(u?.uid ?? null));
    await adapter.signIn();
    await adapter.signOut();
    expect(seen.length).toBe(2);
    expect(seen[0]).toBeTruthy();
    expect(seen[1]).toBeNull();
  });
});

describe('firebase module', () => {
  it('is safe to import with no config, and reports itself unconfigured', async () => {
    // The test environment has no VITE_FIREBASE_* values. Importing must not
    // throw and getFirebase() must return null — that is what makes a missing
    // config degrade to local-only rather than crashing the app on mount.
    const mod = await import('./firebase');
    expect(mod.firebaseConfigured).toBe(false);
    expect(mod.getFirebase()).toBeNull();
  });

  it('leaves the real adapter inert when unconfigured', async () => {
    const adapter = createFirebaseAdapter();
    await expect(adapter.loadRemote('uid')).resolves.toBeNull();
    await expect(adapter.saveRemote('uid', emptySyncedBlob())).resolves.toBeUndefined();
    await expect(adapter.signIn()).rejects.toThrow(/not configured/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/sync/adapter.test.ts`
Expected: FAIL — `Failed to resolve import "./adapter"`.

- [ ] **Step 4: Write `src/sync/firebase.ts`**

Initialization is **lazy**, behind `getFirebase()`. Nothing runs at module scope
except reading env vars, so importing this file is always safe — including when
no config is present, where `initializeApp` with undefined values would throw.

```ts
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

// These values are public by design — they identify the project, they do not
// authorise anything. Access is controlled by firestore.rules.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let cached: FirebaseHandles | null = null;

/** Returns null when the app is unconfigured, so callers degrade to no-ops. */
export function getFirebase(): FirebaseHandles | null {
  if (!firebaseConfigured) return null;
  if (!cached) {
    const app = initializeApp(config);
    cached = {
      app,
      auth: getAuth(app),
      // Persistent cache queues writes while offline and flushes them on
      // reconnect, which is what makes "offline" a normal state, not an error.
      db: initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      }),
    };
  }
  return cached;
}
```

- [ ] **Step 5: Write `src/sync/adapter.ts`**

The real adapter imports `./firebase` **lazily**, inside the factory, so that importing this module from a test never initialises the SDK.

```ts
import { emptySyncedBlob, type SyncedBlob } from './types';

export interface SyncUser {
  uid: string;
  email: string | null;
  photoURL: string | null;
}

export interface SyncAdapter {
  loadRemote(uid: string): Promise<SyncedBlob | null>;
  saveRemote(uid: string, blob: SyncedBlob): Promise<void>;
  onAuthChange(cb: (user: SyncUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export interface MockAdapter extends SyncAdapter {
  emitUser(user: SyncUser | null): void;
  remote: SyncedBlob | null;
  saveCount: number;
  loadCount: number;
  failNext(error: Error): void;
}

export function createMockAdapter(initial: { remote?: SyncedBlob | null } = {}): MockAdapter {
  const listeners = new Set<(user: SyncUser | null) => void>();
  let pendingError: Error | null = null;

  function takeError(): Error | null {
    const e = pendingError;
    pendingError = null;
    return e;
  }

  const adapter: MockAdapter = {
    remote: initial.remote ?? null,
    saveCount: 0,
    loadCount: 0,
    failNext(error) { pendingError = error; },
    emitUser(user) { for (const cb of listeners) cb(user); },
    async loadRemote() {
      adapter.loadCount++;
      const e = takeError();
      if (e) throw e;
      return adapter.remote ? structuredClone(adapter.remote) : null;
    },
    async saveRemote(_uid, blob) {
      adapter.saveCount++;
      const e = takeError();
      if (e) throw e;
      adapter.remote = structuredClone(blob);
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    async signIn() {
      adapter.emitUser({ uid: 'mock-uid', email: 'mock@example.com', photoURL: null });
    },
    async signOut() {
      adapter.emitUser(null);
    },
  };

  return adapter;
}

/**
 * With no VITE_FIREBASE_* values present, every method is an inert no-op and
 * the app behaves exactly as it did before this feature. Missing config must
 * degrade, never crash — initialising the SDK with undefined values throws.
 */
/**
 * With no VITE_FIREBASE_* values present, `getFirebase()` returns null and every
 * method here becomes an inert no-op, so the app behaves exactly as it did
 * before this feature. Missing config must degrade, never crash.
 *
 * `./firebase` is imported dynamically so that merely constructing this adapter
 * — which AuthProvider does on mount — never pulls the SDK into the initial
 * bundle for a signed-out user.
 */
export function createFirebaseAdapter(): SyncAdapter {
  return {
    async loadRemote(uid) {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) return null;
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(fb.db, 'users', uid));
      if (!snap.exists()) return null;
      const data = snap.data();
      // Unknown wire versions are treated as absent rather than trusted: a
      // future format must not be reinterpreted by an older client.
      if (data.version !== 1) return null;
      return { ...emptySyncedBlob(), ...data } as SyncedBlob;
    },

    async saveRemote(uid, blob) {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) return;
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      await setDoc(doc(fb.db, 'users', uid), { ...blob, syncedAt: serverTimestamp() });
    },

    onAuthChange(cb) {
      let unsubscribe: (() => void) | null = null;
      let cancelled = false;
      void (async () => {
        const { getFirebase } = await import('./firebase');
        const fb = getFirebase();
        if (!fb || cancelled) return;
        const { onAuthStateChanged } = await import('firebase/auth');
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(fb.auth, (user) => {
          cb(user ? { uid: user.uid, email: user.email, photoURL: user.photoURL } : null);
        });
      })();
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },

    async signIn() {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) throw new Error('Cloud sync is not configured on this build.');
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      await signInWithPopup(fb.auth, new GoogleAuthProvider());
    },

    async signOut() {
      const { getFirebase } = await import('./firebase');
      const fb = getFirebase();
      if (!fb) return;
      const { signOut } = await import('firebase/auth');
      await signOut(fb.auth);
    },
  };
}
```

- [ ] **Step 6: Write `firestore.rules`**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // A signed-in user may read and write exactly their own document.
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

- [ ] **Step 7: Add the env vars to `.env.example`**

Append:

```
# Firebase (public by design — these identify the project, they do not
# authorise anything; access is controlled by firestore.rules).
# Get these from Firebase console → Project settings → Your apps → Web app.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
```

- [ ] **Step 8: Split Firebase into its own bundle chunk**

In `vite.config.ts`, add a `build` section alongside the existing `plugins`, `resolve` and `test` keys:

```ts
  build: {
    rollupOptions: {
      output: {
        // firebase is large; keeping it out of the entry chunk means the word
        // list still renders fast for signed-out users.
        manualChunks: { firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'] },
      },
    },
  },
```

- [ ] **Step 9: Run tests, type check and build**

Run: `npx vitest run src/sync/adapter.test.ts` — expect PASS, 10 tests.
Run: `npm test && npx tsc -b --noEmit` — expect all green.
Run: `npm run build` — expect success, and a separate `firebase` chunk listed in the output.

- [ ] **Step 10: Commit**

```bash
git add src/sync/adapter.ts src/sync/firebase.ts src/sync/adapter.test.ts firestore.rules .env.example vite.config.ts package.json package-lock.json
git commit -m "feat(sync): add the firebase adapter and its mock

Every SDK call sits behind SyncAdapter, imported lazily so the test suite
never initialises Firebase. Firebase gets its own bundle chunk."
```

---

### Task 5: Sync orchestration

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/sync/useSyncState.ts`
- Test: `src/contexts/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `mergeBlobs` (Task 2); `loadSyncMeta`, `saveSyncMeta`, `SyncedBlob`, `SyncMeta`, `SyncStatus`, `emptySyncedBlob` (Task 1); `SyncAdapter`, `SyncUser`, `createMockAdapter` (Task 4); `getBlob`, `replaceBlob` on `FlashcardApi` and `subscribePlaySettings` (Task 3).
- Produces: `AuthProvider` (props `{ adapter?: SyncAdapter; children: ReactNode }`, defaulting to the Firebase adapter) and `useSyncState(): SyncApi` where:

```ts
interface SyncApi {
  user: SyncUser | null;
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}
```

  Task 6 renders against this.

The injectable `adapter` prop is what lets every test run without Firebase.

- [ ] **Step 1: Write the failing test**

Create `src/contexts/AuthContext.test.tsx`:

```tsx
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { FlashcardProvider } from './FlashcardContext';
import { useFlashcardState } from '../flashcards/useFlashcardState';
import { AuthProvider } from './AuthContext';
import { useSyncState } from '../sync/useSyncState';
import { createMockAdapter, type MockAdapter } from '../sync/adapter';
import { emptySyncedBlob } from '../sync/types';
import { SYNC_META_KEY } from '../sync/syncMeta';
import type { CardState } from '../flashcards/types';

const USER = { uid: 'uid-1', email: 'a@example.com', photoURL: null };
const OTHER = { uid: 'uid-2', email: 'b@example.com', photoURL: null };

function card(overrides: Partial<CardState> = {}): CardState {
  return {
    wordId: 1, direction: 'fr-en',
    stability: 10, difficulty: 5,
    elapsedDays: 0, scheduledDays: 10, reps: 2, lapses: 0,
    state: 'review',
    lastReview: '2026-07-01T00:00:00.000Z',
    due: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

let adapter: MockAdapter;

beforeEach(() => {
  localStorage.clear();
  adapter = createMockAdapter();
});

afterEach(() => localStorage.clear());

function wrapper({ children }: { children: ReactNode }) {
  return (
    <FlashcardProvider>
      <AuthProvider adapter={adapter}>{children}</AuthProvider>
    </FlashcardProvider>
  );
}

function renderBoth() {
  return renderHook(() => ({ sync: useSyncState(), cards: useFlashcardState() }), { wrapper });
}

describe('AuthProvider', () => {
  it('starts signed out', () => {
    const { result } = renderBoth();
    expect(result.current.sync.user).toBeNull();
    expect(result.current.sync.status).toBe('signed-out');
  });

  it('pulls, merges and pushes on sign-in', async () => {
    adapter.remote = { ...emptySyncedBlob(), cards: { '2:fr-en': card({ wordId: 2 }) } };
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });

    await act(async () => { adapter.emitUser(USER); });

    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    expect(result.current.cards.cards['1:fr-en']).toBeDefined();
    expect(result.current.cards.cards['2:fr-en']).toBeDefined();
    expect(adapter.saveCount).toBeGreaterThanOrEqual(1);
    expect(Object.keys(adapter.remote!.cards).sort()).toEqual(['1:fr-en', '2:fr-en']);
  });

  it('records the signed-in uid so a later sign-in merges', async () => {
    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    expect(localStorage.getItem(SYNC_META_KEY)).toContain('uid-1');
  });

  it('replaces rather than merges when a different account signs in', async () => {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify({
      version: 1, lastUid: 'uid-1', epoch: 0,
      settingsUpdatedAt: 0, playUpdatedAt: 0, lastSyncedAt: 1,
    }));
    adapter.remote = { ...emptySyncedBlob(), cards: { '9:fr-en': card({ wordId: 9 }) } };

    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });

    await act(async () => { adapter.emitUser(OTHER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    expect(result.current.cards.cards['1:fr-en']).toBeUndefined();
    expect(result.current.cards.cards['9:fr-en']).toBeDefined();
  });

  it('sets an error status when the pull fails, leaving local data intact', async () => {
    adapter.failNext(new Error('network down'));
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });

    await act(async () => { adapter.emitUser(USER); });

    await waitFor(() => expect(result.current.sync.status).toBe('error'));
    expect(result.current.sync.error).toContain('network down');
    expect(result.current.cards.cards['1:fr-en']).toBeDefined();
  });

  it('clears user and status on sign-out but keeps local data', async () => {
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    await act(async () => { adapter.emitUser(null); });

    expect(result.current.sync.user).toBeNull();
    expect(result.current.sync.status).toBe('signed-out');
    expect(result.current.cards.cards['1:fr-en']).toBeDefined();
  });

  it('syncNow pushes local changes to the remote', async () => {
    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    act(() => { result.current.cards.grade(5, 'fr-en', 3); });
    await act(async () => { await result.current.sync.syncNow(); });

    expect(adapter.remote!.cards['5:fr-en']).toBeDefined();
  });

  it('does not touch the adapter while signed out', async () => {
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { await result.current.sync.syncNow(); });
    expect(adapter.loadCount).toBe(0);
    expect(adapter.saveCount).toBe(0);
  });

  it('bumps the epoch on reset so the cleared state wins the next merge', async () => {
    const { result } = renderBoth();
    act(() => { result.current.cards.grade(1, 'fr-en', 3); });
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    const before = JSON.parse(localStorage.getItem(SYNC_META_KEY)!).epoch;

    await act(async () => { result.current.cards.resetAll(); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));

    const after = JSON.parse(localStorage.getItem(SYNC_META_KEY)!).epoch;
    expect(after).toBe(before + 1);
    // The push must carry the cleared cards, not restore them.
    expect(adapter.remote!.cards).toEqual({});
    expect(adapter.remote!.epoch).toBe(after);
  });

  it('stamps settingsUpdatedAt when settings change while signed in', async () => {
    const { result } = renderBoth();
    await act(async () => { adapter.emitUser(USER); });
    await waitFor(() => expect(result.current.sync.status).toBe('synced'));
    expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).settingsUpdatedAt).toBe(0);

    await act(async () => { result.current.cards.updateSettings({ typedCheck: true }); });

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(SYNC_META_KEY)!).settingsUpdatedAt).toBeGreaterThan(0);
    });
  });

  it('renders children', () => {
    const { getByText } = render(
      <FlashcardProvider>
        <AuthProvider adapter={adapter}><p>ok</p></AuthProvider>
      </FlashcardProvider>,
    );
    expect(getByText('ok')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL — `Failed to resolve import "./AuthContext"`.

- [ ] **Step 3: Write `src/sync/useSyncState.ts`**

```ts
import { useContext } from 'react';
import { SyncContext, type SyncApi } from '../contexts/AuthContext';

export function useSyncState(): SyncApi {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncState must be used within an AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Write `src/contexts/AuthContext.tsx`**

```tsx
import {
  createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useFlashcardState } from '../flashcards/useFlashcardState';
import { subscribeReset } from './FlashcardContext';
import { loadPlaySettings, savePlaySettings, subscribePlaySettings } from '../play/playStorage';
import { createFirebaseAdapter, type SyncAdapter, type SyncUser } from '../sync/adapter';
import { mergeBlobs } from '../sync/merge';
import { loadSyncMeta, saveSyncMeta } from '../sync/syncMeta';
import { SYNC_VERSION, emptySyncedBlob, type SyncStatus, type SyncedBlob } from '../sync/types';
import type { StoredBlob } from '../flashcards/types';

export interface SyncApi {
  user: SyncUser | null;
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export const SyncContext = createContext<SyncApi | null>(null);

const PUSH_DEBOUNCE_MS = 250;

interface Props {
  children: ReactNode;
  /** Injected by tests so the suite never initialises Firebase. */
  adapter?: SyncAdapter;
}

export function AuthProvider({ children, adapter: injected }: Props) {
  const api = useFlashcardState();
  const adapter = useMemo(() => injected ?? createFirebaseAdapter(), [injected]);

  const [user, setUser] = useState<SyncUser | null>(null);
  const [status, setStatus] = useState<SyncStatus>('signed-out');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => loadSyncMeta().lastSyncedAt);
  const [error, setError] = useState<string | null>(null);

  // Read through refs inside the sync routine so it never goes stale and never
  // needs to be a dependency of the effects that schedule it.
  const apiRef = useRef(api);
  apiRef.current = api;
  const userRef = useRef<SyncUser | null>(null);
  userRef.current = user;

  // Serialises every sync so a debounced push can never overtake an in-flight
  // pull-merge and write a blob assembled from pre-merge state.
  const chain = useRef<Promise<void>>(Promise.resolve());

  const assembleLocal = useCallback((): SyncedBlob => {
    const meta = loadSyncMeta();
    const blob = apiRef.current.getBlob();
    return {
      version: SYNC_VERSION,
      epoch: meta.epoch,
      cards: blob.cards,
      settings: blob.settings,
      settingsUpdatedAt: meta.settingsUpdatedAt,
      play: loadPlaySettings(),
      playUpdatedAt: meta.playUpdatedAt,
    };
  }, []);

  const applyLocal = useCallback((next: SyncedBlob) => {
    const current = apiRef.current.getBlob();
    const merged: StoredBlob = {
      ...current,
      cards: next.cards,
      settings: next.settings,
    };
    apiRef.current.replaceBlob(merged);
    savePlaySettings(next.play);
  }, []);

  const runSync = useCallback((uid: string, mode: 'full' | 'push') => {
    const task = async () => {
      setStatus('syncing');
      setError(null);
      try {
        const meta = loadSyncMeta();
        const local = assembleLocal();

        let next: SyncedBlob;
        if (mode === 'push') {
          next = local;
        } else {
          const remote = await adapter.loadRemote(uid);
          // A different account on this browser must never inherit the previous
          // user's cards, so adopt the remote wholesale instead of merging.
          const switchingAccounts = meta.lastUid !== null && meta.lastUid !== uid;
          next = switchingAccounts
            ? (remote ?? emptySyncedBlob())
            : mergeBlobs(local, remote).blob;
        }

        applyLocal(next);
        await adapter.saveRemote(uid, next);

        const now = Date.now();
        saveSyncMeta({
          version: 1,
          lastUid: uid,
          epoch: next.epoch,
          settingsUpdatedAt: next.settingsUpdatedAt,
          playUpdatedAt: next.playUpdatedAt,
          lastSyncedAt: now,
        });
        setLastSyncedAt(now);
        setStatus('synced');
      } catch (e) {
        // Never fatal: local storage keeps working exactly as it does signed out.
        setError(e instanceof Error ? e.message : String(e));
        setStatus(navigator.onLine === false ? 'offline' : 'error');
      }
    };

    chain.current = chain.current.then(task, task);
    return chain.current;
  }, [adapter, assembleLocal, applyLocal]);

  useEffect(() => {
    return adapter.onAuthChange((next) => {
      setUser(next);
      if (next) {
        void runSync(next.uid, 'full');
      } else {
        setStatus('signed-out');
        setError(null);
      }
    });
  }, [adapter, runSync]);

  // Push after changes settle. Skipped entirely while signed out.
  const blob = api.getBlob();
  useEffect(() => {
    if (!userRef.current) return;
    const uid = userRef.current.uid;
    const timer = setTimeout(() => { void runSync(uid, 'push'); }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [blob, runSync]);

  useEffect(() => {
    return subscribePlaySettings(() => {
      if (!userRef.current) return;
      saveSyncMeta({ ...loadSyncMeta(), playUpdatedAt: Date.now() });
    });
  }, []);

  // Stamp settings changes so the merge can tell local settings are newer.
  // Without this the timestamp stays 0 forever and remote settings always win.
  // Skips the first run, which is mount rather than an edit.
  const settingsSeen = useRef(false);
  useEffect(() => {
    if (!settingsSeen.current) { settingsSeen.current = true; return; }
    if (!userRef.current) return;
    saveSyncMeta({ ...loadSyncMeta(), settingsUpdatedAt: Date.now() });
  }, [api.settings]);

  // A reset must win over every other device's copy, or the merge — which
  // never deletes — restores the cards it just cleared. Bumping the epoch is
  // what makes the clear authoritative, and the push propagates it.
  useEffect(() => {
    return subscribeReset(() => {
      const meta = loadSyncMeta();
      saveSyncMeta({ ...meta, epoch: meta.epoch + 1 });
      const current = userRef.current;
      if (current) void runSync(current.uid, 'push');
    });
  }, [runSync]);

  // Returning to the tab is the cheapest signal that another device may have
  // written while this one was in the background.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      if (!userRef.current) return;
      void runSync(userRef.current.uid, 'full');
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [runSync]);

  const signIn = useCallback(async () => {
    try {
      await adapter.signIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [adapter]);

  const signOut = useCallback(async () => {
    try {
      await adapter.signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [adapter]);

  const syncNow = useCallback(async () => {
    const current = userRef.current;
    if (!current) return;
    await runSync(current.uid, 'full');
  }, [runSync]);

  const value = useMemo<SyncApi>(
    () => ({ user, status, lastSyncedAt, error, signIn, signOut, syncNow }),
    [user, status, lastSyncedAt, error, signIn, signOut, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/contexts/AuthContext.test.tsx`
Expected: PASS, 11 tests, with no React `act()` warnings in the output.

- [ ] **Step 6: Run the full suite, type check and lint**

Run: `npm test && npx tsc -b --noEmit`
Run: `npm run lint` — expect exactly 21 problems, none in `src/sync/` or `src/contexts/AuthContext.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/contexts/AuthContext.tsx src/contexts/AuthContext.test.tsx src/sync/useSyncState.ts
git commit -m "feat(sync): orchestrate pull-merge-push around auth state

Syncs on sign-in, after changes settle, and on tab focus, serialised so a
push can never overtake an in-flight merge."
```

---

### Task 6: Account UI

**Files:**
- Create: `src/sync/components/SyncStatusDot.tsx`
- Create: `src/sync/components/AccountSection.tsx`
- Modify: `src/components/TopBar.tsx`
- Modify: `src/flashcards/components/SettingsPanel.tsx`
- Modify: `src/App.tsx`
- Test: `src/sync/components/AccountSection.test.tsx`

**Interfaces:**
- Consumes: `useSyncState` and `SyncApi` (Task 5).
- Produces: `SyncStatusDot` (props `{ onClick: () => void }`) and `AccountSection` (no props). `TopBar` gains a required prop `onOpenAccount: () => void`, which `App.tsx` must pass.

- [ ] **Step 1: Write the failing test**

Create `src/sync/components/AccountSection.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { createMockAdapter, type MockAdapter } from '../adapter';
import { AccountSection } from './AccountSection';

function wrap(adapter: MockAdapter, children: ReactNode) {
  return render(
    <FlashcardProvider>
      <AuthProvider adapter={adapter}>{children}</AuthProvider>
    </FlashcardProvider>,
  );
}

describe('AccountSection', () => {
  it('offers Google sign-in when signed out', () => {
    wrap(createMockAdapter(), <AccountSection />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
  });

  it('explains that data stays on this device when signed out', () => {
    wrap(createMockAdapter(), <AccountSection />);
    expect(screen.getByText(/only on this device/i)).toBeInTheDocument();
  });

  it('shows the account email and sign-out once signed in', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, <AccountSection />);
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(await screen.findByText('mock@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
  });

  it('surfaces a sync error without hiding the account', async () => {
    const adapter = createMockAdapter();
    adapter.failNext(new Error('permission denied'));
    wrap(adapter, <AccountSection />);
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls signIn when the button is pressed', async () => {
    const adapter = createMockAdapter();
    const spy = vi.spyOn(adapter, 'signIn');
    wrap(adapter, <AccountSection />);
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sync/components/AccountSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./AccountSection"`.

- [ ] **Step 3: Write `src/sync/components/AccountSection.tsx`**

```tsx
import { useSyncState } from '../useSyncState';

function relativeTime(ts: number | null): string {
  if (!ts) return 'never';
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function AccountSection() {
  const { user, status, lastSyncedAt, error, signIn, signOut, syncNow } = useSyncState();

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Account</h3>

      {!user && (
        <>
          <button
            type="button"
            onClick={() => { void signIn(); }}
            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-muted"
          >
            Sign in with Google
          </button>
          <p className="text-[11px] text-text-subtle mt-2">
            Your progress is stored only on this device. Sign in to back it up and study on more than one.
          </p>
        </>
      )}

      {user && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm truncate">{user.email ?? user.uid}</div>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="shrink-0 text-xs px-3 py-1.5 rounded-pill text-text-muted hover:bg-surface-muted"
            >
              Sign out
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => { void syncNow(); }}
              disabled={status === 'syncing'}
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-muted disabled:opacity-50"
            >
              {status === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>
            <span className="text-[11px] text-text-subtle">Last synced {relativeTime(lastSyncedAt)}</span>
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 4: Write `src/sync/components/SyncStatusDot.tsx`**

```tsx
import { cn } from '@/lib/utils';
import { useSyncState } from '../useSyncState';
import type { SyncStatus } from '../types';

const LABEL: Record<SyncStatus, string> = {
  'signed-out': 'Not signed in',
  syncing: 'Syncing',
  synced: 'Synced',
  offline: 'Offline — changes will sync later',
  error: 'Sync error',
};

export function SyncStatusDot({ onClick }: { onClick: () => void }) {
  const { user, status } = useSyncState();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={LABEL[status]}
      title={LABEL[status]}
      className="p-1.5 rounded-pill text-text-subtle hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
    >
      {user?.photoURL && status !== 'error' ? (
        <img src={user.photoURL} alt="" className="size-4 rounded-full" />
      ) : (
        <span
          className={cn(
            'block size-2.5 rounded-full',
            status === 'signed-out' && 'border border-text-subtle',
            status === 'syncing' && 'bg-emphasis animate-pulse',
            status === 'synced' && 'bg-emerald-500',
            status === 'offline' && 'bg-text-subtle',
            status === 'error' && 'bg-red-600',
          )}
        />
      )}
    </button>
  );
}
```

- [ ] **Step 5: Add the section to `SettingsPanel`**

In `src/flashcards/components/SettingsPanel.tsx`, add the import:

```tsx
import { AccountSection } from '../../sync/components/AccountSection';
```

and render `<AccountSection />` as the **first** child of the outer `<div className="flex flex-col gap-6 p-4">`, above the existing "Type to check answer" section. Cloud sync belongs next to Export/Import, and putting Account first makes it the thing you see when the status dot brings you here.

- [ ] **Step 6: Add the dot to `TopBar` and wire `App.tsx`**

In `src/components/TopBar.tsx`, add to the `Props` interface:

```ts
  onOpenAccount: () => void;
```

Add `onOpenAccount` to the destructured parameter list, add the import:

```tsx
import { SyncStatusDot } from '../sync/components/SyncStatusDot';
```

and render `<SyncStatusDot onClick={onOpenAccount} />` immediately before `<DueBadge ... />` in the control row.

In `src/App.tsx`, add a state flag and pass the handler. Replace the `studyOpen` state declaration with:

```tsx
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyTab, setStudyTab] = useState<'study' | 'settings'>('study');
```

Pass to `TopBar`:

```tsx
        onOpenStudy={() => { setStudyTab('study'); setStudyOpen(true); }}
        onOpenAccount={() => { setStudyTab('settings'); setStudyOpen(true); }}
```

and to `StudyModal`:

```tsx
        initialTab={studyTab}
```

In `src/flashcards/components/StudyModal.tsx`, add `initialTab?: 'study' | 'settings'` to its `Props`, accept it in the parameter list, and seed the existing tab state from it:

```tsx
  const [tab, setTab] = useState<Tab>(initialTab ?? 'study');
```

Then re-seed when the modal opens, alongside the existing open-effect logic:

```tsx
  useEffect(() => {
    if (open) setTab(initialTab ?? 'study');
  }, [open, initialTab]);
```

- [ ] **Step 7: Run tests, type check and lint**

Run: `npx vitest run src/sync/components/AccountSection.test.tsx` — expect PASS, 5 tests.
Run: `npm test && npx tsc -b --noEmit` — expect all green.
Run: `npm run lint` — expect exactly 21 problems, none in `src/sync/`.

- [ ] **Step 8: Commit**

```bash
git add src/sync/components src/components/TopBar.tsx src/flashcards/components/SettingsPanel.tsx src/flashcards/components/StudyModal.tsx src/App.tsx src/sync/components/AccountSection.test.tsx
git commit -m "feat(sync): add account controls and a sync status indicator

Account lives beside Export/Import in Settings; a status dot in the top
bar opens straight to it."
```

---

### Task 7: Wire the provider and verify end to end

**Files:**
- Modify: `src/main.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `AuthProvider` (Task 5).
- Produces: nothing downstream — this is the final task.

- [ ] **Step 1: Add the provider to `src/main.tsx`**

`AuthProvider` must sit **inside** `FlashcardProvider`, because it calls `useFlashcardState()`.

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { FlashcardProvider } from './contexts/FlashcardContext';
import { AuthProvider } from './contexts/AuthContext';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PreferencesProvider>
      <FlashcardProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </FlashcardProvider>
    </PreferencesProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Document the setup in `README.md`**

Add a section:

```markdown
## Cloud sync (optional)

Sync is off unless Firebase is configured. Without it the app runs entirely on
`localStorage`, exactly as before.

1. Create a Firebase project, add a **Web** app, and enable **Google** under
   Authentication → Sign-in method.
2. Create a **Firestore** database.
3. Copy the web config values into `.env`:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

4. Deploy the security rules — **the database is not secured until you do**:

   ```
   firebase deploy --only firestore:rules
   ```

`localhost` is an authorized domain by default, so sign-in works in development
with no further setup. Syncing between devices additionally requires deploying
the app and adding its domain under Authentication → Settings → Authorized
domains.
```

- [ ] **Step 3: Run the full gate**

Run: `npm test && npx tsc -b --noEmit && npm run build`
Expected: all tests pass, no type errors, build succeeds with a separate `firebase` chunk.
Run: `npm run lint` — expect exactly 21 problems.

- [ ] **Step 4: Verify signed-out behavior with no Firebase config**

With no `VITE_FIREBASE_*` values in `.env`, run `npm run dev` and confirm:

1. The word list loads and Play and Study both work exactly as before.
2. The top bar shows an outline status dot.
3. Tapping it opens Study → Settings with the Account section on top, offering "Sign in with Google" and explaining that data is device-only.
4. No console errors.

This is the important negative case: a missing config must degrade to the current behavior, never break the app.

- [ ] **Step 5: Verify the signed-in round trip**

With real `VITE_FIREBASE_*` values configured and rules deployed:

1. Sign in with Google. The dot turns into your avatar and Settings shows your email and a "Last synced just now".
2. Study a few cards. Within a second the Firestore console shows `users/{uid}` with a `cards` map.
3. Open a private window, sign in as the **same** account, and confirm the cards arrive.
4. Grade a card in the private window, return to the first tab, and switch away and back — the focus pull should bring the change across.
5. Sign out in the private window and sign in as a **different** Google account. Confirm it does **not** inherit the first account's cards.
6. Turn off the network, grade a card, turn it back on, and confirm the write flushes.

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx README.md
git commit -m "feat(sync): mount the auth provider and document setup"
```

---

## Verification

```bash
npm test && npx tsc -b --noEmit && npm run build
npm run lint   # must be exactly 21 problems
```

All must pass, plus the manual checks in Task 7 Steps 4 and 5.
