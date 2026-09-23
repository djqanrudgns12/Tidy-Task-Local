<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import {
    FACE_ANGLES, FACE_PLACEMENT, PHASE, nextAngles, restTransform,
    spinKeyframes, hopKeyframes, squashKeyframes, shadowKeyframes,
  } from '../../lib/dice/motion.js';
  import type { DiePlan } from '../../lib/dice/motion.js';

  // 3D 주사위 하나. 위치·크기는 부모(무대)가 정하고, 여기서는 굴리기와 얼굴만 맡습니다.
  let { size, tone, waiting = false } = $props<{ size: number; tone: string; waiting?: boolean }>();

  const VALUES = [1, 2, 3, 4, 5, 6] as const;
  // 3×3 격자의 표준 눈 자리(viewBox 100 기준). 1은 하트로 따로 그립니다.
  const L = 27, C = 50, R = 73;
  const PIPS: Record<number, [number, number][]> = {
    2: [[L, L], [R, R]],
    3: [[L, L], [C, C], [R, R]],
    4: [[L, L], [R, L], [L, R], [R, R]],
    5: [[L, L], [R, L], [C, C], [L, R], [R, R]],
    6: [[L, L], [L, C], [L, R], [R, L], [R, C], [R, R]],
  };

  let value = $state(1); // 지금 정면을 보는 눈
  let yaw = $state(0); // 멈췄을 때 살짝 틀어진 각도(입체감)
  let squint = $state(false);
  let rolling = $state(false);
  let hopEl = $state<HTMLElement>();
  let squashEl = $state<HTMLElement>();
  let spinEl = $state<HTMLElement>();
  let shadowEl = $state<HTMLElement>();
  let running: Animation[] = [];
  let squintTimer = 0;
  // 기다릴 때는 웃는 얼굴, 던지는 순간에는 질끈 감은 얼굴. 그 밖에는 눈(결과)만 보여 읽기 쉽게 둡니다.
  const mood = $derived(squint ? 'squint' : waiting && !rolling ? 'smile' : null);

  function stopMotion() {
    clearTimeout(squintTimer);
    squint = false;
    for (const animation of running) animation.cancel();
    running = [];
    rolling = false;
  }

  /** 정해진 눈(next)으로 착지하도록 굴립니다. 멈추면(또는 안전 시간이 지나면) 풀립니다. */
  export function roll(next: number, plan: DiePlan): Promise<void> {
    stopMotion();
    if (!hopEl || !squashEl || !spinEl || !shadowEl) {
      value = next;
      return Promise.resolve();
    }
    const from = { ...FACE_ANGLES[value as 1], yaw };
    const to = nextAngles(from, next, plan);
    const timing: KeyframeAnimationOptions = { duration: plan.duration, delay: plan.delay, fill: 'both', easing: 'linear' };
    rolling = true;
    if (!plan.reduced) {
      squint = true;
      squintTimer = window.setTimeout(() => (squint = false), plan.delay + plan.duration * PHASE.crouch);
    }
    const animations = [
      spinEl.animate(spinKeyframes(from, to, plan), timing),
      squashEl.animate(squashKeyframes(plan), timing),
      ...(plan.reduced ? [] : [hopEl.animate(hopKeyframes(plan, size), timing), shadowEl.animate(shadowKeyframes(plan, size), timing)]),
    ];
    running = animations;
    const finished = Promise.all(animations.map((a) => a.finished));
    // 창이 가려져 애니메이션 시계가 멈춰도 결과는 반드시 확정되도록 안전 시간을 둡니다.
    const safety = new Promise((resolve) => setTimeout(resolve, plan.delay + plan.duration + 400));
    return Promise.race([finished, safety])
      .catch(() => {})
      .then(async () => {
        if (running !== animations) return; // 새 굴림·정리로 이미 대체됨
        clearTimeout(squintTimer);
        squint = false;
        value = next;
        yaw = to.yaw;
        // 왜 tick 뒤에 취소하는가: 멈춘 각도를 인라인 스타일로 먼저 그려 둬야, 애니메이션을 지울 때 한 프레임도 옛 면이 비치지 않습니다.
        await tick();
        for (const animation of animations) animation.cancel();
        running = [];
        rolling = false;
      });
  }

  /** 남은 연출을 건너뛰고 끝 상태로 보냅니다(창이 숨겨졌을 때). */
  export function finish() {
    for (const animation of running) {
      try { animation.finish(); } catch {}
    }
  }

  onDestroy(stopMotion);
</script>

<div class="dice-die" class:rolling data-tone={tone} style:--s={`${size}px`}>
  <div class="dice-shadow" bind:this={shadowEl}></div>
  <div class="dice-hop" bind:this={hopEl}>
    <div class="dice-squash" bind:this={squashEl}>
      <div class="dice-tilt">
        <div class="dice-spin" bind:this={spinEl} style:transform={restTransform(value, yaw)}>
          {#each VALUES as v (v)}<div class="dice-core" style:transform={FACE_PLACEMENT[v]}></div>{/each}
          {#each VALUES as v (v)}
            <div class="dice-face" class:front={v === value} style:transform={FACE_PLACEMENT[v]}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                {#if mood && v === value}
                  <ellipse class="dice-blush" cx="24" cy="60" rx="8" ry="5" />
                  <ellipse class="dice-blush" cx="76" cy="60" rx="8" ry="5" />
                  {#if mood === 'smile'}
                    <circle class="dice-ink" cx="36" cy="46" r="5.6" /><circle class="dice-ink" cx="64" cy="46" r="5.6" />
                    <circle class="dice-glint" cx="37.8" cy="44" r="1.7" /><circle class="dice-glint" cx="65.8" cy="44" r="1.7" />
                    <path class="dice-line" d="M42 58 Q50 66.5 58 58" />
                  {:else}
                    <path class="dice-line" d="M30 39.5 L39.5 46 L30 52.5" /><path class="dice-line" d="M70 39.5 L60.5 46 L70 52.5" />
                    <ellipse class="dice-ink" cx="50" cy="61" rx="3.6" ry="3.2" />
                  {/if}
                {:else if v === 1}
                  <path class="dice-heart" d="M50 67C46.6 64.2 33 55.4 33 44.4 33 38.2 37.6 34 42.9 34 46.2 34 48.7 35.9 50 38.4 51.3 35.9 53.8 34 57.1 34 62.4 34 67 38.2 67 44.4 67 55.4 53.4 64.2 50 67Z" />
                  <ellipse class="dice-glint" cx="41.5" cy="41" rx="3.2" ry="2.2" transform="rotate(-30 41.5 41)" />
                {:else}
                  {#each PIPS[v] as [x, y]}<circle class="dice-pip" cx={x} cy={y} r="8.5" /><circle class="dice-glint" cx={x - 2.6} cy={y - 2.8} r="2" />{/each}
                {/if}
              </svg>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>
