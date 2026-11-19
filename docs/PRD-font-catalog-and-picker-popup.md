# PRD — 내장 글꼴 72종 무손실 확장 & H3·D1 비이동 밀착 독립 글꼴 팝업 (`font-picker`)

| 항목 | 내용 |
|---|---|
| 문서 판 | **v2.0 (최종 확정본 · 세부 실행 계획 포함)** |
| 작성일 | 2026-11-19 |
| 상태 | **사양 확정 — 구현 준비 완료** |
| 확정 사양 | ① **글꼴 정책:** 기존 내장 글꼴 **38종 `.woff2` 100% 무삭제 보존**(교보 손글씨 4종·기존 `Jalnan.woff2` 포함) + 신규 **24종 `.woff2` 추가** = **62종 `.woff2`** + 시스템 기본 **10종** = **총 72종** (사용자 추가 커스텀 폰트 별도 동적 섹션)<br>② **위계 방식:** **`H3`** (상단 1줄 미니 카테고리 탭 + 행 우측 인라인 굵기/시리즈 캡슐)<br>③ **디자인 스킨:** **`D1` (에어리 포스트잇)** — 테마 배경 틴트 유리질 + 호버 시 좌측 `2.5px` 포인트 컬러 알약 막대 + 굵기 칩 실시간 폰트 프리뷰 + `Zero-Halo Flush Edge`<br>④ **창 방식:** **비이동(Non-Draggable) 밀착 독립 팝업 창(`font-picker`)** — 버튼 바로 아래 `2px` 착 달라붙음, 호스트 이동/리사이즈/스크롤 시 즉시 닫힘 |
| 수정 대상 (16개 영역) | `src/assets/fonts/` (24종 복사 추가, 기존 38종 유지), [src/app.css](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/app.css), [src/lib/builtinFonts.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/builtinFonts.js), [src/lib/editor/richTextFormat.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/editor/richTextFormat.js), [src/main.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/main.js), [src/App.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/App.svelte), [src/components/MainToolbar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/MainToolbar.svelte), [src/components/FloatingRTE.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/FloatingRTE.svelte), [src/components/ArchiveToolbar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/ArchiveToolbar.svelte), [src/components/SettingsModal.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/SettingsModal.svelte), [src/components/meal/MealSettingsWindow.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/meal/MealSettingsWindow.svelte), [src/components/toolkit/ToolkitSettings.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/toolkit/ToolkitSettings.svelte), [src/components/noticeboard/NoticeboardApp.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/noticeboard/NoticeboardApp.svelte), [src/components/context-menu/ContextFormatBar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/context-menu/ContextFormatBar.svelte), [src-tauri/src/tray.rs](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src-tauri/src/tray.rs), [src-tauri/src/analytics.rs](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src-tauri/src/analytics.rs), [src-tauri/src/lib.rs](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src-tauri/src/lib.rs) |
| 신규 대상 (11개 파일) | `src/lib/fonts/fontCatalog.js`, `src/lib/fonts/fontCatalog.test.js`, `src/lib/fonts/fontPickerTheme.js`, `src/lib/fonts/fontPickerTheme.test.js`, `src/lib/fonts/fontPickerProtocol.js`, `src/lib/fonts/fontPickerProtocol.test.js`, `src/lib/fonts/fontPickerClient.svelte.js`, `src/components/fontPicker/FontPickerPanel.svelte`, `src/components/fontPicker/FontPickerTrigger.svelte`, `src/components/fontPicker/FontPickerWindow.svelte`, `src/dev/FontPickerPreview.svelte` |
| 불변 계약 (바꾸지 않는 것) | `DEFAULT_FONT = '메이플스토리 L'`, 기존 48종 내장 폰트의 내부 `name`·`family` 100% 보존, `tidy-task-config.json`·`tidy-task-meal.json`·툴킷 설정의 기존 저장 키, `BUILTIN_FONTS` 기존 `{ name, family }` 배열 export, `public/fonts/MaplestoryL/B.woff2`, PostHog 기존 행동 이벤트 계약(신규 행동 이벤트 없음 — `analytics.rs::window_kind` 분류만 등록), `date-picker`·`dday-widget-menu`·`ctx-menu` 기존 동작 |

---

## 1. 배경 및 현황 진단 (Forensic Audit)

### 1.1 기존 글꼴 선택 UI의 4가지 구조적 한계

현재 프로젝트 내 글꼴 선택 UI는 **총 8개 화면**에 분산되어 있으며, 6곳이 OS 기본 `<select>`를 그대로 사용하고 있습니다.

| 위치 | 파일 | 현재 구현 | 창 기본 / 최소 크기(논리 px) | 문제점 |
|---|---|---|---|---|
| 메모 창 상단 서식 바 | [MainToolbar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/MainToolbar.svelte#L782-L796) | 네이티브 `<select>` | `380×500` / 최소 `280×210` | 평면 나열, 테마 미반영, 좁은 트리거(`메이플…`), 구식 Windows 스크롤바 |
| Tiny Note 플로팅 서식 바 | [FloatingRTE.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/FloatingRTE.svelte#L413-L427) | 네이티브 `<select>` | `250×280` / 최소 `200×45` | 초소형 창 내부에 인라인 패널 배치 시 100% 잘림 |
| 아카이브 서식 바 | [ArchiveToolbar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/ArchiveToolbar.svelte#L295-L310) | 네이티브 `<select>` | `600×500` / 최소 `400×360` | 테마 미반영, 평면 목록 |
| 시스템 설정 (메모·화면 글자) | [SettingsModal.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/SettingsModal.svelte#L600-L639) | 네이티브 `<select>` × 2 | `360×560` / 최소 `360×400` | 설정창의 테마색(`--st-accent`)·다크모드와 이질적인 OS 기본 리스트 |
| 급식 설정 창 | [MealSettingsWindow.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/meal/MealSettingsWindow.svelte#L359-L366) | 네이티브 `<select>` (`메인 창과 동일` 포함) | `~360×520` / 최소 `340×420` | 고유 글꼴 미표시, 평면 나열 |
| 알림장 서식 바 | [NoticeboardApp.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/noticeboard/NoticeboardApp.svelte#L875-L881) | 네이티브 `<select>` | 툴킷 작업 창 | 고유 글꼴 미표시, 평면 나열 |
| 툴킷 설정 | [ToolkitSettings.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/toolkit/ToolkitSettings.svelte#L213-L215) | `ToolkitSelect` (bits-ui) | `~420×620` / 최소 `380×480` | 위계 없는 평면 목록, 스크롤바 숨김 |
| 우클릭 서식 드로어 | [ContextFormatBar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/context-menu/ContextFormatBar.svelte#L311-L328) | 인라인 평면 목록 (`max-height: 132px`) | `ctx-menu` 팝업 내부 | 72종 확장 시 132px 평면 스크롤로 탐색 불가 |

### 1.2 72종 무손실 확장 & 사전 차단 대상 4가지 기술 함정

1. **기존 글꼴 0% 손실 원칙:** 기존 `src/assets/fonts/` 38종 중 어느 파일도 삭제하지 않고(`KyoboHandwriting2019~2025` 4종 및 `Jalnan.woff2` 100% 유지), `C:\Users\User\Desktop\vibecoding\fonts`에서 신규 24종만 추가해 **62종 `.woff2` + 시스템 10종 = 총 72종**을 구성합니다.
2. **Tiny Note `FloatingRTE.svelte` 자동 숨김 함정 ([줄 288-294](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/FloatingRTE.svelte#L288-L294)):** `font-picker`가 OS 포커스를 받는 순간 `FloatingRTE`가 `!activePopup`으로 판단해 숨어 버리는 현상을 막기 위해 `fontPicker.openKey === 'floating-rte'` 가드를 반드시 추가합니다.
3. **우클릭 메뉴(`ctx-menu`) 내부 이중 팝업 충돌:** `ctx-menu` 자체가 `blur` 시 닫히는 독립 창이므로, `ContextFormatBar` 내부는 독립 창을 띄우지 않고 **공유 `FontPickerPanel.svelte`(H3+D1)**를 인라인 드로어로 직접 마운트합니다.
4. **기존 `placePopup`의 수평 튕김 현상 ([popupPlacement.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/windows/popupPlacement.js#L136-L155)):** 아래·위 여유가 `200~331px`일 때 버튼 옆으로 튀지 않고 **높이만 유연하게 축소해 버튼 바로 아래/위에 착 달라붙어 세로 스크롤**하는 전용 `placeFontPicker` 함수를 작성합니다.

---

## 2. 목표와 비목표 (Goals & Non-goals)

### 목표
1. **72종 무손실 내장 폰트 카탈로그:** 기존 38종 `.woff2` 100% 보존 + 신규 24종 `.woff2` 병합(총 62 `.woff2` + 시스템 10종 = 72종)을 `src/lib/fonts/fontCatalog.js` 단일 원천으로 관리합니다.
2. **`H3` 위계 압축:** 72종 평면 목록을 **6개 카테고리 · 43개 패밀리 행**으로 구조화하고, 상단 **1줄 미니 카테고리 탭**(`전체 · 포인트 · 고딕 · 명조 · 손글씨 · 학교 · 기본`, 커스텀 존재 시 `내 글꼴`) + 행 우측 **인라인 굵기/시리즈 캡슐**로 1클릭 선택 및 실시간 굵기 프리뷰를 제공합니다.
3. **`D1 (에어리 포스트잇)` 테마 일체화:** Tidy Task 15종(×2) + Toolkit 6종(×2) = **42조합**에 대해 명시적 6자리 Hex/rgba 토큰(`light-dark()` 금지)으로 테마 배경 틴트·호버 좌측 `2.5px` 포인트 컬러 막대·솔리드 칩 반전을 구현합니다.
4. **비이동 밀착 독립 팝업 창(`font-picker`):** `Zero-Halo Flush Edge`(투명 여백 0px, OS 그림자 없음, 불투명 내측 1px 림) + 이동 불가 + `2px` 초밀착 + 호스트 이동/리사이즈/스크롤 시 즉시 닫힘으로 Tiny Note `200×45`를 포함한 모든 창 크기에서 잘림 0px을 달성합니다.
5. **전 8개 화면 일관 통합:** 메모·Tiny Note·아카이브·설정·급식 설정·툴킷 설정·알림장·우클릭 메뉴 모두 동일한 H3+D1 경험을 제공합니다.

### 비목표
- 원격 웹폰트 CDN 의존 (100% 오프라인 로컬 자산 원칙).
- 검색창·즐겨찾기 저장소·무거운 문장 입력 미리보기 추가 (가벼운 드롭다운 UX 원칙 유지).
- `tidy-task-config.json` 등 기존 저장 스키마 변경 또는 `WINDOW_FIELDS` 추가 (`font-picker`는 저장소 무접근 임시 창).
- 신규 PostHog 행동 이벤트 추가 (`analytics.rs::window_kind`에 `"font-picker"` 분류만 명시 등록).

---

## 3. 내장 글꼴 72종 마스터 카탈로그 (`src/lib/fonts/fontCatalog.js`)

### 3.1 자산 병합 요약 (`src/assets/fonts/`)
- **기존 유지 (중복 33종):** `C:\Users\User\Desktop\vibecoding\fonts`와 동일한 33개 파일 그대로 유지 (교체 불필요).
- **기존 유지 (단독 보존 5종):** `KyoboHandwriting2019.woff2`, `KyoboHandwriting2023.woff2`, `KyoboHandwriting2024.woff2`, `KyoboHandwriting2025.woff2`, `Jalnan.woff2` **삭제하지 않고 그대로 유지**.
- **신규 복사 추가 (24종):** `C:\Users\User\Desktop\vibecoding\fonts`에만 있는 24개 `.woff2` 파일을 `src/assets/fonts/`로 복사.
- **최종 `src/assets/fonts/` 파일 수:** `38 + 24 = 62개 .woff2` (약 28MB, 로컬 온디맨드 디코딩 + `font-display: swap`).
- **하위 호환:** [src/lib/builtinFonts.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/builtinFonts.js)는 `FONT_CATALOG`를 평탄화해 기존과 동일한 `{ name, family }` 배열(`BUILTIN_FONTS`)을 export하며, 기존 48종 `name` 문자열은 단 1글자도 변경하지 않습니다.

### 3.2 6개 카테고리 · 43개 패밀리 행 · 72종 전체 매핑 마스터 테이블

#### ① `point` — 포인트 · 제목 (탭: `포인트`, 5행 / 12종)

| 행 표시명 | 하위 칩 | 내부 `name` (저장값) | CSS `font-family` | `.woff2` 파일명 | 상태 |
|---|---|---|---|---|---|
| 메이플스토리 *(대표: L)* | `L` | `메이플스토리 L` | `'메이플스토리 L', sans-serif` | `MaplestoryL.woff2` | 유지(기본) |
| ↳ | `B` | `메이플스토리 B` | `'메이플스토리 B', sans-serif` | `MaplestoryB.woff2` | 유지 |
| 쿠키런 *(대표: R)* | `R` | `쿠키런 R` | `'쿠키런 R', sans-serif` | `CookieRun_Regular.woff2` | **신규** |
| ↳ | `B` | `쿠키런 B` | `'쿠키런 B', sans-serif` | `CookieRun_Bold.woff2` | **신규** |
| ↳ | `Bk` | `쿠키런 Bk` | `'쿠키런 Bk', sans-serif` | `CookieRun_Black.woff2` | **신규** |
| 여기어때 잘난체 *(대표: 1)* | `1` | `여기어때 잘난체` | `'여기어때 잘난체', sans-serif` | `Jalnan.woff2` | **유지(보존)** |
| ↳ | `2` | `여기어때 잘난체 2` | `'여기어때 잘난체 2', sans-serif` | `Jalnan2.woff2` | **신규** |
| ↳ | `고딕` *(word)* | `여기어때 잘난체 고딕` | `'여기어때 잘난체 고딕', sans-serif` | `JalnanGothic.woff2` | **신규** |
| 배달의민족 *(대표: 도현)* | `도현` *(word)* | `배달의민족 도현` | `'배달의민족 도현', sans-serif` | `BMDOHYEON.woff2` | 유지 |
| ↳ | `주아` *(word)* | `배달의민족 주아` | `'배달의민족 주아', sans-serif` | `BMJUA.woff2` | 유지 |
| ↳ | `을지로` *(word)* | `배달의민족 을지로` | `'배달의민족 을지로', sans-serif` | `BMEULJIROTTF.woff2` | 유지 |
| KCC 간판체 | *(단독)* | `KCC 간판체` | `'KCC 간판체', sans-serif` | `KCC-Ganpan.woff2` | 유지 |

#### ② `gothic` — 깔끔한 고딕 (탭: `고딕`, 6행 / 17종)

| 행 표시명 | 하위 칩 | 내부 `name` (저장값) | CSS `font-family` | `.woff2` 파일명 | 상태 |
|---|---|---|---|---|---|
| 프리젠테이션 *(대표: R)* | `R` `M` `SB` `B` | `프리젠테이션 R` / `M` / `SB` / `B` | `'프리젠테이션 R/M/SB/B', sans-serif` | `Freesentation-4Regular/5Medium/6SemiBold/7Bold.woff2` | **신규(4)** |
| 페이퍼로지 *(대표: M)* | `M` `SB` `B` `EB` `Bk` | `페이퍼로지 M` / `SB` / `B` / `EB` / `Bk` | `'페이퍼로지 M/SB/B/EB/Bk', sans-serif` | `Paperlogy-5Medium/6SemiBold/7Bold/8ExtraBold/9Black.woff2` | **신규(5)** |
| G마켓 산스 *(대표: M)* | `L` `M` `B` | `G마켓 산스 L` / `M` / `B` | `'G마켓 산스 L/M/B', sans-serif` | `GmarketSansTTFLight/Medium/Bold.woff2` | **신규(3)** |
| 부크크 고딕 *(대표: L)* | `L` `B` | `부크크 고딕 L` / `B` | `'부크크 고딕 L/B', sans-serif` | `BookkGothic_Light/Bold.woff2` | **신규(2)** |
| 엘리스 DX 널리 *(대표: L)* | `L` `M` | `엘리스 DX 널리 L` / `M` | `'엘리스 DX 널리 L/M', sans-serif` | `EliceDXNeolliL/M.woff2` | 유지(2) |
| 엘리스 디지털배움 | *(단독)* | `엘리스 디지털배움` | `'엘리스 디지털배움', sans-serif` | `EliceDigitalBaeumR.woff2` | 유지 |

#### ③ `serif` — 단정한 명조 (탭: `명조`, 4행 / 6종)

| 행 표시명 | 하위 칩 | 내부 `name` (저장값) | CSS `font-family` | `.woff2` 파일명 | 상태 |
|---|---|---|---|---|---|
| 리디바탕 | *(단독)* | `리디바탕` | `'리디바탕', serif` | `RIDIBatang.woff2` | 유지 |
| 부크크 명조 *(대표: L)* | `L` `B` | `부크크 명조 L` / `B` | `'부크크 명조 L/B', serif` | `BookkMyungjo_Light/Bold.woff2` | **신규(2)** |
| 을유1945 *(대표: R)* | `R` `SB` | `을유1945 R` / `SB` | `'을유1945 R/SB', serif` | `Eulyoo1945-Regular/SemiBold.woff2` | **신규(2)** |
| Cafe24 단정해 | *(단독)* | `Cafe24 단정해` | `'Cafe24 단정해', serif` | `Cafe24Danjunghae-v2.0.woff2` | **신규** |

#### ④ `hand` — 감성 · 손글씨 (탭: `손글씨`, 6행 / 11종)

| 행 표시명 | 하위 칩 | 내부 `name` (저장값) | CSS `font-family` | `.woff2` 파일명 | 상태 |
|---|---|---|---|---|---|
| 교보 손글씨 *(대표: 24)* | `19` `23` `24` `25` | `교보 손글씨 2019` / `2023` / `2024` / `2025` | `'교보 손글씨 2019/2023/2024/2025', sans-serif` | `KyoboHandwriting2019/2023/2024/2025.woff2` | **유지(4종 보존)** |
| 온글잎 의연체 | *(단독)* | `온글잎 의연체` | `'온글잎 의연체', sans-serif` | `Ownglyph2022.woff2` | 유지 |
| 배달의민족 연성 | *(단독)* | `배달의민족 연성` | `'배달의민족 연성', sans-serif` | `BMYEONSUNG_ttf.woff2` | 유지 |
| Cafe24 *(대표: 동동)* | `동동` `쑥쑥` *(word)* | `Cafe24 동동` / `Cafe24 쑥쑥` | `'Cafe24 동동/쑥쑥', sans-serif` | `Cafe24Dongdong/Ssukssuk.woff2` | 유지(2) |
| KCC 도담도담 | *(단독)* | `KCC 도담도담` | `'KCC 도담도담', sans-serif` | `KCCDodamdodam.woff2` | 유지 |
| J개구쟁이체 *(대표: L)* | `L` `M` | `J개구쟁이체 L` / `M` | `'J개구쟁이체 L/M', sans-serif` | `JNaughtyL/M.woff2` | 유지(2) |

#### ⑤ `school` — 학교안심 꾸밈 (탭: `학교`, 12행 / 16종 · 목록 내 `'학교안심 '` 접두어 생략)

| 행 표시명 | 하위 칩 | 내부 `name` (저장값) | `.woff2` 파일명 | 상태 |
|---|---|---|---|---|
| 돌담 *(대표: M)* | `M` `B` | `학교안심 돌담 M` / `B` | `HakgyoansimDoldamM/B.woff2` | 유지(2) |
| 가을소풍 *(대표: L)* | `L` `B` | `학교안심 가을소풍 L` / `B` | `HakgyoansimGaeulsopungL/B.woff2` | 유지(2) |
| 나들이 *(대표: L)* | `L` `B` | `학교안심 나들이 L` / `B` | `SchoolSafeNadeuriL/B.woff2` | 유지(2) |
| 붓펜 *(대표: L)* | `L` `M` | `학교안심 붓펜 L` / `M` | `HakgyoansimButpenL/M.woff2` | 유지(2) |
| 봄방학 · 분필 · 은하수 · 꾸러기 · 꼬꼬마 · 맑은날 · 몽글 · 투호 | *(각 단독)* | `학교안심 봄방학` · `분필` · `은하수` · `꾸러기` · `꼬꼬마` · `맑은날 M` · `몽글` · `투호` | `HakgyoansimBombanghakR`, `BunpilR`, `EunhasuR`, `GgooreogiR`, `KkokkomaR`, `MalgeunnalM`, `MonggeulR`, `TuhoR` | 유지(8) |

#### ⑥ `system` — 시스템 기본 (탭: `기본`, 10행 / 10종)
- `맑은고딕`, `돋움`, `함초롬돋움`, `굴림`, `새굴림`, `바탕`, `바탕체`, `함초롬바탕`, `궁서`, `궁서체` (기존 `family` 100% 동일).

#### ⑦ `custom` — 내 글꼴 (탭: `내 글꼴`, 동적 섹션)
- 사용자가 설정 창에서 등록한 커스텀 `.ttf`/`.otf` 폰트가 **1개 이상 존재할 때만** 목록 최하단 섹션과 상단 8번째 탭(`내 글꼴`) 자동 생성.

### 3.3 라벨 함축 (`compactFontLabel`) 및 `matchFontName` 정밀 매칭 규칙
- **트리거 버튼 표시명 (`compactFontLabel(name, maxVisualWidth)`):**
  - 넓은 트리거(`field`, 설정 창 등): 공식 명칭 전체 표시 (예: `교보 손글씨 2024`, `학교안심 가을소풍 L`, `여기어때 잘난체 2`).
  - 좁은 툴바 트리거(`toolbar`, `< 110px`): 반복 접두어만 지능적으로 축약해 핵심 식별자가 `…`로 짤리지 않게 함.
    - `교보 손글씨 2024` → `교보 24`
    - `학교안심 가을소풍 L` → `가을소풍 L`
    - `배달의민족 을지로` → `배민 을지로`
    - `여기어때 잘난체 2` → `잘난체 2` / `여기어때 잘난체 고딕` → `잘난 고딕` / `여기어때 잘난체` → `잘난체`
    - `엘리스 디지털배움` → `엘리스 배움` / `엘리스 DX 널리 L` → `엘리스 L`
    - `메이플스토리 L` → `메이플 L` (폭 `< 82px`일 때만; 이상은 `메이플스토리 L`)
  - 모든 트리거의 `title` 툴팁에는 항상 공식 전체 명칭 표시.
- **`matchFontName` ([richTextFormat.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/editor/richTextFormat.js#L90-L135)) 검증:**
  - `여기어때 잘난체` vs `여기어때 잘난체 2` vs `여기어때 잘난체 고딕`, `바탕` vs `리디바탕` 등 접두어가 겹치는 폰트는 기존 1순위 정확 일치 + 3순위 최장 길이 우선 규칙으로 오매칭 방지(단위 테스트에 신규 3종 케이스 추가).

---

## 4. UI/UX · 픽셀 규격 · D1(에어리 포스트잇) 디자인 시스템

### 4.1 43행 전수 픽셀 예산 검증표 (가로 `252px`, 세로 `332px`)

> **핵심:** 패널 내부 타이포그래피는 호스트 창의 `uiFontSize`(`6pt~15pt`)에 따라 무너지지 않도록 고정 견본 스케일(`specimen: 13px`, `catPill: 10.5px`, `weightChip: 9.5px`)을 유지합니다.

| 항목 | 확정 치수 (논리 px) | 실측/검증 근거 (내부 가용 행 폭 = `252 - 12 - 8 - 14 = 218px`) |
|---|---|---|
| **표준 패널 너비** | **`252px`** | • 최장 5칩 행 `페이퍼로지`(63) + gap(6) + `M·SB·B·EB·Bk`(112) = **`181px` ≤ 218px** (37px 여유)<br>• 최장 광폭 3칩 행 `여기어때 잘난체`(104) + gap(6) + `1·2·고딕`(72) = **`182px` ≤ 218px** (36px 여유)<br>• `교보 손글씨`(66) + gap(6) + `19·23·24·25`(94) = **`166px` ≤ 218px** (52px 여유)<br>• `배달의민족`(65) + gap(6) + `도현·주아·을지로`(96) = **`167px` ≤ 218px** (51px 여유)<br>• `프리젠테이션`(75) + gap(6) + `R·M·SB·B`(85) = **`166px` ≤ 218px** (52px 여유) |
| **넓은 설정 트리거 연동 폭** | `clamp(252, triggerW, 288)` | 설정창(`~205px`)은 `252px` 우측 끝 맞춤, 툴킷 설정(`~256~272px`)은 트리거 폭과 **1:1 동일 폭** 밀착 |
| **표준 패널 높이** | **`332px`** | 상단 H3 탭 바(`34px`) + 스크롤 리스트(`298px` ≈ **9.5행** — 반 행 걸침으로 스크롤 존재 직관 암시) |
| **최소 수직 스냅 높이** | **`200px`** | `34px(탭) + 166px(약 5.5행)`. `200~331px` 구간에서는 옆으로 튕기지 않고 버튼에 붙은 채 세로 스크롤 |
| **트리거 밀착 간격 (`ANCHOR_GAP`)** | **`2px`** | 버튼 하단선과 패널 상단 불투명 1px 림 사이의 초밀착 틈 (`Zero-Halo` 투명 여백 `0px`) |
| **상단 H3 미니 카테고리 탭 바** | 기본 7탭: **`34px` (1줄)**<br>커스텀 포함 8탭: **`54px` (4×2 2줄)** | 기본 7탭(`전체` `포인트` `고딕` `명조` `손글씨` `학교` `기본`) 합계 폭 `~230px` ≤ `240px` → **가로 스크롤 없는 깔끔한 1줄** |
| **패밀리 행 / 굵기 칩** | 행 `min-height: 30px`, 칩 `h: 19px, min-w: 19px, gap: 2px` | `padding: 3px 6px 3px 8px`, 칩 `border-radius: 5px`. 단어형 칩(`도현`/`주아`/`을지로`/`고딕`/`동동`/`쑥쑥`)은 자체 고유 글꼴로 렌더링 |
| **커스텀 세로 스크롤바** | `width: 5px`, `scrollbar-gutter: stable` | 카테고리 필터링으로 항목 수가 줄어도 가로 레이아웃 0px 흔들림 + 상·하단 `14px` 동적 페이드 마스크 |

### 4.2 D1 (에어리 포스트잇) 시각 디테일 & `Zero-Halo Flush Edge`

- **창 프레임 (`Zero-Halo Flush Edge`):**
  - `html, body, #app`: `background: transparent !important; margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%;`
  - `.fp-root`: `width: 100%; height: 100%; border: 0; border-radius: 11px; background: var(--fp-surface); background-clip: padding-box; overflow: hidden; isolation: isolate; box-shadow: none;`
  - `.fp-root::after` (불투명 내측 1px 림): `position: absolute; inset: 0; z-index: 50; border-radius: inherit; pointer-events: none; box-shadow: inset 0 0 0 1px var(--fp-edge-solid);`
  - **밀착 악센트 심(Seam):** `data-side="below"`일 때 상단 내측 `1.5px`에 `--fp-seam` 미세 포인트 선, `data-side="above"`일 때 하단 내측 `1.5px`에 적용해 버튼과 시각적으로 착 연결.
- **경량 구성:** 타이틀바·닫기 버튼·검색창·하단 푸터 없이 상단 `34px` H3 카테고리 탭 + 글꼴 리스트만 배치.
- **호버 포인트 컬러 디테일 (`D1` 시그니처):**
  - **행 호버:** 좌측 끝(`left: 2px`)에 **`2.5px` 세로 포인트 알약 막대**가 `scaleY(0.45 → 1)` (`120ms cubic-bezier(0.2, 0.9, 0.3, 1)`)로 점등 + 행 배경 `--fp-accent-soft`(`12%` / 다크 `16%`) + 글꼴명 `--fp-accent-ink` 전환.
  - **굵기 칩 호버/포커스:** 칩이 `--fp-accent-solid` 배경 + `--fp-on-accent` 글자로 즉시 반전되고, **해당 행의 패밀리 이름 텍스트 자체가 실시간으로 그 굵기/시리즈 `.woff2` 글꼴로 변신**. (`title`에 공식 전체명 표시, 예: `교보 손글씨 2024`, `페이퍼로지 8 ExtraBold`).
  - **선택 상태:** 행 배경 `--fp-accent-med` + 좌측 포인트 막대 상시 점등 + 단독 폰트는 우측 테마 포인트 `Check(12px)`, 다중 패밀리는 선택된 굵기 칩 솔리드 점등.
  - **카테고리 구분 헤더 (`전체` 탭에서만 표시):** `5px` 포인트 컬러 파스텔 도트 + `10px` 세미볼드 라벨 + 우측 1px 연한 실선(`--fp-line`). 특정 카테고리 탭 선택 시 헤더 생략해 리스트 공간 극대화.

### 4.3 42조합 테마 컬러 토큰 (`src/lib/fonts/fontPickerTheme.js`)

> **절대 규칙:** `light-dark()` 사용 금지. 모든 토큰은 순수 함수 `resolveFontPickerTokens({ source, themeId, isDarkMode })`가 명시적 6자리 Hex 및 `rgba(...)`로 계산하며, WCAG AA 대비(`>= 4.5:1`)를 단위 테스트로 강제합니다.

| 토큰 | 라이트 모드 (`tidy` 15종) | 다크 모드 (`tidy` 15종) | `toolkit` 6종 매핑 |
|---|---|---|---|
| `--fp-surface` | `mixHex('#ffffff', theme.bg, 0.68)` | `mixHex('#232632', theme.accentDark, 0.93)` | 라이트 `mixHex('#ffffff', tk.bg, 0.65)` / 다크 `#252932` |
| `--fp-catbar` | `mixHex(theme.section, '#ffffff', 0.52)` | `mixHex('#1c1f29', theme.accentDark, 0.94)` | 라이트 `mixHex(tk.soft, '#ffffff', 0.45)` / 다크 `#1e222b` |
| `--fp-edge-solid` | `mixHex(theme.border, theme.accent, 0.78)` | `mixHex('#3a4054', theme.accentDark, 0.72)` | 라이트 `mixHex(tk.line, tk.accent, 0.78)` / 다크 `#464e62` |
| `--fp-seam` | `rgba(accent, 0.35)` | `rgba(accentDark, 0.42)` | `rgba(tkAccent, 0.38)` |
| `--fp-ink` / `--fp-muted` | `#1e293b` / `#5b677a` | `#e5e7eb` / `#9aa5b8` | `tk.ink` / `tk.muted` |
| `--fp-accent` | `theme.accent` | `theme.accentDark` | 라이트 `tk.accent` / 다크 `#93c5fd` 등 테마별 고대비 보정 |
| `--fp-accent-solid` | `ensureContrast(accent, '#ffffff', 4.6)` | `theme.accentDark` | 라이트 `tk.action` / 다크 보정 accent |
| `--fp-on-accent` | `#ffffff` | `#151822` | 라이트 `#ffffff` / 다크 `#151822` |
| `--fp-accent-ink` | `ensureContrast(accent, surface, 4.6)` | `theme.accentDark` | 대비 `>= 4.6` 보장 |
| `--fp-accent-soft` / `-med` | `rgba(accent, 0.12)` / `0.19` | `rgba(accentDark, 0.16)` / `0.24` | 동일 비율 |
| `--fp-chip-bg` / `--fp-line` | `rgba(#0f172a, 0.048)` / `0.08` | `rgba(#ffffff, 0.075)` / `0.09` | 동일 |
| `--fp-scroll` / `-hover` | `rgba(accent, 0.26)` / `0.50` | `rgba(accentDark, 0.30)` / `0.56` | 동일 |

---

## 5. 비이동 밀착 독립 팝업 창(`font-picker`) 아키텍처

### 5.1 창 생성 옵션 & 비이동 5중 보장

```js
export const FONT_PICKER_LABEL = 'font-picker';
export const FONT_PICKER_WINDOW_OPTIONS = Object.freeze({
  url: 'index.html',
  title: 'Tidy Task 글꼴 선택',
  width: 252,
  height: 332,
  decorations: false,
  transparent: true,
  shadow: false,
  resizable: false,
  maximizable: false,
  minimizable: false,
  alwaysOnTop: true,
  skipTaskbar: true,
  visible: false,
  focus: false,
});
```

1. **비이동(Non-Draggable) 절대 보장:** `windowDrag`·`startDragging()`·`data-tauri-drag-region` 전면 미사용.
2. **Zero-Halo `2px` 밀착 정렬:** `CARD_MARGIN = 0`, 물리 앵커(`innerPosition + getBoundingClientRect() × scaleFactor`) 기준 `gap = 2px`, `align: 'start' | 'end'`로 버튼 모서리와 1:1 정렬.
3. **높이 적응형 수직 스냅 (`placeFontPicker`):**
   - `availBelow >= idealH(332)` → `side: 'below'`, `height: 332`
   - `availAbove >= idealH(332)` → `side: 'above'`, `height: 332`
   - `max(availBelow, availAbove) >= minSnapH(200)` → 더 넓은 쪽에 **버튼과 계속 밀착**하며 `height = chosenAvail`로 압축 + 세로 스크롤! (옆으로 튕기지 않음)
   - 양쪽 모두 `< 200px`인 극소 화면만 `right → left → overlay` 순으로 폴백.
4. **호스트 밀착 수명주기 (Host-Docked Dismiss):**
   - 팝업 열림 중 호스트 창 `onMoved`(2px 초과), `onResized`, `onCloseRequested`, 내부 스크롤 컨테이너 `scroll`, 호스트 다른 영역 `pointerdown`, 업데이트 잠금(`writesFrozen`) 발생 시 즉시 `font-picker:close` 전송.
   - Rust `WindowEvent::Destroyed`에서도 `font-picker:requester-destroyed` 발행해 호스트 강제 종료 시 고아 팝업 0건 보장.
5. **다중 모니터 2-Pass DPI 보정 + 잔상 0ms:**
   - 배율이 다른 모니터 이동 시 `setSize`+`setPosition` 2회 적용 + `show()` 후 `verifyGeometry` 오차 `> 1px` 보정.
   - 닫기 직전 `revealed = false`로 빈 화면을 그린 뒤 `hide()`해 다음 열기 때 이전 테마·이전 스크롤 1프레임 번쩍임 원천 차단.

### 5.2 IPC 프로토콜 & 포커스/선택영역 보존 흐름

- **이벤트 (`FONT_PICKER_EVENTS`):** `font-picker:open`, `font-picker:close`, `font-picker:ping`, `font-picker:ready`, `font-picker:opened`, `font-picker:closed`, `font-picker:requester-destroyed`.
- **요청 정합성:** 요청마다 고유 `requestId` 발급, 오래된 응답 폐기. `ops = createSerialQueue()`로 `present`/`close` 직렬화.
- **토글 유예:** `pointerdown` 시점의 열림 상태 + `TOGGLE_GRACE_MS = 450ms`로 같은 버튼 재클릭 시 재열림 깜빡임 차단.
- **blur 이중 확인 (비이동 창 최적화):** `60ms` + `160ms` 이중 `win.isFocused()` 확인으로 OS 포커스 전환 미세 흔들림만 거르고 바깥 클릭 시 경쾌하게 닫힘.
- **에디터 선택 영역 보존:**
  - `MainToolbar`, `ArchiveToolbar`: `onBeforeOpen`에서 `saveSelection()` + `mousedown.preventDefault()` → `closed(select)` 수신 후 `restoreSelectionToEditor(true)` → `applyStyleDirect({ fontFamily })`.
  - `FloatingRTE` (Tiny Note): `onBeforeOpen`에서 `saveSelection()` + **`onSelChange`에 `fontPicker.openKey === 'floating-rte'` 가드 추가**해 팝업 열림 동안 플로팅 툴바 숨김 차단.
  - `NoticeboardApp`: `onBeforeOpen`에서 `editor?.holdForTools()` → `onSelect`에서 `format('font', name)`.
  - `SettingsModal`: 화면 글자 변경 시 트리거 버튼 기준 `holdInPlace` 호출로 스크롤 점프 방지.
- **비Tauri 브라우저 폴백:** `!isTauri()` 환경(`?header-preview`, `?font-picker-preview`, Playwright QA 등)에서는 `FontPickerTrigger`가 `position: fixed` body 포탈로 **동일한 `FontPickerPanel.svelte`**를 표시해 브라우저 검수와 실기 UI가 1:1 일치하도록 설계합니다.

---

## 6. 세부 실행 계획 (Detailed Step-by-Step Implementation Plan)

구현은 의존성 순서(DAG)에 따라 **4개 Phase · 18개 Step**으로 진행하며, 각 Phase 완료 시 자동화 테스트를 통과한 뒤 다음 Phase로 넘어갑니다.

### Phase 1 — 글꼴 자산 병합 & 순수 로직 모듈 구축 (Step 1 ~ Step 6)

| Step | 대상 파일 | 상세 작업 명세 | 완료 검증 |
|---|---|---|---|
| **1** | `src/assets/fonts/` | `C:\Users\User\Desktop\vibecoding\fonts\` 중 기존에 없는 **신규 24종 `.woff2`만 복사 추가**. 기존 **38종(교보 4종·`Jalnan.woff2` 포함)은 1개도 삭제하지 않음**. 총 62개 파일 수 검증. | PowerShell 파일 수 = `62` 확인 |
| **2** | [src/app.css](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/app.css) | 기존 38종 `@font-face` 유지 + 신규 24종 `@font-face` 추가 (총 62개 선언, 모두 `font-display: swap`). `font-family` 명칭은 3.2절 마스터 테이블의 내부 `name`과 1글자도 틀리지 않게 일치. | 파일 경로 오타 0건 (Step 3 테스트가 FS 대조 검증) |
| **3** | `src/lib/fonts/fontCatalog.js`<br>`src/lib/fonts/fontCatalog.test.js` | • `FONT_CATEGORIES`, `FONT_CATALOG` (6카테고리 · 43패밀리 · 72종), `flattenBuiltinFonts()`, `buildFontCatalog(customFonts)`, `findFontByName(name, customFonts)`, `findCategoryOfFont(name, customFonts)`, `compactFontLabel(name, narrow)`, `resolveFontFamilyStack(name, customFonts)` 구현.<br>• 테스트: 실제 `src/assets/fonts/` 62개 `.woff2` 파일 및 `src/app.css` `@font-face`와 카탈로그가 1:1 일치하는지 정적 검증 + 기존 48종 이름 전수 보존 확인 + `compactFontLabel` 경계값 검증. | `node --test src/lib/fonts/fontCatalog.test.js` |
| **4** | [src/lib/builtinFonts.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/builtinFonts.js)<br>[src/lib/editor/richTextFormat.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/editor/richTextFormat.js)<br>[src/lib/editor/richTextFormat.test.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/editor/richTextFormat.test.js) | • `builtinFonts.js`가 `flattenBuiltinFonts()` 결과를 `BUILTIN_FONTS`로 export(기존 shape `{ name, family }` 100% 유지, 길이 72).<br>• `richTextFormat.test.js`에 `'여기어때 잘난체'` vs `'여기어때 잘난체 2'` vs `'여기어때 잘난체 고딕'`, `'교보 손글씨 2019'`~`'2025'`, `'페이퍼로지 M'`~`'Bk'` 정확 매칭 테스트 추가. | `node --test src/lib/editor/richTextFormat.test.js src/lib/dday/ddayControlTheme.test.js src/lib/toolkit/fontMetrics.test.js` |
| **5** | `src/lib/fonts/fontPickerTheme.js`<br>`src/lib/fonts/fontPickerTheme.test.js` | • `resolveFontPickerTokens({ source, themeId, isDarkMode })` 및 `fontPickerThemeToStyle(tokens)`, `sanitizeFontPickerThemeStyle(css)` 구현.<br>• Tidy 15종(×2) + Toolkit 6종(×2) = 42조합 전수 WCAG 상대 휘도 대비(`>= 4.6:1`) 계산 검증, `light-dark()` 금지 검증, 6자리 Hex/rgba 형식 검증. | `node --test src/lib/fonts/fontPickerTheme.test.js` |
| **6** | `src/lib/fonts/fontPickerProtocol.js`<br>`src/lib/fonts/fontPickerProtocol.test.js` | • `FONT_PICKER_LABEL`, `FONT_PICKER_EVENTS`, `FONT_PICKER_WINDOW_OPTIONS`, `CLOSE_REASONS`, `STANDARD_WIDTH = 252`, `STANDARD_HEIGHT = 332`, `MIN_SNAP_HEIGHT = 200`, `ANCHOR_GAP = 2`, `EDGE_PADDING = 6` 정의.<br>• `placeFontPicker()` 높이 적응형 수직 밀착 배치 알고리즘 + `normalizeOpenPayload()`, `normalizeClosedPayload()`, `changesValue()`, `returnsFocus()` 구현.<br>• 테스트: Case A~E 전 분기, `align: 'start' | 'end'`, 4K 200%+FHD 100% 다중 모니터 환산, 200×45 Tiny Note 및 1280×720@150% 노트북 화면, 악성 입력 차단 검증. | `node --test src/lib/fonts/fontPickerProtocol.test.js` |

### Phase 2 — 독립 팝업 창 · 패널 · 클라이언트 · Rust 안전장치 (Step 7 ~ Step 11)

| Step | 대상 파일 | 상세 작업 명세 | 완료 검증 |
|---|---|---|---|
| **7** | `src/components/fontPicker/FontPickerPanel.svelte` | • **H3 + D1 (에어리 포스트잇)** 공용 코어 컴포넌트.<br>• Props: `value`, `customFonts`, `extraOptions`, `themeStyle`, `side`, `variant` (`'window' | 'inline'`), `maxHeight`, `onSelect`, `onCancel`.<br>• 상단 1줄 미니 카테고리 탭(`전체 · 포인트 · 고딕 · 명조 · 손글씨 · 학교 · 기본` + 동적 `내 글꼴`), 행 우측 인라인 굵기 칩, 칩 호버/포커스 시 패밀리명 실시간 폰트 전환, D1 좌측 `2.5px` 포인트 막대 + `12%` 틴트, 상·하단 동적 스크롤 페이드 마스크, 키보드 방향키(`↑↓←→`/`Tab`/`Home`/`End`/`Enter`/`Esc`), 열림 시 선택 항목 중앙 스크롤.<br>• `variant === 'window'`일 때 `Zero-Halo Flush Edge` (`::after` 불투명 내측 1px 림 + 밀착 변 `--fp-seam`). | `npm run check` |
| **8** | `src/components/fontPicker/FontPickerWindow.svelte` | • `font-picker` 전용 독립 창 루트.<br>• 비이동(Non-Draggable) 고정, `createSerialQueue` 직렬 `present`/`close`, `watchCustomFonts` + payload 커스텀 폰트 `registerFontFace`, `placeFontPicker` + 2-pass `applyGeometry` + `verifyGeometry`, `revealed` 2단계 표시(숨기기 전 `revealed = false`), `60ms + 160ms` 이중 `blur` 확인, `requester-destroyed` 리스너, `select`/`escape` 시 숨기기 전 요청 창 `setFocus()`. | `npm run check` |
| **9** | `src/lib/fonts/fontPickerClient.svelte.js`<br>`src/components/fontPicker/FontPickerTrigger.svelte` | • `FontPickerClient`: `openKey` (`$state`), `schedulePrewarm(1800)`, `isToggleTarget(key)` (`TOGGLE_GRACE_MS = 450`), `open(options)`, `close(reason)`. 열림 중 호스트 `onMoved`(2px 임계), `onResized`, `onCloseRequested`, 외부 스크롤/바깥 클릭 감시 및 해제.<br>• `FontPickerTrigger.svelte`: `variant` (`'toolbar' | 'toolbar-compact' | 'field'`), `align`, `value`, `themeSource`, `themeId`, `isDarkMode`, `customFonts`, `extraOptions`, `disabled`, `onBeforeOpen`, `onSelect`, `focusAfter`.<br>• `!isTauri()` 환경에서는 `position: fixed` body 포탈로 `FontPickerPanel.svelte` 자동 렌더링(브라우저 프리뷰·Playwright QA 완벽 호환). | `npm run check` |
| **10** | [src/main.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/main.js)<br>[src/App.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/App.svelte)<br>[src/lib/windows/windowLabels.js](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/lib/windows/windowLabels.js) | • `main.js`: `label === FONT_PICKER_LABEL` 최상단 조기 분기 (`FontPickerWindow.svelte` 마운트, `App`/`appState` 미실행) + 개발용 `?font-picker-preview` 분기 추가. `label === FONT_PICKER_LABEL`일 때 `initAnalytics()` 건너뛰기(임시 UI 창이 분석 세션에 잡음 안 넣게).<br>• `App.svelte`: 메모 창 준비 후 `fontPicker.schedulePrewarm(1800)` 호출, `writesFrozen` / `update-prepare` / 롤업 전환 시 `fontPicker.close('frozen')`. | `npm run check` |
| **11** | [src-tauri/src/tray.rs](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src-tauri/src/tray.rs)<br>[src-tauri/src/analytics.rs](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src-tauri/src/analytics.rs)<br>[src-tauri/src/lib.rs](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src-tauri/src/lib.rs) | • `tray.rs`: `TRANSIENT_LABELS`에 `"font-picker"` 추가 (`[&str; 5]`) + 단위 테스트 추가.<br>• `analytics.rs`: `window_kind("font-picker") => "other"` 명시 분기 + 기존 분류 테스트 통과 확인.<br>• `lib.rs`: `WindowEvent::Destroyed`에서 `destroyed_label != "font-picker"`일 때 `"font-picker"` 창이 살아 있으면 `emit_to("font-picker", "font-picker:requester-destroyed", { label })` 전송. `has_active_notes`에는 `"font-picker"` 미포함 유지. | `cargo test --manifest-path src-tauri/Cargo.toml` |

### Phase 3 — 전 8개 화면 통합 & 개발 프리뷰 (Step 12 ~ Step 15)

| Step | 대상 파일 | 상세 작업 명세 | 완료 검증 |
|---|---|---|---|
| **12** | [MainToolbar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/MainToolbar.svelte)<br>[FloatingRTE.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/FloatingRTE.svelte)<br>[ArchiveToolbar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/ArchiveToolbar.svelte) | • 3개 서식 툴바의 네이티브 `<select>`를 `<FontPickerTrigger>` (`align="start"`)로 교체.<br>• `MainToolbar`: 클래식/모던 헤더 디자인 양쪽 높이(`--header-control-h`)·테마 변수(`--header-field`/`--header-line`/`--header-accent`) 완벽 계승. `editorControls` `mousedown` 예외에 `.fp-trigger` 포함 + `onBeforeOpen={saveSelection}`.<br>• `FloatingRTE`: **`onSelChange` 숨김 조건에 `&& fontPicker.openKey !== 'floating-rte'`** 추가해 팝업 열림 중 툴바 유지.<br>• `ArchiveToolbar`: `dark` 및 테마 색상 전달, `saveSelection` → `applyStyleDirect` 유지. | `npm run check` |
| **13** | [SettingsModal.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/SettingsModal.svelte)<br>[MealSettingsWindow.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/meal/MealSettingsWindow.svelte)<br>[ToolkitSettings.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/toolkit/ToolkitSettings.svelte)<br>[NoticeboardApp.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/noticeboard/NoticeboardApp.svelte) | • `SettingsModal`: 메모 글자·화면 글자 2곳의 `<select>`를 `<FontPickerTrigger variant="field" align="end">`로 교체. 화면 글자 변경 시 `holdInPlace` 유지. `scrollBox` 스크롤 시 `fontPicker.close('host-scrolled')`.<br>• `MealSettingsWindow`: `extraOptions={[{ value: 'follow', label: '메인 창과 동일' }]}` 전달, 급식 테마 연동.<br>• `ToolkitSettings`: UI 글꼴 `ToolkitSelect`를 `<FontPickerTrigger variant="field" align="end" themeSource="toolkit">`로 교체.<br>• `NoticeboardApp`: `<select>`를 `<FontPickerTrigger variant="toolbar" align="start" themeSource="toolkit">`로 교체 (`onBeforeOpen={() => editor?.holdForTools()}`). | `npm run check` |
| **14** | [ContextFormatBar.svelte](file:///c:/Users/User/Desktop/vibecoding/Tidy-Task-Local/src/components/context-menu/ContextFormatBar.svelte) | • `activeDrawer === 'font'` 드로어 내부 평면 목록을 `<FontPickerPanel variant="inline" maxHeight={216} ... />`로 교체. 우클릭 메뉴 `ctx-menu`의 테마 토큰과 연동하고 `ContextMenu.svelte`의 `syncStandaloneBounds`로 자연 리사이즈. | `npm run check` |
| **15** | `src/dev/FontPickerPreview.svelte` | • `?font-picker-preview` 개발·QA 전용 하네스 작성 (15종 Tidy 테마 + 6종 Toolkit 테마, 라이트/다크 토글, 72종 + 커스텀 폰트 주입, 창 크기 프리셋 `380×500`/`280×210`/`200×180`/`360×560`, 호버 굵기 프리뷰 검증). | Vite dev 서버 브라우저 확인 |

### Phase 4 — 전수 자동화 테스트 · 시각 QA · 네이티브 실기 검증 (Step 16 ~ Step 18)

| Step | 검증 영역 | 실행 커맨드 및 기준 |
|---|---|---|
| **16** | **단위 테스트 & 정적 타입·접근성 & Rust 테스트** | • `npm test` (기존 + 신규 `fontCatalog`/`fontPickerTheme`/`fontPickerProtocol` 전수 PASS)<br>• `npm run check` (Svelte 5 / TypeScript / A11y 0 에러)<br>• `cargo test --manifest-path src-tauri/Cargo.toml` (`tray.rs`, `analytics.rs` 포함 전수 PASS) |
| **17** | **Playwright 자동 시각 검수 (`scripts/qa-font-picker.cjs`)** | • 캡처 출력: `output/qa/font-picker/`<br>• 검증 매트릭스: 앰버/블루/로즈/크라프트/페리윙클(라이트·다크), 툴킷 세이지/오션, 커스텀 폰트 8탭 전환, `교보 손글씨`·`여기어때 잘난체`·`페이퍼로지` 칩 호버 시 실제 폰트 변경 및 가로 잘림 `scrollWidth <= clientWidth` 단언, `SettingsModal`(`?header-preview&settings`)·`ContextMenu`(`?context-menu-preview=text`)·`FontPickerPreview` 실캡처 육안 검수. |
| **18** | **네이티브 Windows Tauri 실기 검수 (수동 + 기록)** | • 아래 7장 체크리스트 전수 확인 후 `docs/QA-font-picker.md` 작성 (네이티브 검증 결과와 미확인 항목 분리 기록). |

---

## 7. 완료 기준 (Definition of Done) & 네이티브 실기 검수표

### 자동화 검증 (필수 통과)
- [ ] `src/assets/fonts/`에 62개 `.woff2` (기존 38종 무삭제 + 신규 24종) 존재, `fontCatalog.test.js` FS·CSS 1:1 대조 통과.
- [ ] `npm test` 100% 통과 (기존 48종 하위 호환 테스트 포함).
- [ ] `npm run check` 0 에러.
- [ ] `cargo test` 100% 통과 (`tray::TRANSIENT_LABELS` + `analytics::window_kind`).
- [ ] Playwright 시각 QA: 43행 전수 가로 오버플로우 0px, 7탭 1줄 수납, 42조합 테마 대비 ≥ 4.6:1, 커스텀 스크롤바 정상.

### 네이티브 Windows Tauri 실기 검수
- [ ] **밀착 & 비이동:** 모든 창에서 버튼 바로 아래 `2px` · 좌/우 끝 1:1 정렬로 열리고, 패널 어디를 끌어도 1px도 움직이지 않음.
- [ ] **Zero-Halo:** 100% / 125% / 150% / 200% DPI에서 둥근 모서리 밖 흰 선·직각 그림자·잔상 0px.
- [ ] **초소형 창 무잘림:** Tiny Note `200×120`, 메모 창 `280×210`, 설정 창 `360×400`에서 창 바깥으로 `252×332` 온전한 패널이 잘림 없이 표시됨.
- [ ] **호스트 동기화 닫힘:** 팝업 열림 중 호스트 창 이동·리사이즈·스크롤·최소화·롤업·닫기 시 즉시 닫혀 고아 팝업이 남지 않음.
- [ ] **리치 텍스트 선택 보존:** `MainToolbar`, `FloatingRTE`(Tiny Note — 툴바가 사라지지 않음), `ArchiveToolbar`, `NoticeboardApp`에서 드래그한 텍스트의 글꼴만 정확히 변경됨.
- [ ] **고유 글꼴 & 호버 디테일:** 기존 `교보 손글씨 2019~2025`·`여기어때 잘난체` 포함 72종 모두 고유 글꼴로 렌더링되며, 칩 호버 시 패밀리명 실시간 글꼴 변경 + D1 좌측 `2.5px` 포인트 컬러 막대 점등.
- [ ] **다중 모니터 & 트레이 안전:** 4K 200% ↔ FHD 100% 이동 후 크기/좌표 정확, 같은 버튼 재클릭 토글 깔끔, 트레이 "좌표 초기화" 시 숨은 `font-picker` 미노출.
