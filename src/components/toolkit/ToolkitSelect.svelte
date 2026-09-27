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
    // font: 항목 이름을 그 글꼴로 그려 미리 보여 줍니다. note: 이름 뒤의 작은 설명(예: 내 글꼴).
    options: { value: string; label: string; swatch?: string; font?: string; note?: string }[];
    onchange: (value: string) => void;
    disabled?: boolean;
  }>();
</script>

<Select.Root type="single" {value} onValueChange={onchange} {disabled}>
  <Select.Trigger class="tk-select" aria-label={label}
    ><span class="tk-select-value">{options.find((option: { value: string; label: string }) => option.value === value)
      ?.label}</span><ChevronDown size={14} /></Select.Trigger
  >
  <Select.Portal
    ><Select.Content class="tk-select-content" sideOffset={5} align="end"
      ><Select.Viewport>
        {#each options as option}<Select.Item
            value={option.value}
            label={option.label}
            class="tk-select-item"
            >{#if option.swatch}<span class="tk-option-swatch" style:background={option.swatch} aria-hidden="true"></span>{/if}<span class="tk-option-label" style:font-family={option.font}>{option.label}</span>{#if option.note}<span class="tk-option-note">{option.note}</span>{/if}{#if option.value === value}<Check size={14} />{/if}</Select.Item
          >{/each}
      </Select.Viewport></Select.Content
    ></Select.Portal
  >
</Select.Root>
