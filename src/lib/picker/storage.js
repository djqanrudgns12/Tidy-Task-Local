import { invoke, isTauri } from '@tauri-apps/api/core';
const KEY = 'tidy-picker-library-v1';
export const emptyLibrary = () => ({ schemaVersion: 1, revision: 0, preferences: { sound: true, reduced: false }, lists: [] });
/** @param {any} value */
export function validateLibrary(value) {
  if (!value || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.lists) || value.lists.length > 100 || typeof value.preferences?.sound !== 'boolean' || typeof value.preferences?.reduced !== 'boolean') throw new Error('뽑기 저장 자료를 읽지 못했어요. 원본을 보존합니다.');
  const ids = new Set();
  for (const list of value.lists) {
    if (!list || typeof list.id !== 'string' || !list.id || ids.has(list.id) || !['groups','custom'].includes(list.kind) || typeof list.name !== 'string' || !list.name.trim() || list.name.length > 80 || !Array.isArray(list.entries) || !list.entries.length || list.entries.length > 500) throw new Error('저장 목록 형식을 확인해 주세요.');
    ids.add(list.id); const entryIds = new Set();
    for (const e of list.entries) {
      if (!e || typeof e.id !== 'string' || !e.id || entryIds.has(e.id) || typeof e.name !== 'string' || !e.name.trim() || [...e.name].length > 40 || /[\u0000-\u001f\u007f]/u.test(e.name) || !Number.isSafeInteger(e.number) || e.number < 1) throw new Error('목록 항목을 확인해 주세요.');
      entryIds.add(e.id);
    }
  }
  return value;
}
export async function readLibrary() {
  if (isTauri()) return validateLibrary(await invoke('picker_read'));
  const text = localStorage.getItem(KEY);
  return text ? validateLibrary(JSON.parse(text)) : emptyLibrary();
}
/** @param {any} value */
export async function writeLibrary(value) {
  validateLibrary(value);
  if (isTauri()) return validateLibrary(await invoke('picker_write', { value }));
  const current = await readLibrary();
  if (current.revision !== value.revision) throw new Error('저장 목록이 변경됐어요. 목록을 다시 불러와 주세요.');
  const next = { ...value, revision: value.revision + 1 };
  localStorage.setItem(KEY, JSON.stringify(next)); return next;
}
