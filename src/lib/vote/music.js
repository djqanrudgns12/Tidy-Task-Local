// 학급 투표 배경 음악(2026-09-26 사용자 요청). 곡 3개는 public/music에 있습니다.
//   main     — 학급 투표에 들어와 투표 설정(만들기·준비)을 마칠 때까지, 결과를 본 뒤 첫 화면·기록함
//   vote     — 학생 투표가 시작되면(안내 → 투표 → 마감·개표 대기)
//   counting — 개표(다시 보기 포함)
//
// 지키는 것
//  1. 화면이 아니라 "곡"이 바뀔 때만 움직입니다. 같은 곡을 쓰는 화면끼리(첫 화면 → 만들기 → 준비)는 음악이 끊기지 않고 이어집니다.
//  2. 곡마다 재생기(덱)가 하나뿐이라 같은 곡이 두 번 겹쳐 나올 수 없습니다. 곡이 바뀌면 나가는 곡은 내려가고 들어오는 곡은 올라옵니다.
//     넘기는 도중에 또 바뀌어도 "지금 크기"에서 이어서 움직이므로 소리가 튀거나 곡이 처음부터 다시 나오지 않습니다.
//  3. 들어오는 곡이 실제로 소리 나기 시작한 뒤에 나가는 곡을 내립니다(파일 준비가 늦어도 사이에 무음 틈이 생기지 않게).
//  4. 곡 끝은 다음 바퀴 처음과 4초 겹쳐 이어 붙입니다(끝의 페이드아웃 → 무음 → 전주로 뚝 끊기지 않게).
//  5. 화면이 잠깐 거쳐 가는 값(저장 확인 전 한 순간 등)에 흔들리지 않게, 장면은 0.15초 머문 뒤에 적용합니다.
//  6. 음악 끄기(설정 music)·전체 소리 끄기는 "잠시 멈춤"입니다. 다시 켜면 멈춘 자리에서 이어집니다.
//
// 재생은 <audio> 요소 + Web Audio 음량 조절입니다. 왜 AudioBuffer로 풀어 두지 않는가: 3분짜리 곡을 풀면 곡당 60~75MB라 교실 PC에
// 부담이고, 요소는 필요한 만큼만 풉니다. 파일은 한 번 받아 blob 주소로 씁니다 — 앱에 넣은 파일 주소는 구간 요청을 못 받아
// 재생 위치 옮기기(이어 듣기·처음으로)가 안 될 수 있지만, blob은 메모리에 있어 정확히 옮겨집니다.
import { dbToGain } from './audio.js';

/** @typedef {'main'|'vote'|'counting'} TrackId */
/** @typedef {'idle'|'off'|'waiting'|'loading'|'playing'} MusicStatus */
/** @typedef {{track: TrackId|null, entry: 'cross'|'resolve', next: TrackId|null}} MusicScene */

/** 곡 표. lufs는 ffmpeg ebur128로 잰 통합 음량입니다(파일을 바꾸면 다시 재서 고칩니다 — docs/QA-vote.md "배경 음악").
 * resume: 이 곡으로 돌아올 때 멈춘 자리에서 이어 틀지(메인), 처음 전주부터 틀지(투표·개표는 매번 새 장면이라 처음부터). */
export const MUSIC_TRACKS = Object.freeze({
  main: Object.freeze({ file: 'main.mp3', lufs: -15.2, resume: true }),
  vote: Object.freeze({ file: 'vote.mp3', lufs: -15.1, resume: false }),
  counting: Object.freeze({ file: 'vote counting.mp3', lufs: -16.6, resume: false }),
});
/** @type {TrackId[]} */
export const TRACK_IDS = /** @type {TrackId[]} */ (Object.keys(MUSIC_TRACKS));

/** 배경 음악 목표 음량(LUFS). 효과음(−26~−18)·안내 음성(약 −21)보다 낮게 깔려 소리를 가리지 않습니다. */
export const MUSIC_LUFS = -27;
/** @param {TrackId} id */
export const trackGain = (id) => dbToGain(MUSIC_LUFS - MUSIC_TRACKS[id].lufs);
/** public/music의 곡 주소(개발 서버·앱 모두 같은 자리). 파일 이름의 공백은 %20으로. @param {TrackId} id */
export const musicUrl = (id) => `/music/${encodeURIComponent(MUSIC_TRACKS[id].file)}`;

/** 넘김 시간(초). */
export const FADE = Object.freeze({
  first: 2.5, // 조용함 → 첫 곡(창을 열었을 때)
  resume: 1.2, // 음악을 다시 켰을 때(멈춘 자리에서)
  cross: 2.4, // 곡 바꾸기: 나가는 곡과 들어오는 곡이 같은 시간 동안 교차
  toCounting: 1.5, // 개표 시작: 투표함 여는 소리(1.1초)와 함께 분위기를 빨리 바꿈
  resolveOut: 1.2, // 결과 발표: 개표 음악을 먼저 걷고
  resolveGap: 2.6, //   축하 소리(팡파르 2.6초)가 끝날 즈음
  resolveIn: 3.5, //   메인 음악을 천천히 올림
  loop: 4, // 곡 끝 ↔ 다음 바퀴 처음 겹침
  off: 0.8, // 음악 끄기
  close: 0.3, // 창 닫기
});
/** 장면이 이만큼 머물러야 적용합니다(ms). */
export const SETTLE_MS = 150;
/** 곡 끝 이어 붙이기를 이만큼 일찍 봅니다(초) — 재생 위치 알림이 0.25초마다 오므로 늦지 않게. */
const LOOP_LEAD = 0.3;

/** 화면 → 장면. next는 다음에 올 가능성이 큰 곡(미리 준비해 넘김이 바로 되게).
 * @param {{ready:boolean, view:string, celebrate?:boolean, silentView?:boolean}} s @returns {MusicScene} */
export function musicScene({ ready, view, celebrate = false, silentView = false }) {
  if (!ready || silentView || view === 'loading') return { track: null, entry: 'cross', next: null };
  switch (view) {
    case 'prep':
      return { track: 'main', entry: 'cross', next: 'vote' };
    // 안내부터 학생에게 보여 주는 화면이라 투표 음악이 시작됩니다. 안내 → 투표판, "안내 다시 보기"도 같은 곡이라 끊기지 않습니다.
    // 마감(개표 대기)도 같은 곡을 이어 가고, [개표 시작]을 누르는 순간 개표 음악으로 넘어갑니다.
    case 'tutorial':
    case 'booth':
    case 'closed':
      return { track: 'vote', entry: 'cross', next: 'counting' };
    case 'counting':
    case 'finishing':
    case 'replay':
      return { track: 'counting', entry: 'cross', next: 'main' };
    // 개표 직후(celebrate)의 결과는 축하 소리를 비워 두었다가 메인 음악을 올립니다. 기록함에서 연 결과는 메인 그대로.
    case 'result':
      return { track: 'main', entry: celebrate ? 'resolve' : 'cross', next: null };
    default: // 첫 화면 · 만들기 · 기록함
      return { track: 'main', entry: 'cross', next: null };
  }
}

/** 곡 바꾸기 계획(순수 함수).
 * @param {TrackId|null} from 지금 올라가 있는(올라가는 중인) 곡 @param {TrackId|null} to 다음 곡
 * @param {'cross'|'resolve'} entry @param {{resume?:boolean, closing?:boolean}} [o] resume: 음악 끄기·소리 끄기를 풀어 다시 트는 것
 * @returns {{outDur:number, inDelay:number, inDur:number, waitIncoming:boolean}} */
export function transitionPlan(from, to, entry, o = {}) {
  if (!to) return { outDur: o.closing ? FADE.close : FADE.off, inDelay: 0, inDur: 0, waitIncoming: false };
  if (!from) return { outDur: FADE.off, inDelay: 0, inDur: o.resume ? FADE.resume : FADE.first, waitIncoming: false };
  if (entry === 'resolve') return { outDur: FADE.resolveOut, inDelay: FADE.resolveGap, inDur: FADE.resolveIn, waitIncoming: false };
  const d = to === 'counting' ? FADE.toCounting : FADE.cross;
  return { outDur: d, inDelay: 0, inDur: d, waitIncoming: true };
}

/** 어디서부터 틀지(초). 곡 끝 겹침 구간 가까이에서 멈췄으면 처음부터(곧바로 이어 붙이기가 시작되면 어색함).
 * @param {{resume:boolean, stoppedBy:'scene'|'silence'|null, resumeAt:number, duration:number}} d */
export function startPosition({ resume, stoppedBy, resumeAt, duration }) {
  const at = resume || stoppedBy === 'silence' ? resumeAt : 0;
  if (!Number.isFinite(duration) || !Number.isFinite(at) || at < 0 || at > duration - FADE.loop - 1) return 0;
  return at;
}

/** 배경 음악 켜기/끄기 설정 변경. 켜는데 전체 소리가 꺼져 있으면(소리 끄기·크기 0) 함께 켭니다 — 켰는데 안 들리면 고장처럼 보여서.
 * @param {{muted:boolean, volume:number}} prefs @param {boolean} on */
export function musicTogglePatch(prefs, on) {
  if (!on) return { music: false };
  /** @type {{music:boolean, muted?:boolean, volume?:number}} */
  const patch = { music: true };
  if (prefs.muted) patch.muted = false;
  if (prefs.volume <= 0) patch.volume = 50;
  return patch;
}

/** 꺾은선 [시각, 값] 위의 값(마지막 점 뒤로는 그 값 유지). @param {[number, number][]} points @param {number} t */
export function lineValue(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) {
      const [t0, v0] = points[i - 1];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

/** 음량 조절 하나(GainNode의 gain). 예약한 움직임을 JS에서도 같은 식(꺾은선)으로 기억해, 도중에 방향을 바꿔도 "지금 값"에서
 * 이어 갑니다. 왜: AudioParam.value는 예약된 움직임을 곧바로 반영하지 않아 믿을 수 없습니다.
 * @param {{currentTime:number}} ctx @param {AudioParam} param @param {number} [initial] */
export function createFader(ctx, param, initial = 0) {
  /** @type {[number, number][]} */
  let points = [[0, initial]];
  param.value = initial;
  const valueAt = (/** @type {number} */ t) => lineValue(points, t);
  return {
    valueAt,
    /** 마지막으로 가려는 값 */
    get target() {
      return points[points.length - 1][1];
    },
    /** 움직임이 끝나는 시각(초) */
    get settlesAt() {
      return points[points.length - 1][0];
    },
    /** 곧바로 v. @param {number} v */
    set(v) {
      const t = ctx.currentTime;
      param.cancelScheduledValues(t);
      param.setValueAtTime(v, t);
      points = [[t, v]];
    },
    /** delay초 뒤부터 dur초 동안 to까지 곧게. 기다리는 동안에는 하던 움직임을 그대로 이어 갑니다.
     * @param {number} to @param {number} dur @param {number} [delay] */
    fade(to, dur, delay = 0) {
      const t = ctx.currentTime;
      const start = t + Math.max(0, delay);
      const end = start + Math.max(0.02, dur);
      const now = valueAt(t);
      const atStart = valueAt(start);
      param.cancelScheduledValues(t);
      param.setValueAtTime(now, t);
      if (start > t) param.linearRampToValueAtTime(atStart, start);
      param.linearRampToValueAtTime(to, end);
      points = start > t ? [[t, now], [start, atStart], [end, to]] : [[t, now], [end, to]];
    },
  };
}

/** @typedef {ReturnType<typeof createFader>} Fader */
/** @typedef {{el:HTMLAudioElement, source:AudioNode, gain:GainNode, fader:Fader}} Voice */
/**
 * @typedef {{
 *   id: TrackId, voices: Voice[]|null, active: number, fader: Fader|null, nodes: AudioNode[],
 *   loading: Promise<boolean>|null, failed: boolean, playing: boolean, wanted: boolean,
 *   token: number, run: number, resumeAt: number, stoppedBy: 'scene'|'silence'|null, looping: boolean,
 *   pauseTimer: any, startTimer: any, blocked: boolean, starting: number
 * }} Deck
 */

/**
 * 배경 음악 재생기. 창(vote)마다 하나만 만듭니다(VoteApp). 선생님 창은 만들지 않습니다.
 * @param {{
 *   channel: () => Promise<{context: AudioContext, destination: AudioNode}|null>,
 *   onRunning?: (fn: () => void) => () => void,
 *   isRunning?: () => boolean,
 *   load?: (id: TrackId) => Promise<string>,
 *   createElement?: () => HTMLAudioElement,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (id: any) => void,
 *   onState?: (s: {track: TrackId|null, status: MusicStatus}) => void,
 * }} deps
 */
export function createVoteMusic(deps) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id));
  const createElement = deps.createElement ?? (() => new Audio());
  /** @type {Set<string>} */ const objectUrls = new Set();
  const load = deps.load ?? (async (/** @type {TrackId} */ id) => {
    const res = await fetch(musicUrl(id));
    if (!res.ok) throw new Error(`music ${id}: ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    objectUrls.add(url);
    return url;
  });

  /** @type {Record<TrackId, Deck>} */
  const decks = /** @type {any} */ (Object.fromEntries(TRACK_IDS.map((id) => [id, {
    id, voices: null, active: 0, fader: null, nodes: [], loading: null, failed: false, playing: false, wanted: false,
    token: 0, run: 0, resumeAt: 0, stoppedBy: null, looping: false, pauseTimer: undefined, startTimer: undefined, blocked: false, starting: 0,
  }])));
  const allDecks = () => TRACK_IDS.map((id) => decks[id]);

  /** @type {MusicScene} */ let scene = { track: null, entry: 'cross', next: null };
  /** @type {MusicScene} */ let pending = scene;
  let silenced = false;
  let closing = false;
  let disposed = false;
  /** 지금 올라가 있거나 올라가는 중인 곡(= 마지막으로 적용한 목표). @type {TrackId|null} */
  let current = null;
  /** @type {any} */ let settleTimer;
  /** @type {Set<any>} */ const timers = new Set();
  /** @type {{context: AudioContext, destination: AudioNode}|null} */ let channel = null;
  /** @type {MusicStatus} */ let lastStatus = 'idle';
  /** @type {TrackId|null} */ let lastTrack = null;

  /** 창이 닫힐 때 한꺼번에 지우도록 타이머를 모아 둡니다. @param {() => void} fn @param {number} ms */
  function later(fn, ms) {
    const id = setTimer(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }
  /** @param {any} id */
  function cancel(id) {
    if (id === undefined) return;
    clearTimer(id);
    timers.delete(id);
  }

  function status() {
    /** @type {MusicStatus} */
    let s = 'idle';
    if (silenced) s = 'off';
    else if (current) {
      const d = decks[current];
      if (d.playing) s = 'playing';
      else if (d.blocked || (deps.isRunning && !deps.isRunning())) s = 'waiting';
      else s = 'loading';
    }
    return s;
  }
  function report() {
    const s = status();
    if (s === lastStatus && current === lastTrack) return;
    lastStatus = s;
    lastTrack = current;
    deps.onState?.({ track: current, status: s });
  }

  // ── 소리 장치·파일 준비 ──
  async function openChannel() {
    if (channel) return channel;
    const ch = await deps.channel();
    if (ch && !disposed) channel = ch;
    return channel;
  }
  /** 곡 파일을 받아 재생 요소 두 개(이어 붙이기용)를 만듭니다. 소리 장치가 잠겨 있으면 false(켜지면 다시 시도).
   * @param {Deck} deck @returns {Promise<boolean>} */
  function ensureLoaded(deck) {
    if (deck.voices) return Promise.resolve(true);
    if (deck.failed || disposed) return Promise.resolve(false);
    deck.loading ??= (async () => {
      const ch = await openChannel();
      if (!ch || disposed) return false;
      const url = await load(deck.id);
      if (disposed) return false;
      const ctx = ch.context;
      const trim = ctx.createGain();
      trim.gain.value = trackGain(deck.id);
      trim.connect(ch.destination);
      const level = ctx.createGain();
      level.connect(trim);
      const voices = [0, 1].map((i) => {
        const el = createElement();
        el.preload = 'auto';
        el.loop = false;
        el.src = url;
        const source = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(level);
        el.addEventListener('timeupdate', () => onTimeUpdate(deck, i));
        el.addEventListener('ended', () => onEnded(deck, i));
        return { el, source, gain, fader: createFader(ctx, gain.gain, i === 0 ? 1 : 0) };
      });
      // 길이를 알아야 이어 듣기 위치·이어 붙이기를 계산할 수 있습니다(blob이라 곧바로 옴).
      await Promise.all(voices.map((v) => metadata(v.el)));
      if (disposed) {
        voices.forEach((v) => releaseElement(v.el));
        return false;
      }
      deck.voices = voices;
      deck.fader = createFader(ctx, level.gain, 0);
      deck.nodes = [trim, level, ...voices.flatMap((v) => [v.source, v.gain])];
      deck.active = 0;
      return true;
    })()
      .catch(() => {
        // 파일이 없거나 풀지 못하면 이 곡만 조용히 건너뜁니다(투표 진행은 음악과 상관없이 그대로).
        deck.failed = true;
        return false;
      })
      .finally(() => {
        deck.loading = null;
      });
    return deck.loading;
  }
  /** @param {HTMLAudioElement} el */
  function metadata(el) {
    if (Number.isFinite(el.duration) && el.duration > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        el.removeEventListener('loadedmetadata', done);
        el.removeEventListener('error', done);
        cancel(t);
        resolve(undefined);
      };
      el.addEventListener('loadedmetadata', done);
      el.addEventListener('error', done);
      const t = later(done, 3000);
    });
  }
  /** @param {HTMLAudioElement} el */
  function releaseElement(el) {
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
    } catch {}
  }

  // ── 덱 움직이기 ──
  /** @param {Voice} v */
  function pauseVoice(v) {
    try {
      v.el.pause();
    } catch {}
  }
  /** 더 이상 이 곡을 원하지 않음: 걸려 있던 시작(파일 준비·결과 화면의 틈)을 취소합니다. @param {Deck} deck */
  function release(deck) {
    if (!deck.wanted) return;
    deck.wanted = false;
    deck.token++;
    cancel(deck.startTimer);
    deck.startTimer = undefined;
  }
  /** @param {Deck} deck @param {number} dur @param {'scene'|'silence'} reason */
  function fadeOutDeck(deck, dur, reason) {
    if (deck.wanted) return; // 그사이 다시 이 곡을 원하게 됨
    if (!deck.playing || !deck.fader || !channel) {
      if (!deck.playing && deck.stoppedBy === 'silence' && reason === 'scene') deck.stoppedBy = 'scene';
      return;
    }
    const now = channel.context.currentTime;
    // 이미 더 빨리 내려가는 중이면 그대로 둡니다(창 닫기처럼 더 빨라야 할 때만 새로 겁니다).
    if (!(deck.fader.target === 0 && deck.fader.settlesAt <= now + dur)) deck.fader.fade(0, dur);
    const my = deck.token;
    cancel(deck.pauseTimer);
    deck.pauseTimer = later(() => {
      if (my === deck.token && !deck.wanted) pauseDeck(deck, reason);
    }, Math.max(0, deck.fader.settlesAt - channel.context.currentTime) * 1000 + 120);
  }
  /** @param {Deck} deck @param {'scene'|'silence'} reason */
  function pauseDeck(deck, reason) {
    const v = deck.voices?.[deck.active];
    if (v) deck.resumeAt = v.el.currentTime || 0;
    deck.voices?.forEach(pauseVoice);
    deck.playing = false;
    deck.looping = false;
    deck.run++;
    deck.stoppedBy = reason;
    // 다음에 틀 때를 위해 크기를 제자리로(덱은 0에서 올라오고, 지금 목소리만 1).
    deck.voices?.forEach((x, i) => x.fader.set(i === deck.active ? 1 : 0));
    deck.fader?.set(0);
    report();
  }
  /** @param {Deck} deck @param {{inDelay:number, inDur:number}} plan @returns {Promise<boolean>} 소리가 나기 시작했는지 */
  async function startDeck(deck, plan) {
    const my = ++deck.token;
    deck.wanted = true;
    cancel(deck.pauseTimer);
    cancel(deck.startTimer);
    if (deck.playing && deck.fader) {
      // 아직 소리 나는 중(내려가던 중 포함) → 그 자리에서 다시 올립니다. 새로 틀지 않으므로 같은 곡이 겹치지 않습니다.
      deck.fader.fade(1, plan.inDur || FADE.resume);
      deck.stoppedBy = null;
      report();
      return true;
    }
    deck.starting++;
    try {
      return await begin(deck, plan, my);
    } finally {
      deck.starting--;
    }
  }
  /** startDeck의 본문(틀기까지 기다리는 부분). @param {Deck} deck @param {{inDelay:number, inDur:number}} plan @param {number} my */
  async function begin(deck, plan, my) {
    if (plan.inDelay > 0) {
      await new Promise((resolve) => (deck.startTimer = later(() => resolve(undefined), plan.inDelay * 1000)));
      deck.startTimer = undefined;
      if (my !== deck.token) return false;
    }
    report();
    if (!(await ensureLoaded(deck)) || my !== deck.token || disposed || !deck.voices || !deck.fader) {
      report();
      return false;
    }
    const v = deck.voices[deck.active];
    const other = deck.voices[1 - deck.active];
    // 이어 붙이기용 목소리는 쉬게 하고, 지금 목소리만 1 · 덱은 0에서 올라오게.
    pauseVoice(other);
    other.fader.set(0);
    v.fader.set(1);
    deck.fader.set(0);
    const from = startPosition({ resume: MUSIC_TRACKS[deck.id].resume, stoppedBy: deck.stoppedBy, resumeAt: deck.resumeAt, duration: v.el.duration });
    try {
      if (Math.abs(v.el.currentTime - from) > 0.05) v.el.currentTime = from;
      await v.el.play();
    } catch (error) {
      // 자동 재생 잠금이면 소리 장치가 켜질 때(onRunning) 다시 시도합니다.
      if (my === deck.token) {
        deck.blocked = error instanceof DOMException && error.name === 'NotAllowedError';
        report();
      }
      return false;
    }
    if (my !== deck.token || disposed) {
      // 기다리는 사이에 다른 곡으로 바뀜: 아직 소리가 0이므로 조용히 멈춥니다.
      if (!deck.wanted) pauseVoice(v);
      return false;
    }
    deck.playing = true;
    deck.run++;
    deck.blocked = false;
    deck.stoppedBy = null;
    deck.fader.fade(1, plan.inDur);
    report();
    return true;
  }

  // ── 곡 끝 이어 붙이기 ──
  /** @param {Deck} deck @param {number} index */
  function onTimeUpdate(deck, index) {
    if (!deck.playing || deck.looping || index !== deck.active || !deck.voices) return;
    const el = deck.voices[index].el;
    const left = el.duration - el.currentTime;
    if (Number.isFinite(left) && left <= FADE.loop + LOOP_LEAD) void loopDeck(deck);
  }
  /** 다른 목소리로 처음부터 틀어 끝과 겹칩니다. @param {Deck} deck */
  async function loopDeck(deck) {
    if (!deck.voices) return;
    deck.looping = true;
    const run = deck.run;
    const outIndex = deck.active;
    const outgoing = deck.voices[outIndex];
    const incoming = deck.voices[1 - outIndex];
    incoming.fader.set(0);
    try {
      incoming.el.currentTime = 0;
      await incoming.el.play();
    } catch {
      // 실패하면 곡이 끝날 때(ended) 같은 목소리로 처음부터 다시 틉니다.
      deck.looping = false;
      return;
    }
    if (run !== deck.run || !deck.playing) {
      pauseVoice(incoming);
      deck.looping = false;
      return;
    }
    const left = Math.max(0.05, outgoing.el.duration - outgoing.el.currentTime);
    const overlap = Math.min(FADE.loop, left);
    incoming.fader.fade(1, overlap);
    outgoing.fader.fade(0, overlap);
    deck.active = 1 - outIndex;
    deck.looping = false;
    later(() => {
      if (deck.run === run && deck.active !== outIndex) {
        pauseVoice(outgoing);
        try {
          outgoing.el.currentTime = 0;
        } catch {}
      }
    }, overlap * 1000 + 150);
  }
  /** 이어 붙이기를 놓쳤을 때(창이 오래 바빴음 등)의 마지막 안전망: 같은 목소리를 처음부터. @param {Deck} deck @param {number} index */
  function onEnded(deck, index) {
    if (!deck.playing || index !== deck.active || !deck.voices || deck.looping) return;
    const v = deck.voices[index];
    try {
      v.el.currentTime = 0;
    } catch {}
    void v.el.play().catch(() => {});
  }

  // ── 목표 적용 ──
  function wantedTrack() {
    return closing || silenced ? null : scene.track;
  }
  function apply() {
    if (disposed) return;
    const want = wantedTrack();
    const reason = scene.track && want === null && !closing ? 'silence' : 'scene';
    // 장면이 바뀌어 떠난 곡은 "잠시 멈춤"이 아니라 끝난 것으로 봅니다(다음에 올 때 처음부터 — 곡 표의 resume을 따름).
    for (const d of allDecks()) if (d.id !== scene.track && d.stoppedBy === 'silence') d.stoppedBy = 'scene';
    if (want === current) {
      // 같은 곡: 걸려 있던 시작이 없는데 소리도 안 나면(자동 재생 잠금이 풀린 뒤 등) 다시 틀어 봅니다.
      kick();
      prefetch();
      report();
      return;
    }
    const from = current;
    current = want;
    for (const d of allDecks()) if (d.id !== want) release(d);
    const target = want ? decks[want] : null;
    const plan = transitionPlan(from, want, scene.entry, { resume: !!target && (target.playing || target.stoppedBy === 'silence'), closing });
    const fadeOthers = () => {
      for (const d of allDecks()) if (d.id !== current) fadeOutDeck(d, plan.outDur, want ? 'scene' : reason);
    };
    if (!target) {
      fadeOthers();
      report();
      return;
    }
    if (plan.waitIncoming) {
      // 들어오는 곡이 소리 나기 시작하면(또는 못 틀게 되면) 그때 나가는 곡을 내립니다. 그사이 목표가 또 바뀌었으면 새 목표가 맡습니다.
      void startDeck(target, plan).then(() => {
        if (current === want) fadeOthers();
        prefetch();
      });
    } else {
      fadeOthers();
      void startDeck(target, plan).then(() => prefetch());
    }
    report();
  }
  /** 목표 곡이 멈춰 있으면(잠금이 풀림 등) 다시 틉니다. */
  function kick() {
    const want = wantedTrack();
    if (!want || want !== current) return;
    const d = decks[want];
    if (d.playing || d.starting || d.failed) return;
    void startDeck(d, transitionPlan(null, want, 'cross', { resume: d.stoppedBy === 'silence' })).then(() => prefetch());
  }
  /** 다음 곡을 미리 준비합니다(소리 장치가 이미 켜져 있을 때만 — 준비 때문에 장치를 깨우지 않게). */
  function prefetch() {
    const next = scene.next;
    if (!next || !channel || silenced || closing || disposed) return;
    void ensureLoaded(decks[next]);
  }

  const offRunning = deps.onRunning?.(() => {
    for (const d of allDecks()) d.blocked = false;
    kick();
    report();
  });

  return {
    /** 장면을 알립니다. 같은 장면이면 아무것도 하지 않고, 바뀌면 SETTLE_MS 뒤에 적용합니다. @param {MusicScene} s */
    setScene(s) {
      if (disposed) return;
      pending = { track: s.track, entry: s.entry, next: s.next };
      cancel(settleTimer);
      settleTimer = undefined;
      if (pending.track === scene.track && pending.next === scene.next) {
        // 넘김 방식(entry)만 바뀐 것은 곡이 같으니 적용할 것이 없습니다. 기록만 맞춥니다.
        scene = pending;
        return;
      }
      settleTimer = later(() => {
        settleTimer = undefined;
        scene = pending;
        apply();
      }, SETTLE_MS);
    },
    /** 음악 끄기(설정)·전체 소리 끄기. 끄면 멈춘 자리를 기억하고, 켜면 거기서 이어 틉니다. @param {boolean} on */
    setSilenced(on) {
      if (disposed || on === silenced) return;
      silenced = on;
      apply();
    },
    /** 창을 닫기 직전: 모든 곡을 짧게 내립니다. */
    close() {
      if (disposed || closing) return;
      closing = true;
      apply();
    },
    /** 지금 상태(개발·검수용). */
    snapshot() {
      const t = channel?.context.currentTime ?? 0;
      return {
        current,
        status: status(),
        decks: allDecks().map((d) => ({
          id: d.id,
          playing: d.playing,
          wanted: d.wanted,
          level: d.fader ? d.fader.valueAt(t) : 0,
          active: d.active,
          voicesPlaying: d.voices ? d.voices.filter((v) => !v.el.paused).length : 0,
          position: d.voices ? d.voices[d.active].el.currentTime : d.resumeAt,
        })),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      offRunning?.();
      for (const id of timers) clearTimer(id);
      timers.clear();
      for (const d of allDecks()) {
        d.voices?.forEach((v) => releaseElement(v.el));
        d.nodes.forEach((n) => {
          try {
            n.disconnect();
          } catch {}
        });
        d.voices = null;
        d.playing = false;
      }
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
      objectUrls.clear();
    },
  };
}
