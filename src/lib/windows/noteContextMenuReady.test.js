import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForMenuReady } from './noteContextMenuReady.js';

test('first right click waits for a loading menu instead of losing the request', async () => {
  /** @type {(token:string)=>void} */ let listener = () => {};
  let probes = 0, cleaned = false;
  await waitForMenuReady({
    token: 'note-1', retryMs: 2, timeoutMs: 200,
    subscribe: async handler => { listener = handler; return () => { cleaned = true; }; },
    ping: async () => { if (++probes === 3) listener('note-1'); },
  });
  assert.equal(probes, 3);
  assert.equal(cleaned, true);
});

test('another note readiness response does not open this request', async () => {
  /** @type {(token:string)=>void} */ let listener = () => {};
  let probes = 0;
  await waitForMenuReady({
    token: 'current', retryMs: 2, timeoutMs: 200,
    subscribe: async handler => { listener = handler; return () => {}; },
    ping: async () => listener(++probes === 1 ? 'other' : 'current'),
  });
  assert.equal(probes, 2);
});

test('missing menu times out and removes its listener', async () => {
  let cleaned = false;
  await assert.rejects(waitForMenuReady({
    token: 'missing', retryMs: 2, timeoutMs: 15,
    subscribe: async () => () => { cleaned = true; },
    ping: async () => { throw new Error('window still loading'); },
  }), /시간이 초과/);
  assert.equal(cleaned, true);
});

test('late listener registration is cleaned up after timeout', async () => {
  /** @type {(off:()=>void)=>void} */ let finishSubscription = () => {};
  let cleaned = false, probes = 0;
  await assert.rejects(waitForMenuReady({
    token: 'late', timeoutMs: 10,
    subscribe: () => new Promise(resolve => { finishSubscription = resolve; }),
    ping: async () => { probes++; },
  }));
  finishSubscription(() => { cleaned = true; });
  await Promise.resolve();
  assert.equal(cleaned, true);
  assert.equal(probes, 0);
});
