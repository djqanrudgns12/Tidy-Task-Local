/** 실제 상태 전이만 기록합니다. 렌더·주기적 샘플·중복 시작은 동작 횟수가 아닙니다.
 * @param {import('./engine.js').TimerState} before
 * @param {import('./engine.js').TimerState} after
 * @returns {string[]}
 */
export function timerAnalyticsEvents(before, after) {
  const events = [];
  if (after.phase === 'running' && after.runId > before.runId) events.push('timer_started');
  else if (before.phase === 'paused' && after.phase === 'running') events.push('timer_resumed');
  if (before.phase === 'running' && after.phase === 'paused') events.push('timer_paused');
  if (before.phase === 'running' && after.phase === 'completed') events.push('timer_completed');
  return events;
}
