// 창 라벨 규칙을 한곳에 모읍니다.
// 왜 필요한가: "데이터를 가진 창인지"를 판단하는 조건이 여러 파일에 흩어져 있으면,
//   한 곳만 고쳐졌을 때 리마인더·환영 창 같은 보조 창이 저장소에 쓰기를 시도하는
//   버그(미루기 초기화 등)가 다시 생깁니다.

export const MAX_WINDOWS_PER_KIND = 10;
export const NOTE_PREFIX = 'note-';
export const TINY_NOTE_PREFIX = 'tinynote-';

// 할 일·메모 데이터를 저장하는 창 (main / note-N / tinynote-N)
/** @param {unknown} label */
export function isDataWindowLabel(label) {
  return typeof label === 'string'
    && (label === 'main' || label.startsWith(NOTE_PREFIX) || label.startsWith(TINY_NOTE_PREFIX));
}

/** @param {unknown} label */
export function isTinyNoteLabel(label) {
  return typeof label === 'string' && label.startsWith(TINY_NOTE_PREFIX);
}

// note-1..10 또는 tinynote-1..10 라벨 목록
/** @param {string} prefix */
export function slotLabels(prefix) {
  return Array.from({ length: MAX_WINDOWS_PER_KIND }, (_, i) => `${prefix}${i + 1}`);
}
