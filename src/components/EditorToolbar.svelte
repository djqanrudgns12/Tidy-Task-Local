<script>
  import { Bold, Underline, AlignLeft, AlignCenter, AlignRight, Type, PaintBucket } from 'lucide-svelte';
  
  export let letterSpacing = 0;

  function applyFormat(command, value = null) {
    document.execCommand(command, false, value);
  }
</script>

<div class="flex items-center gap-1 p-1 bg-white/60 rounded-t-lg border border-black/10 border-b-0 shadow-sm overflow-x-auto w-full *:flex-shrink-0">
  
  <!-- Font Family -->
  <select 
    on:change={(e) => applyFormat('fontName', e.target.value)}
    class="text-xs bg-white/50 rounded px-1 py-1 outline-none text-gray-700 cursor-pointer hover:bg-white border-transparent"
    title="글꼴"
  >
    <option value="sans-serif">고딕</option>
    <option value="serif">명조</option>
    <option value="monospace">Mono</option>
  </select>

  <div class="w-px h-3 bg-gray-300 mx-0.5"></div>

  <!-- Font Size -->
  <select 
    on:change={(e) => applyFormat('fontSize', e.target.value)}
    class="text-xs w-10 bg-white/50 rounded px-1 py-1 outline-none text-gray-700 cursor-pointer hover:bg-white border-transparent"
    title="글자 크기"
  >
    <option value="1">10</option>
    <option value="2">13</option>
    <option value="3" selected>16</option>
    <option value="4">18</option>
    <option value="5">24</option>
  </select>

  <div class="w-px h-3 bg-gray-300 mx-0.5"></div>

  <!-- Bold & Underline -->
  <button on:mousedown|preventDefault={() => applyFormat('bold')} class="p-1 hover:bg-white rounded text-gray-700 transition-colors" title="굵게">
    <Bold size={13} />
  </button>
  <button on:mousedown|preventDefault={() => applyFormat('underline')} class="p-1 hover:bg-white rounded text-gray-700 transition-colors" title="밑줄">
    <Underline size={13} />
  </button>

  <div class="w-px h-3 bg-gray-300 mx-0.5"></div>

  <!-- Alignments -->
  <button on:mousedown|preventDefault={() => applyFormat('justifyLeft')} class="p-1 hover:bg-white rounded text-gray-700 transition-colors" title="좌측 정렬">
    <AlignLeft size={13} />
  </button>
  <button on:mousedown|preventDefault={() => applyFormat('justifyCenter')} class="p-1 hover:bg-white rounded text-gray-700 transition-colors" title="중앙 정렬">
    <AlignCenter size={13} />
  </button>
  <button on:mousedown|preventDefault={() => applyFormat('justifyRight')} class="p-1 hover:bg-white rounded text-gray-700 transition-colors" title="우측 정렬">
    <AlignRight size={13} />
  </button>

  <div class="w-px h-3 bg-gray-300 mx-0.5"></div>

  <!-- Colors -->
  <div class="flex items-center gap-0.5 relative group bg-white/50 rounded" title="글자 색상">
    <Type size={12} class="text-gray-600 ml-1" />
    <input 
      type="color" 
      on:input={(e) => applyFormat('foreColor', e.target.value)}
      class="w-4 h-5 p-0 border-0 bg-transparent cursor-pointer rounded" 
    />
  </div>

  <div class="flex items-center gap-0.5 relative group bg-white/50 rounded" title="형광펜 색상">
    <PaintBucket size={12} class="text-gray-600 ml-1" />
    <input 
      type="color"
      value="#ffff00"
      on:change={(e) => applyFormat('hiliteColor', e.target.value)}
      class="w-4 h-5 p-0 border-0 bg-transparent cursor-pointer rounded" 
    />
  </div>
</div>

<div class="flex items-center gap-2 px-2 py-1 bg-white/50 border-x border-black/10 shadow-sm text-[10px] text-gray-600 font-semibold w-full">
  <span class="whitespace-nowrap">자간 조절:</span>
  <input type="range" min="-2" max="10" step="0.5" bind:value={letterSpacing} class="w-full h-1 bg-black/10 rounded-full appearance-none accent-amber-500 cursor-pointer" />
  <span class="w-4 text-right">{letterSpacing}</span>
</div>
