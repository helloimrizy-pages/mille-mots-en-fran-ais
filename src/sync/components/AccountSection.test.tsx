import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { FlashcardProvider } from '../../contexts/FlashcardContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { createMockAdapter, type MockAdapter } from '../adapter';
import { AccountSection } from './AccountSection';

function wrap(adapter: MockAdapter, children: ReactNode) {
  return render(
    <FlashcardProvider>
      <AuthProvider adapter={adapter}>{children}</AuthProvider>
    </FlashcardProvider>,
  );
}

describe('AccountSection', () => {
  it('offers Google sign-in when signed out', () => {
    wrap(createMockAdapter(), <AccountSection />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
  });

  it('explains that data stays on this device when signed out', () => {
    wrap(createMockAdapter(), <AccountSection />);
    expect(screen.getByText(/only on this device/i)).toBeInTheDocument();
  });

  it('shows the account email and sign-out once signed in', async () => {
    const adapter = createMockAdapter();
    wrap(adapter, <AccountSection />);
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(await screen.findByText('mock@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sync now/i })).toBeInTheDocument();
  });

  it('surfaces a sync error without hiding the account', async () => {
    const adapter = createMockAdapter();
    adapter.failNext(new Error('permission denied'));
    wrap(adapter, <AccountSection />);
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls signIn when the button is pressed', async () => {
    const adapter = createMockAdapter();
    const spy = vi.spyOn(adapter, 'signIn');
    wrap(adapter, <AccountSection />);
    await userEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(spy).toHaveBeenCalled();
  });
});
