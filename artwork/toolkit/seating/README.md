# 자리 배치 에셋 방향과 생성 기록

작성: 2026-09-25

## 선택한 방향

[스타일 시트 v2](style-sheet-v2.png)를 후속 제작의 기준으로 사용한다. 현대 한국 초등교실의 위에서 본 학생·밝은 나무 책상·차분한 일상복·자연스러운 머리색을 표현했다. 실제 학생 자료나 사용자의 참고 화면은 이미지 생성 입력으로 전달하지 않았다.

내장 imagegen으로 원안을 생성하고, 같은 그림의 시점을 위에서 내려다보는 방향으로 보정했다. [v1](style-sheet-v1.png)은 비교용 원안이다.

## 육안 검토와 남은 작업

- v1은 학생 그림과 색의 일관성이 좋지만 책상 다리·사물함 정면이 보여 교실 배치용 시점에 맞지 않았다.
- v2는 책상 다리와 소품 정면 노출을 줄이고 탑뷰에 가까워졌다. 학생별 머리 모양·옷색과 책상 크기는 일관적이다.
- 이 결과물은 방향 검토용 스타일 시트다. 투명 배경의 분리된 배포용 에셋, 정확한 좌석 기준점, 회전용 레이어, 12종 전체 변형이 아니다.
- 최종 에셋에서는 칠판·책장 등 남은 사선 요소를 정확한 평면 시점으로 통일하고 학생/책상/의자/소품을 분리해야 한다.
- 명패 영역을 코드로 확보해 큰 이름을 얹고, 30명 교실과 80~140px 좌석 실사용 크기에서 가독성을 검증해야 한다.
- 이름·번호·선택/고정 표시는 그림에 넣지 않는다. 교사 조건을 그림으로 표현하지 않는다.

## 생성 프롬프트

도구: 내장 `image_gen.imagegen`. CLI/API 키 경로는 사용하지 않았다.

### v1 신규 생성

```text
Use case: stylized-concept.
Asset type: original art direction sheet for Tidy, a Korean elementary classroom seating arrangement desktop tool. This is an illustration study, not a software screen.
Primary request: design an exceptionally cohesive, charming yet restrained top-down classroom miniature art sheet. Modern South Korean elementary pupils sitting at individual desks seen DIRECTLY FROM ABOVE (orthographic bird's eye 90 degrees, never isometric). Six seated pupils across the upper two thirds in a spacious two by three arrangement: varied short dark hair, neat bob, ponytail, slightly wavy short hair, tied hair and medium hair. Boys, girls and neutral presentations with equal care; natural dark brown/black hair and quiet everyday clothing in sage, faded blue, warm rust, cream. The viewer primarily sees crowns of heads, shoulders, little arms and hands resting on desks, and chair backs, not large frontal faces. Pupils face the top edge. Childlike but not baby proportions. Individual pale maple desks with gently rounded corners, dark muted sage or blue-gray metal frames, blank clear front nameplate areas, one notebook or pencil case per desk. Keep desks consistent, pupils distinct.
Bottom third: neatly separated top-down small classroom prop studies: empty matching desk and chair, teacher desk, a wall-mounted chalkboard as a narrow wall object, low bookshelf, a potted plant, classroom door swing shape, a bank of lockers. Every object follows the same orthographic top-down camera. Blank warm off-white studio sheet, ample space between objects.
Style/medium: polished hand-authored 2D game illustration, precise soft dark warm contour, restrained matte gouache shading, subtle paper texture confined inside objects, small soft contact shadows. Crisp silhouettes legible as 96px sprites. Human-crafted Korean stationery illustration sensibility, refined miniature classroom. Carefully controlled perspective, clean geometry, consistent light from upper left.
Constraints: entirely original, no reference screenshots used, no text anywhere, no letters, no numbers, no logos, no UI panels, no gradients, no glitter, no pink-versus-blue gender coding, no traditional costume, no exaggerated ethnic features, no front-facing portrait, no 3D clay gloss. This is one cohesive style sheet, not final individual transparent assets. Landscape high resolution.
```

### v2 시점 보정

입력: `style-sheet-v1.png`.

```text
Use case: precise-object-edit. Edit this original classroom art direction sheet. Preserve the six pupil variants, natural black/brown hairstyles, muted clothing colors, pale maple desks, soft hand-drawn gouache style, object identities and spacious contact-sheet layout. Change ONLY the CAMERA PROJECTION for every pupil and every prop to a strict 90-degree orthographic overhead floor-plan view, as if a ceiling camera points straight down. This is essential for seating-plan sprites that can rotate freely. Desk tops must be flat plan-view rectangles; hide desk legs and furniture front facades. Heads show crowns, shoulders and forearms are visible on desk, chair seat/back may appear around the body but no frontal faces. Teacher desk is a top surface, bookshelf and lockers are narrow top rectangles with only small hints of contents, chalkboard is an edge-on wall-mounted strip, door is a top-down narrow leaf and arc of its swing, plant is a leaf rosette. Do not show locker doors, vertical bookcase faces or perspective depth. Keep thin warm contours and gentle shadows. White background, no text, no labels, no UI, no new objects. Produce a refined coherent directly-overhead classroom style sheet, not isometric or a rear three-quarter view.
```

