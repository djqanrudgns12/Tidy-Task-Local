import { fitNoticeSize } from './toolkitRelease.js';

// 공지 ID는 앱의 패치 버전과 독립적입니다. 패치마다 저절로 바뀌지 않고, 새로 알릴 것이 있을 때만 손으로 올립니다.
// ID를 바꾸면 숨김 키도 바뀌어, 이전 공지를 "그만보기"한 사용자에게도 한 번 더 뜹니다.
// 5.6.2(2026-09-27): 사용자 요청으로 공지를 5.6.2로 올리고 첫 탭에 5.6.2의 달라진 점을 더했습니다.
export const RELEASE_NEWS_ID = 'v5.6.2';
export const RELEASE_NEWS_LABEL = 'release-news';
export const RELEASE_NEWS_KEY = `update-notice:${RELEASE_NEWS_ID}:hidden-until`;
export const DISMISSED_FOREVER = Number.MAX_SAFE_INTEGER;
export const STARTUP_PROFILE_KEY = 'startup-profile:v1';

/** 메인 창이 새 기본값을 저장하기 전에만 호출합니다.
 * pending=new를 보존하므로 처음 설정 도중 강제 종료해도 다음 실행에서 이어갑니다.
 * @param {unknown} profile @param {unknown} main @param {unknown} legacyTodos */
export function classifyStartupProfile(profile, main, legacyTodos) {
  if (profile === 'new' || profile === 'existing') return profile;
  const savedMain = !!main && typeof main === 'object' && !Array.isArray(main) && Object.keys(main).length > 0;
  return savedMain || Array.isArray(legacyTodos) ? 'existing' : 'new';
}

/** @param {unknown} value @param {number} [now] */
export function shouldShowReleaseNews(value, now = Date.now()) {
  return typeof value !== 'number' || !Number.isFinite(value) || value <= now;
}

/** @param {Date} [now] */
export function tomorrowStart(now = new Date()) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

/** @param {{size:{width:number,height:number}} | null} [workArea] @param {number} [scale] */
export function getReleaseNewsOptions(workArea = null, scale = 1) {
  const preferred = {
    url: 'index.html', title: `Tidy Task ${RELEASE_NEWS_ID} · 새로운 소식`,
    width: 600, height: 1040, minWidth: 360, minHeight: 420,
    center: true, decorations: false, transparent: false,
    backgroundColor: '#faf9f5', visible: false, resizable: true,
    maximizable: false, skipTaskbar: false,
  };
  const fitted = fitNoticeSize(preferred, workArea, scale);
  // 높이만 줄이면 가로로 납작해지므로, 작은 화면에서도 세로형 비율을 유지합니다.
  const width = Math.min(fitted.width, Math.max(fitted.minWidth, Math.round(fitted.height * preferred.width / preferred.height)));
  return { ...fitted, width };
}

/** 처음 설정이 닫힌 다음 도구를 열고, 최신 공지 하나만 확인합니다.
 * @param {boolean} needsSetup
 * @param {{setup:()=>Promise<unknown>,launch:()=>Promise<unknown>,news:()=>Promise<unknown>}} actions */
export async function runReleaseStartup(needsSetup, actions) {
  if (needsSetup) await actions.setup();
  await actions.launch();
  await actions.news();
}
