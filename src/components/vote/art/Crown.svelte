<script lang="ts">
  // 당선 왕관 스티커(흰 테두리 다이컷). 캐릭터 머리 위에 톡 붙습니다.
  let { size = 64 } = $props<{ size?: number }>();
</script>

<svg class="vt-crown" viewBox="0 0 80 60" width={size} height={size * 0.75} aria-hidden="true">
  <path d="M10 48 6 16l18 14L40 6l16 24 18-14-4 32Z" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round" />
  <path d="M10 48 6 16l18 14L40 6l16 24 18-14-4 32Z" fill="#f4c95d" stroke="#b9861f" stroke-width="2.5" stroke-linejoin="round" />
  <path d="M12 42h56" stroke="#b9861f" stroke-width="2.5" stroke-linecap="round" />
  <circle cx="40" cy="30" r="4.6" fill="#f29a8f" stroke="#b9861f" stroke-width="1.6" />
  <circle cx="24" cy="36" r="3.2" fill="#a6cdef" stroke="#b9861f" stroke-width="1.4" />
  <circle cx="56" cy="36" r="3.2" fill="#95d9bf" stroke="#b9861f" stroke-width="1.4" />
  <path d="M18 20.5 16.6 24" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8" />
</svg>

<style>
  .vt-crown {
    display: block;
    overflow: visible;
    filter: drop-shadow(0 3px 4px rgba(90, 60, 10, 0.25));
  }
</style>
