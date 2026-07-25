import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Word } from '../../../types';
import { IntroActivity } from './IntroActivity';

const word: Word = {
  id: 1, rank: 1, french: 'chien', english: 'dog', pos: 'noun', ipa: '/ʃjɛ̃/',
  example: { fr: 'Le chien dort.', en: 'The dog sleeps.' },
  audio: { word: 'w.mp3', sentence: 's.mp3' },
};

function renderIntro(onNext = vi.fn()) {
  render(<IntroActivity item={{ word, activity: 'intro', direction: 'fr-en' }} onNext={onNext} />);
  return onNext;
}

describe('IntroActivity', () => {
  it('shows the french, ipa, meaning and example without asking anything', () => {
    renderIntro();
    expect(screen.getByRole('button', { name: /play pronunciation of chien/i })).toBeInTheDocument();
    expect(screen.getByText('/ʃjɛ̃/')).toBeInTheDocument();
    expect(screen.getByText('dog')).toBeInTheDocument();
    expect(screen.getByText(/Le chien dort\./)).toBeInTheDocument();
    expect(screen.getByText('The dog sleeps.')).toBeInTheDocument();
  });

  it('plays the word once on mount', () => {
    const play = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    renderIntro();
    expect(play).toHaveBeenCalledTimes(1);
    play.mockRestore();
  });

  it('advances the queue without reporting an answer', async () => {
    const onNext = renderIntro();
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
