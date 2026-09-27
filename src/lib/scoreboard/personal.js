/** 개인 점수판: 학급 명단 → 카드(PRD 7절). 점수는 학생 ID로만 연결하고 이름은 매번 명단에서 읽습니다. */
import { PALETTE_IDS } from './model.js';

/** @typedef {{id:string,number:number,name:string,gender?:string,groupId:string|null}} Student */
/** @typedef {{id:string,name:string,students:Student[],groups:{id:string,name:string}[]}} Classroom */
/** @typedef {{id:string,number:number,name:string,showNumber:boolean,groupId:string|null,groupName:string,color:string|null,score:number}} PersonalCard */

/**
 * @param {Classroom|null} classroom
 * @param {Record<string, number>} scores
 * @param {{showNumber:boolean, groupColors:boolean}} prefs
 * @returns {PersonalCard[]}
 */
export function cardsFor(classroom, scores, prefs) {
  if (!classroom) return [];
  const counts = new Map();
  for (const s of classroom.students) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  const groups = new Map(classroom.groups.map((g, i) => [g.id, { name: g.name, index: i }]));
  return [...classroom.students]
    .sort((a, b) => a.number - b.number)
    .map((s) => {
      const group = s.groupId ? groups.get(s.groupId) : undefined;
      return {
        id: s.id,
        number: s.number,
        name: s.name,
        // 번호를 꺼도 동명이인은 번호로 구분합니다.
        showNumber: prefs.showNumber || counts.get(s.name) > 1,
        groupId: group ? /** @type {string} */ (s.groupId) : null,
        groupName: group?.name ?? '',
        color: group && prefs.groupColors ? PALETTE_IDS[group.index % PALETTE_IDS.length] : null,
        score: scores[s.id] ?? 0,
      };
    });
}

/** 모둠끼리 모아 보기: 명단의 모둠 순서대로 묶고, 모둠이 없는 학생은 끝에.
 * @param {PersonalCard[]} cards @param {{id:string,name:string}[]} groups */
export function clusters(cards, groups) {
  const out = groups
    .map((g) => ({ id: g.id, name: g.name, cards: cards.filter((c) => c.groupId === g.id) }))
    .filter((c) => c.cards.length);
  const loose = cards.filter((c) => !c.groupId);
  if (loose.length) out.push({ id: '', name: '모둠 없음', cards: loose });
  return out;
}
