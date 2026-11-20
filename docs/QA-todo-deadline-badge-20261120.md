# QA 검수 기록 — 투두리스트 날짜 뱃지 규격 통일 · 말랑 딱지 질감 · UI 크기 스마트 스케일링 · 정제 톤 (2026-11-20)

| 항목 | 내용 |
|---|---|
| 설계 문서 | [PRD-todo-deadline-badge.md](PRD-todo-deadline-badge.md) (v2.0) |
| 검수 일시 | 2026-11-20 |
| 대상 코드 | `src/lib/todos/todoBadgeMetrics.js`, `src/lib/todos/todoBadgeMetrics.test.js`, `src/lib/todos/todoBadgeFit.svelte.js`, `src/components/TodoList.svelte`, `src/components/dday/DdayTodoChip.svelte`, `src/components/dday/DdayBanner.svelte`, `src/lib/todos/bulkDockLayout.js`, `src/components/todo/BulkSelectDock.svelte`, `src/App.svelte`, `src/dev/MemoLayoutPreview.svelte`, `src/dev/BulkArchiveMenuPreview.svelte` |
| 자동 검수 스크립트 | `scripts/qa-todo-deadline-badge.cjs` (Playwright / Chrome, `deviceScaleFactor: 2`), `scripts/qa-bulk-dock.cjs` |
| 캡처 경로 | `output/qa/todo-deadline-badge/` (8개 PNG + `report.json`) |

---

## 1. 자동 검증 요약

| 항목 | 명령 / 스크립트 | 결과 |
|---|---|---|
| 단위 테스트 (신규 4건 + 도크 폴백 1건 포함) | `npm test` | **PASS** — `933 / 933` 통과 (`todoBadgeMetrics.test.js` 4건: 6~15pt 비대칭 감쇠 표·1/2/3차 Overflow-Zero 피팅·날짜/요일 분리 및 `NaN` 격리·15테마×라이트/다크 30조합 WCAG AA ≥ `4.6:1` / 미설정 ≥ `3.0:1`·`light-dark()` 미사용) |
| 타입·접근성·Svelte 검사 | `npm run check` (`svelte-check --threshold warning`) | **PASS** — `0 errors, 0 warnings` |
| 프런트엔드 프로덕션 빌드 | `npm run build` | **PASS** (`dist/assets/*.css` `light-dark(` 검출 0건) |
| Rust 단위 테스트 | `cargo test --manifest-path src-tauri/Cargo.toml` | **PASS** — `145 passed; 0 failed` (3 ignored) |
| 날짜 뱃지 4폰트×4크기·쌍둥이 규격 검수 | `node scripts/qa-todo-deadline-badge.cjs` | **PASS** — 19개 계측/시나리오 전수 통과 |
| 다중 선택 도크 정렬·반응형 회귀 검수 | `node scripts/qa-bulk-dock.cjs` | **PASS** — 11개 시나리오 전수 통과 (`sortErr 0.06px`) |

---

## 2. 브라우저 좌표·규격·4폰트×4크기 실측 (`output/qa/todo-deadline-badge/report.json`)

Playwright (Chrome, `deviceScaleFactor: 2`)에서 DOM `getBoundingClientRect()`로 측정한 실측치입니다.

| 검증 항목 / 조합 | 날짜 슬롯 폭 (`slotW`) | 날짜·D-Day 높이 (`height`) | 기준 글자 (`--tb-date-fs`) | 자간 (`--tb-date-ls`) | 도크 정렬 오차 (`sortErr`) | 넘침 (`scrollWidth > clientWidth`) |
|---|---:|---:|---:|---:|---:|---:|
| 기본 10pt (`메이플스토리 L`) + 하단 입력줄 | **64px** (전 행 동일 `0px` 편차) | **22px** (날짜=D-Day=하단 `0px` 편차) | `10.5px` | `-0.025em` | **0.06px** | **0px** |
| 4폰트(`메이플스토리 L`·`KCC 간판체`·`배달의민족 도현`·`맑은 고딕`) × **`6pt`** | `58px` | `18px` | `9.5px` | `-0.025em` | **0.06px** | **0px** |
| 4폰트 × **`10pt`** | `64px` | `22px` | `10.5px` | `-0.025em` | **0.06px** | **0px** |
| 4폰트 × **`12pt`** | `71px` | `24px` | `11.66px` | `-0.025em` | **0.06px** | **0px** |
| 4폰트 × **`15pt`** | `82px` | `28px` | `13.39px` | `-0.025em` | **0.06px** | **0px** |

### 상태·테마·불변식 추가 검증
- **반응형 자정 전환:** `todayKey`를 `'2026-11-20'` → `'2026-11-21'`로 변경 시 기존 `today` 행이 즉시 `overdue`(`data-dl="overdue"`)로 전환됨을 확인.
- **비정상 날짜 격리:** `deadline: 'not-a-date'`가 파란 `later`로 떨어지지 않고 `data-dl="invalid"`(중립 회색 점선, 넘침 `0px`)로 안전하게 표시됨을 확인.
- **프로브 계약 준수:** `.todo-badge-probe`에 `data-todo-deadline-btn`이 없으며 `listContentEl` 바깥(`.todo-list-root` 직속)에 격리되어 `measureLayout()` 및 `BulkSelectDock` 탐색을 간섭하지 않음.
- **2× 시각 마감 검수:** `01-amber-light-10pt.png`, `02-kraft-paper-10pt.png`, `03-amber-dark-10pt.png`, `04-size-6pt.png`, `05-size-12pt.png`, `06-size-15pt.png`, `07-font-kcc-ganpan.png`, `08-font-do-hyeon.png` 직접 육안 검수 완료. 검수 중 하단 `.todo-date-button`이 `--tb-date-fs`/`--tb-date-ls` 대신 고정 `--tb-fs`/`-0.025em`을 덮어쓰던 1건을 발견해 상속되도록 보완 후 재통과 확인.

---

## 3. 검수 범위 및 미실행 항목 명시

- **검증 완료 범위**: Node 단위 테스트(`npm test`), Svelte/타입/접근성 검사(`npm run check`), 프로덕션 번들 빌드(`npm run build`), Rust 단위 테스트(`cargo test`), Playwright 브라우저 기반 DOM 계측 및 2× 시각 검수(`?memo-layout-preview&full-ui&bulk-qa`).
- **이번 브라우저 QA 범위 밖 (네이티브 데스크톱 확인 별도):** 실제 Tauri/WebView2 실행 창에서 별도 달력 창(`date-picker`) 개폐 및 OS 창 드래그 상호작용은 브라우저 미리보기 범위를 넘으므로 네이티브 앱 실행 시 추가 확인 대상입니다.
