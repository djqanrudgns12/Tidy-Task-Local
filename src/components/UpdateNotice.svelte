<script>
  import { onMount, tick } from 'svelte';
  import {
    ArrowUpRight,
    Check,
    Utensils,
    ChevronRight,
    Minus,
    Palette,
    PanelsTopLeft,
    GripHorizontal,
    X,
  } from 'lucide-svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { LazyStore } from '@tauri-apps/plugin-store';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { dragRegion } from '../lib/dragRegion.js';
  import { getTidyTheme } from '../lib/themes.js';
  import {
    UPDATE_NOTICE_ID,
    UPDATE_NOTICE_STORE_KEY,
    UPDATE_NOTICE_DISMISSED_UNTIL,
    getTomorrowStart,
    shouldShowUpdateNotice,
  } from '../lib/updateNotice.js';

  const STORE_FILE = 'tidy-task-config.json';
  const ROLLING_THUNDER_URL = 'https://www.rollinthunder.net/';
  const ROLLING_THUNDER_GUIDE_URL = 'https://www.rollinthunder.net/guide';
  let { preview = false, previewDark = false } = $props();
  let page = $state(0);
  let coverFailed = $state(false);
  /** @type {HTMLElement | undefined} */
  let scrollEl = $state();
  /** @param {number} next */
  function selectPage(next) { page = next; scrollEl?.scrollTo({ top: 0 }); }
  const THEME_SWATCHES = [
    '#d97706',
    '#2563eb',
    '#059669',
    '#8b4662',
    '#0f766e',
    '#c2410c',
    '#6b5b3e',
    '#6f4a1f',
  ];

  let isVisible = $state(false);
  /** @type {HTMLDivElement | null} */
  let dialogEl = $state(null);
  let isSaving = $state(false);
  let themeId = $state('amber');
  let isDarkMode = $state(false);
  let accent = $derived(
    isDarkMode
      ? (getTidyTheme(themeId)?.tidy.accentDark ?? '#fbbf24')
      : (getTidyTheme(themeId)?.tidy.accent ?? '#d97706'),
  );

  onMount(async () => {
    if (preview) { isDarkMode = previewDark; isVisible = true; return; }
    try {
      const store = new LazyStore(STORE_FILE);
      const hiddenUntil = await store.get(UPDATE_NOTICE_STORE_KEY);
      const mainSettings = await store.get('main');
      themeId = getTidyTheme(mainSettings?.themeColor)?.id ?? 'amber';
      isDarkMode = Boolean(mainSettings?.isDarkMode);
      isVisible = shouldShowUpdateNotice(hiddenUntil);
    } catch (error) {
      // 공지 설정을 읽지 못해도 앱 사용을 막지 않고 이번에는 공지를 보여 줍니다.
      console.warn('업데이트 공지 설정을 읽지 못했습니다:', error);
      isVisible = true;
    }

    if (!isVisible) {
      await getCurrentWindow().close();
      return;
    }

    await tick();
    dialogEl?.focus();
  });

  async function closeNotice() {
    isVisible = false;
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.warn('업데이트 공지 창을 닫지 못했습니다:', error);
    }
  }

  async function minimizeNotice() {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.warn('업데이트 공지 창을 최소화하지 못했습니다:', error);
    }
  }

  /** @param {number} timestamp */
  async function hideUntil(timestamp) {
    if (isSaving) return;
    isSaving = true;

    try {
      const store = new LazyStore(STORE_FILE);
      await store.set(UPDATE_NOTICE_STORE_KEY, timestamp);
      await store.save();
    } catch (error) {
      console.warn('업데이트 공지 숨김 설정을 저장하지 못했습니다:', error);
    } finally {
      isSaving = false;
      closeNotice();
    }
  }

  /** @param {KeyboardEvent} event */
  function handleKeydown(event) {
    if (!isVisible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNotice();
    }
  }

  /** @param {string} url */
  async function openExternalUrl(url) {
    try {
      await openUrl(url);
    } catch (error) {
      console.warn('롤린썬더 링크를 열지 못했습니다:', error);
    }
  }
</script>
<svelte:window onkeydown={handleKeydown} />

{#if isVisible}
  <div class="notice" class:is-dark={isDarkMode} style={`--accent: ${accent};`} bind:this={dialogEl} role="dialog" aria-labelledby="notice-title" tabindex="-1">
    <div class="window-bar" use:dragRegion>
      <span class="window-label"><GripHorizontal size={15} /> Tidy Task 업데이트</span>
      <div class="window-controls">
        <button onclick={minimizeNotice} aria-label="최소화"><Minus size={16} /></button>
        <button onclick={closeNotice} aria-label="닫기"><X size={17} /></button>
      </div>
    </div>
    <main class="notice-scroll" bind:this={scrollEl}>
      <header class="hero">
        <div class="release-line"><span class="eyebrow">TIDY TASK</span><span class="version">{UPDATE_NOTICE_ID}</span></div>
        <h1 id="notice-title">오늘 급식도,<br />Tidy Task에서.</h1>
        <p>할 일부터 우리 학교 식단까지, 선생님의 하루를 더 편하게.</p>
      </header>
      {#if page === 0}
        <section class="meal-card" aria-labelledby="meal-title">
          <div class="card-heading"><span class="icon-tile"><Utensils size={20} /></span><div><span class="eyebrow">NEW · 학교 급식</span><h2 id="meal-title">우리 학교 식단을 책상 위에</h2></div></div>
          <div class="meal-preview" aria-label="급식 화면 예시">
            <div class="preview-top"><span><Utensils size={13} /> 오늘의 급식</span><small>식단 예시</small></div>
            <div class="menu"><span class="rice" aria-hidden="true">🍚</span><div><strong>따뜻한 점심, 한눈에.</strong><p>잡곡밥 · 미역국 · 불고기 · 배추김치</p></div></div>
            <div class="week"><span>월</span><span>화</span><span class="selected">수</span><span>목</span><span>금</span></div>
          </div>
          <p class="card-description">학교를 설정하면 날짜별 식단을 확인할 수 있어요.<br />독립된 급식창을 원하는 자리에 놓아 보세요.</p>
          <div class="tip"><span>시작하는 방법</span> 도구 모음의 <Utensils size={12} /> 급식 버튼 → 학교 설정</div>
        </section>
      {:else if page === 1}
        <section class="design-card" aria-labelledby="design-title">
          <div class="card-heading">
            <span class="icon-tile"><PanelsTopLeft size={20} /></span>
            <div><span class="eyebrow">NEW · UI/UX</span><h2 id="design-title">UI/UX 모던 디자인 출시</h2></div>
          </div>
          <p class="card-description">자주 쓰는 도구는 찾기 쉽게,<br />기록하는 공간은 한결 단정하게 정리했어요.</p>
          <div class="design-comparison" aria-label="클래식과 모던 실제 상단 비교">
            <figure>
              <figcaption><strong>클래식</strong><span>익숙한 아이콘 중심의 간결한 구성</span></figcaption>
              <img src="/images/update-5.1/header-classic.png" width="350" height="92" alt="클래식 상단: 작은 아이콘 도구와 가운데 노트 제목, 글자 서식 도구가 모여 있는 모습" />
            </figure>
            <figure class="modern-preview">
              <figcaption><strong>모던 <small>NEW</small></strong><span>이름이 보이는 도구, 정돈된 배치</span></figcaption>
              <img src="/images/update-5.1/header-modern.png" width="350" height="132" alt="모던 상단: 왼쪽 노트 제목과 새 노트 버튼, 서식·알림·급식·메뉴가 한글 이름과 함께 배치된 모습" />
            </figure>
          </div>
          <p class="design-note">모던에서는 서식 도구를 필요할 때만 펼칠 수 있어요.<br />익숙한 클래식도 언제든 다시 선택할 수 있습니다.</p>
          <div class="tip"><span>바꾸는 방법</span> 설정 → Tidy Task 상단 디자인 → 모던</div>
        </section>
      {:else}
        <section class="theme-card" aria-labelledby="theme-title">
          <div class="card-heading"><span class="icon-tile"><Palette size={20} /></span><div><span class="eyebrow">15 THEMES</span><h2 id="theme-title">오늘의 기분에 맞는 15가지 테마</h2></div></div>
          <p class="card-description">클래식·모던·페이퍼, 세 가지 무드로<br />Tidy Task를 새롭게 꾸며 보세요.</p>
          <div class="swatches" aria-label="테마 색상 미리보기">{#each THEME_SWATCHES as color}<span style:background={color}></span>{/each}<small>나만의 분위기로</small></div>
        </section>
      {/if}
      <nav class="pagination" aria-label="업데이트 소식 페이지">
        <button class:active={page === 0} aria-current={page === 0 ? 'page' : undefined} onclick={() => selectPage(0)}><span class="dot"></span>새로운 급식창</button>
        <button class:active={page === 1} aria-current={page === 1 ? 'page' : undefined} onclick={() => selectPage(1)} aria-label="UI/UX 모던 디자인 출시"><span class="dot"></span>UI/UX 모던 디자인</button>
        <button class:active={page === 2} aria-current={page === 2 ? 'page' : undefined} onclick={() => selectPage(2)}><span class="dot"></span>15가지 테마</button>
      </nav>
        <section class="polish" aria-labelledby="polish-title">
          <span class="eyebrow">더 편안하게 쓰도록</span>
          <h2 id="polish-title">작은 불편도 함께 다듬었어요</h2>
          <p><Check size={14} /><span>새 버전을 더 빨리 확인하고, 내려받기 직전에 최신 설치 파일을 다시 확인해요.</span></p>
          <p><Check size={14} /><span>더 나은 프로그램과 업데이트를 위한 익명 사용 통계를 안정적으로 집계해요.</span></p>
          <p><Check size={14} /><span>창 위치·저장·창 관리 코드를 정리하고 안정성을 다듬었어요.</span></p>
        </section>

      <aside class="rolling-card" aria-labelledby="rolling-title">
        <div class="rolling-visual">
          {#if !coverFailed}<img src="https://www.rollinthunder.net/images/og-cover.jpg" alt="형형색색의 칩들이 트랙을 달리는 롤린썬더 추첨 레이스 미리보기" onerror={() => coverFailed = true} />
          {:else}<div class="cover-fallback"><span>ROLLIN THUNDER</span><strong>운명을 굴려라!</strong><p>교실을 들썩이게 하는 추첨 레이스</p></div>{/if}
        </div>
        <div class="rolling-copy">
          <div class="rolling-heading"><span class="rt-badge">RT</span><div><span class="eyebrow">ROLLIN THUNDER</span><h2 id="rolling-title">롤린썬더</h2></div><span class="new-badge">서바이벌 아레나 OPEN</span></div>
          <span class="maker-note"><img src="/chaltteok.webp" alt="" /> 찰떡쌤이 만든 또 다른 교실 도구</span>
          <h3>구경만 하는 추첨을 넘어,<br />함께 살아남는 아레나로.</h3>
          <p class="rolling-lead">이름을 넣으면 칩들이 진짜 물리 법칙으로 구르고 부딪혀요. 끝까지 순위를 알 수 없는 레이스에, 마지막 칩이 남을 때까지 밀치고 피하는 <strong>서바이벌 아레나</strong>가 더해졌습니다.</p>
          <div class="arena-highlight"><span class="arena-label">NEW GAME MODE</span><strong>한 전장, 최대 30명의 생존 경기</strong><p>무너지는 바닥과 갑작스러운 재난, 응원 부활까지.<br />맵마다 달라지는 경기 흐름을 함께 지켜보세요.</p></div>
          <div class="rolling-features">
            <div><b>⚙</b><strong>물리 엔진 레이스</strong><span>1등부터 꼴찌까지 전체 순위를 한 번에</span></div>
            <div><b>🗺</b><strong>우리 반 맵 만들기</strong><span>직접 꾸미고, 다른 선생님의 맵도 즐겨요</span></div>
            <div><b>✨</b><strong>칩 스킨과 다양한 스킬</strong><span>내 칩을 꾸미고 레이스에 반전을 더해요</span></div>
            <div><b>◐</b><strong>교실에 맞춘 진행</strong><span>차분한 화면부터 아레나 진행 화면까지</span></div>
          </div>
          <p class="use-case"><strong>발표자 · 모둠 · 자리 · 경품</strong><br />평범한 순서 정하기를 함께 응원하는 순간으로 바꿔 보세요.</p>
          <div class="rolling-actions"><button class="rolling-primary" onclick={() => openExternalUrl(ROLLING_THUNDER_URL)}>롤린썬더 시작하기 <ArrowUpRight size={15} /></button><button class="guide" onclick={() => openExternalUrl(ROLLING_THUNDER_GUIDE_URL)}>교실 활용 가이드 <ChevronRight size={13} /></button></div>
          <p class="service-note">기본 추첨은 무료 · 일부 확장 기능은 Premium<br />롤링썬더의 새 이름, 롤린썬더. 기존 계정과 주소는 그대로예요.</p>
        </div>
      </aside>
    </main>
    <footer>
      <div class="snooze"><button disabled={isSaving} onclick={() => hideUntil(getTomorrowStart())}>오늘 그만보기</button><span>·</span><button disabled={isSaving} onclick={() => hideUntil(UPDATE_NOTICE_DISMISSED_UNTIL)}>더 이상 보지 않기</button></div>
      <button class="primary-close" onclick={closeNotice}>닫기</button>
      <div class="credit">© 2026 <img src="/chaltteok.webp" alt="" /> <strong>찰떡쌤.</strong> All rights reserved.</div>
    </footer>
  </div>
{/if}

<style>
  .notice { --ink:#29332f; --muted:#68736d; --paper:#fffdf8; --line:#e8e8de; position:fixed; inset:0; display:flex; flex-direction:column; background:var(--paper); color:var(--ink); outline:none; font-size:12px; }
  .is-dark { --ink:#edf1eb; --muted:#b2bdb4; --paper:#202720; --line:#3b453b; }
  button { font:inherit; cursor:pointer; }
  button:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .window-bar { height:36px; flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:0 7px 0 14px; border-bottom:1px solid var(--line); color:var(--muted); }
  .window-label,.window-controls { display:flex; align-items:center; gap:6px; }
  .window-label { font-size:10px; font-weight:700; }
  .window-controls button { display:grid; place-items:center; width:29px; height:28px; border:0; border-radius:7px; background:transparent; color:inherit; }
  .window-controls button:hover { background:var(--line); }
  .notice-scroll { flex:1; min-height:0; overflow:auto; scrollbar-width:thin; padding:20px 22px 12px; }
  .hero { margin-bottom:17px; }
  .release-line { display:flex; align-items:center; gap:9px; margin-bottom:10px; }
  .eyebrow { font-size:9px; font-weight:800; letter-spacing:.12em; color:var(--accent); }
  .version { font-size:10px; font-weight:800; border:1px solid var(--line); border-radius:20px; padding:2px 8px; }
  h1 { font-size:30px; line-height:1.2; letter-spacing:-.055em; margin:0 0 9px; font-weight:900; }
  .hero p { font-size:11px; color:var(--muted); margin:0; line-height:1.6; word-break:keep-all; }
  h2 { font-size:14px; letter-spacing:-.04em; margin:3px 0 0; font-weight:800; }
  .meal-card,.theme-card,.design-card { padding:17px; border:1px solid color-mix(in srgb,var(--accent) 23%,var(--line)); border-radius:19px; background:color-mix(in srgb,var(--accent) 5%,var(--paper)); }
  .card-heading { display:flex; align-items:center; gap:10px; }
  .icon-tile { display:grid; place-items:center; width:38px; height:38px; flex-shrink:0; border-radius:12px; color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,var(--paper)); }
  .meal-preview { margin-top:14px; border:1px solid var(--line); border-radius:12px; padding:11px 13px; background:var(--paper); box-shadow:0 5px 15px #243b2210; }
  .preview-top { display:flex; justify-content:space-between; align-items:center; font-size:10px; }
  .preview-top>span { display:flex; align-items:center; gap:5px; font-weight:700; }
  .preview-top small { font-size:8px; color:var(--muted); }
  .menu { display:flex; align-items:center; gap:10px; padding:11px 0; }
  .rice { font-size:29px; }
  .menu strong { font-size:13px; }
  .menu p { font-size:9px; margin:4px 0 0; color:var(--muted); }
  .week { display:flex; gap:5px; border-top:1px solid var(--line); padding-top:8px; }
  .week span { flex:1; text-align:center; padding:4px; border-radius:6px; font-size:9px; color:var(--muted); }
  .week .selected { background:color-mix(in srgb,var(--accent) 15%,var(--paper)); color:var(--ink); font-weight:800; }
  .card-description { font-size:11px; color:var(--muted); line-height:1.7; margin:12px 0 0; }
  .tip { display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:9px; margin-top:10px; line-height:1.6; }
  .tip>span { color:var(--accent); font-weight:800; margin-right:4px; }
  .polish { padding:17px 2px 0; }
  .polish h2 { margin-bottom:9px; font-size:13px; }
  .polish p { display:flex; align-items:flex-start; gap:6px; margin:6px 0; font-size:10px; line-height:1.5; color:var(--muted); }
  .polish :global(svg) { color:var(--accent); flex-shrink:0; }
  .swatches { display:flex; align-items:center; margin-top:12px; }
  .swatches>span { width:20px; height:20px; border:2px solid var(--paper); border-radius:50%; margin-left:-3px; }
  .swatches small { color:var(--muted); margin-left:8px; font-size:9px; }
  .rolling-card { margin-top:18px; overflow:hidden; padding:0; border-radius:19px; background:#eaf6f1; border:1px solid #c9e4d8; color:#203f36; }
  .is-dark .rolling-card { background:#223b32; border-color:#395b4b; color:#e1f5eb; }
  .rolling-heading { display:flex; align-items:center; gap:9px; }
  .rt-badge { display:grid; place-items:center; background:#236451; color:#fff; width:35px; height:35px; border-radius:11px; font-size:13px; font-weight:900; }
  .rolling-card .eyebrow { color:#367461; font-size:8px; }
  .is-dark .rolling-card .eyebrow { color:#9dd8be; }
  .rolling-heading h2 { margin:1px 0 0; font-size:15px; }
  .new-badge { margin-left:auto; font-size:8px; padding:4px 7px; border:1px solid #80ac98; border-radius:20px; }
  .rolling-card h3 { margin:5px 0 10px; font-size:22px; line-height:1.25; letter-spacing:-.04em; font-weight:900; }
  .rolling-card p { font-size:10px; line-height:1.65; margin:0; }
  .rolling-features { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:13px; }
  .rolling-features div { display:grid; grid-template-columns:17px 1fr; gap:4px; padding:10px; border:1px solid #83b49b44; border-radius:11px; background:#ffffff55; }
  .is-dark .rolling-features div { background:#ffffff06; }
  .rolling-features b { font-size:12px; grid-row:span 2; }
  .rolling-features strong { font-size:10px; }
  .rolling-features span { font-size:9px; line-height:1.5; color:var(--muted); }
  .rolling-actions { display:flex; align-items:center; gap:8px; margin-top:13px; }
  .rolling-actions button { display:flex; align-items:center; justify-content:center; gap:4px; min-height:33px; border:0; border-radius:9px; font-size:10px; font-weight:700; }
  .rolling-primary { flex:1; background:#236451; color:white; }
  .guide { padding:0 5px; background:transparent; color:inherit; }
  footer { flex-shrink:0; padding:0 17px 8px; background:var(--paper); }
  .pagination { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:3px; padding:8px 0 0; }
  .pagination button { display:flex; align-items:center; justify-content:center; gap:5px; white-space:nowrap; border:0; border-radius:20px; background:transparent; color:var(--muted); font-size:9px; padding:8px 4px; }
  .pagination .active { background:color-mix(in srgb,var(--accent) 10%,var(--paper)); color:var(--ink); font-weight:800; }
  .dot { width:6px; height:6px; background:var(--muted); border-radius:50%; }
  .active .dot { background:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent); }
  .snooze { display:flex; justify-content:center; align-items:center; gap:10px; padding:7px 0; color:var(--muted); }
  .snooze button { background:transparent; color:inherit; border:0; font-size:10px; padding:4px; }
  .snooze button:hover { text-decoration:underline; }
  .snooze button:disabled { opacity:.5; }
  .primary-close { width:100%; min-height:35px; border:0; border-radius:11px; background:var(--accent); color:white; font-weight:800; font-size:12px; }
  .is-dark .primary-close { color:#202720; }
  .credit { display:flex; align-items:center; justify-content:center; gap:3px; font-size:8px; color:var(--muted); padding-top:7px; }
  .credit img { width:20px; height:20px; object-fit:contain; }
  .rolling-visual { width:100%; aspect-ratio:1200 / 630; background:#0a1b28; }
  .rolling-visual img { display:block; width:100%; height:100%; object-fit:contain; }
  .rolling-copy { padding:18px; }
  .maker-note { display:flex; align-items:center; gap:4px; margin-top:12px; color:var(--muted); font-size:9px; }
  .maker-note img { width:23px; height:23px; object-fit:contain; }
  .arena-highlight { margin-top:14px; padding:13px; border:1px solid #99c9b5; border-radius:12px; background:linear-gradient(120deg,#ffffff77,#b9e7d333); }
  .is-dark .arena-highlight { background:#ffffff06; }
  .arena-label { display:block; color:#35715d; font-size:8px; letter-spacing:.13em; font-weight:900; margin-bottom:4px; }
  .is-dark .arena-label { color:#9dd8be; }
  .arena-highlight>strong { display:block; font-size:13px; margin-bottom:6px; }
  .rolling-card .rolling-lead { font-size:11px; line-height:1.75; }
  .rolling-card .use-case { margin-top:14px; padding:10px 12px; border-left:3px solid #4b9a7d; background:#83b49b12; }
  .rolling-card .service-note { font-size:8px; line-height:1.7; color:var(--muted); margin-top:10px; }
  .rolling-actions { flex-direction:column; align-items:stretch; }
  .cover-fallback { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#c2f9df; }
  .cover-fallback strong { font-size:28px; }
  .cover-fallback>span { font-size:10px; letter-spacing:.2em; }
  .theme-card { padding:15px 17px; }
  .design-comparison { display:grid; gap:12px; margin-top:14px; }
  .design-comparison figure { margin:0; overflow:hidden; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
  .design-comparison figcaption { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:4px 8px; padding:8px 10px; border-bottom:1px solid var(--line); }
  .design-comparison figcaption>strong { display:flex; align-items:center; gap:5px; font-size:11px; }
  .design-comparison figcaption>span { font-size:8px; color:var(--muted); }
  .design-comparison small { padding:2px 4px; border-radius:4px; background:color-mix(in srgb,var(--accent) 12%,var(--paper)); color:var(--accent); font-size:7px; letter-spacing:.05em; }
  .design-comparison img { display:block; width:100%; height:auto; }
  .design-comparison .modern-preview { border-color:color-mix(in srgb,var(--accent) 35%,var(--line)); }
  .design-note { margin:12px 0 0; color:var(--muted); font-size:10px; line-height:1.7; }
  .meal-card { padding:14px; }
  .meal-preview { margin-top:10px; padding:8px 11px; }
  .menu { padding:7px 0; }
  .week { display:none; }
  .polish { border-top:1px solid var(--line); margin-top:12px; padding-top:13px; }
  .hero { margin-bottom:14px; }
  .hero h1 { font-size:28px; }
  .rolling-card { box-shadow:0 8px 24px #1747330d; }
  @media (max-width:360px) { .notice-scroll { padding:16px 15px 10px; } h1 { font-size:27px; } .meal-card,.theme-card,.design-card { padding:13px; } .pagination button { font-size:8px; gap:4px; } .rolling-copy { padding:14px; } .menu p { font-size:8px; } }
</style>
