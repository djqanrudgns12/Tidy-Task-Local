import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createTimerAudio, PREVIEW_SECONDS } from './audio.js';
import { SOUND_LIBRARY } from './soundLibrary.js';

/** @param {string} relative public/audio/toolkit 아래 경로 */
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

// 가짜 AudioContext가 돌려줄 길이는 실제 파일에서 읽습니다(목록의 모든 파일이 있어야 통과).
/** @type {Record<string, number>} */
const durations = Object.fromEntries(
  Object.values(SOUND_LIBRARY).flat().map((option) => [option.url, readWav(option.url.replace('/audio/toolkit/', '')).seconds]),
);

/** @param {string} kind @param {{fail?: Set<string>, hold?: Map<string, Promise<void>>}} [options] */
function fixture(kind, options = {}) {
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
        buffer: /** @type {any} */ (null), loop: false, onended: null,
        connect() {}, disconnect() {},
        start(/** @type {number} */ when) { events.push({ type: 'start', when, loop: this.loop, buffer: this.buffer }); },
        stop(/** @type {number|undefined} */ when) { events.push({ type: 'stop', when }); },
      };
    }
  }
  const platform = /** @type {any} */ ({
    AudioContext: FakeContext,
    fetch: async (/** @type {string} */ url) => {
      requests.push(url);
      assert.ok(url in durations, `Unexpected sound URL: ${url}`);
      await options.hold?.get(url);
      if (options.fail?.has(url)) {
        options.fail.delete(url);
        return { ok: false };
      }
      const bytes = new ArrayBuffer(1);
      responseUrls.set(bytes, url);
      return { ok: true, arrayBuffer: async () => bytes };
    },
  });
  const audio = createTimerAudio((message) => errors.push(message), kind, platform);
  const starts = () => events.filter((e) => e.type === 'start');
  return { audio, events, requests, errors, starts };
}

test('digital loads T01/W05/E08 by default and loops full clips at the planned times', async () => {
  const { audio, events, requests, starts } = fixture('digital');
  assert.equal(await audio.ready(), true);
  await audio.ready();
  assert.deepEqual(requests, [
    '/audio/toolkit/digital/tick-t01.wav',
    '/audio/toolkit/digital/warning-w05-1s.wav',
    '/audio/toolkit/digital/end-e08.wav',
  ]);
  audio.schedule({ tick: true, end: true, endIn: 3, warningIn: 1, warningFor: 2 });
  assert.deepEqual(starts().map(({ when, loop, buffer }) => [when, loop, buffer.duration]), [
    [10.01, true, durations['/audio/toolkit/digital/tick-t01.wav']],
    [11.01, true, 1],
    [13.01, false, durations['/audio/toolkit/digital/end-e08.wav']],
  ]);
  assert.equal(events.filter((e) => e.type === 'pad').length, 0);
  assert.deepEqual(events.filter((e) => e.type === 'stop').map((e) => e.when), [13.01, 13.01]);
  audio.stopAll();
  assert.equal(events.filter((e) => e.type === 'stop' && e.when === undefined).length, 3);
  audio.schedule(null);
  assert.equal(starts().length, 3);
  audio.dispose();
  assert.equal(await audio.ready(), false);
  assert.ok(events.some((e) => e.type === 'close'));
});

test('analog keeps its existing tick cadence and does not truncate W09 or E09', async () => {
  const { audio, requests, starts } = fixture('analog');
  await audio.ready();
  assert.equal(requests[0], '/audio/toolkit/tick.wav');
  audio.schedule({ tick: true, end: true, endIn: 20, warningIn: 5, warningFor: 15 });
  assert.deepEqual(starts().map((s) => [s.buffer.duration, s.loop]), [[1, true], [8, true], [durations['/audio/toolkit/analog/end-e09.wav'], false]]);
  /** @type {Float32Array} */ const tick = starts()[0].buffer.getChannelData(0);
  assert.ok(tick.slice(0, 11040).every((s) => s > 0));
  assert.ok(tick.slice(11040).every((s) => s === 0));
});

test('hourglass loads and schedules HT04, HW09, and HE09 by default', async () => {
  const { audio, requests, starts } = fixture('hourglass');
  await audio.ready();
  assert.deepEqual(requests, [
    '/audio/toolkit/hourglass/tick-ht04.wav',
    '/audio/toolkit/hourglass/warning-hw09.wav',
    '/audio/toolkit/hourglass/end-he09.wav',
  ]);
  audio.schedule({ tick: true, end: true, endIn: 5, warningIn: 3, warningFor: 2 });
  assert.deepEqual(starts().map((e) => [e.buffer.duration, e.loop]), [
    [1, true], [durations['/audio/toolkit/hourglass/warning-hw09.wav'], true], [durations['/audio/toolkit/hourglass/end-he09.wav'], false],
  ]);
});

test('stopwatch loads only its tick, ignores warning/end choices, and never starts a countdown cue', async () => {
  const { audio, requests, events, starts } = fixture('stopwatch');
  assert.equal(audio.select({ tickSound: 'button-click', warningSound: 'time-signal', endSound: 'cheer' }), false);
  await audio.ready();
  audio.schedule({ tick: true, end: false, endIn: null, warningIn: null, warningFor: 0 });
  assert.deepEqual(requests, ['/audio/toolkit/stopwatch/tick-st04.wav']);
  assert.equal(starts()[0].buffer.duration, 1);
  assert.equal(starts().length, 1);
  assert.equal(events.filter((e) => e.type === 'stop').length, 0);
  await audio.preview('end');
  await audio.preview('warning');
  assert.equal(starts().length, 1);
  audio.stopAll();
  assert.equal(events.filter((e) => e.type === 'stop').length, 1);
});

test('choosing sounds swaps only the chosen files and falls back to the timer default for unknown ids', async () => {
  const { audio, requests, starts } = fixture('digital');
  assert.equal(audio.select({ tickSound: 'grandfather-clock', warningSound: 'time-signal', endSound: 'singing-bowl' }), true);
  assert.equal(audio.select({ tickSound: 'grandfather-clock', warningSound: 'time-signal', endSound: 'singing-bowl' }), false);
  await audio.ready();
  assert.deepEqual(requests, [
    '/audio/toolkit/timer-sounds/tick/grandfather-clock.wav',
    '/audio/toolkit/timer-sounds/warning/time-signal.wav',
    '/audio/toolkit/timer-sounds/end/singing-bowl.wav',
  ]);
  audio.schedule({ tick: true, end: true, endIn: 4, warningIn: 1, warningFor: 3 });
  assert.deepEqual(starts().map((s) => [s.when, s.loop, s.buffer.duration]), [
    [10.01, true, 2], [11.01, true, 1], [14.01, false, durations['/audio/toolkit/timer-sounds/end/singing-bowl.wav']],
  ]);
  // 모르는 id(다른 버전·손상)와 다른 역할의 id는 이 타이머의 기본 소리로 돌아갑니다.
  assert.equal(audio.select({ tickSound: 'from-the-future', warningSound: 'cheer', endSound: 'singing-bowl' }), true);
  await audio.ready();
  assert.deepEqual(requests.slice(3), ['/audio/toolkit/digital/tick-t01.wav', '/audio/toolkit/digital/warning-w05-1s.wav']);
  // 한 번 받은 소리는 다시 골라도 내려받지 않습니다.
  audio.select({ tickSound: 'grandfather-clock', endSound: 'singing-bowl' });
  await audio.ready();
  assert.equal(requests.length, 5);
});

test('preview repeats tick and warning for a short while and plays the whole end sound once', async () => {
  const digital = fixture('digital'), analog = fixture('analog');
  await digital.audio.preview('warning');
  await analog.audio.preview('end');
  assert.deepEqual(digital.starts().map((e) => [e.loop, e.buffer.duration]), [[true, 1]]);
  assert.deepEqual(digital.events.filter((e) => e.type === 'stop').map((e) => e.when), [10 + PREVIEW_SECONDS.warning]);
  assert.deepEqual(analog.starts().map((e) => [e.loop, e.buffer.duration]), [[false, durations['/audio/toolkit/analog/end-e09.wav']]]);
  assert.equal(analog.events.filter((e) => e.type === 'stop').length, 0);
  // 11.7초짜리 기계식 시계도 미리 듣기는 4초만 들려줍니다.
  await digital.audio.preview('tick');
  assert.deepEqual(digital.starts().at(-1).loop, true);
  assert.deepEqual(digital.events.filter((e) => e.type === 'stop').at(-1).when, 10 + PREVIEW_SECONDS.tick);
});

test('a preview still loading when the timer starts never cuts the scheduled tick', async () => {
  /** @type {() => void} */ let release = () => {};
  const hold = new Map([['/audio/toolkit/timer-sounds/end/cheer.wav', new Promise((resolve) => (release = () => resolve(undefined)))]]);
  const { audio, events, starts } = fixture('digital', { hold });
  await audio.ready();
  audio.select({ endSound: 'cheer' });
  const pending = audio.preview('end');
  audio.schedule({ tick: true, end: false, endIn: 60, warningIn: null, warningFor: 0 });
  const stopsBefore = events.filter((e) => e.type === 'stop' && e.when === undefined).length;
  release();
  await pending;
  assert.equal(events.filter((e) => e.type === 'stop' && e.when === undefined).length, stopsBefore);
  assert.deepEqual(starts().map((e) => e.loop), [true]);
});

test('a sound that fails to load reports once and loads again on the next try', async () => {
  const url = '/audio/toolkit/timer-sounds/tick/metronome.wav';
  const { audio, errors, requests } = fixture('digital', { fail: new Set([url]) });
  audio.select({ tickSound: 'metronome' });
  assert.equal(await audio.ready(), false);
  assert.equal(errors.length, 1);
  assert.equal(await audio.ready(), true);
  assert.equal(requests.filter((request) => request === url).length, 2);
});

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
