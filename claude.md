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
- **Manager Authority:** 다수의 창 중에서 단 하나의 창(보통 `main` 창, 닫히면 가장 오래된 생존 창으로 권한 승계)만이 전역 리마인더 체크 및 알림 등의 백그라운드 작업을 중앙 제어(`isManager = true`)하도록 설계되었습니다.
- 창 간 통신은 Tauri의 IPC API(`emit`, `listen`)를 통해 이벤트 기반으로 이루어집니다 (예: 테마 변경 동기화, 데이터 동기화).

### 3.2. 상태 관리와 영속성 (State Management & Persistence)
- `src/lib/appState.svelte.js`가 애플리케이션의 "두뇌" 역할을 합니다.
- **하이브리드 저장 엔진:** 모든 상태는 메모리 상의 Runes로 관리되는 동시에, 디바운스(Debounce) 처리를 통해 디스크의 JSON 스토어(`LazyStore`)로 지속적으로 자동 동기화됩니다.
- 멀티 윈도우 간 상태 충돌을 방지하고 각 창 고유의 데이터(위치, 크기, 개별 메모 내용)를 무결하게 보존합니다.

### 3.3. 타임머신 (Undo/Redo) 및 유령 청소기
- 사용자의 모든 액션을 스냅샷 형태로 기록하여 롤백할 수 있는 히스토리 스택(최대 20개)을 지원합니다.
- 데이터가 비어 있는 창이 닫힐 때는 레지스트리에서 해당 창을 완벽하게 삭제하는 "유령 청소기" 로직이 내장되어 불필요한 리소스 낭비를 막습니다.

## 4. 디자인 시스템 및 UI/UX (Design & UI/UX)
- **Themes & Fonts:** 7가지 내장 컬러 테마(White, Amber, Blue, Green, Rose, Purple, Slate)와 라이트/다크 모드를 지원합니다. 사용자가 직접 폰트 파일(`.ttf` 등)을 드래그 앤 드롭하여 추가할 수 있는 시스템 폰트 커스터마이징을 지원합니다.
- **Layout:** 할 일(Todos)과 노트(Notes), 보관함(Archived) 영역의 크기를 사용자가 드래그(Splitter)로 조절할 수 있습니다. 레이아웃 조절 시 화면이 튀는 현상(Jumping bug)을 방지하는 정밀한 로직이 적용되어 있습니다.
- **Responsiveness & Smoothness:** 창의 크기와 뷰포트 변화에 따라 즉각적으로 레이아웃이 반응하며, 유리 질감(Glassmorphism) 및 트랜지션 효과를 통해 세련된 사용자 경험을 목표로 합니다.

## 5. 작업 시 준수해야 할 엄격한 규칙 (Strict Rules & Guidelines)
프로젝트 코드를 수정하거나 새로운 기능을 개발할 때, 어시스턴트(AI)와 개발자가 반드시 지켜야 할 원칙입니다.

1. **Core Feature Analysis (핵심 기능 보존):** 코드를 수정하기 전, 원본 코드의 핵심 기능(특히 IPC 통신, 매니저 권한 승계 로직, 윈도우 Resize 락/언락)을 철저히 분석하여 기존 기능이 누락되지 않도록 해야 합니다.
2. **State Persistence (상태 영속성 보장):** 새로운 상태값 추가 시, 반드시 `appState.svelte.js`의 `takeSnapshot`, `performSave`, `init` 및 초기화 로직(`resetContent` 등)에 빠짐없이 동기화되도록 반영해야 앱 재시작 시 상태가 유실되지 않습니다.
3. **Execution Hierarchy:** 이 규칙은 모든 UI/비즈니스 로직 작업 시 최우선적으로 지켜져야 하며, 예기치 못한 데이터 유실 리스크(예: 초기화 버그, 잘못된 윈도우 라벨 기반 스토어 덮어쓰기)가 있을 경우 반드시 작업을 중단하고 사용자에게 대안을 제안해야 합니다.
4. **가독성 및 주석 (Readability):** 변수명은 직관적으로 작성하고, 주석은 항상 '한국어'로 '왜(Why)' 이렇게 코드를 짰는지 의도를 명확하게 남깁니다.
