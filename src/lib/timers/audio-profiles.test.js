import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const source = fs.readFileSync(new URL('./audio.js', import.meta.url), 'utf8')
  .replace('export function createTimerAudio', 'function createTimerAudio');
/** @type {Record<string, number>} */
const durations = {
  '/audio/toolkit/tick.wav': 0.23,
  '/audio/toolkit/warning.wav': 0.04,
  '/audio/toolkit/end.wav': 0.54,
  '/audio/toolkit/digital/tick-t01.wav': 11.69,
  '/audio/toolkit/digital/warning-w05-1s.wav': 1,
  '/audio/toolkit/digital/end-e08.wav': 2.64,
  '/audio/toolkit/analog/warning-w09.wav': 8,
  '/audio/toolkit/analog/end-e09.wav': 7.79,
  '/audio/toolkit/stopwatch/tick-st04.wav': 1,
  '/audio/toolkit/hourglass/tick-ht04.wav': 1,
  '/audio/toolkit/hourglass/warning-hw09.wav': 4.470771,
  '/audio/toolkit/hourglass/end-he09.wav': 3.025,
};

/** @param {string} kind */
function fixture(kind) {
  /** @type {any[]} */ const events = [];
  /** @type {string[]} */ const requests = [];
  /** @type {string[]} */ const errors = [];
  const responseUrls = new Map();
  /** @param {number} seconds */
  function buffer(seconds, channels = 1, fill = 0.2) {
    const data = Array.from({ length: channels }, () => new Float32Array(Math.round(seconds * 48000)).fill(fill));
    return {
      duration: seconds, numberOfChannels: channels,
      getChannelData: (/** @type {number} */ channel) => data[channel],
      copyToChannel: (/** @type {Float32Array} */ samples, /** @type {number} */ channel) => data[channel].set(samples),
    };
  }
  class FakeContext {
    currentTime = 10;
    sampleRate = 48000;
    destination = {};
    async resume() {}
    async close() { events.push({ type: 'close' }); }
    /** @param {ArrayBuffer} bytes */
    async decodeAudioData(bytes) { return buffer(durations[responseUrls.get(bytes)]); }
    /** @param {number} channels @param {number} frames @param {number} rate */
    createBuffer(channels, frames, rate) {
      events.push({ type: 'pad', seconds: frames / rate });
      return buffer(frames / rate, channels, 0);
    }
    createBufferSource() {
      return {
        buffer: null, loop: false, onended: null,
        connect() {}, disconnect() {},
        start(/** @type {number} */ when) { events.push({ type: 'start', when, loop: this.loop, buffer: this.buffer }); },
        stop(/** @type {number|undefined} */ when) { events.push({ type: 'stop', when }); },
      };
    }
  }
  const scope = {
    AudioContext: FakeContext,
    fetch: async (/** @type {string} */ url) => {
      requests.push(url);
      assert.ok(url in durations, `Unexpected sound URL: ${url}`);
      const bytes = new ArrayBuffer(1);
      responseUrls.set(bytes, url);
      return { ok: true, arrayBuffer: async () => bytes };
    },
    kind, onError: (/** @type {string} */ message) => errors.push(message),
  };
  vm.createContext(scope);
  const audio = vm.runInContext(source + '\ncreateTimerAudio(onError, kind)', scope);
  return { audio, events, requests, errors };
}

test('digital loads T01/W05/E08 and loops full clips at the planned times', async () => {
  const { audio, events, requests } = fixture('digital');
  assert.equal(await audio.ready(), true);
  await audio.ready();
  assert.deepEqual(requests, [
    '/audio/toolkit/digital/tick-t01.wav',
    '/audio/toolkit/digital/warning-w05-1s.wav',
    '/audio/toolkit/digital/end-e08.wav',
  ]);
  audio.schedule({ tick: true, end: true, endIn: 3, warningIn: 1, warningFor: 2 });
  assert.deepEqual(events.filter((e) => e.type === 'start').map(({ when, loop, buffer }) => [when, loop, buffer.duration]), [
    [10.01, true, 11.69], [11.01, true, 1], [13.01, false, 2.64],
  ]);
  assert.equal(events.filter((e) => e.type === 'pad').length, 0);
  assert.deepEqual(events.filter((e) => e.type === 'stop').map((e) => e.when), [13.01, 13.01]);
  audio.stopAll();
  assert.equal(events.filter((e) => e.type === 'stop' && e.when === undefined).length, 3);
  audio.schedule(null);
  assert.equal(events.filter((e) => e.type === 'start').length, 3);
  audio.dispose();
  assert.equal(await audio.ready(), false);
  assert.ok(events.some((e) => e.type === 'close'));
});

test('analog keeps its existing tick cadence and does not truncate W09 or E09', async () => {
  const { audio, events, requests } = fixture('analog');
  await audio.ready();
  assert.equal(requests[0], '/audio/toolkit/tick.wav');
  audio.schedule({ tick: true, end: true, endIn: 20, warningIn: 5, warningFor: 15 });
  const starts = events.filter((e) => e.type === 'start');
  assert.deepEqual(starts.map((s) => [s.buffer.duration, s.loop]), [[1, true], [8, true], [7.79, false]]);
  /** @type {Float32Array} */ const tick = starts[0].buffer.getChannelData(0);
  assert.ok(tick.slice(0, 11040).every((s) => s > 0));
  assert.ok(tick.slice(11040).every((s) => s === 0));
});

test('hourglass loads and schedules the selected HT04, HW09, and HE09 sounds', async () => {
  const { audio, requests, events } = fixture('hourglass');
  await audio.ready();
  assert.deepEqual(requests, [
    '/audio/toolkit/hourglass/tick-ht04.wav',
    '/audio/toolkit/hourglass/warning-hw09.wav',
    '/audio/toolkit/hourglass/end-he09.wav',
  ]);
  audio.schedule({ tick: true, end: true, endIn: 5, warningIn: 3, warningFor: 2 });
  assert.deepEqual(events.filter((e) => e.type === 'start').map((e) => [e.buffer.duration, e.loop]), [
    [1, true], [4.470771, true], [3.025, false],
  ]);
});

test('stopwatch loads only its tick and never starts a countdown warning or end cue', async () => {
  const { audio, requests, events } = fixture('stopwatch');
  await audio.ready();
  audio.schedule({ tick: true, end: false, endIn: null, warningIn: null, warningFor: 0 });
  assert.deepEqual(requests, ['/audio/toolkit/stopwatch/tick-st04.wav']);
  assert.equal(events.filter((e) => e.type === 'start')[0].buffer.duration, 1);
  assert.equal(events.filter((e) => e.type === 'start').length, 1);
  assert.equal(events.filter((e) => e.type === 'stop').length, 0);
  await audio.preview('end');
  assert.equal(events.filter((e) => e.type === 'start').length, 1);
  audio.stopAll();
  assert.equal(events.filter((e) => e.type === 'stop').length, 1);
});

test('preview uses the selected profile and keeps the entire completion sound', async () => {
  const digital = fixture('digital'), analog = fixture('analog');
  await digital.audio.preview('warning');
  await analog.audio.preview('end');
  assert.deepEqual(digital.events.filter((e) => e.type === 'start').map((e) => [e.loop, e.buffer.duration]), [[false, 1]]);
  assert.deepEqual(analog.events.filter((e) => e.type === 'start').map((e) => [e.loop, e.buffer.duration]), [[false, 7.79]]);
});

/** @param {string} relative */
function readWav(relative) {
  const bytes = fs.readFileSync(new URL(`../../../public/audio/toolkit/${relative}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let byteRate, pcm;
  for (let i = 12; i + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', i, i + 4), size = bytes.readUInt32LE(i + 4);
    if (name === 'fmt ') byteRate = bytes.readUInt32LE(i + 16);
    if (name === 'data') pcm = bytes.subarray(i + 8, i + 8 + size);
    i += 8 + size + (size % 2);
  }
  assert.ok(byteRate && pcm);
  return { bytes, seconds: pcm.length / byteRate, pcm };
}

test('shipped analog tick is unchanged, W05 is exactly one second, and asset hashes match', () => {
  const sha = (/** @type {Buffer} */ bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(readWav('tick.wav').bytes), '1084dbe5f434aa8b3c1a3188f740377f3887cbf893938272b5cd63aa2246e0b7');
  assert.equal(readWav('digital/warning-w05-1s.wav').seconds, 1);
  assert.equal(readWav('stopwatch/tick-st04.wav').seconds, 1);
  for (const [file, hash] of [
    ['stopwatch/tick-st04.wav', '6caf6db0edca818a36e47a54232c1ad30326d8f61d81c2136dcadfb702d7cf21'],
    ['hourglass/tick-ht04.wav', '2d25da7044c016bfdcbc681235e33284a39f1ce0fc530dc72319aae8398af8e3'],
    ['hourglass/warning-hw09.wav', '07a8e6620de73b2d7149f8b448e944c94bd4290d3bec29b4ef5727836f1cce61'],
    ['hourglass/end-he09.wav', '1acfae5c6e028ca51e32fca03515299ee19396e176133ae037059d91446b8d90'],
  ]) {
    assert.equal(sha(readWav(file).bytes), hash);
  }
  assert.ok(readWav('digital/tick-t01.wav').seconds > 11);
  assert.ok(readWav('analog/warning-w09.wav').seconds >= 8);
  assert.ok(readWav('analog/end-e09.wav').seconds > 7);
  const manifest = JSON.parse(fs.readFileSync(new URL('../../../artwork/toolkit/audio/manifest.json', import.meta.url), 'utf8'));
  for (const asset of manifest) assert.equal(sha(readWav(asset.file).bytes), asset.sha256, asset.file);
});
