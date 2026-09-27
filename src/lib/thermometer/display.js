/** 열람판 설정은 온도 기록과 별도 revision으로 저장합니다. @param {any} raw */
export function normalizeDisplay(raw) {
  /** @param {string} key @param {boolean} fallback @returns {boolean} */
  const bool = (key, fallback) => typeof raw?.[key] === 'boolean' ? raw[key] : fallback;
  const g = raw?.geometry;
  return {
    autoOpen: bool('autoOpen', false),
    windowsStart: typeof raw?.windowsStart === 'boolean' ? raw.windowsStart : null,
    alwaysOnTop: bool('alwaysOnTop', true),
    rememberPosition: bool('rememberPosition', true),
    showToday: bool('showToday', true),
    showUpcoming: bool('showUpcoming', true),
    setKey: typeof raw?.setKey === 'string' ? raw.setKey : '',
    hiddenIds: /** @type {string[]} */ (Array.isArray(raw?.hiddenIds) ? raw.hiddenIds.filter((/** @type {unknown} */ x) => typeof x === 'string').slice(0, 100) : []),
    geometry: g && [g.x, g.y, g.width, g.height].every(Number.isFinite) && g.width >= 280 && g.height >= 220
      ? { x: g.x, y: g.y, width: Math.min(g.width, 4000), height: Math.min(g.height, 3000) } : null,
  };
}

/** 미니 온도계 창이 실제로 보여 주는 반 — ThermometerDisplay.svelte와 같은 규칙이어야 토글 상태가 화면과 맞습니다.
 * @param {ReturnType<typeof normalizeDisplay>} prefs @param {{ sets: Record<string, unknown>, lastSetKey: string }} data */
export function displaySetKey(prefs, data) {
  return data.sets[prefs.setKey] ? prefs.setKey : data.lastSetKey;
}

/** "미니 온도계" 토글이 켜져 있는가 — 창이 떠 있고, 같은 반을 보여 주고, 이 온도계를 숨기지 않았을 때만 켜짐입니다.
 * 왜 창이 떠 있는지까지 보는가: 미니 창의 ✕는 자동 열기를 유지한 채 창만 닫으므로, 설정만 보면 창이 없는데도 켜짐으로 보입니다.
 * @param {ReturnType<typeof normalizeDisplay>} prefs @param {{ sets: Record<string, unknown>, lastSetKey: string }} data
 * @param {{ open: boolean, setKey: string, id: string }} target */
export function isInMini(prefs, data, { open, setKey, id }) {
  return open && displaySetKey(prefs, data) === setKey && !prefs.hiddenIds.includes(id);
}

/** 토글을 켤 때의 미니 설정. 미니 창이 이 반을 보여 주고 있지 않았다면(꺼져 있었거나 다른 반) 누른 온도계 하나만 띄웁니다.
 * 왜: 그때는 이 반의 다른 온도계 토글이 모두 "꺼짐"으로 보였으니, 누르지 않은 것까지 함께 뜨면 토글과 화면이 어긋납니다.
 * 다른 반의 숨김 목록은 건드리지 않습니다(미니 창 설정에서 반을 바꿔 볼 때 그대로 쓰임).
 * @param {ReturnType<typeof normalizeDisplay>} d @param {{ setKey: string, id: string, ids: string[], showingThisSet: boolean }} o */
export function showInMini(d, { setKey, id, ids, showingThisSet }) {
  const hiddenIds = showingThisSet
    ? d.hiddenIds.filter(x => x !== id)
    : [...d.hiddenIds.filter(x => !ids.includes(x)), ...ids.filter(x => x !== id)];
  return { ...d, setKey, autoOpen: true, hiddenIds };
}

/** 토글을 끌 때의 미니 설정. 끄고 나서 이 반에 보일 온도계가 하나도 없으면 창을 닫고 다음 실행 자동 열기도 끕니다.
 * @param {ReturnType<typeof normalizeDisplay>} d @param {{ id: string, ids: string[] }} o */
export function hideInMini(d, { id, ids }) {
  const hiddenIds = d.hiddenIds.includes(id) ? d.hiddenIds : [...d.hiddenIds, id];
  const empty = ids.every(x => hiddenIds.includes(x));
  return { next: { ...d, hiddenIds, autoOpen: empty ? false : d.autoOpen }, close: empty };
}

/** 칭찬 보상은 한 번 달성하면 온도를 내려도 달성 이력을 유지합니다. @param {import('./model.js').Thermometer} t */
export function goalCards(t) {
  const stages = [...t.stages].filter(s => s.at < t.max).sort((a, b) => a.at - b.at);
  const items = [...stages, { id: 'final-goal', at: t.max, label: t.topText || (t.mood === 'positive' ? '최종 목표' : '한계'), reached: t.goalReached }];
  const achieved = items.filter(s => t.value >= s.at || (t.mood === 'positive' && s.reached));
  const pending = items.filter(s => !achieved.includes(s));
  return { achieved, current: pending[0] ?? null, upcoming: pending.slice(1) };
}

/** 온도계 창의 목표 패널 한 장 = [지금 목표] → [다음 목표] → [이미 달성한 목표(기본 접힘)].
 * - 끝까지 가서 지금 목표가 없으면, 최종 목표를 "달성" 상태로 맨 위 자리에 둡니다(빈 칸 대신 축하).
 * - 다음 목표에서 최종 목표는 뺍니다 — 위쪽 띠가 이미 보여 줍니다.
 * - 달성한 목표는 최근(높은) 것부터. 맨 위 자리에 올린 최종 목표는 목록에 다시 넣지 않습니다.
 * @param {import('./model.js').Thermometer} t */
export function goalPanel(t) {
  const { achieved, current, upcoming } = goalCards(t);
  const done = [...achieved].reverse();
  const focus = current ?? done[0] ?? null;
  return {
    focus,
    finished: !current,
    remain: current ? Math.max(0, current.at - t.value) : 0,
    progress: current ? Math.max(0, Math.min(1, t.value / current.at)) : 1,
    next: upcoming.filter(s => s.id !== 'final-goal'),
    done: current ? done : done.slice(1),
  };
}

/** 다음 목표는 가까운 것 몇 개만 먼저 보여 줍니다. 단계가 10개까지라 모두 펴면 올리기·내리기 버튼이 창 밖으로 밀립니다. */
export const NEXT_GOALS_SHOWN = 2;
