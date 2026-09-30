import { axis, numbers } from './geometry.js';
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
/** @param {string} date YYYY-MM-DD */
export function defaultArchiveTitle(date) { const [,month,day]=date.split('-').map(Number); return `${month}월 ${day}일 저장`; }
/** @param {number} count @returns {import("./types").Draft} */
export function newDraft(count=0) { return {title:defaultArchiveTitle(new Date().toLocaleDateString('sv-SE')),layout:makeLayout(count),assignments:{},rules:[],excluded:[],appearances:{},comparisonArchiveId:null,avoidPartners:true,avoidGroups:false,avoidPosition:false,gender:'any',rosterRevision:0}; }
/** @param {number} count @returns {import("./types").SeatingDocument} */
export function newDocument(count=0) { return {version:1,revision:0,draft:newDraft(count),archives:[],currentId:null}; }
/** @param {import("./types").Draft} draft @param {import("./types").Classroom} classroom @param {boolean} [expand] */
export function reconcile(draft, classroom, expand=true) {
  const d=clone(draft), ids=new Set(classroom.students.map(p=>p.id));
  // 명단 동기화는 학생 참조만 정리합니다. 창을 다시 읽을 때 교실을 새로 만들면 자리와 지정 위치가 바뀝니다.
  const seats=new Set(d.layout.seats.filter(s=>s.active!==false).map(s=>s.id)),allSeats=new Set(d.layout.seats.map(s=>s.id)),seen=new Set();
  d.excluded=d.excluded.filter(id=>ids.has(id));
  d.assignments=Object.fromEntries(Object.entries(d.assignments).filter(([s,p])=>{
    if(!seats.has(s)||!ids.has(p)||d.excluded.includes(p)||seen.has(p))return false;
    seen.add(p);return true;
  }));
  d.rules=d.rules.map(r=>({...r,...(r.seatIds?{seatIds:r.seatIds.filter(id=>allSeats.has(id))}:{})})).filter(r=>r.students.every(id=>ids.has(id))&&(!r.seatId||allSeats.has(r.seatId))&&(r.kind!=='zone'||r.seatIds?.length));
  d.appearances=Object.fromEntries(Object.entries(d.appearances).filter(([id])=>ids.has(id)));
  // 전입 학생으로 자리가 부족해진 때만 뒤쪽 줄을 늘리고, 이미 놓인 책상은 그대로 둡니다.
  const needed=classroom.students.filter(p=>!d.excluded.includes(p.id)).length;
  if(expand&&needed>seats.size){
    const columns=d.layout.columns||axis(d.layout.seats.map(s=>s.x)).length||6;
    const rows=d.layout.rows||axis(d.layout.seats.map(s=>s.y)).length||1;
    if(!d.layout.seats.length)d.layout=makeLayout(needed,d.layout.shape,columns,rows);
    else {const grown=resizeLayout(d,'rows',Math.ceil((needed-seats.size)/columns));if(grown)d.layout=grown.layout;}
  }
  d.rosterRevision=classroom.revision;
  return d;
}

/** 자리의 줄·열을 보존하며 확장하고, 축소 때만 제거되는 자리의 학생을 가까운 빈칸으로 옮깁니다.
 * @param {import('./types').Draft} draft @param {'columns'|'rows'} axisName @param {number} delta @returns {import('./types').Draft|null} */
export function resizeLayout(draft,axisName,delta) {
  const d=clone(draft),old=d.layout.seats;
  const columns=Math.max(2,Math.min(12,(d.layout.columns||axis(old.map(s=>s.x)).length||6)+(axisName==='columns'?delta:0)));
  const rows=Math.max(1,Math.min(30,(d.layout.rows||axis(old.map(s=>s.y)).length||1)+(axisName==='rows'?delta:0)));
  const target=columns*rows,bound=new Set(d.rules.flatMap(r=>[r.seatId||'',...(r.seatIds||[])]).filter(Boolean));
  const grid=numbers(old),byCell=new Map(old.map(s=>{const at=grid.at(s);return [`${at.y-1}:${at.x-1}`,s];}));
  const removed=old.filter(s=>{const at=grid.at(s);return at.x>columns||at.y>rows;});
  // 지정된 자리나 자물쇠의 좌표를 몰래 옮기는 대신, 먼저 조건을 변경하도록 알려 줍니다.
  if(removed.some(s=>bound.has(s.id)||s.locked))return null;
  const next=makeLayout(target,d.layout.shape||'pairs',columns,rows);
  next.seats=next.seats.map((seat,i)=>{
    const existing=byCell.get(`${Math.floor(i/columns)}:${i%columns}`);
    return existing?clone(existing):seat;
  });
  d.layout={...d.layout,columns,rows,seats:next.seats};
  const kept=new Set(next.seats.map(s=>s.id));
  const free=next.seats.filter(s=>s.active!==false&&!d.assignments[s.id]&&!bound.has(s.id));
  for(const seat of removed)if(d.assignments[seat.id]){
    free.sort((a,b)=>Math.hypot(a.x-seat.x,a.y-seat.y)-Math.hypot(b.x-seat.x,b.y-seat.y)||a.y-b.y||a.x-b.x);
    const destination=free.shift();if(!destination)return null;
    d.assignments[destination.id]=d.assignments[seat.id];
  }
  d.assignments=Object.fromEntries(Object.entries(d.assignments).filter(([id])=>kept.has(id)));
  return d;
}

/** 교실 모양을 명시적으로 바꾸어도 학생과 지정 조건은 같은 줄·열의 자리에 유지합니다.
 * @param {import('./types').Draft} draft @param {string} shape @param {number} columns @param {number} studentCount */
export function reshapeLayout(draft,shape,columns,studentCount){
  const grid=numbers(draft.layout.seats),oldColumns=draft.layout.columns||grid.xs.length||6;
  const oldRows=draft.layout.rows||grid.ys.length||1;
  columns=Math.max(2,Math.min(12,Math.round(columns)||6));
  const rows=Math.max(oldRows,Math.ceil(studentCount/columns));
  let next=resizeLayout(draft,'rows',rows-oldRows);if(!next)return null;
  next=resizeLayout(next,'columns',columns-oldColumns);if(!next)return null;
  const template=makeLayout(columns*rows,shape,columns,rows);
  next.layout={...next.layout,shape,seats:template.seats.map((seat,i)=>({...next.layout.seats[i],x:seat.x,y:seat.y,angle:seat.angle,pair:seat.pair,group:seat.group}))};
  return next;
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
  const importantIds=new Set([...Object.keys(current.assignments),...current.rules.flatMap(r=>[r.seatId||'',...(r.seatIds||[])])].filter(Boolean));
  next.layout=clone(saved.layout);
  const required=Math.max(studentCount,importantIds.size),activeCount=next.layout.seats.filter(s=>s.active!==false).length;
  if(activeCount<required){
    const columns=Math.max(next.layout.columns||2,axis(next.layout.seats.map(s=>s.x)).length);
    const rows=Math.max(next.layout.rows||1,axis(next.layout.seats.map(s=>s.y)).length);
    const additional=Math.ceil((required-activeCount)/columns);
    if(columns>12||rows+additional>30)return null;
    // 드문드문 놓인 옛 배치를 배열 순서로 채우면 같은 좌표에 책상이 겹치므로 줄·열 기준 확장을 재사용합니다.
    const holder={...clone(saved),layout:{...next.layout,columns,rows},assignments:{},rules:[]};
    const expanded=resizeLayout(holder,'rows',additional);if(!expanded)return null;
    next.layout=expanded.layout;
  }
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
  if([...importantIds].some(id=>!mapped.has(id)))return null;
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
