// D-Day 컨트롤 패널 전용 세로 정렬 어댑터 (createVerticalSort 코어 + ddaySort 판별 규약)

import { createVerticalSort } from '../sort/createVerticalSort.js';
import { canStartDdaySort } from './ddaySort.js';

/**
 * @param {{
 *   getIds: () => string[],
 *   isDisabled: () => boolean,
 *   onpreview: (ids: readonly string[] | null) => void,
 *   oncommit: (initial: readonly string[], next: readonly string[]) => void,
 *   onpointerdragstart?: (element: HTMLElement | undefined) => void,
 *   getScrollContainer?: () => HTMLElement | null,
 * }} options
 */
export function createVerticalDdaySort(options) {
  return createVerticalSort({
    getIds: options.getIds,
    isDisabled: options.isDisabled,
    canStartPointerSort: canStartDdaySort,
    onpreview: options.onpreview,
    oncommit: options.oncommit,
    onpointerdragstart: options.onpointerdragstart,
    getBoundsElement: options.getScrollContainer,
    handleSelector: '.dd-kbd-handle',
    widthVar: '--dd-sort-width',
    leftVar: '--dd-sort-left',
    screenReaderInstructions:
      '스페이스 또는 Enter로 D-Day 이동을 시작하고 위아래 방향키로 순서를 바꾼 뒤 다시 눌러 확정하거나 Escape로 취소합니다.',
    announcements: {
      dragstart: () => 'D-Day 이동을 시작했습니다.',
      dragover: (index) => `${index + 1}번째 자리로 이동했습니다.`,
      dragend: (canceled) => (canceled ? 'D-Day 이동을 취소했습니다.' : 'D-Day 이동을 마쳤습니다.'),
    },
  });
}
