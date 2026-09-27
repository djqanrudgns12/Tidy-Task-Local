// 한 학생의 흐름: 투표판 → 저장 중 → "투표했어요!"(잠깐) → 봉인 → "다음 친구 차례예요"(잠깐) → 다음 친구의 투표판.
// 2026-09-26 사용자 요청: 완료 화면에서 Enter를 눌러 넘기지 않고 저절로 넘어갑니다(학생이 빨리빨리 투표해야 해서).
// 다시 투표하기는 다음 투표판에서 합니다: 백스페이스(고른 표가 없을 때) 또는 오른쪽 위 [다시 투표하기] → 확인 팝업 → 직전 표 취소.
//   취소할 표는 저장소의 lastBallotId(선생님의 [직전 표 취소]와 같은 표)이며, 부르는 쪽이 사건에 undoId로 실어 보냅니다.
//
// 비밀 원칙: 화면은 view()가 돌려주는 값만 씁니다. view()에는 후보 id·번호가 들어가지 않으므로,
//   "어떤 번호를 눌러도 같은 순간의 화면은 같다"를 이 파일의 테스트로 증명할 수 있습니다.
// 부수 효과(저장·소리)는 직접 하지 않고 effects 목록으로 돌려주며, 화면(Booth.svelte)이 실행합니다.
import { boothKey } from './keys.js';
import { randomId, secureRandom } from './random.js';
import { withJosa } from './model.js';

/** "투표했어요!"를 보여 주는 시간. 지나면 저절로 봉인하고 "다음 친구 차례예요"로 넘어갑니다.
 * 용지가 함에 들어가고 함이 꿀꺽하는 장면(약 0.9초)을 다 보고 넘어가도록 조금 넉넉히 둡니다. */
export const DONE_MS = 1300;
/** 봉인 뒤 다음 친구의 투표판이 저절로 열리기까지의 시간. 이 사이에는 숫자키를 받지 않습니다.
 * 왜: 스페이스바·Enter가 없어져, "투표했어요!" + 이 시간이 방금 투표한 친구가 숫자를 연타해도
 *   다음 투표판에 표가 들어가지 않게 막는 유일한 틈입니다. 줄이거나 없애지 마세요. */
export const HANDOFF_MS = 1400;
/** 다시 투표하기 팝업이 뜬 뒤 Enter를 받기 시작하기까지. 백스페이스·Enter를 연달아 막 눌러
 * 팝업을 보지도 않고 표가 취소되지 않게 합니다(마우스 버튼은 일부러 누르는 것이라 바로 받음). */
export const UNDO_ARM_MS = 400;
/** 안내 문구가 떠 있는 시간 */
export const HINT_MS = 2000;
/** 첫 저장 실패 뒤 자동으로 한 번 다시 저장하기까지 */
export const RETRY_MS = 500;

/**
 * @typedef {{type:'candidate'|'opinion'|'yesno', numbers:number[], idByNumber:Record<number,string>, slots:number,
 *   allowRepeat:boolean, allowAbstain:boolean, noun:string, rng:()=>number, makeId:()=>string}} BoothConfig
 * @typedef {{screen:'next'|'open'|'saving'|'done'|'removing'|'error', picks:(number|string)[], prev:(number|string)[],
 *   ballot:{id:string,p:string[],a:number}|null, u:number, doneSeq:number, sealAt:number, openAt:number,
 *   hint:string|null, hintUntil:number, failures:number, held:boolean, asking:string|null, askAt:number}} BoothState
 *   asking: 다시 투표하기 팝업이 취소하려는 표 id(팝업이 없으면 null)
 * @typedef {{type:'save', ballot:{id:string,p:string[],a:number}, u:number, delay?:number}
 *   | {type:'remove', id:string} | {type:'play', cue:string} | {type:'sealed'}} Effect
 */

/** @param {import('./model.js').Session} session @param {Partial<BoothConfig>} [extra] @returns {BoothConfig} */
export function boothConfig(session, extra = {}) {
  const yesno = session.type === 'yesno';
  const numbers = yesno ? [1, 2] : session.items.map((it) => it.number).sort((a, b) => a - b);
  /** @type {Record<number,string>} */ const idByNumber = {};
  if (!yesno) for (const it of session.items) idByNumber[it.number] = it.id;
  return {
    type: session.type,
    numbers,
    idByNumber,
    slots: yesno ? session.agendas.length : session.rules.votesPerVoter,
    allowRepeat: !yesno && session.rules.allowRepeat,
    allowAbstain: session.rules.allowAbstain,
    noun: session.type === 'opinion' ? '항목' : '후보',
    rng: secureRandom,
    makeId: () => randomId('b'),
    ...extra,
  };
}

/** 첫 친구는 기다림 없이 곧바로 투표판에서 시작합니다. @returns {BoothState} */
export function initialBooth() {
  return { screen: 'open', picks: [], prev: [], ballot: null, u: 0, doneSeq: 0, sealAt: 0, openAt: 0, hint: null, hintUntil: 0, failures: 0, held: false, asking: null, askAt: 0 };
}

/** 다음에 저절로 넘어갈 시각(없으면 null). 화면(Booth)이 이 시각에 tick을 보냅니다.
 * 선생님 메뉴·다시 투표하기 팝업이 떠 있는 동안에는 넘어가지 않습니다(닫히면 곧바로 이어서). @param {BoothState} s */
export function dueAt(s) {
  if (s.held || s.asking) return null;
  if (s.screen === 'done') return s.sealAt;
  if (s.screen === 'next') return s.openAt;
  return null;
}

/** 번호 범위 안내(어떤 번호를 눌렀는지는 말하지 않음). @param {BoothConfig} c */
export function rangeHint(c) {
  if (c.type === 'yesno') return `1(찬성) · 2(반대)${c.allowAbstain ? ' · 0(기권)' : ''} 중에서 눌러 주세요`;
  const n = c.numbers;
  const contiguous = n.every((x, i) => x === n[0] + i);
  return contiguous ? `${n[0]}~${n[n.length - 1]}번 중에서 골라 주세요` : `${n.map((x) => `${x}번`).join(', ')} 중에서 골라 주세요`;
}

/** @param {string} id @param {BoothConfig} c */
function hintText(id, c) {
  switch (id) {
    case 'range': return rangeHint(c);
    case 'dup': return `같은 ${withJosa(c.noun, '은/는')} 한 번만 고를 수 있어요`;
    case 'noAbstain': return '이번 투표는 기권이 없어요';
    case 'rejected': return '표를 받지 못했어요 — 한 번 더 눌러 주세요';
    case 'undone': return '방금 표를 취소했어요 — 다시 골라 주세요';
    case 'undoFailed': return '되돌리지 못했어요 — 선생님을 불러 주세요';
    default: return null;
  }
}

/** @param {BoothState} s @param {string} id @param {number} now @returns {BoothState} */
const withHint = (s, id, now) => ({ ...s, hint: id, hintUntil: now + HINT_MS });

/** 고른 표로 저장할 표를 만듭니다(후보·의견은 항목 id, 찬반은 y·n·a). @param {BoothState} s @param {BoothConfig} c @param {number} abstain */
function complete(s, c, abstain) {
  const p = c.type === 'yesno' ? s.picks.map(String) : s.picks.map((n) => c.idByNumber[/** @type {number} */ (n)]);
  const ballot = { id: c.makeId(), p, a: c.type === 'yesno' ? 0 : abstain };
  const u = c.rng();
  /** @type {Effect[]} */ const effects = [{ type: 'save', ballot, u }];
  return { state: { ...s, screen: /** @type {const} */ ('saving'), ballot, u, failures: 0, hint: null, hintUntil: 0 }, effects };
}

/**
 * @param {BoothState} state
 * @param {{type:string, code?:string, repeat?:boolean, undoId?:string|null, now:number}} event
 *   undoId: 지금 취소할 수 있는 직전 표 id(저장소의 lastBallotId). 백스페이스·[다시 투표하기]에만 씁니다.
 * @param {BoothConfig} c
 * @returns {{state:BoothState, effects:Effect[]}}
 */
export function reduce(state, event, c) {
  const now = event.now;
  /** @type {Effect[]} */ const none = [];
  let s = state;
  // 만료된 안내는 어떤 사건에서든 치웁니다.
  if (s.hint && now >= s.hintUntil) s = { ...s, hint: null, hintUntil: 0 };

  switch (event.type) {
    case 'hold': return { state: { ...s, held: true }, effects: none };
    // 막혀 있는 사이 넘어갈 시간이 지났다면 풀리는 순간 넘어갑니다(선생님 메뉴 밑에서 소리가 나지 않게).
    case 'release': return advance({ ...s, held: false }, now);
    case 'tick': return advance(s, now);
    case 'saved': {
      if (s.screen !== 'saving') return { state: s, effects: none };
      return {
        state: { ...s, screen: 'done', doneSeq: s.doneSeq + 1, failures: 0, prev: [], sealAt: now + DONE_MS },
        effects: [{ type: 'play', cue: 'vote.cast' }],
      };
    }
    case 'rejected': {
      // 저장하는 사이 선생님 창에서 마감했거나 인원이 찼습니다. 마지막으로 누른 키 전 상태로 돌아가 다시 누르게 합니다.
      if (s.screen !== 'saving') return { state: s, effects: none };
      return { state: withHint({ ...s, screen: 'open', picks: s.prev, prev: [], ballot: null }, 'rejected', now), effects: none };
    }
    case 'failed': {
      if (s.screen !== 'saving' || !s.ballot) return { state: s, effects: none };
      const failures = s.failures + 1;
      if (failures === 1) return { state: { ...s, failures }, effects: [{ type: 'save', ballot: s.ballot, u: s.u, delay: RETRY_MS }] };
      // 오류 화면은 학생 키를 받지 않으므로 투표를 따로 멈추지 않습니다(선생님이 멈추지 않았는데 멈춤이 되지 않게).
      return { state: { ...s, screen: 'error', failures }, effects: none };
    }
    case 'retry': {
      if (s.screen !== 'error' || !s.ballot) return { state: s, effects: none };
      return { state: { ...s, screen: 'saving' }, effects: [{ type: 'save', ballot: s.ballot, u: s.u }] };
    }
    case 'removed': {
      // 직전 표를 뺐습니다. 새 투표판에서 방금 친구가 처음부터 다시 고릅니다.
      if (s.screen !== 'removing') return { state: s, effects: none };
      return { state: withHint({ ...s, screen: 'open', picks: [], prev: [], ballot: null }, 'undone', now), effects: [{ type: 'play', cue: 'vote.undo' }] };
    }
    case 'removeFailed': {
      // 표는 그대로 남아 있으므로 다음 친구의 투표판으로 갑니다. 봉인 알림(sealed)을 한 번 더 보내
      // 완료 화면에서 되돌리다 실패한 마지막 친구의 표로 인원이 찼다면 마감되게 합니다(여러 번 불려도 해가 없음).
      if (s.screen !== 'removing') return { state: s, effects: none };
      return { state: withHint({ ...s, screen: 'open', picks: [], prev: [], ballot: null }, 'undoFailed', now), effects: [{ type: 'sealed' }] };
    }
    // 팝업의 [아니요](마우스) · 취소하려던 표가 이미 없어짐(선생님 창에서 직전 표 취소 등): 팝업만 닫고 하던 흐름을 잇습니다.
    case 'undoNo':
    case 'undoGone': return s.asking ? advance({ ...s, asking: null, askAt: 0 }, now) : { state: s, effects: none };
    // 팝업의 [다시 투표하기](마우스)
    case 'undoYes': return s.asking && !s.held ? confirmUndo(s) : { state: s, effects: none };
    case 'reset': return { state: { ...initialBooth(), doneSeq: s.doneSeq, held: s.held }, effects: none };
    case 'undo':
    case 'key': break;
    default: return { state: s, effects: none };
  }

  if (event.repeat || s.held) return { state: s, effects: none };
  const undoId = event.undoId ?? null;

  // 다시 투표하기 팝업이 떠 있는 동안: Enter = 다시 투표하기, Esc·백스페이스 = 아니요. 숫자는 받지 않습니다.
  if (s.asking) {
    if (event.type !== 'key') return { state: s, effects: none };
    const key = boothKey(event.code ?? '');
    if (key.kind === 'enter') return now - s.askAt >= UNDO_ARM_MS ? confirmUndo(s) : { state: s, effects: none };
    if (key.kind === 'escape' || key.kind === 'back') return advance({ ...s, asking: null, askAt: 0 }, now);
    return { state: s, effects: none };
  }
  // 오른쪽 위 [다시 투표하기] 버튼(마우스): 어느 화면이든 팝업부터 띄웁니다.
  if (event.type === 'undo') return askUndo(s, undoId, now);

  const key = boothKey(event.code ?? '');
  if (s.screen === 'open') {
    if (key.kind === 'back') {
      // 고르던 표가 있으면 한 칸 지우기(여러 표·찬반 여러 안건), 없으면 직전 친구의 다시 투표하기 팝업.
      if (!s.picks.length) return askUndo(s, undoId, now);
      return { state: { ...s, picks: s.picks.slice(0, -1) }, effects: none };
    }
    if (key.kind !== 'digit' || key.digit === null) return { state: s, effects: none };
    const d = key.digit;
    if (c.type === 'yesno') {
      const answer = d === 1 ? 'y' : d === 2 ? 'n' : d === 0 ? 'a' : null;
      if (!answer) return { state: withHint(s, 'range', now), effects: [{ type: 'play', cue: 'vote.hint' }] };
      if (answer === 'a' && !c.allowAbstain) return { state: withHint(s, 'noAbstain', now), effects: [{ type: 'play', cue: 'vote.hint' }] };
      const next = { ...s, prev: s.picks, picks: [...s.picks, answer] };
      if (next.picks.length >= c.slots) return complete(next, c, 0);
      return { state: next, effects: none };
    }
    if (d === 0) {
      if (!c.allowAbstain) return { state: withHint(s, 'noAbstain', now), effects: [{ type: 'play', cue: 'vote.hint' }] };
      // 0 = 남은 표 모두 기권하고 끝내기(PRD 2절).
      return complete({ ...s, prev: s.picks }, c, c.slots - s.picks.length);
    }
    if (!c.numbers.includes(d)) return { state: withHint(s, 'range', now), effects: [{ type: 'play', cue: 'vote.hint' }] };
    if (!c.allowRepeat && s.picks.includes(d)) return { state: withHint(s, 'dup', now), effects: [{ type: 'play', cue: 'vote.hint' }] };
    const next = { ...s, prev: s.picks, picks: [...s.picks, d] };
    if (next.picks.length >= c.slots) return complete(next, c, 0);
    return { state: next, effects: none };
  }

  // 투표했어요 · 다음 친구 차례: 백스페이스만 받아 다시 투표하기 팝업을 띄웁니다(방금 잘못 누른 걸 바로 알아챈 친구).
  //   숫자·Enter는 받지 않습니다(연타로 두 번째 표가 들어가지 않게). 숫자를 눌러도 안내·소리를 내지 않습니다 —
  //   방금 투표한 친구에게 "다시 누르라"는 신호로 읽힐 수 있어서입니다.
  if ((s.screen === 'done' || s.screen === 'next') && key.kind === 'back') return askUndo(s, undoId, now);
  // saving · removing · error: 학생 키는 받지 않습니다.
  return { state: s, effects: none };
}

/** 넘어갈 시간이 된 화면을 넘깁니다(투표했어요 → 봉인 → 다음 친구 → 새 투표판). 막혔거나 팝업이 떠 있으면 그대로.
 * @param {BoothState} s @param {number} now @returns {{state:BoothState, effects:Effect[]}} */
function advance(s, now) {
  if (s.held || s.asking) return { state: s, effects: [] };
  if (s.screen === 'done' && now >= s.sealAt) return seal(s, now);
  if (s.screen === 'next' && now >= s.openAt) return openBallot(s);
  return { state: s, effects: [] };
}

/** 다시 투표하기 팝업 열기. 취소할 표가 없으면(첫 친구 · 이미 취소함 · 선생님이 뺌) 아무 일도 없습니다.
 * @param {BoothState} s @param {string|null} undoId @param {number} now @returns {{state:BoothState, effects:Effect[]}} */
function askUndo(s, undoId, now) {
  if (!undoId || s.screen === 'saving' || s.screen === 'removing' || s.screen === 'error') return { state: s, effects: [] };
  return { state: { ...s, asking: undoId, askAt: now, hint: null, hintUntil: 0 }, effects: [] };
}

/** 팝업에서 [다시 투표하기]: 직전 표를 빼고, 빠지는 동안 키를 받지 않습니다(removing). 고르던 표는 버립니다.
 * @param {BoothState} s @returns {{state:BoothState, effects:Effect[]}} */
function confirmUndo(s) {
  const id = /** @type {string} */ (s.asking);
  return {
    state: { ...s, screen: /** @type {const} */ ('removing'), asking: null, askAt: 0, picks: [], prev: [], ballot: null, hint: null, hintUntil: 0 },
    effects: [{ type: 'remove', id }],
  };
}

/** 봉인: 잠깐 "다음 친구 차례"를 보인 뒤 투표판을 엽니다. @param {BoothState} s @param {number} now */
function seal(s, now) {
  return {
    state: { ...s, screen: /** @type {const} */ ('next'), picks: [], prev: [], ballot: null, u: 0, sealAt: 0, openAt: now + HANDOFF_MS, hint: null, hintUntil: 0 },
    effects: /** @type {Effect[]} */ ([{ type: 'sealed' }]),
  };
}

/** 다음 친구의 새 투표판. @param {BoothState} s */
function openBallot(s) {
  return {
    state: { ...s, screen: /** @type {const} */ ('open'), picks: [], prev: [], openAt: 0, hint: null, hintUntil: 0 },
    effects: /** @type {Effect[]} */ ([{ type: 'play', cue: 'vote.open' }]),
  };
}

/**
 * 화면이 쓰는 유일한 값. 후보 id·번호·찬반 답은 절대 넣지 않습니다(비밀 원칙).
 * @param {BoothState} s @param {BoothConfig} c @param {number} now
 */
export function view(s, c, now) {
  return {
    screen: s.screen,
    // 표 점은 투표판에서만 보입니다. 완료·저장 화면에 고른 수를 내보내면 "기권으로 끝냈는지"가 드러납니다.
    filled: s.screen === 'open' ? s.picks.length : 0,
    total: c.slots,
    hint: s.screen === 'removing' ? '방금 표를 취소하고 있어요' : s.hint && now < s.hintUntil ? hintText(s.hint, c) : null,
    doneSeq: s.doneSeq,
    // 다시 투표하기 팝업(어떤 표를 취소하는지는 화면에 내보내지 않음)
    asking: !!s.asking,
    held: s.held,
  };
}
