// 우클릭 컨텍스트 메뉴 핵심 퀵 타일 전용 오프라인 내장 Soft-Duotone SVG 아이콘
// 왜 별도 내장인가: 외부 Iconify CDN 요청 없이 오프라인에서도 즉시 렌더링되며,
//   24×24 viewBox·균일한 둥근 선(1.9px)·부드러운 면 채움(duotone)으로
//   Tidy Task의 아기자기한 포켓 문구 감성과 광학 균형을 맞춥니다.

/**
 * 4칸 포켓 타일용 Soft-Duotone 아이콘 데이터
 * - size: 35px 미니 타일 안에서의 광학 보정 크기(px)
 * - shiftX: 비대칭 실루엣의 시각 중심 보정(px)
 */
export const CONTEXT_DUOTONE_ICONS = Object.freeze({
  flag: {
    size: 14,
    shiftX: 0.5,
    renderBody: (pinned = false) => `
      <path d="M5 4.2C6.4 3.4 8.5 3.4 10.5 4.3C12.8 5.3 15.2 5.4 18.5 4.2V14.4C15.2 15.6 12.8 15.5 10.5 14.5C8.5 13.6 6.4 13.6 5 14.4V4.2Z" fill="currentColor" fill-opacity="${pinned ? '0.44' : '0.24'}"/>
      <path d="M5 21V4.2C6.4 3.4 8.5 3.4 10.5 4.3C12.8 5.3 15.2 5.4 18.5 4.2V14.4C15.2 15.6 12.8 15.5 10.5 14.5C8.5 13.6 6.4 13.6 5 14.4" stroke="currentColor" stroke-width="1.95" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  calendar: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.2" fill="currentColor" fill-opacity="0.20"/>
      <path d="M3.5 8.2C3.5 6.43 4.93 5 6.7 5H17.3C19.07 5 20.5 6.43 20.5 8.2V10H3.5V8.2Z" fill="currentColor" fill-opacity="0.34"/>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.2" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
      <path d="M8 2.8V6M16 2.8V6M3.5 10H20.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
      <circle cx="8.5" cy="14" r="1.15" fill="currentColor"/>
      <circle cx="12" cy="14" r="1.15" fill="currentColor"/>
      <circle cx="15.5" cy="14" r="1.15" fill="currentColor"/>
      <circle cx="8.5" cy="17.3" r="1.15" fill="currentColor"/>
      <circle cx="12" cy="17.3" r="1.15" fill="currentColor"/>
    `,
  },
  checkCircle: {
    size: 14,
    shiftX: 0,
    renderBody: () => `
      <circle cx="12" cy="12" r="8.8" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.9"/>
      <path d="M8.4 12.2L10.9 14.7L15.8 9.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  trash: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <path d="M6.2 7.2H17.8L17.1 18.6C17 19.9 15.9 21 14.6 21H9.4C8.1 21 7 19.9 6.9 18.6L6.2 7.2Z" fill="currentColor" fill-opacity="0.22"/>
      <path d="M4.2 7H19.8M9.3 7V5C9.3 4.2 10 3.5 10.8 3.5H13.2C14 3.5 14.7 4.2 14.7 5V7M6.3 7L7 18.6C7.1 19.9 8.2 21 9.5 21H14.5C15.8 21 16.9 19.9 17 18.6L17.7 7M10.2 11.2V16.6M13.8 11.2V16.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
});

// 글자색·형광펜 퀵 팔레트 10색 (전체 60색은 editorConstants.js의 PALETTE 사용)
export const QUICK_TEXT_COLORS = Object.freeze([
  '#1f2937', '#6b7280', '#dc2626', '#ea580c', '#d97706',
  '#059669', '#2563eb', '#4f46e5', '#7c3aed', '#db2777',
]);

export const QUICK_BG_COLORS = Object.freeze([
  '#fef08a', '#fed7aa', '#fecaca', '#fbcfe8', '#e9d5ff',
  '#bfdbfe', '#bae6fd', '#bbf7d0', '#e5e7eb', '#fde68a',
]);

// 컴팩트 크기 프리셋 칩 (2줄 × 7칸)
export const COMPACT_SIZE_PRESETS = Object.freeze([
  8, 9, 10, 11, 12, 13, 14,
  16, 18, 20, 24, 28, 32, 40,
]);
