import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseAnalyticsSettings, verifyAnalyticsBinary, verifyAnalyticsFrontend, analyticsBuildReceipt, verifyAnalyticsBuildReceipt } from './analyticsBuild.mjs';

const token = 'phc_fixture_public_project_token';
const host = 'https://us.i.posthog.com';

test('release stops when ingestion configuration is absent, private, or malformed', () => {
  for (const value of ['', 'phx_personal_api_key_fixture', 'phc_', 'phc_fixture\nsecret']) {
    assert.throws(() => releaseAnalyticsSettings({}, { POSTHOG_PROJECT_TOKEN: value }), /POSTHOG_PROJECT_TOKEN/);
  }
  assert.throws(() => releaseAnalyticsSettings({}, { POSTHOG_PROJECT_TOKEN: token, POSTHOG_HOST: 'https://us.posthog.com' }), /POSTHOG_HOST/);
});

test('explicit empty environment settings cannot fall back to a working .env', () => {
  assert.throws(() => releaseAnalyticsSettings({ POSTHOG_PROJECT_TOKEN: '' }, { POSTHOG_PROJECT_TOKEN: token }), /POSTHOG_PROJECT_TOKEN/);
  assert.throws(() => releaseAnalyticsSettings({ POSTHOG_HOST: '' }, { POSTHOG_PROJECT_TOKEN: token }), /POSTHOG_HOST/);
});

test('public tokens, supported regions and build-time environment precedence work', () => {
  assert.deepEqual(releaseAnalyticsSettings({}, { POSTHOG_PROJECT_TOKEN: ` ${token} ` }), { token, host });
  const eu = { POSTHOG_PROJECT_TOKEN: 'ph_project_fixture_public_token', POSTHOG_HOST: 'https://eu.i.posthog.com' };
  assert.deepEqual(releaseAnalyticsSettings(eu, { POSTHOG_PROJECT_TOKEN: token }), { token: eu.POSTHOG_PROJECT_TOKEN, host: eu.POSTHOG_HOST });
});

test('repairing .env cannot make an old executable pass release verification', () => {
  const settings = { token, host };
  assert.throws(() => verifyAnalyticsBinary(Buffer.from(`old executable ${host}`), settings), /--skip-build/);
  assert.throws(() => verifyAnalyticsBinary(Buffer.from(`other project phc_another_public_token ${host}`), settings), /--skip-build/);
  assert.throws(() => verifyAnalyticsBinary(Buffer.from(`${token} https://eu.i.posthog.com`), settings), /--skip-build/);
  assert.throws(() => verifyAnalyticsBinary(Buffer.from(`executable ${token} ${host}`), settings), /도구별 통계/);
  assert.doesNotThrow(() => verifyAnalyticsBinary(Buffer.from(`executable ${token} ${host} tool_active_minute dice_rolled timer_started timer_completed vote_created vote_counting_started vote_completed`), settings));
});

test('skip-build requires the exact verified installer and project configuration', () => {
  const installer = Buffer.from('signed installer fixture');
  const settings = { token, host };
  const receipt = analyticsBuildReceipt(installer, settings);
  assert.doesNotThrow(() => verifyAnalyticsBuildReceipt(installer, settings, receipt));
  assert.throws(() => verifyAnalyticsBuildReceipt(installer, settings, null), /--skip-build/);
  assert.throws(() => verifyAnalyticsBuildReceipt(Buffer.from('old installer'), settings, receipt), /--skip-build/);
  assert.throws(() => verifyAnalyticsBuildReceipt(installer, { token: 'phc_different_project_token', host }, receipt), /--skip-build/);
  assert.equal(JSON.stringify(receipt).includes(token), false);
});

test('frontend bundle must contain successful-action capture hooks', () => {
  const events = ['dice_rolled', 'timer_started', 'timer_completed', 'vote_created', 'vote_counting_started', 'vote_completed'];
  assert.doesNotThrow(() => verifyAnalyticsFrontend(Buffer.from(events.join(' '))));
  for (const missing of events) {
    assert.throws(() => verifyAnalyticsFrontend(Buffer.from(events.filter(event => event !== missing).join(' '))), /프런트 배포 번들/);
  }
});
