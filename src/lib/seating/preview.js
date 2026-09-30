import { newDocument, clone, reconcile, relations, uid, dailyArchives, defaultArchiveTitle } from './model.js';
import { validAssignments } from './solver.js';
/** @param {import('./types').SeatingDocument} doc */
function compactDocument(doc){
  const current=doc.archives.find(record=>record.id===doc.currentId);
  doc.archives=dailyArchives(doc.archives);
  if(current&&!doc.archives.some(record=>record.id===doc.currentId))doc.currentId=doc.archives.find(record=>record.date===current.date)?.id||null;
}
/** @param {import("./types").Snapshot} snapshot @param {any} command */
export function previewAction(snapshot,command) {
  const c=snapshot.classes.find(c=>c.id===command.classId);if(!c)throw Error('학급이 삭제되었어요.');
  const doc=snapshot.seating?.[c.id]||newDocument(c.students.length);
  if(doc.revision!==command.expectedDocumentRevision)throw Error('DOCUMENT_CONFLICT: 다른 창에서 수정했어요. 최신 내용을 불러와 주세요.');
  if(c.revision!==command.expectedClassRevision)throw Error('CLASS_CONFLICT: 명단이 바뀌었어요.');
  const a=command.action;
  if(a.type==='saveDraft')doc.draft=clone(a.draft);
  if(a.type==='confirm'){
    if(!validAssignments(doc.draft,c.students,true))throw Error('아직 자리가 없는 학생이나 꼭 지킬 조건을 확인해 주세요.');
    const current=doc.archives.find(a=>a.id===doc.currentId);if(current&&JSON.stringify(current.draft)===JSON.stringify(doc.draft)&&current.used!==false)return;
    const existing=dailyArchives(doc.archives).find(record=>record.date===a.date);
    const title=existing?.title||defaultArchiveTitle(a.date);doc.draft.title=title;
    const record={id:existing?.id||uid(),date:a.date,createdAt:Date.now(),title,used:true,draft:clone(doc.draft),students:clone(c.students),relations:relations(doc.draft)};doc.archives=doc.archives.filter(record=>record.date!==a.date);doc.archives.push(record);doc.currentId=record.id;
  }
  if(a.type==='saveCurrent'){
    if(!a.sessionId||String(a.sessionId).length>100||!validAssignments(doc.draft,c.students,true))throw Error('아직 자리가 없는 학생이나 꼭 지킬 조건을 확인해 주세요.');
    const existing=dailyArchives(doc.archives).find(record=>record.date===a.date),id=existing?.id||uid();
    const title=existing?.title||defaultArchiveTitle(a.date);doc.draft.title=title;
    const record={id,sessionId:a.sessionId,date:a.date,createdAt:Date.now(),title,used:true,draft:clone(doc.draft),students:clone(c.students),relations:relations(doc.draft)};
    doc.archives=doc.archives.filter(record=>record.date!==a.date);doc.archives.push(record);doc.currentId=id;
  }
  if(a.type==='deleteArchive'){const date=doc.archives.find(r=>r.id===a.id)?.date;doc.archives=doc.archives.filter(r=>r.id!==a.id&&(!date||r.date!==date));if(!doc.archives.some(r=>r.id===doc.currentId))doc.currentId=null;}
  if(a.type==='renameArchive'){
    const title=typeof a.title==='string'?a.title.trim():'';
    if(!title||[...title].length>100)throw Error('기록 이름은 1~100자로 입력해 주세요.');
    const record=doc.archives.find(r=>r.id===a.id);if(!record)throw Error('수정할 자리 기록을 찾지 못했어요.');
    record.title=title;record.draft.title=title;if(doc.currentId===record.id)doc.draft.title=title;
  }
  if(a.type==='setUsage'){const record=doc.archives.find(r=>r.id===a.id);if(record)record.used=a.used;if(!a.used&&doc.currentId===a.id)doc.currentId=null;}
  compactDocument(doc);
  doc.revision++;snapshot.seating??={};snapshot.seating[c.id]=doc;
}
/** @param {import("./types").Snapshot} snapshot */
export function reconcilePreview(snapshot) {
  for(const [id,doc] of Object.entries(snapshot.seating||{})){
    const c=snapshot.classes.find(c=>c.id===id);if(!c){delete snapshot.seating?.[id];continue;}
    const ids=new Set(c.students.map(p=>p.id));doc.draft=reconcile(doc.draft,c);
    for(const a of doc.archives){a.draft=reconcile(a.draft,c,false);a.students=a.students.filter(p=>ids.has(p.id));a.relations=relations(a.draft);}
    compactDocument(doc);
  }
}
