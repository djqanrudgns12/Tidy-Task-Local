import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LATEST_JSON_URL,
  PLATFORM_KEYS,
  assetDownloadUrl,
  buildLatestJson,
  bundledInstallerName,
  isReleaseVersion,
  readLatestJson,
  releaseAssetName,
  releaseTag,
} from './updaterRelease.mjs';

const SIGNATURE = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==';

test('LATEST_JSON_URL: 앱 설정(tauri.conf.json)의 업데이트 주소와 같다', () => {
  const config = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.plugins.updater.endpoints, [LATEST_JSON_URL]);
  // 설치 파일을 만들 때 서명 파일도 함께 만들어야 합니다.
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.equal(config.plugins.updater.windows.installMode, 'passive');
});

test('releaseAssetName: GitHub가 바꾸는 이름(공백→점)으로 미리 맞춘다', () => {
  const bundled = bundledInstallerName('Tidy Task', '5.5.3');
  assert.equal(bundled, 'Tidy Task_5.5.3_x64-setup.exe');
  assert.equal(releaseAssetName(bundled), 'Tidy.Task_5.5.3_x64-setup.exe');
  assert.equal(releaseAssetName('Already.Safe_1.0.0_x64-setup.exe'), 'Already.Safe_1.0.0_x64-setup.exe');
});

test('assetDownloadUrl: 버전 태그(v 접두사) 아래의 첨부 파일 주소를 만든다', () => {
  assert.equal(releaseTag('5.5.3'), 'v5.5.3');
  assert.equal(
    assetDownloadUrl('5.5.3', 'Tidy.Task_5.5.3_x64-setup.exe'),
    'https://github.com/djqanrudgns12/Tidy-Task-Local/releases/download/v5.5.3/Tidy.Task_5.5.3_x64-setup.exe',
  );
});

test('buildLatestJson: 앱이 찾는 두 가지 항목 이름으로 같은 파일을 가리킨다', () => {
  const url = assetDownloadUrl('5.5.3', 'Tidy.Task_5.5.3_x64-setup.exe');
  const manifest = buildLatestJson({
    version: '5.5.3',
    signature: `${SIGNATURE}\n`,
    url,
    pubDate: new Date('2026-09-22T00:00:00.000Z'),
  });
  assert.deepEqual(manifest, {
    version: '5.5.3',
    pub_date: '2026-09-22T00:00:00.000Z',
    platforms: {
      'windows-x86_64-nsis': { signature: SIGNATURE, url },
      'windows-x86_64': { signature: SIGNATURE, url },
    },
  });
  assert.deepEqual(Object.keys(manifest.platforms), [...PLATFORM_KEYS]);
  // 만든 파일을 그대로 다시 읽을 수 있어야 합니다.
  assert.deepEqual(readLatestJson(JSON.parse(JSON.stringify(manifest))), { version: '5.5.3', signature: SIGNATURE, url });
});

test('buildLatestJson: 잘못된 버전·빈 서명·https가 아닌 주소는 만들지 않는다', () => {
  const url = assetDownloadUrl('5.5.3', 'a.exe');
  assert.throws(() => buildLatestJson({ version: 'v5.5.3', signature: SIGNATURE, url }), /버전/);
  assert.throws(() => buildLatestJson({ version: '5.5', signature: SIGNATURE, url }), /버전/);
  assert.throws(() => buildLatestJson({ version: '5.5.3', signature: '  ', url }), /서명/);
  assert.throws(() => buildLatestJson({ version: '5.5.3', signature: SIGNATURE, url: 'http://example.com/a.exe' }), /https/);
});

test('readLatestJson: 앱이 거부할 latest.json을 올리기 전에 잡아낸다', () => {
  const entry = { signature: SIGNATURE, url: 'https://example.com/a.exe' };
  assert.equal(readLatestJson({ version: 'v5.5.3', platforms: { 'windows-x86_64': entry } }).version, '5.5.3');
  assert.throws(() => readLatestJson(null), /JSON 객체/);
  assert.throws(() => readLatestJson({ version: 'latest', platforms: { 'windows-x86_64': entry } }), /version/);
  assert.throws(() => readLatestJson({ version: '5.5.3', platforms: { 'darwin-aarch64': entry } }), /윈도우용/);
  assert.throws(() => readLatestJson({ version: '5.5.3', platforms: { 'windows-x86_64': { ...entry, signature: '' } } }), /서명/);
  assert.throws(() => readLatestJson({ version: '5.5.3', platforms: { 'windows-x86_64': { ...entry, url: 'http://a/b.exe' } } }), /https/);
  assert.throws(() => readLatestJson({ version: '5.5.3', pub_date: 'yesterday', platforms: { 'windows-x86_64': entry } }), /pub_date/);
});

test('isReleaseVersion: 배포에 쓰는 버전 형식만 받아들인다', () => {
  for (const ok of ['5.5.3', '10.0.0', '5.6.0-beta.1']) assert.equal(isReleaseVersion(ok), true, ok);
  for (const bad of ['', 'v5.5.3', '5.5', '5.5.3.1', '5.5.3-', null, 553]) assert.equal(isReleaseVersion(bad), false, String(bad));
});
