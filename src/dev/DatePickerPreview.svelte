<script>
  // 개발용 시안: 브라우저에서 ?date-picker-preview 로 날짜 선택 카드를 확인합니다.
  // 실제 창 이동·배치(Tauri)는 없고, 카드 모양·키보드·빠른 선택 동작만 봅니다.
  import CalendarPanel from '../components/datePicker/CalendarPanel.svelte';
  import { calendarPalette, toStyleText } from '../lib/datePicker/palette.js';
  import { TIDY_THEMES } from '../lib/themes.js';
  import { todayKey } from '../lib/dateUtils.js';
  import { BUILTIN_FONTS } from '../lib/builtinFonts.js';

  const params = new URLSearchParams(location.search);
  let themeId = $state(params.get('theme') || 'amber');
  let dark = $state(params.has('dark'));
  let fontSize = $state(Number(params.get('size')) || 10);
  let fontName = $state(params.get('font') || '메이플스토리 L');
  let value = $state(params.get('value') || '');
  let today = $state(params.get('today') || todayKey());
  let log = $state(/** @type {string[]} */ ([]));
  let session = $state(0);

  let family = $derived(BUILTIN_FONTS.find((f) => f.name === fontName)?.family || '"Gulim", sans-serif');
  let styleText = $derived(`${toStyleText(calendarPalette(themeId, dark))};font-family:${family};font-size:${fontSize}pt`);

  /** @param {string} line */
  function record(line) {
    log = [line, ...log].slice(0, 6);
  }
</script>

<main class="preview" class:dark>
  <section class="controls">
    <label>테마
      <select bind:value={themeId}>
        {#each TIDY_THEMES as t}<option value={t.id}>{t.label}</option>{/each}
      </select>
    </label>
    <label><input type="checkbox" bind:checked={dark} /> 다크</label>
    <label>글자 {fontSize}pt <input type="range" min="6" max="15" bind:value={fontSize} /></label>
    <label>글꼴
      <select bind:value={fontName}>
        {#each BUILTIN_FONTS as f}<option value={f.name}>{f.name}</option>{/each}
      </select>
    </label>
    <label>값 <input type="text" bind:value placeholder="YYYY-MM-DD" size="10" /></label>
    <label>오늘 <input type="text" bind:value={today} size="10" /></label>
    <button type="button" onclick={() => { session += 1; }}>다시 열기</button>
  </section>

  <div class="stage" style={styleText}>
    {#key session}
      <CalendarPanel
        {value}
        todayKey={today}
        draggable
        onpick={(key) => { value = key; record(`선택 ${key}`); session += 1; }}
        onclear={() => { value = ''; record('지우기'); session += 1; }}
        onescape={() => record('Esc 닫기')}
      />
    {/key}
  </div>

  <ol class="log">{#each log as line}<li>{line}</li>{/each}</ol>
</main>

<style>
  .preview {
    min-height: 100vh;
    padding: 16px;
    box-sizing: border-box;
    background: #e9e4d6;
    font: 13px/1.4 'Malgun Gothic', sans-serif;
    color: #1f2937;
  }
  .preview.dark { background: #1a1d24; color: #e2e8f0; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 16px; align-items: center; }
  .controls label { display: flex; gap: 6px; align-items: center; }
  .stage { display: inline-block; padding: 10px; }
  .log { font-size: 12px; opacity: 0.8; }
</style>
