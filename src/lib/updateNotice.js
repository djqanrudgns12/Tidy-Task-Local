export const UPDATE_NOTICE_ID = 'v5.0.0';
export const UPDATE_NOTICE_WINDOW_LABEL = 'update-notice';
export const UPDATE_NOTICE_STORE_KEY = `update-notice:${UPDATE_NOTICE_ID}:hidden-until`;
export const UPDATE_NOTICE_DISMISSED_UNTIL = Number.MAX_SAFE_INTEGER;

export function getUpdateNoticeWindowOptions() {
  return {
    url: 'index.html',
    title: `Tidy Task ${UPDATE_NOTICE_ID} 업데이트`,
    width: 430,
    height: 650,
    minWidth: 320,
    minHeight: 460,
    decorations: false,
    transparent: false,
    backgroundColor: '#fffdf8',
    shadow: false,
    alwaysOnTop: false,
    center: true,
    visible: false,
    resizable: true,
    maximizable: false,
    skipTaskbar: false,
  };
}

export function shouldShowUpdateNotice(hiddenUntil, now = Date.now()) {
  return !Number.isFinite(hiddenUntil) || hiddenUntil <= now;
}

export function getTomorrowStart(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}
