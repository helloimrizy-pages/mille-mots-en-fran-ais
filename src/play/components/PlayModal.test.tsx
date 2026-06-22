import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import type { Word } from '../../types';
import { PlayModal } from './PlayModal';

function makeWord(id: number): Word {
  return { id, rank: id, french: `mot${id}`, english: `meaning${id}`, pos: 'noun', ipa: '/x/', example: { fr: 'Ex.', en: 'Ex.' }, audio: { word: 'w.mp3', sentence: 's.mp3' } };
}

function renderModal(selected: Word[]) {
  return render(
    <FlashcardProvider>
      <PlayModal selected={selected} pool={selected} open onClose={() => {}} />
    </FlashcardProvider>,
  );
}

describe('PlayModal', () => {
  it('shows the setup screen with the selected word count', () => {
    renderModal([makeWord(1), makeWord(2)]);
    expect(
      screen.getByText((_, el) => el?.textContent === 'Playing with 2 selected words.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeEnabled();
  });

  it('starts a session when Start is clicked', async () => {
    renderModal(Array.from({ length: 3 }, (_, i) => makeWord(i + 1)));
    await userEvent.click(screen.getByRole('button', { name: /start playing/i }));
    expect(screen.getByLabelText(/session progress/i)).toBeInTheDocument();
  });
});
