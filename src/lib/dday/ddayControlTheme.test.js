import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_FONTS } from '../builtinFonts.js';
import { TIDY_THEMES } from '../themes.js';
import { contrastRatio } from './ddayBadge.js';
import {
  controlThemeToStyle,
  resolveControlThemeTokens,
  resolveUiFontStack,
} from './ddayControlTheme.js';

const HEX6_RE = /^#[0-9a-f]{6}$/i;

test('resolveControlThemeTokens produces opaque 6-hex borders and WCAG AA contrast across all 15 themes x light/dark', () => {
  assert.equal(TIDY_THEMES.length, 15);

  for (const theme of TIDY_THEMES) {
    for (const dark of [false, true]) {
      const t = resolveControlThemeTokens(theme.id, dark);
      const tag = `${theme.id} (${dark ? 'dark' : 'light'})`;

      // 외곽 보더 및 모든 색상 토큰은 불투명 6자리 Hex여야 곡면 번짐/light-dark 누락이 없다.
      for (const [key, val] of Object.entries(t)) {
        if (['themeId', 'themeGroup', 'dark', 'scrollTrack'].includes(key)) continue;
        assert.match(String(val), HEX6_RE, `${tag} ${key} must be 6-digit hex, got ${val}`);
      }

      // 본문·보조·흐린 잉크 대비 >= 4.5:1
      for (const bgKey of ['bg', 'section', 'surface', 'footBg']) {
        const bgHex = /** @type {any} */ (t)[bgKey];
        assert.ok(contrastRatio(t.ink, bgHex) >= 4.5, `${tag} ink vs ${bgKey} < 4.5`);
        assert.ok(contrastRatio(t.sub, bgHex) >= 4.5, `${tag} sub vs ${bgKey} < 4.5`);
        assert.ok(contrastRatio(t.muted, bgHex) >= 4.5, `${tag} muted vs ${bgKey} < 4.5`);
        assert.ok(contrastRatio(t.accentInk, bgHex) >= 4.5, `${tag} accentInk vs ${bgKey} < 4.5`);
      }

      // 채운 CTA 버튼(+ 새 D-Day, [완료], 변경 저장) 텍스트 대비 >= 4.5:1
      assert.ok(
        contrastRatio(t.onAccent, t.accentFill) >= 4.5,
        `${tag} onAccent(${t.onAccent}) vs accentFill(${t.accentFill}) < 4.5`,
      );
      // 비텍스트 CTA 배경 vs 표면 대비 >= 3.0:1
      assert.ok(
        contrastRatio(t.accentFill, t.surface) >= 3.0,
        `${tag} accentFill vs surface < 3.0`,
      );
      // 토스트 알약 대비 >= 4.5:1
      assert.ok(
        contrastRatio(t.toastInk, t.toastBg) >= 4.5,
        `${tag} toastInk vs toastBg < 4.5`,
      );

      const styleText = controlThemeToStyle(t);
      assert.ok(styleText.includes('--header-accent:') && styleText.includes('--header-tint:') && styleText.includes('--header-line:'));
      assert.ok(styleText.includes('--dd-scroll-thumb:') && styleText.includes('--dd-on-accent:'));
    }
  }

  // 다크 밝은 파스텔 강조색은 어두운 글자(#111827)로 전환되어 가독성을 지킨다.
  for (const pastelId of ['amber', 'pistachio', 'sea-glass', 'linen', 'kraft']) {
    const dt = resolveControlThemeTokens(pastelId, true);
    assert.equal(dt.onAccent, '#111827', `${pastelId} dark should use dark onAccent`);
  }

  // 배너 링크 점·텍스트 연동 변수가 accentInk와 동일해야 한다.
  const periwinkle = resolveControlThemeTokens('periwinkle', false);
  assert.equal(periwinkle.bg, '#f6f7ff');
  assert.equal(periwinkle.headerAccent, periwinkle.accentInk);
});

test('resolveUiFontStack resolves system fonts, built-in fonts, custom fonts and safe fallback', () => {
  // 시스템 기본 글꼴 10종 중 대표 이름('맑은고딕', '돋움', '궁서체')이 실제 CSS family로 매핑된다.
  assert.equal(resolveUiFontStack('맑은고딕'), '"Malgun Gothic", "맑은 고딕", sans-serif');
  assert.equal(resolveUiFontStack('돋움'), '"Dotum", sans-serif');
  assert.equal(resolveUiFontStack('궁서체'), '"GungsuhChe", serif');

  // BUILTIN_FONTS 전수 조회 보장
  for (const entry of BUILTIN_FONTS) {
    assert.equal(resolveUiFontStack(entry.name), entry.family);
  }

  // 커스텀 글꼴(따옴표 포함 이름 이스케이프)
  const custom = [{ name: '내 "특수" 폰트', path: 'C:\\fonts\\my.ttf' }];
  assert.equal(
    resolveUiFontStack('내 "특수" 폰트', BUILTIN_FONTS, custom),
    '"내 \\"특수\\" 폰트", "Malgun Gothic", sans-serif',
  );

  // 미등록·삭제된 글꼴은 기본 스택으로 안전 폴백
  assert.equal(
    resolveUiFontStack('삭제된커스텀폰트', BUILTIN_FONTS, custom),
    '"메이플스토리 L", "Malgun Gothic", sans-serif',
  );
  assert.equal(resolveUiFontStack(''), '"메이플스토리 L", "Malgun Gothic", sans-serif');
});
