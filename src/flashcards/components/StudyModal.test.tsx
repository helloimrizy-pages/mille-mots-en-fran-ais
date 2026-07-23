import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { createMockAdapter } from '../../sync/adapter';
import type { Word } from '../../types';
import { StudyModal } from './StudyModal';

// StudyModal renders the Settings tab (AccountSection -> useSyncState) and
// reads flashcard settings on every tab, so both providers are required or
// mounting throws.
beforeEach(() => localStorage.clear());

function makeWord(id: number): Word {
  return {
    id,
    rank: id,
    french: `mot${id}`,
    english: `meaning${id}`,
    pos: 'noun',
    ipa: '/x/',
    example: { fr: 'Ex.', en: 'Ex.' },
    audio: { word: 'w.mp3', sentence: 's.mp3' },
  };
}

const words = [makeWord(1), makeWord(2)];

function tree(props: { open: boolean; initialTab?: 'study' | 'settings' }) {
  return (
    <FlashcardProvider>
      <AuthProvider adapter={createMockAdapter()}>
        <StudyModal words={words} onClose={() => {}} {...props} />
      </AuthProvider>
    </FlashcardProvider>
  );
}

describe('StudyModal', () => {
  it('opens on the Settings tab when initialTab is "settings"', () => {
    render(tree({ open: true, initialTab: 'settings' }));
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
  });

  it('opens on the Study tab when initialTab is "study"', () => {
    render(tree({ open: true, initialTab: 'study' }));
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('opens on the Study tab when initialTab is omitted', () => {
    render(tree({ open: true }));
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('re-seeds the tab across a close/reopen cycle', () => {
    const { rerender } = render(tree({ open: true, initialTab: 'study' }));
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();

    // Close the modal.
    rerender(tree({ open: false, initialTab: 'study' }));
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();

    // Reopen on Settings this time: the re-seed must fire again, not just on
    // first mount.
    rerender(tree({ open: true, initialTab: 'settings' }));
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
  });

  it('does not trap a manual tab switch while the modal stays open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree({ open: true, initialTab: 'study' }));
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();

    // A subsequent render while still open (no open-state transition) must
    // not snap the tab back to `initialTab`.
    rerender(tree({ open: true, initialTab: 'study' }));
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
  });
});
