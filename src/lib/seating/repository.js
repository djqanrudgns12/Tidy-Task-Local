import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { readRoster, execute, native, subscribeRoster } from '../classroom/repository.js';
import { publicBoard } from './model.js';
export { readRoster, native, subscribeRoster };
const CONTEXT='tidy-seating-preview-context';
/** @param {string|null} [classId] @param {boolean} [follow] @returns {Promise<{classId:string|null,follow:boolean}>} */
export async function context(classId,follow) {
  if(native)return invoke('seating_context',{classId:classId??null,follow:follow??null});
  if(follow!==undefined){localStorage.setItem(CONTEXT,JSON.stringify({classId,follow}));window.dispatchEvent(new Event('seating-context'));}
  return JSON.parse(localStorage.getItem(CONTEXT)||'{"classId":null,"follow":true}');
}
/** @param {()=>void} fn */
export async function watchContext(fn) {
  if(native)return listen('seating-context-changed',fn);
  const cb=/** @param {StorageEvent|Event} e */ e=>{if(!("key" in e)||e.key===CONTEXT)fn();};window.addEventListener('storage',cb);window.addEventListener('seating-context',cb);return()=>{window.removeEventListener('storage',cb);window.removeEventListener('seating-context',cb);};
}
/** @param {import("./types").Classroom} classroom @param {number} revision @param {any} action @param {string} operationId */
export async function saveAction(classroom,revision,action,operationId=crypto.randomUUID()) {
  // 다른 학급만 바뀐 경우 재시도하되, 같은 교실/명단의 충돌은 덮어쓰지 않습니다.
  for(let attempt=0;attempt<3;attempt++){
    const snapshot=await readRoster();
    try {return (await execute({type:'seating',classId:classroom.id,expectedClassRevision:classroom.revision,expectedDocumentRevision:revision,action},snapshot.revision,operationId)).snapshot;}
    catch(error){if(attempt===2||!/REVISION_CONFLICT|다른 변경이/.test(String(error)))throw error;}
  }
  throw Error('저장을 다시 시도해 주세요.');
}
/** @returns {Promise<import("./types").Board|null>} */
export async function readPublic() {
  if(native)return invoke('seating_public');
  const [s,c]=await Promise.all([readRoster(),context()]);const id=c.follow?s.defaultClassId:c.classId,cl=s.classes.find(cl=>cl.id===id),doc=s.seating?.[id||""];const a=doc?.archives.find(a=>a.id===doc.currentId&&a.used!==false);return a?publicBoard(a.draft,a.students,cl?.name||"",a.date):null;
}
