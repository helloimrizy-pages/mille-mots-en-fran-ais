import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PLAY_SETTINGS, type PlaySettings } from './types';
import { PLAY_STORAGE_KEY, loadPlaySettings, savePlaySettings, subscribePlaySettings } from './playStorage';

afterEach(() => localStorage.clear());

describe('playStorage', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadPlaySettings()).toEqual(DEFAULT_PLAY_SETTINGS);
  });

  it('round-trips valid settings', () => {
    const settings: PlaySettings = {
      activities: ['choice', 'type'],
      repsPerWord: 3,
      wordCount: 50,
      source: 'new',
      buckets: ['shaky'],
    };
    savePlaySettings(settings);
    expect(loadPlaySettings()).toEqual(settings);
  });

  it('drops unknown activities and clamps reps', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: ['choice', 'bogus'], repsPerWord: 9 }));
    const loaded = loadPlaySettings();
    expect(loaded.activities).toEqual(['choice']);
    expect(loaded.repsPerWord).toBe(2);
  });

  it('falls back to default activities when none valid', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: [], repsPerWord: 2 }));
    expect(loadPlaySettings().activities).toEqual(DEFAULT_PLAY_SETTINGS.activities);
  });

  it('fills in defaults for settings saved under the old shape', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: ['choice'], repsPerWord: 3 }));
    const loaded = loadPlaySettings();
    expect(loaded.wordCount).toBe(DEFAULT_PLAY_SETTINGS.wordCount);
    expect(loaded.source).toBe(DEFAULT_PLAY_SETTINGS.source);
    expect(loaded.buckets).toEqual([]);
  });

  it('rejects an invalid word count', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ wordCount: 999 }));
    expect(loadPlaySettings().wordCount).toBe(DEFAULT_PLAY_SETTINGS.wordCount);
  });

  it('rejects an invalid source', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ source: 'bogus' }));
    expect(loadPlaySettings().source).toBe(DEFAULT_PLAY_SETTINGS.source);
  });

  it('drops unknown buckets and the new bucket', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ buckets: ['shaky', 'bogus', 'new'] }));
    expect(loadPlaySettings().buckets).toEqual(['shaky']);
  });

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
});
