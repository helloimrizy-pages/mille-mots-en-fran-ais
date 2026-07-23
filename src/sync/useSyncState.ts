import { useContext } from 'react';
import { SyncContext, type SyncApi } from '../contexts/AuthContext';

export function useSyncState(): SyncApi {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncState must be used within an AuthProvider');
  return ctx;
}
