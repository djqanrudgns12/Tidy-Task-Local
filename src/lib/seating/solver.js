import { nearby, bounds, positionZone } from './geometry.js';
import { relations, pairKey } from './model.js';
/** @type {Record<string,string>} */
export const RULE_NAMES={apart:'떨어져 앉기',together:'함께 앉기',front:'앞쪽에 앉기',back:'뒤쪽에 앉기',zone:'사전 지정',fixed:'자리 고정'};
/** @param {import("./types").Rule} rule @param {Record<string,string>} assignment @param {import("./types").Layout} layout */
export function ruleSatisfied(rule,assignment,layout) {
  const positions=rule.students.map(id=>layout.seats.find(s=>assignment[s.id]===id));
  if(positions.some(s=>!s)) return true;
  const a=/** @type {import("./types").Seat} */(positions[0]),b=/** @type {import("./types").Seat} */(positions[1]);
  if(rule.kind==='fixed')return a.id===rule.seatId;
  if(rule.kind==='zone')return (rule.seatIds||[]).includes(a.id);
  if(rule.kind==='front')return a.y<=bounds(layout.seats).height*.46;
  if(rule.kind==='back')return a.y>=bounds(layout.seats).height*.46;
  const paired=!!a.pair&&a.pair===b.pair, grouped=!!a.group&&a.group===b.group;
  if(rule.kind==='together')return rule.distance==='group'?grouped:paired;
  if(rule.distance==='pair')return !paired;
  if(rule.distance==='group')return !grouped;
  if(rule.distance==='far')return Math.hypot(a.x-b.x,a.y-b.y)>=3;
  return !nearby(a,b);
}
/** @param {import("./types").Draft} draft */
export function violations(draft) { return draft.rules.filter(r=>!ruleSatisfied(r,draft.assignments,draft.layout)); }
/** @param {import("./types").Draft} draft @param {import("./types").Student[]} students @param {boolean} complete */
export function validAssignments(draft,students,complete=false) {
  const seats=new Set(draft.layout.seats.filter(s=>s.active).map(s=>s.id)), ids=new Set(students.map(p=>p.id));
  const assigned=Object.values(draft.assignments);
  return new Set(assigned).size===assigned.length&&Object.entries(draft.assignments).every(([s,p])=>seats.has(s)&&ids.has(p)&&!draft.excluded.includes(p))&&(!complete||(students.filter(p=>!draft.excluded.includes(p.id)).length===assigned.length&&draft.rules.every(r=>r.students.every(id=>assigned.includes(id)))))&&!violations(draft).length;
}
/** @param {import("./types").Draft} draft @param {import("./types").Student[]} students @param {import("./types").Archive[]} archives */
export function score(draft,students,archives) {
  const saved=archives.filter(a=>a.used!==false), previous=saved.find(a=>a.id===draft.comparisonArchiveId)||saved.at(-1), rel=relations(draft);
  const previousPairs=new Set(previous?.relations.pairs||[]), previousGroups=new Set(previous?.relations.groups||[]);
  const repeated=rel.pairs.filter(k=>previousPairs.has(k)).length, groupRepeat=rel.groups.filter(k=>previousGroups.has(k)).length;
  let gender=0, positions=0;
  const people=new Map(students.map(p=>[p.id,p]));
  for(const key of rel.pairs) { const [a,b]=key.split('|').map(id=>people.get(id)); if(!a||!b||a.gender==='unspecified'||b.gender==='unspecified')continue; if(draft.gender==='different'&&a.gender===b.gender||draft.gender==='same'&&a.gender!==b.gender)gender++; }
  for(const key of rel.groups) {const [a,b]=key.split('|').map(id=>people.get(id));if(!a||!b)continue; if(draft.gender==='balanced'&&a.gender!=='unspecified'&&a.gender===b.gender)gender++;}
  if(previous) for(const s of draft.layout.seats) { const id=draft.assignments[s.id],old=previous.draft.layout.seats.find(p=>previous.draft.assignments[p.id]===id);if(id&&old&&positionZone(s,draft.layout)===positionZone(old,previous.draft.layout))positions++; }
  return {tuple:[draft.avoidPartners?repeated:0,draft.avoidGroups?groupRepeat:0,draft.avoidPosition?positions:0,gender],repeated,groupRepeat,positions,gender};
}
/** @param {number[]} a @param {number[]} b */
const compare=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0;};
/** @param {import('./types').Candidate} a @param {import('./types').Candidate} b */
function assignmentDistance(a,b){const seats=new Set([...Object.keys(a.assignments),...Object.keys(b.assignments)]);let changed=0;for(const seat of seats)if(a.assignments[seat]!==b.assignments[seat])changed++;return changed;}
/** Keep the strongest result first, then select alternatives that visibly differ without drifting far down the preference ranking.
 * @param {import('./types').Candidate[]} pool
 */
function diverseCandidates(pool){
  const ranked=[...pool].sort((a,b)=>compare(a.metrics.tuple,b.metrics.tuple));if(ranked.length<=3)return ranked;
  const available=ranked.slice(0,Math.min(36,ranked.length)),chosen=[available[0]];
  while(chosen.length<3){let best=null,bestValue=-Infinity;for(let i=0;i<available.length;i++){const candidate=available[i];if(chosen.includes(candidate))continue;const distance=Math.min(...chosen.map(other=>assignmentDistance(candidate,other))),value=distance-i*.16;if(value>bestValue){bestValue=value;best=candidate;}}if(!best)break;chosen.push(best);}
  return chosen;
}
/** Reserve the nearest valid places for students with one-person rules, then fill the rest from the front.
 * @param {import('./types').Draft} draft
 * @param {import('./types').Student[]} people
 * @returns {import('./types').Seat[]}
 */
function frontSeatPool(draft,people) {
  const all=draft.layout.seats.filter(s=>s.active).sort((a,b)=>a.y-b.y||a.x-b.x);
  const individualRules=draft.rules.filter(r=>r.students.length===1),byStudent=/** @type {Map<string,import('./types').Rule[]>} */(new Map());
  for(const rule of individualRules){const list=byStudent.get(rule.students[0])||[];list.push(rule);byStudent.set(rule.students[0],list);}
  const constrained=[...byStudent].map(([student,rules])=>({student,domain:all.filter(seat=>rules.every(rule=>ruleSatisfied(rule,{[seat.id]:student},draft.layout)))})).sort((a,b)=>a.domain.length-b.domain.length);
  const reserved=/** @type {Map<string,string>} */(new Map()),used=/** @type {Set<string>} */(new Set());
  /** @param {number} index */
  function reserve(index){if(index===constrained.length)return true;const item=constrained[index];for(const seat of item.domain){if(used.has(seat.id))continue;used.add(seat.id);reserved.set(item.student,seat.id);if(reserve(index+1))return true;used.delete(seat.id);reserved.delete(item.student);}return false;}
  if(!reserve(0))return [];
  const ids=new Set(reserved.values()),pool=all.filter(seat=>ids.has(seat.id));
  for(const seat of all){if(pool.length>=people.length)break;if(!ids.has(seat.id)){ids.add(seat.id);pool.push(seat);}}
  return pool.sort((a,b)=>a.y-b.y||a.x-b.x);
}
/** @param {{draft:import("./types").Draft,students:import("./types").Student[],archives?:import("./types").Archive[],seed?:number,budget?:number,only?:string[]}} input */
export function solve({draft,students,archives=[],seed=1,budget=1800,only=[]}) {
  let randomState=seed>>>0;
  const random=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;};
  /** @template T @param {T[]} a @returns {T[]} */
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const people=students.filter(p=>!draft.excluded.includes(p.id)),seats=frontSeatPool(draft,people);
  const included=new Set(people.map(p=>p.id));
  if(draft.rules.some(r=>r.students.some(id=>!included.has(id))))return {status:'impossible',message:'배치 조건에 있는 학생이 이번 배치에서 빠져 있어요.',candidates:[]};
  if(seats.length<people.length)return {status:'impossible',message:`책상이 ${people.length-seats.length}개 부족해요.`,candidates:[]};
  const rules=draft.rules,start=performance.now(),assignment=/** @type {Record<string,string>} */({}),fixed=new Set();
  for(const r of rules.filter(r=>r.kind==='fixed')) {if(assignment[r.seatId||""]&&assignment[r.seatId||""]!==r.students[0])return {status:'impossible',message:'한 자리에 두 학생이 지정되어 있어요.',candidates:[]};assignment[r.seatId||""]=r.students[0];fixed.add(r.students[0]);}
  if(only.length) for(const [s,p] of Object.entries(draft.assignments))if(!only.includes(p)){assignment[s]=p;fixed.add(p);}
  if(!validAssignments({...draft,assignments:assignment},students))return {status:'impossible',message:'유지할 자리와 배치 조건을 함께 확인해 주세요.',candidates:[]};
  const pending=people.filter(p=>!fixed.has(p.id));
  const domains=new Map(pending.map(p=>[p.id,seats.filter(s=>!assignment[s.id]&&rules.filter(r=>r.students.length===1&&r.students[0]===p.id).every(r=>ruleSatisfied(r,{...assignment,[s.id]:p.id},draft.layout)))]));
  if([...domains.values()].some(a=>!a.length))return {status:'impossible',message:'앉을 수 있는 자리가 없는 학생이 있어요. 지정 구역과 고정 자리를 확인해 주세요.',candidates:[]};
  const order=[...pending].sort((a,b)=>(domains.get(a.id)||[]).length-(domains.get(b.id)||[]).length), candidates=/** @type {import("./types").Candidate[]} */([]),seen=new Set(); let nodes=0,timedOut=false;
  function accept() {const d={...draft,assignments:{...assignment}}, metrics=score(d,students,archives),key=seats.map(s=>assignment[s.id]||'').join(','); if(seen.has(key))return;seen.add(key);candidates.push({assignments:{...assignment},metrics});candidates.sort((a,b)=>compare(a.metrics.tuple,b.metrics.tuple));if(candidates.length>48)candidates.pop();}
  /** @param {number} index */
  function visit(index) {
    if(++nodes%64===0&&performance.now()-start>budget){timedOut=true;return;}
    if(index===order.length){accept();return;}
    const p=order[index];
    for(const s of shuffle(domains.get(p.id)||[])) {if(timedOut)return;if(assignment[s.id])continue;assignment[s.id]=p.id;
      if(rules.every(r=>ruleSatisfied(r,assignment,draft.layout)))visit(index+1);
      delete assignment[s.id];
      // 작은 문제는 전수 탐색하고 큰 교실은 제한 시간 내 여러 시작점을 살펴봅니다.
      if(order.length>10&&candidates.length>=24)return;
    }
  }
  visit(0);
  if(candidates.length&&people.length>10) {
    let best={...candidates[0].assignments}; const movable=seats.filter(s=>!fixed.has(best[s.id])),polishUntil=Math.min(start+budget,performance.now()+55);let passes=0;
    while(performance.now()<polishUntil&&passes++<Math.max(120,people.length*9)&&movable.length>1){ const a=movable[Math.floor(random()*movable.length)].id,b=movable[Math.floor(random()*movable.length)].id, next={...best};const p=next[a],q=next[b];if(q)next[a]=q;else delete next[a];if(p)next[b]=p;else delete next[b];
      if(rules.every(r=>ruleSatisfied(r,next,draft.layout))){const m=score({...draft,assignments:next},students,archives),prev=score({...draft,assignments:best},students,archives);if(compare(m.tuple,prev.tuple)<=0)best=next; const key=seats.map(s=>next[s.id]||'').join(',');if(!seen.has(key)){seen.add(key);candidates.push({assignments:next,metrics:m});candidates.sort((a,b)=>compare(a.metrics.tuple,b.metrics.tuple));candidates.splice(48);}}
    }
  }
  const selected=draft.rules.some(r=>r.kind==='zone')?candidates.slice(0,1):diverseCandidates(candidates);
  return {status:selected.length?'ready':timedOut?'timeout':'impossible',message:selected.length?'':timedOut?'이 조건으로 아직 배치를 찾지 못했어요. 더 찾거나 조건을 조정해 주세요.':'조건을 모두 지키는 배치가 없어요. 선생님 설정에서 조건을 확인해 주세요.',candidates:selected,seed,nodes};
}
