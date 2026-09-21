<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { native } from "../../lib/toolkit/store.js";
  import {
    watchAppearance,
    appearanceStyle,
  } from "../../lib/toolkit/appearance.js";
  import { TIMER_KINDS } from "../../lib/toolkit/preferences.js";
  import ToolkitToolbar from "./ToolkitToolbar.svelte";
  import ToolkitMenu from "./ToolkitMenu.svelte";
  import "../../lib/toolkit/toolkit.css";
  // 툴바·메뉴 창은 늘 떠 있으므로 가볍게 둡니다. 설정·타이머는 그 창을 열 때만 불러옵니다.
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
    if (native && !role.endsWith("-menu") && role !== "toolkit")
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
  {:else if role === "toolkit-settings"}{#await import('./ToolkitSettings.svelte')}<div
        aria-label="툴킷 설정 준비 중"
      ></div>{:then module}<module.default />{:catch}<p role="alert">설정 화면을 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "toolkit-menu"}<ToolkitMenu />
  {:else if role === "toolkit-external-menu"}<ToolkitMenu kind="external" />
  {:else if role === "toolkit-context-menu"}<ToolkitMenu kind="context" />
  {:else if role === "focus-bell"}{#await import('../focus-bell/FocusBellApp.svelte')}<p>집중벨을 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">집중벨을 불러오지 못했어요. 창을 다시 열어주세요.</p>{/await}
  {:else if role === "tournament"}{#await import('../tournament/TournamentApp.svelte')}<p>토너먼트를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">토너먼트를 불러오지 못했어요.</p>{/await}
  {:else if role === "picker"}{#await import('../picker/PickerApp.svelte')}<p>뽑기를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">뽑기 화면을 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "noticeboard"}{#await import('../noticeboard/NoticeboardApp.svelte')}<div
        aria-label="알림장 준비 중"
      ></div>{:then module}<module.default
      />{/await}{:else if role === "roster"}{#await import('../classroom/RosterApp.svelte')}<p
      >
        학급 명단을 불러오고 있어요…
      </p>{:then module}<module.default
      />{/await}{:else if TIMER_KINDS.includes(role)}{#await import('../timers/TimerApp.svelte')}<div
        aria-label="타이머 준비 중"
      ></div>{:then module}<module.default kind={role} />{:catch}<p role="alert">타이머를 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}{:else}<p role="alert">알 수 없는 도구예요.</p>{/if}
</div>
