import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { createSection } from '../scores/section.js';
import { normalizeDisplay, showInMini, hideInMini } from './display.js';
import { openTool } from '../toolkit/windows.js';
import { native } from '../toolkit/store.js';

const LABEL = 'thermometer-display';

/** 미니 온도계에 이 온도계를 띄우고 다음 앱 실행에도 다시 엽니다.
 * @param {{ setKey: string, id: string, ids: string[], showingThisSet: boolean }} target */
export async function openThermometerDisplay(target) {
  const client = createSection({ store: 'thermometer', section: 'display', normalize: normalizeDisplay });
  try {
    await client.load();
    const saved = await client.mutateAndConfirm(d => showInMini(d, target), d => d.autoOpen && d.setKey === target.setKey && !d.hiddenIds.includes(target.id));
    if (saved !== 'saved') throw new Error('미니 온도계 설정을 저장하지 못했어요. 다시 시도해 주세요.');
    await openTool(LABEL);
  } finally { client.dispose(); }
}

/** 미니 온도계에서 이 온도계를 뺍니다. 남는 온도계가 없으면 창을 닫고 자동 열기도 끕니다.
 * @param {{ id: string, ids: string[] }} target */
export async function hideFromThermometerDisplay(target) {
  const client = createSection({ store: 'thermometer', section: 'display', normalize: normalizeDisplay });
  let close = false;
  try {
    await client.load();
    const saved = await client.mutateAndConfirm(d => { const r = hideInMini(d, target); close = r.close; return r.next; }, d => d.hiddenIds.includes(target.id));
    if (saved !== 'saved') throw new Error('미니 온도계 설정을 저장하지 못했어요. 다시 시도해 주세요.');
  } finally { client.dispose(); }
  // destroy가 아니라 close를 부릅니다 — 미니 창의 닫기 처리기가 위치·크기를 저장한 뒤 스스로 닫게 하려고.
  if (close && native) await (await WebviewWindow.getByLabel(LABEL))?.close();
}

/** 미니 온도계 창이 떠 있는지 지켜봅니다. 닫히면 곧바로, 새로 뜬 것은 refresh()를 부를 때 알아챕니다.
 * 왜 새로 뜨는 것을 이벤트로 받지 않는가: 이 창을 여는 곳은 토글(바로 refresh)과 앱 시작 복원뿐이라, 창을 열 때·초점이 올 때 확인하면 충분합니다.
 * @param {(open: boolean) => void} onChange */
export function watchThermometerDisplay(onChange) {
  let disposed = false;
  let off = () => {};
  let seq = 0;
  async function refresh() {
    if (!native || disposed) return;
    const mine = ++seq;
    const win = await WebviewWindow.getByLabel(LABEL).catch(() => null);
    if (disposed || mine !== seq) return;
    off();
    off = () => {};
    onChange(!!win);
    if (!win) return;
    const unlisten = await win.once('tauri://destroyed', () => { if (!disposed) onChange(false); });
    if (disposed || mine !== seq) unlisten(); else off = unlisten;
  }
  void refresh();
  return { refresh, dispose() { disposed = true; off(); } };
}
