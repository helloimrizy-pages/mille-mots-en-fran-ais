import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashcardProvider, subscribeReset } from './FlashcardContext';
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
    act(() => { result.current.updateSettings({ requestRetention: 0.85, typedCheck: true }); });
    expect(result.current.settings.requestRetention).toBe(0.85);
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

  it('getBlob returns the current blob', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const blob = result.current.getBlob();
    expect(blob.version).toBe(2);
    expect(blob.cards['1:fr-en']).toBeDefined();
    expect(blob.log.length).toBe(1);
  });

  it('replaceBlob swaps the whole blob', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const replacement = { ...result.current.getBlob(), cards: {}, log: [] };
    act(() => { result.current.replaceBlob(replacement); });
    expect(result.current.cards).toEqual({});
    expect(result.current.log).toEqual([]);
  });

  it('importJson still works after being rerouted through replaceBlob', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    const json = result.current.exportJson();
    act(() => { result.current.resetAll(); });
    expect(result.current.cards).toEqual({});
    let ok = false;
    act(() => { ok = result.current.importJson(json); });
    expect(ok).toBe(true);
    expect(result.current.cards['1:fr-en']).toBeDefined();
  });

  it('importJson rejects malformed input without touching state', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    act(() => { result.current.grade(1, 'fr-en', 3); });
    let ok = true;
    act(() => { ok = result.current.importJson('{not json'); });
    expect(ok).toBe(false);
    expect(result.current.cards['1:fr-en']).toBeDefined();
  });

  it('resetAll notifies reset subscribers until unsubscribed', () => {
    const { result } = renderHook(() => useFlashcardState(), { wrapper });
    let count = 0;
    const unsubscribe = subscribeReset(() => { count++; });
    act(() => { result.current.resetAll(); });
    expect(count).toBe(1);
    unsubscribe();
    act(() => { result.current.resetAll(); });
    expect(count).toBe(1);
  });
});
