// 타이머 효과음 목록 — 설정 선택지·음원 경로·타이머별 기본값의 단일 원천입니다.
// 왜 한곳에 모으는가: 설정 저장 검증(preferences.js·Rust toolkit.rs), 재생(audio.js), 선택 상자(TimerSettingsPanel)가
// 같은 목록을 봐야 "고를 수는 있는데 저장이 거부되는" 식의 어긋남이 생기지 않습니다.
// Rust toolkit.rs의 TICK_SOUNDS·WARNING_SOUNDS·END_SOUNDS와 id 목록이 같아야 합니다(soundLibrary.test.js가 대조).
// 새 음원(timer-sounds/…)은 scripts/prepare-timer-sound-library.mjs가 원본에서 다시 만들며, 출처·가공은
// artwork/toolkit/audio/manifest.json, 이용 조건은 public/audio/toolkit/timer-sounds/LICENSE.txt에 있습니다.

/** @typedef {'tick'|'warning'|'end'} SoundRole */
/** @typedef {{id:string,label:string,group:string,url:string,minimumLoopSeconds?:number}} SoundOption */

export const SOUND_ROLES = /** @type {const} */ (['tick', 'warning', 'end']);

/** 설정 파일에서 역할별 소리 id를 담는 키입니다. */
export const SOUND_KEYS = /** @type {const} */ ({ tick: 'tickSound', warning: 'warningSound', end: 'endSound' });

const LIBRARY = '/audio/toolkit/timer-sounds';

/** 선택 상자의 묶음 이름. 같은 성격끼리 모아 목록이 길어도 훑어보기 쉽게 합니다. @type {Record<SoundRole, Record<string,string>>} */
export const SOUND_GROUPS = {
  tick: { clock: '시계', rhythm: '리듬 악기', light: '가벼운 소리' },
  warning: { beep: '전자음', tone: '맑은 소리', tension: '긴장감' },
  end: { bell: '종·벨', calm: '차분한 소리', bright: '밝은 알림' },
};

/** 목록 순서가 곧 선택 상자 순서입니다. 앞의 몇 개는 예전부터 타이머별 기본으로 쓰던 소리입니다.
 * @type {Record<SoundRole, SoundOption[]>} */
export const SOUND_LIBRARY = {
  tick: [
    { id: 'clock-closeup', label: '기계식 시계', group: 'clock', url: '/audio/toolkit/digital/tick-t01.wav' },
    // 예전 아날로그 시계음은 0.23초짜리라, 1초 박자가 되도록 뒤를 무음으로 채워 반복합니다.
    { id: 'small-tick', label: '작은 초침', group: 'clock', url: '/audio/toolkit/tick.wav', minimumLoopSeconds: 1 },
    { id: 'wall-clock', label: '벽시계', group: 'clock', url: `${LIBRARY}/tick/wall-clock.wav` },
    { id: 'grandfather-clock', label: '괘종시계 추', group: 'clock', url: `${LIBRARY}/tick/grandfather-clock.wav` },
    { id: 'alarm-clock', label: '탁상 자명종', group: 'clock', url: `${LIBRARY}/tick/alarm-clock.wav` },
    { id: 'stopwatch', label: '스톱워치 초침', group: 'clock', url: `${LIBRARY}/tick/stopwatch.wav` },
    { id: 'kitchen-timer', label: '주방 타이머', group: 'clock', url: `${LIBRARY}/tick/kitchen-timer.wav` },
    { id: 'metronome', label: '메트로놈', group: 'rhythm', url: `${LIBRARY}/tick/metronome.wav` },
    { id: 'woodblock', label: '우드블록', group: 'rhythm', url: `${LIBRARY}/tick/woodblock.wav` },
    { id: 'water-drop', label: '작은 물방울', group: 'light', url: '/audio/toolkit/hourglass/tick-ht04.wav' },
    { id: 'button-click', label: '버튼 클릭', group: 'light', url: '/audio/toolkit/stopwatch/tick-st04.wav' },
    { id: 'soft-tap', label: '부드러운 톡', group: 'light', url: `${LIBRARY}/tick/soft-tap.wav` },
    { id: 'digital-tick', label: '디지털 틱', group: 'light', url: `${LIBRARY}/tick/digital-tick.wav` },
    { id: 'glass-tink', label: '맑은 유리', group: 'light', url: `${LIBRARY}/tick/glass-tink.wav` },
  ],
  warning: [
    { id: 'double-beep', label: '이중 비프', group: 'beep', url: '/audio/toolkit/digital/warning-w05-1s.wav' },
    { id: 'buzzer', label: '경고 버저', group: 'beep', url: '/audio/toolkit/analog/warning-w09.wav' },
    { id: 'signal', label: '신호 알림', group: 'beep', url: '/audio/toolkit/hourglass/warning-hw09.wav' },
    { id: 'time-signal', label: '라디오 시보', group: 'beep', url: `${LIBRARY}/warning/time-signal.wav` },
    { id: 'alarm-beep', label: '알람 삐삐삐삐', group: 'beep', url: `${LIBRARY}/warning/alarm-beep.wav` },
    { id: 'game-beep', label: '게임 카운트다운', group: 'beep', url: `${LIBRARY}/warning/game-beep.wav` },
    { id: 'soft-ding', label: '부드러운 딩', group: 'tone', url: `${LIBRARY}/warning/soft-ding.wav` },
    { id: 'chime-alert', label: '알림 멜로디', group: 'tone', url: `${LIBRARY}/warning/chime-alert.wav` },
    { id: 'xylophone', label: '실로폰 카운트다운', group: 'tone', url: `${LIBRARY}/warning/xylophone.wav` },
    { id: 'kalimba', label: '칼림바', group: 'tone', url: `${LIBRARY}/warning/kalimba.wav` },
    { id: 'music-box', label: '오르골', group: 'tone', url: `${LIBRARY}/warning/music-box.wav` },
    { id: 'heartbeat', label: '두근두근 심장', group: 'tension', url: `${LIBRARY}/warning/heartbeat.wav` },
    { id: 'hurry-tick', label: '재촉하는 초침', group: 'tension', url: `${LIBRARY}/warning/hurry-tick.wav` },
  ],
  end: [
    { id: 'clock-gong', label: '고전 시계 종', group: 'bell', url: '/audio/toolkit/analog/end-e09.wav' },
    { id: 'happy-bells', label: '경쾌한 작은 벨', group: 'bell', url: '/audio/toolkit/hourglass/end-he09.wav' },
    { id: 'kitchen-bell', label: '주방 타이머 벨', group: 'bell', url: `${LIBRARY}/end/kitchen-bell.wav` },
    { id: 'boxing-bell', label: '권투 종', group: 'bell', url: `${LIBRARY}/end/boxing-bell.wav` },
    { id: 'counter-bell', label: '호출 벨', group: 'bell', url: `${LIBRARY}/end/counter-bell.wav` },
    { id: 'doorbell', label: '딩동 초인종', group: 'bell', url: `${LIBRARY}/end/doorbell.wav` },
    { id: 'singing-bowl', label: '싱잉볼', group: 'calm', url: `${LIBRARY}/end/singing-bowl.wav` },
    { id: 'triangle', label: '트라이앵글', group: 'calm', url: `${LIBRARY}/end/triangle.wav` },
    { id: 'winning-chimes', label: '성공 차임', group: 'bright', url: '/audio/toolkit/digital/end-e08.wav' },
    { id: 'celebration', label: '축하 멜로디', group: 'bright', url: `${LIBRARY}/end/celebration.wav` },
    { id: 'xylophone-finish', label: '실로폰 도솔미', group: 'bright', url: `${LIBRARY}/end/xylophone-finish.wav` },
    { id: 'phone-timer', label: '스마트폰 타이머', group: 'bright', url: `${LIBRARY}/end/phone-timer.wav` },
    { id: 'cheer', label: '박수와 환호', group: 'bright', url: `${LIBRARY}/end/cheer.wav` },
  ],
};

/** 타이머마다 예전부터 울리던 소리가 기본입니다. 업데이트 뒤에도 사용자가 고르기 전까지는 소리가 바뀌지 않게 합니다.
 * 스톱워치는 시계음만 있습니다. @type {Record<string, Partial<Record<SoundRole,string>>>} */
export const DEFAULT_SOUNDS = {
  digital: { tick: 'clock-closeup', warning: 'double-beep', end: 'winning-chimes' },
  analog: { tick: 'small-tick', warning: 'buzzer', end: 'clock-gong' },
  hourglass: { tick: 'water-drop', warning: 'signal', end: 'happy-bells' },
  stopwatch: { tick: 'button-click' },
};

/** 이 타이머에 있는 소리 역할(스톱워치는 시계음만). @param {string} kind @returns {SoundRole[]} */
export function soundRolesFor(kind) {
  return kind === 'stopwatch' ? ['tick'] : [...SOUND_ROLES];
}

/** @param {SoundRole} role @param {unknown} id */
export function isSoundId(role, id) {
  return typeof id === 'string' && (SOUND_LIBRARY[role] || []).some((option) => option.id === id);
}

/** @param {SoundRole} role @param {string} id @returns {SoundOption|undefined} */
export function findSound(role, id) {
  return (SOUND_LIBRARY[role] || []).find((option) => option.id === id);
}

/** 저장된 설정에서 역할별로 실제로 울릴 소리를 고릅니다. 목록에 없는 값(손상·다른 버전)은 그 타이머의 기본 소리로 대신합니다.
 * @param {string} kind @param {Record<string, unknown>} [prefs] @returns {Partial<Record<SoundRole, SoundOption>>} */
export function selectedSounds(kind, prefs = {}) {
  const defaults = DEFAULT_SOUNDS[kind] || DEFAULT_SOUNDS.digital;
  /** @type {Partial<Record<SoundRole, SoundOption>>} */
  const out = {};
  for (const role of soundRolesFor(kind)) {
    const wanted = prefs[SOUND_KEYS[role]];
    out[role] = findSound(role, isSoundId(role, wanted) ? /** @type {string} */ (wanted) : /** @type {string} */ (defaults[role]));
  }
  return out;
}
