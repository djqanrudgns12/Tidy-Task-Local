// Long-lived AudioContext scheduling keeps tick/warning playback independent of UI frames.
// 어떤 소리를 울릴지는 설정(tickSound·warningSound·endSound)을 select()로 받아 정합니다(목록: soundLibrary.js).
import { selectedSounds, soundRolesFor } from './soundLibrary.js';

/** 미리 듣기 길이(초). 반복음은 박자가 느껴지도록 몇 번 이어서, 종료음은 끝까지 한 번 들려줍니다.
 * 긴 녹음(예: 11.7초짜리 기계식 시계)도 이 길이만 들려줘 고르는 사이 기다리지 않게 합니다. */
export const PREVIEW_SECONDS = { tick: 4, warning: 3 };

/** @param {(message:string)=>void} [onError] @param {string} [kind]
 * @param {{AudioContext: typeof AudioContext, fetch: typeof fetch}} [platform] 테스트가 가짜 오디오 장치를 넣을 때만 바꿉니다. */
export function createTimerAudio(onError = () => {}, kind = 'digital', platform = globalThis) {
  const roles = soundRolesFor(kind);
  let sounds = selectedSounds(kind);
  /** @type {AudioContext|undefined} */ let context;
  /** 주소별 불러오기. 한 번 받은 소리는 다시 고를 때 내려받지 않습니다. @type {Map<string, Promise<AudioBuffer>>} */
  const loading = new Map();
  /** @type {Map<string, AudioBuffer>} */ const buffers = new Map();
  let disposed = false;
  // 미리 듣기는 파일을 받는 동안 기다리므로, 그 사이 타이머가 시작되면 늦게 도착한 미리 듣기가
  // 방금 예약한 시계음을 끊지 않도록 번호로 가려냅니다(schedule·dispose가 번호를 올림).
  let previewToken = 0;
  const sources = new Set(/** @type {AudioBufferSourceNode[]} */ ([]));
  /** @param {AudioContext} ctx @param {string} url */
  function load(ctx, url) {
    let pending = loading.get(url);
    if (!pending) {
      pending = platform
        .fetch(url)
        .then(async (response) => {
          if (!response.ok) throw new Error('효과음 파일을 불러오지 못했어요.');
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          buffers.set(url, buffer);
          return buffer;
        })
        .catch((error) => {
          // 실패한 주소는 지워 두어야 다음 시도(미리 듣기·다시 시작)에서 다시 받습니다.
          loading.delete(url);
          throw error;
        });
      loading.set(url, pending);
    }
    return pending;
  }
  /** 설정에서 고른 소리로 바꿉니다. 목록에 없는 값은 이 타이머의 기본 소리로 대신합니다.
   * @param {Record<string, unknown>} prefs @returns {boolean} 실제로 바뀐 소리가 있는지 */
  function select(prefs) {
    const next = selectedSounds(kind, prefs);
    const changed = roles.some((role) => next[role]?.url !== sounds[role]?.url);
    sounds = next;
    return changed;
  }
  async function ready() {
    if (disposed) return false;
    context ||= new platform.AudioContext();
    const ctx = context;
    const resumed = ctx.resume();
    try {
      await Promise.all([resumed, ...roles.map((role) => load(ctx, /** @type {any} */ (sounds[role]).url))]);
      return !disposed;
    } catch {
      onError('소리를 재생하지 못했어요. 미리 듣기로 다시 시도해 주세요.');
      return false;
    }
  }
  function stopAll() {
    for (const source of sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    sources.clear();
  }
  /** @param {string} role @param {number} when @param {number|null} [duration] @param {boolean} [loop] */
  function play(role, when, duration = null, loop = false) {
    const sound = sounds[/** @type {import('./soundLibrary.js').SoundRole} */ (role)];
    if (!context || disposed || !sound || !roles.includes(/** @type {any} */ (role))) return;
    const clip = buffers.get(sound.url);
    if (!clip) return;
    const source = context.createBufferSource();
    const minimumLoopSeconds = sound.minimumLoopSeconds;
    if (loop && minimumLoopSeconds && clip.duration < minimumLoopSeconds) {
      const frames = Math.ceil(minimumLoopSeconds * context.sampleRate);
      const padded = context.createBuffer(clip.numberOfChannels, frames, context.sampleRate);
      for (let channel = 0; channel < clip.numberOfChannels; channel++) {
        padded.copyToChannel(clip.getChannelData(channel), channel);
      }
      source.buffer = padded;
    } else source.buffer = clip;
    source.loop = loop;
    source.connect(context.destination);
    sources.add(source);
    source.onended = () => {
      sources.delete(source);
      source.disconnect();
    };
    source.start(when);
    if (duration != null) source.stop(when + Math.max(0.001, duration));
  }
  /** @param {import("./alarmPlan.js").AlarmPlan|null} plan */
  function schedule(plan) {
    previewToken++;
    stopAll();
    if (!plan || !context || disposed) return;
    const now = context.currentTime + 0.01;
    if (plan.tick) play('tick', now, plan.endIn, true);
    if (plan.warningIn != null) play('warning', now + plan.warningIn, plan.warningFor, true);
    if (plan.end && plan.endIn != null) play('end', now + plan.endIn);
  }
  /** 고른 소리를 들려줍니다. 반복음은 PREVIEW_SECONDS 동안 반복하고, 종료음은 한 번 끝까지 울립니다.
   * @param {string} role */
  async function preview(role) {
    if (!roles.includes(/** @type {any} */ (role))) return;
    const token = ++previewToken;
    if (!(await ready()) || !context || token !== previewToken) return;
    stopAll();
    if (role === 'end') play('end', context.currentTime);
    else play(role, context.currentTime, PREVIEW_SECONDS[/** @type {'tick'|'warning'} */ (role)], true);
  }
  function dispose() {
    disposed = true;
    previewToken++;
    stopAll();
    void context?.close();
  }
  return { select, ready, schedule, stopAll, preview, dispose };
}
