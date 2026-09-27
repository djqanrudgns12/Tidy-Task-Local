<script lang="ts">
  // 선생님 메뉴 서랍(PRD 7절 표). 오른쪽에서 밀려 나오며, 지금 화면에 맞는 항목만 보여 줍니다.
  // 2026-09-26 정리: 선생님이 가장 자주 보는 것부터 위에서 아래로 놓습니다.
  //   ① 지금 상태(참여 인원 · 진행 막대 · 투표 인원 조절) → ② 다음 할 일 하나(마감하고 개표하기 / 개표 시작하기)
  //   → ③ 진행 도구 → ④ 소리 · 움직임 → ⑤ 맨 아래 되돌리기 어려운 일(처음부터 다시 받기 · 투표 그만두기)
  // 전체 화면 · 항상 위는 제목줄에 이미 있어 뺐고, 잠시 멈춤은 없앴습니다(이 메뉴가 열려 있는 동안 투표판이 키를 받지 않으므로
  // 메뉴 자체가 멈춤 역할을 합니다 — 따로 멈춤 상태가 있으면 "왜 멈췄지?"로 헷갈렸음).
  // 모든 버튼은 tabindex=-1(마우스 전용): 학생 키보드가 메뉴 버튼을 누르지 않게.
  import { X, Undo2, BookOpen, Flag, MonitorSmartphone, Trash2, Pencil, Archive, House, Minus, Plus, PartyPopper, RotateCcw, ChevronRight, Volume1, Volume2, VolumeX } from 'lucide-svelte';
  import ToolkitSwitch from '../../toolkit/ToolkitSwitch.svelte';
  import BallotBox from '../art/BallotBox.svelte';
  import { LIMITS, modeName, phaseLabel as labelOfPhase } from '../../../lib/vote/model.js';
  let {
    view, session, prefs, speechAvailable,
    onclose, onvoid, onvoters, ontutorial, onclosevote, onstartcount, onrestart, oncancel, onteacherwindow, onprefs, onmusic, onedit, onarchive, onhome,
  } = $props<{
    view: string; session: any; prefs: any; speechAvailable: boolean;
    onclose: () => void; onvoid: () => void; onvoters: (n: number) => void; ontutorial: () => void;
    onclosevote: () => void; onstartcount: () => void; onrestart: () => void; oncancel: () => void; onteacherwindow: () => void;
    onprefs: (p: Record<string, unknown>) => void; onmusic: (on: boolean) => void; onedit: () => void; onarchive: () => void; onhome: () => void;
  }>();
  const hasSession = $derived(!!session.id);
  const voting = $derived(hasSession && (session.phase === 'voting' || session.phase === 'paused'));
  const closed = $derived(hasSession && session.phase === 'closed');
  // 안내를 다시 보는 중(투표는 계속 '투표 중'이지만 투표판 대신 안내가 떠 있음).
  const replaying = $derived(voting && view === 'tutorial');
  const canEdit = $derived(hasSession && view === 'prep' && !session.ballots.length && !session.runoffOf);
  const canStop = $derived(hasSession && session.phase !== 'counting' && session.phase !== 'done');
  const cast = $derived(hasSession ? session.ballots.length : 0);
  const voters = $derived(hasSession ? session.rules.voters : 0);
  const participation = $derived(voters ? Math.min(1, cast / voters) : 0);
  const minVoters = $derived(Math.max(LIMITS.votersMin, cast));
  const phaseLabel = $derived(labelOfPhase(voting ? 'voting' : session.phase));
  const muted = $derived(prefs.muted || prefs.volume === 0);
</script>

<div class="vt-drawer-scrim" role="presentation" onpointerup={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <aside class="vt-drawer" aria-label="선생님 메뉴">
    <header class="vt-dr-head">
      <h2>선생님 메뉴</h2>
      <button class="vt-dr-close" tabindex="-1" aria-label="메뉴 닫기" title="닫기" onclick={onclose}><X size={18} /></button>
    </header>

    {#if voting || closed}
      <!-- ① 지금 상태: 작은 투표함이 참여율만큼 차오르고, 마감하면 자물쇠가 걸립니다 -->
      <section class="vt-dr-status" data-phase={closed ? 'closed' : 'voting'}>
        <div class="vt-dr-status-main">
          <span class="vt-dr-box"><BallotBox size={62} fill={participation} state={closed ? 'locked' : 'closed'} /></span>
          <div class="vt-dr-status-copy">
            <span class="vt-dr-phase"><i aria-hidden="true"></i>{phaseLabel}</span>
            <p class="vt-dr-count"><b>{cast}</b><span>/ {voters}명 투표</span></p>
          </div>
        </div>
        <div class="vt-dr-meter" role="progressbar" aria-label="참여" aria-valuemin={0} aria-valuemax={voters} aria-valuenow={cast}><i style:transform={`scaleX(${participation})`}></i></div>
        <div class="vt-dr-voters">
          <span>투표 인원<small>{closed ? '늘리면 마감을 풀고 다시 받아요' : '받은 표 수까지 줄이면 곧바로 마감해요'}</small></span>
          <div class="vt-stepper">
            <button tabindex="-1" aria-label="인원 줄이기" disabled={voters <= minVoters} onclick={() => onvoters(voters - 1)}><Minus size={16} /></button>
            <b>{voters}</b>
            <button tabindex="-1" aria-label="인원 늘리기" disabled={voters >= LIMITS.votersMax} onclick={() => onvoters(voters + 1)}><Plus size={16} /></button>
          </div>
        </div>
      </section>

      <!-- ② 다음 할 일 하나 -->
      {#if voting}
        <button class="vt-dr-primary" tabindex="-1" onclick={onclosevote}>
          <span class="vt-dr-primary-icon"><Flag size={19} /></span>
          <span class="vt-dr-text">마감하고 개표하기<small>더 이상 표를 받지 않아요</small></span>
          <ChevronRight size={18} />
        </button>
      {:else}
        <button class="vt-dr-primary" tabindex="-1" onclick={onstartcount}>
          <span class="vt-dr-primary-icon"><PartyPopper size={19} /></span>
          <span class="vt-dr-text">개표 시작하기<small>{modeName(session.reveal.mode, session.type === 'yesno')} · {cast}장의 표를 공개해요</small></span>
          <ChevronRight size={18} />
        </button>
      {/if}
    {/if}

    <!-- ③ 진행 도구 · 바로 가기 -->
    <section class="vt-dr-group">
      <h3>{hasSession ? '진행' : '바로 가기'}</h3>
      <div class="vt-dr-list">
        {#if voting}
          <button class="vt-dr-item" tabindex="-1" disabled={!session.lastBallotId} onclick={onvoid}>
            <span class="vt-dr-icon" data-tone="sky"><Undo2 size={17} /></span>
            <span class="vt-dr-text">직전 표 취소<small>{session.lastBallotId ? '가장 최근에 들어온 표 1장을 빼요' : '다음 표가 들어오면 쓸 수 있어요'}</small></span>
          </button>
          {#if !replaying}
            <button class="vt-dr-item" tabindex="-1" onclick={ontutorial}>
              <span class="vt-dr-icon" data-tone="mint"><BookOpen size={17} /></span>
              <span class="vt-dr-text">안내 다시 보기<small>끝나면 투표판으로 돌아와 이어서 받아요</small></span>
            </button>
          {/if}
        {/if}
        {#if canEdit}
          <button class="vt-dr-item" tabindex="-1" onclick={onedit}>
            <span class="vt-dr-icon" data-tone="butter"><Pencil size={17} /></span>
            <span class="vt-dr-text">설정 고치기<small>만들기 화면으로 돌아가요</small></span>
          </button>
        {/if}
        {#if hasSession}
          <button class="vt-dr-item" tabindex="-1" onclick={onteacherwindow}>
            <span class="vt-dr-icon" data-tone="lilac"><MonitorSmartphone size={17} /></span>
            <span class="vt-dr-text">선생님 창 따로 열기<small>두 번째 모니터에 조종실을 띄워요</small></span>
          </button>
        {:else}
          <button class="vt-dr-item" tabindex="-1" onclick={onarchive}>
            <span class="vt-dr-icon" data-tone="butter"><Archive size={17} /></span>
            <span class="vt-dr-text">기록함<small>지난 투표 결과를 다시 봐요</small></span>
          </button>
          <button class="vt-dr-item" tabindex="-1" onclick={onhome}>
            <span class="vt-dr-icon" data-tone="mint"><House size={17} /></span>
            <span class="vt-dr-text">처음 화면<small>새 투표를 만들어요</small></span>
          </button>
        {/if}
      </div>
    </section>

    <!-- ④ 소리 · 움직임: 스피커를 누르면 소리 끄기/켜기, 막대를 움직이면 다시 켜집니다 -->
    <section class="vt-dr-group">
      <h3>소리 · 움직임</h3>
      <div class="vt-dr-list boxed">
        <div class="vt-dr-row volume" class:muted>
          <button class="vt-dr-mute" tabindex="-1" aria-pressed={prefs.muted} aria-label={prefs.muted ? '소리 켜기' : '소리 끄기'} title={prefs.muted ? '소리 켜기' : '소리 끄기'}
            onclick={() => onprefs({ muted: !prefs.muted })}>
            {#if muted}<VolumeX size={18} />{:else if prefs.volume < 50}<Volume1 size={18} />{:else}<Volume2 size={18} />{/if}
          </button>
          <input type="range" min="0" max="100" step="5" value={prefs.volume} tabindex="-1" aria-label="소리 크기"
            style:--fill={`${prefs.muted ? 0 : prefs.volume}%`}
            oninput={(e) => onprefs({ volume: Number((e.currentTarget as HTMLInputElement).value), muted: false })} />
          <output>{prefs.muted ? '꺼짐' : prefs.volume}</output>
        </div>
        <!-- 제목줄의 음악 스위치와 같은 설정(prefs.music)입니다. 한곳에서 바꾸면 모든 화면·선생님 창에 그대로 보입니다. -->
        <div class="vt-dr-row">
          <span>배경 음악{#if prefs.music && muted}<small>전체 소리가 꺼져 있어요</small>{/if}</span>
          <ToolkitSwitch checked={prefs.music} label="배경 음악" onchange={onmusic} />
        </div>
        <div class="vt-dr-row">
          <span>안내 음성{#if !speechAvailable}<small>안내 음원을 확인해 주세요</small>{/if}</span>
          <ToolkitSwitch checked={prefs.speech && speechAvailable} disabled={!speechAvailable} label="안내 음성" onchange={(v) => onprefs({ speech: v })} />
        </div>
        <div class="vt-dr-row">
          <span>목소리</span>
          <select aria-label="안내 목소리" value={prefs.speechVoice ?? 'female'} onchange={(e) => onprefs({speechVoice:e.currentTarget.value})}><option value="female">여성</option><option value="male">남성</option></select>
        </div>
        <div class="vt-dr-row">
          <span>움직임 줄이기</span>
          <ToolkitSwitch checked={prefs.reduced} label="움직임 줄이기" onchange={(v) => onprefs({ reduced: v })} />
        </div>
      </div>
    </section>

    <!-- ⑤ 되돌리기 어려운 일은 맨 아래에 작게(누르면 확인창 → 10초 되돌리기) -->
    {#if canStop}
      <footer class="vt-dr-danger">
        {#if voting}
          <button class="vt-dr-quiet" tabindex="-1" disabled={!cast} title={cast ? '받은 표를 비우고 첫 친구부터 다시 받아요' : '아직 받은 표가 없어요'} onclick={onrestart}><RotateCcw size={15} />처음부터 다시 받기</button>
        {/if}
        <button class="vt-dr-quiet danger" tabindex="-1" onclick={oncancel}><Trash2 size={15} />투표 그만두기</button>
      </footer>
    {/if}
  </aside>
</div>

<style>
  .vt-drawer-scrim {
    position: absolute;
    /* 제목줄(56px) 바로 아래부터 덮습니다 — 제목줄의 선생님 버튼으로 서랍을 다시 닫을 수 있게 */
    inset: 56px 0 0;
    z-index: 45;
    background: color-mix(in srgb, var(--vt-ink) 14%, transparent);
  }
  .vt-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: min(372px, 92%);
    overflow-y: auto;
    padding: 14px 16px 18px;
    border-left: 1px solid var(--vt-line);
    background: var(--vt-card);
    box-shadow: -18px 0 40px color-mix(in srgb, var(--vt-ink) 12%, transparent);
    animation: vt-drawer-in var(--vt-standard) var(--vt-ease) both;
  }
  @keyframes vt-drawer-in {
    from {
      transform: translateX(40px);
      opacity: 0;
    }
  }

  /* ── 머리 ── */
  .vt-dr-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: 4px;
  }
  .vt-dr-head h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 900;
  }
  .vt-dr-close {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--vt-muted);
  }
  .vt-dr-close:hover {
    background: var(--vt-soft);
    color: var(--vt-ink);
  }

  /* ── ① 상태 카드 ── */
  .vt-dr-status {
    display: grid;
    gap: 12px;
    padding: 14px 14px 12px;
    border-radius: 20px;
    background: var(--vt-soft);
  }
  .vt-dr-status-main {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .vt-dr-box {
    display: grid;
    place-items: center;
    flex: none;
    width: 70px;
    height: 62px;
    border-radius: 16px;
    background: var(--vt-card);
  }
  .vt-dr-status-copy {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .vt-dr-phase {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    padding: 3px 10px 3px 8px;
    border-radius: 999px;
    background: var(--vt-card);
    font-size: 12.5px;
    font-weight: 900;
  }
  .vt-dr-phase i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3fae84;
  }
  /* 투표 받는 중에는 점이 숨 쉬듯 깜빡여 "지금 받고 있다"를 알립니다 */
  .vt-dr-status[data-phase='voting'] .vt-dr-phase i {
    animation: vt-dr-breathe 1.8s ease-in-out infinite;
  }
  .vt-dr-status[data-phase='closed'] .vt-dr-phase {
    background: var(--vt-gold);
    color: #5a4108;
  }
  .vt-dr-status[data-phase='closed'] .vt-dr-phase i {
    background: #8a6a1c;
  }
  @keyframes vt-dr-breathe {
    50% {
      opacity: 0.35;
      transform: scale(0.8);
    }
  }
  :global(.vt-root.reduced) .vt-dr-phase i {
    animation: none !important;
  }
  .vt-dr-count {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .vt-dr-count b {
    font-size: 30px;
    font-weight: 900;
    line-height: 1;
  }
  .vt-dr-count span {
    color: var(--vt-muted);
    font-size: 14.5px;
    font-weight: 800;
    white-space: nowrap;
  }
  .vt-dr-meter {
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--vt-line) 80%, transparent);
  }
  .vt-dr-meter i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--vt-accent);
    transform-origin: left;
    transition: transform var(--vt-slow) var(--vt-ease);
  }
  .vt-dr-voters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px dashed color-mix(in srgb, var(--vt-ink) 16%, transparent);
    font-size: 14.5px;
    font-weight: 800;
  }
  .vt-dr-voters span {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .vt-dr-voters small {
    color: var(--vt-muted);
    font-size: 12px;
    font-weight: 700;
    word-break: keep-all;
  }
  .vt-stepper {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
  }
  .vt-stepper button {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--vt-line);
    border-radius: 10px;
    background: var(--vt-card);
    color: var(--vt-ink);
  }
  .vt-stepper button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--vt-accent) 45%, var(--vt-line));
  }
  .vt-stepper button:disabled {
    opacity: 0.4;
  }
  .vt-stepper b {
    min-width: 32px;
    text-align: center;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }

  /* ── ② 다음 할 일 ── */
  .vt-dr-primary {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 62px;
    padding: 10px 14px 10px 10px;
    border: 0;
    border-radius: 18px;
    background: var(--vt-action);
    color: var(--vt-on-action);
    font-size: 16px;
    font-weight: 900;
    text-align: left;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--vt-action) 22%, transparent);
    transition: background var(--vt-quick) var(--vt-ease), transform var(--vt-quick) var(--vt-ease);
  }
  .vt-dr-primary:hover {
    background: color-mix(in srgb, var(--vt-action) 88%, #fff);
  }
  .vt-dr-primary:active {
    transform: translateY(1px);
  }
  .vt-dr-primary-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 13px;
    background: color-mix(in srgb, var(--vt-on-action) 18%, transparent);
  }
  /* 아래 .vt-dr-text small(흐린 글자)보다 앞서도록 한 단계 더 좁혀 씁니다 — 진한 바탕 위에서 읽히게 */
  .vt-dr-primary .vt-dr-text small {
    color: color-mix(in srgb, var(--vt-on-action) 80%, transparent);
  }

  /* ── ③ · ④ 묶음 ── */
  .vt-dr-group {
    display: grid;
    gap: 6px;
  }
  .vt-dr-group h3 {
    margin: 0 6px;
    color: var(--vt-muted);
    font-size: 12.5px;
    font-weight: 800;
  }
  .vt-dr-list {
    display: grid;
    gap: 2px;
  }
  .vt-dr-list.boxed {
    gap: 0;
    padding: 4px 4px;
    border: 1px solid color-mix(in srgb, var(--vt-line) 85%, transparent);
    border-radius: 16px;
  }
  .vt-dr-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 14px;
    background: transparent;
    color: var(--vt-ink);
    font-size: 15px;
    font-weight: 800;
    text-align: left;
    white-space: normal !important;
    transition: background var(--vt-quick) var(--vt-ease);
  }
  .vt-dr-item:hover:not(:disabled) {
    background: var(--vt-soft);
  }
  .vt-dr-item:disabled {
    cursor: default;
  }
  .vt-dr-item:disabled :is(.vt-dr-icon, .vt-dr-text) {
    opacity: 0.45;
  }
  .vt-dr-text {
    display: grid;
    flex: 1;
    gap: 1px;
    min-width: 0;
  }
  .vt-dr-text small {
    color: var(--vt-muted);
    font-size: 12.5px;
    font-weight: 700;
    word-break: keep-all;
  }
  /* 항목마다 파스텔 아이콘 타일(투표판 후보 색과 같은 계열) — 한눈에 구분되게 */
  .vt-dr-icon {
    --tone: #9cc8f0;
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--tone) 34%, var(--vt-card));
    color: color-mix(in srgb, var(--tone) 42%, #2b2418);
  }
  .vt-dr-icon[data-tone='mint'] {
    --tone: #74c9a6;
  }
  .vt-dr-icon[data-tone='butter'] {
    --tone: #f0c14f;
  }
  .vt-dr-icon[data-tone='lilac'] {
    --tone: #b9a1e8;
  }
  :global(.vt-root[data-scheme='dark']) .vt-dr-icon {
    background: color-mix(in srgb, var(--tone) 22%, var(--vt-card));
    color: var(--tone);
  }

  /* 소리 줄 */
  .vt-dr-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
    padding: 4px 10px;
    font-size: 14.5px;
    font-weight: 800;
  }
  .vt-dr-row + .vt-dr-row {
    border-top: 1px solid color-mix(in srgb, var(--vt-line) 60%, transparent);
  }
  .vt-dr-row span {
    display: grid;
    gap: 1px;
  }
  .vt-dr-row small {
    color: var(--vt-muted);
    font-size: 12px;
    font-weight: 700;
  }
  .vt-dr-row.volume {
    justify-content: flex-start;
    gap: 10px;
    padding-left: 4px;
  }
  .vt-dr-mute {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 12px;
    background: color-mix(in srgb, #f29a8f 30%, var(--vt-card));
    color: color-mix(in srgb, #f29a8f 40%, #2b2418);
    transition: background var(--vt-quick) var(--vt-ease);
  }
  :global(.vt-root[data-scheme='dark']) .vt-dr-mute {
    background: color-mix(in srgb, #f29a8f 22%, var(--vt-card));
    color: #f29a8f;
  }
  .vt-dr-row.muted .vt-dr-mute {
    background: var(--vt-soft);
    color: var(--vt-muted);
  }
  .vt-dr-row.volume input[type='range'] {
    flex: 1;
    min-width: 0;
    height: 6px;
    margin: 0;
    border-radius: 999px;
    appearance: none;
    background: linear-gradient(to right, var(--vt-action) var(--fill), color-mix(in srgb, var(--vt-line) 90%, transparent) var(--fill));
    cursor: pointer;
  }
  .vt-dr-row.volume input[type='range']::-webkit-slider-thumb {
    width: 18px;
    height: 18px;
    border: 3px solid var(--vt-card);
    border-radius: 50%;
    appearance: none;
    background: var(--vt-action);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--vt-ink) 30%, transparent);
  }
  .vt-dr-row.volume output {
    flex: none;
    min-width: 34px;
    color: var(--vt-muted);
    font-size: 13px;
    font-weight: 800;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── ⑤ 되돌리기 어려운 일 ── */
  .vt-dr-danger {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--vt-line) 70%, transparent);
  }
  .vt-dr-quiet {
    display: inline-flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--vt-line) 90%, transparent);
    border-radius: 12px;
    background: transparent;
    color: var(--vt-muted);
    font-size: 13.5px;
    font-weight: 800;
    white-space: nowrap;
    transition: background var(--vt-quick) var(--vt-ease), color var(--vt-quick) var(--vt-ease);
  }
  .vt-dr-quiet:hover:not(:disabled) {
    background: var(--vt-soft);
    color: var(--vt-ink);
  }
  .vt-dr-quiet.danger:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--vt-danger) 35%, var(--vt-line));
    background: color-mix(in srgb, var(--vt-danger) 8%, transparent);
    color: var(--vt-danger);
  }
  .vt-dr-quiet:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
