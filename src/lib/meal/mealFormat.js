export const ALLERGENS = [
  "난류",
  "우유",
  "메밀",
  "땅콩",
  "대두",
  "밀",
  "고등어",
  "게",
  "새우",
  "돼지고기",
  "복숭아",
  "토마토",
  "아황산류",
  "호두",
  "닭고기",
  "쇠고기",
  "오징어",
  "조개류",
  "잣",
];
/** @param {number} n */
export const allergenName = (n) => ALLERGENS[n - 1] || `기타(${n})`;
export function lines(value = "") {
  return String(value)
    .split(/<br\s*\/?\s*>|\r?\n/i)
    .map((s) =>
      s
        .replace(
          /&(?:amp|lt|gt|quot|apos|nbsp);/g,
          (e) =>
            ({
              "&amp;": "&",
              "&lt;": "<",
              "&gt;": ">",
              "&quot;": '"',
              "&apos;": "'",
              "&nbsp;": " ",
            })[e] || e,
        )
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}
/** @param {string} raw */
export function parseDish(raw) {
  const allergens = new Set();
  /** @type {string[]} */
  const badges = [];
  let name = raw.replace(/\((\d+(?:[.,]\s*\d+)*\.?)[ ]*\)/g, (_, ids) => {
    String(ids)
      .split(/[.,]/)
      .filter(Boolean)
      .forEach((n) => allergens.add(Number(n)));
    return " ";
  });
  // 숫자 하나나 3.1절 같은 이름은 보존하고, 맨 끝의 명확한 번호 목록만 해석합니다.
  name = name
    .replace(/(\d{1,2}(?:\.\d{1,2})+\.)\s*$/, (_, ids) => {
      String(ids)
        .split(".")
        .filter(Boolean)
        .forEach((n) => allergens.add(Number(n)));
      return "";
    })
    .replace(/★?학생희망메뉴\s*[-:]?/g, () => {
      badges.push("희망");
      return " ";
    })
    .replace(/[([【](자율|선택|희망)[)\]】]/g, (_, b) => {
      badges.push(b);
      return " ";
    })
    .replace(/^[*#@★☆※\s-]+|[!._*#@~\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let depth = 0;
  const plain = [...name]
    .map((c, i) => {
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (
        !depth &&
        /[*\/&+]/.test(c) &&
        !(/\d/.test(name[i - 1] || "") && /\d/.test(name[i + 1] || ""))
      )
        return c === "*" ? " · " : ` ${c} `;
      return c;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return {
    raw,
    name: name || raw,
    plain: plain || raw,
    badges: [...new Set(badges)],
    allergens: [...allergens].sort((a, b) => a - b),
  };
}
/** @param {string} value */
export const parseMenu = (value) =>
  lines(value)
    .filter((s) => /[\p{L}\p{N}]/u.test(s))
    .map(parseDish);
/** @param {string} value */
export function parseNutrition(value) {
  return lines(value).flatMap((line) => {
    const m = line.match(/^(.+?)\((.+?)\)\s*:\s*([\d.]+)$/);
    return m && Number.isFinite(Number(m[3]))
      ? [{ label: m[1], unit: m[2], value: Number(m[3]) }]
      : [];
  });
}
/** @param {import("./types").Nutrient[]} nutrients */
export function macroRatios(nutrients) {
  const values = ["탄수화물", "단백질", "지방"].map(
    (label, i) =>
      (nutrients.find((n) => n.label === label)?.value || 0) * [4, 4, 9][i],
  );
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum) return [];
  const raw = values.map((n) => (n / sum) * 100),
    result = raw.map(Math.floor);
  const order = raw
    .map((n, i) => ({ i, remainder: n - result[i] }))
    .sort((a, b) => b.remainder - a.remainder);
  const remaining = 100 - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) result[order[i].i]++;
  return result;
}
/** @param {string} value */
export function parseOrigins(value) {
  const groups = new Map();
  for (const line of lines(value)) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    const label = line
        .slice(0, index)
        .replace(/\(종류\)/g, "")
        .trim(),
      origin = line.slice(index + 1).trim();
    if (!origin || !label) continue;
    groups.set(origin, [...(groups.get(origin) || []), label]);
  }
  return [...groups]
    .map(([origin, foods]) => ({ origin, foods }))
    .sort((a, b) => b.foods.length - a.foods.length);
}
/** @param {import("./types").MealRow} row */
export function parseMeal(row) {
  return {
    ...row,
    dishes: parseMenu(row.DDISH_NM),
    nutrients: parseNutrition(row.NTR_INFO),
    origins: parseOrigins(row.ORPLC_INFO),
    calories: Number.parseFloat(row.CAL_INFO) || null,
  };
}
