/** 모둠원 뽑기 결과 고해상도 PNG 카드 보드 내보내기 및 클립보드 복사(PRD §5.3 정합).
 *  1) GroupSymbol.svelte 와 동일한 12종 SVG Path2D 공유
 *  2) 58px 학생 칩 좌측(x+10)에 46px 원형 포트레이트(다크모드 2px 흰 링, 미로드 시 이니셜 폴백)
 *  3) 사용자 글꼴 로드 대기 후 원본 Uint8Array 바이트로 저장 */
import { isTauri } from '@tauri-apps/api/core';
import { PALETTE, cleanLabel } from '../scoreboard/model.js';
import { SYMBOL_PATHS } from '../scoreboard/symbolPaths.js';
import { fitFontSize } from '../scoreboard/fitText.js';
import { formatStudentLabel } from './allocation.js';
import { assignClassAvatars, avatarForStudent } from './assets.js';
import { resolveDeepBadgeHex } from './recolor.js';

const PALETTE_COLOR = Object.fromEntries(PALETTE.map((p) => [p.id, p.color]));

/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
function roundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** 화면 GroupSymbol.svelte 와 100% 동일한 24×24 viewBox Path2D 심볼 그리기.
 * @param {CanvasRenderingContext2D} ctx @param {string} symbol @param {number} cx @param {number} cy @param {number} size @param {string} fill @param {string} [strokeColor] */
function drawGroupSymbol(ctx, symbol, cx, cy, size, fill, strokeColor = '#ffffff') {
  const def = SYMBOL_PATHS[symbol] ?? SYMBOL_PATHS.acorn;
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size * 0.5, cy - size * 0.5);
  ctx.scale(s, s);
  ctx.fillStyle = fill;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeColor === 'transparent' ? 0 : 1.2;
  ctx.lineJoin = 'round';
  const mainPath = new Path2D(def.d);
  ctx.fill(mainPath, def.fillRule ?? 'nonzero');
  if (strokeColor !== 'transparent') ctx.stroke(mainPath);
  if (def.strokePaths) {
    ctx.strokeStyle = fill;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    for (const sd of def.strokePaths) {
      ctx.stroke(new Path2D(sd));
    }
  }
  ctx.restore();
}

/** @param {string[]} urls @returns {Promise<Map<string, ImageBitmap | HTMLImageElement>>} */
async function preloadPortraitBitmaps(urls) {
  /** @type {Map<string, ImageBitmap | HTMLImageElement>} */
  const map = new Map();
  const unique = [...new Set(urls.filter(Boolean))];
  await Promise.all(
    unique.map(
      (url) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(undefined), 1200);
          const img = new Image();
          img.onload = () => {
            clearTimeout(timer);
            map.set(url, img);
            resolve(undefined);
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve(undefined);
          };
          img.src = url;
        }),
    ),
  );
  return map;
}

/** 결과 보드 고해상도 PNG Blob 생성 (포트레이트 + 12종 심볼 정합).
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.subtitle
 * @param {{name:string, color:string, symbol:string, studentIds:string[]}[]} params.groups
 * @param {Record<string, {id:string, name:string, number?:number, gender?:string}>} params.studentMap
 * @param {any[]} params.allStudents
 * @param {boolean} params.alwaysShowNumber
 * @param {string} params.fontFamily
 * @param {'light'|'dark'} [params.scheme]
 * @returns {Promise<Blob>} */
export async function renderBoardPng({
  title,
  subtitle,
  groups,
  studentMap,
  allStudents,
  alwaysShowNumber,
  fontFamily,
  scheme = 'light',
}) {
  const family = fontFamily || '"Malgun Gothic", sans-serif';
  try {
    await document.fonts?.ready;
    await Promise.all(['700', '800'].map((w) => document.fonts?.load(`${w} 32px ${family}`)));
  } catch {}

  const avatarMap = assignClassAvatars(allStudents?.length ? allStudents : Object.values(studentMap));
  const portraitUrls = Object.values(studentMap).map((st) => avatarForStudent(st, avatarMap).portraitSrc);
  const loadedBitmaps = await preloadPortraitBitmaps(portraitUrls);

  const count = groups.length;
  const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  const maxMembers = Math.max(1, ...groups.map((g) => g.studentIds.length));

  const width = 2400;
  const padX = 96;
  const headerH = 180;
  const gap = 36;
  const cardW = Math.floor((width - padX * 2 - gap * (cols - 1)) / cols);
  const chipCols = maxMembers > 6 ? 2 : 1;
  const chipRows = Math.ceil(maxMembers / chipCols);
  const cardHeadH = 92;
  const chipH = 74;
  const rowStride = 90;
  const cardH = Math.max(320, cardHeadH + 34 + chipRows * rowStride + 14);
  const height = Math.min(18000, headerH + rows * cardH + (rows - 1) * gap + 96);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 그릴 캔버스를 준비하지 못했어요.');

  const dark = scheme === 'dark';
  ctx.fillStyle = dark ? '#1C2220' : '#F4F7F4';
  ctx.fillRect(0, 0, width, height);

  // 상단 제목
  ctx.fillStyle = dark ? '#ECF3EE' : '#203B32';
  ctx.font = `800 54px ${family}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(title || '모둠원 뽑기 결과', padX, 82);

  ctx.fillStyle = dark ? '#A4B8AF' : '#587166';
  ctx.font = `700 30px ${family}`;
  ctx.fillText(subtitle || '', padX, 136);

  const dateText = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  ctx.textAlign = 'right';
  ctx.fillText(dateText, width - padX, 84);
  ctx.textAlign = 'left';

  for (let i = 0; i < count; i++) {
    const g = groups[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (cardW + gap);
    const y = headerH + row * (cardH + gap);
    const accent = PALETTE_COLOR[g.color] ?? '#4FC2A0';
    const deepHex = resolveDeepBadgeHex(g.color);

    // 카드 그림자 + 크림 바탕
    ctx.save();
    ctx.shadowColor = dark ? 'rgba(0,0,0,0.35)' : 'rgba(32,59,50,0.09)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = dark ? '#26302C' : '#FFFDF9';
    roundRectPath(ctx, x, y, cardW, cardH, 30);
    ctx.fill();
    ctx.restore();

    // 시안 1A: 92px OKLab Deep 컬러 헤더 밴드
    ctx.save();
    roundRectPath(ctx, x, y, cardW, cardH, 30);
    ctx.clip();
    ctx.fillStyle = deepHex;
    ctx.fillRect(x, y, cardW, cardHeadH);
    ctx.restore();

    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : `${deepHex}55`;
    ctx.lineWidth = 2.5;
    roundRectPath(ctx, x, y, cardW, cardH, 30);
    ctx.stroke();

    // 모둠 헤더 (흰 심볼 + 흰 모둠명 38px + 반투명 흰 인원 알약)
    drawGroupSymbol(ctx, g.symbol, x + 52, y + cardHeadH / 2, 42, '#ffffff', 'transparent');
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 38px ${family}`;
    ctx.textBaseline = 'middle';
    const titleAvail = cardW - 210;
    ctx.fillText(cleanLabel(g.name, 40) || `${i + 1}모둠`, x + 90, y + cardHeadH / 2 + 1, titleAvail);

    const countText = `${g.studentIds.length}명`;
    ctx.font = `800 26px ${family}`;
    const pillW = Math.max(82, ctx.measureText(countText).width + 36);
    const pillX = x + cardW - 28 - pillW;
    const pillY = y + (cardHeadH - 44) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    roundRectPath(ctx, pillX, pillY, pillW, 44, 22);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(countText, pillX + pillW / 2, y + cardHeadH / 2 + 1);
    ctx.textAlign = 'left';

    // 학생 크림 타일 칩 (74px 높이 + 54px 원형 포트레이트 + Deep 테두리 + fitText 34px)
    const innerW = cardW - 60;
    const cW = chipCols === 2 ? Math.floor((innerW - 18) / 2) : innerW;
    for (let m = 0; m < g.studentIds.length; m++) {
      const sid = g.studentIds[m];
      const st = studentMap[sid];
      if (!st) continue;
      const mc = m % chipCols;
      const mr = Math.floor(m / chipCols);
      const cx = x + 30 + mc * (cW + 18);
      const cy = y + cardHeadH + 26 + mr * rowStride;

      ctx.fillStyle = dark ? '#323F3A' : '#FFFFFF';
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.18)' : `${accent}66`;
      ctx.lineWidth = 2.5;
      roundRectPath(ctx, cx, cy, cW, chipH, 18);
      ctx.fill();
      ctx.stroke();

      // 54px 원형 포트레이트
      const av = avatarForStudent(st, avatarMap);
      const bmp = loadedBitmaps.get(av.portraitSrc);
      const pSize = 54;
      const px = cx + 12;
      const py = cy + (chipH - pSize) / 2;
      const pcx = px + pSize / 2;
      const pcy = py + pSize / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(pcx, pcy, pSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = dark ? '#24312C' : '#F4F7EE';
      ctx.fill();
      if (bmp) {
        ctx.clip();
        ctx.drawImage(bmp, px, py, pSize, pSize);
      } else {
        ctx.fillStyle = dark ? '#D6EAE2' : '#203B32';
        ctx.font = `800 22px ${family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((st.name || '?')[0], pcx, pcy + 1);
        ctx.textAlign = 'left';
      }
      ctx.restore();

      // 원형 링 테두리 (다크모드 2px 흰 링)
      ctx.beginPath();
      ctx.arc(pcx, pcy, pSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = dark ? '#FFFFFF' : `${deepHex}AA`;
      ctx.lineWidth = 2;
      ctx.stroke();

      const label = formatStudentLabel(st, allStudents, alwaysShowNumber);
      const textAvail = Math.max(48, cW - (pSize + 44));
      const { size } = fitFontSize(label, {
        family,
        weight: 800,
        avail: textAvail,
        max: 34,
        min: 20,
      });
      ctx.fillStyle = dark ? '#F3F7F5' : '#203B32';
      ctx.font = `800 ${Math.round(size)}px ${family}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx + pSize + 24, cy + chipH / 2 + 1, textAvail);
    }
  }

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 이미지를 만들지 못했어요.'));
    }, 'image/png');
  });
}

/** @param {string} title @param {Blob} blob @returns {Promise<boolean>} */
export async function saveBoardPng(title, blob) {
  const safeName = (cleanLabel(title || '모둠원뽑기', 40) || '모둠원뽑기').replace(/[\\/:*?"<>|]/g, '-');
  const fileName = `${safeName}-결과.png`;
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
    });
    if (!path) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** @param {Blob} blob */
export async function copyBoardPng(blob) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('이 환경에서는 이미지 클립보드 복사를 지원하지 않아요.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
