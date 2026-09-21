# 간단 뽑기 생성 자산

2026-09-21. 구현 승인 후 독립 인형 이미지 6종을 생성해 런타임에 연결했다. 아래 시안 기록은 최초 PRD 작성 당시의 이력이다.

## 적용 자산

실제 파일은 `public/images/toolkit/picker/`의 rabbit, bear, cat, dog, penguin, chick PNG다. 내장 ImageGen으로 각각 생성했으며 단순 색상 변형이 아니다. 모든 파일의 RGBA 알파 범위 0~255를 확인했다. 크기/용량은 [manifest.json](manifest.json), 배치 및 집게 접점은 `src/lib/picker/designs.js`에서 관리한다. 학급 명단은 생성 입력에 포함하지 않았다.

공통 제작 방향은 아래 토끼 프롬프트와 동일한 무광 짧은 파일 원단, 섬세한 봉제선, 작은 자수 눈, 세이지색 리본, 정면 앉은 자세, 좌측 상단의 부드러운 광원, 투명 배경이다. 종별 실루엣은 곰의 둥근 귀와 짧은 주둥이, 고양이의 뾰족한 귀, 강아지의 늘어진 귀, 펭귄의 날개와 밝은 배, 병아리의 작은 부리와 날개로 구별한다. 바닥·그림자·문자·로고·네온·과장된 광택은 제외했다.

생성 원본 디렉터리: `C:/Users/rudgn/.codex/generated_images/01a0c0ea-840a-70d1-80cb-3636b72195ea/`.

| 종류 | 생성 원본 파일 |
| --- | --- |
| 토끼 | exec-e3161511-ca55-40b8-be78-a76e072bfa34.png |
| 곰 | exec-fe116cdb-47ee-439c-807e-90c4755fb037.png |
| 고양이 | exec-0d68d824-8d60-45c7-9a42-7069153d2a40.png |
| 강아지 | exec-6c7a5502-a8d0-4b06-9ac1-b13216859d7a.png |
| 펭귄 | exec-736814d6-42ac-41ce-bf7b-35a976de4b07.png |
| 병아리 | exec-c2f6d3ec-93b0-4b06-9ac1-b13216859d7a.png |

풍선은 둥근형·긴형·별·하트·꽃·곰의 자체 SVG 경로를 사용한다. 코드로 이동·회전·다트 접촉·파편을 연결하며 점/선/무지 패턴을 조합한다. 효과음은 WebAudio로 직접 합성한다. 외부 캐릭터/음원이나 커뮤니티 코드를 복사하지 않았다.

## 초기 시안 기록

- 파일: `rabbit-concept-v1.png`
- 생성: 내장 ImageGen 도구. CLI/API fallback 사용 없음.
- 용도: 인형 뽑기에서 움직일 봉제 인형의 질감·실루엣 시안.
- 생성 후 사용자 요청이 PRD 우선으로 변경되어, 프로젝트의 artwork에 원본을 복사하고 코드 연결은 수행하지 않았다.
- 시각 확인: 단일 크림색 토끼·세이지 리본·전체 실루엣 확인. 알파 채널·축소 품질·집게 접점 적합성은 최종 에셋 검수에서 추가 확인 필요.

## 다양성 계획 — PRD v0.2

사용자는 인형과 풍선에 다양한 디자인을 요구했다. 이 토끼 한 점은 전체 디자인을 대표하거나 단일 인형 반복 구현을 승인한 자료가 아니다.

- 인형은 토끼·곰·고양이·강아지·펭귄·병아리 최소 6종을 제안한다. 색상만 다른 복제는 별도 종으로 세지 않는다.
- 풍선은 둥근형·긴형·별·하트·꽃·곰 얼굴형 최소 6종과 선별한 무늬 조합을 제안한다. 최종 풍선은 움직임과 충돌을 제어할 수 있는 코드 기반 형태를 우선한다.
- 기본 혼합 무대는 4종 이상을 함께 표시한다. 종류 선택·무대 팔레트·시각용 순환은 추첨 후보·확률과 분리한다.
- 실제 제작은 구현 지시 후 수행한다. 이번 개정에서 이미지를 추가 생성하지 않았다.
- 개별 에셋 제작·투명도·크기별 품질·집게 anchor·풍선 hit영역·동작 검수는 PRD 8.5절과 9절을 따른다.

## 생성 프롬프트

```text
Create a production-ready game sprite: one small tasteful cream-colored rabbit plush toy, full body front view, seated with tiny rounded paws, long soft ears, very simple embroidered dark eyes and tiny nose, subtle pale sage ribbon, premium matte short-pile fabric with fine delicate seams. Clean refined Japanese stationery aesthetic, charming but restrained, no exaggerated cartoon features, no plastic glossy 3D, no neon, no text, no logo, no props. Centered isolated object fills 80 percent of square canvas, generous transparent padding around ears and feet. Truly transparent alpha background, no ground plane or cast shadow. This is an individual toy sprite to animate in a bright minimalist classroom claw machine interface; preserve clean silhouette and readable shape at 80px.
```

연결 문서: [간단 뽑기 PRD](../../../docs/PRD-classroom-picker.md).
