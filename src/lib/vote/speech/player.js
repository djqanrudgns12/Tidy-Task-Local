// 취소 시 종료 이벤트를 기다리지 않고 약속과 자원을 바로 정리합니다.
/** @param {{channel:()=>Promise<{context:AudioContext,destination:AudioNode}|null>, load:(segment:any,voice:string,speed:string,signal:AbortSignal)=>Promise<ArrayBuffer|null>, setTimer?:typeof setTimeout,clearTimer?:typeof clearTimeout}} deps */
export function createSpeechPlayer(deps) {
  const setTimer = deps.setTimer ?? setTimeout, clearTimer = deps.clearTimer ?? clearTimeout;
  /** @type {Set<(value:boolean)=>void>} */ const listeners = new Set();
  /** @type {((result:string)=>void)|null} */ let finishActive = null;
  let disposed = false, generation = 0, muted = false, volume = 70;
  const notify = (/** @type {boolean} */ on) => listeners.forEach((fn) => fn(on));
  const cancel = (reason = 'cancelled') => { generation++; finishActive?.(reason); };
  return {
    cancel,
    /** @param {boolean} m */ setMuted(m) { muted = m; if (m) cancel('muted'); },
    /** @param {number} v */ setVolume(v) { volume = v; if (v <= 0) cancel('muted'); },
    /** @param {(value:boolean)=>void} listener */
    onSpeaking(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    /** @param {any[]} segments @param {{voice?:string,speed?:string}} [options] @returns {Promise<string>} */
    speak(segments, options = {}) {
      cancel();
      if (disposed) return Promise.resolve('disposed');
      if (muted || volume <= 0) return Promise.resolve('muted');
      if (!segments.length) return Promise.resolve('missing');
      const my = ++generation, controller = new AbortController();
      return new Promise((resolve) => {
        /** @type {AudioBufferSourceNode|null} */ let source = null;
        /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
        let done = false;
        const finish = (/** @type {string} */ result) => {
          if (done) return;
          done = true; controller.abort(); clearTimer(timer);
          if (source) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); source = null; }
          if (finishActive === finish) finishActive = null;
          notify(false); resolve(result);
        };
        finishActive = finish;
        const current = () => !done && my === generation;
        /** @param {number} index */
        async function playAt(index) {
          if (!current()) return;
          if (index === segments.length) { finish('completed'); return; }
          timer = setTimer(() => finish('timeout'), 3000);
          try {
            const channel = await deps.channel();
            if (!current()) return;
            if (!channel || channel.context.state !== 'running') { finish('blocked'); return; }
            const bytes = await deps.load(segments[index], options.voice ?? 'female', options.speed ?? 'slow', controller.signal);
            if (!current()) return;
            if (!bytes) { finish('missing'); return; }
            const buffer = await channel.context.decodeAudioData(bytes.slice(0));
            if (!current()) return;
            if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 35) { finish('decode-error'); return; }
            clearTimer(timer);
            source = channel.context.createBufferSource(); source.buffer = buffer; source.connect(channel.destination);
            source.onended = () => { if (!current()) return; clearTimer(timer); source?.disconnect(); source = null; void playAt(index + 1); };
            timer = setTimer(() => finish('timeout'), buffer.duration * 1000 + Math.max(2000, buffer.duration * 200));
            source.start(); notify(true);
          } catch (error) {
            if (current()) finish(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'decode-error');
          }
        }
        void playAt(0);
      });
    },
    dispose() { disposed = true; cancel('disposed'); listeners.clear(); },
  };
}
