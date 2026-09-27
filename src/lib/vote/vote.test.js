import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeSession, normalizeDraft, normalizePrefs, sessionFromConfig, availableModes, modeBlockedReason, withJosa, EMPTY_SESSION, LIMITS, cleanText, modeName, phaseLabel, dateLabel, MODES, PHASES } from './model.js';
import { PALETTE, PATTERN_IDS } from './palette.js';
import { CHARACTERS } from './characters.js';
import { repairItems, addItem, setGender, chooseValue, moveItem, removeItem, pasteNames, characterOrder } from './assign.js';
import { insertIndex, fisherYates, randomId, seededRandom } from './random.js';
import { digitOf, boothKey } from './keys.js';
import { boothConfig, initialBooth, reduce, view, dueAt, DONE_MS, HANDOFF_MS, UNDO_ARM_MS, rangeHint } from './ballot.js';
import { insertBallot, removeBallot, voidLast, setPaused, setVoters, close, startCounting, setCursor, revealItem, begin, finish, restoreCancelled, restart, restoreRestarted } from './ballots.js';
import { countItems, rankRows, decide, tallyItems, certainWinners, passes, tallyYesNo, certainPass } from './tally.js';
import { broadcastStops, reverseGroups, stepCount, ballotsShown, isComplete, autoDelay, tallyMarks, raceGoal, partialCounts } from './reveal.js';
import { validateConfig, blockingProblems } from './validate.js';
import { TEMPLATES, configFromTemplate } from './templates.js';
import { drawNumbers } from './lottery.js';
import { buildSlides, nativeCount } from './tutorial.js';
import { boothGrid, lineupGrid, LINEUP_ART_MIN, LINEUP_ART_MAX } from './layout.js';
import { archiveSession, normalizeArchive, finalResult, runoffConfig, alreadyArchived, runoffTitle, removeEntry, restoreEntry, updateEntry, RECORD_NOTE_MAX } from './archive.js';
import { resultModel, resultSummary } from './result.js';
import { CUE_IDS, LOUDNESS, TRIM, TAME } from './audio.js';
import { integratedLoudness, truePeak } from './loudness.js';
import { teacherPlacement, boardPlacement, monitorIndexAt } from './placement.js';
import { staggerDelay } from './motion.js';
import { fixture } from './fixtures.js';

// ── 준비물 ──
/** @param {number} n @param {object} [rules] @param {'candidate'|'opinion'} [type] */
function makeSession(n = 5, rules = {}, type = 'candidate') {
  const items = Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, number: i + 1, name: `후보${i + 1}`, gender: i % 2 ? 'f' : 'm', intro: '' }));
  const s = sessionFromConfig(/** @type {any} */ ({ type, title: '회장 선거', items, rules: { voters: 28, ...rules }, reveal: { mode: 'paper', visibility: 'all' } }), 'v_test', '2026-09-24');
  return { ...s, phase: 'voting' };
}
function yesnoSession(k = 3, rules = {}) {
  const s = sessionFromConfig(/** @type {any} */ ({ type: 'yesno', title: '학급회의', agendas: Array.from({ length: k }, (_, i) => ({ id: `a${i + 1}`, text: `안건${i + 1}` })), rules: { voters: 10, ...rules } }), 'v_yn', '2026-09-24');
  return { ...s, phase: 'voting' };
}
const counter = () => { let i = 0; return () => `b_${(i++).toString(36).padStart(6, '0')}`; };
/** @param {any} s @param {any} [extra] */
const cfgOf = (s, extra = {}) => boothConfig(s, { rng: () => 0.5, makeId: counter(), ...extra });
/** 이벤트 여러 개를 차례로. @param {any} c @param {any[]} events */
function run(c, events, start = initialBooth()) {
  let state = start;
  /** @type {any[]} */ const effects = [];
  for (const e of events) {
    const r = reduce(state, e, c);
    state = r.state;
    effects.push(...r.effects);
  }
  return { state, effects };
}
/** @param {string} code @param {number} now */
const key = (code, now, repeat = false) => ({ type: 'key', code, now, repeat });

// ── 색 대비 ──
/** @param {string} hex */
function lum(hex) {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
/** @param {string} a @param {string} b */
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('색표: 글자색은 자기 파스텔과 흰 바탕 모두에서 4.5:1 이상', () => {
  assert.equal(PALETTE.length, 9);
  for (const c of PALETTE) {
    assert.ok(contrast(c.ink, c.bg) >= 4.5, `${c.id} ink/bg ${contrast(c.ink, c.bg).toFixed(2)}`);
    assert.ok(contrast(c.ink, '#FFFFFF') >= 4.5, `${c.id} ink/white ${contrast(c.ink, '#FFFFFF').toFixed(2)}`);
  }
  assert.equal(new Set(PALETTE.map((c) => c.id)).size, 9);
  assert.equal(PATTERN_IDS.length, 9);
});

test('캐릭터: 남 9 · 여 9, id가 모두 다름', () => {
  assert.equal(CHARACTERS.length, 18);
  assert.equal(CHARACTERS.filter((c) => c.gender === 'm').length, 9);
  assert.equal(CHARACTERS.filter((c) => c.gender === 'f').length, 9);
  assert.equal(new Set(CHARACTERS.map((c) => c.id)).size, 18);
});

// ── 배정 ──
test('같은 성별 후보 9명도 캐릭터·색이 겹치지 않음', () => {
  let items = /** @type {any[]} */ ([]);
  for (let i = 0; i < 9; i++) items = addItem(items, 'candidate', `학생${i}`);
  for (const it of items) items = setGender(items, it.id, 'm', 'v_seed');
  assert.equal(new Set(items.map((it) => it.character)).size, 9);
  assert.ok(items.every((it) => it.character?.startsWith('m')));
  assert.equal(new Set(items.map((it) => it.color)).size, 9);
  // 같은 씨앗이면 같은 순서, 다른 씨앗이면 대체로 다른 순서
  assert.deepEqual(characterOrder('f', 'v_a'), characterOrder('f', 'v_a'));
});

test('성별을 바꾸면 옛 캐릭터를 내놓고, 이미 쓰는 캐릭터를 고르면 서로 바꿈', () => {
  let items = addItem(addItem([], 'candidate', '가'), 'candidate', '나');
  items = setGender(items, items[0].id, 'm', 's');
  items = setGender(items, items[1].id, 'm', 's');
  const [a, b] = items;
  const swapped = chooseValue(items, a.id, 'character', /** @type {string} */ (b.character));
  assert.equal(swapped.swappedWith, 2);
  assert.equal(swapped.items[0].character, b.character);
  assert.equal(swapped.items[1].character, a.character);
  // 다른 성별 캐릭터는 고를 수 없음
  assert.equal(chooseValue(items, a.id, 'character', 'f1').items, items);
  const toF = setGender(items, a.id, 'f', 's');
  assert.ok(toF[0].character?.startsWith('f'));
  // 색도 맞바꿈
  const colors = chooseValue(items, a.id, 'color', /** @type {string} */ (b.color));
  assert.equal(colors.items[1].color, a.color);
});

test('저장된 자료의 색·무늬·캐릭터 중복을 바로잡음', () => {
  const broken = /** @type {any[]} */ ([
    { id: 'i1', number: 1, name: 'a', gender: 'm', character: 'm1', color: 'berry', pattern: null, intro: '' },
    { id: 'i2', number: 2, name: 'b', gender: 'm', character: 'm1', color: 'berry', pattern: null, intro: '' },
    { id: 'i3', number: 3, name: 'c', gender: 'f', character: 'm2', color: 'nope', pattern: null, intro: '' },
  ]);
  const fixed = repairItems(broken, 'candidate', 'x');
  assert.equal(fixed[0].character, 'm1');
  assert.notEqual(fixed[1].character, 'm1');
  assert.ok(fixed[2].character?.startsWith('f'));
  assert.equal(new Set(fixed.map((it) => it.color)).size, 3);
  const opinion = repairItems(broken.map((b) => ({ ...b, pattern: 'dots' })), 'opinion', 'x');
  assert.equal(new Set(opinion.map((it) => it.pattern)).size, 3);
  assert.ok(opinion.every((it) => it.character === null && it.gender === null));
});

test('순서 바꾸기·지우기·붙여넣기 뒤 번호를 다시 매기고, 붙여넣기는 9개에서 멈춤', () => {
  let items = addItem(addItem(addItem([], 'opinion', '가'), 'opinion', '나'), 'opinion', '다');
  items = moveItem(items, 2, 0);
  assert.deepEqual(items.map((it) => [it.number, it.name]), [[1, '다'], [2, '가'], [3, '나']]);
  items = removeItem(items, items[0].id);
  assert.deepEqual(items.map((it) => it.number), [1, 2]);
  const pasted = pasteNames([...items, ...addItem([], 'opinion', '')], 'opinion', '라\n마\n\n바\t사\n아\n자\n차\n카\n타', 9, 16);
  assert.equal(pasted.items.length, 9);
  assert.deepEqual(pasted.dropped, ['카', '타']);
  assert.deepEqual(pasted.items.map((it) => it.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

// ── 정규화 ──
test('설정 정규화: 값을 범위 안으로, 공개 범위에 맞는 개표 방법만', () => {
  const c = normalizeConfig({ type: 'candidate', title: '가'.repeat(40) + '\n', rules: { voters: 99, votesPerVoter: 9, seats: 0, undoSeconds: 4 }, reveal: { mode: 'race', visibility: 'rank' } });
  assert.equal(Array.from(c.title).length, 30);
  assert.equal(c.rules.voters, 25);
  assert.equal(c.rules.votesPerVoter, 1);
  assert.equal(c.rules.seats, 1);
  assert.equal('undoSeconds' in c.rules, false);
  assert.equal(c.reveal.mode, 'instant');
  assert.deepEqual(availableModes('candidate', 'winner'), ['instant', 'reverse']);
  assert.deepEqual(availableModes('yesno', 'all'), ['instant', 'paper', 'race', 'broadcast']);
  assert.match(/** @type {string} */ (modeBlockedReason('candidate', 'rank', 'race')), /레이스/);
  assert.equal(modeBlockedReason('candidate', 'all', 'race'), null);
  assert.equal(cleanText('a\u0007b', 5), 'ab');
  // 안건 id가 겹친 파일도 칸마다 다른 id로(화면 목록이 id로 칸을 구분 — 겹치면 그리기가 멈춤)
  const y = normalizeConfig({ type: 'yesno', title: '회의', agendas: [{ id: 'a1', text: '가' }, { id: 'a1', text: '나' }, { id: 'a1', text: '다' }] });
  assert.equal(new Set(y.agendas.map((a) => a.id)).size, 3);
  assert.deepEqual(y.agendas.map((a) => a.text), ['가', '나', '다']);
});

test('투표 정규화: 잘못된 표만 버리고 센 표는 잃지 않음', () => {
  const s = makeSession(3, { votesPerVoter: 2 });
  const raw = { ...s, rules: { ...s.rules, voters: 2 }, ballots: [
    { id: 'b_1', p: ['i1', 'i2'], a: 0 },
    { id: 'b_2', p: ['i1'], a: 1 },
    { id: 'b_3', p: ['i1', 'i1'], a: 0 }, // 중복 불가인데 같은 후보 두 번
    { id: 'b_4', p: ['i9', 'i1'], a: 0 }, // 없는 후보
    { id: 'b_1', p: ['i3', 'i2'], a: 0 }, // 같은 id
    { id: 'b_5', p: ['i3'], a: 0 }, // 칸 수가 모자람
  ] };
  const n = /** @type {any} */ (normalizeSession(raw));
  assert.deepEqual(n.ballots.map((/** @type {{id:string}} */ b) => b.id), ['b_1', 'b_2']);
  assert.equal(n.rules.voters, 2);
  assert.equal(normalizeSession({}), EMPTY_SESSION);
  assert.equal(normalizeSession({ id: null }), EMPTY_SESSION);
  assert.equal(/** @type {any} */ (normalizeSession({ ...s, phase: 'counting', counting: null })).phase, 'closed');
});

test('만들던 투표·환경 설정 정규화', () => {
  assert.equal(normalizeDraft(undefined).config, null);
  assert.equal(normalizeDraft({ config: { type: 'opinion' }, step: 9 }).step, 0);
  assert.deepEqual(normalizePrefs({ volume: 300, lastUndoSeconds: 5 }), { volume: 70, muted: false, speech: true, speechVoice: 'female', reduced: false, lastVoters: 25, music: true });
  // 배경 음악: 예전 파일(값 없음)은 켜짐, 끈 값은 그대로 유지
  assert.equal(normalizePrefs({}).music, true);
  assert.equal(normalizePrefs({ music: false }).music, false);
  assert.equal(normalizePrefs({ music: 'no' }).music, true);
});

test('조사는 받침에 맞춤', () => {
  assert.equal(withJosa('후보', '을/를'), '후보를');
  assert.equal(withJosa('항목', '을/를'), '항목을');
  assert.equal(withJosa('항목', '은/는'), '항목은');
  assert.equal(withJosa('기호 1', '이/가'), '기호 1이');
  assert.equal(withJosa('서울', '으로/로'), '서울로');
});

// ── 무작위 ──
test('표 끼워 넣는 위치는 고르게, 표 id에는 시각이 없음', () => {
  assert.equal(insertIndex(0, 5), 0);
  assert.equal(insertIndex(0.9999, 5), 5);
  assert.equal(insertIndex(NaN, 3), 0);
  const counts = [0, 0, 0, 0];
  const rnd = seededRandom('uniform');
  for (let i = 0; i < 4000; i++) counts[insertIndex(rnd(), 3)]++;
  assert.ok(counts.every((c) => c > 850 && c < 1150), counts.join(','));
  assert.match(randomId('b'), /^b_[0-9a-z]{10}$/);
  assert.deepEqual([...fisherYates([1, 2, 3, 4], seededRandom('x'))].sort(), [1, 2, 3, 4]);
});

test('저장된 표 순서로 마지막 투표자를 알 수 없음', () => {
  // 1000번 모의: 마지막에 넣은 표의 저장 위치가 고르게 퍼져야 합니다.
  const rnd = seededRandom('secrecy');
  const positions = Array(10).fill(0);
  for (let trial = 0; trial < 1000; trial++) {
    let s = /** @type {any} */ (makeSession(3, { voters: 10 }));
    for (let i = 0; i < 10; i++) s = insertBallot({ id: `b_${trial}_${i}`, p: ['i1'], a: 0 }, rnd())(s);
    positions[s.ballots.findIndex((/** @type {{id:string}} */ b) => b.id === `b_${trial}_9`)]++;
  }
  assert.ok(positions.every((c) => c > 50 && c < 150), positions.join(','));
});

// ── 키 ──
test('숫자키는 code로 읽음(NumLock 꺼짐·한글 입력기에서도 동작)', () => {
  assert.equal(digitOf('Digit7'), 7);
  assert.equal(digitOf('Numpad0'), 0);
  assert.equal(digitOf('KeyA'), null);
  assert.equal(boothKey('NumpadEnter').kind, 'enter');
  assert.equal(boothKey('Escape').kind, 'escape');
  assert.equal(boothKey('Space').kind, 'other');
});

// ── 투표 부스 ──
/** 백스페이스(취소할 직전 표 id를 함께 보냄 — Booth가 저장소의 lastBallotId를 실어 보내는 것과 같음). @param {number} now @param {string|null} [undoId] */
const back = (now, undoId = 'b_last') => ({ type: 'key', code: 'Backspace', now, repeat: false, undoId });

test('1인 1표: 숫자 한 번이면 끝 — 투표했어요 → 저절로 다음 친구 → 저절로 새 투표판(Enter 없음)', () => {
  const s = makeSession(5);
  const c = cfgOf(s);
  assert.equal(initialBooth().screen, 'open');
  const r = run(c, [key('Digit3', 1100)]);
  assert.equal(r.state.screen, 'saving');
  assert.deepEqual(r.effects.find((e) => e.type === 'save').ballot.p, ['i3']);
  const saved = run(c, [{ type: 'saved', now: 1130 }], r.state);
  assert.equal(saved.state.screen, 'done');
  assert.deepEqual(saved.effects, [{ type: 'play', cue: 'vote.cast' }]);
  assert.equal(dueAt(saved.state), 1130 + DONE_MS);
  // 투표했어요 화면의 숫자·Space·Enter는 무시(연타로 두 번째 표가 들어가지 않고, Enter로 넘기지도 않음)
  const ignored = run(c, [key('Digit3', 1200), key('Space', 1210), key('Enter', 1220)], saved.state);
  assert.equal(ignored.state.screen, 'done');
  assert.equal(ignored.effects.length, 0);
  // 시간이 되면 저절로 봉인 → 다음 친구
  assert.equal(run(c, [{ type: 'tick', now: 1130 + DONE_MS - 1 }], saved.state).state.screen, 'done');
  const sealed = run(c, [{ type: 'tick', now: 1130 + DONE_MS }], saved.state);
  assert.equal(sealed.state.screen, 'next');
  assert.deepEqual(sealed.effects, [{ type: 'sealed' }]);
  assert.equal(sealed.state.ballot, null);
  assert.equal(dueAt(sealed.state), 1130 + DONE_MS + HANDOFF_MS);
});

test('투표했어요 · 다음 친구 시간에는 숫자를 무시하고, 지나면 투표판이 저절로 열림', () => {
  const s = makeSession(3);
  const c = cfgOf(s);
  const t0 = 20 + DONE_MS;
  const r = run(c, [key('Digit1', 10), { type: 'saved', now: 20 }, { type: 'tick', now: t0 }]);
  assert.equal(r.state.screen, 'next');
  // 방금 투표한 친구가 연타해도 표·안내·소리 없음(취소할 표를 모르면 백스페이스도 아무 일 없음)
  const mash = run(c, [key('Digit1', t0 + 10), key('Numpad2', t0 + 20), key('Space', t0 + 30), key('Enter', t0 + 35), key('Backspace', t0 + 40), key('Digit3', t0 + HANDOFF_MS - 1)], r.state);
  assert.equal(mash.state.screen, 'next');
  assert.equal(mash.effects.length, 0);
  assert.equal(view(mash.state, c, t0 + HANDOFF_MS - 1).hint, null);
  assert.equal(run(c, [{ type: 'tick', now: t0 + HANDOFF_MS - 1 }], r.state).state.screen, 'next');
  const opened = run(c, [{ type: 'tick', now: t0 + HANDOFF_MS }], r.state);
  assert.equal(opened.state.screen, 'open');
  assert.deepEqual(opened.effects, [{ type: 'play', cue: 'vote.open' }]);
  // 열린 뒤에는 곧바로 다음 친구의 표
  assert.equal(run(c, [key('Digit2', t0 + HANDOFF_MS + 5)], opened.state).state.screen, 'saving');
  // 선생님이 막아 둔 사이 시간이 지나면, 풀리는 순간 열림(막힌 동안에는 열지 않음)
  const heldNext = run(c, [{ type: 'hold', now: t0 + 40 }, { type: 'tick', now: t0 + HANDOFF_MS }], r.state);
  assert.equal(heldNext.state.screen, 'next');
  assert.equal(dueAt(heldNext.state), null);
  const freed = run(c, [{ type: 'release', now: 5000 }], heldNext.state);
  assert.equal(freed.state.screen, 'open');
  assert.deepEqual(freed.effects, [{ type: 'play', cue: 'vote.open' }]);
  // 시간이 되기 전에 풀리면 그대로 기다림
  const early = run(c, [{ type: 'hold', now: t0 + 40 }, { type: 'release', now: t0 + 50 }], r.state);
  assert.equal(early.state.screen, 'next');
  // 투표했어요 화면도 막힌 동안에는 봉인하지 않고, 풀리면 봉인
  const heldDone = run(c, [key('Digit1', 10), { type: 'saved', now: 20 }, { type: 'hold', now: 30 }, { type: 'tick', now: t0 + 100 }]);
  assert.equal(heldDone.state.screen, 'done');
  assert.deepEqual(run(c, [{ type: 'release', now: t0 + 200 }], heldDone.state).effects, [{ type: 'sealed' }]);
});

test('다시 투표하기: 새 투표판에서 백스페이스 → 팝업 → Enter면 직전 표를 빼고 처음부터', () => {
  const c = cfgOf(makeSession(3));
  // 첫 친구(취소할 표 없음): 팝업이 뜨지 않음
  assert.equal(run(c, [back(5, null)]).state.asking, null);
  const ask = run(c, [back(100)]);
  assert.equal(ask.state.asking, 'b_last');
  assert.equal(ask.effects.length, 0);
  assert.equal(view(ask.state, c, 101).asking, true);
  // 팝업 동안 숫자는 표로 들어가지 않음
  const digits = run(c, [key('Digit1', 150)], ask.state);
  assert.equal(digits.state.screen, 'open');
  assert.equal(digits.state.asking, 'b_last');
  assert.equal(digits.effects.length, 0);
  // 팝업이 뜬 직후 Enter는 무시(백스페이스·Enter 연타로 보지도 않고 취소되지 않게)
  const early = run(c, [key('Enter', 100 + UNDO_ARM_MS - 1)], ask.state);
  assert.equal(early.state.asking, 'b_last');
  assert.equal(early.effects.length, 0);
  const yes = run(c, [key('Enter', 100 + UNDO_ARM_MS)], ask.state);
  assert.equal(yes.state.screen, 'removing');
  assert.equal(yes.state.asking, null);
  assert.deepEqual(yes.effects, [{ type: 'remove', id: 'b_last' }]);
  assert.equal(view(yes.state, c, 600).hint, '방금 표를 취소하고 있어요');
  // 빼는 동안 키는 무시
  assert.equal(run(c, [key('Digit2', 610)], yes.state).state.screen, 'removing');
  const removed = run(c, [{ type: 'removed', now: 620 }], yes.state);
  assert.equal(removed.state.screen, 'open');
  assert.deepEqual(removed.effects, [{ type: 'play', cue: 'vote.undo' }]);
  assert.match(view(removed.state, c, 630).hint ?? '', /다시 골라/);
  // Esc · 백스페이스 · [아니요] → 팝업만 닫힘
  for (const no of [key('Escape', 700), back(700), { type: 'undoNo', now: 700 }]) {
    const r = run(c, [no], ask.state);
    assert.equal(r.state.asking, null);
    assert.equal(r.state.screen, 'open');
    assert.equal(r.effects.length, 0);
  }
  // 오른쪽 위 버튼(마우스) → 팝업 → [다시 투표하기]는 기다림 없이
  const btn = run(c, [{ type: 'undo', now: 800, undoId: 'b_last' }, { type: 'undoYes', now: 801 }]);
  assert.deepEqual(btn.effects, [{ type: 'remove', id: 'b_last' }]);
  assert.equal(run(c, [{ type: 'undo', now: 800, undoId: null }]).state.asking, null);
  // 빼지 못하면 표는 그대로 → 투표판 + 선생님을 부르라는 안내(인원이 찼으면 마감되게 봉인 알림)
  const failed = run(c, [{ type: 'removeFailed', now: 900 }], yes.state);
  assert.equal(failed.state.screen, 'open');
  assert.deepEqual(failed.effects, [{ type: 'sealed' }]);
  assert.match(view(failed.state, c, 901).hint ?? '', /선생님/);
  // 막힌 동안(선생님 메뉴)에는 팝업도 열리지 않음
  assert.equal(run(c, [{ type: 'hold', now: 1 }, back(2)]).state.asking, null);
});

test('다시 투표하기: 고르던 표가 있으면 백스페이스는 한 칸 지우기, 다 지운 뒤에 팝업', () => {
  const c = cfgOf(makeSession(5, { votesPerVoter: 3 }));
  const r = run(c, [key('Digit1', 1), key('Digit2', 2), back(3)]);
  assert.deepEqual(r.state.picks, [1]);
  assert.equal(r.state.asking, null);
  const r2 = run(c, [back(4), back(5)], r.state);
  assert.deepEqual(r2.state.picks, []);
  assert.equal(r2.state.asking, 'b_last');
  // 버튼은 고르던 중에도 팝업. 확인하면 고르던 표도 버리고 처음부터
  const mid = run(c, [key('Digit1', 1), { type: 'undo', now: 2, undoId: 'b_last' }, { type: 'undoYes', now: 3 }]);
  assert.equal(mid.state.screen, 'removing');
  assert.deepEqual(mid.state.picks, []);
  // 찬반 여러 안건도 같음: 앞 안건으로 → 다 지우면 팝업
  const yn = cfgOf(yesnoSession(2));
  const y = run(yn, [key('Digit1', 1), back(2), back(3)]);
  assert.deepEqual(y.state.picks, []);
  assert.equal(y.state.asking, 'b_last');
});

test('다시 투표하기: 투표했어요 · 다음 친구 화면에서도 백스페이스 → 팝업, 뜬 동안은 넘어가지 않음', () => {
  const c = cfgOf(makeSession(3));
  const done = run(c, [key('Digit2', 10), { type: 'saved', now: 20 }]).state;
  const ask = run(c, [back(30)], done).state;
  assert.equal(ask.asking, 'b_last');
  assert.equal(dueAt(ask), null);
  // 시간이 지나도 팝업이 떠 있으면 투표했어요 화면 그대로
  assert.equal(run(c, [{ type: 'tick', now: 20 + DONE_MS + 5000 }], ask).state.screen, 'done');
  // 아니요 → 이미 시간이 지났으므로 곧바로 봉인
  const no = run(c, [{ type: 'undoNo', now: 20 + DONE_MS + 5000 }], ask);
  assert.equal(no.state.screen, 'next');
  assert.deepEqual(no.effects, [{ type: 'sealed' }]);
  // 다시 투표하기 → 빼고 → 새 투표판(봉인하지 않음)
  const yes = run(c, [key('Enter', 30 + UNDO_ARM_MS), { type: 'removed', now: 600 }], ask);
  assert.equal(yes.state.screen, 'open');
  assert.deepEqual(yes.effects, [{ type: 'remove', id: 'b_last' }, { type: 'play', cue: 'vote.undo' }]);
  // 다음 친구 화면에서도 팝업, 선생님 창에서 그 표를 먼저 빼면 팝업만 닫히고 이어서 열림
  const next = run(c, [{ type: 'tick', now: 20 + DONE_MS }], done).state;
  const ask2 = run(c, [back(20 + DONE_MS + 10)], next).state;
  assert.equal(ask2.asking, 'b_last');
  const gone = run(c, [{ type: 'undoGone', now: 20 + DONE_MS + 20 }], ask2);
  assert.equal(gone.state.asking, null);
  assert.equal(gone.state.screen, 'next');
  assert.equal(run(c, [{ type: 'undoGone', now: 20 + DONE_MS + HANDOFF_MS + 30 }], ask2).state.screen, 'open');
  // 저장 중에는 팝업이 뜨지 않음
  assert.equal(run(c, [key('Digit1', 1), back(2)]).state.asking, null);
});

test('여러 표: 점이 차고, 중복은 거절, 0은 남은 표 기권', () => {
  const s = makeSession(5, { votesPerVoter: 3 });
  const c = cfgOf(s);
  const r = run(c, [key('Digit1', 10), key('Digit1', 20)]);
  assert.equal(r.state.picks.length, 1);
  assert.match(view(r.state, c, 30).hint ?? '', /같은 후보는 한 번만/);
  const z = run(c, [key('Digit0', 40)], r.state);
  const save = z.effects.find((e) => e.type === 'save');
  assert.deepEqual(save.ballot, { id: save.ballot.id, p: ['i1'], a: 2 });
  // 처음부터 0이면 전부 기권
  const all = run(c, [key('Numpad0', 10)]);
  assert.equal(all.effects.find((e) => e.type === 'save').ballot.a, 3);
  // 몰아주기면 같은 번호 여러 번 가능
  const rep = cfgOf(makeSession(5, { votesPerVoter: 3, allowRepeat: true }));
  const r2 = run(rep, [key('Digit2', 1), key('Digit2', 2), key('Digit2', 3)]);
  assert.deepEqual(r2.effects.find((e) => e.type === 'save').ballot.p, ['i2', 'i2', 'i2']);
});

test('기권 없음·범위 밖 숫자·키 반복은 중립 안내와 함께 무시', () => {
  const c = cfgOf(makeSession(4, { allowAbstain: false }));
  const r = run(c, [key('Digit0', 5)]);
  assert.equal(r.state.screen, 'open');
  assert.equal(view(r.state, c, 6).hint, '이번 투표는 기권이 없어요');
  const r2 = run(c, [key('Digit7', 10)], r.state);
  assert.equal(view(r2.state, c, 11).hint, '1~4번 중에서 골라 주세요');
  const r3 = run(c, [key('Digit2', 20, true)], r2.state);
  assert.equal(r3.state.screen, 'open');
  assert.equal(view(r3.state, c, 20 + 2001).hint, null);
  // 스페이스바는 투표판에서 아무 일도 하지 않음
  const sp = run(c, [key('Space', 30)], r3.state);
  assert.equal(sp.state.screen, 'open');
  assert.equal(sp.effects.length, 0);
});

test('결선은 원래 기호 번호를 그대로 키로 씀', () => {
  const s = makeSession(5);
  const runoff = { ...s, items: s.items.filter((it) => it.number === 2 || it.number === 5) };
  const c = cfgOf(runoff);
  assert.equal(rangeHint(c), '2번, 5번 중에서 골라 주세요');
  const r = run(c, [key('Digit3', 1)]);
  assert.equal(r.state.screen, 'open');
  const ok = run(c, [key('Digit5', 2)], r.state);
  assert.deepEqual(ok.effects.find((e) => e.type === 'save').ballot.p, ['i5']);
});

test('찬반: 안건마다 하나, 백스페이스는 한 칸 뒤로, 0은 그 안건만 기권', () => {
  const s = yesnoSession(3);
  const c = cfgOf(s);
  const r = run(c, [key('Digit1', 1), key('Digit2', 2), key('Backspace', 3), key('Digit0', 4)]);
  assert.equal(view(r.state, c, 5).filled, 2);
  const done = run(c, [key('Digit2', 6)], r.state);
  assert.deepEqual(done.effects.find((e) => e.type === 'save').ballot.p, ['y', 'a', 'n']);
  const bad = run(c, [key('Digit3', 1)]);
  assert.equal(view(bad.state, c, 2).hint, '1(찬성) · 2(반대) · 0(기권) 중에서 눌러 주세요');
});

test('저장 실패는 한 번 다시 시도 후 오류 화면, 거절되면 직전 선택으로', () => {
  const c = cfgOf(makeSession(3, { votesPerVoter: 2 }));
  const saving = run(c, [key('Digit1', 1), key('Digit2', 2)]).state;
  const f1 = run(c, [{ type: 'failed', now: 3 }], saving);
  assert.equal(f1.state.screen, 'saving');
  assert.equal(f1.effects[0].delay, 500);
  const f2 = run(c, [{ type: 'failed', now: 600 }], f1.state);
  assert.equal(f2.state.screen, 'error');
  // 세 번째 실패도 오류 화면에 머물 뿐 투표를 멈추지 않습니다(선생님이 멈추지 않았는데 멈춤이 되지 않게).
  const retry = run(c, [{ type: 'retry', now: 700 }, { type: 'failed', now: 710 }], f2.state);
  assert.deepEqual(retry.effects.map((e) => e.type), ['save']);
  assert.equal(retry.state.screen, 'error');
  const rej = run(c, [{ type: 'rejected', now: 3 }], saving);
  assert.equal(rej.state.screen, 'open');
  assert.deepEqual(rej.state.picks, [1]);
  assert.match(view(rej.state, c, 4).hint ?? '', /한 번 더 눌러/);
});

test('막힌 부스는 모든 키를 무시', () => {
  const c = cfgOf(makeSession(3));
  const r = run(c, [{ type: 'hold', now: 0 }, key('Digit1', 1000)]);
  assert.equal(r.state.screen, 'open');
  assert.equal(r.state.picks.length, 0);
  assert.equal(run(c, [{ type: 'release', now: 1001 }, key('Digit1', 1002)], r.state).state.screen, 'saving');
});

test('비밀 보장: 어떤 번호를 눌러도 화면 값과 소리가 같음', () => {
  for (const [votes, repeat, abstain] of /** @type {Array<[number, boolean, boolean]>} */ ([[1, false, true], [3, false, true], [2, true, false]])) {
    const s = makeSession(9, { votesPerVoter: votes, allowRepeat: repeat, allowAbstain: abstain });
    /** @type {string[]} */ const views = [];
    /** @type {string[]} */ const sounds = [];
    for (let d = abstain ? 0 : 1; d <= 9; d++) {
      const c = cfgOf(s);
      // 같은 숫자 연속(몰아주기) 또는 d부터 서로 다른 번호로 칸을 채웁니다.
      const presses = d === 0 ? ['Digit0'] : Array.from({ length: votes }, (_, i) => `Digit${repeat ? d : ((d - 1 + i) % 9) + 1}`);
      let st = initialBooth();
      const frames = [];
      presses.forEach((p, i) => {
        const r = reduce(st, key(p, 100 + i * 10), c);
        st = r.state;
        frames.push(JSON.stringify(view(st, c, 100 + i * 10)));
      });
      const saved = reduce(st, { type: 'saved', now: 500 }, c);
      sounds.push(JSON.stringify(saved.effects));
      // 기권으로 끝나도 "완료 화면" 이후는 같아야 하므로, 비교는 완료 뒤 화면 + 소리로 합니다.
      // 저절로 봉인된 "다음 친구" 화면, 다시 열린 투표판, 다시 투표하기 팝업도 같아야 합니다.
      const next = reduce(saved.state, { type: 'tick', now: 500 + DONE_MS }, c).state;
      const reopened = reduce(next, { type: 'tick', now: 500 + DONE_MS + HANDOFF_MS }, c).state;
      const asking = reduce(reopened, back(500 + DONE_MS + HANDOFF_MS + 10), c).state;
      views.push(JSON.stringify([view(saved.state, c, 600), view(next, c, 500 + DONE_MS + 10), view(reopened, c, 500 + DONE_MS + HANDOFF_MS), view(asking, c, 500 + DONE_MS + HANDOFF_MS + 20)]));
      if (d !== 0) assert.equal(frames.length, votes);
    }
    assert.equal(new Set(views).size, 1, `votes=${votes}`);
    assert.equal(new Set(sounds).size, 1);
    assert.deepEqual(JSON.parse(sounds[0]), [{ type: 'play', cue: 'vote.cast' }]);
  }
  // 중간 화면(표 점)도 번호와 무관: 1표를 고른 뒤의 화면은 어느 번호든 같습니다.
  const s = makeSession(9, { votesPerVoter: 3 });
  const mid = new Set();
  for (let d = 1; d <= 9; d++) {
    const c = cfgOf(s);
    const st = run(c, [key(`Digit${d}`, 10)]).state;
    mid.add(JSON.stringify(view(st, c, 20)));
  }
  assert.equal(mid.size, 1);
});

// ── 저장 변경 함수 ──
test('표 넣기는 두 번 적용해도 같고, 멈춤·인원 참이면 거절', () => {
  let s = /** @type {any} */ (makeSession(3, { voters: 2 }));
  const b1 = { id: 'b_1', p: ['i1'], a: 0 };
  s = insertBallot(b1, 0.3)(s);
  assert.equal(insertBallot(b1, 0.3)(s), s);
  assert.equal(s.lastBallotId, 'b_1');
  s = insertBallot({ id: 'b_2', p: ['i2'], a: 0 }, 0.9)(s);
  assert.equal(insertBallot({ id: 'b_3', p: ['i2'], a: 0 }, 0.5)(s), s, 'full');
  const paused = setPaused(true)(s);
  assert.equal(paused.phase, 'paused');
  const roomy = setVoters(5)(paused);
  assert.equal(insertBallot({ id: 'b_4', p: ['i1'], a: 0 }, 0.1)(roomy), roomy, 'paused');
});

test('선생님 조작: 직전 표 취소·인원·마감/재개, 개표 위치는 앞으로만', () => {
  let s = /** @type {any} */ (makeSession(3, { voters: 3 }));
  s = insertBallot({ id: 'b_1', p: ['i1'], a: 0 }, 0)(s);
  s = insertBallot({ id: 'b_2', p: ['i2'], a: 0 }, 0)(s);
  s = voidLast(s);
  assert.deepEqual(s.ballots.map((/** @type {{id:string}} */ b) => b.id), ['b_1']);
  assert.equal(voidLast(s), s, 'only once');
  assert.equal(setVoters(1)(s).rules.voters, 2, 'not below ballots / minimum');
  const closed = close(['b_1'])(s);
  assert.equal(closed.phase, 'closed');
  assert.equal(closed.lastBallotId, null);
  assert.equal(removeBallot('b_1')(closed), closed, 'no removal after close');
  const reopened = setVoters(4)(closed);
  assert.equal(reopened.phase, 'voting');
  assert.equal(reopened.counting, null);
  let c = startCounting(closed);
  assert.equal(c.phase, 'counting');
  c = setCursor(1)(c);
  assert.equal(setCursor(0)(c), c, 'never backwards');
  assert.equal(revealItem('i9')(c), c);
  assert.equal(finish(c).phase, 'done');
  assert.equal(begin('tutorial')({ ...s, phase: 'ready' }).phase, 'tutorial');
});

// ── 집계 ──
test('순위·당선·경계 동점·0표', () => {
  const items = /** @type {any[]} */ ([1, 2, 3, 4].map((n) => ({ id: `i${n}`, number: n, name: `${n}` })));
  const rows = rankRows(items, { i1: 5, i2: 5, i3: 2, i4: 0 });
  assert.deepEqual(rows.map((r) => [r.item.number, r.rank]), [[1, 1], [2, 1], [3, 3], [4, 4]]);
  assert.deepEqual(decide(rows, 1), { winners: [], tied: ['i1', 'i2'], openSeats: 1 });
  assert.deepEqual(decide(rows, 2), { winners: ['i1', 'i2'], tied: [], openSeats: 0 });
  const r2 = rankRows(items, { i1: 6, i2: 3, i3: 3, i4: 3 });
  assert.deepEqual(decide(r2, 2), { winners: ['i1'], tied: ['i2', 'i3', 'i4'], openSeats: 1 });
  const zero = rankRows(items, { i1: 1, i2: 0, i3: 0, i4: 0 });
  assert.deepEqual(decide(zero, 2), { winners: ['i1'], tied: [], openSeats: 0 });
  assert.deepEqual(decide(rankRows(items, {}), 1).winners, []);
});

test('중복 투표는 고른 만큼 세고, 기권 칸은 따로', () => {
  const items = /** @type {any[]} */ ([{ id: 'i1', number: 1 }, { id: 'i2', number: 2 }]);
  const t = countItems(items, [{ id: 'b1', p: ['i1', 'i1', 'i2'], a: 0 }, { id: 'b2', p: ['i2'], a: 2 }]);
  assert.deepEqual(t.counts, { i1: 2, i2: 2 });
  assert.equal(t.abstain, 2);
});

test('당선 확실은 절대 틀리지 않음(무작위 모의 실험)', () => {
  const rnd = seededRandom('certain');
  for (let trial = 0; trial < 3000; trial++) {
    const n = 2 + Math.floor(rnd() * 5);
    const seats = 1 + Math.floor(rnd() * Math.min(3, n - 1));
    const per = 1 + Math.floor(rnd() * 3);
    const ballots = Array.from({ length: 5 + Math.floor(rnd() * 25) }, (_, i) => ({ id: `b${i}`, p: Array.from({ length: per }, () => `i${1 + Math.floor(rnd() * n)}`), a: 0 }));
    const items = /** @type {any[]} */ (Array.from({ length: n }, (_, i) => ({ id: `i${i + 1}`, number: i + 1 })));
    const final = decide(rankRows(items, countItems(items, ballots).counts), seats);
    for (let k = 0; k <= ballots.length; k++) {
      const { counts } = countItems(items, ballots, k);
      for (const id of certainWinners(counts, ballots.length - k, per, seats)) assert.ok(final.winners.includes(id), `trial ${trial}`);
    }
  }
});

test('찬반 통과 기준의 정확한 경계', () => {
  assert.equal(passes('yesOverNo', { yes: 5, no: 5, participants: 10 }), false);
  assert.equal(passes('majority', { yes: 5, no: 3, participants: 10 }), false);
  assert.equal(passes('majority', { yes: 6, no: 3, participants: 11 }), true);
  assert.equal(passes('twoThirds', { yes: 6, no: 3, participants: 9 }), true);
  assert.equal(passes('twoThirds', { yes: 5, no: 3, participants: 8 }), false);
  assert.equal(passes('twoThirds', { yes: 0, no: 0, participants: 0 }), false);
  assert.equal(passes('none', { yes: 1, no: 0, participants: 1 }), null);
  const s = yesnoSession(2);
  const t = tallyYesNo(s, [{ id: 'b1', p: ['y', 'n'], a: 0 }, { id: 'b2', p: ['a', 'n'], a: 0 }]);
  assert.deepEqual(t.map((x) => [x.yes, x.no, x.abstain, x.passed]), [[1, 0, 1, true], [0, 2, 0, false]]);
  assert.equal(certainPass('yesOverNo', { yes: 6, no: 1, participants: 7 }, 4), 'pass');
  assert.equal(certainPass('yesOverNo', { yes: 1, no: 6, participants: 7 }, 4), 'fail');
  assert.equal(certainPass('yesOverNo', { yes: 3, no: 3, participants: 6 }, 4), null);
});

// ── 개표 진행 ──
test('모든 개표 방법이 집계와 같은 숫자로 끝남', () => {
  const rnd = seededRandom('modes');
  let s = /** @type {any} */ (makeSession(5, { voters: 12, votesPerVoter: 2 }));
  for (let i = 0; i < 12; i++) {
    const a = 1 + Math.floor(rnd() * 5);
    const b = (a % 5) + 1;
    s = insertBallot({ id: `b_${i}`, p: [`i${a}`, `i${b}`], a: 0 }, rnd())(s);
  }
  s = startCounting(close(fisherYates(s.ballots.map((/** @type {{id:string}} */ b) => b.id), rnd))(s));
  const truth = tallyItems(s, s.ballots).counts;
  for (const mode of ['instant', 'paper', 'race', 'broadcast']) {
    const m = { ...s, reveal: { mode, visibility: 'all' } };
    assert.deepEqual(partialCounts(m, stepCount(m)).counts, truth, mode);
    assert.ok(isComplete({ ...m, counting: { ...m.counting, cursor: stepCount(m) } }));
  }
  assert.deepEqual(ballotsShown({ ...s, reveal: { mode: 'broadcast', visibility: 'all' } }, 1), 2);
});

test('개표 방송 구간·반전 공개 묶음·간격 도우미', () => {
  assert.deepEqual(broadcastStops(30), [3, 6, 9, 12, 15, 18, 21, 24, 27, 28, 29, 30]);
  assert.deepEqual(broadcastStops(0), []);
  let s = /** @type {any} */ (makeSession(4, { voters: 6 }));
  const votes = ['i1', 'i1', 'i1', 'i2', 'i2', 'i3'];
  votes.forEach((v, i) => (s = insertBallot({ id: `b_${i}`, p: [v], a: 0 }, 0.99)(s)));
  const g = reverseGroups({ ...s, reveal: { mode: 'reverse', visibility: 'all' } });
  assert.deepEqual(g.map((x) => x.ids), [['i4'], ['i3'], ['i2'], ['i1']]);
  assert.deepEqual(g.map((x) => x.drumroll), [false, false, false, true]);
  const w = reverseGroups({ ...s, reveal: { mode: 'reverse', visibility: 'winner' } });
  assert.deepEqual(w, [{ ids: ['i1'], winner: true, drumroll: true }]);
  assert.ok(autoDelay('race', 95, 100, 'normal') > autoDelay('race', 50, 100, 'normal'));
  assert.ok(autoDelay('paper', 0, 10, 'slow') > autoDelay('paper', 0, 10, 'fast'));
  assert.deepEqual(tallyMarks(12), { full: 2, rest: 2 });
  assert.equal(raceGoal(4, false), 9);
  assert.equal(raceGoal(4, true), 4);
});

// ── 만들기 검증·틀·추첨 ──
test('검사 문구는 PRD 표를 따름', () => {
  const c = normalizeConfig({ type: 'candidate', title: ' ', items: [{ id: 'i1', number: 1, name: '가', gender: 'm' }, { id: 'i2', number: 2, name: '가', gender: null }], rules: { votesPerVoter: 2, seats: 2 } });
  const msgs = validateConfig(c).map((p) => p.message);
  assert.ok(msgs.includes('투표 제목을 적어 주세요'));
  assert.ok(msgs.includes('2번 후보의 남/녀를 골라 주세요'));
  assert.ok(msgs.includes('같은 이름이 있어요 — 한 줄 소개로 구분해 주세요'));
  assert.ok(msgs.includes('후보가 2명이라 1표까지 고를 수 있어요'));
  assert.ok(msgs.includes('후보가 2명이라 1명까지 뽑을 수 있어요'));
  assert.ok(!blockingProblems(c).some((p) => p.warning));
  const o = normalizeConfig({ type: 'opinion', title: '장소', items: [{ id: 'i1', number: 1, name: '' }] });
  assert.ok(validateConfig(o).some((p) => p.message === '항목을 2개 이상 넣어 주세요'));
  const y = normalizeConfig({ type: 'yesno', title: '회의', agendas: [{ id: 'a1', text: '' }] });
  assert.ok(validateConfig(y).some((p) => p.message === '1번 안건을 적어 주세요'));
});

test('빠른 시작 틀은 이름만 채우면 올바른 설정', () => {
  assert.equal(TEMPLATES.length, 7);
  for (const t of TEMPLATES) {
    let n = 0;
    const c = configFromTemplate(t.id, { voters: 24 }, (type) => [1, 2, 3].map((k) => ({ id: `i${k}`, number: k, name: `이름${k}`, gender: type === 'candidate' ? 'f' : null, character: null, color: null, pattern: null, intro: '' })), () => `a_${n++}`);
    assert.ok(c);
    const filled = normalizeConfig({ ...c, title: t.title, agendas: c.agendas.map((a) => ({ ...a, text: '안건' })) }, 'seed');
    assert.deepEqual(blockingProblems(filled), [], t.id);
    assert.equal(filled.rules.voters, 24);
    assert.equal(filled.reveal.mode, t.reveal.mode, t.id);
  }
});

test('기호 추첨은 겹침 없는 새 번호 순열', () => {
  const items = /** @type {any[]} */ ([1, 2, 3, 4].map((n) => ({ id: `i${n}`, number: n, name: `${n}` })));
  const r = drawNumbers(items, seededRandom('lot'));
  assert.deepEqual([...r.order].sort(), ['i1', 'i2', 'i3', 'i4']);
  assert.deepEqual(r.items.map((it) => it.number), [1, 2, 3, 4]);
});

// ── 안내 ──
test('안내 슬라이드는 설정을 따르고 음성은 자연스러운 수 읽기', () => {
  assert.equal(nativeCount(28, '명'), '스물여덟 명');
  assert.equal(nativeCount(20, '명'), '스무 명');
  assert.equal(nativeCount(2, '표'), '두 표');
  const one = buildSlides(makeSession(5)).map((x) => x.id);
  assert.deepEqual(one, ['today', 'meet', 'line', 'press', 'abstain', 'undo', 'secret', 'ready']);
  const multi = buildSlides(makeSession(5, { votesPerVoter: 3, allowAbstain: false })).map((x) => x.id);
  assert.ok(multi.includes('multi') && !multi.includes('abstain'));
  const yn = buildSlides(yesnoSession(3));
  assert.ok(yn.some((x) => x.id === 'agendas'));
  assert.match(yn[0].speech, /열 명이 모두 투표해요/);
  const slides = buildSlides(makeSession(5, { undoSeconds: 5 }));
  assert.match(slides.find((x) => x.id === 'undo')?.text ?? '', /다음 친구가 투표하기 전까지/);
  // 2026-09-26부터 Enter로 차례를 넘기지 않습니다. 화면 문장 · 읽어 주는 문장 어디에도 Enter가 남지 않게.
  for (const slide of slides) assert.doesNotMatch(`${slide.text} ${slide.speech}`, /Enter|엔터|시간 제한/, slide.id);
});

// ── 배치 ──
test('투표판 칸: 1440×888에서 이름이 크고 최소 창에서도 읽힘', () => {
  const big = boothGrid(9, 1380, 740);
  assert.equal(big.rows * big.cols >= 9, true);
  assert.ok(big.name >= 44, `name ${big.name}`);
  assert.ok(big.key >= 72, `key ${big.key}`);
  const small = boothGrid(9, 720, 420);
  assert.ok(small.name >= 24, `name ${small.name}`);
  assert.ok(small.key >= 40, `key ${small.key}`);
  for (let n = 1; n <= 9; n++) {
    const g = boothGrid(n, 1380, 740);
    assert.ok(g.rows * g.cols >= n && g.rows * g.cols - n < g.cols, `${n}`);
  }
  // 크기를 재기 전(폭 0)·아주 작은 판에서도 배치를 돌려줌(null이면 화면 갱신이 멈췄음 — 미리보기에서 재현)
  for (const [w, h] of [[0, 0], [1, 1], [40, 30]]) {
    for (let n = 1; n <= 9; n++) {
      const g = boothGrid(n, w, h);
      assert.ok(g && (g.orient === 'wide' || g.orient === 'tall') && g.rows * g.cols >= n, `${w}×${h} ${n}`);
    }
  }
});

test('준비 화면 후보 판: 적을수록 크게, 칸이 판 안에 들어가고, 재기 전·작은 창에서도 배치를 돌려줌', () => {
  // 1280×820 기본 창의 판(약 1080×160) — 4명은 한 줄에 크게, 9명도 예전(72px)보다 큼
  const four = lineupGrid(4, 1080, 160, { intro: true });
  const nine = lineupGrid(9, 1080, 160, { intro: true });
  assert.equal(four.rows, 1);
  assert.ok(four.art >= 110, `4명 ${four.art}`);
  assert.ok(nine.art >= 84, `9명 ${nine.art}`);
  assert.ok(four.art > nine.art);
  // 작은 칸에서는 소개 줄을 빼고 그 자리를 스티커에 줌
  assert.equal(nine.showIntro, false);
  assert.equal(lineupGrid(4, 1140, 440, { intro: true }).showIntro, true);
  assert.equal(lineupGrid(4, 1140, 440).showIntro, false);
  // 전체 화면(판 약 1140×440)에서는 9명이 두 줄로 더 크게
  const nineFull = lineupGrid(9, 1140, 440);
  assert.equal(nineFull.rows, 2);
  assert.ok(nineFull.art > nine.art);
  for (let n = 1; n <= 9; n++) {
    for (const [w, h, intro, nameLines] of /** @type {const} */ ([[1100, 200, false, 1], [1140, 440, true, 1], [700, 260, true, 2]])) {
      const g = lineupGrid(n, w, h, { intro, nameLines });
      assert.ok(g.rows * g.cols >= n && g.rows * g.cols - n < g.cols, `${n} ${w}×${h}`);
      assert.ok(!g.showIntro || intro, '소개가 없는데 소개 줄을 두지 않음');
      assert.ok(g.art >= LINEUP_ART_MIN && g.art <= LINEUP_ART_MAX, `${n} ${w}×${h} art ${g.art}`);
      // 칸 폭 안에 스티커가 들어감(이름 자리는 칸 폭 전체)
      assert.ok(g.cellW >= g.art, `${n} ${w}×${h} cell ${g.cellW} < art ${g.art}`);
      // 최소 크기로 버틴 경우가 아니면 칸 높이의 합이 판 높이를 넘지 않음
      if (g.art > LINEUP_ART_MIN) {
        const cellH = g.art + 12 + g.name * 1.2 * nameLines + (g.showIntro ? 34 : 0);
        assert.ok(cellH * g.rows + 18 * (g.rows - 1) <= h + 1, `${n} ${w}×${h} 높이 넘침`);
      }
    }
  }
  for (const [w, h] of [[0, 0], [1, 1], [40, 30]]) {
    const g = lineupGrid(5, w, h);
    assert.equal(g.art, LINEUP_ART_MIN);
    assert.ok(g.rows * g.cols >= 5);
  }
});

test('창 배치: 선생님 창은 다른 모니터로, 투표판은 옮길 모니터에 맞춤', () => {
  const monitors = [
    { bounds: { x: 0, y: 0, width: 3840, height: 2160 }, work: { x: 0, y: 0, width: 3840, height: 2064 }, scale: 2 },
    { bounds: { x: 3840, y: 0, width: 1920, height: 1080 }, work: { x: 3840, y: 0, width: 1920, height: 1032 }, scale: 1 },
  ];
  assert.equal(monitorIndexAt(monitors, { x: 4000, y: 10 }), 1);
  const t = teacherPlacement(monitors, { x: 1000, y: 1000 });
  assert.equal(t?.otherMonitor, true);
  assert.equal(t?.physical.x, 3840 + 1920 - 464);
  const single = teacherPlacement([monitors[1]], { x: 4000, y: 100 });
  assert.equal(single?.otherMonitor, false);
  const b = boardPlacement(monitors[0]);
  assert.deepEqual(b.logical, { width: 1574, height: 908 });
  assert.equal(staggerDelay(8, 9), 320);
  assert.equal(staggerDelay(20, 21), 500);
});

// ── 기록함·결선·결과 ──
test('기록함: 한 번만 기록, 결선 묶음, 최종 당선, 30개 한도', () => {
  let s = /** @type {any} */ (makeSession(3, { voters: 4 }));
  ['i1', 'i2', 'i1', 'i2'].forEach((v, i) => (s = insertBallot({ id: `b_${i}`, p: [v], a: 0 }, 0.5)(s)));
  s = startCounting(close(s.ballots.map((/** @type {{id:string}} */ b) => b.id))(s));
  let a = archiveSession(s, '2026-09-24')({ entries: [] });
  assert.equal(archiveSession(s, '2026-09-24')(a), a, 'no duplicate');
  assert.ok(alreadyArchived(s, a));
  const entry = a.entries[0];
  assert.deepEqual(finalResult(entry).pendingTie, ['i1', 'i2']);
  const rc = runoffConfig(entry);
  assert.ok(rc);
  assert.deepEqual(rc.items.map((it) => it.number), [1, 2]);
  assert.equal(rc.tutorial.enabled, false);
  let r = /** @type {any} */ ({ ...sessionFromConfig(rc, 'v_run', '2026-09-24'), phase: 'voting', runoffOf: entry.id });
  ['i1', 'i1', 'i2', 'i1'].forEach((v, i) => (r = insertBallot({ id: `r_${i}`, p: [v], a: 0 }, 0.5)(r)));
  r = startCounting(close(r.ballots.map((/** @type {{id:string}} */ b) => b.id))(r));
  a = archiveSession(r, '2026-09-24')(a);
  assert.equal(a.entries.length, 1);
  assert.equal(a.entries[0].runoffs.length, 1);
  assert.deepEqual(finalResult(a.entries[0]).winners, ['i1']);
  assert.equal(runoffConfig(a.entries[0]), null);
  const m = resultModel(a.entries[0]);
  assert.equal(m.winners[0].id, 'i1');
  assert.equal(m.round, 1);
  assert.equal(m.validVotes, 4);
  assert.equal(resultSummary(m), '후보1');
  // 30개 한도 · 지우기 · 되살리기
  let many = { entries: /** @type {any[]} */ ([]) };
  for (let i = 0; i < 32; i++) many = archiveSession({ ...s, id: `v_${i}` }, '2026-09-24')(many);
  assert.equal(many.entries.length, 30);
  assert.equal(many.entries[0].id, 'v_31');
  const removed = removeEntry('v_20')(many);
  assert.equal(removed.entries.length, 29);
  assert.equal(restoreEntry(many.entries[11], 11)(removed).entries[11].id, 'v_20');
  assert.deepEqual(normalizeArchive(JSON.parse(JSON.stringify(a))), a);
  assert.equal(runoffTitle('가'.repeat(30)), '가'.repeat(27) + ' 결선');
});

test('결과 모델: 순위만·당선자만이면 득표를 숨김', () => {
  let s = /** @type {any} */ (makeSession(3, { voters: 3 }));
  ['i1', 'i1', 'i2'].forEach((v, i) => (s = insertBallot({ id: `b_${i}`, p: [v], a: 0 }, 0.5)(s)));
  s = startCounting(close(s.ballots.map((/** @type {{id:string}} */ b) => b.id))(s));
  const all = resultModel(archiveSession(s, 'd')({ entries: [] }).entries[0]);
  assert.equal(all.rows[0].count, 2);
  assert.equal(all.rows[0].percent, 67);
  assert.equal(all.validVotes, 3);
  const rank = resultModel(archiveSession({ ...s, reveal: { mode: 'reverse', visibility: 'rank' } }, 'd')({ entries: [] }).entries[0]);
  assert.equal(rank.rows[0].count, null);
  assert.equal(rank.abstain, null);
  assert.equal(rank.validVotes, null);
  const winner = resultModel(archiveSession({ ...s, reveal: { mode: 'reverse', visibility: 'winner' } }, 'd')({ entries: [] }).entries[0]);
  assert.deepEqual(winner.rows, []);
  assert.equal(winner.validVotes, null);
  assert.equal(winner.winners[0].id, 'i1');
  const teacher = resultModel(archiveSession({ ...s, reveal: { mode: 'reverse', visibility: 'winner' } }, 'd')({ entries: [] }).entries[0], { teacher: true });
  assert.equal(teacher.rows.length, 3);
  assert.equal(teacher.validVotes, 3);
  // 찬반
  let y = /** @type {any} */ (yesnoSession(1, { voters: 3 }));
  ['y', 'y', 'n'].forEach((v, i) => (y = insertBallot({ id: `b_${i}`, p: [v], a: 0 }, 0.5)(y)));
  y = startCounting(close(y.ballots.map((/** @type {{id:string}} */ b) => b.id))(y));
  const ym = resultModel(archiveSession(y, 'd')({ entries: [] }).entries[0]);
  assert.equal(ym.agendas[0].passed, true);
  assert.equal(resultSummary(ym), '통과');
});

test('결과 요약: 복수 선택과 여러 안건의 유효표는 사람 수와 구분합니다', () => {
  let s = /** @type {any} */ (makeSession(5, { voters: 3, votesPerVoter: 3 }));
  [{ p: ['i1', 'i2', 'i3'], a: 0 }, { p: ['i1', 'i2'], a: 1 }, { p: [], a: 3 }].forEach((b, i) => {
    s = insertBallot({ id: `b_${i}`, ...b }, 0.5)(s);
  });
  const m = resultModel(archiveSession(s, 'd')({ entries: [] }).entries[0]);
  assert.equal(m.participants, 3);
  assert.equal(m.validVotes, 5);
  assert.equal(m.abstain, 4);

  let y = /** @type {any} */ (yesnoSession(2, { voters: 3 }));
  [['y', 'a'], ['n', 'y'], ['a', 'n']].forEach((p, i) => {
    y = insertBallot({ id: `y_${i}`, p, a: 0 }, 0.5)(y);
  });
  const entry = archiveSession(y, 'd')({ entries: [] }).entries[0];
  const ym = resultModel(entry);
  assert.equal(ym.participants, 3);
  assert.equal(ym.validVotes, 4);
  assert.equal(ym.abstain, 2);
  assert.equal(resultModel({ ...entry, config: { ...entry.config, reveal: { ...entry.config.reveal, visibility: 'result' } } }).validVotes, null);
});

test('소리: 26가지 효과음 목록', () => {
  assert.equal(CUE_IDS.length, 26);
  assert.ok(CUE_IDS.includes('vote.cast'));
});

test('한도 값은 PRD와 같음', () => {
  assert.equal(LIMITS.itemsMax, 9);
  assert.equal(LIMITS.votersMax, 60);
  assert.equal(LIMITS.votesMax, 5);
  assert.equal(LIMITS.seatsMax, 4);
});

test('개표 방법·진행 단계 이름은 한곳에서(찬반 레이스는 줄다리기)', () => {
  for (const m of MODES) assert.ok(modeName(m).length > 0, m);
  assert.equal(modeName('race'), '실시간 레이스');
  assert.equal(modeName('race', true), '줄다리기');
  for (const p of PHASES) assert.ok(phaseLabel(p).length > 0, p);
  assert.equal(phaseLabel('none'), '');
  assert.equal(dateLabel('2026-09-24'), '2026년 9월 24일');
  assert.equal(dateLabel('2026-09-04', true), '9월 4일');
  assert.equal(dateLabel(''), '');
});

test('투표 그만두기 되돌리기: 투표 중이었으면 곧바로 이어서 받고, 그 사이 새 투표가 있으면 덮어쓰지 않음', () => {
  const s = makeSession(3);
  const back = restoreCancelled(s)(/** @type {any} */ ({ id: null }));
  assert.equal(back.id, s.id);
  assert.equal(back.phase, 'voting');
  // 예전 판에서 멈춘 채 지운 투표도 이어서 받습니다(이제 멈춤을 푸는 버튼이 없음).
  assert.equal(restoreCancelled({ ...s, phase: 'paused' })(/** @type {any} */ ({ id: null })).phase, 'voting');
  const ready = restoreCancelled({ ...s, phase: 'ready' })(/** @type {any} */ ({ id: null }));
  assert.equal(ready.phase, 'ready');
  const other = /** @type {any} */ ({ ...makeSession(2), id: 'v_other' });
  assert.equal(restoreCancelled(s)(other), other);
});

test('처음부터 다시 받기: 표만 비우고 곧바로 투표로, 누른 뒤 들어온 표는 지우지 않고, 되돌려도 이어서 받음', () => {
  const s = /** @type {any} */ ({ ...makeSession(3), phase: 'paused', ballots: [{ id: 'b1', p: ['i1'], a: false }, { id: 'b2', p: ['i2'], a: false }], lastBallotId: 'b2' });
  const seen = s.ballots.map((/** @type {any} */ b) => b.id);
  const toVote = restart(seen)(s);
  assert.equal(toVote.phase, 'voting');
  assert.deepEqual(toVote.ballots, []);
  assert.equal(toVote.lastBallotId, null);
  assert.equal(toVote.id, s.id);
  assert.deepEqual(toVote.items, s.items);
  // 다시 적용해도 같음
  assert.equal(restart(seen)(toVote), toVote);
  // 비운 뒤 새 표가 들어왔으면 다시 적용돼도 지우지 않음
  const fresh = /** @type {any} */ ({ ...toVote, ballots: [{ id: 'b9', p: ['i1'], a: false }], lastBallotId: 'b9' });
  assert.equal(restart(seen)(fresh), fresh);
  // 마감·개표 뒤에는 하지 않음
  const closed = /** @type {any} */ ({ ...s, phase: 'closed' });
  assert.equal(restart(seen)(closed), closed);
  // 되돌리기: 표가 돌아오고 멈추지 않고 이어서 받음
  const back = restoreRestarted(s)(toVote);
  assert.equal(back.phase, 'voting');
  assert.equal(back.ballots.length, 2);
  // 되돌리기 전 새 표가 있거나 다른 투표면 그대로
  assert.equal(restoreRestarted(s)(fresh), fresh);
  const other = /** @type {any} */ ({ ...toVote, id: 'v_other' });
  assert.equal(restoreRestarted(s)(other), other);
});

test('개발 미리보기 예시는 정규화를 거쳐도 표 하나 잃지 않음', () => {
  const names = ['candidate9', 'opinion', 'yesno3', 'voting', 'result', 'result-tie', 'result-winner', 'archive',
    ...MODES.map((m) => `counting-${m}`), 'counting-yesno', 'counting-race-yesno'];
  for (const name of names) {
    const f = fixture(name);
    assert.ok(f.session || f.archive, name);
    if (f.session) {
      const n = /** @type {any} */ (normalizeSession(f.session));
      assert.equal(n.id, f.session.id, name);
      assert.equal(n.ballots.length, f.session.ballots.length, name);
      assert.equal(n.phase, f.session.phase, name);
      assert.equal(n.reveal.mode, f.session.reveal.mode, name);
    }
    if (f.archive) {
      const a = normalizeArchive(f.archive);
      assert.equal(a.entries.length, f.archive.entries.length, name);
      a.entries.forEach((e, i) => assert.equal(e.ballots.length, f.archive?.entries[i].ballots.length, name));
      if (f.focus) assert.ok(a.entries.some((e) => e.id === f.focus), name);
    }
  }
  // 동점 예시는 정말 1위 동점
  const tie = resultModel(/** @type {any} */ (fixture('result-tie').archive).entries[0]);
  assert.equal(tie.winners.length, 0);
  assert.equal(tie.pendingTie.length, 2);
  assert.equal(fixture('없는 이름').session, undefined);
});

test('음량 측정기: BS.1770 기준값(997Hz 사인 0dBFS = −3.01LUFS)과 표본 사이 봉우리', () => {
  const fs = 48000;
  const sine = (/** @type {number} */ amp, /** @type {number} */ f, /** @type {number} */ rate = fs) => Float32Array.from({ length: rate * 3 }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / rate));
  assert.ok(Math.abs(integratedLoudness(sine(1, 997), fs) + 3.01) < 0.05);
  assert.ok(Math.abs(integratedLoudness(sine(0.1, 997), fs) + 23.01) < 0.05);
  assert.ok(Math.abs(integratedLoudness(sine(1, 997, 44100), 44100) + 3.01) < 0.05);
  assert.equal(integratedLoudness(new Float32Array(fs), fs), -Infinity);
  // fs/4 사인을 45° 위상으로: 표본 최고는 −3dB지만 실제 봉우리는 0dB
  const between = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * 12000 * i) / fs + Math.PI / 4));
  assert.ok(truePeak(between) > -0.3, `true peak ${truePeak(between)}`);
});

test('소리 표: 26종 모두 목표 음량·보정값이 있고, 봉우리 누름은 있는 소리에만', () => {
  for (const id of CUE_IDS) {
    assert.ok(typeof LOUDNESS[/** @type {keyof typeof LOUDNESS} */ (id)] === 'number', `목표 ${id}`);
    assert.ok(typeof TRIM[id] === 'number' && TRIM[id] > -10 && TRIM[id] < 30, `보정 ${id}`);
  }
  for (const id of Object.keys(TAME)) assert.ok(CUE_IDS.includes(id) && TAME[id] < 0, `누름 ${id}`);
  assert.deepEqual(Object.keys(LOUDNESS).sort(), [...CUE_IDS].sort());
});

test('기록 수정: 제목과 메모만 저장하고 표·공개 범위·결선 집계는 보존합니다', () => {
  const source = normalizeArchive(fixture('result-tie').archive);
  const entry = source.entries[0];
  const before = resultModel(entry);
  const updated = updateEntry(entry.id, { title: '  수정한 회장 선거  ', note: ' 첫 줄\r\n둘째 줄\u0000 ' })(source);
  const changed = updated.entries[0];
  assert.equal(changed.config.title, '수정한 회장 선거');
  assert.equal(changed.note, '첫 줄\n둘째 줄');
  assert.equal(changed.ballots, entry.ballots);
  assert.equal(changed.runoffs, entry.runoffs);
  assert.equal(changed.config.rules, entry.config.rules);
  assert.equal(changed.config.reveal, entry.config.reveal);
  assert.equal(entry.config.title, before.title);
  const after = resultModel(changed);
  assert.deepEqual({ ...after, title: before.title }, before);
  assert.deepEqual(normalizeArchive(updated).entries[0], changed);
  const deleted = removeEntry(changed.id)(updated);
  assert.deepEqual(restoreEntry(changed, 0)(deleted), updated);
});

test('기록 수정: 빈 제목 거부, 길이 제한, 다른 기록 보존과 오래된 기록 호환', () => {
  const archive = normalizeArchive(fixture('archive').archive);
  const entry = archive.entries[0];
  assert.equal(updateEntry(entry.id, { title: ' \u0000 ', note: '변경' })(archive), archive);
  const updated = updateEntry(entry.id, { title: '가'.repeat(LIMITS.titleMax + 10), note: '나'.repeat(RECORD_NOTE_MAX + 10) })(archive);
  assert.equal(updated.entries[0].config.title.length, LIMITS.titleMax);
  assert.equal(updated.entries[0].note?.length, RECORD_NOTE_MAX);
  assert.equal(updated.entries[1], archive.entries[1]);
  assert.equal(normalizeArchive({ entries: [{ ...entry, note: undefined }] }).entries[0].note ?? '', '');
  assert.equal(updateEntry(entry.id, { title: '수정', note: '' })({ entries: [] }).entries.length, 0);
});
