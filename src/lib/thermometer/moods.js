/** 온도계 무드 표(PRD 10.4). 무드는 색만이 아니라 "온도가 오른다는 것이 무슨 뜻인가"를 바꿉니다.
 * 화면·소리는 사건 이름만 알리고, 어떤 모양·소리인지는 이 표가 정합니다. */

export const MOODS = Object.freeze({
  positive: Object.freeze({
    id: 'positive',
    label: '긍정',
    hint: '오를수록 좋아요 · 칭찬과 공동 목표',
    title: '칭찬 온도계',
    stageName: '보상 단계',
    topName: '목표',
    topTextName: '목표 보상',
    topPlaceholder: '예: 자유 시간',
    stagePlaceholders: ['칭찬 도장', '자리 바꾸기', '자유 시간 10분'],
    chips: Object.freeze(['협동', '발표', '정리정돈', '배려', '집중']),
    // 액체: 하늘 → 파랑(오를수록 진해짐)
    from: '#9ED8FF',
    to: '#2F7BE0',
    accent: '#2F6FD1',
    soft: '#EAF4FF',
    sounds: Object.freeze({ up: 'bubble', down: 'whistle', stage: 'chime3', top: 'fanfare', freeze: 'ice', blocked: 'thud', kept: 'calmChime' }),
  }),
  negative: Object.freeze({
    id: 'negative',
    label: '부정',
    hint: '오를수록 조심해요 · 경고와 약속 관리',
    title: '경고 온도계',
    stageName: '경고 단계',
    topName: '한계',
    topTextName: '약속한 결과',
    topPlaceholder: '예: 방과 후 청소',
    stagePlaceholders: ['주의 한 번', '쉬는 시간 5분 줄이기', '자리 옮기기'],
    chips: Object.freeze(['소란', '지각', '정리 안 함', '다툼', '약속 어김']),
    // 액체: 복숭아 → 빨강
    from: '#FFC3A0',
    to: '#E5484D',
    accent: '#D93F45',
    soft: '#FFF0EE',
    sounds: Object.freeze({ up: 'heartbeat', down: 'relief', stage: 'beepboop', top: 'alarm', freeze: 'ice', blocked: 'thud', kept: 'calmChime' }),
  }),
});

/** @param {unknown} id @returns {'positive'|'negative'} */
export const moodId = (id) => (id === 'negative' ? 'negative' : 'positive');
/** @param {unknown} id */
export const moodOf = (id) => MOODS[moodId(id)];

/** 단위 표기 @param {'deg'|'point'|'none'} unit */
export const unitMark = (unit) => (unit === 'point' ? '점' : unit === 'none' ? '' : '°');
