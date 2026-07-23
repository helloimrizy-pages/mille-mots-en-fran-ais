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
  if (!remote) {
    return {
      blob: { ...local, cards: { ...local.cards }, settings: { ...local.settings }, play: { ...local.play } },
      resetApplied: false,
    };
  }

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
