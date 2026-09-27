// 학급 투표 저장소 창구(PRD 11절). tidy-task-vote.json의 네 구역을 점수판과 같은 구역 저장(section.js)으로 씁니다.
// 네이티브에서는 Rust scores.rs가, 브라우저 미리보기에서는 localStorage('tidy-scores-preview-v1:vote')가 저장합니다.
import { createSection } from '../scores/section.js';
import { subscribeStore } from '../scores/store.js';
import { normalizeSession, normalizeDraft, normalizePrefs } from './model.js';
import { normalizeArchive } from './archive.js';

/**
 * @param {{onSession:(d:any)=>void, onArchive:(d:any)=>void, onDraft:(d:any)=>void, onPrefs:(d:any)=>void,
 *   onError:(m:string)=>void, onNotice:(m:string)=>void}} handlers
 */
export function createVoteStore(handlers) {
  const common = { store: /** @type {const} */ ('vote'), onError: handlers.onError, onNotice: handlers.onNotice };
  // session 구역은 "투표 있음(Session) | 없음({id:null})" 두 모양입니다. 변경 함수(ballots.js)는 맨 앞에서 id를 보고 없으면 그대로 돌려주므로
  // 두 모양을 모두 받지만, 타입 검사기가 그 좁히기를 따라가지 못해 구역 값의 타입을 any로 둡니다.
  const session = createSection({ ...common, section: 'session', normalize: /** @type {(raw:unknown)=>any} */ (normalizeSession), onChange: handlers.onSession });
  const archive = createSection({ ...common, section: 'archive', normalize: normalizeArchive, onChange: handlers.onArchive });
  const draft = createSection({ ...common, section: 'draft', normalize: normalizeDraft, onChange: handlers.onDraft });
  const prefs = createSection({ ...common, section: 'prefs', normalize: normalizePrefs, onChange: handlers.onPrefs });
  const all = { session, archive, draft, prefs };
  /** @type {(()=>void)|null} */ let off = null;
  let disposed = false;
  return {
    ...all,
    /** 네 구역을 읽고 다른 창의 변경을 구독합니다. */
    async load() {
      await Promise.all(Object.values(all).map((c) => c.load()));
      const unsubscribe = await subscribeStore('vote', ({ section, revision }) => {
        const client = /** @type {Record<string, typeof session>} */ (/** @type {unknown} */ (all))[section];
        if (client) void client.external(revision);
      });
      // 구독이 끝나기 전에 창이 닫혔으면 곧바로 풉니다.
      if (disposed) unsubscribe();
      else off = unsubscribe;
    },
    /** 보내는 중인 저장이 끝날 때까지(창 닫기 전). */
    settle: () => Promise.all(Object.values(all).map((c) => c.settle())),
    dispose() {
      disposed = true;
      off?.();
      Object.values(all).forEach((c) => c.dispose());
    },
  };
}
