import { TIMER_KINDS, TIMER_NAMES } from './preferences.js';
// Only implemented tools enter the registry. Future tools add metadata and a native role.
export const TIMER_TOOLS = Object.freeze(
  TIMER_KINDS.map((kind) => Object.freeze({ id: kind, label: TIMER_NAMES[kind] })),
);
export const TOOL_REGISTRY = Object.freeze([
  { id: 'timer', label: '타이머', entries: TIMER_TOOLS },
  // 시간을 다루는 도구끼리 모이도록 타이머 바로 오른쪽에 둡니다(툴바 순서는 이 배열을 따릅니다).
  { id: 'clock', label: '시계', entries: [] },
  { id: 'picker', label: '간단 뽑기', entries: [] },
  { id: 'noticeboard', label: '알림장', entries: [] },
  { id: 'tournament', label: '토너먼트', entries: [] },
  { id: 'focus-bell', label: '집중벨', entries: [] },
  { id: 'dice', label: '주사위', entries: [] },
  { id: 'roster', label: '학급 명단', entries: [] },
]);

export const PLATFORM_TOOLS = Object.freeze([
  { id: 'rollinthunder', label: '롤린썬더', icon: '/images/toolkit/rollinthunder.png', url: 'https://www.rollinthunder.net/?utm_source=tidy_task&utm_medium=referral&utm_campaign=toolkit' },
  { id: 'clanner', label: '클래너', icon: '/images/toolkit/clanner.png', url: 'https://www.clanner.kr/?utm_source=tidy_task&utm_medium=referral&utm_campaign=toolkit' },
].map((tool) => Object.freeze(tool)));
