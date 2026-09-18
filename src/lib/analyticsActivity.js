/** Keep native traffic bounded without dropping the first input of a new minute/day.
 * @param {number} previous
 * @param {number} current
 */
export function shouldReportActivity(previous, current) {
  return current < previous || current - previous >= 15000
    || Math.floor(current / 60000) !== Math.floor(previous / 60000);
}
