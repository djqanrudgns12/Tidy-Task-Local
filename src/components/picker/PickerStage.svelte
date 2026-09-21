<script lang="ts">
  import {TOYS,BALLOONS,COLORS,clawPose,sceneLayout,balloonPosition,dartPose,clamp,suspensePose} from '../../lib/picker/designs.js';
  let {mode,elapsed:realElapsed,suspense,clock,startedAt,drawing,reduced,seed,design,target,count,entries,visible,shuffling,onasseterror}=$props<{mode:string;elapsed:number;suspense:ReturnType<typeof import('../../lib/picker/designs.js').createSuspense>;clock:number;startedAt:number;drawing:boolean;reduced:boolean;seed:number;design:string;target:number;count:number;entries:import('../../lib/picker/engine.js').Entry[];visible:Set<string>;shuffling:boolean;onasseterror:()=>void}>();
  const elapsed=$derived(Math.max(0,realElapsed-suspense.duration));
  const searching=$derived(drawing&&realElapsed<suspense.duration);
  const toy=(i:number)=>TOYS[design==='mixed'?(i+seed)%6:Math.max(0,TOYS.findIndex(t=>t.id===design))];
  const shape=(i:number)=>BALLOONS[design==='mixed'?(i+seed)%6:Math.max(0,BALLOONS.findIndex(t=>t.id===design))];
  const layout=$derived(sceneLayout(count,mode));
  const handScale=$derived(Math.min(1,layout.size/118+.1));
  const pose=$derived(searching?{...suspensePose(suspense,realElapsed,layout.slots,'claw',{x:330,y:95}),close:0,held:false,released:false}:clawPose(drawing?elapsed:0,target,layout.slots));
  const hit=$derived(balloonPosition(target,startedAt+suspense.duration+1700,seed,reduced,count));
  const dart=$derived(dartPose(elapsed,hit));
  const burst=$derived(drawing&&elapsed>=1700);
  const targetToy=$derived(toy(target));
</script>

{#if mode==='claw'}
  <svg class="picker-scene claw-scene" viewBox="55 8 690 388" aria-hidden="true" data-phase={drawing?(elapsed<1600?'approach':elapsed<2100?'grip':elapsed<3650?'lift':'deliver'):'idle'}>
    <defs>
      <linearGradient id="machine-glass" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#dae8de" stop-opacity=".65"/></linearGradient>
      <linearGradient id="claw-metal"><stop stop-color="#4e786b"/><stop offset=".45" stop-color="#e8f3e9"/><stop offset="1" stop-color="#547d6d"/></linearGradient>
      <linearGradient id="machine-body" x2="0" y2="1"><stop stop-color="#dcebcf"/><stop offset="1" stop-color="var(--picker-machine)"/></linearGradient>
      <clipPath id="prize-chute"><rect x="606" y="283" width="84" height="46" rx="12"/></clipPath>
    </defs>
    <ellipse cx="400" cy="385" rx="312" ry="10" fill="#355b42" opacity=".09"/>
    <rect x="70" y="18" width="660" height="352" rx="32" fill="url(#machine-body)" stroke="#91ad92" stroke-width="2"/>
    <rect x="86" y="58" width="628" height="275" rx="20" fill="url(#machine-glass)" stroke="#ffffff" stroke-width="2"/>
    <path d="M108 94 V77 Q108 73 113 73 H167" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" opacity=".75"/>
    <circle cx="104" cy="39" r="4" fill="var(--picker-accent)" opacity=".5"/><circle cx="119" cy="39" r="4" fill="white" opacity=".8"/>
    <rect x="289" y="23" width="222" height="27" rx="13" fill="#fefcf0"/>
    <text x="400" y="42" text-anchor="middle" fill="#3c6545" font-size="16" font-weight="700" font-family="var(--tk-font)">행운의 인형뽑기</text>
    {#each [153,185,217,249,551,583,615,647] as x,i}<circle cx={x} cy="37" r="4" fill={drawing&&!reduced&&Math.floor(elapsed/250)%2===i%2?'#fff5a0':'#8fab78'}/>{/each}
    <path d="M110 77 H690" stroke="#9fb8ae" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="338" cy="306" rx="226" ry="17" fill="#537b68" opacity=".07"/>
    {#each layout.slots as slot,i}
      {@const item=toy(i)}
      {#if visible.has(entries[i]?.id)&&!(drawing&&i===target&&elapsed>=1900)}
        <g class="picker-toy-slot" data-size={layout.size} data-index={i} data-entry-id={entries[i]?.id} transform={`translate(${slot.x},${slot.y})`}><g class:toy-shuffle={shuffling&&!reduced} style={`--shuffle-delay:${i%6*20}ms;--shuffle-x:${i%2?10:-10}px`}>
          <ellipse cx="0" cy={layout.size*.49} rx={layout.size*.3} ry="3" fill="#597868" opacity=".09"/>
          <image href={item.src} x={-layout.size/2} y={-layout.size*item.grip} width={layout.size} height={layout.size} onerror={onasseterror}/>
          <g class="picker-nameplate" transform={`translate(0,${layout.size*.48})`}><title>{entries[i]?.number} · {entries[i]?.name}</title><rect x={-layout.size*.48} y="-7" width={layout.size*.96} height="18" rx="5"/><text text-anchor="middle" y="6" font-size={Math.min(13,layout.size*.18)}>{entries[i]?.name.length>7?entries[i].name.slice(0,6)+'…':entries[i]?.name}</text></g>
        </g></g>
      {/if}
    {/each}
    <rect x="598" y="279" width="100" height="53" rx="14" fill="#6a866d"/>
    <rect x="605" y="284" width="86" height="43" rx="10" fill="#284b3c"/>
    <path d="M611 288 H684" stroke="#b1c3a5" stroke-width="3" stroke-linecap="round"/>
    <text x="647" y="354" text-anchor="middle" fill="#375641" font-size="12" font-weight="700" font-family="var(--tk-font)">선물 나오는 곳</text>
    {#if drawing&&elapsed>=1900}
      {@const tx=pose.released?650:pose.x}
      {@const ty=pose.released?250+clamp((elapsed-4050)/450)**2*66:pose.y}
      {@const sway=pose.held?Math.sin((elapsed-1900)/160)*targetToy.swing*Math.sin(Math.PI*clamp((elapsed-1900)/2150)):0}
      <g transform={`translate(${tx},${ty}) rotate(${sway})`} opacity={elapsed>4380?1-clamp((elapsed-4380)/250):1}>
        <image href={targetToy.src} x={-layout.size/2} y={-layout.size*targetToy.grip} width={layout.size} height={layout.size} onerror={onasseterror} data-testid="held-toy"/>
      </g>
    {/if}
    {#if drawing&&elapsed>=1600&&elapsed<2100}
      <ellipse cx={pose.x} cy={pose.y+layout.size*.4} rx={layout.size*.5} ry="9" fill="none" stroke="#d9b65c" stroke-width="3" opacity={Math.sin(clamp((elapsed-1600)/500)*Math.PI)}/>
    {/if}
    <path d={`M${pose.x} 77 V${pose.y-27*handScale}`} stroke="#78998d" stroke-width="4"/>
    <path d={`M${pose.x-1} 77 V${pose.y-27*handScale}`} stroke="#edf3e8" stroke-width="1"/>
    <rect x={pose.x-17} y="69" width="34" height="15" rx="6" fill="#6d9382"/>
    <g transform={`translate(${pose.x},${pose.y}) scale(${handScale})`} data-testid="claw-head">
      <path d="M0 -30 V-14" stroke="#6b8b7e" stroke-width="7" stroke-linecap="round"/>
      <path d={`M-8 -17 Q${-38+pose.close*19} -1 ${-34+pose.close*20} 20 L${-24+pose.close*18} 27`} fill="none" stroke="url(#claw-metal)" stroke-width="9" stroke-linecap="round"/>
      <path d={`M8 -17 Q${38-pose.close*19} -1 ${34-pose.close*20} 20 L${24-pose.close*18} 27`} fill="none" stroke="url(#claw-metal)" stroke-width="9" stroke-linecap="round"/>
      <circle cy="-19" r="12" fill="#edf4ed" stroke="#86a797" stroke-width="3"/>
    </g>
    <rect x="98" y="339" width="180" height="20" rx="10" fill="#f9f8eb"/>
    <text x="188" y="353" text-anchor="middle" fill="#486745" font-size="11" font-family="var(--tk-font)">모두에게 같은 행운을!</text>
    <ellipse cx="481" cy="354" rx="21" ry="5" fill="#91ab89"/><path d="M481 352V337" stroke="#547653" stroke-width="5"/><circle cx="481" cy="335" r="8" fill="#ddac80"/><circle cx="531" cy="349" r="9" fill="#f9df90" stroke="#ba9c58" stroke-width="2"/>
    {#if drawing&&elapsed>=4200&&!reduced}{#each [0,1,2,3,4,5] as n}{@const k=clamp((elapsed-4200)/500)}<path d="M-3 -5L3 -5L3 5L-3 5Z" fill={COLORS[n]} opacity={1-k} transform={`translate(${647+Math.cos(n*Math.PI/3)*k*90},${290-Math.sin(n*Math.PI/3)*k*70}) rotate(${n*40+k*100})`}/>{/each}{/if}
    <rect x="111" y="370" width="28" height="8" rx="4" fill="#9fb3a5"/><rect x="661" y="370" width="28" height="8" rx="4" fill="#9fb3a5"/>
  </svg>
{:else if mode==='balloon'}
  <svg class="picker-scene balloon-scene" viewBox="0 0 800 400" aria-hidden="true" data-phase={drawing?(elapsed<900?'prepare':elapsed<1700?'flight':'burst'):'idle'}>
    <defs>
      <radialGradient id="balloon-light" cx="30%" cy="22%" r="80%"><stop stop-color="white" stop-opacity=".55"/><stop offset=".65" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="#395765" stop-opacity=".09"/></radialGradient>
      <pattern id="balloon-dots" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="2" fill="white" opacity=".4"/></pattern>
      <pattern id="balloon-lines" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-25)"><path d="M0 0V16" stroke="white" stroke-opacity=".3" stroke-width="3"/></pattern>
    </defs>
    <rect x="32" y="26" width="736" height="335" rx="27" fill="#fcfaf0" stroke="#d4debf" stroke-width="2"/>
    <rect x="42" y="36" width="716" height="315" rx="20" fill="#eef3e3"/>
    <path d="M55 58Q400 124 745 58" fill="none" stroke="#9da986" stroke-width="2"/>
    {#each [0,1,2,3,4,5,6,7,8] as n}<path d={`M${65+n*77} ${62+Math.sin(n/8*Math.PI)*30}l26 3l-16 25Z`} fill={COLORS[n%6]}/>{/each}
    <path d="M55 350 Q250 330 400 350 T755 350" fill="none" stroke="#bbc8a5" stroke-width="2"/>
    {#each Array.from({length:layout.count},(_,i)=>i) as i}
      {@const b=shape(i)}
      {@const pos=balloonPosition(i,drawing?startedAt+Math.min(realElapsed,suspense.duration+1700):clock,seed,reduced,count)}
      {@const rot=reduced?0:Math.sin((drawing?startedAt+Math.min(elapsed,1700):clock)/2400+i)*5}
      {#if visible.has(entries[i]?.id)&&!(burst&&i===target)}
        <g class="picker-balloon-slot" data-size={layout.size} data-index={i} transform={`translate(${pos.x},${pos.y}) rotate(${rot}) scale(${layout.size/112})`} opacity={burst?.48:1}>
          <g class:balloon-shuffle={shuffling&&!reduced} style={`--shuffle-delay:${i%6*20}ms;--shuffle-x:${i%2?10:-10}px`}>
            <path d={`M0 48 Q${reduced?0:12*Math.sin(clock/1500+i)} 70 0 99`} fill="none" stroke="#9bada6" stroke-width="1.3"/>
            <path d={b.path} fill={COLORS[(i+seed)%6]} stroke="#ffffff" stroke-opacity=".7" stroke-width="1.5"/>
            <path d={b.path} fill={i%3===0?'url(#balloon-dots)':i%3===1?'url(#balloon-lines)':'transparent'}/>
            <path d={b.path} fill="url(#balloon-light)"/>
            <path d="M-15 -27 Q-29 -20 -29 -9" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" opacity=".55"/>
            <path d="M0 47L-4 54H4Z" fill={COLORS[(i+seed)%6]}/>
            {#if b.id==='bear'}<circle cx="-12" cy="-4" r="2.5" fill="#6a7977"/><circle cx="12" cy="-4" r="2.5" fill="#6a7977"/><path d="M-3 6Q0 12 3 6Z" fill="#6a7977"/>{/if}
            <g class="picker-nameplate"><title>{entries[i]?.number} · {entries[i]?.name}</title><rect x="-45" y="12" width="90" height="24" rx="7"/><text text-anchor="middle" y="29" font-size="17">{entries[i]?.name.length>7?entries[i].name.slice(0,6)+'…':entries[i]?.name}</text></g>
          </g>
        </g>
      {/if}
    {/each}
    {#if !burst&&!reduced}
      {@const aiming=drawing&&elapsed<900}
      {@const wandering=suspensePose(suspense,realElapsed,layout.slots,'balloon',{x:hit.x,y:hit.y+30})}
      {@const aimX=searching?wandering.x:aiming?hit.x+Math.sin(elapsed/170)*(1-elapsed/900)*50:0}
      {@const aimY=searching?wandering.y:aiming?hit.y+Math.cos(elapsed/170)*(1-elapsed/900)*30:0}
      {#if aiming}<g data-testid="picker-aim" transform={`translate(${aimX},${aimY})`} fill="none" stroke="#aa603d" stroke-width="2" opacity=".8"><circle r="23"/><circle r="5"/><path d="M-32 0H-15M15 0H32M0 -32V-15M0 15V32"/></g>{/if}
      {@const flying=drawing&&elapsed>=900}
      <g data-testid="flying-dart" transform={`translate(${flying?dart.x:720},${flying?dart.y:350}) rotate(${flying?dart.angle:-140})`}>
        {#if flying}<path d="M-118 -7H-85M-135 0H-90M-118 7H-85" stroke="#bb895a" opacity=".55" stroke-width="3" stroke-linecap="round"/>{/if}
        <path d="M-75 0H0" stroke="#365e56" stroke-width="5"/><path d="M-77 -15L-48 0L-77 15L-68 0Z" fill="#d99061" stroke="#af693d" stroke-width="1.5"/><path d="M-9 -4L3 0L-9 4Z" fill="#3b5148"/><path d="M-64 0H-20" stroke="#f3e4bb" stroke-width="2"/>
      </g>
    {/if}
    {#if burst&&elapsed<2400&&!reduced}
      {@const pop=clamp((elapsed-1700)/700)}
      <circle cx={hit.x} cy={hit.y} r={15+pop*95} fill="none" stroke="#f0c777" stroke-width={7*(1-pop)} opacity={1-pop}/>
      <g transform={`translate(${hit.x},${hit.y}) scale(${.8+pop*.4})`} opacity={1-pop}><path d="M0 -48L12 -23L40 -35L32 -8L59 3L32 16L39 44L11 32L-8 54L-16 28L-46 34L-34 8L-58 -8L-27 -16L-32 -42L-9 -28Z" fill="#fff2bc"/><text y="9" text-anchor="middle" fill="#9c5c32" font-size="30" font-weight="900" font-family="var(--tk-font)">팡!</text></g>
      {#each [0,1,2,3,4,5,6,7,8,9,10,11] as n}
        {@const k=pop}
        <path d="M-5 -6L6 0L0 10Z" fill={COLORS[(n+seed)%6]} opacity={1-k} transform={`translate(${hit.x+Math.cos(n*Math.PI/6)*k*115},${hit.y+Math.sin(n*Math.PI/6)*k*95+k*k*55}) rotate(${n*45+k*150})`}/>
      {/each}
    {/if}
  </svg>
{/if}
