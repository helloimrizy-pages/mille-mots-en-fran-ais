import {
  DEFAULT_SETTINGS,
  MAX_LOG_ENTRIES,
  localDateString,
  type StoredBlob,
  type StudySettings,
} from './types';

export const STORAGE_KEY = 'mille-mots-srs-v1';
export const BACKUP_KEY = 'mille-mots-srs-v1-backup';
export const CURRENT_VERSION = 1;

function clampSettings(s: Partial<StudySettings>): StudySettings {
  const merged = { ...DEFAULT_SETTINGS, ...s };
  return {
    ...merged,
    newPerDay: Math.max(0, Math.min(50, Math.floor(merged.newPerDay))),
    requestRetention: Math.max(0.80, Math.min(0.95, merged.requestRetention)),
    typedCheck: !!merged.typedCheck,
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
    daily: { date: localDateString(), newIntroduced: 0 },
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
  const obj = parsed as Partial<StoredBlob>;

  if (obj.version !== CURRENT_VERSION) {
    try { localStorage.setItem(BACKUP_KEY, raw); } catch { /* quota */ }
    return emptyBlob();
  }

  const blob: StoredBlob = {
    version: CURRENT_VERSION,
    cards: obj.cards && typeof obj.cards === 'object' ? obj.cards : {},
    log: Array.isArray(obj.log) ? obj.log.slice(-MAX_LOG_ENTRIES) : [],
    settings: clampSettings(obj.settings ?? {}),
    daily: obj.daily && typeof obj.daily === 'object'
      ? { date: String(obj.daily.date ?? localDateString()), newIntroduced: Number(obj.daily.newIntroduced) || 0 }
      : { date: localDateString(), newIntroduced: 0 },
  };

  return blob;
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
    if (parsed.version !== CURRENT_VERSION) return null;
    return {
      version: CURRENT_VERSION,
      cards: parsed.cards && typeof parsed.cards === 'object' ? parsed.cards : {},
      log: Array.isArray(parsed.log) ? parsed.log.slice(-MAX_LOG_ENTRIES) : [],
      settings: clampSettings(parsed.settings ?? {}),
      daily: parsed.daily && typeof parsed.daily === 'object'
        ? { date: String(parsed.daily.date ?? localDateString()), newIntroduced: Number(parsed.daily.newIntroduced) || 0 }
        : { date: localDateString(), newIntroduced: 0 },
    };
  } catch {
    return null;
  }
}
