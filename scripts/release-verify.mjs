// ═══════════════════════════════════════════════════════════════════════
// [배포 확인] npm run release:verify
//
// GitHub에 올린 최신 릴리스를 사용자 앱과 똑같은 순서로 점검합니다. 릴리스를 Publish한 직후에 실행하세요.
//   1) GitHub API 최신 릴리스 태그        → 앱이 "새 버전"으로 안내할 번호 (src/lib/updateChecker.js와 같은 규칙)
//   2) 최신 릴리스의 latest.json           → 같은 번호인지, 윈도우 항목·서명·https 주소가 있는지
//   3) latest.json이 가리키는 설치 파일    → 이 릴리스의 첨부 파일인지, 내려받아 서명이 맞는지
// 셋 중 하나라도 어긋나면 사용자 앱은 앱 안 설치를 멈추고 직접 내려받기로 안내합니다.
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUpdateInfo } from '../src/lib/updateChecker.js';
import { verifySignature } from './lib/minisign.mjs';
import { LATEST_JSON_URL, LATEST_RELEASE_API, readLatestJson } from './lib/updaterRelease.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const localVersion = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const HEADERS = { 'User-Agent': 'tidy-task-release-verify' };

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

/** @param {string} message */
function ok(message) {
  console.log(`   ✔ ${message}`);
}

/** @param {string} url @param {RequestInit} [init] @param {string} [notFoundMessage] 404일 때의 안내 */
async function request(url, init = {}, notFoundMessage = '') {
  let response;
  try {
    response = await fetch(url, { redirect: 'follow', ...init, headers: { ...HEADERS, ...(init.headers || {}) } });
  } catch (error) {
    fail(`${url} 에 연결하지 못했습니다: ${/** @type {Error} */ (error).message}`);
  }
  if (response.status === 404 && notFoundMessage) fail(notFoundMessage);
  if (!response.ok) fail(`${url} 응답이 ${response.status}입니다.`);
  return response;
}

console.log('\n▶ GitHub 최신 릴리스를 사용자 앱과 같은 순서로 확인합니다');

// 1) 앱이 안내할 버전
const release = await (await request(LATEST_RELEASE_API, {
  headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
})).json();
const info = buildUpdateInfo(release);
if (!info) fail(`최신 릴리스의 태그(${release?.tag_name})를 버전으로 읽지 못했습니다. 태그는 v5.5.3 형식이어야 합니다.`);
ok(`최신 릴리스 ${release.tag_name} → 앱이 안내할 버전 ${info.version}`);
if (info.version !== localVersion) {
  console.warn(`   ⚠️ 지금 폴더의 버전(${localVersion})과 다릅니다. 새 릴리스를 Publish했는지, Latest 표시가 맞는지 확인하세요.`);
}
if (!info.hasInstaller) fail('최신 릴리스에 설치 파일(.exe)이 첨부되어 있지 않습니다.');

// 2) latest.json
/** @type {ReturnType<typeof readLatestJson>} */
let manifest;
try {
  const response = await request(LATEST_JSON_URL, {}, '최신 릴리스에 latest.json이 첨부되어 있지 않습니다.\n' +
    '   앱은 이 경우 직접 내려받기로 안내합니다(NOT_PREPARED). npm run release로 만든 latest.json을 첨부해 주세요.');
  manifest = readLatestJson(await response.json());
} catch (error) {
  fail(`최신 릴리스의 latest.json을 읽지 못했습니다: ${/** @type {Error} */ (error).message}\n` +
    '   앱은 이 경우 직접 내려받기로 안내합니다(NOT_PREPARED). npm run release로 만든 latest.json을 첨부해 주세요.');
}
ok(`latest.json 버전 ${manifest.version}`);
if (manifest.version !== info.version) {
  fail(`latest.json(${manifest.version})과 릴리스 태그(${info.version})의 버전이 다릅니다.\n` +
    '   앱은 이 경우 설치를 멈춥니다(VERSION_MISMATCH). npm run release로 만든 latest.json을 다시 올려 주세요.');
}

// 3) 설치 파일
const assetName = decodeURIComponent(new URL(manifest.url).pathname.split('/').pop() || '');
const asset = (release.assets || []).find((/** @type {any} */ item) => item.name === assetName);
if (!asset) {
  fail(`latest.json이 가리키는 파일(${assetName})이 이 릴리스의 첨부 파일에 없습니다.\n` +
    `   첨부 파일: ${(release.assets || []).map((/** @type {any} */ item) => item.name).join(', ') || '(없음)'}`);
}
if (!manifest.url.includes(`/releases/download/${release.tag_name}/`)) {
  fail(`latest.json의 주소가 다른 태그를 가리킵니다: ${manifest.url}`);
}
ok(`설치 파일 ${assetName} 첨부 확인`);

console.log('   … 설치 파일을 내려받아 서명을 확인합니다');
const installer = Buffer.from(await (await request(manifest.url, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer());
if (asset.size && installer.length !== asset.size) {
  fail(`내려받은 크기(${installer.length})가 첨부 파일 크기(${asset.size})와 다릅니다.`);
}
try {
  verifySignature(installer, manifest.signature, config.plugins.updater.pubkey);
} catch (error) {
  fail(`설치 파일의 서명이 앱의 공개 키와 맞지 않습니다. 사용자 앱이 설치를 거부합니다.\n   ${/** @type {Error} */ (error).message}`);
}
ok(`서명 확인 (${(installer.length / (1024 * 1024)).toFixed(1)}MB)`);

console.log(`
✅ 앱 안 업데이트 준비 완료: 사용자 앱은 v${info.version}을 앱 안에서 내려받아 설치합니다.
   (앱 안 설치 기능이 없는 이전 버전 사용자는 예전처럼 안내 창의 링크로 직접 내려받습니다)
`);
