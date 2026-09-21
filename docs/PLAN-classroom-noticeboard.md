# 알림장 상세 구현 계획 — 작업 트리와 검증 게이트

작성일: 2026-09-21 · 기준: [PRD-classroom-noticeboard.md](PRD-classroom-noticeboard.md)

상태: 구현 및 자동 검증 완료, 네이티브 수동 검증 대기. 아래 트리는 최초 계획을 보존하며 개별 체크 박스는 완료 증거로 사용하지 않는다. 실제 구현과 검증 결과 및 계획 대비 차이는 [QA-classroom-noticeboard.md](QA-classroom-noticeboard.md)에 기록한다. 사용자 인터뷰는 PRD R01~R18로 추적한다.

## 1. 현재 코드 확인과 확장 경계

2026-09-21 작업 폴더를 읽은 결과다. HANDOFF의 ‘타이머만 구현’ 설명은 현재 파일과 다르다. 다음 구현 시작 시 다시 확인한다.

| 현재 경로 | 확인한 사실 | 알림장 작업 |
| --- | --- | --- |
| `src/main.js` | toolkit/timer/roster 진입, `notice-preview`는 업데이트 공지용 | `noticeboard` 역할과 `toolkit-preview=noticeboard` 명시 추가; 기존 notice-preview 보존 |
| `src/components/toolkit/ToolkitApp.svelte` | roster 지연 로딩, 타이머 명시 분기 | 알림장도 명시적 지연 로딩 |
| `src/lib/toolkit/registry.js` | timer/roster 및 외부 플랫폼 등록 | 내부 도구 noticeboard 추가; 플랫폼 링크 유지 |
| `src/lib/toolkit/preferences.js` | schemaVersion 2, timer/roster 노출 정규화 | 신규 ID와 이전 설정 이행; 숨긴 기존 도구 재노출 금지 |
| `src/lib/toolkit/windows.js` | openTool 네이티브 호출, 공용 closeWindow는 destroy 사용 | 알림장 종료는 자체 보관 절차 이후에만 destroy; 공용 함수 직접 호출 금지 |
| `src-tauri/src/toolkit.rs` | 설정/도구 창/작업창 판정 | 단일 noticeboard 라벨, 창 재사용, 노출 정규화·창 수명 확장 |
| `src-tauri/src/classroom/mod.rs` | `tidy-classroom.sqlite3`, rusqlite, 명단 중심 quit handshake | 저장소는 변경하지 않음; 종료 조정 연결 지점만 좁게 수정 |
| `src-tauri/src/lib.rs` | 트레이 종료가 classroom::request_quit 사용, 마지막 작업창 소멸에서 종료 | 명단과 알림장 양쪽 보관 완료를 기다리는 종료 절차 |
| `src/lib/builtinFonts.js`, `fonts.js` | 공용 글꼴 목록, 창별 FontFace 등록 | 글꼴 목록/등록 재사용; 본 앱 상태 전체 초기화 없이 설정 읽기 |
| `src/lib/editable.js` | DOMPurify, IME 처리, execCommand, plain text 붙여넣기 | 기존 메모 동작은 그대로 두고 알림장 전용 편집 어댑터 구현 |
| `src/lib/toolkit/appearance.js` | 밝은 공통 변수와 uiFontFamily 감시 | 창 외곽에 재사용; 화이트보드 흰 바탕은 별도 스코프 |
| `src-tauri/Cargo.toml` | rusqlite bundled, uuid, single-instance 의존성 존재 | 별도 DB에 기존 의존성 활용; 불필요한 DB 라이브러리 추가 없음 |
| `src-tauri/capabilities/default.json` | 전체화면/크기/위치 권한 존재 | 현재 권한으로 검증; 무관한 권한 확대 금지 |

현재 많은 미커밋 변경이 있으므로 문서에 적힌 과거 파일 전체를 덮어쓰지 않는다. 본 기능에 필요한 줄 단위 변경만 적용하며 명단 관련 최신 수정과 합친 상태에서 검증한다.

## 2. 구조 결정

### ADR-01. 전용 도메인과 SQLite 저장소

- 앱 data 디렉터리의 `tidy-noticeboard.sqlite3`에 알림장만 저장한다. 명단 DB/타이머 설정/기존 메모를 변경하거나 이관하지 않는다.
- Rust가 유일한 영속 쓰기 권한을 갖는다. SQL은 파라미터 바인딩, 쓰기는 직렬 큐+트랜잭션으로 처리한다.
- 기본 설정은 foreign_keys=ON, journal_mode=DELETE, synchronous=FULL, busy_timeout=3초. 네이티브 작업 스레드에서 실행하고 UI 스레드를 DB 대기로 막지 않는다.
- 스키마 이행은 트랜잭션. 미래 버전은 읽기/쓰기 가능한 것으로 추측하지 않고 쓰기를 거절한다. 손상 DB를 빈 DB로 덮지 않는다.
- 브라우저 preview는 같은 API 계약을 따르는 가명 데이터 전용 어댑터로 검증한다. 실제 디스크 내구성 검증과 구별한다.

### ADR-02. 구조화 문서와 단일 편집 이력

- 원본은 검증 가능한 JSON 문서. 허용 노드는 doc/paragraph/text/hardBreak, 서식은 bold/italic/strike/underline/fontSize/color로 한정한다.
- 문서 전체 글꼴은 문서 속성으로 넣어 본문과 하나의 이력 트랜잭션에서 다룬다. HTML 문자열 전체 교체와 DOM 실행 취소를 혼용하지 않는다.
- 구조화 transaction/history를 제공하는 ProseMirror 핵심 모듈을 우선 검증 대상으로 삼는다. 이번 문서 작성에서 설치하거나 버전을 임의 고정하지 않는다.
- 선택 이유는 제한 스키마와 명시적 편집 이력이다. ‘라이브러리 사용 = 한글/네이티브 검증 완료’로 간주하지 않는다. P00에서 Windows WebView IME와 번들·라이선스·배포 상태를 확인한 뒤 잠근다.
- ProseMirror의 history 모듈은 undo/redo 플러그인을 제공한다. 공식 저장소의 이전 공지를 확인했으므로, 버전 조사에는 이전된 공식 소스를 따른다. [공식 history 저장소/이전 안내](https://github.com/ProseMirror/prosemirror-history), [공식 state 저장소](https://github.com/ProseMirror/prosemirror-state).
- 기존 `editable.js`와 메모 편집기를 이 작업에서 공통 새 엔진으로 전환하지 않는다. 색/크기 입력 등 순수 UI는 재사용 적합성을 검토한다.

### ADR-03. 같은 내용, 다른 화면

- 날짜별 편집 상태는 모드 컴포넌트 밖의 session controller가 소유한다.
- 활성 편집기는 일반/화이트보드 전환 중 같은 인스턴스를 유지하고 바깥 레이아웃·스타일을 바꾼다. 상태 유지를 보장할 수 없는 조건부 unmount는 피한다.
- 모드별 배율·스크롤·선택 위치는 view state. 문서 JSON과 초안 변경 여부에 포함하지 않는다.
- 저장 변경 알림은 ID/revision/kind만 전달한다. 본문이나 초안을 분석 이벤트/오류 로그/URL에 포함하지 않는다.

## 3. 데이터와 명령 계약

### 3.1 저장 구조

아래는 구현할 스키마 계약이다. 실제 SQL은 P01에서 작성한다.

| 엔터티 | 주요 필드 | 제약 |
| --- | --- | --- |
| documents | id UUID, date_key, revision, saved_json NULL 가능, draft_json NULL 가능, saved_at, draft_at, deleted_at NULL 가능, created_at | deleted_at IS NULL인 date_key에 부분 UNIQUE 인덱스; revision은 변경마다 증가 |
| store_state | singleton, store_revision, schema version은 PRAGMA user_version | 목록/휴지통 변경 감지 |
| applied_operations | operation_id, command_kind, request_digest, response_json, created_at | 같은 ID+다른 요청은 거부; 반영과 같은 트랜잭션에 기록 |
| view_preferences | mode zoom, 일반 창 bounds, revision | 내용과 분리; 저장 실패가 본문 ‘미저장’ 의미가 되지 않음 |

- 초안 NULL은 별도 수정본이 없다는 뜻이다. 빈 doc JSON은 명시적으로 모두 지운 초안이다.
- saved_json은 의미 있는 본문만 허용한다. saved_json/draft_json 중 적어도 하나가 존재해야 영속 문서 행을 만든다.
- 저장본과 초안의 정규 문서가 같으면 draft_json을 NULL로 정리한다. 다른 최신 초안이 있는 경우 정리하지 않는다.
- 휴지통은 같은 documents 행의 deleted_at으로 표현한다. 동일 날짜의 여러 삭제 행은 허용하되 활성 행은 하나뿐이다.
- 날짜를 삭제한 뒤 다시 쓰면 새 UUID를 받는다. 삭제 문서 ID에 대한 늦은 저장은 NOT_ACTIVE로 거절한다.
- 일반 텍스트 미리보기/검색용 텍스트는 JSON에서 파생한다. 따로 저장하면 원본 변경과 같은 트랜잭션으로 갱신하며 원본 권위로 사용하지 않는다.
- 서식 값은 allowlist/범위 검사한다. 외부 HTML·임의 CSS·외부 URL·이미지 데이터·로컬 파일 경로는 문서에 넣지 않는다.
- fontId는 공용 목록/사용자 등록 ID를 가리킨다. 로드 실패가 fontId를 다른 값으로 저장하는 원인이 되어서는 안 된다.
- 크기/색/중복 mark를 정규화해 같은 외형의 문서가 불필요하게 계속 dirty가 되지 않게 한다. 본문 공백/줄바꿈은 정규화로 지우지 않는다.
- 텍스트 100,000 Unicode scalar, JSON 2MiB, 문단 5,000개를 JS/Rust 공통 fixture로 검사한다. UTF-16 code unit/UTF-8 byte를 글자 수로 혼용하지 않는다.

### 3.2 repository 명령

모든 쓰기에는 operationId와 expectedRevision을 사용한다. 최초 생성은 expectedAbsent와 프론트에서 생성한 임시 문서 ID를 검증하며, UUID 충돌/활성 날짜 충돌은 덮어쓰기 없이 실패한다. 쓰기 응답에는 반영된 revision과 operationId를 포함한다.

| 명령 | 핵심 입력 | 원자적 결과 |
| --- | --- | --- |
| readDate | dateKey | 활성 문서 또는 없음; 읽기 실패는 별도 오류 |
| listEntries | filter, query, cursor, queryEpoch | 날짜 내림차순 요약과 다음 cursor |
| saveDraft | id/dateKey, snapshot, expectedRevision, operationId | 초안 갱신/최초 생성; 저장본 유지 |
| commitSaved | id/dateKey, snapshotAtClick, expectedRevision, operationId | 비어 있지 않은 클릭 시점 문서를 저장본으로 반영; 서로 다른 최신 초안 유지 |
| moveToTrash | id, expectedRevision, operationId | 저장본+초안 함께 비활성화 |
| listTrash | cursor | 삭제 시각/ID 내림차순 요약 |
| readTrash | id | 읽기 전용 saved/draft |
| restoreTrash | trashId, expectedRevision, expectedActiveId/Revision 또는 absent, operationId | 비어 있는 날짜 복원 또는 명시적 교체; 교체 대상은 휴지통 이동 |
| purgeTrash | id, expectedRevision, operationId | 휴지통 행만 영구 삭제; 활성 문서는 거절 |
| readOperation | operationId | 응답 유실 시 반영 여부 확인 |

`commitSaved`는 현재 DB draft가 클릭 문서와 같을 때만 draft를 정리한다. 클릭 이후 입력의 초안이 이미 반영되어 있다면 보존한다. 프론트도 응답 도착 시 현재 문서를 클릭 당시 snapshot으로 교체하지 않는다.

applied_operations는 최근 24시간/최대 2,000건을 기본 한도로 둔다. 자동 재시도는 보관 창 안에서만 같은 ID로 수행한다. 만료된 불확실 작업은 최신 문서를 비교하고 사용자 동작으로 재시도한다. 영구 삭제 시 해당 문서 내용을 포함한 재시도 응답 캐시도 제거하고 비내용 tombstone만 남긴다. 응답 캐시를 사용자용 저장 이력으로 노출하지 않는다.

오류 코드는 INVALID_DOCUMENT / EMPTY_CONTENT / LIMIT_EXCEEDED / CONFLICT / NOT_ACTIVE / STORAGE_UNAVAILABLE / UNSUPPORTED_SCHEMA / CORRUPT_STORAGE로 나누고 UI 문구와 재시도 가능 여부를 매핑한다. 오류 메시지에는 본문 원문을 싣지 않는다.

### 3.3 session 상태

```text
NoticeSession
├─ activeDateKey / activeDocumentId / navigationEpoch
├─ dateSessions[dateKey]
│  ├─ editorState: doc + selection + history
│  ├─ editVersion: 로컬 편집 순서
│  ├─ persistedEditVersion / serverRevision
│  ├─ savedSnapshot / lastConfirmedDraft
│  ├─ generation: 삭제·교체 이후 요청 구분
│  └─ saveState: idle / queued / writing / failed
├─ writerQueue: 한 번에 하나의 쓰기, 명령 순서 보장
├─ navigation: idle / composing / flushing / loading
├─ mode: normal / enteringBoard / board / leavingBoard
├─ viewState: 모드별 zoom / scroll / selection anchor
└─ closing: idle / preparing / waiting / failed / ready
```

dirty는 정규 문서와 저장본의 의미 비교로 판단한다. editVersion은 비동기 응답 순서 제어용이며 dirty와 동일한 값으로 취급하지 않는다. 문서에는 변환 중인 IME 문자열을 강제 직렬화하지 않는다.

## 4. 구현 작업 트리

각 단계의 leaf는 구현할 작업이다. 단계 끝의 게이트를 통과한 뒤 다음 단계로 진행한다. 중간 화면 완성만으로 저장/종료 단계 완료를 선언하지 않는다.

```text
P00. 착수·기반 확인 [R01,R07,R18]
├─ P00.1 현재 상태
│  ├─ git status/diff로 명단·플랫폼·타이머 진행 변경 확인
│  ├─ 기존 테스트/check/build 기준선 기록
│  └─ 알림장과 이름이 겹치는 업데이트 공지 preview 구별
├─ P00.2 편집 엔진 소규모 검증
│  ├─ 제한 스키마 + 문장별 크기 + document font 속성 구현 실험
│  ├─ 한글 조합 → 서식 → Ctrl+Z/Y를 실제 WebView에서 검사
│  ├─ 저장 중 입력·선택 복원·모드 스타일 변경 후 이력 검사
│  └─ 공식 배포/라이선스/호환 버전 기록 후 lockfile 고정
├─ P00.3 테스트 환경
│  ├─ 임시 app-data/임시 DB와 가명 문서 fixture 준비
│  └─ 강제 오류·지연·응답 역전·중복 요청 주입 어댑터 설계
└─ 게이트: 엔진 적합성 확인; 실패 시 엔진 결정만 재검토하고 사용자 요구 축소 금지

P01. 문서 모델·날짜·영속 저장 [R02~R06,R17]
├─ P01.1 문서 도메인
│  ├─ schema/mark allowlist/범위/빈 본문 검사
│  ├─ plain text 추출·동일 문서 판정·기본 글꼴 ID
│  └─ JS/Rust 공통 fixture로 유효/거부 결과 비교
├─ P01.2 날짜 연산
│  ├─ local date key, 윤년·월말·연말 이동
│  ├─ 월요일 기준 주간/달력 월간 경계
│  └─ 자정/절전/시간대 변경은 today 상태만 갱신
├─ P01.3 DB
│  ├─ 별도 연결·migration·partial unique index·검증
│  ├─ 직렬 writer / revision CAS / idempotency
│  ├─ 비어 있는 날짜 lazy-create 및 삭제 ID 재사용 금지
│  └─ 손상/미래 버전/잠금/쓰기 실패에서 원본 보존
└─ 게이트: 저장/초안 분리·동일 날짜 경합·transaction rollback 테스트 통과

P02. 초안·저장 상태기계 [R03~R06,R17]
├─ P02.1 보관 scheduler
│  ├─ 조합 밖 500ms debounce / 최대 2초 목표
│  ├─ 연속 draft는 최신 snapshot으로 합치되 명시 저장 경계를 넘지 않음
│  ├─ 날짜/id/generation/version을 예약 시 고정
│  └─ 오래된 응답으로 최신 상태에 보관 완료를 표시하지 않음
├─ P02.2 명시 저장
│  ├─ 조합 완료 → snapshotAtClick → 동일 writer queue
│  ├─ 빈 본문 차단 / 중복 클릭 병합 / 불확실 응답 재조회
│  └─ 저장 중 새 입력은 최신 초안으로 보존
├─ P02.3 열기·이동
│  ├─ 초안 우선 복원 / 저장본 되돌리기 확인
│  ├─ 조합 완료와 flush 뒤 목적 날짜 조회
│  ├─ 마지막 navigationEpoch만 적용 / 실패 시 현재 날짜 유지
│  └─ 조회 실패를 빈 날짜로 바꾸지 않음
└─ 게이트: 지연·역전·중복·저장 중 입력 시나리오 모두 통과

P03. 편집기·서식·단축키 [R07~R09,R18]
├─ P03.1 본문
│  ├─ paragraph/hardBreak / 한글 조합 / 빈 줄 / 이모지
│  ├─ 선택/커서 북마크, 엔진 transaction을 통한 변경
│  └─ 입력 상한 검사와 초과 붙여넣기 전체 거절
├─ P03.2 글꼴
│  ├─ 기존 내장 목록·등록 글꼴 조회, 독립 창 FontFace 로드
│  ├─ document 전체 font 변경을 이력에 포함
│  └─ 미설치/로드 실패 시 저장 ID 유지 및 폴백 안내
├─ P03.3 크기
│  ├─ 단일/혼합 선택 값, 직접 입력/증감/경계값
│  ├─ no-selection stored mark / 전체 선택 적용
│  └─ 문서 크기와 보기 배율을 별도 조작으로 구별
├─ P03.4 서식·색
│  ├─ 네 가지 mark의 전체/일부/미적용 상태와 toggle 규칙
│  ├─ 진한 팔레트·기본색 복원·팝오버 selection 유지
│  └─ 무효/만료 selection으로 다른 날짜 편집 금지
├─ P03.5 clipboard
│  ├─ 외부 plain text, 줄바꿈·공백 보존, URL 자동 링크 금지
│  ├─ 동일 알림장 창 copy/cut은 일회 clipboard token+스키마 검증
│  ├─ token 불일치/재실행/지원 불가 format이면 plain text
│  └─ cut은 clipboard 쓰기 성공 후 하나의 삭제 transaction
├─ P03.6 undo/redo
│  ├─ 버튼/Ctrl+Z/Ctrl+Y를 한 command 경로에 연결
│  ├─ IME 조합 중 가로채기 금지 / 입력 grouping
│  ├─ 검색·날짜·크기 input은 자체 native undo 유지
│  ├─ 날짜별 history, 모드·저장 시 유지, 새 편집 redo 폐기
│  └─ 날짜별 최소 200개 편집 묶음, 넘으면 오래된 이력부터 제한
└─ 게이트: 실제 IME와 선택 범위 포함 편집 E2E 통과

P04. 일반 화면·최근 목록 [R01,R06,R15]
├─ P04.1 일반 화면
│  ├─ Tidy 외곽/날짜/도구/본문/저장 상태
│  ├─ 넓은 창 두 영역 / 작은 창 기록 drawer
│  └─ 빈 상태/로딩/오류/재시도/초안 표시 문구
├─ P04.2 검색·필터
│  ├─ 날짜 표현 정규화와 plain text 검색
│  ├─ 저장본·초안 검색, 초안 전용 hit 표기
│  ├─ 검색+기간 교집합 / 50개 cursor pagination
│  └─ queryEpoch·결과 건수·변경 후 무효화/재조회
├─ P04.3 접근성
│  ├─ 도구 labels/pressed/mixed, keyboard focus
│  └─ 결과 없음과 기록 없음 분리, 상태 알림 과다 낭독 방지
└─ 게이트: 검색 결과 열기까지 저장 계약 유지, 좁은 창에서 도구 접근 가능

P05. 화이트보드·전체화면 [R10~R14]
├─ P05.1 학생용 레이아웃
│  ├─ 순백 바탕·어두운 글자·날짜·넉넉한 문단 간격
│  ├─ 처음에는 글 시작 / 직접 클릭 편집 / 마지막 줄 여백
│  ├─ 작은 고정 조작부·접힌 도구·가리지 않는 overlay
│  └─ scroll overflow 측정, 아래 내용 안내
├─ P05.2 표시 배율
│  ├─ 일반/보드 독립 배율과 서식 px의 상대 계산
│  ├─ 수평 overflow 없는 줄바꿈 / 긴 URL·혼합 크기
│  └─ 글꼴 로드·창 크기·배율 변경 뒤 overflow 재측정
├─ P05.3 native 전환
│  ├─ 진입 전 bounds/maximized/pinned 상태 보관
│  ├─ setFullscreen 성공 확인 후 board 상태 확정
│  ├─ ESC·버튼·OS 전체화면 이탈을 같은 복귀 경로로 처리
│  ├─ 중복 전환 직렬화 / 오류 rollback
│  └─ 모니터/DPI 변화 시 보이는 영역으로 보정 후 복귀
├─ P05.4 편집 맥락
│  ├─ 동일 editor/history 유지, 모드별 anchor mapping
│  └─ selection 자동 스크롤 억제 후 사용자가 편집할 때 정상 복원
└─ 게이트: 확대 편집창이 아닌 학생용 별도 UI 검수 + native 전체화면 왕복 통과

P06. 휴지통·복원 [R16,R17]
├─ P06.1 삭제
│  ├─ 현재 초안 flush / 확인 문구 / 삭제 transaction
│  ├─ 관련 pending request 무효화 / deleted ID 쓰기 거부
│  └─ 날짜 화면 비우기, 입력 전 새 빈 행 생성 금지
├─ P06.2 휴지통
│  ├─ 삭제 시각 목록·본문 읽기 전용 확인
│  ├─ 충돌 없는 복원·저장본/초안 상태 보존
│  └─ 같은 날짜 충돌 비교·명시 교체·상대 문서 휴지통 이동
├─ P06.3 영구 삭제
│  ├─ 개별 확인·revision 검증·관련 캐시 정리
│  └─ 실패 시 항목 유지, 자동 비우기 없음
└─ 게이트: 복원 교체 rollback·동일 날짜 복수 삭제·지연 쓰기 부활 방지 통과

P07. 툴킷·창 수명·앱 종료 [R01,R03,R04,R13]
├─ P07.1 도구 통합
│  ├─ registry / native role / main 진입 / lazy UI
│  ├─ JS/Rust 노출 허용 목록과 설정 migration
│  ├─ 가로/세로/접기/숨기기·명단 끝 배치·플랫폼 순서 유지
│  └─ 단일 창 재사용, 최소화 해제·포커스, 본창 종료와 분리
├─ P07.2 알림장 닫기
│  ├─ X/Alt+F4/native close 공통 prepareClose
│  ├─ IME 확정·입력 잠금·queue drain·ack 확인
│  └─ 실패 시 창 유지, 성공 시 최종 destroy
├─ P07.3 앱 전체 종료
│  ├─ 명단·알림장 저장 참여자를 수집하는 requestId 도입
│  ├─ 모든 참여자의 성공 응답을 받은 뒤 기존 종료 경로 호출
│  ├─ 하나라도 실패/취소/응답 없음이면 종료 보류
│  ├─ 현재 명단 quit guard와 합쳐 이중 종료·교착 방지
│  └─ 종료 도중 도구 새 실행 차단 / 취소 시 모든 창 편집 재개
└─ 게이트: 트레이 종료·마지막 작업창 닫기·명단+알림장 동시 미보관 상태 검증

P08. 통합 QA·배포 전 확인 [R01~R18]
├─ P08.1 도메인/DB/실패 주입/편집 E2E
├─ P08.2 학생용 visual·responsive·keyboard QA
├─ P08.3 실제 Windows Tauri/한글/DPI/종료 QA
├─ P08.4 기존 타이머·명단·메모·급식 회귀
├─ P08.5 성능·상한·로그 개인정보·번들 의존성 점검
└─ 게이트: 증거가 있는 통과만 QA 완료 표기; 미실시 환경 별도 명시
```

## 5. 경합·실패 알고리즘

### 5.1 자동 보관과 저장 버튼의 순서

```text
edit(v10) → draft(v10) 요청 진행
save 클릭 → commit(snapshot v10) queue 등록
edit(v11) → draft(v11) 예약
draft(v10) 성공 → commit(v10) 성공 → draft(v11) 성공
결과: 저장본 v10 / 수정 중 초안 v11 / 화면 v11
```

1. 명시 저장은 장벽이다. 그 앞뒤의 자동 보관을 합쳐 저장 시점이 바뀌지 않게 한다.
2. ACK는 해당 요청의 persistedEditVersion만 전진시킨다. 현재 editorState를 응답 payload로 재설정하지 않는다.
3. 서버 revision은 명령을 보낼 때 마지막 성공 ACK를 기준으로 붙인다. 단일 writer queue 안의 다음 명령은 이 revision을 이어받는다.
4. 응답 유실은 같은 operationId 조회/재시도로 해결한다. ‘실패로 보이니 새 ID로 무조건 재전송’하지 않는다.
5. 내용이 저장본과 같아졌어도 입력이 추가로 예약되었는지 확인한 뒤 ‘저장됨’을 표시한다.

### 5.2 날짜 전환

```text
전환 요청 → 목적지 epoch 갱신 → 조합 완료 대기 → 현재 문서 입력 잠금
→ 예약 보관 즉시 flush → 최종 ACK 확인 → 최신 목적지 조회
→ 유효 epoch인지 확인 → editorState 교체 → 입력 잠금 해제
```

잠금은 짧은 전환 구간에만 둔다. 실패 시 원래 화면/날짜/선택을 유지하고 잠금을 해제한다. 준비 중 다른 날짜를 누르면 마지막 목적지만 바꾸며, 중간 날짜의 빈 초안을 만들지 않는다. 조회 취소가 불가능해도 epoch 검사로 응답 적용은 막는다.

### 5.3 삭제와 복원

삭제 전 flush 후 문서 generation을 증가시키고 큐가 비었는지 확인한다. DB가 deleted_at을 반영한 뒤 이전 generation 응답을 무시한다. 지연 요청이 네이티브에 이미 도착했더라도 expectedRevision/active 검사로 순서 역전을 차단한다.

충돌 복원은 trashRevision과 activeId+activeRevision을 모두 비교하는 한 트랜잭션이다. active 행을 휴지통으로 옮기고 선택 trash 행을 활성화한다. 중간 오류면 전부 rollback한다. 삭제/교체 성공 후 관련 날짜의 기존 undo 이력은 초기화하여 Ctrl+Z로 다른 문서를 부활시키지 않는다.

### 5.4 종료 조정

- prepareQuit(requestId) 시점에 참가 창을 고정하고 새 도구 열기를 보류한다.
- 알림장과 명단은 각자의 기존 저장 계약으로 준비한다. 알림장은 IME 완료 뒤 입력을 잠그고 writer queue drain 후 성공을 응답한다.
- 모든 성공 응답 전에는 `QUITTING`을 최종 승인 상태로 바꾸거나 `app.exit`를 호출하지 않는다.
- 응답 없음/실패는 ‘종료 준비 중/보관 실패’로 남기고 재시도·종료 취소를 제공한다. 시간 초과를 성공으로 취급하지 않는다.
- 취소하면 requestId를 무효화하고 모든 참가자의 잠금을 해제한다. 늦게 도착한 성공 응답이 앱을 종료하지 못하게 한다.
- 기존 `before-quit`과 다른 메모 저장 경로는 보존한다. 명단 경로의 800ms 지연은 알림장 보관 보장의 대체 수단으로 사용하지 않는다.
- 강제 OS 종료/크래시에서는 마지막 commit까지만 보장한다. 다음 시작에서 SQLite rollback/저장소 읽기 검증을 수행한다.

### 5.5 저장소 복구

정상 종료/스키마 이행 전 마지막 정상 DB 사본을 SQLite가 지원하는 일관된 방식으로 만들 수 있는지 P01에서 검증한다. 쓰는 중인 DB 파일을 단순 복사하지 않는다. 복구 사본을 만든다면 1개로 제한하고 본문과 같은 개인정보로 취급한다.

손상 시 원본을 보존하고 정상 사본 유무·시각을 보여준다. 사용자가 복구를 선택한 경우에만 검증된 사본으로 교체하며, 실패한 원본을 몰래 삭제하지 않는다. 사본이 없으면 자료를 초기화하지 않고 오류 상태를 유지한다. 영구 삭제 직후 오래된 복구 사본으로 문서가 재노출되지 않도록 사본 폐기/갱신 정책도 함께 검사한다.

## 6. 구현 파일 계획

예정 경로다. 단순 파일 분할 자체를 목표로 만들지 않으며, 책임이 같은 작은 모듈은 합쳐도 계약은 유지한다.

```text
src/components/noticeboard/
├─ NoticeboardApp.svelte          창·모드·날짜·상태 연결
├─ NoticeEditor.svelte            단일 editor view 수명
├─ NoticeFormatToolbar.svelte     글꼴/크기/marks/색/undo
├─ NoticeArchive.svelte           검색·필터·목록
├─ NoticeTrash.svelte             휴지통/복원 충돌
└─ noticeboard.css               일반/화이트보드 분리된 스타일
src/lib/noticeboard/
├─ schema.js                     문서 검증·정규화·빈 내용
├─ dates.js                      local date/필터/검색 표현
├─ editor.js                     엔진·명령·selection/history
├─ clipboard.js                  외부 plain/내부 검증
├─ session.js                    날짜별 상태·모드·쓰기 큐
├─ repository.js                 native adapter
├─ previewRepository.js          가명/실패 주입용 adapter
├─ windowState.js                전체화면 진입·복귀
└─ *.test.js                     계약 중심 단위/비동기 검사
src-tauri/src/noticeboard/
├─ mod.rs                        제한된 command 진입
├─ model.rs                      문서/명령/오류 검증
└─ repository.rs                 SQL·migration·revision·복원
src-tauri/src/quit_coordinator.rs 명단/알림장 종료 조정(필요한 최소 범위)
docs/QA-classroom-noticeboard.md  구현 후 실제 증거만 기록
```

툴킷 설정은 알림장 노출만 추가한다. 알림장 내용/배율을 타이머 prefs에 넣지 않는다. 기존 설정에서 신규 도구만 기본 노출하도록 schemaVersion 3 이행을 설계하고 JS/Rust를 같은 fixture로 맞춘다. 버전 3에서 사용자가 숨긴 알림장은 다시 나타나지 않아야 한다. 기존 timer/roster 노출·플랫폼 숨김·위치·음원 설정은 그대로 유지한다.

## 7. 검증 매트릭스

| 검사 | 시나리오와 기대 결과 | 요구/단계 |
| --- | --- | --- |
| T01 | 비어 있는 오늘을 열고 닫기: 행 생성 없음; 미래/윤일 이동 정확 | R02,R06 / P01 |
| T02 | 저장본 수정 후 닫기/재시작: 초안 우선, 저장본 불변 | R03,R04 / P02,P07 |
| T03 | 저장 중 입력: 클릭 내용만 저장, 추가 입력 초안 유지 | R03,R05 / P02 |
| T04 | 30회 빠른 날짜 이동·지연 조회: 최종 날짜만 표시, 원 날짜 보관 | R06 / P02 |
| T05 | 저장 응답 유실/중복 클릭: 저장 한 번, 현재 화면 되돌림 없음 | R03 / P01,P02 |
| T06 | 디스크 full/권한/locked: 내용 유지·성공 표시 금지·종료 보류 | R03,R04 / P01,P07 |
| T07 | 저장본의 본문 전부 삭제: 빈 초안 복원, 빈 저장 차단, 저장본 되돌리기 | R17 / P02 |
| T08 | 부분/혼합/전체 선택 크기와 marks: 선택 외 텍스트 불변 | R07,R08 / P03 |
| T09 | 글꼴 변경 → undo/redo, 사용자 글꼴 로드 실패: 문서 ID 보존 | R07,R18 / P03 |
| T10 | 한글 받침/연속 조합/선택 대체/붙여넣기 → undo/redo | R18 / P03 |
| T11 | 입력→서식→저장→모드 전환→undo; 날짜 왕복 후 각 이력 유지 | R11,R18 / P03,P05 |
| T12 | 검색창/크기 입력 Ctrl+Z: 본문이 바뀌지 않음 | R18 / P03 |
| T13 | 외부 HTML/표/링크/이미지/공백/빈 줄: 지원 plain text만 보존 | R09 / P03 |
| T14 | 내부 복사 서식·만료 token·잘못된 JSON: 안전한 폴백 | R09 / P03 |
| T15 | 자정·월말·연말·절전: 현재 문서 날짜 유지, 기간 범위만 갱신 | R06,R15 / P01,P04 |
| T16 | 저장본/초안 전용 검색·기간 교집합·더 보기·빠른 검색 역전 | R15 / P04 |
| T17 | 긴 본문 화이트보드: 자동 축소 없음, 마지막 줄·아래 안내 정확 | R10,R12 / P05 |
| T18 | 도구 접기/열기·직접 편집: 본문 위치 불필요 이동 없음 | R11,R14 / P05 |
| T19 | 전체화면 왕복 20회/실패/OS 이탈/DPI·모니터 분리 | R13 / P05 |
| T20 | 삭제 후 지연 auto-save: 문서가 부활하지 않음 | R16 / P06 |
| T21 | 같은 날짜 복원 교체/중간 실패: 활성 한 장, 상대 자료 보존 | R16 / P06 |
| T22 | 영구 삭제/응답 유실/재실행: 자료 일반·휴지통에서 사라짐 | R16 / P06 |
| T23 | X·Alt+F4·트레이 종료·명단 동시 수정: 모두 보관 후 종료 | R01,R03 / P07 |
| T24 | 강제 중단과 재실행: 마지막 디스크 반영 복구, 빈 DB 대체 없음 | R03,R04 / P01,P07 |
| T25 | v1/v2→v3 설정 이행·숨김 유지·툴바 양 방향과 플랫폼 | R01 / P07 |
| T26 | 키보드만으로 전 기능, 색 외 상태 표시·포커스 복원 | R07,R10,R15,R16 / P04~P06 |
| T27 | 10,000자/200문단 및 3,650일 검색 성능, 입력 상한 경계 | 전체 / P08 |
| T28 | 타이머·명단·메모·급식 수동 회귀, 로그에 본문 유출 없음 | R01 / P08 |

### 7.1 화면/환경

- 일반 화면: 960×680, 640×480, 380px preview. 네이티브 최소 창 크기는 640×480으로 시작하고 화면 작업 영역이 작으면 맞춰 보정한다.
- 화이트보드: 1366×768, 1920×1080. 짧은 3문단, 20문단, 긴 한 줄, 혼합 크기/색, 빈 내용, 오류 상태를 각각 캡처한다.
- Windows 100/125/150% DPI, WebView2 실제 한글 입력기, 키보드와 마우스. macOS는 실제 실행 환경이 있을 때 별도 확인한다.
- 네이티브 모니터 분리·트레이·앱 강제 종료 검사는 브라우저 검사로 대체하지 않는다. 교실 디스플레이 뒷자리 가독성은 실환경 미확인 시 그대로 남긴다.

### 7.2 실행 명령과 보고

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check
cargo test --manifest-path src-tauri/Cargo.toml --lib noticeboard
cargo test --manifest-path src-tauri/Cargo.toml --lib toolkit::tests
cargo test --manifest-path src-tauri/Cargo.toml --lib classroom
```

새 테스트가 기존 npm test glob에 실제 포함되는지 확인한다. 종료 coordinator 테스트도 해당 모듈명으로 실행한다. 브라우저 E2E 명령은 저장소의 당시 실행 환경을 확인해 추가한다. 전체 check의 기존 실패와 신규 파일 오류를 분리하며, 기존 실패를 핑계로 신규 오류를 남기지 않는다.

QA 문서에는 커밋/작업 폴더 상태, 명령, 환경, 실행 일시, 결과, 실패/미실시 항목, 캡처 경로를 남긴다. 이 계획 작성 단계에서는 앱 테스트를 실행하지 않았고 통과 결과도 주장하지 않는다.

## 8. 단계별 산출물과 완료 체크

- [ ] P00: 현재 코드 지도, 기준선, 엔진 검증 기록과 선택 이유
- [ ] P01: 문서/날짜 계약, 전용 DB, 공통 fixture와 오류 검사
- [ ] P02: 초안/저장/날짜 전환 큐 및 실패 주입 결과
- [ ] P03: 서식·clipboard·IME·Ctrl+Z/Y 실제 편집 증거
- [ ] P04: 일반 화면·목록·검색·접근성 검수
- [ ] P05: 학생용 화이트보드 시각 검수와 native 전체화면 결과
- [ ] P06: 휴지통·충돌 복원·영구 삭제 검증
- [ ] P07: 툴킷 노출/설정 이행/명단과 함께 종료 검증
- [ ] P08: 전체 연결 흐름·성능·회귀 결과, 남은 환경 명시

작업 의존성: P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08. 각 단계에서 실제 UI를 확인할 수 있는 preview 진입은 먼저 준비하되, 작동하지 않는 알림장 버튼을 정식 툴킷에 조기 노출하지 않는다. 구현 전 사용자가 범위를 바꾸면 PRD의 확정 요구와 관련 트리/테스트를 함께 갱신한다.
