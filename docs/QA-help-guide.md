# 사용 가이드 개편 확인 (2026-09-21)

## 적용 범위

- `public/help.html`: 18개 주제, 여는 위치와 작업 순서, 추가 설명, 기존 fragment 링크 유지.
- `public/help.css`: 내장 메이플스토리 Light/Bold, 기본 18px, 크림/세이지 색상, 접이식 목차와 반응형 본문.
- `public/help.js`: 주제 이동, 검색, 검색한 상세 설명 펼치기, 18/20/22px 선택과 저장, 브라우저 뒤로 가기.
- `public/fonts/Maplestory{L,B}.woff2`: 기존 `src/assets/fonts`의 글꼴 사본. 정적 도움말도 외부 글꼴 서버 없이 사용.
- 툴킷 출시 안내에서 여는 창 제목을 ‘Tidy Task 사용 가이드’로 통일.

## 내용 확인에 사용한 구현

| 주제 | 확인한 구현 |
| --- | --- |
| 할 일·서식·붙여넣기·TXT | App.svelte, TodoList.svelte, MainToolbar.svelte, HeaderActions.svelte, appState.svelte.js |
| 작은 메모·아카이브 | StickerWindow.svelte, ArchivedList.svelte, ArchiveWindow.svelte |
| 마감일·알림 | DatePicker.svelte, ReminderPopup.svelte, SettingsModal.svelte |
| 도구 목록·설정 | toolkit/registry.js, toolkit/preferences.js, ToolkitToggle.svelte |
| 타이머 | TimerApp.svelte, TimerSettingsPanel.svelte |
| 학급 명단·파일·모둠 | RosterApp.svelte, ImportDialog.svelte, classroom/context.js |
| 뽑기·토너먼트 | PickerApp.svelte, TournamentApp.svelte |
| 알림장·집중벨 | NoticeboardApp.svelte, FocusBellApp.svelte |
| 급식·글꼴·통계 | meal 컴포넌트, builtinFonts.js, app.css, analytics.js |

기존 설명에서 바로잡은 항목: Tiny Note 보관은 완료된 할 일이 아닌 제목과 메모 내용 보관, 메모 TXT 가져오기는 현재 내용 대체, 여러 줄 붙여넣기는 다중 선택 모드에서 글자 편집 중이 아닐 때 최대 10줄, 모둠 뽑기는 이름 직접 입력, 알림장의 초안 자동 보관과 저장본 확정 구분.

## 확인 결과

- `npm run build`: 통과.
- `node --check public/help.js`, 변경 파일 `git diff --check`: 통과.
- 빌드 결과를 Vite preview로 열어 브라우저 확인.
- 22px에서 18개 주제 × 360/600/820/1280px 너비: 72개 모두 단일 주제 표시 및 가로 넘침 없음.
- 600×700 도움말 창 크기 및 360px 확대 화면, 넓은 창 첫 화면을 직접 시각 확인.
- 로컬 글꼴 표시, 툴킷 예시 이미지 로딩, 깨진 내부 링크 없음 확인.
- 백업 검색 결과와 관련 상세 펼침, 검색 결과 없음, 지우기, 뒤로 가기, 새로고침 후 글자 크기 유지 확인.

이번 확인은 브라우저에서 수행했다. 설치된 Tauri의 도움말 창, Windows 화면 배율, 스크린 리더 실기기 검증은 수행하지 않았다. 앱 기능 설명은 소스와 대조한 것이며 실제 사용자 자료를 변경하며 모든 기능을 실행한 검증은 아니다.
