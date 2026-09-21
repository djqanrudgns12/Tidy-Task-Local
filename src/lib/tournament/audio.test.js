import test from "node:test";
import assert from "node:assert/strict";
import {
  createTournamentAudio,
  REVEAL_DELAY_MS,
  CELEBRATION_END_MS,
} from "./audio.js";

function mockContext() {
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    setTargetAtTime() {},
  });
  /** @type {any[]} */ const nodes = [];
  const node = () => {
    const value = {
      gain: param(),
      frequency: param(),
      detune: param(),
      Q: param(),
      threshold: param(),
      knee: param(),
      ratio: param(),
      delayTime: param(),
      connect() {},
      disconnect() {
        this.disconnected = true;
      },
      disconnected: false,
      starts: /** @type {number[]} */ ([]),
      stops: 0,
      start(/** @type {number} */ t) {
        this.starts.push(t);
      },
      stop() {
        this.stops++;
      },
    };
    nodes.push(value);
    return value;
  };
  const context = {
    state: "suspended",
    currentTime: 10,
    sampleRate: 2000,
    destination: {},
    resumeCalls: 0,
    closeCalls: 0,
    async resume() {
      this.resumeCalls++;
      this.state = "running";
    },
    async close() {
      this.closeCalls++;
      this.state = "closed";
    },
    createGain: node,
    createBiquadFilter: node,
    createOscillator: node,
    createBufferSource: node,
    createDynamicsCompressor: node,
    createDelay: node,
    createBuffer: (_channels = 1, frames = 1) => ({
      getChannelData: () => new Float32Array(frames),
    }),
  };
  return { context: /** @type {any} */ (context), nodes };
}

test("gesture unlock precedes playback, with a drumroll before the fanfare", async () => {
  const { context, nodes } = mockContext();
  const audio = createTournamentAudio(() => context);
  assert.equal(audio.play(), false);
  assert.equal(await audio.unlock(), true);
  assert.equal(context.resumeCalls, 1);
  assert.equal(audio.play(), true);
  const starts = nodes.flatMap((n) => n.starts);
  assert.ok(starts.some((t) => t < 10 + REVEAL_DELAY_MS / 1000));
  assert.ok(starts.some((t) => t > 10 + REVEAL_DELAY_MS / 1000));
  assert.ok(CELEBRATION_END_MS > REVEAL_DELAY_MS + 3000);
  const playing = nodes.filter((n) => n.starts.length);
  audio.stop();
  assert.ok(playing.every((n) => n.stops >= 2));
  await audio.dispose();
  assert.equal(context.closeCalls, 1);
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.play(), false);
});

test("simple motion still has sound, replay cancels prior sources, dispose is idempotent", async () => {
  const { context, nodes } = mockContext();
  const audio = createTournamentAudio(() => context);
  await audio.unlock();
  audio.play(true);
  const playing = nodes.filter((n) => n.starts.length);
  assert.ok(playing.length > 0);
  assert.equal(Math.min(...playing.flatMap((n) => n.starts)), 10.025);
  audio.play(true);
  assert.ok(playing.every((n) => n.stops >= 2));
  await audio.dispose();
  await audio.dispose();
  assert.equal(context.closeCalls, 1);
});

test("participant clicks use a short cue and fanfare does not cut it off", async () => {
  const { context, nodes } = mockContext();
  const audio = createTournamentAudio(() => context);
  assert.equal(audio.playSelection(), false);
  await audio.unlock();
  assert.equal(audio.playSelection("select"), true);
  const firstCue = nodes.filter((n) => n.starts.length);
  assert.equal(firstCue.length, 2);
  assert.deepEqual(
    firstCue.map((n) => n.frequency.value),
    [659.25, 987.77],
  );
  assert.equal(audio.play(false), true);
  assert.ok(firstCue.every((n) => n.stops === 1));
  const beforeCancel = nodes.length;
  assert.equal(audio.playSelection("cancel"), true);
  assert.ok(firstCue.every((n) => n.stops >= 2));
  const cancelCue = nodes
    .slice(beforeCancel)
    .filter((n) => n.starts.length && n.frequency.value === 523.25);
  assert.equal(cancelCue.length, 1);
  await audio.dispose();
});

test("unavailable audio does not throw or claim to play", async () => {
  const audio = createTournamentAudio(() => {
    throw new Error("Audio unavailable");
  });
  assert.equal(await audio.unlock(), false);
  assert.equal(audio.play(), false);
  assert.equal(audio.playSelection(), false);
  await audio.dispose();
});
