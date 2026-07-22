import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Word } from '../../types';
import type { Strength } from '../strength';
import { DEFAULT_PLAY_SETTINGS, type PlaySettings } from '../types';
import { PlaySetup, type SetupPreview } from './PlaySetup';

function makeWord(id: number): Word {
  return {
    id, rank: id,
    french: `mot${id}`, english: `meaning${id}`,
    pos: 'noun', ipa: '/x/',
    example: { fr: 'Ex.', en: 'Ex.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
}

const NO_COUNTS: Record<Strength, number> = {
  'new': 0, 'almost-forgotten': 0, 'just-seen': 0,
  'shaky': 0, 'getting-solid': 0, 'solid': 0,
};

function renderSetup(
  settings: Partial<PlaySettings> = {},
  preview: Partial<SetupPreview> = {},
  onSettingsChange = vi.fn(),
) {
  const merged: SetupPreview = {
    words: [], dueCount: 0, counts: NO_COUNTS, selectedCount: 0, ...preview,
  };
  render(
    <PlaySetup
      settings={{ ...DEFAULT_PLAY_SETTINGS, ...settings }}
      onSettingsChange={onSettingsChange}
      onStart={vi.fn()}
      preview={merged}
    />,
  );
  return onSettingsChange;
}

describe('PlaySetup', () => {
  it('offers New and Review sources', () => {
    renderSetup();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('hides the Selected source when nothing is selected', () => {
    renderSetup({}, { selectedCount: 0 });
    expect(screen.queryByRole('button', { name: 'Selected' })).not.toBeInTheDocument();
  });

  it('offers the Selected source when there is a selection', () => {
    renderSetup({}, { selectedCount: 3 });
    expect(screen.getByRole('button', { name: 'Selected' })).toBeInTheDocument();
  });

  it('changes source when a source chip is clicked', async () => {
    const onSettingsChange = renderSetup({ source: 'review' });
    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ source: 'new' }));
  });

  it('toggles a strength bucket for the review source', async () => {
    const onSettingsChange = renderSetup(
      { source: 'review' },
      { words: [makeWord(1)], counts: { ...NO_COUNTS, shaky: 4 } },
    );
    await userEvent.click(screen.getByRole('button', { name: /Shaky/ }));
    expect(onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ buckets: ['shaky'] }));
  });

  it('hides strength buckets for the new source', () => {
    renderSetup({ source: 'new' }, { words: [makeWord(1)] });
    expect(screen.queryByRole('button', { name: /Shaky/ })).not.toBeInTheDocument();
  });

  it('summarises a review session as due plus topped up', () => {
    renderSetup({ source: 'review' }, { words: [makeWord(1), makeWord(2), makeWord(3)], dueCount: 2 });
    expect(screen.getByText(/2 due, 1 topped up/)).toBeInTheDocument();
  });

  it('summarises a new session with the remaining count', () => {
    renderSetup(
      { source: 'new' },
      { words: [makeWord(1)], counts: { ...NO_COUNTS, new: 4812 } },
    );
    expect(screen.getByText(/4,812 remaining/)).toBeInTheDocument();
  });

  it('keeps the original copy for the selected source', () => {
    renderSetup(
      { source: 'selected' },
      { words: [makeWord(1), makeWord(2)], selectedCount: 2 },
    );
    expect(
      screen.getByText((_, el) => el?.textContent === 'Playing with 2 selected words.'),
    ).toBeInTheDocument();
  });

  it('explains when there are no new words left', () => {
    renderSetup({ source: 'new' }, { words: [] });
    expect(screen.getByText(/You've seen every word/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start playing/i })).toBeDisabled();
  });

  it('explains when nothing has been played yet', () => {
    renderSetup({ source: 'review', buckets: [] }, { words: [] });
    expect(screen.getByText(/Nothing to review yet/)).toBeInTheDocument();
  });

  it('explains when the bucket filter matches nothing', () => {
    renderSetup({ source: 'review', buckets: ['solid'] }, { words: [] });
    expect(screen.getByText(/No words in the selected strengths/)).toBeInTheDocument();
  });

  it('enables Start when there are words and activities', () => {
    renderSetup({ source: 'new' }, { words: [makeWord(1)] });
    expect(screen.getByRole('button', { name: /start playing/i })).toBeEnabled();
  });
});
