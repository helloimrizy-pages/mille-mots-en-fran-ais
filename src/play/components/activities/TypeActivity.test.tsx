import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Word } from '../../../types';
import { TypeActivity } from './TypeActivity';

const word: Word = { id: 1, rank: 1, french: 'chien', english: 'dog', pos: 'noun', ipa: '/x/', example: { fr: '', en: '' }, audio: { word: 'w.mp3', sentence: 's.mp3' } };

describe('TypeActivity', () => {
  it('reports correct for a matching answer', async () => {
    const onResult = vi.fn();
    render(<TypeActivity item={{ word, activity: 'type', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.type(screen.getByLabelText(/type your answer/i), 'dog');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onResult).toHaveBeenCalledWith('correct');
  });

  it('reports wrong for a non-matching answer', async () => {
    const onResult = vi.fn();
    render(<TypeActivity item={{ word, activity: 'type', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.type(screen.getByLabelText(/type your answer/i), 'cat');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onResult).toHaveBeenCalledWith('wrong');
  });

  it('accepts a single alternative from a multi-gloss english field', async () => {
    const multiGlossWord: Word = { ...word, id: 2, rank: 2, french: 'de', english: 'of, from' };
    const onResult = vi.fn();
    render(<TypeActivity item={{ word: multiGlossWord, activity: 'type', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.type(screen.getByLabelText(/type your answer/i), 'from');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onResult).toHaveBeenCalledWith('correct');
  });
});
