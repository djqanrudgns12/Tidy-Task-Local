<script>
  import { BUILTIN_FONTS } from "../../lib/builtinFonts.js";
  import { TIDY_THEMES, getTidyTheme } from "../../lib/themes.js";
  /** @type {{settings:import('../../lib/meal/types').MealSettings;main?:import('../../lib/meal/types').MainAppearance;children:import('svelte').Snippet}} */
  let { settings, main = {}, children } = $props();
  const theme = $derived(
    getTidyTheme(
      settings.appearance.theme === "follow"
        ? main.themeColor
        : settings.appearance.theme,
    ) || TIDY_THEMES[1],
  );
  const dark = $derived(
    settings.appearance.dark === "follow"
      ? Boolean(main.isDarkMode)
      : settings.appearance.dark === "dark",
  );
  const selectedFont = $derived(
    settings.appearance.font === "follow"
      ? main.uiFontFamily || "메이플스토리 L"
      : settings.appearance.font,
  );
  const font = $derived(
    selectedFont === "메이플스토리 L" ? "Tidy Meal Maple" : selectedFont,
  );
</script>

<div
  class="meal-frame"
  class:dark
  style:--meal-bg={dark ? "#23272e" : theme.tidy.bg}
  style:--meal-surface={dark ? "#2b3038" : "#ffffff"}
  style:--meal-section={dark ? "#303640" : theme.tidy.section}
  style:--meal-border={dark ? "#444c58" : theme.tidy.border}
  style:--meal-accent={dark ? theme.tidy.accentDark : theme.tidy.accent}
  style:--meal-ink={dark
    ? `color-mix(in srgb, ${theme.tidy.accentDark} 94%, white)`
    : `color-mix(in srgb, ${theme.tidy.accent} 65%, #111827)`}
  style:--meal-text={dark ? "#edf1f7" : "#26313b"}
  style:--meal-muted={dark ? "#b0bccb" : "#4f5a65"}
  style:--meal-warn={dark ? "#ffb8b2" : "#a32929"}
  style:--meal-warn-bg={dark ? "#452f33" : "#fff0ed"}
  style:--meal-scale={settings.appearance.scale}
  style:font-family={BUILTIN_FONTS.find((f) => f.name === font)?.family ||
    `"${font}", sans-serif`}
  style:letter-spacing={`${main.letterSpacing || 0}px`}
  style:opacity={settings.appearance.opacity}
>
  {@render children()}
</div>

<style>
  @font-face {
    font-family: "Tidy Meal Maple";
    src: url("../../assets/fonts/MaplestoryL.woff2") format("woff2");
    font-weight: 400;
    font-display: swap;
  }
  @font-face {
    font-family: "Tidy Meal Maple";
    src: url("../../assets/fonts/MaplestoryB.woff2") format("woff2");
    font-weight: 700;
    font-display: swap;
  }
  .meal-frame {
    height: 100dvh;
    width: 100%;
    overflow: hidden;
    background: var(--meal-bg);
    color: var(--meal-text);
    border: 1px solid var(--meal-border);
    border-radius: 14px;
    box-sizing: border-box;
    font-size: 13px;
    line-height: 1.5;
    container-type: size;
    color-scheme: light;
  }
  .dark {
    color-scheme: dark;
  }
  .meal-frame :global(*) {
    box-sizing: border-box;
  }
  .meal-frame :global(button),
  .meal-frame :global(input),
  .meal-frame :global(select) {
    font: inherit;
  }
  .meal-frame :global(button) {
    cursor: pointer;
  }
  .meal-frame :global(button:disabled) {
    cursor: default;
    opacity: 0.5;
  }
  .meal-frame :global(button:focus-visible),
  .meal-frame :global(input:focus-visible),
  .meal-frame :global(select:focus-visible),
  .meal-frame :global(summary:focus-visible) {
    outline: 2px solid var(--meal-ink);
    outline-offset: 2px;
  }
  .meal-frame :global(.icon-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--meal-muted);
    flex-shrink: 0;
  }
  .meal-frame :global(.icon-btn:hover) {
    background: var(--meal-section);
    color: var(--meal-ink);
  }
  .meal-frame :global(.primary) {
    border: 1px solid var(--meal-ink);
    background: var(--meal-ink);
    color: var(--meal-bg);
    border-radius: 8px;
    padding: 9px 14px;
    font-weight: 700;
  }
  .meal-frame :global(.secondary) {
    border: 1px solid var(--meal-border);
    background: var(--meal-surface);
    color: var(--meal-text);
    border-radius: 8px;
    padding: 7px 11px;
  }
  .meal-frame :global(.muted) {
    color: var(--meal-muted);
  }
  .meal-frame :global(.window-bar) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--meal-border);
    background: var(--meal-section);
    flex-shrink: 0;
    user-select: none;
  }
  .meal-frame :global(.window-bar strong) {
    flex: 1;
    font-size: 12px;
  }
  .meal-frame :global(.notice) {
    padding: 8px 12px;
    font-size: 11px;
    background: var(--meal-section);
    color: var(--meal-text);
    overflow-wrap: anywhere;
  }
  .meal-frame :global(.field) {
    width: 100%;
    border: 1px solid var(--meal-border);
    border-radius: 9px;
    padding: 10px;
    background: var(--meal-surface);
    color: var(--meal-text);
  }
  .meal-frame :global(.pill) {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--meal-border);
    background: var(--meal-section);
    border-radius: 6px;
    padding: 2px 6px;
    font-size: 10px;
    color: var(--meal-ink);
  }
</style>
