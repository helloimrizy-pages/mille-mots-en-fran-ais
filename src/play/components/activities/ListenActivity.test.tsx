import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Word } from '../../../types';
import { ListenActivity } from './ListenActivity';

function makeWord(id: number, fr: string, en: string): Word {
  return { id, rank: id, french: fr, english: en, pos: 'noun', ipa: '/x/', example: { fr: '', en: '' }, audio: { word: 'w.mp3', sentence: 's.mp3' } };
}
const answer = makeWord(1, 'chien', 'dog');
const other = makeWord(2, 'chat', 'cat');

describe('ListenActivity', () => {
  it('reports correct when the right meaning is chosen', async () => {
    const onResult = vi.fn();
    render(<ListenActivity item={{ word: answer, activity: 'listen', direction: 'fr-en', choices: [answer, other] }} onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: 'dog' }));
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onResult).toHaveBeenCalledWith('correct');
  });
});
