import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSpeechPlayer } from './speech/player.js';
import { CATALOG, VOICES, SPEEDS } from './speech/catalog.js';
import { speechPlan } from './speech/plan.js';
import { candidateNumber, nativeCount, normalizeSpeechContent } from './speech/normalize.js';
import { normalizeConfig } from './model.js';

function harness(overrides = {}) {
  const timers = new Map();
  /** @type {any[]} */
  const sources = [];
  const context = {state:'running', decodeAudioData:async () => ({duration:2}), createBufferSource:() => {
    const s = {buffer:null,onended:null,connect(){},disconnect(){},start(){},stop(){}};
    sources.push(s); return s;
  }};
  const player = createSpeechPlayer(/** @type {any} */ ({channel:async () => ({context,destination:{}}),load:async () => new ArrayBuffer(8),setTimer:(/** @type {()=>void} */ fn) => {const id = Symbol(); timers.set(id,fn); return id;},clearTimer:(/** @type {symbol} */ id)=>timers.delete(id),...overrides}));
  return {player, sources, timers};
}
const flush = async () => { for(let i=0;i<12;i++) await Promise.resolve(); };
test('음성은 문장 순서대로 재생하며 취소는 ended 없이 즉시 끝납니다', async () => {
  const h = harness();
  /** @type {boolean[]} */
  const events=[];
  h.player.onSpeaking(v=>events.push(v));
  const p = h.player.speak([{},{}]); await flush();
  assert.equal(h.sources.length,1); h.sources[0].onended(); await flush();
  assert.equal(h.sources.length,2); h.sources[1].onended();
  assert.equal(await p,'completed'); assert.equal(h.timers.size,0);
  const q = h.player.speak([{}]); await flush(); h.player.cancel();
  assert.equal(await q,'cancelled'); assert.equal(h.timers.size,0); assert.equal(events.at(-1),false);
});
test('취소된 비동기 로딩은 새 음성과 겹치지 않습니다', async () => {
  /** @type {any} */ let deliver; const h=harness({load:()=>new Promise(r=>deliver=r)});
  const p=h.player.speak([{}]); await flush(); h.player.cancel(); deliver(new ArrayBuffer(8)); await flush();
  assert.equal(await p,'cancelled'); assert.equal(h.sources.length,0);
});
test('시간 초과·누락·차단·음소거를 완료로 처리하지 않습니다', async () => {
  const h=harness(); const p=h.player.speak([{}]); await flush(); [...h.timers.values()][0]();
  assert.equal(await p,'timeout'); h.player.setMuted(true); assert.equal(await h.player.speak([{}]),'muted');
  h.player.dispose(); assert.equal(await h.player.speak([{}]),'disposed');
  assert.equal(await harness({load:async()=>null}).player.speak([{}]),'missing');
  assert.equal(await harness({channel:async()=>null}).player.speak([{}]),'blocked');
});
test('디코딩 중 음소거와 손상된 음원도 이전 재생을 되살리지 않습니다', async () => {
  /** @type {any} */
  let decoded;
  const h=harness({channel:async()=>({context:{state:'running',decodeAudioData:()=>new Promise(r=>decoded=r),createBufferSource:()=>{throw new Error('취소 후 재생하면 안 됩니다.');}},destination:{}})});
  const p=h.player.speak([{}]); await flush(); h.player.setVolume(0);
  decoded({duration:1}); await flush(); assert.equal(await p,'muted');
  assert.equal(await harness({load:async()=>{throw new Error('손상');}}).player.speak([{}]),'decode-error');
});
test('번호와 수량을 구분하고 발음 별칭은 화면 내용과 분리합니다', () => {
  assert.equal(candidateNumber(1),'기호 일 번'); assert.equal(candidateNumber(2),'기호 이 번');
  assert.equal(nativeCount(21,'명'),'스물한 명'); assert.equal(nativeCount(20,'명'),'스무 명');
  const c=normalizeConfig({type:'candidate',title:'학교 2026',items:[{id:'a',name:'의진',number:1},{id:'b',name:'서연',number:2}],speechContent:{readDynamic:true,itemAliases:{a:'으진',deleted:'비밀'}}});
  const content=normalizeSpeechContent(c.speechContent,c);
  assert.equal(content.itemAliases.a,'으진'); assert.equal(content.itemAliases.deleted,undefined);
  assert.equal(c.items[0].name,'의진');
  const renamed = normalizeConfig({...c,items:c.items.map((it,i)=>i===0?{...it,name:'민재'}:it)});
  assert.equal(renamed.speechContent?.itemAliases.a,undefined);
  const plan=speechPlan(c,'meet'); assert.match(plan.segments[1].text,/기호 일 번\. 으진/);
  assert.equal(plan.fallback.some(s=>s.dynamic),false);
  assert.doesNotMatch(speechPlan(c,'undo').segments[0].text,/초|자동/);
  Object.defineProperty(c,'ballots',{get(){throw new Error('개별 표를 음성 계획에서 읽으면 안 됩니다.');}});
  assert.ok(speechPlan(c,'meet').segments.length);
});
test('설정별 모든 안내 계획이 실제 내장 음원과 일치합니다', () => {
  for(const type of ['candidate','opinion','yesno']) for(let count=2;count<=(type==='yesno'?5:9);count++) for(const allowRepeat of [false,true]) {
    const c=normalizeConfig({type,items:Array.from({length:count},(_,i)=>({id:`i${i}`,name:`이름${i}`,number:i+1})),agendas:Array.from({length:count},(_,i)=>({id:`a${i}`,text:`안건${i}`})),rules:{voters:60,votesPerVoter:Math.min(5,count),allowRepeat}});
    for(const id of ['today','meet','line','press','abstain','undo','secret','ready',type==='yesno'?'agendas':'multi']) {
      const p=speechPlan(c,id); assert.ok(p.segments.length,`${type}/${id}`); for(const s of p.segments) assert.equal(s.text,CATALOG[s.id]);
    }
  }
});
test('남녀·두 속도의 모든 음원은 대본·해시·재생 길이가 일치합니다', () => {
  const root=new URL('../../assets/vote/speech/',import.meta.url);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
  const sha=(/** @type {string|Buffer} */ v)=>createHash('sha256').update(v).digest('hex');
  assert.equal(Object.keys(manifest.entries).length,Object.keys(CATALOG).length*4);
  for(const voice of VOICES) for(const speed of SPEEDS) for(const [id,text] of Object.entries(CATALOG)) {
    const e=manifest.entries[`${voice}.${speed}.${id}`]; assert.ok(e,`${voice}/${speed}/${id}`);
    assert.equal(e.text,text); assert.equal(e.textHash,sha(text));
    assert.equal(e.sha256,sha(readFileSync(new URL(e.file,root))));
    assert.ok(e.durationMs>100 && e.durationMs<35000);
  }
  assert.equal(readdirSync(root).filter(f=>f.endsWith('.mp3')).length,Object.keys(CATALOG).length*4);
});
