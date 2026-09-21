export const TOURNAMENT_ZOOM_STEP = 0.05;
export const TOURNAMENT_ZOOM_MIN = 0.15;
export const TOURNAMENT_ZOOM_MAX = 1.6;

/** @param {number} value */
const precision = (value) => Math.round(value * 100) / 100;

/** Keep every displayed tournament zoom level on a clean 5% boundary. @param {number} value */
export function normalizeTournamentZoom(value) {
  const snapped =
    Math.round(value / TOURNAMENT_ZOOM_STEP) * TOURNAMENT_ZOOM_STEP;
  return precision(
    Math.min(TOURNAMENT_ZOOM_MAX, Math.max(TOURNAMENT_ZOOM_MIN, snapped)),
  );
}

/** Move exactly one 5% step in either direction. @param {number} current @param {number} direction */
export function stepTournamentZoom(current, direction) {
  return normalizeTournamentZoom(
    normalizeTournamentZoom(current) +
      Math.sign(direction) * TOURNAMENT_ZOOM_STEP,
  );
}

/** Fit without rounding upward, which could push the bracket outside its panel. @param {number} value */
export function fitTournamentZoom(value) {
  const floored =
    Math.floor((value + Number.EPSILON) / TOURNAMENT_ZOOM_STEP) *
    TOURNAMENT_ZOOM_STEP;
  return normalizeTournamentZoom(floored);
}
