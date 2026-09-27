<script lang="ts">
  // 학급 온도계 설정 서랍(PRD 10.11): 온도계 고르기 + 탭 4개(기본 · 단계 · 조작 · 기타). 바꾸는 즉시 저장됩니다.
  // 두 번째 온도계는 여기 "기본" 탭 맨 위에서만 늘립니다(3차 확정).
  import { X, Plus, Trash2, Wand2, ChevronLeft, ChevronRight, Heart, AlertTriangle } from 'lucide-svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import { MOODS, unitMark } from '../../lib/thermometer/moods.js';
  import { LIMITS, STAMP_SIZES } from '../../lib/thermometer/model.js';
  import { rulerCells, evenStages, fitStagesToMax, stageLimit } from '../../lib/thermometer/stages.js';
  import { deadlineChips } from '../../lib/thermometer/calendar.js';
  import { cleanLabel } from '../../lib/scoreboard/model.js';
  import { newId } from '../../lib/ids.js';

  let {
    thermometers,
    selectedId,
    shared,
    today,
    archived = [],
    onselect,
    onpatch,
    onmood,
    onstages,
    onadd,
    onremove,
    onmove,
    onrestart,
    onclearstamps,
    onclearlog,
    onshared,
    ondeleteset,
    ask,
    onclose,
  } = $props<{
    thermometers: any[];
    selectedId: string;
    shared: { sound: boolean; volume: number; reduced: boolean };
    today: string;
    archived?: { key: string; label: string }[];
    onselect: (id: string) => void;
    onpatch: (id: string, patch: Record<string, unknown>) => void;
    onmood: (id: string, mood: 'positive' | 'negative') => void;
    onstages: (id: string, stages: any[]) => void;
    onadd: (preset: 'warning' | 'praise' | 'blank') => void;
    onremove: (id: string) => void;
    onmove: (id: string, dir: -1 | 1) => void;
    onrestart: (id: string) => void;
    onclearstamps: (id: string) => void;
    onclearlog: (id: string) => void;
    onshared: (patch: Record<string, unknown>) => void;
    ondeleteset: (key: string) => void;
    ask: (text: string, detail: string, ok: string, action: () => void) => void;
    onclose: () => void;
  }>();

  const TABS = [
    { id: 'basic', label: '기본' },
    { id: 'stages', label: '단계' },
    { id: 'control', label: '조작' },
    { id: 'etc', label: '기타' },
  ] as const;
  let tab = $state<(typeof TABS)[number]['id']>('basic');
  let adding = $state(false);
  let evenCount = $state(3);
  let focusStage = $state<string | null>(null);
  const t = $derived(thermometers.find((x: any) => x.id === selectedId) ?? thermometers[0]);
  const mood = $derived(MOODS[t.mood as 'positive' | 'negative']);
  const u = $derived(unitMark(t.unit) || '');
  const idx = $derived(thermometers.findIndex((x: any) => x.id === t.id));
  const limit = $derived(stageLimit(t.max));
  const cells = $derived(rulerCells(t.max));
  const usedAt = $derived(new Set(t.stages.map((s: any) => s.at)));
  const hidden = $derived(t.stages.filter((s: any) => s.at >= t.max));
  const chips = $derived(deadlineChips(today));
  const oppositePreset = $derived(thermometers[0]?.mood === 'positive' ? 'warning' : 'praise');
  // 슬라이더를 끄는 동안은 내 값, 저장되면 다시 저장값을 따릅니다(쓰기 가능한 $derived).
  let volume = $derived(shared.volume);

  const patch = (p: Record<string, unknown>) => onpatch(t.id, p);
  const blurOnEnter = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') (e.currentTarget as HTMLElement).blur();
  };
  function numberIn(value: string, min: number, max: number) {
    const n = Math.round(Number(String(value).normalize('NFKC')));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null;
  }
  function setMax(value: number) {
    // 최대를 바꿔도 단계는 지우지 않습니다(넘치는 단계는 숨김 표시 + 옮기기 버튼).
    patch({ max: value });
  }
  function addStageAt(at: number) {
    if (usedAt.has(at)) {
      focusStage = null;
      onstages(t.id, t.stages.filter((s: any) => s.at !== at));
      return;
    }
    if (t.stages.length >= limit) return;
    const id = newId();
    onstages(t.id, [...t.stages, { id, at, label: '', reached: t.value >= at }].sort((a, b) => a.at - b.at));
    focusStage = id;
  }
  const setStage = (id: string, p: Record<string, unknown>) => onstages(t.id, t.stages.map((s: any) => (s.id === id ? { ...s, ...p } : s)).sort((a: any, b: any) => a.at - b.at));
  function fillEven() {
    const run = () => onstages(t.id, evenStages(t.max, evenCount).map((at) => ({ id: newId(), at, label: '', reached: t.value >= at })));
    if (t.stages.length) ask('지금 단계를 고르게 나눈 단계로 바꿀까요?', '적어 둔 문구도 지워져요.', '바꾸기', run);
    else run();
  }
  const focusWhen = (node: HTMLInputElement, id: string) => {
    if (focusStage === id) queueMicrotask(() => node.focus());
  };
  function setChip(i: number, value: string) {
    const next = [...t.reasons.chips];
    const clean = cleanLabel(value, LIMITS.chipText);
    if (clean) next[i] = clean;
    else next.splice(i, 1);
    patch({ reasons: { ...t.reasons, chips: next } });
  }
  let newChip = $state('');
  function addChip() {
    const clean = cleanLabel(newChip, LIMITS.chipText);
    if (!clean || t.reasons.chips.length >= LIMITS.chips || t.reasons.chips.includes(clean)) return;
    patch({ reasons: { ...t.reasons, chips: [...t.reasons.chips, clean] } });
    newChip = '';
  }
</script>

<aside class="th-drawer" aria-label="온도계 설정">
  <header class="th-drawer-head">
    <strong>설정</strong>
    <button class="th-icon-btn" aria-label="설정 닫기" title="닫기 (Esc)" onclick={onclose}><X size={18} /></button>
  </header>
  {#if thermometers.length > 1}
    <div class="th-which" role="tablist" aria-label="설정할 온도계">
      {#each thermometers as x (x.id)}<button role="tab" aria-selected={x.id === t.id} data-mood={x.mood} onclick={() => onselect(x.id)}>{#if x.mood === 'positive'}<Heart size={14} />{:else}<AlertTriangle size={14} />{/if}<span>{x.title}</span></button>{/each}
    </div>
  {/if}
  <div class="th-tabs" role="tablist">
    {#each TABS as tb (tb.id)}<button role="tab" aria-selected={tab === tb.id} onclick={() => (tab = tb.id)}>{tb.label}</button>{/each}
  </div>

  {#if tab === 'basic'}
    {#if thermometers.length < LIMITS.thermometers}
      <section class="th-add">
        {#if !adding}
          <div class="th-row"><span><b>온도계 1개 사용 중</b><small>보상·처벌처럼 두 개를 나란히 쓸 수 있어요</small></span><button class="th-btn" onclick={() => (adding = true)}><Plus size={15} />두 번째 온도계</button></div>
        {:else}
          <p class="th-hint">어떤 온도계를 더할까요?</p>
          <div class="th-presets">
            <button class:suggest={oppositePreset === 'warning'} onclick={() => { adding = false; onadd('warning'); }}><AlertTriangle size={18} /><b>경고 온도계</b><small>부정 · 빨강</small></button>
            <button class:suggest={oppositePreset === 'praise'} onclick={() => { adding = false; onadd('praise'); }}><Heart size={18} /><b>칭찬 온도계</b><small>긍정 · 파랑</small></button>
            <button onclick={() => { adding = false; onadd('blank'); }}><Plus size={18} /><b>빈 온도계</b><small>첫 온도계와 같은 무드</small></button>
          </div>
          <button class="th-link" onclick={() => (adding = false)}>취소</button>
        {/if}
      </section>
    {/if}
    <section>
      <label class="th-field"><span>제목</span><input value={t.title} maxlength={LIMITS.title} onchange={(e) => patch({ title: cleanLabel(e.currentTarget.value, LIMITS.title) || mood.title })} onkeydown={blurOnEnter} /></label>
      <p class="th-label">무드</p>
      <div class="th-moods" role="radiogroup" aria-label="무드">
        {#each ['positive', 'negative'] as m (m)}
          {@const md = MOODS[m as 'positive' | 'negative']}
          <button role="radio" aria-checked={t.mood === m} data-mood={m} onclick={() => onmood(t.id, m as 'positive' | 'negative')}>
            <svg width="30" height="58" viewBox="0 0 30 58" aria-hidden="true"><rect x="9" y="3" width="12" height="40" rx="6" fill="#fff" stroke={md.accent} stroke-width="2" /><rect x="12" y="20" width="6" height="24" fill={md.to} /><circle cx="15" cy="47" r="9" fill={md.to} stroke={md.accent} stroke-width="2" /></svg>
            <span><b>{md.label} ({m === 'positive' ? '파랑' : '빨강'})</b><small>{md.hint}</small></span>
          </button>
        {/each}
      </div>
    </section>
    <section>
      <p class="th-label">최대 온도 <small>{mood.topName}</small></p>
      <div class="th-chiprow">
        {#each [5, 10, 20, 30] as n (n)}<button class:on={t.max === n} onclick={() => setMax(n)}>{n}{u}</button>{/each}
        <input class="th-num" type="number" min={LIMITS.minMax} max={LIMITS.maxMax} value={t.max} aria-label="최대 온도 직접 입력" onchange={(e) => { const n = numberIn(e.currentTarget.value, LIMITS.minMax, LIMITS.maxMax); if (n) setMax(n); }} onkeydown={blurOnEnter} />
      </div>
      <label class="th-field"><span>{mood.topTextName}</span><input value={t.topText} maxlength={LIMITS.topText} placeholder={mood.topPlaceholder} onchange={(e) => patch({ topText: cleanLabel(e.currentTarget.value, LIMITS.topText) })} onkeydown={blurOnEnter} /></label>
      <p class="th-label">목표 기한 <small>{t.mood === 'positive' ? '이날까지 목표에 닿기' : '이날까지 한계에 닿지 않기(버티기)'}</small></p>
      <div class="th-chiprow wrap">
        <button class:on={!t.deadline} onclick={() => patch({ deadline: null })}>없음</button>
        {#each chips as c (c.id)}<button class:on={t.deadline === c.date} onclick={() => patch({ deadline: c.date })}>{c.label}</button>{/each}
        <input class="th-date" type="date" min={today} value={t.deadline ?? ''} aria-label="기한 직접 고르기" onchange={(e) => patch({ deadline: e.currentTarget.value || null })} />
      </div>
    </section>
    <section>
      <p class="th-label">단위</p>
      <div class="th-seg" role="radiogroup" aria-label="단위">
        {#each [['deg', '° (도)'], ['point', '점'], ['none', '없음']] as [id, label] (id)}<button role="radio" aria-checked={t.unit === id} onclick={() => patch({ unit: id })}>{label}</button>{/each}
      </div>
      <div class="th-row"><span><b>영하 허용</b><small>0 아래로 −{t.max}{u}까지 내려가고 구가 꽁꽁 얼어요</small></span><ToolkitSwitch label="영하 허용" checked={t.allowBelowZero} onchange={(v) => patch({ allowBelowZero: v })} /></div>
    </section>
  {:else if tab === 'stages'}
    <section>
      <p class="th-label">{mood.stageName} <small>{t.stages.length}/{limit} · 칸을 다시 누르면 꺼져요</small></p>
      <div class="th-ruler" role="group" aria-label="단계 눈금자">
        {#each cells as at (at)}<button class:on={usedAt.has(at)} aria-pressed={usedAt.has(at)} aria-label={`${at}${u} ${mood.stageName}`} disabled={!usedAt.has(at) && t.stages.length >= limit} title={`${at}${u} 단계 ${usedAt.has(at) ? '끄기' : '켜기'}`} onclick={() => addStageAt(at)}><span>{at}</span></button>{/each}
        <span class="th-ruler-top" title={mood.topName}>{t.max}</span>
      </div>
      <div class="th-even">
        <select bind:value={evenCount} aria-label="나눌 개수">{#each [2, 3, 4, 5].filter((n) => n <= limit) as n (n)}<option value={n}>{n}개</option>{/each}</select>
        <button class="th-btn" onclick={fillEven} disabled={limit < 2}><Wand2 size={15} />고르게 채우기</button>
      </div>
      {#if hidden.length}
        <p class="th-warn">최대({t.max}{u})보다 높아서 숨겨진 단계가 {hidden.length}개 있어요.
          <button class="th-btn" onclick={() => onstages(t.id, fitStagesToMax(t.stages, Math.max(...t.stages.map((s: any) => s.at)) + 1, t.max))}>최대 안쪽으로 옮기기</button></p>
      {/if}
      <ul class="th-stage-list">
        {#each t.stages as s (s.id)}
          <li class:hidden-stage={s.at >= t.max}>
            <select value={s.at} aria-label="단계 온도" onchange={(e) => setStage(s.id, { at: Number(e.currentTarget.value), reached: t.value >= Number(e.currentTarget.value) })}>
              {#each Array.from({ length: Math.max(t.max - 1, s.at) }, (_, i) => i + 1) as at (at)}<option value={at} disabled={at !== s.at && usedAt.has(at)}>{at}{u}</option>{/each}
            </select>
            <input value={s.label} maxlength={LIMITS.stageLabel} placeholder={mood.stagePlaceholders[0]} use:focusWhen={s.id}
              onchange={(e) => setStage(s.id, { label: cleanLabel(e.currentTarget.value, LIMITS.stageLabel) })} onkeydown={blurOnEnter} aria-label="단계 문구" />
            {#if s.at >= t.max}<button class="th-icon-btn" aria-label={`${s.at}${u} 숨겨진 단계 지우기`} onclick={() => onstages(t.id, t.stages.filter((x: any) => x.id !== s.id))}><Trash2 size={15} /></button>{/if}
          </li>
        {:else}
          <li class="th-empty-line">아직 단계가 없어요. 위 눈금자에서 칸을 눌러 보세요.</li>
        {/each}
      </ul>
    </section>
  {:else if tab === 'control'}
    <section>
      <p class="th-label">한 번에 올리기</p>
      <div class="th-chiprow">
        {#each [1, 2, 5] as n (n)}<button class:on={t.upStep === n} disabled={n > t.max} onclick={() => patch({ upStep: n })}>+{n}</button>{/each}
        <input class="th-num" type="number" min="1" max={t.max} value={t.upStep} aria-label="올리기 직접 입력" onchange={(e) => { const n = numberIn(e.currentTarget.value, 1, t.max); if (n) patch({ upStep: n }); }} onkeydown={blurOnEnter} />
      </div>
      <div class="th-row"><span><b>내리기도 같게</b><small>끄면 내리기 단위를 따로 정해요</small></span><ToolkitSwitch label="내리기도 같게" checked={t.linkSteps} onchange={(v) => patch({ linkSteps: v })} /></div>
      {#if !t.linkSteps}
        <p class="th-label">한 번에 내리기</p>
        <div class="th-chiprow">
          {#each [1, 2, 5] as n (n)}<button class:on={t.downStep === n} disabled={n > t.max} onclick={() => patch({ downStep: n })}>−{n}</button>{/each}
          <input class="th-num" type="number" min="1" max={t.max} value={t.downStep} aria-label="내리기 직접 입력" onchange={(e) => { const n = numberIn(e.currentTarget.value, 1, t.max); if (n) patch({ downStep: n }); }} onkeydown={blurOnEnter} />
        </div>
      {/if}
    </section>
    <section>
      <p class="th-label">자동 식힘 · 초기화</p>
      <div class="th-radio-list" role="radiogroup" aria-label="자동 식힘">
        {#each [['off', '없음', '직접 내리거나 새로 시작해요'], ['daily-reset', '매일 아침 0으로', '하루 단위 경고 온도계에 좋아요'], ['daily-cool', `매일 ${t.autoCool.amount}${u}씩 식힘`, '“반성하면 식어요”'], ['weekly-reset', '매주 월요일 0으로', '주 단위 목표에 좋아요']] as [id, label, hint] (id)}
          <button role="radio" aria-checked={t.autoCool.mode === id} onclick={() => patch({ autoCool: { ...t.autoCool, mode: id } })}><i></i><span><b>{label}</b><small>{hint}</small></span></button>
        {/each}
      </div>
      {#if t.autoCool.mode === 'daily-cool'}
        <label class="th-field inline"><span>하루에 식는 양</span><input class="th-num" type="number" min="1" max={t.max} value={t.autoCool.amount}
            onchange={(e) => { const n = numberIn(e.currentTarget.value, 1, t.max); if (n) patch({ autoCool: { ...t.autoCool, amount: n } }); }} onkeydown={blurOnEnter} /></label>
      {/if}
      {#if t.autoCool.mode !== 'off'}
        <div class="th-row"><span><b>학교 가는 날만 세기</b><small>토·일은 식히지 않아요</small></span><ToolkitSwitch label="학교 가는 날만 세기" checked={t.autoCool.weekdaysOnly} onchange={(v) => patch({ autoCool: { ...t.autoCool, weekdaysOnly: v } })} /></div>
      {/if}
    </section>
    <section>
      <div class="th-row"><span><b>사유 칩 보이기</b><small>올린 뒤 4초 동안 이유를 한 번 더 눌러 붙여요</small></span><ToolkitSwitch label="사유 칩 보이기" checked={t.reasons.show} onchange={(v) => patch({ reasons: { ...t.reasons, show: v } })} /></div>
      {#if t.reasons.show}
        <div class="th-chip-editor">
          {#each t.reasons.chips as c, i (c)}<input value={c} maxlength={LIMITS.chipText} aria-label="사유 칩" onchange={(e) => setChip(i, e.currentTarget.value)} onkeydown={blurOnEnter} />{/each}
          {#if t.reasons.chips.length < LIMITS.chips}<input placeholder="+ 추가" maxlength={LIMITS.chipText} bind:value={newChip} onchange={addChip} onkeydown={blurOnEnter} aria-label="사유 칩 추가" />{/if}
        </div>
      {/if}
    </section>
  {:else}
    <section>
      <p class="th-label">도장판 <small>{t.mood === 'positive' ? '목표를 달성할 때마다 도장' : '기한까지 약속을 지키면 도장'}</small></p>
      <div class="th-seg" role="radiogroup" aria-label="도장판 칸 수">
        {#each STAMP_SIZES as n (n)}<button role="radio" aria-checked={t.stamps.size === n} onclick={() => patch({ stamps: { ...t.stamps, size: n, count: Math.min(t.stamps.count, n) } })}>{n}칸</button>{/each}
      </div>
      <div class="th-goal-setting">
        <span class="th-goal-kicker">도장판 목표</span>
        <label class="th-field" for="th-stamp-reward"><span>{t.stamps.size}칸을 다 채우면</span></label>
        <input id="th-stamp-reward" class="th-goal-input" value={t.stamps.rewardText} maxlength={LIMITS.rewardText} placeholder="예: 영화 보기" onchange={(e) => patch({ stamps: { ...t.stamps, rewardText: cleanLabel(e.currentTarget.value, LIMITS.rewardText) } })} onkeydown={blurOnEnter} />
      </div>
      <p class="th-hint">지금까지 도장판 {t.stamps.completedBoards}번 완성</p>
    </section>
    <section>
      <p class="th-label">소리 · 움직임 <small>모든 온도계에 함께 적용</small></p>
      <div class="th-row"><span><b>효과음</b><small>M 키로도 켜고 꺼요</small></span><ToolkitSwitch label="효과음" checked={shared.sound} onchange={(v) => onshared({ sound: v })} /></div>
      <label class="th-row th-volume" class:off={!shared.sound}><span><b>음량</b></span><input type="range" min="0" max="100" step="5" bind:value={volume} disabled={!shared.sound} onchange={() => onshared({ volume: Number(volume) })} aria-label="음량" /><output>{volume}</output></label>
      <div class="th-row"><span><b>동작 줄이기</b><small>꽃가루·출렁임 대신 짧게 반짝여요</small></span><ToolkitSwitch label="동작 줄이기" checked={shared.reduced} onchange={(v) => onshared({ reduced: v })} /></div>
    </section>
    {#if thermometers.length > 1}
      <section>
        <p class="th-label">순서</p>
        <div class="th-chiprow"><button disabled={idx === 0} onclick={() => onmove(t.id, -1)}><ChevronLeft size={15} />왼쪽으로</button><button disabled={idx === thermometers.length - 1} onclick={() => onmove(t.id, 1)}>오른쪽으로<ChevronRight size={15} /></button></div>
      </section>
    {/if}
    <section class="th-danger">
      <button class="th-btn danger" onclick={() => ask(`${t.title}을 0부터 새로 시작할까요?`, '도장과 기록은 그대로 남아요. 되돌리기로 복구할 수 있어요.', '새로 시작', () => onrestart(t.id))}>새로 시작</button>
      <button class="th-btn danger" onclick={() => ask('도장판을 비울까요?', '완성 횟수와 도장 날짜 기록은 남아요.', '비우기', () => onclearstamps(t.id))}>도장판 비우기</button>
      <button class="th-btn danger" onclick={() => ask('변화 기록과 주간 그래프를 지울까요?', '온도 값과 도장은 그대로예요.', '지우기', () => onclearlog(t.id))}>기록 지우기</button>
      <button class="th-btn danger" onclick={() => ask(`${t.title}를 삭제할까요?`, '10초 안에 되돌릴 수 있어요.', '삭제', () => onremove(t.id))}><Trash2 size={15} />이 온도계 삭제</button>
    </section>
    {#if archived.length}
      <section>
        <p class="th-label">보관된 온도계 <small>명단에서 지워진 학급</small></p>
        <ul class="th-archived">{#each archived as a (a.key)}<li><span>{a.label}</span><button class="th-btn danger" onclick={() => ask(`${a.label}의 온도계를 지울까요?`, '지우면 되돌릴 수 없어요.', '지우기', () => ondeleteset(a.key))}>지우기</button></li>{/each}</ul>
      </section>
    {/if}
  {/if}
</aside>
