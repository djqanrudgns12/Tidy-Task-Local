# PRD — 다중 선택 인셋 말랑 도크 & 날짜 인덱스 슬라이딩 정렬 캡슐 (시안 3)

| 항목 | 내용 |
|---|---|
| 문서 판 | v1.1 (구현 및 2× 확대 미세 정렬 보정 반영) |
| 작성 | 2026-11-20 |
| 상태 | 구현·검수 완료 (2026-11-20) |
| 기준 시안 | **시안 3** (`인셋 말랑 도크 + 날짜 인덱스 슬라이딩 캡슐`) · 2축 정밀 정렬 |
| 대상 | 다중 선택 막대(`src/App.svelte`, 신규 `src/components/todo/BulkSelectDock.svelte`, 신규 `src/lib/todos/bulkDockLayout.js`), 할 일 목록 체크박스·선택 행 스타일(`src/components/TodoList.svelte`), 개발 검수 화면(`src/dev/MemoLayoutPreview.svelte`) |
| 바꾸지 않는 것 | 다중 선택 일괄 동작 로직(`archiveSelectedToBox`, `handleBulkDday`, `archiveSelected`, `deleteSelected`, `toggleDeadlineSort`, `selectAll`/`deselectAll`), `MainToolbar.svelte`의 `.selection-status`(`여러 항목 선택 중 · 완료`), `memoLayout.js` 세로 배치 규칙, `WINDOW_FIELDS` 저장 스키마, PostHog 통계 이벤트 |
| 선행 의존 문서 | [PRD-todo-row-gestures.md](PRD-todo-row-gestures.md), [PRD-dday-smart-badge.md](PRD-dday-smart-badge.md), `claude.md` (다중 선택 막대 2026-11-20 절) |

---

## 1. 배경 (Problem)

현재 다중 선택 모드(`appState.isEditMode === true`) 시 노출되는 상단 막대([App.svelte:1725-1813](../src/App.svelte#L1725-L1813))와 할 일 목록([TodoList.svelte:312-385](../src/components/TodoList.svelte#L312-L385)) 사이에는 다음과 같은 시각·구조적 문제가 누적되어 있습니다.

1. **수직 열(Column) 2축 불일치 & 순서 역전**
   - 아래 할 일 행은 좌측부터 **`[개별 체크박스(x=15px)] → [완료 원형(18px)] → [날짜 뱃지(x=59px~)]`** 순으로 정렬되어 있습니다.
   - 반면 상단 막대는 과거 삭제된 좌측 드래그 손잡이의 잔재인 `pl-[24px]` 뒤에 **`[정렬 🔽]`을 먼저 두고 `[전체 선택 ☐]`을 오른쪽으로 밀어 두어**, 전체 선택 버튼이 날짜 뱃지 중앙 위에 둥둥 떠 있고, 개별 체크박스 열 위는 빈 공간으로 남아 있습니다.
   - 좁은 폭에서는 `@container` 규칙이 `.bulk-lead { padding-left: 4px }`로 강제 이동시켜 좌측 축이 덜컥 점프합니다.
2. **화면 글자 크기 배율 시 상·하단 크기·축 어긋남**
   - `TodoList.svelte`는 `.memo-body`([memo.css:3-7](../src/lib/memo.css#L3-L7))의 `--spacing: 3.333333px` 고정 보호를 받아 `pl-3 = 10px`, `w-4 = 13.33px`로 고정되지만, `.bulk-bar`는 `.memo-body` 바깥에 있어 `px-3`와 `w-4`가 루트 `rem`(= `uiFontSize`)을 따라 커집니다. 따라서 12pt 이상에서 상단 체크박스와 하단 체크박스의 크기와 좌측 여백이 서로 어긋납니다.
3. **조형·아이콘 이질감**
   - `정렬 🔽` / `정렬 🔼`은 Windows 시스템 파란 사각 이모지를 그대로 렌더링해 Tidy Task의 문구·스티커 감성(`DdayTodoChip`, `DdayControlGlyph`, `EraserButton`, `UndoToast`)과 크게 충돌하며, `"정렬"` 텍스트가 불필요한 가로 폭(`~58px`)을 차지합니다.
   - 상·하단 체크박스가 모두 `rounded-sm`(`2px`)의 날카로운 직사각형이어서 옆의 `rounded-full` 완료 버튼·날짜 알약과 이질적입니다.
   - 우측 삭제 버튼은 일반 Lucide `<Eraser>` 선형 아이콘을 쓰고 있어 2026-11-19 도입된 개별 행의 [EraserButton.svelte](../src/components/todo/EraserButton.svelte)(호버 시 `-12°` 기울어지며 로즈 슬리브가 차오르는 노트북 지우개)와 시각 패밀리가 끊어져 있습니다.
4. **테마 하드코딩 & 다크 모드 대비 결함**
   - 막대 배경·테두리가 `#fffbeb` / `#fde68a` 앰버 색으로 고정되어 블루·로즈·틸·라벤더·페이퍼 등 나머지 14개 테마에서 겉돕니다.
   - 다크 모드에서 `[마감]` 버튼이 `text-white` 고정이라 밝은 파스텔 강조색(`#fbbf24`, `#bef264`, `#5eead4` 등) 위에서 텍스트 명도 대비가 **1.6:1~2.3:1**로 떨어져 가독성이 크게 저하됩니다.
5. **이중 가로선 노이즈 & 부분 선택 미구분**
   - 막대 하단 `border-b`와 `TodoList.svelte:282`의 `border-t` 사이에 여백(`pt-1` × 2)이 끼어 두 줄 경계선이 겹쳐 보입니다.
   - 4개 중 1~2개만 선택해도 상단 전체 선택 박스에 전체 선택과 동일한 `✓`가 표시되고, 현재 몇 개가 선택되었는지 한눈에 알기 어렵습니다.

---

## 2. 목표와 비목표 (Goals & Non-Goals)

### 목표
1. **2축 정밀 정렬:** 제일 좌측의 **전체 선택 라운드 체크 토글**은 아래 행 체크박스 열의 정중앙(`x = 23px`)에, **날짜 인덱스 슬라이딩 정렬 캡슐**은 아래 날짜 뱃지 열의 정중앙에 정렬합니다.
2. **인셋 말랑 도크(`rounded-[11px]`):** 목록 좌우 여백(`10px`)에 맞춘 독립 둥근 도크로 이중 가로선을 구조적으로 없애고, 서식 바 개폐·모던/클래식 헤더·D-Day 배너와 깔끔하게 어우러지게 합니다.
3. **글자 없는 아기자기한 정렬 토글:** `"정렬 🔽"`을 제거하고 `↓ | ↑` 슬라이딩 노브 + 하단 인덱스 꼬리점을 갖춘 **라운딩 슬라이딩 캡슐**로 교체해, 현재 정렬 방향과 전환 가능성을 0.1초 만에 인지하게 합니다.
4. **라운딩 조약돌 체크 토글 + 3상태 + 스티커 핍:** 상·하단 체크박스를 모두 `16×16px, border-radius: 6px`로 통일하고(옆 `18px` 원형 완료 버튼과 명확히 구분), 상단 전체 선택은 `미선택 / 일부 선택(−) / 전체 선택(✓)` 3상태와 가로 폭 0px **스티커 카운트 핍**을 제공합니다.
5. **최신 4액션(`184814b`) 완전 호환:** 우측 `[아카이브]`·`[D-Day]`·`[마감]`·`[지우개]`의 기능·순서·3단 위계·`em` 글자 크기 추종·`@container` 아이콘 축소·`bulkBusy` 잠금·달력 팝업 앵커를 100% 유지하면서 도크 규격(`rounded-full` 알약 + 노트북 지우개)으로 통일합니다.
6. **15개 테마 × 라이트/다크 30조합 고대비:** `light-dark()` 없이 모든 테마·다크 모드에서 자연스러운 파스텔 도크 색감과 **WCAG AA(≥ 4.5:1)** 대비를 보장합니다.

### 비목표
- `MainToolbar.svelte`의 `.selection-status`(`여러 항목 선택 중 · 완료`) 배너 제거 또는 문구 변경 (`scripts/qa-header.cjs` 계약 유지).
- 정렬 알고리즘 변경(마감일 있는 항목 오름/내림차순, 없는 항목 하단 고정 유지).
- 다중 선택 일괄 동작(`[아카이브]`·`[D-Day]`·`[마감]`·`[삭제]` 확인 모달)의 비즈니스 로직·저장·되돌리기 규칙 변경.
- 보관함 창(`ArchiveWindow.svelte`)의 선택 모드 막대 리디자인(별도 창 영역).
- 저장 스키마(`WINDOW_FIELDS`) 필드 추가 및 PostHog 신규 통계 이벤트 추가.

---

## 3. 용어 정의

| 용어 | 뜻 |
|---|---|
| **인셋 말랑 도크 (`BulkSelectDock`)** | 다중 선택 모드 시 할 일 목록 바로 위에 목록 좌우 여백(`10px`)에 맞춰 둥글게 안착하는 `rounded-[11px]` 제어 막대 |
| **체크 축 (Axis 1)** | 제일 좌측의 전체 선택 버튼과 아래 모든 행 체크박스가 공유하는 수직 중심선 (`x = 23px`, 좌측 시작 `15px`, 폭 `16px`) |
| **날짜 중앙 축 (Axis 2)** | 날짜 인덱스 슬라이딩 정렬 캡슐과 아래 마감일 뱃지(`[data-todo-deadline-btn]`)가 공유하는 수직 중심선 (실측 기반 동적 추종, 기본 10pt 기준 `~91px`) |
| **조약돌 스퀘어클 체크 토글** | `16×16px, border-radius: 6px`의 부드러운 라운드 체크박스. 옆의 `18px` 완전 원형 완료 버튼(`rounded-full`)과 형태·크기를 분명히 구분 |
| **스티커 카운트 핍 (`mini-count-pip`)** | 1개 이상 선택 시 전체 선택 체크박스 우상단에 겹쳐 뜨는 초소형 숫자 배지(`1~99`, `99+`). 가로 레이아웃 폭 점유 `0px` |
| **날짜 인덱스 슬라이딩 캡슐 (`DeadlineSortCapsule`)** | `36×21px` 고정 비율 둥근 알약 안에 `↓`(가까운 순) / `↑`(먼 순) 두 슬롯과 `15×15px` 정원형 슬라이딩 노브, 하단 인덱스 꼬리점을 결합한 마감일 정렬 토글 |
| **인덱스 꼬리점 (Notch)** | 정렬 캡슐 하단 중앙의 `5×5px` 45° 회전 다이아몬드 포인트(`bottom: -2.8px`). 아래 날짜 뱃지 열을 은은하게 지시하며, 클램프 발생 시 자동 숨김 |
| **안전 클램프** | 극초협폭(`250px`)·대형 글꼴 환경에서 정렬 캡슐이 좌측 체크박스/핍 또는 우측 4개 버튼과 겹치지 않도록 중심 X를 안전 범위로 제한하는 계산 |

---

## 4. 결정 사항 (Decisions)

### 4.1 사용자 결정 (2026-11-20)
| # | 요청·피드백 | 반영 방향 |
|---|---|---|
| U1 | `"정렬"` 글자를 없애고 귀여운 아이콘만, 토글 모양도 더 라운딩하게 교체 | `"정렬 🔽"` 제거 → `↓\|↑` 라운딩 슬라이딩 캡슐, 체크박스 `2px → 6px` 조약돌 스퀘어클 |
| U2 | 제일 좌측 버튼은 **전체 선택 버튼**이며 최신 프로젝트 환경에 맞출 것 | 제일 좌측(`x=15px`, 중심 `23px`) = 전체 선택 토글 고정 + 최신 `184814b` 4액션(`[아카이브]`·`[D-Day]`·`[마감]`·`[지우개]`, `em`, `@container`) 100% 반영 |
| U3 | 정렬 버튼을 **날짜 뱃지 정중앙**에 배치 | DOM 실측 + 폴백 공식으로 날짜 뱃지 정중앙에 정렬 캡슐과 인덱스 꼬리점을 정밀 정렬 |
| U4 | 디자인을 아기자기하고 디테일하게 다듬은 **시안 3** 채택 | 인셋 말랑 도크(`11px`) + 상단 광택/하단 받침 + 스티커 카운트 핍 + 날짜 인덱스 슬라이딩 캡슐 + 노트북 지우개 확정 |
| U5 | 사소한 디테일까지 포함한 PRD 작성 | 좌표 수학·클램프·꼬리점 숨김·30테마 대비·선택 행 `--row-surface` 연동·접근성·28종 경계 사례까지 명문화 |

### 4.2 설계 결정
| # | 결정 | 근거 |
|---|---|---|
| D1 | 다중 선택 막대를 `src/components/todo/BulkSelectDock.svelte`로 분리하고 순수 계산을 `src/lib/todos/bulkDockLayout.js`에 둠 | `App.svelte` 비대화 방지, 순수 좌표·상태·대비 로직을 `node --test`로 100% 단위 검증 가능, `MemoLayoutPreview`에서도 동일 컴포넌트 검수 가능 |
| D2 | 체크박스 크기를 상단·행 모두 명시적 **`16px × 16px, border-radius: 6px`** 고정(rem 비의존) | `.memo-body` 안(`--spacing: 3.333px`)과 바깥(`rem`)의 크기 불일치를 제거하고, 바로 옆 고정 `18px` 완료 원형 버튼과 모든 글자 크기에서 일정한 비율·수직 축(`23px`)을 유지 |
| D3 | 체크박스를 완전 원형(`50%`)이 아닌 **`6px` 스퀘어클**로 제한 | 바로 오른쪽 `5px` 거리에 `18px` 완전 원형 완료 버튼(`.todo-done`)이 있으므로 원형 체크박스는 "마감 처리"와 오클릭을 유발함 |
| D4 | 정렬 캡슐의 가로 중심은 **실제 렌더된 `[data-todo-deadline-btn]` DOM 실측 + 안전 클램프 + CSS 폴백** 3중 구조로 계산 | 글꼴(`은하수` vs `메이플스토리` vs `맑은 고딕`), 메모 글자 크기(`6~40pt`), 날짜 있음(`11/23(월)`) vs 날짜 없음(달력 아이콘)에 따라 뱃지 폭이 달라지므로 고정 `margin-left`만으로는 정중앙을 유지할 수 없음 |
| D5 | 클램프가 발동해 캡슐이 실제 날짜 뱃지 중앙에서 **`8px` 초과** 밀리면 하단 인덱스 꼬리점(`::after`)을 부드럽게 숨김 (`opacity: 0`) | 꼬리점이 날짜 뱃지가 아닌 완료 원형이나 빈 여백을 잘못 가리키는 시각적 거짓 신호를 차단 |
| D6 | 일부 선택(`0 < selected < total`) 상태에서 전체 선택 버튼 클릭 시 기존 계약대로 **`appState.deselectAll()`** 유지 | 기존 [App.svelte:1747-1750](../src/App.svelte#L1747-L1750) 동작 보존으로 기존 사용자 학습 비용 0. 대신 시각은 `−`(부분)와 `✓`(전체)로 명확히 구분하고 툴팁에 `"N개 선택됨 · 클릭해 모두 해제"` 명시 |
| D7 | 선택 개수 카운트는 가로 폭을 차지하는 텍스트(`2개 선택`) 대신 체크박스 우상단 **`mini-count-pip` (`0px` 레이아웃 폭)** 로 배치 | 우측 4개 일괄 버튼(`[아카이브]`·`[D-Day]`·`[마감]`·`[지우개]`)의 가로 공간을 침범하지 않으며, 체크 축(`23px`)과 정렬 축(`91px`) 사이의 시각적 밸런스를 유지 |
| D8 | 편집 모드 중 `TodoList` 스크롤 칸(`.todo-list-viewport`)의 상단 테두리는 **`border-top-color: transparent`** 로만 투명화(`border-top-width: 1px` 유지) | 이중 가로선을 없애면서도 `measureLayout()` 높이와 `memoLayoutController` 계산이 1px도 변하지 않게 보장 |
| D9 | `<BulkSelectDock />`는 DOM 상 `<MainToolbar />` 뒤, `<MemoBody />` 앞(기존 `.bulk-bar` 자리)에 유지 | `memoLayoutController.js:139`의 `measureFixedChrome()`이 `.main-header`까지만 재므로, 일시적 편집 도크가 OS 창 최소 높이(`setMinSize`)를 부풀리지 않음 |
| D10 | 우측 `[마감]` 버튼과 `mini-count-pip`·체크마크 글자색은 라이트 `#ffffff`, 다크 **`#111827`** 로 분기 | 다크 모드 파스텔 강조색(`#fbbf24`, `#bef264`, `#5eead4` 등) 위에서 WCAG AA `≥ 4.5:1` 가독성 확보 (`ddayControlTheme.js`·`UndoToast.svelte` 동일 규칙) |
| D11 | CSS `light-dark()` 사용 금지 | `claude.md` 전역 규칙 (배포 빌드 lightningcss 호환성). `.is-dark` 클래스와 인라인 CSS 변수로 분기 |
| D12 | 우측 삭제 버튼은 [EraserButton.svelte](../src/components/todo/EraserButton.svelte)와 동일한 **16×16 노트북 지우개 SVG + `-12°` 호버 기울임 + 로즈 슬리브 채움** 적용 (`disabled` 시 정지) | 할 일·마감된 일 행의 삭제 단추와 완벽한 시각 패밀리 형성 |
| D13 | 선택된 할 일 행에 연한 테마 틴트 배경을 깔 때 **`--row-surface`** 변수도 `color-mix`로 함께 갱신 | `claude.md` 할 일 줄 규칙("X 뒤 흐림 받침 `.todo-veil`은 그 순간의 줄 배경과 같은 색") 100% 준수 |
| D14 | 도크 안 모든 버튼에 `onmousedown={(e) => e.preventDefault()}` 적용 (키보드 Tab/Enter/Space는 정상) | 할 일 글 편집 중 커서를 엉뚱하게 뺏지 않으면서 키보드 접근성 유지 (`D-Day` 버튼의 `onpointerdown` 토글 판정은 그대로 동작) |
| D15 | `@container` 라벨 축소 시 기존 `.bulk-lead { padding-left: 4px }` 규칙 **완전 삭제** | 창을 좁혀도 제일 좌측 체크 축(`23px`)이 절대 점프하지 않게 보장 |
| D16 | 모든 스프링·슬라이드·핍 팝 애니메이션은 `@media (prefers-reduced-motion: reduce)`에서 색상/투명도 전환만으로 축소 | 모션 민감 사용자 배려 |

---

## 5. 적용 범위 & 모듈 아키텍처

### 5.1 파일 변경 지도

| 파일 | 구분 | 역할 |
|---|---|---|
| `src/lib/todos/bulkDockLayout.js` | **신규** | 순수 로직 모듈: 3상태 판정(`resolveSelectAllState`), 핍 포맷(`formatCountPip`), 2축 좌표·클램프·꼬리점 가시성 계산(`computeSortCapsulePosition`), 15테마×라이트/다크 색상·대비 토큰(`resolveBulkDockPalette`) |
| `src/lib/todos/bulkDockLayout.test.js` | **신규** | `node --test` 단위 테스트 (좌표·클램프·꼬리점 숨김·3상태·99+·30조합 WCAG AA 대비율 전수 검증) |
| `src/components/todo/BulkSelectDock.svelte` | **신규** | 시안 3 인셋 말랑 도크 컴포넌트 (전체 선택 토글 + 스티커 핍 + 날짜 인덱스 슬라이딩 캡슐 + 우측 4액션 + 실측 `ResizeObserver` 동기화) |
| `src/App.svelte` | **수정** | 기존 인라인 `.bulk-bar` 마크업([L1725-1813](../src/App.svelte#L1725-L1813))과 `<style>`([L2139-2173](../src/App.svelte#L2139-L2173))을 `<BulkSelectDock />` 호출로 교체. 기존 핸들러(`archiveSelectedToBox`, `handleBulkDdayPointerDown`, `handleBulkDday`, `confirmDelete`)와 `bulkBusy` 상태는 그대로 전달 |
| `src/components/TodoList.svelte` | **수정** | ① 행 체크박스([L320-334](../src/components/TodoList.svelte#L320-L334))를 `16×16px, border-radius: 6px` 조약돌 스퀘어클로 통일 + `data-todo-select-btn`·접근성 속성 추가 ② 선택된 행 `.is-selected` 틴트 + `--row-surface` 동기화 ③ `appState.isEditMode` 중 `listViewportEl` 상단 `border-top-color: transparent` 적용 |
| `src/dev/MemoLayoutPreview.svelte` | **수정 (QA용)** | `?memo-layout-preview&bulk-qa` 쿼리 시 `<BulkSelectDock />`를 실제 `<MemoBody />` 위에 마운트하고 편집 모드·테마·폭·글꼴을 제어하는 검수 훅(`__bulkQA`) 연결 |
| `scripts/qa-bulk-dock.cjs` | **신규 (QA용)** | Playwright 자동 시각·좌표·충돌 검수 스크립트 (캡처: `output/qa/bulk-dock/`) |
| `claude.md` | **수정** | "다중 선택 막대" 절 및 모듈 지도에 `BulkSelectDock`·`bulkDockLayout.js` 규약 반영 |

### 5.2 컴포넌트 데이터 흐름

```
App.svelte
  ├─ props 전달:
  │   ├─ sortOrder: appState.sortOrder ('asc' | 'desc')
  │   ├─ totalCount: appState.filteredTodos.length
  │   ├─ visibleSelectedCount: filteredTodos 중 선택된 수
  │   ├─ selectedCount: appState.selectedTodoIds.length
  │   ├─ themeColor: appState.themeColor
  │   ├─ dark: appState.isDarkMode
  │   ├─ globalFontSizePt: appState.fontSize
  │   ├─ uiFontSizePt: appState.uiFontSize
  │   ├─ busy: bulkBusy
  │   ├─ frozen: appState.isUpdateFrozen
  │   ├─ ddayPickerOpen: datePicker.openKey === BULK_DDAY_PICKER_KEY
  │   └─ callbacks: onToggleAll, onToggleSort, onArchive, onDdayPointerDown, onDdayClick, onComplete, onDelete
  │
  └─ BulkSelectDock.svelte
      ├─ DOM 실측: 인접 MemoBody의 [data-todo-deadline-btn] rect 조회 (ResizeObserver + reactive effect)
      └─ 순수 계산: bulkDockLayout.js → { sortLeftPx, showNotch, selectAllState, pipText, palette }
```

---

## 6. 2축 정밀 정렬 및 반응형 기하 명세 (`bulkDockLayout.js`)

### 6.1 수평 픽셀 좌표 지도 (기준: 창 내부 좌측 끝 `x = 0px`)

```
창 좌측 끝 (x = 0px)
│
├── 0..10px   TodoList 좌측 패딩 (pl-3, --spacing: 3.333333px 고정 → 10px)
│             BulkSelectDock 외곽 여백 (.bulk-dock-wrap padding-left: 10px)
│
├── 10..15px  TodoList: .todo-row px-1 (3.333px) + .todo-lead ml-0.5 (1.667px) = 5px
│             BulkSelectDock: .bulk-dock border-left (1px) + padding-left (4px) = 5px
│
├── 15..31px  [축 1 · 체크박스 열] 폭 16px, 정중앙 x = 23.0px (상·하단 0.0px 오차!)
│             └─ 우상단 스티커 핍: top -5px, right -7px (우측 시각 경계 ~38px, 폭 점유 0px)
│
├── 31..36px  행 내 gap-1.5 (5px)
├── 36..54px  [완료 원형 열] .todo-done 폭 18px (rounded-full)
├── 54..59px  행 내 gap-1 (3.333px) + .todo-lead ml-0.5 (1.667px) = 5px
│
├── 59..123px [축 2 · 마감일 날짜 뱃지 열] (10pt 평균 폭 ~64px → 정중앙 x = 91.0px)
│             └─ BulkSelectDock 슬라이딩 정렬 캡슐 (폭 36px, 높이 21px 고정):
│                중심 = 실측 badgeCenterX (폴백 59 + clamp(19, fontPx*2.35, 56))
│                좌측 = clampedCx - 18px, 우측 = clampedCx + 18px
│                (10pt 기본 시 73..109px, 중심 91.0px, 꼬리점 정중앙 91.0px!)
│
└── 우측 끝   [일괄 액션 4종] [📦아카이브] [🚩D-Day] [마감] [지우개]
              도크 우측 padding 5px + border 1px + 외곽 10px = 16px 안쪽 정렬
```

### 6.2 `computeSortCapsulePosition(input)` 순수 함수 명세

**입력 (`input`)**
```js
{
  dockLeft: number,          // .bulk-dock 요소의 viewport 기준 left (border 포함 외측)
  dockBorderLeft: number,    // .bulk-dock 좌측 테두리 (1px)
  badgeCenterClientX: number | null, // 실측된 마감일 뱃지 중앙 viewport X (없으면 null)
  actionsLeftClientX: number,// 우측 .bulk-actions 요소의 viewport 기준 left
  globalFontSizePt: number,  // appState.fontSize (폴백 계산용, 기본 10)
  hasVisibleRows: boolean,   // filteredTodos.length > 0 여부
}
```

**계산 규칙 (모든 값은 도크 내부 좌측 끝 `dockInnerLeft = dockLeft + dockBorderLeft` 기준 px)**
1. **상수**
   - `CHECK_LOCAL_LEFT = 4` (도크 내부 좌측 패딩 `4px`, 창 기준 `10 + 1 + 4 = 15px`)
   - `CHECK_SIZE = 16` (체크박스 우측 내부 좌표 = `20px`, 창 기준 `31px`)
   - `PIP_CLEARANCE = 12` (스티커 카운트 핍 `7px` 돌출 + `5px` 숨통)
   - `CAPSULE_WIDTH = 36`, `CAPSULE_HALF = 18`
   - `ACTIONS_GAP = 8` (우측 4버튼과의 최소 숨통)
   - `NOTCH_HIDE_TOLERANCE = 8` (실제 날짜 뱃지 중앙에서 `8px` 초과 이탈 시 꼬리점 숨김)
   - `BADGE_START_LOCAL_X = 48` (창 기준 `59px` − 도크 내부 시작 `11px` = `48px`)
2. **목표 중심 `targetCx` (도크 내부 좌표)**
   - `badgeCenterClientX != null && Number.isFinite(badgeCenterClientX)` 이면:
     `targetCx = badgeCenterClientX - dockInnerLeft`
   - 아니면(목록 비어 있음 / 마운트 직후 1프레임 폴백):
     `fontPx = Math.max(6, globalFontSizePt || 10) * (4 / 3)`
     `estHalfBadge = Math.min(56, Math.max(19, fontPx * 2.35))`
     `targetCx = BADGE_START_LOCAL_X + estHalfBadge`
3. **안전 범위 `[minCx, maxCx]`**
   - `minCx = CHECK_LOCAL_LEFT + CHECK_SIZE + PIP_CLEARANCE + CAPSULE_HALF` → **`50px`** (창 기준 `61px`, 캡슐 좌측 `43px` = 체크박스 우측 `31px`에서 `12px` 띄움)
   - `actionsLocalLeft = actionsLeftClientX - dockInnerLeft`
   - `rawMaxCx = actionsLocalLeft - ACTIONS_GAP - CAPSULE_HALF`
   - `maxCx = Math.max(minCx, rawMaxCx)`
4. **최종 결과**
   - `clampedCx = Math.round(Math.min(maxCx, Math.max(minCx, targetCx)) * 2) / 2` (0.5px 스냅으로 고DPI 선명도 확보)
   - `capsuleLeftPx = clampedCx - CAPSULE_HALF` (`.bulk-dock` 기준 `position: absolute; left: {capsuleLeftPx}px` — **절대 좌표를 쓰므로 우측 `.bulk-actions` 폭이 바뀌어도, 스티커 핍이 생겨도, 체크 축과 정렬 축이 서로 밀지 않습니다!**)
   - `isClamped = Math.abs(clampedCx - targetCx) > NOTCH_HIDE_TOLERANCE`
   - `showNotch = hasVisibleRows && !isClamped`

> **왜 `position: absolute; left: {capsuleLeftPx}px`가 `margin-left`보다 우월한가?**
> `margin-left`는 좌측 flex 흐름에 묶여 있어, 체크박스가 `16px`일 때 계산이 조금만 어긋나거나 우측이 밀릴 때 도크 전체가 가로 오버플로됩니다. 반면 `.bulk-dock` 안에서 **체크박스는 좌측 `flex-none`, 액션은 우측 `margin-left: auto`, 정렬 캡슐은 `position: absolute; left: {capsuleLeftPx}px` + `top: 50%; transform: translateY(-50%)`** 로 배치하고, `minCx`/`maxCx`로 좌·우 충돌을 수학적으로 봉쇄하면:
> 1. 체크 축(`23px`)과 날짜 중앙 축(`badgeCenterX`)이 완전히 독립적으로 **0.5px 이내 정확도**를 유지합니다.
> 2. 우측 `.bulk-actions`에 최소 안전 좌측 여유를 보장하기 위해 `.bulk-dock`에 `gap` 대신 `computeSortCapsulePosition`이 `actionsLeftClientX`를 실시간 관측하므로, 창 너비·글자 크기·라벨 축소 전환 순간에도 단 한 프레임의 겹침도 생기지 않습니다.

### 6.3 실측 대상 뱃지 선택 규칙 (`pickAnchorDeadlineBadge`)

DOM에서 `.memo-body [data-todo-deadline-btn]` 목록을 조회할 때:
1. **1순위:** 날짜 텍스트가 들어 있는 첫 번째 뱃지 (`.todo-badge` 안에 달력 아이콘이 아닌 날짜 라벨이 있는 항목 — 예: `11/23(월)`).
   - 이유: 첫 번째 항목이 아직 날짜가 없고 2~4번째 항목에 날짜가 있는 경우, 날짜가 있는 열의 시각적 무게 중심에 맞추는 편이 훨씬 자연스럽습니다(단, 목록 정렬 후에는 날짜 있는 항목이 항상 위쪽에 오므로 보통 1번째 행이 바로 선택됨).
2. **2순위:** 모든 항목이 날짜 없음(달력 아이콘 뱃지)이라면 첫 번째 `[data-todo-deadline-btn]`.
   - 이때 `37px` 아이콘 뱃지 정중앙(`x ≈ 77.5px`)에 정렬 캡슐과 꼬리점이 자동으로 스르륵 맞춰집니다!
3. **3순위:** 표시할 할 일이 0개라면 `badgeCenterClientX = null` → 폴백 공식 사용, `showNotch = false`(가리킬 뱃지가 없으므로 꼬리점 숨김).

### 6.4 재측정 트리거
- `ResizeObserver` 2개: `.bulk-dock` 자체와 `.bulk-actions` (창 폭 변화, `@container` 라벨 접힘/펼침 즉시 감지)
- `$effect`: `[appState.todos, appState.searchQuery, appState.sortOrder, appState.fontSize, appState.uiFontSize, appState.fontFamily, appState.uiFontFamily, appState.headerDesign]` 변경 후 `requestAnimationFrame` 1회 재측정
- `document.fonts?.addEventListener('loadingdone', ...)`: 사용자 커스텀 글꼴이나 웹폰트 늦은 로드 완료 직후 재측정
- `transition: left 180ms ease-out` (단, 최초 마운트 프레임은 즉시 배치해 옆에서 날아오는 현상 방지 — `hasMeasured` 플래그 활용!)

### 6.5 폭별·글자 크기별 실측 공간 예산표

| 시나리오 | 창 너비 | 화면 글자 | 체크 중심 | 날짜 뱃지 중앙 (10pt/12pt 메모) | 캡슐 범위 | 우측 4액션 모드 & 점유 폭 | 캡슐↔액션 간격 |
|---|---|---|---|---|---|---|---|
| 기본 창 | `380px` | `10pt` | `23px` | `91px` | `74..108px` | **라벨 전체** (`184..364px`, ~180px) | **`76px`** |
| 스크린샷 창 | `332px` | `10pt` | `23px` | `91px` | `74..108px` | **라벨 전체** (`136..316px`, ~180px) | **`28px`** |
| 스크린샷 + 큰 글자 | `332px` | `12pt` | `23px` | `95px` | `78..112px` | **아이콘 축소** (`182..316px`, ~134px) | **`70px`** |
| 좁은 창 | `268px` | `10pt` | `23px` | `91px` | `74..108px` | **아이콘 축소** (`140..252px`, ~112px) | **`32px`** |
| 극최소 창 | `250px` | `10pt` | `23px` | `91px` | `74..108px` | **아이콘 축소** (`122..234px`, ~112px) | **`14px`** |
| 극최소 + 대형 글자 | `250px` | `14pt` | `23px` | `91px → 클램프 70px` | `53..87px` | **아이콘 축소** (`95..234px`, ~139px) | **`8px` (겹침 0, 꼬리점 숨김)** |

- `@container` 임계식 (`.bulk-dock-wrap` 기준, 내부 폭 = 창 너비 − `20px` 외곽 패딩):
  - `@container (max-width: calc(108px + 13.5em))`
  - 검산: 10pt(`13.33px`) → 컨테이너 `≤ 288px` = 창 너비 **`≤ 308px`** 에서 축소 → `332px` 스크린샷 폭에서는 라벨 전체 표시!
  - 검산: 12pt(`16px`) → 컨테이너 `≤ 324px` = 창 너비 **`≤ 344px`** 에서 축소 → `380px` 기본 창에서는 라벨 전체 표시, `332px`에서는 여유롭게 아이콘 축소!

---

## 7. 컴포넌트 · 시각 · 모션 세부 명세

### 7.1 인셋 말랑 도크 컨테이너 (`.bulk-dock-wrap` · `.bulk-dock`)
- **외곽 래퍼 (`.bulk-dock-wrap`)**:
  - `padding: 5px 10px 2px;` (좌우 `10px`는 `TodoList`의 `pl-3 pr-3` 고정값과 정확히 일치. `--spacing: 3.333333px`를 래퍼에 명시해 rem 스케일 간섭 차단)
  - `container-type: inline-size; flex-shrink: 0; z-index: 10;`
  - Svelte 전환: `transition:slide={{ duration: 150 }}` (기존과 동일, `prefers-reduced-motion` 시 `duration: 0` 고려)
- **도크 본체 (`.bulk-dock`)**:
  - `position: relative; display: flex; align-items: center; justify-content: space-between;`
  - `min-height: max(33px, calc(var(--bd-btn-h) + 11px));`
  - `padding: 3px 5px 3px 4px;` (좌측 `10 + 1 + 4 = 15px` 체크 축 불변!)
  - `border-radius: 11px;`
  - `border: 1px solid var(--bd-dock-border);`
  - `background-color: var(--bd-dock-bg);`
  - 입체감:
    - 라이트: `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62), inset 0 -1.5px 0 var(--bd-dock-rim);`
    - 다크: `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), inset 0 -1.5px 0 rgba(0, 0, 0, 0.26);`
  - `overflow: visible;` (상단 스티커 카운트 핍 `-5.5px`와 하단 인덱스 꼬리점 `-2.8px`가 잘리지 않도록 필수!)

### 7.2 제일 좌측: 전체 선택 조약돌 체크 토글 + 스티커 카운트 핍

#### 4가지 상태 표 (`resolveSelectAllState(visibleSelectedCount, totalCount)`)
| 상태 (`mode`) | 조건 | 버튼 배경 / 테두리 | 내부 아이콘 | 핍 표시 | `aria-checked` | `title` / `aria-label` | 클릭 동작 |
|---|---|---|---|---|---|---|---|
| `empty` | `totalCount === 0` | `--bd-chk-bg` / `--bd-chk-border` (`opacity: 0.38`, `disabled`) | 없음 | 숨김 | `"false"` | `"선택할 할 일이 없어요"` | 없음 |
| `none` | `visibleSelectedCount === 0 && totalCount > 0` | `--bd-chk-bg` / `1.5px solid --bd-chk-border` | 없음 | 숨김 | `"false"` | `"모두 선택 ({totalCount}개)"` | `selectAll()` |
| `partial` | `0 < visibleSelectedCount < totalCount` | `color-mix(in srgb, --bd-accent 16%, --bd-chk-bg)` / `1.5px solid --bd-accent` | 둥근 하이픈(`−`), 색 `--bd-accent` | 표시 (`formatCountPip`) | `"mixed"` | `"{selectedCount}개 선택됨 · 클릭해 모두 해제"` | `deselectAll()` |
| `all` | `visibleSelectedCount > 0 && visibleSelectedCount === totalCount` | `--bd-accent` / `1.5px solid --bd-accent` + 하단 1.5px 받침 | 둥근 체크(`✓`), 색 `--bd-on-accent` | 표시 (`formatCountPip`) | `"true"` | `"전체 선택됨 ({totalCount}/{totalCount}) · 클릭해 모두 해제"` | `deselectAll()` |

> **검색 필터 경계 사례 보정:** 사용자가 항목 2개를 선택한 뒤 검색어를 입력해 해당 항목이 잠시 가려져 `visibleSelectedCount === 0`이지만 `selectedCount > 0`인 경우, `resolveSelectAllState`는 `mode: 'partial'`로 판정해 사용자가 숨겨진 선택 항목의 존재를 핍(`2`)으로 인지하고 한 번 클릭으로 `deselectAll()` 할 수 있게 합니다.

#### SVG 사양 (`10×10px`, `viewBox="0 0 14 14"`)
```svg
<!-- 전체 선택 / 행 체크 (✓) -->
<svg width="10" height="10" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
  <path d="M3.2 7.3L5.8 9.8L10.8 4.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
</svg>

<!-- 일부 선택 (−) -->
<svg width="10" height="10" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
  <path d="M3.5 7h7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
</svg>
```

#### 스티커 카운트 핍 (`.mini-count-pip`)
- `position: absolute; top: -5.5px; right: -7.5px; z-index: 2; pointer-events: none;`
- `min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px;`
- `background-color: var(--bd-accent-fill); color: var(--bd-on-accent);`
- `border: 1.5px solid var(--bd-dock-bg);` (도크 배경과 일치하는 컷아웃 할로)
- `font-size: 8.5px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums;` + `.pip-num { transform: translateY(0.5px); }` (한글 UI 글꼴의 숫자 상승 메트릭 광학 보정)
- `box-shadow: 0 1px 2px rgba(15, 23, 42, 0.18);`
- 표기 규칙 (`formatCountPip(count)`): `count <= 0` → `""`, `1..99` → `String(count)`, `>= 100` → `"99+"`.
- 모션:
  - 첫 등장(`0 → 1+`): `scale(0.55) → scale(1)` (`220ms cubic-bezier(0.34, 1.56, 0.64, 1)`)
  - 개수 증감(`{#key pipText}`): 팝 재실행 (`220ms cubic-bezier(0.34, 1.56, 0.64, 1)`)
  - 터치/클릭 영역 확장: 체크박스 자체에 `::before { content: ''; position: absolute; inset: -4px; }`로 실제 히트 영역을 `24×24px`로 확보(시각적 `16px`은 그대로!).

### 7.3 날짜 중앙 축: 날짜 인덱스 슬라이딩 정렬 캡슐 (`DeadlineSortCapsule`)

- **치수 & 외형**:
  - `position: absolute; top: 50%; transform: translateY(-50%); left: {capsuleLeftPx}px;`
  - `width: 36px; height: 21px;` (14pt 대형 UI 글꼴에서도 세로 타원화 없이 `15×15px` 정원형 노브 비율을 유지)
  - `padding: 2px; border-radius: 999px; border: 1px solid var(--bd-dock-border);`
  - `background-color: var(--bd-track-bg);` (라이트: `mixHex('#1f2937', pillBg, 0.048)`, 다크: `mixHex('#ffffff', dockBg, 0.065)`)
  - `display: inline-grid; grid-template-columns: 1fr 1fr; align-items: center;`
- **슬라이딩 노브 (`.index-slide-thumb`)**:
  - `position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 999px;`
  - 라이트: `background: var(--bd-thumb-bg); box-shadow: 0 1px 2.5px rgba(15, 23, 42, 0.16), inset 0 -1px 0 var(--bd-pill-rim);`
  - 다크: `background: mixHex(accent, '#343a46', 0.26); box-shadow: 0 1px 2.5px rgba(15, 23, 42, 0.16), inset 0 -1px 0 var(--bd-pill-rim);`
  - 상태 이동: `asc` → `translateX(0)`, `desc` → `translateX(15px)`
  - 전환: `transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1)`
- **슬롯 화살표 2종 (`9.5×11px`, `viewBox="0 0 12 14"`)**:
  ```svg
  <!-- 좌측 슬롯: asc (마감일 가까운 순 ↓) -->
  <svg width="9.5" height="11" viewBox="0 0 12 14" fill="none" aria-hidden="true" focusable="false">
    <path d="M6 2.8v8.1" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" />
    <path d="M3.3 8.4L6 11.2L8.7 8.4" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <!-- 우측 슬롯: desc (마감일 먼 순 ↑) -->
  <svg width="9.5" height="11" viewBox="0 0 12 14" fill="none" aria-hidden="true" focusable="false">
    <path d="M6 11.2V3.1" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" />
    <path d="M3.3 5.6L6 2.8L8.7 5.6" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  ```
  - 비활성 슬롯: `color: var(--bd-muted); opacity: 0.42;`
  - 활성 슬롯: `color: var(--bd-accent-text); opacity: 1; transform: scale(1.06);`
- **하단 날짜 인덱스 꼬리점 (`::after`)**:
  - `position: absolute; left: 50%; bottom: -2.8px; width: 5px; height: 5px; border-radius: 1px;`
  - `transform: translateX(-50%) rotate(45deg);`
  - `background-color: var(--bd-track-bg); border-right: 1px solid var(--bd-dock-border); border-bottom: 1px solid var(--bd-dock-border);`
  - `transition: opacity 160ms ease, border-color 150ms ease;`
  - 호버 시 테두리 색이 캡슐과 함께 `--bd-accent`로 동기화!
  - `.hide-notch::after { opacity: 0; }` (`showNotch === false`일 때 숨김 — 목록 0개 또는 안전 클램프 `> 8px` 발동 시)
- **상호작용**:
  - 호버: `border-color: var(--bd-accent); transform: translateY(calc(-50% - 0.5px));`
  - 누름: `transform: translateY(-50%) scale(0.94);`
  - 비활성 (`busy || frozen`): `opacity: 0.4; pointer-events: none;`

### 7.4 우측 4개 일괄 액션 (`[📦 아카이브]` · `[🚩 D-Day]` · `[마감]` · `[지우개]`)

- **공통 규격**:
  - `.bulk-actions { display: flex; align-items: center; gap: 4.5px; margin-left: auto; flex: none; }`
  - 공통 높이: `--bd-btn-h: max(21px, 1.58em);`
  - 공통 모서리: `border-radius: 999px;`
  - 글자 크기: `font-size: 0.675em; font-weight: 700; line-height: 1; white-space: nowrap;` (기존 `184814b` em 배율 100% 계승!)
- **버튼별 스타일**:
  1. **`[아카이브]` & `[D-Day]` (`.bulk-btn-soft`)**:
     - 아이콘: 기존 `<Archive size="1.15em" strokeWidth={2.4} />`, `<Flag size="1.15em" strokeWidth={2.4} />`
     - 패딩: `0 0.68em` (`@container` 축소 시 `width: var(--bd-btn-h); padding-inline: 0` 정원형 아이콘 버튼)
     - 색: `color: var(--bd-accent); background: color-mix(in srgb, var(--bd-accent) 10%, var(--bd-pill-bg)); border: 1px solid color-mix(in srgb, var(--bd-accent) 28%, transparent);`
     - 호버: `background: color-mix(in srgb, var(--bd-accent) 18%, var(--bd-pill-bg)); border-color: color-mix(in srgb, var(--bd-accent) 46%, transparent); transform: translateY(-0.5px);`
     - `[D-Day]` 달력 열림 상태(`ddayPickerOpen`): `outline: 2px solid var(--bd-accent); outline-offset: 1px;` (기존 유지)
     - 비활성(`selectedCount === 0 || busy || frozen`): `opacity: 0.36; cursor: default;`
  2. **`[마감]` (`.bulk-btn-primary`)**:
     - 패딩: `0 0.72em`
     - 활성: `background: var(--bd-accent); color: var(--bd-on-accent); box-shadow: inset 0 -1.5px 0 color-mix(in srgb, var(--bd-accent) 52%, black);`
     - 호버: `filter: brightness(1.06); transform: translateY(-0.5px);`
     - 비활성: `background: color-mix(in srgb, var(--bd-muted) 20%, transparent); color: color-mix(in srgb, var(--bd-muted) 78%, transparent); box-shadow: none; opacity: 0.72;` (기존 칙칙한 `disabled:grayscale` 제거!)
  3. **`[지우개]` (`.bulk-eraser-btn`)**:
     - 크기: `width: var(--bd-btn-h); height: var(--bd-btn-h); border-radius: 999px;`
     - SVG: [EraserButton.svelte:52-64](../src/components/todo/EraserButton.svelte#L52-L64)의 **16×16 노트북 지우개** (`width="14.5" height="14.5"`, 바닥선 + 몸체 + 호버 듀오톤 슬리브)
     - 색: 라이트 기본 `rgba(51, 65, 85, 0.56)` → 호버 배경 `rgba(225, 29, 72, 0.11)` / 선 `#e11d48` / 슬리브 `opacity: 0.24`; 다크 기본 `rgba(203, 213, 225, 0.62)` → 호버 배경 `rgba(251, 113, 133, 0.16)` / 선 `#fb7185`
     - 호버 모션: `.eb-body { transform: rotate(-12deg) translate(-0.4px, -0.5px); }`
     - 누름 모션: 버튼 `scale(0.90)` + `.eb-body { transform: rotate(-18deg) translate(-1.2px, 0.3px); }`
     - 비활성(`selectedCount === 0 || busy || frozen`): `opacity: 0.30; pointer-events: none;` (호버 기울임·로즈색 발동 차단)

### 7.5 할 일 목록(`TodoList.svelte`) 동기화 명세

1. **행 체크박스 통일 (`TodoList.svelte:320-334`)**:
   - 클래스/스타일: `todo-select-chk` — `width: 16px; height: 16px; border-radius: 6px; border: 1.5px solid ...; flex-shrink: 0;`
   - 상단 전체 선택 체크박스와 동일한 둥근 체크 SVG(`viewBox="0 0 14 14"`), 동일한 하단 1.5px 받침, 동일한 다크 모드 `--bd-on-accent` (`#111827`) 대비!
   - `data-todo-select-btn` 속성 추가, `type="button"`, `aria-pressed={isSelected}`, `aria-label={isSelected ? '항목 선택 해제' : '항목 선택'}`.
   - `data-sort-activator`는 절대 붙이지 않음([PRD-todo-row-gestures.md](PRD-todo-row-gestures.md) D1 준수).
2. **선택된 행 하이라이트 & `--row-surface` 무결성**:
   - `.todo-row.is-selected` (`appState.isEditMode && appState.selectedTodoIds.includes(todo.id)`):
     - 라이트: `--row-surface: color-mix(in srgb, var(--todo-accent) 7%, var(--global-theme-color));`
     - 다크: `--row-surface: color-mix(in srgb, var(--todo-accent) 11%, var(--global-theme-color));`
     - `background-color: var(--row-surface);`
   - `.todo-row.is-selected:hover`:
     - 라이트: `--row-surface: color-mix(in srgb, var(--todo-accent) 10%, var(--row-surface-hover));`
     - 다크: `--row-surface: color-mix(in srgb, var(--todo-accent) 14%, var(--row-surface-hover));`
     - `background-color: var(--row-surface);`
   - 이렇게 `--row-surface`를 함께 갱신하면 선택된 줄에 마우스를 올렸을 때 오른쪽 `EraserButton` 뒤의 `.todo-veil` 흐림 받침이 **줄 배경과 한 픽셀의 색 단차도 없이** 녹아듭니다!
3. **편집 모드 이중 가로선 제거 (`TodoList.svelte:282`)**:
   - `listViewportEl`의 `border-color`를 `appState.isEditMode ? 'transparent' : (appState.isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(120,80,20,0.1)')`로 전환합니다.
   - `border-t` 클래스(`1px` 박스)는 유지하므로 `measureLayout()`과 `memoLayoutController` 높이가 변하지 않습니다.

---

## 8. 15개 테마 × 라이트/다크 색상 시스템 (`resolveBulkDockPalette`)

`src/lib/themes.js`의 `TIDY_THEMES` 15종(`classic` 7 · `modern` 5 · `paper` 3) × 라이트/다크 **30조합**을 모두 명시적 색 토큰으로 계산하며, CSS `light-dark()`는 사용하지 않습니다.

| 토큰 | 라이트 모드 (15종 테마) | 다크 모드 (`#23272e` 바탕) | 비고 |
|---|---|---|---|
| `--bd-accent` | `theme.tidy.accent` | `theme.tidy.accentDark` | `getThemeAccent(themeColor, dark)` 동일 |
| `--bd-on-accent` | 상대 휘도 계산 기반 자동 판별 (`#ffffff` — 15종 모두 ≥ 4.5:1 검증; `amber` `#d97706`·`rose` 등 필요 시 `accentFill` 미세 보정!) | `#111827` (15종 다크 파스텔 모두 ≥ 7.0:1) | **단위 테스트로 30조합 모두 `≥ 4.5:1` 강제 검증** |
| `--bd-dock-bg` | `color-mix(in srgb, accent 6.5%, theme.bg)` (`paper` 군: `color-mix(in srgb, accent 7.5%, theme.bg)`) | `color-mix(in srgb, accent 9%, #23272e)` | `kraft`/`sepia`에서도 종이 톤 유지 |
| `--bd-dock-border` | `color-mix(in srgb, accent 22%, theme.border)` | `color-mix(in srgb, accent 24%, rgba(255,255,255,0.08))` | `white`/`slate` 무채색 테마에서도 또렷 |
| `--bd-dock-rim` | `color-mix(in srgb, accent 12%, transparent)` | `rgba(0, 0, 0, 0.25)` | 하단 1.5px 안쪽 받침 |
| `--bd-pill-bg` | `#ffffff` (`paper` 군: `#fffdf7`) | `rgba(255, 255, 255, 0.075)` | 페이퍼 군에서 차가운 순백 방지 |
| `--bd-track-bg` | `color-mix(in srgb, #1f2937 5%, var(--bd-pill-bg))` | `rgba(255, 255, 255, 0.06)` | 슬라이딩 캡슐 트랙 & 꼬리점 공용 |
| `--bd-chk-bg` | `#ffffff` (`paper` 군: `#fffdf7`) | `#262b34` | 미선택 체크박스 내부 |
| `--bd-chk-border` | `#b6bcc7` (`paper` 군: `color-mix(in srgb, accent 35%, #b6bcc7)`) | `#64748b` | 비활성 상태에서 완료 원형(`#d1d5db`)보다 미세하게 또렷 |
| `--bd-ink` / `--bd-muted` | `#1f2937` / `#606976` | `#e2e8f0` / `#9aa6b8` | `header.css` 토큰과 통일 |

> **WCAG AA 대비율 주의 포인트 (사소한 디테일!):**
> `themes.js`의 라이트 `amber` 강조색 `#d97706`과 `#ffffff`의 대비율은 `3.19:1`, `blue` `#2563eb`은 `5.17:1`, `green` `#059669`은 `3.77:1`입니다.
> `[마감]` 버튼과 `mini-count-pip` 숫자(`8.5px~10px` 볼드)가 **15개 라이트 테마 전부에서 4.5:1 이상**을 만족하도록 `resolveBulkDockPalette`는 강조 채움 배경(`--bd-accent-fill`)에 `ensureContrastFill(accent, '#ffffff', 4.5)`(필요한 테마만 명도를 살짝 깊게 조정 — 예: `#d97706 → #b45309`, `#059669 → #047857`)를 적용하고, 다크 모드에서는 `#111827` 잉크를 써서 30조합 모두 WCAG AA를 통과시킵니다!

---

## 9. 상호작용 · 키보드 · 접근성(a11y) · 모션 축소

### 9.1 Tab 초점 순서 & 키보드 조작
1. `MainToolbar`(`.selection-status` `[완료]`, 서식 도구) →
2. `BulkSelectDock`:
   - ① **전체 선택 토글** (`role="checkbox"`, `aria-checked="false" | "mixed" | "true"`, `Space` / `Enter` 토글)
   - ② **날짜 인덱스 정렬 캡슐** (`type="button"`, `aria-pressed={sortOrder === 'desc'}`, `Space` / `Enter` 방향 전환)
   - ③ **`[아카이브]`** (`disabled` 시 건너뜀)
   - ④ **`[D-Day]`** (`aria-haspopup="dialog"`, `aria-expanded={ddayPickerOpen}`)
   - ⑤ **`[마감]`**
   - ⑥ **`[지우개]`** (`aria-label="선택한 항목 삭제"`)
3. `TodoList` 각 행: `[개별 선택 체크박스]` → `[완료]` → `[날짜 뱃지]` → `[글]` → `[D-Day 칩]` → `[키보드 손잡이]` → `[지우개]`

### 9.2 초점 링 & 스크린 리더
- 모든 인터랙티브 버튼: `:focus-visible { outline: 2px solid var(--bd-accent); outline-offset: 1.5px; }`
- 도크 컨테이너: `role="toolbar" aria-label="선택한 할 일 일괄 도구"`
- 스티커 카운트 핍: `aria-hidden="true"` (전체 선택 버튼의 `aria-label`이 `"2개 선택됨 · 클릭해 모두 해제"`로 이미 정확히 읽어주므로 중복 낭독 방지!)

### 9.3 동작 줄이기 (`prefers-reduced-motion: reduce`)
- 슬라이딩 노브(`.index-slide-thumb`), 체크박스 스케일, 핍 팝(`.mini-count-pip`), 지우개 기울임(`.eb-body`), 도크 위치 보정(`left`)의 `transform`/`animation`을 모두 `none` 또는 `transition-duration: 0ms`로 끄고, 색상·투명도 변화만 부드럽게 유지합니다.

---

## 10. 경계 사례 및 예외 처리 매트릭스 (28개 시나리오)

| # | 경계 상황 | 기대 동작 |
|---|---|---|
| B1 | 편집 모드 진입 직후 (`selectedCount = 0`, 할 일 4개) | 전체 선택 빈 스퀘어클(`aria-checked="false"`), 핍 없음, 우측 4버튼 모두 비활성, 정렬 캡슐은 1번째 날짜 뱃지 정중앙 + 꼬리점 표시 |
| B2 | 전체 선택 클릭 (`0 → 4`) | 4개 모두 선택, 전체 선택 `✓` + 핍 `4`, 4개 행 모두 `.is-selected` 틴트, 우측 4버튼 활성 |
| B3 | 전체 선택 상태에서 다시 클릭 (`4 → 0`) | 모두 해제, 핍 사라짐, 우측 4버튼 비활성 |
| B4 | 개별 행 1~3개 선택 (`2/4`) | 전체 선택 `−`(부분) + 핍 `2`, 클릭 시 `deselectAll()`로 0개 해제 |
| B5 | 개별 행을 하나씩 눌러 모두 선택 (`3 → 4`) | 4번째 선택 순간 상단 전체 선택이 `−` → `✓`로 자동 승격, 핍 `3 → 4` 탄성 바운스 |
| B6 | 할 일이 0개일 때 편집 모드 진입 | 전체 선택 `disabled`(`opacity: 0.38`), 정렬 캡슐 폴백 좌표(`91px` @10pt), **꼬리점 숨김(`showNotch = false`)** |
| B7 | 검색 결과가 0개일 때 (전체 할 일은 있음) | `totalCount === 0` → 전체 선택 비활성(단 기존 숨겨진 선택이 있으면 `partial` + 핍 표시해 해제 가능), 꼬리점 숨김 |
| B8 | 검색 필터링 중(4개 중 2개만 보임) 전체 선택 클릭 | 보이는 2개 선택 → `visibleSelectedCount === totalCount (2 === 2)` → `✓` + 핍 `2` |
| B9 | 모든 할 일에 마감일이 없을 때 (달력 아이콘 뱃지만 존재) | `pickAnchorDeadlineBadge`가 아이콘 뱃지(`~37px`) 정중앙(`~77.5px`)을 실측해 캡슐+꼬리점이 아이콘 뱃지 중앙에 정밀 정렬 |
| B10 | 마감일 있는 항목과 없는 항목이 섞여 있을 때 | 날짜 있는 첫 번째 뱃지 정중앙을 기준 삼아 정렬 (정렬 시 날짜 있는 항목이 항상 위쪽에 모이므로 시각적으로 완벽 일치) |
| B11 | 편집 모드 중 특정 행의 날짜를 새로 지정/삭제했을 때 | `$effect`가 다음 프레임에 재측정해 정렬 캡슐 중심을 새 뱃지 폭에 맞춰 부드럽게 보정 |
| B12 | 정렬 캡슐 클릭 (`asc ↔ desc`) | 노브가 `0 ↔ 14px` 스프링 이동, 활성 화살표 색/크기 전환, 할 일 목록 즉시 재정렬 + `saveNow()`, `title`/`aria-pressed` 갱신 |
| B13 | 메모 글자 크기 변경 (`6pt` ~ `40pt`) | 날짜 뱃지 폭 변화에 따라 정렬 캡슐이 중앙을 추종하되, `24~40pt` 초대형 뱃지에서는 `maxCx` 안전 클램프가 우측 4버튼과의 충돌을 차단하고 꼬리점 자동 숨김 |
| B14 | 화면 글자 크기 변경 (`8pt` ~ `16pt`) | 체크 축(`23px`)과 `16px` 체크박스 크기는 불변, 우측 4버튼은 `em` 비례 확대, 임계 폭 도달 시 `.bulk-label` 자동 축소 |
| B15 | 사용자 커스텀 글꼴 늦게 로드됨 | `document.fonts` `loadingdone` 이벤트가 재측정을 트리거해 새 글꼴 뱃지 폭에 즉시 재정렬 |
| B16 | 창 너비 드래그 (`600px → 380px → 332px → 268px → 250px`) | 체크 축 `23px` 전 구간 고정, `≤ 308px`(10pt)에서 라벨만 아이콘으로 부드럽게 축소, 정렬 캡슐 겹침 0px |
| B17 | `headerDesign === 'classic'` vs `'modern'` | 두 헤더 모두 `<MainToolbar />` 하단 아래 `5px` 여백을 두고 인셋 도크가 동일하게 안착 |
| B18 | `서식` 바 열림 vs 닫힘 전환 | 서식 바가 열리든 닫히든 도크 상단 `5px` 여백과 인셋 `11px` 테두리가 깔끔히 분리됨 (이중선 0개) |
| B19 | `DdayBanner` 표시 중 (단일 / 벤토) | 배너 아래에 `5px` 여백으로 독립 안착 |
| B20 | `storageError` 또는 `UpdateBanner` 동시 표시 | 배너 아래에 자연스럽게 스택, z-index 충돌 없음 |
| B21 | `[아카이브]` 또는 `[D-Day]` 처리 중 (`bulkBusy === true`) | 정렬 캡슐 + 우측 4버튼 모두 잠금(`disabled`), 중복 실행 차단 |
| B22 | 업데이트 설치 잠금 (`appState.isUpdateFrozen === true`) | 전체 선택·정렬 캡슐·우측 4버튼 모두 잠금 |
| B23 | `[D-Day]` 클릭으로 날짜 달력 팝업 열림 (`BULK_DDAY_PICKER_KEY`) | `[D-Day]` 알약에 `2px` 테마 강조 `outline` 표시, 다시 누르면 토글 닫힘(`onpointerdown` 판정 유지), 선택 해제 시 달력 자동 닫힘 |
| B24 | 선택된 행에 마우스를 올려 개별 `EraserButton` 노출 | `.todo-row.is-selected`의 `--row-surface`가 `.todo-veil`과 정확히 일치해 글자 페이드아웃에 색 단차 0 |
| B25 | 편집 모드 중 개별 행을 완료 버튼/날짜 뱃지로 드래그 재정렬 | `todo-select-chk`에는 `data-sort-activator` 없음, 드래그 중 체크박스 오동작 없음, 드롭 후 선택 상태 그대로 유지 |
| B26 | 100개 이상 할 일 전체 선택 | 스티커 카운트 핍이 `"99+"`로 캡되어 폭 폭주 방지, 툴팁에는 정확한 숫자(`124/124`) 표기 |
| B27 | 15개 테마 × 라이트/다크 전환 & 멀티 윈도우 테마 동기화 | CSS 변수 반응형 갱신으로 즉시 색감 반영, 다크 파스텔 강조색 위 `#111827` 잉크로 30조합 모두 대비율 ≥ 4.5:1 |
| B28 | `Ctrl+Z` / `Ctrl+Y` (아카이브 보관·삭제·마감 되돌리기) | 기존 스냅샷·`historyEffect` 동작 무변경, 할 일 복원 시 선택·좌표 정상 재동기화 |

---

## 11. 메모 창 세로 배치 · 기존 QA · 통계 무결성

1. **메모 창 세로 배치 (`src/lib/layout/memoLayout.js` · `memoLayoutController.js`)**
   - `<BulkSelectDock />`는 `.main-header` 바깥, `<MemoBody />` 바로 앞(기존 `.bulk-bar` 위치)에 놓이므로 `measureFixedChrome()`이 계산하는 OS 창 최소 높이(`setMinSize`)에 영향을 주지 않습니다.
   - 편집 모드 토글 시 `MemoBody`의 `ResizeObserver`가 변경된 `bodyH`를 감지해 `holdLayout`으로 할 일 영역만 자연스럽게 조정하고, 사용자가 고른 `notesPaneHeight`는 건드리지 않습니다.
   - `TodoList.svelte`의 `listViewportEl`은 `border-t`를 지우지 않고 색만 `transparent`로 바꾸므로 `measureLayout()`의 `viewport` 높이가 변하지 않습니다.
2. **기존 자동 검수 스크립트 호환**
   - `scripts/qa-header.cjs`: `MainToolbar.svelte`의 `.selection-status`(`여러 항목 선택 중` · `완료`) 무변경 → 100% 통과.
   - `scripts/qa-settings.cjs`: 설정 창·글꼴·다크 모드 경로 무변경 → 100% 통과.
   - `src/lib/todos/bulkActions.test.js` · `src/lib/dday/ddayActions.test.js` · `src/lib/layout/memoLayout.test.js`: 기존 903+ 테스트 100% 통과.
3. **PostHog 통계 (`AGENTS.md` 계약)**
   - 새 이벤트 추가 없음 (`analytics.rs` 허용 목록 및 `docs/사용-통계-PostHog.md` 무변경).
   - 기존 `todo_completed`, `todo_deleted`, `dday_created` 등은 기존 `appState` 경로 그대로 동작합니다.

---

## 12. 단계별 세부 구현 계획

각 단계 종료 시 `npm test`와 시각 확인을 거친 뒤 다음 단계로 넘어갑니다. 커밋·푸시는 사용자 요청 시에만 수행합니다.

### 0단계 — 기준선 확인
- [x] `git status`로 작업 트리 확인 (기존 미커밋 작업물 보존)
- [x] `npm test`, `npm run check` 기준선 통과 확인

### 1단계 — 순수 로직 모듈 & 단위 테스트 (`bulkDockLayout.js`)
- [x] `src/lib/todos/bulkDockLayout.js` 작성:
  - 상수 테이블 (`BULK_DOCK_METRICS`)
  - `resolveSelectAllState({ totalCount, visibleSelectedCount, totalSelectedCount })`
  - `formatCountPip(count)`
  - `computeSortCapsulePosition(input)`
  - `resolveBulkDockPalette(themeId, isDarkMode)` (30조합 WCAG AA 대비율 보정, 라이트 앰버 `#b45309` 채도 보존 포함)
- [x] `src/lib/todos/bulkDockLayout.test.js` 작성 및 `npm test` 통과 확인 (8/8 신규 + 전체 914/914 통과)

### 2단계 — 인셋 말랑 도크 컴포넌트 (`BulkSelectDock.svelte`)
- [x] `src/components/todo/BulkSelectDock.svelte` 구현:
  - 인셋 도크 컨테이너(`.bulk-dock-wrap`, `.bulk-dock`, `container-type: inline-size`)
  - 전체 선택 조약돌 체크 토글 + 스티커 카운트 핍 (`mini-count-pip`, 3상태 SVG, 24×24 히트 영역, `.pip-num` 광학 보정)
  - 날짜 인덱스 슬라이딩 정렬 캡슐 (`36×21px`, `15×15px` 정원형 `index-slide-thumb`, 대칭 `↓`/`↑` SVG, `5×5px` 하단 꼬리점 + `.hide-notch`, `ResizeObserver` + `$effect` + `document.fonts` 실측)
  - 우측 4액션 (`[아카이브]`, `[D-Day]`, `[마감]`, 노트북 지우개) + `@container` 정원형 아이콘 축소 + `prefers-reduced-motion`

### 3단계 — `App.svelte` & `TodoList.svelte` 통합
- [x] `src/App.svelte`: 기존 `.bulk-bar` 마크업·CSS 제거 후 `<BulkSelectDock />` 연결 (기존 모든 핸들러·`historyEffect`·`bulkBusy`·`BULK_DDAY_PICKER_KEY` 100% 보존)
- [x] `src/components/TodoList.svelte`:
  - 행 체크박스를 `16×16px, border-radius: 6px` 조약돌 스퀘어클로 통일 + `data-todo-select-btn`·a11y 속성 추가
  - `.todo-row.is-selected` 틴트 + `--row-surface` 동기화 (`.todo-veil` 흐림 받침 색 일치 검증)
  - 편집 모드 중 `listViewportEl` 상단 `border-top-color: transparent` 적용

### 4단계 — 자동 검수 하네스 & 전수 검증
- [x] `src/dev/MemoLayoutPreview.svelte`: `&bulk-qa` 모드에서 `<BulkSelectDock />` 마운트 및 `__memoPreview.configure` 제어 훅 추가
- [x] `scripts/qa-bulk-dock.cjs` 작성 및 Playwright 실행:
  - **좌표 실측 검증**: 상·하단 체크박스 중심 X 차이 `0.03px`, 정렬 캡슐 중심 X와 날짜 뱃지 중심 X 차이 `0.05~0.12px` (10pt/12pt, 날짜 있음/없음 모두), 슬라이딩 노브↔슬롯 오차 `0px`, 도크 세로 중앙 오차 `0px`
  - **충돌 검증**: `250px` / `268px` / `332px` / `380px` × `10pt` / `12pt` / `14pt` 전 구간에서 체크박스·핍·정렬 캡슐·우측 4버튼 간 겹침 `0px` (`250px/14pt`에서 안전 클램프 + `notchVisible=false` + `gapToActions=8px`)
  - **상태·기능 검증**: `0 → 전체 → 해제`, 부분 선택(`−`), 핍(`2`/`4`), 정렬 `asc ↔ desc` 노브 이동 및 실제 순서 반전, 꼬리점 숨김(0건/클램프), `is-selected` 행의 `.todo-veil` 색 일치
  - **시각 캡처 및 2× 확대 미세 정렬 보정**: 앰버·다크·크라프트(날짜 없음)·로즈(클래식) × 380/332/268/250px 캡처(`output/qa/bulk-dock/`) 육안 검수 후 5건 미세 보정 및 재검증 완료
- [x] `npm test` (914/914), `npm run check` (0 errors / 0 warnings), `npm run build`, `scripts/qa-header.cjs` (26/26) 전수 통과 확인

### 5단계 — 문서 마무리
- [x] `docs/QA-bulk-select-dock-20261120.md` 검수 기록 작성 (측정표·캡처 경로·5건 미세 보정·네이티브 데스크톱 확인 범위 명시)
- [x] `claude.md`의 "다중 선택 막대" 절 및 모듈 지도 갱신

---

## 13. 단위 테스트 목록 (`src/lib/todos/bulkDockLayout.test.js`)

1. **`resolveSelectAllState`**
   - `total=0, visSel=0, totalSel=0` → `mode: 'empty'`, `disabled: true`, `ariaChecked: 'false'`
   - `total=4, visSel=0, totalSel=0` → `mode: 'none'`, `disabled: false`, `ariaChecked: 'false'`
   - `total=4, visSel=2, totalSel=2` → `mode: 'partial'`, `ariaChecked: 'mixed'`
   - `total=4, visSel=4, totalSel=4` → `mode: 'all'`, `ariaChecked: 'true'`
   - 검색 중 숨겨진 선택(`total=2, visSel=0, totalSel=2`) → `mode: 'partial'`, `ariaChecked: 'mixed'`, `disabled: false`
2. **`formatCountPip`**
   - `0` / `-1` → `""`, `1` → `"1"`, `99` → `"99"`, `100` → `"99+"`, `999` → `"99+"`
3. **`computeSortCapsulePosition`**
   - 정상 폭(`380px`) + 날짜 뱃지 실측(`badgeCenter = 91px`) → `capsuleLeftPx`가 정확히 `91px` 중심에 배치, `showNotch: true`, `isClamped: false`
   - 날짜 없음 아이콘 뱃지 실측(`badgeCenter = 77.5px`) → `77.5px` 중심에 배치, `showNotch: true`
   - 목록 0건(`badgeCenter = null, hasVisibleRows = false`) → 폴백 좌표 적용, `showNotch: false`
   - 대형 글꼴/극초협폭(`actionsLeft`가 가까이 다가옴) → `maxCx` 클램프 발동, `capsuleRight <= actionsLeft - 8`, 이탈 `> 8px`이면 `showNotch: false`
   - 좌측 경계(`badgeCenter`가 비정상적으로 왼쪽에 있을 때) → `minCx` 하한 보호, 체크박스·핍과 겹침 0
4. **`resolveBulkDockPalette`**
   - `TIDY_THEMES` 15종 × `dark: false | true` = **30조합 전수 루프**:
     - `accentFill` 위 `onAccent` WCAG 2.1 상대 휘도 대비율 **`>= 4.5`** 단언
     - 모든 반환 색상에 `light-dark(` 문자열 미포함 단언
     - `paper` 그룹(`linen`, `kraft`, `sepia`) 라이트 모드 `pillBg`가 `#fffdf7`인지 확인

---

## 14. 상수 한곳 표 (`BULK_DOCK_METRICS`)

| 이름 | 값 | 용도 |
|---|---|---|
| `DOCK_OUTER_GUTTER_PX` | `10` | `.bulk-dock-wrap` 좌우 여백 (`TodoList` `pl-3` 일치) |
| `DOCK_RADIUS_PX` | `11` | `.bulk-dock` 외곽 곡률 |
| `CHECK_SIZE_PX` | `16` | 상·하단 공용 조약돌 체크박스 크기 |
| `CHECK_RADIUS_PX` | `6` | 상·하단 공용 체크박스 곡률 (완료 원형 `18px/50%`와 구분) |
| `CHECK_LOCAL_LEFT_PX` | `4` | `.bulk-dock` 내부 좌측 패딩 (`10 + 1 + 4 = 15px`, 중심 `23px`) |
| `PIP_CLEARANCE_PX` | `12` | 스티커 카운트 핍 우측 안전 여유 |
| `CAPSULE_WIDTH_PX` | `36` | 날짜 인덱스 슬라이딩 정렬 캡슐 폭 (높이 `21px` 고정) |
| `CAPSULE_HALF_PX` | `18` | 정렬 캡슐 반폭 |
| `CAPSULE_THUMB_WIDTH_PX` | `15` | 정원형 슬라이딩 노브 직경 (`asc: 0px`, `desc: 15px`) |
| `ACTIONS_MIN_GAP_PX` | `8` | 정렬 캡슐과 우측 4버튼 최소 간격 |
| `NOTCH_HIDE_TOLERANCE_PX` | `8` | 클램프로 실제 뱃지 중앙에서 이 값을 초과 이탈하면 꼬리점 숨김 |
| `FALLBACK_BADGE_START_LOCAL_X` | `48` | 도크 내부 기준 날짜 뱃지 시작선 (`59 - 11`) |
| `FALLBACK_BADGE_FONT_FACTOR` | `2.35` | 메모 글자 크기(px) 대비 뱃지 반폭 폴백 계수 |
| `COUNT_PIP_CAP` | `99` | 스티커 핍 최대 표기 수 (초과 시 `99+`) |
| `MIN_CONTRAST_RATIO` | `4.5` | WCAG AA 강조 버튼·핍 텍스트 최소 대비율 |

---

## 15. `claude.md` 반영 문구 초안 (구현 완료 후 반영)

> **다중 선택 막대 (`BulkSelectDock.svelte` · `bulkDockLayout.js`)**: 인셋 말랑 도크(`11px`, 외곽 여백 `10px`)로 할 일 목록과 이중 가로선을 없애고, 제일 좌측 전체 선택 토글(`16×16px, rx=6px`, 중심 `23px`)은 행 체크박스 열에, 날짜 인덱스 슬라이딩 정렬 캡슐(`36×21px`, `15×15px` 정원형 `↓|↑` 노브 + `5×5px` 하단 꼬리점)은 실측된 `[data-todo-deadline-btn]` 정중앙에 2축 정렬합니다(극초협폭·대형 글꼴 시 안전 클램프 + 꼬리점 자동 숨김). 상단 전체 선택은 4상태(`비어있음`/`미선택`/`−`/`✓`) + 가로 폭 0px 스티커 카운트 핍(`14px`, `99+` 캡)을 제공하고, 우측 4액션(`[아카이브]`·`[D-Day]`·`[마감]`·노트북 지우개)은 `em` 배율·`@container` 정원형 아이콘 축소·30조합 WCAG AA 대비를 유지합니다.
