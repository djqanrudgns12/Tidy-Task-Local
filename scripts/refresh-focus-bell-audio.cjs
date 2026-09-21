// node --use-system-ca --tls-cipher-list=DEFAULT@SECLEVEL=1 scripts/refresh-focus-bell-audio.cjs
// TLS certificate verification stays enabled; the public source server uses a legacy certificate key.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'artwork/toolkit/focus-bell');
const dest = path.join(root, 'public/audio/toolkit/focus-bell');
const specs = [
  { id: 'bell', number: 2113, title: 'Bell #1', page: 'https://bigsoundbank.com/bell-1-s2113.html', seconds: 2 },
  { id: 'siren', number: 1464, title: '2 Ton Siren', page: 'https://bigsoundbank.com/ambulance-siren-2-s1464.html', seconds: 2 },
];
function hash(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function wav(a, rate) {
  const b = Buffer.alloc(44 + a.length * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(a.length * 2, 40);
  a.forEach((v, i) => b.writeInt16LE(Math.round(v * 32767), 44 + i * 2)); return b;
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json')));
  const report = [];
  try {
    const page = await browser.newPage();
    for (const spec of specs) {
      const response = await fetch(spec.page); if (!response.ok) throw Error(response.status);
      const html = await response.text();
      spec.download = `https://bigsoundbank.com/UPLOAD/mp3/${spec.number}.mp3`;
      if (!html.includes('CC0') || !html.includes(`/UPLOAD/mp3/${spec.number}.mp3`)) throw Error('Source review needed');
      fs.writeFileSync(path.join(source, `sources/${spec.id}-v2.html`), html);
      const audioResponse = await fetch(spec.download); if (!audioResponse.ok) throw Error(audioResponse.status);
      const original = Buffer.from(await audioResponse.arrayBuffer());
      fs.writeFileSync(path.join(source, `originals/bsb-${spec.number}.mp3`), original);
      const result = await page.evaluate(async ({ data, seconds }) => {
        const ctx = new AudioContext({ sampleRate: 48000 });
        const buffer = await ctx.decodeAudioData(Uint8Array.from(atob(data), c => c.charCodeAt(0)).buffer);
        const a = buffer.getChannelData(0); // Both sources are mono; no stereo phase cancellation.
        const rate = buffer.sampleRate;
        // Start at the first sustained audible 20ms window, with 10ms lead-in.
        let onset = 0; const hop = Math.round(rate * .02);
        for (let i = 0; i < a.length - hop; i += hop) {
          let energy = 0; for (let j = i; j < i + hop; j++) energy += a[j] ** 2;
          if (Math.sqrt(energy / hop) > .015) { onset = Math.max(0, i - Math.round(rate * .01)); break; }
        }
        const samples = Array.from(a.slice(onset, onset + Math.round(seconds * rate)));
        await ctx.close(); return { samples, rate, onsetSeconds: onset / rate, originalSeconds: buffer.duration };
      }, { data: original.toString('base64'), seconds: spec.seconds });
      let samples = result.samples;
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      samples = samples.map(v => v - mean);
      if (spec.id === 'bell') {
        const p = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
        samples = samples.map(v => Math.tanh(4 * v / p));
      }
      const fadeSeconds = spec.id === 'bell' ? .35 : .25;
      samples = samples.map((v, i) => v * Math.min(1, i / (result.rate * .005)) *
        Math.sin(Math.min(1, (samples.length - 1 - i) / (result.rate * fadeSeconds)) * Math.PI / 2) ** 2);
      const peak = samples.reduce((p, v) => Math.max(p, Math.abs(v)), 0);
      const gain = 10 ** (-3 / 20) / peak;
      samples = samples.map(v => v * gain);
      const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
      const bytes = wav(samples, result.rate);
      fs.writeFileSync(path.join(dest, `${spec.id}.wav`), bytes);
      const record = { ...spec, author: 'Joseph SARDIN / BigSoundBank', license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', originalSha256: hash(original),
        file: `${spec.id}.wav`, sha256: hash(bytes), durationSeconds: samples.length / result.rate,
        sourceStartSeconds: result.onsetSeconds, originalSeconds: result.originalSeconds,
        processing: `48kHz mono PCM16; initial silence trimmed; DC removed; bell only: tanh peak compression drive 4; 5ms attack and ${fadeSeconds}s cosine-squared release AFTER compression; peak normalized to -3dBFS`,
        measuredPeakDbFS: -3, measuredRmsDbFS: 20 * Math.log10(rms) };
      manifest.sounds = manifest.sounds.map(s => s.id === spec.id ? record : s);
      report.push(record);
    }
    manifest.status = 'focus-bell-runtime-assets';
    manifest.verification = 'New originals decoded in Microsoft Edge; waveform levels measured. Physical listening and native app QA pending.';
    manifest.revision = 3;
    fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(source, 'sources-v2.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), sources: report }, null, 2) + '\n');
    console.log(report.map(s => ({ id: s.id, seconds: s.durationSeconds, onset: s.sourceStartSeconds, rms: s.measuredRmsDbFS })));
  } finally { await browser.close(); }
})();
