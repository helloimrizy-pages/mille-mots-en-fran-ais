import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordRow } from './WordRow';
import type { Word } from '../types';

const word: Word = {
  id: 1, rank: 42, french: 'livre', english: 'book',
  pos: 'noun', gender: 'm', plural: 'livres', ipa: 'livʁ',
  example: { fr: "J'ai acheté un livre hier.", en: 'I bought a book yesterday.' },
  audio: { word: '/audio/words/livre.mp3', sentence: '/audio/sentences/livre.mp3' },
};

describe('WordRow click-split', () => {
  it('clicking the French word fires onPlayWord but NOT onToggleExpand', async () => {
    const onPlayWord = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <WordRow
        word={word} expanded={false} hideTranslation={false}
        onPlayWord={onPlayWord} onToggleExpand={onToggleExpand}
        onPlaySentence={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /play pronunciation of livre/i }));
    expect(onPlayWord).toHaveBeenCalledTimes(1);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });

  it('clicking elsewhere on the row fires onToggleExpand but NOT onPlayWord', async () => {
    const onPlayWord = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <WordRow
        word={word} expanded={false} hideTranslation={false}
        onPlayWord={onPlayWord} onToggleExpand={onToggleExpand}
        onPlaySentence={() => {}}
      />,
    );
    await userEvent.click(screen.getByText('book'));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onPlayWord).not.toHaveBeenCalled();
  });

  it('renders gender tag only for nouns', () => {
    render(
      <WordRow
        word={word} expanded={false} hideTranslation={false}
        onPlayWord={() => {}} onToggleExpand={() => {}} onPlaySentence={() => {}}
      />,
    );
    expect(screen.getByText('m')).toBeInTheDocument();
  });
});
