// 투표 키 읽기(PRD 6절 "키 규칙"). event.key가 아니라 event.code로 읽습니다.
// 왜: NumLock이 꺼지면 숫자패드의 key는 'End'·'ArrowDown'이 되고, 한글 입력 상태에서는 'Process'가 오지만
//   code는 어느 경우에도 'Numpad1'·'Digit1'로 같습니다.

/** @param {string} code @returns {number|null} 0~9 또는 숫자키가 아니면 null */
export function digitOf(code) {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  return m ? Number(m[1]) : null;
}

/** 투표 단계에서 학생 키보드로 받는 키 이름. 나머지는 모두 막습니다.
 * 스페이스바는 쓰지 않습니다(2026-09-26부터 투표판이 저절로 열림). Enter · Esc는 다시 투표하기 팝업에서만 씁니다. @param {string} code */
export function boothKey(code) {
  const digit = digitOf(code);
  if (digit !== null) return { kind: /** @type {const} */ ('digit'), digit };
  if (code === 'Backspace') return { kind: /** @type {const} */ ('back'), digit: null };
  if (code === 'Enter' || code === 'NumpadEnter') return { kind: /** @type {const} */ ('enter'), digit: null };
  if (code === 'Escape') return { kind: /** @type {const} */ ('escape'), digit: null };
  return { kind: /** @type {const} */ ('other'), digit: null };
}
