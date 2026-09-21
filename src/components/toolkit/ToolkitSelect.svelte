<script lang="ts">
  import { Select } from 'bits-ui';
  import { ChevronDown, Check } from 'lucide-svelte';
  let {
    value,
    label,
    options,
    onchange,
    disabled = false,
  } = $props<{
    value: string;
    label: string;
    options: { value: string; label: string; swatch?: string }[];
    onchange: (value: string) => void;
    disabled?: boolean;
  }>();
</script>

<Select.Root type="single" {value} onValueChange={onchange} {disabled}>
  <Select.Trigger class="tk-select" aria-label={label}
    >{options.find((option: { value: string; label: string }) => option.value === value)
      ?.label}<ChevronDown size={14} /></Select.Trigger
  >
  <Select.Portal
    ><Select.Content class="tk-select-content" sideOffset={5} align="end"
      ><Select.Viewport>
        {#each options as option}<Select.Item
            value={option.value}
            label={option.label}
            class="tk-select-item"
            >{#if option.swatch}<span class="tk-option-swatch" style:background={option.swatch} aria-hidden="true"></span>{/if}<span class="tk-option-label">{option.label}</span>{#if option.value === value}<Check size={14} />{/if}</Select.Item
          >{/each}
      </Select.Viewport></Select.Content
    ></Select.Portal
  >
</Select.Root>
