/** 주사위 도구의 순수 모델 — 저장·화면·연출을 모릅니다. 간단 뽑기(src/lib/picker/)와 별개 도구라 그 코드를 쓰지 않습니다. */
export const MIN_DICE = 1;
export const MAX_DICE = 3;
// 처음 여는 교사가 "하나 던지기"부터 바로 쓰도록 1개로 시작합니다(PRD 확정 사항).
export const DEFAULT_COUNT = 1;
const FACES = 6;

export const randomWord = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** 저장값·키 입력 어디서 와도 1~3 사이 정수로 맞춥니다. 숫자가 아니면 기본값입니다.
 * @param {unknown} value */
export function clampCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_COUNT;
  return Math.min(MAX_DICE, Math.max(MIN_DICE, Math.round(value)));
}

/** 1~6을 똑같은 확률로 뽑습니다.
 * 왜 거부 표본 추출인가: 2^32는 6으로 나누어떨어지지 않아 나머지를 그대로 쓰면 1~4가 아주 조금 더 자주 나옵니다.
 * 넘치는 꼬리 값은 버리고 다시 뽑습니다.
 * @param {() => number} [word] */
export function rollFace(word = randomWord) {
  const limit = Math.floor(0x100000000 / FACES) * FACES;
  let value;
  do value = word() >>> 0;
  while (value >= limit);
  return (value % FACES) + 1;
}

/** @param {number} count @param {() => number} [word] */
export function rollValues(count, word = randomWord) {
  return Array.from({ length: clampCount(count) }, () => rollFace(word));
}

/** 주사위가 1개면 합계 숫자 하나만, 2개 이상이면 "5 + 2 = 7" 식으로 보여 줍니다.
 * @param {readonly number[]} values */
export function formatResult(values) {
  const terms = [...values];
  const total = terms.reduce((sum, v) => sum + v, 0);
  const text = terms.length === 1 ? String(total) : `${terms.join(' + ')} = ${total}`;
  return { terms, total, text };
}

/** 같은 눈 배지. 3개 중 2개만 같은 경우는 약 42%로 흔해서 특별하게 보이지 않으므로 배지를 주지 않습니다.
 * @param {readonly number[]} values @returns {'double'|'triple'|null} */
export function matchKind(values) {
  if (values.length === 2 && values[0] === values[1]) return 'double';
  if (values.length === 3 && values[0] === values[1] && values[1] === values[2]) return 'triple';
  return null;
}

export const MATCH_LABELS = Object.freeze({ double: '더블!', triple: '트리플!' });

/** 화면 읽기 프로그램이 한 번에 읽을 문장입니다.
 * @param {readonly number[]} values */
export function spokenResult(values) {
  const { terms, total } = formatResult(values);
  const body = terms.length === 1 ? `${total}` : `${terms.join(' 더하기 ')}, 합계 ${total}`;
  const match = matchKind(values);
  return `주사위 ${terms.length}개, ${body}${match === 'double' ? ', 더블' : match === 'triple' ? ', 트리플' : ''}`;
}
