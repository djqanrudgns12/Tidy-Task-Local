/** @typedef {{tick:boolean,endIn:number|null,warningIn:number|null,warningFor:number,end:boolean}} AlarmPlan */
/** @typedef {{runId:number,warningStart:number|null,lead:number|undefined|null}} AlarmTracker */
/** @returns {AlarmTracker} */
export function createAlarmTracker() {
  return { runId: -1, warningStart: null, lead: null };
}
/** @param {import("./engine.js").TimerState} state @param {import("../toolkit/preferences.js").Preferences} prefs @param {AlarmTracker} tracker @returns {AlarmPlan|null} */
export function alarmPlan(state, prefs, tracker) {
  if (tracker.runId !== state.runId || tracker.lead !== prefs.warningLeadSeconds) {
    tracker.runId = state.runId;
    tracker.warningStart = null;
    tracker.lead = prefs.warningLeadSeconds ?? 5;
  }
  if (state.phase !== 'running') return null;
  if (state.kind === 'stopwatch')
    return { tick: prefs.tickEnabled, endIn: null, warningIn: null, warningFor: 0, end: false };
  const r = state.remainingMs / 1000,
    e = state.elapsedMs / 1000,
    lead = prefs.warningLeadSeconds ?? 5;
  if (r > lead || tracker.warningStart == null) tracker.warningStart = e + Math.max(0, r - lead);
  const warningIn = Math.max(0, tracker.warningStart - e);
  const consumed = Math.max(0, e - tracker.warningStart);
  const warningFor = Math.max(
    0,
    Math.min(
      r - warningIn,
      prefs.warningDurationSeconds == null ? Infinity : prefs.warningDurationSeconds - consumed,
    ),
  );
  return {
    tick: prefs.tickEnabled,
    endIn: r,
    end: prefs.endEnabled === true,
    warningIn: prefs.warningEnabled && warningFor > 0 ? warningIn : null,
    warningFor,
  };
}
