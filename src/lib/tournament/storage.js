import { invoke, isTauri } from "@tauri-apps/api/core";
import { validateTournament } from "./engine.js";
const KEY = "tidy-tournament-v1";
export const emptyLibrary = () => ({
  schemaVersion: 1,
  revision: 0,
  tournaments: [],
});
/** @param {any} value */
export function validateLibrary(value) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.tournaments) ||
    value.tournaments.length > 100
  )
    throw new Error("토너먼트 자료를 읽지 못했어요. 원본을 보존합니다.");
  const ids = new Set();
  for (const t of value.tournaments) {
    validateTournament(t);
    if (ids.has(t.id)) throw new Error("중복된 대회 자료입니다.");
    ids.add(t.id);
  }
  return value;
}
export async function readLibrary() {
  if (isTauri()) return validateLibrary(await invoke("tournament_read"));
  const raw = localStorage.getItem(KEY);
  return raw ? validateLibrary(JSON.parse(raw)) : emptyLibrary();
}
/** @param {any} value */
export async function writeLibrary(value) {
  validateLibrary(value);
  if (isTauri())
    return validateLibrary(await invoke("tournament_write", { value }));
  if ((await readLibrary()).revision !== value.revision)
    throw new Error("다른 창에서 변경됐어요. 창을 다시 열어 주세요.");
  const next = { ...value, revision: value.revision + 1 };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
