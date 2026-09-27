import {readFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CATALOG, VOICES, SPEEDS} from '../../src/lib/vote/speech/catalog.js';
const root=new URL('../../src/assets/vote/speech/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
const hash=v=>createHash('sha256').update(v).digest('hex');
const errors=[], pending=[];
for(const voice of VOICES) for(const speed of SPEEDS) for(const [id,text] of Object.entries(CATALOG)) {
  const key=`${voice}.${speed}.${id}`, e=manifest.entries[key];
  if(!e) {errors.push(`${key}: missing`);continue;}
  try {
    if(e.text!==text || e.textHash!==hash(text)) errors.push(`${key}: script mismatch`);
    if(e.sha256!==hash(await readFile(new URL(e.file,root)))) errors.push(`${key}: hash mismatch`);
    if(!(e.durationMs>100 && e.durationMs<35000)) errors.push(`${key}: duration`);
    if(e.reviewStatus!=='approved') pending.push(key);
  } catch(e) { errors.push(`${key}: ${e.message}`); }
}
const count=Object.keys(CATALOG).length*4;
if(Object.keys(manifest.entries).length!==count || (await readdir(root)).filter(f=>f.endsWith('.mp3')).length!==count) errors.push('unexpected files/entries');
if(process.argv.includes('--release') && pending.length) errors.push('청취 승인 전에는 출시 검증을 통과할 수 없습니다.');
const report={count,errors,pendingListeningReview:pending.length,modelRevision:manifest.modelRevision};
console.log(JSON.stringify(report,null,2));
process.exitCode=errors.length?1:0;
