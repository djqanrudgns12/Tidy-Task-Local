<script>
  // 설정 창의 묶음 하나: 이름표 딱지(제목) 아래에 둥근 조각들을 세웁니다.
  // 색·글자 크기는 SettingsModal이 정한 CSS 변수(--st-*)와 em 단위를 따르므로,
  // 테마·다크 모드·UI 글자 크기를 바꾸면 모든 묶음이 함께 바뀝니다.

  /** @type {{
   *   title: string, tag?: string,
   *   side?: import('svelte').Snippet,
   *   children: import('svelte').Snippet,
   * }} */
  let { title, tag = '', side, children } = $props();
  const titleId = $props.id();
</script>

<section class="set" aria-labelledby={titleId}>
  <header>
    <!-- 묶음 이름은 작은 이름표 딱지로 — 점무늬 바탕 위에서도 또렷하게 읽힙니다. -->
    <h2 id={titleId}>{title}</h2>
    <!-- 꼬리표: "바로 적용"·"모든 창"처럼 이 묶음이 언제 · 어디에 적용되는지 알려 줍니다. -->
    {#if tag}<span class="tag">{tag}</span>{/if}
    <!-- 곁 글: 지금 고른 값(예: 테마 이름)이나 한 줄 설명을 오른쪽에 둡니다. -->
    {#if side}<span class="side">{@render side()}</span>{/if}
  </header>
  {@render children()}
</section>

<style>
  .set {
    display: grid;
    gap: 7px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 22px;
    padding: 0 3px 0 1px;
  }
  h2 {
    margin: 0;
    padding: 2px 10px;
    border-radius: 99px;
    background: var(--st-accent-soft);
    color: var(--st-accent);
    font-size: 0.82em;
    font-weight: 800;
    line-height: 1.6;
    white-space: nowrap;
  }
  .tag {
    padding: 1px 8px;
    border: 1.5px dashed var(--st-accent-line);
    border-radius: 99px;
    color: var(--st-muted);
    font-size: 0.7em;
    font-weight: 700;
    line-height: 1.6;
    white-space: nowrap;
  }
  .side {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--st-muted);
    font-size: 0.76em;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
