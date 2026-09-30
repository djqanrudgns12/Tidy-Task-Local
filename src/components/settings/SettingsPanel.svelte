<script>
  // 설정을 한 카드로 묶고 제목·설명·오른쪽 조작을 같은 자리에 둡니다.
  // 글자와 색은 부모의 설정을 따라, 글자 크기·테마를 바꿔도 카드마다 어긋나지 않습니다.
  import IconBubble from './IconBubble.svelte';

  /** @type {{
   *   icon: any, title: string, caption?: string, tag?: string, tone?: string,
   *   aside?: import('svelte').Snippet, children?: import('svelte').Snippet,
   * }} */
  let { icon, title, caption = '', tag = '', tone = 'accent', aside, children } = $props();
  const titleId = $props.id();
</script>

<section class="panel" aria-labelledby={titleId}>
  <header>
    <IconBubble {icon} {tone} />
    <span class="identity">
      <span class="heading"><h2 id={titleId}>{title}</h2>{#if tag}<span class="tag">{tag}</span>{/if}</span>
      {#if caption}<small>{caption}</small>{/if}
    </span>
    {#if aside}<span class="aside">{@render aside()}</span>{/if}
  </header>
  {#if children}<div class="content">{@render children()}</div>{/if}
</section>

<style>
  .panel {
    padding: 10px;
    border: 1px solid var(--st-line);
    border-radius: 17px;
    background: var(--st-panel);
    box-shadow: 0 2px 7px rgba(15, 23, 42, 0.025);
  }
  header { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .identity { flex: 1; min-width: 0; }
  .heading { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  h2 { margin: 0; color: var(--st-ink); font-size: 0.94em; line-height: 1.4; font-weight: 800; }
  small { display: block; margin-top: 2px; color: var(--st-muted); font-size: 0.72em; line-height: 1.45; }
  .tag {
    border-radius: 99px;
    padding: 1px 6px;
    background: var(--st-accent-soft);
    color: var(--st-accent);
    font-size: 0.65em;
    font-weight: 700;
    white-space: nowrap;
  }
  .aside { flex: none; display: flex; align-items: center; }
  .content { margin-top: 8px; }
  .content :global(.row + .row) { margin-top: 5px; }
</style>
