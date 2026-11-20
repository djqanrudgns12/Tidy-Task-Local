<script>
  // [개발 전용] 다중 선택 [아카이브] 드롭다운 검수 화면 — `?bulk-archive-preview`
  // 실제 도크(BulkSelectDock)와 실제 드롭다운(BulkArchiveMenu)을 씁니다. 브라우저 창 하나 = 메모 창 하나로 보고,
  // 창 크기(가로·세로)는 브라우저 크기로, 머리 영역 높이는 &head=<px>로 흉내 냅니다(남은 높이 → L/M/S·위로 열기 확인).
  //   &theme=<id> &dark &pt=<화면 글자 6~15> &n=<고른 개수> &head=<px> &open(열린 채 시작) &font=<글꼴 이름>
  // 저장소·IPC를 건드리지 않습니다. 고른 동작은 아래 기록 줄에만 남습니다.
  import { onMount, tick } from 'svelte';
  import BulkSelectDock from '../components/todo/BulkSelectDock.svelte';
  import BulkArchiveMenu from '../components/todo/BulkArchiveMenu.svelte';
  import { getTidyTheme } from '../lib/themes.js';
  import { resolveFontFamilyStack } from '../lib/fonts/fontCatalog.js';
  import { describeArchiveResult } from '../lib/todos/bulkActions.js';
  import { resolveTodoBadgeMetrics } from '../lib/todos/todoBadgeMetrics.js';

  const params = new URLSearchParams(location.search);
  const themeColor = getTidyTheme(params.get('theme') || 'amber')?.id ?? 'amber';
  const dark = params.has('dark') && params.get('dark') !== '0';
  const pt = Math.min(15, Math.max(6, Number(params.get('pt')) || 10));
  const count = Math.max(1, Number(params.get('n')) || 3);
  const head = Math.max(0, Number(params.get('head') ?? 150));
  const fontName = params.get('font') || '메이플스토리 L';
  const theme = (getTidyTheme(themeColor) ?? getTidyTheme('amber'))?.tidy ?? { bg: '#fdfaf3', section: '#f4ebce' };
  const tb = resolveTodoBadgeMetrics(pt);

  // App.svelte의 applyCSSVars와 같은 값(화면 글자 크기·글꼴)을 문서에 겁니다.
  const root = document.documentElement;
  root.style.fontSize = `${pt}pt`;
  root.style.setProperty('--ui-font-family', resolveFontFamilyStack(fontName));
  root.style.setProperty('--ui-font-scale', String(pt / 10));
  root.style.setProperty('--tb-h', `${tb.heightPx}px`);
  root.style.setProperty('--tb-fs', `${tb.fontSizePx}px`);
  root.style.setProperty('--tb-radius', `${tb.radiusPx}px`);
  root.style.setProperty('--tb-date-base-w', `${tb.slotWidthPx}px`);
  document.body.style.margin = '0';
  document.body.style.fontFamily = resolveFontFamilyStack(fontName);
  document.body.style.background = dark ? '#23272e' : theme.bg;
  document.body.style.color = dark ? '#e2e8f0' : '#1f2937';

  const todos = [
    { text: '수학 퍼즐 페스티벌 아카이빙(패들렛)', date: '11/23(월)' },
    { text: 'AI 분야 동아리 운영일지 및 강사비 기안', date: '11/25(수)' },
    { text: '학습종합클리닉 운영일지 제출', date: '12/1(화)' },
    { text: '기초학력 강사비 품의 기안', date: '12/9(수)' },
  ];

  /** @type {{ anchor: HTMLElement, rail: HTMLElement | null } | null} */
  let menu = $state(null);
  let log = $state('아직 고르지 않았어요');

  /** @param {MouseEvent & { currentTarget: HTMLElement }} event */
  function toggle(event) {
    if (menu) { menu = null; return; }
    const anchor = event.currentTarget;
    menu = { anchor, rail: anchor.closest('[data-bulk-dock]') };
  }
  /** @param {boolean} returnFocus */
  function close(returnFocus) {
    const anchor = menu?.anchor;
    menu = null;
    if (returnFocus) anchor?.focus();
  }
  /** @param {'copy' | 'move'} mode */
  function choose(mode) {
    close(false);
    log = describeArchiveResult(count, true, mode);
  }

  onMount(async () => {
    if (!params.has('open')) return;
    await tick();
    await document.fonts.ready;
    /** @type {HTMLElement | null} */ (document.querySelector('[data-bulk-archive-btn]'))?.click();
  });
</script>

<svelte:head><title>아카이브 드롭다운 검수</title></svelte:head>

<div class="pv-head" style="height: {head}px; background: {dark ? '#2b3039' : theme.section};" data-preview-head>
  <span>Tidy Task · 머리 영역 {head}px</span>
</div>

<BulkSelectDock
  sortOrder="asc"
  totalCount={todos.length}
  visibleSelectedCount={Math.min(count, todos.length)}
  selectedCount={count}
  {themeColor}
  {dark}
  globalFontSizePt={10}
  uiFontSizePt={pt}
  fontFamily={fontName}
  uiFontFamily={fontName}
  archiveMenuOpen={menu !== null}
  onToggleAll={() => {}}
  onToggleSort={() => {}}
  onArchive={toggle}
  onDdayPointerDown={() => {}}
  onDdayClick={() => {}}
  onComplete={() => {}}
  onDelete={() => {}}
/>

<div class="memo-body pv-list">
  {#each todos as todo, i (todo.text)}
    <div class="pv-row">
      <span class="pv-chk" class:on={i < count}></span>
      <button type="button" class="pv-badge" data-todo-deadline-btn>{todo.date}</button>
      <span class="pv-text">{todo.text}</span>
    </div>
  {/each}
</div>

<p class="pv-log" data-preview-log>고른 동작: {log}</p>

<BulkArchiveMenu
  open={menu !== null}
  {count}
  anchor={menu?.anchor ?? null}
  rail={menu?.rail ?? null}
  {themeColor}
  {dark}
  uiFontSizePt={pt}
  onchoose={choose}
  onclose={close}
/>

<style>
  .pv-head {
    display: flex;
    align-items: flex-end;
    padding: 0 12px 6px;
    box-sizing: border-box;
    font-size: 11px;
    opacity: 0.8;
  }
  .pv-list { padding: 4px 10px; }
  .pv-row { display: flex; align-items: center; gap: 8px; padding: 6px 5px; border-bottom: 1px dashed rgba(148, 163, 184, 0.4); font-size: 10pt; }
  .pv-chk { width: 14px; height: 14px; border-radius: 5px; border: 1.5px solid #94a3b8; flex: none; }
  .pv-chk.on { background: #d97706; border-color: #d97706; }
  .pv-badge {
    display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; flex: none;
    width: var(--tb-date-base-w, 64px); height: var(--tb-h, 22px); padding: 0 4px;
    border: 1px solid #f8cab1; border-radius: var(--tb-radius, 999px);
    background: #fcebe2; color: #b43e0f;
    box-shadow: inset 0 -1.5px 0 #f8d6c2, inset 0 1px 0 rgba(255, 255, 255, 0.6);
    font-family: var(--ui-font-family); font-size: var(--tb-fs, 10.5px); font-weight: 800; line-height: 1;
    font-variant-numeric: tabular-nums; letter-spacing: -0.025em;
  }
  .pv-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .pv-log { margin: 8px 12px; font-size: 11px; opacity: 0.8; }
</style>
