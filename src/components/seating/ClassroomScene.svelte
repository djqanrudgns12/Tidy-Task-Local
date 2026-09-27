<script lang="ts">
  import type {Board,PublicSeat} from '../../lib/seating/types';
  import { crossfade } from 'svelte/transition';
  import { cubicInOut } from 'svelte/easing';
  import { viewPoint, numbers, guideEdges, compactSeats } from '../../lib/seating/geometry.js';
  import { artFor } from '../../lib/seating/art.js';
  import { LockKeyhole, LockKeyholeOpen } from 'lucide-svelte';
  let { board, teacher=false, selected=[], locked=[], concealed=[], revealing=[], highlighted='', dropHighlight='', onselect=()=>{}, onreveal=()=>{}, onswap=()=>{}, onlock=()=>{}, onresize=()=>{}, clearable=[], onclear=()=>{}, resizable=false, lockable=false, disabled=false, zoom=1, simple=false, fit=false }: {board:Board,teacher?:boolean,selected?:string[],locked?:string[],concealed?:string[],revealing?:string[],highlighted?:string,dropHighlight?:string,onselect?:(id:string,multiple:boolean)=>void,onreveal?:(id:string)=>void,onswap?:(from:string,to:string)=>void,onlock?:(id:string)=>void,onresize?:(axis:'columns'|'rows',delta:number)=>void,clearable?:string[],onclear?:(id:string)=>void,resizable?:boolean,lockable?:boolean,disabled?:boolean,zoom?:number,simple?:boolean,fit?:boolean} = $props();
  let viewport=$state(1000), viewportHeight=$state(520), drag=$state<{id:string,startX:number,startY:number,dx:number,dy:number,moved:boolean}|null>(null), suppressClick=false;
  const compact=$derived(compactSeats(board.seats));
  const size=$derived({width:Math.max(3,...compact.map(s=>s.x+1.55)),height:Math.max(2,...compact.map(s=>s.y+1.55))});
  const ux=$derived(Math.max(fit&&viewport<650?66:12,Math.min(128,(viewport-40)/size.width))*zoom);
  const uy=$derived(Math.max(fit&&viewportHeight<270?31:10,Math.min(105,(viewportHeight-76)/size.height))*zoom);
  const viewed=$derived(compact.map((s:PublicSeat)=>({...s,...viewPoint(s,size,teacher)})));
  const grid=$derived(numbers(viewed));
  const guides=$derived({xs:guideEdges(grid.xs,1),ys:guideEdges(grid.ys,1.25)});
  const target=$derived.by(()=>{if(!drag?.moved)return '';const source=viewed.find((s:PublicSeat)=>s.id===drag?.id);if(!source)return '';const x=source.x+drag.dx,y=source.y+drag.dy;const near=viewed.filter((s:PublicSeat)=>s.active).map((s:PublicSeat)=>({id:s.id,d:Math.hypot(s.x-x,(s.y-y)/1.25)})).sort((a:{d:number},b:{d:number})=>a.d-b.d)[0];return near&&near.d<=.95&&near.id!==drag.id?near.id:'';});
  const [send,receive]=crossfade({duration:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:340,easing:cubicInOut,fallback:()=>({duration:0})});
  function down(e:PointerEvent,s:PublicSeat){if(disabled||fit||concealed.includes(s.id)||e.button!==0)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);drag={id:s.id,startX:e.clientX,startY:e.clientY,dx:0,dy:0,moved:false};}
  function move(e:PointerEvent){if(!drag)return;const dx=(e.clientX-drag.startX)/ux,dy=(e.clientY-drag.startY)/uy;drag={...drag,dx,dy,moved:drag.moved||Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5};}
  function up(){if(!drag)return;const from=drag.id,to=target,moved=drag.moved;drag=null;if(moved){suppressClick=true;if(to)onswap(from,to);}}
  function click(e:MouseEvent,s:PublicSeat){if(suppressClick){suppressClick=false;return;}if(concealed.includes(s.id)){onreveal(s.id);return;}if(!disabled)onselect(s.id,e.shiftKey||e.ctrlKey);}
</script>
<svelte:window onblur={()=>drag=null} onkeydown={e=>{if(e.key==='Escape')drag=null;}}/>
<div class="seat-scene-viewport" class:seat-preset-view={fit} bind:clientWidth={viewport} bind:clientHeight={viewportHeight}>
  <div class="seat-room" style:width={`${size.width*ux+32}px`} style:height={`${size.height*uy+60}px`} style:--seat-label-font={`${Math.max(10,Math.min(18,(ux-19)/3.4))}px`} style:--pupil-size={`${Math.min(ux,uy*1.18)}px`} style:--seat-preset-card-height={`${Math.max(18,Math.min(34,uy*1.12))}px`}>
    <div class:at-bottom={teacher} class="seat-front"><span class="chalk-line"></span><b>칠판</b><span class="chalk-line"></span></div>
    <div class="seat-guides" aria-hidden="true">
      {#each guides.xs as x}<span class="seat-guide-x" style:left={`${16+x*ux}px`} style:top={`${38+(guides.ys[0]??0)*uy}px`} style:height={`${((guides.ys.at(-1)??0)-(guides.ys[0]??0))*uy}px`}></span>{/each}
      {#each guides.ys as y}<span class="seat-guide-y" style:top={`${38+y*uy}px`} style:left={`${16+(guides.xs[0]??0)*ux}px`} style:width={`${((guides.xs.at(-1)??0)-(guides.xs[0]??0))*ux}px`}></span>{/each}
    </div>
    {#each grid.xs as x,i}<span class="seat-axis seat-axis-x" style:top={`${38+(guides.ys[0]??0)*uy-24}px`} style:left={`${16+(x+.5)*ux}px`}>{i+1}</span>{/each}
    {#each grid.ys as y,i}<span class="seat-axis seat-axis-y" style:left={`${16+(guides.xs[0]??0)*ux-27}px`} style:top={`${38+(y+.625)*uy}px`}>{i+1}</span>{/each}
    {#if resizable}
      <div class="seat-grid-resize seat-grid-columns" aria-label={`가로 자리 ${grid.xs.length}개`}><span>가로 {grid.xs.length}</span><button aria-label="가로 자리 하나 줄이기" disabled={disabled||grid.xs.length<=2} onclick={()=>onresize('columns',-1)}>−</button><button aria-label="가로 자리 하나 늘리기" disabled={disabled||grid.xs.length>=12} onclick={()=>onresize('columns',1)}>＋</button></div>
      <div class="seat-grid-resize seat-grid-rows" aria-label={`세로 자리 ${grid.ys.length}개`}><span>세로 {grid.ys.length}</span><button aria-label="세로 자리 하나 줄이기" disabled={disabled||grid.ys.length<=1} onclick={()=>onresize('rows',-1)}>−</button><button aria-label="세로 자리 하나 늘리기" disabled={disabled||grid.ys.length>=30} onclick={()=>onresize('rows',1)}>＋</button></div>
    {/if}
    {#each viewed as s (s.id)}
      {@const num=grid.at(s)}
      {@const isDragging=drag?.id===s.id&&drag.moved}
      <button class="seat-place" class:chosen={selected.includes(s.id)} class:locked={locked.includes(s.id)} class:drop-target={target===s.id||dropHighlight===s.id} class:found={highlighted===s.id} class:unavailable={!s.active} class:empty={!s.name&&!concealed.includes(s.id)} class:mystery={concealed.includes(s.id)} class:simple class:dragging={isDragging}
        style:left={`${16+s.x*ux}px`} style:top={`${38+s.y*uy}px`} style:width={`${ux}px`} style:height={`${uy*1.25}px`}
        data-seat-id={s.id} aria-label={concealed.includes(s.id)?`숨겨진 학생 자리, 위쪽 ${num.x}, 왼쪽 ${num.y}. 클릭해서 공개`:`${s.number?`${s.number}번 `:''}${s.name||'빈자리'}, 위쪽 ${num.x}, 왼쪽 ${num.y}`} aria-pressed={concealed.includes(s.id)?undefined:selected.includes(s.id)} disabled={disabled&&!concealed.includes(s.id)}
        onpointerdown={e=>down(e,s)} onpointermove={move} onpointerup={up} onpointercancel={()=>drag=null} onclick={e=>click(e,s)}>
        {#if concealed.includes(s.id)}<span class="seat-mystery" aria-hidden="true"><span class="seat-mystery-figure"></span><span class="seat-mystery-plate">?</span></span>{/if}
        {#if s.name}{#key `${s.number}|${s.name}`}
          <span class="seat-occupant" class:boy={s.gender==='male'} class:girl={s.gender==='female'} class:seat-revealing={revealing.includes(s.id)} in:receive={{key:`${s.number}|${s.name||s.id}`}} out:send={{key:`${s.number}|${s.name||s.id}`}} style:translate={isDragging?`${drag!.dx*ux}px ${drag!.dy*uy}px`:'0 0'}>
            {#if !simple}<img class="seat-pupil" src={artFor(s.appearance)} alt="" draggable="false" style:transform={`rotate(${(s.angle||0)+(teacher?180:0)}deg)`}/>{/if}
            <span class="seat-nameplate"><small>{s.number}</small><strong title={s.name} style:--seat-person-font={fit?`${Math.max(10,Math.min(18,(ux-16)/Math.max(3,s.name.length*.92),uy*.72))}px`:''}>{s.name}</strong></span>
          </span>
        {/key}{/if}
        {#if target===s.id}<span class="seat-drop-label">{s.name?'서로 바꾸기':'여기로 옮기기'}</span>{/if}
      </button>
      {#if lockable&&(s.name||locked.includes(s.id))}<button class="seat-lock" class:active={locked.includes(s.id)} style:left={`${16+s.x*ux+ux-31}px`} style:top={`${38+s.y*uy+uy*1.25-32}px`} aria-label={`${s.name||'지정된'} 자리 ${locked.includes(s.id)?'고정 해제':'고정'}`} aria-pressed={locked.includes(s.id)} title={locked.includes(s.id)?`${s.name||'지정된'} 자리 고정 해제`:`${s.name} 자리 고정`} disabled={disabled} onclick={()=>onlock(s.id)}>{#if locked.includes(s.id)}<LockKeyhole size={15}/>{:else}<LockKeyholeOpen size={15}/>{/if}</button>{/if}
      <!-- 자리 버튼 안에 넣으면 누를 때 자리 선택(click)까지 같이 일어나므로 형제 버튼으로 카드 오른쪽 위 모서리에 겹쳐 둡니다. -->
      {#if s.name&&clearable.includes(s.id)}<button class="seat-clear" style:left={`${16+s.x*ux+ux*.97-15}px`} style:top={`${38+s.y*uy+uy*.125-9}px`} aria-label={`${s.number?`${s.number}번 `:''}${s.name} 자리 비우기`} title={`${s.name} 자리 비우기`} disabled={disabled} onclick={()=>onclear(s.id)}>×</button>{/if}
    {/each}
  </div>
</div>
