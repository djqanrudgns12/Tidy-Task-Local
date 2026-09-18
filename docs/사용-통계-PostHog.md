# Tidy Task 사용 통계 (PostHog)

앱 데이터는 계속 로컬에 저장합니다. 배포 빌드는 더 나은 프로그램과 안정적인 업데이트를 위해 제한된 익명 사용 이벤트를 자동으로 PostHog에 전송합니다. 계정 로그인, 메모 동기화, 화면 녹화, 자동 클릭 수집은 도입하지 않습니다.

## 처음 사용하는 분께

PostHog는 앱이 보내는 작은 활동 기록을 모아 그래프로 보여 주는 서비스입니다. 예를 들어 할 일을 하나 추가하면 `todo_created`라는 기록을 보냅니다. 할 일의 내용은 보내지 않습니다. 이미 앱에 전송 로직이 있으므로 웹사이트용 JavaScript 코드를 추가하거나 SDK를 다시 설치할 필요가 없습니다.

세 가지만 구분하면 됩니다.

- **이벤트**: 한 번의 활동 기록. 한 설치본에서 100번 조작하면 여러 이벤트가 생깁니다.
- **고유 이용자(Unique users)**: 같은 설치 ID는 선택한 기간에 한 번만 셉니다. 이 앱에서는 사람 수가 아니라 관측된 설치본 수입니다.
- **프로젝트 토큰(Project token)**: 어느 PostHog 프로젝트로 보낼지 정하는 공개 수집용 값입니다. 개인 API 키와 다릅니다.

한 사람이 PC 두 대를 쓰면 두 설치본입니다. 여러 사람이 같은 설치본을 쓰면 하나입니다. 통계 기능이 없는 구버전과 장기 오프라인 사용은 포함되지 않을 수 있습니다. 따라서 차트 이름도 ‘전체 이용자’보다는 **‘활성 설치 수’**로 붙이는 것이 정확합니다.

## 연결하기

1. [PostHog](https://app.posthog.com)에서 계정과 프로젝트를 만듭니다. 처음에는 운영용 `Tidy Task`와 개발 확인용 `Tidy Task Test` 두 프로젝트를 구분해 두면 편합니다. EU 프로젝트는 [EU PostHog](https://eu.posthog.com)을 사용합니다.
2. 프로젝트 설정에서 **공개 Project token**을 확인합니다. `phc_…` 또는 `ph_project_…` 형식입니다. 개인 API 키나 secret key는 앱에 넣지 않습니다.
3. `src-tauri/.env`에 다음 값을 추가합니다. 파일이 없다면 같은 폴더의 `.env.example`을 복사해 `.env`로 이름을 바꿉니다. 기존 NEIS 설정을 보존합니다. 예시 문구 대신 실제 토큰을 넣으세요.

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

처음 확인할 때는 테스트 프로젝트의 토큰과 `POSTHOG_DEV_ENABLED=1`을 저장한 다음 프로젝트 폴더에서 `npm.cmd run tauri dev`를 실행합니다. `npm.cmd run dev`만 실행한 웹 브라우저 미리보기에서는 통계를 보내지 않습니다. 토큰을 바꿨다면 실행 중인 개발 앱을 완전히 종료하고 다시 실행하세요.

배포할 때는 운영 프로젝트 토큰과 `POSTHOG_DEV_ENABLED=0`으로 바꾸고 위의 `tauri build`를 실행합니다. 만들어진 설치 파일은 `src-tauri/target/release/bundle/nsis` 또는 `msi` 폴더에서 확인합니다. 기존 설치 파일에는 설정 변경이 반영되지 않습니다. NEIS 키가 없는 배포 빌드는 별도 빌드 규칙에 따라 실패하므로 기존 급식 API 설정을 지우지 마세요.

## 자동 집계 방식

- 연결된 배포 빌드는 앱 시작부터 자동으로 집계합니다. 참여 팝업과 시스템 설정의 참여·중지 버튼은 없습니다.
- 기능 설명 창에서 수집 목적과 수집·제외 항목을 안내합니다.
- 주 설정 파일과 분리된 `tidy-task-analytics.json`을 앱 데이터 폴더에 저장합니다. 개발 빌드는 `tidy-task-analytics-test.json`을 사용해 ID와 전송 대기열을 분리합니다. 메모 백업/복구에 통계 ID를 섞지 않습니다.
- 프로젝트 토큰이나 지역을 바꾸면 새 ID로 시작합니다. 이전 프로젝트의 대기 이벤트는 새 프로젝트에 보내지 않습니다. 목적지가 저장되지 않은 구버전 파일을 처음 읽을 때는 ID를 유지하되, 목적지를 검증할 수 없는 기존 대기 이벤트를 한 번 비웁니다.
- 이전 버전에서 통계 참여를 중지했던 로컬 설정은 5.1.2부터 더 이상 사용하지 않으며, 5.1.2 배포 빌드에서는 자동 집계를 시작합니다.

## 첫 번째 이용자 그래프 만들기

1. 연결된 빌드를 실행하고 할 일 추가나 메모 입력을 한 번 해 보세요.
2. PostHog의 **Activity / Live events**에서 `app_started`, `active_minute`, `todo_created` 등을 찾습니다. 정상 연결에서는 전송이 보통 15초 단위이며 서버 처리·화면 갱신 시간이 더 걸릴 수 있습니다.
3. 이벤트 하나를 열고 `distinct_id`, `environment`, `app_version`을 확인합니다. 창을 여러 개 사용해도 `distinct_id`는 같아야 합니다.
4. **Product analytics → New insight → Trends**에서 이벤트로 `active_minute`를 선택합니다. 화면 버전에 따라 메뉴 표현은 조금 다를 수 있습니다.
5. 집계 방식을 **Unique users**로 고릅니다. **Total count**로 두면 이용자 수 대신 활동 이벤트 수가 나옵니다.
6. 테스트 확인 중에는 `environment = test`, 실제 배포 통계에서는 `environment = production` 필터를 추가합니다.
7. 기간은 최근 7일, 표시 간격은 일별로 선택합니다. 한국 날짜 기준으로 보려면 프로젝트 보고 시간대를 `Asia/Seoul`로 맞춥니다.
8. ‘일별 활성 설치 수’라는 이름으로 저장하고 대시보드에 추가합니다.

예: 오늘 같은 PC에서 창 3개를 열고 할 일을 20개 추가해도 일별 고유 이용자는 1입니다. 다른 PC에서도 사용하면 2입니다. 주간·월간 이용자는 일별 수치를 더하지 말고, 해당 기간의 고유 이용자로 집계하세요.

추가로 `todo_created`의 `count` 속성을 합산하면 만든 할 일 개수를 볼 수 있습니다. 여러 할 일을 한 번에 추가하는 기능은 이벤트 1건에 `count=추가한 개수`로 기록하므로 이벤트 총건수와 항목 개수는 다릅니다. 익명 이벤트 방식이므로 Persons 목록 개수를 이용자 지표로 사용하지 마세요.

이벤트가 안 보이면 순서대로 확인하세요: 토큰·US/EU 주소·개발 허용 값 → 설정 변경 후 앱 재빌드 여부 → PostHog에서 올바른 프로젝트·기간·환경 필터를 보고 있는지 → 앱을 실제로 조작했는지 → 네트워크 연결 여부.

## 대시보드 권장 구성

모든 차트에서 `environment = production`을 필터링합니다. 이용자 수는 **Unique users(distinct_id)**를 선택해야 합니다. 이벤트 총합은 이용자 수가 아닙니다.

| 차트 | 이벤트 / 집계 | 해석 |
|---|---|---|
| 일·주·월 활성 설치 수 | `active_minute` / Unique users / 일·주·월 | 실제 입력이 관측된 설치본 수 |
| 처음 관측된 설치 수 | `installation_first_seen` / Unique users | 설치일이 아닌 첫 통계 관측 시점 |
| 7일·30일 재방문 | 시작 `installation_first_seen`, 재방문 `active_minute` / Retention | 관측된 설치본의 재사용 |
| 기능별 이용 비율 | `window_used` / Unique users / `window_kind`로 분류 | Tidy Task, Tiny Note, 급식, 설정, 아카이브 등 |
| 세션 수 | `session_started` / Total count | 프로세스 시작 후 첫 사용 또는 30분 비활동 후 사용 |
| 활동이 관측된 분 | `active_minute` / Total count | 조작이 발생한 분의 근사치. 연속 체류 시간 아님 |
| 버전 사용 분포 | `active_minute` / Unique users / `app_version`로 분류 | 기간 중 여러 버전을 쓴 설치본은 각 버전에 포함 |
| 기능 사용량 | 아래 기능 이벤트 / Total count 또는 `count` 합계 | 이벤트 횟수와 항목 개수를 구분 |
| 오류 영향 설치 수 | `app_error` / Unique users / `error_code`로 분류 | 오류 원문·경로 없이 영향 범위 관측 |
| 초기 사용 전환 | `installation_first_seen` → `window_used` → `todo_created` / Funnel | 참여 후 기능 사용 전환 |

`app_active`는 **UTC 날짜당 한 번** 보조 이벤트입니다. 한국 시간 등 임의 시간대의 DAU 차트에는 `active_minute`를 사용하세요. 앱을 켜 두기만 하면 실제 활동으로 잡지 않습니다. 포인터 클릭·키보드 입력·입력 변경·스크롤을 관측하되 키 값과 대상 요소는 읽거나 보내지 않습니다. 같은 분의 15초 내 연속 입력은 합치지만 새 분의 첫 입력은 즉시 반영합니다. 읽기만 하는 시간은 활동으로 측정되지 않습니다.

## 이벤트 사전

공통 속성: 무작위 `distinct_id`, `app_version`, `os`, `arch`, `environment`, `schema_version`, 발생 `timestamp`, 재전송 중복 제거용 `uuid`. 실제 사용 이후 이벤트에는 세션 ID가 포함됩니다. 창 이름의 일련번호 대신 `window_kind`만 보냅니다.

| 이벤트 | 발생 기준 / 추가 속성 |
|---|---|
| `installation_first_seen` | 설치 ID 최초 생성 |
| `app_version_seen` | 해당 설치본에서 현재 버전을 처음 관측 |
| `app_started` | 앱 프로세스 시작. 창 개수와 무관 |
| `session_started` | 첫 실제 사용 또는 30분 비활동 이후 사용 |
| `app_active` | UTC 날짜별 실제 사용 1회 |
| `active_minute` | 앱 전체에서 UTC 분별 실제 사용 1회. 재시작해도 같은 분은 중복 생성하지 않음 |
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
- 앱 데이터 삭제·다른 PC 이용은 새로운 설치본입니다. 통계 기능이 없는 구버전·장기 오프라인 이용자는 누락될 수 있습니다. 사람 수/실제 설치 총수를 정확히 식별하는 구조가 아닙니다.
- 토큰은 수집용 공개 값입니다. 배포 클라이언트 기반 통계는 조작 방지나 과금 근거가 될 수 없습니다.

## 연결 후 실제 확인

1. 별도 테스트 프로젝트와 `POSTHOG_DEV_ENABLED=1`로 개발 빌드를 실행합니다.
2. 실행 후 15초 이상 기다려 PostHog Live events에서 `installation_first_seen`과 `app_started`를 확인합니다.
3. Tidy Task·Tiny Note·급식 창을 각각 조작하고 같은 `distinct_id`, 세션과 다른 `window_kind`를 확인합니다.
4. 할 일 추가/완료·메모 편집·급식 복사 후 이벤트와 속성을 확인합니다. 본문이나 학교 정보가 없어야 합니다.
5. 오프라인에서 작업 후 재연결하여 원래 발생 시각으로 전송되는지 확인합니다.
6. 토큰이 없거나 허용되지 않은 호스트일 때 이벤트가 생기지 않는지 확인합니다.
7. 배포 프로젝트 토큰과 `POSTHOG_DEV_ENABLED=0`으로 재빌드합니다. 대시보드에 `environment=production` 필터를 설정합니다.

실제 PostHog 프로젝트 연결 후에는 위 순서로 서버 수신과 그래프를 확인해야 합니다. 로컬 테스트와 빌드 성공만으로 실제 프로젝트의 토큰·수신·대시보드 설정까지 검증되는 것은 아닙니다.

## 2026-09-18 점검 결과

후속 연결 확인: 사용자가 제공한 정확한 Project token을 적용한 개발 앱에서 실제 `installation_first_seen`, `app_started`, `active_minute`, `todo_created` 등이 PostHog Activity에 표시되는 것을 캡처로 확인했습니다. 최초 테스트에서는 토큰 전사 오류가 있었으며 이를 수정했습니다. HTTP 성공 응답이나 대기열 0건만으로 프로젝트에서의 수신 완료를 단정하지 않고, Activity에서 해당 이벤트가 보이는 것으로 최종 확인합니다.

배포 준비: 로컬 `.env`의 개발 전송 옵션은 `POSTHOG_DEV_ENABLED=0`으로 복구합니다. release 설치 파일은 자동으로 `environment=production`을 붙여 전송합니다. 현재 개발 이벤트만 있는 프로젝트에서 운영 필터를 적용하면 배포본 수신 전까지 그래프가 비는 것이 정상입니다.

- 수정: 분 경계의 첫 입력 누락 방지, 재시작 시 같은 분 활동 중복 방지, 개발·운영 저장 파일 분리, 프로젝트 변경 시 이전 대기열 전송 차단.
- 통계 엔진 Rust 테스트 12개 통과. 로컬 HTTP 서버에 실제 batch 요청을 보내 형식과 ID·시각·속성을 검증한 테스트 포함.
- JavaScript 테스트 147개와 프런트 빌드 통과. 통계 JavaScript 파일 별도 타입 검사 통과.
- 전체 정적 검사: 기존 `output/analytics-check-before.txt`와 동일하게 오류 873개·경고 14개. 이번 변경으로 오류·경고 수가 늘지는 않았지만, 전체 프로젝트가 정적 검사까지 통과한 상태는 아님.
- 점검 환경에는 `src-tauri/.env`와 PostHog 환경변수 설정이 없어 실제 PostHog 프로젝트 수신은 확인하지 않음. 설치 파일 재빌드·배포는 수행하지 않음.

공식 참고: [Capture API](https://posthog.com/docs/api/capture) · [Trends](https://posthog.com/docs/product-analytics/trends/overview) · [익명 이벤트](https://posthog.com/docs/data/anonymous-vs-identified-events) · [Retention](https://posthog.com/docs/product-analytics/retention)
