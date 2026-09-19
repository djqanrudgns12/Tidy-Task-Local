/** @typedef {{id:string,sequence:number,elapsedMs:number,splitMs:number}} Lap */
/** @typedef {{kind:string,phase:"ready"|"running"|"paused"|"completed",initialMs:number,remainingMs:number,elapsedMs:number,anchorMs:number,runId:number,laps:Lap[]}} TimerState */
export const MAX_MS = 60 * 60 * 1000;
/** @param {number} n */
const clamp = (n) => Math.max(0, Math.min(MAX_MS, Number.isFinite(n) ? Math.round(n) : 0));
/** @param {string} kind @param {number} [durationMs] @returns {TimerState} */
export function createTimer(kind, durationMs = 300000) {
  return {
    kind,
    phase: 'ready',
    initialMs: clamp(durationMs),
    remainingMs: clamp(durationMs),
    elapsedMs: 0,
    anchorMs: 0,
    runId: 0,
    laps: [],
  };
}
/** @param {TimerState} state @param {number} now @returns {TimerState} */
export function sampleTimer(state, now) {
  const delta = state.phase === 'running' ? Math.max(0, now - state.anchorMs) : 0;
  const elapsedMs = state.elapsedMs + delta;
  const remainingMs = state.kind === 'stopwatch' ? 0 : Math.max(0, state.remainingMs - delta);
  return {
    ...state,
    elapsedMs,
    remainingMs,
    phase:
      state.kind !== 'stopwatch' && state.phase === 'running' && remainingMs === 0
        ? 'completed'
        : state.phase,
  };
}
/** @param {TimerState} state @param {{type:string,ms?:number}} action @param {number} now @returns {TimerState} */
export function transitionTimer(state, action, now) {
  const sampled = sampleTimer(state, now);
  const next = { ...sampled, anchorMs: now };
  const stopwatch = state.kind === 'stopwatch';
  switch (action.type) {
    case 'sample':
      return next;
    case 'start':
      if (next.phase === 'running' || (!stopwatch && next.remainingMs <= 0)) return next;
      if (next.phase === 'completed') return next;
      return { ...next, phase: 'running', runId: next.runId + (next.phase === 'ready' ? 1 : 0) };
    case 'pause':
      return next.phase === 'running' ? { ...next, phase: 'paused' } : next;
    case 'set':
      if (stopwatch || next.phase === 'running') return next;
      return {
        ...next,
        phase: next.phase === 'paused' ? 'paused' : 'ready',
        remainingMs: clamp(action.ms ?? 0),
        initialMs: next.phase === 'paused' ? next.initialMs : clamp(action.ms ?? 0),
        elapsedMs: next.phase === 'paused' ? next.elapsedMs : 0,
      };
    case 'adjust':
      if (stopwatch) return next;
      return transitionTimer(
        { ...next, phase: next.phase === 'completed' ? 'ready' : next.phase },
        {
          type: next.phase === 'running' ? 'adjustRunning' : 'set',
          ms: next.remainingMs + (action.ms ?? 0),
        },
        now,
      );
    case 'adjustRunning': {
      const remainingMs = clamp(action.ms ?? 0);
      return { ...next, remainingMs, phase: remainingMs === 0 ? 'completed' : 'running' };
    }
    case 'reset':
      return { ...createTimer(state.kind, state.initialMs), runId: state.runId };
    case 'restart':
      return {
        ...createTimer(state.kind, state.initialMs),
        phase: 'running',
        anchorMs: now,
        runId: state.runId + 1,
      };
    case 'record':
      if (!stopwatch || next.phase !== 'running') return next;
      return {
        ...next,
        laps: [
          ...next.laps,
          {
            id: `${next.runId}-${next.laps.length + 1}`,
            sequence: next.laps.length + 1,
            elapsedMs: next.elapsedMs,
            splitMs: next.elapsedMs - (next.laps.at(-1)?.elapsedMs || 0),
          },
        ],
      };
    default:
      return next;
  }
}
/** @param {number} ms @param {boolean} [stopwatch] */
export function formatTime(ms, stopwatch = false) {
  const seconds = stopwatch ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = stopwatch && hours ? Math.floor(seconds / 60) % 60 : Math.floor(seconds / 60);
  const main = `${stopwatch && hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return stopwatch ? `${main}.${String(Math.floor(ms / 10) % 100).padStart(2, '0')}` : main;
}
/** @param {TimerState} state */
export function sandFraction(state) {
  return state.remainingMs === 0 ? 0 : state.remainingMs / (state.elapsedMs + state.remainingMs);
}
