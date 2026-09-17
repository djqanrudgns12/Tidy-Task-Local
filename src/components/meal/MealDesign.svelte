<script>
  import MealFrame from "./MealFrame.svelte";
  import MealWindow from "./MealWindow.svelte";
  import MealSearchWindow from "./MealSearchWindow.svelte";
  import MealSettingsWindow from "./MealSettingsWindow.svelte";
  import { normalizeMealSettings } from "../../lib/meal/mealSettings.js";
  import { TIDY_THEMES } from "../../lib/themes.js";
  import { previewSchool, previewRows } from "../../lib/meal/previewFixture.js";
  import { readSettings, subscribeMeal } from "../../lib/meal/mealStore.js";
  import { onMount } from "svelte";
  let theme = $state("sea-glass"),
    dark = $state("light"),
    scale = $state(1),
    width = $state(340),
    height = $state(570),
    view = $state("meal"),
    empty = $state(false);
  let stored = $state(normalizeMealSettings({ allergies: [2], appearance: { theme: "sea-glass", dark: "light" } }));
  const mainAppearance = {
    themeColor: "sea-glass",
    uiFontFamily: "메이플스토리 L",
    isDarkMode: false,
  };
  const settings = $derived({
    ...stored,
    school: empty ? null : previewSchool,
    allergies: stored.allergies,
    appearance: {
      ...stored.appearance,
      theme,
      dark,
      scale,
    },
  });
  onMount(() => {
    /** @type {undefined|(()=>void)} */
    let off;
    void subscribeMeal(async () => {
      const next = await readSettings();
      if (next.appearance.theme !== stored.appearance.theme)
        theme = next.appearance.theme;
      if (next.appearance.dark !== stored.appearance.dark)
        dark = next.appearance.dark;
      if (next.appearance.scale !== stored.appearance.scale)
        scale = next.appearance.scale;
      stored = next;
    }).then((f) => (off = f));
    return () => off?.();
  });
</script>

<div class="design">
  <aside>
    <a href="?meal-design">Tidy Task <span>DESIGN PREVIEW</span></a>
    <h1>책상 위,<br />오늘의 급식.</h1>
    <p>메뉴는 또렷하게.<br />필요한 정보는 한 단계 가까이.</p>
    <div class="controls">
      <label
        >화면<select bind:value={view}
          ><option value="meal">급식 창</option><option value="search"
            >학교 검색</option
          ><option value="settings">급식 설정</option></select
        ></label
      ><label
        >테마<select bind:value={theme}
          ><option value="follow">메인 창 따라가기</option
          >{#each TIDY_THEMES as t}<option value={t.id}>{t.label}</option
            >{/each}</select
        ></label
      ><label
        >글자 크기<select bind:value={scale}
          >{#each [0.85, 0.92, 1, 1.12, 1.25] as s, i}<option value={s}
              >{["매우 작게", "작게", "보통", "크게", "매우 크게"][i]}</option
            >{/each}</select
        ></label
      ><label class="check"
        ><input
          type="checkbox"
          checked={dark === "dark"}
          onchange={(e) => (dark = e.currentTarget.checked ? "dark" : "light")}
        />다크 모드</label
      ><label class="check"
        ><input type="checkbox" bind:checked={empty} />학교 미등록 상태</label
      >
      <div class="presets">
        {#each [[180, 120, "미니"], [260, 390, "컴팩트"], [340, 570, "기본"], [560, 490, "와이드"], [880, 560, "주간"]] as [w, h, name]}<button
            onclick={() => {
              width = Number(w);
              height = Number(h);
            }}>{name}</button
          >{/each}
      </div>
      <label
        >너비 {width}px<input
          type="range"
          min="180"
          max="1040"
          bind:value={width}
        /></label
      ><label
        >높이 {height}px<input
          type="range"
          min="120"
          max="760"
          bind:value={height}
        /></label
      >
    </div>
    <small
      >디자인 확인용 예시 식단입니다.<br />실제 조회는 데스크톱 앱에서
      동작합니다.</small
    >
  </aside>
  <main>
    <div class="preview-label">
      <span
        >{view === "meal"
          ? "오늘의 급식"
          : view === "search"
            ? "학교 찾기"
            : "급식 설정"}</span
      ><span>{width} × {height}</span>
    </div>
    <div
      class="preview-window"
      style:width={`${view === "meal" ? width : 380}px`}
      style:height={`${height}px`}
    >
      <MealFrame {settings} main={mainAppearance}
        >{#if view === "meal"}<MealWindow
            {settings}
            {previewRows}
          />{:else if view === "search"}<MealSearchWindow
          />{:else}<MealSettingsWindow
            {settings}
            main={mainAppearance}
          />{/if}</MealFrame
      >
    </div>
    <p class="preview-note">
      실제 앱과 같은 컴포넌트 · 창 크기별 5가지 배치 · 테마 15종
    </p>
  </main>
</div>

<style>
  :global(body:has(.design)) {
    overflow: auto;
    background: #eef1ef;
  }
  .design {
    display: flex;
    min-height: 100vh;
    font-family: "메이플스토리 L", sans-serif;
    color: #273e38;
  }
  aside {
    width: 290px;
    flex-shrink: 0;
    padding: 35px 30px;
    background: #f9fbfa;
    border-right: 1px solid #d9e1dd;
  }
  aside a {
    display: block;
    font-size: 17px;
    color: #244a40;
    text-decoration: none;
  }
  aside a span {
    display: block;
    font: 9px sans-serif;
    letter-spacing: 2px;
    margin-top: 5px;
    color: #72887e;
  }
  h1 {
    font-size: 36px;
    line-height: 1.4;
    letter-spacing: -1px;
    margin: 40px 0 15px;
  }
  aside p {
    font-size: 13px;
    color: #637970;
    line-height: 1.9;
  }
  .controls {
    border-top: 1px solid #dbe3de;
    margin-top: 24px;
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 13px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11px;
  }
  select {
    border: 1px solid #d2ded7;
    background: white;
    border-radius: 7px;
    padding: 8px;
    font:
      12px "메이플스토리 L",
      sans-serif;
    color: #324b41;
  }
  .check {
    flex-direction: row;
    align-items: center;
    gap: 7px;
  }
  input {
    accent-color: #306d5a;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .presets button {
    font:
      10px "메이플스토리 L",
      sans-serif;
    background: white;
    border: 1px solid #c5d6cc;
    border-radius: 6px;
    padding: 6px;
    cursor: pointer;
  }
  aside small {
    display: block;
    margin-top: 24px;
    color: #76877f;
    font-size: 10px;
    line-height: 1.8;
  }
  main {
    flex: 1;
    min-width: 0;
    padding: 36px 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-image: radial-gradient(#c8d3cd 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .preview-label {
    width: 340px;
    max-width: 100%;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #64776d;
    margin-bottom: 14px;
  }
  .preview-window {
    flex-shrink: 0;
    box-shadow:
      0 16px 50px #254d3e14,
      0 3px 9px #254d3e10;
    border-radius: 14px;
    max-width: 100%;
  }
  .preview-window :global(.meal-frame) {
    height: 100%;
  }
  .preview-note {
    font-size: 10px;
    color: #75897e;
    margin-top: 22px;
    text-align: center;
  }
  @media (max-width: 750px) {
    .design {
      display: block;
    }
    aside {
      width: 100%;
      padding: 20px;
    }
    h1 {
      font-size: 24px;
      margin: 15px 0;
    }
    .controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    main {
      padding: 24px 12px;
      min-height: 650px;
    }
  }
</style>
