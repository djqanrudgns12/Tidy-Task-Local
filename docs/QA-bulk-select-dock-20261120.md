# QA 검수 기록 — 다중 선택 인셋 말랑 도크 & 날짜 인덱스 슬라이딩 정렬 캡슐 (2026-11-20)

| 항목 | 내용 |
|---|---|
| 설계 문서 | [PRD-bulk-select-dock.md](PRD-bulk-select-dock.md) (시안 3, v1.1) |
| 검수 일시 | 2026-11-20 |
| 대상 코드 | `src/lib/todos/bulkDockLayout.js`, `src/lib/todos/bulkDockLayout.test.js`, `src/components/todo/BulkSelectDock.svelte`, `src/App.svelte`, `src/components/TodoList.svelte`, `src/dev/MemoLayoutPreview.svelte` |
| 자동 검수 스크립트 | `scripts/qa-bulk-dock.cjs` (Playwright / Edge, `deviceScaleFactor: 2`), `scripts/qa-header.cjs` |
| 캡처 경로 | `output/qa/bulk-dock/` (13개 PNG + `report.json`) |

---

## 1. 자동 검증 요약

| 항목 | 명령 / 스크립트 | 결과 |
|---|---|---|
| 단위 테스트 (신규 8건 포함) | `npm test` | **PASS** — `914 / 914` 통과 (`bulkDockLayout.test.js` 8건: 4상태·99+ 핍·좌표/안전 클램프/꼬리점·15테마×라이트/다크 30조합 WCAG AA `≥ 4.5:1`·`light-dark()` 금지) |
| 타입·접근성·Svelte 검사 | `npm run check` (`svelte-check --threshold warning`) | **PASS** — `0 errors, 0 warnings` |
| 프런트엔드 프로덕션 빌드 | `npm run build` | **PASS** — `built in 20.78s` |
| 다중 선택 도크 브라우저 검수 | `node scripts/qa-bulk-dock.cjs` (`?memo-layout-preview&bulk-qa`) | **PASS** — 11개 시나리오 전수 통과 |
| 헤더·편집 배너 회귀 검수 | `node scripts/qa-header.cjs` (`?header-preview`) | **PASS** — `26 / 26` 통과 |

---

## 2. 브라우저 좌표·충돌 실측 표 (`output/qa/bulk-dock/report.json`)

Playwright (`msedge`, `deviceScaleFactor: 2`)에서 실제 DOM `getBoundingClientRect()`로 측정한 최종 수치입니다.

| 시나리오 | 폭 / 화면 글자 | 체크 축 오차 (`chkErr`) | 날짜 뱃지 축 오차 (`sortErr`) | 노브↔슬롯 오차 | 세로 중앙 오차 (`midYErr`) | 꼬리점 표시 | 캡슐↔우측 4액션 간격 | 비고 |
|---|---:|---:|---:|---:|---:|:---:|---:|---|
| 1. `332px-eunhasu-axes` | 332px / 10pt | **0.03px** | **0.05px** | **0px** (`asc`) | **0px** | `true` | `46px` | 라벨 전체 표시, 0건 선택 |
| 2. `all-select-and-desc-sort` | 380px / 10pt | 0.03px | 0.05px | **0px** (`desc`) | 0px | `true` | — | 4건 전체 선택(`pip="4"`), `desc` 정렬 시 순서 `t4→t3→t2→t1` 확인 |
| 3. `partial-select-and-veil` | 380px / 10pt | 0.03px | 0.05px | 0px | 0px | `true` | — | 2/4 부분 선택(`aria-checked="mixed"`, `pip="2"`), 선택 행 호버 `.todo-veil` 배경이 `--row-surface`와 일치 |
| 4. `responsive-268px-10pt` | 268px / 10pt | **0.03px** | **0.12px** | 0px | 0px | `true` | `38px` | `@container` 원형 아이콘 축소, 체크 축 이동 0px |
| 5. `responsive-250px-10pt` | 250px / 10pt | **0.03px** | **0.12px** | 0px | 0px | `true` | `20px` | 최소 창 폭, 충돌 0px |
| 6. `responsive-332px-12pt` | 332px / 12pt | **0.03px** | **0.12px** | 0px | 0px | `true` | `92px` | 12pt 배율에서 `@container` 축소, 체크 축 고정 |
| 7. `responsive-250px-14pt` | 250px / 14pt | **0.03px** | `8.12px` (클램프) | 0px | 0px | **`false`** | **`8px`** | 극한 조건에서 안전 클램프 발동 + 꼬리점 자동 숨김 + 겹침 0px |
| 8. `dark-380` | 380px / 10pt (다크) | 0.03px | 0.05px | 0px | 0px | `true` | — | 다크 파스텔 강조색 위 `#111827` 고대비 확인 |
| 9. `kraft-undated-icon-badge` | 360px / 10pt (크라프트) | 0.03px | **0.10px** | 0px | 0px | `true` | — | 날짜 없는 달력 아이콘 뱃지 정중앙 자동 추종 |
| 10. `rose-classic` | 360px / 10pt (로즈/클래식) | 0.03px | 0.05px | 0px | 0px | `true` | — | 클래식 헤더 + 로즈 테마 + 선택 행 호버 `.todo-veil` 일치 |
| 11. `empty-list` | 360px / 10pt (0건) | — | 폴백 | 0px | 0px | **`false`** | — | 전체 선택 `disabled`, 꼬리점 자동 숨김 |

---

## 3. 2× 확대 시각 검수에서 발견해 다듬은 미세 정렬 5건

1차 구현 직후 `output/qa/bulk-dock/*-zoom.png` 2× 확대 캡처를 육안 검수하면서 발견한 사소한 정렬·비율·색감 결함을 모두 수정한 뒤 재측정·재캡처로 확인했습니다.

1. **대형 UI 글꼴(14pt) 정렬 캡슐 세로 타원화 해소**: 캡슐 높이를 `--bd-btn-h` 연동에서 고정 `36×21px`으로 고정하고 슬라이딩 노브를 **`15×15px` 정원형(`translateX(0 ↔ 15px)`)** 으로 맞춰 모든 배율에서 균일한 원형 노브 비율을 유지했습니다.
2. **스티커 카운트 핍 숫자 수직 중심 보정**: 핍 크기를 `14×14px`로 1px 키우고 내부 `<span class="pip-num">`에 `translateY(0.5px)` 광학 보정을 넣어 한글 UI 글꼴(은하수·메이플스토리 등)에서 숫자가 위로 치우쳐 보이던 현상을 없앴습니다.
3. **하단 인덱스 꼬리점 여유 확보**: 꼬리점을 `5×5px, bottom: -2.8px, border-radius: 1px`로 다듬고 `.bulk-dock` 최소 높이를 `max(33px, calc(var(--bd-btn-h) + 11px))`로 1px 확보해 도크 하단 받침과 시각적 간섭을 제거했습니다.
4. **축소 아이콘 버튼 정원화 & 라벨 기준선 정리**: `@container` 축소 시 `.bulk-btn-soft`가 가로로 눌린 타원이 되지 않도록 `width: var(--bd-btn-h); padding-inline: 0` 정원형으로 통일하고, `.bulk-label`(`0`)·`.bulk-primary-label`(`+0.35px`) 기준선을 정리했습니다.
5. **라이트 앰버 강조 채움 색감 보정**: `#d97706`을 흑색과 혼합해 4.5:1로 어둡힐 때 탁한 갈색(`#ad620e`)으로 보이던 문제를, 채도를 살린 앰버-700 **`#b45309`**(대비율 `5.02:1`) 지정으로 개선했습니다.

---

## 4. 캡처 목록 (`output/qa/bulk-dock/`)

- `01-amber-332-eunhasu-0sel.png` / `01-amber-332-dock-zoom.png` — 332px 앰버 모던, 미선택 기본
- `02-amber-380-all-desc.png` / `02-amber-380-all-desc-zoom.png` — 380px 전체 선택(`✓` + 핍 `4`) + `desc` 정렬
- `03-amber-380-partial-2of4.png` / `03-amber-380-partial-zoom.png` — 380px 부분 선택(`−` + 핍 `2`) + 선택 행 호버
- `04-amber-268-narrow.png` / `04-amber-268-narrow-zoom.png` — 268px `@container` 정원형 아이콘 축소
- `05-extreme-250-14pt-zoom.png` — 250px / 14pt 극한 조건 (안전 클램프 + 꼬리점 숨김)
- `06-dark-380-all.png` / `06-dark-380-zoom.png` — 380px 다크 모드 고대비
- `07-kraft-undated-zoom.png` — 360px 크라프트 페이퍼 테마 + 날짜 없는 달력 아이콘 뱃지 정렬
- `08-rose-360-classic.png` — 360px 로즈 테마 + 클래식 헤더 + 선택 행 호버 `.todo-veil` 일치

---

## 5. 검수 범위 및 미실행 항목 명시

- **검증 완료 범위**: 단위 테스트(`npm test`), Svelte/타입/접근성 정적 검사(`npm run check`), Vite 프로덕션 번들(`npm run build`), Playwright/Edge 기반 웹 미리보기(`?memo-layout-preview&bulk-qa`, `?header-preview`) 좌표·충돌·색상·모션·시각 검수.
- **이번 작업에서 건드리지 않아 별도 실행하지 않은 범위**:
  - **네이티브 Tauri 데스크톱 창(WebView2 실제 OS 창)** 런타임 검증은 본 브라우저 QA와 별개이며 아직 수행하지 않았습니다(필요 시 `npm run tauri dev`에서 실제 다중 창·달력 팝업 `date-picker`·`Ctrl+Z/Y` 연동을 추가 확인합니다).
  - **Rust 코드 및 PostHog 통계 이벤트**는 수정하지 않았으므로 Cargo 테스트 및 PostHog 테스트 수신 검증은 범위 밖입니다.
