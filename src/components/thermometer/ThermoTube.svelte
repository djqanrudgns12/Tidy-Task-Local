<script lang="ts">
  // 유리 온도계(PRD 10.3·10.5). 왼쪽 눈금 · 가운데 관과 표정 구 · 오른쪽 단계 스티커.
  // 관의 눈금은 0~최대이고, 영하는 관을 비우고 구에 얼음 결정을 키워 보여 줍니다(값은 큰 숫자로 정확히).
  // 액체 높이는 transform으로만 움직여(합성기) 부드럽고, 스프링 이징으로 살짝 출렁이며 멈춥니다.
  import { untrack } from 'svelte';
  import { Check, AlertTriangle } from 'lucide-svelte';
  import BulbFace from './BulbFace.svelte';
  import { niceTicks, valueToY } from '../../lib/thermometer/scale.js';
  import { stageStatus, layoutStickers } from '../../lib/thermometer/stages.js';
  import { faceOf } from '../../lib/thermometer/face.js';
  import { mixColor } from '../../lib/thermometer/color.js';
  import { moodOf, unitMark } from '../../lib/thermometer/moods.js';
  import { springLinear, DURATION } from '../../lib/scores/motion.js';

  let {
    t,
    width,
    height,
    reduced = false,
    bubbleSeq = 0,
    shakeSeq = 0,
    sirenSeq = 0,
    showStickers = true,
    stickerLabels = true,
  } = $props<{ t: any; width: number; height: number; reduced?: boolean; bubbleSeq?: number; shakeSeq?: number; sirenSeq?: number; showStickers?: boolean; stickerLabels?: boolean }>();

  const uid = `th-${Math.random().toString(36).slice(2, 8)}`;
  const mood = $derived(moodOf(t.mood));
  const u = $derived(unitMark(t.unit));
  const tubeW = $derived(Math.max(22, Math.min(70, height * 0.13)));
  // 구는 관보다 조금 크게 — 얼굴이 잘 보이고 동글동글한 느낌을 줍니다.
  const bulbR = $derived(tubeW * 1.12);
  const labelW = $derived(Math.max(26, String(t.max).length * 11 + 10));
  // 구가 눈금 숫자를 가리지 않도록, 구 반지름만큼 오른쪽으로 비켜 놓습니다.
  const tubeX = $derived(Math.max(labelW + 10, labelW + 8 + bulbR - tubeW / 2));
  const cx = $derived(tubeX + tubeW / 2);
  const top = 14;
  const cy = $derived(height - bulbR - 6);
  const yTop = $derived(top + tubeW * 0.6);
  const yZero = $derived(cy - bulbR * 0.62);
  const vy = (v: number) => valueToY(v, 0, t.max, yTop, yZero);
  // 창이 아주 낮아 눈금 칸이 거의 없으면(24px 미만) 눈금·스티커를 접습니다. 뒤집힌 눈금보다 큰 숫자 하나가 정확합니다.
  const cramped = $derived(yZero - yTop < 24);
  const liquidY = $derived(t.value <= 0 ? cy - bulbR * (t.value < 0 ? 0.05 : 0.45) : vy(t.value));
  const ratio = $derived(Math.max(0, t.value) / t.max);
  const liquid = $derived(t.value < 0 ? '#CBE8FF' : mixColor(mood.from, mood.to, ratio));
  // 숫자 사이를 18px 이상 띄울 수 있는 만큼만 큰 눈금을 둡니다(낮은 창에서 0~10이 겹쳐 읽히지 않던 문제).
  const ticks = $derived(niceTicks(0, t.max, Math.min(12, (yZero - yTop) / 18)));
  const face = $derived(faceOf(t.mood, t.value, t.max));
  const ice = $derived(t.value < 0 ? Math.min(6, Math.ceil((Math.abs(t.value) / t.max) * 6)) : 0);
  const atTop = $derived(t.value >= t.max);
  const spring = springLinear({ bounce: 0.22, settle: 6 });

  // ── 단계 스티커 배치 ──
  const stickerH = $derived(Math.max(22, Math.min(34, tubeW * 0.62)));
  const stickerX = $derived(tubeX + tubeW + 20);
  const stickerSpace = $derived(width - stickerX - 6);
  // 스티커는 위(높은 온도)에서 아래로 배치해야 겹침 밀어내기가 올바르게 됩니다.
  const statuses = $derived(stageStatus(t.stages, t.value, t.max, { keepReached: t.mood === 'positive' }).filter((s) => !s.hidden).reverse());
  const placed = $derived.by(() => {
    const lay = layoutStickers(statuses.map((s) => vy(s.at)), stickerH + 4, yTop - stickerH / 2 + 4, yZero);
    return { ys: lay.ys, compact: !stickerLabels || lay.compact || stickerSpace < 96 };
  });

  // ── 사건 연출: 거품·흔들림·경광등 ──
  let svg = $state<SVGSVGElement>();
  let spinning = $state(false);
  let lastShake = untrack(() => shakeSeq);
  $effect(() => {
    const s = shakeSeq;
    if (s === lastShake) return;
    lastShake = s;
    if (!reduced) svg?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(-1deg)' }, { transform: 'rotate(0)' }], { duration: 420, easing: 'ease-out' });
  });
  let lastSiren = untrack(() => sirenSeq);
  $effect(() => {
    const s = sirenSeq;
    if (s === lastSiren) return;
    lastSiren = s;
    if (reduced) return;
    spinning = true;
    setTimeout(() => (spinning = false), 3000);
  });
</script>

<div class="th-tube-wrap" style:--stk-h={`${stickerH}px`}>
  <svg bind:this={svg} class="th-tube" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
    aria-label={`${t.title} ${t.value}${u} / ${t.max}${u}`} style:transform-origin={`${cx}px ${cy}px`}>
    <defs>
      <clipPath id={`${uid}-glass`}>
        <rect x={tubeX + 3} y={top + 3} width={tubeW - 6} height={cy - top} rx={(tubeW - 6) / 2} />
        <circle cx={cx} cy={cy} r={bulbR - 3} />
      </clipPath>
      <linearGradient id={`${uid}-shine`} x1="0" x2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".7" /><stop offset=".35" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- 눈금(왼쪽) -->
    <g class="th-ticks" visibility={cramped ? 'hidden' : undefined}>
      <!-- 숫자는 왼쪽 한 줄에 맞추고, 눈금선이 관까지 이어집니다(큰 구가 숫자를 가리지 않게). -->
      {#each ticks.minor as v (v)}<line x1={tubeX - 7} x2={tubeX - 2} y1={vy(v)} y2={vy(v)} />{/each}
      {#each ticks.major as v (v)}
        <line class="major" x1={labelW + 4} x2={tubeX - 2} y1={vy(v)} y2={vy(v)} />
        <text x={labelW} y={vy(v)} dy=".35em" text-anchor="end" class:goal={v === t.max}>{v}</text>
      {/each}
    </g>

    <!-- 경광등(부정 무드가 한계에 닿았을 때) -->
    {#if t.mood === 'negative' && atTop}
      <g class="th-siren" class:spinning transform={`translate(${cx} ${top - 2})`}>
        <g class="th-beam"><path d={`M 0 0 L ${-tubeW * 1.4} ${-tubeW * 0.5} L ${-tubeW * 1.4} ${tubeW * 0.1} Z M 0 0 L ${tubeW * 1.4} ${-tubeW * 0.5} L ${tubeW * 1.4} ${tubeW * 0.1} Z`} fill="#ff6b6b" opacity=".28" /></g>
        <path d={`M ${-tubeW * 0.36} 0 a ${tubeW * 0.36} ${tubeW * 0.36} 0 0 1 ${tubeW * 0.72} 0 Z`} fill="#ff5a5f" stroke="#b72f35" stroke-width="1.5" />
      </g>
    {/if}

    <!-- 유리 관 + 구 -->
    <g class="th-glass">
      <rect x={tubeX} y={top} width={tubeW} height={cy - top} rx={tubeW / 2} />
      <circle cx={cx} cy={cy} r={bulbR} />
    </g>

    <!-- 액체 -->
    <g clip-path={`url(#${uid}-glass)`}>
      <g class="th-liquid" style:transform={`translateY(${liquidY}px)`} style:transition={reduced ? 'none' : `transform ${DURATION.fill}ms ${spring}`}>
        <rect x={tubeX - 10} y="0" width={tubeW + 20} height={height * 2} fill={liquid} style:transition="fill 0.6s ease" />
        <circle cx={cx} cy={cy - liquidY} r={bulbR} fill={liquid} />
        {#if !reduced && t.value > 0}
          <path class="th-wave" style:--wave={`${tubeW}px`} d={`M ${tubeX - tubeW} 1 q ${tubeW / 4} -5 ${tubeW / 2} 0 t ${tubeW / 2} 0 t ${tubeW / 2} 0 t ${tubeW / 2} 0 t ${tubeW / 2} 0 t ${tubeW / 2} 0 V 8 H ${tubeX - tubeW} Z`}
            fill="#ffffff" opacity=".28" />
        {/if}
        {#key bubbleSeq}
          {#if bubbleSeq && !reduced}
            {#each [0.3, 0.55, 0.75, 0.45] as fx, i}<circle class="th-bubble" style:animation-delay={`${i * 70}ms`} cx={tubeX + tubeW * fx} cy={cy - liquidY - bulbR * 0.3 - i * 6} r={Math.max(2, tubeW * 0.08)} fill="#fff" />{/each}
          {/if}
        {/key}
      </g>
    </g>
    <!-- 유리 반짝임 -->
    <rect x={tubeX + tubeW * 0.14} y={top + tubeW * 0.3} width={tubeW * 0.18} height={Math.max(0, cy - top - bulbR - tubeW * 0.2)} rx={tubeW * 0.09} fill={`url(#${uid}-shine)`} pointer-events="none" />

    <!-- 얼음 결정(영하) -->
    {#each Array.from({ length: ice }, (_, i) => i) as i}
      {@const a = (Math.PI * 2 * i) / 6 - Math.PI / 2}
      {@const x = cx + Math.cos(a) * bulbR * 1.12}
      {@const y = cy + Math.sin(a) * bulbR * 1.12}
      <path class="th-ice" d={`M ${x} ${y - 6} V ${y + 6} M ${x - 5.2} ${y - 3} L ${x + 5.2} ${y + 3} M ${x - 5.2} ${y + 3} L ${x + 5.2} ${y - 3}`} />
    {/each}

    <BulbFace {cx} {cy} r={bulbR * 0.86} {face} {reduced} />

    <!-- 단계 연결선 -->
    {#if showStickers && !cramped}
      {#each statuses as s, i (s.id)}
        <path class="th-connector" data-status={s.status} d={`M ${tubeX + tubeW + 2} ${vy(s.at)} L ${stickerX - 6} ${vy(s.at)} L ${stickerX} ${placed.ys[i]}`} />
      {/each}
    {/if}
  </svg>

  {#if showStickers && !cramped}
    {#each statuses as s, i (s.id)}
      <div class="th-sticker" data-status={s.status} class:compact={placed.compact} style:left={`${stickerX}px`} style:top={`${placed.ys[i]}px`}
        style:max-width={`${Math.max(40, stickerSpace)}px`} title={s.label ? `${s.at}${u} ${s.label}` : `${s.at}${u}`}>
        <b>{s.at}{u}</b>
        {#if !placed.compact && s.label}<span>{s.label}</span>{/if}
        {#if s.status === 'reached'}<i class="th-sticker-mark" aria-label="도달">{#if t.mood === 'positive'}<Check size={12} strokeWidth={3.2} />{:else}<AlertTriangle size={12} strokeWidth={2.8} />{/if}</i>
        {:else if s.status === 'next' && !placed.compact}<small>{s.remain}{u} 남음</small>{/if}
      </div>
    {/each}
  {/if}
</div>
