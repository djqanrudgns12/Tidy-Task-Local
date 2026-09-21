<script lang="ts">
  import "./toolkit-release.css";
  import { onMount } from 'svelte';
  import { X, ArrowUpRight, ArrowLeft, ArrowRight, GripHorizontal, Check, BookOpen } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { LazyStore } from '@tauri-apps/plugin-store';
  import { dragRegion } from '../lib/dragRegion.js';
  import { TOOLKIT_RELEASE_ID, TOOLKIT_RELEASE_STORE_KEY } from '../lib/toolkitRelease.js';
  import { getTomorrowStart, UPDATE_NOTICE_DISMISSED_UNTIL } from '../lib/updateNotice.js';
  import { setEnabled } from '../lib/toolkit/store.js';
  import { openTool } from '../lib/toolkit/windows.js';

  let { preview = false } = $props<{ preview?: boolean }>();
  let page = $state(0), busy = $state(false), error = $state(''), closed = $state(false);
  let scroller: HTMLElement | undefined = $state();
  let dialog: HTMLDivElement | undefined = $state();
  const tabs = ['첫 만남', '시간과 집중', '함께하는 교실', '나만의 도구함'];
  const base = '/images/update-5.5/';
  const draggable = (node: HTMLElement) => preview ? { destroy() {} } : dragRegion(node);
  onMount(() => { dialog?.focus(); });
  function select(next: number) { page = next; scroller?.scrollTo({ top: 0 }); }
  async function close() {
    if (busy) return;
    try { if (preview) closed = true; else await getCurrentWindow().close(); }
    catch { error = '창을 닫지 못했어요. 다시 시도해 주세요.'; }
  }
  async function dismiss(until: number) {
    if (busy) return;
    busy = true; error = '';
    try {
      if (preview) localStorage.setItem(TOOLKIT_RELEASE_STORE_KEY, String(until));
      else {
        const store = new LazyStore('tidy-task-config.json');
        await store.set(TOOLKIT_RELEASE_STORE_KEY, until);
        await store.save();
      }
      busy = false;
      await close();
    } catch { error = '숨김 설정을 저장하지 못했어요. 다시 시도하거나 닫기를 눌러 주세요.'; }
    finally { busy = false; }
  }
  async function launch() {
    if (busy) return;
    busy = true; error = '';
    try { await setEnabled(true); await openTool('toolkit'); }
    catch { error = '툴킷을 열지 못했어요. 작업 표시줄의 Tidy Task 아이콘 메뉴에서도 열 수 있어요.'; }
    finally { busy = false; }
  }
  async function guide() {
    try {
      if (preview) { window.open('/help.html#toolkit', '_blank', 'noopener'); return; }
      const existing = await WebviewWindow.getByLabel('help');
      if (existing) { await existing.show(); await existing.setFocus(); return; }
      const win = new WebviewWindow('help', { url: 'help.html#toolkit', title: 'Tidy Task 사용 가이드', width: 820, height: 760, resizable: true, center: true });
      await win.once('tauri://error', () => { error = '가이드를 열지 못했어요. 메뉴의 기능 설명을 이용해 주세요.'; });
    } catch { error = '가이드를 열지 못했어요. 메뉴의 기능 설명을 이용해 주세요.'; }
  }
  function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') void close(); }
</script>

<svelte:window onkeydown={keyboard} />
{#if !closed}
<div class="release" role="dialog" aria-labelledby="release-title" tabindex="-1" bind:this={dialog}>
  <header class="window-bar" use:draggable>
    <span><GripHorizontal size={15} /> Tidy Task · 새로운 소식</span>
    <button aria-label="닫기" disabled={busy} onclick={close}><X size={18} /></button>
  </header>
  <nav aria-label="툴킷 출시 안내">
    {#each tabs as tab, index}<button class:active={page === index} aria-current={page === index ? 'step' : undefined} onclick={() => select(index)}><small>0{index + 1}</small>{tab}</button>{/each}
  </nav>
  <main bind:this={scroller}>
    {#if page === 0}
      <section class="hero">
        <div class="eyebrow"><span class="release-pill">INTRODUCING</span><span>{TOOLKIT_RELEASE_ID}</span></div>
        <div class="hero-heading"><div><h1 id="release-title">Hello, <em>Tidy toolkit.</em></h1><p class="hero-subtitle">수업에 필요한 순간, 가볍게 꺼내세요.</p></div><img class="hero-icon" src="/images/toolkit/toolkit-icon.png" alt="" /></div>
        <div class="hero-bottom"><p>시간, 집중, 그리고 우리 반의 즐거운 순간.<br />선생님의 하루를 넓혀줄 새로운 도구함.</p><button class="primary" disabled={busy} onclick={launch}>툴킷 시작하기 <ArrowUpRight size={17} /></button></div>
      </section>
      <div class="showcase" aria-label="실제 툴킷 화면 쇼케이스">
        <div class="showcase-label"><span>YOUR CLASSROOM, UPGRADED.</span><span>DESIGNED FOR TEACHERS</span></div>
        <figure class="showcase-picker"><img src={`${base}picker-stage.png`} alt="인형 뽑기 디자인으로 발표자를 고르는 실제 간단 뽑기 화면. 예시 명단 사용" /></figure>
        <figure class="showcase-timer"><img src={`${base}analog.png`} alt="남은 시간을 색으로 보여 주는 실제 아날로그 타이머 화면" /></figure>
        <figure class="showcase-dock"><img src={`${base}toolbar.png`} alt="실제 Tidy 툴킷 툴바: 타이머, 간단 뽑기, 알림장, 토너먼트, 집중벨, 학급 명단" /></figure>
      </div>
      <div class="highlights"><div><strong>4<span>가지</span></strong><p>다양한 타이머</p></div><div><strong>6<span>가지</span></strong><p>교실을 위한 도구</p></div><div><strong>6<span>가지</span></strong><p>나를 닮은 테마</p></div><div><strong>하나<span>의</span></strong><p>편리한 도구함</p></div></div>
      <p class="caption">실제 앱 화면 · 촬영용 예시 명단 사용</p>
    {:else if page === 1}
      <section class="page-heading"><span class="eyebrow">TIME & FOCUS</span><h1 id="release-title">흐르는 시간도,<br />다시 모으는 집중도.</h1><p>활동의 시작부터 마무리까지, 상황에 맞는 도구를 골라보세요.</p></section>
      <div class="timer-grid">
        {#each [{id:'digital',title:'전광판 타이머',text:'큼직한 숫자로 남은 시간을 또렷하게.'},{id:'analog',title:'아날로그 타이머',text:'줄어드는 색으로 시간의 흐름을 직관적으로.'},{id:'hourglass',title:'모래시계',text:'떨어지는 모래를 보며 차분하게 기다려요.'},{id:'stopwatch',title:'스톱워치',text:'얼마나 걸렸는지, 흐른 시간을 측정해요.'}] as tool}
          <figure><img src={`${base}${tool.id}.png`} alt={`실제 ${tool.title} 화면`} loading="lazy" /><figcaption><strong>{tool.title}</strong><p>{tool.text}</p></figcaption></figure>
        {/each}
      </div>
      <article class="feature bell"><img src={`${base}focus-bell.png`} alt="실제 집중벨 화면: 벨, 사이렌, 폭탄, 방귀 소리 선택" loading="lazy" /><div><span class="eyebrow">한 번의 신호</span><h2>이제, 선생님을 볼 시간!</h2><p>벨·사이렌·폭탄·방귀, 네 가지 집중벨로 교실의 시선을 모아보세요. 재생 전에 음량을 확인할 수 있어요.</p></div></article>
      <p class="tip"><Check size={16} /> 타이머 설정에서 진행음·종료음과 종료 전 알림을 조절할 수 있어요.</p>
    {:else if page === 2}
      <section class="page-heading"><span class="eyebrow">OUR CLASSROOM</span><h1 id="release-title">우리 반의 이름으로,<br />함께하는 순간을 만들어요.</h1><p>명단은 한곳에서 관리하고, 수업마다 다양한 방식으로 꺼내 쓰세요.</p></section>
      <div class="class-grid">
        {#each [{id:'roster',title:'학급 명단',text:'학생과 모둠을 정리하고 뽑기·토너먼트에서 불러와요.'},{id:'picker',title:'간단 뽑기',text:'인형 뽑기와 풍선 디자인으로 발표 순서에 설렘을 더해요.'},{id:'tournament',title:'토너먼트',text:'대진표를 만들고 승자를 선택하며 결승까지 함께해요.'},{id:'noticeboard',title:'알림장',text:'오늘의 안내와 준비물을 적고, 큰 화면으로 함께 읽어요.'}] as tool}
          <figure><img src={`${base}${tool.id}.png`} alt={`실제 ${tool.title} 화면. 예시 데이터 사용`} loading="lazy" /><figcaption><strong>{tool.title}</strong><p>{tool.text}</p></figcaption></figure>
        {/each}
      </div>
      <div class="workflow"><span>추천 시작 순서</span><strong>학급 명단 등록</strong><ArrowRight size={16} /><strong>뽑기·토너먼트에서 불러오기</strong></div>
    {:else}
      <section class="page-heading"><span class="eyebrow">MAKE IT YOURS</span><h1 id="release-title">선생님의 취향에 맞게.<br />교실의 분위기에 맞게.</h1><p>작은 도구함도, 나에게 편한 모습이어야 하니까요.</p></section>
      <div class="custom-layout"><figure><img src={`${base}settings.png`} alt="실제 툴킷 설정 화면: 테마, 다크 모드, 툴바 방향과 크기" loading="lazy" /><figcaption>실제 툴킷 설정 화면</figcaption></figure><div class="custom-copy">
        <article><span>01</span><h2>여섯 가지 색, 하나의 분위기</h2><p>세이지·앰버·오션·로즈·라벤더·슬레이트. 모든 도구에 통일된 테마를 적용해요.</p></article>
        <article><span>02</span><h2>다크 모드로 차분하게</h2><p>어두운 교실에서도 편안하게. 툴킷 설정에서 한 번에 전환하세요.</p></article>
        <article><span>03</span><h2>필요한 도구만, 편한 크기로</h2><p>가로·세로 방향과 크기 5단계, 표시할 도구를 골라 나만의 도구함을 만들어요.</p></article>
      </div></div>
      <aside class="start-card"><img src="/images/toolkit/toolkit-icon.png" alt="" /><div><h2>첫 수업에 바로 꺼내보세요.</h2><p>설정의 Tidy 툴킷을 켜거나,<br />작업 표시줄의 Tidy Task 아이콘 메뉴 → Tidy 툴킷 열기.</p></div><button class="primary" disabled={busy} onclick={launch}>툴킷 열기 <ArrowUpRight size={16} /></button></aside>
      <button class="guide-link" onclick={guide}><BookOpen size={17} /> 자세한 사용법은 스마트 가이드에서 <ArrowUpRight size={16} /></button>
    {/if}
    <div class="page-controls"><button disabled={page === 0} onclick={() => select(page - 1)}><ArrowLeft size={15} /> 이전</button><span>0{page + 1} / 04</span><button disabled={page === 3} onclick={() => select(page + 1)}>다음 <ArrowRight size={15} /></button></div>
  </main>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <footer><div><button disabled={busy} onclick={() => dismiss(getTomorrowStart())}>오늘 그만보기</button><button disabled={busy} onclick={() => dismiss(UPDATE_NOTICE_DISMISSED_UNTIL)}>더 이상 보지 않기</button></div><button class="close" disabled={busy} onclick={close}>닫기</button></footer>
</div>
{:else}<div class="preview-closed">공지를 닫았습니다.</div>{/if}
