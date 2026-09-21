<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { native } from "../../lib/toolkit/store.js";
  import {
    watchAppearance,
    appearanceStyle,
  } from "../../lib/toolkit/appearance.js";
  import ToolkitToolbar from "./ToolkitToolbar.svelte";
  import ToolkitSettings from "./ToolkitSettings.svelte";
  import ToolkitMenu from "./ToolkitMenu.svelte";
  import TimerApp from "../timers/TimerApp.svelte";
  import "../../lib/toolkit/toolkit.css";
  let { label } = $props<{ label: string }>();
  let appearance = $state<Record<string, any>>({});
  $effect(() => {
    document.documentElement.style.cssText = appearanceStyle(appearance);
  });
  const role = $derived(
    label.startsWith("timer-") ? label.split("-")[1] : label,
  );
  onMount(() => {
    let disposed = false;
    let off = () => {};
    void watchAppearance((a) => {
      if (!disposed) appearance = a;
    })
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      })
      .catch(() => {});
    if (native && role !== "toolkit-menu" && role !== "toolkit")
      void getCurrentWindow()
        .show()
        .then(() => getCurrentWindow().setFocus());
    return () => {
      disposed = true;
      off();
    };
  });
</script>

<div class="tk-root" style={appearanceStyle(appearance)}>
  {#if role === "toolkit"}<ToolkitToolbar />
  {:else if role === "toolkit-settings"}<ToolkitSettings />
  {:else if role === "toolkit-menu"}<ToolkitMenu />
  {:else if role === "picker"}{#await import('../picker/PickerApp.svelte')}<p>뽑기를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">뽑기 화면을 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "noticeboard"}{#await import('../noticeboard/NoticeboardApp.svelte')}<div
        aria-label="알림장 준비 중"
      ></div>{:then module}<module.default
      />{/await}{:else if role === "roster"}{#await import('../classroom/RosterApp.svelte')}<p
      >
        학급 명단을 불러오고 있어요…
      </p>{:then module}<module.default
      />{/await}{:else if ["digital", "analog", "hourglass", "stopwatch"].includes(role)}<TimerApp
      kind={role}
    />{:else}<p role="alert">알 수 없는 도구예요.</p>{/if}
</div>
