import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { gradeCard } from '../flashcards/fsrs';
import { importJson as storageImport, exportJson as storageExport, load, save } from '../flashcards/storage';
import {
  MAX_LOG_ENTRIES,
  cardKey,
  makeEmptyCard,
  type CardState,
  type Direction,
  type Grade,
  type ReviewLogEntry,
  type StoredBlob,
  type StudySettings,
} from '../flashcards/types';

export interface FlashcardApi {
  cards: Record<string, CardState>;
  log: ReviewLogEntry[];
  settings: StudySettings;
  getBlob: () => StoredBlob;
  replaceBlob: (blob: StoredBlob) => void;
  dueCount: (now?: Date) => number;
  getCard: (wordId: number, direction: Direction) => CardState;
  grade: (wordId: number, direction: Direction, grade: Grade, now?: Date) => void;
  updateSettings: (patch: Partial<StudySettings>) => void;
  resetAll: () => void;
  exportJson: () => string;
  importJson: (str: string) => boolean;
}

export const FlashcardContext = createContext<FlashcardApi | null>(null);

const resetListeners = new Set<() => void>();

/**
 * Lets the sync layer learn that this device authoritatively cleared its cards.
 * Without it, a reset would be silently undone by the next sync, because the
 * merge never deletes.
 */
// eslint-disable-next-line react-refresh/only-export-components -- module-level subscription, not a component
export function subscribeReset(cb: () => void): () => void {
  resetListeners.add(cb);
  return () => { resetListeners.delete(cb); };
}

export function FlashcardProvider({ children }: { children: ReactNode }) {
  const [blob, setBlob] = useState<StoredBlob>(() => load());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { save(blob); }, 250);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [blob]);

  useEffect(() => {
    return () => { save(blob); };
  }, [blob]);

  const getCard = useCallback(
    (wordId: number, direction: Direction): CardState => {
      return blob.cards[cardKey(wordId, direction)] ?? makeEmptyCard(wordId, direction);
    },
    [blob.cards],
  );

  const grade = useCallback(
    (wordId: number, direction: Direction, g: Grade, now: Date = new Date()) => {
      setBlob((prev) => {
        const key = cardKey(wordId, direction);
        const before = prev.cards[key] ?? makeEmptyCard(wordId, direction, now);
        const { card: next } = gradeCard(before, g, now, { requestRetention: prev.settings.requestRetention });
        const logEntry: ReviewLogEntry = {
          wordId,
          direction,
          grade: g,
          reviewedAt: now.toISOString(),
          elapsedDays: next.elapsedDays,
          scheduledDays: next.scheduledDays,
          state: next.state,
        };
        return {
          ...prev,
          cards: { ...prev.cards, [key]: next },
          log: [...prev.log, logEntry].slice(-MAX_LOG_ENTRIES),
        };
      });
    },
    [],
  );

  const updateSettings = useCallback((patch: Partial<StudySettings>) => {
    setBlob((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const resetAll = useCallback(() => {
    setBlob((prev) => ({
      version: 2,
      cards: {},
      log: [],
      settings: prev.settings,
    }));
    for (const cb of resetListeners) cb();
  }, []);

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

  const dueCount = useCallback(
    (now: Date = new Date()): number => {
      const cutoff = now.getTime();
      let count = 0;
      for (const c of Object.values(blob.cards)) {
        if (c.state !== 'new' && new Date(c.due).getTime() <= cutoff) count++;
      }
      return count;
    },
    [blob.cards],
  );

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

  return <FlashcardContext.Provider value={api}>{children}</FlashcardContext.Provider>;
}
