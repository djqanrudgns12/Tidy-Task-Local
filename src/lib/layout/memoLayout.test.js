import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NOTES_H,
  SPLITTER_H,
  TODOS_MIN_H,
  bottomDragLayout,
  classifyResize,
  holdLayout,
  isInstantResize,
  minWindowHeight,
  resolveNotesPreference,
  splitterWindowHeight,
} from './memoLayout.js';

// 스크린샷 속 창과 비슷한 기본 틀: 마감된 일 0개(머리글만), 메모 한 줄
const ARCHIVE_EMPTY = { min: 34, natural: 34 };
const ARCHIVE_FULL = { min: 34, natural: 214 }; // 목록이 열려 5.5줄 보이는 상태
const NOTES = { min: 90 };

/** @param {number} bodyH @param {Partial<import('./memoLayout.js').LayoutFrame>} [over] */
function frameOf(bodyH, over = {}) {
  return { bodyH, todosMin: TODOS_MIN_H, archive: ARCHIVE_EMPTY, notes: NOTES, ...over };
}

/**
 * 배치 결과가 몸통 높이를 정확히 나눠 갖는지 확인합니다.
 * @param {import('./memoLayout.js').LayoutFrame} frame
 * @param {import('./memoLayout.js').LayoutResult} layout
 */
function assertFills(frame, layout) {
  const S = frame.archive || frame.notes ? SPLITTER_H : 0;
  assert.equal(layout.todos + layout.archive + layout.notes + S, frame.bodyH);
}

// ── 붙잡기(hold): 위쪽 테두리·스플리터·최대화 ───────────────────────────

test('위쪽 테두리로 줄이고 늘려도 할 일만 바뀌고 마감된 일·메모는 그대로다', () => {
  // 할 일 최소 145 + 6 + 214 + 180 = 545 까지는 공간이 넉넉합니다.
  const heights = [800, 760, 700, 640, 600, 560, 545, 600, 700, 900];
  for (const bodyH of heights) {
    const frame = frameOf(bodyH, { archive: ARCHIVE_FULL });
    const layout = holdLayout(frame, 180);
    assertFills(frame, layout);
    assert.equal(layout.notes, 180, `bodyH=${bodyH}`);
    assert.equal(layout.archive, 214, `bodyH=${bodyH}`);
    assert.ok(layout.todos >= TODOS_MIN_H, `bodyH=${bodyH}`);
  }
});

test('할 일이 최소에 닿으면 마감된 일 목록 → 메모 순으로 양보하고, 누구도 최소 아래로 가지 않는다', () => {
  const pref = 180;
  // 여유: 145 + 6 + 214 + 180 = 545
  let layout = holdLayout(frameOf(545, { archive: ARCHIVE_FULL }), pref);
  assert.deepEqual(layout, { todos: 145, archive: 214, notes: 180 });
  // 목록이 먼저 줄어듭니다(메모는 그대로)
  layout = holdLayout(frameOf(445, { archive: ARCHIVE_FULL }), pref);
  assert.deepEqual(layout, { todos: 145, archive: 114, notes: 180 });
  // 목록이 머리글까지 줄면 그때 메모가 줄어듭니다
  layout = holdLayout(frameOf(305, { archive: ARCHIVE_FULL }), pref);
  assert.deepEqual(layout, { todos: 145, archive: 34, notes: 120 });
  // 모두 최소: 마감된 일이 사라지지 않고(머리글 유지) 메모도 최소를 지킵니다
  layout = holdLayout(frameOf(275, { archive: ARCHIVE_FULL }), pref);
  assert.deepEqual(layout, { todos: 145, archive: 34, notes: 90 });
  // 창이 최소보다 작아도(잠깐 생긴 띠 등) 마감된 일·메모는 최소를 지키고 할 일 목록이 스크롤로 받아냅니다
  layout = holdLayout(frameOf(250, { archive: ARCHIVE_FULL }), pref);
  assert.deepEqual(layout, { todos: 120, archive: 34, notes: 90 });
});

test('붙잡기 배치는 창 높이에만 달려 있어 줄였다 다시 키우면 원래대로 돌아온다', () => {
  const pref = 200;
  const before = holdLayout(frameOf(640, { archive: ARCHIVE_FULL }), pref);
  holdLayout(frameOf(280, { archive: ARCHIVE_FULL }), pref); // 한껏 줄였다가
  const after = holdLayout(frameOf(640, { archive: ARCHIVE_FULL }), pref);
  assert.deepEqual(after, before);
});

test('예전 유령 메모 높이(500)가 들어와도 보이는 메모는 남은 공간을 넘지 않는다', () => {
  const frame = frameOf(400);
  const layout = holdLayout(frame, 500);
  assertFills(frame, layout);
  assert.equal(layout.todos, TODOS_MIN_H);
  assert.equal(layout.notes, 400 - SPLITTER_H - 34 - TODOS_MIN_H);
});

test('숨긴 영역은 높이 0이고, 둘 다 숨기면 스플리터도 없다', () => {
  assert.deepEqual(holdLayout(frameOf(400, { notes: null }), 200), { todos: 400 - SPLITTER_H - 34, archive: 34, notes: 0 });
  assert.deepEqual(holdLayout(frameOf(400, { archive: null }), 200), { todos: 400 - SPLITTER_H - 200, archive: 0, notes: 200 });
  assert.deepEqual(holdLayout(frameOf(400, { archive: null, notes: null }), 200), { todos: 400, archive: 0, notes: 0 });
});

test('메모 선호 높이가 이상한 값이면 기본값을, 최소보다 작으면 최소를 쓴다', () => {
  assert.equal(holdLayout(frameOf(900), Number.NaN).notes, DEFAULT_NOTES_H);
  assert.equal(holdLayout(frameOf(900), 10).notes, NOTES.min);
});

// ── 아래쪽 테두리 끌기 ───────────────────────────────────────────────

/** 스크린샷 상황: 메모는 한 줄뿐인데 230px, 할 일 4개(목록 전체가 보이는 높이 200) */
function screenshotBase() {
  const bodyH = 330 + SPLITTER_H + 34 + 230;
  return {
    bodyH,
    archive: 34,
    notes: 230,
    todosFit: 200,
    notesFit: 70, // 한 줄 → 최소(90)보다 작음
  };
}

test('아래쪽을 줄이면 메모 빈 곳 → 할 일 빈 곳 → 메모(최소) → 할 일(최소) 순으로 줄어든다', () => {
  const base = screenshotBase();
  const at = (/** @type {number} */ shrink) => bottomDragLayout(base, frameOf(base.bodyH - shrink));

  // ① 메모가 글 높이(최소 90)까지 먼저 줄고 할 일은 그대로
  assert.deepEqual(at(100), { todos: 330, archive: 34, notes: 130 });
  assert.deepEqual(at(140), { todos: 330, archive: 34, notes: 90 });
  // ② 그다음 할 일이 목록이 모두 보이는 높이(200)까지
  assert.deepEqual(at(200), { todos: 270, archive: 34, notes: 90 });
  assert.deepEqual(at(270), { todos: 200, archive: 34, notes: 90 });
  // ③ 메모는 이미 최소 → ④ 할 일이 최소(145)까지 목록을 스크롤로 넣으며 줄어듦
  assert.deepEqual(at(325), { todos: 145, archive: 34, notes: 90 });
  // 마감된 일은 끝까지 사라지지 않습니다
  assert.equal(at(400).archive, 34);
});

test('메모 글이 길면 메모는 먼저 줄지 않고 할 일 빈 곳부터 줄어든다(글 양을 고려)', () => {
  const base = { ...screenshotBase(), notesFit: 400 }; // 메모 글이 칸보다 김
  const at = (/** @type {number} */ shrink) => bottomDragLayout(base, frameOf(base.bodyH - shrink));
  assert.deepEqual(at(130), { todos: 200, archive: 34, notes: 230 }); // 할 일 빈 곳만
  assert.deepEqual(at(200), { todos: 200, archive: 34, notes: 160 }); // 그다음 메모
  assert.deepEqual(at(270), { todos: 200, archive: 34, notes: 90 });
  assert.deepEqual(at(325), { todos: 145, archive: 34, notes: 90 });
});

test('할 일·메모가 최소에 닿은 뒤에야 마감된 일 목록이 줄고 머리글은 남는다', () => {
  const bodyH = 145 + SPLITTER_H + 214 + 90;
  const base = { bodyH, archive: 214, notes: 90, todosFit: 145, notesFit: 90 };
  const frame = (/** @type {number} */ h) => frameOf(h, { archive: ARCHIVE_FULL });
  assert.deepEqual(bottomDragLayout(base, frame(bodyH - 100)), { todos: 145, archive: 114, notes: 90 });
  assert.deepEqual(bottomDragLayout(base, frame(bodyH - 180)), { todos: 145, archive: 34, notes: 90 });
});

test('아래쪽을 늘리면 가려진 마감된 일 → 가려진 할 일 → 가려진 메모 글 → 남는 높이는 메모', () => {
  const bodyH = 145 + SPLITTER_H + 60 + 90;
  const base = { bodyH, archive: 60, notes: 90, todosFit: 250, notesFit: 150 };
  const at = (/** @type {number} */ grow) => bottomDragLayout(base, frameOf(bodyH + grow, { archive: ARCHIVE_FULL }));
  assert.deepEqual(at(100), { todos: 145, archive: 160, notes: 90 });
  assert.deepEqual(at(154), { todos: 145, archive: 214, notes: 90 });
  assert.deepEqual(at(259), { todos: 250, archive: 214, notes: 90 });
  assert.deepEqual(at(319), { todos: 250, archive: 214, notes: 150 });
  assert.deepEqual(at(419), { todos: 250, archive: 214, notes: 250 });
});

test('메모를 숨긴 창은 아래쪽 끌기의 남는 높이를 할 일이 받는다', () => {
  const bodyH = 300 + SPLITTER_H + 34;
  const base = { bodyH, archive: 34, notes: 0, todosFit: 200, notesFit: 0 };
  assert.deepEqual(bottomDragLayout(base, frameOf(bodyH + 50, { notes: null })), { todos: 350, archive: 34, notes: 0 });
  assert.deepEqual(bottomDragLayout(base, frameOf(bodyH - 120, { notes: null })), { todos: 180, archive: 34, notes: 0 });
});

test('같은 끌기 안에서 되돌리면 정확히 시작 배치로 돌아온다', () => {
  const base = screenshotBase();
  const start = bottomDragLayout(base, frameOf(base.bodyH));
  assert.deepEqual(start, { todos: 330, archive: 34, notes: 230 });
  bottomDragLayout(base, frameOf(base.bodyH - 300));
  assert.deepEqual(bottomDragLayout(base, frameOf(base.bodyH)), start);
});

// ── 불변식: 아래쪽 끌기가 끝나 hold로 돌아가도 배치가 바뀌지 않는다 ──────────

/** 재현 가능한 의사 난수 (mulberry32) @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('무작위 상황에서도 끌기 결과는 불변식을 지키고, 끝난 뒤 hold 배치와 한 픽셀도 다르지 않다', () => {
  const rand = rng(20260930);
  const pick = (/** @type {number} */ lo, /** @type {number} */ hi) => lo + Math.floor(rand() * (hi - lo + 1));
  for (let i = 0; i < 4000; i++) {
    const showArchive = rand() < 0.85;
    const showNotes = rand() < 0.85;
    const archive = showArchive ? (() => { const min = pick(28, 40); return { min, natural: min + (rand() < 0.4 ? 0 : pick(1, 200)) }; })() : null;
    const notes = showNotes ? { min: pick(70, 130) } : null;
    const bodyH0 = pick(180, 1100);
    const pref = pick(40, 700);
    const frame0 = frameOf(bodyH0, { archive, notes });
    const start = holdLayout(frame0, pref);
    const base = {
      bodyH: bodyH0,
      archive: start.archive,
      notes: start.notes,
      todosFit: pick(50, 800),
      notesFit: pick(40, 800),
    };
    const frame1 = frameOf(Math.max(60, bodyH0 + pick(-700, 700)), { archive, notes });
    const drag = bottomDragLayout(base, frame1);
    const label = JSON.stringify({ frame0, pref, base, bodyH1: frame1.bodyH, drag });

    assertFills(frame1, drag);
    const mins = TODOS_MIN_H + (archive ? archive.min : 0) + (notes ? notes.min : 0) + (archive || notes ? SPLITTER_H : 0);
    if (archive) {
      assert.ok(drag.archive >= archive.min && drag.archive <= archive.natural, label);
      // 마감된 일이 줄어 있다면 할 일은 최소(또는 그 아래: 창이 최소보다 작을 때)
      if (drag.archive < archive.natural) assert.ok(drag.todos <= TODOS_MIN_H, label);
    }
    if (notes) assert.ok(drag.notes >= notes.min, label);
    if (frame1.bodyH >= mins) assert.ok(drag.todos >= TODOS_MIN_H, label);

    // 끌기가 끝나면 메모 높이를 선호값으로 저장하고 hold로 돌아갑니다 → 결과가 같아야 합니다.
    const after = holdLayout(frame1, notes ? drag.notes : pref);
    if (frame1.bodyH >= mins) assert.deepEqual(after, drag, label);
  }
});

// ── 테두리 판별 ──────────────────────────────────────────────────────

test('위쪽이 그대로면 아래쪽 끌기, 아래쪽이 그대로면 위쪽 끌기로 판별한다', () => {
  const start = { y: 300, height: 1200 };
  assert.equal(classifyResize(start, { y: 300, height: 1100 }), 'bottom');
  assert.equal(classifyResize(start, { y: 301, height: 1300 }), 'bottom'); // 배율 반올림 1px 허용
  assert.equal(classifyResize(start, { y: 400, height: 1100 }), 'top');
  assert.equal(classifyResize(start, { y: 250, height: 1250 }), 'top');
  assert.equal(classifyResize(start, { y: 0, height: 2000 }), 'other'); // 최대화·세로 스냅
  assert.equal(classifyResize(start, { y: 300, height: 1201 }), 'none'); // 너비만 바뀜
  assert.equal(classifyResize(null, { y: 0, height: 1 }), 'other');
  assert.equal(classifyResize({ y: null, height: 1200 }, { y: 300, height: 1000 }), 'other');
});

test('첫 알림이 한 번에 크게 뛰면 최대화·복원·스냅으로 보고, 손 끌기의 작은 걸음은 그대로 둔다', () => {
  assert.equal(isInstantResize(1200, 1190, 2), false); // 200% 화면에서 5px
  assert.equal(isInstantResize(1200, 1500, 2), false); // 150 CSS px (빠른 손 끌기 한 걸음)
  assert.equal(isInstantResize(1200, 2080, 2), true);  // 440 CSS px — 화면 맨 위 창을 최대화
  assert.equal(isInstantResize(660, 400, 1), true);    // 복원으로 한 번에 260px 줄어듦
  assert.equal(isInstantResize(null, 400, 1), false);
  assert.equal(isInstantResize(660, 400, 0), true);    // 배율을 모르면 1로 봄
});

// ── 창 최소 높이 ─────────────────────────────────────────────────────

test('창 최소 높이는 고정 머리 + 각 영역 최소이고, 화면 80%를 넘지 않는다', () => {
  const frame = frameOf(500);
  assert.equal(minWindowHeight({ fixedChromeH: 92.4, frame, workAreaH: 1040 }), 93 + 145 + SPLITTER_H + 34 + 90);
  assert.equal(minWindowHeight({ fixedChromeH: 92, frame: frameOf(500, { archive: null, notes: null }), workAreaH: 1040 }), 92 + 145);
  assert.equal(minWindowHeight({ fixedChromeH: 92, frame, workAreaH: 400 }), 320);
  // 화면이 아주 작아도 머리 + 할 일 최소보다 작게 잡지는 않습니다
  assert.equal(minWindowHeight({ fixedChromeH: 92, frame, workAreaH: 200 }), 92 + 145);
});

// ── 메모 선호 높이 옮기기 ─────────────────────────────────────────────

test('새 저장값이 있으면 그대로, 없으면 예전 notesHeight를 실제로 보이던 140~240으로 옮긴다', () => {
  assert.equal(resolveNotesPreference(300, 500), 300);
  assert.equal(resolveNotesPreference(88.6, 500), 89);
  assert.equal(resolveNotesPreference(undefined, 500), 240); // 예전 유령 높이
  assert.equal(resolveNotesPreference(undefined, 180), 180);
  assert.equal(resolveNotesPreference(undefined, 0), 140); // 예전엔 CSS 최소 140으로 보였음
  assert.equal(resolveNotesPreference(undefined, undefined), DEFAULT_NOTES_H);
  assert.equal(resolveNotesPreference(0, 180), 180);
  assert.equal(resolveNotesPreference('200', 'x'), DEFAULT_NOTES_H);
  assert.equal(resolveNotesPreference(Number.POSITIVE_INFINITY, 200), 200);
});

// ── 스플리터 ─────────────────────────────────────────────────────────

test('스플리터는 할 일 최소 아래로 창을 줄이지 않고, 이미 작으면 더 줄이지 않는다', () => {
  const base = { startWindowH: 660, startTodosH: 330, todosMin: 145, maxWindowH: 1040 };
  assert.equal(splitterWindowHeight({ ...base, pointerDelta: -100 }), 560);
  assert.equal(splitterWindowHeight({ ...base, pointerDelta: -185 }), 475);
  assert.equal(splitterWindowHeight({ ...base, pointerDelta: -400 }), 475); // 최소에서 멈춤
  assert.equal(splitterWindowHeight({ ...base, pointerDelta: 120 }), 780);
  assert.equal(splitterWindowHeight({ ...base, pointerDelta: 900 }), 1040); // 화면 높이까지
  assert.equal(splitterWindowHeight({ ...base, startTodosH: 120, pointerDelta: -50 }), 660); // 이미 최소보다 작음
  assert.equal(splitterWindowHeight({ ...base, startTodosH: 120, pointerDelta: 30 }), 690);
  assert.equal(splitterWindowHeight({ ...base, startWindowH: 1200, pointerDelta: 10 }), 1200); // 이미 화면보다 크면 줄이지 않음
});
