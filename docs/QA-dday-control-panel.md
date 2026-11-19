# D-Day 컨트롤 패널 개편 구현·검수 기록 — 2026-11-19 / 5.6.5

[PRD-dday-control-panel.md](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/docs/PRD-dday-control-panel.md)(v2)의 4대 목표(무여백·무잔상 프레임, 15종 테마 및 UI 글꼴 연동 + `[완료]` CTA 통일, 스마트 세로 드래그 정렬 + 비동기 IPC 오버레이, 항상 1열 + 4계층 창 리사이즈 하네스)를 구현하고 단위 테스트 · 정적 타입 검사 · 프로덕션 번들 빌드 · Playwright 브라우저 매트릭스(`?dday-control-preview`) 및 시각 검수까지 완료했다. 배포·커밋·푸시는 수행하지 않았으며, 공유 금지 파일(`TodoList.svelte` · `verticalSort.js` · `DdayWidget.svelte`)과 PostHog·버전 계약은 변경하지 않았다.

## 주요 구현 내용

1. **무여백 · 무잔상 프레임 (`DdayControlModal.svelte` · `ddayControlTheme.js` · `ddaySync.js` · `DdayResizeHandles.svelte`)**
   - `.ctrl-host` 여백 `0px` · 투명 배경, `.ctrl-shell` `box-shadow: none` · `border-radius: 16px` · 불투명 6자리 Hex `--dd-ctrl-border`로 외곽 잔선·번짐 제거.
   - `.ctrl-scroll`(목록) · `.es-scroll`(편집) · `.ar-scroll`(보관함)에 `margin-right: 4px; scrollbar-gutter: stable`을 적용해 동쪽 `4px` 리사이즈 핸들과 스크롤바 겹침을 원천 차단.
   - `DdayResizeHandles`는 `cornerSize={10}`(모서리 `5px` 드래그 임계)을 사용해 우상단 `.ctrl-close` 클릭 영역을 가리지 않으며, 디버그 검사 플래그(`debugShow` / `?handles=1`) 지원.
   - `openDdayControlWindow`는 기존 창 전환 시 `setTarget` 후 `show`/`setFocus`하고, 새 창은 URL 부트스트랩 쿼리(`ddayCtrlTarget`, `theme`, `dark`, `uifont`, `fs`)와 `limits` · `maximizable: false` · `controlReady` · `document.fonts.load` 대기를 거쳐 첫 프레임 깜빡임을 방지.

2. **15종 테마 · 다크 모드 · `uiFontFamily` 연동 + `[완료]` CTA 통일**
   - [ddayControlTheme.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/dday/ddayControlTheme.js)가 15개 테마 × 라이트·다크(30조합)에 대해 명시적 6자리 Hex 토큰만 생성(`light-dark()` 미사용)하고, 모든 표면 대비 `>= 4.6`(`ensureContrastAgainstAll`)과 다크 파스텔 강조색 위 `#111827` `onAccent`, `--header-*`, `--dd-scroll-*` 토큰을 계산.
   - `resolveUiFontStack` + `watchCustomFonts` + `registerFontFace`로 내장 48종(`BUILTIN_FONTS`, 시스템 글꼴 10종 포함)과 사용자 `.ttf/.otf` 글꼴을 `.ctrl-shell` (`--ui-font-family`)과 내장 `DdayBanner`(`--global-font-family`)에 연동하고, `.ctrl-shell :global(button|input|select|textarea)`에 `font-family: inherit`를 적용.
   - 하단 `[완료]` CTA(`title="창 닫기"`)를 상단 `+ 새 D-Day`와 동일한 `--dd-accent-fill`/`--dd-on-accent`로 통일하고, 하위 컴포넌트(`DdayRowCard` · `DdayEditSheet` · `DdaySettingsTab` · `DdayArchiveView`)의 인라인 `--dd-accent` 및 하드코딩 `#d97706`을 제거.

3. **스마트 세로 드래그 정렬 · 비동기 IPC 오버레이 · 연타/키보드/Esc/터치 방어**
   - `DdayRowCard.svelte` 왼쪽 `.dd-order` 화살표를 제거하고, [ddaySort.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/dday/ddaySort.js)(`canStartDdaySort`: `.dd-title-btn[data-dday-sortable]`과 카드 빈 몸통만 허용, 모든 `<button>`에 `data-dday-sortable` 또는 `data-dday-no-sort` 선언)와 공용 세로 정렬 코어 [createVerticalSort.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/sort/createVerticalSort.js) + [ddayVerticalSort.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/dday/ddayVerticalSort.js)로 스마트 수직 정렬을 구현.
   - `@dnd-kit/dom@0.5.0`의 `RestrictToVerticalAxis` + 커스텀 `RestrictToVerticalBounds`(Top-Layer 드래그 중 `.ctrl-scroll` 상하 경계 내 Y 클램프), `'showPopover'` 피처 가드, 180ms `cubic-bezier(0.2, 0, 0, 1)` WAAPI 착지 및 FLIP, `--dd-sort-width`/`--dd-sort-left` 폭·좌표 고정을 적용.
   - `ddaySort.js` 비동기 순서 오버레이 리듀서(`beginOrderOverlay`, `settleOrderOverlay`, `reconcileOverlayWithSnapshot`, `projectActiveDdays`)로 `reorder` IPC 지연·잠금(`isUpdateFrozen`)·실패·연속 드래그 경합을 무되튐 처리.
   - `completingIds` + `removalGuard` 완료 연타 방지, 빠른 메뉴 `"맨 위로"` 타일, `position: absolute` `.dd-kbd-handle`(레이아웃 흔들림 0px), `EditSheet` 달력/삭제 확인 및 `ArchiveView` 비우기 확인 다이얼로그 캡처 단계 `Escape` 단계별 닫기 적용.

4. **항상 1열 리스트 + 4계층 창 리사이즈 하네스 (`340..580 × 460..860`)**
   - [ddayLayout.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/dday/ddayLayout.js) `listGrid2Col = false`, `compactWidth < 360`, `wideEdit/wideSettings >= 536` 정리.
   - [ddayModel.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/dday/ddayModel.js)(위치 보존 + 크기만 클램프하는 `normalizeControlGeometry`) · [ddayWindowBounds.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/dday/ddayWindowBounds.js)(`resolveControlSizeLimits`, `applyControlWindowLimits`, `maximizable: false`) · `DdayControlModal`(`onMoved` 모니터 상한 재적용, `onScaleChanged` 500ms 억제 + 2연속 일치 저장 가드) 4계층 하네스 구축.

## QA 디버깅 중 발견 및 수정한 실제 버그

- **키보드 `ArrowDown`/`ArrowUp` 재정렬 무응답(`#app` 0px 클리핑):** `:global(html), :global(body), :global(#app)`에 `overflow: hidden`만 있고 `width: 100%; height: 100%`가 빠져 `position: fixed` 자식(`.ctrl-host`) 아래 `#app` 높이가 `0px`으로 붕괴하면서 `@dnd-kit/dom` `SortableKeyboardPlugin`(`getVisibleBoundingRectangle`)이 모든 드롭 대상을 높이 0으로 잘라냈음 → `width: 100%; height: 100%` 추가로 해결.
- **마우스 우클릭 빠른 메뉴 차단(`clickGuard.held`):** `createVerticalSort.js` `guardDown`이 모든 `isPrimary` 포인터다운(우클릭 `button === 2` 포함)에 `clickGuard.onPointerDown()`을 호출해 Chromium에서 `pointerup`보다 먼저 오는 `contextmenu`가 억제되었음 → `touchOrPenHeld` 분리 및 유휴 마우스 우클릭 시 `clickGuard` 해제로 해결(드래그 중 및 터치 홀드 중 억제는 유지).
- **하위 버튼/입력 글꼴 미상속 & 정렬 커서:** `.ctrl-shell :global(button|input|select|textarea) { font-family: inherit }` 및 `.dd-row.sortable { cursor: grab }` 보완.
- **빠른 메뉴 0프레임 반투명 오인 원인 확인:** `ctxPocketIn` 110ms 페이드인 애니메이션 중(t ≈ 16ms) 캡처 시 반투명처럼 보였던 것이며, 애니메이션 완료(180ms) 후 재캡처 시 완전 불투명 `#fdfaf3` 표면으로 정상 렌더링 확인.

## 자동 검증 결과

| 검증 항목 | 범위 및 결과 |
|---|---|
| `npm test` | **870개 통과 / 0개 실패** (`ddayModel`, `ddayWindowBounds`, `ddayLayout`, `ddayControlTheme`, `ddaySort` + `DdayRowCard.svelte` 7개 `<button>` 정적 감사 포함) |
| `npm run check` | `svelte-check --threshold warning` **오류 0 · 경고 0** (전체 워크스페이스 기준) |
| `npm run build` | `vite build` 정상 종료 (프런트엔드 프로덕션 번들 생성) |
| [qa-dday-control.cjs](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/scripts/qa-dday-control.cjs) | **Playwright 15개 스위트 전부 통과 (런타임·콘솔 오류 0건)** — 결과 캡처: `output/qa/dday-control/` |

Playwright 매트릭스 상세 통과 내역:
1. `Suite 1`: 무여백 프레임(`padding: 0px`, `box-shadow: none`, 불투명 6-hex 테두리), list·edit·archive 스크롤바 우측과 동쪽 4px 리사이즈 핸들 분리, NE 10px 코너 핸들과 `.ctrl-close` 비중첩 히트테스트
2. `Suite 2`: `TIDY_THEMES` 15종 × 라이트/다크 30조합 computed WCAG AA 대비율(`>= 4.5` 본문·제목·버튼, `>= 3.0` 카운터·탭·배지), `[완료]` CTA(`title="창 닫기"`, `+ 새 D-Day`와 동일 배경/글자색), 비-호박 테마 `.b3-dot.on`/`.b3-ctrl-link`/`.st-startup-btn`의 `#d97706` 미잔존 확인
3. `Suite 3`: `uiFontFamily`(`맑은고딕`, `메이플스토리 L`, `교보 손글씨 2025`, 미등록 커스텀 폴백 → `'메이플스토리 L'`)의 `.ctrl-shell`, `.dd-title`, `.ctrl-done-btn`, `.b3-mini-ttl`/`.b3-title` 일괄 연동
4. `Suite 4`: 6폭(`340, 380, 452, 546, 560, 580`) × 4높이(`460, 580, 660, 860`) 24셀 + 글꼴 `9/13/15pt` + 항목 `0/1/6` + 창 `1/3` + edit(달력 포함)/settings/archive/quick-menu 가로 넘침 없음 & 항상 1열 불변성
5. `5.1 ~ 5.11`: 짧은 제목 클릭→편집·Esc 복귀, 20px 가로 드래그 무시, 제목/본문(`.dd-date`) 세로 드래그 재정렬·폭 고정·`.ctrl-scroll` Y 경계 클램프·0프레임 무되튐, 드래그 중 Esc 복원+클릭가드+창유지, 인터랙티브 컨트롤(`.dd-check`·`.dd-edit-btn`·`.dd-cap-seg`·`.dd-capsule` 2px 틈새) 드래그 차단, `.dd-check` 150ms 내 연타 1건만 완료, 드래그·터치 홀드 중 `contextmenu` 억제 & 마우스 우클릭 `"맨 위로"` 승격, `Tab` → `.dd-kbd-handle`(카드 높이 변화 `< 0.5px`) → `Space`/`ArrowDown`/`Space` 재정렬, `ArchiveView` 비우기 확인·`EditSheet` 달력 2단계 `Escape`, IPC `frozen`/`fail` 롤백 및 `200ms` 지연 연속 2회 순서 변경 경합 수렴

## 네이티브 Windows (Tauri / WebView2) 수동 QA 체크리스트

헤드리스 Chromium 미리보기(`?dday-control-preview`)에서는 Windows OS 창 관리자·물리 DPI 스케일·네이티브 파일 폰트 로딩을 대체할 수 없으므로, 실제 Tauri 앱 빌드/개발 실행 환경에서 아래 항목을 별도 확인해야 합니다.

- [ ] **무잔상 OS 외곽:** `white` 테마(밝은 바탕화면)와 다크 테마(어두운 바탕화면) 위에서 창 외곽 4변·16px 모서리에 그림자 잔선·흰 테두리·삐져나오는 픽셀이 없는지 육안 확인
- [ ] **첫 프레임 위치·테마:** `note-1`(노트 창)에서 컨트롤 패널 최초 오픈 및 창 전환 시 이전 대상 창 콘텐츠나 잘못된 기본 테마가 깜빡이지 않는지 확인
- [ ] **DPI 배율(100% / 125% / 150% / 175% / 200%) 및 모니터 이동:** 주/보조 모니터 간 배율 차이 이동 시 `onMoved` 상한 클램프가 작동하고 `onScaleChanged` 직후 `controlGeometry`가 과도기 크기로 오저장되지 않는지 확인
- [ ] **최대화 차단 & OS 창 단축키:** `Win + ↑`, Aero Snap 상단 스냅, 헤더 더블클릭 시 최대화로 폭주하지 않고 `default(380×580) ↔ wide(560×660)` 범위 내로 제한되는지 확인
- [ ] **범위 밖 저장 좌표 마이그레이션:** 기존 `tidy-task-dday.json`에 `300×400` 또는 `900×1000` `controlGeometry`가 있을 때 시작 즉시 `340..580 × 460..860`으로 보정되되 저장된 X/Y 좌표는 유지되는지 확인
- [ ] **네이티브 커스텀 폰트(`.ttf`/`.otf`):** 설정에서 사용자 폰트를 추가해 메모 창에 적용한 뒤 `dday-control`을 열면 `registerFontFace`로 동일 글꼴이 렌더링되는지 확인
