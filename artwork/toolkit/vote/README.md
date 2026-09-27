# 학급 투표 캐릭터 · 평면 흉상 18명

2026-09-25에 제작했습니다. 이전 봉제 인형 전신 시안은 원형 스티커에서 얼굴이 작고 앱의 평면 파스텔 화면과 어울리지 않아 `output/vote-characters/rejected-plush-v1/`로 옮겨 보관했습니다. 이번에는 투표함 그림의 짙은 녹회색 선, 차분한 면과 작은 장식에 맞춘 얼굴·어깨 흉상으로 다시 만들었습니다. 1단계 시안에 대한 사용자 판정은 화풍 합격, m6·f1 합격, 이전 f9 불합격이었습니다. 학생 명단·실명·사진은 생성 입력에 넣지 않았습니다. 검수 시트의 이름은 화면 배치만 보려고 임의로 만든 예시입니다.

## 파일과 확인 자료

- 앱에는 `src/assets/vote/characters/`의 m1~m9, f1~f9 WebP 18장을 넣었습니다. 한 명당 한 포즈입니다.
- 선택 원본은 `artwork/toolkit/vote/characters/originals/{id}.png`에 보관했습니다.
- 생성 원본 경로, 원본·결과 SHA-256, 알파, 좌표, 변환, 압축, 시도 횟수는 `characters/manifest.json`에 기록했습니다.
- 전체 검수 시트는 `output/vote-characters/contact.html`, 한눈에 비교하는 PNG는 `output/vote-characters/contact.png`입니다. PNG는 Node 내장 모듈과 ffmpeg로 합성한 비교 이미지이며 Chrome 화면 캡처는 아닙니다.
- 각 인물의 기준선은 `output/vote-characters/check/{id}-guide.png`, 원 마스크 전 가장자리 확인용 원본은 `{id}-premask.png`입니다. 생성 후보는 `output/vote-characters/candidates-v2/`에 남겼습니다.
- `scripts/vote-characters.mjs`는 한 명씩 다시 가공할 수 있습니다. 예: `node scripts/vote-characters.mjs f1 --attempts=5`입니다. 다른 원본을 고를 때는 `--source`, 눈 좌표 `--eyes`, 볼 외곽 `--face`, 높이 `--face-y`, 생성 원본 경로 `--generated`를 함께 지정합니다.

## 선택과 다시 만든 이유

| id | 시도·선택 | 선택 이유와 탈락 사유 |
| --- | --- | --- |
| m1 | 4회 중 4번 | 짧은 스포츠머리와 남색 후드티가 가장 분명합니다. 1·2번은 머리가 길었고, 3번은 원본 모서리 알파가 1이었습니다. |
| m2 | 2회 중 2번 | 둥근 곱슬 실루엣과 남색 나비넥타이가 더 선명합니다. |
| m3 | 2회 중 2번 | 옆가르마와 가는 금색 둥근 안경이 조화롭고 f9의 검은 안경과 구분됩니다. |
| m4 | 2회 중 1번 | 삐죽 앞머리와 남색·크림 줄무늬가 명확합니다. 2번은 모서리 알파가 1이어서 제외했습니다. |
| m5 | 2회 중 2번 | 바가지머리와 데님 멜빵의 큰 겨자색 단추가 잘 보입니다. |
| m6 | 1단계 6회 중 4번 | 승인된 뒤로 쓴 야구모자·볼 반창고 원본과 앱용 파일을 그대로 유지했습니다. |
| m7 | 2회 중 2번 | 짧은 옆머리와 옆으로 흐르는 윗머리가 1번보다 투블럭으로 읽힙니다. 세이지 체크 셔츠도 보입니다. |
| m8 | 2회 중 2번 | 웨이브 파마와 양쪽 책가방 끈, 어깨 위 작은 가방 윗부분이 가장 고르게 보입니다. |
| m9 | 2회 중 1번 | 크림 땀밴드, 버건디 체육복, 호루라기가 작은 크기에서도 분리됩니다. |
| f1 | 1단계 5회 중 3번 | 승인된 땋은 머리·멜빵 원본을 재생성하지 않고 214px 목표로 다시 가공했습니다. |
| f2 | 2회 중 1번 | 둥근 똥머리와 가디건 가슴의 리본 브로치가 보입니다. 2번은 리본이 옷깃 장식에 가까워 제외했습니다. |
| f3 | 2회 중 2번 | 일자 앞머리 단발과 남색 세일러 칼라·흰 리본의 대비가 좋습니다. |
| f4 | 2회 중 1번 | 높은 포니테일, 버건디 줄무늬, 단순한 동그란 배지가 분명합니다. 2번 배지의 표정 무늬는 불필요하여 제외했습니다. |
| f5 | 2회 중 2번 | 긴 생머리·세이지 머리띠·오트밀 조끼의 구분이 안정적입니다. |
| f6 | 2회 중 2번 | 곱슬 단발과 작은 겨자색 꽃 핀, 테라코타 멜빵이 고르게 보입니다. |
| f7 | 2회 중 2번 | 짧은 양갈래와 크림색 방울 머리끈이 녹색 후드티와 분리됩니다. |
| f8 | 2회 중 2번 | 뒤쪽 큰 버건디 리본이 앞에서도 읽히면서 1번보다 과하지 않습니다. 겨자색 카디건과 함께 f2와 구분됩니다. |
| f9 | 기존 6회 폐기, 새 설명 2회 중 2번 | 머리에 붙는 숏컷·겨자색 머리핀·둥근 검은 안경과 흰 옷깃으로 이전의 짙은 덩어리 느낌을 줄였습니다. 이전 6장은 성별 판독·명도·머리 꼭대기 문제로 폐기했습니다. |

f9는 라벨 **숏컷 · 동그란 안경**을 유지하면서 설명을 새 픽시컷·작은 머리핀·흰 둥근 옷깃·차콜 가디건으로 바꿨습니다. m1의 4번에는 스포츠머리를 더 짧게 요청하는 문장을 추가했습니다. 다른 인물의 라벨과 설명은 바꾸지 않았습니다.

## 가공과 검수

새 원본의 눈 위치는 어두운 눈동자 영역을 찾아 계측하고 기준선 이미지에서 확인했습니다. 1단계 승인 시안의 볼 외곽 수동 계측 범위(530~545px)를 기준으로 새 원본은 눈 중심 좌우 270px을 공통 볼 외곽 계측선으로 적용했습니다. 따라서 manifest의 214px은 그 기준선 사이를 환산한 값입니다. 자동 피부 분할로 다시 잰 폭은 아닙니다. 눈 높이 240px, 얼굴 중심 256px에 맞춰 512px 캔버스로 옮겼고, 투명 가장자리에는 사전 알파 곱셈·Lanczos·알파 되돌리기를 썼습니다. 원 바깥은 부드러운 알파 마스크로 잘랐습니다.

18장 모두 원본·결과의 알파 범위가 0~255, 네 모서리 알파가 0이고, 결과의 원 밖 픽셀은 0입니다. WebP 재읽기 검사에서 눈 높이 240±8px, 얼굴 기준선 중심 256±8px, 기준선 폭 214±4px, 머리·모자·장식 꼭대기 y≥16을 통과했습니다. 무손실 WebP를 먼저 시험하고 80KB를 넘으면 손실 q92를 썼습니다. 18장 모두 q92를 사용했으며 결과 용량은 각각 80KB 이하입니다.

18명 비교에서는 m3↔f9(안경), m4↔f4(줄무늬), m1↔f7(후드티), m2↔f5(조끼), f2↔f8(카디건), m9↔f9를 34·64px 줄에서 확인했습니다. 머리 실루엣과 옷 색이 함께 구분을 돕습니다. f9의 머리핀과 흰 옷깃은 64px에서 이전보다 또렷합니다. 투표함 그림과 전체 세트의 선 색·채도는 어울립니다. 약한 연속 명암은 일부 남아 있으며 승인된 m6의 회색 티에는 크게 확대하면 옅은 얼룩이 보입니다. 작은 크기에서는 두드러지지 않습니다.

## 사용한 ImageGen 프롬프트 원문

첫 1단계 시안과 2단계의 기본 프롬프트입니다. `{DESCRIPTION}`에 아래 표의 해당 문장을 넣었습니다. 2단계에는 승인된 m6·f1과 새 f9, 투표함 그림을 선·색·얼굴 표현 참조로 함께 넣었습니다. 새 f9를 만드는 첫 시도에서는 기존 f9 대신 m6·f1·투표함만 참조했습니다. 참조 인물의 머리·옷을 다른 사람에게 복사하지 않도록 요청했습니다.

```text
Flat vector illustration of a Korean elementary school student as a head-and-shoulders avatar, {DESCRIPTION}.
Style: clean, modern Korean stationery and education-app illustration. Tidy geometric shapes with smooth rounded curves, one consistent medium-thin outline in a soft dark green-gray, flat color fills with at most one subtle flat shadow tone per shape. No gradients, no texture, no fabric or fur, no 3D rendering, no glossy highlights, no airbrush, no painterly strokes.
Face: friendly, calm expression; small solid dark oval eyes with one tiny white catchlight; short simple eyebrows; a small gentle closed-mouth smile; very subtle round blush. Natural proportions of a 9 to 11 year old child: cute and charming but not babyish, not chibi, not anime, no oversized sparkly eyes, no exaggerated expression.
Colors: muted, slightly warm and harmonious with soft pastel backgrounds: muted navy, warm cream, oatmeal beige, soft denim blue, sage green, dusty burgundy, muted terracotta, heather gray, charcoal, with small mustard accents. Hair in solid black or brown with one simple flat highlight shape. No neon, no fully saturated primary colors.
Composition: square canvas, front view (at most a very slight turn), face centered horizontally, eyes at about 47 percent from the top, face about 44 percent of the canvas width, the whole hairstyle inside the canvas with some headroom, shoulders and upper chest continuing off the bottom edge. No hands in frame.
Background: fully transparent. No circle frame, no background shape, no ground, no drop shadow, no text, no logo, no color swatches.
```

2단계에서 기본 프롬프트 끝에 더한 문장입니다.

```text
Flat solid fill, no speckle or fabric texture. Keep the hair highlight as one modest shape slightly lighter than the hair, never a white gleam. Keep the top of the hairstyle comfortably below the canvas edge. East Asian facial features and naturally varied East Asian skin tones. Use the references only for outline, palette, face treatment, and framing; preserve this character's distinct hair, face, and clothing details.
```

| id | `{DESCRIPTION}` 원문 |
| --- | --- |
| m1 | boy, light warm skin, very short neat black sports cut, muted navy hoodie with cream drawstrings |
| m2 | boy, medium tan skin, round fluffy dark-brown curly hair, white collared shirt with a small navy bow tie under a cream knit vest |
| m3 | boy, fair skin, neat side-parted black hair, thin round gold-rimmed glasses, oatmeal cardigan over a white collared shirt |
| m4 | boy, light skin, black hair with a slightly spiky fringe, navy-and-cream horizontal striped tee |
| m5 | boy, medium skin, rounded dark-brown bowl cut, soft denim overalls bib with two big mustard buttons over a cream tee |
| m6 | boy, light warm skin, navy baseball cap worn backwards with short black hair showing at the front, a small beige bandage on one cheek, heather-gray sweatshirt |
| m7 | boy, tan skin, black two-block haircut with short sides and a fuller top swept to one side, sage-green and cream checked collared shirt |
| m8 | boy, fair skin, messy wavy brown permed hair, soft denim jacket, mustard backpack straps on both shoulders with the top of a small cream backpack peeking over one shoulder |
| m9 | boy, medium skin, short black hair with a cream sweatband across the forehead, dusty burgundy zip-up track jacket with cream stripes on the shoulders, small silver whistle on a cord |
| f1 | girl, light skin, black hair in two long braids resting in front of the shoulders with mustard hair ties, soft denim pinafore straps over a cream blouse with a round collar |
| f2 | girl, medium tan skin, dark-brown hair in a round top bun, cream cardigan with a small dusty burgundy ribbon brooch |
| f3 | girl, fair skin, straight black chin-length bob with blunt bangs, navy sailor collar with thin white trim and a small white bow |
| f4 | girl, light warm skin, high black ponytail clearly visible to one side of the head, dusty burgundy and cream striped tee, a bag strap across the chest with a small round mustard badge |
| f5 | girl, medium skin, long straight dark-brown hair past the shoulders with a sage-green headband, oatmeal knit vest over a white collared shirt |
| f6 | girl, tan skin, curly short brown bob, a small mustard flower hairpin, muted terracotta overall-dress straps over a cream tee |
| f7 | girl, light skin, two short black pigtails with small round cream pom-pom hair ties, sage-forest-green hoodie |
| f8 | girl, fair skin, black half-up hair with a large dusty burgundy ribbon at the back of the head that is clearly visible from the front, mustard knit cardigan over a white blouse |
| f9 | girl, medium tan skin, sleek softly rounded short pixie cut that hugs the head with a gentle side-swept fringe and short tufts over the ears, a small mustard hair clip on one side, round black-rimmed glasses, soft charcoal-gray cardigan over a white blouse with a small rounded collar |

m1 3·4번에는 스포츠머리 길이를 더 짧게 해 달라는 문장을 추가했습니다. 모든 캐릭터는 Codex 내장 ImageGen으로만 만들었고 외부 API·스톡 이미지·기존 캐릭터나 특정 일러스트레이터 화풍을 사용하지 않았습니다.

## 앱 확인과 빌드

`npm test`는 471개 모두 통과했습니다. `npm run build -- --outDir output/vote-characters/dist`도 통과했고, 해당 빌드 출력의 캐릭터 WebP 18개가 앱 파일과 SHA-256까지 일치했습니다. 원래 `dist/`는 쓰기 허용 경로 밖이어서 사용하지 않았습니다.

이미 응답하던 `http://localhost:5173` 개발 서버를 그대로 사용했습니다. `output/vote-characters/app-candidate9.png`에서는 아홉 후보의 스티커가 원 안에 중앙 정렬되어 보였고, `app-result-winner.png`에서는 m8 당선 캐릭터와 왕관·리본이 겹치지 않았습니다. 기존 서버는 끄지 않았습니다. 가장자리 18명 비교 이미지는 `output/vote-characters/halo.png`입니다.
