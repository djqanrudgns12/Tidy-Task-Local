import { numbers } from './geometry.js';
import { ruleSatisfied } from './solver.js';

/**
 * 자리 재배치 전에 "먼저 앉힐 자리(사전 지정·자리 유지)"와 선생님이 추가한 조건이 서로 맞는지 미리 따져 봅니다.
 * 왜: 사전 지정은 재배치 때 반드시 지켜지는 조건이라, 다른 조건과 부딪히면 재배치가 "배치가 없어요"로만 끝났습니다.
 * 부딪히는 곳을 조건 옆에 바로 알려 주면 선생님이 무엇을 고칠지 곧바로 알 수 있습니다.
 *
 * 상태(status) 규칙 — 한 조건에 여러 판정이 겹치면 앞쪽이 우선합니다.
 * - duplicate : 똑같은 조건이 앞에 이미 있습니다. 부딪힘보다 앞섭니다 — 뒤의 사본은 지우면 끝이고, 부딪힘은 앞의 원본에 표시됩니다.
 * - conflict  : 이대로는 재배치가 불가능합니다(지정 자리와 어긋남, 조건끼리 모순).
 * - covered   : 관련 학생이 모두 지정 자리에 앉아 이미 지켜집니다.
 * - anchored  : 한 학생이 지정 자리에 앉고, 다른 학생이 그 자리를 기준으로 자리를 찾습니다.
 * - free      : 지정 자리와 상관없이 재배치 때 찾습니다.
 */

const PAIR_WORDS = { pair: '짝', group: '같은 모둠' };

/** 이름 끝 글자의 받침을 보고 조사를 고릅니다(예: 김하늘이 / 이서아가). 한글이 아니면 받침 없는 쪽을 씁니다.
 * @param {string} word @param {string} withFinal @param {string} withoutFinal */
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const final = code >= 0 && code <= 11171 ? code % 28 : 0;
  // '로'는 ㄹ 받침 뒤에서도 '로'를 씁니다(예: 교실로).
  if (withoutFinal === '로' && final === 8) return word + withoutFinal;
  return word + (final ? withFinal : withoutFinal);
}

/** 배치도 가장자리 숫자(세로·가로)와 같은 번호로 자리를 부릅니다. @param {import('./types').Layout} layout */
export function seatLabeler(layout) {
  const grid = numbers(layout.seats);
  /** @param {string} seatId */
  return seatId => {
    const seat = layout.seats.find(s => s.id === seatId);
    if (!seat) return '없는 자리';
    const at = grid.at(seat);
    return `${at.y}줄 ${at.x}번째`;
  };
}

/**
 * 학생별로 먼저 앉을 자리를 모읍니다. 재배치 엔진처럼 자리 유지(fixed)가 사전 지정(zone)보다 앞섭니다.
 * @param {import('./types').Draft} draft
 */
function pinsOf(draft) {
  /** @type {Map<string,{seatIds:string[],source:'fixed'|'preset'}>} */
  const pins = new Map();
  for (const r of draft.rules) if (r.kind === 'fixed' && r.seatId && !pins.has(r.students[0])) pins.set(r.students[0], { seatIds: [r.seatId], source: 'fixed' });
  for (const r of draft.rules) if (r.kind === 'zone' && r.seatIds?.length && !pins.has(r.students[0])) pins.set(r.students[0], { seatIds: [...r.seatIds], source: 'preset' });
  return pins;
}

/** @param {import('./types').Rule} a @param {import('./types').Rule} b */
const sameStudents = (a, b) => a.students.length === b.students.length && a.students.every(id => b.students.includes(id));

/**
 * 두 학생 조건끼리 동시에 지킬 수 없는 짝을 찾습니다.
 * 짝으로 함께 앉으면 가까이 앉게 되므로 어떤 "떨어져 앉기"와도 함께 지킬 수 없고, 같은 모둠끼리도 마찬가지입니다.
 * @param {import('./types').Rule} together @param {import('./types').Rule} apart
 */
function contradicts(together, apart) {
  if (together.distance === 'group') return apart.distance === 'group';
  return true;
}

/**
 * @param {import('./types').Draft} draft
 * @param {import('./types').Student[]} students
 */
export function checkRules(draft, students) {
  const people = new Map(students.map(p => [p.id, p]));
  const name = (/** @type {string} */ id) => people.get(id)?.name || '삭제된 학생';
  const label = seatLabeler(draft.layout);
  const seats = draft.layout.seats.filter(s => s.active !== false);
  const pins = pinsOf(draft);
  const pinnedBy = new Map();
  for (const [studentId, pin] of pins) if (pin.seatIds.length === 1) pinnedBy.set(pin.seatIds[0], studentId);
  const sourceWord = (/** @type {string} */ id) => pins.get(id)?.source === 'fixed' ? '자리 유지' : '사전 지정';
  /** "사전 지정 자리(2줄 3번째)"처럼 부르고, 조사는 괄호 앞 낱말(자리/구역)에 맞춥니다. @param {string} id @param {[string,string]} [particle] */
  const seatWord = (id, particle) => {
    const pin = pins.get(id), single = pin?.seatIds.length === 1;
    const base = single ? '자리' : '구역', after = particle ? josa(base, ...particle).slice(base.length) : '';
    return single ? `${sourceWord(id)} 자리(${label(pin.seatIds[0])})${after}` : `${sourceWord(id)} 구역${after}`;
  };
  const who = (/** @type {string} */ id, /** @type {string} */ withFinal, /** @type {string} */ withoutFinal) => josa(name(id), withFinal, withoutFinal);

  /** 한 학생이 앉을 수 있는 자리: 지정이 있으면 그 자리들, 없으면 다른 학생이 맡지 않은 빈자리. @param {string} studentId */
  const domain = studentId => {
    const pin = pins.get(studentId);
    if (pin) return seats.filter(s => pin.seatIds.includes(s.id));
    return seats.filter(s => !pinnedBy.has(s.id) || pinnedBy.get(s.id) === studentId);
  };

  /** @type {Map<string,{status:string,message:string,studentId:string,source:string}>} */
  const results = new Map();
  const custom = draft.rules.filter(r => r.kind !== 'zone' && r.kind !== 'fixed');
  /** @param {import('./types').Rule} rule @param {string} status @param {string} message @param {string} [studentId] */
  const put = (rule, status, message, studentId = '') => {
    const order = ['duplicate', 'conflict', 'covered', 'anchored', 'free'];
    const prev = results.get(rule.id);
    if (prev && order.indexOf(prev.status) <= order.indexOf(status)) return;
    results.set(rule.id, { status, message, studentId, source: studentId ? pins.get(studentId)?.source || '' : '' });
  };

  // 1) 조건끼리의 모순과 중복
  custom.forEach((rule, i) => {
    for (const other of custom.slice(0, i)) {
      if (!sameStudents(rule, other)) continue;
      if (other.kind === rule.kind && (other.distance || '') === (rule.distance || '')) { put(rule, 'duplicate', '같은 조건이 이미 있어요.'); continue; }
      const pair = [rule, other];
      const front = pair.find(r => r.kind === 'front'), back = pair.find(r => r.kind === 'back');
      const together = pair.find(r => r.kind === 'together'), apart = pair.find(r => r.kind === 'apart');
      if (front && back) for (const r of pair) put(r, 'conflict', '앞쪽·뒤쪽 조건이 함께 걸려 있어요. 하나만 남겨 주세요.');
      if (together && apart && contradicts(together, apart)) for (const r of pair) put(r, 'conflict', '함께 앉기와 떨어져 앉기가 서로 부딪혀요. 하나만 남겨 주세요.');
    }
  });

  // 2) 지정 자리와의 관계
  for (const rule of custom) {
    const [first, second] = rule.students;
    const involved = rule.students.filter(id => pins.has(id));
    if (!involved.length) { put(rule, 'free', ''); continue; }
    if (rule.students.length === 1) {
      const options = domain(first), ok = options.filter(s => ruleSatisfied(rule, { [s.id]: first }, draft.layout));
      const where = rule.kind === 'front' ? '뒤쪽' : '앞쪽';
      if (!ok.length) put(rule, 'conflict', `${seatWord(first, ['이', '가'])} ${where}이라 지킬 수 없어요.`, first);
      else if (ok.length === options.length) put(rule, 'covered', `${seatWord(first, ['으로', '로'])} 이미 지켜져요.`, first);
      else put(rule, 'anchored', `${sourceWord(first)} 구역 안에서 맞는 자리를 골라요.`, first);
      continue;
    }
    const a = domain(first), b = domain(second);
    let total = 0, satisfied = 0;
    for (const sa of a) for (const sb of b) {
      if (sa.id === sb.id) continue;
      total++;
      if (ruleSatisfied(rule, { [sa.id]: first, [sb.id]: second }, draft.layout)) satisfied++;
    }
    const both = involved.length === 2, anchor = both ? first : involved[0], other = anchor === first ? second : first;
    const relation = rule.kind === 'together' ? PAIR_WORDS[/** @type {'pair'|'group'} */ (rule.distance === 'group' ? 'group' : 'pair')] : '';
    if (!satisfied) {
      const message = both
        ? rule.kind === 'together' ? `두 학생의 지정 자리가 ${relation} 자리가 아니에요.` : '두 학생의 지정 자리가 너무 가까워요.'
        : rule.kind === 'together' ? `${name(anchor)}의 ${seatWord(anchor)} 곁에 ${relation}으로 앉을 빈자리가 없어요.` : `${name(anchor)}의 ${seatWord(anchor)}에서 떨어진 빈자리가 없어요.`;
      put(rule, 'conflict', message, anchor);
    } else if (both && satisfied === total) put(rule, 'covered', '두 학생의 지정 자리로 이미 지켜져요.', anchor);
    else if (both) put(rule, 'anchored', '지정 구역 안에서 맞는 자리를 골라요.', anchor);
    else put(rule, 'anchored', rule.kind === 'together'
      ? `${who(other, '은', '는')} ${name(anchor)}의 ${seatWord(anchor)} 곁에 ${relation}으로 앉아요.`
      : `${who(other, '은', '는')} ${name(anchor)}의 ${seatWord(anchor, ['을', '를'])} 피해 앉아요.`, anchor);
  }

  // 3) 지정 자리 자체의 문제: 한 학생에게 두 지정이 겹치거나, 지정 자리를 다른 학생이 자리 유지로 차지한 경우
  const fixedSeats = new Map(draft.rules.filter(r => r.kind === 'fixed' && r.seatId).map(r => [r.seatId, r.students[0]]));
  const fixedPeople = new Set(fixedSeats.values());
  const pinList = [...pins].map(([studentId, pin]) => {
    let issue = '';
    if (pin.source === 'preset') {
      const taken = pin.seatIds.map(id => fixedSeats.get(id)).find(id => id && id !== studentId);
      if (taken) issue = `${who(taken, '이', '가')} 자리 유지로 앉아 있는 자리예요.`;
    }
    return { studentId, number: people.get(studentId)?.number ?? 0, name: name(studentId), seatId: pin.seatIds[0], label: pin.seatIds.length === 1 ? label(pin.seatIds[0]) : `${pin.seatIds.length}곳 중`, source: pin.source, issue };
  });
  for (const r of draft.rules) if (r.kind === 'zone' && fixedPeople.has(r.students[0])) {
    const fixedSeat = draft.rules.find(f => f.kind === 'fixed' && f.students[0] === r.students[0])?.seatId;
    if (fixedSeat && !(r.seatIds || []).includes(fixedSeat)) {
      const entry = pinList.find(p => p.studentId === r.students[0]);
      if (entry) entry.issue = '자리 유지 중이라 사전 지정 자리와 달라요.';
    }
  }
  pinList.sort((x, y) => (x.source === y.source ? 0 : x.source === 'preset' ? -1 : 1) || x.number - y.number || x.name.localeCompare(y.name, 'ko'));

  const conflictCount = [...results.values()].filter(r => r.status === 'conflict').length + pinList.filter(p => p.issue).length;
  return { rules: results, pins: pinList, conflictCount };
}
