// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, createFocusAudio, normalizeVolume } from './audio.js';
import { normalizeSettings, applySettingsPatch } from '../toolkit/preferences.js';

function fixture() {
  const loads = new Map(), nodes = [], states = [], gains = [];
  const ctx = {
    currentTime: 0, destination: {}, resume: async () => {}, close: async () => {},
    createGain: () => ({ connect() {}, disconnect() {}, gain: {
      cancelScheduledValues() {}, setValueAtTime(v) { gains.push(v); }, setTargetAtTime(v) { gains.push(v); },
    } }),
    decodeAudioData: async () => ({ duration: 2 }),
    createBufferSource() {
      const node = { onended: null, stopped: false, started: false, connect() {}, disconnect() {},
        start() { this.started = true; }, stop() { this.stopped = true; } };
      nodes.push(node); return node;
    },
  };
  const audio = createFocusAudio(s => states.push(s), { context: () => ctx,
    fetch: url => new Promise(resolve => loads.set(url.split('/').at(-1), resolve)),
  });
  const resolve = (file, ok = true) => loads.get(file)({ ok, arrayBuffer: async () => new ArrayBuffer(1) });
  return { audio, states, nodes, gains, resolve };
}
test('late decode after stop cannot start audio or animation', async () => {
  const f = fixture(); const pending = f.audio.play('bell'); f.audio.stop();
  f.resolve('bell.wav'); await pending;
  assert.equal(f.nodes.length, 0); assert.equal(f.states.at(-1).status, 'idle');
});
test('all four runtime clips use their normalized files at unity gain', () => {
  assert.deepEqual(SOUNDS.map(({ id, url, gain }) => ({ id, url, gain })), [
    { id: 'bell', url: '/audio/toolkit/focus-bell/bell.wav', gain: 1 },
    { id: 'bomb', url: '/audio/toolkit/focus-bell/bomb.wav', gain: 1 },
    { id: 'fart', url: '/audio/toolkit/focus-bell/fart.wav', gain: 1 },
    { id: 'siren', url: '/audio/toolkit/focus-bell/siren.wav', gain: 1 },
  ]);
});
test('latest click wins even if an older load completes later', async () => {
  const f = fixture(); const first = f.audio.play('bell'); const second = f.audio.play('siren');
  f.resolve('siren.wav'); await second; f.resolve('bell.wav'); await first;
  assert.equal(f.nodes.length, 1); assert.equal(f.states.at(-1).id, 'siren');
  assert.equal(f.states.at(-1).status, 'playing');
  const replay = f.audio.play('siren'); await replay;
  assert.equal(f.nodes[0].stopped, true); assert.equal(f.nodes.length, 2);
  f.nodes[1].onended(); assert.equal(f.states.at(-1).status, 'idle');
});
test('dispose during loading prevents callbacks and playback', async () => {
  const f = fixture(); const pending = f.audio.play('bell'); f.audio.dispose();
  const count = f.states.length; f.resolve('bell.wav'); await pending;
  assert.equal(f.states.length, count); assert.equal(f.nodes.length, 0);
});
test('failed file can be retried and mute survives loading', async () => {
  const f = fixture(); const first = f.audio.play('bell'); f.resolve('bell.wav', false); await first;
  assert.equal(f.states.at(-1).status, 'error');
  f.audio.setVolume(75, true);
  const retry = f.audio.play('bell'); f.resolve('bell.wav'); await retry;
  assert.equal(f.gains.at(-1), 0);
  f.audio.setVolume(65, false); assert.equal(f.gains.at(-1), .65);
});
test('v5 migration preserves hidden tools; user can hide focus bell in v6', () => {
  const next = normalizeSettings({ schemaVersion: 5, toolkit: { visibleToolIds: ['roster'], hiddenPlatformIds: ['clanner'] } });
  assert.deepEqual(next.toolkit.visibleToolIds, ['roster', 'focus-bell', 'dice', 'clock', 'scoreboard', 'thermometer', 'vote']);
  assert.deepEqual(next.toolkit.hiddenPlatformIds, ['clanner']);
  const hidden = applySettingsPatch(next, 'toolkit', { visibleToolIds: ['roster'] });
  assert.deepEqual(normalizeSettings(hidden).toolkit.visibleToolIds, ['roster']);
  assert.equal(normalizeVolume(NaN), 40); assert.equal(normalizeVolume(200), 100); assert.equal(normalizeVolume(-2), 0);
});
