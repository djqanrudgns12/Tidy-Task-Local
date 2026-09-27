# 학급 투표 에셋 폴더

이 폴더에 파일을 넣으면 빌드할 때 자동으로 쓰입니다(`src/lib/vote/assetFiles.js`). 파일이 없으면 캐릭터는 같은 색의 번호 스티커로, 소리는 합성음으로 대신합니다.

## 캐릭터 (`characters/`)

- 파일 이름: `m1.webp` ~ `m9.webp`(남), `f1.webp` ~ `f9.webp`(여). 18개가 모두 있어야 합니다.
- 방향(2026-09-25 변경): 봉제 인형 전신 → **평면 일러스트 흉상**(얼굴 + 어깨). 앱의 투표함 그림처럼 부드러운 선 + 파스텔·차분한 면, 질감·3D 없음.
- 규격: 512×512 WebP. 캔버스 = 후보 색 원의 바깥 사각형이고, 앱은 그림을 **원 모양으로 잘라** 보여 줍니다(`Sticker.svelte`, 결과 이미지 `resultImage.js`). 원 밖과 인물 뒤는 투명.
- 위치 기준: 얼굴 가로 중심 x=256, 두 눈 중심 높이 y=240, 얼굴(피부) 폭 225px. 어깨·가슴은 아래쪽 원에 잘리도록 캔버스 밖까지 이어짐.
- 제작 방향·프롬프트·검수 기준·기록: `artwork/toolkit/vote/README.md`.

## 녹음 효과음 (`audio/`)

- 파일 이름: 소리 id 그대로(`vote.cast.wav`, `count.stamp.wav` …). 같은 소리의 변주는 `count.unfold-1.wav`, `count.unfold-2.wav`처럼 번호를 붙이면 번갈아 재생합니다.
- `vote.cast`는 비밀 유지를 위해 파일을 **하나만** 둡니다(모든 표에 같은 소리).
- 규격: 모노 48kHz, 1초 미만은 WAV PCM16, 1초 이상은 OGG. 앞뒤 무음을 자르고, 목표 음량은 `src/lib/vote/audio.js`의 `LOUDNESS` 표(BS.1770 통합 음량 ±1dB), 최고점 −3dBTP 이하.
- 녹음 파일에는 합성음 보정(`TRIM` · `TAME`)을 쓰지 않으므로 파일 자체를 맞춰 넣습니다. 확인 예시:

```bash
ffmpeg -hide_banner -nostats -i vote.cast.wav -af ebur128=peak=true -f null -
```

- 출처·라이선스는 `public/audio/toolkit/LICENSE.txt`에 함께 적습니다(CC0 또는 Mixkit Sound Effects Free License만).
