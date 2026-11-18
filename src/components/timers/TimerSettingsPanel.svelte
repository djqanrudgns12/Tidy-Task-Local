<script lang="ts">
  import { AlarmClock, BellRing, Check, Clock3, Eye, Minus, Plus, RotateCcw, Type, Volume2 } from 'lucide-svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import ToolkitSelect from '../toolkit/ToolkitSelect.svelte';
  import { PRESETS, WARNING_LEADS, WARNING_DURATIONS } from '../../lib/toolkit/preferences.js';
  import {
    TITLE_SCALE_MAX,
    TITLE_SCALE_MIN,
    TITLE_SCALE_PRESETS,
    NOTE_SCALE_MAX,
    NOTE_SCALE_MIN,
    NOTE_SCALE_PRESETS,
    defaultTimerDisplayPreferences,
    type TimerDisplayPreferences,
  } from '../../lib/timers/timerDisplayPreferences.js';
  import {
    DEFAULT_SOUNDS,
    SOUND_GROUPS,
    SOUND_LIBRARY,
    selectedSounds,
    type SoundRole,
  } from '../../lib/timers/soundLibrary.js';
  let {
    id,
    kind,
    prefs,
    displayPrefs = defaultTimerDisplayPreferences(),
    phase,
    remaining,
    dialRange,
    onchange,
    ondisplaychange,
    onset,
    onpreview,
    onsound,
  } = $props<{
    id?: string;
    kind: string;
    prefs: Record<string, any>;
    displayPrefs?: TimerDisplayPreferences;
    phase: string;
    remaining: number;
    dialRange: number;
    onchange: (patch: Record<string, unknown>) => void;
    ondisplaychange?: (patch: Partial<TimerDisplayPreferences>) => void;
    onset: (ms: number) => void;
    onpreview: (name: string) => void;
    onsound: (role: SoundRole, id: string) => void;
  }>();
  // 선택 상자 항목: 같은 성격끼리 묶고, 이 타이머에 원래 있던 소리에는 "기본"을 붙여 되돌아가기 쉽게 합니다.
  const soundOptions = $derived(
    Object.fromEntries(
      (['tick', 'warning', 'end'] as SoundRole[]).map((role) => [
        role,
        SOUND_LIBRARY[role].map((option) => ({
          value: option.id,
          label: option.label,
          group: SOUND_GROUPS[role][option.group],
          note: DEFAULT_SOUNDS[kind]?.[role] === option.id ? '기본' : undefined,
        })),
      ]),
    ) as Record<SoundRole, { value: string; label: string; group: string; note?: string }[]>,
  );
  // 저장값이 목록에 없으면(다른 버전·손상) 실제로 울리는 기본 소리를 보여 줍니다.
  const currentSounds = $derived(selectedSounds(kind, prefs));
  let minutes = $state<number | string>(5),
    seconds = $state<number | string>(0),
    inputError = $state('');
  let syncedRemaining: number | undefined;
  let syncedPhase: string | undefined;
  $effect(() => {
    if (phase !== 'running' && (remaining !== syncedRemaining || phase !== syncedPhase)) {
      syncedRemaining = remaining;
      syncedPhase = phase;
      minutes = Math.floor(Math.ceil(remaining / 1000) / 60);
      seconds = Math.ceil(remaining / 1000) % 60;
    }
  });
  function apply() {
    const m = Number(minutes),
      s = Number(seconds);
    if (
      minutes === '' ||
      seconds === '' ||
      !Number.isInteger(m) ||
      !Number.isInteger(s) ||
      m < 0 ||
      s < 0 ||
      s > 59 ||
      m * 60 + s > 3600
    ) {
      inputError = '0초부터 60분까지 입력해 주세요.';
      return;
    }
    inputError = '';
    onset((m * 60 + s) * 1000);
  }
  type SoundRow = { key: string; name: string; description: string; sound: SoundRole };
  const isCustomDisplay = $derived(
    displayPrefs.titleScale !== 100 ||
      displayPrefs.noteScale !== 100 ||
      displayPrefs.noteAlign !== 'auto' ||
      displayPrefs.layoutFocus !== 'balanced',
  );
  function stepScale(key: 'titleScale' | 'noteScale', delta: number) {
    const min = key === 'titleScale' ? TITLE_SCALE_MIN : NOTE_SCALE_MIN;
    const max = key === 'titleScale' ? TITLE_SCALE_MAX : NOTE_SCALE_MAX;
    const next = Math.max(min, Math.min(max, Math.round((displayPrefs[key] + delta) / 5) * 5));
    if (next !== displayPrefs[key]) ondisplaychange?.({ [key]: next });
  }
  function resetDisplayPrefs() {
    ondisplaychange?.({
      titleScale: 100,
      noteScale: 100,
      noteAlign: 'auto',
      layoutFocus: 'balanced',
    });
  }
  const presetLabel = (val: number) =>
    val === 100 ? '자동' : val < 100 ? '작게' : val <= 125 ? '크게' : '더 크게';
  const soundRows = $derived<SoundRow[]>(
    kind === 'stopwatch'
      ? [
          {
            key: 'tickEnabled',
            name: '시계음',
            description: '초의 흐름을 소리로 알려줘요.',
            sound: 'tick',
          },
        ]
      : [
          {
            key: 'tickEnabled',
            name: '시계음',
            description: '초의 흐름을 소리로 알려줘요.',
            sound: 'tick',
          },
          {
            key: 'warningEnabled',
            name: '종료 경고음',
            description: '끝나기 전에 미리 알려줘요.',
            sound: 'warning',
          },
          {
            key: 'endEnabled',
            name: '종료음',
            description: '시간이 끝나는 순간 울려요.',
            sound: 'end',
          },
        ],
  );
</script>

<aside
  {id}
  class="timer-settings-panel"
  class:analog-settings={kind === 'analog'}
  class:stopwatch-settings={kind === 'stopwatch'}
  aria-label="타이머 설정"
>
  {#if kind !== 'stopwatch'}<section class="settings-section time-settings-section">
      <header class="settings-section-heading">
        <span class="settings-section-icon" aria-hidden="true"><Clock3 size={18} /></span>
        <div><h2>시간 설정</h2><p>직접 입력하거나 빠르게 선택하세요.</p></div>
      </header>
      <form
        class="time-inputs"
        onsubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label class="time-field"
          ><span>분</span><input
            aria-label="분"
            type="number"
            inputmode="numeric"
            min="0"
            max="60"
            bind:value={minutes}
            disabled={phase === 'running'}
          /></label
        ><b aria-hidden="true">:</b><label class="time-field"
          ><span>초</span><input
            aria-label="초"
            type="number"
            inputmode="numeric"
            min="0"
            max="59"
            bind:value={seconds}
            disabled={phase === 'running'}
          /></label
        ><button class="time-apply" type="submit" disabled={phase === 'running'}
          ><Check size={17} strokeWidth={2.4} /><span>시간 적용</span></button
        >
      </form>
      {#if inputError}<p role="alert" class="tk-error">{inputError}</p>{/if}
      <div class="preset-heading"><strong>빠른 설정</strong><span>선택 즉시 적용</span></div>
      <div class="time-presets">
        {#each PRESETS as minute}<button
            disabled={phase === 'running'}
            class:selected={Math.round(remaining) === minute * 60000}
            aria-pressed={Math.round(remaining) === minute * 60000}
            onclick={() => onset(minute * 60000)}>{minute < 1 ? minute * 60 : minute}<span>{minute < 1 ? '초' : '분'}</span></button
          >{/each}
      </div>
    </section>{/if}
  {#if kind === 'analog'}<section class="settings-section dial-settings-section">
      <header class="settings-section-heading compact">
        <span class="settings-section-icon" aria-hidden="true"><AlarmClock size={18} /></span>
        <div><h2>한 바퀴 기준</h2><p>눈금이 나타내는 시간 범위예요.</p></div>
      </header>
      <div class="dial-bases">
        {#each [30, 60] as range}<button
            disabled={range === 30 && remaining > 1800000}
            title={range === 30 && remaining > 1800000 ? '남은 시간이 30분보다 많아요.' : undefined}
            class:selected={dialRange === range}
            aria-pressed={dialRange === range}
            onclick={() => onchange({ dialRangeMinutes: range })}>{range}분</button
          >{/each}
      </div>
    </section>{/if}
  <!-- 왜 모든 설정 줄이 같은 틀(아이콘 · 이름/설명 · 오른쪽 끝 토글)인가:
       토글·선택 상자의 오른쪽 끝이 한 줄로 맞아야 위아래로 훑기만 해도 켜짐/꺼짐을 읽을 수 있습니다. -->
  {#if kind === 'hourglass'}<section class="settings-section">
      <div class="setting-card" class:off={!prefs.showRemainingTime}>
        <div class="setting-row">
          <span class="setting-symbol" aria-hidden="true"><Eye size={18} /></span>
          <span class="setting-copy"
            ><span class="setting-title"><strong>남은 시간 표시</strong></span><small
              >모래시계 아래에 숫자도 함께 보여요.</small
            ></span
          ><ToolkitSwitch
            label="남은 시간 표시"
            checked={prefs.showRemainingTime}
            onchange={(v) => onchange({ showRemainingTime: v })}
          />
        </div>
      </div>
    </section>{/if}
  <section class="settings-section display-settings-section">
    <header class="settings-section-heading">
      <span class="settings-section-icon" aria-hidden="true"><Type size={18} /></span>
      <div class="display-heading-copy">
        <div class="display-heading-title">
          <h2>글자와 화면</h2>
          <span class="display-shared-badge">공통</span>
        </div>
        <p>창 크기에 맞춘 자동 크기에서 내 취향대로 조절해요.</p>
      </div>
      {#if isCustomDisplay}
        <button
          type="button"
          class="display-reset-btn"
          title="글자와 화면 비율을 기본값(자동)으로 되돌리기"
          onclick={resetDisplayPrefs}><RotateCcw size={13} /><span>기본값</span></button
        >
      {/if}
    </header>
    <div class="display-control-stack">
      <div class="display-scale-card">
        <div class="display-scale-head">
          <strong>제목 크기</strong>
          <div class="display-stepper">
            <button
              type="button"
              aria-label="제목 크기 줄이기"
              disabled={displayPrefs.titleScale <= TITLE_SCALE_MIN}
              onclick={() => stepScale('titleScale', -5)}><Minus size={13} /></button
            >
            <span class:custom={displayPrefs.titleScale !== 100}>{displayPrefs.titleScale}%</span>
            <button
              type="button"
              aria-label="제목 크기 키우기"
              disabled={displayPrefs.titleScale >= TITLE_SCALE_MAX}
              onclick={() => stepScale('titleScale', 5)}><Plus size={13} /></button
            >
          </div>
        </div>
        <div class="display-chip-row" role="group" aria-label="제목 크기 빠른 선택">
          {#each TITLE_SCALE_PRESETS as preset}
            <button
              type="button"
              class:selected={displayPrefs.titleScale === preset}
              aria-pressed={displayPrefs.titleScale === preset}
              onclick={() => ondisplaychange?.({ titleScale: preset })}>{presetLabel(preset)}</button
            >
          {/each}
        </div>
      </div>
      <div class="display-scale-card">
        <div class="display-scale-head">
          <strong>설명 크기</strong>
          <div class="display-stepper">
            <button
              type="button"
              aria-label="설명 크기 줄이기"
              disabled={displayPrefs.noteScale <= NOTE_SCALE_MIN}
              onclick={() => stepScale('noteScale', -5)}><Minus size={13} /></button
            >
            <span class:custom={displayPrefs.noteScale !== 100}>{displayPrefs.noteScale}%</span>
            <button
              type="button"
              aria-label="설명 크기 키우기"
              disabled={displayPrefs.noteScale >= NOTE_SCALE_MAX}
              onclick={() => stepScale('noteScale', 5)}><Plus size={13} /></button
            >
          </div>
        </div>
        <div class="display-chip-row" role="group" aria-label="설명 크기 빠른 선택">
          {#each NOTE_SCALE_PRESETS as preset}
            <button
              type="button"
              class:selected={displayPrefs.noteScale === preset}
              aria-pressed={displayPrefs.noteScale === preset}
              onclick={() => ondisplaychange?.({ noteScale: preset })}>{presetLabel(preset)}</button
            >
          {/each}
        </div>
      </div>
      <div class="display-option-row">
        <span>설명 정렬</span>
        <div class="display-segmented" role="radiogroup" aria-label="설명 정렬">
          {#each [['auto', '자동'], ['center', '가운데'], ['left', '왼쪽']] as [val, label]}
            <button
              type="button"
              role="radio"
              aria-checked={displayPrefs.noteAlign === val}
              class:selected={displayPrefs.noteAlign === val}
              onclick={() =>
                ondisplaychange?.({ noteAlign: val as TimerDisplayPreferences['noteAlign'] })}
              >{label}</button
            >
          {/each}
        </div>
      </div>
      <div class="display-option-row">
        <span>화면 비중</span>
        <div class="display-segmented" role="radiogroup" aria-label="화면 비중">
          {#each [['balanced', '균형'], ['note', '설명 강조'], ['timer', '시계 강조']] as [val, label]}
            <button
              type="button"
              role="radio"
              aria-checked={displayPrefs.layoutFocus === val}
              class:selected={displayPrefs.layoutFocus === val}
              onclick={() =>
                ondisplaychange?.({ layoutFocus: val as TimerDisplayPreferences['layoutFocus'] })}
              >{label}</button
            >
          {/each}
        </div>
      </div>
    </div>
  </section>
  <section class="settings-section sound-settings">
    <header class="settings-section-heading">
      <span class="settings-section-icon" aria-hidden="true"><Volume2 size={18} /></span>
      <div><h2>소리</h2><p>필요한 알림만 골라 사용할 수 있어요.</p></div>
    </header>
    <div class="setting-card-list">
      {#each soundRows as row}<div class="setting-card" class:off={!prefs[row.key]}>
          <div class="setting-row">
            <span class="setting-symbol" aria-hidden="true">
              {#if row.sound === 'tick'}<Clock3 size={18} />{:else if row.sound === 'warning'}<BellRing
                  size={18}
                />{:else}<AlarmClock size={18} />{/if}
            </span>
            <!-- 듣기는 "이 소리"를 들어 보는 버튼이라 소리 이름 바로 옆에 붙입니다.
                 토글 옆에 두면 설명 글이 좁아져 두 줄로 꺾이고 카드 높이가 제각각이 됩니다. -->
            <span class="setting-copy"
              ><span class="setting-title"
                ><strong>{row.name}</strong><button
                  class="sound-preview"
                  aria-label={`${row.name} 미리 듣기`}
                  title={`${row.name} 미리 듣기`}
                  onclick={() => onpreview(row.sound)}><Volume2 size={14} /><span>듣기</span></button
                ></span
              ><small>{row.description}</small></span
            ><ToolkitSwitch
              label={row.name}
              checked={prefs[row.key]}
              onchange={(v) => onchange({ [row.key]: v })}
            />
          </div>
          <!-- 세부 옵션은 이름 칸에 맞춰 들여 써서 "이 소리에 딸린 설정"임을 보여 주고,
               선택 상자는 위 토글과 같은 오른쪽 끝에 맞춥니다. 가장 자주 바꾸는 "소리 종류"가 맨 위입니다.
               꺼 둔 소리는 세부 옵션을 접어 카드가 짧게 유지됩니다. -->
          {#if prefs[row.key]}<div class="setting-options">
              <div class="setting-option"><span>소리</span><ToolkitSelect
                  label={`${row.name} 종류`}
                  value={currentSounds[row.sound]?.id ?? ''}
                  options={soundOptions[row.sound]}
                  contentClass="sound-select-content"
                  onchange={(v) => onsound(row.sound, v)}
                /></div
              >{#if row.sound === 'warning'}<div class="setting-option"><span>알림 시점</span><ToolkitSelect
                    label="종료 경고 시점"
                    value={String(prefs.warningLeadSeconds)}
                    options={WARNING_LEADS.map((n) => ({ value: String(n), label: `${n}초 전` }))}
                    onchange={(v) => onchange({ warningLeadSeconds: Number(v) })}
                  /></div
                ><div class="setting-option"><span>울림 시간</span><ToolkitSelect
                    label="종료 경고 지속"
                    value={prefs.warningDurationSeconds == null
                      ? 'continuous'
                      : String(prefs.warningDurationSeconds)}
                    options={WARNING_DURATIONS.map((n) => ({
                      value: n == null ? 'continuous' : String(n),
                      label: n == null ? '계속 울림' : `${n}초 지속`,
                    }))}
                    onchange={(v) =>
                      onchange({ warningDurationSeconds: v === 'continuous' ? null : Number(v) })}
                  /></div
                >{/if}
            </div>{/if}
        </div>
      {/each}
    </div>
  </section>
</aside>
