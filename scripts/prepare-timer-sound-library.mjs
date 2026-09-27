// 타이머 효과음 라이브러리(시계음·종료 경고음·종료음 각 10개)를 공개 원본에서 다시 만듭니다.
// 사용: node scripts/prepare-timer-sound-library.mjs
// 필요: ffmpeg(PATH). 원본이 캐시(output/timer-sound-library/cache, 재생성 가능)에 없으면 내려받고 SHA-256을 대조합니다.
//
// 왜 스크립트로 남기는가: 어느 원본의 어느 구간을 어떻게 가공했는지 그대로 재현·검증할 수 있어야
// 나중에 음원을 바꾸거나 음량을 다시 맞출 때 추측하지 않습니다(artwork/toolkit/audio/manifest.json에 결과 기록).
//
// 가공 원칙
// - 반복음(시계음·경고음)은 정확히 1초(또는 2초) 길이로 만들어 초가 바뀌는 순간에 맞춰 울리게 합니다.
//   실제 녹음의 박 한 개씩을 잘라 정해진 박자 자리에 다시 놓습니다(실제 시계의 흔들리는 간격을 고르게 폄).
// - 종료음은 한 번 울리는 소리라 앞의 빈 구간만 줄이고, 긴 여운은 자연스럽게 페이드아웃합니다.
// - 음량은 ITU-R BS.1770(ffmpeg ebur128)으로 재서 기존 타이머 소리와 비슷한 크기로 맞춥니다.
//   반복음은 앱처럼 10번 이어 붙여 잽니다. 순간 최고점(true peak)은 -3 dBTP를 넘기지 않습니다.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { SOUND_LIBRARY } from '../src/lib/timers/soundLibrary.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const RATE = 48000;
const CACHE = path.join(root, 'output/timer-sound-library/cache');
const OUTPUT = path.join(root, 'public/audio/toolkit/timer-sounds');
const MANIFEST = path.join(root, 'artwork/toolkit/audio/manifest.json');
const TARGET_LUFS = { tick: -26, warning: -24.5, end: -24 };
const TRUE_PEAK_CEILING = -3;
const AOSP = 'https://raw.githubusercontent.com/aosp-mirror/platform_frameworks_base/1cdfff555f4a21f71ccc978290e2e212e2f8b168/data/sounds';
const MATERIAL = 'https://archive.org/download/material-design-sound-resources/material_product_sounds/wav';

const LICENSES = {
  bsb: {
    name: 'CC0 1.0 (BigSoundBank "Free and Royalty Free")',
    url: 'https://bigsoundbank.com/licenses.html',
    author: 'Joseph SARDIN / BigSoundBank.com',
  },
  kenney: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', author: 'Kenney (www.kenney.nl)' },
  material: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', author: 'Google (Material Design sound resources)' },
  aosp: {
    name: 'Apache-2.0',
    url: 'https://www.apache.org/licenses/LICENSE-2.0',
    author: 'The Android Open Source Project',
  },
};

/** 원본 목록. sha256은 내려받은 파일(zip이면 zip 안의 파일) 기준입니다. */
const SOURCES = {
  'bsb-0007': { provider: 'bsb', title: 'Clock', page: 'https://bigsoundbank.com/clock-s0007.html', sha256: 'f7bffc8e48d7e4fb93e6227e227921d98ab2ecfece733dbd77270bc5fc8e6779' },
  'bsb-1567': { provider: 'bsb', title: 'Grandfather clock, ticking', page: 'https://bigsoundbank.com/grandfather-clock-ticking-s1567.html', sha256: '31168085163f1d1bcfca6ea4cde0a1a6ab85bc5f94d09f72b62560c75aca4c32' },
  'bsb-2656': { provider: 'bsb', title: 'Tic Tac Mechanical Alarm Clock #3', page: 'https://bigsoundbank.com/tic-tac-mechanical-alarm-clock-3-s2656.html', sha256: '3a52fab6a407f69e9830239f458a27e5a67b1c55f699ed5ed45610a0ebd79353' },
  'bsb-2138': { provider: 'bsb', title: 'Chronograph #2', page: 'https://bigsoundbank.com/stopwatch-2-s2138.html', sha256: 'df7de422a977a37ec8f7e60987b63e6dde0dfa98992617defa5670b6766d6a37' },
  'bsb-0927': { provider: 'bsb', title: 'Timer', page: 'https://bigsoundbank.com/timer-s0927.html', sha256: 'c6bf991e2081acf7a9258a1816e35f691952831d17e4194139cb4c5733b18882' },
  'bsb-0468': { provider: 'bsb', title: 'Mechanical metronome', page: 'https://bigsoundbank.com/metronome-a-120bpm-s0468.html', sha256: '074258b196648c07df1366a1f038fde7a296a7d85a7f3e8bcf0c528528767dfe' },
  'bsb-0466': { provider: 'bsb', title: 'Block "Meinl" in wood', page: 'https://bigsoundbank.com/block-meinl-in-wood-s0466.html', sha256: '1157de27643ed05ccbf3376cf6f7cee5e60c732d7cf24889d98be5e8025ba6bf' },
  'bsb-1628': { provider: 'bsb', title: 'Hourly bips #2', page: 'https://bigsoundbank.com/hourly-bips-2-s1628.html', sha256: '4b3773d815519285f9358d308b72c080d360ac9786fa0b94aecee197edb0a238' },
  'bsb-3068': { provider: 'bsb', title: 'Metallophone, "jeu des milles euros" #2', page: 'https://bigsoundbank.com/metallophone-jeu-des-milles-euros-2-s3068.html', sha256: '4b670a1d92783d41cc8fb463e867772982e1065d210c39afb53f22b502ddb3ed' },
  'bsb-3067': { provider: 'bsb', title: 'Metallophone, "jeu des milles euros" #1', page: 'https://bigsoundbank.com/metallophone-jeu-des-milles-euros-1-s3067.html', sha256: '08b21ac59195c9336803aebb047908dd91d490625adfdea2993d94ebee903f9f' },
  'bsb-2286': { provider: 'bsb', title: 'Mbira, note #2', page: 'https://bigsoundbank.com/mbira-note-2-s2286.html', sha256: 'c5dd80a99a89557a3f2d325733934f059ed621142bb01a3350276053694ae3d8' },
  'bsb-1871': { provider: 'bsb', title: 'Music box, G #1', page: 'https://bigsoundbank.com/music-box-g-1-s1871.html', sha256: 'a58b7461b17511573e21b2462368bfb80c2669d72d56c9ddabdbd6b37737080c' },
  'bsb-1874': { provider: 'bsb', title: 'Music box, C #2', page: 'https://bigsoundbank.com/music-box-c-2-s1874.html', sha256: 'a0c30a47d70246f23c0997a929387b569853921bfb8744a7f72ae1b33916c170' },
  'bsb-0243': { provider: 'bsb', title: 'Heartbeat #1', page: 'https://bigsoundbank.com/heartbeat-1-s0243.html', sha256: '84a3980634457971673a1f5f498e6e2991a6c51b2712ab24118465497c369a4e' },
  'bsb-2137': { provider: 'bsb', title: 'Chronograph #1', page: 'https://bigsoundbank.com/stopwatch-1-s2137.html', sha256: 'd487650c7e56b8277ae58a8c41f35c4fb1ede6fc29d5779968cfd1f7db460caf' },
  'bsb-1926': { provider: 'bsb', title: 'Boxing bell #1', page: 'https://bigsoundbank.com/boxing-bell-1-s1926.html', sha256: '8ccfe01d54ffd928dd1bbe5816302f26a73b81fbe02d22282e405282758d33b6' },
  'bsb-2533': { provider: 'bsb', title: 'Counter Bell #5', page: 'https://bigsoundbank.com/counter-bell-5-s2533.html', sha256: '656fb9f852889df369b0db0e7bf3e7e6f633c4bd30c5dc961c98e2e7d2007ffd' },
  'bsb-2554': { provider: 'bsb', title: 'Tibetan bowl struck #3', page: 'https://bigsoundbank.com/tibetan-bowl-struck-3-s2554.html', sha256: '6f122359549cfa8d91735f99da0423f4167e6dcfed62f44cf45ab81ec8d62b58' },
  'bsb-1689': { provider: 'bsb', title: 'Triangle #3', page: 'https://bigsoundbank.com/triangle-3-s1689.html', sha256: 'db74029fea93ab7379c41e772fcdc8ab75478231979316b8feca7bb4d1fdeda9' },
  'bsb-2880': { provider: 'bsb', title: 'Doorbell #8', page: 'https://bigsoundbank.com/doorbell-8-s2880.html', sha256: '8fc2bf45fc369d83b6558b0c67908552bd44a05d2a73f4b294dddf73ab2bf42e' },
  'bsb-0236': { provider: 'bsb', title: 'Shouts and Applauses of Teens #1', page: 'https://bigsoundbank.com/shouts-and-applauses-of-teens-1-s0236.html', sha256: '13deb4e0731d149f9b2db3feca864e1a71351e4e3a74d797e8b1084f95315556' },
  'material-ui-tap-01': { provider: 'material', title: 'ui_tap-variant-01', page: 'https://m2.material.io/design/sound/sound-resources.html', download: `${MATERIAL}/03%20Primary%20System%20Sounds/ui_tap-variant-01.wav`, sha256: 'e75b0d053314e50f6396b2fc7c32f0f3c086d867a1e0a6f39e26499fb5b4dde8' },
  'material-notification-simple-01': { provider: 'material', title: 'notification_simple-01', page: 'https://m2.material.io/design/sound/sound-resources.html', download: `${MATERIAL}/02%20Alerts%20and%20Notifications/notification_simple-01.wav`, sha256: '68e2538482f0b44ff99f2b1891f6e65ee612040e229e95d1d1e7981993f0be2a' },
  'material-alert-simple': { provider: 'material', title: 'alert_simple', page: 'https://m2.material.io/design/sound/sound-resources.html', download: `${MATERIAL}/02%20Alerts%20and%20Notifications/alert_simple.wav`, sha256: 'd3a123e73b532cdeb4a80e4709c125db9abb4848661ee26bef92c16bf174d553' },
  'material-hero-decorative-01': { provider: 'material', title: 'hero_decorative-celebration-01', page: 'https://m2.material.io/design/sound/sound-resources.html', download: `${MATERIAL}/01%20Hero%20Sounds/hero_decorative-celebration-01.wav`, sha256: 'e9d5db1602ded66aaf473d5b0e9386d2cea235fd3cc2340fbe50219f38c4d9e3' },
  'aosp-alarm-beep-03': { provider: 'aosp', title: 'Alarm_Beep_03.ogg', page: 'https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/data/sounds/', download: `${AOSP}/Alarm_Beep_03.ogg`, sha256: '66a701ce0f5ec1f692faefb456205dc383f6745e3a958e44caa880f26b01b797' },
  'aosp-timer': { provider: 'aosp', title: 'alarms/material/ogg/Timer_48k.ogg', page: 'https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/data/sounds/alarms/material/ogg/', download: `${AOSP}/alarms/material/ogg/Timer_48k.ogg`, sha256: 'f92aa36db37604e46a50529b9c0ef0f5c6d8b70c2b18f2b19946541e350a3a89' },
  'kenney-tick-004': { provider: 'kenney', title: 'Interface Sounds — tick_004.ogg', page: 'https://kenney.nl/assets/interface-sounds', download: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip', zipSha256: 'f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232', member: 'Audio/tick_004.ogg', sha256: '0253d5f7d8d2afbbc370eac2a4539bb844239f0c98343e516d376b137c06d27c' },
  'kenney-glass-002': { provider: 'kenney', title: 'Interface Sounds — glass_002.ogg', page: 'https://kenney.nl/assets/interface-sounds', download: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip', zipSha256: 'f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232', member: 'Audio/glass_002.ogg', sha256: '08e972c73e53c91d6d310e107e80db60edce78ae47225889a028e628a6f3da49' },
  'kenney-tone1': { provider: 'kenney', title: 'Digital Audio — tone1.ogg', page: 'https://kenney.nl/assets/digital-audio', download: 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip', zipSha256: '24e6ce28b76a6d8c89cff4d331e0965ff5c3de8a73c612028e9d363cc64e4f06', member: 'Audio/tone1.ogg', sha256: '12c6a1955aad54cb04206b5e9985df4379ebc598a01b65070609e0b0a3b9b026' },
};

/**
 * 가공 방법. 반복음: cycle(초) 안의 hits 자리에 원본의 박 하나씩(from 부근에서 시작점을 다시 찾음)을 놓습니다.
 * loopFrom: 박을 옮기지 않고 원본 구간을 그대로 반복(불규칙한 태엽 소리처럼 자연스러운 흐름을 살릴 때).
 * 종료음: from부터 seconds만큼, 끝 fadeOut초는 부드럽게 줄입니다. filter는 원본을 읽을 때 거는 ffmpeg 필터입니다.
 * @type {Record<string, any>}
 */
const RECIPES = {
  // ── 시계음 ───────────────────────────────────────────────────────────
  'wall-clock': { source: 'bsb-0007', note: 'tick and tack of the recording on a 2 s grid',
    filter: 'highpass=f=60', cycle: 2, grain: 0.62, fadeOut: 0.18, hits: [[0, 0.21], [1, 1.21]] },
  // 원본 시계는 째깍 간격이 0.84초·1.15초로 번갈아 흔들립니다. 박 하나를 0.78초로 잘라야 다음 째깍이 섞이지 않습니다.
  'grandfather-clock': { source: 'bsb-1567', note: 'tick and tock of the pendulum evened to 1 s; hiss reduced',
    filter: 'highpass=f=45,afftdn=nr=12:nf=-42', cycle: 2, grain: 0.78, fadeOut: 0.3, hits: [[0, 0.2], [1, 1.04]] },
  // drive: 1 ms도 안 되는 첫 금속음 봉우리만 부드럽게 눌러, 최고점 상한 때문에 다른 시계음보다 작게 들리지 않게 합니다.
  'alarm-clock': { source: 'bsb-2656', note: 'five alternating tic/tac beats per second (18,000 beats per hour)',
    filter: 'highpass=f=80', cycle: 1, grain: 0.19, fadeOut: 0.05, drive: 1.3,
    hits: [[0, 0.03], [0.2, 0.23], [0.4, 0.44], [0.6, 0.655], [0.8, 0.86]] },
  stopwatch: { source: 'bsb-2138', note: 'two chronograph beats per second',
    filter: 'highpass=f=80', cycle: 1, grain: 0.45, fadeOut: 0.1, drive: 1.3, hits: [[0, 0.09], [0.5, 0.58]] },
  'kitchen-timer': { source: 'bsb-0927', note: '2 s of the escapement recording looped with a 12 ms crossfade in a quiet gap',
    filter: 'highpass=f=60', cycle: 2, loopFrom: 24.603, crossfade: 0.012 },
  metronome: { source: 'bsb-0468', note: 'one metronome click per second',
    filter: 'highpass=f=60', cycle: 1, grain: 0.42, fadeOut: 0.12, hits: [[0, 0.12]] },
  woodblock: { source: 'bsb-0466', note: 'one wood block hit per second',
    filter: 'highpass=f=90', cycle: 1, grain: 0.5, fadeOut: 0.18, hits: [[0, 0.08]] },
  'soft-tap': { source: 'material-ui-tap-01', note: 'whole tap once per second', cycle: 1, grain: 0.09, fadeOut: 0.02, hits: [[0, 0]], exact: true },
  'digital-tick': { source: 'kenney-tick-004', note: 'whole tick once per second', cycle: 1, grain: 0.06, fadeOut: 0.012, hits: [[0, 0]], exact: true },
  'glass-tink': { source: 'kenney-glass-002', note: 'whole glass tap once per second', cycle: 1, grain: 0.125, fadeOut: 0.03, hits: [[0, 0]], exact: true },
  // ── 종료 경고음 ──────────────────────────────────────────────────────
  'time-signal': { source: 'bsb-1628', note: 'one 0.1 s, 1 kHz pip per second (BBC-style time signal)',
    cycle: 1, grain: 0.106, fadeIn: 0.003, fadeOut: 0.006, hits: [[0, 1.0]] },
  'alarm-beep': { source: 'aosp-alarm-beep-03', note: 'first group of four beeps once per second',
    cycle: 1, grain: 0.62, fadeOut: 0.03, hits: [[0, 0]], exact: true },
  'game-beep': { source: 'kenney-tone1', note: 'one game beep per second',
    cycle: 1, grain: 0.3, fadeOut: 0.08, hits: [[0, 0.08]] },
  'soft-ding': { source: 'material-notification-simple-01', note: 'one soft ding per second',
    cycle: 1, grain: 0.8, fadeOut: 0.2, hits: [[0, 0]], exact: true },
  'chime-alert': { source: 'material-alert-simple', note: 'short marimba alert once per second',
    cycle: 1, grain: 0.58, fadeOut: 0.08, hits: [[0, 0]], exact: true },
  xylophone: { source: 'bsb-3068', note: 'the countdown note G once per second',
    filter: 'highpass=f=120', cycle: 1, grain: 0.97, fadeOut: 0.14, hits: [[0, 1.01]] },
  kalimba: { source: 'bsb-2286', note: 'one mbira (kalimba) note per second',
    filter: 'highpass=f=120', cycle: 1, grain: 0.97, fadeOut: 0.2, hits: [[0, 0.04]] },
  'music-box': { source: ['bsb-1871', 'bsb-1874'], note: 'music box G then C, one note per second',
    filter: 'highpass=f=150', cycle: 2, grain: 0.97, fadeOut: 0.2, hits: [[0, 0.04, 0], [1, 0.08, 1]] },
  heartbeat: { source: 'bsb-0243', note: 'lub-dub twice per second; low-mid lift so laptop speakers can carry it',
    filter: 'highpass=f=35,equalizer=f=160:t=q:w=1.1:g=6,equalizer=f=1400:t=q:w=1.2:g=4', cycle: 1, grain: 0.46, fadeOut: 0.12,
    hits: [[0, 0.04], [0.5, 0.04]] },
  'hurry-tick': { source: 'bsb-2137', note: 'four chronograph beats per second',
    filter: 'highpass=f=80', cycle: 1, grain: 0.2, fadeOut: 0.05, drive: 1.8,
    hits: [[0, 0.085], [0.25, 0.34], [0.5, 0.59], [0.75, 0.84]] },
  // ── 종료음 ───────────────────────────────────────────────────────────
  'kitchen-bell': { source: 'bsb-0927', note: 'final ring of the kitchen timer', filter: 'highpass=f=60', from: 28.4, seconds: 4.2, fadeOut: 0.45 },
  'boxing-bell': { source: 'bsb-1926', note: 'three hits and the start of the ring-out', filter: 'highpass=f=60', from: 0.03, seconds: 4.6, fadeOut: 1.6 },
  'counter-bell': { source: 'bsb-2533', note: 'double ring', filter: 'highpass=f=80', from: 0.09, seconds: 3.6, fadeOut: 1.3 },
  doorbell: { source: 'bsb-2880', note: 'ding-dong and part of its ring-out', filter: 'highpass=f=60', from: 0.1, seconds: 4.6, fadeOut: 1.8 },
  'singing-bowl': { source: 'bsb-2554', note: 'strike and 6 s of singing', filter: 'highpass=f=60', from: 0, seconds: 6.5, fadeOut: 2.6 },
  triangle: { source: 'bsb-1689', note: 'single strike', filter: 'highpass=f=150', from: 0.03, seconds: 4.2, fadeOut: 1.6 },
  celebration: { source: 'material-hero-decorative-01', note: 'whole celebration phrase', from: 0, seconds: 2.0, fadeOut: 0.35, exact: true },
  'xylophone-finish': { source: 'bsb-3067', note: 'C-G-E notes', filter: 'highpass=f=120', from: 0.05, seconds: 3.1, fadeOut: 0.9 },
  'phone-timer': { source: 'aosp-timer', note: 'two phrases of the Android timer sound', from: 0.04, seconds: 3.0, fadeOut: 0.6 },
  cheer: { source: 'bsb-0236', note: 'shouts of "Yeah" and applause', filter: 'highpass=f=70', from: 0, seconds: 4.1, fadeOut: 1.1, exact: true },
};

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function download(url, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync('curl', ['-sS', '-f', '-L', '-A', 'Mozilla/5.0', '--retry', '2', '--max-time', '180', '-o', target, url], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`내려받지 못했습니다: ${url}`);
}

/** zip 한 파일만 꺼냅니다(중앙 디렉터리 → 로컬 헤더 → stored/deflate). 외부 도구 없이 같은 결과를 내려고 직접 읽습니다. */
function unzipMember(zip, member) {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip 끝 레코드를 찾지 못했습니다.');
  let offset = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28), extra = zip.readUInt16LE(offset + 30), comment = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === member || name.endsWith(`/${member}`)) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`지원하지 않는 zip 압축 방식: ${method}`);
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error(`zip 안에 ${member}가 없습니다.`);
}

/** 원본 파일 경로(캐시)를 돌려줍니다. 해시가 다르면 멈춥니다 — 공급처가 파일을 바꿨다면 사람이 다시 들어 봐야 합니다. */
function sourceFile(id) {
  const source = SOURCES[id];
  const url = source.download || source.page.replace(/^.*-s(\d{4})\.html$/, 'https://bigsoundbank.com/UPLOAD/bwf-en/$1.wav');
  source.downloadUrl = url;
  if (source.member) {
    const zipPath = path.join(CACHE, path.basename(new URL(url).pathname));
    if (!existsSync(zipPath)) download(url, zipPath);
    const zip = readFileSync(zipPath);
    if (sha256(zip) !== source.zipSha256) throw new Error(`${id}: zip 해시가 다릅니다.`);
    const target = path.join(CACHE, `${id}${path.extname(source.member)}`);
    if (!existsSync(target)) writeFileSync(target, unzipMember(zip, source.member));
    if (sha256(readFileSync(target)) !== source.sha256) throw new Error(`${id}: 원본 해시가 다릅니다.`);
    return target;
  }
  const target = path.join(CACHE, `${id}${path.extname(new URL(url).pathname)}`);
  if (!existsSync(target)) download(url, target);
  if (sha256(readFileSync(target)) !== source.sha256) throw new Error(`${id}: 원본 해시가 다릅니다.`);
  return target;
}

/** @returns {Float64Array} 모노 48 kHz */
function decode(id, filter) {
  const args = ['-v', 'error', '-i', sourceFile(id)];
  if (filter) args.push('-af', filter);
  args.push('-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-');
  const result = spawnSync('ffmpeg', args, { maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`${id}: 디코딩 실패 ${result.stderr}`);
  const floats = new Float32Array(result.stdout.buffer, result.stdout.byteOffset, result.stdout.length / 4);
  return Float64Array.from(floats);
}

/** 대략의 시각 부근에서 소리가 실제로 시작하는 표본을 찾습니다(최고점의 12 %를 처음 넘는 곳). */
function refineOnset(samples, seconds) {
  const from = Math.max(0, Math.round((seconds - 0.03) * RATE));
  const to = Math.min(samples.length, Math.round((seconds + 0.07) * RATE));
  let peak = 0, peakAt = from;
  for (let i = from; i < to; i++) if (Math.abs(samples[i]) > peak) { peak = Math.abs(samples[i]); peakAt = i; }
  for (let i = from; i <= peakAt; i++) if (Math.abs(samples[i]) >= peak * 0.12) return i;
  return peakAt;
}

/** 올림 코사인 페이드 */
function fade(buffer, fadeIn, fadeOut) {
  const a = Math.round(fadeIn * RATE), b = Math.round(fadeOut * RATE);
  for (let i = 0; i < a && i < buffer.length; i++) buffer[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b && i < buffer.length; i++) buffer[buffer.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  return buffer;
}

/** 박 하나를 잘라 냅니다. 시작점 앞 4 ms를 남겨 어택이 잘리지 않게 합니다. */
function grain(samples, seconds, length, recipe) {
  const PRE = 0.004;
  const onset = recipe.exact ? Math.round(seconds * RATE) : refineOnset(samples, seconds);
  const start = Math.max(0, onset - (recipe.exact ? 0 : Math.round(PRE * RATE)));
  const out = new Float64Array(Math.round(length * RATE));
  for (let i = 0; i < out.length && start + i < samples.length; i++) out[i] = samples[start + i];
  return fade(out, recipe.fadeIn ?? (recipe.exact ? 0.0005 : 0.002), recipe.fadeOut);
}

function buildLoop(recipe) {
  const size = Math.round(recipe.cycle * RATE);
  const out = new Float64Array(size);
  const sources = [recipe.source].flat();
  const decoded = sources.map((id) => decode(id, recipe.filter));
  if (recipe.loopFrom != null) {
    // 원본 구간을 그대로 쓰되, 끝을 넘친 부분을 앞머리에 교차로 겹쳐 이음매가 들리지 않게 합니다.
    const start = Math.round(recipe.loopFrom * RATE), xf = Math.round(recipe.crossfade * RATE);
    const src = decoded[0];
    for (let i = 0; i < size; i++) out[i] = src[start + i];
    for (let i = 0; i < xf; i++) {
      const t = i / xf;
      out[i] = src[start + i] * Math.sin((Math.PI / 2) * t) + src[start + size + i] * Math.cos((Math.PI / 2) * t);
    }
    return out;
  }
  for (const [at, from, which = 0] of recipe.hits) {
    const piece = grain(decoded[which], from, recipe.grain, recipe);
    const offset = Math.round(at * RATE);
    // 반복음이라 끝을 넘친 여운은 앞머리로 돌려 겹칩니다.
    for (let i = 0; i < piece.length; i++) out[(offset + i) % size] += piece[i];
  }
  return recipe.drive ? soften(out, recipe.drive) : out;
}

/** 부드러운 포화(tanh). 표본마다 따로 계산해 기억이 없으므로 반복 이음매가 생기지 않습니다. */
function soften(samples, drive) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (!peak) return samples;
  const scale = Math.tanh(drive);
  return samples.map((v) => Math.tanh((drive * v) / peak) / scale);
}

function buildOneShot(recipe) {
  const decoded = decode(recipe.source, recipe.filter);
  return grain(decoded, recipe.from, recipe.seconds, recipe);
}

/** ffmpeg ebur128로 통합 음량(LUFS)과 true peak(dBTP)을 잽니다. */
function measure(samples, loops = 1) {
  const pcm = new Float32Array(samples.length * loops);
  for (let l = 0; l < loops; l++) pcm.set(Float32Array.from(samples), l * samples.length);
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-',
    '-af', 'ebur128=peak=true', '-f', 'null', '-'], { input: Buffer.from(pcm.buffer), maxBuffer: 1 << 26 });
  const text = result.stderr.toString();
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const lufs = Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs) || !Number.isFinite(truePeak)) throw new Error('음량을 재지 못했습니다.');
  return { lufs, truePeak };
}

function writeWav(target, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, Buffer.concat([header, data]));
}

function readWav16(file) {
  const bytes = readFileSync(file);
  const data = bytes.subarray(44);
  const out = new Float64Array(data.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32767;
  return out;
}

const entries = [];
const summary = [];
for (const role of /** @type {const} */ (['tick', 'warning', 'end'])) {
  for (const option of SOUND_LIBRARY[role]) {
    if (!option.url.startsWith('/audio/toolkit/timer-sounds/')) continue;
    const recipe = RECIPES[option.id];
    if (!recipe) throw new Error(`${option.id}: 가공 방법이 없습니다.`);
    const loop = role !== 'end';
    let samples = loop ? buildLoop(recipe) : buildOneShot(recipe);
    const loops = loop ? 10 : 1;
    const before = measure(samples, loops);
    // 목표 음량까지 올리거나 내리되, true peak 상한을 넘기지 않는 쪽을 택합니다.
    const gainDb = Math.min(TARGET_LUFS[role] - before.lufs, TRUE_PEAK_CEILING - 0.1 - before.truePeak);
    const gain = 10 ** (gainDb / 20);
    samples = samples.map((v) => v * gain);
    const relative = option.url.replace('/audio/toolkit/', '');
    const target = path.join(root, 'public', option.url);
    writeWav(target, samples);
    const written = readWav16(target);
    const after = measure(written, loops);
    if (after.truePeak > TRUE_PEAK_CEILING + 0.05) throw new Error(`${option.id}: true peak ${after.truePeak} dBTP`);
    if (loop && written.length !== Math.round(recipe.cycle * RATE)) throw new Error(`${option.id}: 반복 길이가 맞지 않습니다.`);
    const sourceIds = [recipe.source].flat();
    const sources = sourceIds.map((id) => SOURCES[id]);
    const license = LICENSES[sources[0].provider];
    entries.push({
      file: relative, sound: role, soundId: option.id, label: option.label,
      seconds: Number((written.length / RATE).toFixed(6)), ...(loop ? { loopSeconds: recipe.cycle } : {}),
      channels: 1, sampleRate: RATE, sha256: sha256(readFileSync(target)),
      integratedLufs: after.lufs, truePeakDbTP: after.truePeak,
      sourceTitle: sources.map((s) => s.title).join(' + '), sourceAuthor: license.author,
      sourceUrl: sources[0].page, sourceDownloadUrl: sources.map((s) => s.downloadUrl).join(' '),
      ...(sources.some((s) => s.member) ? { sourceArchiveMember: sources.map((s) => s.member).join(' ') } : {}),
      sourceSha256: sources.map((s) => s.sha256).join(' '), license: license.name, licenseUrl: license.url,
      processing: `${recipe.note}. Mono 48 kHz PCM16; filters: ${recipe.filter || 'none'}; `
        + `${loop ? `exact ${recipe.cycle} s loop` : `${recipe.seconds} s from ${recipe.from} s, ${recipe.fadeOut} s fade-out`}; `
        + `${recipe.drive ? `transient peaks softened (tanh drive ${recipe.drive}); ` : ''}`
        + `gain ${gainDb.toFixed(2)} dB toward ${TARGET_LUFS[role]} LUFS${loop ? ' (measured over 10 loops)' : ''}, true peak ≤ ${TRUE_PEAK_CEILING} dBTP.`,
    });
    summary.push(`${role.padEnd(7)} ${option.id.padEnd(18)} ${(written.length / RATE).toFixed(3)}s  ${after.lufs.toFixed(1)} LUFS  ${after.truePeak.toFixed(1)} dBTP  gain ${gainDb.toFixed(1)} dB`);
  }
}

// 기존 음원 기록은 그대로 두고 이 스크립트가 만드는 항목만 바꿉니다.
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')).filter((item) => !item.file.startsWith('timer-sounds/'));
writeFileSync(MANIFEST, JSON.stringify([...manifest, ...entries], null, 2) + '\n');

// 이용 조건 안내(앱과 함께 배포). 원본별 저작자·출처·라이선스와 가공 사실을 적습니다.
const credits = Object.entries(LICENSES).map(([provider, license]) => {
  const used = entries.filter((entry) => SOURCES[[RECIPES[entry.soundId].source].flat()[0]].provider === provider);
  return used.length ? [
    `${license.author} — ${license.name}`,
    license.url,
    ...used.map((entry) => `  ${entry.file}: "${entry.sourceTitle}" ${entry.sourceUrl}`),
  ].join('\n') : '';
}).filter(Boolean).join('\n\n');
writeFileSync(path.join(OUTPUT, 'LICENSE.txt'), `Tidy toolkit timer sound library (tick, warning, end)

Each file below was cut, re-timed into an exact loop or trimmed, filtered, faded and
level-matched from the credited original (see "processing" in
artwork/toolkit/audio/manifest.json). Changes were made; the originals' authors do not
endorse this app. Source hashes and exact settings: artwork/toolkit/audio/manifest.json.
Rebuild: node scripts/prepare-timer-sound-library.mjs

${credits}

Material Design sounds are used under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
Android Open Source Project sounds are used under the Apache License 2.0; the full text is in
public/licenses/timer-sounds/Apache-2.0.txt. Copyright (C) The Android Open Source Project.
CC0 sources need no attribution; credits are kept for provenance.
`);
console.log(summary.join('\n'));
console.log(`\n${entries.length}개 음원을 만들었습니다.`);
