// 빠른 시작 틀 7개(PRD 4절 표). 틀은 방식·규칙·개표만 채우고, 후보 이름은 비워 둡니다.
// 인원·안내는 틀에서 정하지 않고 지난번 값(prefs)을 따릅니다.
import { defaultConfig } from './model.js';

/** @typedef {{id:string, title:string, hint:string, type:'candidate'|'opinion'|'yesno', placeholder:string,
 *   rules:Partial<import('./model.js').Rules>, reveal:{mode:import('./model.js').Mode, visibility:string}, agendas?:number}} Template */

/** @type {Template[]} */
const LIST = [
  { id: 'president', title: '학급 회장 선거', hint: '1표 · 당선 1명 · 한 장씩 펼치기', type: 'candidate', placeholder: '우리 반 2학기 회장 선거', rules: { votesPerVoter: 1, seats: 1, allowAbstain: true }, reveal: { mode: 'paper', visibility: 'all' } },
  { id: 'vice', title: '부회장 2명 뽑기', hint: '2표 · 당선 2명 · 개표 방송', type: 'candidate', placeholder: '우리 반 부회장 선거', rules: { votesPerVoter: 2, allowRepeat: false, seats: 2, allowAbstain: true }, reveal: { mode: 'broadcast', visibility: 'all' } },
  { id: 'praise', title: '이달의 칭찬 친구', hint: '1표 · 당선자만 발표', type: 'candidate', placeholder: '이달의 칭찬 친구', rules: { votesPerVoter: 1, seats: 1, allowAbstain: true }, reveal: { mode: 'reverse', visibility: 'winner' } },
  { id: 'naming', title: '모둠·학급 이름 정하기', hint: '1표 · 반전 공개', type: 'opinion', placeholder: '우리 반 이름 정하기', rules: { votesPerVoter: 1, seats: 1, allowAbstain: true }, reveal: { mode: 'reverse', visibility: 'all' } },
  { id: 'trip', title: '체험학습 장소', hint: '3표 몰아주기 · 레이스', type: 'opinion', placeholder: '체험학습 장소 정하기', rules: { votesPerVoter: 3, allowRepeat: true, seats: 1, allowAbstain: true }, reveal: { mode: 'race', visibility: 'all' } },
  { id: 'rule', title: '학급 규칙 찬반', hint: '안건 1개 · 찬성>반대', type: 'yesno', placeholder: '학급 규칙 정하기', rules: { passRule: 'yesOverNo', allowAbstain: true }, reveal: { mode: 'paper', visibility: 'all' }, agendas: 1 },
  { id: 'meeting', title: '학급회의 안건', hint: '안건 3개 · 참여자 과반', type: 'yesno', placeholder: '학급회의', rules: { passRule: 'majority', allowAbstain: true }, reveal: { mode: 'broadcast', visibility: 'all' }, agendas: 3 },
];
/** @type {readonly Readonly<Template>[]} */
export const TEMPLATES = Object.freeze(LIST.map((t) => Object.freeze(t)));

/**
 * 틀 → 만들기 설정. 제목은 비워 두고(예시는 placeholder로 흐리게) 이름·안건 칸만 준비합니다.
 * @param {string} id @param {{voters:number}} last 지난번 값 @param {(type:string)=>import('./model.js').Item[]} emptyItems
 * @param {()=>string} agendaId @returns {import('./model.js').Config|null}
 */
export function configFromTemplate(id, last, emptyItems, agendaId) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  const c = defaultConfig(t.type);
  c.rules = { ...c.rules, ...t.rules, voters: last.voters };
  c.reveal = { ...t.reveal };
  if (t.type === 'yesno') c.agendas = Array.from({ length: t.agendas ?? 1 }, () => ({ id: agendaId(), text: '' }));
  else c.items = emptyItems(t.type);
  return c;
}

/** 방식별 제목 예시(틀 없이 만들 때). @param {string} type */
export const titlePlaceholder = (type) =>
  type === 'yesno' ? '예: 쉬는 시간 공놀이 규칙' : type === 'opinion' ? '예: 체험학습 장소 정하기' : '예: 우리 반 2학기 회장 선거';
