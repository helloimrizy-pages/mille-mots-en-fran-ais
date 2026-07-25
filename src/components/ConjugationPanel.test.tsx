import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Word } from '../types';
import { resetConjugationCache, type ConjugationData } from '../hooks/useConjugations';
import { ConjugationPanel } from './ConjugationPanel';

const DATA: ConjugationData = {
  forms: { 'être': 'être', est: 'être' },
  verbs: {
    'être': {
      aux: 'avoir',
      P: ['suis', 'es', 'est', 'sommes', 'êtes', 'sont'],
      I: ['étais', 'étais', 'était', 'étions', 'étiez', 'étaient'],
      F: ['serai', 'seras', 'sera', 'serons', 'serez', 'seront'],
      C: ['serais', 'serais', 'serait', 'serions', 'seriez', 'seraient'],
      S: ['sois', 'sois', 'soit', 'soyons', 'soyez', 'soient'],
      Y: ['sois', 'soyons', 'soyez'],
      PC: ['ai été', 'as été', 'a été', 'avons été', 'avez été', 'ont été'],
      pp: 'été',
      ppres: 'étant',
    },
  },
};

function verb(french: string): Word {
  return {
    id: 1, rank: 1, french, english: 'to be', pos: 'verb', ipa: 'ɛtʁ',
    example: { fr: 'Ex.', en: 'Ex.' },
    audio: { word: '/audio/words/x.mp3', sentence: '/audio/sentences/x.mp3' },
  };
}

beforeEach(() => {
  resetConjugationCache();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) })));
});
afterEach(() => vi.unstubAllGlobals());

describe('ConjugationPanel', () => {
  it('shows the présent on open and hides the other tenses', async () => {
    render(<ConjugationPanel word={verb('être')} />);
    expect(await screen.findByText('Présent')).toBeInTheDocument();
    expect(screen.getByText('sommes')).toBeInTheDocument();
    expect(screen.queryByText('Imparfait')).not.toBeInTheDocument();
    expect(screen.queryByText('Passé composé')).not.toBeInTheDocument();
  });

  it('reveals the remaining tenses, imperative and participles on toggle', async () => {
    render(<ConjugationPanel word={verb('être')} />);
    await userEvent.click(await screen.findByRole('button', { name: /more tenses/i }));

    expect(screen.getByText('Passé composé')).toBeInTheDocument();
    expect(screen.getByText('Imparfait')).toBeInTheDocument();
    expect(screen.getByText('Subjonctif')).toBeInTheDocument();
    expect(screen.getByText('Impératif')).toBeInTheDocument();
    expect(screen.getByText('étant (prés.)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /fewer tenses/i })).toBeInTheDocument();
  });

  it('highlights the entry\'s own form and names its infinitive', async () => {
    render(<ConjugationPanel word={verb('est')} />);
    // An inflected entry is labelled as a form of its lemma…
    expect(await screen.findByText(/est is a form of être/)).toBeInTheDocument();
    // …and that form is emphasised in the table.
    expect(screen.getByText('est')).toHaveClass('text-emphasis');
    expect(screen.getByText('sommes')).not.toHaveClass('text-emphasis');
  });

  it('does not call the infinitive a form of itself', async () => {
    render(<ConjugationPanel word={verb('être')} />);
    await screen.findByText('Présent');
    expect(screen.queryByText(/is a form of/)).not.toBeInTheDocument();
  });

  it('elides je before a vowel but not before a consonant', async () => {
    render(<ConjugationPanel word={verb('être')} />);
    await userEvent.click(await screen.findByRole('button', { name: /more tenses/i }));
    // "ai été" and "étais" elide; "suis", "serai", "serais" and "sois" do not.
    expect(screen.getAllByText("j'")).toHaveLength(2);
    expect(screen.getAllByText('je')).toHaveLength(4);
  });

  it('renders nothing for a verb with no conjugation data', async () => {
    const { container } = render(<ConjugationPanel word={verb('inconnu')} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('degrades quietly when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 })));
    const { container } = render(<ConjugationPanel word={verb('être')} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('fetches once even when several panels mount', async () => {
    render(
      <>
        <ConjugationPanel word={verb('être')} />
        <ConjugationPanel word={verb('est')} />
      </>,
    );
    await screen.findAllByText('Présent');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
