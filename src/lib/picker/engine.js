/** Pure selection/session model. No storage, artwork or animation randomness here. */
export const MODES = [{ id: 'classic', label: '클래식' }, { id: 'claw', label: '인형 뽑기' }, { id: 'balloon', label: '풍선 다트' }];
export const DURATION = { classic: 2000, claw: 4700, balloon: 3300 };
export const randomWord = () => crypto.getRandomValues(new Uint32Array(1))[0];
/** @param {number} n @param {()=>number} [word] */
export function randomIndex(n, word = randomWord) {
  if (!Number.isSafeInteger(n) || n < 1 || n > 0x100000000) throw new Error('뽑을 대상을 확인해 주세요.');
  const limit = Math.floor(0x100000000 / n) * n;
  let value;
  do { value = word(); } while (value >= limit);
  return value % n;
}
/** @template T @param {T[]} items @param {()=>number} [word] */
export function shuffle(items, word = randomWord) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = randomIndex(i + 1, word); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
/** @typedef {{id:string,name:string,number?:number,gender?:string}} Entry */
/** @typedef {{id:string,sourceKey:string,winner:Entry,mode:string,revision:number,startedAt:number,completed:boolean}} Run */
/** @typedef {{history:Run[],excluded:string[]}} Bucket */
/** @typedef {{buckets:Record<string,Bucket>,active:Run|null}} Session */
/** @returns {Session} */
export const createSession = () => ({ buckets: {}, active: null });
/** @param {Session} session @param {string} key @returns {Bucket} */
export const bucket = (session, key) => session.buckets[key] ?? { history: [], excluded: [] };
/** @param {readonly Entry[]} entries @param {string} type */
export const filterEntries = (entries, type) => entries.filter(e => !['male', 'female'].includes(type) || e.gender === type);
/** @param {readonly Entry[]} entries @param {Bucket} state @param {boolean} preventRepeat */
export function candidates(entries, state, preventRepeat) {
  const blocked = new Set(state.excluded);
  if (preventRepeat) state.history.forEach(r => blocked.add(r.winner.id));
  return entries.filter(e => !blocked.has(e.id));
}
/** @param {Session} session @param {string} key @param {readonly Entry[]} entries @param {string} mode @param {number} revision @param {boolean} preventRepeat @param {()=>number} [word] @returns {Session} */
export function beginDraw(session, key, entries, mode, revision, preventRepeat, word = randomWord) {
  if (session.active) throw new Error('뽑기가 진행 중이에요.');
  const eligible = candidates(entries, bucket(session, key), preventRepeat);
  if (!eligible.length) throw new Error('뽑을 대상이 없어요.');
  const winner = Object.freeze({ ...eligible[randomIndex(eligible.length, word)] });
  const run = { id: crypto.randomUUID(), sourceKey: key, winner, mode, revision, startedAt: performance.now(), completed: false };
  return { ...session, active: run };
}
/** Idempotent: animation completion and timeout may both call this. @param {Session} session @param {string} id */
export function finishDraw(session, id) {
  const run = session.active;
  if (!run || run.id !== id) return session;
  const state = bucket(session, run.sourceKey);
  return { active: null, buckets: { ...session.buckets, [run.sourceKey]: { ...state, history: [...state.history, { ...run, completed: true }] } } };
}
/** @param {Session} session @param {string} key @param {'undo'|'reset'|'exclude'|'restoreAll'} action @param {string} [id] */
export function updateBucket(session, key, action, id = '') {
  if (session.active) return session;
  const state = bucket(session, key);
  const next = { ...state };
  if (action === 'undo') next.history = state.history.slice(0, -1);
  if (action === 'reset') next.history = [];
  if (action === 'restoreAll') next.excluded = [];
  if (action === 'exclude') next.excluded = state.excluded.includes(id) ? state.excluded.filter(x => x !== id) : [...state.excluded, id];
  return { ...session, buckets: { ...session.buckets, [key]: next } };
}
/** @param {string} text */
export function parseList(text) {
  const names = text.split(/\r?\n/).map(s => s.normalize('NFC').trim()).filter(Boolean);
  if (!names.length) throw new Error('한 줄에 하나씩 입력해 주세요.');
  if (names.length > 500) throw new Error('목록은 500개까지 등록할 수 있어요.');
  if (names.some(n => [...n].length > 40 || /[\u0000-\u001f\u007f]/u.test(n))) throw new Error('각 항목은 제어 문자 없이 40자 이내로 입력해 주세요.');
  const counts = new Map();
  names.forEach(n => counts.set(n, (counts.get(n) ?? 0) + 1));
  return { names, duplicates: [...counts].filter(([, n]) => n > 1).map(([name]) => name) };
}
/** @param {string} kind @param {string[]} names @param {string} [name] */
export function makeList(kind, names, name = '') {
  return { id: crypto.randomUUID(), kind, name: name.trim() || (kind === 'groups' ? '모둠 목록' : '직접 입력 목록'), entries: names.map((name, i) => ({ id: crypto.randomUUID(), name, number: i + 1 })) };
}
