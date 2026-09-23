// ═══════════════════════════════════════════════════════════════════════
// [앱 안 업데이트 배포 규칙] 릴리스에 올릴 파일 이름과 latest.json 모양을 한곳에서 정합니다.
//
// 앱은 두 곳을 봅니다 (둘이 어긋나면 앱 안 설치를 멈추고 직접 내려받기로 안내합니다):
//   1) GitHub API의 최신 릴리스 태그 → "새 버전이 나왔다"는 안내 (src/lib/updateChecker.js)
//   2) 최신 릴리스에 첨부된 latest.json → 실제로 받을 파일 주소와 서명 (src-tauri/src/app_update.rs)
// 그래서 태그 번호·latest.json의 version·설치 파일 이름이 모두 같은 버전을 가리켜야 합니다.
// ═══════════════════════════════════════════════════════════════════════

export const GITHUB_OWNER = 'djqanrudgns12';
export const GITHUB_REPO = 'Tidy-Task-Local';
// tauri.conf.json의 plugins.updater.endpoints와 같은 주소
export const LATEST_JSON_URL =
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/latest.json`;
export const LATEST_RELEASE_API =
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// 이 PC(윈도우 64비트, NSIS 설치 파일)를 가리키는 latest.json 항목 이름.
// 앱은 "windows-x86_64-nsis"를 먼저, 없으면 "windows-x86_64"를 찾습니다. 둘 다 적어 둡니다.
export const PLATFORM_KEYS = Object.freeze(['windows-x86_64-nsis', 'windows-x86_64']);

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** @param {unknown} version */
export function isReleaseVersion(version) {
  return typeof version === 'string' && VERSION_PATTERN.test(version);
}

// 태그는 배포 가이드의 규칙대로 "v" + 버전입니다. (앱의 updateChecker가 v 접두사를 받아들입니다)
/** @param {string} version */
export function releaseTag(version) {
  return `v${version}`;
}

// Tauri가 만드는 설치 파일 이름
/** @param {string} productName @param {string} version */
export function bundledInstallerName(productName, version) {
  return `${productName}_${version}_x64-setup.exe`;
}

// GitHub는 첨부 파일 이름의 공백을 점으로 바꿉니다("Tidy Task_…" → "Tidy.Task_…").
// latest.json에 적은 주소와 실제 첨부 파일 이름이 어긋나지 않도록, 처음부터 바뀐 이름으로 올립니다.
/** @param {string} fileName */
export function releaseAssetName(fileName) {
  return fileName.replace(/\s+/g, '.');
}

/** @param {string} version @param {string} assetName */
export function assetDownloadUrl(version, assetName) {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${releaseTag(version)}/${encodeURIComponent(assetName)}`;
}

// latest.json 내용을 만듭니다.
// notes는 비워 둡니다. 앱의 "이번에 좋아진 점"은 GitHub 릴리스 본문에서 읽습니다.
/** @param {{ version: string, signature: string, url: string, pubDate?: Date }} options */
export function buildLatestJson({ version, signature, url, pubDate = new Date() }) {
  if (!isReleaseVersion(version)) throw new Error(`버전 형식이 올바르지 않습니다: ${version}`);
  const cleanSignature = String(signature || '').trim();
  if (!cleanSignature) throw new Error('서명이 비어 있습니다.');
  if (!/^https:\/\//.test(url)) throw new Error(`설치 파일 주소는 https여야 합니다: ${url}`);
  /** @type {Record<string, { signature: string, url: string }>} */
  const platforms = {};
  for (const key of PLATFORM_KEYS) platforms[key] = { signature: cleanSignature, url };
  return {
    version,
    pub_date: pubDate.toISOString(),
    platforms,
  };
}

// latest.json을 앱과 같은 기준으로 점검하고, 이 PC용 항목을 돌려줍니다.
/** @param {any} manifest */
export function readLatestJson(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('latest.json이 JSON 객체가 아닙니다.');
  const version = String(manifest.version || '').replace(/^v/i, '');
  if (!isReleaseVersion(version)) throw new Error(`latest.json의 version이 올바르지 않습니다: ${manifest.version}`);
  if (manifest.pub_date !== undefined && Number.isNaN(Date.parse(manifest.pub_date))) {
    throw new Error(`latest.json의 pub_date가 날짜가 아닙니다: ${manifest.pub_date}`);
  }
  const platforms = manifest.platforms && typeof manifest.platforms === 'object' ? manifest.platforms : {};
  const key = PLATFORM_KEYS.find((name) => platforms[name]);
  if (!key) throw new Error(`latest.json에 윈도우용 항목(${PLATFORM_KEYS.join(' 또는 ')})이 없습니다.`);
  const entry = platforms[key];
  if (typeof entry.signature !== 'string' || !entry.signature.trim()) throw new Error('latest.json에 서명이 없습니다.');
  if (typeof entry.url !== 'string' || !/^https:\/\//.test(entry.url)) throw new Error('latest.json의 설치 파일 주소가 https가 아닙니다.');
  return { version, signature: entry.signature.trim(), url: entry.url };
}
