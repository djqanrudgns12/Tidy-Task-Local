// 음성 자료는 표 저장소와 분리합니다. 모델과 개인정보가 포함될 수 있는 문장을 다른 구역에 둡니다.
const DB = 'tidy-vote-speech-v1';
/** @returns {Promise<IDBDatabase>} */
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('models');
      request.result.createObjectStore('clips');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 창의 음성 준비를 끝내 주세요.'));
  });
}
/** @param {'models'|'clips'} store @param {'readonly'|'readwrite'} mode @param {(store:IDBObjectStore)=>IDBRequest} action */
async function transaction(store, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('음성을 저장하지 못했어요.')); };
  });
}
/** @param {'models'|'clips'} store @param {string} key */
export const cacheGet = (store, key) => transaction(store, 'readonly', (s) => s.get(key));
/** @param {'models'|'clips'} store @param {string} key @param {any} value */
export const cachePut = (store, key, value) => transaction(store, 'readwrite', (s) => s.put(value, key));
/** @param {'models'|'clips'} store */
export const cacheClear = (store) => transaction(store, 'readwrite', (s) => s.clear());
/** @param {string|ArrayBuffer} input */
export async function hash(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** 30일·100MB 범위에서 오래된 동적 음성을 지웁니다. @param {Set<string>} [keep] */
export async function trimClips(keep = new Set()) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('clips', 'readwrite'), store = tx.objectStore('clips');
    const request = store.getAll();
    request.onsuccess = () => {
      const entries = request.result.sort((a, b) => a.usedAt - b.usedAt);
      let total = entries.reduce((n, e) => n + e.bytes.byteLength, 0);
      for (const e of entries) if (!keep.has(e.key) && (e.usedAt < Date.now() - 30 * 86400000 || total > 100 * 1024 * 1024)) {
        store.delete(e.key); total -= e.bytes.byteLength;
      }
    };
    tx.oncomplete = () => { db.close(); resolve(undefined); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
