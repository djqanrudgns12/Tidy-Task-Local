// 캐릭터 그림·녹음 효과음 파일 목록(브라우저 전용 — Vite가 빌드할 때 폴더를 훑어 주소를 넣어 줌).
// 왜 이렇게 하는가: 파일이 없을 때 없는 주소를 요청해 오류가 나는 대신, 목록에 없으면 처음부터 번호 스티커·합성 소리를 씁니다.
// 파일을 넣는 곳: src/assets/vote/characters/{m1~m9,f1~f9}.webp, src/assets/vote/audio/{소리 id}[-변주].wav|ogg
//   예) vote.cast.wav, count.unfold-1.wav, count.unfold-2.wav (같은 소리의 변주는 번갈아 재생)

const characterModules = import.meta.glob('../../assets/vote/characters/*.{webp,png}', { eager: true, query: '?url', import: 'default' });
const audioModules = import.meta.glob('../../assets/vote/audio/*.{wav,ogg,mp3}', { eager: true, query: '?url', import: 'default' });
const speechModules = import.meta.glob('../../assets/vote/speech/*.mp3', { eager: true, query: '?url', import: 'default' });
export { default as SPEECH_MANIFEST } from '../../assets/vote/speech/manifest.json';
/** @type {Record<string,string>} */
export const SPEECH_FILES = Object.fromEntries(Object.entries(speechModules).map(([path, url]) => [path.split('/').pop() ?? '', /** @type {string} */ (url)]));

/** 캐릭터 id → 그림 주소. @type {Record<string, string>} */
export const CHARACTER_IMAGES = Object.fromEntries(
  Object.entries(characterModules).map(([path, url]) => [path.split('/').pop()?.replace(/\.(webp|png)$/, '') ?? '', /** @type {string} */ (url)]),
);

/** 소리 id → 녹음 주소들. @type {Record<string, string[]>} */
export const AUDIO_FILES = Object.entries(audioModules).reduce((acc, [path, url]) => {
  const name = (path.split('/').pop() ?? '').replace(/\.(wav|ogg|mp3)$/, '');
  const id = name.replace(/-\d+$/, '');
  (acc[id] ??= []).push(/** @type {string} */ (url));
  return acc;
}, /** @type {Record<string, string[]>} */ ({}));
