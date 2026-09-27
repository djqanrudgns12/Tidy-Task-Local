// 안내(튜토리얼) 슬라이드(PRD 5절 표). 투표 설정에서 자동으로 만들고, 해당 없는 장은 빠집니다.
// 화면 문장(text)과 읽어 주는 문장(speech)을 따로 둡니다. 숫자·기호를 소리 내기 좋게 바꾸기 위해서입니다.
import { withJosa } from './model.js';

/** @typedef {{id:string, title:string, text:string, speech:string, art:string}} Slide */

import { speechPlan } from './speech/plan.js';
export { nativeCount } from './speech/normalize.js';

/** 슬라이드 목록. @param {import('./model.js').Session} s @returns {Slide[]} */
export function buildSlides(s) {
  const yesno = s.type === 'yesno';
  const noun = s.type === 'opinion' ? '항목' : '후보';
  const count = yesno ? s.agendas.length : s.items.length;
  const votes = s.rules.votesPerVoter;
  /** @type {Slide[]} */ const slides = [];

  slides.push({
    id: 'today', art: 'title', title: '오늘의 투표',
    text: `${s.title} · 우리 반 ${s.rules.voters}명이 투표해요`,
    speech: '',
  });

  if (yesno) {
    slides.push({
      id: 'meet', art: 'agendas', title: '안건을 확인해요',
      text: `안건이 ${count}개 있어요`,
      speech: '',
    });
  } else {
    const names = [...s.items].sort((a, b) => a.number - b.number).map((it) => `기호 ${it.number}번 ${it.name}`).join(', ');
    slides.push({
      id: 'meet', art: 'items', title: s.type === 'opinion' ? '항목을 확인해요' : '후보를 만나요',
      text: `${noun} ${count}${s.type === 'opinion' ? '개' : '명'}`,
      speech: '',
    });
  }

  // 스페이스바 장은 없앴습니다(2026-09-26). 번호를 누르면 "투표했어요!" 뒤 다음 친구의 투표판이 저절로 열리므로
  // (Enter로 넘기지 않음 — 같은 날 사용자 요청), 줄 서기 장에서 한 번만 알려 줍니다.
  slides.push({
    id: 'line', art: 'line', title: '한 명씩 나와요',
    text: '선생님이 부르면 한 명씩 앞으로 나와요 · 번호를 누르면 끝! 다음 친구 투표판이 저절로 열려요',
    speech: '',
  });
  slides.push(yesno
    ? { id: 'press', art: 'keys', title: '번호를 눌러요', text: '1은 찬성, 2는 반대', speech: '' }
    : {
      id: 'press', art: 'keys', title: '번호를 눌러요',
      text: `고르고 싶은 ${noun}의 기호 번호를 눌러요 · 위쪽 숫자키도, 오른쪽 숫자패드도 돼요`,
      speech: '',
    });

  if (!yesno && votes > 1) {
    const repeat = s.rules.allowRepeat;
    slides.push({
      id: 'multi', art: 'dots', title: `${votes}표를 골라요`,
      text: repeat ? `한 사람이 ${votes}표를 골라요 · 같은 ${noun}에 여러 표를 줘도 돼요` : `한 사람이 ${votes}표를 골라요 · 서로 다른 ${withJosa(noun, '을/를')} 골라요`,
      speech: '',
    });
  }
  if (yesno && count > 1) {
    slides.push({
      id: 'agendas', art: 'agendaSteps', title: '안건이 차례로 나와요',
      text: `안건 ${count}개가 하나씩 나와요 · 안건마다 찬성이나 반대를 눌러요`,
      speech: '',
    });
  }
  if (s.rules.allowAbstain) {
    const multi = !yesno && votes > 1;
    slides.push({
      id: 'abstain', art: 'zero', title: '고르고 싶지 않다면 0',
      text: multi ? '더 고르고 싶지 않으면 0 · 다 고르지 않고 끝내려면 0' : '고르고 싶지 않으면 0을 눌러요 · 기권이라고 해요',
      speech: '',
    });
  }
  slides.push({
    id: 'undo', art: 'undo', title: '잘못 눌렀다면',
    text: '백스페이스 또는 다시 투표하기 버튼을 눌러요 · 다음 친구가 투표하기 전까지 다시 고를 수 있어요',
    speech: '',
  });
  slides.push({
    id: 'secret', art: 'secret', title: '비밀 투표 약속',
    text: '화면에는 누구를 골랐는지 나오지 않아요 · 친구가 투표할 때는 화면을 보지 않아요',
    speech: '',
  });
  slides.push({
    id: 'ready', art: 'ready', title: '준비 끝!',
    text: '선생님이 시작하면 차례대로 나와요',
    speech: '',
  });
  // 발화 문구와 실제 재생 계획은 같은 카탈로그를 사용합니다.
  return slides.map((slide) => ({ ...slide, speech: speechPlan(s, slide.id).segments.map((part) => part.text).join(' ') }));
}

/** 자동 넘김 설정(PRD 5절). @param {'slow'|'normal'} speed */
export const PACE = (speed) => (speed === 'normal' ? { baseMs: 7000, restMs: 1200, rate: 1.0 } : { baseMs: 10000, restMs: 2000, rate: 0.9 });

