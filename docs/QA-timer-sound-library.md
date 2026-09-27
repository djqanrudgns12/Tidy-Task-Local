# 타이머 효과음 라이브러리 · 2026-09-27

## 요청

타이머 시계음·종료 경고음·종료음을 종류별로 10개씩 추가하고, 모든 타이머(전광판·아날로그·모래시계, 스톱워치는 시계음만)에서
드롭다운으로 고르게 한다. 검증된 공급처에서 어울리는 소리만, 중복 없이 고른다. 드롭다운은 다른 창·패널에 잘리지 않아야 한다.

## 결과 요약

- 역할별 선택지: 시계음 14개(기존 4 + 새 10), 종료 경고음 13개(기존 3 + 새 10), 종료음 13개(기존 3 + 새 10).
- 기존 소리는 예전 후보 비교 때의 한국어 이름을 줄여 그대로 씀(예: 가까이서 듣는 기계식 시계 → 기계식 시계, 이중 비프 경고 → 이중 비프,
  고전 시계 종, 성공 차임, 작은 물방울, 기기 버튼 클릭 → 버튼 클릭, 신호 알림, 경쾌한 작은 벨, 경고 버저). 예전 아날로그 시계음은 "작은 초침".
- **기본값은 타이머마다 예전에 울리던 소리 그대로**라 업데이트 뒤에도 고르기 전에는 소리가 바뀌지 않음.
- 드롭다운은 "시계 / 리듬 악기 / 가벼운 소리"처럼 묶음 제목으로 나누고, 그 타이머의 원래 소리에 `기본` 표시를 붙임.
- 고르면 곧바로 적용·저장되고, 멈춰 있을 때는 고른 소리를 바로 들려줌(시계음 4초·경고음 3초 반복, 종료음은 끝까지 한 번).
  진행 중에 바꾸면 미리 듣기 없이 새 파일을 받은 뒤 다음 박부터 새 소리로 이어짐.

## 새 소리 30개

모든 반복음은 정확히 1초(또는 2초)라 초가 바뀌는 순간에 울린다. 음량은 ITU-R BS.1770(ffmpeg ebur128)으로 재서
기존 타이머 소리(시계음 약 -21~-27, 경고음 약 -24~-25, 종료음 약 -23~-26 LUFS)와 비슷하게 맞췄고, 최고점은 -3 dBTP 이하.

| 역할 | 이름 | id | 공급처(라이선스) | 원본 | 길이 | 음량 / 최고점 |
| --- | --- | --- | --- | --- | --- | --- |
| tick | 벽시계 | `wall-clock` | BigSoundBank (CC0) | Clock | 2초 반복 | -26 LUFS / -6.6 dBTP |
| tick | 괘종시계 추 | `grandfather-clock` | BigSoundBank (CC0) | Grandfather clock, ticking | 2초 반복 | -26 LUFS / -7.7 dBTP |
| tick | 탁상 자명종 | `alarm-clock` | BigSoundBank (CC0) | Tic Tac Mechanical Alarm Clock #3 | 1초 반복 | -26.4 LUFS / -3.1 dBTP |
| tick | 스톱워치 초침 | `stopwatch` | BigSoundBank (CC0) | Chronograph #2 | 1초 반복 | -28 LUFS / -3.1 dBTP |
| tick | 주방 타이머 | `kitchen-timer` | BigSoundBank (CC0) | Timer | 2초 반복 | -26 LUFS / -5.3 dBTP |
| tick | 메트로놈 | `metronome` | BigSoundBank (CC0) | Mechanical metronome | 1초 반복 | -26.8 LUFS / -3.1 dBTP |
| tick | 우드블록 | `woodblock` | BigSoundBank (CC0) | Block "Meinl" in wood | 1초 반복 | -26.6 LUFS / -3.1 dBTP |
| tick | 부드러운 톡 | `soft-tap` | Google Material (CC BY 4.0) | ui_tap-variant-01 | 1초 반복 | -26 LUFS / -5.3 dBTP |
| tick | 디지털 틱 | `digital-tick` | Kenney (CC0) | Interface Sounds — tick_004 | 1초 반복 | -26 LUFS / -5.2 dBTP |
| tick | 맑은 유리 | `glass-tink` | Kenney (CC0) | Interface Sounds — glass_002 | 1초 반복 | -26 LUFS / -5.4 dBTP |
| warning | 라디오 시보 | `time-signal` | BigSoundBank (CC0) | Hourly bips #2 | 1초 반복 | -24.5 LUFS / -16.8 dBTP |
| warning | 알람 삐삐삐삐 | `alarm-beep` | Android AOSP (Apache-2.0) | Alarm_Beep_03 | 1초 반복 | -24.5 LUFS / -15 dBTP |
| warning | 게임 카운트다운 | `game-beep` | Kenney (CC0) | Digital Audio — tone1 | 1초 반복 | -24.5 LUFS / -9.9 dBTP |
| warning | 부드러운 딩 | `soft-ding` | Google Material (CC BY 4.0) | notification_simple-01 | 1초 반복 | -24.5 LUFS / -8.2 dBTP |
| warning | 알림 멜로디 | `chime-alert` | Google Material (CC BY 4.0) | alert_simple | 1초 반복 | -24.5 LUFS / -10.7 dBTP |
| warning | 실로폰 카운트다운 | `xylophone` | BigSoundBank (CC0) | Metallophone "jeu des milles euros" #2 | 1초 반복 | -24.5 LUFS / -7.5 dBTP |
| warning | 칼림바 | `kalimba` | BigSoundBank (CC0) | Mbira, note #2 | 1초 반복 | -27.2 LUFS / -3.1 dBTP |
| warning | 오르골 | `music-box` | BigSoundBank (CC0) | Music box G #1 + C #2 | 2초 반복 | -24.5 LUFS / -9.2 dBTP |
| warning | 두근두근 심장 | `heartbeat` | BigSoundBank (CC0) | Heartbeat #1 | 1초 반복 | -24.5 LUFS / -11.1 dBTP |
| warning | 재촉하는 초침 | `hurry-tick` | BigSoundBank (CC0) | Chronograph #1 | 1초 반복 | -26.4 LUFS / -3.1 dBTP |
| end | 주방 타이머 벨 | `kitchen-bell` | BigSoundBank (CC0) | Timer(마지막 벨) | 4.2초 | -24 LUFS / -9.1 dBTP |
| end | 권투 종 | `boxing-bell` | BigSoundBank (CC0) | Boxing bell #1 | 4.6초 | -24 LUFS / -3.4 dBTP |
| end | 호출 벨 | `counter-bell` | BigSoundBank (CC0) | Counter Bell #5 | 3.6초 | -24 LUFS / -7.9 dBTP |
| end | 딩동 초인종 | `doorbell` | BigSoundBank (CC0) | Doorbell #8 | 4.6초 | -24 LUFS / -9 dBTP |
| end | 싱잉볼 | `singing-bowl` | BigSoundBank (CC0) | Tibetan bowl struck #3 | 6.5초 | -25.1 LUFS / -3.1 dBTP |
| end | 트라이앵글 | `triangle` | BigSoundBank (CC0) | Triangle #3 | 4.2초 | -24 LUFS / -6.7 dBTP |
| end | 축하 멜로디 | `celebration` | Google Material (CC BY 4.0) | hero_decorative-celebration-01 | 2.0초 | -24 LUFS / -10.4 dBTP |
| end | 실로폰 도솔미 | `xylophone-finish` | BigSoundBank (CC0) | Metallophone "jeu des milles euros" #1 | 3.1초 | -23.7 LUFS / -14.7 dBTP |
| end | 스마트폰 타이머 | `phone-timer` | Android AOSP (Apache-2.0) | alarms/material Timer_48k | 3.0초 | -24 LUFS / -11 dBTP |
| end | 박수와 환호 | `cheer` | BigSoundBank (CC0) | Shouts and Applauses of Teens #1 | 4.1초 | -24 LUFS / -8.3 dBTP |

짝을 이루는 소리: 주방 타이머(째깍 + 마지막 벨은 같은 녹음), 실로폰 카운트다운 + 실로폰 도솔미(같은 악기),
스톱워치 초침(초당 2박) + 재촉하는 초침(초당 4박).

## 공급처를 고른 기준

- **BigSoundBank**(Joseph SARDIN): 실제 녹음 3,500여 개, "Free and Royalty Free" 표시 음원은 CC0. 집중벨에서 이미 쓰는 공급처.
  원본 24비트 48 kHz WAV를 계정 없이 받을 수 있음. 애플 벨소리처럼 제3자 권리가 의심되는 항목은 후보에서 뺌.
- **Kenney**: 게임 개발자 커뮤니티(Reddit·itch.io·GitHub 묶음)에서 가장 많이 추천되는 CC0 음원.
- **Google Material Design sound resources**: Google 공식 UI 소리, CC BY 4.0(저작자 표시·변경 사실 기재 필요 → LICENSE.txt).
- **Android(AOSP)**: `frameworks/base/data/sounds`, `Android.bp`에 `Android-Apache-2.0` 명시. 원본 URL은 커밋
  `1cdfff555f4a21f71ccc978290e2e212e2f8b168`에 고정. Apache 전문은 `public/licenses/timer-sounds/Apache-2.0.txt`.
- 예전 후보(Mixkit 70여 개)와 집중벨 음원(BigSoundBank Bell #1·구급차 사이렌)은 다시 쓰지 않음.
  AOSP는 이름만 다른 같은 파일이 있어(Oxygen = Cesium = Departure 등) 해시로 걸렀고, 앱 안 모든 타이머 소리의 해시가 서로 다른지 테스트로 확인.

## 가공

`scripts/prepare-timer-sound-library.mjs` 한 곳에서 원본 SHA-256 확인 → 가공 → 음량 맞춤 → 매니페스트·LICENSE.txt 기록까지 한다
(다시 만들기: `node scripts/prepare-timer-sound-library.mjs`, 원본 캐시는 `output/timer-sound-library/cache`).

- 시계음·경고음: 녹음의 박 하나씩을 잘라(시작점은 파형으로 다시 찾음) 정확한 박자 자리에 놓음. 실제 괘종시계는 째깍 간격이
  0.84초·1.15초로 흔들려 그대로 반복하면 박자가 어긋나므로 고르게 폄. 박 하나를 0.78초로 잘라 다음 째깍이 섞이지 않게 함.
- 주방 타이머 째깍은 태엽 소리가 원래 불규칙해 옮기지 않고, 조용한 틈에 이음매가 오는 2초 구간을 12 ms 교차로 이음.
- 1 ms도 안 되는 첫 금속음 봉우리 때문에 작게 들리던 탁상 자명종·스톱워치 초침·재촉하는 초침은 tanh로 봉우리만 눌러 크기를 맞춤.
- 심장 박동은 노트북 스피커가 낮은 소리를 못 내므로 160 Hz·1.4 kHz를 올려 들리게 함.
- 종료음은 앞 빈 구간을 줄이고, 긴 여운은 페이드아웃(마지막 10 ms 최고점 1 % 미만을 테스트로 확인).

## 드롭다운(잘림 방지)

- 목록은 body로 옮겨 그려(Portal) 설정 패널의 스크롤·스톱워치 겹침 패널에 잘리지 않음(z-index 1000).
- 창 가장자리에서는 위/아래로 뒤집히고, 남은 높이만큼 줄어 안에서 스크롤(`collisionPadding` 8px로 창 테두리에 붙지 않음).
  소리 목록은 큰 창에서도 400px에서 멈춤. bits-ui가 스크롤 막대를 숨기므로 위·아래에 더 있을 때만 화살표 줄을 보여 줌.
- 선택 상자 폭 150px(가장 긴 이름 "실로폰 카운트다운"이 들어감), 좁은 패널에서는 줄어들고 넘치면 말줄임.
- Esc: 목록이 열려 있을 때 Esc는 목록만 닫음(예전에는 타이머 창의 Esc 처리까지 돌아 설정 패널이 접히거나 최대화가 풀렸음).

## 검증

- `npm test` 631/631 통과(새 테스트: 역할별 새 소리 10개·이름/id/소리 해시 중복 없음·모노 48 kHz 16비트·반복 길이와 이음매·
  종료음 페이드·타이머별 기본 소리 유지·잘못된 저장값 → 기본 소리·Rust 목록 대조·출처 기록, 재생 엔진의 선택·미리 듣기·
  "미리 듣기가 늦게 도착해도 예약된 시계음을 끊지 않음"·불러오기 실패 후 재시도).
- `cargo test --lib toolkit::` 23/23 통과(기본값, 역할별 id 검증, 스톱워치 경고·종료음 거부, 모르는 값은 읽을 때 기본값).
- `npm run check` 오류 0, `vite build` 통과(새 음원 30개와 라이선스 폴더가 번들에 포함, 음원 약 6 MB 추가).
- 브라우저 미리보기(`?toolkit-preview=digital|stopwatch|hourglass`):
  - 1280×800: 시계음 목록이 위로 뒤집혀 창 위 8px에서 멈춤, 안에서 스크롤.
  - 최소 창 380×520: 맨 아래 종료음 목록이 위로 열려 32~432px(창 안), 현재 선택 "성공 차임"으로 스크롤되어 열림.
  - 스톱워치 760×560: 겹침 패널(232px)의 시계음 목록이 아래로 열려 552px에서 멈춤, 겹침 패널·기록 목록보다 위에 그려짐.
  - 다크 모드: 목록 배경·글자·묶음 제목·`기본` 표시 대비 확인.
  - 소리를 고르면 선택 상자·저장값(`tickSound`)이 바뀌고 해당 파일을 곧바로 받음, 콘솔 오류 없음.
- 설정 패널 높이: 소리 줄이 생겨 패널이 길어짐. 낮은 화면 압축 규칙(원래 아날로그 전용)을 모든 타이머에 적용.
  1080p 교실 화면 기본 크기(1440×894)에서 전광판은 36px, 아날로그 115px, 모래시계 133px만 스크롤로 내려 봄.

## 남은 확인

- 실제 스피커 청감(자동 검사는 파형·음량만 확인). 특히 두근두근 심장(작은 스피커), 싱잉볼·칼림바(최고점 제한으로 목표보다 1~3 LU 작음).
- Tauri 실제 창에서 드롭다운 열기·Esc·창 최대화 상태 확인(미리보기 창이 가려져 캡처가 불안정했음).
- 설치 파일 크기 약 6 MB 증가(WAV). 줄이려면 종료음만 Opus로 바꾸는 방법이 있으나 이번에는 기존 음원과 같은 WAV를 유지.
