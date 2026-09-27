# 5.6.0 자동 업데이트 및 배포 준비

검증일: 2026-09-27. 실제 릴리스 게시, 태그 생성, 커밋, 푸시는 수행하지 않습니다.

후속 상태: 사용자가 첨부 파일 없이 v5.6.0을 immutable 릴리스로 게시한 뒤 삭제했습니다. 서버에서 해당 릴리스의 404와 Latest가 v5.5.3으로 돌아온 것을 확인했습니다. 같은 앱 버전을 유지하기 위해 새 태그 `5.6.0`(v 없음)으로 복구합니다. `npm.cmd run release -- --skip-build --tag 5.6.0`으로 기존의 검증된 5.6.0 설치 파일을 유지하고 latest.json 다운로드 주소를 새 태그에 맞췄습니다. 5.6.1로 올리는 작업은 중단하고 로컬 버전을 5.6.0으로 복구했습니다. 사용자가 새 태그 `5.6.0`으로 진행하기로 확인했습니다.

## 자동 업데이트 검증

- `npm.cmd run release:verify`: 현재 게시된 v5.5.3의 태그, latest.json 버전, 설치 파일 첨부 및 주소를 확인하고, 실제 설치 파일 35.4MB를 내려받아 공개 키로 서명 검증을 통과했습니다.
- `node --test scripts/lib/minisign.test.mjs scripts/lib/updaterRelease.test.mjs src/lib/updateChecker.test.js`: 56개 통과. 변조된 파일·다른 키·변경된 서명 설명 거부, 버전·파일 이름·업데이트 주소 일치, 실패 안내를 확인했습니다.
- 로컬 개인 키 `~/.tauri/tidy-task-updater.key`로 임시 파일에 실제 서명한 뒤 앱 설정의 공개 키로 검증했습니다. 키 쌍이 일치하며 키 내용은 로그나 문서에 기록하지 않았습니다.
- 이 PC에 설치된 5.5.3 실행 파일에서 현재와 같은 공개 키와 latest.json 주소를 확인했습니다. Git의 v5.5.3 태그에 기록된 설정에는 업데이터 설정이 없었으므로 실제 설치본도 별도로 확인했습니다.
- `createUpdaterArtifacts: true`, Windows NSIS x64, `installMode: passive`를 확인했습니다.
- 실제 설치·앱 재시작·다중 창의 저장 응답을 동반한 업그레이드는 수행하지 않았습니다. 공개 서버와 서명 체인 검증, Rust 저장 보호 테스트와 구분합니다.

## 출시 검사

- 전체 JS 테스트: 최초 597개 통과, 복구 경로 회귀 검사 추가 후 598개 통과, 0 실패.
- `npm.cmd run check`: 오류 0, 경고 0.
- Rust `cargo test --manifest-path src-tauri/Cargo.toml --lib --quiet`: 117개 통과, 0 실패, 2개 제외.
- 투표 음성 `node scripts/vote-speech/verify.mjs --release`: 492개 파일 검증 통과, 청취 미승인 0개. 사용자의 직접 청취 확인 및 승인 요청을 manifest에 기록했습니다.
- 배포 준비 중 낡은 툴킷 마이그레이션 테스트 기대값에 자리 배치를 반영했습니다. 기존 도구 숨김 유지 검사는 보존했습니다.
- 자리 배치 `newDraft`의 타입 주석이 다른 함수 위로 밀려 있던 위치를 바로잡고, 기록 테스트의 빈 배열 검사 누락을 보완했습니다.

## 최종 빌드 결과

- 청취 승인 반영 후 `npm.cmd run release`를 다시 실행해 프런트엔드, Windows 실행 파일, NSIS 설치 파일과 업데이트 서명을 모두 새로 만들었습니다. 최종 빌드와 서명 검증이 통과했습니다.
- 설치 파일: `output/release/v5.6.0/Tidy.Task_5.6.0_x64-setup.exe`, 73,859,013바이트(70.4MiB).
- 업데이트 정보: `output/release/v5.6.0/latest.json`. `windows-x86_64-nsis`와 `windows-x86_64` 항목이 같은 설치 파일과 서명을 가리킵니다.
- 설치 파일 SHA-256: `4299e5a5af226fa37333231aad82dc6b2efb9d6aaa411432fd2799263b8ff32e`.
- 최종 설치 파일의 서명을 독립적으로 다시 검증했고, 원본 NSIS 결과와 배포 사본의 바이트가 일치합니다. 최종 프런트엔드에 이번 청취 승인 일시가 포함되고 pending 음원 상태가 없음을 확인했습니다.
- 최종 증거: `output/qa/release-5.6-final-build.log`, `output/qa/release-5.6-local-verification.json`. 게시할 폴더에는 설치 파일과 latest.json 두 파일만 있습니다.
- 복구 후 latest.json의 두 플랫폼 주소는 `https://github.com/djqanrudgns12/Tidy-Task-Local/releases/download/5.6.0/Tidy.Task_5.6.0_x64-setup.exe`입니다. 설치 파일의 SHA-256은 위 최종 빌드와 동일하며, Windows 설치 파일 버전도 5.6.0임을 확인했습니다.
- 복구 경로를 포함한 업데이트 관련 테스트 57개, 전체 테스트 598개, 타입·접근성 검사 오류 0·경고 0을 확인했습니다. 복구 증거는 `output/qa/release-5.6.0-recovery.log`, `output/qa/release-5.6.0-local-verification.json`입니다.

## 게시 순서

1. 파일 없이 게시한 기존 `v5.6.0` 릴리스는 사용자가 삭제합니다. 이미 잠긴 이 태그 이름은 재사용하지 않습니다. GitHub는 immutable 릴리스 삭제 자체는 허용합니다.
2. 현재 변경사항과 새 파일을 릴리스 소스 커밋에 포함한 뒤 그 커밋으로 `5.6.0` 태그를 만듭니다. 앞에 v가 없는 별도 태그입니다. 이번 설치 파일은 현재 작업 내용으로 만든 5.6.0 빌드입니다.
3. GitHub에서 새 릴리스를 Draft로 작성합니다. 제목은 `Tidy Task 5.6.0`, 본문은 `docs/RELEASE-5.6.0.md`를 사용합니다.
4. `output/release/v5.6.0/`의 `Tidy.Task_5.6.0_x64-setup.exe`와 새 `latest.json` 두 파일을 첨부합니다. latest.json에는 이미 업데이트 서명이 포함되며 주소의 태그는 `5.6.0`입니다. 폴더 이름에는 이전과 같이 v가 있지만 GitHub에서 만들 태그에는 v를 붙이지 않습니다.
5. 설치 파일과 latest.json 두 첨부를 확인한 뒤 새 릴리스를 정식 버전으로 게시하고 Latest 표시를 확인합니다.
6. 게시 후 `npm.cmd run release:verify`를 실행해 새 태그 `5.6.0`의 서버 파일을 검증합니다. GitHub 다운로드 주소는 게시 후에만 검증할 수 있습니다.

릴리스 본문에는 키, .env, 내부 검증 기록을 넣지 않습니다. 배포 파일과 본문만 사용합니다.
