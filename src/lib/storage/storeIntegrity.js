// plugin-store can silently start with an empty cache when loading a file fails.
// Compare the cache with the file on disk before treating a window as hydrated.
/**
 * @param {{ exists?: boolean, parse_ok?: boolean, keys?: string[] } | null} health
 * @param {string[]} loadedKeys
 */
export function assertStoreMatchesDisk(health, loadedKeys) {
  if (!health || typeof health.exists !== 'boolean' || !Array.isArray(health.keys)) {
    throw new Error('저장 파일 상태를 확인할 수 없습니다.');
  }
  if (!health.exists) return;
  if (!health.parse_ok) {
    throw new Error('저장 파일이 손상되었거나 읽을 수 없습니다.');
  }
  const loaded = new Set(loadedKeys);
  const missing = health.keys.filter((key) => !loaded.has(key));
  if (missing.length) {
    throw new Error(`디스크에 있는 저장 키를 불러오지 못했습니다: ${missing.join(', ')}`);
  }
}
