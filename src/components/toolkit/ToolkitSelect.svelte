<script lang="ts">
  import { Select } from 'bits-ui';
  import { ChevronDown, ChevronUp, Check } from 'lucide-svelte';
  // font: 항목 이름을 그 글꼴로 그려 미리 보여 줍니다. note: 이름 뒤의 작은 설명(예: 내 글꼴).
  // group: 같은 값끼리 묶음 제목 아래로 모읍니다(묶음 순서는 처음 나온 순서). 목록이 길 때 훑어보기 쉽게 합니다.
  type Option = { value: string; label: string; swatch?: string; font?: string; note?: string; group?: string };
  let {
    value,
    label,
    options,
    onchange,
    disabled = false,
    contentClass = '',
  } = $props<{
    value: string;
    label: string;
    options: Option[];
    onchange: (value: string) => void;
    disabled?: boolean;
    // 목록 창에 덧붙일 클래스(예: 목록 최대 높이를 다르게 둘 때).
    contentClass?: string;
  }>();
  const groups = $derived.by(() => {
    const out: { label: string; options: Option[] }[] = [];
    for (const option of options as Option[]) {
      const name = option.group ?? '';
      let group = out.find((entry) => entry.label === name);
      if (!group) out.push((group = { label: name, options: [] }));
      group.options.push(option);
    }
    return out;
  });
</script>

{#snippet item(option: Option)}<Select.Item value={option.value} label={option.label} class="tk-select-item"
    >{#if option.swatch}<span class="tk-option-swatch" style:background={option.swatch} aria-hidden="true"></span>{/if}<span
      class="tk-option-label"
      style:font-family={option.font}>{option.label}</span
    >{#if option.note}<span class="tk-option-note">{option.note}</span>{/if}{#if option.value === value}<Check
        size={14}
      />{/if}</Select.Item
  >{/snippet}

<Select.Root type="single" {value} onValueChange={onchange} {disabled}>
  <Select.Trigger class="tk-select" aria-label={label}
    ><span class="tk-select-value">{options.find((option: Option) => option.value === value)?.label}</span><ChevronDown
      size={14}
    /></Select.Trigger
  >
  <!-- 목록은 body로 옮겨 그려 패널의 스크롤·겹침 패널에 잘리지 않습니다. 창 가장자리에서는 위/아래로 뒤집히고
       (avoidCollisions), 남은 높이만큼 줄어 안에서 스크롤됩니다. collisionPadding은 목록이 창 테두리에 붙어
       그림자·둥근 모서리가 잘려 보이지 않게 두는 여백입니다.
       bits-ui는 목록의 스크롤 막대를 숨기므로, 위·아래에 더 볼 항목이 있을 때만 화살표 줄을 보여 줍니다
       (마우스를 올리면 그 방향으로 저절로 넘어감). 휠·키보드 이동은 그대로 됩니다. -->
  <Select.Portal
    ><Select.Content class={`tk-select-content ${contentClass}`.trim()} sideOffset={5} align="end" collisionPadding={8}
      ><Select.ScrollUpButton class="tk-select-scroll" aria-hidden="true"><ChevronUp size={14} /></Select.ScrollUpButton
      ><Select.Viewport>
        {#each groups as group (group.label)}{#if group.label}<Select.Group class="tk-select-group"
              ><Select.GroupHeading class="tk-select-group-heading">{group.label}</Select.GroupHeading
              >{#each group.options as option (option.value)}{@render item(option)}{/each}</Select.Group
            >{:else}{#each group.options as option (option.value)}{@render item(option)}{/each}{/if}{/each}
      </Select.Viewport><Select.ScrollDownButton class="tk-select-scroll" aria-hidden="true"
        ><ChevronDown size={14} /></Select.ScrollDownButton
      ></Select.Content
    ></Select.Portal
  >
</Select.Root>
