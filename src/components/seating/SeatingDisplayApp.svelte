<script lang="ts">
  import type {Board} from '../../lib/seating/types';
  import {onMount} from 'svelte';
  import {getCurrentWindow} from '@tauri-apps/api/window';
  import {X,Maximize2,Search,Download} from 'lucide-svelte';
  import {dragRegion} from '../../lib/dragRegion.js';
  import {readPublic,subscribeRoster,watchContext,native} from '../../lib/seating/repository.js';
  import {downloadPng} from '../../lib/seating/export.js';
  import ClassroomScene from './ClassroomScene.svelte';
  import './seating.css';
  let board=$state<Board|null>(null),teacher=$state(false),query=$state(''),error=$state(''),simple=$state(false),showNames=$state(true),revealed=$state(0),sequence=$state(false),timer:any;
  const highlighted=$derived(board?.seats.find(s=>query.trim()&&(s.name.includes(query.trim())||String(s.number)===query.trim()))?.id||'');
  const visible=$derived(board?{...board,seats:board.seats.map((s,i)=>({...s,name:showNames&&(!sequence||i<revealed)?s.name:'',number:showNames&&(!sequence||i<revealed)?s.number:''}))}:null);
  function reveal(){if(!board)return;clearInterval(timer);showNames=true;sequence=true;revealed=0;timer=setInterval(()=>{revealed++;if(revealed>=(board?.seats.length||0)){clearInterval(timer);sequence=false;}},550);}
  onMount(()=>{let disposed=false,ticket=0;const off:(()=>void)[]=[];const refresh=async()=>{const id=++ticket;try{const next=await readPublic();if(disposed||id!==ticket)return;if(JSON.stringify(board)!==JSON.stringify(next)){clearInterval(timer);sequence=false;board=next;}}catch{error='공개할 자리를 불러오지 못했어요.';}};void(async()=>{off.push(await subscribeRoster(refresh));off.push(await watchContext(refresh));await refresh();})();window.addEventListener('focus',refresh);return()=>{disposed=true;clearInterval(timer);off.forEach(fn=>fn());window.removeEventListener('focus',refresh);};});
</script>
<div class="seating-app seat-public">
  <header class="seating-titlebar" use:dragRegion><b>우리 반 자리</b><span>{board?.className||''}</span><div class="window-actions"><button aria-label="전체 화면" onclick={async()=>{if(native){const win=getCurrentWindow();await win.setFullscreen(!await win.isFullscreen());}else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}}><Maximize2 size={20}/></button><button aria-label="닫기" onclick={()=>native?getCurrentWindow().close():window.close()}><X size={20}/></button></div></header>
  {#if error}<p class="seat-error">{error}</p>{/if}
  {#if visible}<div class="public-heading"><div><small>{visible.date}</small><h1>{visible.title}</h1></div><div class="seat-view-switch" role="group" aria-label="자리 배치를 보는 기준"><button class="seat-view-student" class:active={!teacher} aria-pressed={!teacher} onclick={()=>teacher=false}>학생 기준</button><button class="seat-view-teacher" class:active={teacher} aria-pressed={teacher} onclick={()=>teacher=true}>교사 기준</button></div><label class="seat-search"><Search size={18}/><input bind:value={query} aria-label="내 자리 찾기" placeholder="이름·번호로 내 자리 찾기"/></label></div>
    <ClassroomScene board={visible} {teacher} {highlighted} {simple} onselect={id=>{const s=board?.seats.find(s=>s.id===id);query=s?.name||'';}}/>
    <footer class="seat-footer"><div class="seat-wrap"><button onclick={()=>showNames=!showNames}>{showNames?'이름 가리기':'이름 보이기'}</button><button onclick={reveal}>순차적 공개</button><button onclick={()=>{clearInterval(timer);sequence=false;showNames=true;}}>한 번에 보기</button><button onclick={()=>simple=!simple}>간단히 보기</button></div><button onclick={async()=>{try{await downloadPng(board!,{teacher,simple});}catch(e){error=String(e);}}}><Download size={18}/>4K PNG 저장</button></footer>
  {:else}<div class="seat-empty-state"><h1>우리 반 자리를 준비하고 있어요</h1><p>선생님이 자리를 정하면 여기에 나타나요.</p></div>{/if}
</div>
