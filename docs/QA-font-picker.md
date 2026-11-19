# 글꼴 카탈로그(72종) · 독립 글꼴 선택 팝업(`font-picker`) QA 검수 기록

- **대상 PRD:** `docs/PRD-font-catalog-and-picker-popup.md` (v2.0)
- **검수 일자:** 2026-11-19
- **확정 구성:** H3(상단 미니 카테고리 탭 + 인라인 굵기/시리즈 캡슐) + D1(에어리 포스트잇) + 비이동(Non-Draggable) 독립 팝업 창 `font-picker` (`ctx-menu` 내부만 동일 패널 `variant="inline"`)

---

## 1. 자동화 검증 결과 (완료)

### 1-1. 프론트엔드 단위·계약 테스트 (`node --test`)
- 실행: `node --test src/lib/fonts/*.test.js src/lib/editor/richTextFormat.test.js`
- 결과: **24 / 24 통과 (0 실패)**
  - `fontCatalog.test.js`:
    - 6개 카테고리 · 43개 패밀리 행 · 72종 내장 글꼴 중복 없음 검증
    - 기존 48종 내장 글꼴(교보 손글씨 2019/2023/2024/2025, 기존 여기어때 잘난체 포함) 100% 보존 검증
    - 62종 `.woff2` 파일이 `src/assets/fonts/` 및 `src/app.css` `@font-face`와 1:1 일치 검증
    - 커스텀 글꼴 유무에 따른 `내 글꼴` 동적 섹션 생성 및 중복 제거 검증
    - `compactFontLabel` 폭별 축약 및 `FontPickerWindow.svelte` 비이동(Non-Draggable) 정적 계약 검증
  - `fontPickerProtocol.test.js`:
    - `placeFontPicker` 높이 적응형 수직 밀착(`below` → `above` → 높이 축소 `200~331px` → 좌/우 → `overlay`) 검증
    - `align: 'start' | 'end'`, 4K 200% 다중 배율 물리 좌표 환산, 화면 우측 클램핑 검증
    - `resolvePickerWidth(252~288)`, `normalizeOpenPayload` / `normalizeClosedPayload`(`context-menu` 포함) 검증
    - `isDataWindowLabel('font-picker') === false` 및 `FONT_PICKER_WINDOW_OPTIONS`(`shadow: false`, `transparent: true`, `resizable: false`, `skipTaskbar: true`) 검증
  - `fontPickerTheme.test.js`:
    - Tidy 15종 × 라이트/다크 30조합 + Toolkit 6종 × 라이트/다크 12조합 = **42조합 전수** WCAG AA 명도 대비 및 명시적 6자리 hex/rgba 형식(`light-dark()`/`color-mix()` 금지) 검증
    - `sanitizeFontPickerThemeStyle` CSS 주입 차단 검증
  - `richTextFormat.test.js`:
    - `matchFontName` 접두어 겹침(`여기어때 잘난체` / `여기어때 잘난체 2` / `여기어때 잘난체 고딕`, `교보 손글씨 2019~2025`, `페이퍼로지` 5굵기) 정확 일치 우선 검증
- 참고: 전체 `npm test` 실행 시 `font-picker`와 무관한 동시 작업 중 파일(`src/lib/group-picker/allocation.js`, `choreography/train.js`) 외 모든 테스트 통과 확인.

### 1-2. 타입·템플릿 검사 및 프로덕션 빌드
- `npm run check` (`svelte-check --threshold warning`): **0 errors, 0 warnings**
- `npm run build` (`vite build`): **5,488 모듈 변환 및 프로덕션 번들 성공** (14.05s)

### 1-3. Rust 백엔드 테스트 (`cargo test`)
- 실행: `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- 결과: **145 passed, 0 failed, 3 ignored**
  - `tray::tests::hidden_popup_windows_are_transient_not_data` (`"font-picker"` 포함) 통과
  - `analytics::tests::every_registered_tool_and_surface_has_an_explicit_classification` (`"font-picker" => "other"`) 통과

### 1-4. Playwright 브라우저 시각·상호작용 QA (`scripts/qa-font-picker.cjs`)
- 실행 환경: 로컬 Vite 개발 서버 (`http://127.0.0.1:5189`) + Chromium headless (`deviceScaleFactor: 2`)
- 결과: **16 / 16 통과, 콘솔·페이지 에러 0건**
  1. 7개 기본 카테고리 탭 1줄 수납 (`33px`, 가로 오버플로우 0px)
  2. 43개 패밀리 행 및 모든 굵기 칩 가로 무잘림 전수 검증 (43행 통과)
  3. `페이퍼로지 EB` 칩 호버 시 행 이름 computed `fontFamily` 실시간 전환 (`"페이퍼로지 M"` → `"페이퍼로지 EB"`)
  4. `교보 손글씨` 4종(`19/23/24/25`) 보존 + `25` 호버 실시간 글꼴 변신 및 선택 반영
  5. `여기어때 잘난체` 3종(`1/2/고딕`) 보존 및 전체 탭 복귀
  6. 5종 테마 시각 스냅샷 육안 검수 완료 (`01~08.png`: 앰버·로즈·크라프트·페리윙클 다크·툴킷 오션·노르딕 블루 8탭 4×2 그리드)
  7. 최소 메모창(`280×210` → `251×197 at (23,5)`) 및 초소형 Tiny Note(`200×180` → `186×166 at (7,4)`) 뷰포트 무잘림 검증
  8. 마우스 오픈 직후 `ArrowDown` 목록 포커스 진입, `Escape` 닫힘, 트리거 재클릭 토글 닫힘 검증
  9. 실제 `SettingsModal` (`?header-preview&settings&theme=periwinkle`) 글자 탭 연동(열기 → 고딕 → `프리젠테이션 SB` 선택 → 화면 글꼴 `Esc` 격리 닫힘) + 스크린샷(`09-settings-memo-font-open.png`) 육안 검수 완료
  10. 실제 `ContextMenu` (`?context-menu-preview=text&drag`) 인라인 H3 글꼴 드로어(`194×216`, 4열 균형 탭 그리드, 전 행 가로 무잘림, 선택 후 자동 닫힘) + 스크린샷(`10-context-menu-inline-drawer.png`) 육안 검수 완료

---

## 2. 검수 중 발견·수정한 이슈
1. **7탭 줄바꿈 및 8탭 외톨이 행:** 252px 폭에서 7탭이 2줄(56px)로 넘치던 문제를 탭 패딩·자간 조정으로 1줄(33px)에 수납하고, 커스텀 글꼴 8탭은 4×2 대칭 그리드로 전환.
2. **`scrollIntoView` 조상 스크롤 연쇄 + 초소형 창 즉시 닫힘:** `scrollRowIntoList()`로 내부 목록 `scrollTop`만 직접 제어하도록 바꾸고, 열기 직후 100ms 스크롤 안정화 가드를 포탈과 호스트 도킹 감시 양쪽에 적용.
3. **마우스 오픈 직후 `Escape`/`ArrowDown` 미응답:** 마우스 클릭(`viaKeyboard=false`) 직후 포커스가 `.fp-root` 밖에 있던 문제를 `FontPickerTrigger` 문서 캡처 리스너와 `FontPickerWindow` `<svelte:window onkeydown>` + `focusSelectedOrFirst()`로 해결.
4. **직렬 큐 대기 중 `open` vs `close`/`requester-destroyed` 경합:** `FontPickerWindow.svelte`에서 아직 실행 전인 대기 요청의 `latestOpenId`도 `EV.close`·`requester-destroyed` 수신 시 즉시 무효화하도록 보강.
5. **우클릭 메뉴와 `font-picker` 60ms 겹침 방지:** `fontPickerClient.svelte.js`가 `tidy-context-menu-open` 이벤트를 수신하면 즉시 팝업을 닫도록 연동.
6. **인라인 드로어(`194px`) 탭 5+2 비대칭 줄바꿈:** `variant="inline"` 탭 바에 4열 균형 그리드 적용 후 재캡처 확인.

---

## 3. 네이티브 Windows Tauri 실기 수동 확인 항목 (미실행 — 별도 확인 필요)
> 위 자동화 검수는 JS/Rust 단위 테스트와 브라우저 Chromium Playwright 기반이며, 실제 Windows WebView2 다중 창 Tauri 바이너리 런타임은 아래 항목을 직접 실행해 최종 확인해야 합니다.

- [ ] 메인 메모창(`MainToolbar`) · 선택 플로팅 바(`FloatingRTE`) · 보관함(`ArchiveToolbar`) · 알림장(`NoticeboardApp`)에서 드래그 선택 영역이 `font-picker` 팝업 클릭·선택 후에도 유지되며 글꼴이 즉시 적용되는지
- [ ] 팝업 창(`font-picker`) 어디를 드래그해도 창이 움직이지 않고(Non-Draggable), 호스트 창을 이동·리사이즈·스크롤하거나 닫을 때 즉시 사라지는지
- [ ] 설정창(`SettingsModal`) · 급식 설정(`MealSettingsWindow`, `메인 창과 동일` 포함) · 툴킷 설정(`ToolkitSettings`, 6종 테마)에서 팝업 테두리에 회색 그림자/반투명 번짐(Halo)이 없는지
- [ ] 이종 DPI 듀얼 모니터(예: 100% ↔ 150%/200%) 경계에서 2-Pass 배치 및 위치 보정(`verifyGeometry`)이 1px 이내로 밀착되는지
- [ ] 트레이 "창 위치 초기화" 실행 시 숨겨진 `font-picker` 창이 튀어나오지 않는지, 모든 메모창 닫기 시 프로세스가 정상 종료되는지
