import { LazyStore } from "@tauri-apps/plugin-store";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { createSerialQueue } from "../storage/serialQueue.js";
import { normalizeMealSettings } from "./mealSettings.js";
import { monthRange, dateKey } from "./mealDate.js";
import { shouldRefresh, trimCache } from "./mealCache.js";
export const native = isTauri();
const store = native ? new LazyStore("tidy-task-meal.json") : null;
const queue = createSerialQueue();
/** @type {Set<()=>void>} */
const listeners = new Set();
const pending = new Map(),
  attempts = new Map();
const failures = new Map();
/** @param {string} key @returns {Promise<any>} */
export async function readMeal(key) {
  if (store) return store.get(key);
  try {
    return JSON.parse(localStorage.getItem(`meal-preview:${key}`) || "null");
  } catch {
    return null;
  }
}
/** @param {string} key @param {any} value */
export function writeMeal(key, value) {
  return queue.enqueue(() => persistMeal(key, value));
}
/** @param {string} key @param {any} value */
async function persistMeal(key, value) {
  if (store) {
    await store.set(key, value);
    await store.save();
  } else {
    localStorage.setItem(`meal-preview:${key}`, JSON.stringify(value));
    listeners.forEach((fn) => fn());
  }
}
/** @param {import('./types').School} school */
export async function clearMealCache(school) {
  await writeMeal(`cache-revision:${schoolKey(school)}`, Date.now());
  await writeMeal(`cache:${schoolKey(school)}`, {});
}
export async function readSettings() {
  /** @type {Record<string,any>} */
  const values = {};
  for (const key of ["school", "allergies"]) values[key] = await readMeal(key);
  // 필드별 키로 저장해 서로 다른 웹뷰의 핀/설정 변경이 덮어쓰이지 않게 합니다.
  for (const group of /** @type {const} */ ([
    "display",
    "appearance",
    "behavior",
  ])) {
    values[group] = {};
    const defaults = normalizeMealSettings()[group];
    for (const key of Object.keys(defaults)) {
      const v = await readMeal(`${group}.${key}`);
      if (v != null) values[group][key] = v;
    }
  }
  return normalizeMealSettings(values);
}
/** @param {()=>void} callback */
export async function subscribeMeal(callback) {
  if (store)
    return store.onChange((key) => {
      if (
        !key.startsWith("cache:") &&
        !key.startsWith("request-block:") &&
        key !== "window"
      )
        callback();
    });
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}
/** @param {(main:import("./types").MainAppearance,fonts:import("./types").CustomFont[])=>void} callback */
export async function mainAppearance(callback) {
  if (!native) {
    callback({ themeColor: "sea-glass", uiFontFamily: "메이플스토리 L" }, []);
    return () => {};
  }
  const source = new LazyStore("tidy-task-config.json");
  let previous = "";
  const refresh = async () => {
    const data = /** @type {import('./types').MainAppearance} */ (
      (await source.get("main")) || {}
    );
    const main = {
      themeColor: data.themeColor,
      isDarkMode: data.isDarkMode,
      uiFontFamily: data.uiFontFamily,
      letterSpacing: data.letterSpacing,
    };
    const fonts = /** @type {import('./types').CustomFont[]} */ (
      (await source.get("customFonts")) || []
    );
    const signature = JSON.stringify([main, fonts]);
    if (signature !== previous) {
      previous = signature;
      callback(main, fonts);
    }
  };
  await refresh();
  const off = await source.onKeyChange("main", refresh),
    offFonts = await source.onKeyChange("customFonts", refresh);
  return () => {
    off();
    offFonts();
  };
}
/** @param {import("./types").School} school */
export const schoolKey = (school) =>
  `${school.ATPT_OFCDC_SC_CODE}-${school.SD_SCHUL_CODE}`;
/** @param {import("./types").School} school @param {string} month @returns {Promise<import("./types").CacheEntry|null>} */
export async function cachedMonth(school, month) {
  return (await readMeal(`cache:${schoolKey(school)}`))?.[month] || null;
}
/** @param {import("./types").School} school @param {string} month @returns {Promise<import("./types").CacheEntry>} */
export async function fetchMonth(school, month, force = false) {
  const key = `${schoolKey(school)}:${month}`;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const revision = await readMeal(`cache-revision:${schoolKey(school)}`);
    const cached = await cachedMonth(school, month);
    if (cached && !force && !shouldRefresh(cached, month)) return cached;
    const block = await readMeal("request-block:neis");
    if (block?.date === dateKey()) throw new Error(block.code);
    if (Date.now() - (attempts.get(key) || 0) < 60000) {
      if (failures.has(key)) throw failures.get(key);
      if (cached) return cached;
      throw new Error("COOLDOWN");
    }
    attempts.set(key, Date.now());
    if (!native) throw new Error("PREVIEW");
    const args = {
      office: school.ATPT_OFCDC_SC_CODE,
      school: school.SD_SCHUL_CODE,
      ...monthRange(month),
    };
    try {
      const meal = await invoke(/** @type {string} */ ("neis_meals"), args);
      let events = cached?.events || [],
        scheduleAt = cached?.scheduleAt || 0;
      if (Date.now() - scheduleAt > 7 * 86400000) {
        try {
          const schedule = await invoke("neis_schedule", args);
          events = schedule.rows;
          scheduleAt = Date.now();
        } catch {
          /* 학사일정 실패가 식단까지 숨기지 않게 합니다. */
        }
      }
      const entry = {
        rows: meal.rows,
        sample: meal.sample,
        events,
        scheduleAt,
        updatedAt: Date.now(),
      };
      await queue.enqueue(async () => {
        const selected = await readMeal("school");
        if (
          !selected ||
          schoolKey(selected) !== schoolKey(school) ||
          revision !== (await readMeal(`cache-revision:${schoolKey(school)}`))
        )
          return;
        const cache = (await readMeal(`cache:${schoolKey(school)}`)) || {};
        await persistMeal(
          `cache:${schoolKey(school)}`,
          trimCache({ ...cache, [month]: entry }),
        );
      });
      failures.delete(key);
      return entry;
    } catch (error) {
      failures.set(key, error);
      if (["AUTH", "RATE_LIMIT"].includes(String(error)))
        await writeMeal("request-block:neis", {
          date: dateKey(),
          code: String(error),
        });
      throw error;
    }
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
/** @param {unknown} error */
export function errorMessage(error) {
  const code = String(error).replace(/^Error: /, "");
  return (
    {
      NETWORK: "인터넷 연결을 확인해 주세요. 저장된 식단은 계속 볼 수 있어요.",
      AUTH: "급식 서비스 인증을 확인할 수 없어요. 앱 업데이트를 확인해 주세요.",
      RATE_LIMIT:
        "오늘의 조회 한도에 도달했어요. 저장된 식단은 계속 볼 수 있어요.",
      COOLDOWN: "잠시 후 다시 시도해 주세요. 조회는 1분 간격으로 할 수 있어요.",
      PREVIEW:
        "디자인 미리보기입니다. 실제 학교 조회는 데스크톱 앱에서 사용할 수 있어요.",
    }[code] || "급식 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
  );
}
