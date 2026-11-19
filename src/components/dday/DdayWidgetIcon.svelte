<script>
  /**
   * 노트 도구 메뉴(`메뉴 v`)의 Tidy 툴킷 원본 아이콘(toolkit-icon.png, 256×256 → 23×23)과
   * 캔버스 여백(Y: 46~206)·시각 부피·손그림 파스텔 팔레트·부드러운 테두리를 맞춘
   * 마스킹테이프 폴라로이드 D-Day 위젯 전용 일러스트 SVG입니다.
   *
   * @type {{ size?: number, active?: boolean }}
   */
  let { size = 23, active = false } = $props();
</script>

<svg
  class="dday-widget-art"
  class:is-active={active}
  width={size}
  height={size}
  viewBox="0 0 256 256"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  <!-- 살짝 기울어진 크림 폴라로이드 본체 (toolkit-icon.png 코어 폭 169px·높이 160px 규격에 정밀 맞춤) -->
  <g transform="rotate(-3 128 134)">
    <path
      d="M 55 66 C 95 61, 161 61, 201 66 C 209 68, 211 77, 210 135 C 209 185, 207 198, 197 201 C 158 206, 98 206, 59 201 C 49 198, 47 185, 48 135 C 49 77, 48 68, 55 66 Z"
      fill="#FFF6E5"
      stroke="#635045"
      stroke-opacity="0.88"
      stroke-width="2.8"
      stroke-linejoin="round"
    />

    <!-- 내부 파스텔 블루 사진 창 -->
    <path
      d="M 64 80 C 100 76, 156 76, 192 80 C 196 81, 197 86, 197 119 C 197 151, 196 156, 191 157 C 156 160, 100 160, 65 157 C 60 156, 59 151, 59 119 C 59 86, 60 81, 64 80 Z"
      fill={active ? '#99BADB' : '#A2BFDA'}
      stroke="#6E5A4E"
      stroke-opacity="0.82"
      stroke-width="2"
      stroke-linejoin="round"
    />

    <!-- 사진 창 안쪽 따뜻한 피치 언덕 -->
    <path
      d="M 60 138 Q 105 123 148 136 T 196 133 L 196 156 C 158 159, 98 159, 60 156 Z"
      fill="#F8DAB7"
      stroke="#6E5A4E"
      stroke-opacity="0.76"
      stroke-width="1.8"
      stroke-linejoin="round"
    />

    <!-- 중앙 코랄 별 포인트 (켜짐 시 채도만 은은히 높여 외곽 규격 흔들림 방지) -->
    <path
      d="M 128 94 L 133.5 106.5 L 147 107.8 L 136.8 116.5 L 139.8 129.8 L 128 122.6 L 116.2 129.8 L 119.2 116.5 L 109 107.8 L 122.5 106.5 Z"
      fill={active ? '#EE745C' : '#E87D67'}
      stroke="#6E5A4E"
      stroke-opacity="0.8"
      stroke-width="1.85"
      stroke-linejoin="round"
    />

    <!-- 하단 폴라로이드 여백 메모 줄 + 코랄 점 -->
    <circle
      cx="77"
      cy="181"
      r="6.6"
      fill="#F4977F"
      stroke="#6E5A4E"
      stroke-opacity="0.76"
      stroke-width="1.75"
    />
    <path
      d="M 96 181 L 179 181"
      stroke="#A79282"
      stroke-width="3.2"
      stroke-dasharray="20 7 11 7"
      stroke-linecap="round"
    />
  </g>

  <!-- 상단 허니옐로 스트라이프 마스킹테이프 (최상단 Y≈46으로 toolkit-icon.png와 높이 일치) -->
  <g transform="rotate(4.2 128 60)">
    <path
      d="M 84 47 L 172 46 L 168 59 L 173 72 L 85 73 L 89 60 Z"
      fill={active ? '#FFC566' : '#FEBF5D'}
      fill-opacity="0.96"
      stroke="#635045"
      stroke-opacity="0.85"
      stroke-width="2.3"
      stroke-linejoin="round"
    />
    <path
      d="M 102 48 L 96 72 M 122 48 L 116 72 M 142 47 L 136 72 M 160 47 L 154 71"
      stroke="#FFF6E5"
      stroke-opacity="0.68"
      stroke-width="2.6"
      stroke-linecap="round"
    />
  </g>
</svg>

<style>
  .dday-widget-art {
    display: block;
    flex: none;
  }
</style>
