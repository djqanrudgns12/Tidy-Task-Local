// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MEASURE_SIZE,
  NUMERAL_DEFAULTS,
  NUMERAL_GAP,
  numeralMetrics,
  numeralStyle,
} from './fontMetrics.js';

const S = MEASURE_SIZE;
/** em 단위 값으로 캔버스 measureText 결과(기준 크기 S)를 흉내 냅니다. */
function glyph({ width, left = 0.015, right = 0.015, asc = 0.715, desc = 0.065, fa = 0.85, fd = 0.265 }) {
  return {
    width: width * S,
    actualBoundingBoxLeft: -left * S,
    actualBoundingBoxRight: (width - right) * S,
    actualBoundingBoxAscent: asc * S,
    actualBoundingBoxDescent: desc * S,
    fontBoundingBoxAscent: fa * S,
    fontBoundingBoxDescent: fd * S,
  };
}
/** 기본 글꼴(메이플스토리 L, 700)을 잰 값 — 가장 가까운 숫자 쌍은 "41"(틈 0.014em)입니다. */
function mapleLike(ch) {
  if (ch === ':') return glyph({ width: 0.246, left: 0.035, right: 0.036, asc: 0.6, desc: -0.06 });
  if (ch === '4') return glyph({ width: 0.675, right: 0.004 });
  if (ch === '1') return glyph({ width: 0.432, left: 0.01 });
  return glyph({ width: 0.675 });
}

test('기본 글꼴 측정값은 NUMERAL_DEFAULTS와 같다 (측정 전후로 화면이 튀지 않음)', () => {
  assert.deepEqual(numeralMetrics(mapleLike), { ...NUMERAL_DEFAULTS });
});

test('toolkit.css의 var(--tk-num-*, 기본값)은 NUMERAL_DEFAULTS와 같다', () => {
  const css = readFileSync(new URL('./toolkit.css', import.meta.url), 'utf8');
  const keys = { ink: 'ink', shift: 'shift', advance: 'advance', colon: 'colon', 'track-min': 'trackMin' };
  const found = [...css.matchAll(/var\(--tk-num-([a-z-]+),\s*(-?[0-9.]+)\)/g)];
  assert.ok(found.length >= 5, 'CSS에서 숫자 측정 변수 대체값을 찾지 못했습니다');
  for (const [, name, value] of found) {
    assert.ok(name in keys, `알 수 없는 변수 --tk-num-${name}`);
    assert.equal(Number(value), NUMERAL_DEFAULTS[keys[name]], `--tk-num-${name}`);
  }
});

test('전광판 크기 공식의 상수는 기본 글꼴에서 예전 크기(22cqw·31cqh·줄 높이 0.98)를 그대로 낸다', () => {
  const css = readFileSync(new URL('./toolkit.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.digital-time {'), css.indexOf('}', css.indexOf('.digital-time {')));
  const widthRef = Number(rule.match(/var\(--num-fit-w\) \* ([0-9.]+) \/ \(var\(--num-run\) - ([0-9.]+)\)/)[1]);
  const designTrack = Number(rule.match(/var\(--num-run\) - ([0-9.]+)\)/)[1]);
  const boxFactor = Number(rule.match(/var\(--num-ink\) \* ([0-9.]+)\)\)/)[1]);
  const [top, bottom] = [...rule.matchAll(/var\(--num-ink\) \* ([0-9.]+)em/g)].map((m) => Number(m[1]));
  const d = NUMERAL_DEFAULTS;
  // 너비 기준: 기본 글꼴의 디자인 자간(-0.055em × 4칸)으로 계산한 "00:00" 폭
  assert.equal(designTrack, 0.22);
  assert.ok(Math.abs(4 * d.advance + d.colon - designTrack - widthRef) < 1e-9);
  // 높이 기준: 줄 상자 + 위아래 여백 = 예전 줄 높이 0.98em
  assert.ok(Math.abs(d.ink * boxFactor - 0.98) < 0.001);
  assert.ok(Math.abs(1 + top + bottom - boxFactor) < 0.001);
});

test('숫자가 줄 상자 위로 솟는 글꼴은 shift가 더 음수(아래로 내림)이고 잉크 높이가 크다', () => {
  // 여기어때 잘난체처럼 기준선 위 잉크가 글꼴 ascent에 거의 닿는 경우
  const tall = numeralMetrics((ch) =>
    ch === ':' ? glyph({ width: 0.292, asc: 0.72, desc: -0.06, fa: 0.88, fd: 0.3 }) : glyph({ width: 0.702, left: 0.025, right: 0.025, asc: 0.86, desc: 0.09, fa: 0.88, fd: 0.3 }),
  );
  assert.equal(tall.ink, 0.95);
  assert.equal(tall.shift, -0.095);
  assert.ok(tall.shift < NUMERAL_DEFAULTS.shift);
});

test('숫자끼리 겹치는 글꼴은 틈을 NUMERAL_GAP만큼 벌리는 자간을 요구한다', () => {
  const overlapping = numeralMetrics((ch) => glyph({ width: ch === ':' ? 0.19 : 0.43, left: -0.035, right: -0.035 }));
  // 가장 가까운 쌍의 틈 = -0.07em → 필요한 자간 = 0.02 + 0.07
  assert.equal(overlapping.trackMin, Math.round((NUMERAL_GAP + 0.07) * 10000) / 10000);
  // 여백이 넉넉한 글꼴(맑은 고딕 등)은 디자인 자간보다 좁은 값이 나와 디자인 자간이 그대로 쓰입니다(CSS clamp).
  const roomy = numeralMetrics((ch) => glyph({ width: ch === ':' ? 0.26 : 0.58, left: 0.05, right: 0.05 }));
  assert.ok(roomy.trackMin < -0.055);
});

test('측정이 비정상이면(캔버스 없음·글꼴 정보 없음) 기본값을 돌려준다', () => {
  const zero = () => ({ width: 0, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 });
  assert.deepEqual(numeralMetrics(zero), { ...NUMERAL_DEFAULTS });
  const noFontBox = (ch) => {
    const g = mapleLike(ch);
    delete g.fontBoundingBoxAscent;
    delete g.fontBoundingBoxDescent;
    return g;
  };
  assert.deepEqual(numeralMetrics(noFontBox), { ...NUMERAL_DEFAULTS });
});

test('numeralStyle은 다섯 개의 CSS 변수를 만든다', () => {
  assert.equal(
    numeralStyle(NUMERAL_DEFAULTS),
    '--tk-num-ink:0.78;--tk-num-shift:-0.0325;--tk-num-advance:0.675;--tk-num-colon:0.246;--tk-num-track-min:0.006;',
  );
});
