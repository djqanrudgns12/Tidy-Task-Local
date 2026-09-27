import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.js';
import { resultModel, resultVisibilityOptions } from './result.js';
import { drawResult, fitAgendaText, resultHighlights, IMAGE_W, IMAGE_H, fileNameFor } from './resultImage.js';
import { createCheckEntry } from './devCheck.js';
import { LIMITS, TYPES, VISIBILITIES, normalizeConfig, normalizeSession, sessionFromConfig } from './model.js';

// 저장 이미지의 실제 그리기 명령을 기록해 공개 범위와 누락·잘림을 검증합니다.
function recordingCanvas() {
  /** @type {{value:string,x:number,y:number,color:string,font:string}[]} */ const texts = [];
  /** @type {unknown[][]} */ const images = [];
  /** @type {{x:number,y:number,w:number,h:number}[]} */ const boxes = [];
  let dx = 0, dy = 0;
  /** @type {{dx:number,dy:number}[]} */ const states = [];
  const g = new Proxy({
    font: '700 20px sans-serif',
    fillStyle: '',
    save() { states.push({ dx, dy }); },
    restore() { const state = states.pop(); if (state) { dx = state.dx; dy = state.dy; } },
    /** @param {number} x @param {number} y */
    translate(x, y) { dx += x; dy += y; },
    /** @param {string} value */
    measureText(value) { return { width: [...String(value)].length * (parseFloat(this.font.split(' ')[1]) || 20) * .8 }; },
    /** @param {string} value @param {number} x @param {number} y */
    fillText(value, x, y) { texts.push({ value: String(value), x: x + dx, y: y + dy, color: this.fillStyle, font: this.font }); },
    /** @param {unknown[]} args */
    drawImage(...args) { images.push(args); },
    /** @param {number} x @param {number} y @param {number} w @param {number} h */
    roundRect(x, y, w, h) { boxes.push({ x: x + dx, y: y + dy, w, h }); },
  }, { get(target, key) { return key in target ? Reflect.get(target, key) : () => {}; } });
  return { canvas: /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ ({ width: 0, height: 0, getContext: () => g })), g, texts, images, boxes };
}
const model = (/** @type {string} */ name) => resultModel(/** @type {NonNullable<ReturnType<typeof fixture>['archive']>} */ (fixture(name).archive).entries[0]);

test('기록 공개 범위는 원래 발표 설정과 독립적이며 모든 투표 방식의 PNG에 적용됩니다', () => {
  for (const type of TYPES) for (const storedVisibility of VISIBILITIES[type]) {
    const entry = createCheckEntry({ type, visibility: storedVisibility, count: type === 'yesno' ? 5 : 9, scenario: 'mixed' });
    const original = structuredClone(entry);
    const teacher = resultModel(entry, { teacher: true });
    assert.deepEqual(resultVisibilityOptions(type).map(o => o.value), VISIBILITIES[type]);
    const filenames = new Set();
    for (const visibility of VISIBILITIES[type]) {
      const m = resultModel(entry, { visibility }), r = recordingCanvas();
      assert.equal(m.visibility, visibility);
      assert.equal(m.showCounts, visibility === 'all');
      assert.deepEqual(m.winners, teacher.winners);
      assert.deepEqual(m.pendingTie, teacher.pendingTie);
      if (visibility === 'all') assert.deepEqual(m, teacher);
      else if (type !== 'yesno') {
        assert.equal(m.validVotes, null);
        assert.equal(m.abstain, null);
        assert(m.rows.every(row => row.count === null && row.percent === null));
        if (visibility === 'winner') assert.deepEqual(m.rows, []);
      }
      drawResult(r.canvas, m, { font: 'sans-serif', images: {}, scale: 2 });
      assert.equal(r.canvas.width, 3200);
      assert.equal(r.canvas.height, 1800);
      assert.equal(r.texts.some(t => /\d+표|\d+%/.test(t.value)), visibility === 'all', `${type}/${storedVisibility} → ${visibility}`);
      filenames.add(fileNameFor(m));
      assert.deepEqual(entry, original);
      assert.equal(resultModel(entry).visibility, storedVisibility);
    }
    assert.equal(filenames.size, VISIBILITIES[type].length);
    // 다른 투표 방식의 공개 범위나 알 수 없는 값은 원래 범위를 유지합니다.
    assert.equal(resultModel(entry, { visibility: type === 'yesno' ? 'winner' : 'result' }).visibility, storedVisibility);
    assert.equal(resultModel(entry, { visibility: 'unknown' }).visibility, storedVisibility);
  }
});

test('동점·전원 기권·결선 기록도 공개 범위를 바꿔도 집계와 최종 당선자는 유지됩니다', () => {
  const entries = ['result-nine-tie', 'result-abstain', 'result-mixed'].map(name => {
    const entry = fixture(name).archive?.entries[0];
    assert.ok(entry);
    return entry;
  });
  /** @type {import('./archive.js').Entry} */
  const first = createCheckEntry({ count: 3, seats: 2, scenario: 'boundary', visibility: 'winner' });
  first.runoffs = [{
    id: 'runoff-test', finishedOn: first.finishedOn,
    config: { ...first.config, items: first.config.items.slice(1), rules: { ...first.config.rules, seats: 1 } },
    ballots: [{ id: 'r1', p: ['i2'], a: 0 }, { id: 'r2', p: ['i2'], a: 0 }, { id: 'r3', p: ['i3'], a: 0 }],
  }];
  entries.push(first);
  for (const entry of entries) {
    const original = structuredClone(entry), teacher = resultModel(entry, { teacher: true });
    for (const visibility of ['all', 'rank', 'winner']) {
      const m = resultModel(entry, { visibility }), r = recordingCanvas();
      assert.deepEqual(m.winners, teacher.winners);
      assert.deepEqual(m.pendingTie, teacher.pendingTie);
      assert.equal(m.noneVoted, teacher.noneVoted);
      assert.equal(m.round, teacher.round);
      assert.equal(m.participants, teacher.participants);
      drawResult(r.canvas, m, { font: 'sans-serif', images: {} });
      assert.equal(r.texts.some(t => /\d+표|\d+%/.test(t.value)), visibility === 'all');
    }
    assert.deepEqual(entry, original);
  }
  const last = resultModel(first, { visibility: 'all' });
  assert.deepEqual(last.winners.map(w => w.id), ['i1', 'i2']);
  assert.deepEqual(last.rows.map(r => r.count), [2, 1]);
  assert.equal(last.validVotes, 3);
  assert.equal(last.round, 1);
});

test('동점 후보 9명 모두 결과 카드와 그림에 포함됩니다', () => {
  const m = model('result-nine-tie'), r = recordingCanvas();
  assert.equal(resultHighlights(m).length, 9);
  const images = /** @type {Record<string,HTMLImageElement>} */ (/** @type {unknown} */ (Object.fromEntries(m.pendingTie.map(it => [it.character, { naturalWidth: 320, naturalHeight: 320 }]))));
  drawResult(r.canvas, m, { font: 'sans-serif', images });
  assert.equal(r.images.length, 18);
  for (const it of m.pendingTie) assert(r.texts.some(t => t.value === `기호 ${it.number}`));
  assert(!r.texts.some(t => /결선 투표|정해요|필요/.test(t.value)));
  assert(!r.texts.some(t => /동점 결과|Tidy/.test(t.value)));
});

test('의견 동점도 세 항목의 기호·이름·득표를 유지합니다', () => {
  const m = model('result-opinion-tie'), r = recordingCanvas();
  drawResult(r.canvas, m, { font: 'sans-serif', images: {} });
  assert.equal(resultHighlights(m).length, 3);
  assert.equal(r.texts.filter(t => t.value === '우리 반의 약속').length, 6);
  assert.equal(r.texts.filter(t => t.value === '2표  ·  33%').length, 3);
});

test('순위·당선자·찬반 결과만 공개 시 숨긴 득표가 출력되지 않습니다', () => {
  for (const name of ['result-rank', 'result-winner', 'result-yesno-hidden']) {
    const m = model(name), r = recordingCanvas();
    drawResult(r.canvas, m, { font: 'sans-serif', images: {} });
    assert(!r.texts.some(t => /\d+표|\d+%/.test(t.value)), name);
    assert(r.texts.some(t => t.value === '총 투표자'));
    assert(r.texts.some(t => t.value === `${m.participants}명`));
    if (name === 'result-winner') assert.equal(m.rows.length, 0);
  }
});

test('모든 결과와 최대 안건의 텍스트·카드가 이미지 경계 안에 있습니다', () => {
  for (const name of ['result', 'result-tie', 'result-mixed', 'result-nine-tie', 'result-opinion-tie', 'result-abstain', 'result-yesno', 'result-yesno-hidden']) {
    const m = model(name), r = recordingCanvas();
    drawResult(r.canvas, m, { font: 'sans-serif', images: {}, scale: 2 });
    assert.equal(r.canvas.width, IMAGE_W * 2); assert.equal(r.canvas.height, IMAGE_H * 2);
    for (const t of r.texts) assert(t.x >= 0 && t.x <= IMAGE_W && t.y >= 0 && t.y <= IMAGE_H, `${name}: ${t.value}`);
    for (const b of r.boxes) assert(b.w >= 0 && b.h >= 0 && b.x >= 0 && b.y >= 0 && b.x + b.w <= IMAGE_W && b.y + b.h <= IMAGE_H, name);
    assert(!r.texts.some(t => /동점 결과|개표 완료|Tidy/.test(t.value)), name);
    assert(r.texts.some(t => t.value === '총 투표자' && t.y > 818), name);
    if (m.showCounts) {
      const footer = r.texts.filter(t => t.y > 818);
      const validLabel = m.type === 'yesno' && m.agendas.length > 1 ? '유효표 합계' : '유효표';
      const total = footer.find(t => t.value === '총 투표자');
      const valid = footer.find(t => t.value === validLabel);
      const abstain = footer.find(t => t.value === (m.type === 'yesno' && m.agendas.length > 1 ? '기권 합계' : '기권'));
      assert(total && valid && abstain && total.x < valid.x && valid.x < abstain.x, name);
      assert(footer.some(t => t.value === `${m.validVotes}표`), name);
      if (m.type !== 'yesno') assert(footer.some(t => t.value === '※ 득표율은 유효 선택 수 기준'), name);
      assert(r.texts.some(t => t.value === `${m.abstain}표` && t.y > 818), name);
      assert(r.texts.some(t => t.value === (m.type === 'yesno' && m.agendas.length > 1 ? '기권 합계' : '기권') && t.y > 818), name);
    }
  }
});

test('0표는 득표 막대를 만들지 않으며 파일명은 안전하게 정리됩니다', () => {
  const m = model('result-abstain'), r = recordingCanvas();
  drawResult(r.canvas, m, { font: 'sans-serif', images: {} });
  assert(!r.boxes.some(b => b.h === 8 && b.w > 0 && b.w < 334));
  assert(!fileNameFor({ ...m, title: '결과:/\\?*"<>|' }).match(/[:/\\?*"<>|]/));
});

test('긴 안건은 만들기·재시작·기록 정규화에서 문장 끝을 보존합니다', () => {
  const label = '우리 반이 함께 정하는 학급 생활 규칙을 다음 달부터 적용하기로 하고 서로의 의견을 존중하며 실천하기';
  assert(label.length > 40 && label.length <= LIMITS.agendaMax);
  const config = normalizeConfig({ type: 'yesno', title: '학급회의', agendas: [{ id: 'a1', text: label }] });
  assert.equal(config.agendas[0].text, label);
  const saved = normalizeSession(sessionFromConfig(config, 'long_agenda', '2026-09-27'));
  assert('agendas' in saved);
  assert.equal(saved.agendas[0].text, label);
  const entry = createCheckEntry({ type: 'yesno', count: 5, longNames: true });
  assert(entry.config.agendas.every(a => a.text.endsWith('적용하기')));
});

test('최대 길이 안건 5개도 전부 읽히고 각 제목 칸의 폭과 높이를 지킵니다', () => {
  const { g } = recordingCanvas();
  for (const label of ['우리 반이 함께 정하는 학급 생활 규칙을 다음 달부터 적용하기', '가'.repeat(LIMITS.agendaMax), '가나다라마바 '.repeat(17).trim()]) {
    const fit = fitAgendaText(/** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (g)), label, 'sans-serif', 810, 72, 34);
    assert.equal(fit.lines.join('').replace(/\s/g, ''), label.replace(/\s/g, ''));
    assert(fit.lines.length * fit.lineHeight <= 72);
    g.font = `700 ${fit.size}px sans-serif`;
    assert(fit.lines.every(line => g.measureText(line).width <= 810));
    assert(fit.size >= 17);
  }
  const fit = fitAgendaText(/** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (g)), '짧은 안건', 'sans-serif', 810, 72);
  assert.equal(fit.lines.length, 1);
  assert.equal(fit.size, 34);
});

test('폭이 조금 부족하면 한 줄을 유지하고 긴 제목의 줄바꿈은 가용 폭을 끝까지 사용합니다', () => {
  const { g } = recordingCanvas();
  const context = /** @type {CanvasRenderingContext2D} */ (/** @type {unknown} */ (g));
  const near = fitAgendaText(context, '가'.repeat(10), 'sans-serif', 230, 90, 30);
  assert.equal(near.lines.length, 1);
  assert(near.size >= 27);
  const label = '학급 생활 규칙을 서로 존중하고 함께 지키며 다음 달부터 적용하기';
  const fit = fitAgendaText(context, label, 'sans-serif', 480, 130, 30);
  assert(fit.lines.length > 1);
  g.font = `700 ${fit.size}px sans-serif`;
  // 다음 어절까지 들어갈 공간이 있는데 먼저 줄바꿈해서는 안 됩니다.
  for (let i = 0; i < fit.lines.length - 1; i++) {
    const nextWord = fit.lines[i + 1].split(' ')[0];
    assert(g.measureText(`${fit.lines[i]} ${nextWord}`).width > 480);
  }
  assert.equal(fit.lines.join(' '), label);
});

test('찬성은 파랑·반대는 빨강이며 최다 득표 도장은 통과 판정과 별개입니다', () => {
  const entry = createCheckEntry({ type: 'yesno', count: 5, scenario: 'mixed', passRule: 'twoThirds' });
  const m = resultModel(entry), r = recordingCanvas();
  // 찬성이 반대보다 많아도 3분의 2에 못 미치면 부결입니다.
  m.agendas[4] = { ...m.agendas[4], yes: 13, no: 11, abstain: 0, yesPercent: 54, noPercent: 46, passed: false, tie: false };
  drawResult(r.canvas, m, { font: 'sans-serif', images: {} });
  assert(r.texts.filter(t => t.value === '찬성').every(t => t.color === '#2868B5'));
  assert(r.texts.filter(t => t.value === '반대').every(t => t.color === '#BD404B'));
  const stamps = r.texts.filter(t => t.value === '최다 득표');
  assert.equal(stamps.length, 3); // 전원 찬성·전원 반대·찬성 우세만. 동률과 전원 기권은 도장 없음.
  assert.deepEqual(stamps.map(t => t.color), ['#2868B5', '#BD404B', '#2868B5']);
  const last = r.texts.filter(t => t.y > 258 + 4 * (558 / 5) && t.y < 818);
  assert(last.some(t => t.value === '부결'));
  assert(last.some(t => t.value === '최다 득표' && t.color === '#2868B5'));
});
