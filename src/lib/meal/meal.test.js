import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDish,
  parseMenu,
  parseNutrition,
  macroRatios,
  parseOrigins,
} from "./mealFormat.js";
import { dateKey, addDays, weekDays, monthRange } from "./mealDate.js";
import { normalizeMealSettings } from "./mealSettings.js";
import { rawLayout, pickLayout } from "./mealLayout.js";
import { shouldRefresh, trimCache, nextMealDate } from "./mealCache.js";
import {
  isDataWindowLabel,
  isMealWindowLabel,
} from "../windows/windowLabels.js";

test("메뉴 이름과 숫자의 의미를 보존하며 알레르기만 분리한다", () => {
  const dish = parseDish(
    "리코타치즈샐러드(2)&발사믹드레싱(5,6,12,16,18) (2.5.6.12.16.18)",
  );
  assert.deepEqual(dish.allergens, [2, 5, 6, 12, 16, 18]);
  assert.equal(dish.plain, "리코타치즈샐러드 & 발사믹드레싱");
  for (const name of [
    "3.1절 기념빵",
    "추가밥1",
    "배추(무)김치",
    "사과(1/2)",
    "비타민(철+칼슘)",
  ])
    assert.equal(parseDish(name).plain, name);
  assert.deepEqual(parseDish("찰보리밥1.5.").allergens, [1, 5]);
  assert.deepEqual(parseDish("만두 (20.21)").allergens, [20, 21]);
  assert.equal(parseDish("배추김치(전5)--- (9.13)").plain, "배추김치(전5)");
});
test("선택 배지와 곁들임, HTML 경계는 데이터로만 처리한다", () => {
  assert.deepEqual(parseDish("★학생희망메뉴-뉴진면마라탕 (1.2.5)").badges, [
    "희망",
  ]);
  assert.deepEqual(parseDish("[선택]소떡/갈떡꼬치").badges, ["선택"]);
  assert.equal(parseDish("너비아니전*").plain, "너비아니전");
  assert.equal(
    parseDish("오리훈제*머스터드(자율)").plain,
    "오리훈제 · 머스터드",
  );
  assert.equal(parseMenu("밥<br/>-----<BR />국 (5.6)").length, 2);
  assert.equal(
    parseMenu("&lt;script&gt;alert(1)&lt;/script&gt;")[0].raw,
    "<script>alert(1)</script>",
  );
});
test("영양 비율은 4·4·9로 계산하고 합이 항상 100이다", () => {
  const nutrients = parseNutrition(
    "탄수화물(g) : 79.8<br/>단백질(g) : 31.8<br/>지방(g) : 29.2",
  );
  assert.deepEqual(macroRatios(nutrients), [45, 18, 37]);
  assert.deepEqual(macroRatios([]), []);
  for (let n = 1; n < 60; n++)
    assert.equal(
      macroRatios([
        { label: "탄수화물", unit: "g", value: n },
        { label: "단백질", unit: "g", value: 12 },
        { label: "지방", unit: "g", value: 9 },
      ]).reduce((a, b) => a + b),
      100,
    );
  assert.deepEqual(
    parseOrigins(
      "쌀 : 국내산<br/>배추 : 국내산<br/>쇠고기(종류) : 국내산(한우)<br/>비고 :",
    ),
    [
      { origin: "국내산", foods: ["쌀", "배추"] },
      { origin: "국내산(한우)", foods: ["쇠고기"] },
    ],
  );
});
test("현지 날짜와 월말·연말·주간 경계", () => {
  assert.equal(dateKey(new Date(2026, 8, 17, 0, 1)), "20260917");
  assert.equal(addDays("20261231", 1), "20270101");
  assert.deepEqual(monthRange("202802"), {
    start: "20280201",
    end: "20280229",
  });
  assert.deepEqual(weekDays("20261001"), [
    "20260928",
    "20260929",
    "20260930",
    "20261001",
    "20261002",
  ]);
});
test("반응형 경계와 히스테리시스", () => {
  assert.equal(rawLayout(219, 400), "mini");
  assert.equal(rawLayout(220, 400), "compact");
  assert.equal(rawLayout(299, 400), "compact");
  assert.equal(rawLayout(300, 400), "default");
  assert.equal(rawLayout(420, 400), "wide");
  assert.equal(rawLayout(640, 360), "weekly");
  assert.equal(rawLayout(640, 359), "wide");
  assert.equal(rawLayout(640, 159), "mini");
  assert.equal(pickLayout(305, 400, 1, "compact"), "compact");
  assert.equal(pickLayout(307, 400, 1, "compact"), "default");
  assert.equal(pickLayout(320, 420, 1.25), "compact");
});
test("설정 복원은 false와 빈 끼니 선택을 유지한다", () => {
  const s = normalizeMealSettings({
    display: { calories: false },
    appearance: { theme: "missing", scale: 9 },
    behavior: { startup: false, meals: [] },
    allergies: [0, 1, 1, 19, 20],
  });
  assert.equal(s.display.calories, false);
  assert.equal(s.behavior.startup, false);
  assert.deepEqual(s.behavior.meals, []);
  assert.equal(s.appearance.theme, "amber");
  assert.equal(s.appearance.scale, 1);
  assert.deepEqual(s.allergies, [1, 19]);
  for (const label of ["meal", "meal-search", "meal-settings"]) {
    assert.equal(isMealWindowLabel(label), true);
    assert.equal(isDataWindowLabel(label), false);
  }
});
test("캐시 유효기간과 3개월 한도, 다음 급식 탐색", () => {
  const now = new Date(2026, 8, 17, 12),
    entry = {
      updatedAt: now.getTime() - 6 * 3600000,
      rows: [],
      events: [],
      scheduleAt: 0,
      sample: false,
    };
  assert.equal(shouldRefresh(entry, "202608", now), false);
  assert.equal(shouldRefresh(entry, "202609", now), true);
  assert.equal(
    Object.keys(
      trimCache({
        a: { ...entry, updatedAt: 1 },
        b: { ...entry, updatedAt: 2 },
        c: { ...entry, updatedAt: 3 },
        d: { ...entry, updatedAt: 4 },
      }),
    ).length,
    3,
  );
  assert.equal(
    nextMealDate(
      [{ MLSV_YMD: "20260921", MMEAL_SC_CODE: "2", MMEAL_SC_NM: "중식" }],
      "20260918",
    ),
    "20260921",
  );
});
