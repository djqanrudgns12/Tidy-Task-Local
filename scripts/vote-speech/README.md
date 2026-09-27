# 학급 투표 무료 음원 제작

Python 3.12, Node, ffmpeg/ffprobe를 사용합니다. 유료 계정·키는 필요하지 않습니다. 모델 다운로드와 최초 패키지 설치에는 인터넷이 필요합니다.

```powershell
python -m venv output/vote-speech/venv
& output/vote-speech/venv/Scripts/python.exe -m pip install -r scripts/vote-speech/requirements.txt
& output/vote-speech/venv/Scripts/python.exe scripts/vote-speech/download.py --model-dir output/vote-speech/model
& output/vote-speech/venv/Scripts/python.exe scripts/vote-speech/generate.py --model-dir output/vote-speech/model
node scripts/vote-speech/verify.mjs
node --test src/lib/vote/speech.test.js src/lib/vote/vote.test.js
```

한 문장만 재제작할 때 `--only undo`처럼 지정합니다. 문장이 동일하면 파일을 재사용하므로 음색 설정·정규화·모델을 변경할 때는 manifest 버전과 재사용 키도 함께 변경해야 합니다. 생성된 파일은 항상 `reviewStatus: pending`입니다. 파일 크기·해시·디코딩 성공이 청취 승인은 아닙니다.

`node scripts/vote-speech/verify.mjs --release`는 청취 미승인 파일이 있으면 실패합니다. 음원은 `src/assets/vote/speech/`, 원본 WAV와 모델은 Git에 넣지 않는 `output/`에 둡니다. 제작기는 완성 문장 단위로 합성한 뒤 −20 LUFS/−3 dBTP 목표로 처리하며, 느린 기본 음원은 피치를 유지하는 atempo=0.9를 적용합니다. 동적 음원은 로컬 추론 속도 0.9/1.0을 사용합니다.

모델과 helper 출처·원문 라이선스는 `src/lib/vote/speech/vendor/`, 제품에 포함하는 고지는 `public/licenses/vote-speech/`에 있습니다. 이 저장소의 모델 체크섬 목록을 신뢰 기준으로 사용하고 최신 브랜치를 자동 다운로드하지 않습니다.

검수: 기본 123개 문장을 남녀·두 속도로 듣고 의미·억양·끊김을 기록합니다. 번호/표/기권/백스페이스/엔터 지시는 의미 오류가 하나라도 있으면 반려합니다. 한국어 화자 두 명의 청취와 Windows 실제 출력 장치 검증 후에만 승인 기록을 반영합니다.

브라우저 오프라인 검사: 개발 서버에서 준비 화면으로 모델을 한 번 받은 뒤 같은 origin의 `/scripts/vote-speech/offline-qa.html`을 엽니다. 버튼은 외부 fetch를 거부하는 worker로 새 검증 문장을 만듭니다. PASS는 캐시된 모델로 새 문장 합성과 음원 해시 검사가 성공했다는 뜻입니다. OS 전체 네트워크 단절·실제 스피커 청취 결과와는 구분합니다.
