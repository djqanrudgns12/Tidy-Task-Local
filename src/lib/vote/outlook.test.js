import test from 'node:test';
import assert from 'node:assert/strict';
import { itemOutlook, agendaOutlook, cardOutlook, countingOutlook, lockedSelection, selectionChallenge } from './outlook.js';
import { decide, rankRows, countAgenda, passes } from './tally.js';
import { availableModes, VISIBILITIES, MODES } from './model.js';
import { createCheckEntry, CHECK_DEFAULTS } from './devCheck.js';
import { ballotsShown, reverseGroups, stepCount } from './reveal.js';

const config = (rules = {}, type = 'candidate') => ({ type, rules: { seats: 1, votesPerVoter: 1, allowRepeat: false, ...rules } });
const state = (options = {}) => {
  const e = createCheckEntry({ ...CHECK_DEFAULTS, ...options }, 'outlook-tests');
  return { ...e.config, ballots: e.ballots, phase: 'counting', counting: { cursor: 0, agenda: 0, revealed: [], order: e.ballots.map(b => b.id) } };
};

test('초반·0표·전원 기권에는 판세 없음, 동률을 단독 선두로 강조하지 않음', () => {
  assert.deepEqual(itemOutlook(config(), { a: 0, b: 0 }, 0, 24), { byId: {}, leaders: [], outcome: null });
  assert.deepEqual(itemOutlook(config(), { a: 0, b: 0 }, 20, 24).byId, {});
  assert.deepEqual(itemOutlook(config(), { a: 1, b: 0 }, 1, 24).byId, {});
  const tie = itemOutlook(config(), { a: 4, b: 4, c: 0 }, 8, 24);
  assert.deepEqual(tie.leaders, []);
  assert.equal(tie.byId.a.kind, 'close');
  assert.equal(tie.byId.b.kind, 'close');
  assert.equal(tie.byId.c, undefined);
});

test('우세 → 유력 → 확실, 개표 초반에는 큰 격차라도 유력으로 단정하지 않음', () => {
  assert.equal(itemOutlook(config(), { a: 6, b: 2, c: 2 }, 10, 24).byId.a.kind, 'ahead');
  assert.equal(itemOutlook(config(), { a: 11, b: 5, c: 0 }, 16, 24).byId.a.kind, 'likely');
  assert.equal(itemOutlook(config(), { a: 14, b: 4, c: 0 }, 18, 24).byId.a.kind, 'certain');
  assert.equal(itemOutlook(config(), { a: 5, b: 0 }, 5, 8).byId.a.kind, 'certain');
  assert.equal(itemOutlook(config(), { a: 4, b: 0 }, 4, 8).byId.a.kind, 'ahead');
});

test('남은 표와 같은 격차는 동점 가능, 중복 표는 한 장의 최대 표 수로 계산', () => {
  assert.equal(lockedSelection({ a: 12, b: 7 }, 'a', 5, config().rules), false);
  assert.equal(lockedSelection({ a: 12, b: 7 }, 'a', 4, config().rules), true);
  const repeat = config({ votesPerVoter: 3, allowRepeat: true });
  assert.equal(lockedSelection({ a: 12, b: 7 }, 'a', 2, repeat.rules), false);
  assert.equal(lockedSelection({ a: 12, b: 7 }, 'a', 1, repeat.rules), true);
});

test('같은 격차도 남은 장수에 따라 경합·우세·유력·확실로 구분', () => {
  const counts = { a: 12, b: 8, c: 0 };
  assert.equal(itemOutlook(config(), counts, 20, 40).byId.a.kind, 'close');
  assert.equal(itemOutlook(config(), counts, 20, 30).byId.a.kind, 'ahead');
  assert.equal(itemOutlook(config(), counts, 20, 25).byId.a.kind, 'likely');
  assert.equal(itemOutlook(config(), counts, 20, 23).byId.a.kind, 'certain');
  assert.match(itemOutlook(config(), counts, 20, 25).byId.a.detail, /남은 5장 중 최소 4장/);
});

test('마지막 한 장으로 동점·역전 가능하면 유력으로 과장하지 않음', () => {
  assert.equal(itemOutlook(config(), { a: 12, b: 11 }, 23, 24).byId.a.kind, 'close');
  const repeat = config({ votesPerVoter: 5, allowRepeat: true });
  assert.equal(itemOutlook(repeat, { a: 42, b: 38 }, 16, 17).byId.a.kind, 'close');
  assert.equal(agendaOutlook('majority', { yes: 12, no: 11, abstain: 0, participants: 23 }, 23, 24).outcome, null);
});

test('복수 선출을 뒤집는 데 필요한 최소 장수는 후보별 용량과 총 표 예산 중 큰 값', () => {
  assert.deepEqual(selectionChallenge({ a: 8, b: 5, c: 5 }, 'a', 8, config({ seats: 2 }).rules), { certain: false, required: 6 });
  assert.deepEqual(selectionChallenge({ a: 8, b: 5, c: 5 }, 'a', 8, config({ seats: 2, votesPerVoter: 2 }).rules), { certain: false, required: 3 });
  assert.deepEqual(selectionChallenge({ a: 8, b: 5, c: 5 }, 'a', 8, config({ seats: 2, votesPerVoter: 3, allowRepeat: true }).rules), { certain: false, required: 2 });
});

test('여러 명 선출은 마지막 자리 경합, 남은 표의 총 예산도 반영', () => {
  const multiple = config({ seats: 2 });
  const x = itemOutlook(multiple, { a: 12, b: 6, c: 6 }, 24, 28);
  assert.equal(x.byId.a.kind, 'certain');
  assert.equal(x.byId.b.kind, 'close');
  assert.equal(x.byId.c.kind, 'close');
  // Both challengers need 3 votes, but only 4 votes remain in total.
  assert.equal(lockedSelection({ a: 8, b: 5, c: 5 }, 'a', 4, multiple.rules), true);
  assert.equal(lockedSelection({ a: 8, b: 5, c: 5 }, 'a', 4, config({ seats: 2, votesPerVoter: 2 }).rules), false);
});

test('완료 시 당선 경계 동점·0표는 확실 표시 없음; 의견은 선정 확실', () => {
  const x = itemOutlook(config({ seats: 2 }), { a: 9, b: 6, c: 6, d: 0 }, 21, 21);
  assert.equal(x.byId.a.label, '당선 확실');
  assert.equal(x.byId.b, undefined);
  assert.equal(x.byId.c, undefined);
  assert.equal(x.byId.d, undefined);
  assert.equal(itemOutlook(config({}, 'opinion'), { a: 9, b: 1 }, 10, 10).byId.a.label, '선정 확실');
});

test('찬반 득표 우세와 통과 기준은 별개; 기권 포함·등호 경계·판정 없음', () => {
  const t = { yes: 8, no: 2, abstain: 8, participants: 18 };
  assert.equal(agendaOutlook('majority', t, 18, 20).byId.y.label, '우세');
  assert.equal(agendaOutlook('majority', t, 18, 20).outcome?.label, '부결 확실');
  assert.equal(agendaOutlook('yesOverNo', t, 18, 20).outcome?.label, '통과 확실');
  assert.equal(agendaOutlook('none', t, 18, 20).outcome, null);
  assert.equal(agendaOutlook('twoThirds', { yes: 4, no: 0, abstain: 0, participants: 4 }, 4, 6).outcome?.label, '통과 확실');
  assert.equal(agendaOutlook('majority', { yes: 3, no: 3, abstain: 0, participants: 6 }, 6, 6).outcome?.label, '부결 확실');
  assert.equal(agendaOutlook('none', { yes: 0, no: 0, abstain: 8, participants: 8 }, 8, 10).outcome, null);
  assert.deepEqual(agendaOutlook('none', { yes: 4, no: 4, abstain: 0, participants: 8 }, 8, 12).leaders, []);
});

test('찬반 유력은 통과 기준 방향과 최대 변동 폭을 따르며 확률을 주장하지 않음', () => {
  const pass = agendaOutlook('majority', { yes: 11, no: 5, abstain: 0, participants: 16 }, 16, 24);
  assert.equal(pass.outcome?.label, '통과 유력');
  const fail = agendaOutlook('majority', { yes: 5, no: 5, abstain: 6, participants: 16 }, 16, 24);
  assert.equal(fail.outcome?.label, '부결 유력');
  const near = agendaOutlook('twoThirds', { yes: 11, no: 5, abstain: 0, participants: 16 }, 16, 24);
  assert.equal(near.outcome, null);
});

test('골라 공개는 숨은 후보가 전부 앞서도 선출될 때만 확실, 유력 추정 금지', () => {
  assert.deepEqual(cardOutlook('candidate', 1, 3, [{ id: 'a', count: 10 }], 'all').byId, {});
  const x = cardOutlook('candidate', 2, 3, [{ id: 'a', count: 10 }, { id: 'b', count: 2 }], 'all');
  assert.equal(x.byId.a.kind, 'certain');
  assert.deepEqual(x.leaders, []);
  assert.equal(x.byId.b, undefined);
  assert.deepEqual(cardOutlook('candidate', 1, 3, [{ id: 'a', count: 0 }, { id: 'b', count: 0 }], 'all').byId, {});
});

test('순위만 공개: 표 차이 추측 없음, 공개 순위로 입증할 수 있는 선출만 표시', () => {
  assert.deepEqual(cardOutlook('candidate', 1, 3, [{ id: 'a', rank: 1 }], 'rank').byId, {});
  const known = [{ id: 'a', rank: 1 }, { id: 'b', rank: 2 }];
  assert.equal(cardOutlook('candidate', 1, 3, known, 'rank').byId.a.kind, 'certain');
  assert.deepEqual(cardOutlook('candidate', 1, 3, [{ id: 'a', rank: 1 }, { id: 'b', rank: 1 }, { id: 'c', rank: 1 }], 'rank').byId, {});
});

test('카드 공개의 확실 표시는 모든 득표·공개 조합에서 최종 선출과 일치', () => {
  const items = Array.from({ length: 4 }, (_, i) => ({ id: `i${i}`, number: i + 1, name: `후보${i}`, gender: null, character: null, color: null, pattern: null, intro: '' }));
  for (let encoded = 0; encoded < 256; encoded++) {
    const counts = Object.fromEntries(items.map((it, i) => [it.id, (encoded >> (2 * i)) & 3]));
    const rows = rankRows(items, counts);
    for (let seats = 1; seats <= 3; seats++) for (let mask = 0; mask < 16; mask++) for (const visibility of ['all', 'rank']) {
      const visible = rows.filter(row => mask & (1 << (row.item.number - 1))).map(row => visibility === 'rank' ? { id: row.item.id, rank: row.rank } : { id: row.item.id, count: row.count });
      const r = cardOutlook('candidate', seats, 4, visible, visibility);
      const winners = decide(rows, seats).winners;
      for (const [id, status] of Object.entries(r.byId)) if (status.kind === 'certain') assert.ok(winners.includes(id), JSON.stringify({ counts, seats, mask, visibility, id }));
    }
  }
});

test('전체 허용 모드·공개 범위·투표 방식에서 시작/중간/완료가 안전함', () => {
  for (const type of /** @type {const} */ (['candidate', 'opinion', 'yesno'])) {
    for (const visibility of VISIBILITIES[type]) for (const mode of availableModes(type, visibility)) {
      for (const scenario of ['random', 'tie', 'abstain', 'landslide']) {
        const s = state({ type, visibility, mode, scenario, seats: 2, count: 5 });
        const steps = stepCount(s);
        for (const cursor of [0, Math.floor(steps / 2), steps]) {
          const revealed = s.items.slice(0, cursor).map(it => it.id);
          const r = countingOutlook(s, { cursor, agenda: 0, revealed });
          assert.ok(r.leaders.length <= 1);
          if (mode === 'instant' || ['winner', 'result'].includes(visibility)) assert.deepEqual(r, { byId: {}, leaders: [], outcome: null });
          for (const [id, status] of Object.entries(r.byId)) {
            assert.ok(['close', 'ahead', 'likely', 'certain'].includes(status.kind));
            assert.ok(!['abstain', 'a'].includes(id));
            if (['pick', 'reverse'].includes(mode)) {
              const open = mode === 'pick' ? revealed : reverseGroups(s).slice(0, cursor).flatMap(g => g.ids);
              assert.ok(open.includes(id));
              assert.notEqual(status.kind, 'likely');
            }
          }
        }
      }
    }
  }
});

test('같은 공개 표라면 미공개 표의 내용·등록 인원이 달라도 판정은 같음', () => {
  for (const mode of ['paper', 'race', 'broadcast']) {
    const s = state({ mode, voters: 24, count: 4 });
    const cursor = mode === 'broadcast' ? 3 : 9;
    const shown = ballotsShown(s, cursor);
    const changed = { ...s, rules: { ...s.rules, voters: 60 }, ballots: s.ballots.map((b, i) => i < shown ? b : { ...b, p: [s.items[0].id], a: 0 }) };
    assert.deepEqual(countingOutlook(s, { cursor }), countingOutlook(changed, { cursor }));
  }
  // Illegal/stale disclosure combinations must fail closed as well.
  const s = state();
  for (const mode of MODES) assert.deepEqual(countingOutlook({ ...s, reveal: { mode, visibility: 'winner' } }, { cursor: 8 }).byId, {});
});

test('찬반 안건 전환은 새 안건 집계만 사용', () => {
  const s = state({ type: 'yesno', count: 2, mode: 'paper' });
  s.ballots = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, p: ['y', 'n'], a: 0 }));
  s.counting.order = s.ballots.map(b => b.id);
  assert.equal(countingOutlook(s, { cursor: 8, agenda: 0 }).outcome?.label, '통과 확실');
  assert.deepEqual(countingOutlook(s, { cursor: 0, agenda: 1 }), { byId: {}, leaders: [], outcome: null });
  assert.equal(countingOutlook(s, { cursor: 8, agenda: 1 }).outcome?.label, '부결 확실');
});

test('확실 판정은 모든 가능한 잔여 투표를 대입해도 취소되지 않음 (복수 선출·몰아주기 포함)', () => {
  const ids = /** @type {const} */ (['a', 'b', 'c']);
  const items = ids.map((id, i) => ({ id, number: i + 1, name: id, gender: null, character: null, color: null, pattern: null, intro: '' }));
  for (const allowRepeat of [false, true]) for (const votesPerVoter of [1, 2, 3]) for (const seats of [1, 2]) {
    const rules = { allowRepeat, votesPerVoter, seats };
    const additions = [];
    for (let a = 0; a <= votesPerVoter; a++) for (let b = 0; b <= votesPerVoter - a; b++) for (let c = 0; c <= votesPerVoter - a - b; c++) {
      if (allowRepeat || Math.max(a, b, c) <= 1) additions.push({ a, b, c });
    }
    for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) for (let c = 0; c <= 4; c++) {
      const counts = { a, b, c };
      const sure = ids.filter(id => lockedSelection(counts, id, 2, rules));
      if (!sure.length) continue;
      for (const one of additions) for (const two of additions) {
        const final = Object.fromEntries(ids.map(id => [id, counts[id] + one[id] + two[id]]));
        const winners = decide(rankRows(items, final), seats).winners;
        for (const id of sure) assert.ok(winners.includes(id), JSON.stringify({ rules, counts, one, two, id }));
      }
    }
  }
});

test('찬반 확실 판정은 모든 잔여 찬성·반대·기권 조합에서도 유지', () => {
  for (const rule of ['yesOverNo', 'majority', 'twoThirds']) for (let yes = 0; yes <= 5; yes++) for (let no = 0; no <= 5; no++) for (let abstain = 0; abstain <= 3; abstain++) {
    const t = { yes, no, abstain, participants: yes + no + abstain };
    const r = agendaOutlook(rule, t, t.participants, t.participants + 2);
    if (r.outcome?.kind !== 'certain') continue;
    for (const one of ['y', 'n', 'a']) for (const two of ['y', 'n', 'a']) {
      const extra = countAgenda([{ id: 'one', p: [one], a: 0 }, { id: 'two', p: [two], a: 0 }], 0);
      const final = { yes: yes + extra.yes, no: no + extra.no, participants: t.participants + 2 };
      assert.equal(passes(rule, final), r.outcome?.label === '통과 확실');
    }
  }
});
