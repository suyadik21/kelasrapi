export type SyncState = 'disabled' | 'idle' | 'syncing' | 'error' | 'conflict';

export type SyncStatus = {
  enabled: boolean;
  state: SyncState;
  lastSyncedAt: string | null;
  pendingChanges: number;
  message?: string;
};

export type AcademicSyncAdapter = {
  getStatus(): Promise<SyncStatus>;
  push(): Promise<SyncStatus>;
  pull(): Promise<SyncStatus>;
  resolveConflict(entityType: string, entityId: string, resolution: 'local' | 'remote'): Promise<void>;
};

export function createDisabledSyncAdapter(): AcademicSyncAdapter {
  const status: SyncStatus = {
    enabled: false,
    state: 'disabled',
    lastSyncedAt: null,
    pendingChanges: 0,
    message: 'Data tersimpan lokal. Firebase belum dikonfigurasi.',
  };
  return {
    async getStatus() {
      return status;
    },
    async push() {
      return status;
    },
    async pull() {
      return status;
    },
    async resolveConflict() {
      throw new Error('Sinkronisasi cloud belum diaktifkan.');
    },
  };
}
