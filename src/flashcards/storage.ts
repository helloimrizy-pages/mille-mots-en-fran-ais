import {
  DEFAULT_SETTINGS,
  MAX_LOG_ENTRIES,
  type SessionGoal,
  type StoredBlob,
  type StudySettings,
} from './types';

// Deliberately keeps its "-v1" suffix even though CURRENT_VERSION is 2 — the
// key must stay stable across migrations, or existing users' data would be
// orphaned under a key nothing reads anymore.
export const STORAGE_KEY = 'mille-mots-srs-v1';
// Same "-v1" suffix, same reason: renaming it would orphan any backup written
// before this migration shipped.
export const BACKUP_KEY = 'mille-mots-srs-v1-backup';
export const CURRENT_VERSION = 2;

const LEGAL_GOALS: SessionGoal[] = [10, 20, 50, 'unlimited'];

// Builds the settings object key by key rather than spreading, so legacy fields
// such as newPerDay are dropped rather than carried forward.
function clampSettings(s: Partial<StudySettings>): StudySettings {
  const merged = { ...DEFAULT_SETTINGS, ...s };
  return {
    requestRetention: Math.max(0.80, Math.min(0.95, merged.requestRetention)),
    typedCheck: !!merged.typedCheck,
    lastGoal: LEGAL_GOALS.includes(merged.lastGoal) ? merged.lastGoal : DEFAULT_SETTINGS.lastGoal,
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

  const parsedObj = parsed as Record<string, unknown>;
  if (parsedObj.version === 1) {
    // localStorage is the only copy of a user's SRS history in this
    // backend-less app. The migration below is lossless, but back up the raw
    // v1 blob anyway before FlashcardContext's debounced save overwrites it
    // with the migrated v2 shape ~250ms after mount.
    try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* quota */ }
  }

  const migrated = migrate(parsedObj);
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
