# 학급 명단·모둠 구현 상세 계획

작성: 2026-09-20 · 구현 기록: 2026-09-21 [QA](QA-classroom-roster.md)

기준: [PRD](PRD-classroom-roster.md). P00부터 순차 진행한다. 각 단계의 검증 통과 후 다음으로 간다. 사용자 요구는 PRD의 R01~R16으로 추적한다. 아래는 구현 전 작성한 작업 기준이다. 실제 구현의 구체화와 검증 완료/미완료 범위는 QA 문서에 기록했다.

## 1. 구조 결정

### ADR-01. 별도 도메인 저장소

명단은 Rust 서비스 + rusqlite 기반 `tidy-classroom.sqlite3`를 app data에 둔다. 기존 `tidy-task-toolkit.json`은 툴바/타이머 설정만 유지한다. DB 연결은 전용 작업 큐가 소유하며 명령을 직렬 실행한다. UI에는 SQL/전체 DB 덮어쓰기 기능을 노출하지 않는다. 단일 앱 인스턴스 지원은 기존 single-instance 설정을 확인해 유지한다.

선택 이유: 학급/학생/모둠 관계, 일괄 번호 변경, 재가져오기와 삭제를 원자적으로 처리한다. 손수 JSON 원자 저장·복구·참조 검사 프레임워크를 만드는 부담을 줄인다. SQLite 도입 범위는 명단에 한정한다. ORM·클라우드·이벤트 소싱·CRDT는 도입하지 않는다.

연결 초기화: foreign_keys=ON 확인, journal_mode=DELETE, synchronous=FULL, bounded busy timeout. 작은 로컬 직렬 쓰기에 WAL을 선제 도입하지 않는다. SQL migration은 트랜잭션으로 실행하고 실패 시 이전 버전 유지. 버전은 PRAGMA user_version; 상위 버전은 쓰기 금지. 플랫폼 빌드·rusqlite bundled 지원·현재 Cargo rust-version=1.77.2와 의존성 MSRV 호환을 P00에서 확인한다. 자동 툴체인 업그레이드 금지.

### ADR-02. 명령·조회·알림 분리

UI → repository adapter → Tauri command → 도메인 검증 → DB transaction → 성공 응답 → 변경 알림 순서. native의 Rust 검증이 최종 권위이며 frontend 검증은 즉시 피드백용이다. 공유 JSON fixture로 두 검증의 결과를 맞춘다.

클라이언트에 전체 snapshot을 저장시키는 API 금지. 각 수정 명령에 operationId와 expectedClassRevision을 붙인다. 전역 설정 변경은 expectedStoreRevision. 전역 이벤트는 `{revision, classIds, kind}`만 포함하며 이름/번호/성별은 포함하지 않는다. 조회 응답에는 revision 포함.

### ADR-03. 파서와 학생 도메인 분리

- XLSX: Rust calamine 읽기. CSV: Rust csv + encoding_rs 후보. HWPX: Rust zip + quick-xml 후보, Contents/section*.xml의 표 셀/좌표/병합을 읽는다.
- PDF: 지연 로드한 PDF.js로 텍스트와 좌표 추출. 작업은 PDF worker와 별도 추출 task로 분리하고 bounded 결과만 Rust 공통 정규화에 보낸다. PDF 표를 한 줄 정규식만으로 추출하지 않는다.
- 브라우저 preview: 실제 데이터 영속 저장을 흉내 낸다고 주장하지 않는다. 가명 fixture와 session adapter로 UI 검증, 실제 파일 파싱/DB 검증은 native 통합 검사. PDF 단독 파서 테스트는 브라우저에서도 가능.
- CSV/XLSX/HWPX 분석은 native blocking thread에서 실행하고 UI thread/DB writer를 점유하지 않는다. 분석 중 DB transaction을 열어두지 않는다.
- 버전은 P00에서 공식 배포·라이선스·MSRV·보안 공지 확인 후 lockfile에 고정한다. 필요 기능 없는 범용 문서 편집 라이브러리는 추가하지 않는다.

## 2. 데이터 계약

표 이름은 초기 스키마 설계이며 SQL은 P01에서 작성한다.

| 엔터티 | 주요 필드 | 무결성/삭제 |
| --- | --- | --- |
| classes | id PK, name, revision, created_at, updated_at | revision은 해당 학급 내용 변경 시 증가 |
| students | id PK, class_id FK, number, name, gender, created_at, updated_at | UNIQUE(class_id, number), UNIQUE(class_id,id), number/gender/name 제약 |
| groups | id PK, class_id FK, name, normalized_name, sort_order, color_key | UNIQUE(class_id,normalized_name), UNIQUE(class_id,id) |
| memberships | class_id, student_id PK, group_id | 복합 FK(class_id,student_id)/(class_id,group_id)로 타 학급 연결 불가. 학생/모둠 삭제 시 소속 CASCADE |
| app_state | singleton key, revision, default_class_id nullable FK | 학급 삭제 시 default SET NULL |
| applied_operations | operation_id PK, command_kind, resulting_revision, response_ids, created_at | 입력값/원문 보관 금지. 재요청 결과 식별 전용 |

불변 ID는 Rust에서 생성한 UUID v4 등 검증된 난수 ID로 통일한다. 저장 시점은 UTC, 사용자에게 불필요한 시각은 표시하지 않는다. 학급 목록은 created_at/id 안정 순서, 모둠 순서는 sort_order, 학생 표는 번호 기본 정렬.

applied_operations는 최근 24시간/최대 2,000건 유지하고 DB 쓰기와 함께 삽입한다. 최대 보존 한도 밖 요청의 자동 재시도는 금지하고 최신 snapshot 대조 후 사용자 재실행으로 처리한다. 작업 ID 재사용은 동일한 frontend 작업 객체에 한정한다. 응답 유실 뒤 재전송 시 DB 변경 없이 기존 결과 반환. 중복 응답을 받은 UI도 revision 조회로 현재 상태를 확인한다.

Undo token은 native 명단 서비스 메모리에만 보관한다. token에는 작업 전 값/삭제한 엔터티·소속과 작업 후 기대 revision을 포함하며 최대 20건. 최상위 역명령만 실행하고 성공 시 바로 이전 undo 항목의 기대 revision을 새 revision에 맞춘다. 외부 변경이 개입한 경우 자동 재기준화하지 않는다. 미래 점수 이력이 연결되면 역명령 스냅샷에도 관련 행을 같은 트랜잭션 단위로 포함해야 한다.

### 공개 repository 인터페이스

| API | 입력 | 결과/오류 |
| --- | --- | --- |
| listClasses | 없음 | summaries, defaultClassId, storeRevision |
| getClassSnapshot | classId | class, students, groups, memberships, class/store revision |
| execute | operationId, scope revision, command | revision, affected IDs, undoToken 또는 structured error |
| subscribe | callback | unsubscribe; stale 알림은 무시 가능 |
| prepareImport | native file selection token / 제한된 PDF cells | importSessionId, 후보 3필드, issue 목록, 표 선택 메타데이터 |
| commitImport | sessionId, classId, expectedRevision, 확정 mapping/edits | execute와 같은 결과; 일괄 commit |
| cancelImport | sessionId | 모든 임시 세션 자원 해제 |
| exportBackup / inspectBackup / restoreBackup | 사용자 선택 token, version/expected revision | 파일 저장 또는 검증/복원 결과 |

execute의 command는 tagged enum: CreateClass, RenameClass, DeleteClass, SetDefaultClass, CreateStudent, UpdateStudent, DeleteStudents, UpdateStudentBatch, CreateGroups, RenameGroup, ReorderGroups, DeleteGroup, AssignMembers, UnassignMembers, Undo. 프런트엔드 임의 SQL/필드 패치 금지. 외부 호출에서 모르는 필드·유형은 거부한다.

오류 코드: VALIDATION, NUMBER_CONFLICT, GROUP_NAME_CONFLICT, NOT_FOUND, REVISION_CONFLICT, STORAGE_UNAVAILABLE, UNSUPPORTED_SCHEMA, CORRUPT_STORAGE, LIMIT_EXCEEDED, IMPORT_UNSUPPORTED, IMPORT_AMBIGUOUS, IMPORT_EXPIRED, CANCELLED, UNDO_CONFLICT. 사용자 메시지는 별도 사전으로 관리하고 raw 예외/경로/학생 값을 로그에 내보내지 않는다.

### 트랜잭션 순서

1. operationId 중복 확인 → 존재하면 이전 성공 응답을 반환.
2. BEGIN IMMEDIATE → 기대 revision 재검사 → 입력/참조/개수/고유성 검증.
3. 도메인 변경 → class/store revision 증가 → operation 결과 기록 → COMMIT.
4. commit 성공 후 undo 메모리 등록과 이벤트 발행. 이벤트 실패로 성공한 DB 변경을 실패라고 되돌리지 않는다.
5. 실패 시 ROLLBACK, undo/event 없음. 구조화된 오류와 최신 revision 힌트 반환.

번호 교환은 학생을 삭제/재생성하지 않는다. 트랜잭션 내 별도 UNIQUE(number=NULL 허용) 임시 이동 절차를 사용하되 DB number nullable은 내부 교환 때만 허용하고 commit 전 모든 학생 number NOT NULL을 도메인 최종 검증한다. UPDATE 전후 전체 대상 번호의 유일성을 검사한다. 이 내부 제약 선택을 P01에서 SQL 테스트로 고정하며 외부 API는 null 번호를 허용하지 않는다.

## 3. 파일 인식 상세 알고리즘

1. 확장자와 실제 signature 검사. ZIP 내부 경로/항목 수/압축 해제 실제 읽기 바이트 제한. ZIP을 디스크에 풀지 않는다. XML DTD/외부 entity를 거부한다. 잘못된 파일이면 시작 단계에서 종료.
2. XLSX는 시트별 사용 범위와 셀 유형을 읽고 병합 정보를 보조로 사용. 수식을 계산하지 않는다. 번호/이름 셀의 수식은 캐시만 믿고 자동 확정하지 않고 확인 대상으로 둔다. CSV는 BOM 우선, UTF-8 유효성, CP949 후보 순서로 읽고 구분자/인코딩 애매함을 노출한다.
3. HWPX는 순서 있는 section 내 표·행·셀 주소/rowSpan/colSpan을 복원한다. `이 름`처럼 분리된 text run을 합치되 이름 값의 내부 공백은 함부로 제거하지 않는다. 연락처 열은 field projection 직후 폐기.
4. PDF는 페이지별 text item의 transform/크기에서 줄과 열 후보를 묶는다. 제목/머리글 앵커와 세로 위치를 이용해 데이터 영역 분리. 가까운 텍스트 조각을 합치고 반복 머리글을 재탐지한다. 두 단 표는 독립 영역으로 처리. 회전/잘린 글자/열 겹침은 ambiguity로 반환하며 숫자 순서만으로 행 복원하지 않는다.
5. 헤더 정규화는 NFKC + 공백/줄바꿈 정리 및 제한된 별칭 사전. 학생 이름 정규화는 NFC + trim만. 별칭이 없는 열을 값 패턴만으로 자동 확정하지 않는다.
6. 확실성은 근거 기반 등급: A=명시 헤더+일관된 행 구조, B=별칭/병합 등 보정 후 유일한 매핑, C=경쟁 후보/구조 파손. A/B도 미리보기, C는 열 연결 필요. 근거 없는 정확도 백분율을 표시하지 않는다.
7. 중간 헤더/학년반 값 변경으로 학급 영역을 나누고 사용자가 하나 선택. 선택되지 않은 영역 후보는 삭제. 미리보기에는 학생 3필드/행 위치/오류 코드만 유지. 열 선택이 필요한 동안에도 비대상 셀 값 대신 열 제목·위치만 제공한다.
8. 일관된 번호·이름이 있는 행만 후보. 총계/재적수/날짜/교사명 등을 헤더 기반 영역 밖에서 제거. 명단 영역 안의 잘못된 학생 행은 오류로 표시하고 조용히 버리지 않음.
9. 번호 미제공과 번호 인식 실패를 구분. 성별 미제공은 unspecified 최초 등록 / 기존값 유지 재가져오기. 사용자가 미리보기에서 직접 미선택으로 바꾸면 명시 변경으로 기록.
10. 원본 자원은 후보 생성 직후 해제. 열 연결용 구조는 필요한 제목/좌표/세 필드 후보만 유지. 새 열 선택으로 버린 값을 다시 읽어야 하면 사용자 파일을 재선택하게 하고 원본을 숨겨 보관하지 않는다.

import session은 한 명단 창에 하나, 다른 파일 선택 시 이전 세션 종료. 정제된 후보 세션은 마지막 활동부터 30분 만료, 메모리 한정. worker 취소 시 generation ID로 늦은 응답을 버린다. 취소/닫기와 commit 경합에서는 commit 시작 전 취소 가능, commit 시작 후에는 결과 확인까지 기다리고 성공 여부를 알려준다.

### 재가져오기 매칭

classId 내부에서 (number, normalizedName) 인덱스로 정확히 하나 일치할 때 자동 대응한다. 어느 기존 ID도 두 입력 행에 연결할 수 없다. 일치하지 않으면 추가/수정 후보를 제안하되 사용자가 확정한다. 한쪽 속성만 맞는 항목은 자동 UPDATE 금지. 중복 입력은 후보에서 명확히 해결 후 commit. 파일에 없는 기존 ID는 삭제 목록에 명시 선택되지 않으면 유지한다. 비교 전체를 final state로 검증한 뒤 한 트랜잭션으로 반영한다.

## 4. 구현 단계별 작업

### P00. 기준선·의존성·샘플 격리 — R01/R05/R14

- git status/diff로 기존 수정과 신규 기능 경계를 기록. AGENTS.md 존재 재확인. 타이머/아이콘/음원 작업을 되돌리지 않는다.
- 원본 샘플 네 파일을 배포 밖 `.local-fixtures/student/`로 이동할 때 대상이 workspace 안인지 확인, 이름/크기/hash 동일성 확인 후 기존 public 사본 제거. 새 로컬 경로 ignore 추가, 원본 내용은 Git/공개 QA에 포함하지 않음.
- 가명 합성 fixture: 21명/7번 결번, 성별 없음, HWPX 빈 행/집계, CSV/병합 제목/두 반/중복 번호/동명이인. 원본의 이름·연락처·생일을 복사하지 않는다.
- 최소 파서 spike와 SQLite 트랜잭션 spike로 네 샘플의 수/번호/성별 상태를 확인. UI 구현 이전에 실제 native 파서가 샘플을 읽는지 확인한다.
- calamine/zip/quick-xml/csv/encoding_rs/rusqlite/UUID/PDF.js 버전·license·MSRV 확인. 브라우저 worker CSP와 오프라인 번들 확인. 결과를 QA 문서에 기록.
- 합격: 필요한 포맷의 spike 성공, 원본 미배포, 의존성 현재 빌드 호환. 실패 시 해당 기술 선택만 수정하고 원본 데이터/기존 기능 변경 금지.

### P01. 도메인·DB·명령 — R02/R08/R09/R11

예정 신규: `src-tauri/src/classroom/{mod,model,repository,commands,migrations,undo}.rs`.

- 타입/검증/SQL 스키마/인덱스/초기화/버전 오류 처리 작성. migration 손상 테스트. repository를 단위 테스트용 임시 DB로 주입 가능하게 구성.
- CRUD 명령, revision CAS, operationId 재시도, 제한, undo, 도메인 오류 사전 구현.
- 전체 snapshot 대신 항목 명령. 학생 개명/번호 교환/모둠 이동/학급 삭제 FK 검증.
- 합격: CRUD 원자성, 번호 교환 ID 보존, 타 학급 소속 거절, stale revision 거절, 응답 유실 재전송 중복 없음, 장애 후 재열기 이전 또는 새 상태만 존재.

### P02. 툴킷 진입·repository adapter — R01/R13

기존 수정 지점:

| 파일 | 필요한 최소 변경 |
| --- | --- |
| src/main.js | roster 라벨/DEV preview를 명시 인식 |
| src/components/toolkit/ToolkitApp.svelte | roster 명시 분기, 알 수 없는 역할을 타이머로 보내지 않는 오류 화면 |
| src/lib/toolkit/registry.js | timer 그룹 + roster 직접 실행 메타데이터 |
| src/lib/toolkit/preferences.js | 신규 visibleToolIds 허용, 구설정에서 roster 기본 노출 migration 규칙 |
| src-tauri/src/toolkit.rs | 허용 역할·단일 라벨·창 크기·핀·작업창 판정·visibleToolIds 상한 확장 |
| ToolkitToolbar/ToolkitSettings | 직접 실행 버튼, 끝 위치, 노출 제어, 가로/세로 크기 갱신 |
| src-tauri/src/lib.rs | classroom 상태/명령 등록, 정상 종료 저장 조율 |
| capabilities/default.json | 필요 권한만 검토; 기존 전역 권한을 더 넓히지 않음 |

구설정 migration: 설정 schema를 올려 최초 업그레이드 때 roster를 한 번 추가; 사용자가 숨긴 뒤 재시작하면 계속 숨김. read 때 매번 강제로 다시 추가하지 않는다. native/frontend 정규화 일치 테스트.

예정 신규 `src/lib/classroom/{repository,session,commands,validation}.js` 및 JSDoc 타입. native/preview adapter 계약 공유. preview는 가명 세션 데이터만 사용. 클래스 전체를 기존 toolkit settings 이벤트에 실어 보내지 않는다.

합격: 명단 버튼 연속 클릭 시 한 창, 기존 네 타이머 정상, 숨김 설정 유지, 구독 해제 누수 없음.

### P03. 학급 목록·학생 CRUD 화면 — R03/R04/R15

예정 신규 `src/components/classroom/{RosterApp,ClassSidebar,StudentTable,StudentRow,SaveStatus,ClassDialog}.svelte`, 전용 `classroom.css`.

- 최초 빈 화면, 학급 생성/이름 변경/삭제/기본 지정, compact select 대응.
- 실제 table 입력, draft/committed 분리, IME 안전 Enter, Tab/Escape, 번호 제안, 신규 행 응답 전 후속 입력 큐.
- 검색·필터·정렬·현재 결과 다중 선택. 셀 편집 중 행 이동 방지.
- 범용 전체 테이블 재렌더 대신 학생 ID keyed row. 공통 CSS 변경 없이 기존 appearance 토큰 재사용.
- 합격: 40명 연속 입력 및 성별 건너뛰기, 동명이인·외국어 이름·빈 이름·중복 번호, 640/880/1040px 및 키보드 전 과정.

### P04. 가져오기 파서·미리보기 — R05/R14/R16

예정 신규 Rust `classroom/import/{mod,xlsx,csv,hwpx,normalize,limits}.rs`, frontend `src/lib/classroom/import/{pdf,worker,session}.js`, `ImportDialog/ImportPreview/ColumnMapping.svelte`.

- P00 spike를 bounded parser로 완성. native 선택 token은 선택 파일만 읽게 하고 수명 종료 후 무효화. native drag-drop도 동일 허용 경로 부여 절차 사용.
- 상태: idle → reading → detecting → selecting(optional) → reviewing → committing → done. 각 단계 cancelled/error 경로와 재시도 대상 명시.
- 가져오기 진행 취소/파일 교체/암호·손상·지원하지 않는 파일/권한 오류/부분 인식 처리.
- PDF text 없음은 OCR 필요 안내. 외부 CDN/폰트 다운로드 없이 bundled 자산만 사용.
- 붙여넣기 TSV/이름을 동일 후보 검증으로 연결. 단일 셀 붙여넣기를 가로채지 않는다.
- 합격: 모든 샘플 예상 결과, 원본 폐기 finally 검증, 비대상 필드 미전달/미저장, 늦은 worker 응답 무시, 대용량/압축 폭탄 한도 거절.

### P05. 재가져오기·일괄 변경 — R06

예정 신규 `classroom/import/reconcile.rs`, `ImportChanges.svelte`.

- 기존 class snapshot과 후보 비교, 정확한 동일 학생만 자동 연결.
- 추가/수정/유지/명시 삭제 요약, 모호한 연결 선택, 연결 중복/번호 충돌 검사.
- 적용 중 명령 비활성화, operationId 유지, stale revision 시 재비교. 원본 파일을 다시 읽지 않고 정제 후보로 재비교.
- 합격: 같은 파일 두 번 가져오기 변화 0, 성별 없는 파일로 기존 성별 지워지지 않음, 개명/번호 변경 시 수동 ID 유지, 동명이인 병합 없음, 부분 commit 없음.

### P06. 모둠 CRUD·배정 — R07/R09

예정 신규 `GroupBoard/GroupCard/MemberPool/AssignMenu.svelte`.

- 빈 모둠 생성/일괄 생성/이름/순서/삭제, 미배정 pool과 인원 표시.
- 선택 배정/이동/해제 기본 구현 후 기존 svelte-dnd-action의 현재 Svelte 버전 호환을 검증하여 드래그를 보조 제공. 새 DnD 프레임워크 추가 금지.
- drag overlay는 임시 표현, drop commit 성공 후 확정. 실패 시 서버 snapshot으로 복귀하면서 선택 유지.
- 합격: 키보드만으로 배정, 마지막 구성원 이동, 모둠 삭제 undo 시 소속 복원, 학급 섞임 거절.

### P07. 자동 저장·종료·구독 정합성 — R08~R10/R13

- 셀별 500ms debounce + scope별 순차 queue. blur/Enter/전환/닫기에 flush. 입력 invalid는 queue에 넣지 않음.
- 초기 subscription 설치 후 snapshot 조회, 이후 이벤트 revision보다 낮은 응답 무시. focus 복귀 시 read. 같은 class 요청은 합치고 dispose 후 응답은 적용하지 않음.
- 창 close requested를 가로채 flush 후 close. 기존 destroy helper 사용 금지. 저장 중 버튼/창 닫기는 중복 실행 방지.
- 트레이 종료 등 앱 종료 경로에서 native quit coordinator가 명단 창에 flush 요청, pending write 완료 후 실제 종료. 응답 실패/invalid면 사용자 선택 필요 상태로 남김. OS 강제 종료에서는 미저장 초안 보장 없음.
- 도구 계약 검증용 개발 테스트 소비자 2개로 같은 반/다른 반/삭제/이벤트 누락 재조회 확인. 제품에 가짜 점수판 메뉴를 넣지 않는다.
- 합격: 늦은 응답이 최신 입력 덮어쓰지 않음, 저장 실패 상태와 재시도, 정상 종료 후 최신 확정 데이터 보존, 원래 타이머 종료 정책 유지.

### P08. 백업·복원·손상 복구 — R11/R12/R14

- JSON envelope: format=`tidy-classroom`, schemaVersion, exportedAt, classes/students/groups/memberships/defaultClassId. IDs와 관계 검사, 미지 필드 거절. DB operation log/undo/raw import/session 제외.
- 내보내기는 consistent read transaction으로 snapshot 획득 후 사용자 선택 파일에 안전히 쓰기. 파일명/경로 로그 금지. 원본 가져오기 자료 비보관과 사용자 요청 백업을 UI에서 구분.
- 복원 검사 단계에서 크기/버전/전체 참조/고유성 검증, 학급/학생 수 미리보기. 최종 확인 시 전역 revision을 검사하고 전체 대체 transaction.
- 복원은 기존 ID를 유지하되 현재 store revision보다 큰 revision으로 갱신, operation cache/undo 초기화, 모든 구독자 재조회. DB 손상 시 원본을 자동 덮어쓰지 않고 명시 복원으로만 교체. 진단 사본을 만들 경우 명시 보관 위치/삭제 안내.
- 합격: 내보내기→별도 테스트 프로필 복원 동등성, 깨진 참조·상위 버전·복원 도중 실패 시 기존 데이터 유지, 열린 도구 재연결/삭제 상태 정확.

### P09. 통합 검수·문서 — 모든 요구

- 아래 검증표 실행, 기존 타이머/메모/급식/툴킷 노출 회귀. 기본 사용자 자료는 테스트용으로 수정하지 않는다.
- `docs/QA-classroom-roster.md`에 명령 결과, 샘플 결과 수치만, OS/DPI/성능/미검증 사항 기록. 이름이 보이는 실샘플 캡처는 공개 산출물로 남기지 않는다.
- native 창을 실제 실행하지 않았다면 미완료 검수로 표시. 테스트용 브라우저 성공과 분리.
- 배포 build에 sample/student, fixture, source 문서 원본/전화/생일이 포함되지 않는지 검사. 신규 DB 파일·QA 실데이터가 Git에 들어가지 않게 확인.

## 5. 테스트 매트릭스와 명령

| 계층 | 핵심 검증 | 대상 단계 |
| --- | --- | --- |
| 순수 함수 | 정규화/한도/성별 미제공 구분/CSV/표 인식/재매칭 | P01/P04/P05 |
| Rust 임시 DB | CRUD/FK/번호 교환/revision/재시도/undo/복원 원자성 | P01/P05/P08 |
| 장애 주입 | commit 전후 실패, 응답 유실, event 실패, disk full/read-only, 잘못된 schema | P01/P07/P08 |
| UI 브라우저 | 빈 상태·입력·필터·미리보기·키보드·포커스・640/880/1040px | P03~P06 |
| 실제 native | 단일 창·핀·파일 대화상자·드롭·재시작·트레이 종료·동시 창 | P02/P04/P07 |
| 성능/자원 | 40/500명, 20회 분석, 취소 핸들/worker 해제, 파서 지연 로드 | P04/P09 |
| 제품 회귀 | 타이머 네 종류·툴바 가로/세로/접힘·메모·급식·기존 설정 | P09 |

시작 전 기준선과 종료 후 동일 범위를 비교한다:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check
cargo test --manifest-path src-tauri/Cargo.toml --lib toolkit::tests
cargo test --manifest-path src-tauri/Cargo.toml --lib classroom
git diff --check
```

`classroom` 테스트 명령은 P01 모듈 생성 후 사용. Node 테스트 glob이 중첩 신규 테스트를 실제 수집하는지 확인하고 누락 시 명시 경로/runner 설정으로 보완. 기존 전체 check 실패는 현재 baseline을 기록하고 신규 파일/변경 경로 진단 0을 별도로 확인한다. 이번 문서 작성에서 위 테스트가 통과했다고 주장하지 않는다.

## 6. 구현 완료를 판단하는 순서

1. P00에서 파서와 저장 기술의 실제 호환성을 확정한다.
2. P01~P03으로 학급/학생 CRUD와 재시작 보존을 완성한다.
3. P04~P05로 파일 가져오기와 기존 ID 보존을 완성한다.
4. P06~P08로 모둠·공유·종료·복원을 완성한다.
5. P09 검수 결과를 첨부하고 나서 다음 도구 단계로 넘어간다.

장래 확장은 새 도구가 repository/ID/삭제 트랜잭션 계약에 참여하는 방식으로 한다. 이번 단계에서 범용 플러그인 엔진이나 미래 도구의 빈 스키마를 만들지 않는다. 라이브러리 spike 또는 성능 결과로 설계 변경이 필요하면 해당 ADR과 PRD를 함께 갱신하고 조용히 구현 범위를 바꾸지 않는다.
