// 결과 이미지 저장·복사(PRD 8절). 그리기는 resultImage.js, 여기는 글꼴·캐릭터 그림을 준비하고 파일·클립보드로 내보냅니다.
import { isTauri } from '@tauri-apps/api/core';
import { drawResult, toPng, fileNameFor } from './resultImage.js';
import { CHARACTER_IMAGES } from './assetFiles.js';

/** @param {string} src @returns {Promise<HTMLImageElement|null>} */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 결과 모델 → PNG. 사용자 글꼴이 캔버스에 적용되도록 먼저 불러 둡니다(PRD P0-9).
 * @param {ReturnType<typeof import('./result.js').resultModel>} m @param {string} fontFamily --tk-font 값 */
export async function prepareResultAssets(m, fontFamily) {
  const font = fontFamily || '"Malgun Gothic", sans-serif';
  try {
    await Promise.all(['700', '800', '900'].map((w) => document.fonts.load(`${w} 32px ${font}`)));
  } catch {}
  /** @type {Record<string, HTMLImageElement>} */ const images = {};
  const wanted = [...m.winners, ...m.pendingTie, ...m.rows.map((r) => r.item)].map((it) => it.character).filter(Boolean);
  await Promise.all([...new Set(wanted)].map(async (id) => {
    const src = CHARACTER_IMAGES[/** @type {string} */ (id)];
    if (!src) return;
    const img = await loadImage(src);
    if (img) images[/** @type {string} */ (id)] = img;
  }));
  return { font, images };
}

/** 화면과 같은 글꼴·스티커·구도로 고해상도 이미지를 만듭니다. @param {ReturnType<typeof import('./result.js').resultModel>} m @param {string} fontFamily */
export async function renderResultPng(m, fontFamily) {
  const assets = await prepareResultAssets(m, fontFamily);
  const canvas = document.createElement('canvas');
  drawResult(canvas, m, { ...assets, scale: 2 });
  return toPng(canvas);
}

/** PNG 파일로 저장. @returns {Promise<boolean>} 저장했는지(취소하면 false) */
export async function savePng(/** @type {any} */ m, /** @type {Blob} */ blob) {
  const name = fileNameFor(m);
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: name, filters: [{ name: 'PNG 이미지', extensions: ['png'] }] });
    if (!path) return false;
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** 클립보드로 복사(한글·파워포인트에 붙여넣기). 지원하지 않으면 예외. @param {Blob} blob */
export async function copyPng(blob) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('이 환경에서는 이미지 복사를 지원하지 않아요');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
