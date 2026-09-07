// ═══════════════════════════════════════════════════════════════════════
// [업데이트 안내 엔진] GitHub Releases를 읽어 "새 버전이 나왔는지"만 판별합니다.
//
// 왜 이 파일이 Tauri API와 완전히 분리돼 있는가:
//   버전 비교·설치 파일 선택·릴리스 노트 정리는 앱 실행 없이도 검증돼야 하는 순수 로직입니다.
//   (node --test 로 단위 테스트하기 위해 fetch 외에는 어떤 외부 의존성도 두지 않습니다)
//
// 왜 "자동 설치"가 아니라 "안내 + 공식 다운로드 링크"인가:
//   설치 과정이 사용자의 로컬 데이터(tidy-task-config.json)를 건드릴 수 있어,
//   먼저 안전한 안내 방식으로 검증한 뒤 자동 설치로 승격하는 단계적 전략을 택했습니다.
// ═══════════════════════════════════════════════════════════════════════

// ── 저장소 좌표 ────────────────────────────────────────────────────────
export const GITHUB_OWNER = 'djqanrudgns12';
export const GITHUB_REPO = 'Tidy-Task-Local';

// 최신 릴리스 1건만 읽는 공개 API (인증 불필요)
export const LATEST_RELEASE_API =
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// 사용자가 직접 열어볼 수 있는 공식 페이지 (다운로드 실패 시의 최후 안전망)
export const RELEASES_PAGE_URL =
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// ── 정책 상수 ──────────────────────────────────────────────────────────
// 자동 확인 주기(6시간). GitHub 비인증 API는 IP당 시간당 60회 제한이 있어
// 창을 여러 개 켜도 호출이 몰리지 않도록 매니저 창에서만, 주기를 지켜 호출합니다.
export const AUTO_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 6;

// 부팅 직후 바로 네트워크를 건드리면 앱 시작이 느려 보이므로 8초 뒤에 확인합니다.
export const BOOT_CHECK_DELAY_MS = 8000;

// "나중에 알림"을 누르면 하루 동안 조용히 있습니다.
export const SNOOZE_DURATION_MS = 1000 * 60 * 60 * 24;

// 응답이 없을 때 무한 대기하지 않도록 하는 네트워크 제한 시간
export const REQUEST_TIMEOUT_MS = 10000;

// 매니저 창에 확인을 요청한 뒤 답이 없을 때 "실패"로 정리하는 시간
export const RELAY_TIMEOUT_MS = 15000;

// ── 버전 파싱 / 비교 ───────────────────────────────────────────────────

// "v5.1.0", "5.1", "5.1.0-beta.2" 를 모두 받아 구조체로 바꿉니다.
// 왜 관대하게 파싱하는가: 태그 이름 표기가 조금씩 흔들려도(v 접두사 유무 등)
//   업데이트 안내가 통째로 죽는 일이 없어야 하기 때문입니다.
export function parseVersion(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^[vV]/, '');
  const matched = trimmed.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+](.+))?$/);
  if (!matched) return null;

  return {
    major: Number(matched[1]),
    minor: Number(matched[2] ?? 0),
    patch: Number(matched[3] ?? 0),
    // 정식 배포 전 버전(beta 등) 꼬리표. 없으면 빈 문자열.
    prerelease: matched[4] ? String(matched[4]) : '',
  };
}

// a가 b보다 크면 1, 같으면 0, 작으면 -1. 파싱 실패 시 0(=변화 없음)으로 안전하게 처리합니다.
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;

  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;

  // 시맨틱 버저닝 규칙: 5.1.0 은 5.1.0-beta.1 보다 "나중" 버전입니다.
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease > right.prerelease ? 1 : -1;
}

// 설치를 권할 만큼 "확실히 더 새로운" 버전인지 판별합니다.
export function isNewerVersion(latest, current) {
  if (!parseVersion(latest) || !parseVersion(current)) return false;
  return compareVersions(latest, current) > 0;
}

// ── 릴리스 자산(설치 파일) 선택 ────────────────────────────────────────

// 여러 첨부 파일 중 "윈도우 설치 파일" 하나를 고릅니다.
// 왜 점수제인가: 릴리스마다 파일 이름 규칙이 조금씩 달라도(setup 유무, x64 표기 등)
//   항상 사용자가 실행 가능한 설치 파일이 선택되도록 하기 위해서입니다.
export function pickWindowsInstaller(assets) {
  if (!Array.isArray(assets)) return null;

  const candidates = assets.filter((asset) => {
    if (!asset || typeof asset.name !== 'string') return false;
    if (!asset.browser_download_url) return false;
    // .sig / .zip 등 설치용이 아닌 부산물은 제외합니다.
    return /\.(exe|msi)$/i.test(asset.name);
  });
  if (candidates.length === 0) return null;

  const scoreOf = (asset) => {
    const name = asset.name.toLowerCase();
    let score = 0;
    if (name.endsWith('.exe')) score += 10;                    // NSIS 설치 파일 최우선
    if (name.includes('setup')) score += 4;
    if (name.includes('x64') || name.includes('amd64')) score += 2;
    return score;
  };

  return candidates.slice().sort((a, b) => scoreOf(b) - scoreOf(a))[0];
}

// ── 릴리스 노트 정리 ───────────────────────────────────────────────────

const MAX_NOTE_LINES = 8;
const MAX_NOTE_LENGTH = 120;

// 마크다운으로 쓰인 릴리스 본문을 "읽기 쉬운 짧은 문장 목록"으로 바꿉니다.
// 왜 필요한가: 원문에는 #, **, 링크 문법이 섞여 있어 앱 안에 그대로 띄우면
//   컴퓨터에 익숙하지 않은 사용자에게 오히려 혼란을 줍니다.
export function normalizeReleaseNotes(body) {
  if (typeof body !== 'string' || !body.trim()) return [];

  return body
    .replace(/<!--[\s\S]*?-->/g, '')     // HTML 주석 제거
    .replace(/```[\s\S]*?```/g, '')      // 코드 블록 제거
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^\s*[#>]+\s*/, '')                // 제목 / 인용 기호
      .replace(/^\s*[-*+]\s+/, '')                // 목록 기호
      // 번호 목록: "1. " 과 "1) " 를 모두 처리합니다.
      // 왜 ")" 형식도 넣는가: 실제 릴리스 노트에서 "1) 기능 추가"처럼 쓰는 경우가 흔한데,
      //   이걸 남겨두면 UI의 글머리 기호와 겹쳐 "● 1) 기능 추가"로 보입니다.
      .replace(/^\s*\d+[.)]\s*/, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')    // [글자](링크) → 글자
      .replace(/[*_`~]/g, '')                     // 강조 기호
      .trim())
    .filter((line) => line.length > 0 && !/^[-=]{3,}$/.test(line))
    .slice(0, MAX_NOTE_LINES)
    .map((line) => (line.length > MAX_NOTE_LENGTH
      ? `${line.slice(0, MAX_NOTE_LENGTH - 1)}…`
      : line));
}

// ── 표시용 포맷터 ──────────────────────────────────────────────────────

export function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function formatReleaseDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// ── 확인 시점 / 알림 여부 판단 ─────────────────────────────────────────

// 자동 확인을 지금 해도 되는지 판단합니다.
// 왜 미래 시각까지 방어하는가: 사용자가 시스템 시계를 앞당겼다 되돌리면
//   lastCheckedAt이 미래가 되어 영원히 확인하지 않는 상태로 굳어버립니다.
export function shouldAutoCheck({ lastCheckedAt, now, intervalMs = AUTO_CHECK_INTERVAL_MS } = {}) {
  const last = Number(lastCheckedAt) || 0;
  const current = Number(now) || 0;
  if (last <= 0) return true;
  if (last > current) return true;
  return current - last >= intervalMs;
}

// 자동으로 발견한 새 버전을 사용자에게 띄워도 되는지 판단합니다.
// (사용자가 "건너뛰기" 또는 "나중에"를 선택한 의사를 존중합니다)
export function shouldNotifyUser({ latestVersion, skippedVersion, snoozeUntil, now } = {}) {
  if (!latestVersion) return false;

  // 건너뛴 버전이라도, 그보다 더 새로운 버전이 나오면 다시 알립니다.
  if (skippedVersion && compareVersions(latestVersion, skippedVersion) <= 0) return false;

  const until = Number(snoozeUntil) || 0;
  const current = Number(now) || 0;
  if (until > current) return false;

  return true;
}

// ── GitHub 응답 → 앱이 쓰는 형태로 정규화 ──────────────────────────────

export function buildUpdateInfo(release) {
  if (!release || typeof release !== 'object') return null;

  const tagName = typeof release.tag_name === 'string' ? release.tag_name : '';
  const parsed = parseVersion(tagName);
  if (!parsed) return null;

  const version = `${parsed.major}.${parsed.minor}.${parsed.patch}${parsed.prerelease ? `-${parsed.prerelease}` : ''}`;
  const installer = pickWindowsInstaller(release.assets);

  return {
    version,
    tagName,
    // 릴리스 제목이 비어 있으면 태그를 대신 씁니다.
    title: (typeof release.name === 'string' && release.name.trim()) ? release.name.trim() : tagName,
    notes: normalizeReleaseNotes(release.body),
    publishedAt: release.published_at || '',
    // 설치 파일 직링크. 없으면 릴리스 페이지로 안내합니다(빈 손으로 돌려보내지 않습니다).
    downloadUrl: installer ? installer.browser_download_url : (release.html_url || RELEASES_PAGE_URL),
    hasInstaller: Boolean(installer),
    assetName: installer ? installer.name : '',
    assetSize: installer ? Number(installer.size) || 0 : 0,
    pageUrl: release.html_url || RELEASES_PAGE_URL,
  };
}

// ── 네트워크 호출 ──────────────────────────────────────────────────────

// 실패 원인을 코드로 구분해 던집니다.
// 왜: 사용자에게 "인터넷을 확인해 주세요"와 "아직 배포된 버전이 없습니다"는
//   전혀 다른 안내여야 하는데, 뭉뚱그리면 불필요한 불안을 줍니다.
function updateError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

export async function fetchLatestRelease({ fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (typeof fetchImpl !== 'function') throw updateError('UNSUPPORTED');

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response;
  try {
    response = await fetchImpl(LATEST_RELEASE_API, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller ? controller.signal : undefined,
    });
  } catch (e) {
    // 네트워크 차단·오프라인·시간 초과는 모두 "연결 실패"로 묶어 안내합니다.
    throw updateError(e && e.name === 'AbortError' ? 'TIMEOUT' : 'OFFLINE');
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (response.status === 404) throw updateError('NO_RELEASE');
  if (response.status === 403 || response.status === 429) throw updateError('RATE_LIMITED');
  if (!response.ok) throw updateError('HTTP_ERROR', `HTTP ${response.status}`);

  try {
    return await response.json();
  } catch (e) {
    throw updateError('BAD_RESPONSE');
  }
}

// 오류 코드를 사용자가 읽을 수 있는 한국어 안내로 바꿉니다.
export function describeUpdateError(code) {
  switch (code) {
    case 'NO_RELEASE':
      return '아직 공개된 새 버전이 없습니다. 지금 버전을 계속 사용하시면 됩니다.';
    case 'RATE_LIMITED':
      return '확인 요청이 잠시 많았습니다. 10분쯤 뒤에 다시 눌러 주세요.';
    case 'OFFLINE':
      return '인터넷 연결을 확인해 주세요. 연결되면 자동으로 다시 확인합니다.';
    case 'TIMEOUT':
      return '응답이 늦어 확인을 멈췄습니다. 잠시 뒤 다시 눌러 주세요.';
    case 'RELAY_TIMEOUT':
      return '확인이 지연되고 있습니다. 잠시 뒤 다시 눌러 주세요.';
    default:
      return '업데이트 정보를 가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
  }
}
