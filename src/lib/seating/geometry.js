export const SEAT_W=1, SEAT_H=1.25;
/** @param {import("./types").Point[]} seats @param {import("./types").Point[]} props */
export function bounds(seats, props=[]) {
  return {width:Math.max(7,...seats.map(s=>s.x+1.5),...props.map(s=>s.x+1.5)),height:Math.max(5,...seats.map(s=>s.y+1.8),...props.map(s=>s.y+1.5))};
}
/** @param {import("./types").Point} s @param {{width:number,height:number}} size @param {boolean} teacher */
export function viewPoint(s, size, teacher=false) { return teacher?{x:size.width-s.x-SEAT_W,y:size.height-s.y-SEAT_H}:{x:s.x,y:s.y}; }
/** @param {number[]} values */
export function axis(values) {
  /** @type {number[]} */ const anchors=[];
  for(const value of [...values].sort((a,b)=>a-b)) if(!anchors.some(a=>Math.abs(a-value)<=.12)) anchors.push(value);
  return anchors;
}
/** @param {import("./types").Point[]} seats */
export function numbers(seats) {
  const xs=axis(seats.map(s=>s.x)),ys=axis(seats.map(s=>s.y));
  return {xs,ys,at:/** @param {import("./types").Point} s */ s=>({x:xs.findIndex(x=>Math.abs(x-s.x)<=.12)+1,y:ys.findIndex(y=>Math.abs(y-s.y)<=.12)+1})};
}
/** Boundaries between desk centers. @param {number[]} anchors @param {number} extent */
export function guideEdges(anchors,extent) {
  if(!anchors.length)return [];
  return [anchors[0]-.12,...anchors.slice(1).map((value,i)=>(anchors[i]+value+extent)/2),anchors[anchors.length-1]+extent+.12];
}
/** @param {import("./types").Point} a @param {import("./types").Point} b */
export function nearby(a,b) { return Math.abs(a.x-b.x)<=1.65&&Math.abs(a.y-b.y)<=1.85; }
/** @param {import("./types").Point} a @param {import("./types").Point} b */
export function intersects(a,b) { return Math.abs(a.x-b.x)<.94&&Math.abs(a.y-b.y)<1.16; }
/** @param {import("./types").Point} point @param {import("./types").Point[]} seats @param {boolean} enabled */
export function snapPoint(point,seats,enabled=true) {
  let x=Math.max(.1,Math.min(80,point.x)),y=Math.max(.6,Math.min(100,point.y));
  if(enabled) { x=Math.round(x*10)/10;y=Math.round(y*10)/10; for(const s of seats){if(Math.abs(s.x-x)<.18)x=s.x;if(Math.abs(s.y-y)<.18)y=s.y;} }
  return {x,y};
}
/** @param {import("./types").Point} s @param {import("./types").Layout} layout */
export function positionZone(s,layout) { const b=bounds(layout.seats);return `${Math.min(2,Math.floor(s.x/b.width*3))}:${Math.min(2,Math.floor(s.y/b.height*3))}`; }

/** Align small placement drift without merging occupied cells.
 * @template {import('./types').Point} T @param {T[]} seats @returns {T[]} */
export function alignSeats(seats) {
  const clusters = axisClusters;
  const xs=clusters(seats.map(s=>s.x)),ys=clusters(seats.map(s=>s.y));
  const nearest=(/** @type {number} */ v,/** @type {number[]} */ values)=>values.reduce((a,b)=>Math.abs(v-a)<Math.abs(v-b)?a:b,v+1000);
  const aligned=seats.map(s=>({...s,x:nearest(s.x,xs),y:nearest(s.y,ys)}));
  return aligned.some((a,i)=>aligned.some((b,j)=>i!==j&&a.x===b.x&&a.y===b.y))?seats.map(s=>({...s})):aligned;
}
/** @param {number[]} values */
function axisClusters(values) {
  /** @type {number[][]} */ const groups=[];
  for(const v of [...values].sort((a,b)=>a-b)){const last=groups.at(-1);if(last&&v-last[0]<=.6)last.push(v);else groups.push([v]);}
  return groups.map(g=>g[Math.floor((g.length-1)/2)]);
}
/** A compact, aligned display preserves seat identities and relative order.
 * @template {import('./types').Point} T @param {T[]} seats @returns {T[]} */
export function compactSeats(seats) {
  const aligned=alignSeats(seats),xs=axis(aligned.map(s=>s.x)),ys=axis(aligned.map(s=>s.y));
  return aligned.map(s=>({...s,x:.55+xs.findIndex(x=>Math.abs(x-s.x)<=.12)*1.2,y:.55+ys.findIndex(y=>Math.abs(y-s.y)<=.12)*1.38}));
}
