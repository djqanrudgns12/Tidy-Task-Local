import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const originalDir = path.join(root, 'artwork/toolkit/vote/characters/originals');
const runtimeDir = path.join(root, 'src/assets/vote/characters');
const outputDir = path.join(root, 'output/vote-characters');
const manifestPath = path.join(root, 'artwork/toolkit/vote/characters/manifest.json');
const labels = {
  m1: '스포츠머리 · 남색 후드티', m2: '곱슬머리 · 나비넥타이', m3: '옆가르마 · 동그란 안경',
  m4: '삐죽 앞머리 · 줄무늬 티', m5: '바가지머리 · 멜빵바지', m6: '야구모자 · 볼 반창고',
  m7: '투블럭 · 체크 셔츠', m8: '파마머리 · 작은 책가방', m9: '땀밴드 · 체육복',
  f1: '양갈래 땋은 머리 · 멜빵 치마', f2: '똥머리 · 리본 브로치', f3: '일자 앞머리 단발 · 세일러 칼라',
  f4: '높은 포니테일 · 줄무늬 티', f5: '긴 생머리 · 머리띠', f6: '곱슬 단발 · 꽃 핀',
  f7: '짧은 양갈래 · 방울 머리끈', f8: '반묶음 · 큰 리본', f9: '숏컷 · 동그란 안경',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} 실행 실패: ${result.error?.message ?? result.stderr?.toString('utf8') ?? result.status}`);
  }
  return result.stdout;
}

function dimensions(file) {
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]).toString());
  const { width, height } = data.streams[0];
  if (!width || !height) throw new Error(`이미지 크기를 읽지 못했습니다: ${file}`);
  return { width, height };
}

function decode(file) {
  const { width, height } = dimensions(file);
  const rgba = run('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
  if (rgba.length !== width * height * 4) throw new Error(`RGBA 데이터 길이가 다릅니다: ${file}`);
  return { width, height, rgba };
}

function inspect({ width, height, rgba }) {
  let min = 255, max = 0, left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      min = Math.min(min, alpha); max = Math.max(max, alpha);
      if (alpha > 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
  }
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map(i => rgba[i * 4 + 3]);
  if (right < left) throw new Error('알파가 8보다 큰 인형 픽셀이 없습니다.');
  const box = { left, right, top, bottom, width: right - left + 1, height: bottom - top + 1,
    centerX: (left + right) / 2, topRatio: top / height, bottomRatio: bottom / height,
    leftRatio: left / width, rightRatio: right / width, heightRatio: (bottom - top + 1) / height };
  const headEnd = top + Math.round(box.height * 0.38);
  let headLeft = width, headRight = -1;
  for (let y = top; y <= headEnd; y++) for (let x = left; x <= right; x++) {
    if (rgba[(y * width + x) * 4 + 3] > 8) { headLeft = Math.min(headLeft, x); headRight = Math.max(headRight, x); }
  }
  return { alpha: { min, max, corners }, box, headCenterX: (headLeft + headRight) / 2 };
}

function sha(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function relative(file) { return path.relative(root, file).replaceAll('\\', '/'); }

const [id, ...args] = process.argv.slice(2);
if (id === '--inspect') {
  for (const file of args) console.log(JSON.stringify({ path: file, ...dimensions(file), ...inspect(decode(file)) }));
  process.exit(0);
}
if (!labels[id]) throw new Error('사용법: node scripts/vote-characters.mjs f1 --source=원본.png --eyes=왼쪽x,y,오른쪽x,y --face=왼쪽x,오른쪽x --face-y=y [--attempts=4]');
const value = key => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const source = value('source');
const attempts = Number(value('attempts') ?? 1);
if (!Number.isInteger(attempts) || attempts < 1) throw new Error('시도 횟수가 잘못됐습니다.');
mkdirSync(originalDir, { recursive: true });
mkdirSync(runtimeDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });
const checkDir = path.join(outputDir, 'check');
mkdirSync(checkDir, { recursive: true });
const original = path.join(originalDir, `${id}.png`);
if (source) copyFileSync(source, original);
if (!existsSync(original)) throw new Error(`원본이 없습니다: ${original}`);
const src = decode(original);
const originalCheck = inspect(src);
if (originalCheck.alpha.min !== 0 || originalCheck.alpha.max !== 255 || originalCheck.alpha.corners.some(n => n !== 0)) {
  throw new Error('원본 알파 검사 실패: 실제 투명 배경이 아닙니다.');
}
const oldManifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const previous = oldManifest?.characters?.find(item => item.id === id);
const parseNumbers = (key, count) => {
  const raw = value(key) ?? previous?.measurement?.source?.[key]?.join(',');
  const numbers = raw?.split(',').map(Number);
  if (!numbers || numbers.length !== count || numbers.some(n => !Number.isFinite(n))) throw new Error(`${key} 실측 좌표 ${count}개가 필요합니다.`);
  return numbers;
};
const [leftEyeX, leftEyeY, rightEyeX, rightEyeY] = parseNumbers('eyes', 4);
const [faceLeft, faceRight] = parseNumbers('face', 2);
const faceY = Number(value('face-y') ?? previous?.measurement?.source?.faceY);
if (!Number.isFinite(faceY) || faceLeft >= faceRight) throw new Error('볼 높이의 얼굴 경계를 지정해 주세요.');
const eyesX = (leftEyeX + rightEyeX) / 2, eyesY = (leftEyeY + rightEyeY) / 2;
const faceWidth = faceRight - faceLeft;
const scale = 214 / faceWidth;
const scaledWidth = Math.round(src.width * scale), scaledHeight = Math.round(src.height * scale);
const moveX = Math.round(256 - eyesX * scale), moveY = Math.round(240 - eyesY * scale);
const filter = `format=rgba,premultiply=inplace=1,scale=${scaledWidth}:${scaledHeight}:flags=lanczos,unpremultiply=inplace=1,format=rgba`;
const scaled = run('ffmpeg', ['-v', 'error', '-i', original, '-vf', filter, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1']);
if (scaled.length !== scaledWidth * scaledHeight * 4) throw new Error('크기 변경 RGBA 길이가 다릅니다.');
const normalized = Buffer.alloc(512 * 512 * 4);
const preMask = Buffer.alloc(512 * 512 * 4);
for (let y = 0; y < 512; y++) {
  const sy = Math.min(y - moveY, scaledHeight - 1);
  if (sy < 0) continue;
  for (let x = 0; x < 512; x++) {
    const sx = x - moveX;
    if (sx < 0 || sx >= scaledWidth) continue;
    const target = (y * 512 + x) * 4, input = (sy * scaledWidth + sx) * 4;
    scaled.copy(preMask, target, input, input + 4);
    scaled.copy(normalized, target, input, input + 4);
    const distance = Math.hypot(x + .5 - 256, y + .5 - 256);
    const coverage = Math.max(0, Math.min(1, 256 - distance));
    normalized[target + 3] = Math.round(normalized[target + 3] * coverage);
    if (normalized[target + 3] === 0) normalized.fill(0, target, target + 3);
  }
}
const normalizedCheck = inspect({ width: 512, height: 512, rgba: normalized });
if (normalizedCheck.alpha.min !== 0 || normalizedCheck.alpha.max !== 255 || normalizedCheck.alpha.corners.some(n => n !== 0)) throw new Error('원 마스크 알파 검사 실패');
const preMaskPath = path.join(checkDir, `${id}-premask.png`);
run('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', '512x512', '-i', 'pipe:0', '-frames:v', '1', preMaskPath], { input: preMask });
const resultEyes = [leftEyeX * scale + moveX, leftEyeY * scale + moveY, rightEyeX * scale + moveX, rightEyeY * scale + moveY];
const resultFace = [faceLeft * scale + moveX, faceRight * scale + moveX];
const expected = { eyesCenterX: (resultEyes[0] + resultEyes[2]) / 2, eyesCenterY: (resultEyes[1] + resultEyes[3]) / 2,
  faceCenterX: (resultFace[0] + resultFace[1]) / 2, faceWidth: resultFace[1] - resultFace[0] };
const geometricPass = Math.abs(expected.eyesCenterX - 256) <= 8 && Math.abs(expected.eyesCenterY - 240) <= 8 &&
  Math.abs(expected.faceCenterX - 256) <= 8 && Math.abs(expected.faceWidth - 214) <= 4;
if (!geometricPass) throw new Error(`위치 규격 실패: ${JSON.stringify(expected)}`);
function encode(destination, extra) {
  run('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', '512x512', '-i', 'pipe:0', '-frames:v', '1', '-c:v', 'libwebp', ...extra, destination], { input: normalized });
}
let mode = '무손실';
let temporary = path.join(outputDir, `${id}-lossless.webp`);
encode(temporary, ['-lossless', '1', '-compression_level', '6']);
if (statSync(temporary).size > 80 * 1024) {
  mode = '손실 q92';
  temporary = path.join(outputDir, `${id}-q92.webp`);
  encode(temporary, ['-quality', '92', '-pix_fmt', 'yuva420p']);
}
const decoded = decode(temporary), result = inspect(decoded);
let outside = 0;
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  if (Math.hypot(x + .5 - 256, y + .5 - 256) >= 256 && decoded.rgba[(y * 512 + x) * 4 + 3] > 0) outside++;
}
const passed = decoded.width === 512 && decoded.height === 512 && result.alpha.min === 0 && result.alpha.max === 255 &&
  result.alpha.corners.every(n => n === 0) && outside === 0 && result.box.top >= 16 &&
  decoded.rgba[((511 * 512 + 256) * 4) + 3] > 8 && geometricPass;
if (!passed) throw new Error(`WebP 재검사 실패: ${JSON.stringify({ result, outside, expected })}`);
const runtime = path.join(runtimeDir, `${id}.webp`);
copyFileSync(temporary, runtime);

const guide = Buffer.alloc(512 * 512 * 4);
for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
  const i = (y * 512 + x) * 4, a = decoded.rgba[i + 3] / 255;
  guide[i] = Math.round(decoded.rgba[i] * a + 243 * (1 - a));
  guide[i + 1] = Math.round(decoded.rgba[i + 1] * a + 247 * (1 - a));
  guide[i + 2] = Math.round(decoded.rgba[i + 2] * a + 243 * (1 - a));
  guide[i + 3] = 255;
  const radius = Math.hypot(x + .5 - 256, y + .5 - 256);
  const safety = Math.abs(radius - 240) < 1.1 && Math.floor(Math.atan2(y - 256, x - 256) * 14) % 2 === 0;
  const eyeLine = Math.abs(y - 240) < 1 && x > 80 && x < 432;
  const faceLine = (Math.abs(x - 149) < 1 || Math.abs(x - 363) < 1) && y > 175 && y < 345;
  if (safety || eyeLine || faceLine) {
    const color = eyeLine ? [232, 78, 83] : faceLine ? [33, 155, 123] : [38, 101, 173];
    guide[i] = color[0]; guide[i + 1] = color[1]; guide[i + 2] = color[2];
  }
}
const guidePath = path.join(checkDir, `${id}-guide.png`);
run('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', '512x512', '-i', 'pipe:0', '-frames:v', '1', guidePath], { input: guide });
const manifest = oldManifest ?? { direction: 'flat-vector-bust-v2', generatedWith: 'built-in ImageGen',
  date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  runtimeDirectory: 'src/assets/vote/characters', characters: [] };
const entry = { id, gender: id[0] === 'm' ? '남' : '여', label: labels[id],
  generatedSourcePath: value('generated') ?? (source?.includes('generated_images') ? source : previous?.generatedSourcePath ?? null),
  original: { path: relative(original), sha256: sha(original), bytes: statSync(original).size, width: src.width, height: src.height, alpha: originalCheck.alpha },
  result: { path: relative(runtime), sha256: sha(runtime), bytes: statSync(runtime).size, width: 512, height: 512,
    compression: mode, alpha: result.alpha, boundingBox: result.box, outsideCirclePixels: outside },
  measurement: { source: { eyes: [leftEyeX, leftEyeY, rightEyeX, rightEyeY], face: [faceLeft, faceRight], faceY, faceWidth },
    transform: { scale, moveX, moveY, targetFaceWidth: 214 }, result: { eyes: resultEyes, face: resultFace, ...expected } },
  attempts, descriptionChanges: previous?.descriptionChanges ?? [], automaticCheck: '통과', visualCheck: '검수 전' };
manifest.characters = [...manifest.characters.filter(item => item.id !== id), entry].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(`${manifestPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
renameSync(`${manifestPath}.tmp`, manifestPath);
console.log(JSON.stringify({ id, bytes: entry.result.bytes, compression: mode, originalAlpha: originalCheck.alpha,
  resultAlpha: result.alpha, expected, transform: entry.measurement.transform, outsideCirclePixels: outside, automaticCheck: '통과' }));
