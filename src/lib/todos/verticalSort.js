import { tick } from 'svelte';
import { Accessibility, DragDropManager, Feedback, KeyboardSensor, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';
import { Sortable, SortableKeyboardPlugin, isSortable } from '@dnd-kit/dom/sortable';
import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
import { DOMRectangle, computeTranslate, prefersReducedMotion } from '@dnd-kit/dom/utilities';
import { moveTodoOrder, sameTodoOrder } from './order.js';

const transition = { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' };

/** 기본 드롭 효과의 가로 정렬·폭 보간을 빼고, 현재 세로 위치에서 목표 칸으로만 돌아옵니다.
 * @param {Parameters<import('@dnd-kit/dom').DropAnimationFunction>[0]} context */
async function verticalDrop({ feedbackElement, placeholder, element }) {
  const row = /** @type {HTMLElement} */ (feedbackElement);
  const target = placeholder ?? element;
  const current = row.getBoundingClientRect();
  const translate = computeTranslate(row, getComputedStyle(row).translate, false);
  // 주변 칸이 아직 애니메이션 중이어도 그 칸의 최종 배치 좌표에 착지합니다.
  const finalY = translate.y + new DOMRectangle(target, { ignoreTransforms: true }).top - current.top;
  const oldTranslate = row.style.translate;
  const oldTransition = row.style.transition;
  // 키보드로 움직이다 놓아도 진행 중인 효과의 현재 좌표에서 이어집니다.
  for (const animation of row.getAnimations()) {
    if (animation.effect instanceof KeyframeEffect && animation.effect.getKeyframes().some(key => 'translate' in key)) animation.cancel();
  }
  row.setAttribute('data-dnd-dropping', '');
  row.style.translate = `0px ${translate.y}px`;
  row.style.setProperty('transition', 'none', 'important');
  const animation = row.animate({ translate: [`0px ${translate.y}px`, `0px ${finalY}px`] }, {
    ...transition,
    duration: prefersReducedMotion(window) ? 0 : transition.duration,
    fill: 'forwards',
  });
  try { await animation.finished; }
  catch { /* 창이 닫히거나 다른 입력이 취소해도 엔진 정리 단계는 계속 진행합니다. */ }
  finally {
    animation.cancel();
    row.style.translate = oldTranslate;
    row.style.transition = oldTransition;
    row.removeAttribute('data-dnd-dropping');
    row.style.removeProperty('--todo-sort-width');
    row.style.removeProperty('--todo-sort-left');
  }
}

// 외부 취소도 센서의 정리 경로를 통과해야 이전 키 리스너·포인터·스크롤 잠금이 남지 않습니다.
class TodoPointerSensor extends PointerSensor {
  /** @param {Event} event */
  cancel(event) { this.handleCancel(event); }
}
class TodoKeyboardSensor extends KeyboardSensor {
  /** @param {Event} event */
  cancel(event) { this.handleEnd(event, true); }
}

/**
 * DOM 엔진은 좌표·충돌·스크롤·애니메이션을, Svelte는 임시 순서와 행 DOM을 맡습니다.
 * 왜: 엔진이 직접 DOM을 재배열하면 Svelte의 keyed 목록과 다음 추가·삭제 때 충돌할 수 있습니다.
 * @param {{getIds: () => string[], isDisabled: () => boolean,
 * onpreview: (ids: readonly string[] | null) => void,
 * oncommit: (initial: readonly string[], next: readonly string[]) => void}} options
 */
export function createVerticalTodoSort(options) {
  /** @type {DragDropManager | undefined} */
  let manager;
  /** @type {string[] | null} */
  let initial = null;
  /** @type {readonly string[]} */
  let order = [];
  let destroyed = false;
  /** @type {(() => void)[]} */
  const cleanup = [];
  /** @type {Map<string, Sortable>} */
  const rows = new Map();

  /** @param {readonly string[] | null} ids */
  function preview(ids) {
    // DOM이 바뀌기 전에 인덱스를 알려야 엔진이 이전 좌표를 잡아 FLIP 애니메이션을 만들 수 있습니다.
    (ids ?? options.getIds()).forEach((id, index) => {
      const row = rows.get(id);
      if (row) row.index = index;
    });
    options.onpreview(ids);
  }

  function cancel(event = new Event('todo-sort-cancel')) {
    if (!manager) return;
    const activator = manager.dragOperation.activatorEvent;
    manager.registry.sensors.get(TodoPointerSensor)?.cancel(event);
    manager.registry.sensors.get(TodoKeyboardSensor)?.cancel(event);
    if (activator instanceof PointerEvent && document.body.hasPointerCapture(activator.pointerId)) {
      document.body.releasePointerCapture(activator.pointerId);
    }
  }

  function ensureManager() {
    if (manager) return manager;
    manager = new DragDropManager({
      renderer: { get rendering() { return tick(); } },
      modifiers: [RestrictToVerticalAxis],
      sensors: [
        { plugin: TodoPointerSensor, options: {
            activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
          },
        },
        { plugin: TodoKeyboardSensor, options: {
            keyboardCodes: { ...KeyboardSensor.defaults.keyboardCodes, left: [], right: [] },
          },
        },
      ],
      // 기본 자동 스크롤·선택 방지·커서를 유지하고 시각 효과와 안내만 조정합니다.
      plugins: defaults => defaults.map(plugin => {
        if (plugin === Feedback) return Feedback.configure({
          dropAnimation: verticalDrop,
          keyboardTransition: transition,
        });
        if (plugin === Accessibility) return Accessibility.configure({
          screenReaderInstructions: { draggable: '스페이스 또는 Enter로 이동을 시작하고 위아래 방향키로 옮기세요. 다시 눌러 확정하거나 Escape로 취소합니다.' },
          announcements: {
            dragstart: () => '일정 이동을 시작했습니다.',
            dragover: (/** @type {import('@dnd-kit/dom').DragOverEvent} */ event) => isSortable(event.operation.source)
              ? `${event.operation.source.index + 1}번째 자리로 이동했습니다.` : undefined,
            dragend: (/** @type {import('@dnd-kit/dom').DragEndEvent} */ event) => event.canceled ? '이동을 취소했습니다.' : '일정 이동을 마쳤습니다.',
          },
        });
        return plugin;
      }),
    });
    const kit = manager;
    cleanup.push(
      kit.monitor.addEventListener('beforedragstart', event => {
        const ids = options.getIds();
        if (destroyed || options.isDisabled() || new Set(ids).size !== ids.length) event.preventDefault();
      }),
      kit.monitor.addEventListener('dragstart', event => {
        const element = /** @type {HTMLElement | undefined} */ (event.operation.source?.element);
        if (element) {
          const rect = element.getBoundingClientRect();
          // 스크롤바가 나타나거나 사라져도 잡은 행이 가로로 늘어나거나 줄바꿈되지 않게 합니다.
          element.style.setProperty('--todo-sort-width', `${rect.width}px`);
          element.style.setProperty('--todo-sort-left', `${rect.left}px`);
        }
        initial = options.getIds();
        order = [...initial];
        preview(order);
      }),
      kit.monitor.addEventListener('dragover', event => {
        const { source, target } = event.operation;
        if (!initial || !isSortable(source) || !isSortable(target)) return;
        const next = moveTodoOrder(order, String(source.id), String(target.id));
        if (next === order) return;
        // 한 프레임의 DOM 반영을 기다리는 동안만 충돌 판정을 멈춥니다.
        // 왜: 움직이는 행의 중간 좌표를 다시 판정하면 같은 두 자리를 왕복할 수 있습니다.
        kit.collisionObserver.disable();
        order = next;
        preview(order);
        void tick().then(async () => {
          if (!destroyed && kit.dragOperation.status.dragging) await kit.actions.setDropTarget(source.id);
          if (!destroyed) kit.collisionObserver.enable();
        });
      }),
      kit.monitor.addEventListener('dragend', event => {
        const original = initial;
        initial = null;
        if (!destroyed && original && !event.canceled && !options.isDisabled()) {
          options.oncommit(original, order);
        }
        if (!destroyed) preview(null);
        const element = /** @type {HTMLElement | undefined} */ (event.operation.source?.element);
        requestAnimationFrame(() => {
          // 움직이지 않고 놓은 경우에는 드롭 효과가 생략되므로 별도로 잠금 변수를 정리합니다.
          if (element && !element.hasAttribute('data-dnd-dragging')) {
            element.style.removeProperty('--todo-sort-width');
            element.style.removeProperty('--todo-sort-left');
          }
        });
      }),
    );

    const onVisibility = () => { if (document.hidden) cancel(); };
    const onLostCapture = (/** @type {PointerEvent} */ event) => {
      if (kit.dragOperation.status.dragging && !kit.dragOperation.controller?.signal.aborted) cancel(event);
    };
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (event.key === 'Escape' && !kit.dragOperation.status.idle) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('lostpointercapture', onLostCapture, true);
    document.addEventListener('keydown', onKey, true);
    cleanup.push(() => {
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('lostpointercapture', onLostCapture, true);
      document.removeEventListener('keydown', onKey, true);
    });
    return kit;
  }

  return {
    /** @param {HTMLElement} node @param {{id: string, index: number, disabled: boolean}} input */
    row(node, input) {
      const sortable = new Sortable({
        ...input,
        element: node,
        handle: node.querySelector('.todo-drag-handle') ?? undefined,
        transition,
        // 순서 변경은 Svelte가 맡고 검증된 키보드·좌표 이동은 그대로 사용합니다.
        plugins: [SortableKeyboardPlugin],
      }, ensureManager());
      rows.set(input.id, sortable);
      return {
        /** @param {{id: string, index: number, disabled: boolean}} value */
        update(value) {
          sortable.index = value.index;
          sortable.disabled = value.disabled;
        },
        destroy() {
          if (sortable.isDragSource) cancel();
          rows.delete(input.id);
          sortable.destroy();
        },
      };
    },
    sync() {
      // 이동 시작 전에도 읽어야 Svelte가 검색·입력 잠금·목록 변경을 구독합니다.
      const ids = options.getIds();
      const disabled = options.isDisabled();
      if (initial && (disabled || !sameTodoOrder(initial, ids))) cancel();
    },
    destroy() {
      cancel();
      destroyed = true;
      cleanup.forEach(unsubscribe => unsubscribe());
      manager?.destroy();
    },
  };
}
