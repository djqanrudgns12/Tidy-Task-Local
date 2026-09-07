<script>
  import { onMount, tick } from 'svelte';
  import {
    ArrowUpRight,
    Check,
    Maximize2,
    Minus,
    Palette,
    GripHorizontal,
    Sparkles,
    X,
  } from 'lucide-svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { LazyStore } from '@tauri-apps/plugin-store';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { dragRegion } from '../lib/dragRegion.js';
  import { getTidyTheme } from '../lib/themes.js';
  import {
    UPDATE_NOTICE_STORE_KEY,
    UPDATE_NOTICE_DISMISSED_UNTIL,
    getTomorrowStart,
    shouldShowUpdateNotice,
  } from '../lib/updateNotice.js';

  const STORE_FILE = 'tidy-task-config.json';
  const ROLLING_THUNDER_URL = 'https://www.rollinthunder.net/';
  const ROLLING_THUNDER_GUIDE_URL = 'https://www.rollinthunder.net/guide';
  const ROLLING_THUNDER_COVER_URL = 'https://www.rollinthunder.net/images/og-cover.jpg';
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
  let dialogEl = $state(null);
  let isSaving = $state(false);
  let themeId = $state('amber');
  let isDarkMode = $state(false);
  let accent = $derived(
    isDarkMode
      ? getTidyTheme(themeId).tidy.accentDark
      : getTidyTheme(themeId).tidy.accent,
  );

  onMount(async () => {
    try {
      const store = new LazyStore(STORE_FILE);
      const hiddenUntil = await store.get(UPDATE_NOTICE_STORE_KEY);
      const mainSettings = await store.get('main');
      themeId = getTidyTheme(mainSettings?.themeColor).id;
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

  function handleKeydown(event) {
    if (!isVisible) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeNotice();
    }
  }

  async function openExternalUrl(url) {
    try {
      await openUrl(url);
    } catch (error) {
      console.warn('롤링썬더 링크를 열지 못했습니다:', error);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isVisible}
  <div
    class="update-notice-backdrop"
    class:is-dark={isDarkMode}
    oncontextmenu={(event) => event.stopPropagation()}
    role="presentation"
  >
    <div
      bind:this={dialogEl}
      class="update-notice"
      class:is-dark={isDarkMode}
      style={`--notice-accent: ${accent};`}
      role="dialog"
      aria-labelledby="update-notice-title"
      aria-describedby="update-notice-summary"
      tabindex="-1"
    >
      <div class="ambient ambient-one" aria-hidden="true"></div>
      <div class="ambient ambient-two" aria-hidden="true"></div>

      <div class="notice-window-bar" use:dragRegion>
        <div class="window-drag-label" aria-hidden="true">
          <GripHorizontal size={15} strokeWidth={2.4} />
          <span>Tidy Task 업데이트</span>
        </div>
        <div class="window-controls">
          <button type="button" onclick={minimizeNotice} aria-label="업데이트 공지 최소화" title="최소화">
            <Minus size={15} strokeWidth={2.4} />
          </button>
          <button type="button" class="top-close" onclick={closeNotice} aria-label="업데이트 공지 닫기" title="닫기">
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <div class="notice-scroll">
        <header class="notice-hero">
          <div class="release-mark" aria-hidden="true">
            <Sparkles size={20} strokeWidth={2.1} />
          </div>
          <div class="release-copy">
            <span class="eyebrow">MAJOR UPDATE · v5.0.0</span>
            <h2 id="update-notice-title">더 내 취향에 맞게,<br />더 안정적으로</h2>
            <p id="update-notice-summary">Tidy Task의 다섯 번째 큰 업데이트가 도착했어요.</p>
          </div>
        </header>

        <div class="theme-feature">
          <div class="feature-icon"><Palette size={17} strokeWidth={2.2} /></div>
          <div class="feature-copy">
            <span class="section-kicker">NEW THEMES</span>
            <h3>오늘의 기분에 맞는 15가지 테마</h3>
            <p>클래식·모던·페이퍼, 세 가지 무드로 Tidy Task를 새롭게 꾸며 보세요.</p>
            <div class="swatches" aria-label="새 테마 색상 미리보기">
              {#each THEME_SWATCHES as color}
                <span style:background-color={color}></span>
              {/each}
            </div>
          </div>
        </div>

        <section class="polish-section" aria-labelledby="polish-title">
          <span class="section-kicker">POLISHED</span>
          <h3 id="polish-title">작지만 신경 쓰이던 부분도 다듬었어요</h3>
          <ul>
            <li>
              <span class="check"><Check size={12} strokeWidth={3} /></span>
              <span><strong>Tiny Note 도구 자동 정리</strong> — 창이 좁아져도 버튼이 잘리지 않아요.</span>
            </li>
            <li>
              <span class="check"><Maximize2 size={11} strokeWidth={2.8} /></span>
              <span><strong>창 전환 안정화</strong> — 드래그·전체화면·크기 복원을 더 자연스럽게 고쳤어요.</span>
            </li>
          </ul>
        </section>

        <aside class="rolling-card" aria-labelledby="rolling-title">
          <div class="rolling-visual">
            <img
              src={ROLLING_THUNDER_COVER_URL}
              alt="형형색색의 칩들이 트랙을 달리는 롤링썬더 추첨 레이스"
              loading="lazy"
              onerror={(event) => { event.currentTarget.hidden = true; }}
            />
            <div class="rolling-visual-shade" aria-hidden="true"></div>
            <div class="rolling-brand">
              <span class="rolling-badge" aria-hidden="true">RT</span>
              <span>
                <small>ROLLING THUNDER</small>
                <strong>운명을 굴려라!</strong>
              </span>
            </div>
          </div>

          <div class="rolling-copy">
            <span class="section-kicker">찰떡쌤이 만든 또 다른 교실 도구</span>
            <h3 id="rolling-title">구경만 하는 추첨은 시시하니까</h3>
            <p class="rolling-lead">
              이름만 넣으면 칩들이 진짜 물리 법칙으로 구르고 부딪혀요.
              끝까지 순위를 알 수 없는 레이스라, 평범한 발표자 뽑기도 아이들이 함께 응원하는 순간이 됩니다.
            </p>

            <div class="rolling-features" aria-label="롤링썬더 주요 기능">
              <span><b>⚙</b> 물리 엔진 레이스</span>
              <span><b>🗺</b> 우리 반 맵 만들기</span>
              <span><b>✨</b> 칩 스킨·12가지 스킬</span>
              <span><b>◐</b> 교실 TV 차분한 모드</span>
            </div>

            <p class="rolling-use-case">
              <strong>발표자 · 모둠 · 자리 · 경품</strong>
              1등부터 꼴찌까지 전체 순위를 한 번에 뽑아 보세요.
            </p>

            <div class="rolling-actions">
              <button type="button" class="rolling-primary" onclick={() => openExternalUrl(ROLLING_THUNDER_URL)}>
                무료로 추첨 레이스 시작하기
                <ArrowUpRight size={14} strokeWidth={2.5} />
              </button>
              <button type="button" class="rolling-secondary" onclick={() => openExternalUrl(ROLLING_THUNDER_GUIDE_URL)}>
                교실 활용 아이디어 보기
              </button>
            </div>
          </div>
        </aside>
      </div>

      <footer class="notice-actions">
        <div class="snooze-actions">
          <button type="button" disabled={isSaving} onclick={() => hideUntil(getTomorrowStart())}>
            오늘 그만보기
          </button>
          <span aria-hidden="true"></span>
          <button type="button" disabled={isSaving} onclick={() => hideUntil(UPDATE_NOTICE_DISMISSED_UNTIL)}>
            더 이상 보지 않기
          </button>
        </div>
        <button type="button" class="primary-close" onclick={closeNotice}>닫기</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .update-notice-backdrop {
    position: fixed;
    inset: 0;
    z-index: 300000;
    display: grid;
    place-items: center;
    padding: 0;
    background: #fffdf8;
  }

  .update-notice-backdrop.is-dark {
    background: #20232c;
  }

  .update-notice {
    position: relative;
    width: 100%;
    height: 100%;
    max-height: none;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: #fffdf8;
    color: #28323c;
    box-shadow: none;
    outline: none;
    isolation: isolate;
  }

  .update-notice.is-dark {
    background: #20232c;
    color: #e7eaf0;
  }

  .notice-scroll {
    position: relative;
    z-index: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 15px 20px 16px;
    scrollbar-width: thin;
  }

  .notice-window-bar {
    position: relative;
    z-index: 4;
    height: 38px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 7px 4px 12px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.06);
    background: rgba(255, 253, 248, 0.92);
    color: #77808b;
    cursor: move;
    user-select: none;
  }

  .is-dark .notice-window-bar {
    border-bottom-color: rgba(255, 255, 255, 0.07);
    background: rgba(32, 35, 44, 0.94);
    color: #aab2be;
  }

  .window-drag-label,
  .window-controls {
    display: flex;
    align-items: center;
  }

  .window-drag-label {
    gap: 6px;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.02em;
    pointer-events: none;
  }

  .window-controls {
    gap: 2px;
  }

  .window-controls button {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    transition: transform 120ms ease, background-color 120ms ease, color 120ms ease;
  }

  .window-controls button:hover,
  .window-controls button:focus-visible {
    background: rgba(15, 23, 42, 0.07);
    color: #374151;
    outline: none;
  }

  .is-dark .window-controls button:hover,
  .is-dark .window-controls button:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    color: #f3f4f6;
  }

  .top-close:hover,
  .top-close:focus-visible {
    background: rgba(239, 68, 68, 0.12);
    color: #dc2626;
  }

  .window-controls button:active {
    transform: scale(0.92);
  }

  .notice-hero {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding-right: 24px;
    margin-bottom: 16px;
  }

  .release-mark {
    width: 42px;
    height: 42px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 14px;
    background: color-mix(in srgb, var(--notice-accent) 14%, #fff);
    color: var(--notice-accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--notice-accent) 18%, transparent);
  }

  .is-dark .release-mark {
    background: color-mix(in srgb, var(--notice-accent) 16%, #20232c);
  }

  .release-copy {
    min-width: 0;
  }

  .eyebrow,
  .section-kicker {
    display: block;
    color: var(--notice-accent);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.12em;
    line-height: 1.3;
  }

  .notice-hero h2 {
    margin: 4px 0 5px;
    font-size: clamp(20px, 7vw, 26px);
    font-weight: 900;
    letter-spacing: -0.045em;
    line-height: 1.17;
    color: #252b33;
  }

  .is-dark .notice-hero h2 {
    color: #f7f8fa;
  }

  .notice-hero p,
  .theme-feature p,
  .rolling-card p {
    margin: 0;
    font-size: 10.5px;
    line-height: 1.55;
    color: #68727e;
  }

  .is-dark .notice-hero p,
  .is-dark .theme-feature p,
  .is-dark .rolling-card p {
    color: #aeb6c2;
  }

  .theme-feature {
    display: flex;
    gap: 11px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--notice-accent) 16%, transparent);
    border-radius: 16px;
    background: color-mix(in srgb, var(--notice-accent) 6%, #fffaf0);
  }

  .is-dark .theme-feature {
    background: color-mix(in srgb, var(--notice-accent) 7%, #252932);
  }

  .feature-icon {
    width: 31px;
    height: 31px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: var(--notice-accent);
    color: #fff;
    box-shadow: 0 5px 12px color-mix(in srgb, var(--notice-accent) 28%, transparent);
  }

  .feature-copy {
    min-width: 0;
  }

  .theme-feature h3,
  .polish-section h3,
  .rolling-card h3 {
    margin: 3px 0 4px;
    color: inherit;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1.35;
  }

  .swatches {
    display: flex;
    align-items: center;
    margin-top: 9px;
  }

  .swatches span {
    width: 19px;
    height: 19px;
    margin-left: -3px;
    border: 2px solid #fffdf8;
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
  }

  .swatches span:first-child {
    margin-left: 0;
  }

  .is-dark .swatches span {
    border-color: #252932;
  }

  .polish-section {
    padding: 15px 2px 13px;
  }

  .polish-section ul {
    display: grid;
    gap: 7px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .polish-section li {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    color: #616b76;
    font-size: 10px;
    line-height: 1.48;
  }

  .is-dark .polish-section li {
    color: #b5bdc8;
  }

  .polish-section strong {
    color: #323a43;
  }

  .is-dark .polish-section strong {
    color: #e9ecf1;
  }

  .check {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    margin-top: 1px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--notice-accent) 12%, transparent);
    color: var(--notice-accent);
  }

  .rolling-card {
    overflow: hidden;
    border: 1px solid rgba(13, 148, 136, 0.2);
    border-radius: 18px;
    background: #f7fffd;
    box-shadow: 0 10px 28px rgba(15, 118, 110, 0.1);
  }

  .is-dark .rolling-card {
    border-color: rgba(45, 212, 191, 0.22);
    background: #171d27;
  }

  .rolling-visual {
    position: relative;
    width: 100%;
    aspect-ratio: 1200 / 630;
    overflow: hidden;
    background:
      radial-gradient(circle at 25% 35%, rgba(45, 212, 191, 0.35), transparent 22%),
      linear-gradient(135deg, #07111f, #10283a);
  }

  .rolling-visual img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    object-position: center;
    transition: transform 420ms cubic-bezier(0.2, 0, 0, 1);
  }

  .rolling-card:hover .rolling-visual img {
    transform: scale(1.025);
  }

  .rolling-visual-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(3, 10, 20, 0.02) 35%, rgba(3, 10, 20, 0.82) 100%);
    pointer-events: none;
  }

  .rolling-brand {
    position: absolute;
    left: 13px;
    bottom: 11px;
    display: flex;
    align-items: center;
    gap: 9px;
    color: #fff;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  }

  .rolling-brand > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .rolling-brand small {
    color: #67e8f9;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 0.12em;
  }

  .rolling-brand strong {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: -0.03em;
  }

  .rolling-badge {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 11px;
    background: linear-gradient(135deg, #14b8a6, #2563eb 58%, #e11d48);
    color: #fff;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: -0.04em;
    box-shadow: 0 7px 18px rgba(20, 184, 166, 0.3);
  }

  .rolling-copy {
    padding: 14px;
  }

  .rolling-card .section-kicker {
    color: #0f766e;
  }

  .is-dark .rolling-card .section-kicker {
    color: #5eead4;
  }

  .rolling-card h3 {
    margin-top: 4px;
    font-size: 15px;
  }

  .rolling-lead {
    margin-top: 5px !important;
    color: #52616c !important;
    font-size: 10px !important;
    line-height: 1.65 !important;
  }

  .is-dark .rolling-lead {
    color: #b7c2ce !important;
  }

  .rolling-features {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 11px;
  }

  .rolling-features span {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 8px;
    border: 1px solid rgba(15, 118, 110, 0.12);
    border-radius: 10px;
    background: rgba(15, 118, 110, 0.055);
    color: #34444f;
    font-size: 8.8px;
    font-weight: 800;
    line-height: 1.25;
  }

  .rolling-features b {
    color: #0f766e;
    font-size: 11px;
    line-height: 1;
  }

  .is-dark .rolling-features span {
    border-color: rgba(94, 234, 212, 0.13);
    background: rgba(45, 212, 191, 0.07);
    color: #cbd5df;
  }

  .rolling-use-case {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 11px 0 0 !important;
    padding: 9px 10px;
    border-left: 3px solid #14b8a6;
    border-radius: 0 9px 9px 0;
    background: rgba(20, 184, 166, 0.06);
    color: #64717c !important;
    font-size: 9px !important;
    line-height: 1.4 !important;
  }

  .rolling-use-case strong {
    color: #263842;
    font-size: 9.5px;
  }

  .is-dark .rolling-use-case {
    color: #aeb9c5 !important;
  }

  .is-dark .rolling-use-case strong {
    color: #e6edf4;
  }

  .rolling-actions {
    display: grid;
    gap: 6px;
    margin-top: 11px;
  }

  .rolling-actions button {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border-radius: 11px;
    font: inherit;
    font-size: 9.5px;
    font-weight: 900;
    cursor: pointer;
    transition: transform 130ms ease, filter 130ms ease, background-color 130ms ease;
  }

  .rolling-actions button:active {
    transform: scale(0.985);
  }

  .rolling-primary {
    border: 0;
    background: linear-gradient(100deg, #0f766e, #0d9488 55%, #2563eb);
    color: #fff;
    box-shadow: 0 7px 16px rgba(15, 118, 110, 0.2);
  }

  .rolling-primary:hover,
  .rolling-primary:focus-visible {
    filter: brightness(1.08);
    outline: 2px solid rgba(20, 184, 166, 0.32);
    outline-offset: 2px;
  }

  .rolling-secondary {
    border: 1px solid rgba(15, 118, 110, 0.18);
    background: transparent;
    color: #0f766e;
  }

  .rolling-secondary:hover,
  .rolling-secondary:focus-visible {
    background: rgba(15, 118, 110, 0.07);
    outline: none;
  }

  .is-dark .rolling-secondary {
    border-color: rgba(94, 234, 212, 0.18);
    color: #5eead4;
  }

  .notice-actions {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    padding: 10px 14px 13px;
    border-top: 1px solid rgba(15, 23, 42, 0.07);
    background: rgba(255, 253, 248, 0.96);
    backdrop-filter: blur(10px);
  }

  .is-dark .notice-actions {
    border-top-color: rgba(255, 255, 255, 0.07);
    background: rgba(32, 35, 44, 0.96);
  }

  .snooze-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .snooze-actions span {
    width: 1px;
    height: 10px;
    background: rgba(100, 116, 139, 0.25);
  }

  .snooze-actions button {
    padding: 2px;
    border: 0;
    background: transparent;
    color: #707986;
    font: inherit;
    font-size: 9.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .is-dark .snooze-actions button {
    color: #aab2be;
  }

  .snooze-actions button:hover,
  .snooze-actions button:focus-visible {
    color: var(--notice-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
    outline: none;
  }

  .snooze-actions button:disabled {
    opacity: 0.45;
    cursor: wait;
  }

  .primary-close {
    width: 100%;
    min-height: 36px;
    border: 0;
    border-radius: 12px;
    background: var(--notice-accent);
    color: #fff;
    font: inherit;
    font-size: 11px;
    font-weight: 900;
    box-shadow: 0 7px 16px color-mix(in srgb, var(--notice-accent) 24%, transparent);
    cursor: pointer;
    transition: transform 130ms ease, filter 130ms ease, box-shadow 180ms ease;
  }

  .primary-close:hover,
  .primary-close:focus-visible {
    filter: brightness(1.06);
    box-shadow: 0 9px 19px color-mix(in srgb, var(--notice-accent) 32%, transparent);
    outline: 2px solid color-mix(in srgb, var(--notice-accent) 42%, transparent);
    outline-offset: 2px;
  }

  .primary-close:active {
    transform: scale(0.985);
  }

  .ambient {
    position: absolute;
    z-index: 0;
    border-radius: 999px;
    pointer-events: none;
    filter: blur(1px);
    opacity: 0.5;
  }

  .ambient-one {
    width: 120px;
    height: 120px;
    top: -62px;
    left: -35px;
    background: color-mix(in srgb, var(--notice-accent) 18%, transparent);
    animation: ambient-float 7s ease-in-out infinite alternate;
  }

  .ambient-two {
    width: 85px;
    height: 85px;
    right: -40px;
    top: 110px;
    background: rgba(244, 114, 182, 0.1);
    animation: ambient-float 8.5s ease-in-out 500ms infinite alternate-reverse;
  }

  @keyframes ambient-float {
    from { transform: translate3d(0, 0, 0) scale(1); }
    to { transform: translate3d(7px, 10px, 0) scale(1.06); }
  }

  @media (max-width: 290px) {
    .update-notice-backdrop {
      padding: 0;
    }

    .notice-scroll {
      padding: 18px 14px 13px;
    }

    .release-mark {
      display: none;
    }

    .theme-feature {
      padding: 11px;
    }

    .feature-icon {
      display: none;
    }

    .rolling-features {
      grid-template-columns: 1fr;
    }

    .snooze-actions {
      gap: 5px;
    }

    .snooze-actions button {
      font-size: 9px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ambient {
      animation: none;
    }

    .top-close,
    .window-controls button,
    .primary-close,
    .rolling-actions button,
    .rolling-visual img {
      transition: none;
    }

    .rolling-card:hover .rolling-visual img {
      transform: none;
    }
  }
</style>
