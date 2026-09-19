<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { native } from '../../lib/toolkit/store.js';
  import { watchAppearance, appearanceStyle } from '../../lib/toolkit/appearance.js';
  import ToolkitToolbar from './ToolkitToolbar.svelte';
  import ToolkitSettings from './ToolkitSettings.svelte';
  import ToolkitMenu from './ToolkitMenu.svelte';
  import TimerApp from '../timers/TimerApp.svelte';
  import '../../lib/toolkit/toolkit.css';
  let { label } = $props<{ label: string }>();
  let appearance = $state<Record<string, any>>({});
  $effect(() => {
    document.documentElement.style.cssText = appearanceStyle(appearance);
  });
  const role = $derived(label.startsWith('timer-') ? label.split('-')[1] : label);
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
    if (native && role !== 'toolkit-menu' && role !== 'toolkit')
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
  {#if role === 'toolkit'}<ToolkitToolbar />
  {:else if role === 'toolkit-settings'}<ToolkitSettings />
  {:else if role === 'toolkit-menu'}<ToolkitMenu />
  {:else}<TimerApp kind={role} />{/if}
</div>
