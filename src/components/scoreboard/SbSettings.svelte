<script lang="ts">
  // 설정 서랍(PRD 6.10). 점수판이 보이는 채로 오른쪽에서 열리고, 바꾸는 즉시 저장됩니다([저장] 버튼 없음).
  import { dndzone } from 'svelte-dnd-action';
  import { X, GripVertical, Trash2, Plus, Copy } from 'lucide-svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import GroupSymbol from './GroupSymbol.svelte';
  import { PALETTE, SYMBOLS, SYMBOL_LABELS, LIMITS, cleanLabel } from '../../lib/scoreboard/model.js';

  type Prefs = { badges: boolean; colorCards: boolean; showNumber?: boolean; groupColors?: boolean; clusterByGroup?: boolean };
  let {
    kind,
    prefs,
    shared,
    hasGroups = false,
    groups = [],
    board = null,
    onprefs,
    onshared,
    onclose,
    ongroup,
    onremovegroup,
    onboard,
    onitems,
    onduplicate,
    ondelete,
  } = $props<{
    kind: 'personal' | 'group' | 'custom';
    prefs: Prefs;
    shared: { sound: boolean; volume: number; reduced: boolean };
    hasGroups?: boolean;
    groups?: { id: string; name: string; color: string; symbol: string; score: number }[];
    board?: { id: string; title: string; startScore: number; items: { id: string; name: string; color: string; score: number }[] } | null;
    onprefs: (patch: Partial<Prefs>) => void;
    onshared: (patch: Partial<{ sound: boolean; volume: number; reduced: boolean }>) => void;
    onclose: () => void;
    ongroup?: (id: string, patch: { name?: string; color?: string; symbol?: string }) => void;
    onremovegroup?: (id: string) => void;
    onboard?: (patch: { title?: string; startScore?: number }) => void;
    onitems?: (items: { id?: string; name: string; color?: string }[]) => void;
    onduplicate?: () => void;
    ondelete?: () => void;
  }>();

  let openRow = $state<string | null>(null);
  // 슬라이더를 끄는 동안은 내 값, 저장되면 다시 저장값을 따릅니다(쓰기 가능한 $derived).
  let volume = $derived(shared.volume);

  // 커스텀 항목 목록: 끌어서 순서 바꾸기 동안은 이 창 안의 목록을 쓰고, 놓으면 저장합니다.
  let items = $state<{ id: string; name: string; color: string }[]>([]);
  let dragging = false;
  $effect(() => {
    const src = board?.items ?? [];
    if (!dragging) items = src.map((it: { id: string; name: string; color: string }) => ({ id: it.id, name: it.name, color: it.color }));
  });
  let newItem = $state('');
  const commitItems = (next = items) => onitems?.(next.map((it) => ({ id: it.id, name: it.name, color: it.color })));
  function consider(e: CustomEvent<{ items: typeof items }>) {
    dragging = true;
    items = e.detail.items;
  }
  function finalize(e: CustomEvent<{ items: typeof items }>) {
    items = e.detail.items;
    dragging = false;
    commitItems();
  }
  function addItem() {
    const name = cleanLabel(newItem, LIMITS.itemName);
    if (!name || items.length >= LIMITS.items) return;
    commitItems([...items, { id: '', name, color: '' }]);
    newItem = '';
  }
  const enter = (commit: () => void) => (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') commit();
  };
</script>

<aside class="sb-drawer" aria-label="점수판 설정">
  <header class="sb-drawer-head"><strong>설정</strong><button class="sb-icon-btn" aria-label="설정 닫기" title="닫기 (Esc)" onclick={onclose}><X size={18} /></button></header>

  {#if kind === 'custom' && board}
    <section>
      <h3>점수판</h3>
      <label class="sb-field"><span>이름</span><input value={board.title} maxlength={LIMITS.boardTitle}
          onchange={(e) => onboard?.({ title: e.currentTarget.value })} onkeydown={enter(() => (document.activeElement as HTMLElement)?.blur())} /></label>
      <label class="sb-field"><span>시작 점수</span><input class="sb-num-input" type="number" value={board.startScore} min={-LIMITS.score} max={LIMITS.score}
          onchange={(e) => onboard?.({ startScore: Number(e.currentTarget.value) || 0 })} /><small>초기화하면 이 점수로 돌아가요</small></label>
    </section>
  {/if}

  <section>
    <h3>표시</h3>
    <div class="sb-row"><span><b>순위 배지</b><small>앞서 있는 1~3위에 금·은·동</small></span><ToolkitSwitch label="순위 배지" checked={prefs.badges} onchange={(v) => onprefs({ badges: v })} /></div>
    <div class="sb-row"><span><b>카드 색 칠하기</b><small>끄면 테마 색 한 가지로</small></span><ToolkitSwitch label="카드 색 칠하기" checked={prefs.colorCards} onchange={(v) => onprefs({ colorCards: v })} /></div>
    {#if kind === 'personal'}
      <div class="sb-row"><span><b>번호 표시</b><small>동명이인은 꺼도 번호가 보여요</small></span><ToolkitSwitch label="번호 표시" checked={prefs.showNumber ?? true} onchange={(v) => onprefs({ showNumber: v })} /></div>
      {#if hasGroups}
        <div class="sb-row"><span><b>모둠 색 표시</b><small>학급 명단의 모둠을 색 띠로</small></span><ToolkitSwitch label="모둠 색 표시" checked={prefs.groupColors ?? true} onchange={(v) => onprefs({ groupColors: v })} /></div>
        <div class="sb-row"><span><b>모둠끼리 모아 보기</b><small>모둠별로 묶어서 보여 줘요</small></span><ToolkitSwitch label="모둠끼리 모아 보기" checked={prefs.clusterByGroup ?? false} onchange={(v) => onprefs({ clusterByGroup: v })} /></div>
      {/if}
    {/if}
  </section>

  <section>
    <h3>소리 · 움직임</h3>
    <div class="sb-row"><span><b>효과음</b><small>M 키로도 켜고 꺼요</small></span><ToolkitSwitch label="효과음" checked={shared.sound} onchange={(v) => onshared({ sound: v })} /></div>
    <label class="sb-row sb-volume" class:off={!shared.sound}><span><b>음량</b></span><input type="range" min="0" max="100" step="5" bind:value={volume} disabled={!shared.sound}
        onchange={() => onshared({ volume: Number(volume) })} aria-label="음량" /><output>{volume}</output></label>
    <div class="sb-row"><span><b>동작 줄이기</b><small>움직임 대신 짧게 반짝여요</small></span><ToolkitSwitch label="동작 줄이기" checked={shared.reduced} onchange={(v) => onshared({ reduced: v })} /></div>
  </section>

  {#if kind === 'group'}
    <section>
      <h3>모둠 <small>{groups.length}개 · 이름은 카드에서 두 번 눌러도 고칠 수 있어요</small></h3>
      <ul class="sb-edit-list">
        {#each groups as g (g.id)}
          <li>
            <div class="sb-edit-row">
              <button class="sb-swatch-btn" aria-label={`${g.name} 색과 모양 바꾸기`} aria-expanded={openRow === g.id} onclick={() => (openRow = openRow === g.id ? null : g.id)}
                ><GroupSymbol symbol={g.symbol} color={PALETTE.find((p) => p.id === g.color)?.color} size={22} /></button>
              <input value={g.name} maxlength={LIMITS.groupName} aria-label="모둠 이름" onchange={(e) => ongroup?.(g.id, { name: e.currentTarget.value })} onkeydown={enter(() => (document.activeElement as HTMLElement)?.blur())} />
              <button class="sb-icon-btn" aria-label={`${g.name} 빼기`} title={groups.length <= LIMITS.groupMin ? `모둠은 ${LIMITS.groupMin}개 이상이어야 해요` : '이 모둠 빼기'} disabled={groups.length <= LIMITS.groupMin} onclick={() => onremovegroup?.(g.id)}><Trash2 size={16} /></button>
            </div>
            {#if openRow === g.id}
              <div class="sb-picker">
                <div class="sb-swatches" role="radiogroup" aria-label="색">
                  {#each PALETTE as p (p.id)}<button role="radio" aria-checked={g.color === p.id} aria-label={p.label} title={p.label} style:--sw={p.color} onclick={() => ongroup?.(g.id, { color: p.id })}></button>{/each}
                </div>
                <div class="sb-symbols" role="radiogroup" aria-label="모양">
                  {#each SYMBOLS as s (s)}<button role="radio" aria-checked={g.symbol === s} aria-label={SYMBOL_LABELS[s as keyof typeof SYMBOL_LABELS]} title={SYMBOL_LABELS[s as keyof typeof SYMBOL_LABELS]} onclick={() => ongroup?.(g.id, { symbol: s })}><GroupSymbol symbol={s} color={PALETTE.find((p) => p.id === g.color)?.color} size={20} /></button>{/each}
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if kind === 'custom' && board}
    <section>
      <h3>항목 <small>{items.length}/{LIMITS.items} · 끌어서 순서를 바꿔요</small></h3>
      <ul class="sb-edit-list" use:dndzone={{ items, flipDurationMs: 150, dropTargetStyle: { outline: 'none' } }} onconsider={consider} onfinalize={finalize}>
        {#each items as it, i (it.id)}
          <li>
            <div class="sb-edit-row">
              <span class="sb-grip" aria-hidden="true"><GripVertical size={16} /></span>
              <button class="sb-swatch-btn dot" style:--sw={PALETTE.find((p) => p.id === it.color)?.color} aria-label={`${it.name} 색 바꾸기`} aria-expanded={openRow === it.id} onclick={() => (openRow = openRow === it.id ? null : it.id)}></button>
              <input value={it.name} maxlength={LIMITS.itemName} aria-label="항목 이름"
                onchange={(e) => commitItems(items.map((x, j) => (j === i ? { ...x, name: e.currentTarget.value } : x)))} onkeydown={enter(() => (document.activeElement as HTMLElement)?.blur())} />
              <button class="sb-icon-btn" aria-label={`${it.name} 지우기`} disabled={items.length <= 1} title={items.length <= 1 ? '항목이 하나는 있어야 해요' : '지우기 (되돌리기 가능)'}
                onclick={() => commitItems(items.filter((x) => x.id !== it.id))}><Trash2 size={16} /></button>
            </div>
            {#if openRow === it.id}
              <div class="sb-picker"><div class="sb-swatches" role="radiogroup" aria-label="색">
                {#each PALETTE as p (p.id)}<button role="radio" aria-checked={it.color === p.id} aria-label={p.label} title={p.label} style:--sw={p.color}
                    onclick={() => commitItems(items.map((x) => (x.id === it.id ? { ...x, color: p.id } : x)))}></button>{/each}
              </div></div>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="sb-add-row">
        <input placeholder="새 항목 이름" maxlength={LIMITS.itemName} bind:value={newItem} onkeydown={enter(addItem)} aria-label="새 항목 이름" disabled={items.length >= LIMITS.items} />
        <button class="sb-tool-btn" onclick={addItem} disabled={!newItem.trim() || items.length >= LIMITS.items}><Plus size={16} />추가</button>
      </div>
    </section>
    <section class="sb-danger-zone">
      <button class="sb-tool-btn" onclick={onduplicate}><Copy size={16} />이 점수판 복제</button>
      <button class="sb-tool-btn danger" onclick={ondelete}><Trash2 size={16} />이 점수판 삭제</button>
    </section>
  {/if}
</aside>
