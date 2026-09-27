// 학급 투표 배경 음악(music.js) 단위 테스트. 소리 장치·<audio>·시계를 가짜로 바꿔 끼워, 화면 전환 순서만으로
// "끊기지 않음 · 겹치지 않음 · 되돌려도 처음부터 다시 나오지 않음"을 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  musicScene, transitionPlan, startPosition, musicTogglePatch, lineValue, createFader, createVoteMusic,
  FADE, SETTLE_MS, MUSIC_TRACKS, TRACK_IDS, trackGain, musicUrl, MUSIC_LUFS,
} from './music.js';
import { MUSIC_DUCK, CUES } from './audio.js';

// ── 가짜 부품 ──
class FakeParam {
  value = 1;
  /** @type {any[]} */ calls = [];
  cancelScheduledValues(/** @type {number} */ t) { this.calls.push(['cancel', t]); }
  setValueAtTime(/** @type {number} */ v, /** @type {number} */ t) { this.calls.push(['set', v, t]); }
  linearRampToValueAtTime(/** @type {number} */ v, /** @type {number} */ t) { this.calls.push(['ramp', v, t]); }
}
class FakeNode {
  gain = new FakeParam();
  connect() {}
  disconnect() {}
}
const DURATION = 120;
class FakeEl extends EventTarget {
  paused = true;
  currentTime = 0;
  duration = NaN;
  preload = '';
  loop = false;
  plays = 0;
  _src = '';
  /** @param {{block:boolean}} env */
  constructor(env) {
    super();
    this.env = env;
  }
  set src(v) {
    this._src = v;
    queueMicrotask(() => {
      this.duration = DURATION;
      this.dispatchEvent(new Event('loadedmetadata'));
    });
  }
  get src() { return this._src; }
  play() {
    this.plays++;
    if (this.env.block) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  removeAttribute() { this._src = ''; }
  load() {}
}
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r));
};

function rig({ block = false, slowLoad = 0 } = {}) {
  const env = { block };
  const ctx = { currentTime: 0, createGain: () => new FakeNode(), createMediaElementSource: () => new FakeNode() };
  let now = 0;
  let seq = 0;
  /** @type {Map<number, {at:number, fn:()=>void}>} */
  const queue = new Map();
  /** @type {FakeEl[]} */
  const created = [];
  /** @type {string[]} */ const loads = [];
  /** @type {(()=>void)|null} */ let running = null;
  /** @type {any[]} */ const states = [];
  const music = createVoteMusic({
    channel: async () => ({ context: /** @type {any} */ (ctx), destination: /** @type {any} */ (new FakeNode()) }),
    onRunning: (fn) => ((running = fn), () => (running = null)),
    isRunning: () => !env.block,
    load: async (id) => {
      loads.push(id);
      // 파일 준비가 늦는 경우를 흉내 냅니다(가짜 시계로 기다림).
      if (slowLoad) await new Promise((resolve) => queue.set(++seq, { at: now + slowLoad, fn: () => resolve(undefined) }));
      return `blob:${id}`;
    },
    createElement: () => {
      const el = new FakeEl(env);
      created.push(el);
      return /** @type {any} */ (el);
    },
    setTimer: (fn, ms) => (queue.set(++seq, { at: now + ms, fn }), seq),
    clearTimer: (id) => queue.delete(id),
    onState: (s) => states.push(s),
  });
  /** @param {number} ms */
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      await flush();
      /** @type {[number, {at:number, fn:()=>void}]|null} */
      let next = null;
      for (const entry of queue) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      queue.delete(next[0]);
      now = next[1].at;
      ctx.currentTime = now / 1000;
      next[1].fn();
    }
    now = end;
    ctx.currentTime = now / 1000;
    await flush();
  }
  const deck = (/** @type {string} */ id) => /** @type {any} */ (music.snapshot().decks.find((d) => d.id === id));
  const scene = (/** @type {string} */ view, o = {}) => music.setScene(musicScene({ ready: true, view, ...o }));
  /** 곡의 지금 목소리 요소(가짜 요소는 src로 곡을 알 수 있음 — 곡마다 [목소리0, 목소리1] 순서로 만들어짐). @param {string} id */
  const activeEl = (id) => created.filter((e) => e.src === `blob:${id}`)[deck(id).active];
  return { music, ctx, env, advance, deck, scene, loads, states, activeEl, fireRunning: () => running?.() };
}

// ── 장면 ──
test('화면 → 곡: 설정까지는 main, 안내·투표·마감은 vote, 개표·다시 보기는 counting', () => {
  const track = (/** @type {string} */ view, o = {}) => musicScene({ ready: true, view, ...o }).track;
  for (const v of ['home', 'wizard', 'archive', 'prep', 'result']) assert.equal(track(v), 'main', v);
  for (const v of ['tutorial', 'booth', 'closed']) assert.equal(track(v), 'vote', v);
  for (const v of ['counting', 'finishing', 'replay']) assert.equal(track(v), 'counting', v);
  assert.equal(musicScene({ ready: false, view: 'home' }).track, null);
  assert.equal(musicScene({ ready: true, view: 'loading' }).track, null);
  assert.equal(musicScene({ ready: true, view: 'booth', silentView: true }).track, null, '효과음 검수 화면은 조용히');
  assert.equal(musicScene({ ready: true, view: 'result', celebrate: true }).entry, 'resolve');
  assert.equal(musicScene({ ready: true, view: 'result', celebrate: false }).entry, 'cross');
  assert.equal(musicScene({ ready: true, view: 'prep' }).next, 'vote', '준비 화면에서 투표 곡을 미리 준비');
  assert.equal(musicScene({ ready: true, view: 'booth' }).next, 'counting');
});

test('넘김 계획: 교차는 들어오는 곡이 소리 난 뒤, 결과 발표는 틈을 두고, 다시 켜기는 짧게', () => {
  assert.deepEqual(transitionPlan('main', 'vote', 'cross'), { outDur: FADE.cross, inDelay: 0, inDur: FADE.cross, waitIncoming: true });
  assert.equal(transitionPlan('vote', 'counting', 'cross').inDur, FADE.toCounting);
  assert.deepEqual(transitionPlan('counting', 'main', 'resolve'), { outDur: FADE.resolveOut, inDelay: FADE.resolveGap, inDur: FADE.resolveIn, waitIncoming: false });
  assert.equal(transitionPlan(null, 'main', 'cross').inDur, FADE.first);
  assert.equal(transitionPlan(null, 'main', 'cross', { resume: true }).inDur, FADE.resume);
  assert.equal(transitionPlan('main', null, 'cross').outDur, FADE.off);
  assert.equal(transitionPlan('main', null, 'cross', { closing: true }).outDur, FADE.close);
});

test('시작 위치: 메인·잠시 멈춤은 이어서, 투표·개표는 처음부터, 끝 가까이면 처음부터', () => {
  assert.equal(startPosition({ resume: true, stoppedBy: 'scene', resumeAt: 40, duration: 120 }), 40);
  assert.equal(startPosition({ resume: false, stoppedBy: 'scene', resumeAt: 40, duration: 120 }), 0);
  assert.equal(startPosition({ resume: false, stoppedBy: 'silence', resumeAt: 40, duration: 120 }), 40);
  assert.equal(startPosition({ resume: true, stoppedBy: null, resumeAt: 116, duration: 120 }), 0);
  assert.equal(startPosition({ resume: true, stoppedBy: null, resumeAt: 40, duration: NaN }), 0);
});

test('음악 켜기: 전체 소리가 꺼져 있으면 함께 켬, 끄기는 음악만', () => {
  assert.deepEqual(musicTogglePatch({ muted: false, volume: 70 }, false), { music: false });
  assert.deepEqual(musicTogglePatch({ muted: false, volume: 70 }, true), { music: true });
  assert.deepEqual(musicTogglePatch({ muted: true, volume: 70 }, true), { music: true, muted: false });
  assert.deepEqual(musicTogglePatch({ muted: false, volume: 0 }, true), { music: true, volume: 50 });
});

test('곡 표: 세 곡 모두 목표 음량으로 낮춤 · 주소의 공백은 %20', () => {
  assert.deepEqual(TRACK_IDS, ['main', 'vote', 'counting']);
  for (const id of TRACK_IDS) {
    const g = trackGain(id);
    assert.ok(g > 0 && g < 1, `${id}는 원본보다 작게`);
    assert.ok(Math.abs(20 * Math.log10(g) - (MUSIC_LUFS - MUSIC_TRACKS[id].lufs)) < 1e-9);
  }
  assert.equal(musicUrl('counting'), '/music/vote%20counting.mp3');
  for (const id of Object.keys(MUSIC_DUCK)) assert.ok(id in CUES, `${id}는 있는 효과음`);
  assert.ok(!('vote.cast' in MUSIC_DUCK), '표 넣기 소리는 음악을 건드리지 않음(비밀 원칙)');
});

test('음량 조절: 도중에 방향을 바꾸면 지금 값에서 이어 감(튀지 않음)', () => {
  const ctx = { currentTime: 0 };
  const p = new FakeParam();
  const f = createFader(ctx, /** @type {any} */ (p), 0);
  f.fade(1, 2);
  ctx.currentTime = 1;
  assert.equal(f.valueAt(1), 0.5);
  p.calls = [];
  f.fade(0, 1);
  assert.deepEqual(p.calls, [['cancel', 1], ['set', 0.5, 1], ['ramp', 0, 2]]);
  assert.equal(f.valueAt(1.5), 0.25);
  // 늦게 시작하는 움직임: 기다리는 동안 하던 움직임(0.5 → 0)을 이어 간 뒤(1.75초에 0.125) 거기서 올라감
  ctx.currentTime = 1.5;
  f.fade(1, 1, 0.25);
  assert.equal(f.valueAt(1.75), 0.125);
  assert.equal(f.valueAt(2.25), 0.5625);
  assert.equal(f.target, 1);
  assert.equal(f.settlesAt, 2.75);
  assert.equal(lineValue([[0, 0], [2, 1]], 3), 1);
});

// ── 재생기 ──
test('첫 화면에 들어오면 메인 곡 하나만 틀고, 같은 곡 화면끼리는 건드리지 않음', async () => {
  const r = rig();
  r.scene('home');
  await r.advance(SETTLE_MS + 10);
  assert.equal(r.deck('main').playing, true);
  assert.equal(r.deck('main').voicesPlaying, 1);
  // 만들기 → 준비: 같은 곡 → 다시 틀지 않음
  r.scene('wizard');
  await r.advance(500);
  r.scene('prep');
  await r.advance(500);
  assert.equal(r.deck('main').voicesPlaying, 1);
  assert.equal(r.music.snapshot().current, 'main');
  assert.deepEqual(r.loads.filter((id) => id === 'main'), ['main'], '곡 파일은 한 번만 받음');
  assert.ok(r.loads.includes('vote'), '준비 화면에서 투표 곡을 미리 받음');
  assert.equal(r.deck('vote').playing, false, '미리 받기만 하고 틀지는 않음');
});

test('준비 → 투표: 투표 곡이 소리 난 뒤 메인이 내려가고, 끝나면 메인은 멈춤(겹침 없음)', async () => {
  const r = rig();
  r.scene('prep');
  await r.advance(SETTLE_MS + 3000);
  r.scene('booth');
  await r.advance(SETTLE_MS + 10);
  assert.equal(r.deck('vote').playing, true);
  assert.equal(r.deck('main').playing, true, '교차 중에는 둘 다');
  await r.advance(FADE.cross * 1000 + 200);
  assert.equal(r.deck('main').playing, false);
  assert.equal(r.deck('main').voicesPlaying, 0);
  assert.equal(r.deck('vote').voicesPlaying, 1);
  const playing = r.music.snapshot().decks.filter((d) => d.voicesPlaying > 0).map((d) => d.id);
  assert.deepEqual(playing, ['vote']);
});

test('잠깐 거쳐 가는 화면(0.15초 안에 되돌아옴)에는 음악이 움직이지 않음', async () => {
  const r = rig();
  r.scene('home');
  await r.advance(SETTLE_MS + 3000);
  r.scene('counting');
  await r.advance(50);
  r.scene('home');
  await r.advance(1000);
  assert.equal(r.deck('counting').playing, false);
  assert.ok(!r.loads.includes('counting'), '개표 곡은 받지도 않음');
  assert.equal(r.deck('main').level, 1);
});

test('넘기는 도중에 되돌아오면 나가던 곡이 그 자리에서 다시 올라옴(처음부터 다시 나오지 않음)', async () => {
  const r = rig();
  r.scene('prep');
  await r.advance(SETTLE_MS + 3000);
  const mainPosBefore = r.deck('main').position;
  r.scene('booth');
  await r.advance(SETTLE_MS + 1000);
  const mid = r.deck('main').level;
  assert.ok(mid > 0 && mid < 1, '메인이 내려가는 중');
  r.scene('prep');
  await r.advance(SETTLE_MS + 5000);
  assert.equal(r.deck('main').playing, true);
  assert.equal(r.deck('main').level, 1);
  assert.equal(r.deck('main').position, mainPosBefore, '메인은 멈춘 적 없이 그대로(가짜 요소라 위치가 흐르지 않음)');
  assert.equal(r.deck('vote').playing, false, '투표 곡은 내려가 멈춤');
  assert.equal(r.deck('vote').voicesPlaying, 0);
});

test('음악 끄기 → 켜기: 멈춘 자리에서 이어서(투표 곡도)', async () => {
  const r = rig();
  r.scene('booth');
  await r.advance(SETTLE_MS + 3000);
  const snap = r.music.snapshot();
  assert.equal(snap.current, 'vote');
  // 재생 위치를 앞으로 옮겨 둡니다(가짜 요소는 시간이 흐르지 않음).
  const el = /** @type {any} */ (r.activeEl('vote'));
  el.currentTime = 42;
  r.music.setSilenced(true);
  await r.advance(FADE.off * 1000 + 200);
  assert.equal(r.deck('vote').playing, false);
  assert.equal(r.music.snapshot().status, 'off');
  r.music.setSilenced(false);
  await r.advance(100);
  assert.equal(r.deck('vote').playing, true);
  assert.equal(el.currentTime, 42, '잠시 멈춤은 이어 듣기');
});

test('투표 곡은 새 투표마다 처음부터, 메인은 돌아오면 이어서', async () => {
  const r = rig();
  r.scene('home');
  await r.advance(SETTLE_MS + 3000);
  const mainEl = /** @type {any} */ (r.activeEl('main'));
  mainEl.currentTime = 30;
  r.scene('booth');
  await r.advance(SETTLE_MS + 4000);
  const voteEl = /** @type {any} */ (r.activeEl('vote'));
  voteEl.currentTime = 50;
  r.scene('home');
  await r.advance(SETTLE_MS + 4000);
  assert.equal(r.deck('main').playing, true);
  assert.equal(mainEl.currentTime, 30, '메인은 이어서');
  r.scene('booth');
  await r.advance(SETTLE_MS + 4000);
  assert.equal(voteEl.currentTime, 0, '투표 곡은 처음부터');
});

test('곡 끝: 다른 목소리로 처음부터 틀어 4초 겹친 뒤 앞 목소리는 멈춤', async () => {
  const r = rig();
  r.scene('home');
  await r.advance(SETTLE_MS + 3000);
  const a = /** @type {any} */ (r.activeEl('main'));
  a.currentTime = DURATION - FADE.loop - 0.1;
  a.dispatchEvent(new Event('timeupdate'));
  await r.advance(10);
  assert.equal(r.deck('main').voicesPlaying, 2, '겹치는 동안 두 목소리');
  assert.equal(r.deck('main').active, 1);
  a.dispatchEvent(new Event('timeupdate')); // 이어 붙이는 중 알림이 또 와도 세 번째로 틀지 않음
  await r.advance(FADE.loop * 1000 + 300);
  assert.equal(r.deck('main').voicesPlaying, 1);
  assert.equal(a.paused, true);
  assert.equal(a.currentTime, 0, '쉬는 목소리는 처음으로 감아 둠');
});

test('이어 붙이기를 놓쳐 곡이 끝나면 같은 목소리로 처음부터', async () => {
  const r = rig();
  r.scene('home');
  await r.advance(SETTLE_MS + 3000);
  const a = /** @type {any} */ (r.activeEl('main'));
  const plays = a.plays;
  a.currentTime = DURATION;
  a.dispatchEvent(new Event('ended'));
  await r.advance(10);
  assert.equal(a.plays, plays + 1);
  assert.equal(a.currentTime, 0);
});

test('자동 재생 잠금: 기다림으로 알리고, 소리 장치가 켜지면 그때 틈', async () => {
  const r = rig({ block: true });
  r.scene('home');
  await r.advance(SETTLE_MS + 100);
  assert.equal(r.deck('main').playing, false);
  assert.equal(r.music.snapshot().status, 'waiting');
  r.env.block = false;
  r.fireRunning();
  await r.advance(100);
  assert.equal(r.deck('main').playing, true);
  assert.equal(r.music.snapshot().status, 'playing');
  assert.equal(r.deck('main').voicesPlaying, 1);
});

test('개표 → 결과(축하): 개표 곡을 먼저 걷고, 축하 소리 뒤에 메인이 올라옴', async () => {
  const r = rig();
  r.scene('counting');
  await r.advance(SETTLE_MS + 3000);
  r.scene('result', { celebrate: true });
  await r.advance(SETTLE_MS + FADE.resolveOut * 1000 + 200);
  assert.equal(r.deck('counting').playing, false);
  assert.equal(r.deck('main').playing, false, '틈 동안에는 조용히');
  await r.advance(FADE.resolveGap * 1000);
  assert.equal(r.deck('main').playing, true);
  await r.advance(FADE.resolveIn * 1000 + 100);
  assert.equal(r.deck('main').level, 1);
});

test('창 닫기·정리: 모두 짧게 내리고, 정리하면 모든 요소가 멈춤', async () => {
  const r = rig();
  r.scene('booth');
  await r.advance(SETTLE_MS + 3000);
  r.music.close();
  await r.advance(FADE.close * 1000 + 200);
  assert.equal(r.deck('vote').playing, false);
  r.scene('home'); // 닫는 중에는 새 곡을 틀지 않음
  await r.advance(SETTLE_MS + 500);
  assert.equal(r.deck('main').playing, false);
  r.music.dispose();
  assert.ok(r.music.snapshot().decks.every((d) => d.voicesPlaying === 0));
});

test('파일 준비가 늦는데 화면이 연달아 바뀌어도(준비 → 투표 → 개표) 앞 곡은 새 곡이 날 때까지 이어지고, 마지막 곡만 남음', async () => {
  const r = rig({ slowLoad: 800 });
  r.scene('home');
  await r.advance(SETTLE_MS + 900 + 3000);
  assert.equal(r.deck('main').playing, true);
  r.scene('booth');
  await r.advance(SETTLE_MS + 300);
  assert.equal(r.deck('main').level, 1, '투표 곡이 준비되기 전까지 메인은 그대로(무음 틈 없음)');
  r.scene('counting');
  await r.advance(SETTLE_MS + 900 + 200);
  assert.equal(r.deck('counting').playing, true);
  assert.equal(r.deck('vote').playing, false, '중간에 지나간 투표 곡은 틀지 않음');
  assert.equal(r.deck('vote').voicesPlaying, 0);
  await r.advance(FADE.toCounting * 1000 + 300);
  const playing = r.music.snapshot().decks.filter((d) => d.voicesPlaying > 0).map((d) => d.id);
  assert.deepEqual(playing, ['counting']);
});
