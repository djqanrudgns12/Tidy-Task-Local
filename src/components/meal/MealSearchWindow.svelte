<script>
  import { onMount } from "svelte";
  import { Search, X, MapPin, ArrowRight, Check, School } from "lucide-svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { dragRegion } from "../../lib/dragRegion.js";
  import { native, writeMeal, errorMessage } from "../../lib/meal/mealStore.js";
  import { openMealWindow } from "../../lib/meal/mealWindows.js";
  let query = $state(""),
    office = $state(""),
    selected = $state(-1),
    loading = $state(false),
    saving = $state(false),
    error = $state(""),
    searched = $state(false),
    sample = $state(false);
  /** @type {HTMLInputElement} */ let input;
  /** @type {import('../../lib/meal/types').School[]} */ let rows = $state.raw(
    [],
  );
  let version = 0;
  const regions = [
    ["", "전국"],
    ["B10", "서울"],
    ["C10", "부산"],
    ["D10", "대구"],
    ["E10", "인천"],
    ["F10", "광주"],
    ["G10", "대전"],
    ["H10", "울산"],
    ["I10", "세종"],
    ["J10", "경기"],
    ["K10", "강원"],
    ["M10", "충북"],
    ["N10", "충남"],
    ["P10", "전북"],
    ["Q10", "전남"],
    ["R10", "경북"],
    ["S10", "경남"],
    ["T10", "제주"],
  ];
  async function search() {
    const token = ++version,
      name = query.replace(/\s/g, "");
    selected = -1;
    error = "";
    rows = [];
    if (name.length < 2) {
      searched = false;
      loading = false;
      return;
    }
    loading = true;
    try {
      if (!native) throw new Error("PREVIEW");
      const result = await invoke("neis_search_schools", {
        name,
        office: office || null,
      });
      if (token !== version) return;
      rows = result.rows.slice(0, 50);
      sample = result.sample;
      searched = true;
    } catch (e) {
      if (token === version) error = errorMessage(e);
    } finally {
      if (token === version) loading = false;
    }
  }
  $effect(() => {
    query;
    office;
    version++;
    rows = [];
    selected = -1;
    loading = false;
    searched = false;
    error = "";
    const timer = setTimeout(() => void search(), 300);
    return () => clearTimeout(timer);
  });
  async function register() {
    if (saving || !rows[selected]) return;
    saving = true;
    try {
      await writeMeal("school", rows[selected]);
      await openMealWindow("meal");
      if (native) await getCurrentWindow().close();
    } catch {
      error = "학교 등록을 마치지 못했어요. 다시 시도해 주세요.";
    } finally {
      saving = false;
    }
  }
  /** @param {KeyboardEvent} e */
  function keys(e) {
    if (e.isComposing) return;
    if (e.key === "Escape" && native) void getCurrentWindow().close();
    if (e.target instanceof HTMLSelectElement) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selected = Math.min(rows.length - 1, selected + 1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selected = Math.max(0, selected - 1);
    }
    if (e.key === "Enter" && rows[selected]) {
      e.preventDefault();
      void register();
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      requestAnimationFrame(() =>
        document
          .querySelector(".result-list article.selected")
          ?.scrollIntoView({ block: "nearest" }),
      );
    }
  }
  onMount(() => input?.focus());
</script>

<svelte:window onkeydown={keys} />
<div class="search-window">
  <header class="window-bar" use:dragRegion>
    <School size={15} /><strong>학교 찾기</strong><button
      class="icon-btn"
      aria-label="닫기"
      onclick={() => native && getCurrentWindow().close()}
      ><X size={15} /></button
    >
  </header>
  <div class="search-intro">
    <span class="eyebrow">우리 학교 급식</span>
    <h1>어느 학교의 식단을<br />보여 드릴까요?</h1>
    <p>학교 이름을 두 글자 이상 입력해 주세요.</p>
    <div class="search-field">
      <Search size={17} /><input
        bind:this={input}
        bind:value={query}
        maxlength="30"
        placeholder="예: 한려, 한려초"
        aria-label="학교 이름"
      />{#if query}<button
          class="icon-btn"
          aria-label="검색어 지우기"
          onclick={() => {
            query = "";
            input?.focus();
          }}><X size={14} /></button
        >{/if}
    </div>
    <label class="region-label"
      >지역 <select bind:value={office} aria-label="학교 지역"
        >{#each regions as [code, name]}<option value={code}>{name}</option
          >{/each}</select
      ></label
    >
  </div>
  <div class="results" aria-live="polite" aria-busy={loading}>
    {#if error}<div class="empty-result">
        <p>{error}</p>
        <button class="secondary" onclick={search}>다시 찾기</button>
      </div>{:else if loading}<p class="search-status">
        학교를 찾고 있어요…
      </p>{:else if rows.length}<div class="result-count">
        <strong>{rows.length}개 학교</strong><span>↑↓ 선택 · Enter 등록</span>
      </div>
      {#if rows.length === 50}<p class="search-status">
          결과가 많아요. 지역을 선택해 좁혀 주세요.
        </p>{/if}{#if sample}<p class="search-status">
          샘플 모드 · 검색 결과가 일부만 표시됩니다.
        </p>{/if}
      <div class="result-list">
        {#each rows as school, i}<article class:selected={i === selected}>
            <button
              class="school-result"
              aria-pressed={i === selected}
              onclick={() => (selected = i)}
              ><span class="school-badge"
                >{school.SCHUL_KND_SC_NM?.replace("등학교", "").replace(
                  "학교",
                  "",
                )}</span
              ><span class="school-copy"
                ><strong>{school.SCHUL_NM}</strong><small
                  ><MapPin size={11} />{school.LCTN_SC_NM}</small
                ><span>{school.ORG_RDNMA}</span></span
              >{#if i === selected}<Check size={15} />{/if}</button
            >{#if i === selected}<button
                class="primary register"
                disabled={saving}
                onclick={register}
                >{saving ? "등록하고 있어요…" : "이 학교로 등록"}<ArrowRight
                  size={14}
                /></button
              >{/if}
          </article>{/each}
      </div>{:else if searched}<div class="empty-result">
        <Search size={28} />
        <h2>찾은 학교가 없어요</h2>
        <p>학교 이름을 짧게 입력하거나<br />다른 지역을 선택해 보세요.</p>
      </div>{:else}<div class="empty-result">
        <div class="school-illustration"><School size={35} /></div>
        <h2>학교는 한 번만 등록하면 돼요.</h2>
        <p>
          같은 이름의 학교가 있을 수 있으니<br />지역과 주소를 함께 확인해
          주세요.
        </p>
      </div>{/if}
  </div>
  <footer>학교 정보는 나이스 교육정보 개방 포털에서 제공해요.</footer>
</div>

<style>
  .search-window {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .search-intro {
    padding: 23px 22px 15px;
  }
  .eyebrow {
    font-size: 11px;
    color: var(--meal-ink);
  }
  h1 {
    font-size: 23px;
    font-weight: 700;
    line-height: 1.4;
    letter-spacing: -0.6px;
    margin: 8px 0 10px;
  }
  .search-intro p {
    font-size: 12px;
    color: var(--meal-muted);
    margin: 0 0 19px;
  }
  .search-field {
    display: flex;
    gap: 9px;
    align-items: center;
    border: 1px solid var(--meal-border);
    background: var(--meal-surface);
    border-radius: 10px;
    padding: 7px 10px;
    color: var(--meal-ink);
    height: 45px;
  }
  .search-field:focus-within {
    outline: 2px solid var(--meal-ink);
    outline-offset: 2px;
  }
  .search-field input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0 !important;
    background: transparent;
    color: var(--meal-text);
  }
  .region-label {
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 11px;
    color: var(--meal-muted);
    margin-top: 13px;
  }
  .region-label select {
    border: 1px solid var(--meal-border);
    border-radius: 6px;
    background: var(--meal-bg);
    color: var(--meal-text);
    padding: 3px 20px 3px 7px;
  }
  .results {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 22px 16px;
  }
  .result-count {
    display: flex;
    justify-content: space-between;
    margin: 3px 0 11px;
    font-size: 11px;
  }
  .result-count span {
    font-size: 10px;
    color: var(--meal-muted);
  }
  .result-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  article {
    border: 1px solid var(--meal-border);
    border-radius: 10px;
    background: var(--meal-surface);
    overflow: hidden;
  }
  article.selected {
    border-color: var(--meal-ink);
  }
  .school-result {
    width: 100%;
    display: flex;
    align-items: start;
    text-align: left;
    gap: 10px;
    border: 0;
    background: transparent;
    color: var(--meal-text);
    padding: 13px;
  }
  .school-badge {
    display: grid;
    place-items: center;
    min-width: 31px;
    height: 31px;
    font-size: 10px;
    color: var(--meal-ink);
    background: var(--meal-section);
    border-radius: 8px;
  }
  .school-copy {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .school-copy strong {
    font-size: 13px;
    word-break: keep-all;
  }
  .school-copy small {
    display: flex;
    gap: 3px;
    align-items: center;
    font-size: 10px;
    color: var(--meal-ink);
  }
  .school-copy > span {
    font-size: 11px;
    color: var(--meal-muted);
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  .register {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    width: calc(100% - 24px);
    margin: 0 12px 12px;
    font-size: 12px !important;
  }
  .empty-result {
    height: 100%;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--meal-muted);
    gap: 9px;
  }
  .empty-result h2 {
    font-size: 13px;
    color: var(--meal-text);
    margin: 0;
  }
  .empty-result p {
    font-size: 12px;
    line-height: 1.8;
    margin: 0;
  }
  .school-illustration {
    color: var(--meal-ink);
    background: var(--meal-section);
    padding: 14px;
    border-radius: 18px;
    margin-bottom: 3px;
  }
  .search-status {
    font-size: 11px;
    color: var(--meal-muted);
  }
  footer {
    padding: 11px;
    text-align: center;
    border-top: 1px solid var(--meal-border);
    font-size: 10px;
    color: var(--meal-muted);
  }
</style>
