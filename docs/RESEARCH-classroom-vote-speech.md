# 학급 투표 한국어 안내 음성 — 구현 전 조사

조사일: 2026-09-26 · 산출물: [구현 PRD](PRD-classroom-vote-speech.md)

## 1. 조사 결론

학급 투표에는 **검수한 남녀 기본 음성 파일 + 문맥을 명시한 한국어 읽기 규칙 + 투표 전 동적 문장 준비 + 취소 가능한 단일 재생기** 조합을 권장합니다. 운영 중인 Windows 음성의 이름만 교체하는 작업으로는 발음, 배포 환경 차이, 취소 경쟁, 음량 불일치를 해결하기 어렵습니다.

제작 공급자 1순위는 Azure의 정식 한국어 사전 제작 음성, 비교 후보는 Google Cloud 한국어 Neural2로 제안합니다. 음질 우열을 실제로 청취해 확정한 것은 아닙니다. Azure 여성 SunHi·남성 InJoon을 먼저 평가하고, 두 성별 모두 품질 기준을 충족하는 공급자를 선정해야 합니다. 비용·계정·배포 권한은 구현 시 선행 조건입니다.

고정 문구를 앱에 넣는 것과 임의의 이름을 네트워크 없이 새로 읽는 것은 다른 기능입니다. 전자는 충분히 작은 음성 묶음으로 구현할 수 있지만, 후자는 로컬 합성 모델 또는 미리 준비한 해당 음원이 필요합니다. PRD는 이 차이를 사용자에게 숨기지 않도록 규정합니다.

## 2. 근거를 판단한 방법

- 서비스 기능과 사용 조건은 공급자의 공식 문서로 확인했습니다.
- GitHub에서는 원저자의 저장소와 이슈를 살펴보았습니다. 코드 라이선스와 음성 서비스·모델·결과물 권리를 별개로 판단했습니다.
- Reddit은 어떤 불편을 시험해야 하는지 찾는 보조 자료로만 사용했습니다. 댓글의 음질 평가를 기술적 검증이나 채택 근거로 사용하지 않았습니다.
- 실제 코드는 2026-09-26 작업 트리에서 읽었습니다. HEAD는 `a924d90`이지만 미커밋·미추적 작업이 많아 HEAD만으로 현재 구현을 재현할 수 없습니다. 구현 시작 때 관련 파일의 해시와 작업 트리 상태를 다시 남겨야 합니다.
- 이번 단계에는 유료 합성 호출, 음원 제작, 음성 청취 판정, 네이티브 앱 재생 검증을 수행하지 않았습니다.

## 3. 후보 비교와 채택 판단

| 후보 | 확인한 사실 | 이번 설계의 판단 |
| --- | --- | --- |
| Windows/Web Speech | 현재 앱이 로컬 한국어 음성을 우선 선택합니다. 설치된 음성에 의존합니다 | 기본 공급자에서 제외합니다. 자동으로 품질이 낮은 음성에 대체하지 않습니다 |
| Azure Speech 정식 API | 한국어 남녀 음성, SSML, 파일 출력 경로가 문서화되어 있습니다 | 제작 및 동적 합성의 1순위 비교 후보입니다. 유료 계층과 실제 계약 조건을 확인합니다 |
| Google Cloud TTS | 한국어 Neural2-A/B 여성, Neural2-C 남성이 등재되어 있습니다. 생성 음원의 앱 사용이 문서화되어 있습니다 | Azure와 같은 대본으로 비교합니다. 모든 음성 계열이 같은 SSML 기능을 지원한다고 가정하지 않습니다 |
| CLOVA Voice | 공식 상품 설명에 생성 파일 저장·편집·재사용 제한이 명시되어 있습니다 | 현재 확인한 조건으로는 기본 내장 음원 제작에 채택하지 않습니다. 별도 계약 없이 저장 가능한 서비스로 오인하면 안 됩니다 |
| edge-tts | Edge 온라인 서비스를 이용하는 비공식 클라이언트입니다. 사용자 정의 SSML 제한 및 403 이슈가 확인됩니다 | 배포 앱의 기본 런타임·음원 조달 경로로 채택하지 않습니다 |
| Supertonic | 한국어 로컬 ONNX 추론 사례가 있으나 현재 원저자 저장소는 보관 처리되어 지원이 종료되었습니다. 코드 MIT와 모델 OpenRAIL-M이 구분됩니다 | 무조건적인 로컬 대안으로 채택하지 않습니다. 향후 로컬 모델 평가의 비교 자료로만 둡니다 |
| g2pK | 문맥별 숫자 읽기와 예외 사전의 실제 구현을 제공합니다 | 제한된 투표 도메인의 읽기 규칙 설계에 참고합니다. 전체 발음 변환 결과를 신경망 TTS에 재입력하지 않습니다 |
| 전문 성우 녹음 | 특정 업체를 선정하거나 견적을 확인하지 않았습니다 | 두 합성 후보가 고정 안내 품질 기준에 실패할 때의 제작 대안입니다. 임의 입력의 실시간 해결책은 아닙니다 |

## 4. 출처 목록과 적용 범위

아래 링크는 2026-09-26에 확인했습니다. 현재의 문서 내용은 향후 바뀔 수 있으므로 실제 제작 시 공급자·음성 ID·조건 확인일을 함께 고정해야 합니다.

| ID | 출처 | 확인 내용 및 적용 범위 |
| --- | --- | --- |
| S01 | [Azure 언어·음성 지원](https://learn.microsoft.com/ko-kr/azure/ai-services/speech-service/language-support) | `ko-KR-SunHiNeural`, `ko-KR-InJoonNeural` 및 다른 한국어 음성이 등재됩니다. 한국어 지원과 성별을 확인하는 근거이며 실제 교실 청취 품질의 근거는 아닙니다 |
| S02 | [Azure SSML 발음 제어](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation) | 숫자 등 내용 유형과 별칭을 다루는 문서입니다. 음성별 지원 여부를 따로 시험해야 하며 SSML을 쓰면 모든 한국어가 정확해진다고 해석하지 않습니다 |
| S03 | [Azure SSML 구조](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-structure) | 공급자에 전달할 구조와 이벤트의 참고입니다. 사용자의 자유 입력을 XML로 직접 삽입하지 않습니다 |
| S04 | [Azure TTS REST API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech) | 공식 인증·출력 형식·호출 경로의 근거입니다. 제작 도구와 서버 어댑터에서 사용합니다 |
| S05 | [Microsoft 제품 조건 — Azure, EAEAS](https://www.microsoft.com/licensing/terms/en-US/productoffering/MicrosoftAzure/EAEAS) | 조회 가능한 공식 제품 조건에서 사전 제작 신경망 TTS 출력 사용권을 유료 계층 고객에 규정합니다. 실제 계정의 계약 유형에도 같은 조건이 적용되는지는 제작 전에 확인해야 합니다 |
| S06 | [Azure 음원 사용권 Q&A](https://learn.microsoft.com/en-us/answers/questions/652774/usage-license-of-wav-mp3-generated-by-azure-text-2) | 과거의 상업·개인 사용 답변입니다. 현재 계약 조건보다 우선하지 않습니다. 오래된 Q&A만 보고 무료 음원의 재배포 권한을 확정하지 않습니다 |
| S07 | [Google Cloud 지원 음성](https://docs.cloud.google.com/text-to-speech/docs/list-voices-and-types) | 한국어 Neural2 여성·남성 후보 확인에 사용합니다 |
| S08 | [Google Cloud TTS 기본 개념](https://docs.cloud.google.com/text-to-speech/docs/basics) | 약관 준수하에 생성 파일을 앱에 사용하는 경로와 SSML 지원 범위의 차이를 확인했습니다 |
| S09 | [Google 음성 파일 생성](https://docs.cloud.google.com/text-to-speech/docs/create-audio) | 텍스트·SSML에서 파일을 만드는 정식 구현 경로입니다 |
| S10 | [NAVER Cloud CLOVA Voice 공식 상품 설명](https://www.ncloud.com/api-cms/service-product/static/clovaVoice) | 저장·편집·재사용 제한을 확인한 원문입니다. MP3/WAV 반환이 곧 재배포 허용을 의미하지 않습니다 |
| S11 | [rany2/edge-tts](https://github.com/rany2/edge-tts) | 사용자 정의 SSML 제한, 온라인 서비스 의존성을 확인했습니다 |
| S12 | [edge-tts 이슈 #401](https://github.com/rany2/edge-tts/issues/401) | 403 연결 오류와 대응 사례입니다. 과거 장애 근거이며 현재 모든 호출이 실패한다는 주장은 아닙니다 |
| S13 | [Kyubyong/g2pK](https://github.com/Kyubyong/g2pK) · [숫자 처리 코드](https://github.com/Kyubyong/g2pK/blob/master/g2pk/numerals.py) | 문맥에 따른 수 읽기와 예외 사전 접근을 참고합니다. 코드 복사 시 라이선스 및 고지가 별도로 필요합니다 |
| S14 | [Supertonic 원저자 보관 저장소](https://github.com/supertone-oss-archive/supertonic) | 2026-09-09 보관 처리, 지원 종료, 한국어·ONNX 예제, 코드와 모델의 별도 라이선스를 확인했습니다 |
| S15 | [MDN HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play) | 재생 요청의 Promise가 권한 또는 지원 형식 문제로 거절될 수 있습니다. 사용자 클릭과 실제 재생 시작을 구분합니다 |
| S16 | [Reddit — 한국어 TTS 음성 선택 질문](https://www.reddit.com/r/Anki/comments/1gd752g/which_awesometts_audio_most_standard_to_use_for/) | 한국어 학습용 음성 선택에 관한 질문과 주관적 의견을 확인했습니다. 공급자 순위를 정하는 자료로 사용하지 않았습니다 |

Microsoft MCA 제품 조건 페이지는 본문 크기 제한 때문에 이번 도구에서 읽지 못했습니다. EAEAS 공식 페이지를 확인했으며, 특정 계약에 대한 법적 결론을 대신하지 않습니다. 일부 Reddit 원문도 열기 오류가 있어 검색 요약의 의견을 검증 결과로 옮기지 않았습니다. 공급자의 최신 가격표·리전·개인정보 보존 조건은 아직 계약을 선정하지 않아 확정하지 않았습니다.

## 5. 현재 코드에서 확인한 개선 대상

| ID | 코드와 관찰 | 영향 / 필요한 변경 |
| --- | --- | --- |
| C01 | `src/lib/vote/tutorial.js`의 `meet`, 찬반 `press`가 숫자와 `번`을 그대로 합칩니다 | 기호 번호를 횟수로 해석할 여지가 있습니다. 실제 잘못 읽는 현상은 사용자 제보이며 이번 조사에서 음원 재현은 하지 않았습니다 |
| C02 | 같은 파일의 `nativeCount()`는 수량 일부만 변환하고 초는 원래 숫자로 전달합니다 | 기호·수량·시간을 분리한 의미 기반 변환이 필요합니다 |
| C03 | `src/lib/vote/speech.js`가 로컬 음성을 우선하고 `Heami`를 먼저 찾습니다 | 남녀 선택과 배포 PC 간 동일한 음질을 보장하지 못합니다 |
| C04 | `speech.js`의 시간 상한 콜백이 `finish(true)`를 호출합니다 | 실제 재생 완료와 타임아웃이 구별되지 않습니다 |
| C05 | `cancel()`에서 진행 중 Promise를 직접 종료하지 않고 synth 이벤트 또는 타이머에 의존합니다 | 취소 직후 정리 완료가 보장되지 않으며 오래된 콜백이 재생 상태를 건드릴 수 있습니다 |
| C06 | `VoteApp.svelte`의 음량·음소거 효과는 `audio`에만 적용됩니다. TutorialStage의 `speak()`에는 음량을 전달하지 않습니다 | 음성과 효과음이 다른 음량/음소거 경로를 사용합니다. 실제 장치 확인과 통합 제어가 필요합니다 |
| C07 | `TutorialStage.svelte`는 발화 결과 값을 확인하지 않고 자동 넘김을 예약합니다 | 실패 시에도 안내가 끝난 것처럼 넘어갈 수 있습니다 |
| C08 | `available()`은 음성 탐색 결과 Promise를 한 번 캐시합니다 | 늦게 설치되거나 준비된 음성을 재평가하기 어렵습니다. 새 설계에서는 팩·캐시 상태로 판단합니다 |
| C09 | `PrepScreen.svelte`는 효과음 뒤 고정 인사만 읽습니다 | 번호·시간·이름까지 검수하는 실질적인 미리 듣기와 다릅니다 |
| C10 | `prefs`에는 `speech` 불리언만 있고 음성 종류·발음 별칭·준비 상태가 없습니다 | 기존 데이터 보존을 전제로 설정 확장이 필요합니다 |
| C11 | `ballot.js`에서 찬반의 0은 현재 안건만 기권합니다. 후보·의견의 0은 남은 표 모두 기권 후 완료합니다 | 같은 기권 음원으로 통일하지 않고 타입별 정확한 안내를 제작해야 합니다 |

위 항목은 코드 검토 결과입니다. 오래된 QA 문서의 통과 기록을 현재 음질 검증으로 재사용하지 않았습니다. 특히 현재 안내는 다음 학생의 투표판이 자동으로 열리는 동작을 설명하므로, 과거의 Space 시작 안내를 다시 넣으면 안 됩니다.

## 6. 실제 수행한 확인과 아직 수행하지 않은 확인

실행:

```powershell
node --test --test-name-pattern='안내 슬라이드|음성:' src/lib/vote/vote.test.js
```

결과: **2개 통과, 0개 실패**입니다. 기존 테스트에는 시간 상한이 지나면 `true`를 반환해야 한다는 검증이 있어, 그 통과 자체가 올바른 완료 판정을 입증하지 않습니다. 기호 번호의 청취 정확성·남녀 음질·실제 출력 장치·음소거·오프라인 음원은 검증하지 않습니다.

PRD의 후속 검증은 세 층으로 나눕니다.

1. 한국어 의미와 상태 기계: 골든 케이스 및 실패 주입 자동 검증을 수행합니다.
2. 생성 음원: 모든 기본 파일의 한국어 청취 검수와 두 음성의 동등한 품질 검수를 수행합니다.
3. 실제 Tauri 앱: Windows/WebView2, 스피커·전자칠판·오프라인·두 창에서 재생을 확인합니다.

문서 조사로 2·3번까지 완료했다고 주장하지 않습니다.

## 7. 무료 구현에 따른 결정 개정 (2026-09-26)

사용자 요청에 따라 유료 Azure/Google 계정 전제를 철회했습니다. 앞 절의 공급자 비교는 최초 조사 기록이며 현재 구현 결정은 다음과 같습니다.

- **기본 안내:** Supertonic 3 로컬 제작 음원을 앱에 포함합니다. 여성 F1/남성 M1, 두 속도로 같은 문장 범위를 제공합니다.
- **이름·안건:** 모델을 명시적으로 내려받은 후 Web Worker + ONNX Runtime WASM으로 PC에서 합성합니다. 입력 문장을 클라우드 API에 전송하지 않습니다.
- **고정 출처:** [Supertonic helper](https://github.com/supertone-oss-archive/supertonic/tree/1e9799e964ea4c0dad7cde993b65c3c813a7b373), [Supertonic 3 모델](https://huggingface.co/supertone-oss-archive/supertonic-3/tree/aafc6e32416a594460b32413efc49d7fe4ce6d46), [모델 라이선스](https://huggingface.co/supertone-oss-archive/supertonic-3/blob/aafc6e32416a594460b32413efc49d7fe4ce6d46/LICENSE).
- **이전 제외 판단 변경 이유:** 계정 없는 무료 합성이 우선 요구가 되었습니다. 보관 상태 저장소의 유지보수 위험은 버전 고정·파일 해시·기본 음원 내장으로 줄이며, 음질 통과를 가정하지 않습니다.
- **실제 증거:** Python ONNX로 492개 기본 MP3를 제작했습니다. 브라우저에서 모델 다운로드부터 제목과 후보 9명의 여성/남성 음성 생성까지 실행했습니다. 자동 디코딩·해시는 통과했지만 한국어 청취 승인은 별도입니다.
- **재투표 규칙 변경:** 2·3·5·10초 옵션을 제거했습니다. 완료 화면에서 시간 제한 없이 현재 표를 취소하고, 명시적으로 차례를 넘깁니다. 대본도 이 규칙으로 다시 제작했습니다.

최신 수용 기준과 작업 트리는 PRD 2.0, 실제 통과/미실행 항목은 QA-vote-speech.md를 참조합니다. 최초 조사 단계의 2개 테스트 결과를 현 구현 검증으로 재사용하지 않습니다.
