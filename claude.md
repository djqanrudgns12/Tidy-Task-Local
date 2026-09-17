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
- **Manager Authority:** 다수의 창 중에서 단 하나의 창만이 리마인더 점검·업데이트 확인·트레이 메뉴 요청·커스텀 폰트 등록을 중앙 제어(`isManager = true`)합니다.
  - 선출 규칙(`src/lib/windows/managerElection.js`): **지금 열려 있는** 데이터 창 중 `main` → `note-1..10` → `tinynote-1..10` 순서로 1위가 매니저입니다.
  - 권한은 `appState.becomeManager()` / `resignManager()` 두 함수로만 맡고 내려놓습니다(리스너·1시간 주기 점검·업데이트 일정이 함께 켜지고 꺼짐). `main`이 다시 뜨면 `manager-reclaim`으로 권한을 되찾습니다.
- **보조 창**(`settings`, `ctx-menu`, `reminder`, `welcome`, `update-notice`, `help`, `archive`)은 저장소에 자기 데이터를 쓰지 않습니다. 판별은 `src/lib/windows/windowLabels.js`의 `isDataWindowLabel()` 하나를 씁니다.
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

순수 로직 모듈은 모두 `node --test` 단위 테스트가 있습니다(`npm test`). 타입·접근성 검사는 `npm run check`.

### 3.2.2. 창 위치 규칙 (다중 모니터·배율)
- 사용자는 **배율이 다른 모니터(4K 200% + FHD 100%)**를 함께 씁니다. 논리 좌표는 모니터마다 기준이 달라 창 위치를 논리 좌표로만 저장·복원하면 창이 화면 밖에 놓입니다.
- 창 위치를 저장할 때는 반드시 `appState.rememberWindowPosition(물리좌표, scaleFactor)`를 씁니다(물리 `windowPhysX/Y` + 논리 `windowPosX/Y` 동시 기록). `windowPosX/Y`에 직접 대입하지 않습니다.
- 복원은 `resolveSavedPosition()` → `PhysicalPosition`으로 옮기고, 크기 적용 뒤 `ensureWindowOnScreen()`으로 화면 안을 보장합니다.
- 최소화 상태의 좌표(-32000)·크기(0)는 저장하지 않습니다.
- Rust `ensure_window_on_screen`(트레이 "열기"·시작 8초 뒤)과 JS 판정 규칙(제목줄 80×24 논리px)은 같은 값을 유지해야 합니다.

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


### 급식 창
- `main.js`가 `meal`, `meal-search`, `meal-settings`를 별도 `MealApp`으로 분기합니다. 이 경로에서 메모의 App/appState 효과를 실행하지 않습니다.
- 컴포넌트는 `src/components/meal/`, 파서·캐시·설정·창 도우미는 `src/lib/meal/`, 나이스 요청은 `src-tauri/src/neis.rs`입니다.
- 저장소는 `tidy-task-meal.json`이며 설정을 필드별 키로 저장합니다. 메인 모양/커스텀 글꼴은 기존 저장소를 읽기만 합니다. 내장 글꼴 목록은 `src/lib/builtinFonts.js`를 공유하고 appState가 기존 export를 유지합니다.
- 개발 시 `?meal-design`으로 실제 컴포넌트 시안을, `?meal-matrix`로 크기·배율 검수 화면을 엽니다. 시안 데이터는 실제 조회 결과와 구분합니다.
- 인증키 주입·검수와 남은 네이티브 확인 사항은 `docs/급식창-구현-검수.md`를 참고하세요.
