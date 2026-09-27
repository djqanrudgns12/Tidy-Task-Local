// 후보 캐릭터·색·무늬 배정(PRD 4절 "배정 규칙"). 한 투표 안에서 캐릭터 18명·색 9가지·무늬 9종은 각각 한 번만 씁니다.
// 모든 함수는 새 배열을 돌려주고 입력을 고치지 않습니다(저장소 변경 함수로 그대로 쓰기 위해).
import { COLOR_IDS, PATTERN_IDS } from './palette.js';
import { CHARACTERS, charactersOf } from './characters.js';
import { fisherYates, randomId, seededRandom } from './random.js';

/** @typedef {import('./model.js').Item} Item */

/** 투표마다 다른 캐릭터 순서(같은 투표 id면 같은 순서 — 편집 중 캐릭터가 바뀌지 않게).
 * @param {'m'|'f'} gender @param {string} seed @returns {string[]} */
export function characterOrder(gender, seed) {
  const ids = charactersOf(gender).map((c) => c.id);
  return seed ? fisherYates(ids, seededRandom(`${seed}:${gender}`)) : ids;
}

/** @param {readonly (string|null)[]} used @param {readonly string[]} order */
const firstUnused = (used, order) => order.find((id) => !used.includes(id)) ?? null;

/** 중복·잘못된 배정을 바로잡고 빈 자리를 채웁니다(저장된 자료를 읽을 때 · 편집 뒤).
 * 앞쪽 항목이 먼저 차지하고, 겹친 뒤쪽 항목만 새로 받습니다.
 * @param {Item[]} items @param {string} type @param {string} seed @returns {Item[]} */
export function repairItems(items, type, seed) {
  const out = items.map((it) => ({ ...it }));
  /** @type {string[]} */ const colors = [];
  for (const it of out) {
    if (it.color && COLOR_IDS.includes(it.color) && !colors.includes(it.color)) colors.push(it.color);
    else it.color = null;
  }
  for (const it of out) if (!it.color) colors.push((it.color = firstUnused(colors, COLOR_IDS) ?? COLOR_IDS[0]));

  if (type === 'opinion') {
    /** @type {string[]} */ const patterns = [];
    for (const it of out) {
      if (it.pattern && PATTERN_IDS.includes(it.pattern) && !patterns.includes(it.pattern)) patterns.push(it.pattern);
      else it.pattern = null;
    }
    for (const it of out) if (!it.pattern) patterns.push((it.pattern = firstUnused(patterns, PATTERN_IDS) ?? PATTERN_IDS[0]));
  } else for (const it of out) it.pattern = null;

  if (type === 'candidate') {
    /** @type {string[]} */ const chars = [];
    for (const it of out) {
      const c = CHARACTERS.find((x) => x.id === it.character);
      if (it.gender && c && c.gender === it.gender && !chars.includes(c.id)) chars.push(c.id);
      else it.character = null;
    }
    for (const it of out) {
      if (it.gender && !it.character) {
        it.character = firstUnused(chars, characterOrder(it.gender, seed));
        if (it.character) chars.push(it.character);
      }
    }
  } else for (const it of out) {
    it.gender = null;
    it.character = null;
  }
  return out;
}

/** 기호 = 목록 순서. @param {Item[]} items */
export const renumber = (items) => items.map((it, i) => (it.number === i + 1 ? it : { ...it, number: i + 1 }));

/** 새 줄 하나(색·무늬는 곧바로, 캐릭터는 남/녀를 고르면). @param {Item[]} items @param {string} type @param {string} [name] @returns {Item[]} */
export function addItem(items, type, name = '') {
  const item = {
    id: randomId('i', 6),
    number: items.length + 1,
    name,
    gender: null,
    character: null,
    color: firstUnused(items.map((it) => it.color), COLOR_IDS),
    pattern: type === 'opinion' ? firstUnused(items.map((it) => it.pattern), PATTERN_IDS) : null,
    intro: '',
  };
  return [...items, /** @type {Item} */ (item)];
}

/** @param {Item[]} items @param {string} id */
export const removeItem = (items, id) => renumber(items.filter((it) => it.id !== id));

/** 끌어서 순서 바꾸기. @param {Item[]} items @param {number} from @param {number} to */
export function moveItem(items, from, to) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const out = [...items];
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return renumber(out);
}

/** 남/녀를 고르면 원래 캐릭터를 내려놓고 새 성별에서 안 쓴 캐릭터를 받습니다.
 * @param {Item[]} items @param {string} id @param {'m'|'f'} gender @param {string} seed @returns {Item[]} */
export function setGender(items, id, gender, seed) {
  const target = items.find((it) => it.id === id);
  if (!target || target.gender === gender) return items;
  const others = items.filter((it) => it.id !== id).map((it) => it.character);
  const character = firstUnused(others, characterOrder(gender, seed));
  return items.map((it) => (it.id === id ? { ...it, gender, character } : it));
}

/** 이미 다른 후보가 쓰는 값을 고르면 두 후보가 서로 바꿉니다.
 * @param {Item[]} items @param {string} id @param {'character'|'color'|'pattern'} field @param {string} value
 * @returns {{items:Item[], swappedWith:number|null}} swappedWith = 바꾼 상대의 기호 */
export function chooseValue(items, id, field, value) {
  const target = items.find((it) => it.id === id);
  if (!target || target[field] === value) return { items, swappedWith: null };
  if (field === 'character') {
    const c = CHARACTERS.find((x) => x.id === value);
    // 캐릭터는 같은 성별 안에서만 고릅니다(목록도 그 성별만 보여 줌).
    if (!c || c.gender !== target.gender) return { items, swappedWith: null };
  }
  const holder = items.find((it) => it.id !== id && it[field] === value);
  const next = items.map((it) => {
    if (it.id === id) return { ...it, [field]: value };
    if (holder && it.id === holder.id) return { ...it, [field]: target[field] };
    return it;
  });
  return { items: next, swappedWith: holder ? holder.number : null };
}

/** 여러 줄 붙여넣기 → 줄마다 한 항목(빈 줄 무시). 한도를 넘친 이름은 버리고 알려 줍니다.
 * @param {Item[]} items @param {string} type @param {string} text @param {number} max @param {number} nameMax
 * @returns {{items:Item[], dropped:string[]}} */
export function pasteNames(items, type, text, max, nameMax) {
  const names = text.split(/\r?\n|\t/).map((s) => Array.from(s.trim()).slice(0, nameMax).join('')).filter(Boolean);
  // 붙여넣은 자리의 빈 줄은 새 이름으로 채워지므로 먼저 치웁니다(빈 줄이 앞에 남아 기호가 밀리지 않게).
  let out = items.filter((it) => it.name.trim() !== '');
  /** @type {string[]} */ const dropped = [];
  for (const name of names) {
    if (out.length >= max) dropped.push(name);
    else out = addItem(out, type, name);
  }
  return { items: renumber(out), dropped };
}
