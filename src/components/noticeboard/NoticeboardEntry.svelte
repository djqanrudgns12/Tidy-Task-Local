<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { native } from "../../lib/toolkit/store.js";
  import {
    watchAppearance,
    appearanceStyle,
  } from "../../lib/toolkit/appearance.js";
  import NoticeboardApp from "./NoticeboardApp.svelte";
  import "../../lib/toolkit/toolkit.css";

  let appearance = $state<Record<string, any>>({});
  $effect(() => {
    document.documentElement.style.cssText = appearanceStyle(appearance);
  });

  onMount(() => {
    let disposed = false;
    let off = () => {};
    void watchAppearance((value) => {
      if (!disposed) appearance = value;
    })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else off = unsubscribe;
      })
      .catch(() => {});
    if (native)
      void getCurrentWindow()
        .show()
        .then(() => getCurrentWindow().setFocus())
        .catch(() => {});
    return () => {
      disposed = true;
      off();
    };
  });
</script>

<div class="tk-root" style={appearanceStyle(appearance)}>
  <NoticeboardApp />
</div>
