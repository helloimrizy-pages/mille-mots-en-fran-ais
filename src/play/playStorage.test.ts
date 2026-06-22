import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PLAY_SETTINGS } from './types';
import { PLAY_STORAGE_KEY, loadPlaySettings, savePlaySettings } from './playStorage';

afterEach(() => localStorage.clear());

describe('playStorage', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadPlaySettings()).toEqual(DEFAULT_PLAY_SETTINGS);
  });

  it('round-trips valid settings', () => {
    savePlaySettings({ activities: ['choice', 'type'], repsPerWord: 3 });
    expect(loadPlaySettings()).toEqual({ activities: ['choice', 'type'], repsPerWord: 3 });
  });

  it('drops unknown activities and clamps reps', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: ['choice', 'bogus'], repsPerWord: 9 }));
    expect(loadPlaySettings()).toEqual({ activities: ['choice'], repsPerWord: 2 });
  });

  it('falls back to default activities when none valid', () => {
    localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({ activities: [], repsPerWord: 2 }));
    expect(loadPlaySettings().activities).toEqual(DEFAULT_PLAY_SETTINGS.activities);
  });
});
