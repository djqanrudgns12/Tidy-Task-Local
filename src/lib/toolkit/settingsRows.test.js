import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_ROWS, settingsRowFor } from './settingsRows.js';
import { TOOL_IDS, DEFAULT_TOOL_ORDER } from './preferences.js';
import { TOOL_REGISTRY } from './registry.js';

// 6.0.1 회귀: 'dday'가 도구 목록에만 들어가고 설정 줄 표에 빠져 설정 창이 그리다 멈췄습니다.
test('툴바에 올 수 있는 모든 도구에 설정 줄(이름·설명)이 있다', () => {
  const rowIds = new Set(TOOL_ROWS.map((row) => row.id));
  for (const id of [...TOOL_IDS, ...TOOL_REGISTRY.map((tool) => tool.id)]) {
    assert.ok(rowIds.has(id), `설정 줄이 없는 도구: ${id}`);
  }
  // 설정 창이 실제로 그리는 순서 목록('external'은 따로 그림)도 모두 덮어야 합니다.
  for (const id of DEFAULT_TOOL_ORDER.filter((id) => id !== 'external')) {
    assert.ok(rowIds.has(id), `순서 목록에만 있는 도구: ${id}`);
  }
});

test('설정 줄은 도구마다 하나이고 이름·설명이 비어 있지 않다', () => {
  const ids = TOOL_ROWS.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const row of TOOL_ROWS) {
    assert.ok(row.title.trim(), `${row.id} 이름`);
    assert.ok(row.hint.trim(), `${row.id} 설명`);
  }
});

test('표에 없는 도구도 설정 창을 멈추지 않고 이름으로 대신 그린다', () => {
  assert.deepEqual(settingsRowFor('dday'), TOOL_ROWS.find((row) => row.id === 'dday'));
  const unknown = settingsRowFor('future-tool');
  assert.equal(unknown.id, 'future-tool');
  assert.equal(unknown.title, 'future-tool');
  assert.equal(unknown.hint, '');
});
