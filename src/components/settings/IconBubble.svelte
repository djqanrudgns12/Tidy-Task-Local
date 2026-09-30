<script>
  // 색 방울 아이콘. 글자보다 먼저 "무슨 설정인지"를 색과 그림으로 알려 줍니다(미니 온도계 설정과 같은 말씨).
  // 방울 색은 tone에서 옅게, 아이콘 색은 같은 빛깔을 짙게 써서 밝은 화면·다크 모드 모두에서 읽힙니다.

  // tone: 'peach' | 'gold' | 'mint' | 'sky' | 'lilac' | 'rose' | 'accent' | 'danger' (SettingsModal의 --st-tone-* 변수)
  /** @type {{ icon: any, tone?: string, size?: number }} */
  let { icon: Icon, tone = 'accent', size = 30 } = $props();
</script>

<span class="bubble" style="--tone:var(--st-tone-{tone}); --size:{size}px;" aria-hidden="true">
  <Icon size={Math.round(size * 0.52)} strokeWidth={2.3} />
</span>

<style>
  .bubble {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 37%;
    background: color-mix(in srgb, var(--tone) var(--st-bubble-mix), var(--st-card));
    color: color-mix(in srgb, var(--tone) var(--st-bubble-ink), var(--st-ink));
    transition: background-color 0.2s, color 0.2s;
  }
</style>
