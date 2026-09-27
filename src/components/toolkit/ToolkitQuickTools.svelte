<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { GripVertical, Plus, Check, ArrowUp, ArrowDown } from 'lucide-svelte';
  import ToolIcon from './ToolIcon.svelte';
  import { defaults, groupToolOrder, isToolEnabled } from '../../lib/toolkit/preferences.js';
  import { TOOL_REGISTRY, PLATFORM_TOOLS } from '../../lib/toolkit/registry.js';
  import { readSettings, subscribeSettings, patchSettings, previewToolOrder } from '../../lib/toolkit/store.js';
  import { sortToolRows } from '../../lib/toolkit/sortTools.js';
  let config = $state(defaults().toolkit);
  let ready = $state(false), saving = $state(false), error = $state(''), dragged = $state('');
  let draft = $state<string[] | null>(null);
  let selected = $state('');
  let status = $state('');
  const names: Record<string, string> = Object.fromEntries([...TOOL_REGISTRY.map(t => [t.id, t.label]), ['external', '외부 툴']]);
  const order = $derived(groupToolOrder(draft ?? config.toolOrderIds, config));
  const enabled = $derived(order.filter(id => isToolEnabled(config, id)));
  const disabled = $derived(order.filter(id => !isToolEnabled(config, id)));
  const rows = $derived([...enabled, 'divider', ...disabled]);
  const selectedGroup = $derived(isToolEnabled(config, selected) ? enabled : disabled);
  const selectedIndex = $derived(selectedGroup.indexOf(selected));
  function preview(ids: string[] | null) {
    draft = ids;
    void previewToolOrder(ids).catch(() => {});
  }
  async function saveOrder(ids: string[]) {
    if (saving) return false;
    saving = true;
    try {
      config = (await patchSettings('toolkit', { toolOrderIds: ids })).toolkit;
      error = '';
      status = '도구 순서를 저장했어요.';
      return true;
    } catch {
      error = '순서를 저장하지 못했어요. 다시 시도해 주세요.';
      return false;
    } finally { saving = false; }
  }
  async function move(id: string, direction: number) {
    if (saving || dragged) return;
    selected = id;
    const ids = [...config.toolOrderIds];
    const index = ids.indexOf(id), target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length || isToolEnabled(config, id) !== isToolEnabled(config, ids[target])) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await saveOrder(ids);
  }
  function keyMove(event: KeyboardEvent, id: string) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    void move(id, event.key === 'ArrowUp' ? -1 : 1);
  }
  async function toggle(id: string) {
    if (saving || dragged) return;
    saving = true;
    const next = !isToolEnabled(config, id);
    const others = config.visibleToolIds.filter(value => value !== id);
    try {
      const patch = id === 'external'
        ? { externalToolsEnabled: next, ...(next && PLATFORM_TOOLS.every(t => config.hiddenPlatformIds.includes(t.id)) ? { hiddenPlatformIds: [] } : {}) }
        : { visibleToolIds: next ? [...others, id] : others };
      config = (await patchSettings('toolkit', patch)).toolkit;
      selected = id;
      error = '';
      status = `${names[id]} ${next ? '활성화' : '비활성화'}했어요.`;
      await tick();
    } catch { error = '변경을 저장하지 못했어요. 다시 시도해 주세요.'; }
    finally { saving = false; }
  }
  onMount(() => {
    let disposed = false, off = () => {};
    void (async () => {
      try {
        const unsubscribe = await subscribeSettings(s => { if (!disposed) config = s.toolkit; });
        if (disposed) { unsubscribe(); return; }
        off = unsubscribe;
        const settings = await readSettings();
        if (!disposed) { config = settings.toolkit; ready = true; }
      } catch { error = '도구 목록을 불러오지 못했어요.'; }
    })();
    return () => { disposed = true; off(); void previewToolOrder(null).catch(() => {}); };
  });
</script>

<section class="quick-tools" aria-label="도구 표시와 순서">
  <div class="quick-caption"><strong>도구 관리</strong><span>변경 즉시 저장</span></div>
  <p class="quick-help">끌어서 순서 변경 · 오른쪽 버튼으로 켜고 끄기</p>
  <div class="quick-scroll" data-tool-scroll>
    <div class="quick-list" role="list" aria-label="툴킷 도구" aria-busy={!ready || saving}
      use:sortToolRows={{ order, groups: [enabled, disabled], disabled: !ready || saving, onpreview: preview, onactive: id => { dragged = id; if (id) selected = id; }, oncommit: saveOrder }}>
      <div class="quick-group" role="presentation">활성화된 도구 <span>{enabled.length}</span></div>
      {#if !enabled.length}<p class="quick-empty">아래에서 사용할 도구를 추가하세요.</p>{/if}
      {#each rows as id (id)}
        {#if id === 'divider'}
          <div class="quick-group muted" role="presentation">비활성화된 도구 <span>{disabled.length}</span></div>
          {#if !disabled.length}<p class="quick-empty">모든 도구를 사용 중이에요.</p>{/if}
        {:else}
          {@const active = isToolEnabled(config, id)}
          <div class="quick-row" class:inactive={!active} class:selected={selected === id} class:sort-placeholder={dragged === id} data-tool-order-id={id} role="listitem" onpointerdowncapture={() => selected = id}>
            <button class="tool-order-grip quick-grip" aria-label={`${names[id]} 순서 이동`} title="드래그하거나 ↑↓ 키로 순서 변경" onfocus={() => selected = id} onkeydown={e => keyMove(e, id)} disabled={!ready || saving}><GripVertical size={14}/></button>
            <span class="quick-tool-icon"><ToolIcon kind={id} size={23}/></span>
            <span class="quick-name">{names[id]}</span>
            <button class="quick-toggle" class:on={active} role="switch" aria-checked={active} aria-label={`${names[id]} 활성화`} disabled={!ready || saving || !!dragged} onclick={() => toggle(id)}>
              {#if active}<Check size={13}/><span>사용 중</span>{:else}<Plus size={13}/><span>추가</span>{/if}
            </button>
          </div>
        {/if}
      {/each}
    </div>
  </div>
  <div class="quick-order-controls">
    <span>{selected ? `${names[selected]} 순서` : '도구를 선택해 순서를 바꿔요'}</span>
    <button aria-label="선택한 도구 위로" disabled={!selected || selectedIndex <= 0 || saving || !!dragged} onclick={() => move(selected, -1)}><ArrowUp size={15}/></button>
    <button aria-label="선택한 도구 아래로" disabled={!selected || selectedIndex < 0 || selectedIndex >= selectedGroup.length - 1 || saving || !!dragged} onclick={() => move(selected, 1)}><ArrowDown size={15}/></button>
  </div>
  {#if error}<p class="quick-error" role="alert">{error}</p>{/if}
  <span class="quick-status" aria-live="polite">{status}</span>
</section>

<style>
  .quick-tools { display:flex; flex-direction:column; flex:1; min-height:0; border-top:1px solid var(--tk-line); padding-top:10px; }
  .quick-caption { display:flex; justify-content:space-between; align-items:center; padding:0 6px; font-size:12px; }
  .quick-caption span { color:var(--tk-muted); font-size:10px; }
  .quick-help { font-size:10px; color:var(--tk-muted); margin:5px 6px 8px; }
  .quick-scroll { overflow-y:auto; flex:1; min-height:80px; scrollbar-width:thin; scrollbar-color:var(--tk-line) transparent; }
  .quick-list { position:relative; }
  .quick-group { display:flex; align-items:center; gap:7px; padding:7px 8px 4px; font-size:10px; font-weight:700; color:var(--tk-accent); }
  .quick-group span { font-size:10px; opacity:.7; }
  .quick-group.muted { color:var(--tk-muted); border-top:1px solid var(--tk-line); margin-top:7px; background:var(--tk-bg); }
  .quick-row { display:flex; align-items:center; gap:7px; min-height:34px; border-radius:7px; padding:1px 5px; touch-action:none; }
  .quick-row.inactive { background:var(--tk-bg); border-radius:0; }
  .quick-row.inactive .quick-tool-icon { filter:grayscale(.8); opacity:.65; }
  .quick-row.selected { box-shadow:inset 2px 0 var(--tk-accent); }
  .quick-row.sort-placeholder { background:var(--tk-soft); }
  .quick-row.sort-placeholder > * { visibility:hidden; }
  .quick-tool-icon { display:grid; place-items:center; flex-shrink:0; }
  .quick-name { flex:1; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:12px; color:var(--tk-ink); }
  .quick-row.inactive .quick-name { color:var(--tk-muted); }
  .quick-tools .quick-grip { width:22px; height:28px; padding:0; display:grid; place-items:center; color:var(--tk-muted); cursor:grab; flex-shrink:0; }
  .quick-tools .quick-toggle { width:66px; height:26px; min-height:26px; padding:3px 6px; display:flex; gap:4px; border:1px solid var(--tk-line); border-radius:6px; font-size:10px; flex-shrink:0; background:var(--tk-panel); }
  .quick-tools .quick-toggle.on { color:var(--tk-accent); background:var(--tk-soft); border-color:transparent; }
  .quick-tools button:disabled { opacity:.4; cursor:default; }
  .quick-tools button:focus-visible { outline:2px solid var(--tk-accent); outline-offset:-2px; }
  .quick-order-controls { display:flex; align-items:center; gap:4px; border-top:1px solid var(--tk-line); padding:6px 4px 0; }
  .quick-order-controls > span { flex:1; font-size:10px; color:var(--tk-muted); }
  .quick-tools .quick-order-controls button { width:27px; height:26px; min-height:26px; padding:0; display:grid; place-items:center; border:1px solid var(--tk-line); border-radius:6px; }
  .quick-empty { padding:8px; margin:0; font-size:11px; color:var(--tk-muted); }
  .quick-error { color:var(--tk-danger); font-size:11px; margin:4px; }
  .quick-status { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
</style>
