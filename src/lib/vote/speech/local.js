import { cacheGet, cachePut, cacheClear, hash, trimClips } from './cache.js';
import { speechPlan } from './plan.js';
import model from './model-files.json';

/** @param {string} text @param {string} voice @param {string} speed */
export const clipKey = (text, voice, speed) => hash(JSON.stringify([model.revision, 1, 8, text, voice, speed]));
/** @param {{createWorker?:()=>Worker}} [deps] */
export function createLocalSpeech(deps = {}) {
  /** @type {Worker|null} */ let worker = null;
  /** @type {((reason:Error)=>void)|null} */ let rejectActive = null;
  let generation = 0, sequence = 0, preparing = false;
  let preparationDone = Promise.resolve();
  void trimClips().catch(() => {});
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let idleTimer;
  /** @param {string} text @param {string} voice @param {string} speed @param {(text:string)=>void} progress */
  function synthesize(text, voice, speed, progress) {
    clearTimeout(idleTimer);
    worker ??= deps.createWorker ? deps.createWorker() : new Worker(new URL('./local.worker.js', import.meta.url), { type: 'module' });
    const current = worker, id = ++sequence;
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); current.onmessage = null; current.onerror = null; rejectActive = null; };
      const timer = setTimeout(() => { cleanup(); current.terminate(); if (worker === current) worker = null; reject(new Error('음성 준비 시간이 길어졌어요. 다시 준비하거나 기본 안내를 사용해 주세요.')); }, 300000);
      rejectActive = (error) => { cleanup(); reject(error); };
      current.onerror = () => { cleanup(); current.terminate(); if (worker === current) worker = null; reject(new Error('이 기기에서 음성을 준비하지 못했어요. 기본 안내는 사용할 수 있어요.')); };
      current.onmessage = ({ data }) => {
        if (data.id !== id) return;
        if (data.progress) { progress(data.progress); return; }
        cleanup();
        if (data.error) reject(new Error(data.error));
        else resolve(data.bytes);
      };
      current.postMessage({ id, text, voice, speed });
    });
  }
  const cancel = () => { generation++; rejectActive?.(new Error('음성 준비를 취소했어요.')); worker?.terminate(); worker = null; clearTimeout(idleTimer); };
  /** @param {string} text @param {string} voice @param {string} speed */
  async function get(text, voice, speed) {
    const key = await clipKey(text, voice, speed);
    const entry = await cacheGet('clips', key);
    if (!entry || entry.usedAt < Date.now() - 30 * 86400000 || await hash(entry.bytes) !== entry.sha256) return null;
    return entry.bytes;
  }
  return {
    get, cancel,
    /** @param {any} config @param {string} voice @param {string} speed */
    async ready(config, voice, speed) {
      try {
        const segments = ['today', 'meet'].flatMap((id) => speechPlan(config, id).segments.filter((s) => s.dynamic));
        return segments.length > 0 && (await Promise.all(segments.map((s) => get(s.text, voice, speed)))).every(Boolean);
      } catch { return false; }
    },
    /** 처음 모델을 내려받는 작업도 포함합니다. 선생님이 준비 버튼을 눌렀을 때만 실행합니다.
     * @param {any} config @param {string} voice @param {string} speed @param {(text:string)=>void} [progress] */
    async prepare(config, voice, speed, progress = () => {}) {
      if (preparing) throw new Error('음성을 준비하고 있어요.');
      preparing = true;
      /** @type {()=>void} */ let finishPreparation = () => {};
      preparationDone = new Promise((resolve) => { finishPreparation = resolve; });
      const my = ++generation;
      const segments = ['today', 'meet'].flatMap((id) => speechPlan(config, id).segments.filter((s) => s.dynamic));
      const keep = new Set();
      try {
        for (let i = 0; i < segments.length; i++) {
          if (my !== generation) throw new Error('음성 준비를 취소했어요.');
          const s = segments[i], key = await clipKey(s.text, voice, speed);
          keep.add(key);
          const cached = await get(s.text, voice, speed);
          // 해시·저장소 조회를 기다리는 중 취소했으면 새 worker를 만들지 않습니다.
          if (my !== generation) throw new Error('음성 준비를 취소했어요.');
          if (cached) continue;
          progress(`이름·안건 음성 준비 중 · ${i + 1}/${segments.length}`);
          const bytes = /** @type {ArrayBuffer} */ (await synthesize(s.text, voice, speed, progress));
          if (my !== generation) throw new Error('음성 준비를 취소했어요.');
          const sha256 = await hash(bytes);
          if (my !== generation) throw new Error('음성 준비를 취소했어요.');
          await cachePut('clips', key, { key, bytes, sha256, usedAt: Date.now() });
        }
        if (my !== generation) throw new Error('음성 준비를 취소했어요.');
        await trimClips(keep);
      } finally {
        preparing = false;
        if (my === generation && worker) idleTimer = setTimeout(() => { worker?.terminate(); worker = null; }, 30000);
        finishPreparation();
      }
    },
    async clear() { cancel(); await preparationDone; await cacheClear('clips'); },
    async uninstall() { cancel(); await preparationDone; await cacheClear('clips'); await cacheClear('models'); },
    dispose: cancel,
  };
}
