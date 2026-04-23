import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { gradeCard } from '../flashcards/fsrs';
import { importJson as storageImport, exportJson as storageExport, load, save } from '../flashcards/storage';
import {
  MAX_LOG_ENTRIES,
  cardKey,
  localDateString,
  makeEmptyCard,
  type CardState,
  type DailyCounter,
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
  daily: DailyCounter;
  dueCount: (now?: Date) => number;
  getCard: (wordId: number, direction: Direction) => CardState;
  grade: (wordId: number, direction: Direction, grade: Grade, now?: Date) => void;
  updateSettings: (patch: Partial<StudySettings>) => void;
  resetAll: () => void;
  exportJson: () => string;
  importJson: (str: string) => boolean;
}

export const FlashcardContext = createContext<FlashcardApi | null>(null);

function rolloverDaily(daily: DailyCounter, now: Date): DailyCounter {
  const today = localDateString(now);
  if (daily.date === today) return daily;
  return { date: today, newIntroduced: 0 };
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
        const existing = prev.cards[key];
        const wasNew = !existing || existing.state === 'new';
        const before = existing ?? makeEmptyCard(wordId, direction, now);
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
        const nextLog = [...prev.log, logEntry].slice(-MAX_LOG_ENTRIES);
        const rolled = rolloverDaily(prev.daily, now);
        const daily: DailyCounter = wasNew
          ? { ...rolled, newIntroduced: rolled.newIntroduced + 1 }
          : rolled;
        return {
          ...prev,
          cards: { ...prev.cards, [key]: next },
          log: nextLog,
          daily,
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
      version: 1,
      cards: {},
      log: [],
      settings: prev.settings,
      daily: { date: localDateString(), newIntroduced: 0 },
    }));
  }, []);

  const exportJson = useCallback(() => storageExport(blob), [blob]);

  const importJson = useCallback((str: string): boolean => {
    const imported = storageImport(str);
    if (!imported) return false;
    setBlob(imported);
    return true;
  }, []);

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
    daily: blob.daily,
    dueCount,
    getCard,
    grade,
    updateSettings,
    resetAll,
    exportJson,
    importJson,
  }), [blob, dueCount, getCard, grade, updateSettings, resetAll, exportJson, importJson]);

  return <FlashcardContext.Provider value={api}>{children}</FlashcardContext.Provider>;
}
