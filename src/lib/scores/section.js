/** 저장소 구역 하나를 "바꾸는 즉시 저장"하는 클라이언트.
 *
 * 흐름(낙관적 반영): 화면은 바꾼 값을 곧바로 보여 주고(mutate), 저장은 뒤에서 한 줄로 이어서 보냅니다.
 *  - 저장 중에 또 바뀌면 끝난 뒤 "그때의 최신 상태"를 한 번 더 보냅니다(연타해도 쓰기가 쌓이지 않음).
 *  - 다른 창이 먼저 저장했으면(CONFLICT) 최신 값을 다시 읽고, 아직 확정되지 않은 내 변경을 그 위에 다시 적용합니다.
 *  - 그 밖의 실패(디스크 오류 등)는 확정되지 않은 변경을 버리고 마지막 저장 상태로 되돌린 뒤 알립니다.
 * 변경은 모두 "이전 상태 → 새 상태"를 돌려주는 순수 함수여야 합니다(입력 객체를 고치지 않음).
 *
 * 되돌리기: 변경마다 undo 키와 그 키에 해당하는 부분(pick)을 기록해 두었다가 put으로 되돌립니다.
 * 창을 닫거나 앱을 끄면 비웁니다(PRD 6.6). */
import * as defaultAdapter from './store.js';

export const UNDO_LIMIT = 50;

/**
 * @template T
 * @typedef {{key:string, pick:(data:T)=>any, put:(data:T, part:any)=>T, limit?:number}} UndoSpec
 */

/**
 * @template T
 * @param {{store:'scoreboard'|'thermometer'|'vote', section:string, normalize:(raw:any)=>T,
 *   onChange?:(data:T)=>void, onError?:(message:string)=>void, onNotice?:(message:string)=>void,
 *   adapter?:{readStore:Function, writeSection:Function}}} options
 */
export function createSection({ store, section, normalize, onChange = () => {}, onError = () => {}, onNotice = () => {}, adapter = defaultAdapter }) {
  /** @type {{revision:number,data:T}} */
  let confirmed = { revision: 0, data: normalize(undefined) };
  /** 저장 확정을 기다리는 변경(mutateAndConfirm)은 settle을 함께 들고 있습니다.
   * @type {{seq:number, fn:(data:T)=>T, settle?:(saved:boolean)=>void}[]} */
  let pending = [];
  let data = confirmed.data;
  let seq = 0;
  let writing = /** @type {Promise<void>|null} */ (null);
  let staleRevision = 0;
  let readOnly = false;
  let disposed = false;
  /** @type {Map<string, any[]>} */
  const undo = new Map();

  const publish = () => onChange(data);
  const rebuild = () => {
    data = pending.reduce((acc, p) => p.fn(acc), confirmed.data);
    publish();
  };

  async function readConfirmed() {
    const result = await adapter.readStore(store);
    const raw = result.sections?.[section];
    confirmed = { revision: raw?.revision ?? 0, data: normalize(raw?.data) };
    readOnly = Boolean(result.readOnly);
    if (result.notice) onNotice(result.notice);
    return result;
  }

  async function load() {
    await readConfirmed();
    rebuild();
    if (readOnly) onError('더 새 버전의 앱에서 만든 자료라 바꿀 수 없어요. 앱을 업데이트해 주세요.');
    return data;
  }

  async function writeLoop() {
    let conflicts = 0;
    while (pending.length && !disposed) {
      const upTo = pending[pending.length - 1].seq;
      const sent = data;
      try {
        const revision = await adapter.writeSection(store, section, confirmed.revision, sent);
        confirmed = { revision, data: sent };
        const done = pending.filter((p) => p.seq <= upTo);
        pending = pending.filter((p) => p.seq > upTo);
        done.forEach((p) => p.settle?.(true));
        onError('');
      } catch (error) {
        const message = String(/** @type {any} */ (error)?.message ?? error);
        if (message.startsWith('CONFLICT') && conflicts++ < 5) {
          // 다른 창이 먼저 저장했습니다. 최신 값 위에 내 변경을 다시 얹어 다시 보냅니다.
          await readConfirmed();
          rebuild();
          continue;
        }
        const dropped = pending;
        pending = [];
        rebuild();
        dropped.forEach((p) => p.settle?.(false));
        onError(message.startsWith('NEWER_SCHEMA') ? '더 새 버전의 앱에서 만든 자료라 바꿀 수 없어요.' : '저장하지 못했어요. 다시 눌러 주세요.');
        return;
      }
    }
    // 저장하는 동안 다른 창이 바꾼 것이 있으면 이제 받아 옵니다.
    if (!disposed && staleRevision > confirmed.revision) {
      await readConfirmed();
      rebuild();
    }
  }

  function flush() {
    if (!writing)
      writing = writeLoop().finally(() => {
        writing = null;
        // 끝나는 사이 새 변경이 들어왔으면 이어서 보냅니다.
        if (pending.length && !disposed) flush();
      });
    return writing;
  }

  /**
   * @param {(data:T)=>T} fn
   * @param {UndoSpec<T>} [undoSpec]
   * @returns {boolean} 적용했는지(읽기 전용이면 false)
   */
  function mutate(fn, undoSpec) {
    if (readOnly || disposed) return false;
    const next = fn(data);
    if (next === data) return true;
    if (undoSpec) {
      const stack = undo.get(undoSpec.key) ?? [];
      stack.push({ part: undoSpec.pick(data), put: undoSpec.put });
      if (stack.length > (undoSpec.limit ?? UNDO_LIMIT)) stack.shift();
      undo.set(undoSpec.key, stack);
    }
    pending.push({ seq: ++seq, fn });
    data = next;
    publish();
    void flush();
    return true;
  }

  /**
   * 변경 하나가 디스크에 확정될 때까지 기다립니다(투표: 표가 저장돼야 봉인).
   * 왜 check를 받는가: 다른 창과 충돌해 다시 적용할 때 변경 함수가 거부할 수 있어(예: 그사이 선생님이 멈춤),
   *   "저장 성공"만으로는 이 변경이 실제로 들어갔는지 알 수 없기 때문입니다.
   * 기존 mutate와 같은 큐를 쓰므로 순서·충돌 재적용·실패 처리가 똑같습니다.
   * @param {(data:T)=>T} fn
   * @param {(saved:T)=>boolean} check 확정된 자료에 변경이 들어 있는지
   * @returns {Promise<'saved'|'rejected'|'failed'|'readonly'>}
   */
  function mutateAndConfirm(fn, check) {
    if (readOnly) return Promise.resolve('readonly');
    if (disposed) return Promise.resolve('failed');
    const next = fn(data);
    // 처음부터 바뀐 것이 없으면(거부) 쓰지 않고 바로 알립니다.
    if (next === data) return Promise.resolve('rejected');
    return new Promise((resolve) => {
      pending.push({ seq: ++seq, fn, settle: (saved) => resolve(saved ? (check(confirmed.data) ? 'saved' : 'rejected') : 'failed') });
      data = next;
      publish();
      void flush();
    });
  }

  /** @param {string} key @returns {boolean} 되돌렸는지 */
  function undoLast(key) {
    const stack = undo.get(key);
    const entry = stack?.pop();
    if (!entry) return false;
    return mutate((d) => entry.put(d, entry.part));
  }

  return {
    load,
    mutate,
    mutateAndConfirm,
    undo: undoLast,
    /** @param {string} key */
    undoDepth: (key) => undo.get(key)?.length ?? 0,
    /** @param {string} key */
    clearUndo: (key) => undo.delete(key),
    get data() {
      return data;
    },
    get readOnly() {
      return readOnly;
    },
    /** 다른 창이 이 구역을 바꿨다는 알림. 보내는 중이면 끝난 뒤 받아 옵니다. @param {number} revision */
    async external(revision) {
      if (revision <= confirmed.revision) return;
      staleRevision = Math.max(staleRevision, revision);
      if (writing || pending.length) return;
      await readConfirmed();
      rebuild();
    },
    /** 보내는 중인 저장이 모두 끝날 때까지 기다립니다(창을 닫기 전). */
    async settle() {
      while (writing) await writing;
    },
    dispose() {
      disposed = true;
      // 기다리던 확정은 더 오지 않으므로 실패로 끝냅니다(약속이 영원히 걸려 있지 않게).
      pending.forEach((p) => p.settle?.(false));
    },
  };
}
