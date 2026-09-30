// ═══════════════════════════════════════════════════════════════════
// [컴퓨터를 켜면 자동 실행] 앱 전체 설정 — 설정 창 → 동작 탭에서만 바꿉니다.
//
// 값은 두 곳에 나뉘어 있습니다.
//   · 실제 등록: Windows 시작 프로그램 (tauri-plugin-autostart)
//   · 사용자의 선택(true/false/고른 적 없음): 온도계 저장 파일의 display.windowsStart
// 왜 선택을 따로 적는가: 앱은 시작할 때마다 "등록이 빠져 있으면 다시 등록"합니다(기본이 켜짐이라서).
//   사용자가 끈 사실을 적어 두지 않으면 다음 실행 때 도로 켜집니다.
// 왜 온도계 파일인가: 5.6.x에서 이 선택을 그 자리에 적기 시작했고(당시 미니 온도계 설정의 시작 줄),
//   앱은 시작할 때 그 값을 읽어 왔습니다. 자리를 옮기면 이미 "끔"을 적어 둔 사용자의 선택을 잃거나
//   같은 뜻의 값이 두 곳에 생겨 어긋나므로, 새 키를 만들지 않고 그 값을 그대로 씁니다.
//   (구역별 revision으로 저장되어 다른 창과 겹쳐 써도 안전하고, 업데이트 직전 사본에도 들어갑니다)
// ═══════════════════════════════════════════════════════════════════
import { invoke } from '@tauri-apps/api/core';
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
import { createSection } from './scores/section.js';
import { normalizeDisplay } from './thermometer/display.js';

/** 저장된 선택을 "자동 실행을 원하는가"로 바꿉니다. 고른 적이 없으면(null) 켜짐이 기본입니다.
 * @param {unknown} savedChoice */
export function wantsLaunchAtStartup(savedChoice) {
  return savedChoice !== false;
}

/**
 * @typedef {{
 *   isEnabled: () => Promise<boolean>, enable: () => Promise<unknown>, disable: () => Promise<unknown>,
 *   readChoice: () => Promise<boolean | null>, saveChoice: (value: boolean) => Promise<unknown>,
 * }} LaunchDeps
 */

/** 등록·선택을 다루는 창구를 만듭니다. 실제 의존성을 바꿔 끼울 수 있게 나눠 두었습니다(단위 테스트용).
 * @param {LaunchDeps} deps */
export function createLaunchAtStartup(deps) {
  return {
    /** 앱을 시작할 때: 사용자가 끄지 않았는데 등록이 빠져 있으면 등록합니다. 끈 경우에는 건드리지 않습니다.
     * @returns {Promise<boolean>} 자동 실행을 원하는 상태인지 */
    async ensure() {
      if (!wantsLaunchAtStartup(await deps.readChoice())) return false;
      if (!(await deps.isEnabled())) await deps.enable();
      return true;
    },

    /** 설정 화면에 보일 현재 상태. 실제 등록 여부를 먼저 보고, 확인할 수 없으면 저장된 선택을 따릅니다. */
    async read() {
      try {
        return Boolean(await deps.isEnabled());
      } catch {
        return wantsLaunchAtStartup(await deps.readChoice().catch(() => null));
      }
    },

    /** 켜거나 끕니다. 등록을 바꾸고 → 실제로 바뀌었는지 확인하고 → 선택을 저장합니다.
     * 선택을 저장하지 못하면 등록을 되돌립니다(끈 것이 다음 실행 때 조용히 다시 켜지지 않게).
     * @param {boolean} value @returns {Promise<boolean>} 적용된 상태 */
    async set(value) {
      const before = Boolean(await deps.isEnabled());
      if (before !== value) await (value ? deps.enable() : deps.disable());
      if (Boolean(await deps.isEnabled()) !== value) throw new Error('자동 실행 등록을 바꾸지 못했어요.');
      try {
        await deps.saveChoice(value);
      } catch (error) {
        if (before !== value) await (before ? deps.enable() : deps.disable()).catch(() => {});
        throw error;
      }
      return value;
    },
  };
}

async function readChoice() {
  const value = await invoke('thermometer_windows_start');
  return typeof value === 'boolean' ? value : null;
}

/** @param {boolean} value */
async function saveChoice(value) {
  const client = createSection({ store: 'thermometer', section: 'display', normalize: normalizeDisplay });
  try {
    const current = await client.load();
    if (current.windowsStart === value) return;
    const result = await client.mutateAndConfirm((d) => ({ ...d, windowsStart: value }), (d) => d.windowsStart === value);
    if (result !== 'saved') throw new Error('자동 실행 설정을 저장하지 못했어요.');
  } finally {
    client.dispose();
  }
}

const launchAtStartup = createLaunchAtStartup({ isEnabled, enable, disable, readChoice, saveChoice });

export const ensureLaunchAtStartup = launchAtStartup.ensure;
export const readLaunchAtStartup = launchAtStartup.read;
export const setLaunchAtStartup = launchAtStartup.set;
