import test from 'node:test';
import assert from 'node:assert/strict';
import { menuPlacement, menuMonitor } from './menuPlacement.js';

/** @param {number} x @param {number} y @param {number} width @param {number} height @param {number} scale */
const screen = (x,y,width,height,scale) => ({ bounds:{x,y,width,height}, work:{x,y,width,height:height-40}, scale });
const monitors = [screen(0,0,1920,1080,1),screen(-2560,0,2560,1440,1.5),screen(0,-2160,3840,2160,2),screen(0,1080,1366,768,1.25)];
const size = {width:340,height:640};
/** @param {NonNullable<ReturnType<typeof menuPlacement>>} placement */
function assertInside(placement) {
  const {work} = placement.monitor;
  assert.ok(placement.width > 0 && placement.height > 0);
  assert.ok(placement.x >= work.x && placement.y >= work.y);
  assert.ok(placement.x + placement.width <= work.x + work.width);
  assert.ok(placement.y + placement.height <= work.y + work.height);
}

test('top and bottom displays, negative coordinates and mixed DPI use the cursor display', () => {
  for (const monitor of monitors) {
    const point = {x:monitor.bounds.x+monitor.bounds.width/2,y:monitor.bounds.y+20};
    const result = menuPlacement({point,size,monitors});
    assert.ok(result);
    assert.equal(result.monitor,monitor);
    assertInside(result);
  }
  assert.equal(menuMonitor({x:500,y:-2000},monitors),monitors[2]);
  assert.equal(menuMonitor({x:500,y:1400},monitors),monitors[3]);
});

test('opening at every display corner, taskbar and edge keeps the complete panel inside', () => {
  let cases = 0;
  for (const m of monitors) {
    const xs=[m.bounds.x,m.bounds.x+1,m.bounds.x+m.bounds.width/2,m.bounds.x+m.bounds.width-1];
    const ys=[m.bounds.y,m.bounds.y+1,m.work.y+m.work.height-1,m.bounds.y+m.bounds.height-1];
    for (const x of xs) for (const y of ys) {
      const placement=menuPlacement({point:{x,y},size,monitors,gap:2});
      assert.ok(placement); assert.equal(placement.monitor,m); assertInside(placement); cases++;
    }
  }
  assert.equal(cases,64);
});

test('dragging far past either boundary never clips the header or footer', () => {
  for (const m of monitors) {
    const point={x:m.bounds.x+100,y:m.bounds.y+100};
    for(const dx of [-100000,-2000,0,2000,100000]) for(const dy of [-100000,-2000,0,2000,100000]) {
      const placement=menuPlacement({point,position:{x:point.x+dx,y:point.y+dy},size,monitors});
      assert.ok(placement); assertInside(placement);
    }
  }
});

test('short and narrow work areas reduce size; moving to a roomy display restores it', () => {
  const small=screen(0,0,500,420,2),large=screen(500,0,1920,1080,1);
  const displays=[small,large];
  const reduced=menuPlacement({point:{x:200,y:40},size,monitors:displays});
  assert.ok(reduced);assertInside(reduced);
  assert.ok(reduced.width < size.width*small.scale);
  assert.ok(reduced.height < size.height*small.scale);
  const restored=menuPlacement({point:{x:700,y:40},size,monitors:displays});
  assert.ok(restored);assertInside(restored);
  assert.equal(restored.width,size.width);assert.equal(restored.height,size.height);
});

test('bottom anchors flip above when there is room; missing monitors are harmless', () => {
  const m=screen(0,0,1920,1080,1);
  const placement=menuPlacement({point:{x:700,y:1000},top:980,size,monitors:[m],gap:6});
  assert.ok(placement);assertInside(placement);assert.equal(placement.y,334);
  assert.equal(menuPlacement({point:{x:0,y:0},size,monitors:[]}),null);
});

test('unavailable display coordinates choose the nearest remaining screen', () => {
  const remaining=screen(0,0,1920,1080,1);
  const placement=menuPlacement({point:{x:500,y:-2000},position:{x:400,y:-2000},size,monitors:[remaining]});
  assert.ok(placement);assertInside(placement);assert.equal(placement.monitor,remaining);
});
