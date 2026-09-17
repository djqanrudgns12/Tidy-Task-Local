<script>
  import {
    X,
    ChevronRight,
    Settings2,
    RefreshCw,
    ExternalLink,
    ChevronDown,
  } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { emit } from "@tauri-apps/api/event";
  import { dragRegion } from "../../lib/dragRegion.js";
  import {
    native,
    writeMeal,
    clearMealCache,
    cachedMonth,
  } from "../../lib/meal/mealStore.js";
  import { openMealWindow } from "../../lib/meal/mealWindows.js";
  import { ALLERGENS } from "../../lib/meal/mealFormat.js";
  import { SCALES } from "../../lib/meal/mealLayout.js";
  import { dateKey } from "../../lib/meal/mealDate.js";
  import { BUILTIN_FONTS } from "../../lib/builtinFonts.js";
  import SettingsEmblem from "./SettingsEmblem.svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ThemePicker from "../ThemePicker.svelte";
  /** @type {{settings:import('../../lib/meal/types').MealSettings;main?:import('../../lib/meal/types').MainAppearance;customFonts?:import('../../lib/meal/types').CustomFont[]}} */
  let { settings, main = {}, customFonts = [] } = $props();
  let confirm = $state(""),
    message = $state(""),
    theme = $state("amber");
  let lastUpdated = $state(0);
  async function updateTimestamp() {
    const school = settings.school;
    lastUpdated = school
      ? (await cachedMonth(school, dateKey().slice(0, 6)).catch(() => null))
          ?.updatedAt || 0
      : 0;
  }
  $effect(() => {
    settings.school;
    void updateTimestamp();
  });
  /** @param {HTMLDialogElement} node */
  function showConfirmation(node) {
    node.showModal();
  }
  const dark = $derived(
    settings.appearance.dark === "dark" ||
      (settings.appearance.dark === "follow" && main.isDarkMode),
  );
  const sizes = ["매우 작게", "작게", "보통", "크게", "매우 크게"];
  $effect(() => {
    theme =
      settings.appearance.theme === "follow"
        ? main.themeColor || "amber"
        : settings.appearance.theme;
  });
  /** @param {string} key @param {any} value */
  async function set(key, value) {
    try {
      await writeMeal(key, value);
      message = "";
    } catch {
      message = "설정을 저장하지 못했어요. 다시 시도해 주세요.";
    }
  }
  /** @param {string} code */
  function toggleMeal(code) {
    const current = settings.behavior.meals;
    void set(
      "behavior.meals",
      current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code],
    );
  }
  /** @param {number} n */
  function toggleAllergy(n) {
    void set(
      "allergies",
      settings.allergies.includes(n)
        ? settings.allergies.filter((v) => v !== n)
        : [...settings.allergies, n],
    );
  }
  async function clearData() {
    try {
      if (settings.school) await clearMealCache(settings.school);
      if (confirm === "disconnect") await writeMeal("school", null);
      confirm = "";
      lastUpdated = 0;
      message = "처리했어요.";
    } catch {
      message = "저장된 정보를 변경하지 못했어요.";
    }
  }
  async function refresh() {
    try {
      if (native) {
        await openMealWindow("meal");
        await emit("meal-refresh");
      }
      message = native
        ? "급식창에서 식단을 갱신합니다."
        : "식단 새로고침은 데스크톱 앱에서 사용할 수 있어요.";
    } catch {
      message = "급식창을 열지 못했어요.";
    }
  }

  let saving = $state(false);
  let customStyle = $state(false);
  const followsMain = $derived(
    settings.appearance.theme === "follow" &&
      settings.appearance.dark === "follow" &&
      settings.appearance.font === "follow",
  );
  const customVisible = $derived(customStyle || !followsMain);
  const groups = [
    {
      title: "영양 요약",
      description: "칼로리 · 탄단지 비율",
      keys: ["calories", "macros"],
    },
    {
      title: "상세 정보",
      description: "영양 성분 · 원산지 · 급식 인원",
      keys: ["nutrition", "origins", "people"],
    },
  ];
  /** @param {string[]} keys */
  function groupState(keys) {
    const count = keys.filter((k) => settings.display[k]).length;
    return count === keys.length ? "true" : count === 0 ? "false" : "mixed";
  }
  /** @param {Array<[string, any]>} entries */
  async function setMany(entries) {
    saving = true;
    try {
      for (const [key, value] of entries) await writeMeal(key, value);
      message = "";
    } catch {
      message =
        "일부 설정을 저장하지 못했어요. 현재 값을 확인하고 다시 시도해 주세요.";
    } finally {
      saving = false;
    }
  }
  async function followMain() {
    await setMany(
      ["theme", "dark", "font"].map((k) => [`appearance.${k}`, "follow"]),
    );
    customStyle = false;
  }
  async function homepage() {
    try {
      const url = settings.school?.HMPG_ADRES;
      if (!url || !["https:", "http:"].includes(new URL(url).protocol))
        throw new Error();
      if (native) await openUrl(url);
      else window.open(url, "_blank", "noopener");
    } catch {
      message = "학교 홈페이지 주소를 확인할 수 없어요.";
    }
  }
</script>

<svelte:window onfocus={updateTimestamp} />

{#snippet heading(kind = "meal", title = "", subtitle = "")}
  <span class="emblem"><SettingsEmblem {kind} /></span>
  <span class="heading-copy"
    ><strong>{title}</strong>{#if subtitle}<small>{subtitle}</small>{/if}</span
  >
{/snippet}

<div class="settings-window">
  <header class="window-bar" use:dragRegion>
    <Settings2 size={15} /><strong>급식 설정</strong>
    <button
      class="icon-btn"
      aria-label="닫기"
      onclick={() => native && getCurrentWindow().close()}
      ><X size={15} /></button
    >
  </header>
  <main aria-label="급식 설정">
    <div class="intro">
      <h1>내게 맞는 급식창</h1>
      <span class="autosave"
        ><i></i>{saving ? "저장 중" : "변경하면 바로 저장돼요"}</span
      >
    </div>
    <section class="school-card" aria-label="우리 학교">
      <div class="school-info">
        <span class="emblem"><SettingsEmblem kind="school" /></span>
        <div class="school-copy">
          <span class="eyebrow">우리 학교</span><strong
            >{settings.school?.SCHUL_NM || "학교를 연결해 주세요"}</strong
          >
        </div>
        {#if settings.school?.HMPG_ADRES}<button
            class="icon-btn"
            aria-label="학교 홈페이지 열기"
            title="학교 홈페이지"
            onclick={homepage}><ExternalLink size={14} /></button
          >{/if}
      </div>
      <div class="school-bottom">
        <span class="school-address" title={settings.school?.ORG_RDNMA || ""}
          >{settings.school?.ORG_RDNMA ||
            "학교를 찾으면 식단이 표시돼요."}</span
        ><button class="secondary" onclick={() => openMealWindow("meal-search")}
          >{settings.school ? "변경" : "학교 찾기"}<ChevronRight
            size={12}
          /></button
        >
      </div>
    </section>

    <section class="panel">
      <h2 class="panel-heading">
        {@render heading("meal", "식단 표시", "식단에 함께 보여줄 정보")}
      </h2>
      <div class="panel-body">
        <div class="field-label">표시할 끼니</div>
        <div class="segments">
          {#each ["조식", "중식", "석식"] as name, i}<button
              aria-pressed={settings.behavior.meals.includes(String(i + 1))}
              class:chosen={settings.behavior.meals.includes(String(i + 1))}
              onclick={() => toggleMeal(String(i + 1))}>{name}</button
            >{/each}
        </div>
        <p class="hint">
          {settings.behavior.meals.length
            ? "식단이 있는 끼니만 보여요."
            : "끼니를 선택하면 식단이 보여요."}
        </p>
        <div class="option-group">
          {#each groups as group}
            {@const state = groupState(group.keys)}
            <div class="toggle-row">
              <span
                ><strong
                  >{group.title}{#if state === "mixed"}<span class="state-tag"
                      >일부 켜짐</span
                    >{/if}</strong
                ><small>{group.description}</small></span
              >
              <button
                class="switch"
                role="checkbox"
                aria-label={group.title}
                aria-checked={state}
                disabled={saving}
                onclick={() =>
                  setMany(
                    group.keys.map((k) => [`display.${k}`, state !== "true"]),
                  )}><span></span></button
              >
            </div>
          {/each}
        </div>
      </div>
    </section>

    <details class="panel disclosure">
      <summary class="panel-heading"
        >{@render heading(
          "allergy",
          "알레르기",
          settings.allergies.length
            ? "주의 식품 " +
                settings.allergies.length +
                "개 · " +
                ({
                  off: "표시 안 함",
                  numbers: "번호 표시",
                  names: "식품 이름 표시",
                }[settings.display.allergens] || "")
            : "주의 식품 선택 안 함",
        )}<ChevronDown size={15} /></summary
      >
      <div class="panel-body">
        <label class="select-row"
          ><span>메뉴의 알레르기 정보</span><select
            value={settings.display.allergens}
            onchange={(e) => set("display.allergens", e.currentTarget.value)}
            ><option value="off">표시 안 함</option><option value="numbers"
              >번호</option
            ><option value="names">식품 이름</option></select
          ></label
        >
        <div class="field-label allergy-label">
          주의할 식품 <span>{settings.allergies.length}개 선택</span>
        </div>
        <p class="hint">정보 표시를 꺼도 선택한 식품의 주의 표시는 유지돼요.</p>
        <div class="allergy-grid">
          {#each ALLERGENS as name, i}<button
              aria-pressed={settings.allergies.includes(i + 1)}
              class:picked={settings.allergies.includes(i + 1)}
              onclick={() => toggleAllergy(i + 1)}
              ><span>{i + 1}</span>{name}</button
            >{/each}
        </div>
      </div>
    </details>

    <section class="panel">
      <h2 class="panel-heading">
        {@render heading("style", "화면 모양", "익숙한 스타일로, 읽기 편하게")}
      </h2>
      <div class="panel-body">
        <div class="segments style-mode">
          <button
            class:chosen={!customVisible}
            aria-pressed={!customVisible}
            disabled={saving}
            onclick={followMain}>메인 창과 동일</button
          ><button
            class:chosen={customVisible}
            aria-pressed={customVisible}
            onclick={() => (customStyle = true)}>직접 설정</button
          >
        </div>
        {#if customVisible}<div class="custom-style">
            <label class="toggle-row"
              ><span><strong>메인 창 색상 사용</strong></span><input
                type="checkbox"
                role="switch"
                checked={settings.appearance.theme === "follow"}
                onchange={(e) =>
                  set(
                    "appearance.theme",
                    e.currentTarget.checked ? "follow" : theme,
                  )}
              /></label
            >
            {#if settings.appearance.theme !== "follow"}<div
                class="theme-picker"
              >
                <ThemePicker
                  value={theme}
                  isDarkMode={Boolean(dark)}
                  onChange={(value) => set("appearance.theme", value)}
                />
              </div>{/if}
            <label class="select-row"
              ><span>화면 밝기</span><select
                value={settings.appearance.dark}
                onchange={(e) => set("appearance.dark", e.currentTarget.value)}
                ><option value="follow">메인 창과 동일</option><option
                  value="light">라이트</option
                ><option value="dark">다크</option></select
              ></label
            >
            <label class="select-row"
              ><span>글꼴</span><select
                value={settings.appearance.font}
                onchange={(e) => set("appearance.font", e.currentTarget.value)}
                ><option value="follow">메인 창과 동일</option
                >{#each [...BUILTIN_FONTS.map((f) => f.name), ...customFonts.map((f) => f.name)] as font}<option
                    value={font}>{font}</option
                  >{/each}</select
              ></label
            >
          </div>{/if}
        <div class="size-label">
          글자 크기 <span
            >{sizes[SCALES.indexOf(settings.appearance.scale)]}</span
          >
        </div>
        <div class="segments sizes">
          {#each SCALES as scale, i}<button
              class:chosen={settings.appearance.scale === scale}
              aria-pressed={settings.appearance.scale === scale}
              aria-label={sizes[i]}
              title={sizes[i]}
              onclick={() => set("appearance.scale", scale)}
              >{["최소", "작게", "보통", "크게", "최대"][i]}</button
            >{/each}
        </div>
        <div
          class="size-preview"
          style:font-size={13 * settings.appearance.scale + "px"}
        >
          <span>오늘의 급식</span>따뜻한 밥 한 끼
        </div>
      </div>
    </section>

    <details class="panel disclosure">
      <summary class="panel-heading"
        >{@render heading(
          "options",
          "기타 설정",
          "창 동작 · 학교 행사 · 불투명도",
        )}<ChevronDown size={15} /></summary
      >
      <div class="panel-body">
        {#each [["behavior.startup", "시작할 때 급식창 열기", "마지막 위치와 크기로 열어요."], ["behavior.pinned", "항상 위에 표시", "다른 창에 가려지지 않아요."], ["behavior.tomorrow", "오후 2시부터 다음 급식", "직접 고른 날짜는 유지해요."], ["display.events", "학교 행사 표시", "급식이 없는 날에도 학사일정을 보여요."]] as [key, title, description]}
          <label class="toggle-row"
            ><span><strong>{title}</strong><small>{description}</small></span
            ><input
              type="checkbox"
              role="switch"
              checked={Boolean(
                key.startsWith("behavior.")
                  ? settings.behavior[
                      /** @type {'startup'|'pinned'|'tomorrow'} */ (
                        key.split(".")[1]
                      )
                    ]
                  : settings.display.events,
              )}
              onchange={(e) => set(key, e.currentTarget.checked)}
            /></label
          >
        {/each}
        {#if ["badges", "companions", "homepage"].some((k) => settings.display[k] === false)}<div
            class="legacy-settings"
          >
            <strong>이전에 지정한 표시 방식</strong>
            <p class="hint">
              선택 배지·메뉴 정리·홈페이지 중 꺼 둔 기능은 그대로 유지했어요.
            </p>
            <button
              class="secondary"
              disabled={saving}
              onclick={() =>
                setMany(
                  ["badges", "companions", "homepage"].map((k) => [
                    `display.${k}`,
                    true,
                  ]),
                )}>기본 표시 사용</button
            >
          </div>{/if}
        <label class="opacity"
          ><span
            >불투명도 <b>{Math.round(settings.appearance.opacity * 100)}%</b
            ></span
          ><input
            aria-label="불투명도"
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            value={settings.appearance.opacity}
            onchange={(e) =>
              set("appearance.opacity", Number(e.currentTarget.value))}
          /></label
        >
      </div>
    </details>

    <details class="panel disclosure management">
      <summary class="panel-heading"
        >{@render heading(
          "data",
          "식단 관리",
          lastUpdated
            ? new Date(lastUpdated).toLocaleDateString("ko-KR") + " 갱신"
            : "저장된 식단 없음",
        )}<ChevronDown size={15} /></summary
      >
      <div class="panel-body">
        <button
          class="secondary refresh"
          onclick={refresh}
          disabled={!settings.school}
          ><RefreshCw size={13} />지금 새로고침</button
        >
        <div class="maintenance-actions">
          <button
            class="text-button"
            onclick={() => (confirm = "cache")}
            disabled={!settings.school}>저장된 식단 비우기</button
          ><button
            class="text-button"
            onclick={() => (confirm = "disconnect")}
            disabled={!settings.school}>학교 연결 해제</button
          >
        </div>
      </div>
    </details>
  </main>
  {#if message}<div class="notice" role="status">{message}</div>{/if}
  {#if confirm}<dialog
      use:showConfirmation
      oncancel={() => (confirm = "")}
      class="confirm-card"
      aria-labelledby="confirm-title"
    >
      <h2 id="confirm-title">
        {confirm === "disconnect"
          ? "학교 연결을 끊을까요?"
          : "저장된 식단을 비울까요?"}
      </h2>
      <p>
        {confirm === "disconnect"
          ? "학교와 식단 캐시를 지웁니다. 모양과 표시 설정은 남겨 둬요."
          : "인터넷에 연결하면 식단을 다시 받을 수 있어요."}
      </p>
      <div>
        <button class="secondary" onclick={() => (confirm = "")}>취소</button
        ><button class="primary" onclick={clearData}>확인</button>
      </div>
    </dialog>{/if}
</div>

<style>
  .settings-window {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  main {
    min-height: 0;
    flex: 1;
    overflow: auto;
    padding: 18px 14px 22px;
    scrollbar-width: thin;
  }
  .intro {
    padding: 0 3px 16px;
  }
  h1 {
    font-size: 19px;
    line-height: 1.4;
    margin: 0 0 5px;
    letter-spacing: -0.4px;
  }
  .autosave {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--meal-muted);
  }
  .autosave i {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--meal-ink);
  }
  .panel,
  .school-card {
    background: var(--meal-surface);
    border: 1px solid var(--meal-border);
    border-radius: 13px;
    margin: 0 0 11px;
    overflow: hidden;
  }
  .panel-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 13px;
    margin: 0;
    background: color-mix(
      in srgb,
      var(--meal-section) 62%,
      var(--meal-surface)
    );
  }
  h2 {
    font-size: 13px;
  }
  .emblem {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    border-radius: 10px;
    color: var(--meal-ink);
    background: var(--meal-surface);
    border: 1px solid color-mix(in srgb, var(--meal-border) 75%, transparent);
    box-shadow: 0 1px 2px #00000005;
  }
  .heading-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .heading-copy strong {
    font-size: 13px;
    font-weight: 700;
  }
  .heading-copy small {
    font-size: 10px;
    font-weight: 400;
    color: var(--meal-muted);
    line-height: 1.5;
  }
  .panel-body {
    padding: 13px;
    border-top: 1px solid
      color-mix(in srgb, var(--meal-border) 65%, transparent);
  }
  summary {
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary:hover {
    background: var(--meal-section);
  }
  summary :global(> svg) {
    flex-shrink: 0;
    color: var(--meal-muted);
  }
  details[open] > summary :global(> svg) {
    transform: rotate(180deg);
  }
  .school-card {
    padding: 12px 13px;
  }
  .school-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .school-copy {
    flex: 1;
    min-width: 0;
  }
  .eyebrow {
    display: block;
    font-size: 9px;
    color: var(--meal-muted);
    margin-bottom: 2px;
  }
  .school-copy strong {
    display: block;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .school-bottom {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 9px;
  }
  .school-address {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    color: var(--meal-muted);
  }
  .secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid var(--meal-border);
    background: var(--meal-bg);
    color: var(--meal-text);
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 11px !important;
    flex-shrink: 0;
  }
  .secondary:hover {
    background: var(--meal-section);
  }
  .field-label,
  .size-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .segments {
    display: flex;
    padding: 3px;
    gap: 3px;
    border: 1px solid var(--meal-border);
    background: var(--meal-bg);
    border-radius: 9px;
  }
  .segments button {
    min-width: 0;
    flex: 1;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 7px 3px;
    background: transparent;
    color: var(--meal-muted);
    font-size: 11px;
  }
  .segments button:hover {
    color: var(--meal-ink);
    background: var(--meal-section);
  }
  .segments button.chosen {
    background: var(--meal-surface);
    border-color: var(--meal-border);
    color: var(--meal-ink);
    font-weight: 700;
    box-shadow: 0 1px 3px #00000008;
  }
  .hint {
    font-size: 10px;
    color: var(--meal-muted);
    margin: 6px 0 0;
    line-height: 1.65;
    word-break: keep-all;
  }
  .option-group {
    background: color-mix(in srgb, var(--meal-bg) 65%, var(--meal-surface));
    border-radius: 9px;
    padding: 0 10px;
    margin-top: 12px;
  }
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
  }
  .toggle-row + .toggle-row {
    border-top: 1px solid
      color-mix(in srgb, var(--meal-border) 55%, transparent);
  }
  .toggle-row > span {
    min-width: 0;
  }
  .toggle-row strong {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 400;
  }
  .toggle-row small {
    display: block;
    margin-top: 3px;
    color: var(--meal-muted);
    font-size: 10px;
    line-height: 1.6;
    word-break: keep-all;
  }
  .state-tag {
    font-size: 9px;
    color: var(--meal-ink);
    background: var(--meal-section);
    padding: 1px 5px;
    border-radius: 4px;
  }
  .toggle-row input,
  .switch {
    appearance: none;
    position: relative;
    width: 32px;
    height: 19px;
    flex: 0 0 32px;
    border: 1px solid var(--meal-muted);
    border-radius: 12px;
    background: var(--meal-border);
    padding: 0;
    margin: 0;
    cursor: pointer;
  }
  .toggle-row input:checked,
  .switch[aria-checked="true"],
  .switch[aria-checked="mixed"] {
    background: var(--meal-ink);
    border-color: var(--meal-ink);
  }
  .toggle-row input::before,
  .switch span {
    content: "";
    position: absolute;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    background: var(--meal-surface);
  }
  .toggle-row input:checked::before,
  .switch[aria-checked="true"] span {
    left: 15px;
  }
  .switch[aria-checked="mixed"] span {
    width: 12px;
    height: 3px;
    border-radius: 2px;
    top: 7px;
    left: 9px;
  }
  .select-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
    padding: 8px 0;
  }
  select {
    min-width: 0;
    max-width: 58%;
    background: var(--meal-surface);
    color: var(--meal-text);
    border: 1px solid var(--meal-border);
    border-radius: 7px;
    padding: 7px;
    font-size: 11px !important;
  }
  .allergy-label {
    margin: 15px 0 0;
  }
  .allergy-label span,
  .size-label span {
    color: var(--meal-ink);
    font-size: 10px;
    font-weight: 400;
  }
  .allergy-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
    margin-top: 12px;
  }
  .allergy-grid button {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px 5px;
    border: 1px solid var(--meal-border);
    background: var(--meal-bg);
    color: var(--meal-text);
    border-radius: 7px;
    font-size: 10px;
  }
  .allergy-grid button span {
    color: var(--meal-muted);
    font-size: 9px;
    min-width: 12px;
  }
  .allergy-grid button.picked {
    background: var(--meal-warn-bg);
    border-color: var(--meal-warn);
    color: var(--meal-warn);
  }
  .custom-style {
    background: var(--meal-bg);
    border-radius: 8px;
    padding: 0 10px 5px;
    margin-top: 10px;
  }
  .theme-picker {
    padding: 5px 0 8px;
  }
  .size-label {
    margin: 15px 0 8px;
  }
  .sizes button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: 34px;
  }
  .size-preview {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    padding-top: 11px;
    color: var(--meal-text);
  }
  .size-preview > span {
    font-size: 9px;
    color: var(--meal-muted);
  }
  .opacity {
    display: block;
    font-size: 11px;
    margin-top: 13px;
    padding-top: 13px;
    border-top: 1px solid var(--meal-border);
  }
  .opacity > span {
    display: flex;
    justify-content: space-between;
  }
  .opacity b {
    font-size: 10px;
    font-weight: 400;
    color: var(--meal-ink);
  }
  .opacity input {
    display: block;
    width: 100%;
    accent-color: var(--meal-ink);
    margin: 12px 0 3px;
  }
  .legacy-settings {
    margin-top: 12px;
    padding: 12px;
    background: var(--meal-bg);
    border-radius: 8px;
    font-size: 11px;
  }
  .legacy-settings button {
    margin-top: 9px;
  }
  .refresh {
    width: 100%;
  }
  .maintenance-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    padding-top: 10px;
  }
  .text-button {
    border: 0;
    background: transparent;
    color: var(--meal-muted);
    font-size: 10px !important;
    padding: 6px 0;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .text-button:hover {
    color: var(--meal-ink);
  }
  .confirm-card {
    width: min(310px, calc(100% - 36px));
    padding: 20px;
    border: 1px solid var(--meal-border);
    border-radius: 13px;
    background: var(--meal-bg);
    color: var(--meal-text);
  }
  .confirm-card::backdrop {
    background: #0006;
  }
  .confirm-card h2 {
    margin: 0 0 12px;
  }
  .confirm-card p {
    font-size: 12px;
    line-height: 1.7;
  }
  .confirm-card > div {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }
  @container (max-width:310px) {
    main {
      padding: 14px 10px;
    }
    .panel-heading {
      padding: 11px;
      gap: 8px;
    }
    .panel-body {
      padding: 11px;
    }
    .allergy-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
