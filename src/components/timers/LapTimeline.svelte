<script lang="ts">
  import { tick } from 'svelte';
  import { Flag, ArrowUp } from 'lucide-svelte';
  import { formatTime } from '../../lib/timers/engine.js';
  let { laps } = $props<{
    laps: { id: string; sequence: number; elapsedMs: number; splitMs: number }[];
  }>();
  let list: HTMLDivElement;
  let unread = $state(0);
  let last = 0;
  $effect(() => {
    const count = laps.length,
      added = count - last;
    last = count;
    if (added > 0 && list) {
      const top = list.scrollTop,
        oldHeight = list.scrollHeight;
      void tick().then(() => {
        if (top > 16) {
          list.scrollTop = top + list.scrollHeight - oldHeight;
          unread += added;
        } else list.scrollTop = 0;
        last = count;
      });
    } else last = count;
    if (!count) unread = 0;
  });
</script>

<aside class="lap-panel">
  <header>
    <h2><Flag size={17} />기록</h2>
    <span>{laps.length}</span>
  </header>
  {#if unread}<button
      class="lap-new"
      onclick={() => {
        list.scrollTo({ top: 0, behavior: 'smooth' });
        unread = 0;
      }}><ArrowUp size={13} />새 기록 {unread}개</button
    >{/if}
  <div
    class="lap-list"
    bind:this={list}
    onscroll={() => {
      if (list.scrollTop < 16) unread = 0;
    }}
  >
    {#if !laps.length}<div class="lap-empty">
        <Flag size={28} />
        <p>기록할 순간에<br /><strong>기록</strong>을 눌러 주세요.</p>
      </div>{/if}
    {#each [...laps].reverse() as lap (lap.id)}<div class="lap-item">
        <span class="lap-dot"></span>
        <div class="lap-top">
          <span>기록 {String(lap.sequence).padStart(2, '0')}</span><time
            >{formatTime(lap.elapsedMs, true)}</time
          >
        </div>
        <div class="lap-bottom">구간 <span>+{formatTime(lap.splitMs, true)}</span></div>
      </div>{/each}
  </div>
</aside>
