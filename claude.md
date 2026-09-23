# Tidy Task - Project Context & Architecture (claude.md)

## 1. 프로젝트 배경 및 개요 (Background)
**Tidy Task**는 사용자의 생산성을 높이기 위한 로컬 기반 멀티 윈도우 메모 및 할 일 관리 데스크톱 애플리케이션입니다. 
가벼우면서도 강력한 기능을 제공하며, 사용자의 모니터 공간을 효율적으로 활용할 수 있도록 다중 창(Multi-Window) 시스템을 채택하고 있습니다. 오프라인 로컬 환경에서 데이터를 안전하게 보존하며, 직관적인 UI/UX를 제공하는 것이 핵심입니다.

## 2. 기술 스택 (Tech Stack)
- **Frontend Core:** Svelte 5 (Runes `$state`, `$effect` 적극 활용)
- **Styling:** Tailwind CSS v4, Vanilla CSS (커스텀 폰트, 테마 변수 활용)
- **Backend / Desktop Framework:** Tauri v2 (Rust)
- **Build Tool:** Vite
- **Storage / Persistence:** `@tauri-apps/plugin-store` (`tidy-task-config.json` 로컬 파일 기반 저장소)

## 3. 핵심 아키텍처 및 기능 (Core Features & Architecture)

### 3.1. 멀티 윈도우 시스템 및 매니저 권한 (Manager System)
- 단일 앱 내에서 여러 독립적인 창(`main`, `note-1`, `tinynote-1`, `settings`, `reminder` 등)을 생성 및 관리합니다.
- **Manager Authority:** 다수의 창 중에서 단 하나의 창만이 리마인더 점검·업데이트 확인·커스텀 폰트 등록을 중앙 제어(`isManager = true`)합니다.
  - 선출 규칙(`src/lib/windows/managerElection.js`): **지금 열려 있는** 데이터 창 중 `main` → `note-1..10` → `tinynote-1..10` 순서로 1위가 매니저입니다.
  - 권한은 `appState.becomeManager()` / `resignManager()` 두 함수로만 맡고 내려놓습니다(리스너·1시간 주기 점검·업데이트 일정이 함께 켜지고 꺼짐).
  - 승계는 **매번 다시 계산**합니다(`appState._reconcileManager`). 창이 뜨거나 닫힐 때마다 `window-roster-changed`가 방송되고(JS 닫기 처리기 + Rust `Destroyed`), 모든 데이터 창이 같은 규칙으로 "내가 1위인가"를 계산해 스스로 맡거나 내려놓습니다. 5분 주기 점검이 마지막 안전망입니다. 신호 하나에만 기대면 그것을 놓친 순간 매니저가 영영 비었습니다.
- **트레이 메뉴(`src-tauri/src/tray.rs`)는 매니저에 기대지 않습니다.** "새 Tidy Task / 새 Tiny Note"는 Rust가 열려 있는 데이터 창 하나를 지명(`tray-request` payload의 `target`)해 보내고, `ACK_TIMEOUT` 안에 `tray_request_done` 응답이 없으면 다음 창으로 넘깁니다. 받을 창이 없으면 `main`을 띄우고 `tray_take_pending_request`로 이어받습니다. "좌표 초기화"는 Rust가 직접 모든 창(임시 메뉴 제외)을 주 모니터 작업영역에 계단식으로 모읍니다 — 새 위치 저장은 각 창의 "창 이동" 처리기가 합니다.
- **보조 창**(`settings`, `ctx-menu`, `date-picker`, `reminder`, `welcome`, `update-notice`, `help`, `archive`)은 저장소에 자기 데이터를 쓰지 않습니다. 판별은 `src/lib/windows/windowLabels.js`의 `isDataWindowLabel()` 하나를 씁니다.
  - `ctx-menu`·`date-picker`처럼 **숨어 상주하는 팝업 창**은 `src-tauri/src/tray.rs`의 `TRANSIENT_LABELS`에도 넣습니다. 빠뜨리면 트레이 "좌표 초기화"가 이 창들에 `show()`를 불러 빈 투명 창이 떠서 클릭을 가로챕니다.
- 창 간 통신은 Tauri의 IPC API(`emit`, `listen`)를 통해 이벤트 기반으로 이루어집니다 (예: 테마 변경 동기화, 데이터 동기화).

### 3.2. 상태 관리와 영속성 (State Management & Persistence)
- `src/lib/appState.svelte.js`가 애플리케이션의 "두뇌" 역할을 합니다.
- **하이브리드 저장 엔진:** 모든 상태는 메모리 상의 Runes로 관리되는 동시에, 디바운스(Debounce) 처리를 통해 디스크의 JSON 스토어(`LazyStore`)로 지속적으로 자동 동기화됩니다.
- 멀티 윈도우 간 상태 충돌을 방지하고 각 창 고유의 데이터(위치, 크기, 개별 메모 내용)를 무결하게 보존합니다.
- **저장소 사실 (tauri-plugin-store 2.x):** 같은 파일을 여는 모든 창은 Rust 쪽 메모리 하나를 공유하므로 `get()`이 항상 최신입니다. `reload()`는 디스크 값으로 메모리를 덮어써 다른 창의 미저장 변경을 되돌리므로 **쓰지 않습니다**(유일한 예외: 읽기 실패 감지 시 `_ensureStoreLoaded`).
- **데이터 안전장치:** Rust `setup`에서 시작 시 `tidy-task-config.json`을 백업(`.backup.json`, `.backup-prev.json`)하고, 손상 시 백업에서 복구합니다. `store_health` 명령으로 "파일엔 데이터가 있는데 저장소가 비어 있음"을 감지하면 저장을 잠급니다.

### 3.2.1. 모듈 지도 (v5.0.5)
| 위치 | 역할 |
|---|---|
| `src/lib/appState.svelte.js` | 상태(`$state`)와 공개 메서드를 가진 창구(facade). 컴포넌트는 여기만 부릅니다 |
| `src/lib/storage/windowDataCodec.js` | **창 데이터 필드 표(`WINDOW_FIELDS`)** — 복원·저장·되돌리기 스냅샷 규칙의 단일 원천, 빈 창 판정 |
| `src/lib/storage/serialQueue.js` | 저장 작업 직렬화 큐 (appState·archiveStore 공용) |
| `src/lib/windows/` | 창 라벨 규칙, 매니저 선출, 빈 슬롯·창 옵션(`windowSlots`), Tauri 창 도우미(`windowRegistry`) |
| `src/lib/reminders/reminderEngine.js` | 마감 임박 항목 수집 (점검·팝업 동기화 공용) |
| `src/lib/io/txtPorter.js` | TXT 내보내기/가져오기 형식 |
| `src/lib/dateUtils.js`, `ids.js`, `sound.js`, `fonts.js`, `icons.js`, `editorConstants.js`, `text.js` | 날짜 계산, 새 ID, 효과음, 커스텀 폰트 등록, 내장 아이콘, 툴바 공용 표, HTML→텍스트 |

| `src/lib/windows/windowPlacement.js` | 창 위치 복원 규칙 — 저장 좌표 해석, 제목줄이 화면 안에 보이는지 판정, 화면 밖 보정 |
| `src/lib/windows/popupPlacement.js` | **버튼 옆 팝업 창 배치 규칙** — 아래 우선 → 위 → 옆 → 겹침, 작업영역 안으로 보정, 목표 모니터 배율로 크기 환산 |
| `src/lib/windows/windowDrag.js` | 창 머리를 잡고 끌어 옮기는 공용 액션 (몇 px 움직인 뒤 `startDragging`, 끌기 뒤 click 무시) |
| `src/lib/datePicker/` | 마감일 달력 — 날짜 계산(`calendarModel`), 창 사이 약속·검증(`protocol`), 테마 색(`palette`), 요청 창 쪽 창구(`datePickerClient.svelte.js`) |
| `src-tauri/src/app_update.rs` | 앱 안 자동 업데이트 — latest.json·서명 확인, 모든 창 저장 확인(응답), 업데이트 직전 사본, 설치 프로그램 실행 |
| `scripts/release-build.mjs`, `release-verify.mjs` | `npm run release`(점검·빌드·서명 확인·올릴 파일 준비), `npm run release:verify`(게시 후 앱과 같은 순서로 확인) |

순수 로직 모듈은 모두 `node --test` 단위 테스트가 있습니다(`npm test`). 타입·접근성 검사는 `npm run check`.

### 3.2.2. 창 위치 규칙 (다중 모니터·배율)
- 사용자는 **배율이 다른 모니터(4K 200% + FHD 100%)**를 함께 씁니다. 논리 좌표는 모니터마다 기준이 달라 창 위치를 논리 좌표로만 저장·복원하면 창이 화면 밖에 놓입니다.
- 창 위치를 저장할 때는 반드시 `appState.rememberWindowPosition(물리좌표, scaleFactor)`를 씁니다(물리 `windowPhysX/Y` + 논리 `windowPosX/Y` 동시 기록). `windowPosX/Y`에 직접 대입하지 않습니다.
- 복원은 `resolveSavedPosition()` → `PhysicalPosition`으로 옮기고, 크기 적용 뒤 `ensureWindowOnScreen()`으로 화면 안을 보장합니다.
- 최소화 상태의 좌표(-32000)·크기(0)는 저장하지 않습니다.
- Rust `ensure_window_on_screen`(트레이 "열기"·시작 8초 뒤)과 JS 판정 규칙(제목줄 80×24 논리px)은 같은 값을 유지해야 합니다.

### 3.2.3. 앱 안 업데이트 (docs/업데이트-배포-가이드.md)
- 새 버전 발견은 GitHub API(`updateChecker.js`), 설치는 Rust(`app_update.rs`)가 맡습니다. 설치 단계에서 앱은 **즉시 종료**(`std::process::exit`)되어 닫기 처리기·`before-quit`이 실행되지 않습니다.
- 그래서 설치 전에 데이터 창마다 `update-prepare` → 입력 잠금 → `flushPendingSaves(true)` → 쓰기 정지(`writesFrozen`) → `update_prepare_ack` 응답을 받아야만 진행합니다. 알림장·명단은 `noticeboard_quit`의 저장 후 잠금 절차(목적 `Update`)를 씁니다. 새 저장 경로(타이머 지연 저장 등)를 만들면 이 흐름에서도 기록되는지 확인하세요.
- 업데이트 서명 개인 키는 저장소 밖 `~/.tauri/tidy-task-updater.key`에 있습니다. 새로 만들면 설치된 앱이 모두 업데이트를 거부하므로 절대 다시 만들지 않습니다. 배포 빌드는 `npm run release`만 씁니다.

### 3.3. 타임머신 (Undo/Redo) 및 유령 청소기
- 사용자의 모든 액션을 스냅샷 형태로 기록하여 롤백할 수 있는 히스토리 스택(최대 20개)을 지원합니다.
- 데이터가 비어 있는 창이 닫힐 때는 레지스트리에서 해당 창을 완벽하게 삭제하는 "유령 청소기" 로직이 내장되어 불필요한 리소스 낭비를 막습니다.

## 4. 디자인 시스템 및 UI/UX (Design & UI/UX)
- **Themes & Fonts:** 15가지 내장 컬러 테마(`src/lib/themes.js`의 공통 레지스트리)와 라이트/다크 모드를 지원합니다. 사용자가 직접 폰트 파일(`.ttf` 등)을 드래그 앤 드롭하여 추가할 수 있는 시스템 폰트 커스터마이징을 지원합니다.
- **Layout:** 할 일(Todos)과 노트(Notes), 보관함(Archived) 영역의 크기를 사용자가 드래그(Splitter)로 조절할 수 있습니다. 레이아웃 조절 시 화면이 튀는 현상(Jumping bug)을 방지하는 정밀한 로직이 적용되어 있습니다.
- **Responsiveness & Smoothness:** 창의 크기와 뷰포트 변화에 따라 즉각적으로 레이아웃이 반응하며, 유리 질감(Glassmorphism) 및 트랜지션 효과를 통해 세련된 사용자 경험을 목표로 합니다.

## 5. 작업 시 준수해야 할 엄격한 규칙 (Strict Rules & Guidelines)
프로젝트 코드를 수정하거나 새로운 기능을 개발할 때, 어시스턴트(AI)와 개발자가 반드시 지켜야 할 원칙입니다.

1. **Core Feature Analysis (핵심 기능 보존):** 코드를 수정하기 전, 원본 코드의 핵심 기능(특히 IPC 통신, 매니저 권한 승계 로직, 윈도우 Resize 락/언락)을 철저히 분석하여 기존 기능이 누락되지 않도록 해야 합니다.
2. **State Persistence (상태 영속성 보장):** 창별로 저장할 새 상태값은 `appState.svelte.js`에 `$state` 필드를 선언한 뒤, **`src/lib/storage/windowDataCodec.js`의 `WINDOW_FIELDS` 표에 한 줄을 추가**합니다(되돌리기 대상이면 `snapshot: true` + `SNAPSHOT_FIELDS`). `init`·`performSave`·`takeSnapshot`·`applySnapshot`은 이 표를 자동으로 따릅니다. 기본값 규칙(`||` vs `??`)을 지키고, `windowDataCodec.test.js`에 경계값 테스트를 추가하세요. 초기화 로직(`resetContent` 등)도 함께 점검합니다.
3. **Execution Hierarchy:** 이 규칙은 모든 UI/비즈니스 로직 작업 시 최우선적으로 지켜져야 하며, 예기치 못한 데이터 유실 리스크(예: 초기화 버그, 잘못된 윈도우 라벨 기반 스토어 덮어쓰기)가 있을 경우 반드시 작업을 중단하고 사용자에게 대안을 제안해야 합니다.
4. **가독성 및 주석 (Readability):** 변수명은 직관적으로 작성하고, 주석은 항상 '한국어'로 '왜(Why)' 이렇게 코드를 짰는지 의도를 명확하게 남깁니다.


### 마감일 달력 (날짜 선택 창, `date-picker`)
- 할 일 뱃지와 새 할 일 입력줄의 달력은 **메모 창 안이 아니라 별도 창**으로 뜹니다. 왜: 메모 창 최소 높이는 210px인데 달력은 약 240~270px이라, 창 안에서는 어디에 놓아도 잘렸습니다.
- `main.js`가 `date-picker` 라벨을 **가장 먼저** `DatePickerWindow`로 분기합니다. 이 경로에서 App·appState를 실행하지 않습니다(이 라벨로 저장소 키가 생기면 안 됨).
- 흐름: 메모 창(`datePickerClient.svelte.js`) ──open(요청 번호·버튼 화면 좌표·값·모양)──▶ 달력 창 ──closed(이유·고른 날짜)──▶ 메모 창 → `appState.setTodoDeadline(id, 날짜)`. 저장은 기존 경로 그대로이고 달력 창은 저장소를 건드리지 않습니다.
- 위치는 `popupPlacement.placePopup()` 한 곳에서 정합니다(아래 우선 → 위 → 옆 → 겹침). 크기는 **버튼이 있는 모니터의 배율**로 환산하고, 배율이 다른 모니터로 옮길 때는 크기·위치를 두 번 적용한 뒤 보여 주고 한 번 더 확인합니다(`toolkit.rs`와 같은 방식).
- 지켜야 할 것: ① 결과는 요청 번호가 맞을 때만 적용(늦게 온 옛 결과가 다른 할 일에 들어가지 않게) ② 날짜를 고르거나 Esc로 닫으면 **숨기기 전에** 요청 창으로 초점을 돌려줌 ③ 버튼 재클릭은 `pointerdown` 시점의 열림 상태로 판단(달력의 "초점 잃음"이 click보다 먼저 옴) ④ 숨기기 직전 카드를 감춰 다음에 열 때 지난 달력이 비치지 않게.
- **끌어 옮기기(중요):** 창 전체(카드 + 그림자 자리인 투명 여백)가 손잡이입니다. 빈 곳은 4px, 버튼 위는 12px 움직여야 끌기가 시작됩니다(날짜를 누르다 손이 흔들려도 선택이 취소되지 않게).
  - **"초점 잃음" 신호를 그대로 믿고 닫지 않습니다.** Windows가 창을 OS 이동 모드로 넘기면 최상위 창과 웹뷰 자식 창 사이로 초점이 오가며 가짜 신호가 옵니다(그대로 닫으면 달력을 잡는 순간 꺼집니다). 이동 중에는 무시하고, 아니면 70ms·420ms 두 번 `isFocused()`로 되물은 뒤에만 닫습니다.
  - 이동이 끝나면(이동 알림이 0.5초간 없으면) 초점과 키보드 커서를 되살리고, 화면 밖으로 나갔으면 `ensureWindowOnScreen`으로 되돌립니다.
- 개발 시 `?date-picker-preview`로 카드 모양·키보드·빠른 선택을 브라우저에서 확인합니다(테마·글꼴·크기·값을 바꿔 볼 수 있음).

### 급식 창
- `main.js`가 `meal`, `meal-search`, `meal-settings`를 별도 `MealApp`으로 분기합니다. 이 경로에서 메모의 App/appState 효과를 실행하지 않습니다.
- 컴포넌트는 `src/components/meal/`, 파서·캐시·설정·창 도우미는 `src/lib/meal/`, 나이스 요청은 `src-tauri/src/neis.rs`입니다.
- 저장소는 `tidy-task-meal.json`이며 설정을 필드별 키로 저장합니다. 메인 모양/커스텀 글꼴은 기존 저장소를 읽기만 합니다. 내장 글꼴 목록은 `src/lib/builtinFonts.js`를 공유하고 appState가 기존 export를 유지합니다.
- 개발 시 `?meal-design`으로 실제 컴포넌트 시안을, `?meal-matrix`로 크기·배율 검수 화면을 엽니다. 시안 데이터는 실제 조회 결과와 구분합니다.
- 인증키 주입·검수와 남은 네이티브 확인 사항은 `docs/급식창-구현-검수.md`를 참고하세요.

### 시계 창 (툴킷 `clock`)
- 화면 시각 = PC 시각 + 표준시 보정값. 표준시를 매초 받아 오지 않습니다(끊기면 시계가 멈추므로). 한국 시간은 UTC+9 고정(`src/lib/clock/clockTime.js`)이며 PC 시간대·Intl에 기대지 않습니다.
- 보정값은 Rust `src-tauri/src/clock_time.rs`의 `clock_time_offset`이 잽니다: NTP 4대(KRISS 2·Google·Microsoft) → 실패 시 HTTPS Date → HTTP Date, 어느 단계든 다수결. Windows 시각은 절대 바꾸지 않습니다. 실제 네트워크 확인: `cargo test --lib live_sources -- --ignored --nocapture`.
- 보정값 관리(`timeSync.js`): 1시간마다 재측정, 실패 시 30초→30분 백오프. `clock_wall_skew`(PC 시각 − GetTickCount64)가 0.3초 넘게 변하면 PC 시각 변경으로 보고 보정값을 그만큼 고칩니다(절전은 이 값을 바꾸지 않음). 초 경계 예약·늦은 틱 감지는 `ticker.js`.
- 설정은 툴킷 설정 파일 `preferences.clock`(스키마 8). 검증 규칙은 JS `clockPreferences.js`와 Rust `toolkit.rs`의 `clock` 분기가 같아야 합니다(제목 30자는 코드포인트 기준).
- CSS에서 `light-dark()`를 쓰지 않습니다. 배포 빌드의 lightningcss가 변수 대체 코드로 바꾸는데, 툴킷은 다크 모드를 인라인 `color-scheme`으로 켜서 그 변수가 비어 값이 사라집니다. 시계는 `data-scheme` 속성으로 분기합니다.
- 개발 시 `?toolkit-preview=clock`, 경계 확인은 `&clock-at=2026-09-23T23:59:55%2B09:00`(가짜 시각에서 출발, 개발 전용).
