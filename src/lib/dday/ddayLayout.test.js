import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyControlLayout,
  computeControlMetrics,
  computeWidgetLayout,
  controlMetricsToStyle,
  visualUnits,
} from './ddayLayout.js';

test('classifyControlLayout applies hysteresis deadbands without boundary flicker', () => {
  const std = classifyControlLayout({ width: 372, height: 572, itemCount: 3, archiveCount: 2 });
  assert.equal(std.tier, 'standard');
  assert.equal(std.compactWidth, false);
  assert.equal(std.wideEdit, false);
  assert.equal(std.listGrid2Col, false);

  // 진입 임계치(336px 미만) 전에는 standard 유지, 미만에서 compact 진입
  const at340 = classifyControlLayout({ width: 340, height: 572, prev: std });
  assert.equal(at340.compactWidth, false);
  const comp = classifyControlLayout({ width: 332, height: 572, prev: at340 });
  assert.equal(comp.compactWidth, true);
  // 345px(데드밴드 336..352 구간)로 커져도 즉시 풀리지 않고 compact 유지
  const stillComp = classifyControlLayout({ width: 345, height: 572, prev: comp });
  assert.equal(stillComp.compactWidth, true);
  // 352px 이상에서 이탈
  const backStd = classifyControlLayout({ width: 355, height: 572, prev: stillComp });
  assert.equal(backStd.compactWidth, false);

  // 560px 와이드 프리셋(shell 552px)에서 wideEdit·wideSettings 모두 켜짐
  const wide = classifyControlLayout({ width: 552, height: 632, itemCount: 3, prev: backStd });
  assert.equal(wide.wideEdit, true);
  assert.equal(wide.wideSettings, true);
  // 데드밴드(536px)에서는 유지, 520px에서는 해제
  assert.equal(classifyControlLayout({ width: 536, height: 632, prev: wide }).wideEdit, true);
  assert.equal(classifyControlLayout({ width: 520, height: 632, prev: wide }).wideEdit, false);
});

test('listGrid2Col stays single-column when only 0 or 1 active item exists', () => {
  const single = classifyControlLayout({ width: 760, height: 700, itemCount: 1, archiveCount: 1 });
  assert.equal(single.tier, 'xwide');
  assert.equal(single.listGrid2Col, false);
  assert.equal(single.archiveGrid2Col, false);

  const multi = classifyControlLayout({ width: 760, height: 700, itemCount: 2, archiveCount: 2 });
  assert.equal(multi.listGrid2Col, true);
  assert.equal(multi.archiveGrid2Col, true);
});

test('computeControlMetrics clamps CalendarPanel 15.4em cleanly even at 292px + 14pt', () => {
  const narrowHeavy = computeControlMetrics({
    width: 292,
    height: 392,
    uiFontSize: 14,
    wideEdit: false,
  });
  // CalendarPanel width is 15.4em -> must stay strictly inside shell width
  assert.ok(narrowHeavy.calFs * 15.4 < 260, `cal width too wide: ${narrowHeavy.calFs * 15.4}`);
  assert.ok(narrowHeavy.scale >= 0.88 && narrowHeavy.scale <= 1.05);

  const flatWide = computeControlMetrics({
    width: 720,
    height: 392,
    uiFontSize: 10,
    wideEdit: true,
  });
  const tallWide = computeControlMetrics({
    width: 720,
    height: 760,
    uiFontSize: 10,
    wideEdit: true,
  });
  // 낮고 넓은 창에서는 높이 상한 때문에 글자 배율이 억제되어야 함
  assert.ok(flatWide.scale < tallWide.scale);

  const style = controlMetricsToStyle(tallWide);
  assert.ok(style.includes('--dd-fs-title:') && style.includes('--dd-cal-fs:'));
});

test('computeWidgetLayout scales down long counters (+1234일, D-1000) and stabilizes tiers', () => {
  const shortLabel = computeWidgetLayout({ width: 224, height: 244, label: 'D-5' });
  const longLabel = computeWidgetLayout({ width: 162, height: 167, label: '+1234일' });
  assert.equal(shortLabel.tier, 'standard');
  assert.equal(shortLabel.numScale, 1);
  assert.equal(longLabel.tier, 'micro');
  assert.ok(longLabel.numScale < 0.8);
  assert.ok(longLabel.ctrlBtnSize >= 24);

  assert.ok(visualUnits('D-5') < visualUnits('+1234일'));

  const stayMicro = computeWidgetLayout({ width: 198, height: 205, label: 'D-5', prevTier: 'micro' });
  assert.equal(stayMicro.tier, 'micro');
  const exitMicro = computeWidgetLayout({ width: 210, height: 216, label: 'D-5', prevTier: 'micro' });
  assert.equal(exitMicro.tier, 'standard');
});
