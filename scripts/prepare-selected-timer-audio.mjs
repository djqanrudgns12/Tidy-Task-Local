import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const samplesRoot = path.join(root, 'output/timer-sound-samples');
const samples = JSON.parse(readFileSync(path.join(samplesRoot, 'manifest.json'), 'utf8')).samples;
samples.push(...JSON.parse(readFileSync(path.join(samplesRoot, 'additional-manifest.json'), 'utf8')).samples);
const output = path.join(root, 'public/audio/toolkit');
const manifestPath = path.join(root, 'artwork/toolkit/audio/manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const selections = [
  ['digital', 'tick', 'T01', 'digital/tick-t01.wav'],
  ['digital', 'warning', 'W05', 'digital/warning-w05-1s.wav'],
  ['digital', 'end', 'E08', 'digital/end-e08.wav'],
  ['analog', 'warning', 'W09', 'analog/warning-w09.wav'],
  ['analog', 'end', 'E09', 'analog/end-e09.wav'],
  ['stopwatch', 'tick', 'ST04', 'stopwatch/tick-st04.wav'],
  ['hourglass', 'tick', 'HT04', 'hourglass/tick-ht04.wav'],
  ['hourglass', 'warning', 'HW09', 'hourglass/warning-hw09.wav'],
  ['hourglass', 'end', 'HE09', 'hourglass/end-he09.wav'],
];
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const preservedTick = sha(path.join(output, 'tick.wav'));
if (preservedTick !== '1084dbe5f434aa8b3c1a3188f740377f3887cbf893938272b5cd63aa2246e0b7') {
  throw new Error('The existing tick differs from the reviewed version; preserve it and inspect before continuing.');
}
for (const [kind, sound, code, file] of selections) {
  const source = samples.find((sample) => sample.code === code);
  if (!source) throw new Error(`Missing reviewed sample: ${code}`);
  const input = path.join(samplesRoot, source.cycle || source.path);
  const target = path.join(output, file);
  mkdirSync(path.dirname(target), { recursive: true });
  if (code === 'W05') {
    // Both beeps end before 0.4 s. Remove only trailing silence; keep pitch and timing.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-af', 'atrim=duration=1', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', target]);
  } else copyFileSync(input, target);
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', target], { encoding: 'utf8' }));
  const entry = {
    file, kind, sound, sampleCode: code,
    seconds: Number(info.format.duration), channels: info.streams[0].channels,
    sampleRate: Number(info.streams[0].sample_rate), sha256: sha(target),
    sourceTitle: source.sourceTitle || source.title, sourceUrl: source.sourceUrl || source.page,
    sourceDownloadUrl: source.downloadUrl, sourceSha256: source.originalSha256 || source.sha256,
    ...(source.sourceQuality ? { sourceQuality: source.sourceQuality } : {}),
    license: source.license, licenseUrl: source.licenseUrl,
    processing: code === 'W05'
      ? 'Reviewed normalized WAV; trailing silence trimmed to exactly 1.000 s, both beeps and their timing unchanged.'
      : source.cycle ? `User-reviewed cycle copied unchanged. ${source.processing}`
        : 'User-reviewed normalized WAV copied without further processing; full clip retained.',
  };
  const existing = manifest.findIndex((item) => item.file === file);
  if (existing < 0) manifest.push(entry); else manifest[existing] = entry;
  console.log(`${kind}/${sound}: ${code}, ${entry.seconds}s`);
}
if (sha(path.join(output, 'tick.wav')) !== preservedTick) throw new Error('Legacy tick was changed.');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
