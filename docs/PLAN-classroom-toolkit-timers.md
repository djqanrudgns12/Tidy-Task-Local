# 학급 툴킷 · 타이머 상세 구현 계획

작성: 2026-09-19 · 기준 PRD: [학급 툴킷 · 타이머 1차](./PRD-classroom-toolkit-timers.md)

상태: 2026-09-19 실제 구현 착수. 사용자의 후속 요청으로 실제 효과음 검색·라이선스·편집·재생까지 범위를 확대했다. 체크리스트는 실제 검증 후 갱신한다.

## 1. 실행 원칙

첫 구현은 툴킷과 타이머 4종을 완결한다. 샘플을 닮은 화면만 만든 뒤 동작을 채우는 순서가 아니라, 창 동작과 시간의 정확성을 먼저 확립하고 같은 상태 위에 완성도 있는 표현을 얹는다.

- 사용자의 인터뷰 답변을 재질문하지 않는다. PRD의 구현 기본안으로 진행하고, 기술 검증 때문에 달라진 부분만 결정 기록에 남긴다.
- 기존 메모 저장·매니저 선출·테마를 통째로 리팩토링하지 않는다. 새 기능은 독립 진입점과 저장소를 사용한다.
- 코드·구현 테스트·브라우저 화면·실제 네이티브 조작의 증거를 구분한다.
- 체크박스는 결과와 증거가 있을 때만 완료한다. PRD 작성, 라이브러리 조사, 구현 계획은 제품 구현 완료가 아니다.
- 효과음은 이번 범위다. CC0 등 재배포 가능한 파일을 검색하고 원본/라이선스/수정 기록을 남긴 뒤, 음량·길이 정리와 오프라인 재생·예약 취소까지 구현한다.

## 2. 현재 코드 확인 결과

확인한 기준 커밋: `2636c8f`. 작업 시작 시 사용자 소유의 `public/sample/`이 미추적 상태였으며 변경하거나 정리하지 않는다. 문서 작성 중 앱 코드·의존성·음원·이미지 파일은 수정하지 않았다.

| 현재 위치 | 확인한 동작 | 적용 계획 |
|---|---|---|
| `package.json` | Svelte 5, Tauri 2, Vite 8, Lucide, node:test | 같은 스택 사용. 새 전체 UI 프레임워크를 추가하지 않음 |
| `src/main.js` | 급식창을 App과 다른 동적 진입점으로 분기 | 툴킷/타이머 전용 진입점 추가. 메모 저장 부작용 차단 |
| `src/App.svelte` | 메모 저장·닫기 처리·설정 적용을 담당 | 툴킷 전역 설정을 메모 스냅샷에 넣지 않음 |
| `src/components/SettingsModal.svelte` | 본앱 설정 UI | 전역 툴킷 토글 하나 연결 |
| `src/components/HeaderActions.svelte` | 모던 메뉴와 대화상자 | 모던 메뉴 툴킷 토글 추가. 기존 메뉴 항목 보존 |
| `src/lib/dragRegion.js` | 버튼/입력은 드래그 제외, 더블클릭 충돌 방지 | 타이머 제목줄에는 활용 가능. 툴킷용 버튼 위 드래그는 별도 구현 |
| `src/lib/meal/mealWindows.js` | 숨긴 창 생성, 화면 내 배치, 독립 창 | 패턴 참고. 기존 창 재사용 방식은 타이머에 적용하지 않음 |
| `src/lib/meal/mealStore.js` | 별도 저장 파일, 필드별 설정, 테마 읽기 | 저장 분리 원리 참고. 창별 JS 큐만으로 다중 창 직렬화를 보장한다고 보지 않음 |
| `src/lib/windows/windowPlacement.js` | 물리 좌표와 배율 기반 복원 | 툴킷 위치 복원에 재사용. 메뉴 전체가 보이는 보정은 별도 계산 |
| `src/lib/windows/windowLabels.js` | 데이터 창 분류, 메모 슬롯 10개 제한 | toolkit/timer 라벨은 별도 분류. 메모 슬롯 제한을 재사용하지 않음 |
| `src/lib/windows/managerElection.js` | 메모 창끼리 매니저 선출 | 툴킷/타이머를 후보에 추가하지 않음 |
| `src/lib/themes.js`, `src/lib/header.css` | 공유 테마와 정돈된 모던 UI 토큰 | 색·폰트 기반을 따르고 신규 영역에 국소 CSS 사용 |
| `src/lib/sound.js` | 기존 시작/리마인더용 AudioContext 재사용 | 기존 두 효과를 변경하지 않고 타이머 출력 계약 별도 정의 |
| `src-tauri/src/lib.rs` | Destroyed 시 특정 라벨 생존 검사, 트레이 종료 | toolkit/timer가 남아 있으면 앱 유지, 일시 메뉴만 남으면 정리 |
| `src-tauri/capabilities/default.json` | 창 생성·드래그·핀·좌표 권한 존재 | 신규 창에서 실제 권한 시험. 필요한 누락 권한만 보완 |
| `src-tauri/build.rs` | 릴리스 시 기존 급식 키 구성 검사 | 비밀값을 출력하지 않고 기존 빌드 절차 유지 |

주의: 과거 메모에 적힌 검증 통과/실패 수치는 이번 커밋의 결과가 아니다. 구현 전 기준 검사를 새로 실행하여 기록한다.

## 3. 기술 선택과 이유

### 3.1 UI와 의존성

- **Bits UI를 우선 채택**: Switch, Select, Dialog, AlertDialog, 필요한 Menu/Toolbar primitive만 얇게 감싼다. 직접 CSS로 Tidy Task 외형을 만든다.
- 2026-09-19 `npm view bits-ui version peerDependencies license --json` 결과는 `2.19.2`, Svelte `^5.33.0`, `@internationalized/date ^3.8.1`, MIT였다. 현재 Svelte 선언 `^5.53.12`와 범위가 맞는다. 실제 설치 시 lock 해석·peer·라이선스와 새 번들 크기를 다시 확인한다.
- 설치 시 `npm.cmd install --save-exact bits-ui@2.19.2`를 기준으로 peer 설치 결과를 확인한다. peer 경고를 무시하지 않으며 필요한 date peer도 검증한 정확한 버전으로 고정한다. 날짜 UI 자체는 사용하지 않는다.
- Bits UI의 일반 팝업은 타이머/설정 창 내부에서 사용한다. OS 창 바깥까지 DOM 포털로 나갈 수 있다고 가정하지 않는다.
- 별도 Floating UI 직접 의존성은 시작부터 추가하지 않는다. headless UI 내부 기능으로 충분한지 확인하고 실제 중복 없는 필요가 있을 때만 도입한다.
- 기존 Lucide 조작 아이콘, CSS transition/Svelte transition, SVG를 사용한다. 별도 애니메이션 엔진이나 캔버스 게임 엔진은 도입하지 않는다.

### 3.2 창·설정·시간의 책임

```text
Rust toolkit 서비스
  ├─ 툴킷 1개/설정 1개/선택 메뉴 1개 생성과 앱 수명
  ├─ 타이머 창은 실행 요청마다 고유 라벨 생성
  └─ 설정 patch 직렬화 → 전용 Store → 저장 성공 revision 반환

전용 Svelte 진입점
  ├─ ToolkitToolbar / ToolkitSettings / ToolkitMenu
  └─ TimerApp(kind, instanceId)
       ├─ 순수 시간 엔진 + 주입 가능한 ClockSource
       ├─ 창 내부에만 존재하는 측정 상태
       ├─ 종류별 설정 스냅샷
       ├─ Digital / Analog / Hourglass / Stopwatch 표현
       └─ AlarmDriver 계약 → 로컬 음원 WebAudio adapter
```

복잡한 범용 런타임은 만들지 않는다. Rust는 다중 창이 공유해야 하는 수명·저장만, 시간 도메인은 테스트 가능한 JS 모듈이 담당한다. 뒤늦은 백그라운드 이벤트 재생은 이번 음원 적용 단계의 native scheduler adapter에서 처리할 수 있도록 시계와 출력 경계를 유지한다.

## 4. 변경 파일과 모듈 경계

아래 신규 경로는 계획 경로이며 아직 존재하지 않을 수 있다. 작고 밀접한 함수는 파일을 더 나누지 않아도 되지만, 책임을 역으로 합치지는 않는다.

| 영역 | 계획 파일 | 책임 |
|---|---|---|
| 공통 진입 | `src/components/toolkit/ToolkitApp.svelte` | label로 toolbar/settings/menu/timer 분기 |
| 툴킷 | `ToolkitToolbar.svelte`, `ToolkitSettings.svelte`, `ToolkitMenu.svelte` | 이동 가능한 바, 노출/방향 설정, 종류 선택 |
| 타이머 | `src/components/timers/TimerApp.svelte`, `TimerFrame.svelte` | 창 수명, 종류 고정, 제목/핀/창 제어 |
| 공통 조작 | `TimerControls.svelte`, `TimerSettingsPanel.svelte` | 상태별 조작, 시간 입력/프리셋/소리 설정 |
| 표현 | `DigitalTimer.svelte`, `AnalogTimer.svelte`, `HourglassTimer.svelte`, `StopwatchTimer.svelte` | 파생 상태의 렌더링. 시간 스케줄러 소유 금지 |
| 기록 | `LapTimeline.svelte` | 기록 행과 스크롤. 시간 계산 금지 |
| 레지스트리 | `src/lib/toolkit/toolRegistry.js` | 안정 ID, 표시 이름, 메뉴 자식, 실행 동작 |
| 네이티브 어댑터 | `src/lib/toolkit/toolkitWindows.js` | invoke, 실제 창 핀/닫기/이동, native/preview 경계 |
| 저장 | `toolkitPreferences.js`, `toolkitStore.js` | 기본값·정규화·필드 허용 목록·patch API |
| 이동/배치 | `toolkitDrag.js`, `toolkitPlacement.js` | 클릭/드래그 판정, 앵커, 전체 메뉴 작업영역 보정 |
| 테마 | `src/lib/toolkit/toolkitAppearance.js`, `toolkit.css` | main 외형 읽기, 전용 토큰·밀도 |
| 시간 | `src/lib/timers/countdown.js`, `stopwatch.js`, `timerClock.js` | 순수 상태 전이, 기준 시각 계산, UI와 무관한 시계 |
| 수학/표시 | `analogGeometry.js`, `hourglassGeometry.js`, `timeFormat.js` | 각도 경계, 면적, 포맷 |
| 알림 | `timerAlarms.js`, `timerAudio.js` | 경고 episode, 종료 단발성, 출력 어댑터 |
| Native | `src-tauri/src/toolkit.rs` | 전용 저장 및 창 명령, process-scoped 수명 상태 |
| Preview | `src/dev/ToolkitPreview.svelte`, `TimerPreview.svelte` | 브라우저 QA에만 쓰는 시계/창/설정 어댑터 |
| 시각 자산 | `artwork/toolkit/`, `public/images/toolkit/` | 원본·생성 기록 및 런타임 이미지 |
| QA 결과 | `output/qa/toolkit/`, `output/qa/timers/` | 크기/테마/실제 창 검증 자료 |

기존 수정 지점은 `src/main.js`, `SettingsModal.svelte`, `HeaderActions.svelte`, `windowLabels.js`, `src-tauri/src/lib.rs`, 필요 권한과 `package.json`/lockfile로 제한한다. 기존 테마 함수·창 배치 함수를 재사용하고, `appState.svelte.js`의 노트 저장 스키마에 타이머를 넣지 않는다.

## 5. 설정 데이터 계약

### 5.1 저장 가능한 값

전용 `tidy-task-toolkit.json`에 명시적 키만 허용한다. 객체 전체를 받아 그대로 직렬화하는 API를 만들지 않는다.

```text
schemaVersion = 1
revision = native 단조 증가 정수
toolkit.enabled = true
toolkit.orientation = "horizontal" | "vertical"
toolkit.collapsed = false
toolkit.visibleToolIds = ["timer"]
toolkit.position = { physicalX, physicalY, logicalX, logicalY, width, height }
preferences.digital = { tickEnabled, warningEnabled, endEnabled,
                        warningLeadSeconds, warningDurationSeconds }
preferences.analog  = { 위 소리 필드, dialRangeMinutes: 60 }
preferences.hourglass = { 위 소리 필드, showRemainingTime: true }
preferences.stopwatch = { tickEnabled: true }
```

- `warningDurationSeconds = null`은 ‘계속 울림’, 그 외는 2/5/10/20만 허용한다.
- 경고 시점은 5/10/20/30/40/50/60/90/120만 허용한다. 소리 bool의 기본은 모두 true.
- `alwaysOnTop`, `activityTitle`, `remainingMs`, `elapsedMs`, `initialMs`, `startedAt`, `laps`, `timerWindows`는 저장 금지.
- 자동 30→60분 전환은 해당 실행 창의 유효 눈금만 바꾼다. 사용자가 직접 고른 `dialRangeMinutes` 선호를 저장하고, 자동 전환으로 새 창의 선호를 몰래 바꾸지 않는다.
- 실행 중 설정 패널 접힘과 타이머 창 크기도 1차에서는 저장하지 않는다. 툴킷 접힘/위치와 구분한다.

### 5.2 다중 창의 최신값 처리

1. 생성된 타이머는 native `toolkit_read_preferences(kind)`에서 최신 설정과 revision을 받아 초기화한다.
2. 사용자가 변경한 필드만 `{kind, patch, requestId}`로 보낸다. UI 초기화/외부 알림 때문에 자동 저장하지 않는다.
3. 창 내부 큐는 그 창의 조작 순서를 유지한다. Rust의 process-scoped mutex 안에서 최신 저장값을 읽고 patch를 검증·병합·저장한다.
4. 다른 창에서 온 patch도 같은 native 경로를 거친다. 잠금 안에서 await하지 않고, 저장 실패를 성공 revision으로 반환하지 않는다.
5. 서로 다른 필드는 둘 다 남는다. 같은 필드는 native가 승인한 마지막 요청이 우선한다. 클라이언트 벽시계 timestamp로 순위를 정하지 않는다.
6. 응답 revision이 오래된 경우 최신 UI를 덮어쓰지 않는다. 실패한 필드는 재시도 표시와 현재 세션 값으로 구분한다.
7. 기존 타이머 창은 다른 창의 변경을 실시간으로 따라가지 않는다. 새로운 창만 최신 저장값을 받는다.
8. 전역 툴킷 ON/OFF·방향·노출은 예외적으로 모든 조작 진입점에 동기화한다. 구독 설치 후 snapshot을 다시 읽어 초기 이벤트 유실을 방지한다.

저장 예: A/B 두 디지털 창이 같은 revision으로 열린 뒤 A가 경고를 30초로 바꾸고 B가 시계음을 끈다. 새 C에는 `30초 + 시계음 OFF`가 적용된다. A/B의 나머지 현재 UI는 강제로 바뀌지 않는다.

### 5.3 오류와 종료

- 파일 읽기 실패/알 수 없는 schemaVersion에서는 원본을 보존하고 설정 저장 실패를 표시한다. 빈 객체를 저장하는 복구는 금지한다.
- 파싱 가능한 v1의 개별 잘못된 필드는 메모리에서 기본값으로 보정한다. 사용자의 유효 patch가 있을 때만 해당 필드를 저장한다.
- 토글 변경은 즉시 저장한다. 위치는 드래그 종료 및 적절한 debounce로 저장한다. 마지막 상태 저장은 native가 소유하여 창 제거에 의해 중간 취소되지 않게 한다.
- 종료 시 측정 데이터를 수집하는 훅을 추가하지 않는다. 제목/기록을 분석 이벤트나 오류 로그에 넣지도 않는다.
- 별도 실제 사용자 설정 파일을 지우거나 테스트용으로 덮어쓰지 않는다. 자동 검사는 임시 저장 경로와 preview 저장소로 수행한다.

## 6. 네이티브 창과 툴킷 동작

### 6.1 라벨과 소유권

| 라벨 | 개수/생성 | 항상 위 | 앱 생존 조건 | 저장 |
|---|---|---|---|---|
| `toolkit` | 프로세스에 하나 | true | 포함 | 설정·위치 |
| `toolkit-settings` | 하나, 기존 창 포커스 | true, 툴킷 조작용 | 단독 생존 제외 | 툴킷 설정만 |
| `toolkit-menu` | 하나, 짧은 수명 | true | 단독 생존 제외 | 없음 |
| `timer-<kind>-<id>` | 실제 선택마다 신규 | false로 시작 | 포함 | 종류별 선호만 |

- `kind`는 digital/analog/hourglass/stopwatch enum. 종류나 label을 query 문자열만 믿고 임의 실행하지 않는다.
- 생성 요청마다 새 requestId를 만들고 같은 요청의 재전송만 중복 방지한다. 다른 실제 클릭을 시간 debounce로 무시하지 않는다.
- 타이머 다중 생성에 `getByLabel(kind)` 재사용 또는 메모 슬롯 10개 제한을 적용하지 않는다. 무제한 성능을 약속하지 않고 여러 창 실측을 완료 기준으로 둔다.
- 창을 숨겨 생성하고 준비 이벤트 → 위치/크기/테마/설정 적용 → 표시 순서로 흰 번쩍임을 줄인다.
- 생성 실패 시 오류 메시지와 재시도 가능 상태를 남긴다. ‘열리는 중’ 잠금은 finally에서 해제한다.

### 6.2 시작·종료와 기존 앱 통합

- Rust setup의 플러그인 준비 이후 process-scoped startup 경로에서 저장된 enabled를 읽고 툴킷을 한 번만 연다. 각 note 창 mount마다 생성하지 않는다.
- native factory가 toolbar의 singleton과 진행 중 생성 상태를 소유한다. native 창 build 호출을 상태 잠금 안에 오래 가두지 않도록 intent 예약/실행/완료를 나눈다.
- 본앱 설정/모던 메뉴는 같은 `toolkit_set_enabled` 명령을 사용한다. 저장된 의도와 창 생성 실패를 구분하고 실패 시 명시적으로 알린다.
- 본창을 닫아도 toolkit/timer가 남으면 앱 유지. 툴킷 OFF 시 기존 timer는 그대로 유지.
- native Destroyed 처리에서 새 창 분류를 확인하고, 타이머 리소스 정리와 일시 메뉴 정리를 수행한다. 기존 meal 관련 수명 동작을 함께 바꾸지 않는다.
- 트레이 종료/OS 세션 종료 시 툴킷이 다시 생성되지 않게 quitting 상태를 둔다.
- 현재 전체 종료의 저장 유예 시간은 메모를 위해 유지한다. 타이머 세션을 저장하는 데 사용하지 않는다.

### 6.3 클릭과 드래그 계약

툴킷용 `toolkitDrag`의 상태는 idle / pressed / dragging / cancelled이다.

1. 주 버튼 pointerdown에서 포인터 ID, 시작 좌표, 클릭 후보 action을 기록한다. 보조 버튼과 두 번째 터치는 제외한다.
2. 기본 이동 기준은 6 CSS px. 터치는 10 CSS px를 초기안으로 두고 실제 기기에서 검증한다.
3. 기준 미만에서 pointerup이면 해당 버튼의 정상 click만 실행한다. 키보드 Enter/Space는 드래그 판정 없이 실행한다.
4. 기준을 넘으면 클릭 후보를 취소하고 메뉴를 닫은 뒤 native `startDragging()`을 한 번 호출한다.
5. 네이티브 이동에 들어가기 전 DOM pointer capture를 정리한다. 이후 pointerup이 없을 수도 있으므로 blur/cancel/native 이동 완료와 새 pointerdown으로 상태를 복구한다.
6. 발생 가능한 합성 click은 그 포인터 제스처에 대해서만 억제한다. 다음 정상 클릭을 삼키지 않는다.
7. data-tauri-drag-region 자동 최대화와 이중 바인딩하지 않는다. 툴킷 더블클릭으로 최대화하지 않는다.
8. 방향/노출/접힘 변경 중 이동은 끝내고 위치 계산을 직렬화한다.

`startDragging()`의 이동 임계값 이후 호출이 실제 WebView2에서 안정적으로 되는지 S0에서 먼저 검증한다. 실패하면 native 드래그 시작 경로만 교체하고 클릭 판정 계약은 유지한다. 브라우저 CSS 이동을 네이티브 검증의 대체로 쓰지 않는다.

### 6.4 작은 창 밖의 선택 메뉴

기본 구현은 **별도의 작은 `toolkit-menu` 창**이다. 전체 화면 크기의 투명 툴킷으로 팝업을 수용하지 않는다.

- 부모 툴킷의 물리 좌표, 트리거 CSS rect, 현재 scaleFactor를 이용해 화면 앵커를 계산한다.
- 모니터 작업영역 기준으로 아래/위 또는 옆 후보를 계산하고 메뉴 전체를 작업영역 안에 넣는다. 기존 ensureWindowOnScreen은 ‘제목줄 일부’만 보장하므로 그대로 대체할 수 없다.
- 선택 메뉴 창의 크기는 실제 내용과 좁은 여백에 한정한다. 투명 여백의 클릭 차단도 native에서 확인한다.
- 메뉴 안에는 Bits UI의 정적 메뉴 콘텐츠 또는 네 개의 접근 가능한 action list를 사용한다. DOM trigger를 다른 WebView에서 직접 참조하지 않는다.
- Escape는 메뉴를 닫고 툴킷 트리거로 포커스를 돌린다. 선택 성공 시에는 새 타이머가 포커스를 받는다.
- 툴킷이 포커스를 잃고 메뉴가 받는 순간을 outside-click으로 처리하지 않는다. 메뉴 자체의 blur, 명시적 dismiss, 부모 이동/접힘/방향 변경으로 닫는다.
- 종류 선택 메뉴는 선택 후 닫힌다. 툴킷 본체는 펼침 상태를 유지한다.
- timer/settings 창 내부의 Select는 보통의 headless portal을 사용하고 자체 viewport 충돌만 해결한다.

### 6.5 크기·앵커·배율

- 툴킷 기본 높이 약 44~48 논리 px, 접힌 폭 약 96~112px. 실제 폰트와 아이콘 검수 후 상수화한다.
- 펼침/접힘은 버튼 앵커가 유지되도록 새 크기와 새 위치를 함께 계산한다. 배율 변경은 이동 종료 후 실제 scale을 다시 읽는다.
- toolbar는 사용자 임의 resize 대신 내용에 맞게 크기 결정. 가로/세로 설정으로 방향 변경한다.
- 타이머는 960×680, 최소 360×420을 출발점으로 한다. 작업영역이 더 작으면 공간에 맞추며 OS 배율 기준 논리 크기와 물리 위치를 혼동하지 않는다.
- 연속 새 창은 24 논리 px 정도 엇갈리게 놓되 화면 끝에서 다시 가시영역으로 보정한다. 타이머 위치는 디스크에 저장하지 않는다.

## 7. 시간 엔진 상세 계약

### 7.1 하나의 시간 기준

`ClockSource.nowMs()`를 주입한다. 제품은 `performance.now()` 기반 단조 시계, 테스트는 수동 advance하는 가짜 시계를 사용한다. `Date.now()`는 타이머의 권위 있는 시계로 쓰지 않는다.

```text
running remaining = max(0, remainingAtAnchorMs - (nowMs - anchorMs))
stopwatch elapsed = elapsedAtAnchorMs + (running ? nowMs - anchorMs : 0)
display countdown seconds = ceil(remainingMs / 1000)
display stopwatch centiseconds = floor(elapsedMs / 10)
```

- 사용자 action마다 now를 한 번 샘플한다. 늦은 프레임의 표시 숫자를 계산 입력으로 사용하지 않는다.
- rAF는 화면 갱신만 담당한다. 숨겨진 창의 낮은 주기 wake-up도 같은 시각 수식을 평가하며, callback 지연을 측정 지연으로 누적하지 않는다.
- phase가 running일 때만 샘플러를 둔다. 문서 visibility/최소화 상태에 따라 장식 렌더링을 중단한다.
- 절전 후에는 현재 시각으로 한 번 재계산한다. 이미 지나간 tick/warning 큐를 몰아서 실행하지 않는다.
- Windows WebView2의 sleep 동안 performance.now 동작은 S0/S8 실제 검사 대상이다. 목표와 다르면 ClockSource 어댑터만 native의 검증된 단조 경과 시계로 교체한다. wall clock 차이를 무조건 더하는 보정은 금지한다.
- 이 단계에서 ‘숨김 창에서 정확한 시점에 실제 음원이 재생됨’은 주장하지 않는다. 이번 음원 적용 단계는 백그라운드 native 스케줄과 출력 검증을 별도로 포함한다.

### 7.2 상태와 명령

카운트다운: `ready | running | paused | completed`. 스톱워치: `idle | running | paused`.

카운트다운 메모리에는 initialMs, remainingAtAnchorMs, anchorMs, activeElapsedMs, runId, alarmEpisode를 둔다. 표시용 값은 여기서 파생하고 독립적으로 감소시키지 않는다.

| 명령 | 계산과 결과 |
|---|---|
| SET_DURATION | ready에서 1초~60분 유효값을 initial/remaining에 반영. 0 입력은 준비 표시 가능하되 시작 비활성 |
| START | 유효 remaining>0, runId 증가, anchor 생성, running. 중복 START는 무시 |
| PAUSE | 현재 remaining/elapsed를 한 번 계산하여 저장하고 anchor 제거, paused |
| RESUME | 저장한 remaining/elapsed에서 새 anchor로 이어감. 남은 시간 0이면 불가 |
| ADJUST | 먼저 현재 시간을 평가한 뒤 delta 적용, 0~60분 제한. running이면 anchor를 현재 시점으로 재설정 |
| DRAG_COMMIT | ready면 initial+remaining 갱신, paused면 remaining만 갱신. running에서는 거절 |
| RESET | 실행/경고 중단, 카운트다운 initial로 ready, 스톱워치는 0과 빈 laps로 idle |
| RESTART | 완료 상태에서 initial로 새로운 runId를 시작 |
| SAMPLE | running이 0에 도달하면 completed 및 단 하나의 completion 이벤트 |
| RECORD | 실행 중 동일 now에서 elapsed, lap delta를 계산하고 새 immutable record 추가 |

실행 중 시간을 늘리거나 줄여도 initial은 바뀌지 않는다. ready 상태의 시간 수정은 initial을 바꾼다. paused 상태에서 0으로 줄이면 paused/0으로 남고 종료 이벤트를 만들지 않는다. 완료 후 증감은 새 준비값을 설정하며 자동 시작하지 않는다.

### 7.3 알림 episode

- 각 실행의 completion은 `runId`로 중복 방지한다. 화면 재마운트/포커스 복귀로 재발생하지 않는다.
- warning은 ‘남은 시간 > threshold’에서 ‘0 < 남은 시간 <= threshold’로 들어갈 때 시작한다. 처음부터 threshold 이하의 짧은 실행도 시작 시 한 번 진입한 것으로 본다.
- 유한 경고 지속은 실행 중 경과 시간으로 소비한다. pause 시 출력 중지, resume 시 남아 있는 유효 경고 기간만 이어간다.
- +시간으로 threshold 위로 올라가면 warning을 중단하고 재무장한다. 같은 구간 안의 증감은 경고 지속을 처음부터 반복하지 않는다.
- threshold/지속 설정을 바꾸면 기존 예약을 취소하고 현재 상태 기준으로 한 번 재평가한다. ON/OFF를 빠르게 바꿔도 동시에 두 재생기가 생기지 않는다.
- 한 sample에서 threshold와 0을 함께 지나치면 warning을 생략하고 완료만 1회 처리한다.
- `tick`, `warningStart`, `warningStop`, `complete`, `stopAll` 이벤트만 출력에 전달한다. 실제 AudioContext는 엔진이 만들지 않는다.
- WebAudioAdapter가 번들 파일을 디코딩·재생한다. tick/warning은 AudioContext의 시계로 반복 간격을 유지하고 종료 이벤트는 runId별 한 번만 예약한다. 실패 상태를 UI에 알리고 미리 듣기로 재시도할 수 있게 한다.

## 8. 아날로그·모래시계·디지털·기록 구현

### 8.1 아날로그 드래그의 수학과 입력

- SVG viewBox를 고정하고 pointer client 좌표를 `getScreenCTM().inverse()`로 변환한다. CSS 축소/DPI에서도 중심이 맞는다.
- 각도는 위를 0으로 하고 시계 방향으로 계산한다. 표시 각도는 `360 × remaining / range`이다.
- 드래그는 실제 현재값에 대응하는 **펼친 각도**에서 시작한다. 매 move의 짧은 부호 있는 각도 차이를 누적하고 [0,360]에서 제한한다. atan2 결과를 매번 바로 시간으로 치환하지 않는다.
- 360에서 위를 지나 계속 시계 방향으로 끌어도 0으로 되돌아가지 않고 최대에 머문다. 반대로 0 아래로도 내려가지 않는다. 방향을 되돌리면 즉시 정상 이동한다.
- 중심 가까이는 각도가 불안정하므로 반지름의 작은 내부 구간에서는 마지막 유효 각도를 유지한다.
- 바늘 끝의 시각 크기와 별개로 최소 32~40px의 투명 hit target을 둔다. 판 전체 어디나 클릭해서 값이 갑자기 바뀌는 동작은 1차에 넣지 않는다.
- `setPointerCapture` 후 pointerup에서 commit, pointercancel/lost capture/Escape에서는 시작값으로 복귀한다. 중간 값은 preview이며 엔진의 확정값과 구분한다.
- 드래그 중 창 resize/30↔60 전환이 발생하면 cancel 후 새 좌표계로 시작한다. 갑자기 다른 시간으로 확정하지 않는다.
- 1분 snap으로 손 조작을 안정화한다. 숫자 입력은 1초 단위. 키보드 Arrow ±1분, Home 0, End 해당 range; 실행 중 비활성.
- `role=slider` 또는 동등한 접근성으로 분 단위 min/max/current를 제공하고 바늘 드래그를 유일한 입력 방식으로 삼지 않는다.

### 8.2 모래의 면적과 시간

- 정돈된 대칭 SVG 프레임과 위/아래 챔버 clipping path를 만든다. 별도 거대 비트맵은 필요 없다.
- 챔버의 높이별 채워지는 면적을 사전 계산한 테이블 또는 분석 가능한 다각형 면적으로 정의한다. 목표 면적 비율에 해당하는 수위를 역산한다.
- 실행 중 비율은 `remaining / (activeElapsed + remaining)`을 사용한다. 처음 시작 시 가득 참, 절반 경과 시 양쪽 절반, 완료 시 위 0/아래 1이다.
- 시간 추가/감소 시 위 식으로 분포를 재계산해 범위를 보장한다. 설정 변경 때문에 필요한 모래 재배치만 짧게 전환하고 진행 중 지속 변화는 실제 시각에서 계산한다.
- 낙하 줄기와 제한된 수의 재사용 입자는 running && remaining>0일 때만 표시한다. 프레임마다 DOM 노드를 추가하지 않는다.
- 일시정지에서는 SVG 분포와 입자 phase를 동결한다. reduced motion에서는 입자 대신 단순 줄기/면적 변화만 유지한다.
- 완성도 점검: 가득 찼을 때 프레임 관통 없음, 1초 직전 떠 있는 잔여 덩어리 없음, 끝난 뒤 줄기 없음, 축소 시 선이 겹쳐 뭉개지지 않음.

### 8.3 디지털 표시

- 선명한 7-segment 느낌의 로컬 SVG 숫자 컴포넌트 또는 충분히 읽히는 로컬 고정폭 숫자를 비교한 뒤 작은 크기에서도 잘 읽히는 쪽을 선택한다. 외부 폰트 CDN은 사용하지 않는다.
- 숫자는 장식 이미지에 포함하지 않는다. 실제 텍스트 기반 accessible time을 별도로 제공한다.
- 네 자리 고정 슬롯과 일정한 콜론 영역으로 너비 변동을 막는다. 숫자 주위 과한 발광이나 비활성 segment 잔상은 쓰지 않는다.
- viewport 양축을 보고 `min(width 예산, height 예산)`으로 글자 크기를 계산한다. `vw` 하나로 확대해 버튼을 밀어내지 않는다.

### 8.4 스톱워치와 기록

- 기록 타입: `{ id, sequence, elapsedMs, splitMs }`. 메모·제목 필드는 미래 선택적 확장으로만 문서화한다.
- record action 한 번은 하나의 now 샘플. split은 현재 elapsed에서 직전 elapsed를 뺀다. 같은 시각에 두 번 눌러도 음수가 되지 않는다.
- 위에 새 행을 추가하고 160~200ms 이내로 가볍게 자리 잡는다. 과거 기록을 읽는 동안 scrollTop을 보존한다.
- 최신 위치에서 벗어나 있을 때는 ‘새 기록 N개’로 다시 맨 위로 갈 수 있게 한다.
- 1,000개 기록으로 성능을 먼저 측정한다. 모두 DOM에 둘 때 기준을 넘으면 timeline 내부만 가상 목록으로 바꾼다. 초기부터 새 가상화 라이브러리를 필수화하지 않는다.
- 기록 삭제 확인은 초기화·닫기에만 필요하며, 매 기록마다 확인하지 않는다.

## 9. 화면 구성·밀도·움직임

### 9.1 화면 골격

툴킷 펼침: `[전용 아이콘 툴킷 ‹] [타이머 ▾] [설정]`.

가로/세로 모두 같은 정보 순서다. 글자 없는 아이콘만 늘어놓지 않는다. 메뉴의 네 타이머는 작은 구분 아이콘과 이름으로 표시한다. 첫 버전의 작은 툴바를 미래 여섯 기능의 빈 슬롯으로 부풀리지 않는다.

타이머 창:

```text
활동 제목                                   항상 위  최소화  최대화  닫기
─────────────────────────────────────────────────────────────────────
                    시간/시계/모래                         설정 패널
                    진행/일시정지 상태                     시간 선택
                                                         소리 설정
            시작·일시정지·다시 설정        시간 증감
```

스톱워치의 오른쪽은 기록 타임라인이 우선이다. 소리 설정은 필요할 때 패널로 열고 주요 기록 영역을 계속 가리지 않는다.

### 9.2 반응형 기준

| 크기 기준 | 표현 |
|---|---|
| 너비 900px 이상, 높이 충분 | 큰 표시 + 240~280px 보조 패널, 가운데 표시가 시각적으로 균형 유지 |
| 너비 600~899px | 표시 중심, 설정은 접는 패널, 주요 조작 하단 고정 영역 |
| 너비 360~599px | 한 열, 프리셋 3열, 증감은 compact 묶음, 기록은 아래 |
| 높이 500px 미만 | 장식/보조 여백 축소, 필수 버튼 유지, 보조 패널만 스크롤 |

브레이크포인트는 최초 기준이며 실제 글꼴과 DPI에서 조정한다. 360×420, 480×640, 640×480, 960×680, 1280×800, 1920×1080 조합을 최소 검수한다. 세로·가로 넘침, 버튼 접근, title ellipsis, 60:00/장시간 스톱워치 표시를 확인한다.

- 공통 간격 4/8/12/16/24px, 섹션 radius 10~14px, 툴바 radius 12~16px를 출발점으로 사용.
- 본문 13~14px, 보조 12px 이상을 목표로 하고 작은 글씨로 기능을 억지로 넣지 않는다.
- 사용자 UI 글꼴은 따르되 시간 숫자는 판독성이 보장된 슬롯을 사용한다.
- 테마에 따라 표면·경계·강조색을 변환한다. 실제 정보 텍스트까지 연한 파스텔로 만들지 않는다.
- 수업 중 항상 보일 제어: 재생/일시정지, 다시 설정, 시간 증감, 항상 위, 닫기. 설정 토글에 숨기지 않는다.

### 9.3 모션 계약

`motion-design` 스킬의 시간·이징 원칙을 적용한다. 이 프로젝트는 사용자가 평면적이고 과하지 않은 표현을 요청했으므로 입체 그림자·상시 ambient 애니메이션은 추가하지 않는다.

| 동작 | 초기안 | 동작 감소 모드 |
|---|---|---|
| 버튼 반응 | 100~140ms, 미세한 색/scale 0.98 | 색만 |
| 툴킷 펼침 | 180~220ms, 기준 버튼 고정, 내용 짧게 이동 | 즉시 크기 변경 |
| 메뉴 등장 | 140~180ms, 4px 이동 + opacity | 즉시 표시 |
| 설정 정리 | 180~220ms, 표시 영역과 함께 재배치 | 즉시 배치 |
| 기록 추가 | 160~200ms, 짧은 위치 이동 | 즉시 추가 |
| 종료 | 450~650ms, 도구 1회 작은 반응 + 문구 등장 | 정적 종료 문구/경계 |

기본 이징은 `cubic-bezier(0.2, 0, 0, 1)`. 시간 진행은 easing하지 않는다. 디지털은 진행선 끝 반응, 아날로그는 중심/프레임의 작은 반응, 모래시계는 프레임의 짧은 흔들림으로 차이를 주되 바늘·모래의 실제 측정값은 변경하지 않는다.

## 10. 에셋 생성·검수·적용 계획

### 10.1 생성 대상

필수 생성은 **툴킷 전용 아이콘 1종**이다. 추가 래스터 장식이 화면 가독성에 도움이 되지 않으면 만들지 않는다. 버튼·시계·모래는 코드로 그릴 수 있으므로 생성 이미지에 의존하지 않는다.

| 산출물 | 계획 경로 | 조건 |
|---|---|---|
| 생성 원본 | `artwork/toolkit/toolkit-icon-master.png` | 최소 1024×1024 RGBA, 실제 투명 배경 |
| 런타임 이미지 | `public/images/toolkit/toolkit-icon.png` | 256px 또는 512px RGBA, 큰 파일을 매 버튼에 사용하지 않음 |
| 제작 기록 | `artwork/toolkit/README.md` | 프롬프트·생성일·원본/파생 관계·QA |
| 검수 시트 | `output/qa/toolkit/icon-contact-sheet.png` | 24/32/48/64px, 밝음/어두움/테마색 배경 |

### 10.2 생성 프롬프트 초안

> A single high-quality flat illustrated icon for a Korean classroom utility toolkit. A compact rounded stationery carry box with a clear handle and two simple classroom tools peeking out, a pencil and a short ruler. Friendly, carefully balanced geometry; warm amber and muted sage accents with a consistent dark charcoal outline. Front-facing, flat vector-like artwork, no perspective depth, no bevels, no 3D, no gloss, no cast shadow, no lettering, no logo, no faces, no sparkles. The entire object fits comfortably inside the canvas with generous even transparent margins on every side. True transparent alpha background; no white background, no white sticker border, no checkerboard drawn into the image. Strong simple silhouette readable at 24 to 32 pixels. Do not imitate the Tidy Task app logo.

기존 앱 헤더의 색·밀도는 내부 비교 기준으로 쓰고, 사용자 샘플 사진은 시각 스타일 입력에 넣지 않는다. 한 번에 여러 작은 아이콘을 시트로 생성하여 잘라 쓰지 않는다.

### 10.3 제작 절차

1. `imagegen` 스킬에 따라 내장 이미지 생성 도구로 실제 투명 배경을 요청한다. CLI/API로 임의 우회하지 않는다.
2. 생성 이미지를 열어 실루엣·도구 개수·모서리·사방 여백을 확인한다. 필요하면 이미지 생성 도구로 해당 문제만 수정한다.
3. 선택한 원본을 프로젝트에 복사한다. 기본 생성 폴더만 참조하는 경로를 제품에 남기지 않는다.
4. 원본 비율과 알파를 유지하는 일반 리사이즈로 런타임 파생본을 만든다. 배경 제거/흰색 날리기를 임의 스크립트로 대체하지 않는다.
5. alpha 채널, bounding box, 해상도, 파일 크기를 검사한다. 비투명 픽셀이 캔버스 가장자리에 닿으면 불합격이다. 최소 약 8%의 안전 여백을 목표로 한다.
6. 흰색·앰버·슬레이트/다크 배경에서 직접 보고 흰 halo와 색 번짐을 확인한다. alpha가 있다는 사실만으로 통과시키지 않는다.
7. 24/32px에서 무엇인지 알아볼 수 없는 작은 도구 디테일은 단순화하도록 재생성한다.
8. 툴킷 실제 버튼과 설정 헤더에 넣어 글자 baseline·광학적 중심·크기를 검수한다. img는 object-fit:contain, 정해진 box를 사용하여 잘리지 않게 한다.

이 에셋은 설정/계산/일반 조작 아이콘을 대체하지 않는다. 접근 가능한 이름은 버튼의 텍스트로 제공하고 중복 장식 이미지는 alt="" 처리한다.

## 11. 단계별 실행 체크리스트

### S0 — 기준 검사와 어려운 동작 선검증

대상: TK-02/03/05, TM-01, ST-01, QA-01.

- [x] 작업 시작 diff/AGENTS/실행 환경을 다시 확인하고 기존 변경을 보존한다.
- [x] `npm.cmd test`, `npm.cmd run check`, `npm.cmd run build` 기준 결과를 기록한다. Rust 검사도 기존 빌드 환경에서 실행한다.
- [x] Bits UI peer/설치 버전을 고정하고 실제 Svelte에서 작은 Switch/Select/Dialog 동작을 검증한다.
- [ ] 네이티브 최소 창에서 버튼 위 click vs drag, pointer capture/취소, 더블클릭을 검증한다.
- [ ] 별도 메뉴 창의 화면 네 귀퉁이·외부 클릭·포커스 복귀·투명 영역 클릭 가로채기를 검증한다.
- [ ] 새 창만 남겼을 때 기존 native 종료 판정이 종료시키는 문제를 시험하고 새 분류로 막는다.
- [ ] 두 창이 동시에 설정 필드를 바꿔도 모두 저장되는 native patch 경로를 시험한다.
- [ ] Windows WebView2에서 최소화/절전/복귀 시간 샘플을 확인하여 ClockSource 결정을 고정한다.

완료 조건: 가장 위험한 네이티브 동작의 실제 증거가 있다. 실패 시 이 단계에서 어댑터를 수정한다. 화면을 다 만든 후 드래그/메뉴 구조를 갈아엎지 않는다.

### S1 — 모듈 경계·설정 저장·독립 진입

대상: TK-01/02, ST-01, EX-01.

- [x] 레지스트리와 kind/label 타입, 저장 schema/enum/기본값, non-persisted 필드를 정의한다.
- [x] native read/patch/open/toggle 명령과 전용 store를 구현한다.
- [x] 전용 main.js 라우팅과 browser preview 어댑터를 구현한다. 제품 native 코드를 preview query로 실행하지 않는다.
- [x] 본앱 설정/모던 메뉴 토글, 툴킷 프로세스 단일 생성, 앱 종료 정리를 연결한다.
- [x] 메모 저장·activeExtraWindows·manager 후보에 신규 창이 들어가지 않는 것을 검사한다.

완료 조건: 설정만 저장되고, 본창이 없어도 툴킷 창의 수명이 유지되며, ON/OFF가 모든 진입점에서 일치한다.

### S2 — 툴킷 외형·생성 아이콘·노출 관리

대상: TK-03/04/05, UX-01/02/03.

- [x] 10절의 생성·알파·축소 검수를 거쳐 아이콘을 프로젝트에 적용한다.
- [x] 툴킷 가로/세로·접힘·버튼 앵커·설정 진입·0개 노출을 구현한다.
- [x] 네이티브 메뉴에서 네 종류의 새 창을 여는 동작을 연결한다.
- [ ] 위치 저장, 모니터 분리 복구, 테마/다크, 100/125/150/200% DPI를 검수한다.

완료 조건: ‘어디든 잡고 이동’과 ‘클릭해서 실행’이 같은 바에서 충돌 없이 작동하고, 생성 아이콘이 실제 UI 크기에서 선명하다.

### S3 — 순수 시간 엔진과 공통 창

대상: TM-01/02/07, ST-01, QA-01.

- [x] countdown/stopwatch/clock/alarm 모듈을 fake clock 테스트와 함께 구현한다.
- [x] 고유 타이머 창, 제목, 핀 OFF, 창 제어, 시간 직접 입력, 프리셋, 증감, 상태별 버튼을 연결한다.
- [x] close/reset 확인과 리소스 정리, completion 단발성, 실제 소리 재생과 실패 표시를 구현한다.
- [x] 데이터 저장 allowlist를 통해 측정/제목/기록이 디스크로 새지 않는지 확인한다.

완료 조건: 시각 표현 없이도 시간 전 경로와 여러 창 독립성이 테스트 가능하다. 프레임 지연이 누적 오차로 이어지지 않는다.

### S4 — 디지털 타이머 첫 완성 경로

대상: TM-03, UX-01/03.

- [x] 큰 숫자·진행선·종료 상태, 입력→시작→정지→재개→증감→종료→다시 시작을 한 창에서 완성한다.
- [x] 360×420부터 큰 화면까지 숫자와 버튼 충돌을 검사한다.
- [x] 이 단계에서 공통 프레임/설정 UI를 정리한 뒤 다른 표현에 재사용한다.

완료 조건: 타이머 한 종류가 실제 수업 흐름으로 완결되어 나머지 표현의 공통 기반이 된다.

### S5 — 아날로그와 바늘 조작

대상: TM-04, UX-03, QA-01.

- [x] 30/60 눈금·부채꼴·바늘을 같은 remaining에서 파생한다.
- [x] 경계 unwrapping, snap, cancel, 실행 중 잠금, 키보드 조작을 구현한다.
- [x] 30분 초과 자동 눈금 전환과 설정 저장/실행 눈금의 분리를 검증한다.
- [ ] 축소/배율 변경/중심 근처/위쪽 경계/빠른 왕복 드래그를 시험한다.

완료 조건: 드래그 순간부터 완료까지 숫자·면적·바늘이 일치하고 0↔최대 튐이 없다.

### S6 — 모래시계 표현

대상: TM-05, UX-01/03.

- [x] 면적 기반 수위와 위/아래 채움, 낙하 줄기·입자, 일시정지·종료를 연결한다.
- [x] 시간 증감에 따른 분포 변경과 숫자 표시 토글 저장을 검증한다.
- [ ] 0/1/25/50/75/99/100% 및 좁은 화면 상태를 시각 검수한다.

완료 조건: 단순 애니메이션 반복이 아니라 실제 남은 시간이 모래의 양에 일치한다.

### S7 — 스톱워치와 기록 타임라인

대상: TM-06, UX-01/03.

- [x] 경과 시간·기록·일시정지·재개·초기화·닫기 흐름을 구현한다.
- [x] 누적/구간 시간을 동시 샘플링하고 타임라인 정렬·스크롤 보존을 구현한다.
- [x] 1시간 이상 표기와 1,000개 기록, 좁은 창 하단 전환을 검증한다.
- [x] 초기화·창 닫기·앱 종료 후 기록이 영구 저장되지 않음을 검사한다.

완료 조건: 기록의 의미와 순서가 명확하고, 기록을 많이 남겨도 측정/주요 조작을 방해하지 않는다.

### S8 — 통합·회귀·실제 창 마감

대상: 모든 요구사항.

- [ ] 순수 테스트, Svelte 검사, 프로덕션 웹 빌드, Rust 검사, Tauri 실행 패키지를 순서대로 확인한다.
- [ ] 네 종류를 섞어 8개 창 동시 실행 후 각 창의 독립성·닫기 정리·최소화 복귀를 확인한다.
- [ ] 타이머 20회 생성/닫기 이후 사용하지 않는 listener/RAF/창 참조가 누적되지 않는지 확인한다.
- [ ] 테마 15개 light/dark 핵심 상태 자동 캡처와 대표 테마 육안 검수를 수행한다.
- [ ] native 다중 모니터·DPI·항상 위·절전·작업표시줄 닫기·트레이 종료를 별도 기록한다.
- [x] 아이콘·숫자 대비·모래 경계·입력 포커스·종료 모션을 최종 조정한다.
- [ ] 기존 메모/Tiny Note/급식/리마인더 회귀를 확인하고 기능 검수 문서를 작성한다.

완료 조건: 아래 QA 표에 실제 증거가 연결되고, 미실행 검증을 통과로 표기하지 않는다. 실제 음원 재생과 파일 출처 검수를 완료한다.

의존 순서: `S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8`. 에셋 제작은 저장·진입 구조를 정한 S1 이후 진행하며, 실제 창에서의 적용 검수까지 S2에서 마친다.

## 12. 요구사항 추적표

| PRD ID | 구현 단계 | 핵심 검수 증거 |
|---|---|---|
| TK-01 | S1 | 최초 ON, 저장 OFF, 설정/모던 메뉴 일치, OFF 후 timer 유지 |
| TK-02 | S0/S1/S8 | 메인 종료 후 toolkit/timer 존속, 임시 메뉴만 남지 않음 |
| TK-03 | S0/S2/S8 | 버튼 위 6px 경계, 드래그 후 실행 0회, 네이티브 이동 |
| TK-04 | S2 | 가로/세로, click-only, 앵커 보존, 재시작 복원 |
| TK-05 | S0/S2 | 화면 네 귀퉁이 메뉴, 0개 노출 복구, 선택마다 창 추가 |
| TM-01 | S1/S3/S8 | 고유 ID, 핀 OFF, 같은 종류 3창 독립, 종료 후 복원 없음 |
| TM-02 | S3/S4 | 모든 상태 전이, 0/60분 경계, 증감 후 reset 기준 |
| TM-03 | S4 | 고정 숫자 폭, 작은/큰 창, 시간 진행/종료 |
| TM-04 | S5 | 바늘 경계·취소·30→60·키보드·숫자 일치 |
| TM-05 | S6 | 모래 면적 일치, pause 정지, 숫자 토글 저장 |
| TM-06 | S7 | 누적/구간 값, 타임라인 스크롤, 초기화와 비영속 |
| TM-07 | S3/S8 | exact enum, 종류별 소리 설정, 경고 재무장, 종료 1회 |
| ST-01 | S0/S1/S3/S8 | 동시 필드 patch, 최신 새 창, 실패 보존, 저장 금지 필드 부재 |
| UX-01 | S2/S4~S8 | 6개 viewport, 15테마, 다크, 버튼 접근 |
| UX-02 | S2/S8 | 생성 원본·알파·여백·축소 QA·실제 적용 |
| UX-03 | S2/S4~S8 | 모션 상태표, reduced motion, 키보드·포커스 |
| QA-01 | S0/S3/S8 | fake clock/실제 WebView2 구분, lifecycle·회귀·성능 |
| EX-01 | S1/S8 | 레지스트리 확장 시험, 미래 기능이 현재 코드에 미구현 UI로 새지 않음 |

## 13. 검증 시나리오와 실행 방법

### 자동 검사

| ID | 시험 | 기대 결과 |
|---|---|---|
| TIME-01 | 60분 실행, callback을 불규칙하게 3/17/900/5000ms 지연 | 마지막 now 기준 남은 시간이 정확, 호출 횟수 오차 없음 |
| TIME-02 | pause 동안 10분 fake advance 후 resume | 정지 구간 제외 |
| TIME-03 | 59분에서 +10, 30초에서 -1분 | 60분 제한, 실행이면 완료 1회 |
| TIME-04 | pause 30초에서 -1분 | 0 정지, 완료 이벤트 없음 |
| TIME-05 | 실행 중 증감 후 reset/restart | initial 기준 유지, runId별 완료 1회 |
| TIME-06 | 같은 now의 여러 record, 1시간 이상 | 음수 split 없음, 형식 정상 |
| WARN-01 | 경고 구간 위로 추가 후 다시 감소 | stop 후 새 episode 한 번 |
| WARN-02 | 30초 lead/20초 지속/5초 실행, 지연으로 즉시 종료 | 출력 기간 0초를 넘지 않음, stale warning 없음 |
| WARN-03 | pause/resume, 설정 변경, ON/OFF 연타 | 동시 중복 재생 계약 없음 |
| DIAL-01 | 위쪽 경계를 양방향 통과, 0/최대/중심 이동 | 순간 0↔최대 점프 없음 |
| DIAL-02 | capture 취소·resize·basis 변경 | 미완료 조작 원복 |
| SAND-01 | 알려진 비율 0~100%, +/− 시간 | 위+아래 면적 보존, 정지/완료 줄기 규칙 |
| STORE-01 | A가 warningLead 변경, B가 tick 변경 | 새 C에서 두 필드 모두 최신 |
| STORE-02 | 디지털/아날로그 각각 다른 값 | 종류 사이 누출 없음 |
| STORE-03 | 제목/laps/session을 patch에 포함 | 거절, 파일에 금지값 없음 |
| STORE-04 | 읽기/저장 오류, 미래 version | 원본 보존, 성공 알림 없음 |
| REG-01 | toolkit/timer label 데이터 창 분류 | 메모 매니저·저장 목록 제외 |
| ASSET-01 | PNG alpha·크기·bounding box | 투명 여백, 가장자리 잘림 없음 |

예정 명령: `npm.cmd test`, `npm.cmd run check`, `npm.cmd run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo check --manifest-path src-tauri/Cargo.toml`, `git diff --check`.

초기 기준 검사에 이미 오류가 있다면 로그를 저장하고 신규 파일/수정 파일의 오류가 늘지 않는지 분리한다. 전체 check가 실패했는데 ‘모든 검사 통과’라고 쓰지 않는다. 문서만 변경한 이번 단계에서는 위 제품 검사를 실행한 것처럼 기록하지 않는다.

### 브라우저 UI 검사

- DEV 전용 preview에서 4종 × ready/running/paused/completed(해당하는 상태)와 기록 0/1/다수 상태 캡처.
- 6개 viewport, 대표 테마 amber/sea-glass/linen/slate, 다크, 긴 제목, UI 글꼴 확대를 교차 검사.
- 화면에 보이는 도구 중심과 클릭 영역이 일치하는지 실제 pointer 입력으로 검사한다.
- Space는 입력/메뉴/대화상자 포커스에서는 타이머 실행을 가로채지 않는다. 타이머 작업 영역에서만 시작/정지를 수행한다.
- 시간 매초 aria-live 방송 없이 상태 전환/기록 결과/오류만 알린다.
- 확인 대화상자와 설정 패널의 Escape·Tab·복귀 포커스, 프리셋/증감의 접근 가능한 이름을 확인한다.

### 실제 Tauri 수동 검사

1. main 최소화/닫기 → 툴킷에서 새 timer → toolkit OFF → timer 유지 → 마지막 작업 창 닫기.
2. 툴바 배경·아이콘·글자·설정 버튼 각각에서 click/drag, 네 귀퉁이 메뉴, 가로/세로 전환.
3. PPT/브라우저 위 toolkit 고정, timer 핀 OFF→ON→OFF, 작업표시줄 최소화·복귀·닫기.
4. 100/125/150/200% DPI와 서로 다른 배율의 모니터 이동, 보조 모니터 제거 후 재실행.
5. 절전 진입 전후 시계 샘플과 남은 시간 비교. 복귀 시 경고 몰아 재생 없음. 실제 음원의 경고/종료 중복 여부도 확인.
6. 설정 저장 직후 종료/재실행 → 설정만 유지, timer/laps/title 재등장 없음.
7. 트레이 종료 동안 popup 생성/설정 변경 경합 → 유령 창과 재생 예약 없음.

### 성능 기준

- 8개 혼합 창에서 5분 실행하고 UI 응답·프로세스 CPU·메모리를 기록한다. 기기 사양도 함께 남긴다.
- 숫자/바늘/모래 계산에 초당 IPC를 사용하지 않는다. IPC는 설정·창 조작 및 필요한 native clock 검증에 한정한다.
- 20회 창 열기/닫기 뒤 listener/RAF/timer 핸들이 기준으로 돌아오는지 확인한다. 메모리 숫자만 보고 GC 이전에 누수라고 단정하지 않는다.
- 애니메이션 프레임이 반복해서 16.7ms를 넘는 경우 SVG/입자/DOM 갱신을 줄인다. 정확한 시간 계산은 줄이지 않는다.
- 1,000개 lap에서 기록 버튼 반응과 기존 기록 스크롤이 지연되지 않아야 한다. 필요시 목록 내부 가상화만 적용한다.

## 14. 예상 위험과 대응

| 위험 | 대응 / 통과 조건 |
|---|---|
| 버튼 누르면 드래그가 클릭을 삼키거나 반대로 실행됨 | S0에서 native 제스처 proof, gesture 단위 click 억제 |
| 작은 WebView에 메뉴가 잘림 | 별도 menu 창, 물리 앵커/작업영역 계산 |
| 메뉴 focus 이동 즉시 닫힘 | 부모 blur와 메뉴 자체 blur를 구분, 실제 키보드 시험 |
| main이 닫히자 프로세스 종료 | native 수명 분류에 작업 창 추가, 임시 창은 제외 |
| 같은 종류 설정의 오래된 전체 객체 덮어쓰기 | native 필드 patch 직렬화와 revision |
| hidden/절전 때 타이머 지연 | 단조 시각 계산, 실제 WebView2 검증, ClockSource 교체 경계 |
| 미래 오디오 때문에 엔진 재작성 | 경고 episode/출력 인터페이스를 지금 확정, 실제 출력만 후속 연결 |
| 투명 PNG인데 흰 테두리/잘림 발생 | alpha 수치와 다중 배경 실물 확인, 생성 재시도 |
| theme/dark에서 연한 숫자 | 데이터 대비 별도 검사, 미세한 강조색만 테마 사용 |
| 과한 추상화로 개발 범위 확대 | 현재 4종 registry/adapter에 한정, 미사용 plugin framework 없음 |
| 사용자 데이터 손상 | 저장 파일 분리, native 테스트 임시 경로, 기존 데이터 쓰기 금지 |

## 15. 후속 작업에 남길 것

- 실제 음원은 현재 구현 범위로 이동했다. 후속 작업은 추가 음색 선택 등으로 제한하며 BGM은 추가하지 않는다.
- 클래스 명단 단계: 로컬 명단/모둠 저장 계약과 개인 정보 범위를 그때 별도 정의한다. 현재 타이머 prefs 파일에 빈 명단 스키마를 미리 넣지 않는다.
- 기록 메모 단계: lap ID를 기준으로 선택적 제목/메모 추가. 이번 기록 비영속 원칙을 바꾸려면 별도 요구사항으로 명시한다.
- 이후 새 도구는 registry와 별도 window/module로 등록하고, 툴킷 노출 관리와 독립 창 수명을 재사용한다.

## 16. 조사 출처

확인일 2026-09-19. 라이브러리 문서와 현 저장소를 근거로 한 설계이며 아직 이 앱에서 런타임 호환성 시험을 마친 것은 아니다.

- [Bits UI 시작하기](https://www.bits-ui.com/docs/getting-started), [Dropdown Menu / ContentStatic](https://www.bits-ui.com/docs/components/dropdown-menu): Svelte headless primitive와 native popup 내부 정적 메뉴 검토.
- [Tauri Window](https://v2.tauri.app/reference/javascript/api/namespacewindow/), [Tauri Store](https://v2.tauri.app/plugin/store/): 실제 창 API와 native 저장 서비스 연결 기준.
- [MDN performance.now](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now), [Pointer Capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture): 단조 시각·절전 차이·포인터 추적을 확인한 근거.
- 기존 프로젝트 파일은 2절의 경로를 직접 확인했다. 과거 native 검증 결과를 이번 구현에 대한 증거로 사용하지 않는다.

## 17. 효과음 구현 추가 범위 (후속 사용자 요청)

- 시계음: 짧고 조용한 tick. 경고음: 구분되는 짧은 신호. 종료음: 한 번 울리는 부드러운 확인 음색.
- CC0 원본 파일과 라이선스 근거를 artwork/toolkit/audio/에 보관하고 runtime WAV는 public/audio/toolkit/에 둔다.
- ffmpeg로 무음·길이·peak를 검사하고 변환 명령 및 SHA-256을 기록한다. 소리가 과하게 잘리거나 clipping되지 않아야 한다.
- 개별 미리 듣기, 최초 모두 ON, 종류별 최신 설정, 경고 길이 제한, 일시정지/닫기 시 모든 source 정리.
- WebAudio 시간 기반 source 예약을 사용하고, 최소화 시 반복 tick의 누적 지연과 일시정지 뒤 유령 소리가 없는지 확인한다.
- 자동 테스트는 출력 어댑터의 예약/취소/단발성과 파일 디코딩을 검사하고, 실제 출력 확인은 따로 기록한다.


## 18. 구현 결과 및 계획 조정 — 2026-09-19

실제 결과의 기준은 [QA 기록](./QA-classroom-toolkit-timers.md)이다. 미체크 항목은 실기기 검증을 완료했다고 주장하지 않는다. 구현 체크와 검증 체크를 구분한다.

- 명령 이름은 `toolkit_read`, `toolkit_patch`, `toolkit_open`, `toolkit_set_enabled`로 단순화했다. 필드 patch와 mutex/revision 계약은 유지했다. 클라이언트의 자동 재전송은 없으므로 requestId 중복 제거 계층은 현재 넣지 않았다. 버튼을 누른 횟수만큼 타이머가 생성된다.
- 도구/타이머 메타데이터는 `src/lib/toolkit/registry.js`, native 허용 역할은 `src-tauri/src/toolkit.rs`에서 관리한다. 미구현 미래 도구는 표시하지 않는다.
- 설정창/경고 선택/확인창은 Bits UI 2.19.2의 Switch/Select/AlertDialog를 사용한다. 네이티브 툴바 밖으로 나와야 하는 타이머 메뉴는 별도 Tauri 창이며 화살표/Home/End/Escape와 포커스 복귀를 처리한다.
- 툴바 이동은 OS `startDragging`을 사용한다. 짧은 제스처가 IPC보다 먼저 끝나 OS 이동량이 0인 경우, 관측한 마지막 포인터 이동량을 현재 배율로 환산해 보완한다. 네이티브 200% 배율에서 63×25 논리 px 드래그가 126×50 물리 px 이동으로 확인되었다.
- 타이머 표시와 시간 계산은 분리했다. 준비/일시정지 중에는 프레임마다 모델을 다시 만들지 않아 직접 입력을 덮어쓰지 않는다. 절전 중의 실제 시계 동작은 별도 미검증으로 남긴다.
- 오디오는 AudioContext의 예약 재생으로 UI 프레임과 분리한다. 짧은 시계음/경고음은 1초 버퍼에서 반복하고, 종료음은 한 번만 예약한다. 정지/변경/닫기에서 예약을 취소한다.
- 생성 아이콘의 원본, 축소본, 효과음 원본/CC0 라이선스/변환 값/해시는 `artwork/toolkit`과 `public/audio/toolkit/LICENSE.txt`에 남겼다. 원본 음원 팩은 보존했다.
- 스톱워치는 처음부터 기록 타임라인을 크게 볼 수 있게 설정 패널을 닫힌 상태로 시작한다. 다른 타이머는 시간 설정 패널이 열린 상태로 시작한다.
- 좁은 창은 설정/기록을 아래로 배치하고 필요시 세로 스크롤한다. 테스트용 query 진입은 Vite 개발 모드에만 제공한다.


## 19. 프런트엔드 전면 개정 — 사용자 후속 요청

- 다크 자동 상속을 없애고 전용 밝은 팔레트로 변경. 이전 테마 상속 계획보다 이 항목이 우선한다.
- 작업 면/설정 면/창 조작을 구분하고, 큰 시간 숫자와 시작·정지 버튼을 우선 배치.
- 아날로그 눈금 19px, 바늘 끝과 숫자 비중첩, 대비 높은 부채꼴. 모래시계는 곡선 형태로 새로 제작.
- 곡선 모래 용적은 폭 함수 `82 - 75t²`의 적분을 역산한다. 상·하단 모래의 총면적은 일정하며 7개 진행 지점을 캡처했다.
- 전광판/스톱워치의 장식 숫자체를 읽기 쉬운 tabular 시스템 서체로 변경.
- 스톱워치의 단일 소리 설정은 작은 패널로 열어 시간과 기록의 폭을 유지한다. Escape로 설정 패널 닫기 지원.
- 전체 툴바 hit area/색상/아이콘 배치 재정리. native fit의 여백도 새 디자인과 일치시켰다.
- 반응형 minimum을 native 380×520으로 조정. 그 크기에서 아날로그 시계·숫자·주요 버튼·증감 버튼이 함께 보이는 화면을 검수했다.
