import { useSyncState } from '../useSyncState';

function relativeTime(ts: number | null): string {
  if (!ts) return 'never';
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

export function AccountSection() {
  const { user, status, lastSyncedAt, error, signIn, signOut, syncNow } = useSyncState();

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle mb-2">Account</h3>

      {!user && (
        <>
          <button
            type="button"
            onClick={() => { void signIn(); }}
            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-muted"
          >
            Sign in with Google
          </button>
          <p className="text-[11px] text-text-subtle mt-2">
            Your progress is stored only on this device. Sign in to back it up and study on more than one.
          </p>
        </>
      )}

      {user && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm truncate">{user.email ?? user.uid}</div>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="shrink-0 text-xs px-3 py-1.5 rounded-pill text-text-muted hover:bg-surface-muted"
            >
              Sign out
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={() => { void syncNow(); }}
              disabled={status === 'syncing'}
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-muted disabled:opacity-50"
            >
              {status === 'syncing' ? 'Syncing…' : 'Sync now'}
            </button>
            <span className="text-[11px] text-text-subtle">Last synced {relativeTime(lastSyncedAt)}</span>
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
    </section>
  );
}
