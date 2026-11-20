// 툴킷 설정 창 "보이는 도구" 목록의 줄(이름 · 한 줄 설명).
// 왜 Svelte 파일에서 꺼냈는가: 6.0.0에서 툴바 도구 목록(TOOL_IDS)에 'dday'를 넣으면서 이 표만 빠뜨려
//   설정 창이 그리다 멈췄습니다(빈 투명 창이 화면 가운데 남아 툴바 클릭·이동까지 막음).
//   순수 모듈로 두어 `settingsRows.test.js`가 "모든 도구에 줄이 있다"를 확인하게 합니다.
import { TOOL_REGISTRY } from './registry.js';

/** @typedef {{ id: string, title: string, hint: string }} ToolRow */

/** @type {readonly ToolRow[]} */
export const TOOL_ROWS = Object.freeze([
  { id: 'timer', title: '타이머', hint: '수업 시간을 한눈에 확인해요' },
  { id: 'clock', title: '시계', hint: '지금 몇 시인지 표준시로 크게 보여줘요' },
  { id: 'picker', title: '간단 뽑기', hint: '한 명 뽑기 · 모둠원 뽑기' },
  { id: 'noticeboard', title: '알림장', hint: '작성하고 화이트보드로 보여줘요' },
  { id: 'tournament', title: '토너먼트', hint: '대진을 만들고 우리 반 우승자를 정해요' },
  { id: 'focus-bell', title: '집중벨', hint: '소리와 애니메이션으로 시선을 모아요' },
  { id: 'dice', title: '주사위', hint: '1~3개를 던지고 합계를 크게 보여줘요' },
  { id: 'scoreboard', title: '점수판', hint: '개인 · 모둠 · 커스텀 점수를 크게 보여줘요' },
  { id: 'thermometer', title: '학급 온도계', hint: '우리 반 공동 목표를 온도로 보여줘요' },
  { id: 'dday', title: 'D-Day 위젯', hint: '다가오는 날까지 남은 날을 띄워 둬요' },
  { id: 'vote', title: '학급 투표', hint: '키보드로 비밀 투표하고 두근두근 개표해요' },
  { id: 'seating', title: '자리 배치', hint: '교실 자리를 고르고 배치해요' },
  { id: 'roster', title: '학급 명단', hint: '학생과 모둠을 함께 관리해요' },
].map((row) => Object.freeze(row)));

const ROWS_BY_ID = new Map(TOOL_ROWS.map((row) => [row.id, row]));
const LABELS_BY_ID = new Map(TOOL_REGISTRY.map((tool) => [tool.id, tool.label]));

/** 도구 id의 설정 줄. 표에 없는 도구가 생겨도 설정 창이 멈추지 않도록 도구 이름(없으면 id)으로 대신 그립니다.
 * @param {string} id @returns {ToolRow} */
export function settingsRowFor(id) {
  return ROWS_BY_ID.get(id) ?? { id, title: LABELS_BY_ID.get(id) ?? id, hint: '' };
}
