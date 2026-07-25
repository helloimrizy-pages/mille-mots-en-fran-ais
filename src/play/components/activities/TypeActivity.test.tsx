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
    expect(onResult).toHaveBeenCalledWith({ correct: true });
  });

  it('reports wrong for a non-matching answer', async () => {
    const onResult = vi.fn();
    render(<TypeActivity item={{ word, activity: 'type', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.type(screen.getByLabelText(/type your answer/i), 'cat');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onResult).toHaveBeenCalledWith({ correct: false });
  });

  it('accepts a single alternative from a multi-gloss english field', async () => {
    const multiGlossWord: Word = { ...word, id: 2, rank: 2, french: 'de', english: 'of, from' };
    const onResult = vi.fn();
    render(<TypeActivity item={{ word: multiGlossWord, activity: 'type', direction: 'fr-en' }} onResult={onResult} />);
    await userEvent.type(screen.getByLabelText(/type your answer/i), 'from');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onResult).toHaveBeenCalledWith({ correct: true });
  });
});

describe('TypeActivity prompt disambiguation', () => {
  // "have" is ai / as / avez / avons / ont in this word list, so an en-fr prompt
  // showing only the gloss has five valid answers and accepts one.
  const ai: Word = {
    id: 3, rank: 3, french: 'ai', english: 'have', pos: 'verb', ipa: '/e/',
    example: { fr: "J'ai deux frères.", en: 'I have two brothers.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
  const conj = {
    forms: { ai: 'avoir' },
    verbs: {
      avoir: {
        aux: 'avoir' as const,
        P: ['ai', 'as', 'a', 'avons', 'avez', 'ont'],
        I: [], F: [], C: [], S: [], Y: [], PC: [], pp: 'eu', ppres: 'ayant',
      },
    },
  };

  it('names the person and tense, and blanks the example, when asking for French', () => {
    render(<TypeActivity item={{ word: ai, activity: 'type', direction: 'en-fr' }} onResult={vi.fn()} conj={conj} />);
    expect(screen.getByText('je · présent · avoir')).toBeInTheDocument();
    expect(screen.getByText(/J'____ deux frères\./)).toBeInTheDocument();
  });

  it('keeps the hint but drops the cloze when asking for English', () => {
    // The French word is already the prompt, so a blanked French sentence would
    // add nothing — and could give the English away.
    render(<TypeActivity item={{ word: ai, activity: 'type', direction: 'fr-en' }} onResult={vi.fn()} conj={conj} />);
    expect(screen.getByText('je · présent · avoir')).toBeInTheDocument();
    expect(screen.queryByText(/____/)).not.toBeInTheDocument();
  });

  it('renders as before when the conjugation data has not loaded', () => {
    render(<TypeActivity item={{ word: ai, activity: 'type', direction: 'en-fr' }} onResult={vi.fn()} conj={null} />);
    expect(screen.queryByText(/présent/)).not.toBeInTheDocument();
    // The cloze needs no conjugation data, so it still helps on its own.
    expect(screen.getByText(/J'____ deux frères\./)).toBeInTheDocument();
  });
});
