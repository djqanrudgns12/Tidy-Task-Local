<script lang="ts">
  import { Clock3, Hourglass, Timer, RectangleHorizontal } from 'lucide-svelte';
  let { kind, size = 20 } = $props<{ kind: string; size?: number }>();
  const Icon = $derived(
    (
      {
        digital: RectangleHorizontal,
        analog: Clock3,
        hourglass: Hourglass,
        stopwatch: Timer,
      } as Record<string, typeof Timer>
    )[kind] || Timer,
  );
</script>

<Icon {size} strokeWidth={1.8} />
