/** 기록 요약(PRD 10.9): 오늘 변화 한 줄, 주간 그래프 막대, 기록 목록 거르기. */
import { addDays, weekStart, weekdayLabel } from './calendar.js';

/** @param {Record<string,{up:number,down:number,auto:number}>} daily @param {string} today */
export function todaySummary(daily, today) {
  const d = daily[today] ?? { up: 0, down: 0, auto: 0 };
  return { up: d.up, down: d.down, auto: d.auto, empty: !d.up && !d.down && !d.auto };
}

/** 한 주의 막대(월~금 + 변화가 있었던 토·일). @param {Record<string,{up:number,down:number,auto:number}>} daily @param {string} anyDayOfWeek @param {string} today */
export function weekBuckets(daily, anyDayOfWeek, today) {
  const start = weekStart(anyDayOfWeek);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return days
    .map((key, i) => {
      const d = daily[key] ?? { up: 0, down: 0, auto: 0 };
      return { key, label: weekdayLabel(key), up: d.up, down: d.down, auto: d.auto, today: key === today, weekend: i >= 5 };
    })
    .filter((b) => !b.weekend || b.up || b.down || b.auto);
}

/** 주 합계 @param {{up:number,down:number,auto:number}[]} buckets */
export const weekTotal = (buckets) => buckets.reduce((acc, b) => ({ up: acc.up + b.up, down: acc.down + b.down + b.auto }), { up: 0, down: 0 });

/** 기록 거르기 @param {import('./model.js').LogEntry[]} log @param {'today'|'week'|'all'} range @param {number} now */
export function filterLog(log, range, now) {
  if (range === 'all') return [...log].reverse();
  const d = new Date(now);
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const since = range === 'today' ? startOfDay : startOfDay - ((d.getDay() + 6) % 7) * 86400000;
  // PC 시계를 앞당겼다 되돌린 경우처럼 "미래" 기록이 섞이지 않게 끝도 막습니다.
  const until = range === 'today' ? startOfDay + 86400000 : since + 7 * 86400000;
  return log.filter((e) => e.at >= since && e.at < until).reverse();
}
