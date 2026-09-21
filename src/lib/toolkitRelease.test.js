import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runNoticeQueue, fitNoticeSize, TOOLKIT_RELEASE_STORE_KEY, getToolkitReleaseOptions } from './toolkitRelease.js';
import { UPDATE_NOTICE_STORE_KEY, getTomorrowStart, shouldShowUpdateNotice } from './updateNotice.js';

test('새 공지의 숨김 설정은 기존 공지와 독립적이다', () => {
  assert.notEqual(TOOLKIT_RELEASE_STORE_KEY, UPDATE_NOTICE_STORE_KEY);
  const preferences = new Map([[UPDATE_NOTICE_STORE_KEY, Number.MAX_SAFE_INTEGER]]);
  assert.equal(shouldShowUpdateNotice(preferences.get(TOOLKIT_RELEASE_STORE_KEY)), true);
  preferences.set(TOOLKIT_RELEASE_STORE_KEY, getTomorrowStart());
  assert.equal(shouldShowUpdateNotice(preferences.get(UPDATE_NOTICE_STORE_KEY)), false);
});

test('앞 창이 닫히기 전에는 다음 공지를 열지 않는다', async () => {
  /** @type {string[]} */
  const opened = [];
  /** @type {(()=>void)|undefined} */ let close;
  const task = runNoticeQueue(['welcome','toolkit','legacy'], async (entry) => {
    opened.push(entry);
    await new Promise(resolve => { close = () => resolve(undefined); });
  });
  assert.deepEqual(opened, ['welcome']);
  close?.(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(opened, ['welcome','toolkit']);
  close?.(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(opened, ['welcome','toolkit','legacy']);
  close?.(); await task;
});

test('닫힘 확인 실패 시 다음 공지를 겹쳐 띄우지 않는다', async () => {
  /** @type {string[]} */
  const opened = [];
  await assert.rejects(runNoticeQueue(['first','second'], async entry => {
    opened.push(entry); throw new Error('window failure');
  }));
  assert.deepEqual(opened,['first']);
});

test('작은 화면과 고배율에서 작업영역에 맞추고 최소 크기도 제한한다', () => {
  const options = getToolkitReleaseOptions();
  for (const scale of [1,1.25,1.5,2]) {
    const fitted=fitNoticeSize(options,{size:{width:800,height:560}},scale);
    assert.ok(fitted.width*scale<800);
    assert.ok(fitted.height*scale<560);
    assert.ok(fitted.minWidth<=fitted.width);
    assert.ok(fitted.minHeight<=fitted.height);
  }
  assert.deepEqual(fitNoticeSize(options,null),options);
});
