// 효과음(시작음·알림음)을 한곳에서 재생합니다.
// 왜 모았는가: 같은 코드가 세 곳에 복사돼 있었고, 소리를 낼 때마다 오디오 장치(AudioContext)를
//   새로 만들고 닫지 않아 알림이 쌓일수록 자원이 새어 나갔습니다. 이제 창마다 하나만 만들어 재사용합니다.
// 소리 모양(주파수·음량·길이)은 5.0.0과 똑같습니다.

const CHIMES = {
  // 앱 시작음 (레모 탄산)
  start: { from: 1200, to: 3600, ramp: 0.15, peak: 0.45, attack: 0.01, end: 0.0001, decay: 0.4, stop: 0.42 },
  // 리마인더 알림음
  alert: { from: 600, to: 800, ramp: 0.1, peak: 0.5, attack: 0.05, end: 0.01, decay: 0.3, stop: 0.3 },
};

let audioContext = null;

function getAudioContext() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext || audioContext.state === 'closed') audioContext = new Ctx();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

export function playChime(kind) {
  const spec = CHIMES[kind];
  if (!spec) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.from, t);
    osc.frequency.exponentialRampToValueAtTime(spec.to, t + spec.ramp);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(spec.peak, t + spec.attack);
    gain.gain.exponentialRampToValueAtTime(spec.end, t + spec.decay);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(t + spec.stop);
  } catch (e) {
    console.warn('사운드 재생 실패:', e);
  }
}
