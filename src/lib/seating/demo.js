export async function createDemo() {
  const {execute,readRoster,native}=await import('../classroom/repository.js');
  if(native||!import.meta.env.DEV)return;
  let s=await readRoster();const existing=s.classes.find(c=>c.name==='체험 · 햇살반');
  if(existing){await execute({type:'setDefault',classId:existing.id},s.revision);return;}
  s=(await execute({type:'createClass',name:'체험 · 햇살반'},s.revision)).snapshot;
  const cl=s.classes.at(-1);if(!cl)throw Error("체험 학급을 만들지 못했어요.");const names=['김하늘','이서준','박다온','최지우','정유나','강도윤','윤서아','장시우','임수아','한주원','오지안','서하준','신예린','권민재','황나은','안건우','송이서','류현우','전소율','홍우진','문채원','양도현','배서윤','백시윤','허아린','남태오','심가온','고지호'];
  s=(await execute({type:'saveStudents',classId:cl.id,students:names.map((name,i)=>({id:null,number:i+1,name,gender:i%7===0?'unspecified':i%2?'male':'female'})),deleteIds:[]},s.revision)).snapshot;
  await execute({type:'setDefault',classId:cl.id},s.revision);
}
