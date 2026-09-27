/** 점수판·온도계 저장소 창구(네이티브 = Rust scores.rs, 브라우저 미리보기 = localStorage).
 * 파일을 "구역(section)"으로 나눠 읽고 씁니다. 쓰기는 기대 revision이 맞을 때만 성공합니다(아니면 "CONFLICT:<현재>"). */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const native = isTauri();
const PREVIEW_PREFIX = 'tidy-scores-preview-v1:';
// 미리보기에서 창(탭)끼리 변경을 알리는 통로. 네이티브에서는 Rust가 "scores-changed"를 방송합니다.
// 왜 처음 쓸 때 만드는가: 불러오기만 해도 열린 채널이 Node 테스트 프로세스를 끝나지 않게 붙잡습니다.
/** @type {BroadcastChannel|null|undefined} */
let channelCache;
const channel = () => {
  if (channelCache === undefined)
    channelCache = !native && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tidy-scores') : null;
  return channelCache;
};
const origin = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

/** @typedef {{revision:number,data:any}} Section */
/** @typedef {{sections:Record<string,Section>,readOnly:boolean,notice:string|null}} ReadResult */

/** @param {string} store */
function previewDoc(store) {
  try {
    const raw = localStorage.getItem(PREVIEW_PREFIX + store);
    const doc = raw ? JSON.parse(raw) : null;
    return doc && typeof doc === 'object' && doc.sections ? doc : { schemaVersion: 1, sections: {} };
  } catch {
    return { schemaVersion: 1, sections: {} };
  }
}

/** @param {'scoreboard'|'thermometer'|'vote'} store @returns {Promise<ReadResult>} */
export async function readStore(store) {
  if (native) return invoke('scores_read', { store });
  return { sections: previewDoc(store).sections, readOnly: false, notice: null };
}

/** @param {'scoreboard'|'thermometer'|'vote'} store @param {string} section @param {number} expectedRevision @param {any} data
 * @returns {Promise<number>} 새 revision */
export async function writeSection(store, section, expectedRevision, data) {
  if (native) return invoke('scores_write', { store, section, expectedRevision, data });
  const doc = previewDoc(store);
  const current = doc.sections[section]?.revision ?? 0;
  if (current !== expectedRevision) throw new Error(`CONFLICT:${current}`);
  const revision = current + 1;
  doc.sections[section] = { revision, data: JSON.parse(JSON.stringify(data)) };
  localStorage.setItem(PREVIEW_PREFIX + store, JSON.stringify(doc));
  channel()?.postMessage({ store, section, revision, origin });
  return revision;
}

/** @param {'scoreboard'|'thermometer'|'vote'} store @param {(change:{section:string,revision:number})=>void} callback
 * @returns {Promise<()=>void>} */
export async function subscribeStore(store, callback) {
  if (native)
    return listen('scores-changed', (event) => {
      const p = /** @type {any} */ (event.payload);
      if (p?.store === store) callback({ section: p.section, revision: p.revision });
    });
  /** @param {MessageEvent} e */
  const onMessage = (e) => {
    if (e.data?.store === store && e.data.origin !== origin) callback({ section: e.data.section, revision: e.data.revision });
  };
  channel()?.addEventListener('message', onMessage);
  // 일부 WebView/미리보기에서는 비활성 탭의 BroadcastChannel 전달이 늦습니다.
  // 저장 이벤트도 받아 새 창·열람판이 구역별 최신 revision을 즉시 따라가게 합니다.
  /** @param {StorageEvent} e */
  const onStorage = (e) => {
    if (e.key !== PREVIEW_PREFIX + store || !e.newValue) return;
    try {
      const sections = JSON.parse(e.newValue).sections ?? {};
      for (const [section, value] of Object.entries(sections)) {
        const revision = /** @type {any} */ (value)?.revision;
        if (Number.isInteger(revision)) callback({ section, revision });
      }
    } catch { /* 반쯤 쓰인 외부 자료는 다음 정상 변경을 기다립니다. */ }
  };
  window.addEventListener('storage', onStorage);
  return () => { channel()?.removeEventListener('message', onMessage); window.removeEventListener('storage', onStorage); };
}
