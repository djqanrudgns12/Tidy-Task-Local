// 할 일·메모·Tiny Note 공용 리치텍스트 서식 엔진
// 왜 분리하는가: MainToolbar·FloatingRTE·우클릭 컨텍스트 메뉴가 동일한 서식 규칙(중첩 span 정리,
//   40pt 상한, 형광펜 초기화, 링크 보존, DOMPurify 화이트리스트 준수)을 공유해야 하며,
//   독립 창(ctx-menu)이 OS 포커스를 가진 상태에서도 메인 창의 Range에 직접 서식을 적용할 수 있어야 합니다.

import { daysUntil, parseDeadline } from '../dateUtils.js';
import { STABLE_MAX_PT } from '../fontSize.js';

/**
 * 글자 크기(pt)를 0.5pt 단위로 반올림하고 [1, maxPt] 범위로 보정합니다.
 * @param {unknown} raw
 * @param {number} [maxPt]
 * @returns {number | null}
 */
export function normalizeFontSizePt(raw, maxPt = STABLE_MAX_PT) {
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num * 2) / 2;
  const cap = Number.isFinite(maxPt) ? maxPt : Infinity;
  return Math.max(1, Math.min(cap, rounded));
}

/**
 * 마감일 남은 일수에 따라 5단계 상태 톤을 계산합니다(TodoList.svelte와 동일 기준).
 * @param {string | null | undefined} deadline
 * @param {Date} [now]
 * @returns {'none' | 'overdue' | 'today' | 'soon' | 'week' | 'later'}
 */
export function resolveDeadlineTone(deadline, now = new Date()) {
  if (!deadline) return 'none';
  const diff = daysUntil(deadline, now);
  if (Number.isNaN(diff)) return 'none';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'soon';
  if (diff <= 7) return 'week';
  return 'later';
}

/**
 * 파스텔 리본 헤더용 초소형 마감일 칩 라벨을 만듭니다('오늘' 또는 'MM.DD').
 * @param {string | null | undefined} deadline
 * @param {Date} [now]
 * @returns {string}
 */
export function formatDeadlineChip(deadline, now = new Date()) {
  if (!deadline) return '';
  const diff = daysUntil(deadline, now);
  if (Number.isNaN(diff)) return '';
  if (diff === 0) return '오늘';
  const parsed = parseDeadline(deadline);
  if (!parsed) return '';
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

/**
 * CSS computed color(rgb/rgba/hex)를 팔레트 비교용 소문자 #rrggbb로 정규화합니다.
 * 투명 색상은 빈 문자열을 반환합니다.
 * @param {string | null | undefined} color
 * @returns {string}
 */
export function cssColorToHex(color) {
  if (!color || typeof color !== 'string') return '';
  const trimmed = color.trim().toLowerCase();
  if (!trimmed || trimmed === 'transparent') return '';
  if (trimmed.startsWith('#')) {
    if (trimmed.length === 4) {
      const r = trimmed[1], g = trimmed[2], b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    if (trimmed.length === 7) return trimmed;
    return trimmed;
  }
  const match = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*[,/]\s*([0-9.]+))?\s*\)$/);
  if (!match) return '';
  const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
  if (alpha === 0) return '';
  const toHex = (/** @type {string} */ n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

/**
 * computed fontFamily 문자열에서 앱 폰트 목록의 표시 이름을 찾습니다.
 * @param {string | null | undefined} rawFontFamily
 * @param {Array<{ name: string, family: string }>} [allFonts]
 * @returns {string}
 */
export function matchFontName(rawFontFamily, allFonts = []) {
  if (!rawFontFamily) return '';
  const cleanRaw = String(rawFontFamily).replace(/["']/g, '');
  const families = cleanRaw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const primary = families[0] || '';
  if (!primary) return '';

  const lowerFamilies = families.map((f) => f.toLowerCase());
  const primaryLower = primary.toLowerCase();

  // 1순위: 첫 번째 폰트 패밀리 또는 이름과 정확히 일치하는 항목
  // 왜: 부분 문자열 비교만 하면 "리디바탕"이 목록 앞쪽의 "바탕"에, "새굴림"이 "굴림"에 잘못 매칭됩니다.
  const exact = allFonts.find((font) => {
    const base = String(font.family || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    const name = String(font.name || '').trim().toLowerCase();
    return primaryLower === base || primaryLower === name;
  });
  if (exact) return exact.name;

  // 2순위: 보조 패밀리 목록 중 정확히 일치하는 항목
  const secondaryExact = allFonts.find((font) => {
    const base = String(font.family || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    const name = String(font.name || '').trim().toLowerCase();
    return (base && lowerFamilies.includes(base)) || (name && lowerFamilies.includes(name));
  });
  if (secondaryExact) return secondaryExact.name;

  // 3순위: 가장 긴 이름/패밀리가 포함되는 폴백 매칭
  let best = null;
  let bestLen = 0;
  const lowerRaw = cleanRaw.toLowerCase();
  for (const font of allFonts) {
    const base = String(font.family || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    const name = String(font.name || '').trim().toLowerCase();
    if (base && lowerRaw.includes(base) && base.length > bestLen) {
      best = font;
      bestLen = base.length;
    }
    if (name && lowerRaw.includes(name) && name.length > bestLen) {
      best = font;
      bestLen = name.length;
    }
  }
  return best ? best.name : primary;
}

/**
 * 모니터 작업영역 안에 독립 팝업 창이 절대 잘리지 않도록 물리 좌표를 보정합니다.
 * @param {{
 *   anchorX: number,
 *   anchorY: number,
 *   width: number,
 *   height: number,
 *   scale: number,
 *   work?: { x: number, y: number, width: number, height: number } | null
 * }} params
 * @returns {{ left: number, top: number }}
 */
export function computeMenuBounds({ anchorX, anchorY, width, height, scale, work }) {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (!work) {
    return { left: Math.round(anchorX), top: Math.round(anchorY) };
  }
  const physW = width * safeScale;
  const physH = height * safeScale;
  const maxLeft = work.x + Math.max(0, work.width - physW);
  const maxTop = work.y + Math.max(0, work.height - physH);
  const left = Math.max(work.x, Math.min(anchorX, maxLeft));
  const top = Math.max(work.y, Math.min(anchorY, maxTop));
  return { left: Math.round(left), top: Math.round(top) };
}

/**
 * camelCase CSS 키를 kebab-case로 바꿉니다.
 * @param {string} key
 */
function toKebab(key) {
  return key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Range의 시작 노드를 실제 스타일이 걸린 가장 안쪽 요소로 drill-down 합니다.
 * 왜: selectNode(wrapper)로 선택된 경우 startContainer가 부모가 되어 방금 적용한 스타일 대신
 *     부모 스타일을 잘못 읽는 문제를 막기 위함입니다.
 * @param {Range} range
 * @returns {Element | null}
 */
function resolveAnchorElement(range) {
  /** @type {Node | null} */
  let node = range.startContainer;
  if (!range.collapsed && node instanceof Element) {
    node = node.childNodes[range.startOffset] || node;
    while (node && node.firstChild) node = node.firstChild;
  } else if (range.collapsed && node instanceof Element && range.startOffset > 0) {
    let prev = node.childNodes[range.startOffset - 1];
    while (prev && prev.lastChild) prev = prev.lastChild;
    node = prev || node;
  }
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  return node instanceof Element ? node : null;
}

/**
 * Range와 교차하는 텍스트 노드들의 부모 Element 목록을 수집합니다.
 * @param {Range} range
 * @returns {Element[]}
 */
function collectElementsInRange(range) {
  if (range.collapsed) {
    const el = resolveAnchorElement(range);
    return el ? [el] : [];
  }
  /** @type {Set<Element>} */
  const elements = new Set();
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.parentElement) elements.add(root.parentElement);
    return [...elements];
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent || node.textContent.length === 0) return NodeFilter.FILTER_REJECT;
      try {
        return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      } catch {
        return NodeFilter.FILTER_REJECT;
      }
    },
  });
  let current = walker.nextNode();
  while (current) {
    if (current.parentElement) elements.add(current.parentElement);
    current = walker.nextNode();
  }
  if (elements.size === 0) {
    const fallbackEl = resolveAnchorElement(range);
    if (fallbackEl) elements.add(fallbackEl);
  }
  return [...elements];
}

/**
 * @typedef {{
 *   fontFamily: string,
 *   fontSize: number | null,
 *   isBold: boolean,
 *   isItalic: boolean,
 *   isUnderline: boolean,
 *   textColor: string,
 *   bgColor: string,
 *   isMixedFont: boolean,
 *   isMixedSize: boolean,
 * }} SelectionFormat
 */

/**
 * 현재 Range의 서식 상태를 읽습니다(혼합 글꼴·혼합 크기 포함).
 * @param {Range | null} range
 * @param {Array<{ name: string, family: string }>} [allFonts]
 * @param {{ fontFamily?: string, fontSize?: number }} [defaults]
 * @returns {SelectionFormat}
 */
export function readSelectionFormat(range, allFonts = [], defaults = {}) {
  const empty = {
    fontFamily: defaults.fontFamily || '',
    fontSize: defaults.fontSize ?? 10,
    isBold: false,
    isItalic: false,
    isUnderline: false,
    textColor: '',
    bgColor: '',
    isMixedFont: false,
    isMixedSize: false,
  };
  if (!range || typeof window === 'undefined') return empty;
  const elements = collectElementsInRange(range);
  if (elements.length === 0) return empty;

  /** @type {Set<string>} */ const fonts = new Set();
  /** @type {Set<number>} */ const sizes = new Set();
  let allBold = true;
  let allItalic = true;
  let allUnderline = true;
  let firstColor = '';
  let firstBg = '';

  for (const el of elements) {
    const style = window.getComputedStyle(el);
    const weightNum = parseInt(style.fontWeight, 10);
    const bold = style.fontWeight === 'bold' || (Number.isFinite(weightNum) && weightNum >= 600);
    const italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
    const deco = `${style.textDecorationLine || ''} ${style.textDecoration || ''}`;
    const underline = deco.includes('underline');

    if (!bold) allBold = false;
    if (!italic) allItalic = false;
    if (!underline) allUnderline = false;

    const matchedFont = matchFontName(style.fontFamily, allFonts);
    if (matchedFont) fonts.add(matchedFont);

    const fsPx = parseFloat(style.fontSize);
    if (Number.isFinite(fsPx)) {
      const pt = Math.round(fsPx * 0.75 * 2) / 2;
      sizes.add(pt);
    }

    if (!firstColor) firstColor = cssColorToHex(style.color);
    if (!firstBg) {
      // 배경색은 가장 가까운 인라인 형광펜 요소까지 올라가며 확인
      let cur = /** @type {Element | null} */ (el);
      while (cur && !cur.hasAttribute('contenteditable')) {
        const bg = cssColorToHex(window.getComputedStyle(cur).backgroundColor);
        if (bg) { firstBg = bg; break; }
        cur = cur.parentElement;
      }
    }
  }

  const isMixedFont = fonts.size > 1;
  const isMixedSize = sizes.size > 1;

  return {
    fontFamily: isMixedFont ? '' : ([...fonts][0] || defaults.fontFamily || ''),
    fontSize: isMixedSize ? null : ([...sizes][0] ?? defaults.fontSize ?? 10),
    isBold: allBold,
    isItalic: allItalic,
    isUnderline: allUnderline,
    textColor: firstColor,
    bgColor: firstBg,
    isMixedFont,
    isMixedSize,
  };
}

/**
 * 조각 내부 요소에서 지정 CSS 속성과(옵션) HTML 서식 태그를 재귀 정리합니다.
 * 하이퍼링크(<a>)의 href·target·rel 속성은 절대 건드리지 않습니다.
 * @param {Node} node
 * @param {string[]} cssProps
 * @param {string[]} [unwrapTags]
 */
function cleanInnerFragment(node, cssProps, unwrapTags = []) {
  const children = [...node.childNodes];
  for (const child of children) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = /** @type {HTMLElement} */ (child);
    cleanInnerFragment(el, cssProps, unwrapTags);

    for (const prop of cssProps) {
      el.style.removeProperty(prop);
    }
    if (!el.getAttribute('style')?.trim()) el.removeAttribute('style');

    const tag = el.tagName.toUpperCase();
    // <a> 태그는 절대 언랩하지 않습니다.
    if (tag !== 'A' && unwrapTags.includes(tag)) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    } else if (tag === 'SPAN' && !el.attributes.length) {
      const parent = el.parentNode;
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      }
    }
  }
}

/**
 * OS 포커스가 없는 상태에서도 Range에 인라인 스타일을 직접 적용하고,
 * 연속 서식 적용을 위해 갱신된 Range를 반환합니다.
 * @param {Range | null} range
 * @param {Record<string, string>} styles
 * @param {{ unwrapTags?: string[], editable?: HTMLElement | null }} [options]
 * @returns {Range | null}
 */
export function applyInlineStyleToRange(range, styles, options = {}) {
  if (!range || range.collapsed) return range;

  const anchor = range.commonAncestorContainer;
  const anchorEl = anchor instanceof Element ? anchor : anchor.parentElement;
  const editable = options.editable || /** @type {HTMLElement | null} */ (anchorEl?.closest('[contenteditable="true"]'));
  if (!editable) return null;

  const keys = Object.keys(styles);
  const cssProps = keys.map(toKebab);
  const fragment = range.extractContents();
  cleanInnerFragment(fragment, cssProps, options.unwrapTags || []);

  // 투명/빈 문자열 값은 제거 전용으로 취급합니다.
  /** @type {Record<string, string>} */
  const effectiveStyles = {};
  for (const key of keys) {
    const val = styles[key];
    if (val !== '' && val !== 'transparent') {
      effectiveStyles[key] = val;
    }
  }

  // 조각 안에 <a> 링크가 포함돼 있고 color를 바꿨다면, 링크 텍스트에도 색이 반영되도록 동기화합니다.
  if (effectiveStyles.color) {
    fragment.querySelectorAll('a').forEach((a) => {
      /** @type {HTMLElement} */ (a).style.color = effectiveStyles.color;
    });
  }

  /** @type {HTMLElement} */
  let wrapper;
  const singleChild = fragment.childNodes.length === 1 ? fragment.firstChild : null;
  if (singleChild && singleChild.nodeType === Node.ELEMENT_NODE && /** @type {Element} */ (singleChild).tagName === 'SPAN') {
    wrapper = /** @type {HTMLElement} */ (singleChild);
  } else {
    wrapper = document.createElement('span');
    wrapper.appendChild(fragment);
  }

  for (const key of keys) {
    const val = styles[key];
    if (val === '' || val === 'transparent') {
      wrapper.style.removeProperty(toKebab(key));
    } else {
      wrapper.style[/** @type {any} */ (key)] = val;
    }
  }
  if (!wrapper.getAttribute('style')?.trim()) {
    wrapper.removeAttribute('style');
  }

  range.insertNode(wrapper);

  // 부모 껍데기 span이 새 wrapper와 동일한 텍스트만 감싸고 있으면 중복 CSS 속성을 정리합니다.
  let current = wrapper.parentElement;
  while (current && current !== editable) {
    if (current.textContent?.trim() === wrapper.textContent?.trim()) {
      const isBlock = ['DIV', 'P', 'LI'].includes(current.tagName);
      if (isBlock) {
        if (effectiveStyles.fontSize) current.style.fontSize = effectiveStyles.fontSize;
        if (effectiveStyles.lineHeight) current.style.lineHeight = effectiveStyles.lineHeight;
      } else if (current.tagName !== 'A') {
        for (const prop of cssProps) current.style.removeProperty(prop);
        if (!current.getAttribute('style')?.trim()) current.removeAttribute('style');
      }
    }
    current = current.parentElement;
  }

  const nextRange = document.createRange();
  nextRange.selectNode(wrapper);
  editable.dispatchEvent(new Event('input', { bubbles: true }));
  return nextRange;
}

/**
 * 굵게·기울임·밑줄을 Range에서 직접 토글합니다(포커스 없는 독립 창에서도 일관 동작).
 * @param {Range | null} range
 * @param {'bold' | 'italic' | 'underline'} format
 * @param {Array<{ name: string, family: string }>} [allFonts]
 * @param {HTMLElement | null} [editable]
 * @returns {Range | null}
 */
export function toggleInlineFormatOnRange(range, format, allFonts = [], editable = null) {
  if (!range || range.collapsed) return range;
  const current = readSelectionFormat(range, allFonts);

  const anchorEl = resolveAnchorElement(range);
  const ownerEditable = editable || /** @type {HTMLElement | null} */ (anchorEl?.closest('[contenteditable="true"]'));

  // 부모 조상에 해당 서식이 이미 걸려 있는지 확인해, 끄기 시 '400'/'normal'/'none'을 명시해야 하는지 판단합니다.
  /** @param {(el: Element, st: CSSStyleDeclaration) => boolean} check */
  const hasStyledAncestor = (check) => {
    let cur = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    while (cur && cur !== ownerEditable) {
      if (check(cur, window.getComputedStyle(cur))) return true;
      cur = cur.parentElement;
    }
    return false;
  };

  if (format === 'bold') {
    if (current.isBold) {
      const ancestorBold = hasStyledAncestor((el, st) =>
        ['B', 'STRONG'].includes(el.tagName) || st.fontWeight === 'bold' || parseInt(st.fontWeight, 10) >= 600
      );
      return applyInlineStyleToRange(
        range,
        { fontWeight: ancestorBold ? '400' : '' },
        { unwrapTags: ['B', 'STRONG'], editable: ownerEditable }
      );
    }
    return applyInlineStyleToRange(range, { fontWeight: '700' }, { unwrapTags: ['B', 'STRONG'], editable: ownerEditable });
  }

  if (format === 'italic') {
    if (current.isItalic) {
      const ancestorItalic = hasStyledAncestor((el, st) =>
        ['I', 'EM'].includes(el.tagName) || st.fontStyle === 'italic' || st.fontStyle === 'oblique'
      );
      return applyInlineStyleToRange(
        range,
        { fontStyle: ancestorItalic ? 'normal' : '' },
        { unwrapTags: ['I', 'EM'], editable: ownerEditable }
      );
    }
    return applyInlineStyleToRange(range, { fontStyle: 'italic' }, { unwrapTags: ['I', 'EM'], editable: ownerEditable });
  }

  if (format === 'underline') {
    if (current.isUnderline) {
      const ancestorUnderline = hasStyledAncestor((el, st) =>
        el.tagName === 'U' || `${st.textDecorationLine || ''} ${st.textDecoration || ''}`.includes('underline')
      );
      return applyInlineStyleToRange(
        range,
        { textDecoration: ancestorUnderline ? 'none' : '' },
        { unwrapTags: ['U'], editable: ownerEditable }
      );
    }
    return applyInlineStyleToRange(range, { textDecoration: 'underline' }, { unwrapTags: ['U'], editable: ownerEditable });
  }

  return range;
}
