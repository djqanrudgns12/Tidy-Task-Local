import { nativeCount } from './normalize.js';

export const CATALOG_VERSION = 1;
export const VOICES = ['female', 'male'];
export const SPEEDS = ['normal', 'slow'];
/** 기본 음원은 완결된 문장 단위로 제작합니다. @returns {Record<string,string>} */
export function speechCatalog() {
  /** @type {Record<string,string>} */
  const c = {
    preview: '기호 일 번, 기호 이 번. 다시 고르고 싶으면 백스페이스를 누르거나, 다시 투표하기 버튼을 눌러요.',
    // line · undo는 2026-09-26에 뒷문장(엔터로 차례 넘기기 · 시간 제한 없음)을 뺐습니다 — 투표판이 저절로 넘어가게 바뀌어서.
    // 음원은 새로 합성하지 않고 기존 원본에서 첫 문장만 잘라 같은 처리(atempo·loudnorm)를 거쳤습니다(docs/QA-vote.md).
    line: '선생님이 부르면 한 명씩 앞으로 나와요.',
    undo: '다시 고르고 싶으면 백스페이스를 누르거나, 다시 투표하기 버튼을 눌러요.',
    'press.yesno': '찬성이면 일 번, 반대면 이 번을 눌러요.',
    secret: '화면에는 누구를 골랐는지 나오지 않아요. 친구가 투표할 때는 화면을 보지 않기로 약속해요.',
    'abstain.yesno': '이번 안건에서 찬성과 반대를 고르고 싶지 않으면 숫자 영을 눌러요. 이 안건만 기권하고 다음 안건으로 넘어가요.',
    'abstain.yesno.single': '찬성과 반대를 고르고 싶지 않으면 숫자 영을 눌러요. 기권이라고 해요.',
  };
  for (const [type, label, noun] of [['candidate', '후보 투표', '후보'], ['opinion', '의견 투표', '항목'], ['yesno', '찬반 투표', '안건']]) {
    c[`today.${type}`] = `오늘은 ${label}를 해요.`;
    c[`ready.${type}`] = `준비 끝! ${label}를 시작할게요. 선생님이 시작하면 차례대로 나와요.`;
    c[`screen.${type}`] = `${noun}${type === 'yesno' ? '을' : type === 'opinion' ? '을' : '를'} 화면에서 확인해 주세요.`;
    if (type === 'yesno') continue;
    c[`press.${type}`] = `고르고 싶은 ${noun}의 기호 번호를 눌러요. 위쪽 숫자키도, 오른쪽 숫자패드도 돼요.`;
    c[`abstain.${type}`] = `고르고 싶은 ${noun}${type === 'candidate' ? '가' : '이'} 없으면 숫자 영을 눌러요. 기권이라고 해요.`;
    c[`abstain.${type}.multi`] = `더 고르고 싶은 ${noun}${type === 'candidate' ? '가' : '이'} 없으면 숫자 영을 눌러요. 남은 표는 모두 기권하고 투표를 끝내요.`;
    for (let n = 2; n <= 5; n++) for (const repeat of [false, true]) {
      c[`multi.${type}.${n}.${repeat}`] = `한 사람이 ${nativeCount(n, '표')}를 골라요. ${repeat ? `같은 ${noun}에 여러 표를 줘도 돼요.` : `서로 다른 ${noun}${type === 'candidate' ? '를' : '을'} 골라요.`}`;
    }
  }
  for (let n = 2; n <= 60; n++) c[`voters.${n}`] = `우리 반 ${nativeCount(n, '명')}이 모두 투표해요.`;
  for (let n = 2; n <= 9; n++) {
    c[`count.candidate.${n}`] = `후보는 ${nativeCount(n, '명')}이에요.`;
    c[`count.opinion.${n}`] = `항목은 ${nativeCount(n, '개')}예요.`;
  }
  for (let n = 1; n <= 5; n++) {
    c[`count.yesno.${n}`] = `안건은 ${nativeCount(n, '개')}예요.`;
    c[`agendas.${n}`] = `안건이 ${nativeCount(n, '개')}예요. 하나씩 차례로 찬성과 반대를 눌러요.`;
  }
  return c;
}

export const CATALOG = Object.freeze(speechCatalog());
