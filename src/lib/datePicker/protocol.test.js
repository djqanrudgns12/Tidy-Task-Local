import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClosed, normalizeOpenRequest, changesValue, returnsFocus } from './protocol.js';
import { calendarPalette, toStyleText } from './palette.js';

const valid = {
  requestId: 'main:1:abc',
  requester: 'main',
  value: '2026-09-30',
  viaKeyboard: false,
  anchor: { x: 100.4, y: 200.6, width: 60, height: 24 },
  appearance: { isDarkMode: true, themeColor: 'sea-glass', fontFamily: '"메이플스토리 L", sans-serif', fontSizePt: 11, customFont: null },
};

test('정상 요청은 그대로(좌표는 정수로) 통과한다', () => {
  const r = normalizeOpenRequest(valid);
  assert.ok(r);
  assert.deepEqual(r.anchor, { x: 100, y: 201, width: 60, height: 24 });
  assert.equal(r.value, '2026-09-30');
  assert.equal(r.appearance.fontSizePt, 11);
  assert.equal(r.appearance.isDarkMode, true);
});

test('좌표가 숫자가 아니면(NaN 등) 요청을 버린다 — 창이 화면 밖으로 날아가지 않게', () => {
  assert.equal(normalizeOpenRequest({ ...valid, anchor: { ...valid.anchor, x: NaN } }), null);
  assert.equal(normalizeOpenRequest({ ...valid, anchor: null }), null);
  assert.equal(normalizeOpenRequest({ ...valid, requestId: '' }), null);
  assert.equal(normalizeOpenRequest(null), null);
});

test('날짜가 아닌 값은 "마감일 없음"으로, 이상한 글자 크기는 10pt로 본다', () => {
  const r = normalizeOpenRequest({ ...valid, value: '2026-02-30', appearance: { fontSizePt: 999 } });
  assert.ok(r);
  assert.equal(r.value, '');
  assert.equal(r.appearance.fontSizePt, 10);
  assert.equal(r.appearance.themeColor, 'amber');
  assert.equal(r.appearance.customFont, null);
});

test('글꼴 이름에 CSS를 끼워 넣을 수 있는 글자가 있으면 기본 글꼴로 바꾼다', () => {
  const r = normalizeOpenRequest({ ...valid, appearance: { ...valid.appearance, fontFamily: 'x; background:url(evil)' } });
  assert.equal(r?.appearance.fontFamily, '"Gulim", sans-serif');
});

test('커스텀 글꼴은 이름과 경로가 모두 있을 때만 넘긴다', () => {
  const withFont = normalizeOpenRequest({ ...valid, appearance: { ...valid.appearance, customFont: { name: '내 글꼴', path: 'C:/fonts/a.ttf' } } });
  assert.deepEqual(withFont?.appearance.customFont, { name: '내 글꼴', path: 'C:/fonts/a.ttf' });
  const broken = normalizeOpenRequest({ ...valid, appearance: { ...valid.appearance, customFont: { name: '내 글꼴' } } });
  assert.equal(broken?.appearance.customFont, null);
});

test('닫힘 결과: 선택은 올바른 날짜일 때만, 모르는 이유는 거부', () => {
  assert.deepEqual(normalizeClosed({ requestId: 'r1', reason: 'select', value: '2026-10-01' }), { requestId: 'r1', reason: 'select', value: '2026-10-01' });
  assert.equal(normalizeClosed({ requestId: 'r1', reason: 'select', value: 'oops' }), null);
  assert.deepEqual(normalizeClosed({ requestId: 'r1', reason: 'clear', value: 'ignored' }), { requestId: 'r1', reason: 'clear', value: '' });
  assert.equal(normalizeClosed({ requestId: 'r1', reason: 'hack' }), null);
  assert.equal(normalizeClosed({ reason: 'blur' }), null);
});

test('값을 바꾸는 이유와 초점을 돌려주는 이유', () => {
  assert.equal(changesValue('select'), true);
  assert.equal(changesValue('clear'), true);
  assert.equal(changesValue('escape'), false);
  assert.equal(returnsFocus('escape'), true);
  // 다른 프로그램을 눌러 닫힌 경우 초점을 빼앗아 오면 안 됩니다.
  assert.equal(returnsFocus('blur'), false);
});

test('테마 색: 어두운 화면에서는 선택한 날 글자를 짙게 쓴다', () => {
  const dark = calendarPalette('amber', true);
  const light = calendarPalette('amber', false);
  assert.equal(dark['--dp-on-accent'], '#111827');
  assert.equal(light['--dp-on-accent'], '#ffffff');
  assert.equal(light['--dp-accent'], '#d97706');
  // 모르는 테마는 기본(amber)으로
  assert.equal(calendarPalette('없는테마', false)['--dp-accent'], '#d97706');
  assert.match(toStyleText({ '--a': '1', '--b': '2' }), /^--a:1;--b:2$/);
});
