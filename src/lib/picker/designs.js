export const TOYS = [
  { id:'rabbit',label:'토끼',grip:.48,swing:7 }, {id:'bear',label:'곰',grip:.48,swing:4},
  {id:'cat',label:'고양이',grip:.5,swing:5}, {id:'dog',label:'강아지',grip:.48,swing:6},
  {id:'penguin',label:'펭귄',grip:.48,swing:4}, {id:'chick',label:'병아리',grip:.5,swing:6},
].map(t=>({...t,src:`/images/toolkit/picker/${t.id}.png`}));
export const BALLOONS = [
  {id:'round',label:'둥근 풍선',path:'M0 -48 C-64 -48 -61 23 0 48 C61 23 64 -48 0 -48Z'},
  {id:'long',label:'긴 풍선',path:'M0 -60 C-46 -60 -48 35 0 55 C48 35 46 -60 0 -60Z'},
  {id:'star',label:'별 풍선',path:'M0 -56 Q5 -58 19 -20 L55 -17 Q61 -15 34 13 L36 49 Q34 55 0 33 L-36 51 Q-41 52 -33 13 L-58 -14 Q-61 -20 -19 -20Z'},
  {id:'heart',label:'하트 풍선',path:'M0 49 C-85 -2 -47 -77 0 -35 C47 -77 85 -2 0 49Z'},
  {id:'flower',label:'꽃 풍선',path:'M0 -34 C-24 -75 -61 -40 -34 -15 C-78 -14 -59 39 -24 25 C-28 70 28 70 24 25 C59 39 78 -14 34 -15 C61 -40 24 -75 0 -34Z'},
  {id:'bear',label:'곰 풍선',path:'M-30 -30 C-64 -35 -58 -70 -31 -57 Q-20 -51 -22 -41 Q0 -48 22 -41 C18 -68 57 -74 59 -49 Q59 -31 30 -30 C67 10 37 52 0 49 C-37 52 -67 10 -30 -30Z'},
];
export const PALETTES = [{id:'sage',label:'세이지',bg:'#eef4ee',accent:'#337969'}, {id:'butter',label:'버터',bg:'#faf4e5',accent:'#946d36'}, {id:'sky',label:'스카이',bg:'#edf4f8',accent:'#487d9b'}];
export const COLORS = ['#a7cdb4','#e7ad96','#e8cd7c','#9cbed7','#bcaad6','#92c8bb'];
export const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(1,n));
const ease = (/** @type {number} */ n) => {n=clamp(n);return n*n*(3-2*n);};
const mix = (/** @type {number} */ a,/** @type {number} */ b,/** @type {number} */ n) => a+(b-a)*ease(n);
/** Ground grip positions, separate foreground targets from back-row decoration. */
export const toySlots = [145,265,385,505].map(x=>({x,y:270}));
/** Up to 30 visible objects, one per eligible candidate. Larger lists retain every candidate in the engine. */
export function sceneLayout(/** @type {number} */ count, /** @type {string} */ kind) {
  const n=Math.max(0,Math.min(30,count));
  const cols=n<=4?Math.max(1,n):n<=8?4:n<=15?5:n<=24?7:8;
  const rows=Math.max(1,Math.ceil(n/cols));
  const width=kind==='claw'?510:670,height=kind==='claw'?210:270;
  const cellW=width/cols,cellH=height/rows;
  const size=Math.min(kind==='claw'?125:112,cellW*.92,cellH*(kind==='claw'?1.08:.91));
  const slots=Array.from({length:n},(_,i)=>{const row=Math.floor(i/cols),inRow=Math.min(cols,n-row*cols);return {x:(kind==='claw'?100:65)+(width-inRow*cellW)/2+(i%cols+.5)*cellW,y:kind==='claw'?320-height+(row+.5)*cellH:65+(row+.5)*cellH};});
  return {count:n,cols,rows,size,slots};
}
/** @param {number} ms @param {number} target @param {{x:number,y:number}[]} [slots] */
export function clawPose(ms,target,slots=toySlots) {
  const {x:tx,y:gy}=slots[target%slots.length]??{x:330,y:270};
  const x=ms<800?mix(330,tx,ms/800):ms<3000?tx:mix(tx,650,(ms-3000)/650);
  const y=ms<800?95:ms<1600?mix(95,gy,(ms-800)/800):ms<2100?gy:ms<3000?mix(gy,95,(ms-2100)/900):ms<3650?95:mix(95,250,(ms-3650)/400);
  const close=ms<1600?0:ms<2100?ease((ms-1600)/500):ms<4050?1:1-ease((ms-4050)/250);
  return {x,y,close,held:ms>=1900&&ms<4050,released:ms>=4050};
}
/** @param {number} i @param {number} time @param {number} seed @param {boolean} reduced */
export function balloonPosition(i,time,seed,reduced=false,count=8) {
  const layout=sceneLayout(count,'balloon'),base=layout.slots[i]??{x:400,y:200},phase=(i+seed)*1.37;
  const amplitude=count>15?4:count>8?8:13;
  return {x:base.x+(reduced?0:Math.sin(time/1700+phase)*amplitude),y:base.y+(reduced?0:Math.cos(time/2000+phase)*amplitude)};
}
/** Quadratic flight ends inside the actual silhouette, not its rectangular bounds. */
export function dartPose(/** @type {number} */ ms,/** @type {{x:number,y:number}} */ end) {
  const t=ease((ms-900)/800),sx=720,sy=350,cx=520,cy=35;
  const x=(1-t)**2*sx+2*(1-t)*t*cx+t*t*end.x,y=(1-t)**2*sy+2*(1-t)*t*cy+t*t*end.y;
  const dx=2*(1-t)*(cx-sx)+2*t*(end.x-cx),dy=2*(1-t)*(cy-sy)+2*t*(end.y-cy);
  return {x,y,angle:Math.atan2(dy,dx)*180/Math.PI};
}
/** Visual suspense is sampled separately from the committed winner. */
export function createSuspense(/** @type {number[]} */ available, /** @type {number} */ target, /** @type {()=>number} */ random = Math.random) {
  const alternatives=available.filter(i=>i!==target);
  const count=3+Math.floor(random()*3);
  let previous=-1;
  const visits=Array.from({length:count},(_,i)=>{
    const options=alternatives.length>1?alternatives.filter(slot=>slot!==previous):alternatives;
    const slot=options.length?options[Math.floor(random()*options.length)]:target;
    previous=slot;
    return {slot,pause:.16+random()*.28,dip:i%2===0?14+random()*28:0};
  });
  return {duration:1900+Math.floor(random()*1300),visits};
}
/** @param {ReturnType<typeof createSuspense>} plan @param {number} ms @param {{x:number,y:number}[]} slots @param {'claw'|'balloon'} kind @param {{x:number,y:number}} end */
export function suspensePose(plan,ms,slots,kind,end) {
  const start=kind==='claw'?{x:330,y:95}:{x:400,y:180};
  const points=[start,...plan.visits.map(v=>{const p=slots[v.slot]??start;return {x:p.x,y:kind==='claw'?95+v.dip:p.y};}),end];
  const position=clamp(ms/Math.max(1,plan.duration))*(points.length-1);
  const index=Math.min(points.length-2,Math.floor(position));
  const pause=plan.visits[Math.min(index,plan.visits.length-1)]?.pause??.2;
  const progress=clamp((position-index)/(1-pause));
  return {x:mix(points[index].x,points[index+1].x,progress),y:mix(points[index].y,points[index+1].y,progress)};
}
