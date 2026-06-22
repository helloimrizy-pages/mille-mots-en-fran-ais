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
  it('reveals the meaning then reports exposure', async () => {
    const onResult = vi.fn();
    render(<FlashcardActivity item={{ word, activity: 'flashcard', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: /show meaning/i }));
    expect(screen.getByText('hello')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onResult).toHaveBeenCalledWith('exposed');
  });
});
