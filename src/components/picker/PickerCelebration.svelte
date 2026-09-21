<script lang="ts">
  import {onMount} from 'svelte';
  import {X,ArrowRight,Sparkles} from 'lucide-svelte';
  let {winner,mode,custom,reduced,toy,onclose}=$props<{winner:import('../../lib/picker/engine.js').Entry;mode:string;custom:boolean;reduced:boolean;toy:string;onclose:()=>void}>();
  let dialog:HTMLDialogElement;
  onMount(()=>{dialog.showModal();});
</script>

<dialog bind:this={dialog} class="picker-celebration" class:quiet={reduced} aria-labelledby="picker-winner-name" aria-describedby="picker-winner-caption" onclose={onclose}>
  <button class="picker-celebration-close" aria-label="당첨 결과 닫기" onclick={()=>dialog.close()}><X size={26}/></button>
  <div class="picker-celebration-art" aria-hidden="true">
    {#if mode==='claw'&&toy}<img src={toy} alt=""/>
    {:else}<svg viewBox="0 0 220 190"><path d="M110 151Q90 173 111 187" fill="none" stroke="#7b9b8c" stroke-width="3"/><path d="M110 148C13 88 51 3 110 48C169 3 207 88 110 148Z" fill="#a9d0bc" stroke="#fff" stroke-width="3"/><path d="M77 55Q55 61 64 86" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/><path d="M103 152L110 143L117 152Z" fill="#6f9f87"/><path d="M27 42l6-12 6 12-6 12ZM174 142l6-12 6 12-6 12Z" fill="#d8b86e"/><circle cx="179" cy="35" r="5" fill="#c4d9ca"/></svg>{/if}
  </div>
  <p id="picker-winner-caption" class="picker-celebration-caption"><Sparkles size={20}/>{custom?'이번에 뽑힌 주인공':'이번에 뽑힌 학생'}</p>
  <span class="picker-celebration-number">{winner.number}{custom?'번째 항목':'번'}</span>
  <h2 id="picker-winner-name" class:long={winner.name.length>10}>{winner.name}</h2>
  <p class="picker-celebration-message">축하해요!</p>
  <button class="picker-celebration-confirm" onclick={()=>dialog.close()}>확인<ArrowRight size={20}/></button>
  <small class="picker-celebration-hint">닫으면 무대 아래에서 결과를 다시 볼 수 있어요</small>
</dialog>
