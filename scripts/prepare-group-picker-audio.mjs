/** 모둠원 뽑기 하이브리드 효과음(SFX) 전처리 스크립트.
 *  왜 별도 폴더로 가공하는가: 타이머 공용 `timer-sounds/` 원본은 -50 dBFS 이하 후행 무음이
 *  포함돼 1초 이상 잡히므로(voice gate 고갈 원인), 실발음만 정밀 트리밍하고 BS.1770 LUFS로
 *  정규화해 `public/audio/toolkit/group-picker/`에 경량 WAV + durationMs 매니페스트를 남깁니다.
 *  사용: node scripts/prepare-group-picker-audio.mjs */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { integratedLoudness, truePeak } from '../src/lib/vote/loudness.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const SRC_DIR = path.join(root, 'public/audio/toolkit/timer-sounds');
const OUT_DIR = path.join(root, 'public/audio/toolkit/group-picker');
const MANIFEST_PATH = path.join(root, 'src/lib/group-picker/audioManifest.json');

const SILENCE_AMP = 10 ** (-50 / 20); // -50 dBFS ≈ 0.003162
const MAX_PEAK_DB = -1.0;

/** 가공 대상 11종 원본 매핑 (원본은 읽기 전용으로만 접근). */
const SOURCES = [
  { id: 'woodblock', src: 'tick/woodblock.wav', targetLufs: -20 },
  { id: 'soft-tap', src: 'tick/soft-tap.wav', targetLufs: -20 },
  { id: 'glass-tink', src: 'tick/glass-tink.wav', targetLufs: -20 },
  { id: 'kalimba', src: 'warning/kalimba.wav', targetLufs: -20 },
  { id: 'soft-ding', src: 'warning/soft-ding.wav', targetLufs: -20 },
  { id: 'hurry-tick', src: 'warning/hurry-tick.wav', targetLufs: -20 },
  { id: 'heartbeat', src: 'warning/heartbeat.wav', targetLufs: -20 },
  { id: 'music-box', src: 'warning/music-box.wav', targetLufs: -20 },
  { id: 'doorbell', src: 'end/doorbell.wav', targetLufs: -20 },
  { id: 'xylophone-finish', src: 'end/xylophone-finish.wav', targetLufs: -16 },
  { id: 'celebration', src: 'end/celebration.wav', targetLufs: -16 },
];

/** RIFF WAV(PCM 16/24/32bit, IEEE Float 32bit)를 모노 Float32Array로 디코딩합니다.
 * @param {Buffer} buf */
function decodeWavMono(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('유효한 RIFF/WAVE 파일이 아닙니다.');
  }
  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 48000;
  let bitsPerSample = 16;
  /** @type {Buffer | null} */
  let dataChunk = null;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    const bodyEnd = Math.min(buf.length, bodyStart + size);
    if (id === 'fmt ') {
      audioFormat = buf.readUInt16LE(bodyStart);
      numChannels = buf.readUInt16LE(bodyStart + 2);
      sampleRate = buf.readUInt32LE(bodyStart + 4);
      bitsPerSample = buf.readUInt16LE(bodyStart + 14);
    } else if (id === 'data') {
      dataChunk = buf.subarray(bodyStart, bodyEnd);
    }
    offset = bodyStart + size + (size % 2);
  }

  if (!dataChunk) throw new Error('WAV data 청크를 찾을 수 없습니다.');
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.floor(dataChunk.length / (bytesPerSample * numChannels));
  const mono = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    let acc = 0;
    for (let c = 0; c < numChannels; c++) {
      const p = (i * numChannels + c) * bytesPerSample;
      let v = 0;
      if (audioFormat === 3 && bitsPerSample === 32) {
        v = dataChunk.readFloatLE(p);
      } else if (audioFormat === 1 && bitsPerSample === 16) {
        v = dataChunk.readInt16LE(p) / 32768;
      } else if (audioFormat === 1 && bitsPerSample === 24) {
        const raw = dataChunk[p] | (dataChunk[p + 1] << 8) | (dataChunk[p + 2] << 16);
        const signed = raw & 0x800000 ? raw - 0x1000000 : raw;
        v = signed / 8388608;
      } else if (audioFormat === 1 && bitsPerSample === 32) {
        v = dataChunk.readInt32LE(p) / 2147483648;
      } else {
        throw new Error(`지원하지 않는 WAV 포맷: format=${audioFormat}, bits=${bitsPerSample}`);
      }
      acc += v;
    }
    mono[i] = acc / numChannels;
  }

  return { sampleRate, samples: mono };
}

/** 16-bit 모노 PCM RIFF WAV 버퍼를 생성합니다.
 * @param {Float32Array} samples @param {number} sampleRate */
function encodeWavMono16(samples, sampleRate) {
  const dataLen = samples.length * 2;
  const out = Buffer.alloc(44 + dataLen);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + dataLen, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16); // PCM fmt 크기
  out.writeUInt16LE(1, 20); // PCM 포맷
  out.writeUInt16LE(1, 22); // 모노
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  out.writeUInt16LE(2, 32); // BlockAlign
  out.writeUInt16LE(16, 34); // BitsPerSample
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(dataLen, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), 44 + i * 2);
  }
  return out;
}

/** -50 dBFS 이하 선·후행 무음 꼬리 트리밍(+ 2ms 페이드인, 10ms 꼬리 페이드아웃).
 * @param {Float32Array} samples @param {number} sampleRate */
function trimSilence(samples, sampleRate) {
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= SILENCE_AMP) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return samples.slice(0, Math.min(samples.length, Math.round(sampleRate * 0.05)));

  const preRoll = Math.round(sampleRate * 0.002);
  const postRoll = Math.round(sampleRate * 0.012);
  const start = Math.max(0, first - preRoll);
  const end = Math.min(samples.length, last + 1 + postRoll);
  const trimmed = new Float32Array(samples.subarray(start, end));

  const fadeIn = Math.min(trimmed.length, Math.round(sampleRate * 0.002));
  for (let i = 0; i < fadeIn; i++) trimmed[i] *= i / fadeIn;

  const fadeOut = Math.min(trimmed.length, Math.round(sampleRate * 0.012));
  for (let i = 0; i < fadeOut; i++) {
    const idx = trimmed.length - 1 - i;
    trimmed[idx] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOut);
  }
  return trimmed;
}

/** -1.0 dBTP 상한을 지키는 부드러운 소프트 클리퍼 포함 LUFS 정규화.
 * @param {Float32Array} samples @param {number} sampleRate @param {number} targetLufs */
function normalizeLoudness(samples, sampleRate, targetLufs) {
  const ceilAmp = 10 ** (MAX_PEAK_DB / 20); // ≈ 0.89125
  const kneeAmp = ceilAmp * 0.82;
  let cur = new Float32Array(samples);

  for (let pass = 0; pass < 3; pass++) {
    const lufs = integratedLoudness(cur, sampleRate);
    if (!Number.isFinite(lufs)) break;
    const gain = 10 ** ((targetLufs - lufs) / 20);
    const next = new Float32Array(cur.length);
    for (let i = 0; i < cur.length; i++) {
      const v = cur[i] * gain;
      const a = Math.abs(v);
      if (a <= kneeAmp) {
        next[i] = v;
      } else {
        const span = ceilAmp - kneeAmp;
        const compressed = kneeAmp + span * Math.tanh((a - kneeAmp) / span);
        next[i] = Math.sign(v) * compressed;
      }
    }
    cur = next;
    const finalPeak = truePeak(cur);
    if (finalPeak > MAX_PEAK_DB) {
      const att = 10 ** ((MAX_PEAK_DB - 0.1 - finalPeak) / 20);
      for (let i = 0; i < cur.length; i++) cur[i] *= att;
    }
    if (Math.abs(integratedLoudness(cur, sampleRate) - targetLufs) < 0.35) break;
  }

  return cur;
}

/** -32 dBFS 이하로 떨어진 마지막 순간을 계산해 voice gate 점유 시간(gateMs)이 긴 울림 꼬리에 의해 고갈되지 않게 합니다.
 * @param {Float32Array} samples @param {number} sampleRate */
function measureGateMs(samples, sampleRate) {
  const gateAmp = 10 ** (-32 / 20); // ≈ 0.0251
  let lastLoud = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= gateAmp) lastLoud = i;
  }
  const ms = Math.round(((lastLoud + Math.round(sampleRate * 0.025)) / sampleRate) * 1000);
  return Math.max(30, Math.min(900, ms));
}

mkdirSync(OUT_DIR, { recursive: true });

/** @type {Record<string, {url:string, sampleRate:number, durationMs:number, gateMs:number, lufs:number, truePeakDb:number, origDurationMs:number, bytes:number}>} */
const manifest = {};

for (const item of SOURCES) {
  const srcPath = path.join(SRC_DIR, item.src);
  const raw = readFileSync(srcPath);
  const decoded = decodeWavMono(raw);
  const origMs = Math.round((decoded.samples.length / decoded.sampleRate) * 1000);
  const trimmed = trimSilence(decoded.samples, decoded.sampleRate);
  const normalized = normalizeLoudness(trimmed, decoded.sampleRate, item.targetLufs);
  const outWav = encodeWavMono16(normalized, decoded.sampleRate);
  const outPath = path.join(OUT_DIR, `${item.id}.wav`);
  writeFileSync(outPath, outWav);

  const lufs = Number(integratedLoudness(normalized, decoded.sampleRate).toFixed(2));
  const peakDb = Number(truePeak(normalized).toFixed(2));
  const durationMs = Math.max(25, Math.round((normalized.length / decoded.sampleRate) * 1000));
  const gateMs = Math.min(durationMs, measureGateMs(normalized, decoded.sampleRate));
  manifest[item.id] = {
    url: `/audio/toolkit/group-picker/${item.id}.wav`,
    sampleRate: decoded.sampleRate,
    durationMs,
    gateMs,
    origDurationMs: origMs,
    lufs,
    truePeakDb: peakDb,
    bytes: outWav.length,
  };
}

writeFileSync(MANIFEST_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), samples: manifest }, null, 2)}\n`, 'utf8');

const licenseNotice = `Tidy Task 모둠원 뽑기(picker-group) 전용 가공 효과음 라이브러리
이 폴더의 WAV 파일은 public/audio/toolkit/timer-sounds/ 음원을 기반으로
무음 구간(-50 dBFS 이하) 트리밍 및 BS.1770(-20 LUFS / -16 LUFS) 재정규화만 수행한 파생본입니다.
원저작자 및 라이선스(CC0 1.0 · CC BY 4.0 · Apache-2.0) 상세 내역은 ../timer-sounds/LICENSE.txt 를 따릅니다.
재생성: node scripts/prepare-group-picker-audio.mjs
`;
writeFileSync(path.join(OUT_DIR, 'LICENSE.txt'), licenseNotice, 'utf8');

console.table(
  Object.entries(manifest).map(([id, info]) => ({
    id,
    origMs: info.origDurationMs,
    trimmedMs: info.durationMs,
    gateMs: info.gateMs,
    lufs: info.lufs,
    truePeakDb: info.truePeakDb,
    kb: Number((info.bytes / 1024).toFixed(1)),
  })),
);
