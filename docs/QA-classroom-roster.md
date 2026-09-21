# 학급 명단·모둠 구현 검증

검증일: 2026-09-21 · 대상: 현재 작업 폴더 · 커밋/배포/실사용 자료 변경 없음

## 구현한 기능

- 툴킷 끝의 학급 명단 버튼, 표시 설정, 단일 독립 창 역할, 구설정 1→2 정규화.
- 여러 학급 생성/조회/이름 변경/삭제/기본 학급 지정.
- 번호·이름·선택 성별 표 편집, Enter 연속 등록, 한글 조합 처리, 자동 저장, 검색/필터/정렬/선택 삭제.
- 모둠 생성/이름/순서/삭제, 여러 학생 배정/해제, 버튼 및 드래그 이동.
- XLSX/CSV/HWPX/텍스트 PDF 로컬 추출, 필요한 세 필드만 미리보기, 여러 표 선택, 명시 열 번호 지정, 이름/TSV 붙여넣기.
- 기존 학생 번호+이름 정확 매칭, 모호한 학생 수동 연결, 기존 학생 기본 유지, 명시 삭제, 성별 미제공 시 기존 값 유지.
- 전용 SQLite 저장, 불변 UUID, 관계/번호 검증, 전체 변경 트랜잭션, revision 충돌 거절, operation ID 재전송 방지, 최대 20회 세션 실행 취소.
- JSON 백업 내보내기/복원, 손상 파일의 명시 복원 시 원본 보존, 정상 창 닫기/트레이 종료 저장 응답 연결.
- 후속 도구용 고정 학급 context 및 뽑기 후보 snapshot API. 뽑기·점수판 제품 화면 자체는 이번 범위가 아님.

## 실행 결과

| 검사 | 결과 |
| --- | --- |
| 변경 전 `npm.cmd test` | 170/170 통과 |
| 변경 후 `npm.cmd test` | 176/176 통과 |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib classroom` | 16/16 통과 |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib toolkit::tests` | 4/4 통과 |
| `cargo build --manifest-path src-tauri/Cargo.toml --lib` | 성공 |
| `npm.cmd run build` | 성공. RosterApp과 PDF 파서가 별도 청크로 분리됨 |
| `npm.cmd run check` | 전체 실패: 887 errors / 14 warnings / 39 files. 신규 classroom JS/Svelte 파일 진단 0 |
| `git diff --check` | 통과. 기존 파일 LF/CRLF 경고는 별개 |
| 브라우저 자동화 | 학급/학생 CRUD, 잘못된 이름 방어, 편집 초점 유지, 모둠 배정·드래그, 붙여넣기, 삭제 취소, JSON 내보내기/복원, 학급 context, 640/880/1040px 통과 |

전체 타입 검사는 저장소 기존 오류와 병행 추가된 플랫폼 도구 타입 오류를 포함한다. 이 기능을 이유로 무관한 전체 코드의 타입을 수정하지 않았다. 기존 타이머·아이콘·음원·외부 서비스 버튼 변경을 보존했다.

브라우저 테스트: `output/qa/classroom/browser-check.mjs`. 포트 5185에서 HMR을 끈 개발 서버 사용. 생성한 백업 파일을 Vite가 감시하여 테스트 세션을 다시 여는 현상이 있었으므로 `output`, `src-tauri`, `.local-fixtures` 감시를 제외한 별도 QA 설정을 사용했다. 이 문제를 앱의 실제 데이터 유실로 간주하지 않는다. preview 저장소는 세션 한정이며 네이티브 DB 테스트와 분리한다.

## 원본 샘플 검증

원본 네 파일은 SHA-256 동일성을 확인하면서 `public/sample/student`에서 `.local-fixtures/student`로 이동했다. `.local-fixtures`는 Git 제외. 원본을 삭제하지 않았고 빌드의 `dist/sample/student`에 원본 파일이 없음을 확인했다.

| 샘플 | 실제 사용 파서 검사 |
| --- | --- |
| PDF | PDF.js 브라우저 파서: 21명, 7번 결번 보존. PDF 회전 좌표 보정 후 통과 |
| XLSX 성별 있음 | Rust calamine: 21명 |
| XLSX 성별 없음 | Rust calamine: 21명, 성별 미제공 |
| HWPX | Rust ZIP/XML: 20명, 빈 21·22번/집계 제외 |

Rust 합성 테스트는 CSV 인용부호, CP949, 알 수 없는 성별, 다학급 분리, 직접 열 지정, 비대상 필드 비포함도 검사한다. 실샘플 학생 이름/생일/연락처는 공개 테스트 fixture나 QA 캡처에 복사하지 않았다. 화면 캡처와 백업 테스트는 가명만 사용한다.

## 데이터 검증 세부

- 번호 교환 시 학생 ID 보존, 동명이인 유지.
- 중복 번호 일괄 입력 전체 롤백, 저장 실패 시 이전 데이터/undo 이력 보존.
- 같은 operation ID 재시도 시 추가 변경 없음.
- 모둠 삭제 시 학생 보존, 실행 취소 시 소속 복원.
- 다른 학급 학생을 배정하는 명령 거절.
- 학급 삭제/복원, 기본 학급 해제/undo, 디스크 파일 닫기/다시 열기 동등성.
- 백업의 깨진 참조 거절, 손상 DB 명시 복원 시 별도 recovery 파일에 손상 원본 보존.
- 같은 명단 재반영 시 변화가 없으면 revision/undo 증가 없음.
- 열린 도구 context는 기본 학급 변경을 따라가지 않으며, 대상 학급 삭제 시 deleted 상태.

## 계획을 구현하면서 구체화한 사항

- 초기 소비자는 명단 편집창 하나다. Rust mutex + blocking task로 DB 접근을 직렬화하고 전역 revision을 최종 충돌 기준으로 사용한다. 학급별 revision은 실제 변경된 학급만 갱신하고 DB 학생/모둠 쓰기도 변경된 학급에 한정한다. 관리자 snapshot 조회는 현재 전체 학급을 반환한다. 다수 도구의 대량 조회 시 필요해지면 repository 계약 안에서 학급별 조회를 추가할 수 있다.
- memberships 별도 테이블 대신 학생의 nullable group_id와 (class_id,group_id) 복합 외래키를 사용한다. 학생당 한 모둠이라는 확정 범위를 직접 강제한다. 미래 점수 테이블은 만들지 않았다.
- undo는 검증된 저장소 전체 이전 snapshot을 메모리에 최대 20개만 유지한다. 영구 변경 로그/원본 사본은 저장하지 않는다.
- 모둠 드래그는 HTML 드래그 이벤트로 동일 배정 명령을 호출한다. 키보드 접근 가능한 선택/배정 버튼이 주 조작이다. 별도 DnD 라이브러리를 늘리지 않았다.
- 열 자동 인식이 불가능한 파일은 열 번호/학생 시작 행을 지정한 뒤 파일을 다시 선택하도록 한다. 버린 원본을 임의로 보관해서 다시 읽지 않는다.
- 수식이 있는 XLSX는 값만 저장한 파일로 안내한다. 암호 파일/중첩 HWPX 표/이미지 PDF OCR/구형 HWP·XLS는 지원 범위를 넘어 명확한 오류로 안내한다. 모든 임의 양식의 무오류 자동 인식을 주장하지 않는다.

## 의존성 확인

현재 설치 Rust 1.94.1로 native 테스트/빌드 성공. 별도 툴체인 업그레이드는 수행하지 않았다. `Cargo.toml`의 기존 rust-version 1.77.2를 실제 최소 지원 버전으로 검증한 것은 아니다. 현재 lockfile의 uuid 1.23.0은 MSRV 1.85, encoding_rs 0.8.41은 MSRV 1.88을 표기한다.

확인한 직접 의존성: pdfjs-dist 5.4.624 (Apache-2.0), rusqlite 0.32.1 (MIT), calamine 0.26.1 (MIT), zip 2.4.2 (MIT), quick-xml 0.37.5 (MIT), csv 1.4.0 (Unlicense/MIT), encoding_rs 0.8.41 ((Apache-2.0 OR MIT) AND BSD-3-Clause), uuid 1.23.0 (Apache-2.0 OR MIT), unicode-normalization 0.1.25 (MIT OR Apache-2.0). 설치 버전은 lockfile로 고정된다.

`npm audit`는 기존 devalue/DOMPurify/nanoid/PostCSS 경로에서 4건을 보고했다. 새 PDF.js 경로의 보고는 없었다. 무관한 라이브러리 일괄 업그레이드는 수행하지 않았다.

## 남아 있는 실기기 검수와 한계

- 실제 Tauri UI에서 단일 창 재사용, 항상 위, 작업표시줄, 혼합 DPI/모니터 경계, OS 파일 드롭, 트레이 종료 응답의 수동 확인은 미실행. Rust 명령/저장 테스트 및 브라우저 UI 검증과 구분한다.
- 현재 실행 중인 기존 `tidy_task.exe`를 종료하거나 덮어쓰지 않았다. 새 Rust 명령을 사용하려면 개발 앱을 정상 종료한 뒤 재실행/재빌드해야 한다.
- release 설치 패키지 생성, macOS 실기기 검증, 저사양 기기 p95 성능 및 장시간 메모리 측정은 하지 않았다. PRD 성능 수치는 측정 결과가 아니라 목표다.
- 파서 취소는 중간 검사 지점에서 처리한다. 외부 라이브러리 내부의 동기 구간은 종료될 때까지 즉시 중단되지 않을 수 있다. 최대 원본/압축/표 범위 제한으로 처리량을 제한한다.
- 원본 자원 해제는 객체/파일 핸들/worker 정리이며 OS 메모리의 물리적 완전 삭제나 디스크 보안 소거를 보장하지 않는다.

## 관련 문서

[PRD](PRD-classroom-roster.md) · [상세 계획](PLAN-classroom-roster.md)
