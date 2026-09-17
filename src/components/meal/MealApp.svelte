<script>
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import {
    native,
    readSettings,
    subscribeMeal,
    mainAppearance,
  } from "../../lib/meal/mealStore.js";
  import { normalizeMealSettings } from "../../lib/meal/mealSettings.js";
  import { registerFontFace } from "../../lib/fonts.js";
  import MealFrame from "./MealFrame.svelte";
  import { restoreMealWindow } from "../../lib/meal/mealWindows.js";
  import MealWindow from "./MealWindow.svelte";
  import MealSearchWindow from "./MealSearchWindow.svelte";
  import MealSettingsWindow from "./MealSettingsWindow.svelte";
  let { label = "meal" } = $props();
  let settings = $state(normalizeMealSettings());
  /** @type {import('../../lib/meal/types').MainAppearance} */ let main =
    $state({});
  /** @type {import('../../lib/meal/types').CustomFont[]} */ let customFonts =
    $state([]);
  let ready = $state(false),
    error = $state("");
  onMount(() => {
    let dead = false;
    /** @type {Array<()=>void>} */
    const clean = [];
    void (async () => {
      try {
        const off = await subscribeMeal(async () => {
          settings = await readSettings();
        });
        if (dead) off();
        else clean.push(off);
        settings = await readSettings();
        const offMain = await mainAppearance((m, f) => {
          main = m;
          customFonts = f;
        });
        if (dead) offMain();
        else clean.push(offMain);
        ready = true;
        await restoreMealWindow();
      } catch {
        error = "급식 설정을 읽지 못했어요. 창을 닫고 다시 열어 주세요.";
        if (native) void getCurrentWindow().show();
      }
    })();
    return () => {
      dead = true;
      clean.forEach((f) => f());
    };
  });
  $effect(() => {
    const selected =
      settings.appearance.font === "follow"
        ? main.uiFontFamily
        : settings.appearance.font;
    const font = customFonts.find((f) => f.name === selected);
    if (font) void registerFontFace(font.name, font.path);
  });
</script>

<MealFrame {settings} {main}
  >{#if error}<p class="notice" role="alert">
      {error}
    </p>{:else if ready}{#if label === "meal-search"}<MealSearchWindow
      />{:else if label === "meal-settings"}<MealSettingsWindow
        {settings}
        {main}
        {customFonts}
      />{:else}<MealWindow {settings} />{/if}{:else}<p class="notice">
      급식창을 준비하고 있어요.
    </p>{/if}</MealFrame
>
