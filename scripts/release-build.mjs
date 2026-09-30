// ═══════════════════════════════════════════════════════════════════════
// [배포 빌드] npm run release
//
//   1) 버전 번호와 업데이트 서명 키를 점검합니다. (서명 키가 앱의 공개 키와 짝인지 빌드 전에 확인)
//   2) 설치 파일을 빌드합니다. Tauri가 설치 파일과 서명(.sig)을 함께 만듭니다.
//   3) 만든 설치 파일의 서명을 앱과 같은 규칙으로 다시 확인합니다.
//   4) output/release/v버전/ 에 GitHub 릴리스에 올릴 파일 두 개를 준비합니다.
//        · Tidy.Task_버전_x64-setup.exe  (GitHub가 바꾸는 이름으로 미리 맞춤)
//        · latest.json                   (앱이 받을 파일 주소와 서명)
//
// 왜 스크립트인가: 서명 키를 빠뜨리거나, 다른 키로 서명하거나, latest.json의 주소와 실제 첨부 파일
//   이름이 어긋나면 모든 사용자의 앱 안 업데이트가 멈춥니다. 손으로 하던 단계를 묶어 실수를 없앱니다.
//
// 옵션: --skip-build  이미 만든 설치 파일로 3)·4)만 다시 합니다.
//       --tag 5.6.0   파일 없이 잠긴 v5.6.0 대신 같은 버전의 v 없는 태그로 준비합니다.
// 서명 키 위치: 기본 ~/.tauri/tidy-task-updater.key
//   (바꾸려면 환경변수나 src-tauri/.env에 TAURI_SIGNING_PRIVATE_KEY_PATH, 암호가 있으면 TAURI_SIGNING_PRIVATE_KEY_PASSWORD)
// ═══════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySignature } from './lib/minisign.mjs';
import { releaseAnalyticsSettings, verifyAnalyticsBinary, verifyAnalyticsFrontend, analyticsBuildReceipt, verifyAnalyticsBuildReceipt } from './lib/analyticsBuild.mjs';
import {
  PLATFORM_KEYS,
  assetDownloadUrl,
  buildLatestJson,
  bundledInstallerName,
  isReleaseVersion,
  releaseAssetName,
  releaseTag,
} from './lib/updaterRelease.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAURI_DIR = path.join(ROOT, 'src-tauri');
const TAURI_CLI = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const DEFAULT_KEY_PATH = path.join(homedir(), '.tauri', 'tidy-task-updater.key');
const skipBuild = process.argv.includes('--skip-build');
const tagAt = process.argv.indexOf('--tag');

/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

/** @param {string} message */
function step(message) {
  console.log(`\n▶ ${message}`);
}

/** @param {string} file */
function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// src-tauri/.env의 KEY=VALUE를 읽습니다. (build.rs가 나이스 인증키를 읽는 것과 같은 파일)
/** @param {string} file @returns {Record<string, string>} */
function readDotEnv(file) {
  /** @type {Record<string, string>} */
  const values = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** @param {number} bytes */
function megabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── 1) 버전과 설정 점검 ─────────────────────────────────────────────────
step('버전 번호와 업데이트 설정을 확인합니다');
const config = readJson(path.join(TAURI_DIR, 'tauri.conf.json'));
const pkg = readJson(path.join(ROOT, 'package.json'));
const version = pkg.version;
if (!isReleaseVersion(version)) fail(`package.json의 version 형식이 올바르지 않습니다: ${version}`);
const tag = tagAt === -1 ? releaseTag(version) : process.argv[tagAt + 1];
if (![version, releaseTag(version)].includes(tag)) fail(`--tag에는 ${version} 또는 ${releaseTag(version)}을 지정하세요.`);

// 배포 가이드의 규칙: 버전의 기준은 package.json이고, 아래 파일들도 같은 번호여야 합니다.
const lock = readJson(path.join(ROOT, 'package-lock.json'));
const cargoToml = readFileSync(path.join(TAURI_DIR, 'Cargo.toml'), 'utf8');
const cargoLock = readFileSync(path.join(TAURI_DIR, 'Cargo.lock'), 'utf8');
const versions = {
  'package.json': version,
  'package-lock.json': lock.version,
  'package-lock.json (packages[""])': lock.packages?.['']?.version,
  'src-tauri/Cargo.toml': cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1],
  'src-tauri/Cargo.lock (tidy_task)': cargoLock.match(/name = "tidy_task"\r?\nversion = "([^"]+)"/)?.[1],
  'src-tauri/tauri.conf.json': config.version === '../package.json' ? version : config.version,
};
const mismatched = Object.entries(versions).filter(([, v]) => v !== version);
if (mismatched.length > 0) {
  fail(`버전 번호가 서로 다릅니다 (기준: package.json ${version})\n` +
    mismatched.map(([file, v]) => `   - ${file}: ${v ?? '(찾지 못함)'}`).join('\n'));
}

const pubkey = config.plugins?.updater?.pubkey;
if (!pubkey) fail('tauri.conf.json에 plugins.updater.pubkey가 없습니다.');
if (config.bundle?.createUpdaterArtifacts !== true) {
  fail('tauri.conf.json의 bundle.createUpdaterArtifacts가 true가 아닙니다(서명 파일이 만들어지지 않습니다).');
}
console.log(`   버전 ${version} · 태그 ${tag}`);

// 통계 설정이 빠진 설치 파일은 정상 실행되어도 아무 이벤트도 보내지 않습니다.
// 서명·프런트 빌드보다 먼저 검사하고, Rust 직접 빌드도 build.rs에서 검사합니다.
const dotEnv = readDotEnv(path.join(TAURI_DIR, '.env'));
let analyticsSettings;
try {
  analyticsSettings = releaseAnalyticsSettings(process.env, dotEnv);
} catch (error) {
  fail(/** @type {Error} */ (error).message);
}
console.log(`   PostHog 운영 수집 설정 확인 (${analyticsSettings.host})`);

// 새 도구를 추가하면서 통계 분류를 빠뜨린 변경도 배포 단계에서 잡습니다.
step('통계 회귀 검사를 실행합니다');
/** @type {[string, string[], string][]} */
const analyticsChecks = [
  [process.execPath, ['--test', 'scripts/lib/analyticsBuild.test.mjs', 'scripts/lib/releaseVersion.test.mjs', 'src/lib/analyticsActivity.test.js', 'src/lib/timers/analytics.test.js'], ROOT],
  ['cargo', ['test', '--lib', 'analytics::tests'], TAURI_DIR],
];
for (const [command, args, cwd] of analyticsChecks) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) fail('통계 회귀 검사 실패: 새 창 분류·중복 제거·배포 설정·버전 표기를 확인하세요.');
}

// ── 서명 키 점검 ──────────────────────────────────────────────────────
step('업데이트 서명 키를 확인합니다');
const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH || dotEnv.TAURI_SIGNING_PRIVATE_KEY_PATH || DEFAULT_KEY_PATH;
let privateKey = process.env.TAURI_SIGNING_PRIVATE_KEY || dotEnv.TAURI_SIGNING_PRIVATE_KEY || '';
if (!privateKey) {
  if (!existsSync(keyPath)) {
    fail(`업데이트 서명 키가 없습니다: ${keyPath}\n` +
      '   docs/업데이트-배포-가이드.md의 "서명 키" 절을 보고 백업해 둔 키를 이 위치에 두세요.\n' +
      '   ⚠️ 새 키를 만들면 이미 설치된 앱들이 새 버전을 거부합니다. 반드시 원래 키를 찾아야 합니다.');
  }
  // 파일 경로 대신 내용을 넘깁니다. (CLI 버전에 따라 경로를 받지 않는 경우가 있어 가장 확실한 방법)
  privateKey = readFileSync(keyPath, 'utf8').trim();
}
const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? dotEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '';
const signingEnv = {
  ...process.env,
  TAURI_SIGNING_PRIVATE_KEY: privateKey,
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password,
};
// 경로 변수가 남아 있으면 CLI가 내용 대신 그 경로를 읽을 수 있어 지웁니다.
delete signingEnv.TAURI_SIGNING_PRIVATE_KEY_PATH;

// 빌드(수 분) 전에 작은 파일에 서명해 보고, 앱에 들어 있는 공개 키로 확인합니다.
// 왜: 다른 키로 빌드해 올리면 사용자 앱이 모두 설치를 거부하는데, 이 사실은 배포 뒤에야 드러납니다.
const probeDir = mkdtempSync(path.join(tmpdir(), 'tidy-task-signing-'));
let probeError = '';
try {
  const probeFile = path.join(probeDir, 'probe.bin');
  writeFileSync(probeFile, `Tidy Task ${version} signing probe ${Date.now()}`);
  const signed = spawnSync(process.execPath, [TAURI_CLI, 'signer', 'sign', probeFile], {
    cwd: ROOT,
    env: signingEnv,
    encoding: 'utf8',
  });
  if (signed.status !== 0 || !existsSync(`${probeFile}.sig`)) {
    probeError = `서명 키로 서명하지 못했습니다(키 파일이나 암호를 확인하세요).\n${signed.stderr || signed.stdout || ''}`;
  } else {
    try {
      verifySignature(readFileSync(probeFile), readFileSync(`${probeFile}.sig`, 'utf8'), pubkey);
    } catch (error) {
      probeError = `서명 키가 앱의 공개 키와 짝이 맞지 않습니다.\n   ${/** @type {Error} */ (error).message}`;
    }
  }
} finally {
  rmSync(probeDir, { recursive: true, force: true });
}
if (probeError) fail(probeError);
console.log('   서명 키가 앱의 공개 키와 짝이 맞습니다.');

// ── 2) 빌드 ───────────────────────────────────────────────────────────
const installerName = bundledInstallerName(config.productName, version);
const nsisDir = path.join(TAURI_DIR, 'target', 'release', 'bundle', 'nsis');
const installerPath = path.join(nsisDir, installerName);
const signaturePath = `${installerPath}.sig`;

const buildStartedAt = Date.now();
if (skipBuild) {
  step('--skip-build: 이미 만든 설치 파일을 씁니다');
} else {
  step('설치 파일을 빌드합니다 (몇 분 걸립니다)');
  const built = spawnSync(process.execPath, [TAURI_CLI, 'build'], { cwd: ROOT, env: signingEnv, stdio: 'inherit' });
  if (built.status !== 0) fail('빌드에 실패했습니다. 위 오류를 확인하세요.');
}

// ── 3) 결과 확인 ──────────────────────────────────────────────────────
step('설치 파일과 서명을 확인합니다');
const analyticsBinaryPath = path.join(TAURI_DIR, 'target', 'release', 'deps', 'tidy_task.exe');
if (!existsSync(analyticsBinaryPath)) fail('통계 설정을 검사할 배포 실행 파일이 없습니다. --skip-build 없이 다시 빌드하세요.');
try {
  verifyAnalyticsBinary(readFileSync(analyticsBinaryPath), analyticsSettings);
  const assetsDir = path.join(ROOT, 'dist', 'assets');
  const assets = readdirSync(assetsDir).filter(name => name.endsWith('.js')).map(name => readFileSync(path.join(assetsDir, name)));
  verifyAnalyticsFrontend(Buffer.concat(assets));
} catch (error) {
  fail(/** @type {Error} */ (error).message);
}
if (!existsSync(installerPath)) fail(`설치 파일이 없습니다: ${installerPath}`);
if (!existsSync(signaturePath)) fail(`서명 파일이 없습니다: ${signaturePath}`);
const installerTime = statSync(installerPath).mtimeMs;
if (!skipBuild && installerTime < buildStartedAt - 1000) {
  fail('설치 파일이 이번 빌드에서 새로 만들어지지 않았습니다(이전 결과물일 수 있습니다).');
}
if (statSync(signaturePath).mtimeMs + 1000 < installerTime) {
  fail('서명 파일이 설치 파일보다 오래되었습니다. 다른 빌드의 서명일 수 있습니다.');
}

const installer = readFileSync(installerPath);
const analyticsReceiptPath = `${installerPath}.analytics.json`;
if (skipBuild) {
  try {
    const receipt = existsSync(analyticsReceiptPath) ? readJson(analyticsReceiptPath) : null;
    verifyAnalyticsBuildReceipt(installer, analyticsSettings, receipt);
  } catch (error) {
    fail(/** @type {Error} */ (error).message);
  }
}
const signature = readFileSync(signaturePath, 'utf8').trim();
try {
  const checked = verifySignature(installer, signature, pubkey);
  if (checked.fields.file && checked.fields.file !== installerName) {
    fail(`서명이 다른 파일(${checked.fields.file})의 것입니다.`);
  }
} catch (error) {
  fail(`설치 파일의 서명을 확인하지 못했습니다.\n   ${/** @type {Error} */ (error).message}`);
}
console.log(`   ${installerName} (${megabytes(installer.length)}) 서명 확인`);
if (!skipBuild) {
  writeFileSync(analyticsReceiptPath, `${JSON.stringify(analyticsBuildReceipt(installer, analyticsSettings), null, 2)}\n`);
}

// ── 4) 올릴 파일 준비 ─────────────────────────────────────────────────
step('GitHub 릴리스에 올릴 파일을 준비합니다');
const outDir = path.join(ROOT, 'output', 'release', releaseTag(version));
// 기존 릴리스·검수 자료를 지우지 않습니다. 이번 버전의 두 파일만 아래에서 기록합니다.
mkdirSync(outDir, { recursive: true });

const assetName = releaseAssetName(installerName);
const assetPath = path.join(outDir, assetName);
copyFileSync(installerPath, assetPath);
const manifest = buildLatestJson({ version, signature, url: assetDownloadUrl(version, assetName, tag) });
writeFileSync(path.join(outDir, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// 준비한 파일 그대로 한 번 더 확인합니다(복사·기록 중 문제가 없었는지).
try {
  verifySignature(readFileSync(assetPath), manifest.platforms[PLATFORM_KEYS[0]].signature, pubkey);
} catch (error) {
  fail(`준비한 설치 파일의 서명을 확인하지 못했습니다.\n   ${/** @type {Error} */ (error).message}`);
}

console.log(`
✅ 준비 완료: ${path.relative(ROOT, outDir)}
   · ${assetName} (${megabytes(installer.length)})
   · latest.json

다음 순서로 GitHub 릴리스를 만드세요 (docs/업데이트-배포-가이드.md):
   1. 새 태그: ${tag}
   2. 위 폴더의 파일 두 개를 모두 첨부합니다.
      ⚠️ latest.json을 빠뜨리면 앱 안 설치가 멈추고, 사용자에게 직접 내려받기를 안내합니다.
   3. Publish release 후 확인: npm run release:verify
`);
