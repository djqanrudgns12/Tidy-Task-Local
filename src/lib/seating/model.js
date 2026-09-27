import { alignSeats, axis } from './geometry.js';
export const uid = () => crypto.randomUUID();
/** @template T @param {T} value @returns {T} */
export const clone = value => JSON.parse(JSON.stringify(value));
export const SHAPES = [['pairs','둘씩 앉기'],['single','혼자 앉기'],['groups','모둠으로 앉기']];
/** @type {Record<string,string>} */
export const PROP_NAMES = {board:'칠판',shelf:'책장',plant:'화분',teacher:'교탁',locker:'사물함',aisle:'통로'};
/** @param {number} count @param {string} shape @param {number} width @param {number} [requestedRows] @returns {import("./types").Layout} */
export function makeLayout(count, shape = 'pairs', width = 6, requestedRows=0) {
  const columns=Math.max(2,Math.min(12,Math.round(width)||6));
  const rows=count ? Math.max(1,Math.min(30,Math.max(Math.ceil(count/columns),Math.round(requestedRows)||0))) : 0;
  const n=Math.min(600,columns*rows);
  const seats = Array.from({length:n}, (_,i) => {
    const col=i%columns,row=Math.floor(i/columns);let x, y, angle=0, pair='', group='';
    if (shape === 'groups') {x=1+col*1.14+Math.floor(col/2)*.42;y=1+row*1.36+Math.floor(row/2)*.54;group=`group-${Math.floor(row/2)}-${Math.floor(col/2)}`;pair=`pair-${row}-${Math.floor(col/2)}`;angle=row%2?0:180;}
    else {x=1+col*1.2+(shape==='pairs'?Math.floor(col/2)*.38:col*.18);y=1+row*1.65;pair=shape==='pairs'?`pair-${row}-${Math.floor(col/2)}`:'';}
    return {id:uid(),x,y,angle,pair,group,locked:false,active:true};
  });
  return {shape,seats,props:[],front:'top',columns,rows};
}
/** @param {number} count @returns {import("./types").Draft} */
/** @param {string} date YYYY-MM-DD */
export function defaultArchiveTitle(date) { const [,month,day]=date.split('-').map(Number); return `${month}월 ${day}일 저장`; }
export function newDraft(count=0) { return {title:defaultArchiveTitle(new Date().toLocaleDateString('sv-SE')),layout:makeLayout(count),assignments:{},rules:[],excluded:[],appearances:{},comparisonArchiveId:null,avoidPartners:true,avoidGroups:false,avoidPosition:false,gender:'any',rosterRevision:0}; }
/** @param {number} count @returns {import("./types").SeatingDocument} */
export function newDocument(count=0) { return {version:1,revision:0,draft:newDraft(count),archives:[],currentId:null}; }
/** @param {import("./types").Draft} draft @param {import("./types").Classroom} classroom */
export function reconcile(draft, classroom) {
  const d=clone(draft), ids=new Set(classroom.students.map(p=>p.id));
  d.layout.seats=alignSeats(d.layout.seats);
  const columns=Math.max(2,Math.min(12,d.layout.columns||axis(d.layout.seats.map(s=>s.x)).length||6));
  const rows=Math.max(1,d.layout.rows||axis(d.layout.seats.map(s=>s.y)).length||Math.ceil(classroom.students.length/columns));
  const template=makeLayout(Math.max(classroom.students.length,columns*rows),d.layout.shape||'pairs',columns,rows);
  template.seats=template.seats.map((seat,i)=>d.layout.seats[i]?{...seat,id:d.layout.seats[i].id,locked:false,active:true}:seat);
  d.layout=template;
  const seats=new Set(d.layout.seats.map(s=>s.id));
  d.layout.props=[];
  d.assignments=Object.fromEntries(Object.entries(d.assignments).filter(([s,p])=>seats.has(s)&&ids.has(p)));
  d.rules=d.rules.filter(r=>r.students.every(id=>ids.has(id)) && (!r.seatId||seats.has(r.seatId)));
  d.excluded=[];
  d.appearances={};
  d.rosterRevision=classroom.revision;
  return d;
}

/** Resize the tidy grid while preserving occupied and rule-bound seat identities.
 * @param {import('./types').Draft} draft @param {'columns'|'rows'} axisName @param {number} delta @returns {import('./types').Draft|null} */
export function resizeLayout(draft,axisName,delta) {
  const d=clone(draft),old=d.layout.seats;
  const columns=Math.max(2,Math.min(12,(d.layout.columns||axis(old.map(s=>s.x)).length||6)+(axisName==='columns'?delta:0)));
  const rows=Math.max(1,Math.min(30,(d.layout.rows||axis(old.map(s=>s.y)).length||1)+(axisName==='rows'?delta:0)));
  const target=columns*rows,critical=new Set([...Object.keys(d.assignments),...d.rules.flatMap(r=>[r.seatId||'',...(r.seatIds||[])])].filter(Boolean));
  if(target<Object.keys(d.assignments).length||target<critical.size)return null;
  const ordered=[...old];
  for(let i=target;i<ordered.length;i++)if(critical.has(ordered[i].id)){
    const free=ordered.findIndex((s,j)=>j<target&&!critical.has(s.id));if(free<0)return null;[ordered[free],ordered[i]]=[ordered[i],ordered[free]];
  }
  const next=makeLayout(target,d.layout.shape||'pairs',columns,rows);
  next.seats=next.seats.map((seat,i)=>ordered[i]?{...seat,id:ordered[i].id}:seat);
  d.layout=next;
  const kept=new Set(next.seats.map(s=>s.id));
  d.assignments=Object.fromEntries(Object.entries(d.assignments).filter(([id])=>kept.has(id)));
  d.rules=d.rules.map(r=>({...r,seatIds:(r.seatIds||[]).filter(id=>kept.has(id))})).filter(r=>!r.seatId||kept.has(r.seatId));
  return d;
}
/** @param {string} a @param {string} b */
export function pairKey(a,b) { return [a,b].sort().join('|'); }
/** @param {import("./types").Draft} draft */
export function relations(draft) {
  const pairs=[],groups=[];
  for(let i=0;i<draft.layout.seats.length;i++) for(let j=i+1;j<draft.layout.seats.length;j++) {
    const a=draft.layout.seats[i],b=draft.layout.seats[j],p=draft.assignments[a.id],q=draft.assignments[b.id];
    if(!p||!q) continue;
    if(a.pair&&a.pair===b.pair) pairs.push(pairKey(p,q));
    if(a.group&&a.group===b.group) groups.push(pairKey(p,q));
  }
  return {pairs,groups};
}
/** Keep the newest saved result for each calendar day.
 * @param {import('./types').Archive[]} archives @returns {import('./types').Archive[]} */
export function dailyArchives(archives) {
  /** @type {Map<string,import('./types').Archive>} */ const byDate=new Map();
  for(const archive of archives) {
    const previous=byDate.get(archive.date);
    if(!previous || archive.createdAt>=previous.createdAt)byDate.set(archive.date,archive);
  }
  return [...byDate.values()].sort((a,b)=>a.createdAt-b.createdAt);
}

/** Bring in desk geometry while keeping current students and seat-bound rules where possible.
 * @param {import('./types').Draft} current @param {import('./types').Draft} saved @param {number} studentCount */
export function importSeatLayout(current,saved,studentCount) {
  const next=clone(current),oldSeats=current.layout.seats;
  const needed=Math.max(studentCount,Object.keys(current.assignments).length,saved.layout.seats.length);
  const columns=Math.max(2,Math.min(12,saved.layout.columns||6));
  const rows=Math.max(saved.layout.rows||0,Math.ceil(needed/columns));
  const generated=makeLayout(needed,saved.layout.shape,columns,rows);
  next.layout={...clone(saved.layout),columns,rows,seats:generated.seats.map((seat,i)=>saved.layout.seats[i]?clone(saved.layout.seats[i]):seat)};
  const available=next.layout.seats.filter(s=>s.active!==false),byId=new Map(available.map(s=>[s.id,s]));
  const claimed=new Set(),mapped=new Map();
  const oldWidth=Math.max(1,...oldSeats.map(s=>s.x)),oldHeight=Math.max(1,...oldSeats.map(s=>s.y));
  const newWidth=Math.max(1,...available.map(s=>s.x)),newHeight=Math.max(1,...available.map(s=>s.y));
  const important=[...oldSeats.filter(s=>current.assignments[s.id]||current.rules.some(r=>r.seatId===s.id||r.seatIds?.includes(s.id))),...oldSeats.filter(s=>!current.assignments[s.id]&&!current.rules.some(r=>r.seatId===s.id||r.seatIds?.includes(s.id)))];
  for(const seat of important)if(byId.has(seat.id)&&!claimed.has(seat.id)){mapped.set(seat.id,seat.id);claimed.add(seat.id);}
  for(const seat of important)if(!mapped.has(seat.id)){
    const x=seat.x/oldWidth,y=seat.y/oldHeight;
    let best=null,score=Infinity;
    for(const candidate of available)if(!claimed.has(candidate.id)){
      const distance=Math.hypot(candidate.x/newWidth-x,candidate.y/newHeight-y);
      if(distance<score){best=candidate;score=distance;}
    }
    if(best){mapped.set(seat.id,best.id);claimed.add(best.id);}
  }
  next.assignments=Object.fromEntries(Object.entries(current.assignments).filter(([seat])=>mapped.has(seat)).map(([seat,person])=>[mapped.get(seat),person]));
  next.rules=current.rules.map(rule=>({...rule,seatId:rule.seatId?mapped.get(rule.seatId)||null:rule.seatId,seatIds:rule.seatIds?.map(id=>mapped.get(id)).filter(Boolean)})).filter(rule=>rule.kind!=='fixed'||rule.seatId).filter(rule=>rule.kind!=='zone'||rule.seatIds?.length);
  return next;
}
/** @param {import("./types").Draft} draft @param {import("./types").Student[]} students @param {string} className @param {string} date @returns {import("./types").Board} */
export function publicBoard(draft, students, className, date='') {
  const lookup=new Map(students.map(p=>[p.id,p]));
  // 공개 화면과 이미지에는 화이트리스트 필드만 넘겨 조건이 숨어 들어가지 않게 합니다.
  return {title:draft.title,className,date,props:[],seats:draft.layout.seats.map((s,i)=>{
    const p=lookup.get(draft.assignments[s.id]);
    return {id:`place-${i}`,x:s.x,y:s.y,angle:s.angle,active:s.active,name:p?.name||'',number:p?.number||'',appearance:p?.gender||'unspecified',gender:p?.gender||'unspecified'};
  })};
}
