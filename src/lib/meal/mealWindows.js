import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import {
  ensureWindowOnScreen,
  getMonitorGeometries,
} from "../windows/windowRegistry.js";
import { resolveSavedPosition } from "../windows/windowPlacement.js";
import { native, readMeal, readSettings } from "./mealStore.js";
const opening = new Map();
export async function restoreMealWindow() {
  if (!native) return;
  const win = getCurrentWindow();
  if (win.label !== "meal") return;
  const saved = await readMeal("window");
  if (saved) {
    await win.setSize(
      new LogicalSize(
        Math.max(180, saved.width || 320),
        Math.max(120, saved.height || 460),
      ),
    );
    const pos = resolveSavedPosition(saved, await getMonitorGeometries());
    if (pos) await win.setPosition(new PhysicalPosition(pos.x, pos.y));
    else await win.center();
  }
  await ensureWindowOnScreen(win);
  await win.show();
}
export async function openMealWindow(label = "meal") {
  if (!native) {
    window.location.search = `?meal-preview=${label}`;
    return;
  }
  if (opening.has(label)) return opening.get(label);
  const task = (async () => {
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.unminimize();
      await ensureWindowOnScreen(existing);
      await existing.show();
      await existing.setFocus();
      return;
    }
    const config = await readSettings(),
      saved = label === "meal" ? (await readMeal("window")) || {} : {};
    const width =
      label === "meal"
        ? Math.max(180, saved.width || 320)
        : label === "meal-search"
          ? 380
          : 370;
    const height =
      label === "meal"
        ? Math.max(120, saved.height || 460)
        : label === "meal-search"
          ? 520
          : 640;
    const win = new WebviewWindow(label, {
      url: "index.html",
      title:
        label === "meal"
          ? "오늘의 급식"
          : label === "meal-search"
            ? "학교 찾기"
            : "급식 설정",
      width,
      height,
      minWidth: label === "meal" ? 180 : 300,
      minHeight: label === "meal" ? 120 : 400,
      decorations: false,
      transparent: true,
      // Windows의 undecorated shadow는 투명 모서리에 1px 흰 윤곽을 추가합니다.
      // CSS 프레임이 자체 보더와 라운드를 그리므로 네이티브 그림자는 끕니다.
      shadow: false,
      resizable: true,
      visible: false,
      alwaysOnTop: config.behavior.pinned,
    });
    await new Promise((resolve, reject) => {
      win.once("tauri://created", resolve);
      win.once("tauri://error", reject);
    });
    const position = resolveSavedPosition(saved, await getMonitorGeometries());
    if (label === "meal" && position)
      await win.setPosition(new PhysicalPosition(position.x, position.y));
    else {
      const m = await currentMonitor();
      if (m)
        await win.setPosition(
          new PhysicalPosition(
            m.position.x + (m.size.width - width * m.scaleFactor) / 2,
            m.position.y + (m.size.height - height * m.scaleFactor) / 2,
          ),
        );
      else await win.center();
    }
    await ensureWindowOnScreen(win);
    await win.show();
    await win.setFocus();
  })();
  opening.set(label, task);
  try {
    await task;
  } finally {
    opening.delete(label);
  }
}
export async function openMeal() {
  await openMealWindow((await readSettings()).school ? "meal" : "meal-search");
}
export async function toggleMeal() {
  if (native) {
    const existing = await WebviewWindow.getByLabel("meal");
    if (existing) {
      await existing.close();
      return;
    }
  }
  await openMeal();
}
export async function launchMealOnce() {
  if (!native || getCurrentWindow().label !== "main") return;
  if (await invoke("meal_take_launch_token")) {
    const s = await readSettings();
    if (s.school && s.behavior.startup) await openMealWindow();
  }
}
