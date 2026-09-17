import { mount } from "svelte";
import "./app.css";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMealWindowLabel } from "./lib/windows/windowLabels.js";

// 급식 창은 App의 저장·매니저 효과 자체를 실행하지 않는 독립 진입점을 사용합니다.
const label = isTauri()
  ? getCurrentWindow().label
  : new URLSearchParams(location.search).get("meal-preview");
async function start() {
  const target = document.getElementById("app");
  if (!target) throw new Error("Application root is missing");
  if (isMealWindowLabel(label)) {
    const { default: MealApp } =
      await import("./components/meal/MealApp.svelte");
    return mount(MealApp, { target, props: { label: label || "meal" } });
  }
  if (!isTauri() && import.meta.env.DEV && new URLSearchParams(location.search).has("notice-preview")) {
    const { default: UpdateNotice } = await import("./components/UpdateNotice.svelte");
    return mount(UpdateNotice, { target, props: { preview: true, previewDark: new URLSearchParams(location.search).has("notice-dark") } });
  }
  if (!isTauri() && import.meta.env.DEV && new URLSearchParams(location.search).has('header-preview')) {
    const { default: HeaderPreview } = await import('./dev/HeaderPreview.svelte');
    return mount(HeaderPreview, { target });
  }
  const Component =
    !isTauri() &&
    import.meta.env.DEV &&
    new URLSearchParams(location.search).has("meal-matrix")
      ? (await import("./components/meal/MealMatrix.svelte")).default
      : !isTauri() && new URLSearchParams(location.search).has("meal-design")
        ? (await import("./components/meal/MealDesign.svelte")).default
        : (await import("./App.svelte")).default;
  return mount(Component, { target });
}
const app = await start();

export default app;
