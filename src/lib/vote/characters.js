// 후보 캐릭터 18명(평면 일러스트 흉상 아이들, 남 9 · 여 9 — PRD 9절, 2026-09-25 봉제 인형에서 방향 변경). 그림 파일은 src/assets/vote/characters/{id}.webp이며
// 없으면 화면이 같은 색의 번호 스티커로 대신합니다(characterImages.js). 이 파일은 그림을 모르는 순수 목록입니다.

/** @typedef {{id:string, gender:'m'|'f', label:string}} Character */

/** 목록 순서가 "기본 순서"이고, 투표마다 id로 섞은 순서로 배정합니다(assign.js). */
export const CHARACTERS = Object.freeze(/** @type {Character[]} */ ([
  { id: 'm1', gender: 'm', label: '스포츠머리 · 남색 후드티' },
  { id: 'm2', gender: 'm', label: '곱슬머리 · 나비넥타이' },
  { id: 'm3', gender: 'm', label: '옆가르마 · 동그란 안경' },
  { id: 'm4', gender: 'm', label: '삐죽 앞머리 · 줄무늬 티' },
  { id: 'm5', gender: 'm', label: '바가지머리 · 멜빵바지' },
  { id: 'm6', gender: 'm', label: '야구모자 · 볼 반창고' },
  { id: 'm7', gender: 'm', label: '투블럭 · 체크 셔츠' },
  { id: 'm8', gender: 'm', label: '파마머리 · 작은 책가방' },
  { id: 'm9', gender: 'm', label: '땀밴드 · 체육복' },
  { id: 'f1', gender: 'f', label: '양갈래 땋은 머리 · 멜빵 치마' },
  { id: 'f2', gender: 'f', label: '똥머리 · 리본 브로치' },
  { id: 'f3', gender: 'f', label: '일자 앞머리 단발 · 세일러 칼라' },
  { id: 'f4', gender: 'f', label: '높은 포니테일 · 줄무늬 티' },
  { id: 'f5', gender: 'f', label: '긴 생머리 · 머리띠' },
  { id: 'f6', gender: 'f', label: '곱슬 단발 · 꽃 핀' },
  { id: 'f7', gender: 'f', label: '짧은 양갈래 · 방울 머리끈' },
  { id: 'f8', gender: 'f', label: '반묶음 · 큰 리본' },
  { id: 'f9', gender: 'f', label: '숏컷 · 동그란 안경' },
].map((c) => Object.freeze(c))));

export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);

/** @param {string|null|undefined} id */
export const characterById = (id) => CHARACTERS.find((c) => c.id === id) ?? null;

/** @param {'m'|'f'} gender */
export const charactersOf = (gender) => CHARACTERS.filter((c) => c.gender === gender);
