import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FONT_CATALOG,
  buildFontCatalog,
  compactFontLabel,
  findCategoryOfFont,
  flattenBuiltinFonts,
  resolveFontFamilyStack,
} from './fontCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const ASSETS_FONTS_DIR = path.join(ROOT, 'src', 'assets', 'fonts');
const APP_CSS_PATH = path.join(ROOT, 'src', 'app.css');

// 기존 48종 내장 글꼴 명칭 — 1건도 삭제·개명되지 않음을 보장합니다.
const LEGACY_48_FONTS = [
  '맑은고딕', '돋움', '함초롬돋움', '굴림', '새굴림',
  '바탕', '바탕체', '함초롬바탕', '궁서', '궁서체',
  '리디바탕', '엘리스 디지털배움', '엘리스 DX 널리 L', '엘리스 DX 널리 M',
  '여기어때 잘난체', 'KCC 간판체', '배달의민족 도현', '배달의민족 주아', '배달의민족 을지로',
  '메이플스토리 L', '메이플스토리 B', '학교안심 돌담 M', '학교안심 돌담 B',
  '교보 손글씨 2019', '교보 손글씨 2023', '교보 손글씨 2024', '교보 손글씨 2025',
  '온글잎 의연체', '배달의민족 연성', 'Cafe24 동동', 'Cafe24 쑥쑥', 'KCC 도담도담',
  'J개구쟁이체 L', 'J개구쟁이체 M',
  '학교안심 봄방학', '학교안심 분필', '학교안심 붓펜 L', '학교안심 붓펜 M',
  '학교안심 은하수', '학교안심 가을소풍 L', '학교안심 가을소풍 B', '학교안심 꾸러기',
  '학교안심 꼬꼬마', '학교안심 맑은날 M', '학교안심 몽글', '학교안심 투호',
  '학교안심 나들이 L', '학교안심 나들이 B',
];

test('카탈로그가 6개 카테고리 · 43개 패밀리 · 72종 내장 글꼴을 중복 없이 정의한다', () => {
  assert.equal(FONT_CATALOG.length, 6);
  const familyCount = FONT_CATALOG.reduce((sum, cat) => sum + cat.families.length, 0);
  assert.equal(familyCount, 43);

  const flat = flattenBuiltinFonts();
  assert.equal(flat.length, 72);
  assert.equal(new Set(flat.map((f) => f.name)).size, 72, '중복된 글꼴 이름이 없어야 합니다');
});

test('기존 48종 내장 글꼴(교보 손글씨 4종·기존 잘난체 포함)이 단 하나도 삭제되지 않고 보존된다', () => {
  const flatNames = new Set(flattenBuiltinFonts().map((f) => f.name));
  for (const legacy of LEGACY_48_FONTS) {
    assert.ok(flatNames.has(legacy), `기존 글꼴 누락: ${legacy}`);
  }
});

test('카탈로그의 62종 .woff2 파일이 src/assets/fonts 및 src/app.css @font-face와 1:1 일치한다', () => {
  const diskFiles = new Set(fs.readdirSync(ASSETS_FONTS_DIR).filter((f) => f.endsWith('.woff2')));
  const css = fs.readFileSync(APP_CSS_PATH, 'utf8');

  const catalogFiles = new Set();
  for (const cat of FONT_CATALOG) {
    for (const fam of cat.families) {
      for (const variant of fam.variants) {
        if (!variant.file) continue;
        catalogFiles.add(variant.file);
        assert.ok(diskFiles.has(variant.file), `디스크에 폰트 파일 없음: ${variant.file}`);
        assert.ok(
          css.includes(`font-family: '${variant.name}';`) && css.includes(`./assets/fonts/${variant.file}`),
          `src/app.css @font-face 누락 또는 불일치: ${variant.name} -> ${variant.file}`,
        );
      }
    }
  }

  assert.equal(catalogFiles.size, 62);
  assert.equal(diskFiles.size, 62, 'src/assets/fonts에 카탈로그 밖의 미등록 .woff2 파일이 없어야 합니다');
});

test('buildFontCatalog는 커스텀 글꼴이 있을 때만 내 글꼴 섹션을 추가하고 중복을 제거한다', () => {
  const withoutCustom = buildFontCatalog([]);
  assert.equal(withoutCustom.length, 6);

  const withCustom = buildFontCatalog([
    { name: '메이플스토리 L', path: 'C:/dup.ttf' }, // 내장과 중복 -> 무시
    { name: '우리반 필기체', path: 'C:/class.ttf' },
    { name: '우리반 필기체', path: 'C:/class2.ttf' }, // 커스텀 내 중복 -> 무시
    { name: '', path: 'C:/empty.ttf' },
  ]);
  assert.equal(withCustom.length, 7);
  assert.equal(withCustom[6].id, 'custom');
  assert.equal(withCustom[6].families.length, 1);
  assert.equal(withCustom[6].families[0].label, '우리반 필기체');
});

test('findCategoryOfFont와 resolveFontFamilyStack이 내장·커스텀 글꼴을 정확히 찾는다', () => {
  assert.equal(findCategoryOfFont('교보 손글씨 2024'), 'hand');
  assert.equal(findCategoryOfFont('페이퍼로지 EB'), 'gothic');
  assert.equal(findCategoryOfFont('여기어때 잘난체 2'), 'point');
  assert.equal(findCategoryOfFont('학교안심 가을소풍 B'), 'school');
  assert.equal(findCategoryOfFont('맑은고딕'), 'system');
  assert.equal(findCategoryOfFont('우리반 필기체', [{ name: '우리반 필기체' }]), 'custom');
  assert.equal(findCategoryOfFont('없는폰트'), null);

  assert.equal(resolveFontFamilyStack('맑은고딕'), '"Malgun Gothic", "맑은 고딕", sans-serif');
  assert.equal(resolveFontFamilyStack('페이퍼로지 B'), '"페이퍼로지 B", sans-serif');
  assert.equal(resolveFontFamilyStack('을유1945 SB'), '"을유1945 SB", serif');
});

test('compactFontLabel은 설정창(wide)에서는 원문을, 툴바(compact)에서는 핵심명만 축약한다', () => {
  assert.equal(compactFontLabel('교보 손글씨 2024'), '교보 손글씨 2024');
  assert.equal(compactFontLabel('교보 손글씨 2024', { compact: true }), '교보 24');
  assert.equal(compactFontLabel('학교안심 가을소풍 L', { compact: true }), '가을소풍 L');
  assert.equal(compactFontLabel('배달의민족 을지로', { compact: true }), '배민 을지로');
  assert.equal(compactFontLabel('여기어때 잘난체', { compact: true }), '잘난체');
  assert.equal(compactFontLabel('여기어때 잘난체 2', { compact: true }), '잘난체 2');
  assert.equal(compactFontLabel('여기어때 잘난체 고딕', { compact: true }), '잘난 고딕');
  assert.equal(compactFontLabel('메이플스토리 L', { compact: true }), '메이플스토리 L');
  assert.equal(compactFontLabel('메이플스토리 L', { ultraCompact: true }), '메이플 L');
  assert.equal(compactFontLabel('', { compact: true }), '글꼴');
});

test('FontPickerWindow는 비이동(Non-Draggable) 계약을 정적으로 준수한다', () => {
  const winSrc = fs
    .readFileSync(path.join(ROOT, 'src', 'components', 'fontPicker', 'FontPickerWindow.svelte'), 'utf8')
    .replace(/\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!winSrc.includes('windowDrag'), 'FontPickerWindow 코드에 windowDrag를 붙이면 안 됩니다');
  assert.ok(!winSrc.includes('startDragging'), 'FontPickerWindow 코드에 startDragging을 쓰면 안 됩니다');
  assert.ok(!winSrc.includes('data-tauri-drag-region'), 'FontPickerWindow 마크업에 drag-region을 두면 안 됩니다');
});
