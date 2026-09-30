import { clone, uid } from './model.js';
import { numbers } from './geometry.js';

/** 지정 학생끼리 자리를 교환하고, 여러 칸짜리 기존 구역에서는 해당 칸만 바꿉니다.
 * @param {import('./types').Draft} draft @param {string} student @param {string} seatId @param {boolean} [toggle] */
export function setPreset(draft,student,seatId,toggle=true){
  if(!draft.layout.seats.some(s=>s.id===seatId&&s.active!==false)||draft.rules.some(r=>r.kind==='fixed'&&(r.students[0]===student||r.seatId===seatId)))return null;
  const next=clone(draft),previous=next.rules.filter(r=>r.kind==='zone'&&r.students[0]===student);
  const oldSeat=previous.length===1&&previous[0].seatIds?.length===1?previous[0].seatIds[0]:'';
  if(oldSeat===seatId){if(!toggle)return next;next.rules=next.rules.filter(r=>r.kind!=='zone'||r.students[0]!==student);return next;}
  next.rules=next.rules.filter(r=>r.kind!=='zone'||r.students[0]!==student).map(r=>{
    if(r.kind!=='zone'||!r.seatIds?.includes(seatId))return r;
    const remaining=r.seatIds.filter(id=>id!==seatId);
    if(!remaining.length&&oldSeat&&!next.rules.some(other=>other.kind==='fixed'&&other.seatId===oldSeat))remaining.push(oldSeat);
    return {...r,seatIds:remaining};
  }).filter(r=>r.kind!=='zone'||r.seatIds?.length);
  next.rules.push({id:previous[0]?.id||uid(),kind:'zone',students:[student],seatIds:[seatId]});
  return next;
}

/** 이전 배치의 배열 순서 대신 자리 ID와 실제 줄·열을 사용합니다.
 * @param {import('./types').Draft} current @param {import('./types').Draft} source @param {string[]} students */
export function loadPresets(current,source,students){
  const next=clone(current),valid=new Set(students),sourceGrid=numbers(source.layout.seats),targetGrid=numbers(next.layout.seats);
  const fixed=next.rules.filter(r=>r.kind==='fixed'),fixedPeople=new Set(fixed.map(r=>r.students[0])),taken=new Set(fixed.map(r=>r.seatId)),seen=new Set();
  next.rules=next.rules.filter(r=>r.kind!=='zone');
  for(const seat of source.layout.seats){
    const student=source.assignments[seat.id],at=sourceGrid.at(seat);
    if(!student||!valid.has(student)||fixedPeople.has(student)||seen.has(student))continue;
    const target=next.layout.seats.find(s=>s.id===seat.id)||next.layout.seats.find(s=>{const pos=targetGrid.at(s);return pos.x===at.x&&pos.y===at.y;});
    if(!target||target.active===false||taken.has(target.id))continue;
    next.rules.push({id:uid(),kind:'zone',students:[student],seatIds:[target.id]});seen.add(student);taken.add(target.id);
  }
  return {draft:next,count:seen.size};
}
