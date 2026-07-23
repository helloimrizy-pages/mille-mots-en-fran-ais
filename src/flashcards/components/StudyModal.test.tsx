import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { createMockAdapter } from '../../sync/adapter';
import type { Word } from '../../types';
import { StudyModal } from './StudyModal';

// StudyModal's Settings view renders AccountSection -> useSyncState, and every
// tab reads flashcard settings, so both providers are required or mounting throws.
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

function tree(props: { open: boolean; settingsOnly?: boolean }) {
  return (
    <FlashcardProvider>
      <AuthProvider adapter={createMockAdapter()}>
        <StudyModal words={words} onClose={() => {}} {...props} />
      </AuthProvider>
    </FlashcardProvider>
  );
}

describe('StudyModal', () => {
  it('shows only the Settings panel in settings-only mode, with no tab bar', () => {
    render(tree({ open: true, settingsOnly: true }));
    // Settings content is present…
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    // …but the Study/Stats tab buttons and the study setup are gone.
    expect(screen.queryByRole('button', { name: 'Study' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
  });

  it('labels the settings-only dialog "Settings"', () => {
    render(tree({ open: true, settingsOnly: true }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  });

  it('opens the full tabbed modal on Study, with Study and Stats but no Settings tab', () => {
    render(tree({ open: true }));
    expect(screen.getByRole('button', { name: 'Study' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    // The Settings tab was removed — settings live behind the profile button now.
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument();
  });

  it('resets the tabbed modal to Study on reopen', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree({ open: true }));
    // Switch to Stats, then close and reopen.
    await user.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();

    rerender(tree({ open: false }));
    rerender(tree({ open: true }));

    // Reopening lands back on Study, not the previously-viewed Stats tab.
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
  });

  it('does not trap a manual tab switch while the modal stays open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree({ open: true }));
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();

    // A re-render while still open (no open-state transition) must not snap the
    // tab back to Study.
    rerender(tree({ open: true }));
    expect(screen.queryByRole('button', { name: /start session/i })).not.toBeInTheDocument();
  });
});
