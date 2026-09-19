<script lang="ts">
  import { Switch } from 'bits-ui';
  let {
    checked,
    label,
    onchange,
    disabled = false,
  } = $props<{
    checked: boolean;
    label: string;
    onchange: (value: boolean) => void;
    disabled?: boolean;
  }>();
</script>

<Switch.Root {checked} {disabled} aria-label={label} onCheckedChange={onchange} class="tk-switch"
  ><Switch.Thumb class="tk-switch-thumb" /></Switch.Root
>
