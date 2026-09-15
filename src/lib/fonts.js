import { convertFileSrc } from '@tauri-apps/api/core';

// 사용자가 등록한 폰트 파일을 이 창의 문서에 글꼴로 등록합니다.
// 왜 창마다 해야 하는가: 창마다 문서(웹뷰)가 따로라서, 한 창에서 불러온 글꼴은 다른 창에 보이지 않습니다.
export async function registerFontFace(name, path) {
  if (!name || !path) return false;
  try {
    const already = Array.from(document.fonts).some((f) => f.family === name || f.family === `"${name}"`);
    if (already) return true;
    const face = new FontFace(name, `url(${convertFileSrc(path)})`);
    document.fonts.add(await face.load());
    return true;
  } catch (e) {
    console.warn(`커스텀 폰트를 불러오지 못했습니다: ${name}`, e);
    return false;
  }
}
