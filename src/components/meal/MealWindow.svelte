<script>
  import { track, trackThrottled } from '../../lib/analytics.js';
  import { onMount, untrack } from "svelte";
  import {
    ChevronLeft,
    ChevronRight,
    Pin,
    Settings2,
    X,
    Copy,
    Check,
    ExternalLink,
    RefreshCw,
    CalendarDays,
    School,
  } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { emit, listen } from "@tauri-apps/api/event";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { dragRegion } from "../../lib/dragRegion.js";
  import {
    native,
    writeMeal,
    cachedMonth,
    fetchMonth,
    errorMessage,
  } from "../../lib/meal/mealStore.js";
  import { openMealWindow } from "../../lib/meal/mealWindows.js";
  import {
    dateKey,
    dateLabel,
    addDays,
    weekDays,
    monthRange,
  } from "../../lib/meal/mealDate.js";
  import { nextMealDate } from "../../lib/meal/mealCache.js";
  import { parseMeal } from "../../lib/meal/mealFormat.js";
  import { pickLayout } from "../../lib/meal/mealLayout.js";
  import MealSection from "./MealSection.svelte";
  import MealIcon from "./MealIcon.svelte";
  /** @type {{settings:import('../../lib/meal/types').MealSettings;previewRows?:import('../../lib/meal/types').MealRow[]}} */
  let { settings, previewRows = [] } = $props();
  let day = $state(dateKey()),
    today = $state(dateKey()),
    layout = $state("default");
  let measured = $state({ width: 0, height: 0 });
  $effect(() => {
    if (measured.width)
      layout = pickLayout(
        measured.width,
        measured.height,
        settings.appearance.scale,
        untrack(() => layout),
      );
  });
  /** @type {HTMLDivElement} */ let root;
  /** @type {import('../../lib/meal/types').MealRow[]} */ let rows = $state.raw(
    [],
  );
  /** @type {import('../../lib/meal/types').ScheduleRow[]} */ let events =
    $state.raw([]);
  let loading = $state(false),
    error = $state(""),
    sample = $state(false),
    copied = $state(false);
  let requestVersion = 0,
    manual = false;
  const parsed = $derived(rows.map(parseMeal));
  const meals = $derived(
    parsed.filter(
      (m) =>
        m.MLSV_YMD === day && settings.behavior.meals.includes(m.MMEAL_SC_CODE),
    ),
  );
  const shown = $derived(
    layout === "mini"
      ? [meals.find((m) => m.MMEAL_SC_CODE === "2") || meals[0]].filter(Boolean)
      : meals,
  );
  const days = $derived(weekDays(day));
  const eventNames = $derived(
    events
      .filter((e) => e.AA_YMD === day)
      .map((e) => e.EVENT_NM)
      .filter((n) => n && n !== "토요휴업일")
      .join(" · "),
  );
  const nextDate = $derived(nextMealDate(rows, day, settings.behavior.meals));
  async function load(force = false) {
    const version = ++requestVersion,
      school = settings.school;
    if (!school) {
      rows = [];
      events = [];
      loading = false;
      error = "";
      return;
    }
    error = "";
    loading = true;
    if (!native && previewRows.length) {
      rows = previewRows;
      loading = false;
      return;
    }
    const months = [
      ...new Set(
        (layout === "weekly" ? days : [day]).map((d) => d.slice(0, 6)),
      ),
    ];
    const entries = await Promise.all(
      months.map((m) => cachedMonth(school, m).catch(() => null)),
    );
    if (version !== requestVersion) return;
    /** @param {(import('../../lib/meal/types').CacheEntry|null)[]} list */
    function apply(list) {
      rows = list.flatMap((e) => e?.rows || []);
      events = list.flatMap((e) => e?.events || []);
      sample = list.some((e) => e?.sample);
    }
    apply(entries);
    await Promise.all(
      months.map(async (month, i) => {
        try {
          entries[i] = await fetchMonth(school, month, force);
        } catch (e) {
          if (version === requestVersion) error = errorMessage(e);
          trackThrottled('app_error', { choice: 'meal_load' });
        }
      }),
    );
    if (version !== requestVersion) return;
    apply(entries);
    loading = false;
    if (day.slice(0, 6) === today.slice(0, 6) && Number(today.slice(6)) >= 20) {
      const nextMonth = addDays(monthRange(today.slice(0, 6)).end, 1).slice(
        0,
        6,
      );
      void fetchMonth(school, nextMonth).catch(() => {});
    }
    if (
      !manual &&
      settings.behavior.tomorrow &&
      new Date().getHours() >= 14 &&
      day === today
    ) {
      const next = nextMealDate(rows, day, settings.behavior.meals);
      if (next) day = next;
    }
  }
  $effect(() => {
    settings.school;
    day;
    layout === "weekly";
    void load();
  });
  $effect(() => {
    if (native)
      void getCurrentWindow().setAlwaysOnTop(settings.behavior.pinned);
  });
  /** @param {number} count */
  function navigate(count) {
    track('meal_navigated');
    manual = true;
    day = addDays(day, count * (layout === "weekly" ? 7 : 1));
  }
  function goToday() {
    manual = false;
    today = dateKey();
    day = today;
  }
  async function findNext() {
    if (nextDate) {
      manual = true;
      day = nextDate;
      return;
    }
    const school = settings.school;
    if (!school) return;
    loading = true;
    try {
      const month = addDays(day, 14).slice(0, 6);
      const entry = await fetchMonth(school, month);
      const next = nextMealDate(
        [...rows, ...entry.rows],
        day,
        settings.behavior.meals,
      );
      if (next) {
        manual = true;
        day = next;
      } else error = "앞으로 14일 동안 등록된 급식이 없어요.";
    } catch (e) {
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
  async function copyMenu() {
    if (!settings.school) return;
    try {
      await navigator.clipboard.writeText(
        `${settings.school.SCHUL_NM} · ${dateLabel(day)}\n` +
          meals
            .map(
              (m) =>
                `${m.MMEAL_SC_NM}: ${m.dishes.map((d) => (settings.display.companions ? d.plain : d.name)).join(", ")}`,
            )
            .join("\n"),
      );
      copied = true;
      track('meal_copied');
      window.setTimeout(() => (copied = false), 1800);
    } catch {
      error = "복사하지 못했어요. 메뉴를 선택해 복사해 주세요.";
      trackThrottled('app_error', { choice: 'meal_copy' });
    }
  }
  /** @param {KeyboardEvent} e */
  function shortcuts(e) {
    if (
      (e.target instanceof Element &&
        e.target.closest("input,textarea,select,button,summary")) ||
      e.altKey
    )
      return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigate(-1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      navigate(1);
    }
    if (e.key.toLowerCase() === "t" && !e.ctrlKey) goToday();
    if (
      e.key.toLowerCase() === "c" &&
      (e.ctrlKey || e.metaKey) &&
      !window.getSelection()?.toString()
    ) {
      e.preventDefault();
      void copyMenu();
    }
  }
  async function homepage() {
    const url = settings.school?.HMPG_ADRES;
    try {
      if (url && ["https:", "http:"].includes(new URL(url).protocol)) {
        if (native) await openUrl(url);
        else window.open(url, "_blank", "noopener");
      }
    } catch {
      error = "학교 홈페이지 주소를 확인할 수 없어요.";
    }
  }
  async function close() {
    if (native) await getCurrentWindow().close();
  }
  onMount(() => {
    let dead = false,
      raf = 0,
      timer = 0,
      saveTimer = 0;
    /** @type {Array<()=>void>} */
    const cleanup = [];
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(
        () =>
          (measured = {
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          }),
      );
    });
    observer.observe(root);
    async function saveBounds() {
      if (!native) return;
      const win = getCurrentWindow();
      if (await win.isMinimized()) return;
      const [pos, size, scale] = await Promise.all([
        win.outerPosition(),
        win.innerSize(),
        win.scaleFactor(),
      ]);
      if (
        pos.x <= -10000 ||
        pos.y <= -10000 ||
        size.width <= 0 ||
        size.height <= 0
      )
        return;
      await writeMeal("window", {
        physicalX: pos.x,
        physicalY: pos.y,
        logicalX: pos.x / scale,
        logicalY: pos.y / scale,
        width: size.width / scale,
        height: size.height / scale,
      });
    }
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => void saveBounds(), 400);
    };
    const checkDate = () => {
      const next = dateKey();
      if (today !== next) {
        today = next;
        if (!manual) day = next;
      }
      void load();
    };
    timer = window.setInterval(checkDate, 60000);
    window.addEventListener("focus", checkDate);
    window.addEventListener("online", checkDate);
    if (native) {
      const win = getCurrentWindow();
      void (async () => {
        for (const setup of [
          () => win.onMoved(scheduleSave),
          () => win.onResized(scheduleSave),
          () =>
            win.onCloseRequested(async (event) => {
              event.preventDefault();
              try {
                await saveBounds();
              } finally {
                await emit("meal-window-state", false);
                await win.destroy();
              }
            }),
          () => listen("before-quit", () => void saveBounds()),
          () => listen("meal-refresh", () => void load(true)),
        ]) {
          const off = await setup();
          if (dead) off();
          else cleanup.push(off);
        }
        await emit("meal-window-state", true);
      })();
    }
    return () => {
      dead = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(saveTimer);
      clearInterval(timer);
      window.removeEventListener("focus", checkDate);
      window.removeEventListener("online", checkDate);
      cleanup.forEach((f) => f());
    };
  });
  $effect(() => {
    settings.appearance.scale;
    if (root)
      layout = pickLayout(
        root.clientWidth,
        root.clientHeight,
        settings.appearance.scale,
      );
  });
</script>

<svelte:window onkeydown={shortcuts} />
<div class="meal" bind:this={root} data-layout={layout}>
  <header class="meal-header" use:dragRegion>
    <span class="brand"><MealIcon size={16} /><b>오늘의 급식</b></span><span
      class="header-spacer"
    ></span><button
      class="icon-btn pin"
      class:active={settings.behavior.pinned}
      title="항상 위"
      aria-label="항상 위"
      aria-pressed={settings.behavior.pinned}
      onclick={() => writeMeal("behavior.pinned", !settings.behavior.pinned)}
      ><Pin
        size={13}
        strokeWidth={2.5}
        fill={settings.behavior.pinned ? "currentColor" : "none"}
      /></button
    ><button
      class="icon-btn settings"
      title="급식 설정"
      aria-label="급식 설정"
      onclick={() => openMealWindow("meal-settings")}
      ><Settings2 size={14} /></button
    ><button class="icon-btn" title="닫기" aria-label="닫기" onclick={close}
      ><X size={15} /></button
    >
  </header>
  <section class="day-card" aria-label="날짜와 학교">
    <nav class="date-nav" aria-label="급식 날짜">
      <button class="day-arrow" title={layout === "weekly" ? "지난주" : "이전 날"}
        aria-label={layout === "weekly" ? "지난주" : "이전 날"}
        onclick={() => navigate(-1)}><ChevronLeft size={18} strokeWidth={2.5} /></button>
      <button class="date-title" title="오늘로 돌아가기 (T)" onclick={goToday}>
        <span class="date-copy">
          <span class="date-value">{#if layout === "weekly"}{Number(days[0].slice(4, 6))}월 {Number(days[0].slice(6))}–{Number(days[4].slice(6))}일{:else}{dateLabel(day)}{/if}</span>
        </span>
        <span class="today-badge">{day === today ? "오늘" : "오늘로"}</span>
      </button>
      <button class="day-arrow" title={layout === "weekly" ? "다음 주" : "다음 날"}
        aria-label={layout === "weekly" ? "다음 주" : "다음 날"}
        onclick={() => navigate(1)}><ChevronRight size={18} strokeWidth={2.5} /></button>
    </nav>
    {#if settings.school}
      <div class="school-toolbar">
        <div class="school-line">
          <span class="school-symbol" aria-hidden="true"><School size={15} /></span>
          <span class="school-name" title={settings.school.SCHUL_NM}>{settings.school.SCHUL_NM}</span>
          {#if settings.display.homepage && settings.school.HMPG_ADRES}
            <button class="icon-btn homepage" aria-label="학교 홈페이지" title="학교 홈페이지" onclick={homepage}><ExternalLink size={12} /></button>
          {/if}
        </div>
        <div class="school-actions">
          <button class="refresh-button" title={loading ? "식단 갱신 중" : "새로고침"}
            aria-label={loading ? "식단 갱신 중" : "새로고침"}
            onclick={() => load(true)} disabled={loading}><RefreshCw size={13} /></button>
          <button class="copy-button" class:copied onclick={copyMenu} disabled={!meals.length}
            title="선택한 날짜의 메뉴 복사 (Ctrl+C)" aria-label={copied ? "복사 완료" : "메뉴 복사"}>
            {#if copied}<Check size={13} />{:else}<Copy size={13} />{/if}
            <span>{copied ? "복사 완료" : "메뉴 복사"}</span>
          </button>
        </div>
      </div>
    {/if}
    <span class="sr-only" role="status">{copied ? "메뉴를 복사했어요." : loading ? "식단을 갱신하고 있어요." : ""}</span>
  </section>
  {#if sample}<div class="notice">
      샘플 모드 · 식단이 일부만 표시될 수 있어요.
    </div>{/if}
  {#if error}<div class="notice" role="status">
      {error}
      <button class="retry" onclick={() => load(true)}>다시 시도</button>
    </div>{/if}
  <main class="meal-body" aria-busy={loading}>
    {#if !settings.school}<div class="empty">
        <div class="empty-icon"><MealIcon size={38} /></div>
        <h2>우리 학교의 급식을<br />책상 위에 놓아 보세요.</h2>
        <p>학교를 한 번 등록하면<br />오늘의 식단을 바로 볼 수 있어요.</p>
        <button class="primary" onclick={() => openMealWindow("meal-search")}
          >학교 찾기</button
        >
      </div>
    {:else if loading && !rows.length}<div class="skeleton" role="status">
        식단을 불러오고 있어요.{#each [1, 2, 3, 4, 5] as n}<span
            style:width={`${95 - n * 7}%`}
          ></span>{/each}
      </div>
    {:else if layout === "weekly"}<div class="week-grid">
        {#each days as d}<section class="week-day" class:is-today={d === today}>
            <button
              class="week-heading"
              onclick={() => {
                manual = true;
                day = d;
              }}
              ><span
                >{["일", "월", "화", "수", "목", "금", "토"][
                  new Date(
                    Number(d.slice(0, 4)),
                    Number(d.slice(4, 6)) - 1,
                    Number(d.slice(6)),
                  ).getDay()
                ]}</span
              ><strong>{Number(d.slice(6))}</strong>{#if d === today}<small
                  >오늘</small
                >{/if}</button
            >{#each parsed.filter((m) => m.MLSV_YMD === d && settings.behavior.meals.includes(m.MMEAL_SC_CODE)) as meal}<MealSection
                {meal}
                {settings}
                compact
              />{:else}<p class="week-empty">
                등록된 급식이<br />없어요
              </p>{/each}
          </section>{/each}
      </div>
    {:else if shown.length}{#if settings.display.events && eventNames}<p
          class="event"
        >
          <CalendarDays size={12} />{eventNames}
        </p>{/if}
      <div class="sections">
        {#each shown as meal (`${meal.MLSV_YMD}-${meal.MMEAL_SC_CODE}`)}<MealSection
            {meal}
            {settings}
            wide={layout === "wide"}
          />{/each}
      </div>
    {:else}<div class="empty">
        <div class="empty-icon"><MealIcon size={38} /></div>
        <h2>
          {error
            ? "식단을 확인할 수 없어요"
            : settings.behavior.meals.length === 0
              ? "표시할 끼니를 골라 주세요"
              : "등록된 급식이 없어요"}
        </h2>
        <p>
          {settings.display.events && eventNames
            ? eventNames
            : sample
              ? "샘플 응답에는 이 날짜가 없을 수 있어요."
              : "휴일이거나 학교에서 아직 식단을 등록하지 않았어요."}
        </p>
        {#if settings.behavior.meals.length > 0 && !error}<button
            class="primary"
            onclick={findNext}
            disabled={loading}
            >{nextDate
              ? `다음 급식 · ${dateLabel(nextDate)}`
              : "다음 급식 찾기"}</button
          >{:else}<button
            class="secondary"
            onclick={() => openMealWindow("meal-settings")}>급식 설정</button
          >{/if}
      </div>{/if}
  </main>

</div>

<style>
  .meal {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-size: max(
      10px,
      calc(clamp(11px, 2.4cqi + 6px, 16px) * var(--meal-scale))
    );
  }
  .meal-header {
    height: 36px;
    display: flex;
    align-items: center;
    padding: 0 7px 0 12px;
    background: var(--meal-section);
    border-bottom: 1px solid var(--meal-border);
    flex-shrink: 0;
    user-select: none;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--meal-ink);
    font-size: 12px;
    letter-spacing: 0.01em;
  }
  .brand b {
    font-weight: 700;
    line-height: 1;
  }
  .header-spacer {
    flex: 1;
  }
  .active {
    color: var(--meal-ink) !important;
    background: transparent !important;
  }
  .day-card {
    flex-shrink: 0;
    padding: 8px 14px 9px;
  }
  .date-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 30px;
  }
  .day-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 26px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--meal-section);
    color: var(--meal-ink);
  }
  .day-arrow:hover {
    background: color-mix(in srgb, var(--meal-accent) 16%, var(--meal-section));
  }
  .date-title {
    min-width: 0;
    padding: 2px 0;
    border: 0;
    background: transparent;
    color: var(--meal-text);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 6px;
  }
  .date-value {
    font-size: 1.06em;
    font-weight: 700;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .today-badge {
    font-size: 10px;
    border-radius: 5px;
    padding: 2px 5px;
    color: var(--meal-ink);
    background: var(--meal-section);
    white-space: nowrap;
  }
  .school-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin-top: 5px;
    min-height: 26px;
  }
  .school-line {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--meal-muted);
    font-size: max(10px, 0.8em);
    min-width: 0;
    flex: 1 1 120px;
  }
  .school-symbol {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--meal-ink);
  }
  .school-name {
    overflow-wrap: anywhere;
    word-break: keep-all;
  }
  .school-line .icon-btn {
    width: 20px;
    height: 24px;
  }
  .school-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .refresh-button, .copy-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 26px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--meal-muted);
    padding: 3px 5px;
    font-size: 10px;
    white-space: nowrap;
  }
  .refresh-button { width: 26px; padding: 0; }
  .copy-button { color: var(--meal-ink); }
  .refresh-button:hover:not(:disabled), .copy-button:hover:not(:disabled) {
    background: var(--meal-section);
    color: var(--meal-ink);
  }
  .copy-button.copied { background: var(--meal-section); }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .meal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 14px 19px;
    border-top: 1px solid var(--meal-border);
    scrollbar-width: thin;
    scrollbar-color: var(--meal-border) transparent;
  }
  .sections {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .event {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--meal-ink);
    background: var(--meal-section);
    padding: 7px 9px;
    border-radius: 6px;
    margin: 0 0 12px;
  }
  .empty {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 12px 0;
    gap: 10px;
  }
  .empty-icon {
    background: var(--meal-section);
    border: 1px solid var(--meal-border);
    border-radius: 20px;
    color: var(--meal-ink);
    padding: 17px;
    margin-bottom: 5px;
  }
  .empty h2 {
    font-size: 1.1em;
    line-height: 1.7;
    font-weight: 700;
    margin: 0;
    word-break: keep-all;
  }
  .empty p {
    font-size: max(10px, 0.85em);
    color: var(--meal-muted);
    line-height: 1.8;
    margin: 0 0 7px;
    word-break: keep-all;
  }
  .skeleton {
    font-size: 12px;
    color: var(--meal-muted);
    padding: 14px 0;
  }
  .skeleton span {
    display: block;
    height: 15px;
    background: var(--meal-section);
    border-radius: 5px;
    margin-top: 19px;
  }
  .retry {
    border: 0;
    background: transparent;
    color: var(--meal-ink);
    text-decoration: underline;
  }
  .week-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .week-day {
    min-width: 0;
    padding: 0 10px 12px;
    border: 1px solid var(--meal-border);
    border-radius: 10px;
    background: var(--meal-surface);
  }
  .week-day.is-today {
    border-color: var(--meal-ink);
    background: var(--meal-bg);
  }
  .week-heading {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 6px;
    padding: 12px 0;
    margin-bottom: 12px;
    border: 0;
    border-bottom: 1px solid var(--meal-border);
    background: transparent;
    color: var(--meal-muted);
  }
  .week-heading strong {
    font-size: 22px;
    color: var(--meal-text);
    font-weight: 400;
  }
  .week-heading small {
    margin-left: auto;
    font-size: 10px;
    color: var(--meal-ink);
  }
  .week-empty {
    text-align: center;
    color: var(--meal-muted);
    font-size: 11px;
    line-height: 1.8;
    padding: 28px 0;
  }
  [data-layout="weekly"] {
    font-size: max(
      10px,
      calc(clamp(11px, 1.2cqi + 4.5px, 15px) * var(--meal-scale))
    );
  }
  [data-layout="weekly"] .meal-body {
    padding: 14px;
  }
  [data-layout="mini"] .brand,
  [data-layout="mini"] .pin,
  [data-layout="mini"] .school-toolbar {
    display: none;
  }
  [data-layout="mini"] .meal-header {
    position: absolute;
    right: 4px;
    top: 2px;
    background: transparent;
    border: 0;
    padding: 0;
    height: 25px;
  }
  [data-layout="mini"] .settings {
    display: none;
  }
  [data-layout="mini"] .day-card {
    padding: 0;
  }
  [data-layout="mini"] .date-nav {
    padding: 3px 30px 3px 4px;
    height: 29px;
    justify-content: flex-start;
  }
  [data-layout="mini"] .date-title {
    font-size: 10px;
    gap: 3px;
  }
  [data-layout="mini"] .today-badge {
    display: none;
  }
  [data-layout="mini"] .day-arrow {
    width: 19px;
    height: 22px;
    border: 0;
    background: transparent;
  }
  [data-layout="mini"] .meal-body {
    padding: 7px 10px;
  }
  [data-layout="compact"] .day-card { padding: 7px 10px 6px; }
  [data-layout="compact"] .date-nav { gap: 3px; }
  [data-layout="compact"] .date-title { gap: 5px; }
  [data-layout="compact"] .school-line { flex-basis: 105px; }
  [data-layout="compact"] .copy-button span { display: none; }
  [data-layout="compact"] .copy-button { width: 26px; padding: 0; }
  [data-layout="compact"] .meal-body {
    padding: 12px 14px;
  }
  [data-layout="compact"] .homepage {
    display: none;
  }
</style>
