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
