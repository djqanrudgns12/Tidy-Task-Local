// 투표판 ↔ 선생님 창의 일시 신호(PRD 7절 "연동 방식"). 저장할 필요가 없는 것만 오갑니다:
//  - vote-remote: 선생님 창 → 투표판(안내 넘기기 · 개표 재생/다음/속도 · 골라 공개 카드)
//  - vote-state: 투표판 → 선생님 창(키보드 초점 · 안내 몇 번째 장 · 개표 재생 중인지)
// 앱이 꺼져도 남아야 하는 상태(멈춤·인원·마감·개표 위치)는 저장소(session)로 오가므로 여기에 넣지 않습니다.
import { emit, listen } from '@tauri-apps/api/event';
import { isTauri } from '@tauri-apps/api/core';

const native = isTauri();
/** @type {BroadcastChannel|null|undefined} */
let channel;
const bc = () => {
  if (channel === undefined) channel = !native && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tidy-vote-remote') : null;
  return channel;
};

/** @param {'vote-remote'|'vote-state'} name @param {any} payload */
export async function send(name, payload) {
  if (native) await emit(name, payload).catch(() => {});
  else bc()?.postMessage({ name, payload });
}

/** @param {'vote-remote'|'vote-state'} name @param {(payload:any)=>void} callback @returns {Promise<()=>void>} */
export async function receive(name, callback) {
  if (native) return listen(name, (e) => callback(e.payload));
  /** @param {MessageEvent} e */
  const onMessage = (e) => {
    if (e.data?.name === name) callback(e.data.payload);
  };
  bc()?.addEventListener('message', onMessage);
  return () => bc()?.removeEventListener('message', onMessage);
}
