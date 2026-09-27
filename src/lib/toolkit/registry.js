import { TIMER_KINDS, TIMER_NAMES } from './preferences.js';
// Only implemented tools enter the registry. Future tools add metadata and a native role.
export const TIMER_TOOLS = Object.freeze(
  TIMER_KINDS.map((kind) => Object.freeze({ id: kind, label: TIMER_NAMES[kind] })),
);
// 점수판 버튼을 누르면 뜨는 드롭다운 항목. id는 창 이름(label)이며 Rust toolkit.rs의 SCOREBOARD_ROLES와 같습니다.
export const SCOREBOARD_TOOLS = Object.freeze([
  { id: 'scoreboard-personal', label: '개인 점수판', hint: '학급 명단으로 바로 시작' },
  { id: 'scoreboard-group', label: '모둠 점수판', hint: '모둠 수만 정하면 끝' },
  { id: 'scoreboard-custom', label: '커스텀 점수판', hint: '항목을 직접 입력해요' },
].map((tool) => Object.freeze(tool)));
export const TOOL_REGISTRY = Object.freeze([
  { id: 'timer', label: '타이머', entries: TIMER_TOOLS },
  // 시간을 다루는 도구끼리 모이도록 타이머 바로 오른쪽에 둡니다(툴바 순서는 이 배열을 따릅니다).
  { id: 'clock', label: '시계', entries: [] },
  { id: 'picker', label: '간단 뽑기', entries: [] },
  { id: 'noticeboard', label: '알림장', entries: [] },
  { id: 'tournament', label: '토너먼트', entries: [] },
  { id: 'focus-bell', label: '집중벨', entries: [] },
  { id: 'dice', label: '주사위', entries: [] },
  // 교실 운영 도구끼리 모이도록 주사위 다음에 둡니다. 점수판은 타이머처럼 드롭다운을 거칩니다.
  { id: 'scoreboard', label: '점수판', entries: SCOREBOARD_TOOLS },
  { id: 'thermometer', label: '학급 온도계', entries: [] },
  // 학급 운영 도구 끝(명단 바로 앞)에 둡니다. 드롭다운 없이 투표판 창을 바로 엽니다.
  { id: 'vote', label: '학급 투표', entries: [] },
  { id: 'seating', label: '자리 배치', entries: [] },
  { id: 'roster', label: '학급 명단', entries: [] },
]);

export const PLATFORM_TOOLS = Object.freeze([
  { id: 'rollinthunder', label: '롤린썬더', icon: '/images/toolkit/rollinthunder.png', url: 'https://www.rollinthunder.net/?utm_source=tidy_task&utm_medium=referral&utm_campaign=toolkit' },
  { id: 'clanner', label: '클래너', icon: '/images/toolkit/clanner.png', url: 'https://www.clanner.kr/?utm_source=tidy_task&utm_medium=referral&utm_campaign=toolkit' },
].map((tool) => Object.freeze(tool)));
