import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerialQueue } from './serialQueue.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('작업은 들어온 순서대로 하나씩 실행된다 (겹치지 않는다)', async () => {
  const queue = createSerialQueue();
  const log = [];
  let running = 0;
  let maxRunning = 0;

  const job = (name, ms) => queue.enqueue(async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    log.push(`start:${name}`);
    await wait(ms);
    log.push(`end:${name}`);
    running--;
    return name;
  });

  const results = await Promise.all([job('a', 20), job('b', 5), job('c', 1)]);
  assert.deepEqual(results, ['a', 'b', 'c']);
  assert.equal(maxRunning, 1);
  assert.deepEqual(log, ['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
});

test('앞 작업이 실패해도 다음 작업은 실행되고, 실패는 호출자에게 전달된다', async () => {
  const queue = createSerialQueue();
  const failed = queue.enqueue(async () => { throw new Error('boom'); });
  const next = queue.enqueue(async () => 'ok');

  await assert.rejects(failed, /boom/);
  assert.equal(await next, 'ok');
});

test('settled()는 줄에 선 모든 작업이 끝난 뒤에 풀린다', async () => {
  const queue = createSerialQueue();
  let done = false;
  queue.enqueue(async () => { await wait(15); done = true; });
  await queue.settled();
  assert.equal(done, true);
});
