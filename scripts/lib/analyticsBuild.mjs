import { createHash } from 'node:crypto';

/** Resolve settings exactly like build.rs: an explicit empty environment value overrides .env.
 * @param {Record<string, string | undefined>} environment
 * @param {Record<string, string>} dotEnv
 */
export function releaseAnalyticsSettings(environment, dotEnv) {
  const token = (environment.POSTHOG_PROJECT_TOKEN ?? dotEnv.POSTHOG_PROJECT_TOKEN ?? '').trim();
  const host = (environment.POSTHOG_HOST ?? dotEnv.POSTHOG_HOST ?? 'https://us.i.posthog.com').trim();
  if (token.length <= 16 || !/^(phc_|ph_project_)[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('POSTHOG_PROJECT_TOKEN이 없거나 공개 Project token 형식이 아닙니다. src-tauri/.env에 운영 프로젝트 토큰을 설정하고 다시 빌드하세요. 개인 API 키는 사용할 수 없습니다.');
  }
  if (!['https://us.i.posthog.com', 'https://eu.i.posthog.com'].includes(host)) {
    throw new Error('POSTHOG_HOST는 https://us.i.posthog.com 또는 https://eu.i.posthog.com이어야 합니다.');
  }
  return { token, host };
}

/** Catch stale executables even when the local .env has since been repaired.
 * @param {Buffer} binary
 * @param {{token:string, host:string}} settings
 */
export function verifyAnalyticsBinary(binary, settings) {
  if (!binary.includes(Buffer.from(settings.token)) || !binary.includes(Buffer.from(settings.host))) {
    throw new Error('실행 파일에 현재 PostHog 수집 설정이 없습니다. --skip-build로는 설정을 반영할 수 없습니다. npm run release로 새로 빌드하세요.');
  }
  // Rust의 match 문자열은 최적화 때 여러 정수 비교로 나뉠 수 있습니다.
  // 직접 생성하는 고정 이벤트만 네이티브에서 검사하고, 호출 지점은 실제 JS 번들에서 확인합니다.
  for (const event of ['tool_active_minute']) {
    if (!binary.includes(Buffer.from(event))) {
      throw new Error(`실행 파일에 도구별 통계(${event})가 없습니다. --skip-build 없이 다시 빌드하세요.`);
    }
  }
}

/** @param {Buffer} assets */
export function verifyAnalyticsFrontend(assets) {
  for (const event of ['dice_rolled', 'timer_started', 'timer_completed', 'vote_created', 'vote_counting_started', 'vote_completed']) {
    if (!assets.includes(Buffer.from(event))) {
      throw new Error(`프런트 배포 번들에 통계 호출(${event})이 없습니다. --skip-build 없이 다시 빌드하세요.`);
    }
  }
}

/** @param {Buffer | string} value */
const digest = (value) => createHash('sha256').update(value).digest('hex');

/** Bind the verified build configuration to the exact signed installer.
 * @param {Buffer} installer
 * @param {{token:string, host:string}} settings
 */
export function analyticsBuildReceipt(installer, settings) {
  return { schema: 1, installerSha256: digest(installer), configurationSha256: digest(`${settings.host}|${settings.token}`) };
}

/** @param {Buffer} installer @param {{token:string, host:string}} settings @param {unknown} receipt */
export function verifyAnalyticsBuildReceipt(installer, settings, receipt) {
  const expected = analyticsBuildReceipt(installer, settings);
  const saved = /** @type {Partial<typeof expected> | null} */ (receipt);
  if (saved?.schema !== expected.schema || saved?.installerSha256 !== expected.installerSha256 || saved?.configurationSha256 !== expected.configurationSha256) {
    throw new Error('설치 파일에 대한 PostHog 빌드 확인 기록이 없거나 현재 설정과 다릅니다. --skip-build 없이 npm run release로 다시 빌드하세요.');
  }
}
