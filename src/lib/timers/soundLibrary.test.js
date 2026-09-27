import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DEFAULT_SOUNDS,
  SOUND_GROUPS,
  SOUND_KEYS,
  SOUND_LIBRARY,
  SOUND_ROLES,
  isSoundId,
  selectedSounds,
  soundRolesFor,
} from './soundLibrary.js';

const LIBRARY = '/audio/toolkit/timer-sounds/';
const all = SOUND_ROLES.flatMap((role) => SOUND_LIBRARY[role].map((option) => ({ role, ...option })));

/** public 아래 WAV의 형식·길이·소리 데이터를 읽습니다. @param {string} url */
function readWav(url) {
  const bytes = fs.readFileSync(new URL(`../../../public${url}`, import.meta.url));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', url);
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE', url);
  let format, pcm;
  for (let i = 12; i + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', i, i + 4), size = bytes.readUInt32LE(i + 4);
    if (name === 'fmt ') format = { channels: bytes.readUInt16LE(i + 10), rate: bytes.readUInt32LE(i + 12), bits: bytes.readUInt16LE(i + 22) };
    if (name === 'data') pcm = bytes.subarray(i + 8, i + 8 + size);
    i += 8 + size + (size % 2);
  }
  assert.ok(format && pcm, url);
  const frames = pcm.length / (format.channels * format.bits / 8);
  return { ...format, frames, seconds: frames / format.rate, pcm };
}

test('시계음·종료 경고음·종료음마다 새 소리 10개가 있고, 이름과 id가 겹치지 않습니다', () => {
  for (const role of SOUND_ROLES) {
    const options = SOUND_LIBRARY[role];
    assert.equal(options.filter((option) => option.url.startsWith(LIBRARY)).length, 10, role);
    assert.equal(new Set(options.map((option) => option.id)).size, options.length, `${role} id`);
    assert.equal(new Set(options.map((option) => option.label)).size, options.length, `${role} 이름`);
    for (const option of options) {
      assert.ok(SOUND_GROUPS[role][option.group], `${option.id}: 묶음 ${option.group}`);
      assert.ok(option.label.length <= 9, `${option.id}: 선택 상자에 들어가는 짧은 이름`);
    }
  }
  // 역할이 달라도 같은 id를 쓰지 않습니다(설정 키만 보고도 어느 소리인지 알 수 있게).
  assert.equal(new Set(all.map((option) => option.id)).size, all.length);
});

test('모든 소리 파일이 있고 모노 48 kHz 16비트이며, 같은 소리가 두 번 들어 있지 않습니다', () => {
  const seen = new Map();
  for (const option of all) {
    const wav = readWav(option.url);
    assert.deepEqual([wav.channels, wav.rate, wav.bits], [1, 48000, 16], option.url);
    const hash = createHash('sha256').update(wav.pcm).digest('hex');
    assert.ok(!seen.has(hash), `${option.id}와 ${seen.get(hash)}의 소리가 같습니다`);
    seen.set(hash, option.id);
  }
});

test('새 반복음은 정확히 1초·2초라 초가 바뀌는 순간에 맞춰 울리고, 이음매에서 튀지 않습니다', () => {
  for (const option of all.filter((entry) => entry.role !== 'end' && entry.url.startsWith(LIBRARY))) {
    const wav = readWav(option.url);
    assert.ok([48000, 96000].includes(wav.frames), `${option.id}: ${wav.frames} frames`);
    // 반복될 때 끝 → 처음으로 넘어가는 두 표본의 차이가 크면 "틱" 하는 잡음이 납니다.
    const last = wav.pcm.readInt16LE(wav.pcm.length - 2) / 32768, first = wav.pcm.readInt16LE(0) / 32768;
    assert.ok(Math.abs(last - first) < 0.05, `${option.id}: 이음매 ${last} → ${first}`);
  }
});

test('새 종료음은 1.5~7초 한 번 울리는 소리이고, 끝은 페이드아웃으로 조용히 끝납니다', () => {
  for (const option of SOUND_LIBRARY.end.filter((entry) => entry.url.startsWith(LIBRARY))) {
    const wav = readWav(option.url);
    assert.ok(wav.seconds >= 1.5 && wav.seconds <= 7, `${option.id}: ${wav.seconds}s`);
    let tail = 0;
    for (let i = wav.pcm.length - 960; i < wav.pcm.length; i += 2) tail = Math.max(tail, Math.abs(wav.pcm.readInt16LE(i)));
    assert.ok(tail / 32768 < 0.01, `${option.id}: 마지막 10 ms 최고점 ${tail}`);
  }
});

test('타이머마다 예전에 울리던 소리가 기본값이라, 업데이트해도 고르기 전에는 소리가 바뀌지 않습니다', () => {
  const urls = (/** @type {string} */ kind) => Object.fromEntries(Object.entries(selectedSounds(kind)).map(([role, sound]) => [role, sound?.url]));
  assert.deepEqual(urls('digital'), {
    tick: '/audio/toolkit/digital/tick-t01.wav',
    warning: '/audio/toolkit/digital/warning-w05-1s.wav',
    end: '/audio/toolkit/digital/end-e08.wav',
  });
  assert.deepEqual(urls('analog'), {
    tick: '/audio/toolkit/tick.wav',
    warning: '/audio/toolkit/analog/warning-w09.wav',
    end: '/audio/toolkit/analog/end-e09.wav',
  });
  assert.deepEqual(urls('hourglass'), {
    tick: '/audio/toolkit/hourglass/tick-ht04.wav',
    warning: '/audio/toolkit/hourglass/warning-hw09.wav',
    end: '/audio/toolkit/hourglass/end-he09.wav',
  });
  assert.deepEqual(urls('stopwatch'), { tick: '/audio/toolkit/stopwatch/tick-st04.wav' });
  assert.deepEqual(soundRolesFor('stopwatch'), ['tick']);
  for (const [kind, sounds] of Object.entries(DEFAULT_SOUNDS))
    for (const [role, id] of Object.entries(sounds)) assert.ok(isSoundId(/** @type {any} */ (role), id), `${kind} ${role}`);
});

test('저장값이 목록에 없거나 다른 역할의 소리면 그 타이머의 기본 소리로 대신합니다', () => {
  assert.equal(selectedSounds('digital', { tickSound: 'time-signal' }).tick?.id, 'clock-closeup');
  assert.equal(selectedSounds('digital', { warningSound: 7 }).warning?.id, 'double-beep');
  assert.equal(selectedSounds('hourglass', { endSound: 'cheer' }).end?.id, 'cheer');
  assert.deepEqual(Object.keys(selectedSounds('stopwatch', { warningSound: 'time-signal' })), ['tick']);
  assert.deepEqual(SOUND_KEYS, { tick: 'tickSound', warning: 'warningSound', end: 'endSound' });
});

test('Rust toolkit.rs가 저장을 허락하는 소리 id가 이 목록과 같습니다', () => {
  const rust = fs.readFileSync(new URL('../../../src-tauri/src/toolkit.rs', import.meta.url), 'utf8');
  for (const [role, name] of /** @type {const} */ ([['tick', 'TICK_SOUNDS'], ['warning', 'WARNING_SOUNDS'], ['end', 'END_SOUNDS']])) {
    const match = new RegExp(`const ${name}: \\[&str; (\\d+)\\] = \\[([^\\]]*)\\];`).exec(rust);
    assert.ok(match, name);
    const ids = [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(Number(match[1]), ids.length, name);
    assert.deepEqual(ids, SOUND_LIBRARY[role].map((option) => option.id), name);
  }
});

test('새 소리마다 출처·원본 해시·라이선스·가공 내역이 기록되고, 앱과 함께 배포되는 안내에 실립니다', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../../artwork/toolkit/audio/manifest.json', import.meta.url), 'utf8'));
  const credits = fs.readFileSync(new URL('../../../public/audio/toolkit/timer-sounds/LICENSE.txt', import.meta.url), 'utf8');
  for (const option of all.filter((entry) => entry.url.startsWith(LIBRARY))) {
    const file = option.url.replace('/audio/toolkit/', '');
    const entry = manifest.find((/** @type {any} */ item) => item.file === file);
    assert.ok(entry, file);
    assert.equal(entry.soundId, option.id);
    for (const key of ['sourceTitle', 'sourceUrl', 'sourceDownloadUrl', 'sourceSha256', 'license', 'licenseUrl', 'processing'])
      assert.ok(entry[key], `${file}: ${key}`);
    assert.ok(entry.truePeakDbTP <= -2.9, `${file}: true peak ${entry.truePeakDbTP}`);
    assert.ok(credits.includes(file), `LICENSE.txt: ${file}`);
  }
  assert.ok(fs.existsSync(new URL('../../../public/licenses/timer-sounds/Apache-2.0.txt', import.meta.url)));
});
