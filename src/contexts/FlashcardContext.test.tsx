import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashcardProvider } from './FlashcardContext';
import { useFlashcardState } from '../flashcards/useFlashcardState';
import { MAX_LOG_ENTRIES } from '../flashcards/types';
import type { ReactNode } from 'react';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-23T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  return <FlashcardProvider>{children}</FlashcardProvider>;
}

describe('FlashcardProvider', () => {
  it('getCard returns an empty state for unknown cards', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    const card = result.current.getCard(1, 'fr-en');
    expect(card.state).toBe('new');
    expect(card.wordId).toBe(1);
    expect(card.direction).toBe('fr-en');
  });

  it('grade stores a card and appends to the log', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    expect(result.current.cards['1:fr-en']).toBeDefined();
    expect(result.current.cards['1:fr-en']!.state).not.toBe('new');
    expect(result.current.log.length).toBe(1);
    expect(result.current.log[0]!.wordId).toBe(1);
  });

  it('grading a new card increments daily.newIntroduced', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    const before = result.current.daily.newIntroduced;
    act(() => { result.current.grade(1, 'fr-en', 3); });
    expect(result.current.daily.newIntroduced).toBe(before + 1);
  });

  it('grading an already-reviewed card does not increment newIntroduced', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const after1 = result.current.daily.newIntroduced;
    act(() => { result.current.grade(1, 'fr-en', 3, new Date('2026-04-23T13:00:00Z')); });
    expect(result.current.daily.newIntroduced).toBe(after1);
  });

  it('daily counter resets when local date changes', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    expect(result.current.daily.newIntroduced).toBe(1);
    act(() => {
      result.current.grade(2, 'fr-en', 3, new Date('2026-04-24T12:00:00Z'));
    });
    expect(result.current.daily.newIntroduced).toBe(1);
    expect(result.current.daily.date).not.toBe('2026-04-23');
  });

  it('dueCount counts cards past their due date', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const wayLater = new Date('2027-01-01T00:00:00Z');
    expect(result.current.dueCount(wayLater)).toBeGreaterThan(0);
  });

  it('resetAll clears cards and log', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    act(() => { result.current.resetAll(); });
    expect(result.current.cards).toEqual({});
    expect(result.current.log).toEqual([]);
  });

  it('updateSettings merges patch', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.updateSettings({ newPerDay: 5, typedCheck: true }); });
    expect(result.current.settings.newPerDay).toBe(5);
    expect(result.current.settings.typedCheck).toBe(true);
  });

  it('log is capped at MAX_LOG_ENTRIES', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => {
      for (let i = 0; i < MAX_LOG_ENTRIES + 50; i++) {
        result.current.grade(i, 'fr-en', 3);
      }
    });
    expect(result.current.log.length).toBe(MAX_LOG_ENTRIES);
  });

  it('throws when useFlashcardState is used without provider', () => {
    expect(() => renderHook(() => useFlashcardState())).toThrow();
  });

  it('renders children', () => {
    const { getByText } = render(<FlashcardProvider><p>ok</p></FlashcardProvider>);
    expect(getByText('ok')).toBeInTheDocument();
  });
});
