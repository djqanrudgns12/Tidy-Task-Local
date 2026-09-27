/** 커스텀 점수판 항목 입력(PRD 9.1). 한 줄에 하나씩, 한 줄뿐이면 탭·쉼표로도 나눕니다(엑셀 한 행 붙여넣기). */
import { LIMITS } from './model.js';

/** @param {string} text @returns {string[]} */
export function parseItems(text) {
  const lines = String(text ?? '').normalize('NFC').split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim());
  const parts = nonEmpty.length === 1 && /[\t,]/.test(nonEmpty[0]) ? nonEmpty[0].split(/[\t,]/) : lines;
  return parts.map((p) => p.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim()).filter(Boolean);
}

/** @param {string[]} names
 * @returns {{errors:string[], notices:string[], long:number[], duplicates:string[]}} errors가 있으면 만들 수 없음 */
export function itemIssues(names) {
  const errors = [];
  const notices = [];
  const long = names.flatMap((n, i) => ([...n].length > LIMITS.itemName ? [i] : []));
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const duplicates = [...counts].filter(([, c]) => c > 1).map(([n]) => n);
  if (!names.length) errors.push('항목을 한 줄에 하나씩 입력해 주세요.');
  if (names.length > LIMITS.items) errors.push(`${LIMITS.items}개까지 만들 수 있어요. (지금 ${names.length}개)`);
  if (long.length) notices.push(`${LIMITS.itemName}자까지 보여요. 긴 이름 ${long.length}개는 뒤가 잘려요.`);
  if (duplicates.length) notices.push(`같은 이름이 있어요(${duplicates.slice(0, 2).join(', ')}). 그대로 만들 수 있어요.`);
  return { errors, notices, long, duplicates };
}

/** 빠른 채우기 칩 */
export const TEMPLATES = Object.freeze([
  { id: 'groups', label: '1~6모둠', make: () => Array.from({ length: 6 }, (_, i) => `${i + 1}모둠`) },
  { id: 'rows', label: '1~4분단', make: () => Array.from({ length: 4 }, (_, i) => `${i + 1}분단`) },
  { id: 'teams', label: '청팀·백팀', make: () => ['청팀', '백팀'] },
  { id: 'gender', label: '남학생·여학생', make: () => ['남학생', '여학생'] },
  { id: 'numbers', label: '번호 1~N', make: (/** @type {number} */ n = 10) => Array.from({ length: Math.max(2, Math.min(LIMITS.items, n)) }, (_, i) => `${i + 1}번`) },
].map((t) => Object.freeze(t)));
