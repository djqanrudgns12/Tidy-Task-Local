<script lang="ts">
  // 자리별로 굴러가는 숫자(PRD 11.4). 바뀐 자리만 움직이고, 오르면 아래에서 위로·내리면 위에서 아래로 굴립니다.
  // 왜 직접 만들었나(NumberFlow 대신): 새 의존성 없이 툴킷의 "동작 줄이기"·고정폭 숫자·사용자 글꼴을 그대로 따르게 하려는 것입니다.
  // 왜 Svelte 전환(in/out) 대신 직접 움직이나: 빠르게 연타하면 {#key} 안의 나가는 숫자가 애니메이션이 끝나도
  // DOM에서 지워지지 않고 쌓이는 일이 있었습니다(숫자 뒤에 옛 숫자가 비침). 여기서는 나가는 숫자를 직접 만들고,
  // 애니메이션이 끝나거나 취소되면 반드시 지웁니다.
  import { untrack } from 'svelte';
  import { springLinear, DURATION } from '../../lib/scores/motion.js';
  let { value, reduced = false, duration = DURATION.roll } = $props<{ value: number; reduced?: boolean; duration?: number }>();

  // 방향은 자리 숫자를 계산하는 순간에 함께 정합니다 — 자리 갱신(action update)보다 반드시 먼저 계산되기 때문입니다.
  let prevValue = untrack(() => value);
  let trend: 1 | -1 = 1;
  const chars = $derived.by(() => {
    const v = value;
    if (v !== prevValue) {
      trend = v > prevValue ? 1 : -1;
      prevValue = v;
    }
    return String(Math.abs(Math.round(v))).split('');
  });
  const easing = springLinear({ bounce: 0.16, settle: 7 });
  // 처음 그릴 때는 굴리지 않고, 그 뒤에 새로 생긴 자리(9 → 10의 "1")만 굴러 들어오게 합니다.
  let ready = false;
  $effect(() => {
    ready = true;
  });

  function makeDigit(ch: string) {
    const el = document.createElement('span');
    el.className = 'rn-digit';
    el.textContent = ch;
    return el;
  }

  function move(el: HTMLElement, from: number, to: number, fadeIn: boolean) {
    const frames = [
      { transform: `translateY(${from}%)`, opacity: fadeIn ? 0 : 1 },
      { transform: `translateY(${to}%)`, opacity: fadeIn ? 1 : 0 },
    ];
    try {
      return el.animate(frames, { duration, easing });
    } catch {
      // linear() 이징을 모르는 엔진이면 기본 곡선으로라도 움직입니다.
      return el.animate(frames, { duration, easing: 'ease-out' });
    }
  }

  function slot(node: HTMLElement, ch: string) {
    let current = makeDigit(ch);
    node.appendChild(current);
    if (ready && !reduced && typeof current.animate === 'function') move(current, trend * 100, 0, true);

    return {
      update(next: string) {
        if (next === current.textContent) return;
        const old = current;
        current = makeDigit(next);
        node.appendChild(current);
        if (reduced || typeof old.animate !== 'function') {
          old.remove();
          return;
        }
        // 연타 중에는 나가는 숫자가 하나만 남도록 앞선 것들을 바로 치웁니다.
        node.querySelectorAll('.rn-digit.out').forEach((el) => el.remove());
        old.classList.add('out');
        old.getAnimations().forEach((a) => a.cancel());
        const out = move(old, 0, -trend * 100, false);
        out.onfinish = out.oncancel = () => old.remove();
        // 창이 가려지거나 최소화되면 화면 갱신이 멈춰 "끝남" 알림이 오지 않습니다. 시간으로 한 번 더 치웁니다.
        setTimeout(() => old.remove(), duration + 120);
        move(current, trend * 100, 0, true);
      },
      destroy() {
        node.replaceChildren();
      },
    };
  }
</script>

<span class="rn" aria-hidden="true"
  >{#if value < 0}<span class="rn-sign">&minus;</span>{/if}{#each chars as ch, i (chars.length - i)}<span class="rn-slot" use:slot={ch}></span>{/each}</span
>

<style>
  .rn {
    display: inline-flex;
    align-items: baseline;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
  }
  .rn-sign {
    margin-right: 0.04em;
  }
  /* 자리 하나: 숨은 "0"이 폭·높이를 잡고, 실제 숫자는 그 위에 겹쳐 굴러갑니다. 굴러 나가는 숫자는 칸 밖에서 잘립니다. */
  .rn-slot {
    position: relative;
    display: inline-block;
    overflow: clip;
    overflow-clip-margin: 0.08em;
  }
  .rn-slot::before {
    content: '0';
    visibility: hidden;
  }
  /* 숫자 칸은 스크립트가 직접 만들므로 전역 선택자로 꾸밉니다(범위는 .rn-slot 안으로 한정). */
  .rn-slot :global(.rn-digit) {
    position: absolute;
    inset: 0;
    text-align: center;
  }
</style>
