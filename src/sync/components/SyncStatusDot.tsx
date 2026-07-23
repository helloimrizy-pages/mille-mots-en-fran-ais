import { cn } from '@/lib/utils';
import { useSyncState } from '../useSyncState';
import type { SyncStatus } from '../types';

const LABEL: Record<SyncStatus, string> = {
  'signed-out': 'Not signed in',
  syncing: 'Syncing',
  synced: 'Synced',
  offline: 'Offline — changes will sync later',
  error: 'Sync error',
};

export function SyncStatusDot({ onClick }: { onClick: () => void }) {
  const { user, status } = useSyncState();

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={LABEL[status]}
      title={LABEL[status]}
      className="p-1.5 rounded-pill text-text-subtle hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-emphasis/40"
    >
      {user?.photoURL && status !== 'error' ? (
        <img src={user.photoURL} alt="" className="size-4 rounded-full" />
      ) : (
        <span
          className={cn(
            'block size-2.5 rounded-full',
            status === 'signed-out' && 'border border-text-subtle',
            status === 'syncing' && 'bg-emphasis animate-pulse',
            status === 'synced' && 'bg-emerald-500',
            status === 'offline' && 'bg-text-subtle',
            status === 'error' && 'bg-red-600',
          )}
        />
      )}
    </button>
  );
}
