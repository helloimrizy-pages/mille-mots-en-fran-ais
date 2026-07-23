import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Word } from '../../../types';
import { FlashcardActivity } from './FlashcardActivity';

const word: Word = {
  id: 1, rank: 1, french: 'bonjour', english: 'hello', pos: 'noun', ipa: '/bɔ̃ʒuʁ/',
  example: { fr: 'Bonjour!', en: 'Hello!' }, audio: { word: 'w.mp3', sentence: 's.mp3' },
};

describe('FlashcardActivity', () => {
  it('hides the grade buttons until the meaning is revealed', () => {
    const onResult = vi.fn();
    render(<FlashcardActivity item={{ word, activity: 'flashcard', direction: 'fr-en' }} onResult={onResult} />);
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Good' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show meaning/i })).toBeInTheDocument();
  });

  it('reveals the meaning and the four self-grade buttons', async () => {
    const onResult = vi.fn();
    render(<FlashcardActivity item={{ word, activity: 'flashcard', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: /show meaning/i }));
    expect(screen.getByText('hello')).toBeInTheDocument();
    for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('prompts with English and reveals French in the en-fr direction', async () => {
    const onResult = vi.fn();
    render(<FlashcardActivity item={{ word, activity: 'flashcard', direction: 'en-fr' }} onResult={onResult} />);
    // Front shows the English prompt; the French answer is hidden until reveal.
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByText('bonjour')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show meaning/i }));
    expect(screen.getByRole('button', { name: /play pronunciation of bonjour/i })).toBeInTheDocument();
  });

  it('reports the chosen grade when a self-grade button is pressed', async () => {
    const onResult = vi.fn();
    render(<FlashcardActivity item={{ word, activity: 'flashcard', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: /show meaning/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Good' }));
    expect(onResult).toHaveBeenCalledWith({ grade: 3 });
  });

  it('reports Again when the user did not know it', async () => {
    const onResult = vi.fn();
    render(<FlashcardActivity item={{ word, activity: 'flashcard', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: /show meaning/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Again' }));
    expect(onResult).toHaveBeenCalledWith({ grade: 1 });
  });
});
