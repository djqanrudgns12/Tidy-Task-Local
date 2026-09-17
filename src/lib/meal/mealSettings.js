import { TIDY_THEMES } from "../themes.js";
import { SCALES } from "./mealLayout.js";
export const DISPLAY_DEFAULTS = {
  allergens: "numbers",
  calories: true,
  macros: true,
  badges: true,
  companions: true,
  events: true,
  homepage: true,
  nutrition: true,
  origins: true,
  people: true,
};
export const APPEARANCE_DEFAULTS = {
  theme: "follow",
  dark: "follow",
  font: "follow",
  scale: 1,
  opacity: 1,
};
export const BEHAVIOR_DEFAULTS = {
  startup: true,
  pinned: false,
  meals: ["1", "2", "3"],
  tomorrow: false,
};
/** @param {Record<string, any>} [value] @returns {import("./types").MealSettings} */
export function normalizeMealSettings(value = {}) {
  const display = { ...DISPLAY_DEFAULTS, ...value.display },
    appearance = { ...APPEARANCE_DEFAULTS, ...value.appearance },
    behavior = { ...BEHAVIOR_DEFAULTS, ...value.behavior };
  for (const [key, def] of Object.entries(DISPLAY_DEFAULTS))
    if (typeof def === "boolean" && typeof display[key] !== "boolean")
      display[key] = def;
  if (!["off", "numbers", "names"].includes(display.allergens))
    display.allergens = "numbers";
  if (
    appearance.theme !== "follow" &&
    !TIDY_THEMES.some((t) => t.id === appearance.theme)
  )
    appearance.theme = "amber";
  if (!["follow", "light", "dark"].includes(appearance.dark))
    appearance.dark = "follow";
  if (!SCALES.includes(appearance.scale)) appearance.scale = 1;
  if (typeof appearance.font !== "string" || !appearance.font.trim())
    appearance.font = "follow";
  appearance.opacity = Math.min(
    1,
    Math.max(0.3, Number(appearance.opacity) || 1),
  );
  for (const key of /** @type {const} */ (["startup", "pinned", "tomorrow"]))
    if (typeof behavior[key] !== "boolean")
      behavior[key] = BEHAVIOR_DEFAULTS[key];
  behavior.meals = Array.isArray(behavior.meals)
    ? behavior.meals.filter(
        /** @param {string} n */ (n) => ["1", "2", "3"].includes(n),
      )
    : ["1", "2", "3"];
  return {
    school:
      value.school &&
      /^[A-Z]\d{2}$/.test(value.school.ATPT_OFCDC_SC_CODE) &&
      /^\d{7}$/.test(value.school.SD_SCHUL_CODE) &&
      typeof value.school.SCHUL_NM === "string"
        ? value.school
        : null,
    display,
    appearance,
    behavior,
    allergies: Array.isArray(value.allergies)
      ? [
          ...new Set(
            value.allergies.filter(
              (n) => Number.isInteger(n) && n >= 1 && n <= 19,
            ),
          ),
        ]
      : [],
  };
}
