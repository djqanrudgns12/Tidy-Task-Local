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
  pencil: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <path d="M16.8 4.1C17.6 3.3 18.9 3.3 19.7 4.1L19.9 4.3C20.7 5.1 20.7 6.4 19.9 7.2L9.4 17.7L4.3 19.7L6.3 14.6L16.8 4.1Z" fill="currentColor" fill-opacity="0.22"/>
      <path d="M16.8 4.1C17.6 3.3 18.9 3.3 19.7 4.1L19.9 4.3C20.7 5.1 20.7 6.4 19.9 7.2L9.4 17.7L4.3 19.7L6.3 14.6L16.8 4.1Z" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.3 6.6L17.4 9.7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
    `,
  },
  pinOff: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <path d="M9.2 9.4V11.1C9.2 11.9 8.8 12.6 8.1 13L6.4 13.9C5.6 14.3 5.2 15.1 5.2 15.9V16.6H16.6L9.2 9.4Z" fill="currentColor" fill-opacity="0.22"/>
      <path d="M12 16.6V21.5M14.8 9.2V7C14.8 6.4 15.3 6 15.8 6C16.8 6 17.5 5.2 17.5 4.2C17.5 3.3 16.8 2.6 15.8 2.6H8.4M9.2 9.4V11.1C9.2 11.9 8.8 12.6 8.1 13L6.4 13.9C5.6 14.3 5.2 15.1 5.2 15.9V16.6H16.6M3 3L21 21" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  pin: {
    size: 14,
    shiftX: 0,
    renderBody: (active = false) => `
      <path d="M9 10.6C9 11.5 8.5 12.3 7.8 12.7L6.2 13.6C5.5 14 5 14.8 5 15.6V16.4H19V15.6C19 14.8 18.5 14 17.8 13.6L16.2 12.7C15.5 12.3 15 11.5 15 10.6V7C15 6.4 15.5 6 16 6C17 6 17.6 5.2 17.6 4.3C17.6 3.4 16.9 2.7 16 2.7H8C7.1 2.7 6.4 3.4 6.4 4.3C6.4 5.2 7 6 8 6C8.5 6 9 6.4 9 7V10.6Z" fill="currentColor" fill-opacity="${active ? '0.38' : '0.22'}"/>
      <path d="M12 16.4V21.5M9 10.6C9 11.5 8.5 12.3 7.8 12.7L6.2 13.6C5.5 14 5 14.8 5 15.6V16.4H19V15.6C19 14.8 18.5 14 17.8 13.6L16.2 12.7C15.5 12.3 15 11.5 15 10.6V7C15 6.4 15.5 6 16 6C17 6 17.6 5.2 17.6 4.3C17.6 3.4 16.9 2.7 16 2.7H8C7.1 2.7 6.4 3.4 6.4 4.3C6.4 5.2 7 6 8 6C8.5 6 9 6.4 9 7V10.6Z" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  utensils: {
    size: 13.5,
    shiftX: 0,
    renderBody: (active = false) => `
      <path d="M20.2 14.8V3.2C17.4 3.2 15.4 5.3 15.4 8.2V13C15.4 14 16.2 14.8 17.2 14.8H20.2Z" fill="currentColor" fill-opacity="${active ? '0.40' : '0.24'}"/>
      <path d="M4.2 3.2V8.8C4.2 10.1 5.3 11.2 6.6 11.2H8.8C10.1 11.2 11.2 10.1 11.2 8.8V3.2" fill="currentColor" fill-opacity="0.16"/>
      <path d="M4.2 3.2V8.8C4.2 10.1 5.3 11.2 6.6 11.2H8.8C10.1 11.2 11.2 10.1 11.2 8.8V3.2M7.7 3.2V20.8M20.2 14.8V3.2C17.4 3.2 15.4 5.3 15.4 8.2V13C15.4 14 16.2 14.8 17.2 14.8H20.2ZM20.2 14.8V20.8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  archive: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <path d="M4.5 8.2H19.5V18.4C19.5 19.6 18.6 20.5 17.4 20.5H6.6C5.4 20.5 4.5 19.6 4.5 18.4V8.2Z" fill="currentColor" fill-opacity="0.20"/>
      <rect x="2.8" y="3.5" width="18.4" height="4.7" rx="1.4" fill="currentColor" fill-opacity="0.30" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
      <path d="M4.5 8.2V18.4C4.5 19.6 5.4 20.5 6.6 20.5H17.4C18.6 20.5 19.5 19.6 19.5 18.4V8.2M9.8 12.8H14.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  bell: {
    size: 13.5,
    shiftX: 0,
    renderBody: (active = true) => `
      <path d="M6.2 9.4C6.2 6.2 8.8 3.6 12 3.6C15.2 3.6 17.8 6.2 17.8 9.4C17.8 14.2 19.6 16.2 20.4 17H3.6C4.4 16.2 6.2 14.2 6.2 9.4Z" fill="currentColor" fill-opacity="${active ? '0.26' : '0.16'}"/>
      <path d="M6.2 9.4C6.2 6.2 8.8 3.6 12 3.6C15.2 3.6 17.8 6.2 17.8 9.4C17.8 14.2 19.6 16.2 20.4 17H3.6C4.4 16.2 6.2 14.2 6.2 9.4ZM10.1 20.4C10.6 21.1 11.3 21.5 12 21.5C12.7 21.5 13.4 21.1 13.9 20.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  bellOff: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <path d="M8.8 4.4C9.8 3.9 10.9 3.6 12 3.6C15.2 3.6 17.8 6.2 17.8 9.4C17.8 11.1 18.1 12.5 18.5 13.6M17 17H3.6C4.4 16.2 6.2 14.2 6.2 9.4C6.2 8.6 6.4 7.8 6.7 7.1M10.1 20.4C10.6 21.1 11.3 21.5 12 21.5C12.7 21.5 13.4 21.1 13.9 20.4M3 3L21 21" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  palette: {
    size: 14,
    shiftX: 0,
    renderBody: () => `
      <path d="M12 2.8C6.9 2.8 2.8 6.9 2.8 12C2.8 17.1 6.9 21.2 12 21.2C13 21.2 13.8 20.4 13.8 19.4C13.8 18.9 13.6 18.5 13.3 18.2C13 17.9 12.8 17.4 12.8 16.9C12.8 16 13.6 15.2 14.5 15.2H16.6C19.2 15.2 21.2 13.2 21.2 10.6C21.2 6.3 17.1 2.8 12 2.8Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="7.4" cy="11.2" r="1.15" fill="currentColor"/>
      <circle cx="9.8" cy="7.5" r="1.15" fill="currentColor"/>
      <circle cx="14.2" cy="7.2" r="1.15" fill="currentColor"/>
      <circle cx="17.2" cy="10.4" r="1.15" fill="currentColor"/>
    `,
  },
  chevUp: {
    size: 14,
    shiftX: 0,
    renderBody: () => `
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="currentColor" fill-opacity="0.20" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8.2 13.8L12 10L15.8 13.8" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  chevDown: {
    size: 14,
    shiftX: 0,
    renderBody: () => `
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="currentColor" fill-opacity="0.20" stroke="currentColor" stroke-width="1.8"/>
      <path d="M8.2 10.2L12 14L15.8 10.2" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  scissors: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <circle cx="6.2" cy="6.6" r="2.8" fill="currentColor" fill-opacity="0.24" stroke="currentColor" stroke-width="1.9"/>
      <circle cx="6.2" cy="17.4" r="2.8" fill="currentColor" fill-opacity="0.24" stroke="currentColor" stroke-width="1.9"/>
      <path d="M8.4 8.6L12 12M19.6 4.4L8.4 15.4M14.6 14.6L19.6 19.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  copy: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <rect x="8.2" y="8.2" width="12.4" height="12.4" rx="2.6" fill="currentColor" fill-opacity="0.24" stroke="currentColor" stroke-width="1.9"/>
      <path d="M5.4 15.8C4.3 15.8 3.4 14.9 3.4 13.8V5.4C3.4 4.3 4.3 3.4 5.4 3.4H13.8C14.9 3.4 15.8 4.3 15.8 5.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
    `,
  },
  clipboardPaste: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <rect x="4.2" y="4.5" width="13.6" height="16" rx="2.4" fill="currentColor" fill-opacity="0.20"/>
      <path d="M14.5 2.5H8.5C7.9 2.5 7.5 2.9 7.5 3.5V5.2C7.5 5.8 7.9 6.2 8.5 6.2H14.5C15.1 6.2 15.5 5.8 15.5 5.2V3.5C15.5 2.9 15.1 2.5 14.5 2.5Z" fill="currentColor" fill-opacity="0.34" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M7.5 4.5H6C4.9 4.5 4 5.4 4 6.5V18.5C4 19.6 4.9 20.5 6 20.5H16C17.1 20.5 18 19.6 18 18.5V17.4M15.5 4.5H16C17.1 4.5 18 5.4 18 6.5V8.6M11 13.5H20.5M17.6 10.6L20.5 13.5L17.6 16.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
    `,
  },
  textSelect: {
    size: 13.5,
    shiftX: 0,
    renderBody: () => `
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" fill="currentColor" fill-opacity="0.20"/>
      <path d="M5.5 3.5H4.5C3.9 3.5 3.5 3.9 3.5 4.5V5.5M18.5 3.5H19.5C20.1 3.5 20.5 3.9 20.5 4.5V5.5M20.5 18.5V19.5C20.5 20.1 20.1 20.5 19.5 20.5H18.5M5.5 20.5H4.5C3.9 20.5 3.5 20.1 3.5 19.5V18.5M7.5 8.5H16.5M7.5 12H16.5M7.5 15.5H13.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
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
