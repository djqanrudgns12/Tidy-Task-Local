<script lang="ts">
  // 투표판 화면(PRD 6절). 받는 값: 바뀌지 않는 후보 목록 + ballot.js의 보기 값(filled·total·hint)뿐.
  // 누른 번호에 따라 달라지는 값은 들어오지 않으므로, 어떤 번호를 눌러도 같은 순간의 화면은 같습니다.
  // 카드에는 눌림·호버·강조가 없고, 마우스·터치로는 아무 일도 일어나지 않습니다.
  // 새 투표판이 열릴 때만 카드가 스티커처럼 차례로 톡톡 붙습니다(열릴 때 한 번 — 고르는 동안에는 움직임 없음, PRD 10절).
  import { boothGrid } from '../../../lib/vote/layout.js';
  import { staggerDelay } from '../../../lib/vote/motion.js';
  import ItemCard from '../common/ItemCard.svelte';
  import Keycap from '../common/Keycap.svelte';
  import Stamp from '../art/Stamp.svelte';
  import type { Snippet } from 'svelte';
  // actions: 오른쪽 아래 선생님 버튼 자리 · lead/trail: 제목 왼쪽 위/오른쪽 위 자리(키보드 알림 · 다시 투표하기, 부스가 채움).
  // 투표판 자체는 버튼의 동작을 모릅니다.
  let { session, vm, preview = false, reduced = false, actions, lead, trail } = $props<{ session: any; vm: { filled: number; total: number; hint: string | null }; preview?: boolean; reduced?: boolean; actions?: Snippet; lead?: Snippet; trail?: Snippet }>();
  const corners = $derived(!!(lead || trail));
  const yesno = $derived(session.type === 'yesno');
  const items = $derived([...session.items].sort((a: any, b: any) => a.number - b.number));
  let gridW = $state(0);
  let gridH = $state(0);
  const grid = $derived(boothGrid(yesno ? 2 : items.length, Math.max(1, gridW), Math.max(1, gridH)));
  const agenda = $derived(yesno ? session.agendas[Math.min(vm.filled, session.agendas.length - 1)] : null);
  const numbers = $derived(items.map((it: any) => it.number));
  const range = $derived(numbers.length && numbers.every((n: number, i: number) => n === numbers[0] + i) ? `${numbers[0]}~${numbers[numbers.length - 1]}` : numbers.join(' · '));
  const multi = $derived(vm.total > 1);
  const keySize = $derived(Math.max(26, Math.min(38, gridH / 14)));
  // 제목이 먼저 내려앉고(0ms) 카드가 80ms 뒤부터 차례로 붙습니다. 합계는 motion.js가 0.5초 안으로 줄입니다.
  const cardDelay = (i: number, n: number) => (reduced ? '0ms' : `${80 + staggerDelay(i, n)}ms`);
</script>

<div class="vt-ballot" class:preview>
  <header class="vt-ballot-head vt-stage-enter" class:corners>
    {#if corners}<div class="vt-ballot-corner start">{@render lead?.()}</div>{/if}
    <div class="vt-ballot-title">
      {#if yesno}
        {#if session.agendas.length > 1}<span class="vt-ballot-chip">안건 {Math.min(vm.filled + 1, session.agendas.length)} / {session.agendas.length}</span>{/if}
        <h2 class="vt-ballot-agenda">{agenda?.text}</h2>
      {:else}
        <h2>{session.title}</h2>
        <p>{session.rules.votesPerVoter > 1 ? `${session.rules.votesPerVoter}표를 골라요 · ` : ''}고르고 싶은 {session.type === 'opinion' ? '항목' : '후보'}의 번호를 눌러요</p>
      {/if}
    </div>
    {#if corners}<div class="vt-ballot-corner end">{@render trail?.()}</div>{/if}
  </header>

  <div class="vt-ballot-grid" bind:clientWidth={gridW} bind:clientHeight={gridH}
    style:grid-template-columns={`repeat(${grid.cols}, minmax(0, 1fr))`} style:grid-template-rows={`repeat(${grid.rows}, minmax(0, 1fr))`}>
    {#if yesno}
      {#each [{ key: 1, label: '찬성', mark: 'O', color: 'mint' }, { key: 2, label: '반대', mark: 'X', color: 'apricot' }] as choice (choice.key)}
        <div class="vt-yn-card vt-c vt-pop-in" style:animation-delay={cardDelay(choice.key - 1, 2)} data-choice={choice.mark} style:--c-bg={choice.color === 'mint' ? '#CDEFE2' : '#FCDCC4'} style:--c-line={choice.color === 'mint' ? '#95D9BF' : '#F5B98C'} style:--c-ink={choice.color === 'mint' ? '#1F6E57' : '#96491A'}>
          <span class="vt-yn-key"><Keycap label={choice.key} size={grid.key} /></span>
          <Stamp text={choice.mark} round size={Math.min(grid.art * 1.1, 220)} color="var(--cink)" tilt={choice.mark === 'O' ? -6 : 6} />
          <strong style:font-size={`${Math.min(grid.name * 1.2, 96)}px`}>{choice.label}</strong>
        </div>
      {/each}
    {:else}
      {#each items as item, i (item.id)}
        <div class="vt-ballot-cell vt-pop-in" style:animation-delay={cardDelay(i, items.length)}>
          <ItemCard {item} type={session.type} orient={grid.orient} key={Math.min(grid.key, 150)} art={Math.min(grid.art, 330)} name={Math.min(grid.name, 120)} intro={Math.min(grid.intro, 24)} />
        </div>
      {/each}
    {/if}
  </div>

  <footer class="vt-ballot-foot" class:with-actions={!!actions}>
    <div class="vt-ballot-foot-main">
      {#if multi}
        <div class="vt-dots" aria-label={`${vm.total}표 중 ${vm.filled}표 골랐어요`}>
          {#each Array.from({ length: vm.total }) as _, i}<span class:on={i < vm.filled}></span>{/each}
          <b>{vm.filled} / {vm.total}</b>
        </div>
      {/if}
      <div class="vt-guide" aria-live="polite">
        {#if vm.hint}
          <span class="vt-guide-hint">{vm.hint}</span>
        {:else if yesno}
          <span><Keycap label="1" size={keySize} /> 찬성</span><span><Keycap label="2" size={keySize} /> 반대</span>
          {#if session.rules.allowAbstain}<span><Keycap label="0" size={keySize} /> 기권</span>{/if}
          {#if session.agendas.length > 1}<span><Keycap label="←" size={keySize} /> 앞 안건으로</span>{/if}
        {:else}
          <span><Keycap label={range} size={keySize} wide={range.length > 1} /> 투표</span>
          {#if session.rules.allowAbstain}<span><Keycap label="0" size={keySize} /> {multi ? '남은 표 기권' : '기권'}</span>{/if}
          {#if multi}<span><Keycap label="←" size={keySize} /> 한 표 지우기</span>{/if}
        {/if}
      </div>
    </div>
    {#if actions}<div class="vt-ballot-actions">{@render actions()}</div>{/if}
  </footer>
</div>

<style>
  .vt-ballot {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: clamp(10px, 1.6cqi, 22px);
    padding: clamp(14px, 2cqi, 28px) clamp(16px, 2.4cqi, 36px) clamp(12px, 1.6cqi, 22px);
    pointer-events: none;
  }
  .vt-ballot.preview {
    padding: 14px;
  }
  .vt-ballot-head {
    display: grid;
    justify-items: center;
    gap: 6px;
    text-align: center;
  }
  /* 양옆 자리: 가운데 제목이 가운데에 머물도록 양옆 칸을 같은 비율(1fr)로 두고, 제목이 길면 제목 칸이 줄어듭니다
     (양옆 칸은 버튼 너비 아래로 줄지 않아 버튼이 제목을 덮지 않음). */
  .vt-ballot-head.corners {
    grid-template-columns: 1fr minmax(0, auto) 1fr;
    align-items: center;
    column-gap: 16px;
  }
  .vt-ballot-title {
    display: grid;
    justify-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
  }
  .vt-ballot-corner {
    display: flex;
    align-items: center;
    min-width: 0;
    /* 투표판은 마우스를 받지 않지만(.vt-ballot) 이 자리의 버튼은 받습니다. */
    pointer-events: auto;
  }
  .vt-ballot-corner.start {
    justify-self: start;
  }
  .vt-ballot-corner.end {
    justify-self: end;
  }
  .vt-ballot-head h2 {
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    font-size: clamp(22px, 3cqi, 44px);
    font-weight: 900;
    letter-spacing: -0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vt-ballot-head p {
    margin: 0;
    color: var(--vt-muted);
    font-size: clamp(14px, 1.5cqi, 22px);
    font-weight: 800;
  }
  .vt-ballot-chip {
    padding: 4px 14px;
    border-radius: 999px;
    background: var(--vt-soft);
    font-size: clamp(14px, 1.4cqi, 20px);
    font-weight: 900;
  }
  .vt-ballot-agenda {
    font-size: clamp(24px, 3.6cqi, 54px) !important;
    white-space: normal !important;
    word-break: keep-all;
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
  .vt-ballot-grid {
    display: grid;
    gap: 18px;
    min-height: 0;
    padding: 8px;
  }
  /* 카드 칸: 카드가 칸을 가득 채우도록 크기만 넘겨 줍니다(붙는 움직임은 이 칸에 겁니다). */
  .vt-ballot-cell {
    display: grid;
    min-width: 0;
    min-height: 0;
  }
  .vt-yn-card {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 6%;
    border-radius: 30px;
    background: var(--cbg);
    box-shadow:
      0 0 0 6px #fff,
      0 9px 0 0 var(--cline),
      0 14px 30px color-mix(in srgb, var(--vt-ink) 12%, transparent);
  }
  .vt-yn-card strong {
    color: var(--cink);
    font-weight: 900;
    line-height: 1;
  }
  .vt-yn-key {
    position: absolute;
    top: 16px;
    left: 16px;
  }
  /* 아래 줄: 가운데 키 안내 + 오른쪽 선생님 버튼. 양옆 칸을 같은 너비로 두어 키 안내가 가운데에 머뭅니다. */
  .vt-ballot-foot {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
    min-height: 54px;
  }
  .vt-ballot-foot-main {
    grid-column: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 22px;
    flex-wrap: wrap;
  }
  .vt-ballot-actions {
    grid-column: 3;
    justify-self: end;
    display: flex;
    gap: 8px;
    /* 투표판은 마우스를 받지 않지만(.vt-ballot) 선생님 버튼만은 받습니다. */
    pointer-events: auto;
  }
  /* 창이 좁으면 키 안내를 왼쪽으로 붙여 버튼과 겹치지 않게 합니다. */
  @container (max-width: 1100px) {
    .vt-ballot-foot.with-actions {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .vt-ballot-foot.with-actions .vt-ballot-foot-main {
      grid-column: 1;
      justify-content: flex-start;
    }
    .vt-ballot-foot.with-actions .vt-ballot-actions {
      grid-column: 2;
    }
  }
  .vt-dots {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--vt-card);
    box-shadow: var(--vt-shadow);
  }
  .vt-dots span {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2.5px solid color-mix(in srgb, var(--vt-ink) 35%, transparent);
    transition: background var(--vt-quick) var(--vt-ease), border-color var(--vt-quick) var(--vt-ease);
  }
  /* 표 점은 왼쪽부터 채워집니다(어느 후보인지는 드러나지 않음). 찰 때 톡 부풀었다 돌아옵니다. */
  .vt-dots span.on {
    border-color: var(--vt-accent);
    background: var(--vt-accent);
    animation: vt-dot-pop 260ms var(--vt-ease-pop);
  }
  @keyframes vt-dot-pop {
    from {
      transform: scale(0.6);
    }
    60% {
      transform: scale(1.18);
    }
  }
  :global(.vt-root.reduced) .vt-dots span.on {
    animation: none;
  }
  .vt-dots b {
    margin-left: 4px;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }
  .vt-guide {
    display: flex;
    align-items: center;
    gap: 22px;
    min-height: 48px;
    color: var(--vt-muted);
    font-size: clamp(15px, 1.5cqi, 21px);
    font-weight: 800;
  }
  .vt-guide > span {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .vt-guide-hint {
    padding: 10px 20px;
    border-radius: 999px;
    background: var(--vt-card);
    color: var(--vt-ink);
    box-shadow: var(--vt-shadow);
  }
</style>
