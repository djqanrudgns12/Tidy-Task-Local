import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_TABS,
  SETTINGS_DEFAULTS,
  SETTINGS_TABS,
  WIPE_ARM_MS,
  changedFields,
  applySharedSettings,
  nextTab,
  readSettingsForm,
  settingsSnapshotFor,
  settingsWindowSize,
  toApplyPayload,
  wipeArmSecondsLeft,
} from './settingsForm.js';
import { SNAPSHOT_FIELDS, decodeWindowData } from '../storage/windowDataCodec.js';

test('빈 값은 기본값으로 채운다', () => {
  assert.deepEqual(readSettingsForm(null), SETTINGS_DEFAULTS);
  assert.deepEqual(readSettingsForm({}), SETTINGS_DEFAULTS);
});

test('설정 초기화의 기본값은 새 창의 복원 기본값과 같다', () => {
  // 어긋나면 "설정 초기화"를 누른 창과 새로 만든 창의 모양이 달라집니다.
  const fresh = decodeWindowData({}, { label: 'main' });
  for (const name of ['themeColor', 'isDarkMode', 'headerDesign', 'fontFamily', 'fontSize', 'uiFontFamily', 'uiFontSize', 'showArchived', 'showNotes', 'showReminders', 'globalMuteSound']) {
    assert.equal(/** @type {any} */ (SETTINGS_DEFAULTS)[name], fresh[name], name);
  }
});

test('보낸 값을 그대로 읽는다 — 슬라이더 범위 밖의 글자 크기도 고치지 않는다', () => {
  const sent = {
    themeColor: 'mauve', isDarkMode: true, headerDesign: 'modern',
    fontFamily: '리디바탕', fontSize: 30, uiFontFamily: '굴림', uiFontSize: 5,
    showArchived: false, showNotes: false, showReminders: false, globalMuteSound: true,
  };
  // 여기서 범위 안으로 고치면 설정 창을 열고 [반영]만 눌러도 글자 크기가 바뀝니다.
  assert.deepEqual(readSettingsForm(sent), sent);
});

test('쓸 수 없는 값은 기본값으로 바꾼다', () => {
  assert.equal(readSettingsForm({ fontSize: 'abc' }).fontSize, 10);
  assert.equal(readSettingsForm({ uiFontSize: 0 }).uiFontSize, 10);
  assert.equal(readSettingsForm({ fontSize: NaN }).fontSize, 10);
  assert.equal(readSettingsForm({ themeColor: '' }).themeColor, 'amber');
  assert.equal(readSettingsForm({ isDarkMode: 'yes' }).isDarkMode, false);
  assert.equal(readSettingsForm({ headerDesign: 'something' }).headerDesign, 'classic');
});

test('보낸 값에 없는 항목은 설정 창이 읽어 둔 값을 쓴다', () => {
  // 예전 메모 창(5.6.3)이 보낸 값에는 전체 무음이 없습니다. 그때 꺼짐으로 읽으면 [반영]만 눌러도 무음이 풀립니다.
  assert.equal(readSettingsForm({ themeColor: 'blue' }, { globalMuteSound: true }).globalMuteSound, true);
  assert.equal(readSettingsForm({ globalMuteSound: false }, { globalMuteSound: true }).globalMuteSound, false);
});

test('메모 창이 보내는 값에는 상단 디자인과 전체 무음이 들어 있다', () => {
  // 되돌리기 스냅샷에는 두 값이 없어 따로 덧붙여야 합니다.
  assert.ok(!SNAPSHOT_FIELDS.includes('headerDesign'));
  assert.ok(!SNAPSHOT_FIELDS.includes('globalMuteSound'));
  const sent = settingsSnapshotFor({
    takeSnapshot: () => ({ themeColor: 'green', fontFamily: '굴림', showReminders: false }),
    headerDesign: 'modern',
    globalMuteSound: true,
  });
  const form = readSettingsForm(sent);
  assert.equal(form.themeColor, 'green');
  assert.equal(form.headerDesign, 'modern');
  assert.equal(form.globalMuteSound, true);
  assert.equal(form.showReminders, false);
});

test('바뀐 항목만 찾는다 — 바로 적용되는 상단 디자인은 세지 않는다', () => {
  const initial = readSettingsForm({});
  assert.deepEqual(changedFields(initial, { ...initial }), []);
  assert.deepEqual(changedFields({ ...initial, headerDesign: 'modern' }, initial), []);
  assert.deepEqual(
    changedFields({ ...initial, themeColor: 'blue', uiFontSize: 12, globalMuteSound: true }, initial),
    ['themeColor', 'uiFontSize', 'globalMuteSound'],
  );
});

test('바뀔 수 있는 항목은 모두 어느 탭에 있는지 정해져 있다', () => {
  const initial = readSettingsForm({});
  const everything = readSettingsForm({
    themeColor: 'blue', isDarkMode: true, fontFamily: '굴림', fontSize: 12, uiFontFamily: '굴림', uiFontSize: 12,
    showArchived: false, showNotes: false, showReminders: false, globalMuteSound: true,
  });
  const tabs = SETTINGS_TABS.map((tab) => tab.id);
  const changed = changedFields(everything, initial);
  assert.equal(changed.length, Object.keys(FIELD_TABS).length);
  for (const name of changed) assert.ok(tabs.includes(FIELD_TABS[name]), name);
});

test('적용 요청은 메모 창이 읽는 이름으로 보낸다', () => {
  const payload = toApplyPayload({ ...SETTINGS_DEFAULTS, fontFamily: '리디바탕', themeColor: 'rose' }, 'note-2');
  assert.deepEqual(payload, {
    targetWindow: 'note-2',
    fontSize: 10,
    uiFontSize: 10,
    headerDesign: 'classic',
    themeColor: 'rose',
    uiFontFamily: '메이플스토리 L',
    isDarkMode: false,
    globalFont: '리디바탕',
    showArchived: true,
    showNotes: true,
    showReminders: true,
    globalMuteSound: false,
  });
});

test('탭은 방향키로 돌고 Home·End로 양 끝에 간다', () => {
  assert.deepEqual(SETTINGS_TABS.map((tab) => tab.id), ['look', 'text', 'behavior', 'manage']);
  assert.equal(nextTab('look', 'ArrowRight'), 'text');
  assert.equal(nextTab('manage', 'ArrowRight'), 'look');
  assert.equal(nextTab('look', 'ArrowLeft'), 'manage');
  assert.equal(nextTab('text', 'End'), 'manage');
  assert.equal(nextTab('behavior', 'Home'), 'look');
  assert.equal(nextTab('look', 'Enter'), null);
});

test('다른 메모 창도 알림·무음 선택을 받아 다음 저장과 매니저 승계에 유지한다', () => {
  const main = { ...SETTINGS_DEFAULTS };
  const other = { ...SETTINGS_DEFAULTS, themeColor: 'mauve' };
  const payload = toApplyPayload({ ...main, showReminders: false, globalMuteSound: true }, 'main');
  assert.equal(applySharedSettings(main, payload), true);
  assert.equal(applySharedSettings(other, payload), true);
  assert.equal(other.themeColor, 'mauve');
  assert.equal(toApplyPayload(other, 'note-2').showReminders, false);
  assert.equal(toApplyPayload(other, 'note-2').globalMuteSound, true);
  assert.equal(applySharedSettings(other, payload), false);
  // 모양만 보낸 요청은 앱 전체 선택을 기본값으로 되돌리지 않습니다.
  assert.equal(applySharedSettings(other, {}), false);
  assert.equal(other.globalMuteSound, true);
});

test('설정 창은 낮은 화면에서 그 안에 들어가도록 줄어든다', () => {
  assert.deepEqual(settingsWindowSize([]), { width: 360, height: 560 });
  // 4K 200%(논리 1032) + FHD 100%(1040): 기본 크기 그대로
  assert.deepEqual(settingsWindowSize([1032, 1040]), { width: 360, height: 560 });
  // FHD 200%(작업영역 논리 500): 아래 버튼이 화면 밖으로 나가지 않게 줄인다
  assert.equal(settingsWindowSize([500]).height, 476);
  // 여러 모니터면 가장 낮은 화면 기준
  assert.equal(settingsWindowSize([1040, 574]).height, 550);
  // 너무 낮아도 최소 높이 아래로는 줄이지 않는다
  assert.equal(settingsWindowSize([300]).height, 400);
  // 읽지 못한 값은 무시한다
  assert.deepEqual(settingsWindowSize([NaN, 0]), { width: 360, height: 560 });
});

test('두 번째 경고의 [모두 지우기]는 정해진 시간이 지나야 눌린다', () => {
  const openedAt = 1_000_000;
  assert.equal(wipeArmSecondsLeft(openedAt, openedAt), 3);
  assert.equal(wipeArmSecondsLeft(openedAt, openedAt + 1), 3);
  assert.equal(wipeArmSecondsLeft(openedAt, openedAt + 1000), 2);
  assert.equal(wipeArmSecondsLeft(openedAt, openedAt + WIPE_ARM_MS - 1), 1);
  assert.equal(wipeArmSecondsLeft(openedAt, openedAt + WIPE_ARM_MS), 0);
  assert.equal(wipeArmSecondsLeft(openedAt, openedAt + 60_000), 0);
});
