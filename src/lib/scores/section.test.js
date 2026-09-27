import test from 'node:test';
import assert from 'node:assert/strict';
import { createSection } from './section.js';

/** 메모리 저장소. fail·conflict를 끼워 넣어 흐름을 시험합니다. */
function fakeAdapter() {
  const sections = /** @type {Record<string,{revision:number,data:any}>} */ ({});
  const api = {
    writes: 0,
    failNext: false,
    /** @type {(()=>void)|null} */ beforeWrite: null,
    gate: /** @type {Promise<void>|null} */ (null),
    sections,
    async readStore() {
      return { sections: JSON.parse(JSON.stringify(sections)), readOnly: false, notice: null };
    },
    /** @param {string} _s @param {string} name @param {number} expected @param {any} data */
    async writeSection(_s, name, expected, data) {
      if (api.gate) await api.gate;
      api.beforeWrite?.();
      api.beforeWrite = null;
      if (api.failNext) {
        api.failNext = false;
        throw new Error('디스크 오류');
      }
      const current = sections[name]?.revision ?? 0;
      if (current !== expected) throw new Error(`CONFLICT:${current}`);
      api.writes++;
      sections[name] = { revision: current + 1, data: JSON.parse(JSON.stringify(data)) };
      return current + 1;
    },
  };
  return api;
}
const normalize = (/** @type {any} */ raw) => ({ n: Number.isFinite(raw?.n) ? raw.n : 0, tag: raw?.tag ?? '' });
const inc = (/** @type {{n:number,tag:string}} */ d) => ({ ...d, n: d.n + 1 });

test('rapid mutations show immediately and coalesce into few writes', async () => {
  const adapter = fakeAdapter();
  /** @type {() => void} */ let release = () => {};
  adapter.gate = new Promise((r) => (release = r));
  const seen = /** @type {number[]} */ ([]);
  const client = createSection({ store: 'scoreboard', section: 'group', normalize, adapter, onChange: (d) => seen.push(d.n) });
  await client.load();
  for (let i = 0; i < 20; i++) client.mutate(inc);
  assert.equal(client.data.n, 20);
  assert.equal(seen.at(-1), 20);
  release();
  adapter.gate = null;
  await client.settle();
  assert.equal(adapter.sections.group.data.n, 20);
  assert.ok(adapter.writes <= 2, `writes=${adapter.writes}`);
});

test('conflict re-reads and re-applies pending changes on top', async () => {
  const adapter = fakeAdapter();
  adapter.sections.shared = { revision: 1, data: { n: 5, tag: '' } };
  const client = createSection({ store: 'scoreboard', section: 'shared', normalize, adapter });
  await client.load();
  // 다른 창이 먼저 저장한 것처럼 끼워 넣습니다.
  adapter.beforeWrite = () => { adapter.sections.shared = { revision: 2, data: { n: 5, tag: '다른 창' } }; };
  client.mutate(inc);
  await client.settle();
  assert.deepEqual(adapter.sections.shared.data, { n: 6, tag: '다른 창' });
  assert.equal(client.data.tag, '다른 창');
});

test('failed write rolls back and reports', async () => {
  const adapter = fakeAdapter();
  let error = '';
  const client = createSection({ store: 'thermometer', section: 'main', normalize, adapter, onError: (m) => (error = m) });
  await client.load();
  client.mutate(inc);
  await client.settle();
  adapter.failNext = true;
  client.mutate(inc);
  assert.equal(client.data.n, 2);
  await client.settle();
  assert.equal(client.data.n, 1);
  assert.match(error, /저장하지 못했어요/);
  client.mutate(inc);
  await client.settle();
  assert.equal(error, '');
  assert.equal(adapter.sections.main.data.n, 2);
});

test('undo restores only the picked part and keeps a limit', async () => {
  const adapter = fakeAdapter();
  const client = createSection({ store: 'scoreboard', section: 'custom', normalize, adapter });
  await client.load();
  const spec = { key: 'b1', pick: (/** @type {any} */ d) => d.n, put: (/** @type {any} */ d, /** @type {number} */ n) => ({ ...d, n }), limit: 3 };
  for (let i = 0; i < 5; i++) client.mutate(inc, spec);
  client.mutate((d) => ({ ...d, tag: '설정' }));
  assert.equal(client.undoDepth('b1'), 3);
  assert.ok(client.undo('b1'));
  assert.deepEqual(client.data, { n: 4, tag: '설정' });
  client.undo('b1');
  client.undo('b1');
  assert.equal(client.undo('b1'), false);
  assert.equal(client.data.n, 2);
  await client.settle();
  assert.equal(adapter.sections.custom.data.n, 2);
});

test('external change is pulled in, older ones ignored', async () => {
  const adapter = fakeAdapter();
  const client = createSection({ store: 'scoreboard', section: 'shared', normalize, adapter });
  await client.load();
  adapter.sections.shared = { revision: 4, data: { n: 9, tag: '' } };
  await client.external(4);
  assert.equal(client.data.n, 9);
  adapter.sections.shared = { revision: 3, data: { n: 1, tag: '' } };
  await client.external(3);
  assert.equal(client.data.n, 9);
});

test('mutateAndConfirm reports saved, rejected after conflict, and failed', async () => {
  const adapter = fakeAdapter();
  const client = createSection({ store: 'vote', section: 'session', normalize, adapter });
  await client.load();
  // 1) 보통 저장 → saved, 디스크에 들어감
  assert.equal(await client.mutateAndConfirm(inc, (d) => d.n === 1), 'saved');
  assert.equal(adapter.sections.session.data.n, 1);
  // 2) 다른 창이 먼저 "멈춤"을 저장 → 다시 적용할 때 변경 함수가 거부 → rejected, 값은 다른 창 것
  const guarded = (/** @type {{n:number,tag:string}} */ d) => (d.tag === 'paused' ? d : inc(d));
  adapter.beforeWrite = () => { adapter.sections.session = { revision: 2, data: { n: 1, tag: 'paused' } }; };
  assert.equal(await client.mutateAndConfirm(guarded, (d) => d.n === 2), 'rejected');
  assert.deepEqual(adapter.sections.session.data, { n: 1, tag: 'paused' });
  // 3) 처음부터 바뀐 것이 없으면 쓰지 않고 rejected
  const writes = adapter.writes;
  assert.equal(await client.mutateAndConfirm((d) => d, () => true), 'rejected');
  assert.equal(adapter.writes, writes);
  // 4) 디스크 오류 → failed, 화면 값은 마지막 저장 상태로
  adapter.failNext = true;
  const tagged = (/** @type {{n:number,tag:string}} */ d) => ({ ...d, tag: 'x' });
  assert.equal(await client.mutateAndConfirm(tagged, (d) => d.tag === 'x'), 'failed');
  assert.equal(client.data.tag, 'paused');
});

test('mutateAndConfirm resolves each of several queued changes', async () => {
  const adapter = fakeAdapter();
  /** @type {() => void} */ let release = () => {};
  adapter.gate = new Promise((r) => (release = r));
  const client = createSection({ store: 'vote', section: 'session', normalize, adapter });
  await client.load();
  const results = [1, 2, 3].map((k) => client.mutateAndConfirm(inc, (d) => d.n >= k));
  release();
  adapter.gate = null;
  assert.deepEqual(await Promise.all(results), ['saved', 'saved', 'saved']);
  assert.equal(adapter.sections.session.data.n, 3);
});

test('dispose settles waiting confirmations as failed', async () => {
  const adapter = fakeAdapter();
  adapter.gate = new Promise(() => {});
  const client = createSection({ store: 'vote', section: 'session', normalize, adapter });
  await client.load();
  const waiting = client.mutateAndConfirm(inc, () => true);
  client.dispose();
  assert.equal(await waiting, 'failed');
});
