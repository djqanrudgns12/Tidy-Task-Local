// 기본 안내는 내장 음원, 이름·안건은 명시적으로 준비한 로컬 음원만 재생합니다.
import { createSpeechPlayer } from './speech/player.js';
import { createLocalSpeech } from './speech/local.js';
import { speechPlan } from './speech/plan.js';
import { CATALOG } from './speech/catalog.js';
import { hash } from './speech/cache.js';

/** @param {{audio:any,manifest:any,files:Record<string,string>}} deps */
export function createSpeech({ audio, manifest, files }) {
  const local = createLocalSpeech();
  let voice = 'female', speed = 'slow', generation = 0;
  /** @type {Map<string,ArrayBuffer>} */ const loaded = new Map();
  const player = createSpeechPlayer({
    channel: () => audio.speechChannel(),
    async load(segment, v, s, signal) {
      if (segment.dynamic) return local.get(segment.text, v, s);
      const key = `${v}.${s}.${segment.id}`, entry = manifest.entries[key];
      if (!entry || entry.text !== segment.text || !files[entry.file]) return null;
      if (loaded.has(key)) return /** @type {ArrayBuffer} */ (loaded.get(key));
      const res = await fetch(files[entry.file], { signal });
      if (!res.ok) return null;
      const bytes = await res.arrayBuffer();
      if (await hash(bytes) !== entry.sha256) return null;
      // 기본 음원만 최대 24개 보관하고, 이름은 별도 로컬 캐시 수명주기를 따릅니다.
      if (loaded.size >= 24) loaded.delete(/** @type {string} */ (loaded.keys().next().value));
      loaded.set(key, bytes); return bytes;
    },
  });
  const cancel = () => { generation++; player.cancel(); };
  return {
    ...player, cancel, local,
    /** @param {{speechVoice?:string,volume:number,muted:boolean,speech:boolean}} prefs */
    configure(prefs) {
      const nextVoice = prefs.speechVoice === 'male' ? 'male' : 'female';
      if (voice !== nextVoice) { cancel(); local.cancel(); voice = nextVoice; }
      if (prefs.muted || !prefs.speech || prefs.volume <= 0) generation++;
      player.setVolume(prefs.volume); player.setMuted(prefs.muted || !prefs.speech);
    },
    /** @param {string} value */
    setSpeed(value) { const next = value === 'normal' ? 'normal' : 'slow'; if (next !== speed) { cancel(); local.cancel(); speed = next; } },
    /** @param {string} [v] */
    available(v = voice) { return Object.keys(CATALOG).every((id) => ['normal', 'slow'].every((s) => { const e = manifest.entries[`${v}.${s}.${id}`]; return !!e && e.text === CATALOG[id] && !!files[e.file]; })); },
    /** @param {any} config @param {string} slideId @param {boolean} [basicOnly] */
    async speakSlide(config, slideId, basicOnly = false) {
      cancel(); const my = generation;
      const plan = speechPlan(config, slideId);
      const currentVoice = voice, currentSpeed = speed;
      let parts = plan.segments;
      // 일부 후보만 읽는 불균형을 피하기 위해 소개 묶음의 준비를 먼저 확인합니다.
      if (basicOnly || (parts.some((p) => p.dynamic) && !(await local.ready(config, currentVoice, currentSpeed)))) parts = plan.fallback;
      if (my !== generation) return 'cancelled';
      return player.speak(parts, { voice, speed });
    },
    get voiceName() { return voice === 'male' ? '남성' : '여성'; },
    dispose() { cancel(); player.dispose(); local.dispose(); loaded.clear(); },
  };
}
