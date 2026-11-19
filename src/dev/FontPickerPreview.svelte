<script>
  // ═══════════════════════════════════════════════════════════════════
  // [개발·QA 전용] ?font-picker-preview 화면.
  // 15종 Tidy 테마 · 6종 Toolkit 테마 · 라이트/다크 · 커스텀 폰트 주입 ·
  // 창 크기 프리셋(380×500, 280×210, 200×180, 360×560)을 브라우저에서 실측 검수합니다.
  // ═══════════════════════════════════════════════════════════════════
  import { TIDY_THEMES, getTidyTheme } from '../lib/themes.js';
  import { TOOLKIT_THEMES } from '../lib/toolkit/themes.js';
  import { resolveFontFamilyStack } from '../lib/fonts/fontCatalog.js';
  import { fontPickerThemeToStyle, resolveFontPickerTokens } from '../lib/fonts/fontPickerTheme.js';
  import FontPickerPanel from '../components/fontPicker/FontPickerPanel.svelte';
  import FontPickerTrigger from '../components/fontPicker/FontPickerTrigger.svelte';

  const params = new URLSearchParams(location.search);
  const initSource = /** @type {'tidy' | 'toolkit'} */ (params.get('source') === 'toolkit' ? 'toolkit' : 'tidy');
  let themeSource = $state(initSource);
  let themeId = $state(params.get('theme') || (initSource === 'toolkit' ? 'sage' : 'amber'));
  let isDarkMode = $state(params.has('dark') || params.get('dark') === '1');
  let selectedFont = $state(params.get('font') || '메이플스토리 L');
  let includeCustom = $state(params.has('custom'));
  let showStandalonePanel = $state(!params.has('trigger-only'));

  const customFonts = $derived(
    includeCustom
      ? [
          { name: '우리반 칠판체', path: 'C:/mock/class.ttf' },
          { name: '선생님 손글씨', path: 'C:/mock/teacher.otf' },
        ]
      : [],
  );

  const tokens = $derived(resolveFontPickerTokens({ source: themeSource, themeId, isDarkMode }));
  const themeStyle = $derived(fontPickerThemeToStyle(tokens));
  const previewStack = $derived(resolveFontFamilyStack(selectedFont, customFonts));
  const tidyBg = $derived(isDarkMode ? '#1e212b' : (getTidyTheme(themeId)?.tidy?.bg || '#fdfaf3'));
</script>

<div class="qa-shell" style="background:{tidyBg}; color:{isDarkMode ? '#e5e7eb' : '#1e293b'};">
  <div class="qa-controls">
    <label>
      소스
      <select bind:value={themeSource} onchange={() => { themeId = themeSource === 'toolkit' ? 'sage' : 'amber'; }}>
        <option value="tidy">Tidy (15종)</option>
        <option value="toolkit">Toolkit (6종)</option>
      </select>
    </label>
    <label>
      테마
      <select bind:value={themeId}>
        {#each (themeSource === 'toolkit' ? TOOLKIT_THEMES : TIDY_THEMES) as t (t.id)}
          <option value={t.id}>{t.label} ({t.id})</option>
        {/each}
      </select>
    </label>
    <label class="qa-check">
      <input type="checkbox" bind:checked={isDarkMode} /> 다크 모드
    </label>
    <label class="qa-check">
      <input type="checkbox" bind:checked={includeCustom} /> 커스텀 글꼴(8탭)
    </label>
    <span class="qa-cur" data-testid="selected-font">선택: {selectedFont}</span>
  </div>

  <div class="qa-stage">
    <div class="qa-card">
      <div class="qa-label">툴바 트리거 (compact · start 정렬)</div>
      <div class="qa-row">
        <FontPickerTrigger
          pickerKey="preview-toolbar"
          value={selectedFont}
          variant="toolbar"
          align="start"
          {themeSource}
          {themeId}
          {isDarkMode}
          {customFonts}
          triggerClass="qa-trig-toolbar"
          onselect={(v) => { selectedFont = v; }}
        />
        <FontPickerTrigger
          pickerKey="preview-field"
          value={selectedFont}
          variant="field"
          align="end"
          {themeSource}
          {themeId}
          {isDarkMode}
          {customFonts}
          triggerClass="qa-trig-field"
          onselect={(v) => { selectedFont = v; }}
        />
      </div>
      <p class="qa-specimen" style:font-family={previewStack}>
        오늘의 할 일 · 교실 알림장 Abc 123 ({selectedFont})
      </p>
    </div>

    {#if showStandalonePanel}
      <div class="qa-panel-box" data-testid="standalone-panel">
        <FontPickerPanel
          value={selectedFont}
          {customFonts}
          {themeStyle}
          side="below"
          variant="window"
          onselect={(v) => { selectedFont = v; }}
          oncancel={() => {}}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: auto;
  }
  .qa-shell {
    min-height: 100vh;
    padding: 16px;
    box-sizing: border-box;
    font-family: "Malgun Gothic", sans-serif;
  }
  .qa-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    font-size: 12px;
  }
  .qa-controls select {
    margin-left: 4px;
    padding: 3px 6px;
    border-radius: 6px;
    border: 1px solid rgba(128, 128, 128, 0.35);
    background: transparent;
    color: inherit;
  }
  .qa-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .qa-cur {
    font-weight: 700;
  }
  .qa-stage {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
  }
  .qa-card {
    width: 340px;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid rgba(128, 128, 128, 0.25);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .qa-label {
    font-size: 11px;
    opacity: 0.7;
  }
  .qa-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .qa-row :global(.qa-trig-toolbar) {
    width: 96px;
    height: 26px;
    font-size: 11px;
    border-radius: 7px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    background: rgba(255, 255, 255, 0.65);
    color: #1e293b;
  }
  .qa-row :global(.qa-trig-field) {
    flex: 1;
    height: 32px;
    font-size: 12px;
    border-radius: 9px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    background: rgba(255, 255, 255, 0.65);
    color: #1e293b;
  }
  .qa-specimen {
    margin: 4px 0 0;
    font-size: 15px;
    line-height: 1.5;
  }
  .qa-panel-box {
    width: 252px;
    height: 332px;
  }
</style>
