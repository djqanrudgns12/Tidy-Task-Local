// 움직임 토큰과 장면별 시간표(PRD 10절). 컴포넌트는 숫자를 직접 쓰지 않고 이 표만 봅니다(숫자가 여기저기 흩어지지 않게).
// 성격: 절제된 Playful — 스티커·캐릭터는 살짝 통통(넘침 3~5%), 화면 틀·버튼은 차분하게.

export const EASE = Object.freeze({
  /** 대표 곡선(80%의 움직임) */
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  /** 스티커 붙이기·도장·왕관(넘침 약 4%) */
  pop: 'cubic-bezier(0.34, 1.36, 0.64, 1)',
  /** 사라지는 것 */
  exit: 'cubic-bezier(0.3, 0, 1, 1)',
  /** 제자리 반복(숨쉬기) */
  sine: 'cubic-bezier(0.37, 0, 0.63, 1)',
});

export const DUR = Object.freeze({ quick: 160, standard: 280, slow: 520 });

/** 장면별 시간(ms). 소리 시점은 audio.js의 목소리가 같은 박자로 맞춰져 있습니다. */
export const SCENE = Object.freeze({
  stagePhase: { enter: 280, exit: 180, rise: 12 },
  boothOpen: 200,
  dotFill: 160,
  ballotDrop: { fold: 180, slide: 340 },
  undoReturn: 360,
  allDoneLock: 700,
  lotteryShuffle: 1200,
  lotteryDeal: 350,
  tutorialSlide: 320,
  boxOpen: 900,
  paper: { rise: 260, unfold: 360, stamp: 200, chalk: 240 },
  raceHop: 320,
  tugStep: 280,
  broadcastRankSwap: 360,
  certainStamp: 420,
  flip: 520,
  drumroll: 2500,
  winner: 2400,
  tie: 600,
  verdictStamp: 600,
  stagger: 40,
  staggerBudget: 500,
});

/** 순차 등장 지연(합계 500ms 이하로 자동 조정). @param {number} index @param {number} count */
export function staggerDelay(index, count) {
  const step = count > 1 ? Math.min(SCENE.stagger, SCENE.staggerBudget / (count - 1)) : 0;
  return Math.round(index * step);
}

/** 동작 줄이기(OS 설정 또는 투표 설정). @param {boolean} pref */
export function reducedMotion(pref) {
  if (pref) return true;
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
