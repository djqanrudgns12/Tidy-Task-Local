// 만들기 검증(PRD 4절 "검증 규칙"). 문구는 PRD 표와 글자까지 같게 둡니다.
import { LIMITS, codeLength, nameLimit, availableModes, itemNoun, withJosa } from './model.js';

/** @typedef {{step:number, field:string, itemId?:string, message:string, warning?:boolean}} Problem */

/**
 * @param {import('./model.js').Config} c
 * @returns {Problem[]} step = 마법사 단계(0 방식 · 1 내용 · 2 규칙 · 3 개표). warning=true는 막지 않는 안내입니다.
 */
export function validateConfig(c) {
  /** @type {Problem[]} */ const out = [];
  const noun = itemNoun(c.type);
  if (!c.title.trim()) out.push({ step: 1, field: 'title', message: '투표 제목을 적어 주세요' });

  if (c.type === 'yesno') {
    if (c.agendas.length < LIMITS.agendasMin) out.push({ step: 1, field: 'agendas', message: '안건을 1개 이상 넣어 주세요' });
    c.agendas.forEach((a, i) => {
      if (!a.text.trim()) out.push({ step: 1, field: 'agenda', itemId: a.id, message: `${i + 1}번 안건을 적어 주세요` });
    });
  } else {
    if (c.items.length < LIMITS.itemsMin) out.push({ step: 1, field: 'items', message: `${withJosa(noun, '을/를')} 2${c.type === 'opinion' ? '개' : '명'} 이상 넣어 주세요` });
    /** @type {Map<string, number>} */ const names = new Map();
    for (const it of c.items) {
      const name = it.name.trim();
      if (!name) out.push({ step: 1, field: 'name', itemId: it.id, message: `${it.number}번 ${noun}의 이름을 적어 주세요` });
      else if (codeLength(name) > nameLimit(c.type)) out.push({ step: 1, field: 'name', itemId: it.id, message: `이름은 ${nameLimit(c.type)}자까지 쓸 수 있어요` });
      if (c.type === 'candidate' && !it.gender) out.push({ step: 1, field: 'gender', itemId: it.id, message: `${it.number}번 후보의 남/녀를 골라 주세요` });
      if (codeLength(it.intro) > LIMITS.introMax) out.push({ step: 1, field: 'intro', itemId: it.id, message: '30자까지 쓸 수 있어요' });
      if (name) {
        if (names.has(name)) out.push({ step: 1, field: 'name', itemId: it.id, warning: true, message: '같은 이름이 있어요 — 한 줄 소개로 구분해 주세요' });
        else names.set(name, it.number);
      }
    }
    const n = c.items.length;
    if (n >= LIMITS.itemsMin) {
      if (!c.rules.allowRepeat && c.rules.votesPerVoter >= n) {
        out.push({ step: 2, field: 'votesPerVoter', message: `${withJosa(noun, '이/가')} ${n}${c.type === 'opinion' ? '개' : '명'}이라 ${n - 1}표까지 고를 수 있어요` });
      }
      if (c.rules.seats >= n) out.push({ step: 2, field: 'seats', message: `${withJosa(noun, '이/가')} ${n}${c.type === 'opinion' ? '개' : '명'}이라 ${n - 1}${c.type === 'opinion' ? '개' : '명'}까지 뽑을 수 있어요` });
    }
  }
  if (c.rules.voters < LIMITS.votersMin || c.rules.voters > LIMITS.votersMax) out.push({ step: 2, field: 'voters', message: '2~60명 사이로 정해 주세요' });
  if (!availableModes(c.type, c.reveal.visibility).includes(c.reveal.mode)) out.push({ step: 3, field: 'mode', message: '이 공개 범위와 함께 쓸 수 없는 개표 방법이에요' });
  return out;
}

/** 막는 문제만. @param {import('./model.js').Config} c */
export const blockingProblems = (c) => validateConfig(c).filter((p) => !p.warning);
