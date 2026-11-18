# Tidy Task 개인정보처리방침

> 시행일: 【게시일 입력, 예: 2026년 10월 ○일】 · 적용 버전: Tidy Task 5.6.3 이상
> 게시 위치: Microsoft Store 등록정보의 "개인정보처리방침 URL"에 이 문서를 게시한 주소를 입력합니다.

Tidy Task(이하 "앱")는 Windows PC에서 실행되는 교사용 메모·교실 도구 프로그램입니다. 개발자 찰떡쌤(이하 "개발자")은 앱을 이용하는 분의 정보를 소중히 여기며, 앱이 어떤 정보를 다루는지 아래와 같이 알려 드립니다.

## 1. 핵심 요약

- **회원가입·로그인이 없습니다.** 이름, 이메일, 전화번호 등을 요구하지 않습니다.
- **메모·할 일·학생 명단·투표·자리 배치 등 모든 작성 자료는 이용자의 PC에만 저장됩니다.** 개발자 서버로 올라가지 않습니다.
- 앱 개선을 위해 **무작위 설치 ID와 기능 사용 통계**를 보냅니다. 메모 내용, 학생 이름, 투표 내용·결과, 학교명은 보내지 않습니다.

## 2. 이용자 PC에만 저장되는 정보

다음 자료는 앱이 설치된 PC의 사용자 데이터 폴더(`%APPDATA%\com.tidy.task` 등)에 저장되며, 개발자는 이 자료에 접근할 수 없습니다.

- 메모, 할 일, 마감일, Tiny Note, 아카이브
- 학급 명단(번호·이름·선택 입력한 성별), 모둠 구성
- 알림장, 점수판, 학급 온도계, 토너먼트, 자리 배치 기록
- 학급 투표의 설정·표·결과
- 등록한 학교 정보와 조회한 급식 식단, 앱 설정

학급 명단을 파일(PDF·XLSX·CSV·HWPX)에서 가져올 때 앱은 번호·이름·성별만 읽어 저장하며, 원본 파일의 사본을 보관하지 않습니다.
앱을 제거해도 다시 설치했을 때 복원할 수 있도록 자료는 PC에 남겨 둡니다. 자료를 지우려면 앱의 **설정 → 데이터 초기화**를 사용하거나, 앱을 제거한 뒤 위 폴더를 직접 삭제하면 됩니다.

## 3. 자동으로 전송되는 사용 통계

앱 품질 개선과 어떤 기능이 많이 쓰이는지 파악하기 위해, 다음 정보를 미국 소재 분석 서비스 **PostHog**(PostHog Inc.)로 HTTPS를 통해 보냅니다.

| 보내는 정보 | 예시 |
| --- | --- |
| 설치별 무작위 ID | 앱이 처음 실행될 때 만든 임의의 값(이름·기기 정보와 무관) |
| 앱·환경 정보 | 앱 버전, 운영체제 종류·버전, CPU 구조(x64) |
| 기능 사용 기록 | 어떤 창·도구를 열었는지, 할 일 추가 같은 동작의 횟수와 시각 |
| 오류 종류 | 업데이트 실패 등의 미리 정해진 오류 코드(오류 원문 제외) |

**보내지 않는 정보:** 메모·할 일 본문, 창 제목, 학생 이름, 투표 제목·후보·결과, 학교명·학교 코드, 알레르기 선택, 파일 경로, 키보드 입력 내용, 화면 녹화.

- 위치 추정(GeoIP)과 사용자 프로필 생성을 끄고, IP 주소 속성은 `0.0.0.0`으로 덮어써 보냅니다. 다만 인터넷 통신의 특성상 수신 서버가 접속 IP를 일시적으로 볼 수 있으므로 완전한 익명성을 보장한다고 말하지는 않습니다.
- 인터넷이 끊겨 있으면 최대 1,000건·7일까지 PC에 보관했다가 나중에 보내며, 기한이 지나면 버립니다.
- 앱의 **기능 설명 → 사용 통계 안내**에서도 같은 내용을 확인할 수 있습니다.
- 현재 앱 안에서 통계 전송을 끄는 설정은 제공하지 않습니다. 원하지 않으시면 아래 연락처로 알려 주세요. 해당 설치 ID의 기록 삭제를 도와드립니다.

## 4. 기능 사용 시 이루어지는 통신

다음 기능은 이용자가 사용할 때 외부 서버와 통신합니다. 이 통신에는 위 3절의 사용 통계나 개인 자료가 포함되지 않습니다.

| 기능 | 통신 대상 | 보내는 내용 |
| --- | --- | --- |
| 학교 검색·급식 조회 | 나이스(NEIS) 교육정보 개방 포털 | 검색어(학교 이름), 학교 코드, 날짜 |
| 업데이트 확인·설치 | GitHub(배포 파일 저장소) | 최신 버전 정보·설치 파일 요청 |
| 시계 표준시 보정 | 한국표준과학연구원(KRISS)·Google·Microsoft 시간 서버(NTP), 실패 시 Google·Cloudflare 웹 서버의 시각 정보 | 시각 요청 |
| 투표 이름 읽기 음성(선택) | Hugging Face(모델 배포 사이트) | 최초 1회 모델 파일(약 380MB) 내려받기 요청. 음성은 이후 PC 안에서 만들어짐 |
| 첫 실행 안내 화면 | jsDelivr(글꼴 배포망) | 안내 화면 글꼴 파일 요청 |
| 외부 툴 메뉴 | 해당 웹 서비스 | 이용자의 기본 브라우저로 열림. 해당 서비스의 방침을 따름 |

## 5. 아동의 개인정보

앱은 교사가 PC에서 실행하는 도구입니다. 학생이 학급 투표에 키보드로 참여할 수 있지만, 앱은 학생에게서 직접 개인정보를 수집하거나 외부로 보내지 않습니다. 교사가 입력한 학생 이름은 해당 PC에만 저장됩니다.
학생 이름이 표시된 투표 결과나 자리 배치도를 외부에 공유할 때는 공개 범위를 확인해 주세요(자리 배치도는 번호만 표시해 저장할 수 있습니다).

## 6. 보관 기간과 파기

- PC에 저장된 자료: 이용자가 직접 삭제하거나 앱 데이터를 초기화할 때까지 보관됩니다.
- 사용 통계: PostHog 프로젝트의 보관 설정 기간 동안 보관되며, 앱 개선 목적이 끝나면 삭제합니다. 삭제 요청 시 해당 설치 ID 기록을 지웁니다.

## 7. 제3자 제공

개발자는 사용 통계를 판매하거나 광고 목적으로 제3자에게 제공하지 않습니다. 위 3·4절에 적은 서비스 외에는 정보를 보내지 않습니다.

## 8. 이용자의 권리와 문의

사용 통계 삭제 요청, 이 방침에 대한 문의는 아래로 연락해 주세요.

- 개발자: 찰떡쌤
- 연락처: 【지원 이메일 입력】

## 9. 방침의 변경

이 방침이 바뀌면 이 페이지와 앱의 업데이트 안내로 알려 드립니다.

---

# Tidy Task Privacy Policy (English)

> Effective date: 【enter date】 · Applies to Tidy Task 5.6.3 and later

Tidy Task ("the app") is a Windows desktop memo and classroom toolkit for teachers, made by 찰떡쌤 ("the developer").

**Summary**
- No account or sign-in. The app does not ask for your name, email or phone number.
- All content you create (memos, to-dos, student rosters, votes, seating charts, notices, scores, settings) is stored **only on your PC** (e.g. `%APPDATA%\com.tidy.task`). The developer cannot access it.
- To improve the app, it sends **anonymous usage statistics** to PostHog (PostHog Inc., United States) over HTTPS: a random per-installation ID, app version, OS version, CPU architecture, which windows/tools are used and how often, and predefined error codes.
- It **never sends** memo or to-do text, window titles, student names, vote titles, candidates or results, school names or codes, allergy selections, file paths, keystrokes or screen recordings. GeoIP enrichment and person profiles are disabled and the IP property is overwritten with `0.0.0.0`; the receiving server may still briefly see the connecting IP address.
- Unsent events are queued locally for up to 1,000 events / 7 days, then discarded.
- There is currently no in-app switch to turn off usage statistics. Contact us to have the records for your installation ID deleted.

**Network features you trigger:** school search and meal lookup (Korea NEIS open API: school name, school code, date), update checks and downloads (GitHub), clock correction (KRISS, Google and Microsoft NTP servers, with Google/Cloudflare HTTPS date headers as fallback), optional voice model download from Hugging Face (~380 MB, then speech is generated locally), a web font for the first-run welcome screen (jsDelivr), and external tool links (opened in your default browser).

**Uninstall:** Your data is kept on the PC after uninstalling so it can be restored on reinstall. Use Settings → Reset data in the app, or delete the folder above, to remove it.

**Children:** The app is operated by teachers. Students may vote with the keyboard on the teacher's PC, but the app does not collect personal information directly from students or send it anywhere.

**Sharing:** Usage statistics are not sold or shared for advertising.

**Contact:** 찰떡쌤 — 【enter support email】

We will post any changes to this policy on this page and in the app's update notes.
