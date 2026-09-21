# 툴킷 공통 테마 검증

- 밝은 테마 6개: 세이지 그린, 오션 블루, 라벤더, 로즈, 앰버, 슬레이트.
- 다크 모드 1개: Tidy Task의 #23272e/#2b3039, Tiny Note의 #334155를 참고한 공통 차콜/슬레이트. 저장된 밝은 색상은 유지.
- 툴바 방향 위에 테마 선택, 색 견본, 미리보기, 다크 모드 토글 구현.
- 툴킷 저장 이벤트로 모든 창에 전파. 알림장 전용 진입점과 body 포털에도 공통 변수를 제공.
- 도구 그림, 트로피, 사용자 문서의 명시적 서식, 뽑기 기계 자체의 팔레트는 의미를 유지.

## 결과
- 전체 JS 테스트 237개 통과.
- 툴킷 Rust 테스트 8개 통과, cargo check 통과.
- 프로덕션 빌드 통과.
- 6개 선택값 × 다크 토글 on/off × 13개 열린 화면 = 156개 브라우저 확인 통과. 다크 색은 모든 선택값에서 동일.
- 기본 텍스트·보조 텍스트·강조 글자와 3개 공통 면, 버튼 글자, 전광판 글자: 대비 4.5:1 이상 단위 검증.
- 화면의 일반 텍스트 대비 표본 검사 통과. 이 검사는 그림, 사용자 문서 서식, 모든 동적 상태까지 보증하는 접근성 인증이 아님.
- 380px 설정창, 선택 포털, 뽑기 내부 설정 대화상자 시각 검토.
- 재로드 유지, 다크 해제 시 원래 색 복원, 열린 창 및 대화상자 즉시 동기화 확인.
- 브라우저 런타임 오류 없음.
- Svelte 정적 검사: 기존 기록과 동일한 873 오류/14 경고/36파일. 이번 변경 파일의 진단 없음. 기존 기록: output/qa/focus-bell-check.txt, output/qa/tournament-check.txt.

실제 Windows 네이티브 다중 창의 수동 UI 실행은 수행하지 않았다. 브라우저 검증 및 Rust 검사/테스트로 확인했다.

## 재현 자료
- output/qa/toolkit/themes-matrix.mjs
- output/qa/toolkit/themes-matrix-report.json
- output/qa/toolkit/themes-matrix-result.txt
- output/qa/toolkit/theme-*-380.png
- output/qa/toolkit/theme-dark-dropdown.png
- output/qa/toolkit/theme-dark-picker-dialog.png
