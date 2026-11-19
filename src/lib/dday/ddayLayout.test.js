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
  const std = classifyControlLayout({ width: 380, height: 580, itemCount: 3, archiveCount: 2 });
  assert.equal(std.tier, 'standard');
  assert.equal(std.compactWidth, false);
  assert.equal(std.wideEdit, false);
  assert.equal(std.listGrid2Col, false);

  // 진입 임계치(360px 미만) 전에는 standard 유지, 미만에서 compact 진입
  const at362 = classifyControlLayout({ width: 362, height: 580, prev: std });
  assert.equal(at362.compactWidth, false);
  const comp = classifyControlLayout({ width: 340, height: 580, prev: at362 });
  assert.equal(comp.compactWidth, true);
  assert.equal(comp.tier, 'compact');
  // 366px(데드밴드 360..372 구간)로 커져도 즉시 풀리지 않고 compact 유지
  const stillComp = classifyControlLayout({ width: 366, height: 580, prev: comp });
  assert.equal(stillComp.compactWidth, true);
  // 372px 이상에서 이탈
  const backStd = classifyControlLayout({ width: 374, height: 580, prev: stillComp });
  assert.equal(backStd.compactWidth, false);

  // 560px 와이드 프리셋에서 wideEdit·wideSettings 모두 켜짐
  const wide = classifyControlLayout({ width: 560, height: 660, itemCount: 3, prev: backStd });
  assert.equal(wide.tier, 'wide');
  assert.equal(wide.wideEdit, true);
  assert.equal(wide.wideSettings, true);
  // 데드밴드(528px)에서는 유지, 520px 미만에서는 해제
  assert.equal(classifyControlLayout({ width: 528, height: 660, prev: wide }).wideEdit, true);
  assert.equal(classifyControlLayout({ width: 518, height: 660, prev: wide }).wideEdit, false);
});

test('listGrid2Col and archiveGrid2Col stay single-column across full width harness (340..580)', () => {
  const minW = classifyControlLayout({ width: 340, height: 460, itemCount: 8, archiveCount: 5 });
  assert.equal(minW.listGrid2Col, false);
  assert.equal(minW.archiveGrid2Col, false);
  assert.equal(minW.veryNarrow, false);

  const maxW = classifyControlLayout({ width: 580, height: 860, itemCount: 8, archiveCount: 5 });
  assert.equal(maxW.tier, 'wide');
  assert.equal(maxW.listGrid2Col, false);
  assert.equal(maxW.archiveGrid2Col, false);
  assert.equal(maxW.wideEdit, true);
  assert.equal(maxW.wideSettings, true);
});

test('computeControlMetrics clamps CalendarPanel 15.4em cleanly even at 340px + 15pt', () => {
  const minHeavy = computeControlMetrics({
    width: 340,
    height: 460,
    uiFontSize: 15,
    wideEdit: false,
  });
  // CalendarPanel width is 15.4em -> must stay strictly inside shell width
  assert.ok(minHeavy.calFs * 15.4 < 310, `cal width too wide: ${minHeavy.calFs * 15.4}`);
  assert.ok(minHeavy.scale >= 0.88 && minHeavy.scale <= 1.15);

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
