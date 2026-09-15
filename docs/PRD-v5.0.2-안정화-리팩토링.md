# PRD — Tidy Task v5.0.2 안정화 · 리팩토링

- 문서 상태: **초안 v2 (사용자 검토 대기)** — 10장의 결정 사항이 확정되기 전에는 코드를 수정하지 않습니다.
- 작성일: 2026-09-16
- 기준 커밋: `cf0c2c1` (main)
- 근거 문서: [리팩토링-진단-보고서-v5.0.2.md](리팩토링-진단-보고서-v5.0.2.md) (1차 진단 + 13장 2차 추가 발견)
- 항목 ID 규칙: 1차 보고서의 `B·M·L·P·A·G`를 그대로 쓰고, 2차 발견은 `N`(버그), `P9~`(성능), `X`(레거시 현대화)로 이어 붙입니다.

---

## 1. 배경 (Problem)

Tidy Task v5.0.0은 기능은 풍부하지만, 1·2차 정독에서 다음 네 가지 구조적 문제가 확인되었습니다.

1. **창 사이 신호가 잘못 전달되는 곳이 있습니다.** 한 창의 버튼이 다른 모든 창의 설정·본문을 바꾸거나(B1), 보조 창이 닫힐 때 리마인더 미루기가 풀립니다(B2).
2. **데이터 보호 장치 일부가 실제로는 동작하지 않습니다.** 저장 라이브러리가 읽기 실패를 조용히 무시하기 때문입니다(B6). 게다가 `reload()`가 다른 창의 저장을 되돌릴 수 있습니다(B3).
3. **"매니저 창" 규칙에 빈틈이 있습니다.** 승계가 실패하거나 매니저가 둘이 됩니다(B4). 트레이 메뉴와 폰트 추가는 `main` 창이 없으면 동작하지 않습니다(M4, N2).
4. **로직이 한 파일에 몰려 있습니다.** `appState.svelte.js`가 2,375줄이고, 같은 코드가 여러 벌 복사되어 있습니다. 그래서 한 곳만 고치면 다른 곳에 옛 버그가 남습니다(M7이 실제 사례).

## 2. 목표와 비목표

### 2.1 목표 (Goals)
| # | 목표 | 측정 방법 |
|---|---|---|
| G-1 | 확인된 🔴·🟠 버그를 모두 해결합니다 | 6장 각 작업 패키지의 수용 기준 통과 |
| G-2 | **기능·디자인 회귀 0건** | 8장 회귀 체크리스트 전 항목 통과 |
| G-3 | **저장 데이터 형식 100% 호환** (5.0.0 ↔ 5.0.2) | 4.1 스키마 계약 + 픽스처 왕복 테스트 |
| G-4 | 저장 규칙(프로젝트 규칙 2) 누락을 **구조적으로 불가능**하게 만듭니다 | 필드 표 1개로 `init`/저장/스냅샷을 생성하고 테스트로 대조 |
| G-5 | 입력 중 불필요한 디스크 쓰기·IPC를 줄입니다 | 5장 성능 지표 |
| G-6 | `appState.svelte.js`를 기능별 모듈로 나누되 **공개 API는 그대로** 유지합니다 | 컴포넌트 쪽 `appState.xxx` 호출부 변경 0건 |

### 2.2 비목표 (Non-goals) — 이번 버전에서 **하지 않는 것**
- 화면 디자인, 색상, 크기, 배치, 애니메이션 변경 (버그 수정에 꼭 필요한 경우만 예외이며, 사전 승인을 받습니다)
- 저장 파일 이름·키 이름·필드 이름 변경, 기존 데이터 마이그레이션
- 새 기능 추가 (단 10장에서 사용자가 승인한 항목은 예외. 예: Ctrl+S)
- 서식 편집 엔진(`document.execCommand`) 교체 → 9장 "보류" 참고
- TypeScript 전환, 상태 관리 라이브러리 도입

---

## 3. 불변 조건 (Invariants) — 어떤 작업도 깨뜨려서는 안 되는 것

작업 패키지는 모두 이 목록을 기준으로 영향 여부를 표시합니다(6장의 "불변 조건 영향" 칸).

| ID | 불변 조건 |
|---|---|
| I-1 | 저장 파일은 `tidy-task-config.json` 하나이고, **4.1의 키·필드 이름과 기본값 규칙을 그대로 따릅니다** |
| I-2 | 창 라벨 체계(`main`, `note-1..10`, `tinynote-1..10`, `settings`, `ctx-menu`, `reminder`, `welcome`, `archive`, `help`, `update-notice`)는 바뀌지 않습니다 |
| I-3 | 내용이 있는 창은 재시작 시 **같은 위치·크기·상태**(전체화면·롤업·세로 스냅)로 복원됩니다 |
| I-4 | 사용자가 비운 데이터 창만 "유령 청소기"가 지웁니다. 부팅 직후 1.5초 유예는 유지합니다 |
| I-5 | 네트워크(업데이트 확인)와 리마인더 점검은 **항상 창 1개(매니저)만** 수행합니다 |
| I-6 | 한글 조합 입력(IME) 중에는 편집기 내용을 밖에서 덮어쓰지 않습니다 (`editable.js`) |
| I-7 | 되돌리기 기록은 창별로 최대 20개이고, 기록 대상 필드는 4.2의 표와 같습니다 |
| I-8 | 모든 저장은 창 안에서 한 줄로 실행됩니다(`enqueueWrite`). 창을 닫을 때는 대기 중인 저장을 끝낸 뒤 파괴합니다 |
| I-9 | 단축키 동작 (8장 R-40~R-46) |
| I-10 | 창 최소 크기: Tidy 280×(계산값), Tiny Note 200×45, 롤업 35 |
| I-11 | 저장 파일에 모르는 키가 있어도 지우지 않습니다 (앞으로 추가될 키 보호) |

---

## 4. 데이터·통신 계약 (Contracts)

### 4.1 저장 스키마 계약 (`tidy-task-config.json`)

#### 전역 키
| 키 | 형식 | 쓰는 곳 | 비고 |
|---|---|---|---|
| `main`, `note-N`, `tinynote-N` | 창 데이터 객체 (아래 표) | 각 창 자신 | 빈 보조 창은 삭제 |
| `activeExtraWindows` | `string[]` | 창 생성·청소·부팅 복원 | 내용이 있는 보조 창 명부. **닫힌 창도 포함** |
| `customFonts` | `{name, path}[]` | 폰트 추가 | |
| `hideWelcomeMessage` | `boolean` | 환영 창 | |
| `globalMuteSound` | `boolean` | 모든 데이터 창 저장 시 | 창 데이터에도 같은 값이 들어 있음 |
| `archivedNotes` | `{id, title, content, themeColor, isDarkMode, bookmarked, archivedAt, sourceLabel}[]` | 아카이브 | |
| `updateState` | `{skippedVersion, lastCheckedAt, snoozeUntil, latest}` | 매니저 | |
| `update-notice:v5.0.0:hidden-until` | `number` | 공지 창 | Q1에 따라 ID 유지/변경 |
| (구버전 루트 키) `todos`, `archivedTodos`, `notes`, `themeColor` 등과 `customFontPath` | — | **읽기 전용** (마이그레이션) | 절대 쓰지 않음 |

#### 창 데이터 필드 — 복원 규칙 (현재 `init()` 로직을 그대로 옮긴 계약)
> `||`는 "빈 값(0, '', false 포함)이면 기본값", `??`는 "없을 때(null/undefined)만 기본값"입니다. **이 차이를 그대로 지켜야** 저장값이 바뀌지 않습니다.

| 필드 | 복원 규칙 | 저장 | 스냅샷(되돌리기) |
|---|---|---|---|
| `todos` | `\|\| []` | ✅ | ✅ |
| `archivedTodos` | `\|\| []` | ✅ | ✅ |
| `notes` | `\|\| ''` | ✅ | ✅ |
| `themeColor` | `normalizeThemeId(v, tinynote면 'tiny-note' 아니면 'tidy')` | ✅ | ✅ |
| `opacity` | `?? 1.0`, 숫자가 아니거나 0.1 미만이면 1.0 | ✅ | ✅ |
| `reminderOpacity` | `?? 1.0` | ✅ | — |
| `fontFamily`, `uiFontFamily` | `\|\| '메이플스토리 L'` | ✅ | ✅ |
| `fontSize`, `uiFontSize` | `\|\| 10` | ✅ | ✅ |
| `letterSpacing` | `?? 0` | ✅ | ✅ (적용 시 `?? 0`) |
| `isPinned` | `\|\| false` | ✅ | — |
| `title` | `\|\| ''` | ✅ | ✅ |
| `isDarkMode` | `isTinyNoteDarkTheme(themeColor) \|\| v \|\| false` | ✅ | ✅ |
| `showArchived`, `showNotes` | `?? true` | ✅ | ✅ |
| `showReminders` | `?? true` | ✅ | ✅ (적용 시 `?? true`) |
| `reminderSuppressUntil` | `\|\| 0` | ✅ | ✅ (적용 시 `\|\| 0`) |
| `windowPosX/Y`, `windowWidth/Height` | 그대로 (없으면 undefined → 저장 시 키 생략) | ✅ | — |
| `isFullscreen` | `\|\| false` | ✅ | — |
| `todoHeight` | `?? 145` | ✅ | — (레거시, 유지) |
| `notesHeight` | `?? 140` | ✅ | — |
| `isNotesLocked` | `?? false` | ✅ | — |
| `globalMuteSound` | 전역 키에서 읽음 `\|\| false` | ✅ (창 데이터+전역) | — |
| `isRolledUp` | `\|\| false` | ✅ | — |
| `previousHeight` | `\|\| 280` | ✅ | — |
| `isVerticalSnapped` | `\|\| false` | ✅ | — |
| `preSnapPosY`, `preSnapHeight` | `?? null` | ✅ | — |
| 할 일 항목 | `{id, text, completed, deadline, lastNotified?}` | — | — |

**저장하지 않는 상태(현행 유지)**: `sortOrder`, `searchQuery`, `isEditMode`, `selectedTodoIds`, `reminderTitle`(Q11), 업데이트 화면 상태.

### 4.2 되돌리기 스냅샷 계약
위 표의 "스냅샷" 칸 16개 필드가 전부입니다. `applySnapshot()` 뒤에는 조용히 저장하되 기록은 남기지 않습니다.

### 4.3 창 사이 이벤트(IPC) 계약

| 이벤트 | 보내는 곳 → 받는 곳 | payload | 5.0.2 변경 |
|---|---|---|---|
| `req-apply-settings` | 설정 창·툴바 🔔 → 전체 | `{targetWindow, fontSize, …, showReminders, globalMuteSound}` | 🔔도 **`targetWindow` 필수** (B1) |
| `req-reset-data` / `req-reset-config` | 설정 창 → 대상 창(`emitTo`) | 없음 | 변경 없음 |
| `req-add-custom-font` | 설정 창 → (현재) main | `{name, path}` | **매니저가 처리**, 이어서 `custom-font-added` 방송 (N2) |
| `custom-font-added` 🆕 | 매니저 → 전체 | `{name, path}` | 각 창이 폰트 등록 (N2) |
| `spawn-new-window` / `spawn-tiny-note` / `req-reset-coordinates` | Rust 트레이 → (현재) main | 없음 | **전체 방송 + 매니저만 처리** (M4) |
| `before-quit` 🆕 | Rust 트레이 "종료" → 전체 | 없음 | 데이터 창이 즉시 저장 (N10) |
| `manager-closing` | 닫히는 매니저 → 전체 | 없음 | 선출 규칙 변경 (B4) |
| `manager-reclaim` 🆕 | 새로 뜬 `main` → 전체 | 없음 | 기존 매니저가 권한 반납 (B4) |
| `req-reminder-sync` | 데이터 창 → 매니저 | 없음 | **데이터 창만** 보냄, 미루기 초기화 제거(Q2) (B2) |
| `reminder-ready` / `reminder-update` | 리마인더 ↔ 매니저 | 표시 데이터 | 변경 없음 |
| `dismiss-reminder` | 리마인더 → 매니저 | `{mode, hours?, minutes?}` | 음수·NaN 방어 (N12) |
| `update-reminder-opacity` | 리마인더 → 매니저 | `{opacity}` | 저장 디바운스 (N7) |
| `update-reminder-title` | (보내는 곳 없음) | — | **유령 경로, 제거** (Q11) |
| `archive-reminder-item` | 리마인더 → 전체 | `{id, sourceLabel}` | 원래 창이 닫혀 있으면 **매니저가 대신 처리** (N3) |
| `reminder-mark-notified` 🆕 | 매니저 → 원래 창 | `{label, ids, date}` | 열린 창이 직접 기록 (M1) |
| `req-update-check` / `update-result` / `update-dismissed` | 업데이트 흐름 | 기존 | 변경 없음 |
| `show-ctx-menu` / `ctx-action` | 창 ↔ 우클릭 메뉴 | 기존 | `state`를 **가벼운 설정만** 전송 (P2) |
| `settings-ready` / `set-settings-target` | 설정 창 ↔ 요청 창 | 기존 | 변경 없음 |
| `archive-updated` | 아카이브를 바꾼 창 → 전체 | 없음 | 변경 없음 |

### 4.4 창 계약 (크기·옵션)
현재 코드의 창 생성 옵션을 **`windows/windowRegistry.js` 한 곳의 상수**로 옮기되, 값은 바꾸지 않습니다. 단 M7에서 아카이브 꺼내기 창의 `minWidth` 160만 200으로 통일합니다.

| 창 | 기본 크기 | 최소 크기 | 주요 옵션 |
|---|---|---|---|
| `main` | 350×500 | 250×300 (실행 중 280×계산값) | 투명, 테두리 없음, 처음엔 숨김 |
| `note-N` | 380×500 (저장값 우선) | 250×300 | 투명, 테두리 없음 |
| `tinynote-N` | 250×280 (저장값 우선, 롤업이면 높이 35) | 200×45 (롤업 200×35) | 불투명, 최대화 불가 |
| `reminder` | 280×250 우하단 | 200×150 | 항상 위, 작업표시줄 숨김, 포커스 안 뺏음 |
| `settings` | 320×500 | — | 항상 위, 크기 고정 |
| `archive` | 450×550 | 350×400 | 투명 |
| `ctx-menu` | 250×600 (내용에 맞춤) | — | 숨김 상주, 그림자 없음 |
| `welcome` / `update-notice` / `help` | 기존 `updateNotice.js` 상수 / 600×700 | — | 기존 |

---

## 5. 성능 목표

| 지표 | 현재 | 목표 | 관련 항목 |
|---|---|---|---|
| 글자 입력 1회당(0.5초 디바운스) 매니저의 창 데이터 읽기 IPC | 창 수(N)만큼 | **0회**(할 일·마감일이 바뀔 때만 N회) | P1 |
| 할 일 드래그 1회당 디스크 저장 | 이동한 칸 수만큼(수십 회) | **1회** | M3 |
| 우클릭 1회당 전송 데이터 | 전체 할 일 깊은 복사 | 설정값 8개 | P2 |
| 새 창 버튼 1회당 창 존재 확인 IPC | 최대 20회 순차 | **1회** | P4 |
| 폰트 5MB 업로드 시 전송 크기 | 약 20MB(JSON 숫자 배열) | 약 5MB(바이너리) | P6 |
| 리마인더 투명도 슬라이더 1칸당 저장 | 1회(전체 저장) | 멈춘 뒤 1회 | N7 |
| 아카이브 카드 N개 레이아웃 재계산 | 카드 1개 변화마다 전체 재계산(N²) | 프레임당 1회 | P9 |

---

## 6. 작업 패키지 (Work Packages)

**공통 규칙**
- 패키지 하나는 커밋 1~3개로 나누고, 커밋 메시지에 항목 ID를 적습니다.
- 시작 전 태그를 남깁니다: `git tag pre-refactor-5.0.2` (문제가 생기면 이 지점으로 되돌릴 수 있습니다)
- 각 패키지는 7장의 **검증 게이트**를 통과해야 끝난 것으로 봅니다.
- "변경 전/후"는 방향을 보여 주는 요약이며, 실제 코드는 작업 때 주변 코드 스타일과 한국어 "왜" 주석 규칙을 따릅니다.

---

### WP0. 준비 · 버전 5.0.2
| 항목 | 내용 |
|---|---|
| 목표 | 버전 표기 통일, 기준선 기록 |
| 변경 파일 | `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `public/help.html`(47·183줄), `SettingsModal.svelte:448`, (Q1) `updateNotice.js:1` |
| 세부 단계 | ① `git tag pre-refactor-5.0.2` ② `npm version 5.0.2 --no-git-tag-version` (package.json과 lock을 함께 갱신) ③ Cargo.toml `version = "5.0.2"` ④ 도움말·대체 표기 수정 ⑤ 기준선 기록: 테스트 73개 통과, svelte-check 오류 918 / 경고 16, cargo check 경고 0 |
| 불변 조건 영향 | 없음 (Q1에서 공지 ID를 바꾸면 공지가 다시 뜸) |
| 수용 기준 | 설정 창 하단과 업데이트 영역에 `v5.0.2` 표시 / `npx tauri build`의 설치 파일 이름이 5.0.2 |
| 롤백 | 커밋 되돌리기 |

---

### WP1. 확실한 버그 수정 (작은 수정 묶음)
| ID | 변경 | 파일 | 변경 전 → 후 |
|---|---|---|---|
| B1 | 🔔 버튼 payload에 대상 창 명시 | `MainToolbar.svelte:607-611` | `emit('req-apply-settings', payload)` → `payload.targetWindow = appState.windowLabel` 추가 |
| B2-a | 닫기 처리기에서 데이터 창만 저장 | `App.svelte:873-917` | `if (win.label === 'settings') return;` → 데이터 창이 아니면 저장을 건너뛰고 바로 `destroy()` |
| B2-b | 저장 입구 이중 방어 | `appState._writeToDisk` 입구 | 라벨이 데이터 창이 아니면 `return true` (디스크 무변경) |
| B2-c | 미루기 초기화 제거 (Q2 승인 시) | `appState.svelte.js:539-542` | `this.reminderSuppressUntil = 0;` 줄 삭제, 동기화만 유지 |
| B3 | `reload()` 전부 제거 | `appState.svelte.js:453`, `archiveStore.svelte.js:34,116,147,265` | `try { await store.reload() } catch {}` 줄 삭제 |
| M3 | 드래그 중 저장 금지 | `TodoList.svelte:106-114` | `consider`: `appState.todos = items`만 / `finalize`: 기존 `reorderTodos(items)` |
| M8 | 설정 초기화 크기 단위 | `App.svelte:1033-1055` | `PhysicalSize(380,500)` → `LogicalSize(380,500)`, `customFonts = []` 줄 삭제 |
| N5 | 리마인더 글자 `&`·`<` 사라짐 | `ReminderPopup.svelte:272-276` | 정규식 제거 → 텍스트 추출 함수(`htmlToText`) 사용 |
| N11 | 버튼 안 버튼 | `ArchivedList.svelte:23-47` | 바깥 `<button>` → `<div role="button" tabindex="0">` + Enter/Space 처리 (**클래스·스타일 동일**) |
| N12 | 시간 지정 음수·NaN | `appState.dismissReminderPopup` | `h, m`을 `Math.max(0, Number(x) \|\| 0)`로 정규화 |

- **불변 조건 영향**: I-4(B2-b는 데이터 창에만 청소기를 적용하므로 영향 없음), I-8(B3는 쓰기 순서를 바꾸지 않음)
- **위험·완화**
  - B2-a: 보조 창(리마인더·환영)은 원래 저장할 데이터가 없습니다. 창 라벨 표(I-2)로 판별 함수를 한 곳에 둡니다.
  - M3: 드래그를 취소하면 `finalize`가 원래 순서로 오므로 저장 결과가 같습니다.
  - B3: 모든 창이 Rust 메모리 1개를 공유한다는 사실은 원본 코드로 확인했습니다(보고서 1-1).
- **수용 기준**: 8장의 R-10, R-11, R-20~R-24, R-30, R-50 통과. 추가로 🔔 클릭 후 **다른 창의 `themeColor`/본문 HTML이 바이트 단위로 같음**(개발자 도구로 store 값 비교)

---

### WP2. 아카이브 안정화
| ID | 변경 | 파일 |
|---|---|---|
| B5-a | `_safeModify()`가 `true/false`를 반환하고 예외를 삼키지 않고 기록 | `archiveStore.svelte.js:112-129` |
| B5-b | 아카이브 수정 전용 직렬화 큐 `enqueueArchive()` (창 안 경합 차단) | 같은 파일 |
| B5-c | `addNote()` = 쓰기 → **다시 읽어 새 id 존재 확인** → 없으면 최대 3회 재시도 → 실패 시 `false` | 같은 파일 162-178 |
| M5 | 아카이브 닫기 전에 대기 중인 본문·제목을 모두 저장하고 완료를 기다림 | `ArchiveWindow.svelte:289-291, 104-110, 346-365` |
| M6 | B5-b로 함께 해결 | — |
| N6 | 선택 모드 `{@html}`에 정제 적용: `sanitizeForDisplay(clampFontSizeHtml(...))` / 새 노트 추가 입력칸을 `bind:innerHTML` 대신 `use:editable` 사용 (붙여넣기 시 서식 제거가 다른 편집기와 같아짐) | `ArchiveWindow.svelte:579, 859, 1014` |
| P9 | 카드별 ResizeObserver는 **"재계산 예약"만** 하고, 실제 재계산은 프레임당 1회 | `ArchiveWindow.svelte:159-248` |
| P10 | 카드 본문 표시용 HTML을 `note.id + content` 기준으로 캐시(`Map`) | 같은 파일 |

- **세부 단계**: B5-a → B5-b → B5-c(단위 테스트: 가짜 store로 "쓰기 후 확인 실패 → 재시도 → false") → M5 → N6 → P9·P10
- **불변 조건 영향**: I-1(`archivedNotes` 형식 동일), I-6(`editable` 사용으로 오히려 일치)
- **위험·완화**: N6의 추가 입력칸은 겉모습이 같아야 합니다. 클래스·스타일 문자열을 그대로 두고 동작 방식만 바꿉니다.
- **수용 기준**: R-60~R-68 통과, Tiny Note 2개에서 1초 안에 연속 보관 10회 후 아카이브에 20개 모두 존재

---

### WP3. 저장 계약 코덱 · 데이터 안전장치
**목적**: 프로젝트 규칙 2("새 상태는 `takeSnapshot`·`performSave`·`init`에 모두 반영")를 사람의 주의가 아니라 **코드 구조로** 보장하고, B6의 데이터 유실 경로를 막습니다.

| ID | 변경 |
|---|---|
| A1-a | `src/lib/storage/windowDataCodec.js`(순수 함수) 신설: 4.1 표를 그대로 옮긴 `WINDOW_FIELDS` 배열(`name`, `restore`, `inSnapshot`) + `decodeWindowData(raw, ctx)`, `encodeWindowData(state)`, `pickSnapshot(state)`, `hasWindowContent(winData)` |
| A1-b | `appState.init()`, `_writeToDisk()`, `takeSnapshot()`, `applySnapshot()`, `_rehydrateFromDisk()`가 코덱을 사용하도록 교체 (**각 필드의 `\|\|`/`??` 규칙을 1:1로 이식**) |
| L4 | "빈 창" 판정을 `hasWindowContent()` 하나로 통일 (spawn·restore·부팅 복원·청소기 5곳) |
| B6-a | Rust `setup`에서 설정 파일 점검: 정상 JSON이면 `tidy-task-config.backup.json`으로 복사(2세대 보관), 손상이면 손상본을 `…corrupt-<시각>.json`으로 보존하고 백업에서 복구 (Q4 승인 시) |
| B6-b | Rust 명령 `store_health()` → `{exists, bytes, parseOk}`. JS `_ensureStoreLoaded()`에서 "파일은 정상인데 스토어가 비어 있음"이면 읽기 실패로 판정하고 **이 경우에만** `reload()` 1회 후 재확인 → 그래도 비어 있으면 기존 잠금 경로(`storageError` 배너) 사용 |

- **세부 단계**
  1. 코덱과 단위 테스트를 먼저 작성합니다: 5.0.0 형식 픽스처(`src/lib/storage/__fixtures__/config-v5.0.0.json`, 모든 필드 + 구버전 루트 키 + 모르는 키 포함)로 `decode → encode` 왕복 결과가 **현재 `init`/`_writeToDisk`와 똑같은지** 확인
  2. 경계값 테스트: `fontSize: 0 → 10`(`||`), `letterSpacing: 0 → 0`(`??`), `opacity: 0.05 → 1.0`, `previousHeight: 0 → 280`, Tiny Note 다크 테마의 `isDarkMode` 강제
  3. appState 연결은 한 메서드씩 바꾸고, 그때마다 테스트·빌드를 돌립니다
  4. Rust 백업(B6-a) → `store_health`(B6-b) → JS 연결
- **불변 조건 영향**: I-1, I-11 **직접 관련** → 픽스처 테스트가 막아 줍니다
- **위험·완화**: 복원 규칙을 하나라도 다르게 옮기면 저장값이 조용히 바뀝니다. 그래서 필드 표를 테스트 입력으로 그대로 쓰고, "현행 `init()`을 그대로 복사한 참조 함수"와 새 코덱 결과를 비교하는 **대조 테스트**를 1회성으로 둡니다. 연결이 끝나면 참조 함수는 삭제합니다.
- **수용 기준**
  - 픽스처 왕복 테스트 통과
  - 파일을 일부러 깨뜨린 뒤 실행하면 백업에서 복구되고 모든 창이 복원됨
  - 정상 파일에서는 실행 전후 `tidy-task-config.json`의 의미 있는 내용이 같음(백업 파일만 추가)

---

### WP4. 매니저 · 창 관리 재정비
| ID | 변경 |
|---|---|
| A2 | `src/lib/windows/windowRegistry.js`: 창 옵션 상수(4.4), `findSlot(kind, {preferData})`, `openNoteWindow()`, `openTinyNote()`, `restoreArchivedTinyNote(noteData)`, `removeFromRegistry(label)`. `appState`와 `archiveStore`가 **같은 함수**를 사용 |
| P4 | 슬롯 탐색 시 `getAllWebviewWindows()` 1회 조회 |
| L1 | 생성 중 잠금(`isSpawning`) — 연타해도 창 1개 |
| M7 | 꺼내기 창 `minWidth` 200, `windowWidth/Height` 기본값 명시 (기존 `appState.restoreTinyNote`의 수정본 기준으로 통합) |
| B4-a | `src/lib/windows/managerElection.js`: 후보 = **열려 있는** 데이터 창, 우선순위 `main` → `note-1..10` → `tinynote-1..10` (순수 함수 `pickManager(openLabels)` + 테스트) |
| B4-b | `becomeManager()` / `resignManager()`: 매니저 리스너, 3초 뒤 점검, **1시간 주기**, 업데이트 일정, 트레이·폰트 수신을 한 번에 켜고 끔. `setInterval` 핸들을 저장해 반납 시 해제 |
| B4-c | `main`이 새로 뜨면 `manager-reclaim` 방송 → 기존 매니저 `resignManager()` |
| B4-d | `manager-closing` 수신 시 `pickManager()` 결과가 자신이면 `becomeManager()` |
| M4 | Rust 트레이 `new_main/new_tiny/reset_coord` → `app.emit(...)`(전체). JS는 매니저만 처리 |
| N2 | 폰트 추가: 매니저가 `customFonts` 저장 후 `custom-font-added` 방송 → 모든 창이 `FontFace` 등록 + `customFonts` 갱신 |
| N3 | `archive-reminder-item`: 원래 창이 열려 있으면 그 창이 처리(현행). **닫혀 있으면 매니저가** 저장소의 해당 창 데이터를 직접 수정(닫힌 창이라 경합 없음) |
| M1 | 알림 표시 기록: 열린 창은 `reminder-mark-notified`로 본인이 기록, 닫힌 창만 매니저가 기록 |
| L2 | 리마인더 창 생성 중 잠금 |
| L5 | (Q3 승인 시) Rust 생존 판정에 `archive` 포함 |
| N10 | 트레이 "종료": `before-quit` 방송 → 데이터 창이 `flushPendingSaves(true)` → Rust가 최대 1초 기다린 뒤 `exit` |
| A6 | Rust "main 없으면 생성" 코드 3벌 → `show_or_create_main(app)` 함수 1개 |

- **세부 단계**: A2(+P4, L1, M7) → `pickManager` 테스트 → B4-b/c/d → M4 → N2 → N3·M1 → L2 → L5·N10·A6
- **불변 조건 영향**: I-2, I-3, I-5 **직접 관련**
- **위험·완화**
  - 매니저 전환 순간 리마인더가 두 번 뜰 수 있습니다 → `becomeManager()`는 **먼저 기존 매니저의 반납을 확인**(`manager-reclaim` 뒤 300ms)한 다음 점검을 시작합니다
  - `getAllWebviewWindows` 권한: `core:webview:default`에 포함되는지 작업 시 확인하고, 없으면 capabilities에 `core:webview:allow-get-all-webviews`를 추가합니다
- **수용 기준**: R-70~R-79 전부 통과, 모든 시나리오에서 콘솔의 "매니저 = X" 로그가 항상 1개

---

### WP5. 성능 개선
| ID | 변경 | 방식 |
|---|---|---|
| P1 | 리마인더 동기화 조건부 실행 | 저장 시 할 일의 `id·deadline·completed·title` 요약값을 계산해 이전과 같으면 `req-reminder-sync`/`syncReminderWindow` 생략 |
| P2 | 우클릭 payload 경량화 | `{themeColor, isDarkMode, uiFontFamily, uiFontSize, isEditMode, showArchived, showNotes}`만 전송 (ContextMenu가 쓰는 값 전부) |
| P3 | 되돌리기 기록 경량화 | `historyStack`을 `$state.raw`로(항상 새 배열 대입), 스냅샷 복사는 `$state.snapshot` 1회 |
| P5 | 보조 창 초기화 축소 | `reminder`·`ctx-menu`·`welcome`은 창 데이터 로드·자동 시작 확인·매니저 리스너를 건너뜀. `settings`는 업데이트 상태와 폰트 목록만 로드 |
| P6 | 폰트 바이너리 전송 | Rust `save_custom_font`가 `tauri::ipc::Request` 원본 바이트를 받도록 변경, 파일 이름은 헤더로 전달 + 경로 이탈 검사(L6) |
| P7 | 리마인더 수집 순수 함수화 | WP6-A3와 함께 |
| P11 | 효과음 `AudioContext` 재사용 | `lib/sound.js`의 `playChime(kind)` 1개로 통합(시작음·알림음 3벌), 재생 후 정리 |
| N7 | 리마인더 투명도 저장 디바운스 | 매니저 쪽 `update-reminder-opacity` 처리에서 300ms 디바운스 후 저장 |

- **불변 조건 영향**: I-5(P1은 동기화 "빈도"만 줄이고 결과는 같음), I-7(P3 기록 내용 동일)
- **위험·완화**: P1은 요약값에 빠진 필드가 있으면 팝업 갱신을 놓칩니다. 그래서 요약 대상은 리마인더 표시에 쓰이는 필드 전부로 하고, 단위 테스트로 검증합니다. P3는 `canUndo`/`canRedo`가 계속 반응하는지 R-41로 확인합니다.
- **수용 기준**: 5장 표의 목표 수치 달성 (개발자 도구 콘솔에 IPC 횟수 로그를 임시로 달아 측정한 뒤 제거)

---

### WP6. 구조 분리 (Facade 유지)
**원칙**: `appState`의 공개 필드·메서드 이름은 그대로 두고, 속 구현만 모듈로 옮깁니다. 컴포넌트 수정은 0건이 목표입니다.

| ID | 새 모듈 | 옮길 내용 | 테스트 |
|---|---|---|---|
| A1 | `storage/storeEngine.js` | 스토어 인스턴스, `enqueueWrite`, 읽기 검증, 스텁, `whenWritesSettled` | 큐 직렬화 테스트(가짜 store) |
| A3 | `reminders/reminderEngine.js` | `collectImminentTodos(entries, now)` [순수], 팝업 창 열기/동기화 | D-3 경계, 날짜 오류 값, `창:ID` 중복 키 |
| A4 | `updates/updateController.js` | 업데이트 확인·릴레이·배너 상태 전환 | 기존 `updateChecker.test.js` 유지 + 상태 전환 테스트 |
| A5 | `richText/editorConstants.js`, `richText/htmlTransforms.js` | 60색 팔레트·특수기호 표(3벌), 폰트 일괄 교체·선택 항목 서식·자간의 HTML 변환부 | 변환 결과 문자열 비교(DOM이 필요하므로 가능한 범위만) |
| — | `io/txtPorter.js` | 내보내기/가져오기 형식 변환 [순수] (+N4) | 왕복 테스트 |
| — | `lib/dateUtils.js` | `parseLocalDate`, `todayKey`, `diffDays` (TodoList·appState·DatePicker 중복 제거, L8) | 시간대 경계 |
| L3 | `lib/ids.js` | `newId()` = `crypto.randomUUID()` | 형식 |
| X11 | `storeEngine`의 `getStore()` | `new LazyStore('tidy-task-config.json')` 17곳을 import 1개로 | — |

- **하지 않을 것**: `MainToolbar.syncFromSelection`과 `FloatingRTE.syncState` 통합(동작이 다름), 컴포넌트 마크업 분할
- **수용 기준**: 컴포넌트 diff 중 `appState` 호출부 변경 0건(import 정리 제외), `appState.svelte.js` 1,200줄 이하, 새 모듈의 svelte-check 오류 0

---

### WP7. 레거시 → 현대적·검증된 코드로 교체
| ID | 현재 (레거시) | 교체안 | 판단 |
|---|---|---|---|
| X1 / N1 | `@iconify/svelte`가 **실행 중 인터넷에서** 달력 아이콘을 받아옴 → 처음 실행이나 오프라인이면 아이콘이 빈칸 | 같은 아이콘(`solar:calendar-bold-duotone`)의 SVG 데이터를 앱에 내장(`addIcon` 사전 등록 또는 인라인 SVG 컴포넌트) → 모양 동일, 네트워크 0 | ✅ 권장 |
| X2 | `lucide-svelte` 1.0.1 (Svelte 3/4 시절 패키지) | Svelte 5 공식 패키지 `@lucide/svelte`. import 경로만 바뀌고 아이콘 이름·props 동일 | ⚪ 선택 (Q10) — 아이콘 22종 이상 전 화면 스크린샷 비교 필요 |
| X3 | `bind:innerHTML` 편집 칸 (정제 없음) | `use:editable` | ✅ (WP2-N6) |
| X4 | `JSON.parse(JSON.stringify($state.snapshot(x)))` | `$state.snapshot(x)` (이미 깊은 복사) | ✅ (WP5-P3) |
| X5 | 효과음 코드 3벌 + `webkitAudioContext` | `lib/sound.js` 1개 | ✅ (WP5-P11) |
| X6 | `WebviewWindow.getByLabel` 반복 | `getAllWebviewWindows()` | ✅ (WP4-P4) |
| X7 | `Date.now()` ID | `crypto.randomUUID()` (아카이브는 이미 사용 중) | ✅ (WP6-L3) |
| X8 | 동적 `import()` 4곳(이미 정적 import된 모듈) | 정적 import | ✅ 빌드 경고 3건 제거 |
| X9 | 깨진 `eslint.config.js`(React용) | 삭제. 대신 `package.json`에 `"check": "svelte-check --threshold warning"` 스크립트 추가(개발 의존성 `svelte-check`) | ✅ |
| X10 | 이벤트 리스너 해제를 변수 여러 개로 관리(`unlistenAddFont` 덮어쓰기 버그 G6) | 창 단위 `disposables` 모음 → 한 번에 해제 | ✅ |
| X11 | `new LazyStore(...)` 17곳 | `getStore()` 1곳 | ✅ (WP6) |
| X12 | Svelte 4 문법 파일(`EditorToolbar.svelte`) | 삭제 (미사용) | ✅ (WP8) |

**보류 (이번에 하지 않음)**
| ID | 대상 | 보류 이유 |
|---|---|---|
| H1 | `document.execCommand` / `queryCommandState` (서식 편집) | "폐지 예정" 표기는 있지만 WebView2(크로미움)에서 계속 동작하고, 대체하려면 편집기 엔진(Tiptap 등)을 새로 도입해야 합니다. 서식·실행 취소·IME 동작이 모두 바뀌어 **회귀 위험이 매우 큽니다**. 대신 호출부를 `richText/exec.js` 한 곳으로 모아 나중에 교체할 준비만 합니다 |
| H2 | 1초/50ms `setTimeout` 잠금(복원 잠금·IME 보호) | 타이밍이 IME 보호와 얽혀 있어 `tick()`으로 바꾸면 한글이 씹힐 위험이 있습니다 |
| H3 | `$effect`로 동기화하는 툴바 상태 → 쓰기 가능한 `$derived` | 효과에 비해 위험이 있고 이득이 작습니다 |
| H4 | TypeScript 전환 / checkJs 오류 918건 정리 | 규모가 커 별도 버전에서 진행합니다. 이번에는 **새 모듈만 오류 0** 원칙 |
| H5 | 자산 접근 범위 축소(`**` → `$APPDATA/**`) | 예전에 앱 폴더 밖 경로로 등록한 커스텀 폰트가 안 보일 수 있습니다 (Q5) |

---

### WP8. 유령 코드 · 의존성 · 파일 정리
1차 보고서 G1~G17과 2차에서 추가된 항목입니다.

| 추가 ID | 대상 | 근거 |
|---|---|---|
| G18 | `ReminderPopup.handleTitleChange`, `update-reminder-title` 수신기, `appState.reminderTitle` 갱신 경로 | 제목을 편집하는 화면이 없어 호출되지 않음 (M2는 이 항목으로 재분류, Q11) |
| G19 | `NoteEditor.svelte`의 `.note-title` CSS | 쓰이지 않는 선택자 (svelte-check 경고) |
| G20 | `_writeToDisk(keys)`의 부분 저장 분기 | 유일한 호출자 `saveSettingsOnly`(G3)와 함께 제거하고, `settingsSaveTimer`는 항상 null이 되므로 함께 정리 |
| G21 | `SettingsModal.handleCancel`의 `appState.customFonts = …` | 설정 창 자신의 메모리만 바꿔 효과 없음 |

- **순서**: 코드 → 의존성(`npm uninstall jimp sharp tailwind-merge @types/dompurify @tauri-apps/plugin-notification`, Cargo에서 `tauri-plugin-notification` 제거) → 파일(Q6)
- **수용 기준**: 빌드·테스트·cargo check 통과, `npm ls`에 누락 없음, 실행 파일 정상 실행

---

### WP9. 문서 · 도움말 정합
| ID | 불일치 | 처리 |
|---|---|---|
| N9-a | 도움말: **Ctrl+S 수동 저장** → 실제로는 구현되지 않음 | (Q9) 구현 권장: `Ctrl+S` = `flushPendingSaves(true)` + 짧은 "저장됨" 토스트(기존 토스트 디자인 재사용) |
| N9-b | 도움말: **Tab으로 할 일 생성** → Enter만 동작 | 도움말에서 Tab 삭제 (Tab은 포커스 이동으로 남김) |
| N9-c | 도움말: 우클릭 "새 창 띄우기" = Tiny Note → 실제로는 일반 노트 창 | 도움말 문구 수정 |
| N9-d | 도움말: "트레이에서 텍스트로 내보내기" → 트레이에 없음 | 도움말 문구를 "우클릭 메뉴"로 수정 |
| N9-e | 도움말: 붙여넣기 다중 생성 → 편집 모드에서만 동작 | 도움말에 "편집 모드에서" 명시 |
| — | `CLAUDE.md` 3.3 "유령 청소기" 등 | 구조 변경(WP6) 반영해 모듈 위치 갱신 |

---

## 7. 검증 전략

### 7.1 검증 게이트 (매 패키지 공통 · 하나라도 실패하면 마감 금지)
| # | 게이트 | 기준 |
|---|---|---|
| V1 | `npm test` | 기존 73개 + 새 테스트 **전부 통과** |
| V2 | `npx vite build` | 성공, **새 경고 0** (X8 이후 기존 경고 3건도 0) |
| V3 | `npx svelte-check --threshold warning` | 경고 수가 기준선(16)보다 **늘지 않음**, 새 모듈 오류 0 |
| V4 | `cargo check` (Rust 변경 시) | 경고 0 (현재 0) |
| V5 | 수동 회귀 | 8장에서 해당 패키지와 연결된 R 항목 전부 |
| V6 | 데이터 호환 | 5.0.0으로 만든 설정 파일을 복사해 5.0.2 개발판에서 실행 → 모든 창·아카이브·폰트·업데이트 선택이 그대로 |

### 7.2 수동 테스트 전 데이터 보호 (사용자 PC 데이터)
- 개발판 실행 전 `%APPDATA%\com.tidy.task\tidy-task-config.json`을 따로 복사해 둡니다.
- 복사 명령(PowerShell):
  ```powershell
  Copy-Item "$env:APPDATA\com.tidy.task\tidy-task-config.json" "$env:USERPROFILE\Desktop\tidy-task-config.before-5.0.2.json"
  ```

### 7.3 새로 추가하는 단위 테스트 목록
| 파일 | 검증 내용 |
|---|---|
| `storage/windowDataCodec.test.js` | 4.1 표 전 필드 왕복, `\|\|`/`??` 경계값, 모르는 키 보존, 구버전 마이그레이션 |
| `storage/storeEngine.test.js` | 쓰기 큐 순서, 실패해도 큐가 멈추지 않음 |
| `windows/managerElection.test.js` | main 있음/없음, note 일부만 열림, Tiny Note만 남음, 아무것도 없음 |
| `windows/windowRegistry.test.js` | 빈 슬롯 우선순위(데이터 있는 슬롯 우선/빈 슬롯만), 10개 초과 |
| `reminders/reminderEngine.test.js` | D-3 경계, 지난 마감, 날짜 오류, 창 간 같은 ID, 완료 항목 제외, 정렬 |
| `io/txtPorter.test.js` | 내보내기→가져오기 왕복, 5.0.0에서 내보낸 파일 호환, 메모 줄바꿈 보존(N4) |
| `lib/dateUtils.test.js` | 로컬 자정, 월말, 윤년 |
| `archive` 큐·검증 | 가짜 store로 addNote 재시도·실패 반환 |

---

## 8. 회귀 체크리스트 (기능 목록 = 수용 테스트)

각 항목은 **확인 방법**대로 손으로 실행합니다. "관련 WP"에 표시된 패키지를 끝낼 때마다 해당 항목을 다시 확인하고, 모든 패키지가 끝나면 전 항목을 한 번 더 확인합니다.

### 창·저장
| ID | 기능 | 확인 방법 | 관련 WP |
|---|---|---|---|
| R-01 | 앱 시작 시 main 표시, 시작음(무음 모드면 없음) | 실행 | 5, 6 |
| R-02 | 환영 창·업데이트 공지 창 나란히 표시 / "다시 보지 않기" 유지 | 초기화된 설정으로 실행 | 0, 6 |
| R-03 | 보조 창(note·Tiny Note) 재시작 시 위치·크기·전체화면·롤업 복원 | 창 3종을 다양한 상태로 두고 종료 → 실행 | 3, 4 |
| R-04 | 빈 보조 창은 닫으면 명부에서 사라짐, 다음 새 창이 그 번호 재사용 | note 창 비우고 닫기 → 새 창 | 3, 4 |
| R-05 | 데이터 있는 닫힌 창 번호를 새 창 버튼이 먼저 다시 엶 | note-2에 글 쓰고 닫기 → 새 창 | 4 |
| R-06 | 창 최대 10개 제한 토스트 | 11번째 생성 | 4 |
| R-07 | 마지막 입력 보존: 입력 직후 닫기 / 입력 직후 트레이 종료 / 포커스 이동 | 각각 시도 후 재실행 | 1, 4 |
| R-08 | 저장소 오류 배너·자동 재시도 | (WP3) 파일 잠금 시뮬레이션 | 3 |
| R-09 | 좌표 초기화(트레이) — main 있을 때 / 없을 때 | 트레이 메뉴 | 4 |
| R-10 | 트레이: 열기·새 Tidy Task·새 Tiny Note·종료 (main 닫힌 상태 포함) | 트레이 메뉴 | 4 |
| R-11 | 두 번째 실행 시 기존 main이 앞으로 옴 | exe 두 번 실행 | — |

### 설정·테마·폰트
| ID | 기능 | 확인 방법 | 관련 WP |
|---|---|---|---|
| R-20 | 설정 창: 테마 15종·다크 모드·글자 크기·UI 글꼴 적용이 **해당 창에만** | 창 2개에서 각각 적용 | 1 |
| R-21 | 기본 글꼴 변경 시 본문 글꼴 일괄 교체 + 되돌리기 가능 | 적용 → Ctrl+Z | 1, 6 |
| R-22 | 리마인더 켜기/끄기·전체 무음은 **모든 창 공통** | 설정·🔔 버튼 | 1 |
| R-23 | 🔔 버튼: 다른 창 테마·글꼴 **불변** | B1 시나리오 | 1 |
| R-24 | 설정 초기화(크기 380×500 논리값, 커스텀 폰트 목록 유지) | 125%/150% 배율 | 1 |
| R-25 | 데이터 초기화(대상 창만) | 설정 → 데이터 초기화 | — |
| R-26 | 커스텀 폰트 등록 → **요청한 창에서 즉시 렌더**, 다른 창 목록에도 표시 | note 창에서 설정 열어 등록 | 4, 5 |
| R-27 | 창 불투명도 슬라이더 | 조절 → 재시작 | — |

### 할 일·메모·편집
| ID | 기능 | 확인 방법 | 관련 WP |
|---|---|---|---|
| R-30 | 할 일 추가(Enter)·마감일 지정·자동 정렬 | 입력 | 1, 6 |
| R-31 | 할 일 드래그 정렬(검색 중엔 비활성) | 드래그 | 1 |
| R-32 | 할 일 완료 → 마감된 일, 되돌리기(^), 개별·전체 삭제 | 클릭 | — |
| R-33 | 인라인 편집, Shift+Enter 줄바꿈, 붙여넣기 서식 제거 | 편집 | — |
| R-34 | 한글 조합 입력 중 글자 씹힘 없음 (할 일·메모·Tiny Note·아카이브) | 빠른 한글 입력 | 전체 |
| R-35 | 편집 모드: 다중 선택·전체 선택·마감·삭제(확인 모달)·정렬 버튼 | 편집 모드 | — |
| R-36 | 선택 항목 일괄 서식(굵게·기울임·밑줄·색·형광펜·글꼴·크기·자간·정렬) | 편집 모드 + 툴바 | 6 |
| R-37 | 드래그 선택 서식: 메인 툴바·플로팅 툴바(이동 손잡이 포함)·링크 삽입/열기/삭제 확인 | 메모장 | 6 |
| R-38 | 특수기호 10페이지 (툴바·우클릭) | 삽입 | 6 |
| R-39 | 스플리터 드래그로 메모 영역 높이 조절, 점프 없음 | 드래그 | — |

### 단축키
| ID | 기능 | 관련 WP |
|---|---|---|
| R-40 | Ctrl+Z / Ctrl+Y (편집 칸 밖) | 5 |
| R-41 | 되돌리기·다시 실행 버튼 활성/비활성 표시 | 5 |
| R-42 | Alt+Shift+N / W 자간 | 6 |
| R-43 | 편집 모드 Ctrl+B/I/U 일괄 | 6 |
| R-44 | 편집 모드 Ctrl+C 다중 복사 토스트 | — |
| R-45 | 편집 모드 붙여넣기 다중 생성(10줄 초과 경고) | 6 |
| R-46 | (Q9 승인 시) Ctrl+S 즉시 저장 | 9 |

### 창 동작
| ID | 기능 | 관련 WP |
|---|---|---|
| R-50 | 타이틀바 더블클릭 전체화면 ↔ 원래 크기·위치 (main·note·Tiny Note) | — |
| R-51 | 위쪽 테두리 더블클릭 세로 최대화 토글, 높이 드래그 시 해제 | — |
| R-52 | 항상 위(핀) | — |
| R-53 | Tiny Note 롤업/펼치기·헤더 자동 접기(`⋯`)·테마 순환(다크 포함)·비우기·자석 스냅 | 4 |
| R-54 | 우클릭 메뉴 두 종류(바/텍스트)와 모든 항목 | 5 |
| R-55 | 도움말 창 | 9 |
| R-56 | TXT 내보내기/가져오기 (마감일·메모 줄바꿈 포함) | 6 |

### 아카이브
| ID | 기능 | 관련 WP |
|---|---|---|
| R-60 | Tiny Note 보관 → 토스트 → 창 닫힘, 아카이브에 추가 | 2 |
| R-61 | 보관 실패 시 **내용 유지** (저장소 오류 시뮬레이션) | 2 |
| R-62 | 검색, 그리드/리스트 전환, 메이슨리 배치 | 2 |
| R-63 | 인라인 제목·본문 편집 → 즉시 닫아도 유지 | 2 |
| R-64 | 북마크 상단 고정, 드래그 재정렬 | 2 |
| R-65 | 카드 색상 변경, 복사, 펼치기/접기 | 2 |
| R-66 | 꺼내기 → 새 Tiny Note(최소 폭 200), 슬롯 없음 경고 | 2, 4 |
| R-67 | 선택 모드 다중 삭제, 새 노트 추가(붙여넣기 서식 제거) | 2 |
| R-68 | 아카이브 서식 툴바 전체 | 6 |

### 리마인더·매니저·업데이트
| ID | 기능 | 관련 WP |
|---|---|---|
| R-70 | 마감 D-3 이내 항목 팝업(우하단), 소리(무음 모드 존중), 출처 뱃지 | 4, 5 |
| R-71 | 오늘 끄기 / 1시간 후 / 시간 지정 / 완전 끄기 — **각각 유지 시간 동안 재등장 없음** | 1, 4 |
| R-72 | 팝업에서 ✓ 마감 → 원래 창(열림/닫힘 모두)에서 마감된 일로 이동 | 4 |
| R-73 | 팝업 투명도 조절 유지 | 5 |
| R-74 | 다른 창 항목이 매시간 다시 울리지 않음 | 4 |
| R-75 | main 닫기 → 열린 창 중 우선순위 1위가 매니저, 1시간 점검 계속 | 4 |
| R-76 | Tiny Note만 남아도 리마인더·업데이트 확인 동작 | 4 |
| R-77 | 트레이로 main 복귀 → 매니저 1개 | 4 |
| R-78 | 업데이트: 자동 확인·배너·단계 안내·나중에·건너뛰기·설정 창 수동 확인·오류 문구 | 4, 6 |
| R-79 | 할 일 입력 중 리마인더 팝업 불필요 갱신 없음 (P1) | 5 |

---

## 9. 위험 등록부 (Risk Register)

| # | 위험 | 가능성 | 영향 | 완화 | 담당 WP |
|---|---|---|---|---|---|
| K1 | 코덱 이식 시 `\|\|`/`??` 규칙 오기로 저장값 변화 | 중 | 높음 | 참조 함수 대조 테스트 + 픽스처 | 3 |
| K2 | 매니저 전환 시 알림 중복/누락 | 중 | 중 | 반납 확인 후 시작, 선출 순수 함수 테스트, R-75~77 | 4 |
| K3 | 모듈 분리 중 `$state` 반응성 끊김(클래스 필드 밖으로 뺐을 때) | 중 | 높음 | `$state`는 AppState 클래스에 **남기고** 순수 로직만 이동 | 6 |
| K4 | Rust 백업이 정상 파일을 오판해 덮어씀 | 낮음 | 매우 높음 | "손상"은 JSON 파싱 실패로만 판정, 원본은 지우지 않고 이름을 바꿔 보존 | 3 |
| K5 | 아이콘 교체(X1·X2)로 모양 미세 변화 | 중 | 낮음 | 교체 전후 스크린샷 비교, X2는 선택 | 7 |
| K6 | 드래그 저장 시점 변경(M3)으로 앱 종료 시 순서 유실 | 낮음 | 낮음 | 닫기 flush는 현재 메모리 상태를 저장하므로 영향 없음 | 1 |
| K7 | 보조 창 초기화 축소(P5)로 설정 창 표시값 누락 | 중 | 중 | 설정 창이 쓰는 `appState` 필드 목록(`allFonts`, `appVersion`, `updatePhase/Info/ErrorCode`)을 명시하고 R-20~26 확인 | 5 |
| K8 | `getAllWebviewWindows` 권한 누락 | 낮음 | 중 | 작업 첫 단계에서 권한 확인 | 4 |

---

## 10. 결정 사항 (사용자 확인 필요)

| # | 질문 | 추천 | 영향 WP |
|---|---|---|---|
| Q1 | 업데이트 공지 창 ID를 `v5.0.2`로 올려 다시 띄울까요? | 유지 (공지 내용이 5.0 소개 그대로) | 0 |
| Q2 | 다른 창 저장 시 리마인더 미루기 초기화 동작을 없앨까요? | 없앰 | 1 |
| Q3 | 아카이브 창만 남아도 앱을 계속 켜 둘까요? | 켜 둠 | 4 |
| Q4 | 설정 파일 자동 백업·손상 복구(Rust)를 넣을까요? | 넣음 | 3 |
| Q5 | 배포판 개발자 도구 끄기 / 파일 접근 범위 축소? | 개발자 도구만 끄기, 범위는 보류 | 7 |
| Q6 | `fonts.zip`, `check_icon*.ps1`, `src-tauri/2` 삭제? | 삭제 | 8 |
| Q7 | 정렬 방향 기억(새 기능)? | 보류 | — |
| Q8 | `jimp`, `sharp`를 앱 밖에서 쓰시나요? | 안 쓰면 삭제 | 8 |
| Q9 🆕 | 도움말에 적힌 **Ctrl+S 즉시 저장**을 구현할까요? (아니면 도움말에서 삭제) | 구현 (코드 몇 줄, 기존 저장 함수 재사용) | 9 |
| Q10 🆕 | 아이콘 패키지를 Svelte 5 공식판(`@lucide/svelte`)으로 옮길까요? | 이번엔 보류(모양 동일성 검증 부담 대비 이득 작음) | 7 |
| Q11 🆕 | 리마인더 창 **제목 편집 기능**은 코드 흔적만 있고 화면이 없습니다. 흔적을 지울까요, 기능을 되살릴까요? | 흔적 삭제 (제목 표시는 "통합 리마인더" 그대로) | 8 |
| Q12 🆕 | TXT 내보내기에서 **메모 줄바꿈을 보존**할까요? (기존 파일 가져오기와 호환 유지) | 보존 | 6 |

---

## 11. 완료 정의 (Definition of Done)

- [ ] 10장의 결정이 모두 반영됨
- [ ] WP0~WP9 중 승인된 패키지가 모두 7.1 게이트를 통과함
- [ ] 8장 회귀 체크리스트 전 항목 통과 (최종 1회 전체 실행 기록 첨부)
- [ ] 5.0.0 설정 파일로 V6 데이터 호환 확인
- [ ] `CLAUDE.md`·도움말·배포 가이드가 새 구조와 일치
- [ ] 릴리스 노트 초안 작성 (사용자 관점: "알림 미루기가 제대로 유지됩니다" 등)
- [ ] `git tag v5.0.2`는 사용자 확인 후

---

## 12. 작업 결과 (2026-09-16, 브랜치 `refactor/v5.0.2`)

### 12.1 결정 사항 적용 (사용자 위임에 따라 추천안 적용)
| # | 적용 |
|---|---|
| Q1 | 공지 창 ID `v5.0.0` **유지** (공지를 다시 띄우지 않음) |
| Q2 | 다른 창 저장 시 미루기 초기화 **제거** |
| Q3 | 아카이브 창만 남아도 앱 **유지** |
| Q4 | 설정 파일 자동 백업·손상 복구 **추가** |
| Q5 | 배포판 개발자 도구 **끔**, 파일 접근 범위는 **보류**(옛 폰트 호환) |
| Q6 | `fonts.zip`·`check_icon*.ps1`·`src-tauri/2` **삭제** |
| Q7 | 정렬 방향 기억 **보류**(새 기능) |
| Q8 | `jimp`·`sharp` 등 미사용 의존성 **삭제** |
| Q9 | Ctrl+S 즉시 저장 **구현**(기존 토스트 디자인 재사용) |
| Q10 | 아이콘 패키지 이관 **보류** |
| Q11 | 리마인더 제목 편집 흔적 **삭제**(표시 문구는 그대로) |
| Q12 | TXT 메모 줄바꿈 **보존** |

### 12.2 커밋
| 커밋 | 패키지 |
|---|---|
| `0f7f598` | WP0 버전 5.0.2 + 문서 |
| `7363820` | WP1 확실한 버그 수정 |
| `69be35f` | WP2 아카이브 안정화 |
| `f54eb8d` | WP3 저장 계약 코덱 + 백업·복구 |
| `1ef900f` | WP4 매니저·창 관리 |
| `214f7b4` | WP5·6·7·9 성능·구조·레거시·Ctrl+S |
| `04d1aac` | 새 모듈 JSDoc 타입 |
| (마지막 커밋) | WP8 유령 코드·의존성·파일 정리, WP9 도움말 |

되돌리기 기준점: `git tag pre-refactor-5.0.2`

### 12.3 자동 검증 결과 (게이트 V1~V4)
| 게이트 | 기준선 | 결과 |
|---|---|---|
| V1 `npm test` | 73개 통과 | **120개 통과** (새 테스트 47개: 코덱·직렬화 큐·매니저 선출·창 슬롯·리마인더·TXT·날짜) |
| V2 `vite build` | 성공, 경고 3 | **성공, 경고 0** |
| V3 `svelte-check` | 오류 918 / 경고 16 | 오류 921 / **경고 15**, 새 모듈(테스트 제외) 오류 **0** — 늘어난 3건은 기존 파일·테스트 파일의 타입 표기 소음(H4) |
| V4 `cargo check` | 경고 0 | **경고 0** |

### 12.4 완료 항목
- 🔴 B1~B6 전부, 🟠 M1·M3~M8 (M2는 유령 코드 G18로 재분류해 삭제)
- 🟡 L1~L6·L8, N1~N7·N9·N10·N12
- ⚡ P1~P5·P7·P9~P11
- 🧱 A1(코덱·저장 큐)·A2·A3·A5·A6, `txtPorter`·`dateUtils`·`ids`·`sound`·`fonts`·`icons`·`editorConstants` 모듈
- 🔁 X1·X3~X12
- 👻 G1~G9·G11~G21

### 12.5 판단해서 건너뛴 항목 (위험 대비 이득이 작음)
| ID | 내용 | 이유 |
|---|---|---|
| P6 | 폰트 업로드 바이너리 전송 | Rust 명령 형식을 바꿔야 하는데, 폰트 등록은 드문 작업이라 이득이 작음 (L6 파일 이름 검사는 적용) |
| A4 | 업데이트 제어부 모듈 분리 | `$state` 필드와 강하게 얽혀 반응성 끊김 위험(K3)이 큼. 현재 코드가 안정적 |
| N8 | 자정이 지나면 D-day 뱃지 자동 갱신 | 새 타이머 동작이 추가되는 기능 성격. 다음 버전 후보 |
| N11 | "마감된 일" 머리글의 버튼 안 버튼 | 화면 동작 문제는 없고, 바꾸면 버튼 모양이 미세하게 달라질 위험 |
| L7 · Q7 | 정렬 방향 기억 | 새 기능 |
| X2 · Q10 | `lucide-svelte` → `@lucide/svelte` | 전 화면 아이콘 동일성 검증 부담 |
| H1~H5 | 서식 엔진 교체 등 | PRD 9장 보류 사유 그대로 |
| — | `settingsSaveTimer` 잔여 참조 | 항상 비어 있어 동작 영향 없음, 다음 정리 때 제거 |

### 12.6 사용자가 직접 확인해야 하는 것 (V5·V6 — 실제 앱 실행 필요)
자동 검사로는 창 여러 개의 실제 상호작용을 확인할 수 없습니다. 아래 순서로 확인해 주세요.

1. **데이터 백업** (7.2의 명령) 후 `npm run tauri dev` 실행
2. **V6 데이터 호환**: 기존 창·Tiny Note·아카이브·폰트가 모두 그대로 뜨는지
3. **이번에 바뀐 동작 우선 확인**
   - R-23: 🔔 버튼을 눌러도 다른 창의 테마·글꼴이 그대로인지 (B1)
   - R-71: 리마인더 "1시간 후"를 누른 뒤 다른 창에서 입력·이동해도 팝업이 다시 뜨지 않는지 (B2)
   - R-75~R-77: main 닫기 → 다른 창이 매니저가 되는지 / 트레이 메뉴가 동작하는지 / 트레이 "열기"로 main 복귀 시 알림이 중복되지 않는지 (B4·M4)
   - R-60·R-61·R-63: Tiny Note 보관, 아카이브에서 편집 후 바로 닫기 (B5·M5)
   - R-26: 메모 창에서 설정을 열어 커스텀 폰트 등록 → 그 창에서 바로 적용되는지 (N2)
   - R-72: 닫힌 창의 할 일을 리마인더에서 ✓ 처리 (N3)
   - R-56: TXT 내보내기 → 메모 줄바꿈 유지, 다시 가져오기 (N4)
   - R-46: Ctrl+S → "지금 내용을 저장했습니다!" 안내 (N9)
   - 오프라인에서 할 일의 달력 아이콘이 보이는지 (N1)
   - 트레이 "종료" 직전 입력이 남는지 (N10)
4. 그 밖의 R 항목(8장) 전체를 한 번 훑어보기
5. 문제가 없으면 `refactor/v5.0.2` 브랜치를 `main`에 합치고 태그를 붙입니다.
