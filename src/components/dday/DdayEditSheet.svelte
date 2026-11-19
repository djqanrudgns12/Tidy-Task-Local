<script>
  import { untrack } from 'svelte';
  import {
    ArrowLeft,
    CalendarDays,
    Check,
    LayoutGrid,
    ListTodo,
    PanelTop,
    Repeat,
    Trash2,
  } from 'lucide-svelte';
  import {
    DDAY_ICONS,
    DDAY_TITLE_MAX,
    DDAY_TONES,
    computeDdayCounter,
    formatFullDate,
    resolveToneColor,
    stripHtmlToTitle,
    truncateCodepoints,
  } from '../../lib/dday/ddayModel.js';
  import { calendarPalette, toStyleText } from '../../lib/datePicker/palette.js';
  import CalendarPanel from '../datePicker/CalendarPanel.svelte';
  import DdayIcon from './DdayIcon.svelte';

  /** @type {Record<import('../../lib/dday/ddayModel.js').DdayIconId, string>} */
  const ICON_LABELS = {
    flag: '깃발',
    puzzle: '퍼즐',
    snow: '눈꽃',
    sparkle: '반짝',
    sprout: '새싹',
    star: '별',
    trophy: '트로피',
    cal: '달력',
  };

  /** @type {Record<import('../../lib/dday/ddayModel.js').DdayToneId, string>} */
  const TONE_LABELS = {
    accent: '테마색',
    emerald: '에메랄드',
    sky: '스카이',
    lilac: '라일락',
    rose: '로즈',
    gold: '골드',
  };

  /**
   * @type {{
   *   mode: 'create' | 'edit',
   *   item?: import('../../lib/dday/ddayModel.js').DdayItem | null,
   *   linkedTodoText?: string,
   *   settings: import('../../lib/dday/ddayModel.js').DdaySettings,
   *   todayKey: string,
   *   themeColor?: string,
   *   accent?: string,
   *   dark?: boolean,
   *   oncancel: () => void,
   *   onsave: (draft: {
   *     title: string,
   *     date: string,
   *     countMode: import('../../lib/dday/ddayModel.js').DdayCountMode,
   *     repeatYearly: boolean,
   *     icon: import('../../lib/dday/ddayModel.js').DdayIconId,
   *     tone: import('../../lib/dday/ddayModel.js').DdayToneId,
   *     showInTodo: boolean,
   *     showInBanner: boolean,
   *     showInWidget: boolean,
   *   }) => void,
   *   ondelete?: (deleteLinkedTodo: boolean) => void,
   * }}
   */
  let {
    mode,
    item = null,
    linkedTodoText = '',
    settings,
    todayKey,
    themeColor = 'amber',
    accent = '#d97706',
    dark = false,
    oncancel,
    onsave,
    ondelete = undefined,
  } = $props();

  let title = $state('');
  let date = $state('');
  /** @type {import('../../lib/dday/ddayModel.js').DdayCountMode} */
  let countMode = $state('countdown');
  let repeatYearly = $state(false);
  /** @type {import('../../lib/dday/ddayModel.js').DdayIconId} */
  let icon = $state('flag');
  /** @type {import('../../lib/dday/ddayModel.js').DdayToneId} */
  let tone = $state('accent');
  let showInTodo = $state(false);
  let showInBanner = $state(true);
  let showInWidget = $state(true);

  let calendarOpen = $state(false);
  let confirmDelete = $state(false);
  let errorMsg = $state('');

  /** @type {HTMLInputElement | null} */
  let titleInputEl = $state(null);

  $effect(() => {
    const _key = `${mode}:${item?.id ?? 'new'}`;
    untrack(() => {
      if (mode === 'edit' && item) {
        title = item.title;
        date = item.date;
        countMode = item.countMode;
        repeatYearly = item.repeatYearly;
        icon = item.icon;
        tone = item.tone;
        showInTodo = item.showInTodo;
        showInBanner = item.showInBanner;
        showInWidget = item.showInWidget;
      } else {
        title = '';
        date = todayKey;
        countMode = 'countdown';
        repeatYearly = false;
        icon = 'flag';
        tone = 'accent';
        showInTodo = settings.defaultChannelsFromNew.showInTodo;
        showInBanner = settings.defaultChannelsFromNew.showInBanner;
        showInWidget = settings.defaultChannelsFromNew.showInWidget;
      }
      calendarOpen = false;
      confirmDelete = false;
      errorMsg = '';
    });
  });

  const codepointCount = $derived([...title].length);
  const toneColor = $derived(resolveToneColor(tone, accent));
  const previewCounter = $derived(
    computeDdayCounter({ date: date || todayKey, countMode, repeatYearly }, todayKey),
  );
  const dpStyle = $derived(toStyleText(calendarPalette(themeColor, dark)));
  const strippedTodoHint = $derived(stripHtmlToTitle(linkedTodoText, 60));
  const showLinkedHint = $derived(
    mode === 'edit' && Boolean(item?.linkedTodoId) && Boolean(strippedTodoHint) && strippedTodoHint !== title.trim(),
  );

  /** @param {Event & { currentTarget: HTMLInputElement }} e */
  function handleTitleInput(e) {
    const next = truncateCodepoints(e.currentTarget.value, DDAY_TITLE_MAX);
    title = next;
    if (e.currentTarget.value !== next) e.currentTarget.value = next;
    if (errorMsg) errorMsg = '';
  }

  /** @param {Event} e */
  function handleSubmit(e) {
    e.preventDefault();
    const cleaned = stripHtmlToTitle(title, DDAY_TITLE_MAX);
    if (!cleaned) {
      errorMsg = 'D-Day 이름을 입력해 주세요.';
      titleInputEl?.focus();
      return;
    }
    if (!date) {
      errorMsg = '날짜를 선택해 주세요.';
      return;
    }
    onsave({
      title: cleaned,
      date,
      countMode,
      repeatYearly: countMode === 'countdown' ? repeatYearly : false,
      icon,
      tone,
      showInTodo,
      showInBanner,
      showInWidget,
    });
  }
</script>

<form
  class="es-sheet"
  data-scheme={dark ? 'dark' : 'light'}
  style="--dd-tone: {toneColor}; --dd-accent: {accent};"
  onsubmit={handleSubmit}
>
  <div class="es-top">
    <button type="button" class="es-back" onclick={oncancel}>
      <ArrowLeft size={14} strokeWidth={2.3} />
      <span>목록으로</span>
    </button>
    <strong class="es-heading">{mode === 'edit' ? 'D-Day 편집' : '새 D-Day 만들기'}</strong>
    {#if mode === 'edit' && ondelete}
      <button
        type="button"
        class="es-trash"
        class:active={confirmDelete}
        aria-label="D-Day 삭제"
        title="D-Day 삭제"
        onclick={() => { confirmDelete = !confirmDelete; calendarOpen = false; }}
      >
        <Trash2 size={14} strokeWidth={2.2} />
      </button>
    {:else}
      <span class="es-spacer" aria-hidden="true"></span>
    {/if}
  </div>

  {#if confirmDelete && mode === 'edit' && ondelete}
    <div class="es-del-box" role="alertdialog" aria-label="D-Day 삭제 확인">
      <p>
        {item?.linkedTodoId
          ? '연동된 할 일이 있어요. 어떻게 삭제할까요?'
          : '이 D-Day 항목을 영구 삭제할까요?'}
      </p>
      <div class="es-del-actions">
        <button type="button" class="es-del-cancel" onclick={() => (confirmDelete = false)}>취소</button>
        {#if item?.linkedTodoId}
          <button type="button" class="es-del-soft" onclick={() => ondelete(false)}>D-Day만 삭제</button>
          <button type="button" class="es-del-hard" onclick={() => ondelete(true)}>할 일도 삭제</button>
        {:else}
          <button type="button" class="es-del-hard" onclick={() => ondelete(false)}>삭제하기</button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="es-scroll">
    <div class="es-preview-strip">
      <DdayIcon {icon} {tone} {accent} size={28} {dark} />
      <div class="es-prev-copy">
        <span class="es-prev-title">{title.trim() || 'D-Day 이름 미리보기'}</span>
        <span class="es-prev-date tnum">{formatFullDate(date || todayKey)}</span>
      </div>
      <span class="es-prev-badge tnum">{previewCounter.label}</span>
    </div>

    <div class="es-field">
      <div class="es-label-row">
        <label for="dday-edit-title">이름</label>
        <span class="es-count tnum" class:limit={codepointCount >= DDAY_TITLE_MAX}>
          {codepointCount}/{DDAY_TITLE_MAX}
        </span>
      </div>
      <input
        bind:this={titleInputEl}
        id="dday-edit-title"
        type="text"
        class="es-input"
        value={title}
        oninput={handleTitleInput}
        placeholder="예: 수학 퍼즐 페스티벌, 기말고사"
        autocomplete="off"
      />
      {#if showLinkedHint}
        <p class="es-hint">원래 할 일: {strippedTodoHint}</p>
      {/if}
      {#if errorMsg}
        <p class="es-error" role="alert">{errorMsg}</p>
      {/if}
    </div>

    <div class="es-field">
      <div class="es-label-row">
        <span>날짜</span>
        <span class="es-inline-date">
          <label class="es-direct-label" for="dday-direct-date">직접 입력</label>
          <input
            id="dday-direct-date"
            type="date"
            class="es-direct-input"
            bind:value={date}
          />
        </span>
      </div>
      <button
        type="button"
        class="es-date-btn"
        aria-expanded={calendarOpen}
        onclick={() => (calendarOpen = !calendarOpen)}
      >
        <CalendarDays size={15} strokeWidth={2.2} />
        <span class="tnum">{formatFullDate(date || todayKey)}</span>
        <span class="es-date-toggle">{calendarOpen ? '닫기' : '달력 열기'}</span>
      </button>

      {#if calendarOpen}
        <div class="es-cal-wrap" style={dpStyle}>
          {#key `${date}:${dark}`}
            <CalendarPanel
              value={date}
              {todayKey}
              onpick={(key) => {
                date = key;
                calendarOpen = false;
                if (errorMsg) errorMsg = '';
              }}
              onclear={() => {
                date = todayKey;
                calendarOpen = false;
              }}
              onescape={() => {
                calendarOpen = false;
              }}
            />
          {/key}
        </div>
      {/if}
    </div>

    <div class="es-field">
      <span class="es-sec-label">아이콘 · 색상</span>
      <div class="es-style-card">
        <div class="es-icons" role="radiogroup" aria-label="아이콘 선택">
          {#each DDAY_ICONS as iconId}
            <button
              type="button"
              role="radio"
              aria-checked={icon === iconId}
              aria-label={ICON_LABELS[iconId]}
              title={ICON_LABELS[iconId]}
              class="es-icon-opt"
              class:on={icon === iconId}
              onclick={() => (icon = iconId)}
            >
              <DdayIcon icon={iconId} {tone} {accent} size={24} {dark} />
            </button>
          {/each}
        </div>

        <div class="es-tones" role="radiogroup" aria-label="색상 선택">
          {#each DDAY_TONES as toneId}
            {@const swatch = resolveToneColor(toneId, accent)}
            <button
              type="button"
              role="radio"
              aria-checked={tone === toneId}
              aria-label={TONE_LABELS[toneId]}
              title={TONE_LABELS[toneId]}
              class="es-tone-opt"
              class:on={tone === toneId}
              style="--sw: {swatch};"
              onclick={() => (tone = toneId)}
            >
              {#if tone === toneId}
                <Check size={11} strokeWidth={3} />
              {/if}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <div class="es-field">
      <span class="es-sec-label">계산 방식</span>
      <div class="es-mode-grid" role="radiogroup" aria-label="D-Day 계산 방식">
        <button
          type="button"
          role="radio"
          aria-checked={countMode === 'countdown'}
          class="es-mode-card"
          class:on={countMode === 'countdown'}
          onclick={() => (countMode = 'countdown')}
        >
          <strong>남은 날짜 (D-n)</strong>
          <small>시험·마감·행사, 당일 D-Day</small>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={countMode === 'since'}
          class="es-mode-card"
          class:on={countMode === 'since'}
          onclick={() => (countMode = 'since')}
        >
          <strong>날짜 수 세기 (+n일)</strong>
          <small>시작일 포함 누적 일수</small>
        </button>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={repeatYearly && countMode === 'countdown'}
        disabled={countMode !== 'countdown'}
        class="es-switch-row compact"
        onclick={() => (repeatYearly = !repeatYearly)}
      >
        <span class="es-sw-icon"><Repeat size={13} strokeWidth={2.2} /></span>
        <span class="es-sw-copy">
          <strong>매년 반복</strong>
          <small>{countMode === 'countdown' ? '생일·연례 행사처럼 매년 같은 날로 자동 갱신' : '남은 날짜 모드에서만 사용할 수 있어요'}</small>
        </span>
        <span class="es-knob" aria-hidden="true"><i></i></span>
      </button>
    </div>

    <div class="es-field">
      <span class="es-sec-label">표시 위치</span>
      <div class="es-switch-list">
        <button
          type="button"
          role="switch"
          aria-checked={showInTodo}
          class="es-switch-row"
          onclick={() => (showInTodo = !showInTodo)}
        >
          <span class="es-sw-icon"><ListTodo size={14} strokeWidth={2.2} /></span>
          <span class="es-sw-copy">
            <strong>할 일 목록에 함께 표시</strong>
            <small>{showInTodo ? '할 일 줄에도 마감일과 D-Day 핀을 표시합니다' : '메모장 할 일 목록에는 띄우지 않고 독립 관리합니다'}</small>
          </span>
          <span class="es-knob" aria-hidden="true"><i></i></span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={showInBanner}
          class="es-switch-row"
          onclick={() => (showInBanner = !showInBanner)}
        >
          <span class="es-sw-icon"><PanelTop size={14} strokeWidth={2.2} /></span>
          <span class="es-sw-copy">
            <strong>메모 상단 배너에 고정</strong>
            <small>이 메모 창의 헤더 아래 B-3 배너에 표시합니다</small>
          </span>
          <span class="es-knob" aria-hidden="true"><i></i></span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={showInWidget}
          class="es-switch-row"
          onclick={() => (showInWidget = !showInWidget)}
        >
          <span class="es-sw-icon"><LayoutGrid size={14} strokeWidth={2.2} /></span>
          <span class="es-sw-copy">
            <strong>툴킷 D-Day 위젯에 표시</strong>
            <small>바탕화면 독립 D-Day 위젯 카드에 포함합니다</small>
          </span>
          <span class="es-knob" aria-hidden="true"><i></i></span>
        </button>
      </div>
    </div>
  </div>

  <div class="es-foot">
    <button type="button" class="es-btn-sec" onclick={oncancel}>취소</button>
    <button type="submit" class="es-btn-pri">
      <Check size={14} strokeWidth={2.6} />
      <span>{mode === 'edit' ? '변경 저장' : 'D-Day 추가'}</span>
    </button>
  </div>
</form>

<style>
  .es-sheet {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .tnum {
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .es-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 14px 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.07);
    flex-shrink: 0;
  }
  .es-sheet[data-scheme='dark'] .es-top {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .es-back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 8px 0 6px;
    border: 0;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.05);
    color: #334155;
    font-size: 11.5px;
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .es-back:hover {
    background: rgba(15, 23, 42, 0.09);
  }
  .es-sheet[data-scheme='dark'] .es-back {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }

  .es-heading {
    font-size: 13px;
    font-weight: 800;
    color: #1e2430;
    white-space: nowrap;
  }
  .es-sheet[data-scheme='dark'] .es-heading {
    color: #f1f5f9;
  }

  .es-spacer {
    width: 28px;
  }

  .es-trash {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #64748b;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .es-trash:hover,
  .es-trash.active {
    background: rgba(225, 29, 72, 0.12);
    color: #e11d48;
  }

  .es-del-box {
    margin: 8px 14px 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: #fff1f2;
    border: 1px solid #fecdd3;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }
  .es-sheet[data-scheme='dark'] .es-del-box {
    background: rgba(136, 19, 55, 0.34);
    border-color: rgba(251, 113, 133, 0.35);
  }
  .es-del-box p {
    margin: 0;
    font-size: 11.5px;
    font-weight: 700;
    color: #9f1239;
  }
  .es-sheet[data-scheme='dark'] .es-del-box p {
    color: #fecdd3;
  }
  .es-del-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .es-del-actions button {
    height: 26px;
    padding: 0 10px;
    border-radius: 7px;
    border: 0;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .es-del-cancel {
    background: rgba(15, 23, 42, 0.08);
    color: #334155;
  }
  .es-sheet[data-scheme='dark'] .es-del-cancel {
    background: rgba(255, 255, 255, 0.12);
    color: #e2e8f0;
  }
  .es-del-soft {
    background: #ffffff;
    color: #be123c;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }
  .es-del-hard {
    background: #e11d48;
    color: #ffffff;
  }

  .es-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 13px;
    scrollbar-width: thin;
  }

  .es-preview-strip {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 11px;
    border-radius: 13px;
    background: linear-gradient(155deg, color-mix(in srgb, var(--dd-tone) 8%, #ffffff), #ffffff);
    border: 1px solid color-mix(in srgb, var(--dd-tone) 24%, rgba(15, 23, 42, 0.08));
  }
  .es-sheet[data-scheme='dark'] .es-preview-strip {
    background: linear-gradient(155deg, color-mix(in srgb, var(--dd-tone) 16%, #242836), #202430);
    border-color: color-mix(in srgb, var(--dd-tone) 32%, rgba(255, 255, 255, 0.1));
  }
  .es-prev-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .es-prev-title {
    font-size: 12px;
    font-weight: 700;
    color: #1e2430;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .es-sheet[data-scheme='dark'] .es-prev-title {
    color: #f1f5f9;
  }
  .es-prev-date {
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
  }
  .es-sheet[data-scheme='dark'] .es-prev-date {
    color: #94a3b8;
  }
  .es-prev-badge {
    flex-shrink: 0;
    padding: 3px 8px;
    border-radius: 8px;
    background: var(--dd-tone);
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
  }

  .es-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .es-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .es-label-row > label,
  .es-sec-label {
    font-size: 11px;
    font-weight: 800;
    color: #475569;
  }
  .es-sheet[data-scheme='dark'] .es-label-row > label,
  .es-sheet[data-scheme='dark'] .es-sec-label {
    color: #cbd5e1;
  }
  .es-count {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
  }
  .es-count.limit {
    color: #d97706;
  }

  .es-input {
    width: 100%;
    height: 36px;
    padding: 0 11px;
    border-radius: 10px;
    border: 1.5px solid rgba(15, 23, 42, 0.1);
    background: #ffffff;
    color: #1e2430;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    outline: none;
    transition: border-color 140ms ease, box-shadow 140ms ease;
  }
  .es-input:focus {
    border-color: var(--dd-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--dd-accent) 16%, transparent);
  }
  .es-sheet[data-scheme='dark'] .es-input {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.12);
    color: #f8fafc;
  }

  .es-hint {
    margin: 0;
    font-size: 10.5px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .es-error {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    color: #e11d48;
  }

  .es-inline-date {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .es-direct-label {
    font-size: 10px;
    color: #64748b;
    font-weight: 600;
  }
  .es-direct-input {
    height: 22px;
    padding: 0 6px;
    border-radius: 6px;
    border: 1px solid rgba(15, 23, 42, 0.12);
    background: #ffffff;
    color: #334155;
    font: inherit;
    font-size: 10.5px;
    font-weight: 600;
  }
  .es-sheet[data-scheme='dark'] .es-direct-input {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.14);
    color: #e2e8f0;
    color-scheme: dark;
  }

  .es-date-btn {
    width: 100%;
    height: 36px;
    padding: 0 11px;
    border-radius: 10px;
    border: 1.5px solid rgba(15, 23, 42, 0.1);
    background: #ffffff;
    color: #1e2430;
    display: flex;
    align-items: center;
    gap: 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 140ms ease;
  }
  .es-date-btn:hover {
    border-color: var(--dd-accent);
  }
  .es-sheet[data-scheme='dark'] .es-date-btn {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.12);
    color: #f1f5f9;
  }
  .es-date-toggle {
    margin-left: auto;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--dd-accent);
    white-space: nowrap;
  }

  .es-cal-wrap {
    display: flex;
    justify-content: center;
    padding-top: 2px;
  }

  .es-style-card {
    padding: 9px 10px;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .es-sheet[data-scheme='dark'] .es-style-card {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.08);
  }

  .es-icons {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 4px;
  }
  .es-icon-opt {
    height: 34px;
    border-radius: 9px;
    border: 1.5px solid transparent;
    background: transparent;
    display: grid;
    place-items: center;
    padding: 0;
    cursor: pointer;
    transition: border-color 130ms ease, background-color 130ms ease, transform 110ms ease;
  }
  .es-icon-opt:hover {
    background: rgba(15, 23, 42, 0.04);
  }
  .es-icon-opt.on {
    border-color: var(--dd-tone);
    background: color-mix(in srgb, var(--dd-tone) 10%, transparent);
    transform: translateY(-1px);
  }

  .es-tones {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid rgba(15, 23, 42, 0.06);
  }
  .es-sheet[data-scheme='dark'] .es-tones {
    border-top-color: rgba(255, 255, 255, 0.07);
  }
  .es-tone-opt {
    flex: 1;
    height: 24px;
    border-radius: 999px;
    border: 2px solid transparent;
    background: var(--sw);
    color: #ffffff;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .es-tone-opt:hover {
    transform: scale(1.04);
  }
  .es-tone-opt.on {
    box-shadow: 0 0 0 2px #ffffff, 0 0 0 3.5px var(--sw);
  }
  .es-sheet[data-scheme='dark'] .es-tone-opt.on {
    box-shadow: 0 0 0 2px #232733, 0 0 0 3.5px var(--sw);
  }

  .es-mode-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .es-mode-card {
    padding: 9px 10px;
    border-radius: 11px;
    border: 1.5px solid rgba(15, 23, 42, 0.08);
    background: #ffffff;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: pointer;
    transition: border-color 130ms ease, background-color 130ms ease;
  }
  .es-mode-card strong {
    font-size: 11.5px;
    font-weight: 800;
    color: #1e2430;
    white-space: nowrap;
  }
  .es-mode-card small {
    font-size: 10px;
    color: #64748b;
    line-height: 1.35;
    word-break: keep-all;
  }
  .es-mode-card.on {
    border-color: var(--dd-accent);
    background: color-mix(in srgb, var(--dd-accent) 7%, #ffffff);
  }
  .es-sheet[data-scheme='dark'] .es-mode-card {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.09);
  }
  .es-sheet[data-scheme='dark'] .es-mode-card strong {
    color: #f1f5f9;
  }
  .es-sheet[data-scheme='dark'] .es-mode-card small {
    color: #94a3b8;
  }
  .es-sheet[data-scheme='dark'] .es-mode-card.on {
    border-color: var(--dd-accent);
    background: color-mix(in srgb, var(--dd-accent) 14%, #232733);
  }

  .es-switch-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .es-switch-row {
    width: 100%;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid rgba(15, 23, 42, 0.07);
    background: #ffffff;
    display: flex;
    align-items: center;
    gap: 9px;
    text-align: left;
    cursor: pointer;
    transition: background-color 130ms ease, opacity 130ms ease;
  }
  .es-switch-row.compact {
    padding: 7px 10px;
  }
  .es-switch-row:hover:not(:disabled) {
    background: #f8fafc;
  }
  .es-switch-row:disabled {
    opacity: 0.48;
    cursor: default;
  }
  .es-sheet[data-scheme='dark'] .es-switch-row {
    background: #232733;
    border-color: rgba(255, 255, 255, 0.08);
  }
  .es-sheet[data-scheme='dark'] .es-switch-row:hover:not(:disabled) {
    background: #282d3b;
  }

  .es-sw-icon {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: rgba(15, 23, 42, 0.05);
    color: #475569;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .es-switch-row[aria-checked='true'] .es-sw-icon {
    background: color-mix(in srgb, var(--dd-accent) 14%, transparent);
    color: var(--dd-accent);
  }
  .es-sheet[data-scheme='dark'] .es-sw-icon {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }

  .es-sw-copy {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .es-sw-copy strong {
    font-size: 11.5px;
    font-weight: 700;
    color: #1e2430;
  }
  .es-sw-copy small {
    font-size: 10px;
    color: #64748b;
    line-height: 1.35;
    word-break: keep-all;
  }
  .es-sheet[data-scheme='dark'] .es-sw-copy strong {
    color: #f1f5f9;
  }
  .es-sheet[data-scheme='dark'] .es-sw-copy small {
    color: #94a3b8;
  }

  .es-knob {
    position: relative;
    flex-shrink: 0;
    width: 34px;
    height: 20px;
    border-radius: 99px;
    background: #cbd5e1;
    transition: background-color 160ms ease;
  }
  .es-sheet[data-scheme='dark'] .es-knob {
    background: #475569;
  }
  .es-knob i {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: transform 180ms cubic-bezier(0.3, 1.4, 0.5, 1);
  }
  .es-switch-row[aria-checked='true'] .es-knob {
    background: var(--dd-accent);
  }
  .es-switch-row[aria-checked='true'] .es-knob i {
    transform: translateX(14px);
  }

  .es-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 12px;
    border-top: 1px solid rgba(15, 23, 42, 0.08);
    flex-shrink: 0;
  }
  .es-sheet[data-scheme='dark'] .es-foot {
    border-top-color: rgba(255, 255, 255, 0.08);
  }
  .es-foot button {
    height: 34px;
    border-radius: 10px;
    border: 0;
    font: inherit;
    font-size: 12px;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    white-space: nowrap;
    word-break: keep-all;
    cursor: pointer;
  }
  .es-btn-sec {
    flex: 1;
    background: rgba(15, 23, 42, 0.06);
    color: #475569;
  }
  .es-btn-sec:hover {
    background: rgba(15, 23, 42, 0.1);
  }
  .es-sheet[data-scheme='dark'] .es-btn-sec {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }
  .es-btn-pri {
    flex: 2;
    background: var(--dd-accent);
    color: #ffffff;
  }
  .es-btn-pri:hover {
    filter: brightness(0.95);
  }
</style>
