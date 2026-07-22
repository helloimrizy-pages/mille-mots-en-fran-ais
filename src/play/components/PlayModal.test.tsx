import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import type { Word } from '../../types';
import type { PlaySource } from '../types';
import { PlayModal } from './PlayModal';

// The modal persists play settings on start and the provider reads the SRS
// blob, so tests must not inherit either from a previous case.
beforeEach(() => localStorage.clear());

function makeWord(id: number): Word {
  return { id, rank: id, french: `mot${id}`, english: `meaning${id}`, pos: 'noun', ipa: '/x/', example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' } };
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

  it('cannot start Review with an untouched deck', async () => {
    const words = Array.from({ length: 5 }, (_, i) => makeWord(i + 1));
    renderModal(words);
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText(/Nothing to review yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeDisabled();
  });
});
