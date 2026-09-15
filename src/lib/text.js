// HTML 조각에서 사람이 읽는 글자만 뽑아냅니다.
// 왜 정규식이 아니라 DOMParser인가: 정규식으로 태그와 "&이름;"을 지우면
//   "A &amp; B"의 & 기호까지 사라져 "A  B"로 보였습니다. 파서는 &amp; → & 처럼
//   문자 참조를 올바른 글자로 되돌려 주고, 스크립트는 실행하지 않습니다.
/** @param {unknown} html */
export function htmlToText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/ /g, ' ').trim();
}
