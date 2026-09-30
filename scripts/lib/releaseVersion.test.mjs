import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
/** @param {string} file */
const read = (file) => readFileSync(new URL(file, root), 'utf8');

test('current installer, onboarding, settings and help agree with package version', () => {
  const version = JSON.parse(read('package.json')).version;
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  assert.equal(read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)?.[1], version);
  assert.equal(read('src-tauri/Cargo.lock').match(/name = "tidy_task"\r?\nversion = "([^"]+)"/)?.[1], version);
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version, '../package.json');
  for (const file of ['src/components/InitialSetup.svelte', 'src/lib/initialSetup.js', 'public/help.html']) {
    const versions = [...read(file).matchAll(/\d+\.\d+\.\d+/g)].map(match => match[0]);
    assert.ok(versions.includes(version), `${file}: 현재 버전 누락`);
    assert.ok(versions.every(value => value === version), `${file}: 오래된 현재 버전 표기`);
  }
  // 설정의 실행 버전은 package.json에서 읽고, 과거 공지 번호는 공지 ID와 독립적으로 보존합니다.
  const settings = read('src/components/SettingsModal.svelte');
  assert.match(settings, /import \{ version as packageVersion \} from ['"]\.\.\/\.\.\/package\.json['"]/);
  assert.match(settings, /currentVersion = \$derived\(appState\.appVersion \|\| packageVersion\)/);
  const newsVersion = read('src/lib/releaseNews.js').match(/RELEASE_NEWS_ID = 'v([^']+)'/)?.[1];
  assert.ok(newsVersion && settings.includes(`${newsVersion} 업데이트`));
});
