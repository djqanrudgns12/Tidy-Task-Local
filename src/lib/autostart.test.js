import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchAtStartup, wantsLaunchAtStartup } from './autostart.js';

/** Windows 등록과 저장된 선택을 흉내 냅니다. */
function fake({ enabled = false, choice = /** @type {boolean | null} */ (null), failSave = false, stuck = false } = {}) {
  const state = { enabled, choice, calls: /** @type {string[]} */ ([]) };
  const api = createLaunchAtStartup({
    isEnabled: async () => state.enabled,
    enable: async () => { state.calls.push('enable'); if (!stuck) state.enabled = true; },
    disable: async () => { state.calls.push('disable'); if (!stuck) state.enabled = false; },
    readChoice: async () => state.choice,
    saveChoice: async (value) => {
      if (failSave) throw new Error('저장 실패');
      state.choice = value;
    },
  });
  return { state, api };
}

test('고른 적이 없으면 자동 실행은 켜짐이 기본이다', () => {
  assert.equal(wantsLaunchAtStartup(null), true);
  assert.equal(wantsLaunchAtStartup(undefined), true);
  assert.equal(wantsLaunchAtStartup(true), true);
  assert.equal(wantsLaunchAtStartup(false), false);
});

test('시작할 때: 고른 적이 없고 등록이 빠져 있으면 등록한다', async () => {
  const { state, api } = fake();
  assert.equal(await api.ensure(), true);
  assert.equal(state.enabled, true);
  // 선택은 적지 않는다 — 사용자가 직접 고른 것이 아니다
  assert.equal(state.choice, null);
});

test('시작할 때: 이미 등록돼 있으면 다시 등록하지 않는다', async () => {
  const { state, api } = fake({ enabled: true });
  assert.equal(await api.ensure(), true);
  assert.deepEqual(state.calls, []);
});

test('시작할 때: 사용자가 껐으면 다시 켜지 않는다', async () => {
  const { state, api } = fake({ choice: false });
  assert.equal(await api.ensure(), false);
  assert.equal(state.enabled, false);
  assert.deepEqual(state.calls, []);
});

test('끄면 등록을 풀고 선택을 저장한다 — 다음 시작에도 꺼진 채다', async () => {
  const { state, api } = fake({ enabled: true });
  assert.equal(await api.set(false), false);
  assert.equal(state.enabled, false);
  assert.equal(state.choice, false);
  assert.equal(await api.ensure(), false);
  assert.equal(state.enabled, false);
});

test('다시 켜면 등록하고 선택을 저장한다', async () => {
  const { state, api } = fake({ choice: false });
  assert.equal(await api.set(true), true);
  assert.equal(state.enabled, true);
  assert.equal(state.choice, true);
});

test('이미 그 상태면 등록은 건드리지 않고 선택만 맞춘다', async () => {
  const { state, api } = fake({ enabled: true });
  await api.set(true);
  assert.deepEqual(state.calls, []);
  assert.equal(state.choice, true);
});

test('선택을 저장하지 못하면 등록을 되돌린다', async () => {
  const { state, api } = fake({ enabled: true, failSave: true });
  await assert.rejects(api.set(false));
  // 끈 채로 두면 다음 시작 때 "고른 적 없음"으로 보고 조용히 다시 켜진다
  assert.equal(state.enabled, true);
  assert.deepEqual(state.calls, ['disable', 'enable']);
});

test('등록이 실제로 바뀌지 않으면 실패로 알리고 선택을 저장하지 않는다', async () => {
  const { state, api } = fake({ enabled: true, stuck: true });
  await assert.rejects(api.set(false));
  assert.equal(state.choice, null);
});

test('화면에 보일 상태는 실제 등록 여부를 따른다', async () => {
  assert.equal(await fake({ enabled: true, choice: false }).api.read(), true);
  assert.equal(await fake({ enabled: false, choice: true }).api.read(), false);
});

test('등록 여부를 확인할 수 없으면 저장된 선택을 따른다', async () => {
  const broken = (/** @type {boolean | null} */ choice) => createLaunchAtStartup({
    isEnabled: async () => { throw new Error('레지스트리 읽기 실패'); },
    enable: async () => {},
    disable: async () => {},
    readChoice: async () => choice,
    saveChoice: async () => {},
  });
  assert.equal(await broken(null).read(), true);
  assert.equal(await broken(false).read(), false);
});
