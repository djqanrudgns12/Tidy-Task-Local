import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * data-tauri-drag-region 을 대체하는 Svelte 액션.
 *
 * 왜 직접 만들었는가 (버그의 근본 원인):
 *   Tauri가 웹뷰에 주입하는 drag.js 는 data-tauri-drag-region 이 붙은 요소에서
 *   더블클릭의 "두 번째 mousedown"(e.detail === 2)을 감지하면 곧바로
 *   plugin:window|internal_toggle_maximize — 즉 네이티브 "최대화"를 호출합니다.
 *
 *     const cmd = e.detail === 2 ? 'internal_toggle_maximize' : 'start_dragging'
 *
 *   그런데 우리 타이틀바는 같은 더블클릭에 ondblclick 으로 "전체화면"을 토글합니다.
 *   결국 한 번의 더블클릭에 두 개의 창 전환이 동시에 실행되어
 *     · 전체화면이 됐다가 최대화 처리에 밀려 되돌아오거나
 *     · 어중간하게 커진 크기로 남거나
 *     · 그 크기가 "정상 크기"로 저장되어 다음 실행 때까지 이어지는
 *   경합(race)이 발생했습니다.
 *
 * 이 액션은 drag.js 의 검증된 로직을 그대로 따르되(왼쪽 버튼 + e.detail === 1 → startDragging),
 * 자동 최대화 경로 하나만 제거합니다. 더블클릭 처리는 onDoubleClick 한 곳이 단독으로 담당합니다.
 *
 * @param {HTMLElement} node
 * @param {{ onDoubleClick?: ((e: MouseEvent) => unknown) | null }} params
 */

// 드래그를 시작하면 안 되는 요소들 (버튼·입력창 등은 자기 동작이 우선입니다)
const INTERACTIVE_SELECTOR =
  'button, input, textarea, select, a, [contenteditable="true"], [data-no-drag]';

export function dragRegion(node, params = {}) {
  let onDoubleClick = params.onDoubleClick ?? null;

  function isInteractive(target) {
    return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
  }

  function handleMouseDown(e) {
    // 왼쪽 버튼만 창을 끕니다.
    if (e.button !== 0) return;
    if (isInteractive(e.target)) return;

    // 드래그 중 텍스트 커서/선택이 생기는 것을 막습니다 (drag.js 와 동일한 처리).
    e.preventDefault();

    // 🚫 두 번째 클릭에서는 아무것도 하지 않습니다.
    //    여기서 창을 건드리지 않아야, 뒤이어 오는 dblclick 이 유일한 상태 전환이 됩니다.
    if (e.detail >= 2) return;

    getCurrentWindow()
      .startDragging()
      .catch((err) => console.warn('창 드래그 시작 실패:', err));
  }

  function handleDoubleClick(e) {
    if (isInteractive(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (onDoubleClick) onDoubleClick(e);
  }

  node.addEventListener('mousedown', handleMouseDown);
  node.addEventListener('dblclick', handleDoubleClick);

  return {
    update(next = {}) {
      onDoubleClick = next.onDoubleClick ?? null;
    },
    destroy() {
      node.removeEventListener('mousedown', handleMouseDown);
      node.removeEventListener('dblclick', handleDoubleClick);
    },
  };
}
