import test from 'node:test';
import assert from 'node:assert/strict';
import { fitToolbarPosition, centerToolbarPosition } from './toolbarPlacement.js';

const monitors = [
  { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, work: { x: 0, y: 0, width: 1920, height: 1040 }, scale: 1 },
  { bounds: { x: -2560, y: 0, width: 2560, height: 1440 }, work: { x: -2560, y: 0, width: 2560, height: 1380 }, scale: 1.5 },
];
test('growing toolbar stays fully visible above the taskbar without jumping monitors', () => {
  assert.deepEqual(fitToolbarPosition({ x: 1500, y: 1000, width: 720, height: 72 }, monitors), { x: 1200, y: 968 });
  assert.deepEqual(fitToolbarPosition({ x: -80, y: 1200, width: 100, height: 750 }, monitors), { x: -100, y: 630 });
});
test('in-bounds toolbar stays put and unavailable monitors do not force movement', () => {
  assert.deepEqual(fitToolbarPosition({ x: 100, y: 200, width: 700, height: 70 }, monitors), { x: 100, y: 200 });
  assert.equal(fitToolbarPosition({ x: 100, y: 200, width: 700, height: 70 }, []), null);
});
test('centering uses the monitor the toolbar is on, including a scaled left monitor', () => {
  assert.deepEqual(centerToolbarPosition({ x: 1700, y: 900, width: 720, height: 72 }, monitors), { x: 600, y: 484 });
  assert.deepEqual(centerToolbarPosition({ x: -2000, y: 100, width: 800, height: 100 }, monitors), { x: -1680, y: 640 });
});
test('centering an oversized toolbar pins its leading edge and tolerates no monitors', () => {
  assert.deepEqual(centerToolbarPosition({ x: 50, y: 50, width: 2400, height: 90 }, monitors), { x: 0, y: 475 });
  assert.equal(centerToolbarPosition({ x: 0, y: 0, width: 10, height: 10 }, []), null);
});
