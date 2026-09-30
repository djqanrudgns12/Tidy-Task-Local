<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { X, ArrowUpRight, ArrowRight, BookOpen, ZoomIn, Check, GripHorizontal, Sparkles, History, ExternalLink, Play, Smartphone } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { LazyStore } from '@tauri-apps/plugin-store';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { dragRegion } from '../lib/dragRegion.js';
  import { RELEASE_NEWS_ID, RELEASE_NEWS_KEY, DISMISSED_FOREVER, tomorrowStart } from '../lib/releaseNews.js';
  import './release-news.css';
  import ToolIcon from './toolkit/ToolIcon.svelte';
  import { TOOL_REGISTRY, TIMER_TOOLS, SCOREBOARD_TOOLS, PLATFORM_TOOLS } from '../lib/toolkit/registry.js';

  let { preview = false } = $props<{ preview?: boolean }>();
  let tab = $state(0), busy = $state(false), closed = $state(false), error = $state('');
  let enlarged = $state<{src:string;title:string} | null>(null);
  let scroller: HTMLElement | undefined = $state();
  let lightbox: HTMLDialogElement | undefined = $state();
  let dialog: HTMLDivElement | undefined = $state();
  let previousFocus: HTMLElement | null = null;
  const base = '/images/update-5.6/';
  // 화면의 버전 글자는 공지 ID 하나에서 만듭니다. 다음에 공지를 올릴 때 한 곳만 고치면 되게.
  const version = RELEASE_NEWS_ID.replace(/^v/, '');
  const tabs = [`${version} 새 소식`, '툴킷 전체', '지난 업데이트', '롤링 썬더'];
  // 5.6.0 공지를 이미 본 사용자에게 같은 내용만 다시 보이지 않도록, 이번 패치에서 달라진 점을 첫 탭 맨 위에 둡니다.
  const patchNotes = [
    {title:'사용 통계 연결 복구', text:'일부 버전에서 사용 현황이 전달되지 않던 문제를 고쳤어요.'},
    {title:'도구별 사용 현황 개선', text:'투표·주사위·타이머 등 어떤 도구가 쓰이는지 구분해 개선에 참고해요.'},
    {title:'입력 내용은 보내지 않아요', text:'메모·학생 이름·투표 내용과 결과는 사용 통계에 포함하지 않아요.'},
  ];
  const toolGroups = [
    {title:'시간과 집중', ids:['timer','clock','focus-bell']},
    {title:'뽑기와 놀이', ids:['picker','tournament','dice']},
    {title:'학급 운영', ids:['noticeboard','roster','seating']},
    {title:'참여와 성장', ids:['vote','scoreboard','thermometer']},
  ];
  const toolCopy: Record<string,string> = {
    timer:'디지털·아날로그·모래시계·스톱워치로 활동 시간을 정해요.',
    clock:'디지털과 아날로그로 교실에 현재 시간을 보여 줘요.',
    'focus-bell':'종소리로 활동의 시작을 알리고 주의를 모아요.',
    picker:'이름이나 항목을 넣고 다양한 연출로 뽑아요.',
    tournament:'대진표를 따라 후보를 고르며 최종 우승을 정해요.',
    dice:'여러 주사위를 굴리고 결과를 함께 확인해요.',
    noticeboard:'안내할 내용을 큰 글씨로 작성해 교실에 띄워요.',
    roster:'학생 명단을 관리하고 연결된 도구에서 함께 써요.',
    seating:'학급 명단과 배치 조건으로 자리를 정하고 저장해요.',
    vote:'선거·의견·찬반 투표를 진행하고 개표와 결과를 즐겨요.',
    scoreboard:'개인·모둠·직접 만든 항목의 점수를 기록해요.',
    thermometer:'학급의 목표와 보상, 도장판으로 성장을 함께 봐요.',
  };
  const features = [
    {id:'vote', no:'01', title:'학급 투표', sub:'우리 반의 생각이 모이는 시간', text:'회장 선거, 의견 모으기, 찬반 투표까지. 개표하는 순간도 우리 반에 맞게 고르고, 결과는 이미지로 간직하세요.', tags:['세 가지 투표','다양한 개표','결과 보관'], image:'vote', tone:'peach'},
    {id:'seating', no:'02', title:'자리 배치', sub:'새로운 짝꿍, 새로운 시작', text:'학급 명단으로 바로 시작해요. 배치 조건과 지난 자리를 참고하고, 두 학생을 누르거나 끌어서 자리를 바꿔 보세요.', tags:['학급 명단 연결','지난 자리 참고','배치도 저장'], image:'seating', tone:'sage'},
    {id:'scoreboard', no:'03', title:'점수판', sub:'함께 쌓는 작은 성취', text:'개인·모둠·커스텀 점수판으로 활동 점수를 기록해요. 잘못 누른 점수는 되돌릴 수 있어요.', tags:['개인 · 모둠 · 커스텀'], image:'scoreboard', tone:'lavender'},
    {id:'thermometer', no:'04', title:'학급 온도계', sub:'우리의 목표가 자라는 모습', text:'목표와 중간 보상, 도장판을 우리 반에 맞게 꾸미고 하루하루의 변화를 함께 살펴보세요.', tags:['목표 · 보상 · 기록'], image:'thermometer', tone:'butter'},
    {id:'clock', no:'05', title:'시계', sub:'교실 어디서나, 또렷하게', text:'디지털과 아날로그 중 골라 사용해요. 시계 읽기를 돕는 분 숫자도 함께 표시할 수 있어요.', tags:['디지털 · 아날로그'], image:'clock', tone:'sky'},
    {id:'dice', no:'06', title:'주사위', sub:'한 번 굴리면 시작되는 활동', text:'필요한 만큼 주사위를 꺼내 굴려 보세요. 수학 활동부터 놀이까지, 결과를 한눈에 확인해요.', tags:['여러 주사위 · 결과 확인'], image:'dice', tone:'rose'},
  ];
  const draggable = (node: HTMLElement) => preview ? { destroy() {} } : dragRegion(node);
  onMount(() => { dialog?.focus(); });

  async function select(index: number, focus = false) {
    tab = index; error = ''; scroller?.scrollTo({top:0});
    await tick();
    if (focus) document.getElementById(`news-tab-${index}`)?.focus();
  }
  function tabKey(event: KeyboardEvent) {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    void select(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tab + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true);
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
  async function guide(anchor = 'toolkit') {
    error = '';
    try {
      if (preview) { window.open(`/help.html#${anchor}`, '_blank', 'noopener'); return; }
      const existing = await WebviewWindow.getByLabel('help');
      if (existing) { await existing.unminimize(); await existing.show(); await existing.setFocus(); return; }
      const win = new WebviewWindow('help', {url:`help.html#${anchor}`,title:'Tidy Task 사용 가이드',width:920,height:800,center:true,resizable:true});
      await win.once('tauri://error', () => { error = '사용 가이드를 열지 못했어요. 다시 시도해 주세요.'; });
    } catch { error = '사용 가이드를 열지 못했어요. 다시 시도해 주세요.'; }
  }
  async function external(url: string) {
    error = '';
    try { if (preview) window.open(url, '_blank', 'noopener'); else await openUrl(url); }
    catch { error = '사이트를 열지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'; }
  }
</script>

<svelte:window onkeydown={keydown}/>
{#if !closed}
<div class="release-news" role="dialog" aria-labelledby="news-window-title" tabindex="-1" bind:this={dialog}>
  <header class="rn-chrome" use:draggable>
    <span id="news-window-title"><GripHorizontal size={15}/><b>Tidy Task</b><span class="rn-chrome-divider"></span>새로운 소식</span>
    <div><span class="rn-version">{RELEASE_NEWS_ID}</span><button class="rn-icon-button" aria-label="닫기" disabled={busy} onclick={close}><X size={20}/></button></div>
  </header>
  <div class="rn-tabs" role="tablist" aria-label="새로운 소식 분류">
    {#each tabs as label, i}<button id={`news-tab-${i}`} role="tab" aria-selected={tab === i} aria-controls="news-panel" tabindex={tab === i ? 0 : -1} onclick={() => select(i)} onkeydown={tabKey}>
      {#if i === 0}<Sparkles size={17}/>{:else if i === 1}<BookOpen size={17}/>{:else if i === 2}<History size={17}/>{:else}<ExternalLink size={17}/>{/if}{label}{#if i === 0}<span class="rn-new">NEW</span>{/if}
    </button>{/each}
  </div>
  <div class="rn-scroll" id="news-panel" role="tabpanel" aria-labelledby={`news-tab-${tab}`} tabindex="0" bind:this={scroller}>
  {#key tab}
  <div class="rn-page">
    {#if tab === 0}
      <section class="rn-intro">
        <div class="rn-intro-row"><img class="rn-welcome-icon" src="/images/toolkit/toolkit-icon.png" alt=""/><div><span class="rn-kicker">Tidy Task {version}</span><h1>작은 도구함에, 새로운 즐거움.</h1><p>우리 반을 위한 여섯 가지 도구가 찾아왔어요.</p></div><button class="rn-primary" disabled={busy} onclick={launch}>툴킷 열기 <ArrowUpRight size={16}/></button></div>
      </section>
      <div class="rn-videos" role="group" aria-label="Tidy Task 소개 영상">
        <button class="rn-video rn-video-featured" onclick={() => external('https://www.youtube.com/watch?v=O_snQZp20_k')}>
          <span class="rn-video-copy"><span class="rn-video-label"><span class="rn-youtube"><Play size={10} fill="currentColor"/></span> YouTube · 소개 영상</span><strong>영상으로 먼저 만나 보세요</strong><span class="rn-video-description">우리 반 도구함, 어떻게 쓸까요?</span><span class="rn-video-action">소개 영상 보기 <ArrowUpRight size={14}/></span></span>
          <span class="rn-video-play" aria-hidden="true"><Play size={25} fill="currentColor"/></span>
        </button>
        <button class="rn-video rn-video-shorts" onclick={() => external('https://www.youtube.com/shorts/cruV-jDR49Q')}>
          <span class="rn-video-copy"><span class="rn-video-label"><Smartphone size={13}/> YouTube Shorts</span><strong>짧게, 한눈에!</strong><span class="rn-video-description">숏츠로 가볍게 살펴봐요</span><span class="rn-video-action">숏츠 보기 <ArrowUpRight size={14}/></span></span>
          <span class="rn-video-phone" aria-hidden="true"><Play size={17} fill="currentColor"/></span>
        </button>
      </div>
      <button class="rn-community" onclick={() => external('https://indischool.com/boards/libClass/37569890')}>
        <span class="rn-community-icon" aria-hidden="true"><BookOpen size={19}/></span>
        <span class="rn-community-copy"><b>인디스쿨에서 글로 읽어 보세요</b><span>Tidy Task 소개 글</span></span>
        <ArrowUpRight size={18}/>
      </button>
      <section class="rn-patch" aria-labelledby="rn-patch-title">
        <h2 id="rn-patch-title">{version}에서 더 좋아졌어요</h2>
        <ul>{#each patchNotes as note}<li><b>{note.title}</b><span>{note.text}</span></li>{/each}</ul>
      </section>
      <div class="rn-section-heading"><span>새로 만나는 도구 <b>6</b></span><span>사진을 누르면 크게 볼 수 있어요</span></div>
      <section class="rn-features" aria-label="새로 추가된 여섯 도구">
        {#each features as feature, i}
          <article class={`rn-feature ${feature.tone}`} class:rn-feature-large={i < 2}>
            <div class="rn-feature-copy"><ToolIcon kind={feature.id} size={40}/><div><h2>{feature.title}</h2><h3>{feature.sub}</h3></div></div>
            <button class="rn-photo" aria-label={`${feature.title} 실제 화면 크게 보기`} onclick={() => zoom(`${base}${feature.image}.webp`, feature.title)}><img src={`${base}${feature.image}.webp`} alt={`${feature.title} 실제 앱 화면. 가상 학급과 예시 자료 사용.`} loading={i < 2 ? 'eager' : 'lazy'}/><span><ZoomIn size={15}/> 크게 보기</span></button>
            <p class="rn-feature-description">{feature.text}</p>
            <div class="rn-tags">{#each feature.tags as tag}<span>{tag}</span>{/each}</div>
          </article>
        {/each}
      </section>
      <section class="rn-personalize"><div><span class="rn-kicker">나에게 맞는 도구함</span><h2>자주 쓰는 순서대로.<br/>편안한 글꼴로.</h2><p>툴킷 설정에서 손잡이를 끌어 순서를 바꾸고,<br/>사용할 도구와 화면 글꼴을 골라 보세요.</p><div class="rn-note"><Check size={18}/><span>시계·점수판·주사위·학급 온도계는<br/><b>툴킷 설정 → 비활성화된 도구</b>에서 켤 수 있어요.</span></div></div><button class="rn-settings-photo" aria-label="툴킷 설정 실제 화면 크게 보기" onclick={() => zoom(`${base}settings.webp`,'툴킷 설정')}><img src={`${base}settings.webp`} alt="도구 표시와 순서를 정하는 현재 툴킷 설정" loading="lazy"/><span><ZoomIn size={15}/> 설정 화면 크게 보기</span></button></section>
      <div class="rn-guide-card"><BookOpen size={26}/><div><h2>처음 써 보는 도구도 차근차근.</h2><p>자세한 사용법은 Tidy Task 사용 가이드에서 확인하세요.</p></div><button onclick={() => guide()}>사용 가이드 <ArrowUpRight size={18}/></button></div>
      <p class="rn-photo-credit">실제 사용 화면 · 학생 이름과 자료는 예시입니다.</p>
    {:else if tab === 1}
      <section class="rn-catalog-intro"><img src="/images/toolkit/toolkit-icon.png" alt=""/><div><span class="rn-kicker">TIDY TOOLKIT</span><h1>교실에 필요한 도구, 여기 다 있어요.</h1><p>수업의 시작부터 하루의 마무리까지.</p></div></section>
      <div class="rn-tool-stats" aria-label="툴킷 구성"><div><b>{TOOL_REGISTRY.length}<small>가지</small></b><span>교실 도구</span></div><div><b>{TIMER_TOOLS.length}<small>종</small></b><span>타이머</span></div><div><b>{SCOREBOARD_TOOLS.length}<small>종</small></b><span>점수판</span></div></div>
      <p class="rn-count-note">타이머 4종과 점수판 3종은 12가지 도구에 포함돼요.</p>
      <div class="rn-tool-groups">{#each toolGroups as group}<section class="rn-tool-group"><h2>{group.title}<span>{group.ids.length}</span></h2>{#each group.ids as id}{@const tool = TOOL_REGISTRY.find(item => item.id === id)}<article data-tool-id={id}><ToolIcon kind={id} size={34}/><div><h3>{tool?.label}</h3><p>{toolCopy[id]}</p></div></article>{/each}</section>{/each}</div>
      <section class="rn-catalog-extra"><ToolIcon kind="settings" size={32}/><div><h2>도구함도 내 취향대로</h2><p>도구 표시와 순서, 테마·글꼴·크기를 설정에서 골라요.</p></div></section>
      <section class="rn-catalog-external"><h2>외부 서비스도 바로 연결</h2><div>{#each PLATFORM_TOOLS as service}<button onclick={() => external(service.url)}><img src={service.icon} alt=""/><span>{service.label}</span><ArrowUpRight size={14}/></button>{/each}</div><p>웹 브라우저에서 열리는 별도 서비스예요.</p></section>
      <div class="rn-catalog-bottom"><p>안 보이는 도구는 <b>툴킷 설정 → 비활성화된 도구</b>에서 켜 주세요.</p><button class="rn-primary" disabled={busy} onclick={launch}>툴킷 열기 <ArrowUpRight size={16}/></button></div>
    {:else if tab === 2}
      <section class="rn-archive-intro"><span class="rn-archive-icon"><History size={24}/></span><div><h1>차곡차곡 쌓인 업데이트</h1><p>급식창부터 툴킷까지, 꼭 알아두면 좋은 변화예요.</p></div></section>
      <div class="rn-timeline">
        <article class="rn-history">
          <div class="rn-history-date"><b>5.5.3</b><span>사용성 개선</span></div>
          <div class="rn-history-body"><h2>업데이트와 날짜 선택이 간편하게</h2><ul><li><b>앱 안에서 업데이트</b><span>새 버전을 내려받고 설치할 수 있어요.</span></li><li><b>빠른 날짜 선택</b><span>달력에서 할 일의 마감일을 골라요.</span></li><li><b>툴킷 다듬기</b><span>사용성을 높이고 작은 오류를 고쳤어요.</span></li></ul></div>
          <button class="rn-history-photo" aria-label="날짜 선택 실제 화면 크게 보기" onclick={() => zoom(`${base}calendar.webp`,'할 일 날짜 선택')}><img src={`${base}calendar.webp`} alt="실제 날짜 선택창" loading="lazy"/><span><ZoomIn size={13}/> 날짜 선택</span></button>
        </article>
        <article class="rn-history">
          <div class="rn-history-date"><b>5.5.0</b><span>툴킷의 시작</span></div>
          <div class="rn-history-body"><h2>수업 곁에 작은 도구함 하나</h2><ul><li><b>시간과 집중</b><span>네 가지 타이머와 집중벨</span></li><li><b>함께하는 활동</b><span>간단 뽑기와 토너먼트</span></li><li><b>교실의 일상</b><span>알림장과 학급 명단</span></li></ul></div>
          <div class="rn-archive-pair">{#each [{file:'picker',title:'간단 뽑기'},{file:'noticeboard',title:'알림장'}] as item}<button class="rn-history-photo" aria-label={`${item.title} 실제 화면 크게 보기`} onclick={() => zoom(`${base}${item.file}.webp`,item.title)}><img src={`${base}${item.file}.webp`} alt={`${item.title} 현재 앱 화면. 예시 자료 사용.`} loading="lazy"/><span><ZoomIn size={13}/>{item.title}</span></button>{/each}</div>
        </article>
        <article class="rn-history">
          <div class="rn-history-date"><b>5.1</b><span>급식과 꾸미기</span></div>
          <div class="rn-history-body"><h2>오늘의 식단도, 내 취향도</h2><ul><li><b>독립된 급식창</b><span>학교를 등록하고 날짜별 식단을 확인해요.</span></li><li><b>새로운 상단 디자인</b><span>클래식과 모던 중 편한 모습을 골라요.</span></li><li><b>15가지 테마</b><span>색과 글꼴을 취향에 맞게 꾸며요.</span></li></ul></div>
          <button class="rn-history-photo" aria-label="급식창 실제 화면 크게 보기" onclick={() => zoom(`${base}meal.webp`,'학교 급식')}><img src={`${base}meal.webp`} alt="실제 급식창. 예시 식단 사용." loading="lazy"/><span><ZoomIn size={13}/> 급식창</span></button>
        </article>
      </div>
      <p class="rn-photo-credit">지난 소식은 이곳에서 다시 볼 수 있어요. 소개 이미지는 현재 버전의 화면입니다.</p>
    {:else}
      <section class="rn-rolling">
        <div class="rn-rolling-top"><span class="rn-kicker">찰떡쌤의 또 다른 교실 도구</span><span class="rn-service-mark">ROLLIN THUNDER <ArrowUpRight size={16}/></span></div>
        <div class="rn-rolling-heading"><img src="/images/toolkit/rollinthunder.png" alt=""/><div><span>함께 응원하는 추첨</span><h1>롤링 썬더<span>지금의 이름, 롤린썬더</span></h1></div></div>
        <h2>기다리는 순간도 즐거운 추첨</h2>
        <p class="rn-rolling-lead">이름을 넣고 시작하면, 구르고 부딪히는 칩들이 교실의 작은 경기를 만들어요.</p>
        <div class="rn-videos rn-videos-rolling" role="group" aria-label="롤링썬더 소개 영상">
          <button class="rn-video rn-video-featured" onclick={() => external('https://www.youtube.com/watch?v=rUkiBAN1Go4')}>
            <span class="rn-video-copy"><span class="rn-video-label"><span class="rn-youtube"><Play size={10} fill="currentColor"/></span> YouTube · 60초</span><strong>어떤 추첨인지 궁금하다면?</strong><span class="rn-video-description">롤링썬더를 영상으로 만나 보세요</span><span class="rn-video-action">60초 영상 보기 <ArrowUpRight size={14}/></span></span>
            <span class="rn-video-play" aria-hidden="true"><Play size={25} fill="currentColor"/></span>
          </button>
          <button class="rn-video rn-video-detail" onclick={() => external('https://www.youtube.com/watch?v=jm5UKRxObp8&t=13s')}>
            <span class="rn-video-copy"><span class="rn-video-label"><Play size={13}/> YouTube · 3분 30초</span><strong>조금 더 자세히</strong><span class="rn-video-action">소개 영상 보기 <ArrowUpRight size={14}/></span></span>
          </button>
          <button class="rn-video rn-video-shorts" onclick={() => external('https://www.youtube.com/shorts/v1bytPpxqrk')}>
            <span class="rn-video-copy"><span class="rn-video-label"><Smartphone size={13}/> YouTube Shorts</span><strong>짧게, 한눈에!</strong><span class="rn-video-action">숏츠 보기 <ArrowUpRight size={14}/></span></span>
            <span class="rn-video-phone" aria-hidden="true"><Play size={17} fill="currentColor"/></span>
          </button>
        </div>
        <button class="rn-community" onclick={() => external('https://indischool.com/boards/libRecreation/37589551')}>
          <span class="rn-community-icon" aria-hidden="true"><BookOpen size={19}/></span>
          <span class="rn-community-copy"><b>인디스쿨에서 글로 읽어 보세요</b><span>롤린썬더 소개 글</span></span>
          <ArrowUpRight size={18}/>
        </button>
        <div class="rn-rolling-art"><img src="/images/toolkit/rollinthunder.png" alt="롤린썬더 서비스 아이콘"/><div><span>READY, SET, ROLL.</span><strong>선생님은 시작을.<br/>아이들은 응원을.</strong><div class="rn-rolling-chips" aria-hidden="true"><i>01</i><i>02</i><i>03</i><i>04</i><i>05</i></div></div></div>
        <div class="rn-rolling-grid"><article><span>01 / RACE</span><h3>물리 엔진 레이스</h3><p>구르고 부딪히며 순위가 바뀌는 추첨을 함께 지켜봐요.</p></article><article><span>02 / ARENA</span><h3>서바이벌 아레나</h3><p>마지막까지 남을 칩을 응원하며 또 다른 경기를 즐겨요.</p></article><article><span>03 / CLASSROOM</span><h3>교실의 다양한 순간</h3><p>발표 순서, 모둠 활동, 작은 경품까지 즐겁게 정해 보세요.</p></article></div>
        <div class="rn-rolling-cta"><button class="rn-primary" onclick={() => external('https://www.rollinthunder.net/')}>롤린썬더 시작하기 <ArrowUpRight size={19}/></button><button class="rn-text-button" onclick={() => external('https://www.rollinthunder.net/guide')}>활용 가이드 <ArrowRight size={17}/></button></div>
        <p class="rn-small">웹 브라우저에서 열리는 별도 서비스입니다. 이용 범위와 요금은 서비스에서 확인해 주세요.</p>
      </section>
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
      <div><img src={enlarged.src} alt={`${enlarged.title} 고해상도 실제 화면`}/></div><p>예시 자료로 촬영한 화면입니다. 확대 화면을 닫으면 보던 위치로 돌아갑니다.</p>
    </dialog>
  {/if}
</div>
{:else}<div class="rn-closed"><Check size={30}/><p>공지를 닫았습니다.</p></div>{/if}
