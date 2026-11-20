// ═══════════════════════════════════════════════════════════════════
// [메모 창 → 달력 창 모양] 달력 창이 메모 창과 같은 테마·다크 모드·화면 글꼴·크기로 보이도록 넘길 값입니다.
// 할 일 줄의 날짜 알약(TodoList)과 다중 선택 막대의 [D-Day](App)가 함께 씁니다.
// ═══════════════════════════════════════════════════════════════════

/**
 * @param {{
 *   uiFontFamily?: string, uiFontSize?: number, isDarkMode?: boolean, themeColor: string,
 *   allFonts: ReadonlyArray<{ name: string, family: string }>,
 *   customFonts: ReadonlyArray<{ name: string, path?: string }>,
 * }} state
 */
export function memoPickerAppearance(state) {
  const name = state.uiFontFamily || '메이플스토리 L';
  const font = state.allFonts.find((f) => f.name === name);
  const custom = state.customFonts.find((f) => f.name === name);
  return {
    isDarkMode: !!state.isDarkMode,
    themeColor: state.themeColor,
    fontFamily: font ? font.family : '"Gulim", sans-serif',
    fontSizePt: state.uiFontSize || 10,
    customFont: custom && custom.path ? { name: custom.name, path: custom.path } : null,
  };
}
