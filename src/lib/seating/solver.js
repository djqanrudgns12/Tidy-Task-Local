import { positionZone } from './geometry.js';
import { relations } from './model.js';
import { individualDomains, matchSeats, ruleSatisfied } from './constraints.js';
export { ruleSatisfied } from './constraints.js';
/** @type {Record<string,string>} */
export const RULE_NAMES={apart:'떨어져 앉기',together:'함께 앉기',front:'앞쪽에 앉기',back:'뒤쪽에 앉기',zone:'사전 지정',fixed:'자리 고정'};
/** @param {import("./types").Draft} draft */
export function violations(draft) { return draft.rules.filter(r=>!ruleSatisfied(r,draft.assignments,draft.layout)); }
/** 새로 추가한 지정을 한 명씩 고칠 수 있도록 기존 미해결 조건은 허용하고, 지키던 조건을 깨는 이동만 막습니다.
 * @param {import('./types').Draft} before @param {import('./types').Draft} after */
export function allowsAssignmentChange(before,after){
  const unresolved=new Set(violations(before).map(r=>r.id));
  return violations(after).every(r=>unresolved.has(r.id));
}
/** @param {import("./types").Draft} draft @param {import("./types").Student[]} students @param {boolean} complete */
export function validAssignments(draft,students,complete=false) {
  const seats=new Set(draft.layout.seats.filter(s=>s.active!==false).map(s=>s.id)), ids=new Set(students.map(p=>p.id));
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
/** 기존 학생 자리와 빈칸을 유지하고, 처음 배치할 때만 앞쪽부터 채웁니다.
 * @param {import('./types').Draft} draft
 * @param {import('./types').Student[]} people
 * @param {string[]} only
 * @returns {import('./types').Seat[]|null}
 */
function seatPool(draft,people,only) {
  const all=draft.layout.seats.filter(s=>s.active!==false).sort((a,b)=>a.y-b.y||a.x-b.x);
  const included=new Set(people.map(p=>p.id));
  const occupied=all.filter(s=>included.has(draft.assignments[s.id]));
  const constrained=people.filter(p=>draft.rules.some(r=>r.students.length===1&&r.students[0]===p.id)).map(p=>p.id);
  // 학생이 전부 앉아 있다면 책상이 있는 칸 전체를 그대로 사용합니다. 사전 지정도 그 안에서만 학생을 바꿉니다.
  if(occupied.length===people.length)return occupied;
  const preferred=[...occupied,...all.filter(s=>!occupied.includes(s))];
  const domains=individualDomains(draft,constrained,preferred);
  if(only.length)for(const seat of occupied)if(!only.includes(draft.assignments[seat.id]))domains.set(draft.assignments[seat.id],[seat]);
  const reserved=matchSeats(domains);if(!reserved)return null;
  // 부분 배치와 사전 지정이 서로 다른 칸을 요구하면 지정 자리를 우선하고, 나머지는 앞쪽에서 골라요.
  const required=new Set(reserved.values()),pool=all.filter(s=>required.has(s.id));
  for(const seat of preferred){if(pool.length>=people.length)break;if(!required.has(seat.id)){required.add(seat.id);pool.push(seat);}}
  return pool.sort((a,b)=>a.y-b.y||a.x-b.x);
}
/** @param {{draft:import("./types").Draft,students:import("./types").Student[],archives?:import("./types").Archive[],seed?:number,budget?:number,only?:string[]}} input */
export function solve({draft,students,archives=[],seed=1,budget=1800,only=[]}) {
  const start=performance.now();
  let randomState=seed>>>0;
  const random=()=>{randomState=(Math.imul(1664525,randomState)+1013904223)>>>0;return randomState/4294967296;};
  /** @template T @param {T[]} a @returns {T[]} */
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const people=students.filter(p=>!draft.excluded.includes(p.id));
  const included=new Set(people.map(p=>p.id));
  if(draft.rules.some(r=>r.students.some(id=>!included.has(id))))return {status:'impossible',message:'배치 조건에 있는 학생이 이번 배치에서 빠져 있어요.',candidates:[]};
  const all=draft.layout.seats.filter(s=>s.active!==false),pool=seatPool(draft,people,only);
  if(all.length<people.length)return {status:'impossible',message:`책상이 ${people.length-all.length}개 부족해요.`,candidates:[]};
  if(!pool||!matchSeats(individualDomains(draft,people.map(p=>p.id),pool)))return {status:'impossible',message:'현재 책상 대형 안에서 사전 지정과 고정 조건을 함께 지킬 수 없어요. 지정 자리나 대형을 먼저 조정해 주세요.',candidates:[]};
  let seats=pool;
  const rules=draft.rules,assignment=/** @type {Record<string,string>} */({}),fixed=new Set();
  for(const r of rules.filter(r=>r.kind==='fixed')) {if(assignment[r.seatId||""]&&assignment[r.seatId||""]!==r.students[0])return {status:'impossible',message:'한 자리에 두 학생이 지정되어 있어요.',candidates:[]};assignment[r.seatId||""]=r.students[0];fixed.add(r.students[0]);}
  if(only.length) for(const [s,p] of Object.entries(draft.assignments))if(!only.includes(p)){assignment[s]=p;fixed.add(p);}
  if(!validAssignments({...draft,assignments:assignment},students))return {status:'impossible',message:'유지할 자리와 배치 조건을 함께 확인해 주세요.',candidates:[]};
  const pending=people.filter(p=>!fixed.has(p.id));
  let domains=individualDomains(draft,pending.map(p=>p.id),seats.filter(s=>!assignment[s.id]));
  if([...domains.values()].some(a=>!a.length))return {status:'impossible',message:'앉을 수 있는 자리가 없는 학생이 있어요. 지정 구역과 고정 자리를 확인해 주세요.',candidates:[]};
  const involved=new Map(people.map(p=>[p.id,rules.filter(r=>r.students.includes(p.id))]));
  const priority=(/** @type {import('./types').Student} */ a,/** @type {import('./types').Student} */ b)=>(domains.get(a.id)||[]).length-(domains.get(b.id)||[]).length||(involved.get(b.id)||[]).length-(involved.get(a.id)||[]).length;
  let order=[...pending].sort(priority);
  const candidates=/** @type {import("./types").Candidate[]} */([]),seen=new Set(); let nodes=0,timedOut=false;
  function accept() {const d={...draft,assignments:{...assignment}};if(!validAssignments(d,students,true))return;const metrics=score(d,students,archives),key=seats.map(s=>assignment[s.id]||'').join(','); if(seen.has(key))return;seen.add(key);candidates.push({assignments:{...assignment},metrics});candidates.sort((a,b)=>compare(a.metrics.tuple,b.metrics.tuple));if(candidates.length>48)candidates.pop();}
  /** @param {number} index */
  function visit(index) {
    if(++nodes%32===0&&performance.now()-start>budget){timedOut=true;return;}
    if(index===order.length){accept();return;}
    const p=order[index];
    for(const s of shuffle(domains.get(p.id)||[])) {if(timedOut)return;if(assignment[s.id])continue;assignment[s.id]=p.id;
      // 조건이 있는 다음 학생에게 갈 자리가 남아 있는지 먼저 보고, 무관한 학생들의 순열을 되풀이하지 않습니다.
      if((involved.get(p.id)||[]).every(r=>ruleSatisfied(r,assignment,draft.layout))&&order.slice(index+1).every(other=>{
        const constraints=involved.get(other.id)||[];
        return !constraints.length||(domains.get(other.id)||[]).some(seat=>!assignment[seat.id]&&constraints.every(r=>ruleSatisfied(r,{...assignment,[seat.id]:other.id},draft.layout)));
      }))visit(index+1);
      delete assignment[s.id];
      // 작은 문제는 전수 탐색하고 큰 교실은 제한 시간 내 여러 시작점을 살펴봅니다.
      if(order.length>10&&candidates.length>=24)return;
    }
  }
  visit(0);
  // 처음 만드는 배치는 앞쪽 일부 칸만 보면 함께 앉기 조건을 놓칠 수 있어 전체 빈자리에서도 찾아봅니다.
  // 이미 완성된 배치는 대형을 바꾸지 않고 실패 이유를 보여 줍니다.
  if(!candidates.length&&!timedOut&&Object.keys(draft.assignments).length<people.length&&seats.length<all.length){
    seats=all;domains=individualDomains(draft,pending.map(p=>p.id),seats.filter(s=>!assignment[s.id]));
    order=[...pending].sort(priority);visit(0);
  }
  if(candidates.length&&people.length>10) {
    let best={...candidates[0].assignments}; const movable=seats.filter(s=>!fixed.has(best[s.id])),polishUntil=Math.min(start+budget,performance.now()+55);let passes=0;
    while(performance.now()<polishUntil&&passes++<Math.max(120,people.length*9)&&movable.length>1){ const a=movable[Math.floor(random()*movable.length)].id,b=movable[Math.floor(random()*movable.length)].id, next={...best};const p=next[a],q=next[b];if(q)next[a]=q;else delete next[a];if(p)next[b]=p;else delete next[b];
      if(rules.every(r=>ruleSatisfied(r,next,draft.layout))){const m=score({...draft,assignments:next},students,archives),prev=score({...draft,assignments:best},students,archives);if(compare(m.tuple,prev.tuple)<=0)best=next; const key=seats.map(s=>next[s.id]||'').join(',');if(!seen.has(key)){seen.add(key);candidates.push({assignments:next,metrics:m});candidates.sort((a,b)=>compare(a.metrics.tuple,b.metrics.tuple));candidates.splice(48);}}
    }
  }
  const selected=draft.rules.some(r=>r.kind==='zone')?candidates.slice(0,1):diverseCandidates(candidates);
  return {status:selected.length?'ready':timedOut?'timeout':'impossible',message:selected.length?'':timedOut?'이 조건으로 아직 배치를 찾지 못했어요. 더 찾거나 조건을 조정해 주세요.':'조건을 모두 지키는 배치가 없어요. 선생님 설정에서 조건을 확인해 주세요.',candidates:selected,seed,nodes};
}
