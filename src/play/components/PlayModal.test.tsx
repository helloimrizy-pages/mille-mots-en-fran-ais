import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import { STORAGE_KEY } from '../../flashcards/storage';
import { PLAY_STORAGE_KEY } from '../playStorage';
import type { Word } from '../../types';
import type { PlaySource } from '../types';
import { PlayModal } from './PlayModal';

// The modal persists play settings on start and the provider reads the SRS
// blob, so tests must not inherit either from a previous case.
beforeEach(() => localStorage.clear());

function makeWord(id: number): Word {
  return { id, rank: id, french: `mot${id}`, english: `meaning${id}`, pos: 'noun', ipa: '/x/', example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' } };
}

/** The provider debounce-saves on mount, so assert on the blob's contents
 *  rather than on the key's absence. */
function storedCardCount(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? Object.keys(JSON.parse(raw).cards ?? {}).length : 0;
}

function renderModal(words: Word[], selected: Word[] = [], forceSource?: PlaySource) {
  return render(
    <FlashcardProvider>
      <PlayModal
        words={words}
        selected={selected}
        open
        onClose={() => {}}
        {...(forceSource ? { forceSource } : {})}
      />
    </FlashcardProvider>,
  );
}

describe('PlayModal', () => {
  it('shows the setup screen with the selected word count', () => {
    const selection = [makeWord(1), makeWord(2)];
    renderModal(selection, selection, 'selected');
    expect(
      screen.getByText((_, el) => el?.textContent === 'Playing with 2 selected words.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeEnabled();
  });

  it('hides the source picker when the source is forced', () => {
    const selection = [makeWord(1)];
    renderModal(selection, selection, 'selected');
    expect(screen.queryByRole('button', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('starts a session when Start is clicked', async () => {
    const selection = Array.from({ length: 3 }, (_, i) => makeWord(i + 1));
    renderModal(selection, selection, 'selected');
    await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
    expect(screen.getByLabelText(/session progress/i)).toBeInTheDocument();
  });

  it('plays unseen words when the source is new', async () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    renderModal(words);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
    expect(screen.getByLabelText(/session progress/i)).toBeInTheDocument();
  });

  it('teaches a new word before asking about it, without scheduling the card', async () => {
    const words = Array.from({ length: 30 }, (_, i) => makeWord(i + 1));
    renderModal(words);
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.click(screen.getByRole('button', { name: /start playing/i }));

    // The first step is the intro card: it shows the meaning outright and the
    // only thing to do is continue.
    expect(screen.getByText('New word')).toBeInTheDocument();
    expect(screen.getByLabelText(/session progress/i)).toHaveTextContent(/^1 \//);

    await userEvent.click(screen.getByRole('button', { name: /got it/i }));

    // A question follows, and nothing has been graded — the intro is pure
    // exposure, so no card was written.
    expect(screen.queryByText('New word')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/session progress/i)).toHaveTextContent(/^2 \//);
    expect(storedCardCount()).toBe(0);
  });

  describe('drilling a missed word', () => {
    // Flashcard-only, so every item is a deterministic
    // "Show meaning" → Again/Good pair rather than a random activity.
    beforeEach(() => {
      localStorage.setItem(PLAY_STORAGE_KEY, JSON.stringify({
        activities: ['flashcard'], repsPerWord: 2, wordCount: 20, source: 'selected', buckets: [],
      }));
    });

    const queueLength = () => {
      const text = screen.getByLabelText(/session progress/i).textContent ?? '';
      return Number(text.split('/')[1]?.trim());
    };
    const answer = async (label: 'Again' | 'Good') => {
      // A never-studied word is introduced before its first question.
      const intro = screen.queryByRole('button', { name: /got it/i });
      if (intro) await userEvent.click(intro);
      await userEvent.click(screen.getByRole('button', { name: /show meaning/i }));
      await userEvent.click(screen.getByRole('button', { name: label }));
    };

    it('requeues the word and clears it only after two corrects', async () => {
      const selection = [makeWord(1)];
      renderModal(selection, selection, 'selected');
      await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
      const before = queueLength();

      await answer('Again');
      expect(queueLength()).toBe(before + 1);   // requeued

      await answer('Good');
      expect(queueLength()).toBe(before + 2);   // still owes one

      await answer('Good');
      expect(queueLength()).toBe(before + 2);   // cleared, nothing added
    });

    it('restarts the count when a repeat is missed', async () => {
      const selection = [makeWord(1)];
      renderModal(selection, selection, 'selected');
      await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
      const before = queueLength();

      await answer('Again');
      await answer('Good');
      await answer('Again');                    // resets to two owed
      expect(queueLength()).toBe(before + 3);

      await answer('Good');
      expect(queueLength()).toBe(before + 4);   // still owes one, not cleared
    });

    it('grades the miss once and never re-grades the repeats', async () => {
      const selection = [makeWord(1)];
      renderModal(selection, selection, 'selected');
      await userEvent.click(screen.getByRole('button', { name: /start playing/i }));

      await answer('Again');
      await answer('Good');
      await answer('Good');

      // Three answers, one lapse — the drill must not triple the review log.
      await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull());
      await waitFor(() => {
        const blob = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
        expect(blob.log).toHaveLength(1);
        expect(blob.log[0].grade).toBe(1);
      });
    });
  });

  it('cannot start Review with an untouched deck', async () => {
    const words = Array.from({ length: 5 }, (_, i) => makeWord(i + 1));
    renderModal(words);
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText(/Nothing to review yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeDisabled();
  });

  it('starts a Review session when a card is actually due', async () => {
    const words = Array.from({ length: 5 }, (_, i) => makeWord(i + 1));
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    // Seed localStorage directly with a v2 blob containing one due card:
    // FlashcardProvider reads via storage.load() synchronously on mount, so
    // this is in place before PlayModal ever computes its setup preview.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      cards: {
        '1:fr-en': {
          wordId: 1, direction: 'fr-en',
          stability: 10, difficulty: 5,
          elapsedDays: 20, scheduledDays: 10, reps: 3, lapses: 0,
          state: 'review',
          lastReview: new Date(now - 20 * dayMs).toISOString(),
          due: new Date(now - 1 * dayMs).toISOString(),
        },
      },
      log: [],
      settings: { requestRetention: 0.9, typedCheck: false, lastGoal: 20, lastFilter: [], lastDirections: [] },
    }));

    renderModal(words);
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByRole('button', { name: /start playing/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
    expect(screen.getByLabelText(/session progress/i)).toBeInTheDocument();
  });
});
