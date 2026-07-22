import { REVIEW_STRENGTHS } from './strength';
import {
  ALL_ACTIVITIES,
  ALL_COUNTS,
  DEFAULT_PLAY_SETTINGS,
  type PlayCount,
  type PlaySettings,
  type PlaySource,
} from './types';

export const PLAY_STORAGE_KEY = 'mille-mots-play-v1';

const ALL_SOURCES: PlaySource[] = ['new', 'review', 'selected'];

function clamp(s: Partial<PlaySettings>): PlaySettings {
  const requested = Array.isArray(s.activities) ? s.activities : DEFAULT_PLAY_SETTINGS.activities;
  const activities = ALL_ACTIVITIES.filter((a) => requested.includes(a));
  const repsPerWord = s.repsPerWord === 3 ? 3 : 2;
  const wordCount = ALL_COUNTS.includes(s.wordCount as PlayCount)
    ? (s.wordCount as PlayCount)
    : DEFAULT_PLAY_SETTINGS.wordCount;
  const source = ALL_SOURCES.includes(s.source as PlaySource)
    ? (s.source as PlaySource)
    : DEFAULT_PLAY_SETTINGS.source;
  const requestedBuckets = Array.isArray(s.buckets) ? s.buckets : [];
  const buckets = REVIEW_STRENGTHS.filter((b) => requestedBuckets.includes(b));
  return {
    activities: activities.length > 0 ? activities : [...DEFAULT_PLAY_SETTINGS.activities],
    repsPerWord,
    wordCount,
    source,
    buckets,
  };
}

export function loadPlaySettings(): PlaySettings {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PLAY_STORAGE_KEY); } catch { return { ...DEFAULT_PLAY_SETTINGS }; }
  if (!raw) return { ...DEFAULT_PLAY_SETTINGS };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PLAY_SETTINGS };
    return clamp(parsed as Partial<PlaySettings>);
  } catch {
    return { ...DEFAULT_PLAY_SETTINGS };
  }
}

export function savePlaySettings(s: PlaySettings): void {
  try { localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify(s)); } catch { /* quota or disabled */ }
}
