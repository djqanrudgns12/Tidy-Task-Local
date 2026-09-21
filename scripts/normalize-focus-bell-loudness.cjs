// Normalizes the four short effects to a shared perceptual-loudness target.
// The loudness model follows mono ITU-R BS.1770 K-weighting and gating.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'public/audio/toolkit/focus-bell');
const targetLufs = -12, peakCeiling = 10 ** (-1.5 / 20);
const sources = [
  { id: 'bell', file: 'bell.wav', drive: 0, initialBaselineLufs: -9.40 },
  // 입력 원본은 artwork에 둡니다(같은 파일을 public에 복사하면 설치 파일에만 실려 나감).
  { id: 'bomb', file: '../../../../artwork/toolkit/focus-bell/originals/synthetic_explosion_1.flac', drive: 'auto', initialBaselineLufs: -19.94 },
  { id: 'fart', file: 'fart.wav', drive: 'auto', initialBaselineLufs: -19.80 },
  { id: 'siren', file: 'siren.wav', drive: 0, initialBaselineLufs: -8.48 },
];
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function biquad(input, b, a) {
  const out = new Float64Array(input.length); let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<input.length;i++){const x=input[i],y=b[0]*x+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2;out[i]=y;x2=x1;x1=x;y2=y1;y1=y;}
  return out;
}
function integrated(samples, rate) {
  const weighted=biquad(biquad(samples,[1.53512485958697,-2.69169618940638,1.19839281085285],[1,-1.69065929318241,.73248077421585]),[1,-2,1],[1,-1.99004745483398,.99007225036621]);
  const size=Math.round(rate*.4),hop=Math.round(rate*.1),blocks=[];
  for(let start=0;start+size<=weighted.length;start+=hop){let sum=0;for(let i=start;i<start+size;i++)sum+=weighted[i]**2;const z=sum/size,l=-.691+10*Math.log10(z);if(l>=-70)blocks.push({z,l});}
  const preliminary=-.691+10*Math.log10(blocks.reduce((s,x)=>s+x.z,0)/blocks.length);
  const gated=blocks.filter(x=>x.l>=preliminary-10);
  return -.691+10*Math.log10(gated.reduce((s,x)=>s+x.z,0)/gated.length);
}
function peak(samples){let p=0;for(const x of samples)p=Math.max(p,Math.abs(x));return p;}
function rms(samples){let sum=0;for(const x of samples)sum+=x*x;return Math.sqrt(sum/samples.length);}
function compressToPeak(input, drive) {
  const p=peak(input), denom=Math.tanh(drive);
  return Float64Array.from(input,x=>Math.tanh(drive*x/p)/denom*peakCeiling);
}
function normalizedLinear(input, rate) {
  const gain=10**((targetLufs-integrated(input,rate))/20);
  if(peak(input)*gain>peakCeiling)throw new Error('Linear normalization exceeds peak ceiling');
  return { samples:Float64Array.from(input,x=>x*gain),drive:0 };
}
function normalizedCompressed(input, rate) {
  let low=.01,high=64,best;
  for(let n=0;n<28;n++){const drive=(low+high)/2,samples=compressToPeak(input,drive),value=integrated(samples,rate);best={samples,drive,value};if(value<targetLufs)low=drive;else high=drive;}
  return best;
}
function wav(samples,rate){const b=Buffer.alloc(44+samples.length*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);samples.forEach((x,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,x))*32767),44+i*2));return b;}
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{const page=await browser.newPage(),report=[];
for(const source of sources){const original=fs.readFileSync(path.join(folder,source.file));const decoded=await page.evaluate(async data=>{const ctx=new AudioContext({sampleRate:48000}),bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),buffer=await ctx.decodeAudioData(bytes.buffer),mono=new Float32Array(buffer.length);for(let c=0;c<buffer.numberOfChannels;c++){const a=buffer.getChannelData(c);for(let i=0;i<a.length;i++)mono[i]+=a[i]/buffer.numberOfChannels;}await ctx.close();return{samples:Array.from(mono),rate:buffer.sampleRate,duration:buffer.duration};},original.toString('base64'));
const input=Float64Array.from(decoded.samples),before=integrated(input,decoded.rate),result=source.drive==='auto'?normalizedCompressed(input,decoded.rate):normalizedLinear(input,decoded.rate),bytes=wav(result.samples,decoded.rate),target=`${source.id}.wav`;fs.writeFileSync(path.join(folder,target),bytes);report.push({id:source.id,sourceFile:source.file,file:target,durationSeconds:decoded.duration,initialBaselineLufs:source.initialBaselineLufs,immediateInputLufs:before,afterLufs:integrated(result.samples,decoded.rate),rmsDbFS:20*Math.log10(rms(result.samples)),peakDbFS:20*Math.log10(peak(result.samples)),compressionDrive:result.drive,sha256:sha(bytes)});}
fs.writeFileSync(path.join(root,'output/qa/focus-bell-loudness-normalization.json'),JSON.stringify({normalizedAt:new Date().toISOString(),standard:'ITU-R BS.1770 mono K-weighting with 400ms absolute/relative gated blocks',targetIntegratedLufs:targetLufs,peakCeilingDbFS:-1.5,sounds:report},null,2)+'\n');console.table(report.map(x=>({id:x.id,baseline:x.initialBaselineLufs.toFixed(2),input:x.immediateInputLufs.toFixed(2),after:x.afterLufs.toFixed(2),peak:x.peakDbFS.toFixed(2),drive:x.compressionDrive.toFixed(2)})));
const manifestPath=path.join(folder,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
manifest.revision=4;manifest.status='focus-bell-runtime-assets-loudness-matched';
manifest.loudnessNormalization={standard:'ITU-R BS.1770 mono K-weighting with 400ms absolute/relative gated blocks',targetIntegratedLufs:targetLufs,peakCeilingDbFS:-1.5,report:'output/qa/focus-bell-loudness-normalization.json'};
manifest.verification='All four runtime files decoded in Microsoft Edge and measured after processing at -12 LUFS integrated. Physical speaker response remains device-dependent.';
manifest.sounds=manifest.sounds.map(sound=>{const item=report.find(x=>x.id===sound.id);if(!item)return sound;const sourcePreparation=sound.sourcePreparation||sound.processing;const processing=item.id==='bomb'||item.id==='fart'?`soft tanh dynamic-range compression; normalized to ${targetLufs} LUFS; ${-1.5} dBFS peak ceiling`:`linear loudness adjustment; normalized to ${targetLufs} LUFS`;const {recommendedPreviewGain,loudnessProcessing,...rest}=sound;return{...rest,sourcePreparation,processing,file:item.file,durationSeconds:item.durationSeconds,sha256:item.sha256,initialBaselineLufs:item.initialBaselineLufs,measuredIntegratedLufs:item.afterLufs,measuredRmsDbFS:item.rmsDbFS,measuredPeakDbFS:item.peakDbFS};});
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}finally{await browser.close();}})();
