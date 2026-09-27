<script lang="ts">
  import { onMount } from 'svelte';
  import { buildRoll, poseAt, restPose, restQuat, supportHeight } from '../../lib/dice/motion.js';
  import type { DiePlan, DiePose, RollScript } from '../../lib/dice/motion.js';
  import { createDieRenderer, BOX_PER_SIZE } from '../../lib/dice/renderer.js';
  import type { DieRenderer } from '../../lib/dice/renderer.js';
  import type { Quat } from '../../lib/dice/rotation.js';

  // 주사위 하나. 위치·크기는 부모(무대)가 정하고, 여기서는 굴리기와 얼굴만 맡습니다.
  // 몸통은 WebGL로 그린 둥근 정육면체 한 덩어리라 어느 각도에서도 면 사이 틈·띠가 생기지 않습니다(renderer.js).
  let { size, tone, waiting = false } = $props<{ size: number; tone: string; waiting?: boolean }>();

  type Run = { script: RollScript; value: number; delay: number; started: number; frame: number; safety: number; done: () => void };

  let value = $state(1); // 지금 정면을 보는 눈
  let squint = $state(false);
  let rolling = $state(false);
  let ready = $state(false);
  let dpr = $state(1);
  let rootEl = $state<HTMLElement>();
  let bodyEl = $state<HTMLElement>();
  let shadowEl = $state<HTMLElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let renderer: DieRenderer | null = null;
  let orientation: Quat = restQuat(1, 0);
  let run: Run | null = null;
  // 기다릴 때는 웃는 얼굴, 던지는 순간에는 질끈 감은 얼굴. 그 밖에는 눈(결과)만 보여 읽기 쉽게 둡니다.
  const mood = $derived(squint ? 'squint' : waiting && !rolling ? 'smile' : null);

  // 4K 200% 모니터에서도 또렷하게, 그 이상은 그래픽 메모리만 늘고 차이가 안 보여 2.5배에서 멈춥니다.
  const currentDpr = () => Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));

  function readPalette(el: HTMLElement) {
    const style = getComputedStyle(el);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    return {
      face: read('--dice-face', '#ffb8a6'),
      edge: read('--dice-edge', '#c96f5b'),
      pip: read('--dice-pip', '#5b3a33'),
      light: read('--dice-light', '#ffe2d9'),
    };
  }

  /** 한 순간의 모습을 화면에 옮깁니다: 뜬 높이·좌우 이동은 DOM으로, 자세·찌그러짐은 WebGL로. */
  function apply(pose: DiePose) {
    if (!bodyEl || !shadowEl) return;
    const lift = pose.y - 0.5;
    const moved = Math.abs(lift) > 1e-4 || Math.abs(pose.x) > 1e-4;
    bodyEl.style.transform = moved ? `translate3d(${(pose.x * size).toFixed(2)}px, ${(-lift * size).toFixed(2)}px, 0)` : '';
    bodyEl.style.opacity = pose.opacity < 1 ? pose.opacity.toFixed(3) : '';
    // 바닥 그림자: 높이 뜰수록 크고 옅게, 모서리로 서면 발자국이 넓어지는 만큼 조금 크게. 높이감의 절반을 그림자가 만듭니다.
    const gap = Math.max(0, pose.y - supportHeight(pose.q) / 2);
    const spread = (1 + 0.55 * gap) * (0.92 + 0.08 * supportHeight(pose.q));
    const fade = 1 - 0.62 * Math.min(1, gap / 0.8);
    const resting = !moved && gap < 1e-4;
    shadowEl.style.transform = resting ? '' : `translate3d(${(pose.x * size).toFixed(2)}px, 0, 0) scale(${spread.toFixed(3)})`;
    shadowEl.style.opacity = resting ? '' : (0.26 * fade * (pose.opacity < 1 ? pose.opacity : 1)).toFixed(3);
    renderer?.render(pose);
  }

  function finishRun(current: Run) {
    if (run !== current) return;
    cancelAnimationFrame(current.frame);
    clearTimeout(current.safety);
    run = null;
    orientation = current.script.final;
    value = current.value;
    squint = false;
    rolling = false;
    apply(restPose(orientation));
    current.done();
  }

  /** 정해진 눈(next)으로 착지하도록 굴립니다. 멈추면(또는 안전 시간이 지나면) 풀립니다. */
  export function roll(next: number, plan: DiePlan): Promise<void> {
    if (run) finishRun(run);
    const script = buildRoll(orientation, next, plan);
    if (!renderer || !bodyEl) {
      orientation = script.final;
      value = next;
      return Promise.resolve();
    }
    rolling = true;
    squint = !plan.reduced;
    return new Promise((resolve) => {
      const current: Run = { script, value: next, delay: plan.delay, started: performance.now(), frame: 0, safety: 0, done: resolve };
      run = current;
      const step = (now: number) => {
        if (run !== current) return;
        const t = now - current.started - current.delay;
        const pose = poseAt(script, t);
        if (!plan.reduced && squint !== pose.squint) squint = pose.squint;
        apply(pose);
        if (t >= script.total) finishRun(current);
        else current.frame = requestAnimationFrame(step);
      };
      current.frame = requestAnimationFrame(step);
      // 창이 가려져 화면 갱신이 멈춰도 결과는 반드시 확정되도록 안전 시간을 둡니다.
      current.safety = window.setTimeout(() => finishRun(current), plan.delay + script.total + 400);
    });
  }

  /** 남은 연출을 건너뛰고 끝 상태로 보냅니다(창이 숨겨졌을 때). */
  export function finish() {
    if (run) finishRun(run);
  }

  onMount(() => {
    if (!canvasEl || !rootEl) return;
    renderer = createDieRenderer(canvasEl, readPalette(rootEl));
    dpr = currentDpr();
    // 배율이 다른 모니터로 창을 옮기면(4K 200% ↔ FHD 100%) 캔버스 해상도를 다시 맞춥니다.
    let media: MediaQueryList | null = null;
    const onDpr = () => {
      dpr = currentDpr();
      watch();
    };
    const watch = () => {
      media?.removeEventListener('change', onDpr);
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      media.addEventListener('change', onDpr);
    };
    watch();
    ready = true;
    return () => {
      media?.removeEventListener('change', onDpr);
      if (run) {
        const pending = run;
        run = null;
        cancelAnimationFrame(pending.frame);
        clearTimeout(pending.safety);
        pending.done(); // 기다리는 쪽(던지기)이 멈춰 서지 않게 풀어 줍니다.
      }
      renderer?.dispose();
      renderer = null;
    };
  });

  // 크기·배율이 바뀌면 캔버스 해상도를 맞추고 멈춘 모습을 다시 그립니다(굴리는 중에는 다음 장면이 그립니다).
  $effect(() => {
    const box = size * BOX_PER_SIZE;
    const ratio = dpr;
    if (!ready || !renderer) return;
    renderer.resize(box, ratio, size);
    if (!run) apply(restPose(orientation));
  });

  // 정면 눈·표정이 바뀌면 그 면 그림만 새로 올립니다.
  $effect(() => {
    const face = value;
    const look = mood;
    if (!ready || !renderer) return;
    renderer.setArt(face, look);
    if (!run) renderer.render(restPose(orientation));
  });
</script>

<div class="dice-die" class:rolling data-tone={tone} style:--s={`${size}px`} bind:this={rootEl}>
  <div class="dice-shadow" bind:this={shadowEl}></div>
  <div class="dice-body" bind:this={bodyEl}>
    <canvas class="dice-canvas" bind:this={canvasEl} aria-hidden="true"></canvas>
  </div>
</div>
