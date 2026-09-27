import { bump, catchUp } from './rules.js';

/** Apply against the latest revision so another window's edits are preserved.
 * @param {import('./model.js').Thermometer} t
 * @param {1|-1} direction
 * @param {{today:string,now:number,logId:string}} when */
export function adjustMini(t, direction, when) {
  return bump(catchUp(t, when).t, direction, when).t;
}
