// 학급 투표의 모든 무작위(표 끼워 넣기 위치 · 개표 순서 · 기호 추첨 · id)는 이 파일을 거칩니다.
// 왜 crypto인가: Math.random은 예측 가능한 난수라, "누가 몇 번째로 투표했는지"를 저장 순서에서 되짚을 여지를 없애려면
//   운영체제가 주는 암호학적 난수를 쓰는 편이 맞습니다. 테스트에서는 난수 함수를 주입해 결과를 고정합니다.

/** @returns {number} 0 이상 1 미만 */
export function secureRandom() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 시각·순번이 들어가지 않는 무작위 id. @param {string} prefix @param {number} [length] @param {()=>number} [rng] */
export function randomId(prefix, length = 10, rng = secureRandom) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return `${prefix}_${out}`;
}

/** 새 배열로 섞습니다(원본은 그대로). @template T @param {readonly T[]} list @param {()=>number} [rng] @returns {T[]} */
export function fisherYates(list, rng = secureRandom) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 길이 length인 목록에 끼워 넣을 위치(0~length). u는 표를 만들 때 한 번 뽑은 0~1 값입니다.
 * 왜 값을 미리 뽑는가: 다른 창과 충돌해 변경을 다시 적용해도 같은 규칙으로 위치가 정해지게 하려는 것입니다.
 * @param {number} u @param {number} length */
export function insertIndex(u, length) {
  const n = Math.max(0, Math.floor(length));
  const v = Number.isFinite(u) ? Math.min(Math.max(u, 0), 0.999999999) : 0;
  return Math.min(n, Math.floor(v * (n + 1)));
}

/** 문자열에서 만든 결정적 난수(같은 투표 id면 같은 캐릭터 순서). 표·개표에는 쓰지 않습니다.
 * @param {string} seed @returns {()=>number} */
export function seededRandom(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  // mulberry32
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
