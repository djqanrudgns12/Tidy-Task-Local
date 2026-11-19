// 옵션 주입형 공용 세로 드래그 정렬 코어 (@dnd-kit/dom@0.5.0 기반)
// 특징:
//   - RestrictToVerticalAxis + 선택적 스크롤 경계 Y 클램프(Top-Layer 이탈 방어)
//   - 'showPopover' 런타임 피처 가드(구형 Chromium < 114 안전 폴백)
//   - 180ms cubic-bezier(0.2, 0, 0, 1) WAAPI 착지 및 주변 행 FLIP
//   - 창 캡처 클릭 가드 + dropping 포함 Esc 취소 + 외부 변경 sync() 취소

import { tick } from 'svelte';
import { Accessibility, DragDropManager, Feedback, KeyboardSensor, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';
import { Sortable, SortableKeyboardPlugin, isSortable } from '@dnd-kit/dom/sortable';
import { Modifier, configurator } from '@dnd-kit/abstract';
import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
import { DOMRectangle, computeTranslate, prefersReducedMotion } from '@dnd-kit/dom/utilities';
import { moveTodoOrder, sameTodoOrder } from '../todos/order.js';
import { createClickGuard, sortActivationFor } from '../todos/rowGestures.js';

const DEFAULT_TRANSITION = { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' };

class SortPointerSensor extends PointerSensor {
  /** @param {Event} event */
  cancel(event) {
    this.handleCancel(event);
  }
}

class SortKeyboardSensor extends KeyboardSensor {
  /** @param {Event} event */
  cancel(event) {
    this.handleEnd(event, true);
  }
}

/**
 * Top-Layer(popover) 드래그 중인 카드가 지정된 스크롤 영역(.ctrl-scroll 등) 밖 헤더·푸터를
 * 덮거나 창 밖으로 빠져나가지 않도록 세로 좌표를 경계 내로 제한합니다.
 */
class VerticalBoundsModifierBase extends Modifier {
  /** @param {any} operation */
  apply({ shape, transform }) {
    const getBoundsElement = this.options?.getBoundsElement;
    if (typeof getBoundsElement !== 'function' || !shape) return transform;
    const boundsEl = getBoundsElement();
    if (!boundsEl || typeof boundsEl.getBoundingClientRect !== 'function') return transform;

    const bounds = boundsEl.getBoundingClientRect();
    const initRect = shape.initial?.boundingRectangle;
    const curRect = shape.current?.boundingRectangle;
    if (!initRect || bounds.height <= 0) return transform;

    const itemH = curRect?.height ?? initRect.height;
    const initTop = initRect.top;
    const minY = bounds.top - initTop;
    const maxY = bounds.bottom - (initTop + itemH);
    if (maxY < minY) {
      return { ...transform, y: Math.max(minY, transform.y) };
    }
    const clampedY = Math.max(minY, Math.min(maxY, transform.y));
    return clampedY === transform.y ? transform : { ...transform, y: clampedY };
  }
}

const RestrictToVerticalBounds = configurator(VerticalBoundsModifierBase);

/** @param {PointerEvent} event */
function pointerConstraints(event) {
  const rule = sortActivationFor(event.pointerType);
  if (rule.kind === 'delay') {
    return [new PointerActivationConstraints.Delay({ value: rule.ms, tolerance: rule.tolerance })];
  }
  return [new PointerActivationConstraints.Distance({ value: /** @type {any} */ ({ y: rule.y }) })];
}

/**
 * @param {{
 *   getIds: () => string[],
 *   isDisabled: () => boolean,
 *   canStartPointerSort: (target: unknown, rowEl: HTMLElement) => boolean,
 *   onpreview: (ids: readonly string[] | null) => void,
 *   oncommit: (initial: readonly string[], next: readonly string[]) => void,
 *   onpointerdragstart?: (element: HTMLElement | undefined) => void,
 *   getBoundsElement?: () => HTMLElement | null,
 *   handleSelector?: string,
 *   widthVar?: string,
 *   leftVar?: string,
 *   screenReaderInstructions?: string,
 *   announcements?: {
 *     dragstart?: () => string,
 *     dragover?: (index: number) => string,
 *     dragend?: (canceled: boolean) => string,
 *   },
 * }} options
 */
export function createVerticalSort(options) {
  const handleSelector = options.handleSelector ?? '.dd-kbd-handle';
  const widthVar = options.widthVar ?? '--dd-sort-width';
  const leftVar = options.leftVar ?? '--dd-sort-left';
  // WebView2(Chromium < 114) 등 popover Top-Layer 미지원 환경에서는 포인터 드래그를 꺼서 좌표 붕괴를 막습니다.
  const supportsTopLayerPopover =
    typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

  /** @type {DragDropManager | undefined} */
  let manager;
  /** @type {string[] | null} */
  let initial = null;
  /** @type {readonly string[]} */
  let order = [];
  let destroyed = false;
  let droppingCount = 0;
  let touchOrPenHeld = false;
  /** @type {Set<Animation>} */
  const activeDropAnimations = new Set();
  /** @type {(() => void)[]} */
  const cleanup = [];
  /** @type {Map<string, Sortable>} */
  const rows = new Map();

  const clickGuard = createClickGuard({
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle),
  });

  /** @param {Parameters<import('@dnd-kit/dom').DropAnimationFunction>[0]} context */
  async function verticalDrop({ feedbackElement, placeholder, element }) {
    const row = /** @type {HTMLElement} */ (feedbackElement);
    const target = placeholder ?? element;
    const current = row.getBoundingClientRect();
    const translate = computeTranslate(row, getComputedStyle(row).translate, false);
    const finalY = translate.y + new DOMRectangle(target, { ignoreTransforms: true }).top - current.top;
    const oldTranslate = row.style.translate;
    const oldTransition = row.style.transition;

    for (const animation of row.getAnimations()) {
      if (animation.effect instanceof KeyframeEffect && animation.effect.getKeyframes().some((k) => 'translate' in k)) {
        animation.cancel();
      }
    }

    droppingCount += 1;
    row.setAttribute('data-dnd-dropping', '');
    row.style.translate = `0px ${translate.y}px`;
    row.style.setProperty('transition', 'none', 'important');
    const animation = row.animate(
      { translate: [`0px ${translate.y}px`, `0px ${finalY}px`] },
      {
        ...DEFAULT_TRANSITION,
        duration: prefersReducedMotion(window) ? 0 : DEFAULT_TRANSITION.duration,
        fill: 'forwards',
      },
    );
    activeDropAnimations.add(animation);
    try {
      await animation.finished;
    } catch {
      // Esc/숨김/파괴 시에도 정리 단계를 반드시 실행합니다.
    } finally {
      activeDropAnimations.delete(animation);
      droppingCount = Math.max(0, droppingCount - 1);
      animation.cancel();
      row.style.translate = oldTranslate;
      row.style.transition = oldTransition;
      row.removeAttribute('data-dnd-dropping');
      row.style.removeProperty(widthVar);
      row.style.removeProperty(leftVar);
    }
  }

  /** @param {readonly string[] | null} ids */
  function preview(ids) {
    (ids ?? options.getIds()).forEach((id, index) => {
      const row = rows.get(id);
      if (row) row.index = index;
    });
    options.onpreview(ids);
  }

  /** @param {Event} [event] */
  function cancel(event = new Event('vertical-sort-cancel')) {
    touchOrPenHeld = false;
    for (const anim of activeDropAnimations) {
      try { anim.cancel(); } catch {}
    }
    if (!manager) return;
    const activator = manager.dragOperation.activatorEvent;
    manager.registry.sensors.get(SortPointerSensor)?.cancel(event);
    manager.registry.sensors.get(SortKeyboardSensor)?.cancel(event);
    if (
      typeof PointerEvent !== 'undefined' &&
      activator instanceof PointerEvent &&
      document.body.hasPointerCapture(activator.pointerId)
    ) {
      document.body.releasePointerCapture(activator.pointerId);
    }
  }

  function isActive() {
    const dragging = Boolean(manager && !manager.dragOperation.status.idle);
    return dragging || droppingCount > 0;
  }

  function ensureManager() {
    if (manager) return manager;

    const modifiers = options.getBoundsElement
      ? [RestrictToVerticalAxis, RestrictToVerticalBounds({ getBoundsElement: options.getBoundsElement })]
      : [RestrictToVerticalAxis];

    /** @type {any[]} */
    const sensors = [
      {
        plugin: SortKeyboardSensor,
        options: {
          keyboardCodes: { ...KeyboardSensor.defaults.keyboardCodes, left: [], right: [] },
        },
      },
    ];

    if (supportsTopLayerPopover) {
      sensors.unshift({
        plugin: SortPointerSensor,
        options: {
          activatorElements: (/** @type {any} */ source) => [source.element],
          preventActivation: (/** @type {PointerEvent} */ event, /** @type {any} */ source) =>
            !options.canStartPointerSort(event.target, source.element),
          activationConstraints: pointerConstraints,
        },
      });
    }

    manager = new DragDropManager({
      renderer: { get rendering() { return tick(); } },
      modifiers,
      sensors,
      plugins: (defaults) =>
        defaults.map((plugin) => {
          if (plugin === Feedback) {
            return Feedback.configure({
              dropAnimation: verticalDrop,
              keyboardTransition: DEFAULT_TRANSITION,
            });
          }
          if (plugin === Accessibility) {
            return Accessibility.configure({
              screenReaderInstructions: {
                draggable:
                  options.screenReaderInstructions ??
                  '스페이스 또는 Enter로 이동을 시작하고 위아래 방향키로 옮기세요. 다시 눌러 확정하거나 Escape로 취소합니다.',
              },
              announcements: {
                dragstart: () => options.announcements?.dragstart?.() ?? '이동을 시작했습니다.',
                dragover: (/** @type {import('@dnd-kit/dom').DragOverEvent} */ event) =>
                  isSortable(event.operation.source)
                    ? (options.announcements?.dragover?.(event.operation.source.index) ??
                      `${event.operation.source.index + 1}번째 자리로 이동했습니다.`)
                    : undefined,
                dragend: (/** @type {import('@dnd-kit/dom').DragEndEvent} */ event) =>
                  options.announcements?.dragend?.(Boolean(event.canceled)) ??
                  (event.canceled ? '이동을 취소했습니다.' : '이동을 마쳤습니다.'),
              },
            });
          }
          return plugin;
        }),
    });

    const kit = manager;
    cleanup.push(
      kit.monitor.addEventListener('beforedragstart', (event) => {
        const ids = options.getIds();
        if (destroyed || options.isDisabled() || ids.length < 2 || new Set(ids).size !== ids.length) {
          event.preventDefault();
        }
      }),
      kit.monitor.addEventListener('dragstart', (event) => {
        const element = /** @type {HTMLElement | undefined} */ (event.operation.source?.element);
        if (element) {
          const rect = element.getBoundingClientRect();
          element.style.setProperty(widthVar, `${rect.width}px`);
          element.style.setProperty(leftVar, `${rect.left}px`);
        }
        initial = options.getIds();
        order = [...initial];
        preview(order);
        if (kit.dragOperation.activatorEvent instanceof PointerEvent) {
          clickGuard.arm();
          options.onpointerdragstart?.(element);
        }
      }),
      kit.monitor.addEventListener('dragover', (event) => {
        const { source, target } = event.operation;
        if (!initial || !isSortable(source) || !isSortable(target)) return;
        const next = moveTodoOrder(order, String(source.id), String(target.id));
        if (next === order) return;
        kit.collisionObserver.disable();
        order = next;
        preview(order);
        void tick().then(async () => {
          if (!destroyed && kit.dragOperation.status.dragging) await kit.actions.setDropTarget(source.id);
          if (!destroyed) kit.collisionObserver.enable();
        });
      }),
      kit.monitor.addEventListener('dragend', (event) => {
        const original = initial;
        initial = null;
        if (!destroyed && original && !event.canceled && !options.isDisabled()) {
          options.oncommit(original, order);
        }
        if (!destroyed) preview(null);
        const element = /** @type {HTMLElement | undefined} */ (event.operation.source?.element);
        requestAnimationFrame(() => {
          if (element && !element.hasAttribute('data-dnd-dragging') && !element.hasAttribute('data-dnd-dropping')) {
            element.style.removeProperty(widthVar);
            element.style.removeProperty(leftVar);
          }
        });
      }),
    );

    const onVisibility = () => {
      if (document.hidden) cancel();
    };
    const onLostCapture = (/** @type {PointerEvent} */ event) => {
      if (kit.dragOperation.status.dragging && !kit.dragOperation.controller?.signal.aborted) cancel(event);
    };
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (event.key === 'Escape' && isActive()) {
        event.preventDefault();
        event.stopPropagation();
        cancel(event);
      }
    };

    const guardDown = (/** @type {PointerEvent} */ event) => {
      if (!event.isPrimary) return;
      if (event.pointerType === 'mouse' && event.button === 2) {
        if (!isActive()) {
          clickGuard.onPointerDown();
          clickGuard.onPointerEnd();
        }
        return;
      }
      if (event.button === 0) {
        clickGuard.onPointerDown();
        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          touchOrPenHeld = true;
        }
      }
    };
    const guardEnd = (/** @type {PointerEvent} */ event) => {
      if (!event.isPrimary) return;
      touchOrPenHeld = false;
      if (event.button === 0 || clickGuard.held) {
        clickGuard.onPointerEnd();
      }
    };
    const guardKey = () => clickGuard.onKeyDown();
    const guardClick = (/** @type {MouseEvent} */ event) => {
      if (!clickGuard.takeClick()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener('pointerdown', guardDown, true);
    window.addEventListener('pointerup', guardEnd, true);
    window.addEventListener('pointercancel', guardEnd, true);
    window.addEventListener('keydown', guardKey, true);
    window.addEventListener('click', guardClick, true);

    window.addEventListener('blur', cancel);
    window.addEventListener('resize', cancel);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('lostpointercapture', onLostCapture, true);
    document.addEventListener('keydown', onKey, true);

    cleanup.push(() => {
      window.removeEventListener('pointerdown', guardDown, true);
      window.removeEventListener('pointerup', guardEnd, true);
      window.removeEventListener('pointercancel', guardEnd, true);
      window.removeEventListener('keydown', guardKey, true);
      window.removeEventListener('click', guardClick, true);
      clickGuard.destroy();
      touchOrPenHeld = false;
      window.removeEventListener('blur', cancel);
      window.removeEventListener('resize', cancel);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('lostpointercapture', onLostCapture, true);
      document.removeEventListener('keydown', onKey, true);
    });

    return kit;
  }

  return {
    /** @param {HTMLElement} node @param {{ id: string, index: number, disabled: boolean }} input */
    row(node, input) {
      const handleEl = /** @type {HTMLElement | null} */ (node.querySelector(handleSelector));
      const sortable = new Sortable(
        {
          ...input,
          element: node,
          handle: handleEl ?? undefined,
          transition: DEFAULT_TRANSITION,
          plugins: [SortableKeyboardPlugin],
        },
        ensureManager(),
      );
      rows.set(input.id, sortable);
      return {
        /** @param {{ id: string, index: number, disabled: boolean }} value */
        update(value) {
          sortable.index = value.index;
          sortable.disabled = value.disabled;
          const nextHandle = /** @type {HTMLElement | null} */ (node.querySelector(handleSelector));
          if (nextHandle && sortable.handle !== nextHandle) {
            sortable.handle = nextHandle;
          }
        },
        destroy() {
          if (sortable.isDragSource) cancel();
          rows.delete(input.id);
          sortable.destroy();
        },
      };
    },
    sync() {
      const ids = options.getIds();
      const disabled = options.isDisabled();
      if (initial && (disabled || !sameTodoOrder(initial, ids))) cancel();
    },
    cancel,
    isActive,
    isPointerHeld() {
      return clickGuard.held;
    },
    isPointerGuardActive() {
      return isActive() || clickGuard.armed || touchOrPenHeld;
    },
    get supportsPointerSort() {
      return supportsTopLayerPopover;
    },
    destroy() {
      cancel();
      destroyed = true;
      cleanup.forEach((unsubscribe) => unsubscribe());
      manager?.destroy();
    },
  };
}
