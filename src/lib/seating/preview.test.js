import test from 'node:test';
import assert from 'node:assert/strict';
import {newDocument, makeLayout, importSeatLayout} from './model.js';
import {previewAction,reconcilePreview} from './preview.js';

test('automatic current record keeps one latest result per day across sessions',()=>{
  const students=[{id:'a',number:1,name:'가',gender:'male',groupId:null},{id:'b',number:2,name:'나',gender:'female',groupId:null}],doc=newDocument(2);
  doc.draft.assignments={[doc.draft.layout.seats[0].id]:'a',[doc.draft.layout.seats[1].id]:'b'};
  const snapshot={revision:0,defaultClassId:'c',classes:[{id:'c',name:'학급',revision:0,students,groups:[]}],seating:{c:doc}};
  /** @param {any} action */
  const command=action=>({classId:'c',expectedClassRevision:0,expectedDocumentRevision:doc.revision,action});
  previewAction(snapshot,command({type:'saveCurrent',date:'2026-09-25',sessionId:'session-1'}));
  assert.equal(doc.archives.length,1);const id=doc.currentId;
  assert.equal(doc.archives[0].title,'9월 25일 저장');
  previewAction(snapshot,command({type:'renameArchive',id,title:' 1학기 마지막 자리 '}));
  assert.equal(doc.archives[0].title,'1학기 마지막 자리');
  assert.equal(doc.archives[0].draft.title,'1학기 마지막 자리');
  assert.equal(doc.draft.title,'1학기 마지막 자리');
  const first=doc.draft.layout.seats[0].id,second=doc.draft.layout.seats[1].id;doc.draft.assignments={[first]:'b',[second]:'a'};
  previewAction(snapshot,command({type:'saveCurrent',date:'2026-09-25',sessionId:'session-1'}));
  assert.equal(doc.archives.length,1);assert.equal(doc.currentId,id);assert.equal(doc.archives[0].draft.assignments[first],'b');
  assert.equal(doc.archives[0].title,'1학기 마지막 자리');
  previewAction(snapshot,command({type:'saveCurrent',date:'2026-09-25',sessionId:'session-2'}));
  assert.equal(doc.archives.length,1);assert.equal(doc.currentId,id);
  previewAction(snapshot,command({type:'saveCurrent',date:'2026-09-26',sessionId:'session-2'}));
  assert.equal(doc.archives.length,2);
  assert.notEqual(doc.currentId,id);
  assert.equal(doc.archives.at(-1).title,'9월 26일 저장');
  doc.archives.push({...doc.archives[0],id:'legacy-duplicate',createdAt:doc.archives[0].createdAt-1});
  reconcilePreview(snapshot);
  assert.equal(doc.archives.length,2);
  previewAction(snapshot,command({type:'deleteArchive',id}));
  assert.equal(doc.archives.length,1);
});

test('importing desks keeps current students near their previous positions',()=>{
  const current=newDocument(6).draft,saved=newDocument(6).draft;
  const people=['a','b','c','d','e','f'];
  current.assignments=Object.fromEntries(current.layout.seats.map((seat,i)=>[seat.id,people[i]]));
  saved.layout=makeLayout(6,'pairs',3);
  const imported=importSeatLayout(current,saved,6);
  assert.equal(imported.layout.columns,3);
  assert.equal(imported.layout.seats.length,6);
  assert.deepEqual(new Set(Object.values(imported.assignments)),new Set(people));
  assert.deepEqual(current.assignments,Object.fromEntries(current.layout.seats.map((seat,i)=>[seat.id,people[i]])));
});
