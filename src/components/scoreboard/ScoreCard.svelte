<script lang="ts">
  // 점수 카드 하나(PRD 6.2): 위 = 순위 배지·이름, 가운데 = 점수, 버튼은 넓은 카드면 아래 [−] 2 : 3 [+],
  // 좁은 카드면 점수 양옆(세로 자리를 아껴 숫자를 키움 — layout.js cardMetrics).
  // 이름은 폭에 맞춰 글자를 줄이고 줄바꿈하지 않습니다.
  import { untrack } from 'svelte';
  import { Check } from 'lucide-svelte';
  import RollingNumber from '../scores/RollingNumber.svelte';
  import RankBadge from './RankBadge.svelte';
  import GroupSymbol from './GroupSymbol.svelte';
  import { signed, scoreText } from '../../lib/scoreboard/steps.js';
  import { PALETTE } from '../../lib/scoreboard/model.js';
  import { fitFontSize } from '../../lib/scoreboard/fitText.js';
  import { springLinear, DURATION } from '../../lib/scores/motion.js';

  type Card = { id: string; name: string; number?: number; showNumber?: boolean; color: string | null; symbol?: string; sub?: string; score: number };
  type Metrics = { mode: 'bottom' | 'side'; scoreFont: number; nameMax: number; btnH: number; btnW: number; pad: number; gap: number };
  let {
    card,
    density,
    cardW,
    metrics,
    badge = 0,
    step,
    selectMode = false,
    selected = false,
    reduced = false,
    colorize = true,
    keyHint = '',
    editableName = false,
    fontFamily = '',
    fontEpoch = 0,
    onadjust,
    onset,
    onrename,
    ontoggle,
  } = $props<{
    card: Card;
    density: 'wide' | 'normal' | 'tight';
    cardW: number;
    metrics: Metrics;
    badge?: number;
    step: number;
    selectMode?: boolean;
    selected?: boolean;
    reduced?: boolean;
    colorize?: boolean;
    keyHint?: string;
    editableName?: boolean;
    fontFamily?: string;
    fontEpoch?: number;
    onadjust: (delta: number) => void;
    onset: (value: number) => void;
    onrename?: (name: string) => void;
    ontoggle?: () => void;
  }>();

  const colorHex = $derived(PALETTE.find((p) => p.id === card.color)?.color ?? '');
  const badgeSize = $derived(density === 'wide' ? 34 : density === 'normal' ? 26 : 20);
  const symbolSize = $derived(density === 'wide' ? 26 : density === 'normal' ? 20 : 16);
  // 이름 칸의 폭 = 카드 폭 − 안쪽 여백 − 배지·모양·번호·선택 표시 자리
  const nameAvail = $derived.by(() => {
    let w = cardW - metrics.pad * 2 - 4;
    if (badge) w -= badgeSize + 6;
    if (card.symbol) w -= symbolSize + 6;
    if (card.showNumber && card.number != null) w -= metrics.nameMax * 0.72 * 0.62 * String(card.number).length + 6;
    if (keyHint) w -= 26;
    if (selectMode) w -= 30;
    return Math.max(24, w);
  });
  const nameSize = $derived.by(() => {
    void fontEpoch;
    return fitFontSize(card.name, { family: fontFamily, avail: nameAvail, max: metrics.nameMax, min: 13 }).size;
  });
  const label = $derived(`${card.showNumber && card.number != null ? `${card.number}번 ` : ''}${card.name}`);
  const side = $derived(metrics.mode === 'side');

  // ── 점수가 바뀌면 튀기 + "+5" 칩 ──
  let body = $state<HTMLElement>();
  let prevScore = untrack(() => card.score);
  let chips = $state<{ id: number; delta: number }[]>([]);
  let flash = $state(false);
  let chipSeq = 0;
  const bounce = springLinear({ bounce: 0.35, settle: 6 });
  $effect(() => {
    const s = card.score;
    if (s === prevScore) return;
    const delta = s - prevScore;
    prevScore = s;
    untrack(() => react(delta));
  });
  function react(delta: number) {
    if (reduced || !body) {
      flash = true;
      setTimeout(() => (flash = false), DURATION.reduced);
      return;
    }
    const frames = delta > 0
      ? [{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }, { transform: 'scale(1)' }]
      : [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }];
    body.animate(frames, { duration: DURATION.bump, easing: delta > 0 ? bounce : 'ease-out' });
    const id = ++chipSeq;
    chips = [...chips.slice(-2), { id, delta }];
    setTimeout(() => (chips = chips.filter((c) => c.id !== id)), DURATION.chip + 60);
  }

  // ── 새로 1위가 되면 왕관이 튀어나옴 ──
  let prevBadge = untrack(() => badge);
  let pop = $state(false);
  $effect(() => {
    const b = badge;
    if (b === 1 && prevBadge !== 1 && !reduced) {
      pop = true;
      setTimeout(() => (pop = false), 600);
    }
    prevBadge = b;
  });

  // ── 점수·이름 직접 고치기(두 번 누르기) ──
  let editingScore = $state(false);
  let editingName = $state(false);
  let draft = $state('');
  function beginScore() {
    if (selectMode) return;
    draft = String(card.score);
    editingScore = true;
  }
  function commitScore() {
    if (!editingScore) return;
    const t = draft.normalize('NFKC').replace(/−/g, '-').trim();
    editingScore = false;
    if (/^-?\d{1,6}$/.test(t) && Number(t) !== card.score) onset(Number(t));
  }
  function beginName() {
    if (!editableName || selectMode) return;
    draft = card.name;
    editingName = true;
  }
  function commitName() {
    if (!editingName) return;
    editingName = false;
    if (draft.trim() && draft.trim() !== card.name) onrename?.(draft);
  }
  function editKeys(e: KeyboardEvent, commit: () => void) {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      editingScore = false;
      editingName = false;
    }
  }
  const focusAndSelect = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };

  function onKey(e: KeyboardEvent) {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (selectMode && (e.key === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      ontoggle?.();
      return;
    }
    if (e.key === 'Enter' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      e.preventDefault();
      e.stopPropagation();
      onadjust(step);
    } else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      onadjust(-step);
    }
  }
</script>

{#snippet minus()}<button class="sb-minus" aria-label={`${card.name} ${step}점 빼기`} onclick={(e) => { e.stopPropagation(); onadjust(-step); }}>{signed(-step)}</button>{/snippet}
{#snippet plus()}<button class="sb-plus" aria-label={`${card.name} ${step}점 더하기`} onclick={(e) => { e.stopPropagation(); onadjust(step); }}>{signed(step)}</button>{/snippet}

<!-- 카드 자체가 키보드 조작 단위(↑↓·숫자 키, 고르기 모드의 체크)라 초점을 받아야 합니다. 역할이 모드에 따라 바뀌어 검사기가 판단하지 못합니다. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<article
  bind:this={body}
  class="sb-card"
  data-density={density}
  data-mode={metrics.mode}
  class:colorize
  class:selected
  class:select-mode={selectMode}
  class:flash
  style:--pc={colorHex || null}
  style:--score-size={`${metrics.scoreFont}px`}
  style:--name-size={`${nameSize}px`}
  style:--btn-h={`${metrics.btnH}px`}
  style:--btn-w={`${metrics.btnW}px`}
  style:--pad={`${metrics.pad}px`}
  style:--gap={`${metrics.gap}px`}
  tabindex="0"
  role={selectMode ? 'checkbox' : 'group'}
  aria-checked={selectMode ? selected : undefined}
  aria-label={`${label} ${scoreText(card.score)}점${badge ? `, ${badge}위` : ''}`}
  onclick={selectMode ? () => ontoggle?.() : undefined}
  onkeydown={onKey}
>
  <header class="sb-card-head">
    {#if badge}<RankBadge rank={badge} size={badgeSize} {pop} />{/if}
    {#if card.symbol}<GroupSymbol symbol={card.symbol} color={colorHex || 'var(--tk-accent)'} size={symbolSize} />{/if}
    {#if card.showNumber && card.number != null}<span class="sb-num">{card.number}</span>{/if}
    {#if editingName}<input class="sb-name-input" maxlength="16" bind:value={draft} use:focusAndSelect onblur={commitName} onkeydown={(e) => editKeys(e, commitName)} aria-label="이름 고치기" />
    {:else}<span class="sb-name" title={editableName ? `${card.name} (두 번 눌러 이름 고치기)` : card.name} ondblclick={beginName} role="presentation">{card.name}</span>{/if}
    {#if keyHint}<kbd class="sb-key" aria-hidden="true">{keyHint}</kbd>{/if}
    {#if selectMode}<span class="sb-check" aria-hidden="true">{#if selected}<Check size={16} strokeWidth={3} />{/if}</span>{/if}
  </header>
  {#if density === 'wide' && card.sub}<span class="sb-sub">{card.sub}</span>{/if}
  <div class="sb-body">
    {#if side && !selectMode}{@render minus()}{/if}
    <div class="sb-score" class:negative={card.score < 0} ondblclick={beginScore} role="presentation" title="두 번 누르면 점수를 직접 고칠 수 있어요">
      {#if editingScore}<input class="sb-score-input" inputmode="numeric" bind:value={draft} use:focusAndSelect onblur={commitScore} onkeydown={(e) => editKeys(e, commitScore)} aria-label="점수 직접 고치기" />
      {:else}<RollingNumber value={card.score} {reduced} />{/if}
      {#each chips as c (c.id)}<span class="sb-float" class:down={c.delta < 0} aria-hidden="true">{signed(c.delta)}</span>{/each}
    </div>
    {#if side && !selectMode}{@render plus()}{/if}
  </div>
  {#if !side && !selectMode}<footer class="sb-card-actions">{@render minus()}{@render plus()}</footer>{/if}
</article>
