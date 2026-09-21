<script lang="ts">
  import {TOYS,BALLOONS,COLORS,clawPose,sceneLayout,balloonPosition,dartPose,clamp} from '../../lib/picker/designs.js';
  let {mode,elapsed,clock,startedAt,drawing,reduced,seed,design,target,count,shuffling,onasseterror}=$props<{mode:string;elapsed:number;clock:number;startedAt:number;drawing:boolean;reduced:boolean;seed:number;design:string;target:number;count:number;shuffling:boolean;onasseterror:()=>void}>();
  const toy=(i:number)=>TOYS[design==='mixed'?(i+seed)%6:Math.max(0,TOYS.findIndex(t=>t.id===design))];
  const shape=(i:number)=>BALLOONS[design==='mixed'?(i+seed)%6:Math.max(0,BALLOONS.findIndex(t=>t.id===design))];
  const layout=$derived(sceneLayout(count,mode));
  const handScale=$derived(Math.min(1,layout.size/118+.1));
  const pose=$derived(clawPose(drawing?elapsed:0,target,layout.slots));
  const hit=$derived(balloonPosition(target,startedAt+1700,seed,reduced,count));
  const dart=$derived(dartPose(elapsed,hit));
  const burst=$derived(drawing&&elapsed>=1700);
  const targetToy=$derived(toy(target));
</script>

{#if mode==='claw'}
  <svg class="picker-scene claw-scene" viewBox="0 0 800 400" aria-hidden="true" data-phase={drawing?(elapsed<1600?'approach':elapsed<2100?'grip':elapsed<3650?'lift':'deliver'):'idle'}>
    <defs><linearGradient id="machine-glass" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="#e2eee8" stop-opacity=".4"/></linearGradient></defs>
    <rect x="70" y="18" width="660" height="352" rx="32" fill="var(--picker-machine)"/>
    <rect x="86" y="58" width="628" height="275" rx="20" fill="url(#machine-glass)" stroke="#ffffff" stroke-width="2"/>
    <path d="M108 94 V77 Q108 73 113 73 H167" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" opacity=".75"/>
    <circle cx="104" cy="39" r="4" fill="var(--picker-accent)" opacity=".5"/><circle cx="119" cy="39" r="4" fill="white" opacity=".8"/>
    <text x="400" y="43" text-anchor="middle" fill="var(--picker-accent)" font-size="11" letter-spacing="4" font-family="sans-serif">TIDY TOY ROOM</text>
    <path d="M110 77 H690" stroke="#9fb8ae" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="338" cy="306" rx="226" ry="17" fill="#537b68" opacity=".07"/>
    {#each layout.slots as slot,i}
      {@const item=toy(i)}
      {#if !(drawing&&i===target&&elapsed>=1900)}
        <g class="picker-toy-slot" data-size={layout.size} data-index={i} transform={`translate(${slot.x},${slot.y})`}><g class:toy-shuffle={shuffling&&!reduced} style={`--shuffle-delay:${i%6*20}ms;--shuffle-x:${i%2?10:-10}px`}>
          <ellipse cx="0" cy={layout.size*.49} rx={layout.size*.3} ry="3" fill="#597868" opacity=".09"/>
          <image href={item.src} x={-layout.size/2} y={-layout.size*item.grip} width={layout.size} height={layout.size} onerror={onasseterror}/>
        </g></g>
      {/if}
    {/each}
    <rect x="600" y="287" width="97" height="44" rx="15" fill="#7f9e8e" opacity=".3"/>
    <path d="M616 314 H681" stroke="white" stroke-width="3" stroke-linecap="round"/>
    {#if drawing&&elapsed>=1900}
      {@const tx=pose.released?650:pose.x}
      {@const ty=pose.released?250+clamp((elapsed-4050)/200)*26:pose.y}
      {@const sway=pose.held?Math.sin((elapsed-1900)/160)*targetToy.swing*Math.sin(Math.PI*clamp((elapsed-1900)/2150)):0}
      <g transform={`translate(${tx},${ty}) rotate(${sway})`}>
        <image href={targetToy.src} x={-layout.size/2} y={-layout.size*targetToy.grip} width={layout.size} height={layout.size} onerror={onasseterror}/>
      </g>
    {/if}
    <path d={`M${pose.x} 77 V${pose.y-27*handScale}`} stroke="#78998d" stroke-width="3"/>
    <rect x={pose.x-17} y="69" width="34" height="15" rx="6" fill="#6d9382"/>
    <g transform={`translate(${pose.x},${pose.y}) scale(${handScale})`}>
      <path d="M0 -30 V-14" stroke="#6b8b7e" stroke-width="7" stroke-linecap="round"/>
      <path d={`M-8 -17 Q${-38+pose.close*19} -1 ${-34+pose.close*20} 20 L${-24+pose.close*18} 27`} fill="none" stroke="#678d7a" stroke-width="7" stroke-linecap="round"/>
      <path d={`M8 -17 Q${38-pose.close*19} -1 ${34-pose.close*20} 20 L${24-pose.close*18} 27`} fill="none" stroke="#678d7a" stroke-width="7" stroke-linecap="round"/>
      <circle cy="-19" r="12" fill="#edf4ed" stroke="#86a797" stroke-width="3"/>
    </g>
    <rect x="98" y="340" width="106" height="12" rx="6" fill="white" opacity=".5"/>
    <circle cx="663" cy="351" r="10" fill="var(--picker-accent)" opacity=".75"/><circle cx="689" cy="351" r="6" fill="#f5e2a8"/>
    <rect x="111" y="370" width="28" height="8" rx="4" fill="#9fb3a5"/><rect x="661" y="370" width="28" height="8" rx="4" fill="#9fb3a5"/>
  </svg>
{:else if mode==='balloon'}
  <svg class="picker-scene balloon-scene" viewBox="0 0 800 400" aria-hidden="true" data-phase={drawing?(elapsed<900?'prepare':elapsed<1700?'flight':'burst'):'idle'}>
    <defs>
      <radialGradient id="balloon-light" cx="30%" cy="22%" r="80%"><stop stop-color="white" stop-opacity=".55"/><stop offset=".65" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="#395765" stop-opacity=".09"/></radialGradient>
      <pattern id="balloon-dots" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2" fill="white" opacity=".4"/></pattern>
      <pattern id="balloon-lines" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><path d="M0 0V16" stroke="white" stroke-opacity=".3" stroke-width="3"/></pattern>
    </defs>
    <path d="M55 350 Q250 330 400 350 T755 350" fill="none" stroke="var(--picker-line)" stroke-width="2"/>
    {#each Array.from({length:layout.count},(_,i)=>i) as i}
      {@const b=shape(i)}
      {@const pos=balloonPosition(i,drawing?startedAt+Math.min(elapsed,1700):clock,seed,reduced,count)}
      {@const rot=reduced?0:Math.sin((drawing?startedAt+Math.min(elapsed,1700):clock)/2400+i)*5}
      {#if !(burst&&i===target)}
        <g class="picker-balloon-slot" data-size={layout.size} data-index={i} transform={`translate(${pos.x},${pos.y}) rotate(${rot}) scale(${layout.size/112})`} opacity={burst?.48:1}>
          <g class:balloon-shuffle={shuffling&&!reduced} style={`--shuffle-delay:${i%6*20}ms;--shuffle-x:${i%2?10:-10}px`}>
            <path d={`M0 48 Q${reduced?0:12*Math.sin(clock/1500+i)} 70 0 99`} fill="none" stroke="#9bada6" stroke-width="1.3"/>
            <path d={b.path} fill={COLORS[(i+seed)%6]} stroke="#ffffff" stroke-opacity=".7" stroke-width="1.5"/>
            <path d={b.path} fill={i%3===0?'url(#balloon-dots)':i%3===1?'url(#balloon-lines)':'transparent'}/>
            <path d={b.path} fill="url(#balloon-light)"/>
            <path d="M-15 -27 Q-29 -20 -29 -9" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" opacity=".55"/>
            <path d="M0 47L-4 54H4Z" fill={COLORS[(i+seed)%6]}/>
            {#if b.id==='bear'}<circle cx="-12" cy="-4" r="2.5" fill="#6a7977"/><circle cx="12" cy="-4" r="2.5" fill="#6a7977"/><path d="M-3 6Q0 12 3 6Z" fill="#6a7977"/>{/if}
          </g>
        </g>
      {/if}
    {/each}
    {#if drawing&&elapsed>=900&&elapsed<1700&&!reduced}
      <g transform={`translate(${dart.x},${dart.y}) rotate(${dart.angle})`}><path d="M-75 0H0" stroke="#658a7a" stroke-width="4"/><path d="M-77 -12L-53 0L-77 12L-68 0Z" fill="#c69574"/><path d="M-8 -4L2 0L-8 4Z" fill="#526d65"/></g>
    {/if}
    {#if burst&&elapsed<2250&&!reduced}
      {#each [0,1,2,3,4,5,6,7] as n}
        {@const k=clamp((elapsed-1700)/550)}
        <path d="M-3 -4L4 0L0 7Z" fill={COLORS[(n+seed)%6]} opacity={1-k} transform={`translate(${hit.x+Math.cos(n*Math.PI/4)*k*85},${hit.y+Math.sin(n*Math.PI/4)*k*65+k*k*50}) rotate(${n*45+k*90})`}/>
      {/each}
    {/if}
  </svg>
{/if}
