/** 주사위 면 그림(눈·하트·표정) — 100×100 좌표로 캔버스에 그립니다. 예전 SVG와 같은 자리·크기라 모양이 그대로입니다.
 * 면 바탕색은 그리지 않고 투명으로 둡니다. 바탕(광택·그러데이션)은 WebGL이 빛 방향에 맞춰 칠하고, 그림만 그 위에 얹습니다. */

/** @typedef {{face: string, edge: string, pip: string, light: string}} DicePalette */
/** @typedef {'smile'|'squint'|null} DieMood */

// 3×3 격자의 표준 눈 자리. 1은 하트로 따로 그립니다.
const L = 27, C = 50, R = 73;
export const PIPS = Object.freeze({
  2: [[L, L], [R, R]],
  3: [[L, L], [C, C], [R, R]],
  4: [[L, L], [R, L], [L, R], [R, R]],
  5: [[L, L], [R, L], [C, C], [L, R], [R, R]],
  6: [[L, L], [L, C], [L, R], [R, L], [R, C], [R, R]],
});
const PIP_R = 8.5;
const HEART = 'M50 67C46.6 64.2 33 55.4 33 44.4 33 38.2 37.6 34 42.9 34 46.2 34 48.7 35.9 50 38.4 51.3 35.9 53.8 34 57.1 34 62.4 34 67 38.2 67 44.4 67 55.4 53.4 64.2 50 67Z';
// 하트는 세 면색(복숭아·민트·레몬) 모두에서 3.7:1 이상 대비가 나는 빨강입니다.
const HEART_COLOR = '#b8283a';
const BLUSH = '#ff8fa3';

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} r @param {string} color @param {number} [alpha] */
function dot(ctx, x, y, r, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
/** @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} rx @param {number} ry @param {string} color @param {number} [alpha] @param {number} [rotation] */
function oval(ctx, cx, cy, rx, ry, color, alpha = 1, rotation = 0) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
/** @param {CanvasRenderingContext2D} ctx @param {string} path @param {string} color */
function line(ctx, path, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(path));
}

/** 눈 하나: 짙은 원 + 왼쪽 위 작은 반사광. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {string} color */
function pip(ctx, x, y, color) {
  dot(ctx, x, y, PIP_R, color);
  dot(ctx, x - 2.6, y - 2.8, 2, '#fff', 0.42);
}

/** 면 하나를 그립니다. ctx는 이미 100×100 좌표로 맞춰져 있고 투명하게 비워져 있어야 합니다.
 * 기다릴 때는 웃는 얼굴, 던지는 순간에는 질끈 감은 얼굴 — 그 밖에는 눈(결과)만 보여 읽기 쉽게 둡니다.
 * @param {CanvasRenderingContext2D} ctx @param {number} value @param {DieMood} mood @param {DicePalette} palette */
export function paintFace(ctx, value, mood, palette) {
  if (mood) {
    oval(ctx, 24, 60, 8, 5, BLUSH, 0.5);
    oval(ctx, 76, 60, 8, 5, BLUSH, 0.5);
    if (mood === 'smile') {
      dot(ctx, 36, 46, 5.6, palette.pip);
      dot(ctx, 64, 46, 5.6, palette.pip);
      dot(ctx, 37.8, 44, 1.7, '#fff', 0.42);
      dot(ctx, 65.8, 44, 1.7, '#fff', 0.42);
      line(ctx, 'M42 58 Q50 66.5 58 58', palette.pip);
    } else {
      line(ctx, 'M30 39.5 L39.5 46 L30 52.5', palette.pip);
      line(ctx, 'M70 39.5 L60.5 46 L70 52.5', palette.pip);
      oval(ctx, 50, 61, 3.6, 3.2, palette.pip);
    }
    return;
  }
  if (value === 1) {
    ctx.fillStyle = HEART_COLOR;
    ctx.fill(new Path2D(HEART));
    oval(ctx, 41.5, 41, 3.2, 2.2, '#fff', 0.42, (-30 * Math.PI) / 180);
    return;
  }
  for (const [x, y] of PIPS[/** @type {2} */ (value)] ?? []) pip(ctx, x, y, palette.pip);
}

/** WebGL을 못 쓰는 PC용: 면 바탕(예전 CSS와 같은 그러데이션·테두리·광택)까지 한 장에 그립니다.
 * @param {CanvasRenderingContext2D} ctx @param {DicePalette} palette */
export function paintFlatBody(ctx, palette) {
  const body = new Path2D();
  body.roundRect(0, 0, 100, 100, 21);
  const gradient = ctx.createRadialGradient(28, 20, 0, 28, 20, 125);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(0.44, palette.face);
  gradient.addColorStop(1, mixHex(palette.face, palette.edge, 0.16));
  ctx.fillStyle = gradient;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = palette.edge;
  ctx.globalAlpha = 0.75;
  ctx.stroke(body);
  ctx.restore();
  oval(ctx, 28, 15.5, 15, 6.5, '#fff', 0.55, (-18 * Math.PI) / 180);
}

/** '#rgb'·'#rrggbb'·'rgb(r, g, b)' → [0~1, 0~1, 0~1]. 알 수 없는 값은 회색. @param {string} color @returns {[number, number, number]} */
export function parseColor(color) {
  const text = String(color).trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(text);
  if (short) return /** @type {[number, number, number]} */ (short.slice(1).map((h) => parseInt(h + h, 16) / 255));
  const long = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(text);
  if (long) return /** @type {[number, number, number]} */ (long.slice(1).map((h) => parseInt(h, 16) / 255));
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (rgb) return /** @type {[number, number, number]} */ (rgb.slice(1).map((v) => Math.min(1, Number(v) / 255)));
  return [0.6, 0.6, 0.6];
}

/** 두 색을 섞은 '#rrggbb'. @param {string} a @param {string} b @param {number} t b의 비율 */
export function mixHex(a, b, t) {
  const [x, y] = [parseColor(a), parseColor(b)];
  return `#${x.map((v, i) => Math.round((v + (y[i] - v) * t) * 255).toString(16).padStart(2, '0')).join('')}`;
}
