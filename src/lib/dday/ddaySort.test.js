import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  beginOrderOverlay,
  canStartDdaySort,
  createOrderOverlayState,
  isOverlayAligned,
  projectActiveDdays,
  reconcileOverlayWithSnapshot,
  settleOrderOverlay,
} from './ddaySort.js';

/**
 * @typedef {{
 *   tagName: string,
 *   attrs: Record<string, string | boolean>,
 *   parent: MockEl | null,
 *   children: MockEl[],
 *   hasAttribute: (name: string) => boolean,
 *   contains: (target: unknown) => boolean,
 *   closest: (selector: string) => MockEl | null,
 * }} MockEl
 */

/**
 * 최소 DOM 요소 모형: parent 체인과 attrs 기반 closest/contains 지원
 * @param {string} tag
 * @param {Record<string, string | boolean>} [attrs]
 * @param {MockEl | null} [parent]
 * @returns {MockEl}
 */
function mockEl(tag, attrs = {}, parent = null) {
  /** @type {MockEl} */
  const el = {
    tagName: tag.toUpperCase(),
    attrs: { ...attrs },
    parent,
    children: [],
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) && this.attrs[name] !== false;
    },
    contains(target) {
      /** @type {any} */
      let cur = target;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parent;
      }
      return false;
    },
    closest(selector) {
      const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
      /** @type {MockEl | null} */
      let cur = this;
      while (cur) {
        /** @type {MockEl} */
        const node = cur;
        if (parts.some((sel) => matchesSelector(node, sel))) return node;
        cur = node.parent;
      }
      return null;
    },
  };
  if (parent) parent.children.push(el);
  return el;
}

/**
 * @param {MockEl} el
 * @param {string} sel
 * @returns {boolean}
 */
function matchesSelector(el, sel) {
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    const eq = inner.indexOf('=');
    if (eq >= 0) {
      const k = inner.slice(0, eq).trim();
      const v = inner.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      return el.attrs[k] === v;
    }
    return el.hasAttribute(inner);
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

test('canStartDdaySort enforces deny-by-default on interactive controls and allows title + non-control surface', () => {
  const card = mockEl('div', { class: 'dd-row' });
  const iconSvg = mockEl('svg', {}, card);
  const badge = mockEl('span', { class: 'dd-counter' }, card);

  const checkBtn = mockEl('button', { 'data-dday-no-sort': '' }, card);
  const checkSvg = mockEl('svg', {}, checkBtn);

  const titleBtn = mockEl('button', { 'data-dday-sortable': '' }, card);
  const titleSpan = mockEl('span', {}, titleBtn);

  const editBtn = mockEl('button', { 'data-dday-no-sort': '' }, card);
  const unmarkedBtn = mockEl('button', {}, card);
  const inputEl = mockEl('input', {}, card);

  // .dd-capsule 래퍼 div에 data-dday-no-sort가 있어 2px 틈·세그먼트 모두 차단
  const capsuleWrap = mockEl('div', { 'data-dday-no-sort': '' }, card);
  const segBtn = mockEl('button', { 'data-dday-no-sort': '' }, capsuleWrap);

  const outsideEl = mockEl('div', {}, null);

  assert.equal(canStartDdaySort(card, card), true);
  assert.equal(canStartDdaySort(iconSvg, card), true);
  assert.equal(canStartDdaySort(badge, card), true);
  assert.equal(canStartDdaySort(titleBtn, card), true);
  assert.equal(canStartDdaySort(titleSpan, card), true);

  assert.equal(canStartDdaySort(checkBtn, card), false);
  assert.equal(canStartDdaySort(checkSvg, card), false);
  assert.equal(canStartDdaySort(editBtn, card), false);
  assert.equal(canStartDdaySort(capsuleWrap, card), false);
  assert.equal(canStartDdaySort(segBtn, card), false);
  assert.equal(canStartDdaySort(unmarkedBtn, card), false);
  assert.equal(canStartDdaySort(inputEl, card), false);
  assert.equal(canStartDdaySort(outsideEl, card), false);
});

test('order overlay reducer handles back-to-back drags, isUpdateFrozen acks, timeout late arrival, concurrent adds and multi-window isolation', () => {
  /** @param {string[]} ids */
  const mkItems = (ids) => ids.map((id, order) => ({ id, order }));

  // 1. 연속 2회 빠른 드래그: ack#1/windowUpdated#1이 도착해도 최신 2회차 오버레이를 덮지 않음
  let st = createOrderOverlayState();
  const d1 = beginOrderOverlay(st, 'main', ['b', 'a', 'c']);
  st = d1.state;
  const d2 = beginOrderOverlay(st, 'main', ['b', 'c', 'a']);
  st = d2.state;

  st = reconcileOverlayWithSnapshot(st, 'main', ['b', 'a', 'c']);
  assert.deepEqual(st.byLabel.main?.ids, ['b', 'c', 'a']);

  const ack1 = settleOrderOverlay(st, { label: 'main', token: d1.token, ok: true, ackActiveIds: ['b', 'a', 'c'] });
  assert.equal(ack1.status, 'stale');
  assert.equal(ack1.notifyFailure, false);
  st = ack1.state;
  assert.deepEqual(st.byLabel.main?.ids, ['b', 'c', 'a']);

  const ack2 = settleOrderOverlay(st, { label: 'main', token: d2.token, ok: true, ackActiveIds: ['b', 'c', 'a'] });
  assert.equal(ack2.status, 'committed');
  assert.equal(ack2.state.byLabel.main, undefined);

  // 2. isUpdateFrozen(ok: true + 옛 스냅샷 회신): 성공으로 오인하지 않고 오버레이 해제 + 실패 안내
  const frozenStart = beginOrderOverlay(createOrderOverlayState(), 'main', ['c', 'a', 'b']);
  const frozenSettled = settleOrderOverlay(frozenStart.state, {
    label: 'main',
    token: frozenStart.token,
    ok: true,
    ackActiveIds: ['a', 'b', 'c'],
  });
  assert.equal(frozenSettled.status, 'reverted');
  assert.equal(frozenSettled.notifyFailure, true);
  assert.equal(frozenSettled.state.byLabel.main, undefined);

  // 3. 1500ms 타임아웃(ok: false) 뒤 늦은 windowUpdated 도착 시 진동 없이 권위 스냅샷 반영
  const timedOut = beginOrderOverlay(createOrderOverlayState(), 'main', ['b', 'a', 'c']);
  const settledTimeout = settleOrderOverlay(timedOut.state, {
    label: 'main',
    token: timedOut.token,
    ok: false,
    ackActiveIds: null,
  });
  assert.equal(settledTimeout.status, 'reverted');
  assert.equal(settledTimeout.notifyFailure, true);
  assert.equal(settledTimeout.state.byLabel.main, undefined);

  // 4. 드래그/대기 중 항목 추가(d)와 삭제(b): projectActiveDdays가 기존 순서를 유지하고 새 ID를 뒤에 붙임
  const pending = beginOrderOverlay(createOrderOverlayState(), 'main', ['c', 'a', 'b']);
  const projected = projectActiveDdays(mkItems(['a', 'c', 'd']), pending.state.byLabel.main.ids);
  assert.deepEqual(projected.map((x) => x.id), ['c', 'a', 'd']);
  assert.equal(isOverlayAligned(['c', 'a', 'd'], pending.state.byLabel.main.ids), true);
  const reconciledAfterAdd = reconcileOverlayWithSnapshot(pending.state, 'main', ['c', 'a', 'd']);
  assert.equal(reconciledAfterAdd.byLabel.main, undefined);

  // 5. 멀티 창 격리: main과 note-1 오버레이가 서로 간섭하지 않음
  let multi = createOrderOverlayState();
  const m1 = beginOrderOverlay(multi, 'main', ['b', 'a']);
  const n1 = beginOrderOverlay(m1.state, 'note-1', ['x', 'y']);
  multi = n1.state;
  const n1Done = settleOrderOverlay(multi, { label: 'note-1', token: n1.token, ok: true, ackActiveIds: ['x', 'y'] });
  assert.equal(n1Done.status, 'committed');
  assert.deepEqual(n1Done.state.byLabel.main?.ids, ['b', 'a']);
});

/**
 * Svelte 템플릿에서 `<button ...>` 여는 태그를 중괄호·따옴표를 고려해 추출합니다.
 * @param {string} source
 * @returns {string[]}
 */
function extractOpeningButtonTags(source) {
  /** @type {string[]} */
  const tags = [];
  const tplEnd = source.indexOf('<style>');
  const html = tplEnd >= 0 ? source.slice(0, tplEnd) : source;
  let idx = 0;
  while (idx < html.length) {
    const start = html.indexOf('<button', idx);
    if (start < 0) break;
    let i = start + 7;
    let braceDepth = 0;
    /** @type {string | null} */
    let quote = null;
    while (i < html.length) {
      const ch = html[i];
      if (quote) {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          quote = ch;
        } else if (ch === '{') {
          braceDepth += 1;
        } else if (ch === '}') {
          braceDepth = Math.max(0, braceDepth - 1);
        } else if (ch === '>' && braceDepth === 0) {
          tags.push(html.slice(start, i + 1));
          idx = i + 1;
          break;
        }
      }
      i += 1;
    }
    if (i >= html.length) break;
  }
  return tags;
}

test('DdayRowCard static audit: every <button> declares data-dday-sortable or data-dday-no-sort', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const cardPath = resolve(here, '../../components/dday/DdayRowCard.svelte');
  const src = readFileSync(cardPath, 'utf8');
  const buttons = extractOpeningButtonTags(src);
  assert.equal(buttons.length, 7);
  for (const tag of buttons) {
    const hasMarker = /\bdata-dday-sortable\b/.test(tag) || /\bdata-dday-no-sort\b/.test(tag);
    assert.equal(
      hasMarker,
      true,
      `DdayRowCard.svelte의 <button> 태그에 data-dday-sortable 또는 data-dday-no-sort가 누락되었습니다:\n${tag}`,
    );
  }
});
