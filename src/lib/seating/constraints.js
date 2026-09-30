import { axis, nearby } from './geometry.js';

/** @param {import('./types').Rule} rule @param {Record<string,string>} assignment @param {import('./types').Layout} layout */
export function ruleSatisfied(rule, assignment, layout) {
  const positions=rule.students.map(id=>layout.seats.find(s=>s.active!==false&&assignment[s.id]===id));
  if(positions.some(s=>!s))return true;
  const [a,b]=positions;
  if(!a)return false;
  if(rule.kind==='fixed')return a.id===rule.seatId;
  if(rule.kind==='zone')return (rule.seatIds||[]).includes(a.id);
  if(rule.kind==='front'||rule.kind==='back'){
    // 바닥 여백과 책상 간격 때문에 앞·뒤 판정이 달라지지 않도록 실제 줄 수를 기준으로 나눕니다.
    const rows=axis(layout.seats.filter(s=>s.active!==false).map(s=>s.y));
    const row=rows.findIndex(y=>Math.abs(y-a.y)<=.12);
    return rule.kind==='front'?row<Math.ceil(rows.length/2):row>=Math.ceil(rows.length/2);
  }
  if(!b)return false;
  const paired=!!a.pair&&a.pair===b.pair,grouped=!!a.group&&a.group===b.group;
  if(rule.kind==='together')return rule.distance==='group'?grouped:paired;
  if(rule.kind!=='apart')return false;
  if(rule.distance==='pair')return !paired;
  if(rule.distance==='group')return !grouped;
  if(rule.distance==='far')return Math.hypot(a.x-b.x,a.y-b.y)>=3;
  return !nearby(a,b);
}

/** 학생마다 모든 단독 조건의 교집합을 계산해 고정·사전 지정·앞뒤 조건이 서로 무시되지 않게 합니다.
 * @param {import('./types').Draft} draft @param {string[]} students @param {import('./types').Seat[]} [seats] */
export function individualDomains(draft,students,seats=draft.layout.seats.filter(s=>s.active!==false)){
  return new Map(students.map(student=>{
    const rules=draft.rules.filter(r=>r.students.length===1&&r.students[0]===student);
    return [student,seats.filter(seat=>rules.every(rule=>ruleSatisfied(rule,{[seat.id]:student},draft.layout)))];
  }));
}

/** @param {import('./types').Draft} draft @param {string[]} students */
export function formationSeats(draft,students){
  const all=draft.layout.seats.filter(s=>s.active!==false),ids=new Set(students);
  const occupied=all.filter(s=>ids.has(draft.assignments[s.id]));
  return occupied.length===students.length&&new Set(occupied.map(s=>draft.assignments[s.id])).size===students.length?occupied:all;
}

/** 중첩 구역의 자리 부족도 다항 시간에 찾아, 불가능한 사전 지정 때문에 계산이 멈추지 않게 합니다.
 * @param {Map<string,import('./types').Seat[]>} domains @returns {{matches:Map<string,string>,conflicts:Set<string>}} */
function matching(domains){
  const owner=/** @type {Map<string,string>} */(new Map()),conflicts=/** @type {Set<string>} */(new Set());
  /** @param {string} student @param {Set<string>} visited */
  function place(student,visited){
    for(const seat of domains.get(student)||[]){
      if(visited.has(seat.id))continue;
      visited.add(seat.id);
      const previous=owner.get(seat.id);
      if(!previous||place(previous,visited)){owner.set(seat.id,student);return true;}
    }
    return false;
  }
  for(const [student] of [...domains].sort((a,b)=>a[1].length-b[1].length)){
    const visited=/** @type {Set<string>} */(new Set());
    if(!place(student,visited)){conflicts.add(student);for(const seat of visited){const occupant=owner.get(seat);if(occupant)conflicts.add(occupant);}}
  }
  return {matches:new Map([...owner].map(([seat,student])=>[student,seat])),conflicts};
}
/** @param {Map<string,import('./types').Seat[]>} domains @returns {Map<string,string>|null} */
export function matchSeats(domains){const result=matching(domains);return result.conflicts.size?null:result.matches;}
/** @param {Map<string,import('./types').Seat[]>} domains @returns {Set<string>} */
export function seatConflicts(domains){return matching(domains).conflicts;}
