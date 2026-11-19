// ═══════════════════════════════════════════════════════════════════
// [내장 글꼴 72종 위계 카탈로그] 글꼴 목록·패밀리 묶음·축약 라벨의 단일 원천입니다.
//
// 왜 평면 배열(BUILTIN_FONTS)과 분리해 위계 모델을 두는가:
//   72종(기존 38종 woff2 무삭제 보존 + 신규 24종 woff2 + 시스템 10종)을 평면으로 나열하면
//   스크롤이 과도하게 길어지고 같은 서체의 굵기(L·M·SB·B·EB·Bk)나 시리즈(교보 19~25, 잘난체 1·2·고딕)를
//   한눈에 비교하기 어렵습니다.
//   이 파일이 단일 원천이 되어:
//     ① builtinFonts.js는 이 목록을 평탄화해 기존 { name, family } 계약을 100% 유지하고,
//     ② H3 글꼴 선택 패널(FontPickerPanel)은 6카테고리 · 43패밀리 행으로 깔끔하게 표시합니다.
// ═══════════════════════════════════════════════════════════════════

/**
 * @typedef {'point' | 'gothic' | 'serif' | 'hand' | 'school' | 'system' | 'custom'} FontCategoryId
 *
 * @typedef {{
 *   name: string,
 *   family: string,
 *   chip: string,
 *   fullLabel: string,
 *   isWordChip?: boolean,
 *   file?: string,
 *   isCustom?: boolean,
 * }} FontVariant
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   fullName: string,
 *   defaultVariant?: string,
 *   variants: readonly FontVariant[],
 * }} FontFamilyGroup
 *
 * @typedef {{
 *   id: FontCategoryId,
 *   label: string,
 *   tabLabel: string,
 *   families: readonly FontFamilyGroup[],
 * }} FontCategorySection
 *
 * @typedef {{ name: string, path?: string }} CustomFontEntry
 */

/** @param {string} name @param {string} [fallback] */
function bundledFamily(name, fallback = 'sans-serif') {
  return `"${name}", ${fallback}`;
}

/**
 * @param {string} name
 * @param {string} chip
 * @param {string} fullLabel
 * @param {string} file
 * @param {{ isWordChip?: boolean, fallback?: string }} [opts]
 * @returns {FontVariant}
 */
function v(name, chip, fullLabel, file, opts = {}) {
  return Object.freeze({
    name,
    family: bundledFamily(name, opts.fallback || 'sans-serif'),
    chip,
    fullLabel,
    isWordChip: opts.isWordChip === true,
    file,
  });
}

/** @param {string} id @param {string} name @param {string} file @param {{ label?: string, fallback?: string }} [opts] @returns {FontFamilyGroup} */
function single(id, name, file, opts = {}) {
  return Object.freeze({
    id,
    label: opts.label || name,
    fullName: name,
    defaultVariant: name,
    variants: Object.freeze([v(name, '', name, file, { fallback: opts.fallback })]),
  });
}

/** @param {string} id @param {string} name @param {string} family @returns {FontFamilyGroup} */
function systemFont(id, name, family) {
  return Object.freeze({
    id,
    label: name,
    fullName: name,
    defaultVariant: name,
    variants: Object.freeze([
      Object.freeze({
        name,
        family,
        chip: '',
        fullLabel: name,
        isWordChip: false,
      }),
    ]),
  });
}

/**
 * 내장 글꼴 72종 (6개 카테고리 · 43개 패밀리 행 · 62개 .woff2 + 10개 시스템 폰트).
 * 기존 48종의 내부 `name` 값은 단 1글자도 바꾸지 않아 기존 저장 데이터와 100% 호환됩니다.
 * @type {readonly FontCategorySection[]}
 */
export const FONT_CATALOG = Object.freeze([
  Object.freeze({
    id: 'point',
    label: '포인트 · 제목',
    tabLabel: '포인트',
    families: Object.freeze([
      Object.freeze({
        id: 'maplestory',
        label: '메이플스토리',
        fullName: '메이플스토리',
        defaultVariant: '메이플스토리 L',
        variants: Object.freeze([
          v('메이플스토리 L', 'L', '메이플스토리 Light', 'MaplestoryL.woff2'),
          v('메이플스토리 B', 'B', '메이플스토리 Bold', 'MaplestoryB.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'cookierun',
        label: '쿠키런',
        fullName: '쿠키런',
        defaultVariant: '쿠키런 R',
        variants: Object.freeze([
          v('쿠키런 R', 'R', '쿠키런 Regular', 'CookieRun_Regular.woff2'),
          v('쿠키런 B', 'B', '쿠키런 Bold', 'CookieRun_Bold.woff2'),
          v('쿠키런 Bk', 'Bk', '쿠키런 Black', 'CookieRun_Black.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'jalnan',
        label: '여기어때 잘난체',
        fullName: '여기어때 잘난체',
        defaultVariant: '여기어때 잘난체',
        variants: Object.freeze([
          v('여기어때 잘난체', '1', '여기어때 잘난체', 'Jalnan.woff2'),
          v('여기어때 잘난체 2', '2', '여기어때 잘난체 2', 'Jalnan2.woff2'),
          v('여기어때 잘난체 고딕', '고딕', '여기어때 잘난체 고딕', 'JalnanGothic.woff2', { isWordChip: true }),
        ]),
      }),
      Object.freeze({
        id: 'bm-title',
        label: '배달의민족',
        fullName: '배달의민족',
        defaultVariant: '배달의민족 도현',
        variants: Object.freeze([
          v('배달의민족 도현', '도현', '배달의민족 도현', 'BMDOHYEON.woff2', { isWordChip: true }),
          v('배달의민족 주아', '주아', '배달의민족 주아', 'BMJUA.woff2', { isWordChip: true }),
          v('배달의민족 을지로', '을지로', '배달의민족 을지로', 'BMEULJIROTTF.woff2', { isWordChip: true }),
        ]),
      }),
      single('kcc-ganpan', 'KCC 간판체', 'KCC-Ganpan.woff2'),
    ]),
  }),

  Object.freeze({
    id: 'gothic',
    label: '깔끔한 고딕',
    tabLabel: '고딕',
    families: Object.freeze([
      Object.freeze({
        id: 'freesentation',
        label: '프리젠테이션',
        fullName: '프리젠테이션',
        defaultVariant: '프리젠테이션 R',
        variants: Object.freeze([
          v('프리젠테이션 R', 'R', '프리젠테이션 4 Regular', 'Freesentation-4Regular.woff2'),
          v('프리젠테이션 M', 'M', '프리젠테이션 5 Medium', 'Freesentation-5Medium.woff2'),
          v('프리젠테이션 SB', 'SB', '프리젠테이션 6 SemiBold', 'Freesentation-6SemiBold.woff2'),
          v('프리젠테이션 B', 'B', '프리젠테이션 7 Bold', 'Freesentation-7Bold.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'paperlogy',
        label: '페이퍼로지',
        fullName: '페이퍼로지',
        defaultVariant: '페이퍼로지 M',
        variants: Object.freeze([
          v('페이퍼로지 M', 'M', '페이퍼로지 5 Medium', 'Paperlogy-5Medium.woff2'),
          v('페이퍼로지 SB', 'SB', '페이퍼로지 6 SemiBold', 'Paperlogy-6SemiBold.woff2'),
          v('페이퍼로지 B', 'B', '페이퍼로지 7 Bold', 'Paperlogy-7Bold.woff2'),
          v('페이퍼로지 EB', 'EB', '페이퍼로지 8 ExtraBold', 'Paperlogy-8ExtraBold.woff2'),
          v('페이퍼로지 Bk', 'Bk', '페이퍼로지 9 Black', 'Paperlogy-9Black.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'gmarket',
        label: 'G마켓 산스',
        fullName: 'G마켓 산스',
        defaultVariant: 'G마켓 산스 M',
        variants: Object.freeze([
          v('G마켓 산스 L', 'L', 'G마켓 산스 Light', 'GmarketSansTTFLight.woff2'),
          v('G마켓 산스 M', 'M', 'G마켓 산스 Medium', 'GmarketSansTTFMedium.woff2'),
          v('G마켓 산스 B', 'B', 'G마켓 산스 Bold', 'GmarketSansTTFBold.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'bookk-gothic',
        label: '부크크 고딕',
        fullName: '부크크 고딕',
        defaultVariant: '부크크 고딕 L',
        variants: Object.freeze([
          v('부크크 고딕 L', 'L', '부크크 고딕 Light', 'BookkGothic_Light.woff2'),
          v('부크크 고딕 B', 'B', '부크크 고딕 Bold', 'BookkGothic_Bold.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'elice-neolli',
        label: '엘리스 DX 널리',
        fullName: '엘리스 DX 널리',
        defaultVariant: '엘리스 DX 널리 L',
        variants: Object.freeze([
          v('엘리스 DX 널리 L', 'L', '엘리스 DX 널리 Light', 'EliceDXNeolliL.woff2'),
          v('엘리스 DX 널리 M', 'M', '엘리스 DX 널리 Medium', 'EliceDXNeolliM.woff2'),
        ]),
      }),
      single('elice-baeum', '엘리스 디지털배움', 'EliceDigitalBaeumR.woff2'),
    ]),
  }),

  Object.freeze({
    id: 'serif',
    label: '단정한 명조',
    tabLabel: '명조',
    families: Object.freeze([
      single('ridi-batang', '리디바탕', 'RIDIBatang.woff2', { fallback: 'serif' }),
      Object.freeze({
        id: 'bookk-myungjo',
        label: '부크크 명조',
        fullName: '부크크 명조',
        defaultVariant: '부크크 명조 L',
        variants: Object.freeze([
          v('부크크 명조 L', 'L', '부크크 명조 Light', 'BookkMyungjo_Light.woff2', { fallback: 'serif' }),
          v('부크크 명조 B', 'B', '부크크 명조 Bold', 'BookkMyungjo_Bold.woff2', { fallback: 'serif' }),
        ]),
      }),
      Object.freeze({
        id: 'eulyoo-1945',
        label: '을유1945',
        fullName: '을유1945',
        defaultVariant: '을유1945 R',
        variants: Object.freeze([
          v('을유1945 R', 'R', '을유1945 Regular', 'Eulyoo1945-Regular.woff2', { fallback: 'serif' }),
          v('을유1945 SB', 'SB', '을유1945 SemiBold', 'Eulyoo1945-SemiBold.woff2', { fallback: 'serif' }),
        ]),
      }),
      single('cafe24-danjunghae', 'Cafe24 단정해', 'Cafe24Danjunghae-v2.0.woff2', { fallback: 'serif' }),
    ]),
  }),

  Object.freeze({
    id: 'hand',
    label: '감성 · 손글씨',
    tabLabel: '손글씨',
    families: Object.freeze([
      Object.freeze({
        id: 'kyobo-handwriting',
        label: '교보 손글씨',
        fullName: '교보 손글씨',
        defaultVariant: '교보 손글씨 2024',
        variants: Object.freeze([
          v('교보 손글씨 2019', '19', '교보 손글씨 2019', 'KyoboHandwriting2019.woff2'),
          v('교보 손글씨 2023', '23', '교보 손글씨 2023', 'KyoboHandwriting2023.woff2'),
          v('교보 손글씨 2024', '24', '교보 손글씨 2024', 'KyoboHandwriting2024.woff2'),
          v('교보 손글씨 2025', '25', '교보 손글씨 2025', 'KyoboHandwriting2025.woff2'),
        ]),
      }),
      single('ownglyph-2022', '온글잎 의연체', 'Ownglyph2022.woff2'),
      single('bm-yeonsung', '배달의민족 연성', 'BMYEONSUNG_ttf.woff2'),
      Object.freeze({
        id: 'cafe24-hand',
        label: 'Cafe24',
        fullName: 'Cafe24 손글씨',
        defaultVariant: 'Cafe24 동동',
        variants: Object.freeze([
          v('Cafe24 동동', '동동', 'Cafe24 동동', 'Cafe24Dongdong.woff2', { isWordChip: true }),
          v('Cafe24 쑥쑥', '쑥쑥', 'Cafe24 쑥쑥', 'Cafe24Ssukssuk.woff2', { isWordChip: true }),
        ]),
      }),
      single('kcc-dodamdodam', 'KCC 도담도담', 'KCCDodamdodam.woff2'),
      Object.freeze({
        id: 'j-naughty',
        label: 'J개구쟁이체',
        fullName: 'J개구쟁이체',
        defaultVariant: 'J개구쟁이체 L',
        variants: Object.freeze([
          v('J개구쟁이체 L', 'L', 'J개구쟁이체 Light', 'JNaughtyL.woff2'),
          v('J개구쟁이체 M', 'M', 'J개구쟁이체 Medium', 'JNaughtyM.woff2'),
        ]),
      }),
    ]),
  }),

  Object.freeze({
    id: 'school',
    label: '학교안심 꾸밈',
    tabLabel: '학교',
    // 카테고리 제목이 "학교안심"이므로 개별 행에서는 반복 접두어를 생략해 252px 폭에서 짤림을 방지합니다.
    families: Object.freeze([
      Object.freeze({
        id: 'hak-doldam',
        label: '돌담',
        fullName: '학교안심 돌담',
        defaultVariant: '학교안심 돌담 M',
        variants: Object.freeze([
          v('학교안심 돌담 M', 'M', '학교안심 돌담 Medium', 'HakgyoansimDoldamM.woff2'),
          v('학교안심 돌담 B', 'B', '학교안심 돌담 Bold', 'HakgyoansimDoldamB.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'hak-gaeulsopung',
        label: '가을소풍',
        fullName: '학교안심 가을소풍',
        defaultVariant: '학교안심 가을소풍 L',
        variants: Object.freeze([
          v('학교안심 가을소풍 L', 'L', '학교안심 가을소풍 Light', 'HakgyoansimGaeulsopungL.woff2'),
          v('학교안심 가을소풍 B', 'B', '학교안심 가을소풍 Bold', 'HakgyoansimGaeulsopungB.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'hak-nadeuri',
        label: '나들이',
        fullName: '학교안심 나들이',
        defaultVariant: '학교안심 나들이 L',
        variants: Object.freeze([
          v('학교안심 나들이 L', 'L', '학교안심 나들이 Light', 'SchoolSafeNadeuriL.woff2'),
          v('학교안심 나들이 B', 'B', '학교안심 나들이 Bold', 'SchoolSafeNadeuriB.woff2'),
        ]),
      }),
      Object.freeze({
        id: 'hak-butpen',
        label: '붓펜',
        fullName: '학교안심 붓펜',
        defaultVariant: '학교안심 붓펜 L',
        variants: Object.freeze([
          v('학교안심 붓펜 L', 'L', '학교안심 붓펜 Light', 'HakgyoansimButpenL.woff2'),
          v('학교안심 붓펜 M', 'M', '학교안심 붓펜 Medium', 'HakgyoansimButpenM.woff2'),
        ]),
      }),
      single('hak-bombanghak', '학교안심 봄방학', 'HakgyoansimBombanghakR.woff2', { label: '봄방학' }),
      single('hak-bunpil', '학교안심 분필', 'HakgyoansimBunpilR.woff2', { label: '분필' }),
      single('hak-eunhasu', '학교안심 은하수', 'HakgyoansimEunhasuR.woff2', { label: '은하수' }),
      single('hak-ggooreogi', '학교안심 꾸러기', 'HakgyoansimGgooreogiR.woff2', { label: '꾸러기' }),
      single('hak-kkokkoma', '학교안심 꼬꼬마', 'HakgyoansimKkokkomaR.woff2', { label: '꼬꼬마' }),
      single('hak-malgeunnal', '학교안심 맑은날 M', 'HakgyoansimMalgeunnalM.woff2', { label: '맑은날' }),
      single('hak-monggeul', '학교안심 몽글', 'HakgyoansimMonggeulR.woff2', { label: '몽글' }),
      single('hak-tuho', '학교안심 투호', 'HakgyoansimTuhoR.woff2', { label: '투호' }),
    ]),
  }),

  Object.freeze({
    id: 'system',
    label: '시스템 기본',
    tabLabel: '기본',
    families: Object.freeze([
      systemFont('sys-malgun', '맑은고딕', '"Malgun Gothic", "맑은 고딕", sans-serif'),
      systemFont('sys-dotum', '돋움', '"Dotum", sans-serif'),
      systemFont('sys-hdotum', '함초롬돋움', '"Hamchorom Dotum", sans-serif'),
      systemFont('sys-gulim', '굴림', '"Gulim", sans-serif'),
      systemFont('sys-ngulim', '새굴림', '"New Gulim", sans-serif'),
      systemFont('sys-batang', '바탕', '"Batang", serif'),
      systemFont('sys-batangche', '바탕체', '"BatangChe", serif'),
      systemFont('sys-hbatang', '함초롬바탕', '"Hamchorom Batang", serif'),
      systemFont('sys-gungsuh', '궁서', '"Gungsuh", serif'),
      systemFont('sys-gungsuhche', '궁서체', '"GungsuhChe", serif'),
    ]),
  }),
]);

/**
 * 평면 배열 형식(`{ name, family }`)으로 펼친 내장 글꼴 72종.
 * 시스템 기본 10종을 포함해 기존 `BUILTIN_FONTS` 소비자(appState, MealFrame, ddayControlTheme 등)와 100% 호환됩니다.
 * @returns {ReadonlyArray<{ name: string, family: string }>}
 */
export function flattenBuiltinFonts() {
  /** @type {Array<{ name: string, family: string }>} */
  const flat = [];
  for (const cat of FONT_CATALOG) {
    for (const fam of cat.families) {
      for (const variant of fam.variants) {
        flat.push(Object.freeze({ name: variant.name, family: variant.family }));
      }
    }
  }
  return Object.freeze(flat);
}

/** 내장 글꼴 빠른 조회용 맵(name → variant + categoryId) */
const BUILTIN_BY_NAME = new Map();
for (const cat of FONT_CATALOG) {
  for (const fam of cat.families) {
    for (const variant of fam.variants) {
      BUILTIN_BY_NAME.set(variant.name, { variant, familyGroup: fam, categoryId: cat.id });
    }
  }
}

/**
 * 사용자 등록 커스텀 글꼴을 카탈로그 끝에 동적 카테고리(`내 글꼴`)로 합칩니다.
 * 내장 글꼴과 이름이 겹치는 항목은 중복 노출을 막기 위해 제외합니다.
 * @param {readonly CustomFontEntry[] | null | undefined} [customFonts]
 * @returns {FontCategorySection[]}
 */
export function buildFontCatalog(customFonts = []) {
  /** @type {FontCategorySection[]} */
  const sections = [...FONT_CATALOG];
  const seen = new Set(BUILTIN_BY_NAME.keys());
  /** @type {FontFamilyGroup[]} */
  const customFamilies = [];

  if (Array.isArray(customFonts)) {
    for (const entry of customFonts) {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const safeName = name.replace(/["\\;{}<>]/g, '');
      if (!safeName) continue;
      customFamilies.push({
        id: `custom-${customFamilies.length}-${safeName}`,
        label: name,
        fullName: name,
        defaultVariant: name,
        variants: [
          {
            name,
            family: `"${safeName}", "Malgun Gothic", sans-serif`,
            chip: '',
            fullLabel: `${name} (내 글꼴)`,
            isWordChip: false,
            isCustom: true,
          },
        ],
      });
    }
  }

  if (customFamilies.length > 0) {
    sections.push({
      id: 'custom',
      label: '내 글꼴',
      tabLabel: '내 글꼴',
      families: customFamilies,
    });
  }
  return sections;
}

/**
 * 글꼴 이름에 해당하는 CSS font-family 스택을 반환합니다.
 * @param {string | null | undefined} name
 * @param {readonly CustomFontEntry[]} [customFonts]
 * @returns {string}
 */
export function resolveFontFamilyStack(name, customFonts = []) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) return '"메이플스토리 L", sans-serif';
  const builtin = BUILTIN_BY_NAME.get(clean);
  if (builtin) return builtin.variant.family;
  if (Array.isArray(customFonts)) {
    const custom = customFonts.find((f) => f && f.name === clean);
    if (custom) {
      const safe = custom.name.replace(/["\\;{}<>]/g, '');
      return `"${safe}", "Malgun Gothic", sans-serif`;
    }
  }
  const safe = clean.replace(/["\\;{}<>]/g, '');
  return safe ? `"${safe}", "Malgun Gothic", sans-serif` : '"메이플스토리 L", sans-serif';
}

/**
 * 글꼴이 속한 카테고리 ID를 찾습니다. 목록에 없는 이름이면 null.
 * @param {string | null | undefined} name
 * @param {readonly CustomFontEntry[]} [customFonts]
 * @returns {FontCategoryId | null}
 */
export function findCategoryOfFont(name, customFonts = []) {
  const clean = typeof name === 'string' ? name.trim() : '';
  if (!clean) return null;
  const builtin = BUILTIN_BY_NAME.get(clean);
  if (builtin) return builtin.categoryId;
  if (Array.isArray(customFonts) && customFonts.some((f) => f?.name === clean)) {
    return 'custom';
  }
  return null;
}

/**
 * 좁은 툴바 트리거에서 핵심 서체명이 말줄임표로 잘리지 않도록 반복 접두어만 지능적으로 함축합니다.
 * 설정 창처럼 넓은 공간(`compact = false`)에서는 공식 전체 명칭을 그대로 반환합니다.
 * @param {string | null | undefined} name
 * @param {{ compact?: boolean, ultraCompact?: boolean }} [options]
 * @returns {string}
 */
export function compactFontLabel(name, options = {}) {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (!raw) return '글꼴';
  if (!options.compact && !options.ultraCompact) return raw;

  // 반복 브랜드/시리즈 접두어 축약 규칙 (핵심 식별자 + 굵기/연도 보존)
  if (raw.startsWith('교보 손글씨 ')) {
    const year = raw.slice('교보 손글씨 '.length).trim();
    return year.length === 4 ? `교보 ${year.slice(2)}` : `교보 ${year}`;
  }
  if (raw.startsWith('학교안심 ')) {
    return raw.slice('학교안심 '.length).trim();
  }
  if (raw.startsWith('배달의민족 ')) {
    return `배민 ${raw.slice('배달의민족 '.length).trim()}`;
  }
  if (raw === '여기어때 잘난체') return '잘난체';
  if (raw === '여기어때 잘난체 2') return '잘난체 2';
  if (raw === '여기어때 잘난체 고딕') return '잘난 고딕';
  if (raw === '엘리스 디지털배움') return '엘리스 배움';
  if (raw.startsWith('엘리스 DX 널리 ')) {
    return `엘리스 ${raw.slice('엘리스 DX 널리 '.length).trim()}`;
  }
  if (options.ultraCompact && raw.startsWith('메이플스토리 ')) {
    return `메이플 ${raw.slice('메이플스토리 '.length).trim()}`;
  }
  if (options.ultraCompact && raw.startsWith('프리젠테이션 ')) {
    return `프리젠 ${raw.slice('프리젠테이션 '.length).trim()}`;
  }
  return raw;
}
