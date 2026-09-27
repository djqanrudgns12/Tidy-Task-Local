<script lang="ts">
  // 사유 칩 줄: 정해 둔 칩(협동·발표…) + 그 옆 "직접 입력" 칸.
  // 칩 줄은 올린 직후 4초만 떠 있으므로, 직접 쓰는 동안(칸에 초점이 있는 동안)은 onhold(true)로 사라지지 않게 붙잡습니다.
  // 줄이 사라지면 이 컴포넌트도 없어져 쓰다 만 글이 다음 올리기에 남지 않습니다.
  import { Check, PenLine } from 'lucide-svelte';
  import { cleanLabel } from '../../lib/scoreboard/model.js';
  import { LIMITS } from '../../lib/thermometer/model.js';

  let { chips, onreason, onhold } = $props<{
    chips: string[];
    onreason: (reason: string) => void;
    onhold: (holding: boolean) => void;
  }>();

  let text = $state('');
  const ready = $derived(cleanLabel(text, LIMITS.reason).length > 0);

  function submit() {
    const clean = cleanLabel(text, LIMITS.reason);
    if (!clean) return;
    text = '';
    onreason(clean);
  }
  function keydown(e: KeyboardEvent) {
    // 한글 조합을 끝내는 Enter는 건너뜁니다(조합이 끝난 뒤의 Enter에서 한 번만 붙입니다).
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      // 쓰던 글을 지우고 칸에서 나옵니다. 칩 줄은 붙잡기가 풀려 4초 뒤 스스로 사라집니다.
      e.preventDefault();
      text = '';
      (e.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<div class="th-chips" role="group" aria-label="사유 붙이기">
  {#each chips as c (c)}<button onclick={(e) => { e.stopPropagation(); onreason(c); }}>{c}</button>{/each}
  <!-- label로 감싸 연필 아이콘·빈 곳을 눌러도 칸으로 들어갑니다. -->
  <label class="th-chip-custom">
    <PenLine size={14} aria-hidden="true" />
    <input bind:value={text} maxlength={LIMITS.reason} placeholder="직접 입력" aria-label="사유 직접 입력 (Enter로 붙이기)"
      spellcheck="false" autocomplete="off"
      onfocus={() => onhold(true)} onblur={() => onhold(false)} onkeydown={keydown} />
    <!-- 마우스·터치로도 붙일 수 있게 글이 있을 때만 확인 단추를 보여 줍니다. mousedown에서 기본 동작을 막아
         칸의 초점이 먼저 빠져 칩 줄 붙잡기가 풀리지 않게 합니다. -->
    {#if ready}<button class="th-chip-ok" aria-label="사유 붙이기" title="붙이기 (Enter)" onmousedown={(e) => e.preventDefault()} onclick={(e) => { e.stopPropagation(); submit(); }}><Check size={14} strokeWidth={3} /></button>{/if}
  </label>
</div>
