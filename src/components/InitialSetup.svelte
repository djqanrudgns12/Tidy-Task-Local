<script lang="ts">
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
      await completeInitialSetup({ mealStartup, toolkitEnabled: value, appVersion: '5.5.3' });
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
        appVersion: '5.5.3',
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
    <span><GripHorizontal size={15} /> 처음 설정</span>
    <button aria-label="처음 설정 건너뛰기" title="건너뛰기 · 다시 표시되지 않음" disabled={busy} onclick={skipForever}><X size={18} /></button>
  </header>

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
        <p>타이머·뽑기·알림장 같은 교실 도구를 작은 툴바에서 바로 꺼내 쓸 수 있어요.</p>
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

<style>
  :global(html),:global(body){margin:0;background:transparent!important;color:#28352f;font-family:'메이플스토리 L','Malgun Gothic',sans-serif;user-select:none}
  .setup{--green:#416551;--green-soft:#edf3e9;--meal:#c8782d;--ink:#28352f;--muted:#647068;--line:#dce4dc;display:flex;flex-direction:column;width:calc(100vw - 20px);max-width:500px;height:calc(100dvh - 20px);max-height:600px;min-height:0;margin:10px auto;overflow:hidden;background:#fffdf9;border:1px solid #d7dfd6;border-radius:18px;box-shadow:0 18px 55px rgba(38,55,46,.22),0 3px 12px rgba(38,55,46,.12);box-sizing:border-box;outline:none;font-size:14px;letter-spacing:-.015em}.setup *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;color:inherit}button:disabled{cursor:default;opacity:.55}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #d99543;outline-offset:2px}strong,h1{font-family:'메이플스토리 B','메이플스토리 L',sans-serif}
  .window-bar{height:39px;flex:0 0 39px;display:flex;align-items:center;justify-content:space-between;padding:0 9px 0 15px;border-bottom:1px solid var(--line);background:#f3f6f0;color:#5e6c63}.window-bar span{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700}.window-bar button{display:grid;place-items:center;width:31px;height:29px;border:0;border-radius:8px;background:transparent}.window-bar button:hover{background:#e2e9df}
  .progress{position:relative;display:grid;grid-template-columns:80px 1fr 80px;align-items:center;min-height:51px;padding:8px 14px;border-bottom:1px solid var(--line);background:#fff}.progress-side{display:flex}.previous{display:flex;align-items:center;gap:4px;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:var(--green);font-size:12px;font-weight:700}.previous:hover{background:var(--green-soft)}.steps{display:flex;align-items:center;justify-content:center;gap:8px}.steps span{display:flex;align-items:center;gap:6px;color:#8a948e;font-size:12px;font-weight:700}.steps b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#e8ece7;color:#758078;font-size:11px}.steps span.active{color:var(--green)}.steps span.active b{background:var(--green);color:white}.steps i{width:34px;height:1px;background:var(--line)}.step-count{justify-self:end;color:#78837c;font-size:12px;font-weight:700}
  main{flex:1;min-height:0;overflow:auto;padding:21px 24px 17px;scrollbar-width:thin;scrollbar-color:#bdc9bf transparent}.intro{display:flex;gap:12px;align-items:flex-start}.intro h1,.choice-page h1{margin:4px 0 7px;color:var(--ink);font-size:21px;line-height:1.4;letter-spacing:-.045em}.intro p,.choice-page>p{margin:0;color:var(--muted);font-size:13px;line-height:1.65;word-break:keep-all}.intro small,.choice-page>small{color:var(--green);font-size:12px;font-weight:800}.feature-icon{display:grid;place-items:center;flex:0 0 auto;width:40px;height:40px;border-radius:13px}.feature-icon.meal{background:#fff0df;color:var(--meal)}.feature-icon.toolkit{background:#e7efe3}.feature-icon.toolkit img{width:33px;height:33px;object-fit:contain}
  .search-panel{display:grid;grid-template-columns:1fr 110px;gap:9px;margin-top:17px}.search-field{display:flex;align-items:center;gap:8px;height:43px;padding:0 11px;border:1px solid #cfd8cf;border-radius:11px;background:white;color:var(--muted)}.search-field:focus-within{border-color:#7f9987;box-shadow:0 0 0 3px #dfeadf}.search-field input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:var(--ink);font-size:14px}.search-field input::placeholder{color:#88928c}.search-field button{display:grid;place-items:center;padding:5px;border:0;background:transparent}.search-panel>label{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:5px;padding:0 9px;border:1px solid #cfd8cf;border-radius:11px;background:white;color:var(--muted);font-size:12px}.search-panel select{min-width:0;border:0;background:transparent;color:var(--ink);outline:0;font-size:13px}
  .results{min-height:215px;margin-top:10px;padding:6px;border:1px solid var(--line);border-radius:13px;background:#fff}.results article{padding:3px;border-radius:10px}.results article+article{border-top:1px solid #edf0eb}.results article.selected{background:#eff5ec}.school-result{display:grid;grid-template-columns:36px 1fr 20px;gap:10px;align-items:center;width:100%;padding:8px;border:0;background:transparent;text-align:left}.school-badge{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:#e9f0e6;color:var(--green)}.school-result>span:nth-child(2){display:flex;min-width:0;flex-direction:column;gap:3px}.school-result strong{font-size:14px}.school-result small{display:flex;align-items:center;color:var(--muted);font-size:12px}.school-result em{overflow:hidden;color:#77827b;font-size:11px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}.register{margin:0 7px 7px auto}.primary{display:flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:9px;background:var(--green);color:white;padding:9px 13px;font-size:13px;font-weight:800}.status,.empty{display:flex;min-height:201px;align-items:center;justify-content:center;color:var(--muted)}.empty{flex-direction:column;gap:8px;padding:16px;text-align:center}.empty strong{color:var(--ink);font-size:14px}.empty span{font-size:12px;line-height:1.6}.bottom-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;color:var(--muted);font-size:12px}.text-button{border:0;background:transparent;color:var(--green);font-size:12px;font-weight:700;text-decoration:underline;text-underline-offset:3px}.bottom-row span{text-align:right;line-height:1.5}
  .choice-page{max-width:430px;margin:6px auto 0;text-align:center}.choice-page>.feature-icon{margin:0 auto 9px}.choice-page>p{max-width:390px;margin:0 auto}.school-confirm,.selection-summary{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;margin:17px 0 13px;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:#f8faf6;text-align:left;color:var(--green)}.school-confirm div,.selection-summary div{display:flex;min-width:0;flex-direction:column;gap:3px}.school-confirm span{overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.school-confirm button,.selection-summary button{border:0;border-radius:7px;background:#e4ece0;color:var(--green);padding:7px 9px;font-size:12px;font-weight:700}.selection-summary div>span{color:var(--muted);font-size:11px}.selection-summary strong{overflow:hidden;color:var(--ink);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.choice-grid{display:grid;gap:9px;margin-top:14px}.choice{display:grid;grid-template-columns:36px 1fr 20px;align-items:center;gap:11px;min-height:69px;width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:13px;background:white;text-align:left;transition:border-color .15s,background .15s,transform .15s}.choice:hover{border-color:#91a594;background:#fafcf8;transform:translateY(-1px)}.choice-icon{display:grid;place-items:center;width:35px;height:35px;border-radius:11px;background:#edf0ed;color:#66736b}.choice-copy{display:flex;min-width:0;flex-direction:column;gap:4px}.choice strong{color:var(--ink);font-size:14px}.choice small{color:var(--muted);font-size:12px;line-height:1.45}.choice.recommended{border-color:#aabaaa;background:#f2f7ef}.choice.recommended .choice-icon{background:var(--green);color:white}.choice :global(.choice-arrow){color:#78847d}.toolkit-page{margin-top:3px}.toolkit-page .selection-summary{margin-top:17px}
  .error{margin:0;padding:9px 15px;background:#fff0e7;color:#95372c;font-size:12px;text-align:center}.setup>footer{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;min-height:45px;padding:8px 14px;border-top:1px solid var(--line);background:#fafbf8;color:#69756e;font-size:11px}.setup>footer span{line-height:1.45}.setup>footer button{flex:0 0 auto;border:0;background:transparent;color:#5e6f64;font-size:12px;font-weight:700;text-decoration:underline;text-underline-offset:3px}
  @media(max-width:440px){.setup{width:calc(100vw - 12px);margin:6px auto;height:calc(100dvh - 12px);border-radius:14px}.progress{grid-template-columns:68px 1fr 50px;padding-inline:8px}.steps i{width:20px}main{padding:18px 15px 14px}.intro h1,.choice-page h1{font-size:19px}.search-panel{grid-template-columns:1fr}.search-panel>label{height:40px}.results{min-height:190px}.status,.empty{min-height:176px}.setup>footer span{display:none}.setup>footer{justify-content:center}}
</style>
