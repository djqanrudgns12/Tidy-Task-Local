<script lang="ts">
  let { kind = 'bell', playing = false } = $props<{ kind?: string; playing?: boolean }>();
</script>

<svg class="focus-art" class:animating={playing} viewBox="0 0 400 340" fill="none" aria-hidden="true">
  <ellipse cx="200" cy="303" rx="94" ry="13" fill="currentColor" opacity=".08" />
  {#if kind === 'bell'}
    <g class="bell-swing" stroke="#59483B" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M173 78V65a27 27 0 0 1 54 0v13" fill="#F9C858" />
      <ellipse cx="200" cy="269" rx="27" ry="28" fill="#F4A746" />
      <path d="M91 241c27-29 13-90 36-132 29-52 117-52 146 0 23 42 9 103 36 132Z" fill="#FFD253" />
      <path d="M250 106c25 32 14 92 33 134h-35c-11-61 0-94-18-135" fill="#F5B93B" stroke="none" />
      <path d="M143 161c1-25 11-45 25-54" stroke="#FFF1AD" stroke-width="17" />
      <rect x="77" y="238" width="246" height="35" rx="17.5" fill="#FFCE50" />
      <path d="M106 252h50" stroke="#FFF1AD" stroke-width="8" />
      <path d="M180 202q20 19 40 0" stroke-width="5" />
      <path d="M169 181v4m62-4v4" stroke-width="8" />
    </g>
    <g class="bell-rings" stroke="#D49A32" stroke-width="7" stroke-linecap="round">
      <path d="M61 124 45 112m15 47H37m302-35 16-12m-15 47h23" />
    </g>
  {:else if kind === 'bomb'}
    {#if playing}
      <g class="boom-burst" stroke="#B46A42" stroke-width="6" stroke-linejoin="round">
        <path d="m200 33 23 64 57-38-8 69 78-1-51 53 55 47-76 8 13 66-67-34-30 55-24-64-66 31 15-65-69-14 55-43-43-59 68 9-4-63 50 39Z" fill="#FFD16D" />
        <path d="m201 95 23 52 48-9-22 42 34 32-51 5-28 45-23-45-47-7 34-36-12-44 34 17Z" fill="#FFAC78" stroke="none" />
      </g>
      <g class="puff" fill="#FFF6DC"><circle cx="167" cy="188" r="22"/><circle cx="198" cy="170" r="29"/><circle cx="228" cy="190" r="25"/></g>
    {:else}
      <path d="M218 110c-9-42 49-40 42-69" stroke="#8C7964" stroke-width="9" stroke-linecap="round" />
      <path d="m253 31 13 17m-1-22-4 25m17-14-26 8" stroke="#F3AC49" stroke-width="6" stroke-linecap="round" />
      <rect x="185" y="101" width="53" height="32" rx="10" fill="#7A7F8E" stroke="#414858" stroke-width="7" transform="rotate(15 212 117)" />
      <circle cx="197" cy="208" r="88" fill="#626B82" stroke="#414858" stroke-width="7" />
      <path d="M137 188q4-30 26-39" stroke="#A7B1C5" stroke-width="14" stroke-linecap="round" />
      <path d="M171 211v4m49-4v4m-39 26q15 12 29 0" stroke="#FFF6E7" stroke-width="6" stroke-linecap="round" />
    {/if}
  {:else if kind === 'fart'}
    <g class="cloud-puff" stroke="#63886C" stroke-width="6" stroke-linejoin="round">
      <path d="M105 247c-49-6-45-70-10-84-8-38 35-65 65-44 19-55 104-51 115 10 53-7 71 49 46 72 38 34 7 76-33 68-26 32-69 23-85 6-31 25-72 5-75-17Z" fill="#D0E9AF" />
      <path d="M140 147q13-12 26-3m56-29q25 1 34 22" stroke="#EFF8DA" stroke-width="13" stroke-linecap="round" />
      <path d="M159 202q8-12 16 0m48 0q8-12 16 0m-50 29q18 17 35-1" stroke-width="6" stroke-linecap="round" />
    </g>
    <g class="little-clouds" fill="#D0E9AF" stroke="#63886C" stroke-width="4"><circle cx="60" cy="256" r="15"/><circle cx="334" cy="102" r="12"/><circle cx="78" cy="104" r="7"/></g>
  {:else}
    <g class="siren-rays" fill="#F6B79D" opacity=".55"><path d="m163 130-106-60-15 137 116-32Z"/><path d="m237 130 106-60 15 137-116-32Z"/></g>
    <path d="M111 255V156a89 89 0 0 1 178 0v99" fill="#F49D8E" stroke="#965D59" stroke-width="7" />
    <path d="M224 84c39 18 43 46 43 76v94h-43Z" fill="#E9827B" />
    <path d="M140 165c0-32 10-47 30-57" stroke="#FFE0CA" stroke-width="15" stroke-linecap="round" />
    <g class="siren-light"><rect x="180" y="122" width="40" height="103" rx="20" fill="#FFF1B2" /><ellipse cx="200" cy="175" rx="48" ry="54" fill="#FFF1B2" opacity=".22"/></g>
    <rect x="93" y="248" width="214" height="35" rx="13" fill="#8B94A3" stroke="#616D80" stroke-width="7" />
    <path d="M119 261h47" stroke="#D7DEE5" stroke-width="6" stroke-linecap="round" />
  {/if}
</svg>

<style>
  .focus-art{width:100%;height:100%;overflow:visible;color:#785d41}
  .bell-swing{transform-origin:200px 63px}.animating .bell-swing{animation:ring .27s ease-in-out infinite alternate}
  .animating .bell-rings{animation:rays .4s ease-in-out infinite alternate}
  .boom-burst{transform-origin:200px 180px;animation:burst .45s cubic-bezier(.2,.8,.2,1) both}
  .puff{transform-origin:200px 190px;animation:smoke 1.18s ease-out both}
  .animating .cloud-puff{transform-origin:200px 210px;animation:cloud 1.5s ease-out both}
  .animating .little-clouds{transform-origin:200px 210px;animation:smoke 1.5s ease-out both}
  .siren-light{transform-origin:200px 175px}.animating .siren-light{animation:beacon .65s ease-in-out infinite alternate}
  .animating .siren-rays{transform-origin:200px 160px;animation:rays .65s ease-in-out infinite alternate}
  @keyframes ring{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
  @keyframes rays{from{opacity:.25}to{opacity:.8}}
  @keyframes burst{from{transform:scale(.15) rotate(-15deg);opacity:0}to{transform:scale(1);opacity:1}}
  @keyframes smoke{0%{transform:scale(.5);opacity:0}35%{opacity:1}100%{transform:scale(1.2) translateY(-12px);opacity:.2}}
  @keyframes cloud{0%{transform:scale(.7)}25%{transform:scale(1.08,.94)}60%{transform:scale(.98,1.02)}100%{transform:scale(1)}}
  @keyframes beacon{from{transform:translateX(-28px) scaleX(.6)}to{transform:translateX(28px) scaleX(1)}}
  @media(prefers-reduced-motion:reduce){.focus-art *{animation:none!important}}
</style>
