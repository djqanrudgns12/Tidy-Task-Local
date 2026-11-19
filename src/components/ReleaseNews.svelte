<script lang="ts">
  // 6.0.0 새 소식 창 (release-news). 지난 공지(5.6.3 소식 · 지난 업데이트 · 롤링 썬더)는 사용자 요청으로 모두 내렸습니다.
  // 처음 설정(initial-setup 창)은 이 창과 별개라 그대로이며, 새 사용자는 설정을 마친 뒤 이 창을 봅니다.
  // 글자 크기는 "본문 14px · 작은 글 12px 이상"을 지킵니다(이전 공지의 9~11px 글자가 읽기 어렵다는 의견).
  import { onMount, tick } from 'svelte';
  import { X, ArrowUpRight, BookOpen, ZoomIn, Check, GripHorizontal, Sparkles, LayoutGrid, Play, Smartphone, ShieldCheck, CalendarHeart, ListChecks, UsersRound, Type, MousePointerClick, Timer } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { LazyStore } from '@tauri-apps/plugin-store';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { dragRegion } from '../lib/dragRegion.js';
  import { RELEASE_NEWS_ID, RELEASE_NEWS_KEY, DISMISSED_FOREVER, tomorrowStart } from '../lib/releaseNews.js';
  import './release-news.css';
  import ToolIcon from './toolkit/ToolIcon.svelte';
  import { TOOL_REGISTRY, TIMER_TOOLS, SCOREBOARD_TOOLS, PICKER_TOOLS } from '../lib/toolkit/registry.js';

  let { preview = false } = $props<{ preview?: boolean }>();
  let tab = $state(0), busy = $state(false), closed = $state(false), error = $state('');
  let enlarged = $state<{src:string;title:string} | null>(null);
  let scroller: HTMLElement | undefined = $state();
  let lightbox: HTMLDialogElement | undefined = $state();
  let dialog: HTMLDivElement | undefined = $state();
  let previousFocus: HTMLElement | null = null;
  const base = '/images/update-6.0/';
  // 화면의 버전 글자는 공지 ID 하나에서 만듭니다. 다음에 공지를 올릴 때 한 곳만 고치면 되게.
  const version = RELEASE_NEWS_ID.replace(/^v/, '');
  const major = version.split('.').slice(0, 2).join('.');
  const tabs = [`${major} 새 소식`, '툴킷 전체'];

  type Shot = { file: string; title: string; alt: string; tall?: boolean };
  type Feature = {
    id: string; badge: 'NEW' | '새 단장'; tone: string; icon: typeof Sparkles; chip: string;
    title: string; lead: string; points: { b: string; t: string }[];
    where: string; layout: 'side' | 'wide' | 'pair'; shots: Shot[];
  };
  // 사진은 모두 개발 미리보기에서 찍은 실제 화면입니다(scripts/capture-release-6.0.mjs). 이름·일정은 예시입니다.
  const features: Feature[] = [
    {
      id: 'dday', badge: 'NEW', tone: 'peach', icon: CalendarHeart, chip: 'D-Day',
      title: '다가오는 날, 한눈에 D-Day',
      lead: '할 일에 D-Day를 달면 메모 창 위 배너와 바탕화면 위젯에 남은 날이 보여요.',
      points: [
        { b: '할 일과 바로 연결', t: '할 일을 우클릭해 D-Day로 만들 수 있어요.' },
        { b: '한곳에서 관리', t: 'D-Day 컨트롤에서 할 일 · 배너 · 위젯 표시를 골라요.' },
        { b: '귀여운 꾸미기', t: '파스텔 스티커 21종과 위젯 모양 두 가지.' },
      ],
      where: '메모 창 툴바의 D-Day 단추 · 툴킷의 D-Day 위젯', layout: 'side',
      shots: [
        { file: 'dday-control', title: 'D-Day 컨트롤', alt: '할 일 연동 D-Day 목록과 상단 배너 설정이 보이는 D-Day 컨트롤 창', tall: true },
        { file: 'dday-widget-w4', title: 'D-Day 위젯 · 모눈', alt: '모눈 바탕에 D-5가 크게 보이는 D-Day 위젯' },
        { file: 'dday-widget-w1', title: 'D-Day 위젯 · 달력', alt: '탁상 달력 모양의 D-Day 위젯' },
      ],
    },
    {
      id: 'todo', badge: '새 단장', tone: 'mint', icon: ListChecks, chip: '할 일 정리',
      title: '할 일 정리가 손에 착',
      lead: '줄 오른쪽의 빈자리를 없애 글이 끝까지 보이고, 순서 바꾸기와 지우기가 쉬워졌어요.',
      points: [
        { b: '끌어서 순서 바꾸기', t: '완료 단추나 날짜를 잡고 위아래로 끌어요.' },
        { b: '지우개로 쓱', t: '줄에 마우스를 올리면 지우개 단추가 나타나요.' },
        { b: '6초 안에 되돌리기', t: '잘못 지워도 지운 것만 제자리로 돌아와요.' },
      ],
      where: '모든 메모 창의 할 일 · 마감된 일 목록', layout: 'side',
      shots: [{ file: 'todo-undo', title: '할 일 지우기와 되돌리기', alt: '할 일을 지운 뒤 휴지통 친구와 되돌리기 단추가 뜬 메모 창', tall: true }],
    },
    {
      id: 'group', badge: 'NEW', tone: 'lavender', icon: UsersRound, chip: '모둠원 뽑기',
      title: '모둠 나누기가 작은 공연처럼',
      lead: '학급 명단이나 직접 입력한 이름으로 모둠을 정해요. 모둠 수와 인원은 알아서 추천해 줘요.',
      points: [
        { b: '세 가지 무대', t: '모둠 열차 · 빙하 갈라지기 · 엘리베이터 중에 골라요.' },
        { b: '결석 · 조건 설정', t: '오늘 빠진 친구는 빼고, 떨어뜨릴 친구 · 남녀 균형 같은 조건을 정해요.' },
        { b: '실시간 현황판', t: '뽑히는 대로 오른쪽 모둠 칸이 채워져요.' },
      ],
      where: '툴킷 → 간단 뽑기 → 모둠원 뽑기', layout: 'wide',
      shots: [
        { file: 'group-train', title: '모둠 열차', alt: '햇살역 승강장에 학생들이 줄 선 모둠 열차 무대' },
        { file: 'group-glacier', title: '빙하 갈라지기', alt: '북극 빙하 위에 학생 이름표가 놓인 빙하 갈라지기 무대' },
        { file: 'group-elevator', title: '엘리베이터', alt: '분홍 엘리베이터 앞에 학생들이 기다리는 엘리베이터 무대' },
      ],
    },
    {
      id: 'font', badge: '새 단장', tone: 'butter', icon: Type, chip: '글꼴 72종',
      title: '글꼴 72종, 고르기도 쉽게',
      lead: '새 글꼴 24종이 더해졌어요. 길게 늘어선 목록 대신 묶음별로 보고, 굵기도 바로 골라요.',
      points: [
        { b: '묶음별 탭', t: '포인트 · 고딕 · 명조 · 손글씨 · 학교 · 기본.' },
        { b: '굵기는 옆 알약에서', t: '누르기 전에 글꼴 모양을 미리 볼 수 있어요.' },
        { b: '어디서나 같은 창', t: '메모 · Tiny Note · 알림장 · 설정에서 똑같이 열려요.' },
      ],
      where: '서식 툴바의 글꼴 단추 · 설정 → 글자', layout: 'side',
      shots: [{ file: 'font-picker', title: '새 글꼴 고르기 창', alt: '포인트와 고딕 묶음, 굵기 알약이 보이는 글꼴 고르기 창', tall: true }],
    },
    {
      id: 'menu', badge: '새 단장', tone: 'sky', icon: MousePointerClick, chip: '우클릭 메뉴',
      title: '우클릭 한 번이면 충분해요',
      lead: '자주 쓰는 일을 큰 단추로 모은 작은 주머니 메뉴로 바뀌었어요.',
      points: [
        { b: '할 일 우클릭', t: 'D-Day · 마감일 · 완료 · 삭제를 한 번에.' },
        { b: 'D-Day 배너 우클릭', t: '표시할 곳과 배너 모양을 바로 바꿔요.' },
        { b: '서식은 바로 보이게', t: '글자를 고른 채 서식을 바꾸면 그 자리에서 반영돼요.' },
      ],
      where: '할 일 · 메모 · Tiny Note · D-Day 배너에서 오른쪽 클릭', layout: 'pair',
      shots: [
        { file: 'ctx-todo', title: '할 일 우클릭', alt: 'D-Day · 마감일 · 완료 · 삭제 단추가 있는 할 일 우클릭 메뉴' },
        { file: 'ctx-dday', title: 'D-Day 배너 우클릭', alt: '표시 위치와 배너 모양을 고르는 D-Day 배너 우클릭 메뉴' },
      ],
    },
    {
      id: 'timer', badge: '새 단장', tone: 'sage', icon: Timer, chip: '타이머',
      title: '멀리서도 또렷한 타이머',
      lead: '창 크기에 맞춰 숫자와 제목 크기가 저절로 맞춰져요. 교실 뒤에서도 잘 보여요.',
      points: [
        { b: '글자 크기 자동', t: '제목 · 설명 크기는 작게부터 더 크게까지 직접 골라도 돼요.' },
        { b: '위젯 모드', t: '작은 창으로 띄워 수업 화면 옆에 두어요.' },
        { b: '설정은 함께', t: '글자와 화면 설정은 타이머 네 가지에 똑같이 적용돼요.' },
      ],
      where: '툴킷 → 타이머', layout: 'wide',
      shots: [{ file: 'timer', title: '전광판 타이머', alt: '큰 05:00 숫자와 글자 크기 설정이 보이는 전광판 타이머' }],
    },
  ];
  const extras = [
    { b: '설정 창 새 단장', t: '모양 · 글자 · 동작 · 관리 네 칸으로 나눠 찾기 쉬워졌어요.' },
    { b: '메모 칸 높이 안정', t: '창 크기를 바꿔도 메모 칸이 흔들리거나 사라지지 않아요.' },
    { b: '작은 오류 수정', t: '띄어쓰기 없는 긴 글이 큰 빈칸을 남기던 줄바꿈, D-Day 위젯 단추 등을 고쳤어요.' },
  ];

  // ── 툴킷 전체 탭 ── 도구 수는 등록부(registry)에서 세어 글과 숫자가 어긋나지 않게 합니다.
  const toolGroups = [
    { title: '시간과 집중', ids: ['timer', 'clock', 'focus-bell'] },
    { title: '뽑기와 놀이', ids: ['picker', 'tournament', 'dice'] },
    { title: '학급 운영', ids: ['noticeboard', 'roster', 'seating', 'dday'] },
    { title: '참여와 성장', ids: ['vote', 'scoreboard', 'thermometer'] },
  ];
  const toolCopy: Record<string, string> = {
    timer: '디지털 · 아날로그 · 모래시계 · 스톱워치로 활동 시간을 정해요.',
    clock: '디지털과 아날로그로 교실에 지금 시각을 보여 줘요.',
    'focus-bell': '종소리로 활동의 시작을 알리고 주의를 모아요.',
    picker: '한 명 뽑기와 모둠원 뽑기로 발표자도 모둠도 정해요.',
    tournament: '대진표를 따라 후보를 고르며 최종 우승을 정해요.',
    dice: '여러 주사위를 굴리고 결과를 함께 확인해요.',
    noticeboard: '안내할 내용을 큰 글씨로 써서 교실에 띄워요.',
    roster: '학생 명단을 관리하고 다른 도구에서 함께 써요.',
    seating: '학급 명단과 배치 조건으로 자리를 정하고 저장해요.',
    dday: '다가오는 날을 바탕화면 위젯으로 늘 보이게 해요.',
    vote: '선거 · 의견 · 찬반 투표를 하고 개표와 결과를 즐겨요.',
    scoreboard: '개인 · 모둠 · 직접 만든 항목의 점수를 기록해요.',
    thermometer: '학급 목표와 보상, 도장판으로 성장을 함께 봐요.',
  };

  const draggable = (node: HTMLElement) => preview ? { destroy() {} } : dragRegion(node);
  onMount(() => { dialog?.focus(); });

  async function select(index: number, focus = false) {
    tab = index; error = ''; scroller?.scrollTo({ top: 0 });
    await tick();
    if (focus) document.getElementById(`news-tab-${index}`)?.focus();
  }
  function tabKey(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    void select(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tab + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true);
  }
  // 한눈에 보기 칩: 창 안 스크롤 상자만 움직입니다(창 전체가 밀리지 않게).
  function jump(id: string) {
    const target = document.getElementById(`rn-${id}`);
    if (!target || !scroller) return;
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
    scroller.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  }
  async function close() {
    if (busy) return;
    try { if (preview) closed = true; else await getCurrentWindow().close(); }
    catch { error = '창을 닫지 못했어요. 다시 시도해 주세요.'; }
  }
  async function dismiss(until: number) {
    if (busy) return;
    busy = true; error = '';
    try {
      if (preview) localStorage.setItem(RELEASE_NEWS_KEY, String(until));
      else { const store = new LazyStore('tidy-task-config.json'); await store.set(RELEASE_NEWS_KEY, until); await store.save(); }
      busy = false; await close();
    } catch { error = '숨김 설정을 저장하지 못했어요. 다시 시도하거나 닫기를 눌러 주세요.'; }
    finally { busy = false; }
  }
  async function zoom(src: string, title: string) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    enlarged = { src, title }; await tick(); lightbox?.showModal();
  }
  function unzoom() { lightbox?.close(); enlarged = null; previousFocus?.focus(); }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !enlarged) { event.preventDefault(); void close(); }
  }
  async function launch() {
    if (busy) return; busy = true; error = '';
    try {
      if (preview) { window.open('/?toolkit-preview=toolkit', '_blank', 'noopener'); return; }
      const { setEnabled } = await import('../lib/toolkit/store.js');
      const { openTool } = await import('../lib/toolkit/windows.js');
      await setEnabled(true); await openTool('toolkit');
    } catch { error = '툴킷을 열지 못했어요. 다시 시도해 주세요.'; }
    finally { busy = false; }
  }
  async function guide(anchor = 'start') {
    error = '';
    try {
      if (preview) { window.open(`/help.html#${anchor}`, '_blank', 'noopener'); return; }
      const existing = await WebviewWindow.getByLabel('help');
      if (existing) { await existing.unminimize(); await existing.show(); await existing.setFocus(); return; }
      const win = new WebviewWindow('help', { url: `help.html#${anchor}`, title: 'Tidy Task 사용 가이드', width: 920, height: 800, center: true, resizable: true });
      await win.once('tauri://error', () => { error = '사용 가이드를 열지 못했어요. 다시 시도해 주세요.'; });
    } catch { error = '사용 가이드를 열지 못했어요. 다시 시도해 주세요.'; }
  }
  async function external(url: string) {
    error = '';
    try { if (preview) window.open(url, '_blank', 'noopener'); else await openUrl(url); }
    catch { error = '사이트를 열지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'; }
  }
</script>

{#snippet photo(shot: Shot, tone: string, eager = false)}
  <button class={`rn-shot ${tone}`} class:rn-shot-tall={shot.tall} aria-label={`${shot.title} 실제 화면 크게 보기`} onclick={() => zoom(`${base}${shot.file}.webp`, shot.title)}>
    <img src={`${base}${shot.file}.webp`} alt={`${shot.alt}. 예시 자료로 찍은 실제 앱 화면.`} loading={eager ? 'eager' : 'lazy'}/>
    <span class="rn-shot-zoom" aria-hidden="true"><ZoomIn size={14}/></span>
  </button>
{/snippet}

<svelte:window onkeydown={keydown}/>
{#if !closed}
<div class="release-news" role="dialog" aria-labelledby="news-window-title" tabindex="-1" bind:this={dialog}>
  <header class="rn-chrome" use:draggable>
    <span id="news-window-title"><GripHorizontal size={15}/><b>Tidy Task</b><span class="rn-chrome-divider"></span>새로운 소식</span>
    <div><span class="rn-version">{RELEASE_NEWS_ID}</span><button class="rn-icon-button" aria-label="닫기" disabled={busy} onclick={close}><X size={20}/></button></div>
  </header>
  <div class="rn-tabs" role="tablist" aria-label="새로운 소식 분류">
    {#each tabs as label, i}<button id={`news-tab-${i}`} role="tab" aria-selected={tab === i} aria-controls="news-panel" tabindex={tab === i ? 0 : -1} onclick={() => select(i)} onkeydown={tabKey}>
      {#if i === 0}<Sparkles size={17}/>{:else}<LayoutGrid size={17}/>{/if}{label}{#if i === 0}<span class="rn-new">NEW</span>{/if}
    </button>{/each}
  </div>
  <div class="rn-scroll" id="news-panel" role="tabpanel" aria-labelledby={`news-tab-${tab}`} tabindex="0" bind:this={scroller}>
  {#key tab}
  <div class="rn-page">
    {#if tab === 0}
      <section class="rn-hero" aria-labelledby="rn-hero-title">
        <div class="rn-hero-copy">
          <span class="rn-hero-kicker"><span class="rn-sticker">v{version}</span>큰 업데이트가 도착했어요</span>
          <h1 id="rn-hero-title">더 귀엽고,<br/>더 손에 착 붙게.</h1>
          <p>D-Day부터 모둠원 뽑기까지, {major}에서 달라진 점을 모았어요.</p>
        </div>
        <img class="rn-hero-mascot" src="/chaltteok.webp" alt=""/>
        <p class="rn-safe"><ShieldCheck size={17}/><span>지금까지 쓰신 할 일 · 메모 · 툴킷 자료는 <b>그대로</b> 남아 있어요.</span></p>
      </section>

      <nav class="rn-glance" aria-label="한눈에 보기">
        <span class="rn-glance-title">한눈에 보기</span>
        <div>{#each features as f}{@const Icon = f.icon}<button class={`rn-chip ${f.tone}`} onclick={() => jump(f.id)}><Icon size={15}/>{f.chip}{#if f.badge === 'NEW'}<i>NEW</i>{/if}</button>{/each}</div>
      </nav>

      {#each features as f, fi}
        {@const Icon = f.icon}
        <article class={`rn-card ${f.tone} rn-${f.layout}`} id={`rn-${f.id}`} tabindex="-1" aria-labelledby={`rn-${f.id}-title`}>
          <span class="rn-tab-label"><span class="rn-badge" class:rn-badge-new={f.badge === 'NEW'}>{f.badge}</span>{String(fi + 1).padStart(2, '0')}</span>
          <div class="rn-card-head">
            <span class="rn-card-icon" aria-hidden="true"><Icon size={22}/></span>
            <div><h2 id={`rn-${f.id}-title`}>{f.title}</h2><p class="rn-lead">{f.lead}</p></div>
          </div>
          <div class="rn-card-body">
            <ul class="rn-points">{#each f.points as p}<li><span class="rn-check" aria-hidden="true"><Check size={13} strokeWidth={3}/></span><span><b>{p.b}</b>{p.t}</span></li>{/each}</ul>
            {#if f.layout === 'side'}
              <div class="rn-shots-side">{@render photo(f.shots[0], f.tone, fi < 2)}{#if f.shots.length > 1}<div class="rn-shots-mini">{#each f.shots.slice(1) as s}{@render photo(s, f.tone)}{/each}</div>{/if}</div>
            {/if}
          </div>
          {#if f.layout === 'wide'}
            <div class="rn-shots-wide">{@render photo(f.shots[0], f.tone)}{#if f.shots.length > 1}<div class="rn-shots-row">{#each f.shots.slice(1) as s}<figure>{@render photo(s, f.tone)}<figcaption>{s.title}</figcaption></figure>{/each}</div>{/if}</div>
          {:else if f.layout === 'pair'}
            <div class="rn-shots-pair">{#each f.shots as s}<figure>{@render photo(s, f.tone)}<figcaption>{s.title}</figcaption></figure>{/each}</div>
          {/if}
          <p class="rn-where"><span>여기서 만나요</span>{f.where}</p>
        </article>
      {/each}

      <section class="rn-extras" aria-labelledby="rn-extras-title">
        <h2 id="rn-extras-title">그 밖에도 좋아졌어요</h2>
        <ul>{#each extras as e}<li><b>{e.b}</b><span>{e.t}</span></li>{/each}</ul>
      </section>

      <section class="rn-help">
        <BookOpen size={24}/>
        <div><h2>처음 써 보는 기능도 차근차근</h2><p>처음 설정에서 고른 툴킷은 <b>설정 → 동작</b>, 급식창은 <b>급식창 설정</b>에서 언제든 바꿀 수 있어요.</p></div>
        <button onclick={() => guide()}>사용 가이드 <ArrowUpRight size={16}/></button>
      </section>
      <p class="rn-credit">실제 사용 화면 · 학생 이름과 일정은 예시입니다. 사진을 누르면 크게 볼 수 있어요.</p>
    {:else}
      <section class="rn-catalog-intro"><img src="/images/toolkit/toolkit-icon.png" alt=""/><div><span class="rn-hero-kicker">TIDY TOOLKIT</span><h1>교실에 필요한 도구, 여기 다 있어요</h1><p>수업의 시작부터 하루의 마무리까지.</p></div></section>
      <div class="rn-tool-stats" aria-label="툴킷 구성">
        <div><b>{TOOL_REGISTRY.length}<small>가지</small></b><span>교실 도구</span></div>
        <div><b>{TIMER_TOOLS.length}<small>종</small></b><span>타이머</span></div>
        <div><b>{PICKER_TOOLS.length}<small>종</small></b><span>뽑기</span></div>
        <div><b>{SCOREBOARD_TOOLS.length}<small>종</small></b><span>점수판</span></div>
      </div>
      <p class="rn-count-note">타이머 · 뽑기 · 점수판의 여러 종류는 {TOOL_REGISTRY.length}가지 도구 안에 함께 들어 있어요.</p>
      <div class="rn-tool-groups">{#each toolGroups as group}<section class="rn-tool-group"><h2>{group.title}<span>{group.ids.length}</span></h2>{#each group.ids as id}{@const tool = TOOL_REGISTRY.find(item => item.id === id)}<article data-tool-id={id}><ToolIcon kind={id} size={34}/><div><h3>{tool?.label}</h3><p>{toolCopy[id]}</p></div></article>{/each}</section>{/each}</div>
      <div class="rn-videos" role="group" aria-label="Tidy Task 소개 영상">
        <button class="rn-video rn-video-featured" onclick={() => external('https://www.youtube.com/watch?v=O_snQZp20_k')}>
          <span class="rn-video-copy"><span class="rn-video-label"><span class="rn-youtube"><Play size={10} fill="currentColor"/></span> YouTube · 소개 영상</span><strong>영상으로 먼저 만나 보세요</strong><span class="rn-video-action">소개 영상 보기 <ArrowUpRight size={14}/></span></span>
          <span class="rn-video-play" aria-hidden="true"><Play size={22} fill="currentColor"/></span>
        </button>
        <button class="rn-video rn-video-shorts" onclick={() => external('https://www.youtube.com/shorts/cruV-jDR49Q')}>
          <span class="rn-video-copy"><span class="rn-video-label"><Smartphone size={13}/> YouTube Shorts</span><strong>짧게, 한눈에!</strong><span class="rn-video-action">숏츠 보기 <ArrowUpRight size={14}/></span></span>
        </button>
      </div>
      <div class="rn-catalog-bottom"><p>안 보이는 도구는 <b>툴킷 설정 → 비활성화된 도구</b>에서 켜 주세요.</p><button class="rn-primary" disabled={busy} onclick={launch}>툴킷 열기 <ArrowUpRight size={16}/></button></div>
    {/if}
    <div class="rn-signature"><img src="/chaltteok.webp" alt=""/><span>선생님의 하루에 작은 여유를.<b>Tidy Task · 찰떡쌤</b></span><span>© 2026 찰떡쌤</span></div>
  </div>
  {/key}
  </div>
  {#if error}<p class="rn-error" role="alert">{error}</p>{/if}
  <footer class="rn-footer"><div><button disabled={busy} onclick={() => dismiss(tomorrowStart())}>오늘 그만보기</button><span aria-hidden="true">·</span><button disabled={busy} onclick={() => dismiss(DISMISSED_FOREVER)}>이 공지 그만보기</button></div><button class="rn-close" disabled={busy} onclick={close}>닫기 <X size={16}/></button></footer>
  {#if enlarged}
    <dialog class="rn-lightbox" bind:this={lightbox} aria-label={`${enlarged.title} 실제 화면`} oncancel={(event) => {event.preventDefault(); unzoom();}}>
      <header><div><span>실제 앱 화면</span><h2>{enlarged.title}</h2></div><button class="rn-icon-button" aria-label="확대 화면 닫기" onclick={unzoom}><X size={23}/></button></header>
      <div><img src={enlarged.src} alt={`${enlarged.title} 고해상도 실제 화면`}/></div><p>예시 자료로 찍은 화면입니다. 확대 화면을 닫으면 보던 위치로 돌아갑니다.</p>
    </dialog>
  {/if}
</div>
{:else}<div class="rn-closed"><Check size={30}/><p>공지를 닫았습니다.</p></div>{/if}
