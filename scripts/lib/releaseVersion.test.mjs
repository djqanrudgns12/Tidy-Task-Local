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
  for (const file of ['src/components/InitialSetup.svelte', 'src/components/SettingsModal.svelte', 'src/lib/initialSetup.js', 'public/help.html']) {
    const versions = [...read(file).matchAll(/\d+\.\d+\.\d+/g)].map(match => match[0]);
    assert.ok(versions.includes(version), `${file}: 현재 버전 누락`);
    assert.ok(versions.every(value => value === version), `${file}: 오래된 현재 버전 표기`);
  }
});
