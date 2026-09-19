<script lang="ts">
  import { AlarmClock, BellRing, Check, Clock3, Volume2 } from 'lucide-svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import ToolkitSelect from '../toolkit/ToolkitSelect.svelte';
  import { PRESETS, WARNING_LEADS, WARNING_DURATIONS } from '../../lib/toolkit/preferences.js';
  let { id, kind, prefs, phase, remaining, dialRange, onchange, onset, onpreview } = $props<{
    id?: string;
    kind: string;
    prefs: Record<string, any>;
    phase: string;
    remaining: number;
    dialRange: number;
    onchange: (patch: Record<string, unknown>) => void;
    onset: (ms: number) => void;
    onpreview: (name: string) => void;
  }>();
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
  const soundRows = $derived(
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
            onclick={() => onset(minute * 60000)}>{minute}<span>분</span></button
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
  {#if kind === 'hourglass'}<section class="settings-section">
      <div class="settings-row standalone-setting">
        <div class="sound-label"><strong>남은 시간 표시</strong><small>모래시계 아래에 숫자도 함께 보여요.</small></div><ToolkitSwitch
          label="남은 시간 표시"
          checked={prefs.showRemainingTime}
          onchange={(v) => onchange({ showRemainingTime: v })}
        />
      </div>
    </section>{/if}
  <section class="settings-section sound-settings">
    <header class="settings-section-heading">
      <span class="settings-section-icon" aria-hidden="true"><Volume2 size={18} /></span>
      <div><h2>소리</h2><p>필요한 알림만 골라 사용할 수 있어요.</p></div>
    </header>
    <div class="sound-setting-list">
      {#each soundRows as row}<div class="sound-setting-card">
          <div class="settings-row">
            <div class="sound-label">
              <span class="sound-symbol" aria-hidden="true">
                {#if row.sound === 'tick'}<Clock3 size={17} />{:else if row.sound === 'warning'}<BellRing
                    size={17}
                  />{:else}<AlarmClock size={17} />{/if}
              </span>
              <span><strong>{row.name}</strong><small>{row.description}</small></span>
            </div>
            <div class="sound-actions">
              <button
                class="sound-preview"
                aria-label={`${row.name} 미리 듣기`}
                title={`${row.name} 미리 듣기`}
                onclick={() => onpreview(row.sound)}><Volume2 size={15} /><span>듣기</span></button
              ><ToolkitSwitch
                label={row.name}
                checked={prefs[row.key]}
                onchange={(v) => onchange({ [row.key]: v })}
              />
            </div>
          </div>
          {#if row.sound === 'warning' && prefs.warningEnabled}<div class="warning-options">
              <div class="warning-option"><span>알림 시점</span><ToolkitSelect
                  label="종료 경고 시점"
                  value={String(prefs.warningLeadSeconds)}
                  options={WARNING_LEADS.map((n) => ({ value: String(n), label: `${n}초 전` }))}
                  onchange={(v) => onchange({ warningLeadSeconds: Number(v) })}
                /></div
              ><div class="warning-option"><span>울림 시간</span><ToolkitSelect
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
              >
            </div>{/if}
        </div>
      {/each}
    </div>
  </section>
</aside>
