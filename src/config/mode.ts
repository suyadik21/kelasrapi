export const LOCAL_ONLY_MODE = true;

export function assertLocalFileUri(uri: string) {
  if (/^https?:\/\//i.test(uri)) {
    throw new Error('Mode lokal hanya dapat membaca file dari perangkat ini.');
  }
}
