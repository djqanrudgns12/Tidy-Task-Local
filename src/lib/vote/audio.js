// 학급 투표 효과음 26종(PRD 10절). 기본은 그 자리에서 합성하고(라이선스 걱정 없음 · 누르는 즉시 · 지연 없음),
// src/assets/vote/audio/{소리 id}.wav|ogg 파일이 있으면 그 녹음이 합성보다 우선합니다(audioFiles.js가 목록을 넘겨 줌).
//
// 재질 원칙: 종이·나무·고무 도장·분필·작은 종·마림바 — 교실 물건 소리. 전자 비프·8비트·과장된 팡파레는 쓰지 않습니다.
// 비밀 원칙: vote.cast는 무작위 요소가 없어 어떤 번호·기권이든 매번 같은 합성·같은 음량입니다(잡음도 고정 씨앗).
// 음량: 소리마다 목표(LOUDNESS, BS.1770)에 맞춘 보정(TRIM)과, 타격음은 봉우리 누름(TAME)을 거칩니다 — 최고점 −3dBTP가 먼저입니다.
// 규칙(점수판과 같음): 같은 소리 40ms 안 중복은 합치고, 동시에 최대 4개, 음량 v → (v/100)².
import { createVoiceGate, volumeGain } from '../scores/audio.js';
import { seededRandom } from './random.js';

/** 소리 id → 대략 길이(ms). 동시 발음 계산·검수 목록에 씁니다. */
export const CUES = Object.freeze({
  'vote.open': 160,
  'vote.cast': 380,
  'vote.undo': 260,
  'vote.hint': 200,
  'vote.allDone': 900,
  'tut.page': 320,
  'lot.shuffle': 1200,
  'lot.deal': 140,
  'lot.done': 700,
  'count.open': 900,
  'count.unfold': 400,
  'count.stamp': 220,
  'count.chalk': 200,
  'count.chalk5': 260,
  'race.hop': 160,
  'race.tension': 300,
  'race.finish': 1300,
  'tug.pull': 240,
  'cast.tick': 90,
  'cast.sure': 460,
  'reveal.flip': 320,
  'reveal.drumroll': 2600,
  'result.fanfare': 2600,
  'result.tie': 520,
  'result.pass': 800,
  'result.fail': 700,
});
export const CUE_IDS = Object.keys(CUES);

/** 소리마다 목표 음량(LUFS, BS.1770 통합 음량 — PRD 10절 표). 녹음 파일도 이 값 ±1dB, 최고점 −3dBTP 이하로 맞춰 넣습니다.
 * 계층: 투표 중 잔소리(−26~−24) < 표 넣기·개표 반복음(−22) < 도장·공개(−20) < 마무리·확실(−18). */
export const LOUDNESS = Object.freeze({
  'vote.open': -26, 'vote.cast': -22, 'vote.undo': -24, 'vote.hint': -26, 'vote.allDone': -18, 'tut.page': -24,
  'lot.shuffle': -20, 'lot.deal': -20, 'lot.done': -20,
  'count.open': -18, 'count.unfold': -22, 'count.stamp': -20, 'count.chalk': -22, 'count.chalk5': -22,
  'race.hop': -22, 'race.tension': -24, 'race.finish': -18, 'tug.pull': -22, 'cast.tick': -24, 'cast.sure': -18,
  'reveal.flip': -20, 'reveal.drumroll': -20, 'result.fanfare': -20, 'result.tie': -22, 'result.pass': -20, 'result.fail': -20,
});

/** 합성음 보정(dB): 목표 음량 − 보정 전 측정값. loudness.js로 48kHz 오프라인 렌더를 재서 채웠고,
 * 단위 테스트가 표의 빈칸을, 검수(docs/QA-vote.md)가 ±1dB·−3dBTP를 확인합니다. 녹음 파일에는 쓰지 않습니다(파일 자체를 맞춤). */
export const TRIM = Object.freeze(/** @type {Record<string, number>} */ ({
  'vote.open': 10.1, 'vote.cast': 3, 'vote.undo': 24.3, 'vote.hint': 12.1, 'vote.allDone': 7.9, 'tut.page': 25.5,
  'lot.shuffle': 9.1, 'lot.deal': 6.9, 'lot.done': 7.4,
  'count.open': 3.9, 'count.unfold': 8, 'count.stamp': 3.2, 'count.chalk': 7.9, 'count.chalk5': 7.4,
  'race.hop': 10.2, 'race.tension': 2.4, 'race.finish': 7, 'tug.pull': 17.1, 'cast.tick': 17.1, 'cast.sure': 2.9,
  'reveal.flip': 8.1, 'reveal.drumroll': 3, 'result.fanfare': 4, 'result.tie': 8.7, 'result.pass': 6.2, 'result.fail': 3.3,
}));

/** 순간 압축 문턱(dB, 보정 전 신호 기준). 도장·타격처럼 순간 최고점이 음량에 비해 큰 소리만 씁니다.
 * 왜: 목표 음량까지 올리면 최고점이 −3dBTP를 넘어 스피커에서 찢어질 수 있어, 봉우리만 눌러 두 조건을 함께 맞춥니다. */
export const TAME = Object.freeze(/** @type {Record<string, number>} */ ({
  'vote.open': -35.5, 'vote.cast': -18, 'lot.shuffle': -33.5, 'lot.deal': -26.5,
  'count.open': -20, 'count.unfold': -31, 'count.stamp': -17.5, 'count.chalk': -30.5, 'count.chalk5': -27,
  'race.tension': -16.5, 'cast.sure': -17.5, 'reveal.flip': -30.5, 'reveal.drumroll': -19, 'result.fail': -18,
}));

/** 큰 효과음이 나는 동안 배경 음악을 낮추는 양(dB). 왜: 음악이 깔려 있어도 마감·드럼롤·당선 같은 순간 소리가 묻히지 않게.
 * 표 넣기(vote.cast)는 넣지 않습니다 — 짧고 또렷해서 필요 없고, 모든 표에 같은 소리라는 비밀 원칙을 건드리지 않게. */
export const MUSIC_DUCK = Object.freeze(/** @type {Record<string, number>} */ ({
  'vote.allDone': 6, 'count.open': 4, 'cast.sure': 4, 'race.finish': 6, 'reveal.drumroll': 8,
  'result.fanfare': 8, 'result.pass': 6, 'result.fail': 6, 'result.tie': 4,
}));
/** 안내 음성이 나오는 동안 배경 음악을 낮추는 양(dB)과, 말이 끝난 뒤 다시 올리기 전 기다리는 시간(초).
 * 왜 기다리는가: 문장 사이 짧은 쉼마다 음악이 올라왔다 내려가면 출렁여 거슬립니다. */
export const MUSIC_SPEECH_DUCK_DB = 8;
export const MUSIC_SPEECH_HOLD = 0.7;

/** @param {number} db */
export const dbToGain = (db) => 10 ** (db / 20);

/**
 * 소리마다 [순간 압축(TAME)] → 보정 이득(TRIM)을 거쳐 out으로 가는 합성 목소리들.
 * createVoices는 만들 때 노드를 만들지 않으므로(소리를 낼 때만 만듦) 소리마다 한 벌씩 만들어도 가볍습니다.
 * @param {BaseAudioContext} ctx @param {AudioNode} out @param {AudioBuffer} noise
 * @param {(src:AudioScheduledSourceNode)=>void} [track]
 * @param {{trimmed?:boolean, tame?:Record<string, number|null>}} [o] 측정용: trimmed=false면 보정 없이, tame으로 문턱을 바꿔 봄
 */
export function createTrimmedVoices(ctx, out, noise, track = () => {}, o = {}) {
  /** @type {Record<string, (t:number, o:{index?:number, variant?:number})=>void>} */
  const voices = {};
  for (const id of CUE_IDS) {
    const trim = ctx.createGain();
    trim.gain.value = o.trimmed === false ? 1 : dbToGain(TRIM[id] ?? 0);
    trim.connect(out);
    const threshold = o.tame && id in o.tame ? o.tame[id] : TAME[id];
    let input = /** @type {AudioNode} */ (trim);
    if (threshold != null) {
      const tame = ctx.createDynamicsCompressor();
      tame.threshold.value = threshold;
      tame.knee.value = 2;
      tame.ratio.value = 20;
      tame.attack.value = 0;
      tame.release.value = 0.06;
      tame.connect(trim);
      input = tame;
    }
    voices[id] = createVoices(ctx, input, noise, track)[id];
  }
  return voices;
}

// 마림바 오음계(레이스에서 후보마다 다른 음): C5 D5 E5 G5 A5 C6 D6 E6 G6
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
const G4 = 392, C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.51, G6 = 1567.98, C7 = 2093;

/**
 * 합성 목소리들. ctx가 실시간이든 오프라인(검수용 렌더)이든 같은 코드로 그립니다.
 * @param {BaseAudioContext} ctx @param {AudioNode} out @param {AudioBuffer} noise
 * @param {(src:AudioScheduledSourceNode)=>void} [track] 재생 중인 소리 기록(멈추기용)
 */
export function createVoices(ctx, out, noise, track = () => {}) {
  /** @param {AudioScheduledSourceNode} src @param {AudioNode[]} chain @param {number} at @param {number} end @param {number} [offset] 잡음 버퍼 안 시작 위치(초) */
  function run(src, chain, at, end, offset = 0) {
    let node = /** @type {AudioNode} */ (src);
    for (const next of chain) {
      node.connect(next);
      node = next;
    }
    node.connect(out);
    track(src);
    src.onended = () => {
      src.disconnect();
      chain.forEach((n) => n.disconnect());
    };
    if (offset && src instanceof AudioBufferSourceNode) src.start(at, offset);
    else src.start(at);
    src.stop(end);
  }

  /** 걸러 낸 잡음 한 번. @param {number} at @param {number} dur
   * @param {{type?:BiquadFilterType, freq?:number, to?:number, q?:number, gain?:number, attack?:number, offset?:number}} o */
  function noiseHit(at, dur, o = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq ?? 2000, at);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, at + dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const attack = Math.min(o.attack ?? 0.004, dur / 3);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    // offset: 잡음 버퍼(2초)의 시작 위치. 알갱이마다 다른 구간을 써야 기계적으로 반복되는 결이 생기지 않습니다.
    run(src, [f, g], at, at + dur + 0.02, Math.min(o.offset ?? 0, 1.9));
  }

  /** 사인·삼각파 음 하나(음높이가 살짝 떨어지는 타격음 포함). @param {number} f @param {number} at @param {number} dur @param {number} gain
   * @param {{type?:OscillatorType, drop?:number, attack?:number}} [o] */
  function tone(f, at, dur, gain, o = {}) {
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(f * (o.drop ?? 1), at);
    if (o.drop && o.drop !== 1) osc.frequency.exponentialRampToValueAtTime(f, at + Math.min(0.03, dur / 4));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + (o.attack ?? 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    run(osc, [g], at, at + dur + 0.02);
  }

  // ── 재질 ──
  /** 종이 바스락: 짧은 잡음 알갱이를 고정 씨앗으로 흩뿌립니다(같은 씨앗 = 같은 소리).
   * @param {number} at @param {number} dur @param {{seed:string, grains?:number, bright?:number, gain?:number, rise?:boolean}} o */
  function paper(at, dur, o) {
    const rnd = seededRandom(o.seed);
    const n = o.grains ?? Math.max(4, Math.round(dur * 40));
    const bright = o.bright ?? 1;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const t = at + p * dur + rnd() * (dur / n) * 0.8;
      // 몸통(끝으로 갈수록 약해지거나, rise면 커짐)
      const env = o.rise ? 0.35 + 0.65 * p : 1 - 0.7 * p;
      const len = 0.006 + rnd() * 0.02;
      noiseHit(t, len, { type: 'bandpass', freq: (2200 + rnd() * 3800) * bright, q: 0.8 + rnd() * 1.4, gain: (o.gain ?? 0.16) * env * (0.45 + rnd() * 0.55), offset: rnd() * 1.8 });
    }
    // 종이 한 장의 낮은 몸통 결(모든 알갱이 아래에 깔리는 부드러운 쓸림)
    noiseHit(at, dur, { type: 'bandpass', freq: 900 * bright, to: 1600 * bright, q: 0.7, gain: (o.gain ?? 0.16) * 0.35, attack: dur * 0.3, offset: rnd() * 1.5 });
  }
  /** 나무 "톡": 공명 두 개 + 딸깍. @param {number} at @param {number} f @param {number} gain @param {number} [decay] */
  function wood(at, f, gain, decay = 0.09) {
    tone(f, at, decay, gain, { type: 'sine', drop: 1.25 });
    tone(f * 2.72, at, decay * 0.45, gain * 0.35, { type: 'sine' });
    noiseHit(at, 0.012, { type: 'bandpass', freq: f * 4, q: 2, gain: gain * 0.5, attack: 0.001 });
  }
  /** 고무 도장 "통/쿵": 낮은 쿵 + 종이에 닿는 찰싹. @param {number} at @param {number} size 0.6(작게)~1.4(크게) @param {number} gain */
  function stamp(at, size, gain) {
    // 낮은 쿵(사인)은 귀에 작게 들리면서 순간 최고점만 키우므로 조금 줄이고, 종이에 닿는 찰싹(중음)을 키워 또렷하게.
    tone(120 / size, at, 0.12 * size, gain * 0.8, { type: 'sine', drop: 1.6 });
    noiseHit(at, 0.09 * size, { type: 'lowpass', freq: 520 / size, q: 0.8, gain: gain * 0.8, attack: 0.002 });
    noiseHit(at + 0.004, 0.05, { type: 'bandpass', freq: 1700, q: 1.2, gain: gain * 0.42, attack: 0.001 });
  }
  /** 분필 "슥": 거친 고음 잡음을 잘게 떨게 합니다. @param {number} at @param {number} dur @param {string} seed @param {number} gain */
  function chalk(at, dur, seed, gain) {
    const rnd = seededRandom(seed);
    const n = Math.round(dur * 90);
    for (let i = 0; i < n; i++) {
      const t = at + (i / n) * dur;
      const env = Math.sin(Math.PI * Math.min(1, (i + 1) / n)) ** 0.6;
      noiseHit(t, 0.012 + rnd() * 0.006, { type: 'bandpass', freq: 2600 + rnd() * 2600, q: 3 + rnd() * 3, gain: gain * env * (0.5 + rnd() * 0.5), attack: 0.002, offset: rnd() * 1.8 });
    }
    noiseHit(at, dur, { type: 'highpass', freq: 3200, q: 0.5, gain: gain * 0.25, attack: dur * 0.2 });
  }
  /** 마림바 한 음(가산 합성: 기음 + 4배 + 10배 부분음, 채 끝 딸깍). @param {number} f @param {number} at @param {number} gain */
  function marimba(f, at, gain) {
    tone(f, at, 0.42, gain, { type: 'sine', attack: 0.002 });
    tone(f * 3.99, at, 0.09, gain * 0.28, { type: 'sine', attack: 0.001 });
    tone(f * 9.9, at, 0.035, gain * 0.1, { type: 'sine', attack: 0.001 });
    noiseHit(at, 0.006, { type: 'lowpass', freq: 2400, q: 0.6, gain: gain * 0.25, attack: 0.001 });
  }
  /** 글로켄슈필(비정수배 부분음 2.76 · 5.40 · 8.93). @param {number} f @param {number} at @param {number} gain @param {number} [len] */
  function glock(f, at, gain, len = 1.1) {
    tone(f, at, len, gain, { attack: 0.002 });
    tone(f * 2.76, at, len * 0.45, gain * 0.32, { attack: 0.001 });
    tone(f * 5.4, at, len * 0.22, gain * 0.14, { attack: 0.001 });
    tone(f * 8.93, at, len * 0.1, gain * 0.06, { attack: 0.001 });
  }
  /** 첼레스타(맑고 부드러운 종: 정수배 부분음, 긴 여운). @param {number} f @param {number} at @param {number} gain @param {number} [len] */
  function celesta(f, at, gain, len = 1.4) {
    tone(f, at, len, gain, { attack: 0.004 });
    tone(f * 2, at, len * 0.5, gain * 0.22, { attack: 0.003 });
    tone(f * 3, at, len * 0.22, gain * 0.08, { attack: 0.002 });
    tone(f * 1.003, at, len * 0.8, gain * 0.35, { attack: 0.004 }); // 아주 살짝 어긋난 음으로 따뜻한 떨림
  }
  /** 교실 규모 박수(8~10명). @param {number} at @param {number} dur @param {number} gain */
  function applause(at, dur, gain) {
    const rnd = seededRandom('applause');
    const people = 9;
    for (let p = 0; p < people; p++) {
      const rate = 4.2 + rnd() * 1.6; // 초당 박수
      let t = at + rnd() * 0.25;
      while (t < at + dur) {
        const pos = (t - at) / dur;
        const env = Math.min(1, pos * 4) * (1 - Math.max(0, pos - 0.6) / 0.4);
        noiseHit(t, 0.028 + rnd() * 0.02, { type: 'bandpass', freq: 1100 + rnd() * 1300, q: 1.1, gain: gain * env * (0.55 + rnd() * 0.45), attack: 0.0015, offset: rnd() * 1.8 });
        t += 1 / rate + (rnd() - 0.5) * 0.05;
      }
    }
  }
  /** 브러시 스네어 롤(점점 크게) + 끝의 작은 종. @param {number} at @param {number} dur @param {number} gain */
  function brushRoll(at, dur, gain) {
    const rnd = seededRandom('drumroll');
    const hits = Math.round(dur * 26);
    for (let i = 0; i < hits; i++) {
      const p = i / hits;
      const t = at + p * dur + (rnd() - 0.5) * 0.008;
      const env = 0.25 + 0.75 * p ** 1.6;
      noiseHit(t, 0.05, { type: 'bandpass', freq: 3200 + rnd() * 1400, q: 0.9, gain: gain * env * (0.7 + rnd() * 0.3), attack: 0.004, offset: rnd() * 1.8 });
      if (i % 2 === 0) tone(190, t, 0.05, gain * 0.18 * env, { type: 'triangle' });
    }
    glock(C7, at + dur, gain * 0.9, 1.2);
  }

  /** @type {Record<string, (t:number, o:{index?:number, variant?:number})=>void>} */
  const voices = {
    'vote.open': (t) => paper(t, 0.14, { seed: 'open', grains: 6, gain: 0.07, bright: 1.1 }),
    // 모든 표에 같은 소리: 종이가 틈으로 "사락" 미끄러지고 나무 상자에 "톡". 무작위 없음.
    'vote.cast': (t) => {
      paper(t, 0.24, { seed: 'cast', grains: 11, gain: 0.2, bright: 0.95 });
      wood(t + 0.21, 610, 0.2, 0.1);
      wood(t + 0.215, 305, 0.12, 0.12);
    },
    'vote.undo': (t) => paper(t, 0.22, { seed: 'undo', grains: 9, gain: 0.1, rise: true, bright: 1.15 }),
    'vote.hint': (t) => {
      wood(t, 392, 0.13, 0.08);
      wood(t + 0.1, 330, 0.11, 0.08);
    },
    'vote.allDone': (t) => {
      glock(C6, t, 0.12);
      glock(E6, t + 0.13, 0.11);
      glock(G6, t + 0.26, 0.12, 1.3);
      // 자물쇠 찰칵: 금속 딸깍 두 번
      noiseHit(t + 0.55, 0.01, { type: 'bandpass', freq: 3600, q: 4, gain: 0.16, attack: 0.001 });
      tone(2150, t + 0.55, 0.05, 0.05);
      noiseHit(t + 0.6, 0.012, { type: 'bandpass', freq: 3000, q: 4, gain: 0.2, attack: 0.001 });
    },
    'tut.page': (t) => {
      paper(t, 0.26, { seed: 'page', grains: 10, gain: 0.08, rise: true });
      noiseHit(t + 0.22, 0.06, { type: 'bandpass', freq: 1500, to: 900, q: 0.9, gain: 0.06 });
    },
    'lot.shuffle': (t) => {
      for (let i = 0; i < 3; i++) paper(t + i * 0.36, 0.3, { seed: `shuffle${i}`, grains: 14, gain: 0.1, bright: 0.9 });
    },
    'lot.deal': (t, o) => {
      noiseHit(t, 0.05, { type: 'bandpass', freq: 1900 + (o.index ?? 0) * 40, q: 1, gain: 0.12, attack: 0.002 });
      wood(t + 0.02, 880, 0.06, 0.05);
    },
    'lot.done': (t) => {
      glock(E6, t, 0.1);
      glock(G6, t + 0.12, 0.12, 1.2);
    },
    // 뚜껑 "달칵" 뒤 용지가 쏟아지는 소리가 주인공입니다(화면에서 용지가 흩날림). 몸통을 키워 짧은 타격음만 튀지 않게.
    'count.open': (t) => {
      wood(t, 250, 0.16, 0.14);
      wood(t + 0.05, 180, 0.11, 0.16);
      paper(t + 0.12, 0.7, { seed: 'open-box', grains: 30, gain: 0.26, bright: 0.9, rise: false });
    },
    'count.unfold': (t, o) => paper(t, 0.34, { seed: `unfold${(o.variant ?? 0) % 3}`, grains: 13, gain: 0.12, bright: 1 }),
    'count.stamp': (t) => {
      stamp(t, 0.75, 0.3);
      // 도장이 종이에 붙는 짧은 "착" — 타격 뒤 몸통
      paper(t + 0.01, 0.09, { seed: 'stamp-paper', grains: 4, gain: 0.09, bright: 0.8 });
    },
    'count.chalk': (t, o) => chalk(t, 0.17, `chalk${(o.variant ?? 0) % 4}`, 0.1),
    'count.chalk5': (t) => {
      chalk(t, 0.19, 'chalk5', 0.11);
      wood(t + 0.2, 1250, 0.05, 0.04);
    },
    'race.hop': (t, o) => marimba(PENTA[Math.abs(o.index ?? 0) % PENTA.length], t, 0.16),
    'race.tension': (t) => {
      wood(t, 150, 0.2, 0.12);
      wood(t + 0.17, 140, 0.15, 0.12);
    },
    'race.finish': (t) => {
      [C5, E5, G5, C6, E6].forEach((f, i) => marimba(f, t + i * 0.055, 0.12));
      glock(C7, t + 0.3, 0.11, 1.1);
      glock(G6, t + 0.3, 0.07, 1.0);
    },
    'tug.pull': (t) => {
      noiseHit(t, 0.22, { type: 'bandpass', freq: 420, to: 1300, q: 1.2, gain: 0.24, attack: 0.03 });
      tone(95, t, 0.1, 0.1, { type: 'sine', drop: 1.3 });
    },
    'cast.tick': (t) => wood(t, 1450, 0.07, 0.035),
    // 당선 확실: 큰 도장 "쿵" + 맑은 종 한 번(확신의 여운). 종이 몸통을 채워 도장 타격만 튀지 않게 합니다.
    'cast.sure': (t) => {
      stamp(t, 1.3, 0.34);
      paper(t + 0.02, 0.16, { seed: 'sure', grains: 6, gain: 0.07 });
      // 종은 도장 쿵이 잦아든 뒤(0.16초)에 울려야 두 봉우리가 겹쳐 찢어지지 않습니다.
      glock(G5, t + 0.16, 0.06, 0.6);
      glock(C6, t + 0.16, 0.04, 0.5);
    },
    'reveal.flip': (t) => {
      noiseHit(t, 0.24, { type: 'bandpass', freq: 800, to: 3200, q: 0.8, gain: 0.14, attack: 0.05 });
      noiseHit(t + 0.21, 0.045, { type: 'bandpass', freq: 1600, q: 1.1, gain: 0.14, attack: 0.002 });
    },
    'reveal.drumroll': (t) => brushRoll(t, 2.5, 0.12),
    // 당선: 첼레스타 오름 선율 + 화음 여운 + 교실 박수(작게)
    'result.fanfare': (t) => {
      [G5, C6, E6, G6].forEach((f, i) => celesta(f, t + i * 0.12, 0.1, 1.2));
      [C6, E6, G6].forEach((f) => celesta(f, t + 0.55, 0.07, 1.9));
      glock(C7, t + 0.55, 0.06, 1.4);
      applause(t + 0.45, 1.7, 0.09);
    },
    'result.tie': (t) => {
      marimba(G5, t, 0.14);
      marimba(A5, t + 0.2, 0.15);
    },
    'result.pass': (t) => {
      stamp(t, 1.1, 0.3);
      glock(E6, t + 0.15, 0.09);
      glock(G6, t + 0.27, 0.1);
      glock(C7, t + 0.39, 0.1, 1.3);
    },
    // 부결: 슬프지 않게 — 도장 + 낮은 나무 두 음(내려가지만 짧고 부드럽게)
    'result.fail': (t) => {
      stamp(t, 1.0, 0.26);
      marimba(C5, t + 0.18, 0.1);
      marimba(G4, t + 0.36, 0.09);
    },
  };
  return voices;
}

/** 잡음 버퍼(고정 씨앗 — 매번 같은 결). @param {BaseAudioContext} ctx */
export function makeNoise(ctx) {
  const rnd = seededRandom('tidy-vote-noise');
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = rnd() * 2 - 1;
  return buf;
}

/**
 * 실시간 재생기.
 * @param {{createContext?:()=>AudioContext, files?:Record<string,string[]>}} [deps] files: 소리 id → 녹음 파일 주소들(번갈아 재생)
 */
export function createVoteAudio(deps = {}) {
  const createContext = deps.createContext ?? (() => new AudioContext());
  const files = deps.files ?? {};
  /** @type {AudioContext|null} */ let ctx = null;
  /** @type {GainNode|null} */ let master = null;
  /** @type {GainNode|null} */ let duck = null;
  // 배경 음악 통로: 음악(music.js) → musicIn → 음성 때 낮춤(musicSpeech) → 큰 효과음 때 낮춤(musicCue) → master.
  // 효과음 통로(duck)와 나눈 까닭: 음성 때 효과음은 −6dB, 음악은 그보다 깊게 낮추는 등 따로 움직여야 해서.
  /** @type {GainNode|null} */ let musicIn = null;
  /** @type {GainNode|null} */ let musicSpeech = null;
  /** @type {GainNode|null} */ let musicCue = null;
  /** 효과음 때문에 음악을 낮추는 구간들(performance.now 기준 ms). @type {{start:number, end:number, db:number}[]} */
  let cueDucks = [];
  let cueDuckDb = 0;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let cueTimer;
  /** 소리 장치가 켜졌을 때(자동 재생 잠금이 풀림 등) 알릴 곳. @type {Set<()=>void>} */
  const runningListeners = new Set();
  /** @type {ReturnType<typeof createTrimmedVoices>|null} */ let voices = null;
  /** @type {Map<string, AudioBuffer[]>} */ const buffers = new Map();
  /** @type {Map<string, number>} */ const rotation = new Map();
  /** @type {Set<AudioScheduledSourceNode>} */ const nodes = new Set();
  const gate = createVoiceGate();
  let volume = 70;
  let muted = false;
  let disposed = false;

  async function unlock() {
    if (disposed) return false;
    try {
      if (!ctx) {
        ctx = createContext();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : volumeGain(volume);
        duck = ctx.createGain();
        // 여러 소리가 겹쳐도 찢어지지 않게 부드러운 제한기를 마지막에 둡니다.
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 6;
        limiter.ratio.value = 8;
        limiter.attack.value = 0.002;
        limiter.release.value = 0.12;
        duck.connect(master);
        musicIn = ctx.createGain();
        musicSpeech = ctx.createGain();
        musicCue = ctx.createGain();
        musicIn.connect(musicSpeech);
        musicSpeech.connect(musicCue);
        musicCue.connect(master);
        master.connect(limiter);
        limiter.connect(ctx.destination);
        const live = ctx;
        live.addEventListener('statechange', () => {
          if (live.state === 'running' && !disposed) runningListeners.forEach((fn) => fn());
        });
        const noise = makeNoise(ctx);
        voices = createTrimmedVoices(ctx, duck, noise, (src) => {
          nodes.add(src);
          src.addEventListener('ended', () => nodes.delete(src));
        });
        void loadFiles();
      }
      if (ctx.state !== 'running') await ctx.resume();
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  async function loadFiles() {
    for (const [id, urls] of Object.entries(files)) {
      try {
        const list = await Promise.all(urls.map(async (url) => {
          const res = await fetch(url);
          return /** @type {AudioContext} */ (ctx).decodeAudioData(await res.arrayBuffer());
        }));
        buffers.set(id, list);
      } catch {
        // 파일을 못 읽으면 합성 소리를 그대로 씁니다.
      }
    }
  }

  /** 지금 걸린 효과음 구간 중 가장 깊은 낮춤으로 음악을 맞추고, 다음 구간 경계에 다시 봅니다.
   * 왜 타이머인가: 겹치는 효과음(드럼롤 뒤 팡파르 등)의 구간을 합치기 쉽고, setTargetAtTime은 어디서 끊겨도 이어서 움직여 튀지 않습니다. */
  function refreshCueDuck() {
    clearTimeout(cueTimer);
    const now = performance.now();
    cueDucks = cueDucks.filter((d) => d.end > now);
    const db = cueDucks.reduce((m, d) => (d.start <= now ? Math.max(m, d.db) : m), 0);
    if (musicCue && ctx && db !== cueDuckDb) {
      // 내릴 때는 빠르게(효과음 첫소리 전에), 올릴 때는 천천히(음악이 툭 튀어나오지 않게).
      musicCue.gain.cancelScheduledValues(ctx.currentTime);
      musicCue.gain.setTargetAtTime(dbToGain(-db), ctx.currentTime, db > cueDuckDb ? 0.04 : 0.35);
    }
    cueDuckDb = db;
    const next = cueDucks.reduce((m, d) => Math.min(m, d.start > now ? d.start : d.end), Infinity);
    if (Number.isFinite(next)) cueTimer = setTimeout(refreshCueDuck, Math.max(0, next - now) + 5);
  }

  return {
    unlock,
    // 음성은 효과음 감쇠 버스를 우회하고 같은 음량·음소거·최종 제한기를 사용합니다.
    async speechChannel() {
      if (!(await unlock()) || !ctx || !master) return null;
      return { context: ctx, destination: master };
    },
    /** 배경 음악 통로(음량·음소거·제한기는 효과음과 같이 씀). 소리 장치가 아직 잠겨 있으면 null. */
    async musicChannel() {
      if (!(await unlock()) || !ctx || !musicIn) return null;
      return { context: ctx, destination: /** @type {AudioNode} */ (musicIn) };
    },
    /** 소리 장치가 켜지면(첫 클릭으로 자동 재생 잠금이 풀리는 등) 부릅니다. @param {()=>void} fn */
    onRunning(fn) {
      runningListeners.add(fn);
      return () => runningListeners.delete(fn);
    },
    /** 소리 장치가 지금 켜져 있는지. */
    get running() {
      return !!ctx && ctx.state === 'running';
    },
    /** @param {string} id @param {{index?:number, variant?:number, delay?:number}} [o] */
    play(id, o = {}) {
      if (disposed || muted || !(id in CUES)) return;
      const now = performance.now() + (o.delay ?? 0) * 1000;
      if (!gate.allow(`${id}:${o.index ?? ''}`, now, /** @type {Record<string,number>} */ (CUES)[id])) return;
      const duckDb = MUSIC_DUCK[id];
      if (duckDb) {
        // 효과음이 나기 조금 전(60ms)부터 끝날 때까지 음악을 낮춥니다.
        cueDucks.push({ start: now - 60, end: now + /** @type {Record<string,number>} */ (CUES)[id], db: duckDb });
        refreshCueDuck();
      }
      void unlock().then((ok) => {
        if (!ok || !ctx || !voices || !duck) return;
        const at = ctx.currentTime + 0.004 + (o.delay ?? 0);
        const recorded = buffers.get(id);
        if (recorded?.length) {
          // 녹음 파일은 번갈아 재생합니다(vote.cast는 파일이 하나뿐이어야 합니다 — assets 테스트).
          const k = (rotation.get(id) ?? 0) % recorded.length;
          rotation.set(id, k + 1);
          const src = ctx.createBufferSource();
          src.buffer = recorded[k];
          src.connect(duck);
          nodes.add(src);
          src.onended = () => {
            nodes.delete(src);
            src.disconnect();
          };
          src.start(at);
          return;
        }
        voices[id]?.(at, o);
      });
    },
    /** 음성 안내 중에는 효과음을 −6dB, 배경 음악을 −8dB 낮춥니다. @param {boolean} on */
    duck(on) {
      if (duck && ctx) duck.gain.setTargetAtTime(on ? 0.5 : 1, ctx.currentTime, 0.05);
      if (musicSpeech && ctx) {
        // 앞서 걸어 둔 "다시 올리기"를 지워야, 쉼 중에 다음 말이 시작됐을 때 음악이 올라오지 않습니다.
        const t = ctx.currentTime;
        musicSpeech.gain.cancelScheduledValues(t);
        if (on) musicSpeech.gain.setTargetAtTime(dbToGain(-MUSIC_SPEECH_DUCK_DB), t, 0.08);
        else musicSpeech.gain.setTargetAtTime(1, t + MUSIC_SPEECH_HOLD, 0.35);
      }
    },
    /** @param {number} v 0~100 */
    setVolume(v) {
      volume = v;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volumeGain(v), ctx.currentTime, 0.02);
    },
    /** @param {boolean} m */
    setMuted(m) {
      muted = m;
      if (m) this.stop();
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : volumeGain(volume), ctx.currentTime, 0.02);
    },
    stop() {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {}
      }
      nodes.clear();
    },
    dispose() {
      disposed = true;
      this.stop();
      clearTimeout(cueTimer);
      runningListeners.clear();
      void ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

/** 검수용: 소리 하나를 오프라인(48kHz)으로 그려 샘플을 돌려줍니다(브라우저에서 음량 측정).
 * @param {string} id @param {{index?:number, variant?:number}} [o] @param {{trimmed?:boolean, tame?:Record<string, number|null>}} [opts] */
export async function renderCue(id, o = {}, opts = {}) {
  const sr = 48000;
  const len = Math.ceil(((/** @type {Record<string,number>} */ (CUES)[id] ?? 1000) / 1000 + 1.6) * sr);
  const off = new OfflineAudioContext(1, len, sr);
  const voices = createTrimmedVoices(off, off.destination, makeNoise(off), undefined, opts);
  voices[id]?.(0.05, o);
  const buf = await off.startRendering();
  return buf.getChannelData(0);
}
