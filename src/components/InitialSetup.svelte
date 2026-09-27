<script lang="ts">
  import './initial-setup.css';
  import { onMount } from 'svelte';
  import {
    ArrowLeft,
    ArrowRight,
    Check,
    GripHorizontal,
    MapPin,
    Search,
    School,
    Sparkles,
    Utensils,
    X,
  } from 'lucide-svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { dragRegion } from '../lib/dragRegion.js';
  import {
    errorMessage,
    native,
    readSettings as readMealSettings,
    writeMeal,
  } from '../lib/meal/mealStore.js';
  import {
    readSettings as readToolkitSettings,
    setEnabled,
  } from '../lib/toolkit/store.js';
  import { completeInitialSetup } from '../lib/initialSetup.js';

  let { preview = false } = $props<{ preview?: boolean }>();
  type Step = 'school' | 'meal-startup' | 'toolkit';
  type SchoolRow = Record<string, string> & {
    ATPT_OFCDC_SC_CODE: string;
    SD_SCHUL_CODE: string;
    SCHUL_NM: string;
  };

  let step = $state<Step>('school');
  let query = $state('');
  let office = $state('');
  let rows = $state<SchoolRow[]>([]);
  let selected = $state(-1);
  let school = $state<SchoolRow | null>(null);
  let loading = $state(false);
  let busy = $state(false);
  let searched = $state(false);
  let error = $state('');
  let mealStartup = $state<boolean | null>(null);
  let toolkitEnabled = $state<boolean | null>(null);
  let dialog: HTMLDivElement | undefined = $state();
  let searchInput: HTMLInputElement | undefined = $state();
  let searchVersion = 0;
  let allowDestroy = false;

  const regions = [
    ['', '전국'], ['B10', '서울'], ['C10', '부산'], ['D10', '대구'],
    ['E10', '인천'], ['F10', '광주'], ['G10', '대전'], ['H10', '울산'],
    ['I10', '세종'], ['J10', '경기'], ['K10', '강원'], ['M10', '충북'],
    ['N10', '충남'], ['P10', '전북'], ['Q10', '전남'], ['R10', '경북'],
    ['S10', '경남'], ['T10', '제주'],
  ];
  const previewSchools: SchoolRow[] = [
    {
      ATPT_OFCDC_SC_CODE: 'B10', SD_SCHUL_CODE: '0000001', SCHUL_NM: '한빛초등학교',
      SCHUL_KND_SC_NM: '초등학교', LCTN_SC_NM: '서울특별시', ORG_RDNMA: '서울특별시 한빛로 1',
    },
    {
      ATPT_OFCDC_SC_CODE: 'J10', SD_SCHUL_CODE: '0000002', SCHUL_NM: '한빛중학교',
      SCHUL_KND_SC_NM: '중학교', LCTN_SC_NM: '경기도', ORG_RDNMA: '경기도 한빛길 2',
    },
  ];

  const stepNumber = $derived(step === 'school' || step === 'meal-startup' ? 1 : 2);
  const draggable = (node: HTMLElement) => preview ? { destroy() {} } : dragRegion(node);

  onMount(() => {
    let disposed = false;
    let unlisten = () => {};
    void (async () => {
      try {
        const [meal, toolkit] = await Promise.all([
          readMealSettings(),
          readToolkitSettings(),
        ]);
        if (disposed) return;
        school = meal.school;
        mealStartup = meal.school ? meal.behavior.startup : null;
        toolkitEnabled = toolkit.toolkit.enabled;
        step = meal.school ? 'meal-startup' : 'school';
        requestAnimationFrame(() => (meal.school ? dialog?.focus() : searchInput?.focus()));
        if (!preview) {
          unlisten = await getCurrentWindow().onCloseRequested((event) => {
            if (allowDestroy) return;
            event.preventDefault();
            void skipForever();
          });
        }
      } catch {
        error = '처음 설정을 준비하지 못했어요. 창을 닫고 다시 시도해 주세요.';
      }
    })();
    return () => {
      disposed = true;
      unlisten();
    };
  });

  $effect(() => {
    const currentQuery = query.replace(/\s/g, '');
    const currentOffice = office;
    if (step !== 'school' || currentQuery.length < 2 || school) {
      rows = [];
      selected = -1;
      searched = false;
      loading = false;
      return;
    }
    const token = ++searchVersion;
    loading = true;
    searched = false;
    error = '';
    const timer = setTimeout(async () => {
      try {
        const result = preview || !native
          ? { rows: previewSchools.filter((item) => item.SCHUL_NM.includes(currentQuery)) }
          : await invoke<{ rows: SchoolRow[] }>('neis_search_schools', {
              name: currentQuery,
              office: currentOffice || null,
            });
        if (token !== searchVersion) return;
        rows = result.rows.slice(0, 50);
        searched = true;
      } catch (reason) {
        if (token === searchVersion) error = errorMessage(reason);
      } finally {
        if (token === searchVersion) loading = false;
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      searchVersion++;
    };
  });

  async function registerSchool() {
    const chosen = rows[selected];
    if (!chosen || busy) return;
    busy = true;
    error = '';
    try {
      await writeMeal('school', chosen);
      // 등록 직후 창을 닫아도 묻지 않은 자동 실행이 켜지지 않게 명시적으로 OFF에서 시작합니다.
      await writeMeal('behavior.startup', false);
      school = chosen;
      mealStartup = false;
      step = 'meal-startup';
      requestAnimationFrame(() => dialog?.focus());
    } catch {
      error = '학교 등록을 저장하지 못했어요. 다시 시도해 주세요.';
    } finally {
      busy = false;
    }
  }

  async function skipSchool() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      if (!school) {
        await writeMeal('behavior.startup', false);
        mealStartup = false;
      }
      step = 'toolkit';
    } catch {
      error = '선택을 저장하지 못했어요. 다시 시도해 주세요.';
    } finally {
      busy = false;
    }
  }

  async function chooseMealStartup(value: boolean) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await writeMeal('behavior.startup', value);
      mealStartup = value;
      step = 'toolkit';
    } catch {
      error = '급식 시작 설정을 저장하지 못했어요. 다시 시도해 주세요.';
    } finally {
      busy = false;
    }
  }

  async function chooseToolkit(value: boolean) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await setEnabled(value);
      toolkitEnabled = value;
      await completeInitialSetup({ mealStartup, toolkitEnabled: value, appVersion: '5.6.2' });
      await finish();
    } catch {
      error = '설정을 끝내지 못했어요. 저장 공간을 확인한 뒤 다시 눌러 주세요.';
    } finally {
      busy = false;
    }
  }

  async function skipForever() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const [meal, toolkit] = await Promise.all([readMealSettings(), readToolkitSettings()]);
      await completeInitialSetup({
        mealStartup: meal.school ? meal.behavior.startup : false,
        toolkitEnabled: toolkit.toolkit.enabled,
        skipped: true,
        appVersion: '5.6.2',
      });
      await finish();
    } catch {
      error = '건너뛰기 상태를 저장하지 못했어요. 다시 시도해 주세요.';
    } finally {
      busy = false;
    }
  }

  async function finish() {
    if (preview) {
      document.body.dataset.setupComplete = 'true';
      return;
    }
    allowDestroy = true;
    await getCurrentWindow().destroy();
  }

  function resetSchool() {
    school = null;
    query = '';
    rows = [];
    selected = -1;
    searched = false;
    step = 'school';
    requestAnimationFrame(() => searchInput?.focus());
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void skipForever();
    }
  }
</script>

<svelte:window onkeydown={keydown} />
<div class="setup" role="dialog" aria-labelledby="setup-title" tabindex="-1" bind:this={dialog}>
  <header class="window-bar" use:draggable>
    <span><GripHorizontal size={15} /> Tidy Task <b>5.6.2</b></span>
    <button aria-label="처음 설정 건너뛰기" title="건너뛰기 · 다시 표시되지 않음" disabled={busy} onclick={skipForever}><X size={18} /></button>
  </header>

  <div class="setup-brand"><div><span>처음 만나는 Tidy Task</span><h2>선생님의 하루에,<br/><em>작은 여유를.</em></h2></div><img src="/images/toolkit/toolkit-icon.png" alt=""/></div>
  <div class="progress" aria-label={`처음 설정 ${stepNumber}/2`}>
    <div class="progress-side">
      {#if stepNumber === 2}<button class="previous" disabled={busy} onclick={() => step = school ? 'meal-startup' : 'school'}><ArrowLeft size={15} /> 이전</button>{/if}
    </div>
    <div class="steps">
      <span class:active={stepNumber === 1}><b>1</b> 급식</span>
      <i></i>
      <span class:active={stepNumber === 2}><b>2</b> 툴킷</span>
    </div>
    <span class="step-count">{stepNumber} / 2</span>
  </div>

  <main>
    {#if step === 'school'}
      <section class="intro">
        <span class="feature-icon meal"><Utensils size={20} /></span>
        <div><small>우리 학교 급식</small><h1 id="setup-title">우리 학교 급식을 연결할까요?</h1><p>학교를 한 번 등록해 두면, 상단의 <strong>급식</strong> 버튼에서 오늘 식단을 바로 확인할 수 있어요.</p></div>
      </section>
      <div class="search-panel">
        <div class="search-field"><Search size={18} /><input bind:this={searchInput} bind:value={query} maxlength="30" placeholder="학교 이름 두 글자 이상" aria-label="학교 이름" />{#if query}<button aria-label="검색어 지우기" onclick={() => query = ''}><X size={15} /></button>{/if}</div>
        <label>지역<select bind:value={office} aria-label="학교 지역">{#each regions as [code, name]}<option value={code}>{name}</option>{/each}</select></label>
      </div>
      <div class="results" aria-live="polite" aria-busy={loading}>
        {#if loading}<p class="status">학교를 찾고 있어요…</p>
        {:else if rows.length}
          {#each rows as item, index}
            <article class:selected={selected === index}>
              <button class="school-result" aria-pressed={selected === index} onclick={() => selected = index}>
                <span class="school-badge"><School size={16} /></span>
                <span><strong>{item.SCHUL_NM}</strong><small><MapPin size={12} /> {item.LCTN_SC_NM}</small><em>{item.ORG_RDNMA}</em></span>
                {#if selected === index}<Check size={18} />{/if}
              </button>
              {#if selected === index}<button class="register primary" disabled={busy} onclick={registerSchool}>이 학교로 등록 <ArrowRight size={16} /></button>{/if}
            </article>
          {/each}
        {:else if searched}<div class="empty"><Search size={26} /><strong>찾은 학교가 없어요.</strong><span>이름을 짧게 입력하거나 지역을 바꿔 보세요.</span></div>
        {:else}<div class="empty"><School size={26} /><strong>학교 이름을 입력해 주세요.</strong><span>같은 이름의 학교가 있을 수 있으니 지역과 주소도 확인해 주세요.</span></div>{/if}
      </div>
      <div class="bottom-row"><button class="text-button" disabled={busy} onclick={skipSchool}>나중에 등록할게요</button><span>상단의 <b>급식</b> 버튼에서 언제든 등록할 수 있어요.</span></div>

    {:else if step === 'meal-startup'}
      <section class="choice-page">
        <span class="feature-icon meal"><Utensils size={20} /></span>
        <small>급식창 열기</small>
        <h1 id="setup-title">시작할 때 급식창을 열까요?</h1>
        <p>원하는 방식은 나중에 급식 설정에서도 바꿀 수 있어요.</p>
        <div class="school-confirm"><School size={18} /><div><strong>{school?.SCHUL_NM}</strong><span>{school?.LCTN_SC_NM} · {school?.ORG_RDNMA}</span></div><button onclick={resetSchool}>학교 변경</button></div>
        <div class="choice-grid">
          <button class="choice recommended" disabled={busy} onclick={() => chooseMealStartup(true)}><span class="choice-icon"><Check size={18} /></span><span class="choice-copy"><strong>자동으로 열기</strong><small>앱을 켤 때 마지막 위치에 열어요.</small></span><ArrowRight class="choice-arrow" size={17} /></button>
          <button class="choice" disabled={busy} onclick={() => chooseMealStartup(false)}><span class="choice-icon"><X size={18} /></span><span class="choice-copy"><strong>필요할 때만 열기</strong><small>상단의 급식 버튼으로 직접 열어요.</small></span><ArrowRight class="choice-arrow" size={17} /></button>
        </div>
      </section>

    {:else}
      <section class="choice-page toolkit-page">
        <span class="feature-icon toolkit"><img src="/images/toolkit/toolkit-icon.png" alt="" /></span>
        <small>Tidy 툴킷</small>
        <h1 id="setup-title">Tidy 툴킷을 켤까요?</h1>
        <p>타이머부터 학급 투표·자리 배치까지. 교실에 필요한 도구를 작은 툴바에서 바로 꺼내 쓸 수 있어요.</p>
        <div class="selection-summary">
          <Sparkles size={16} /><div><span>급식 설정</span><strong>{school ? `${school.SCHUL_NM} · ${mealStartup ? '자동으로 열기' : '필요할 때 열기'}` : '나중에 등록'}</strong></div><button disabled={busy} onclick={() => step = school ? 'meal-startup' : 'school'}>수정</button>
        </div>
        <div class="choice-grid">
          <button class="choice recommended" disabled={busy} onclick={() => chooseToolkit(true)}><span class="choice-icon"><Check size={18} /></span><span class="choice-copy"><strong>툴킷 켜기</strong><small>지금 열고 다음 실행에도 보여요.</small></span><ArrowRight class="choice-arrow" size={17} /></button>
          <button class="choice" disabled={busy} onclick={() => chooseToolkit(false)}><span class="choice-icon"><X size={18} /></span><span class="choice-copy"><strong>사용하지 않기</strong><small>설정에서 언제든 다시 켤 수 있어요.</small></span><ArrowRight class="choice-arrow" size={17} /></button>
        </div>
      </section>
    {/if}
  </main>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <footer><span>이 안내는 완료하거나 건너뛰면 다음 업데이트에서도 다시 표시되지 않아요.</span><button disabled={busy} onclick={skipForever}>모두 나중에 설정</button></footer>
</div>
