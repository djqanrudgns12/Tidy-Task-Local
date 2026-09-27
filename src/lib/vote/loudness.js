// 음량 측정(PRD 10절 "같은 조건으로 맞춤"): ITU-R BS.1770-4 통합 음량(LUFS)과 트루 피크(dBTP).
// 효과음 26종을 목표 음량 ±1dB · 최고점 −3dBTP 이하로 맞출 때 씁니다(검수 페이지 · 단위 테스트).
// 화면·저장소와 상관없는 순수 함수라 node에서도 돌아갑니다.

/** @typedef {{b0:number, b1:number, b2:number, a1:number, a2:number}} Biquad */

/** K 가중 필터 두 단(고역 선반 + RLB 고역 통과). 계수는 표본율에 맞춰 계산합니다(libebur128과 같은 식).
 * @param {number} fs @returns {[Biquad, Biquad]} */
function kWeighting(fs) {
  // 1단: 머리 효과를 흉내 내는 고역 선반(+4dB, 1.68kHz)
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // 2단: 38Hz 고역 통과
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const highpass = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [shelf, highpass];
}

/** @param {ArrayLike<number>} x @param {Biquad} f @returns {Float64Array} */
function filter(x, f) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const out = f.b0 * v + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = out;
    y[i] = out;
  }
  return y;
}

/**
 * 통합 음량(모노). 400ms 블록 · 75% 겹침 · 절대 게이트 −70LUFS · 상대 게이트 −10LU.
 * 400ms보다 짧은 소리는 뒤를 0으로 채운 한 블록으로 잽니다(ffmpeg ebur128과 같은 결과를 내도록).
 * @param {Float32Array|number[]} samples @param {number} sampleRate @returns {number} LUFS(무음이면 -Infinity)
 */
export function integratedLoudness(samples, sampleRate) {
  const [s1, s2] = kWeighting(sampleRate);
  const k = filter(filter(samples, s1), s2);
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  const length = Math.max(k.length, block);
  /** @type {number[]} */ const powers = [];
  for (let start = 0; start + block <= length; start += step) {
    let sum = 0;
    const end = Math.min(start + block, k.length);
    for (let i = start; i < end; i++) sum += k[i] * k[i];
    powers.push(sum / block);
  }
  const lufs = (/** @type {number} */ z) => -0.691 + 10 * Math.log10(z);
  const aboveAbsolute = powers.filter((z) => z > 0 && lufs(z) > -70);
  if (!aboveAbsolute.length) return -Infinity;
  const mean = (/** @type {number[]} */ list) => list.reduce((a, b) => a + b, 0) / list.length;
  const relativeGate = lufs(mean(aboveAbsolute)) - 10;
  const gated = aboveAbsolute.filter((z) => lufs(z) > relativeGate);
  return lufs(mean(gated));
}

/**
 * 트루 피크(dBTP): 4배 올려 표본화(한 위상에 12탭, 해닝 창 싱크)한 뒤 가장 큰 절댓값.
 * 표본 사이에서 솟는 봉우리까지 잡아 스피커에서 찢어지는 소리를 미리 막습니다.
 * @param {Float32Array|number[]} samples @returns {number}
 */
export function truePeak(samples) {
  const factor = 4;
  const half = 6;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  for (let phase = 1; phase < factor; phase++) {
    const frac = phase / factor;
    /** @type {number[]} */ const taps = [];
    for (let t = -half + 1; t <= half; t++) {
      const x = t - frac;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / half);
      taps.push(sinc * w);
    }
    for (let i = 0; i < samples.length; i++) {
      let v = 0;
      for (let t = 0; t < taps.length; t++) {
        const j = i + t - half + 1;
        if (j >= 0 && j < samples.length) v += samples[j] * taps[t];
      }
      peak = Math.max(peak, Math.abs(v));
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}
