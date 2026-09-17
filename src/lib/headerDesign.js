/** Apply only this preference, never unrelated unsaved settings or another note.
 * @param {{headerDesign: string, saveNow: (history: boolean) => Promise<unknown>}} state
 * @param {any} payload
 * @param {string} windowLabel
 */
export async function applyHeaderDesignChoice(state, payload, windowLabel) {
  if (!payload || payload.targetWindow !== windowLabel) return false;
  if (payload.headerDesign !== 'classic' && payload.headerDesign !== 'modern') return false;
  state.headerDesign = payload.headerDesign;
  await state.saveNow(false);
  return true;
}
