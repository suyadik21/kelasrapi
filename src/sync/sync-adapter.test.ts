import { createDisabledSyncAdapter } from './sync-adapter';

describe('optional sync adapter', () => {
  it('keeps the local workflow usable without Firebase', async () => {
    const adapter = createDisabledSyncAdapter();
    await expect(adapter.getStatus()).resolves.toMatchObject({
      enabled: false,
      state: 'disabled',
      pendingChanges: 0,
    });
    await expect(adapter.push()).resolves.toMatchObject({ enabled: false });
    await expect(adapter.resolveConflict('attendance', 'a1', 'local')).rejects.toThrow(
      'belum diaktifkan',
    );
  });
});
