// 후보 색 9가지와 의견 스티커 무늬 9종(PRD 9절). 결과 이미지(캔버스)와 화면 CSS 변수가 같은 값을 쓰도록 한 곳에 둡니다.

/** 후보 색 9가지(PRD 9절). 배정 순서 = 배열 순서(이웃한 후보끼리 색상이 멀어지게 정한 순서).
 * 캔버스(결과 이미지)와 CSS 변수가 같은 값을 쓰도록 여기 한 곳에 둡니다. */
export const PALETTE = Object.freeze([
  { id: 'berry', label: '딸기', bg: '#FAD4DC', line: '#F2A9B9', ink: '#A23A57' },
  { id: 'sky', label: '하늘', bg: '#D3E8FA', line: '#A6CDEF', ink: '#28628F' },
  { id: 'lemon', label: '레몬', bg: '#FBEDB5', line: '#F0D56B', ink: '#7A5A00' },
  { id: 'mint', label: '민트', bg: '#CDEFE2', line: '#95D9BF', ink: '#1F6E57' },
  { id: 'lilac', label: '라벤더', bg: '#E3DAF7', line: '#C3B2EE', ink: '#5A4596' },
  { id: 'apricot', label: '살구', bg: '#FCDCC4', line: '#F5B98C', ink: '#96491A' },
  { id: 'teal', label: '청록', bg: '#CBEBEE', line: '#8FD2D9', ink: '#1E6972' },
  { id: 'lime', label: '연두', bg: '#E2F0C4', line: '#BEDD86', ink: '#4D6B14' },
  { id: 'cocoa', label: '코코아', bg: '#EADCCF', line: '#D1B69C', ink: '#6E4E36' },
].map((c) => Object.freeze(c)));
export const COLOR_IDS = PALETTE.map((c) => c.id);

/** 의견 항목 번호 스티커의 무늬 9종(PRD 9절). 배정 순서 = 배열 순서. */
export const PATTERNS = Object.freeze([
  { id: 'dots', label: '물방울' },
  { id: 'stripes', label: '사선 줄무늬' },
  { id: 'gingham', label: '깅엄 체크' },
  { id: 'waves', label: '물결' },
  { id: 'stars', label: '작은 별' },
  { id: 'hearts', label: '작은 하트' },
  { id: 'grid', label: '모눈' },
  { id: 'petals', label: '꽃잎' },
  { id: 'zigzag', label: '지그재그' },
].map((p) => Object.freeze(p)));
export const PATTERN_IDS = PATTERNS.map((p) => p.id);

/** @param {string|null|undefined} id */
export const paletteOf = (id) => PALETTE.find((c) => c.id === id) ?? PALETTE[0];
