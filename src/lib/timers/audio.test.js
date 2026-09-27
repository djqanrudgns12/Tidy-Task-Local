import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimerAudio } from './audio.js';

test('audio schedules one end source, loops short cues, and cancels every source', async () => {
  /** @type {any[]} */ const events = [];
  class FakeContext {
    currentTime = 10;
    sampleRate = 48000;
    destination = {};
    async resume() {}
    async close() {
      events.push('close');
    }
    async decodeAudioData() {
      return { getChannelData: () => new Float32Array(200) };
    }
    createBuffer() {
      return { copyToChannel() {} };
    }
    createBufferSource() {
      const s = {
        buffer: null,
        loop: false,
        onended: null,
        connect() {},
        disconnect() {},
        /** @param {number} when */
        start(when) {
          events.push({ type: 'start', when, loop: this.loop });
        },
        /** @param {number} [when] */
        stop(when) {
          events.push({ type: 'stop', when });
        },
      };
      return s;
    }
  }
  const platform = /** @type {any} */ ({
    AudioContext: FakeContext,
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }),
  });
  const audio = createTimerAudio(undefined, undefined, platform);
  assert.equal(await audio.ready(), true);
  audio.schedule({ tick: true, end: true, endIn: 3, warningIn: 1, warningFor: 2 });
  assert.deepEqual(
    events.filter((e) => e.type === 'start'),
    [
      { type: 'start', when: 10.01, loop: true },
      { type: 'start', when: 11.01, loop: true },
      { type: 'start', when: 13.01, loop: false },
    ],
  );
  audio.stopAll();
  assert.equal(events.filter((e) => e.type === 'stop' && e.when === undefined).length, 3);
  audio.schedule(null);
  assert.equal(events.filter((e) => e.type === 'start').length, 3);
  audio.dispose();
  assert.equal(await audio.ready(), false);
  assert.ok(events.includes('close'));
});
