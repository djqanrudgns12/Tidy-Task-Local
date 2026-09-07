import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_CHECK_INTERVAL_MS,
  RELEASES_PAGE_URL,
  buildUpdateInfo,
  compareVersions,
  describeUpdateError,
  fetchLatestRelease,
  formatBytes,
  formatReleaseDate,
  isNewerVersion,
  normalizeReleaseNotes,
  parseVersion,
  pickWindowsInstaller,
  shouldAutoCheck,
  shouldNotifyUser,
} from './updateChecker.js';

// ── 버전 파싱 ──────────────────────────────────────────────────────────
test('parseVersion: v 접두사와 자릿수 생략을 모두 받아들인다', () => {
  assert.deepEqual(parseVersion('v5.1.0'), { major: 5, minor: 1, patch: 0, prerelease: '' });
  assert.deepEqual(parseVersion('5.1'), { major: 5, minor: 1, patch: 0, prerelease: '' });
  assert.deepEqual(parseVersion('  6  '), { major: 6, minor: 0, patch: 0, prerelease: '' });
  assert.deepEqual(parseVersion('5.1.0-beta.2'), { major: 5, minor: 1, patch: 0, prerelease: 'beta.2' });
});

test('parseVersion: 버전이 아닌 값은 null을 돌려준다', () => {
  for (const bad of ['', 'latest', 'v', null, undefined, 42, {}]) {
    assert.equal(parseVersion(bad), null);
  }
});

// ── 버전 비교 ──────────────────────────────────────────────────────────
test('compareVersions: 자리별 우선순위를 지킨다', () => {
  assert.equal(compareVersions('6.0.0', '5.9.9'), 1);
  assert.equal(compareVersions('5.2.0', '5.1.9'), 1);
  assert.equal(compareVersions('5.1.1', '5.1.0'), 1);
  assert.equal(compareVersions('5.1.0', '5.1.0'), 0);
  assert.equal(compareVersions('5.0.0', '5.0.1'), -1);
});

test('compareVersions: 10 이상 숫자를 문자열로 비교하지 않는다', () => {
  // 문자열 비교였다면 "5.9.0" > "5.10.0" 이라는 잘못된 결과가 나옵니다.
  assert.equal(compareVersions('5.10.0', '5.9.0'), 1);
  assert.equal(compareVersions('v5.0.10', 'v5.0.9'), 1);
});

test('compareVersions: 정식판이 프리릴리스보다 새 버전이다', () => {
  assert.equal(compareVersions('5.1.0', '5.1.0-beta.1'), 1);
  assert.equal(compareVersions('5.1.0-beta.1', '5.1.0'), -1);
  assert.equal(compareVersions('5.1.0-beta.2', '5.1.0-beta.1'), 1);
});

test('compareVersions: 파싱 불가한 값은 0(변화 없음)으로 안전 처리한다', () => {
  assert.equal(compareVersions('latest', '5.0.0'), 0);
  assert.equal(compareVersions('5.0.0', undefined), 0);
});

test('isNewerVersion: 값이 이상하면 절대 업데이트를 권하지 않는다', () => {
  assert.equal(isNewerVersion('5.1.0', '5.0.0'), true);
  assert.equal(isNewerVersion('5.0.0', '5.0.0'), false);
  assert.equal(isNewerVersion('4.9.0', '5.0.0'), false);
  assert.equal(isNewerVersion('latest', '5.0.0'), false);
  assert.equal(isNewerVersion('5.1.0', ''), false);
});

// ── 설치 파일 선택 ─────────────────────────────────────────────────────
test('pickWindowsInstaller: NSIS 설치 파일(.exe)을 최우선으로 고른다', () => {
  const picked = pickWindowsInstaller([
    { name: 'Tidy Task_5.1.0_x64_en-US.msi', browser_download_url: 'https://x/msi', size: 10 },
    { name: 'Tidy Task_5.1.0_x64-setup.exe', browser_download_url: 'https://x/exe', size: 20 },
    { name: 'Tidy Task_5.1.0_x64-setup.exe.sig', browser_download_url: 'https://x/sig', size: 1 },
  ]);
  assert.equal(picked.name, 'Tidy Task_5.1.0_x64-setup.exe');
});

test('pickWindowsInstaller: 설치 파일이 없으면 null을 돌려준다', () => {
  assert.equal(pickWindowsInstaller([{ name: 'source.zip', browser_download_url: 'https://x/zip' }]), null);
  assert.equal(pickWindowsInstaller([]), null);
  assert.equal(pickWindowsInstaller(null), null);
});

test('pickWindowsInstaller: 다운로드 주소가 없는 항목은 후보에서 제외한다', () => {
  assert.equal(pickWindowsInstaller([{ name: 'setup.exe' }]), null);
});

// ── 릴리스 노트 정리 ───────────────────────────────────────────────────
test('normalizeReleaseNotes: 마크다운 기호를 걷어내고 읽기 쉬운 줄만 남긴다', () => {
  const notes = normalizeReleaseNotes([
    '## 새로워진 점',
    '',
    '- **테마**가 15종으로 늘었습니다',
    '1. [사용법](https://example.com) 문서를 추가했습니다',
    '---',
    '> 버그를 고쳤습니다',
  ].join('\n'));

  assert.deepEqual(notes, [
    '새로워진 점',
    '테마가 15종으로 늘었습니다',
    '사용법 문서를 추가했습니다',
    '버그를 고쳤습니다',
  ]);
});

test('normalizeReleaseNotes: "1)" 형식 번호 목록도 걷어낸다', () => {
  // 실제 v5.0.0 릴리스 노트가 이 형식이었습니다. 남겨두면 UI 글머리 기호와 겹쳐 보입니다.
  const notes = normalizeReleaseNotes([
    '1) Tidy Task 테마 8종 추가',
    '2) 글자 겹침 해소',
    '3. 점 형식도 함께 처리',
  ].join('\n'));

  assert.deepEqual(notes, [
    'Tidy Task 테마 8종 추가',
    '글자 겹침 해소',
    '점 형식도 함께 처리',
  ]);
});

test('normalizeReleaseNotes: 괄호로 시작하는 일반 문장은 건드리지 않는다', () => {
  // "(2026. 09. 07, v.5.0.0)" 같은 날짜 표기가 잘려나가면 안 됩니다.
  assert.deepEqual(normalizeReleaseNotes('(2026. 09. 07, v.5.0.0)'), ['(2026. 09. 07, v.5.0.0)']);
});

test('normalizeReleaseNotes: 코드 블록과 HTML 주석은 통째로 지운다', () => {
  const notes = normalizeReleaseNotes('안내\n```\nnpm run build\n```\n<!-- 내부 메모 -->\n끝');
  assert.deepEqual(notes, ['안내', '끝']);
});

test('normalizeReleaseNotes: 줄 수와 길이를 제한한다', () => {
  const long = Array.from({ length: 20 }, (_, i) => `줄${i}`).join('\n');
  assert.equal(normalizeReleaseNotes(long).length, 8);

  const wide = normalizeReleaseNotes('가'.repeat(300));
  assert.equal(wide[0].length, 120);
  assert.ok(wide[0].endsWith('…'));
});

test('normalizeReleaseNotes: 본문이 없으면 빈 배열이다', () => {
  assert.deepEqual(normalizeReleaseNotes(''), []);
  assert.deepEqual(normalizeReleaseNotes(null), []);
});

// ── 표시용 포맷터 ──────────────────────────────────────────────────────
test('formatBytes: 사람이 읽는 단위로 바꾼다', () => {
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0MB');
  assert.equal(formatBytes(300 * 1024), '300KB');
  assert.equal(formatBytes(0), '');
  assert.equal(formatBytes(undefined), '');
});

test('formatReleaseDate: 한국어 날짜로 바꾸고, 이상한 값은 빈 문자열이다', () => {
  assert.equal(formatReleaseDate('2026-09-08T00:00:00Z').endsWith('일'), true);
  assert.equal(formatReleaseDate('말도 안 되는 날짜'), '');
  assert.equal(formatReleaseDate(''), '');
});

// ── 확인 주기 판단 ─────────────────────────────────────────────────────
test('shouldAutoCheck: 한 번도 확인한 적 없으면 즉시 확인한다', () => {
  assert.equal(shouldAutoCheck({ lastCheckedAt: 0, now: 1000 }), true);
});

test('shouldAutoCheck: 주기가 지나야 다시 확인한다', () => {
  const now = 10_000_000_000;
  assert.equal(shouldAutoCheck({ lastCheckedAt: now - 1000, now }), false);
  assert.equal(shouldAutoCheck({ lastCheckedAt: now - AUTO_CHECK_INTERVAL_MS, now }), true);
});

test('shouldAutoCheck: 시계가 뒤로 돌아가도 영구 잠김에 빠지지 않는다', () => {
  // 저장된 마지막 확인 시각이 미래면(시계 조정 등) 즉시 다시 확인해야 합니다.
  assert.equal(shouldAutoCheck({ lastCheckedAt: 20_000, now: 10_000 }), true);
});

// ── 알림 여부 판단 ─────────────────────────────────────────────────────
test('shouldNotifyUser: 건너뛴 버전은 다시 알리지 않는다', () => {
  const now = 1000;
  assert.equal(shouldNotifyUser({ latestVersion: '5.1.0', skippedVersion: '5.1.0', now }), false);
});

test('shouldNotifyUser: 건너뛴 버전보다 더 새 버전이 나오면 다시 알린다', () => {
  assert.equal(shouldNotifyUser({ latestVersion: '5.2.0', skippedVersion: '5.1.0', now: 1000 }), true);
});

test('shouldNotifyUser: "나중에" 기간 안에는 조용히 있는다', () => {
  assert.equal(shouldNotifyUser({ latestVersion: '5.1.0', snoozeUntil: 5000, now: 1000 }), false);
  assert.equal(shouldNotifyUser({ latestVersion: '5.1.0', snoozeUntil: 5000, now: 6000 }), true);
});

test('shouldNotifyUser: 버전 정보가 없으면 알리지 않는다', () => {
  assert.equal(shouldNotifyUser({ latestVersion: '', now: 1000 }), false);
  assert.equal(shouldNotifyUser({}), false);
});

// ── 응답 정규화 ────────────────────────────────────────────────────────
test('buildUpdateInfo: GitHub 응답을 앱이 쓰는 형태로 바꾼다', () => {
  const info = buildUpdateInfo({
    tag_name: 'v5.1.0',
    name: 'Tidy Task 5.1.0',
    body: '- 테마를 추가했습니다',
    published_at: '2026-09-08T01:00:00Z',
    html_url: 'https://github.com/o/r/releases/tag/v5.1.0',
    assets: [{ name: 'Tidy-Task_5.1.0_x64-setup.exe', browser_download_url: 'https://x/exe', size: 8_000_000 }],
  });

  assert.equal(info.version, '5.1.0');
  assert.equal(info.title, 'Tidy Task 5.1.0');
  assert.equal(info.hasInstaller, true);
  assert.equal(info.downloadUrl, 'https://x/exe');
  assert.equal(info.assetSize, 8_000_000);
  assert.deepEqual(info.notes, ['테마를 추가했습니다']);
});

test('buildUpdateInfo: 설치 파일이 없으면 릴리스 페이지로 안내한다', () => {
  const info = buildUpdateInfo({
    tag_name: '5.1.0',
    html_url: 'https://github.com/o/r/releases/tag/5.1.0',
    assets: [],
  });

  assert.equal(info.hasInstaller, false);
  assert.equal(info.downloadUrl, 'https://github.com/o/r/releases/tag/5.1.0');
  // 제목이 비어 있으면 태그 이름으로 대신 채웁니다.
  assert.equal(info.title, '5.1.0');
});

test('buildUpdateInfo: 태그가 버전 형식이 아니면 null이다', () => {
  assert.equal(buildUpdateInfo({ tag_name: 'nightly' }), null);
  assert.equal(buildUpdateInfo(null), null);
});

test('buildUpdateInfo: html_url이 없어도 공식 릴리스 페이지로 되돌아간다', () => {
  const info = buildUpdateInfo({ tag_name: 'v5.1.0', assets: [] });
  assert.equal(info.downloadUrl, RELEASES_PAGE_URL);
  assert.equal(info.pageUrl, RELEASES_PAGE_URL);
});

// ── 네트워크 실패 처리 ─────────────────────────────────────────────────
test('fetchLatestRelease: 404는 "아직 릴리스 없음"으로 구분한다', async () => {
  const fetchImpl = async () => ({ status: 404, ok: false });
  await assert.rejects(() => fetchLatestRelease({ fetchImpl }), (e) => e.code === 'NO_RELEASE');
});

test('fetchLatestRelease: 403/429는 호출 제한으로 구분한다', async () => {
  for (const status of [403, 429]) {
    const fetchImpl = async () => ({ status, ok: false });
    await assert.rejects(() => fetchLatestRelease({ fetchImpl }), (e) => e.code === 'RATE_LIMITED');
  }
});

test('fetchLatestRelease: 연결 자체가 실패하면 OFFLINE으로 구분한다', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(() => fetchLatestRelease({ fetchImpl }), (e) => e.code === 'OFFLINE');
});

test('fetchLatestRelease: 성공하면 원본 JSON을 그대로 돌려준다', async () => {
  const fetchImpl = async () => ({ status: 200, ok: true, json: async () => ({ tag_name: 'v5.1.0' }) });
  const release = await fetchLatestRelease({ fetchImpl });
  assert.equal(release.tag_name, 'v5.1.0');
});

test('describeUpdateError: 모든 코드가 사용자에게 보여줄 한국어 안내를 가진다', () => {
  for (const code of ['NO_RELEASE', 'RATE_LIMITED', 'OFFLINE', 'TIMEOUT', 'RELAY_TIMEOUT', 'UNKNOWN', '']) {
    const message = describeUpdateError(code);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0);
  }
});
