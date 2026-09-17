# Tidy Task 사용 통계 (PostHog)

앱 데이터는 계속 로컬에 저장합니다. 사용 통계에 참여한 설치본만 제한된 이벤트를 PostHog로 전송합니다. 계정 로그인, 메모 동기화, 화면 녹화, 자동 클릭 수집은 도입하지 않습니다.

## 연결하기

1. https://app.posthog.com 에서 계정과 프로젝트를 만듭니다. EU 프로젝트는 https://eu.posthog.com 을 사용합니다.
2. 프로젝트 설정에서 **공개 Project token**을 확인합니다. `phc_…` 또는 `ph_project_…` 형식입니다. 개인 API 키나 secret key는 앱에 넣지 않습니다.
3. `src-tauri/.env`에 다음 값을 추가합니다. 기존 NEIS 설정을 보존합니다.

```dotenv
POSTHOG_PROJECT_TOKEN=프로젝트의_공개_토큰
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_DEV_ENABLED=0
```

EU 프로젝트라면 `POSTHOG_HOST=https://eu.i.posthog.com`을 사용합니다. 값은 **Rust 빌드 시점**에 포함되므로 변경 후 설치 파일을 다시 빌드해야 합니다. 프런트 Vite 빌드만으로 반영되지 않습니다.

```powershell
npm.cmd run tauri build
```

토큰이 비어 있거나 지역 주소가 허용된 주소가 아니면 수집을 시작하지 않습니다. 개발 빌드는 기본적으로 꺼져 있습니다. 개발 검증은 별도 테스트 프로젝트와 `POSTHOG_DEV_ENABLED=1`을 사용하세요. 개발 빌드 이벤트에는 `environment=test`가 붙습니다.

## 이용자 선택

- 연결된 배포 빌드의 메인 창에 통계 참여 안내가 나타납니다. 기본 상태는 미동의이며 기록·전송하지 않습니다.
- 설정 → 사용 통계에서 참여/중지와 연결 상태, 대기 건수, 마지막 전송 시각을 확인합니다.
- 중지하면 새 수집을 차단하고 로컬 대기열과 설치 ID를 지웁니다. 이미 전송됐거나 전송 중인 요청은 되돌릴 수 없습니다. 재참여하면 새로운 설치 ID를 만듭니다.
- 주 설정 파일과 분리된 `tidy-task-analytics.json`을 앱 데이터 폴더에 저장합니다. 메모 백업/복구에 통계 ID를 섞지 않습니다.

## 대시보드 권장 구성

모든 차트에서 `environment = production`을 필터링합니다. 이용자 수는 **Unique users(distinct_id)**를 선택해야 합니다. 이벤트 총합은 이용자 수가 아닙니다.

| 차트 | 이벤트 / 집계 | 해석 |
|---|---|---|
| 일·주·월 활성 설치 수 | `active_minute` / Unique users / 일·주·월 | 실제 입력이 관측된 설치본 수 |
| 처음 관측된 설치 수 | `installation_first_seen` / Unique users | 설치일이 아닌 첫 수집 참여 시점 |
| 7일·30일 재방문 | 시작 `installation_first_seen`, 재방문 `active_minute` / Retention | 참여 설치본의 재사용 |
| 기능별 이용 비율 | `window_used` / Unique users / `window_kind`로 분류 | Tidy Task, Tiny Note, 급식, 설정, 아카이브 등 |
| 세션 수 | `session_started` / Total count | 프로세스 시작 후 첫 사용 또는 30분 비활동 후 사용 |
| 활동이 관측된 분 | `active_minute` / Total count | 조작이 발생한 분의 근사치. 연속 체류 시간 아님 |
| 버전 사용 분포 | `active_minute` / Unique users / `app_version`로 분류 | 기간 중 여러 버전을 쓴 설치본은 각 버전에 포함 |
| 기능 사용량 | 아래 기능 이벤트 / Total count 또는 `count` 합계 | 이벤트 횟수와 항목 개수를 구분 |
| 오류 영향 설치 수 | `app_error` / Unique users / `error_code`로 분류 | 오류 원문·경로 없이 영향 범위 관측 |
| 초기 사용 전환 | `installation_first_seen` → `window_used` → `todo_created` / Funnel | 참여 후 기능 사용 전환 |

`app_active`는 **UTC 날짜당 한 번** 보조 이벤트입니다. 한국 시간 등 임의 시간대의 DAU 차트에는 `active_minute`를 사용하세요. 앱을 켜 두기만 하면 실제 활동으로 잡지 않습니다. 포인터 클릭·키보드 입력·입력 변경·스크롤을 관측하되 키 값과 대상 요소는 읽거나 보내지 않습니다. 15초 내 연속 입력은 합치므로 분 경계에는 소량의 누락이 생길 수 있습니다.

## 이벤트 사전

공통 속성: 무작위 `distinct_id`, `app_version`, `os`, `arch`, `environment`, `schema_version`, 발생 `timestamp`, 재전송 중복 제거용 `uuid`. 실제 사용 이후 이벤트에는 세션 ID가 포함됩니다. 창 이름의 일련번호 대신 `window_kind`만 보냅니다.

| 이벤트 | 발생 기준 / 추가 속성 |
|---|---|
| `installation_first_seen` | 참여 후 설치 ID 최초 생성 |
| `app_version_seen` | 해당 설치본에서 현재 버전을 처음 관측 |
| `app_started` | 참여 중인 앱 프로세스 시작. 창 개수와 무관 |
| `session_started` | 첫 실제 사용 또는 30분 비활동 이후 사용 |
| `app_active` | UTC 날짜별 실제 사용 1회 |
| `active_minute` | 앱 전체에서 UTC 분별 실제 사용 1회 (프로세스 재시작 경계는 예외) |
| `window_used` | 세션별 창 종류를 처음 사용 |
| `todo_created` | 단일·여러 할 일 추가 / `count` |
| `todo_completed` | 단일 할 일 완료 / `count` |
| `todo_restored` | 단일 완료 항목 복원 / `count` |
| `todo_deleted` | 활성 할 일 단일 삭제 / `count` |
| `todos_archived` | 선택 항목 일괄 완료 / `count` |
| `todos_imported` | TXT 가져오기로 적용한 활성·완료 항목 / `count` |
| `note_edited` | 메모 편집, 창별 최대 1분에 1회 |
| `note_archived` | Tiny Note 아카이브 저장 성공 |
| `meal_navigated` | 급식 이전/다음 날짜 탐색 |
| `meal_copied` | 급식 메뉴 클립보드 복사 성공 |
| `settings_applied` | 설정 적용 요청 전달 |
| `theme_changed` | 설정 적용 때 기존과 다른 내장 테마 선택 / 허용된 `theme` |
| `update_download_opened` | 업데이트 다운로드 URL 열기 성공. 설치 완료 지표 아님 |
| `app_error` | 정해진 오류 코드만, 코드별 창별 1분 제한 |

할 일 이벤트는 앱 상태에 반영한 동작 기준이며 디스크 저장 성공을 보증하지 않습니다. 저장 실패는 별도 `storage_write` 오류로 관측합니다. 전체 클릭/전체 기능의 자동 수집이 아니므로 위 목록에 없는 동작은 집계되지 않습니다.

오류 코드: `frontend_error`, `unhandled_rejection`, `storage_write`, `meal_load`, `meal_copy`, `archive_write`. 네이티브 프로세스 충돌 보고 시스템은 아닙니다.

## 전송과 데이터 범위

- 모든 창이 Rust의 단일 설치 ID·세션·대기열을 공유합니다. 자동 실행만으로 활성 이용자/세션을 만들지 않습니다.
- 이벤트와 원래 시각·UUID를 디스크에 보관하고 15초 간격으로 최대 50건씩 HTTPS로 보냅니다. 실패하면 최대 15분까지 지수 백오프하며 동일 UUID로 재전송합니다. 앱 종료를 막지 않고 다음 실행 때 이어 보냅니다.
- 대기열은 최대 1,000건, 최대 7일입니다. 초과·만료 데이터는 버리므로 장기 오프라인 통계는 완전하지 않습니다.
- PostHog의 공식 batch API를 사용합니다. 브라우저 SDK의 자동 수집/세션 녹화는 사용하지 않습니다. 프로필 생성과 GeoIP enrichment를 비활성화하고 IP 속성은 `0.0.0.0`으로 지정합니다. 네트워크 수신 서버에는 연결 IP가 보일 수 있으므로 완전한 익명성을 주장하지 않습니다.
- Rust에서 이벤트 이름·속성 값을 허용 목록으로 검증합니다. 메모·할 일 원문, 제목, 학교명/코드, 알레르기 선택, 파일 경로, 오류 원문, 키보드 입력 내용은 보내지 않습니다.
- 설치 ID 삭제·재참여·다른 PC 이용은 새로운 설치본입니다. 미참여·구버전·장기 오프라인 이용자는 누락됩니다. 사람 수/실제 설치 총수를 정확히 식별하는 구조가 아닙니다.
- 토큰은 수집용 공개 값입니다. 배포 클라이언트 기반 통계는 조작 방지나 과금 근거가 될 수 없습니다.

## 연결 후 실제 확인

1. 별도 테스트 프로젝트로 개발 빌드를 실행하고, 참여 전 PostHog로 요청이 없는지 확인합니다.
2. 참여 후 15초 이상 기다려 PostHog Live events에서 `installation_first_seen`과 `app_started`를 확인합니다.
3. Tidy Task·Tiny Note·급식 창을 각각 조작하고 같은 `distinct_id`, 세션과 다른 `window_kind`를 확인합니다.
4. 할 일 추가/완료·메모 편집·급식 복사 후 이벤트와 속성을 확인합니다. 본문이나 학교 정보가 없어야 합니다.
5. 오프라인에서 작업 후 재연결하여 원래 발생 시각으로 전송되는지 확인합니다.
6. 참여 중지 후 새 이벤트가 생기지 않고 대기열이 비는지 확인합니다.
7. 배포 프로젝트 토큰과 `POSTHOG_DEV_ENABLED=0`으로 재빌드합니다. 대시보드에 `environment=production` 필터를 설정합니다.

이번 구현 검증: 로컬 Rust 테스트/JS 테스트/프런트 빌드. PostHog 프로젝트가 아직 없어 실제 수신과 대시보드 생성은 별도 확인이 필요합니다.

공식 참고: https://posthog.com/docs/api/capture · https://posthog.com/docs/product-analytics/retention
