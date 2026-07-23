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
