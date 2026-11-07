import { assertLocalFileUri, LOCAL_ONLY_MODE } from './mode';

describe('local-only boundary', () => {
  it('rejects remote URLs while allowing document-provider URIs', () => {
    expect(LOCAL_ONLY_MODE).toBe(true);
    expect(() => assertLocalFileUri('https://example.test/backup.json')).toThrow('Mode lokal');
    expect(() => assertLocalFileUri('content://downloads/backup.json')).not.toThrow();
    expect(() => assertLocalFileUri('file:///data/local/backup.json')).not.toThrow();
  });
});
