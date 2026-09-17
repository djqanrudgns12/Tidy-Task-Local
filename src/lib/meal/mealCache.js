import { dateKey, addDays } from "./mealDate.js";
/** @param {import("./types").CacheEntry|null} entry @param {string} month */
export function shouldRefresh(entry, month, now = new Date()) {
  if (!entry) return true;
  const current = dateKey(now).slice(0, 6);
  if (month < current) return false;
  return (
    now.getTime() - entry.updatedAt >=
    (month === current ? 6 : 24) * 60 * 60 * 1000
  );
}
/** @param {Record<string,import("./types").CacheEntry>} cache */
export function trimCache(cache) {
  return Object.fromEntries(
    Object.entries(cache)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, 3),
  );
}
/** @param {import("./types").MealRow[]} rows @param {string} day */
export function nextMealDate(rows, day, meals = ["1", "2", "3"]) {
  return (
    rows
      .map((r) => r.MLSV_YMD)
      .filter(
        (d) =>
          d > day &&
          d <= addDays(day, 14) &&
          rows.some((r) => r.MLSV_YMD === d && meals.includes(r.MMEAL_SC_CODE)),
      )
      .sort()[0] || null
  );
}
