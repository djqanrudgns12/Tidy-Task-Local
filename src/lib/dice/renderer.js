/** 주사위 하나를 캔버스에 그립니다 — WebGL(둥근 정육면체 한 덩어리 + 빛)을 쓰고, 못 쓰는 PC에서는 2D로 정면만 그립니다.
 *
 * 화면 맞춤: 멈춰 정면을 볼 때 예전 CSS 주사위와 같은 크기·그러데이션·흰 광택·테두리가 나오도록 맞췄습니다.
 *  - 바탕 그러데이션과 흰 광택은 면 그림이 아니라 화면 위치·법선으로 칠합니다. 그래서 멈추면 예전과 같은 자리에 보이고,
 *    굴러갈 때는 빛이 고정된 실제 물체처럼 명암·광택이 제자리에 머물고 면이 그 아래를 지나갑니다(그림처럼 면에 붙어 돌지 않음).
 *  - 둥근 모서리의 반짝임은 왼쪽 위 빛의 정반사(Blinn-Phong)입니다.
 *  - 테두리는 시선과 거의 나란한 곡면(실루엣)만 모서리색으로 칠해, 어느 자세에서도 두께가 일정한 윤곽선이 됩니다. */
import { roundedBox, atlasCell, ATLAS_COLUMNS, ATLAS_ROWS, BEVEL, FACE_FRAMES } from './geometry.js';
import { toMat3, rotate } from './rotation.js';
import { supportHeight, frontFace } from './motion.js';
import { paintFace, paintFlatBody, parseColor } from './faceArt.js';

/** 캔버스 한 변 = 주사위 한 변 × 이 값. 꼭짓점으로 선 자세(중심~꼭짓점 0.73)에 늘어남·원근까지 담기는 크기. */
export const BOX_PER_SIZE = 1.9;
/** 카메라 거리(중심~면 = 1 기준). 한 변의 4.5배 — 예전 CSS 원근(한 변의 5배)과 비슷하게 살짝만 입체적으로. */
const CAMERA = 9;
// 빛: 왼쪽 위 앞. 예전 그러데이션의 밝은 쪽(왼쪽 위)과 같은 방향이라 멈춘 모습과 굴러가는 모습의 명암이 이어집니다.
const LIGHT = [-0.5, 0.75, 0.55];

const VERTEX = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat3 uNormalMatrix;
uniform mat4 uViewProj;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = uNormalMatrix * aNormal;
  vUv = aUv;
  gl_Position = uViewProj * world;
}`;

const FRAGMENT = (/** @type {string} */ precision) => `
precision ${precision} float;
uniform sampler2D uArt;
uniform vec3 uFace;
uniform vec3 uEdge;
uniform vec3 uLightTint;
uniform vec3 uCamera;
uniform vec3 uLight;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;

// 정면 좌표 q(-1~1, 위가 +)에서 예전 CSS 그러데이션: radial-gradient(125% 125% at 28% 20%, 밝은색 0%, 면색 44%, 면색 84%+모서리색 100%)
vec3 paint(vec2 q) {
  vec2 uv = vec2(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
  float t = length(uv - vec2(0.28, 0.20)) / 1.25;
  vec3 dark = mix(uFace, uEdge, 0.16);
  if (t < 0.44) return mix(uLightTint, uFace, t / 0.44);
  return mix(uFace, dark, clamp((t - 0.44) / 0.56, 0.0, 1.0));
}

// 예전 흰 광택(폭 30%·높이 13% 타원을 -18° 돌린 것). 예전 자리(위 9%)는 이제 둥근 모서리 위라 가늘게 눌려 보여서,
// 평평한 면 안쪽으로 조금 내려(가운데 28%·21%) 같은 모양으로 보이게 합니다.
float sheen(vec2 q) {
  vec2 d = vec2(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5) - vec2(0.28, 0.21);
  float c = 0.9510565;
  float s = 0.3090170;
  vec2 r = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  return 1.0 - smoothstep(0.84, 1.0, length(r / vec2(0.15, 0.065)));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamera - vWorld);
  // 바탕 그러데이션: 화면 위치 + 법선으로 잡습니다. 멈춘 정면에서는 위치 그대로(예전 CSS와 같음)이고, 둥근 모서리로 갈수록
  // 법선만큼 바깥 색으로 매끄럽게 넘어갑니다. 반사 방향으로 잡으면 모서리에서 값이 급히 바뀌어 평평한 면 둘레에 액자 같은 경계가 보였습니다.
  vec2 place = vWorld.xy + N.xy * 0.35;
  vec3 body = mix(mix(uFace, uEdge, 0.16), paint(place), smoothstep(-0.1, 0.6, N.z));
  // 흰 광택: 화면을 향한 면의 왼쪽 위에 맺히고, 면이 기울면 기운 쪽으로 밀려납니다(빛·카메라가 고정된 실제 반사처럼
  // 광택이 화면에서 거의 제자리에 머물고 그 자리를 지나가는 면에 맺힘). 순수 반사각으로 잡으면 멈춘 자세가 4°만 틀어져도
  // 광택이 면 반대쪽으로 튀어, 주사위마다 광택 자리가 제각각이었습니다.
  float gloss = sheen(vWorld.xy + N.xy * 0.6) * smoothstep(0.55, 0.9, N.z);
  vec4 art = texture2D(uArt, vUv);
  vec3 surface = art.rgb + body * (1.0 - art.a);
  float wrap = dot(N, uLight) * 0.5 + 0.5;
  vec3 color = surface * (0.74 + 0.34 * wrap);
  color = mix(color, vec3(1.0), 0.55 * gloss * (1.0 - art.a));
  vec3 H = normalize(uLight + V);
  color += vec3(pow(max(dot(N, H), 0.0), 70.0) * 0.28);
  float rim = 1.0 - smoothstep(0.14, 0.34, dot(N, V));
  color = mix(color, uEdge * 0.96, rim * 0.85);
  gl_FragColor = vec4(min(color, vec3(1.0)), 1.0);
}`;

/** @typedef {import('./faceArt.js').DicePalette} DicePalette */
/** @typedef {import('./faceArt.js').DieMood} DieMood */
/** @typedef {import('./motion.js').DiePose} DiePose */
/** @typedef {{kind: 'webgl'|'flat', resize(cssBox: number, dpr: number, size: number): void, setArt(value: number, mood: DieMood): void, render(pose: DiePose): void, dispose(): void}} DieRenderer */

/** 면 그림 한 칸의 해상도. 화면에 보이는 크기보다 조금 크면 충분하고, 크게 잡을수록 그래픽 메모리를 많이 씁니다.
 * @param {number} size @param {number} dpr */
const cellSizeFor = (size, dpr) => (size * dpr > 300 ? 512 : 256);

/** @param {HTMLCanvasElement} canvas @param {DicePalette} palette @returns {DieRenderer} */
export function createDieRenderer(canvas, palette) {
  const options = { alpha: true, antialias: true, premultipliedAlpha: true, depth: true, powerPreference: /** @type {const} */ ('low-power') };
  /** @type {WebGLRenderingContext|WebGL2RenderingContext|null} */
  let gl = null;
  try {
    gl = /** @type {WebGL2RenderingContext|null} */ (canvas.getContext('webgl2', options)) ?? /** @type {WebGLRenderingContext|null} */ (canvas.getContext('webgl', options));
  } catch {
    gl = null;
  }
  if (gl) {
    try {
      return webglRenderer(canvas, gl, palette);
    } catch {
      // 셰이더 컴파일 실패 등 — 이 캔버스는 이미 WebGL에 묶였으므로 2D용 새 캔버스로 바꿔 끼웁니다.
      const fresh = document.createElement('canvas');
      fresh.className = canvas.className;
      fresh.setAttribute('aria-hidden', 'true');
      canvas.replaceWith(fresh);
      return flatRenderer(fresh, palette);
    }
  }
  return flatRenderer(canvas, palette);
}

/** @param {HTMLCanvasElement} canvas @param {WebGLRenderingContext|WebGL2RenderingContext} gl @param {DicePalette} palette @returns {DieRenderer} */
function webglRenderer(canvas, gl, palette) {
  const mesh = roundedBox();
  const colors = { face: parseColor(palette.face), edge: parseColor(palette.edge), light: parseColor(palette.light) };
  const light = (() => { const l = Math.hypot(...LIGHT); return LIGHT.map((v) => v / l); })();
  const cellCanvas = document.createElement('canvas');
  const cellCtx = /** @type {CanvasRenderingContext2D} */ (cellCanvas.getContext('2d'));
  /** @type {Map<number, string>} 면마다 지금 올라가 있는 표정('' = 표정 없음) */
  const uploaded = new Map();
  let wanted = { value: 1, mood: /** @type {DieMood} */ (null) };
  let cell = 256;
  let box = 0;
  let dpr = 1;
  let size = 0;
  let lost = false;
  let mipsDirty = false;
  /** @type {DiePose|null} */ let lastPose = null;
  /** @type {{program: WebGLProgram, buffers: WebGLBuffer[], texture: WebGLTexture, uniforms: Record<string, WebGLUniformLocation|null>}|null} */
  let res = null;

  /** @param {number} type @param {string} source */
  function compile(type, source) {
    const shader = /** @type {WebGLShader} */ (gl.createShader(type));
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    return shader;
  }

  function init() {
    const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const program = /** @type {WebGLProgram} */ (gl.createProgram());
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT(high && high.precision > 0 ? 'highp' : 'mediump')));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    gl.useProgram(program);
    const buffers = [];
    for (const [name, data, width] of /** @type {const} */ ([['aPosition', mesh.positions, 3], ['aNormal', mesh.normals, 3], ['aUv', mesh.uvs, 2]])) {
      const buffer = /** @type {WebGLBuffer} */ (gl.createBuffer());
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, width, gl.FLOAT, false, 0, 0);
      buffers.push(buffer);
    }
    const indexBuffer = /** @type {WebGLBuffer} */ (gl.createBuffer());
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    buffers.push(indexBuffer);
    const texture = /** @type {WebGLTexture} */ (gl.createTexture());
    /** @type {Record<string, WebGLUniformLocation|null>} */
    const uniforms = {};
    for (const name of ['uModel', 'uNormalMatrix', 'uViewProj', 'uArt', 'uFace', 'uEdge', 'uLightTint', 'uCamera', 'uLight'])
      uniforms[name] = gl.getUniformLocation(program, name);
    gl.uniform3fv(uniforms.uFace, colors.face);
    gl.uniform3fv(uniforms.uEdge, colors.edge);
    gl.uniform3fv(uniforms.uLightTint, colors.light);
    gl.uniform3fv(uniforms.uLight, light);
    gl.uniform3f(uniforms.uCamera, 0, 0, CAMERA);
    gl.uniform1i(uniforms.uArt, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
    res = { program, buffers, texture, uniforms };
    allocateTexture();
  }

  /** 그림판(4×2칸)을 새로 잡고 여섯 면을 다시 그립니다. */
  function allocateTexture() {
    if (!res) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, res.texture);
    // 캔버스 그림을 "미리 곱한 알파"로 올려야 밉맵으로 작아질 때 투명 바탕의 검은 테가 번지지 않습니다.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cell * ATLAS_COLUMNS, cell * ATLAS_ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    cellCanvas.width = cell;
    cellCanvas.height = cell;
    uploaded.clear();
    syncArt();
  }

  /** @param {number} value @param {string} mood */
  function uploadCell(value, mood) {
    if (!res) return;
    cellCtx.setTransform(1, 0, 0, 1, 0, 0);
    cellCtx.clearRect(0, 0, cell, cell);
    cellCtx.setTransform(cell / 100, 0, 0, cell / 100, 0, 0);
    paintFace(cellCtx, value, /** @type {DieMood} */ (mood || null), palette);
    const { column, row } = atlasCell(value);
    gl.bindTexture(gl.TEXTURE_2D, res.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, column * cell, row * cell, gl.RGBA, gl.UNSIGNED_BYTE, cellCanvas);
    uploaded.set(value, mood);
    mipsDirty = true;
  }

  function syncArt() {
    for (let value = 1; value <= 6; value++) {
      const mood = value === wanted.value ? wanted.mood ?? '' : '';
      if (uploaded.get(value) !== mood) uploadCell(value, mood);
    }
  }

  function viewProjection() {
    // 멈춘 정면에서 실루엣(옆면이 가장 앞으로 나온 곳, z = 1 - BEVEL)이 정확히 한 변 크기가 되는 초점 거리
    const k = box ? (size / box) * (CAMERA - (1 - BEVEL)) : 1;
    const near = CAMERA - 2.2;
    const far = CAMERA + 2.2;
    const a = -(far + near) / (far - near);
    const b = (-2 * far * near) / (far - near);
    return new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, a, -1, 0, 0, b - a * CAMERA, CAMERA]);
  }

  function draw() {
    if (!res || lost || !lastPose || !canvas.width) return;
    const { q, sx, sy } = lastPose;
    const m = toMat3(q);
    const contact = supportHeight(q);
    // 찌그러짐은 바닥에 닿은 점을 기준으로(월드 세로축) — 찌그러져도 바닥에서 떨어지지 않습니다.
    const model = new Float32Array([
      sx * m[0], sy * m[3], sx * m[6], 0,
      sx * m[1], sy * m[4], sx * m[7], 0,
      sx * m[2], sy * m[5], sx * m[8], 0,
      0, contact * (sy - 1), 0, 1,
    ]);
    const normal = new Float32Array([
      m[0] / sx, m[3] / sy, m[6] / sx,
      m[1] / sx, m[4] / sy, m[7] / sx,
      m[2] / sx, m[5] / sy, m[8] / sx,
    ]);
    gl.useProgram(res.program);
    if (mipsDirty) {
      gl.bindTexture(gl.TEXTURE_2D, res.texture);
      gl.generateMipmap(gl.TEXTURE_2D);
      mipsDirty = false;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniformMatrix4fv(res.uniforms.uModel, false, model);
    gl.uniformMatrix3fv(res.uniforms.uNormalMatrix, false, normal);
    gl.uniformMatrix4fv(res.uniforms.uViewProj, false, viewProjection());
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
  }

  const onLost = (/** @type {Event} */ event) => {
    event.preventDefault(); // 복구를 허락해야 restored가 옵니다.
    lost = true;
    res = null;
  };
  const onRestored = () => {
    lost = false;
    try {
      init();
      draw();
    } catch {}
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  init();

  return {
    kind: 'webgl',
    resize(cssBox, nextDpr, nextSize) {
      box = cssBox;
      dpr = nextDpr;
      size = nextSize;
      const px = Math.max(1, Math.round(cssBox * nextDpr));
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      const nextCell = cellSizeFor(nextSize, nextDpr);
      if (nextCell !== cell) {
        cell = nextCell;
        if (!lost) allocateTexture();
      }
      draw();
    },
    setArt(value, mood) {
      wanted = { value, mood };
      if (!lost) syncArt();
    },
    render(pose) {
      lastPose = pose;
      draw();
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (res && !lost) {
        for (const buffer of res.buffers) gl.deleteBuffer(buffer);
        gl.deleteTexture(res.texture);
        gl.deleteProgram(res.program);
      }
      res = null;
      // 개수를 바꿀 때마다 주사위가 새로 생기므로 문맥을 바로 돌려줘야 브라우저 한도(약 16개)에 닿지 않습니다.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/** WebGL이 없을 때: 정면에 가장 가까운 면 하나를 2D로 돌리고 눌러 그립니다. 입체감은 덜하지만 결과는 똑같이 읽힙니다.
 * @param {HTMLCanvasElement} canvas @param {DicePalette} palette @returns {DieRenderer} */
function flatRenderer(canvas, palette) {
  const ctx = canvas.getContext('2d');
  /** @type {Map<string, HTMLCanvasElement>} */
  const faces = new Map();
  let wanted = { value: 1, mood: /** @type {DieMood} */ (null) };
  let box = 0;
  let dpr = 1;
  let size = 0;
  /** @type {DiePose|null} */ let lastPose = null;

  /** @param {number} value @param {DieMood} mood */
  function face(value, mood) {
    const key = `${value}:${mood ?? ''}:${Math.round(size * dpr)}`;
    let image = faces.get(key);
    if (!image) {
      image = document.createElement('canvas');
      const px = Math.max(1, Math.round(size * dpr));
      image.width = px;
      image.height = px;
      const c = /** @type {CanvasRenderingContext2D} */ (image.getContext('2d'));
      c.setTransform(px / 100, 0, 0, px / 100, 0, 0);
      paintFlatBody(c, palette);
      paintFace(c, value, mood, palette);
      if (faces.size > 24) faces.clear();
      faces.set(key, image);
    }
    return image;
  }

  function draw() {
    if (!ctx || !lastPose || !canvas.width) return;
    const { q, sx, sy } = lastPose;
    const value = frontFace(q);
    const frame = FACE_FRAMES[/** @type {1} */ (value)];
    const n = rotate(q, /** @type {any} */ (frame.normal));
    const up = rotate(q, /** @type {any} */ (frame.up));
    const px = size * dpr;
    const centre = (box * dpr) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 바닥 기준으로 누르고, 면의 위쪽이 가리키는 방향만큼 돌리고, 기운 만큼 가로로 줄입니다.
    ctx.translate(centre, centre + px / 2);
    ctx.scale(sx, sy);
    ctx.translate(0, -px / 2);
    ctx.rotate(Math.atan2(up[0], up[1]));
    ctx.scale(Math.max(0.25, n[2]), 1);
    ctx.drawImage(face(value, value === wanted.value ? wanted.mood : null), -px / 2, -px / 2, px, px);
  }

  return {
    kind: 'flat',
    resize(cssBox, nextDpr, nextSize) {
      box = cssBox;
      dpr = nextDpr;
      size = nextSize;
      const px = Math.max(1, Math.round(cssBox * nextDpr));
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      draw();
    },
    setArt(value, mood) {
      wanted = { value, mood };
    },
    render(pose) {
      lastPose = pose;
      draw();
    },
    dispose() {
      faces.clear();
    },
  };
}
