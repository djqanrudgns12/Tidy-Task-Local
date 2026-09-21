export const TOOLKIT_RELEASE_ID = 'v5.5.0';
export const TOOLKIT_RELEASE_LABEL = 'release-toolkit';
export const TOOLKIT_RELEASE_STORE_KEY = `update-notice:${TOOLKIT_RELEASE_ID}:toolkit:hidden-until`;

export function getToolkitReleaseOptions() {
  return {
    url: 'index.html', title: `Tidy 툴킷 출시 · ${TOOLKIT_RELEASE_ID}`,
    width: 740, height: 820, minWidth: 320, minHeight: 380,
    center: true, decorations: false, transparent: false,
    backgroundColor: '#ffffff', visible: false, resizable: true,
    maximizable: false, skipTaskbar: false,
  };
}

// 한 안내가 실제로 닫힌 뒤에만 다음 안내를 열어 화면 크기에 관계없이 겹침을 막습니다.
/** @template T @param {T[]} entries @param {(entry:T)=>Promise<unknown>} showUntilClosed */
export async function runNoticeQueue(entries, showUntilClosed) {
  for (const entry of entries) {
    await showUntilClosed(entry);
  }
}

// 배율을 적용한 작업영역 안에서 크기를 줄입니다. 작업 표시줄 공간도 남깁니다.
/** @template {{width:number,height:number,minWidth?:number,minHeight?:number}} T @param {T} options @param {{size:{width:number,height:number}} | null | undefined} workArea @param {number} [scale] */
export function fitNoticeSize(options, workArea, scale = 1) {
  if (!workArea || scale <= 0) return options;
  const width = Math.max(1, Math.min(options.width, Math.floor(workArea.size.width / scale - 32)));
  const height = Math.max(1, Math.min(options.height, Math.floor(workArea.size.height / scale - 32)));
  return { ...options, width, height, minWidth: Math.min(options.minWidth ?? width, width), minHeight: Math.min(options.minHeight ?? height, height) };
}
