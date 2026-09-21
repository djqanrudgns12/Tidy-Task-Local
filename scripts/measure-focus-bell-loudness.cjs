// Measures decoded runtime files with the mono BS.1770 K-weighting and gating model.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const sounds = [
  { id: 'bell', file: 'bell.wav', runtimeGain: 1 },
  { id: 'bomb', file: 'bomb.wav', runtimeGain: 1 },
  { id: 'fart', file: 'fart.wav', runtimeGain: 1 },
  { id: 'siren', file: 'siren.wav', runtimeGain: 1 },
];
function db(value) { return value > 0 ? 20 * Math.log10(value) : -Infinity; }
function biquad(input, b, a) {
  const out = new Float64Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i], y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    out[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}
function loudness(samples, rate, gain) {
  // ITU-R BS.1770 coefficients for 48 kHz. All bundled assets decode at 48 kHz.
  if (rate !== 48000) throw new Error(`Expected 48kHz, got ${rate}`);
  const scaled = Float64Array.from(samples, x => x * gain);
  const weighted = biquad(biquad(scaled,
    [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, .73248077421585]),
    [1, -2, 1], [1, -1.99004745483398, .99007225036621]);
  const window = Math.round(rate * .4), hop = Math.round(rate * .1), blocks = [];
  for (let start = 0; start + window <= weighted.length; start += hop) {
    let sum = 0; for (let i = start; i < start + window; i++) sum += weighted[i] ** 2;
    const z = sum / window, lufs = -.691 + 10 * Math.log10(z);
    blocks.push({ z, lufs });
  }
  const absolute = blocks.filter(x => x.lufs >= -70);
  const preliminary = -.691 + 10 * Math.log10(absolute.reduce((s, x) => s + x.z, 0) / absolute.length);
  const gated = absolute.filter(x => x.lufs >= preliminary - 10);
  const integratedLufs = -.691 + 10 * Math.log10(gated.reduce((s, x) => s + x.z, 0) / gated.length);
  let sum = 0, peak = 0;
  for (const x of scaled) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
  return { integratedLufs, maxMomentaryLufs: Math.max(...blocks.map(x => x.lufs)), rmsDbFS: db(Math.sqrt(sum / scaled.length)), peakDbFS: db(peak) };
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage();
    for (const sound of sounds) {
      const file = path.join(root, 'public/audio/toolkit/focus-bell', sound.file);
      const decoded = await page.evaluate(async data => {
        const context = new AudioContext({ sampleRate: 48000 });
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const buffer = await context.decodeAudioData(bytes.buffer);
        const mono = new Float32Array(buffer.length);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const source = buffer.getChannelData(channel);
          for (let i = 0; i < mono.length; i++) mono[i] += source[i] / buffer.numberOfChannels;
        }
        await context.close();
        return { samples: Array.from(mono), rate: buffer.sampleRate, duration: buffer.duration };
      }, fs.readFileSync(file).toString('base64'));
      Object.assign(sound, { durationSeconds: decoded.duration, ...loudness(decoded.samples, decoded.rate, sound.runtimeGain) });
    }
    const output = { measuredAt: new Date().toISOString(), standard: 'ITU-R BS.1770 K-weighting, 400ms blocks, absolute and relative gating; decoded runtime gain included', sounds };
    fs.writeFileSync(path.join(root, 'output/qa/focus-bell-loudness.json'), JSON.stringify(output, null, 2) + '\n');
    console.table(sounds.map(({ id, runtimeGain, integratedLufs, maxMomentaryLufs, rmsDbFS, peakDbFS }) =>
      ({ id, runtimeGain, integratedLufs: integratedLufs.toFixed(2), maxMomentaryLufs: maxMomentaryLufs.toFixed(2), rmsDbFS: rmsDbFS.toFixed(2), peakDbFS: peakDbFS.toFixed(2) })));
  } finally { await browser.close(); }
})();
