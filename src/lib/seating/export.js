import { bounds, viewPoint, numbers, guideEdges, compactSeats } from './geometry.js';
import { artFor } from './art.js';
import floorUrl from '../../assets/seating/classroom-floor.svg';
/** @param {string} src @returns {Promise<HTMLImageElement|null>} */
const picture=src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>resolve(null);i.src=src;});
/** @param {import("./types").Board} board @param {{teacher?:boolean,width?:number,simple?:boolean,numbersOnly?:boolean,font?:string}} options @returns {Promise<Blob>} */
// 크기 고르기는 없앴습니다. 인쇄해도 선명하고 파일이 무겁지 않은 가로 2,560픽셀 하나로 저장합니다.
export async function renderPng(board,{teacher=false,width=2560,simple=false,numbersOnly=false,font='메이플스토리 L'}={}) {
  await document.fonts.ready;
  board={...board,seats:compactSeats(board.seats),props:[]};
  const b=bounds(board.seats), ratio=(b.height+2)/(b.width+1),height=Math.round(width*ratio);
  if(height>16384||width*height>48000000)throw Error('교실이 너무 길어요. 교실 모양을 조정해 주세요.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');
  if(!c)throw Error('이미지를 만들 수 없어요.');
  const u=width/(b.width+1);c.fillStyle='#f3ecdf';c.fillRect(0,0,width,height);const floor=await picture(floorUrl);if(floor){const pattern=c.createPattern(floor,'repeat');if(pattern){pattern.setTransform(new DOMMatrix().scale(u/100));c.fillStyle=pattern;c.fillRect(0,0,width,height);}}c.textAlign='center';c.fillStyle='#283f39';
  c.font=`${u*.28}px "${font}", "Malgun Gothic", sans-serif`;c.fillText(`${board.className} · ${board.title}`,width/2,u*.45);
  c.font=`${u*.15}px "${font}", "Malgun Gothic", sans-serif`;c.fillText(`${board.date||''}   ${teacher?'교사 기준':'학생 기준'}`,width/2,u*.75);
  const y0=u*1.2;const frontY=teacher?height-u*.37:y0;
  c.fillStyle='#365d50';c.fillRect(width*.34,frontY,width*.32,u*.3);c.fillStyle='#ffffff';c.fillText('칠판',width/2,frontY+u*.21);
  const viewed=board.seats.map(s=>({...s,...viewPoint(s,b,teacher)})),axes=numbers(viewed);
  const gx=guideEdges(axes.xs,1),gy=guideEdges(axes.ys,1.25);
  if(gx.length&&gy.length){c.save();c.strokeStyle='#dfe5db';c.lineWidth=Math.max(1,u*.008);c.beginPath();
    for(const x of gx){c.moveTo((x+.5)*u,y0+(gy[0]+.6)*u);c.lineTo((x+.5)*u,y0+(gy[gy.length-1]+.6)*u);}
    for(const y of gy){c.moveTo((gx[0]+.5)*u,y0+(y+.6)*u);c.lineTo((gx[gx.length-1]+.5)*u,y0+(y+.6)*u);}c.stroke();c.restore();}
  c.fillStyle='#64746b';axes.xs.forEach((x,i)=>c.fillText(String(i+1),(x+1)*u,y0+((gy[0]??0)+.42)*u));axes.ys.forEach((y,i)=>c.fillText(String(i+1),((gx[0]??0)+.25)*u,y0+(y+1.225)*u));
  const images=new Map(await Promise.all([...new Set(board.seats.filter(s=>s.name).map(s=>artFor(s.appearance)))].map(async src=>/** @type {[string,HTMLImageElement|null]} */([src,await picture(src)]))));
  for(const s of viewed){const x=(s.x+.5)*u,y=y0+(s.y+.6)*u;c.save();c.translate(x+u*.5,y+u*.625);c.rotate(((s.angle||0)+(teacher?180:0))*Math.PI/180);const img=images.get(artFor(s.appearance));if(img&&s.name&&!simple)c.drawImage(img,-u*.5,-u*.625,u,u*1.25);else{c.fillStyle=s.active?'#ecd9b9':'#e8e8e4';c.beginPath();c.roundRect(-u*.44,-u*.48,u*.88,u*.78,u*.07);c.fill();}c.restore();
    c.fillStyle='#fffef9';c.beginPath();c.roundRect(x+u*.05,y+u*.14,u*.9,u*.33,u*.05);c.fill();c.fillStyle=s.gender==='male'?'#245d86':s.gender==='female'?'#745295':'#263e37';c.font=`bold ${u*.18}px "${font}", "Malgun Gothic",sans-serif`;const label=s.name?(numbersOnly?`${s.number}번`:s.name):s.active?'빈자리':'비워 두기';c.fillText(label,x+u*.5,y+u*.36,u*.85);
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG를 만들지 못했어요.')),'image/png'));
}
/** @param {import("./types").Board} board @param {{teacher?:boolean,width?:number,simple?:boolean,numbersOnly?:boolean,font?:string}} options */
export async function downloadPng(board,options={}) {
  const blob=await renderPng(board,options),name=`${board.className}-${board.title}-${options.teacher?'교사 기준':'학생 기준'}.png`.replace(/[<>:"/\\|?*]/g,'-');
  const {isTauri}=await import('@tauri-apps/api/core');
  if(isTauri()){const {save}=await import('@tauri-apps/plugin-dialog');const path=await save({defaultPath:name,filters:[{name:'PNG 이미지',extensions:['png']}]});if(!path)return false;const {writeFile}=await import('@tauri-apps/plugin-fs');await writeFile(path,new Uint8Array(await blob.arrayBuffer()));}
  else {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return true;
}
