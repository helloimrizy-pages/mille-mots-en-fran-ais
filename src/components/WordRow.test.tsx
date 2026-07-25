import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordRow } from './WordRow';
import { resetConjugationCache } from '../hooks/useConjugations';
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

describe('WordRow selection', () => {
  it('renders a checkbox and toggles selection on row click in select mode', async () => {
    const onToggleSelect = vi.fn();
    const onToggleExpand = vi.fn();
    render(
      <WordRow
        word={word}
        expanded={false}
        hideTranslation={false}
        onPlayWord={() => {}}
        onPlaySentence={() => {}}
        onToggleExpand={onToggleExpand}
        selectMode
        selected={false}
        onToggleSelect={onToggleSelect}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: /select livre/i });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: /livre, select/i }));
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
    expect(onToggleExpand).not.toHaveBeenCalled();
  });
});

describe('WordRow expanded conjugations', () => {
  const verb: Word = {
    id: 2, rank: 3, french: 'est', english: 'is', pos: 'verb', ipa: 'ɛ',
    example: { fr: 'Elle est grande.', en: 'She is tall.' },
    audio: { word: '/audio/words/est.mp3', sentence: '/audio/sentences/est.mp3' },
  };

  const DATA = {
    forms: { est: 'être' },
    verbs: {
      'être': {
        aux: 'avoir' as const,
        P: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
        I: [], F: [], C: [], S: [], Y: [],
        PC: [], pp: 'été', ppres: 'étant',
      },
    },
  };

  beforeEach(() => {
    resetConjugationCache();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  const row = (w: Word) => (
    <WordRow
      word={w} expanded hideTranslation={false}
      onPlayWord={() => {}} onPlaySentence={() => {}} onToggleExpand={() => {}}
    />
  );

  it('shows the conjugation table when a verb row is expanded', async () => {
    render(row(verb));
    expect(await screen.findByText('Présent')).toBeInTheDocument();
    expect(screen.getByText('sommes')).toBeInTheDocument();
  });

  it('shows no conjugations for an expanded noun, and fetches nothing', async () => {
    render(row(word));
    await waitFor(() => expect(screen.getByText('book')).toBeInTheDocument());
    expect(screen.queryByText('Présent')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
