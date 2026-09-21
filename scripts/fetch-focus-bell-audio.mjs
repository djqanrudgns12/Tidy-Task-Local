// Run: node --use-system-ca scripts/fetch-focus-bell-audio.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../artwork/toolkit/focus-bell/', import.meta.url);
const sources = [
  { id: 'bell', title: 'Pleasing Bell Sound Effect', author: 'Julie Damsgaard / Spring Spring', slug: 'pleasing-bell-sound-effect', file: 'pleasing-bell.wav' },
  { id: 'bomb', title: 'Synthesized explosion', author: 'qubodup', slug: 'synthesized-explosion', file: 'synthetic_explosion_1.flac' },
  { id: 'fart', title: 'Gastric Distress', author: 'LFA', slug: 'gastric-distress', file: 'gastricdistress_bylfa_0.wav' },
  { id: 'siren', title: 'Alarm', author: 'Frenchyboy', slug: 'alarm-2', file: 'alarm_0.wav' },
];
await mkdir(new URL('originals/', root), { recursive: true });
await mkdir(new URL('sources/', root), { recursive: true });
for (const item of sources) {
  item.page = `https://opengameart.org/content/${item.slug}`;
  item.download = `https://opengameart.org/sites/default/files/${item.file}`;
  item.license = 'CC0-1.0';
  item.licenseUrl = 'https://creativecommons.org/publicdomain/zero/1.0/';
  const page = await fetch(item.page);
  if (!page.ok) throw new Error(`Source page: ${page.status}`);
  const html = await page.text();
  if (!html.includes(item.download) || !html.includes('CC0')) throw new Error(`Review source again: ${item.id}`);
  await writeFile(new URL(`sources/${item.id}.html`, root), html);
  const response = await fetch(item.download);
  if (!response.ok) throw new Error(`Audio: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const expected = item.file.endsWith('.flac') ? 'fLaC' : 'RIFF';
  if (data.toString('ascii', 0, 4) !== expected) throw new Error(`Invalid audio: ${item.id}`);
  await writeFile(new URL(`originals/${item.file}`, root), data);
  item.bytes = data.length;
  item.sha256 = createHash('sha256').update(data).digest('hex');
  console.log(`${item.id}: ${data.length} bytes`);
}
await writeFile(new URL('sources.json', root), JSON.stringify({ fetchedAt: new Date().toISOString(), sources }, null, 2) + '\n');
