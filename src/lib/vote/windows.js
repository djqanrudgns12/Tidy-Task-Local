// 투표판(vote)·선생님 창(vote-teacher) 조작. 브라우저 미리보기에서는 새 탭·문서 전체 화면으로 흉내 냅니다.
import { getCurrentWindow, getAllWindows } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalSize, PhysicalPosition } from '@tauri-apps/api/dpi';
import { native } from '../toolkit/store.js';
import { openTool } from '../toolkit/windows.js';
import { getMonitorGeometries, ensureWindowOnScreen } from '../windows/windowRegistry.js';
import { boardPlacement, monitorIndexAt, teacherPlacement } from './placement.js';

export const BOARD_LABEL = 'vote';
export const TEACHER_LABEL = 'vote-teacher';

/** 전체 화면 켜고 끄기. @returns {Promise<boolean>} 바뀐 뒤 전체 화면인지 */
export async function toggleFullscreen() {
  if (native) {
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);
    return next;
  }
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return false;
  }
  await document.documentElement.requestFullscreen();
  return true;
}

/** @param {boolean} on */
export async function setPinned(on) {
  if (native) await getCurrentWindow().setAlwaysOnTop(on);
}

/**
 * 투표판이 지금 놓인 모니터(준비 화면 1번 카드의 체크와 [다른 모니터로 이동] 버튼).
 * key는 모니터 왼쪽 위 좌표입니다. 번호(순서)는 모니터를 꽂고 뺄 때 바뀔 수 있어 비교에 쓰지 않습니다.
 * @returns {Promise<{count:number, key:string|null}>}
 */
export async function boardMonitor() {
  if (!native) return { count: 1, key: null };
  const monitors = await getMonitorGeometries();
  if (!monitors.length) return { count: 1, key: null };
  const win = getCurrentWindow();
  // 최소화된 창의 좌표(-32000)는 위치가 아니므로 모니터를 모른다고 답합니다.
  if (await win.isMinimized()) return { count: monitors.length, key: null };
  const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  const m = monitors[monitorIndexAt(monitors, { x: pos.x + size.width / 2, y: pos.y + size.height / 2 })];
  return { count: monitors.length, key: `${m.bounds.x},${m.bounds.y}` };
}

/** 크기·위치를 두 번 적용합니다. 배율이 다른 모니터로 옮기면 Windows가 배율 변경에 맞춰 다시 잡으므로(toolkit.rs와 같은 이유).
 * @param {import('@tauri-apps/api/window').Window} win @param {{width:number,height:number}} size @param {{x:number,y:number}} pos */
async function applyTwice(win, size, pos) {
  for (let i = 0; i < 2; i++) {
    await win.setSize(new LogicalSize(size.width, size.height));
    await win.setPosition(new PhysicalPosition(pos.x, pos.y));
  }
}

/**
 * 투표판을 다음 모니터 가운데로 옮깁니다.
 * 전체 화면이었다면 풀고 옮긴 뒤 새 모니터에서 다시 전체 화면으로 켭니다(선생님이 켠 상태가 옮기면서 풀리지 않게).
 */
export async function moveToNextMonitor() {
  if (!native) return false;
  const win = getCurrentWindow();
  const monitors = await getMonitorGeometries();
  if (monitors.length < 2) return false;
  // 최소화된 채로 옮기면 좌표가 -32000이라 엉뚱한 모니터로 계산되므로 먼저 되살립니다.
  if (await win.isMinimized()) await win.unminimize();
  const wasFullscreen = await win.isFullscreen();
  if (wasFullscreen) await win.setFullscreen(false);
  const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  const here = monitorIndexAt(monitors, { x: pos.x + size.width / 2, y: pos.y + size.height / 2 });
  const target = monitors[(here + 1) % monitors.length];
  const place = boardPlacement(target);
  await applyTwice(win, place.logical, place.physical);
  await ensureWindowOnScreen(win);
  if (wasFullscreen) await win.setFullscreen(true);
  await win.setFocus();
  return true;
}

/** 창이 지금 전체 화면인지(창 밖에서 바뀐 경우까지 — 창 버튼 글자·준비 카드 체크를 실제 상태에 맞출 때). */
export async function isFullscreenNow() {
  if (native) return getCurrentWindow().isFullscreen();
  return Boolean(document.fullscreenElement);
}

/** 선생님 창을 열고 투표판이 없는 모니터에 놓습니다. 이미 열려 있으면 앞으로. */
export async function openTeacherWindow() {
  if (!native) {
    await openTool(TEACHER_LABEL);
    return;
  }
  const existing = await WebviewWindow.getByLabel(TEACHER_LABEL);
  await openTool(TEACHER_LABEL);
  if (existing) return;
  // 창이 만들어질 때까지 잠깐 기다립니다(최대 3초).
  let teacher = null;
  for (let i = 0; i < 30 && !teacher; i++) {
    teacher = await WebviewWindow.getByLabel(TEACHER_LABEL);
    if (!teacher) await new Promise((r) => setTimeout(r, 100));
  }
  const board = await WebviewWindow.getByLabel(BOARD_LABEL);
  if (!teacher || !board) return;
  const [monitors, bpos, bsize] = await Promise.all([getMonitorGeometries(), board.outerPosition(), board.outerSize()]);
  const place = teacherPlacement(monitors, { x: bpos.x + bsize.width / 2, y: bpos.y + bsize.height / 2 });
  if (!place) return;
  await applyTwice(teacher, place.logical, place.physical);
  await ensureWindowOnScreen(teacher);
}

/** 투표판 창에 키보드를 돌려줍니다(선생님 창에서 누른 뒤 — 다음 학생의 숫자키가 투표판으로 가게). */
export async function focusBoard() {
  if (!native) return false;
  const board = await WebviewWindow.getByLabel(BOARD_LABEL);
  if (!board) return false;
  await board.setFocus();
  return true;
}

/** 투표판을 앞으로(선생님 창의 [투표판 열기]). 닫혀 있으면 새로 엽니다. */
export async function showBoard() {
  await openTool(BOARD_LABEL);
}

export async function closeTeacherWindow() {
  if (!native) return;
  const teacher = await WebviewWindow.getByLabel(TEACHER_LABEL);
  if (teacher) await teacher.destroy();
}

/** 지금 열린 투표 창 라벨들(투표판이 떠 있는지 선생님 창이 확인). */
export async function openVoteWindows() {
  if (!native) return [BOARD_LABEL];
  return (await getAllWindows()).map((w) => w.label).filter((l) => l === BOARD_LABEL || l === TEACHER_LABEL);
}
