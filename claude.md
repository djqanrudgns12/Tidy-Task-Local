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

### 3.2.1. 모듈 지도 (v5.6.2)
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
| `src/lib/scores/` | 점수판·학급 온도계 공용 — 구역 저장(`section.js`: 바로 반영·충돌 시 다시 읽고 재적용·되돌리기), 저장소 창구(`store.js`), 효과음(`audio.js`), 스프링 움직임(`motion.js`) |
| `src/lib/scoreboard/`, `src/lib/thermometer/` | 점수판(자료 모양·순위 뱃지·카드 배치·판 조작), 학급 온도계(자료 모양·올리기 규칙·단계·달력·기록·눈금) 순수 로직 |
| `src-tauri/src/scores.rs` | 점수판·온도계 저장 파일 — 구역별 revision, 원자적 쓰기, 백업·손상 복구, 업데이트 직전 사본 |
| `src-tauri/src/classroom/intent.rs` | 다른 창이 학급 명단 창에 할 일(학급 만들기·학생 추가)을 넘기는 10초짜리 전달함 |
| `src/lib/vote/` | 학급 투표 순수 로직 — 자료 모양·정규화(`model`), 부스 상태 기계(`ballot`), 표 변경 함수(`ballots`), 집계·당선 확실(`tally`), 개표 걸음(`reveal`), 기록함·결선(`archive`), 결과 모델·이미지(`result`·`resultImage`), 효과음(`audio`)·음량 측정(`loudness`)·배경 음악(`music` — 화면→곡·교차 넘김·이어 붙이기) |
| `src/lib/timers/soundLibrary.js` | **타이머 소리 목록**(시계음·종료 경고음·종료음 id·이름·묶음·파일, 타이머별 기본 소리)의 단일 원천. 재생은 `audio.js`(`select`·`preview`), 새 음원 가공은 `scripts/prepare-timer-sound-library.mjs` |

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
5. **IPC 성능 규칙:** ① 파일을 읽고 쓰는 Rust 명령은 `#[tauri::command(async)]`(또는 `async fn`)로 만듭니다 — 그냥 `#[tauri::command] fn`은 메인(UI) 스레드에서 돌아 쓰는 동안 모든 창이 멈춥니다. ② 파일 바이트는 `Array.from(bytes)`(JSON 숫자 배열, 약 3.6배)로 보내지 말고 `invoke(명령, uint8Array, { headers })` 원본 바이트로 보내고, Rust는 `tauri::ipc::Request`로 받습니다(예비 통로의 숫자 배열도 받기 — `classroom/import.rs`의 `body_bytes`). 돌려줄 때는 `tauri::ipc::Response::new(bytes)`. JSON 본문은 Tauri가 메인 스레드에서 해석합니다(5MB 파일 약 0.2초 멈춤, 2026-09-26 측정).


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

### 타이머 소리 (시계음·종료 경고음·종료음)
- 설정 키는 `tickSound`·`warningSound`·`endSound`(스톱워치는 `tickSound`만). 목록은 `soundLibrary.js`의 `SOUND_LIBRARY` 하나이고, Rust `toolkit.rs`의 `TICK_SOUNDS`·`WARNING_SOUNDS`·`END_SOUNDS`와 같아야 합니다(`soundLibrary.test.js`가 대조). 모르는 값은 저장을 거부하고, 읽을 때는 그 타이머의 기본 소리로 둡니다.
- 기본값은 타이머마다 예전부터 울리던 소리입니다(`DEFAULT_SOUNDS`). 업데이트로 사용자의 소리가 바뀌지 않게, 기본값을 바꾸지 마세요.
- 반복음(시계음·경고음)은 정확히 1초(또는 2초) 길이여야 초가 바뀌는 순간에 맞춰 울립니다. 새 음원은 손으로 자르지 말고 가공 스크립트에 원본(SHA-256)·가공 방법을 적어 `node scripts/prepare-timer-sound-library.mjs`로 만듭니다(매니페스트·`timer-sounds/LICENSE.txt` 자동 갱신). CC BY·Apache 원본은 저작자 표시가 필요합니다.
- 드롭다운(`ToolkitSelect`)은 body로 옮겨 그리고 창 가장자리에서 뒤집힙니다. 목록이 열린 채 누른 Esc는 bits-ui가 `preventDefault`로 표시하므로, 창 전체 Esc 처리(최대화 풀기·패널 접기)는 `e.defaultPrevented`면 건너뜁니다(`TimerApp.keys`). 검수 기록은 `docs/QA-timer-sound-library.md`.

### 시계 창 (툴킷 `clock`)
- 화면 시각 = PC 시각 + 표준시 보정값. 표준시를 매초 받아 오지 않습니다(끊기면 시계가 멈추므로). 한국 시간은 UTC+9 고정(`src/lib/clock/clockTime.js`)이며 PC 시간대·Intl에 기대지 않습니다.
- 보정값은 Rust `src-tauri/src/clock_time.rs`의 `clock_time_offset`이 잽니다: NTP 4대(KRISS 2·Google·Microsoft) → 실패 시 HTTPS Date → HTTP Date, 어느 단계든 다수결. Windows 시각은 절대 바꾸지 않습니다. 실제 네트워크 확인: `cargo test --lib live_sources -- --ignored --nocapture`.
- 보정값 관리(`timeSync.js`): 1시간마다 재측정, 실패 시 30초→30분 백오프. `clock_wall_skew`(PC 시각 − GetTickCount64)가 0.3초 넘게 변하면 PC 시각 변경으로 보고 보정값을 그만큼 고칩니다(절전은 이 값을 바꾸지 않음). 초 경계 예약·늦은 틱 감지는 `ticker.js`.
- 설정은 툴킷 설정 파일 `preferences.clock`(스키마 8). 검증 규칙은 JS `clockPreferences.js`와 Rust `toolkit.rs`의 `clock` 분기가 같아야 합니다(제목 30자는 코드포인트 기준).
- CSS에서 `light-dark()`를 쓰지 않습니다. 배포 빌드의 lightningcss가 변수 대체 코드로 바꾸는데, 툴킷은 다크 모드를 인라인 `color-scheme`으로 켜서 그 변수가 비어 값이 사라집니다. 시계는 `data-scheme` 속성으로 분기합니다.
- 개발 시 `?toolkit-preview=clock`, 경계 확인은 `&clock-at=2026-09-23T23:59:55%2B09:00`(가짜 시각에서 출발, 개발 전용).

### 점수판 · 학급 온도계 (툴킷 `scoreboard-*`, `thermometer`)
- 툴킷의 "점수판" 버튼은 드롭다운 창 `toolkit-scoreboard-menu`(개인·모둠·커스텀)를 엽니다. 숨어 상주하는 팝업이라 `tray.rs`의 `TRANSIENT_LABELS`에 들어 있습니다.
- **학급 명단과 이어지는 것은 개인 점수판뿐**입니다(학급 id별 점수). 모둠·커스텀 점수판은 명단과 상관없습니다. 온도계는 학급마다 따로(`sets[학급id]`, 명단이 없으면 `default` 한 묶음).
- 저장: `tidy-task-scoreboard.json`(구역 shared·personal·group·custom), `tidy-task-thermometer.json`(구역 main). 구역마다 revision이 있어 `scores_write(expected_revision)`이 어긋나면 `CONFLICT` → `section.js`가 다시 읽고 대기 중 변경을 다시 적용합니다. 누르는 즉시 화면에 반영하고 저장은 뒤에서 합칩니다.
  - Rust `check_data` 제한(문자열 200자·배열 1000개·깊이 10·2MB)을 넘는 자료를 만들지 않습니다. 긴 입력(커스텀 초안)은 줄 배열로 저장합니다.
  - 업데이트 설치 전 `app_update.rs`가 `scores::LOCK`을 잡고, `snapshot_before_update`가 두 파일의 `*.before-update.json` 사본을 만듭니다. 새 저장 경로를 만들면 이 흐름에서도 기록되는지 확인하세요.
- 온도계는 처음 1개, 설정 → 기본에서 2개까지. 창 최소 크기는 1개 380×520, 2개 760×520이며 Rust `work_window_size("thermometer")`·`thermometer_pair_size()`와 JS `setToolMinSize`(ThermometerApp) 값이 같아야 합니다.
- 날짜 규칙: 자동 식힘은 **켠 날부터** 셉니다 — 설정을 바꿀 때 `applySettings(t, patch, today)`가 `lastCooledOn`을 적습니다. `catchUp`(자동 식힘·기한 판정)은 창 열기·초점·10분마다 부르며 여러 번 불러도 결과가 같아야 합니다.
- 숫자 굴림(`components/scores/RollingNumber.svelte`)은 WAAPI로 직접 움직이고 끝·취소·시간 초과 때 옛 숫자를 반드시 지웁니다. Svelte `{#key}` in/out 전환은 연타·가려진 창에서 잔상이 남았습니다.
- 개발 시 `?toolkit-preview=scoreboard-personal|scoreboard-group|scoreboard-custom|thermometer|toolkit-scoreboard-menu`, 날짜 흉내 `&thermo-today=2026-09-28`(개발 전용). 미리보기 저장은 localStorage `tidy-scores-preview-v1:<저장소>`입니다. 검수 기록은 `docs/QA-scoreboard.md`.

### 학급 투표 (툴킷 `vote`, `vote-teacher`)
- 학생은 키보드 숫자키로만 투표합니다(마우스·터치 투표 없음). 투표 단계(부스·개표 대기)에서는 `VoteApp`이 창 전체의 keydown·keyup을 먼저 잡아 부스로만 넘기고(선생님 메뉴·확인창이 없을 때의 Esc도 부스로 — 다시 투표하기 팝업 닫기), 선생님 버튼·확인창은 마우스로만 눌립니다(`tabindex=-1`, 경고 창 버튼은 `pointerup`). 새 버튼을 투표 화면에 넣을 때도 이 원칙을 지키세요.
- **비밀 원칙**: 투표판 화면 값은 `ballot.js`의 `view()`만 보고, 어떤 번호·기권이든 같아야 합니다(단위 테스트가 확인). 효과음 `vote.cast`는 모든 표에 같습니다. 표는 무작위 위치에 끼우고 시각을 남기지 않으며, 개표 전에는 선생님도 득표를 못 봅니다. 공개 전 카드에 결과 글자를 미리 넣지 않습니다(뒷면 숨김이 깨져도 비치지 않게).
- **스페이스바 · Enter는 쓰지 않습니다**(2026-09-26): 첫 친구는 곧바로 투표판, 번호를 누르면 "투표했어요!"(`DONE_MS` 1.3초) → 저절로 봉인 → "다음 친구 차례예요"(`HANDOFF_MS` 1.4초) → 저절로 새 투표판. 이 두 시간 동안 숫자를 모두 무시하는 것이 연타로 두 번째 표가 들어가는 것을 막는 유일한 틈이니 줄이거나 없애지 마세요. 완료 화면에 [다음 친구 투표]·Enter를 다시 넣지 마세요(사용자: "학생들이 빨리빨리 해야 하는데 번거롭다").
- **다시 투표하기**(2026-09-26): 투표판 오른쪽 위 [다시 투표하기] 또는 백스페이스(고르던 표가 없을 때 — 투표했어요 · 다음 친구 화면에서도) → 팝업(`booth/UndoDialog.svelte`) → Enter · [다시 투표하기]면 **저장소의 `lastBallotId`**(선생님 [직전 표 취소]와 같은 표)를 뺍니다. Esc · 백스페이스 · [아니요]는 닫기. 팝업이 뜬 뒤 `UNDO_ARM_MS`(0.4초) 안의 Enter는 무시(연타로 보지도 않고 취소되지 않게), 팝업이 떠 있는 동안에는 저절로 넘어가지 않습니다(`dueAt`).
- **투표는 선생님이 멈추지 않으면 멈추지 않습니다**(2026-09-26): 잠시 멈춤 · "잠시 쉬어요" 화면 · 초점 가림막을 없앴습니다. 창을 다시 열 때 · 안내 다시 보기 · 저장 3회 실패 · 되돌리기 뒤에도 `paused`로 바꾸지 않습니다(`paused`는 예전 저장 파일 호환용으로만 남음, 열 때 `voting`으로 풂). 선생님 메뉴 · 경고 · 확인창이 열려 있는 동안만 부스가 막힙니다(`held`).
  - **투표판은 키보드(초점)를 스스로 되찾지 않습니다**(2026-09-26 사용자 요청): 예전의 0.25초 뒤 `setFocus()` 되찾기 때문에 투표 중에는 다른 창에 입력할 수 없었습니다(누르자마자 투표판이 초점을 빼앗음). 다른 창에 초점이 있는 동안 투표판 왼쪽 위에 작은 알림("키보드가 다른 창에 있어요")만 띄우고, 막지도 멈추지도 않습니다. `setFocus()`로 되찾는 코드도, 가림막도 다시 넣지 마세요. 선생님 창만 자기 버튼 · pointerup · 창 옮김이 끝난 뒤(0.5초) 투표판에 돌려줍니다(선생님이 그 창을 쓴 직후라서). 새 멈춤 경로를 만들지 마세요.
- 표 저장은 `mutateAndConfirm`으로 **저장 확인 뒤에만** 완료 화면으로 넘어갑니다. session 구역은 "투표 있음 | `{id:null}`" 두 모양이고, 변경 함수(`ballots.js`)는 맨 앞에서 id·단계를 보고 할 수 없으면 입력을 그대로 돌려줍니다(충돌 재적용에 안전).
- 저장: `tidy-task-vote.json`(구역 session·archive·draft·prefs, `scores.rs`). 업데이트 직전 사본에 포함됩니다. 기록함은 최근 30개, 결선은 원래 기록의 `runoffs`에 묶입니다.
- 선생님 창은 같은 저장소를 같은 변경 함수로 고치고, 저장하지 않는 신호(안내 넘기기·개표 재생·골라 공개)는 `remote.js`(`vote-remote` / `vote-state`, 미리보기는 BroadcastChannel)로 주고받습니다. 누른 뒤 0.15초 만에 `focusBoard()`로 키보드를 투표판에 돌려줍니다.
- 효과음 음량은 `audio.js`의 `LOUDNESS`(PRD 목표, BS.1770) · `TRIM`(보정) · `TAME`(타격음 봉우리 누름) 표 한곳에서 정합니다. 소리를 고치면 미리보기에서 `renderCue` + `loudness.js`로 다시 재서 표를 고치세요(최고점 −3dBTP가 먼저). 녹음 파일은 `src/assets/vote/audio/{id}.wav|ogg`, 캐릭터 그림은 `src/assets/vote/characters/{m1..f9}.webp`에 넣으면 코드 수정 없이 우선 쓰입니다.
- **배경 음악**(`music.js`, 2026-09-26): 곡은 `public/music` — `main`(첫 화면·만들기·준비·결과 뒤) · `vote`(안내·투표·마감) · `vote counting`(개표·다시 보기). 곡은 화면이 아니라 **곡이 바뀔 때만** 교차로 넘기고(같은 곡 화면끼리는 끊기지 않음), 곡마다 재생기 하나라 겹치지 않습니다. 결과 화면(개표 직후)은 개표 곡을 걷고 축하 소리 뒤에 메인을 올립니다. 곡 끝은 다음 바퀴 처음과 4초 겹쳐 잇습니다.
  - 켜기/끄기는 `prefs.music` 하나(제목줄 `MusicToggle` · 선생님 메뉴 · 선생님 창 공통) — 저장되므로 화면을 옮기거나 창을 다시 열어도 유지. 끄기·전체 소리 끄기는 "잠시 멈춤"(다시 켜면 이어서). 켤 때 전체 소리가 꺼져 있으면 함께 켭니다(`musicTogglePatch`).
  - 음악은 **투표판 창에서만** 만듭니다(선생님 창은 설정만 바꿈). 음량은 곡마다 잰 LUFS로 −27 LUFS에 맞추고, 안내 음성 때 −8dB · 큰 효과음(`MUSIC_DUCK`) 때 잠깐 낮춥니다. 곡 파일을 바꾸면 `ffmpeg -i 파일 -af ebur128 -f null -`로 다시 재서 `MUSIC_TRACKS.lufs`를 고치세요. 화면 전환 도중 잠깐 거쳐 가는 view가 생기지 않게 하세요(예: `finishArchive`는 투표를 비우기 전에 `screen='result'`). 개발 미리보기 콘솔에서 `__voteMusic.snapshot()`으로 곡·크기·위치를 봅니다.
- 작업 창 1280×820(최소 760×560), 선생님 창 440×760(최소 380×560) — Rust `work_window_size("vote" | "vote-teacher")`와 JS 미리보기 크기(`toolkit/windows.js`)가 같아야 합니다.
- 준비 화면(`prep/PrepScreen.svelte`) 확인 카드의 체크는 실제 상태(전체 화면·놓인 모니터·소리 켜짐·눌러 본 키)에서 `$derived`로 계산합니다. `$effect` 안에서 읽은 상태를 다시 쓰면 무한 반복 오류(`effect_update_depth_exceeded`)로 창 전체의 화면 갱신이 멈춰 모든 버튼이 먹통이 됩니다(실제로 났던 사고). 오늘의 후보 판 크기는 `layout.js`의 `lineupGrid`가 정합니다.
- 개발 시 `?toolkit-preview=vote`(선생님 창은 `vote-teacher`), 예시 채우기 `&vote-fixture=candidate9|opinion|yesno3|voting|counting-<방식>[-yesno]|result|result-tie|result-winner|archive`, 효과음 청취·음량 검수 `&vote-sounds`(모두 개발 전용, 배포 번들에 없음). 검수 기록은 `docs/QA-vote.md`.
