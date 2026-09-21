/** @typedef {{id:string,name:string}} Entry */
/** @typedef {{id:string,title:string,size:number,phase:string,slots:(Entry|null)[],winners:Record<string,string>,updatedAt:number}} Tournament */
/** @typedef {{id:string,r:number,i:number,teams:(Entry|null)[],ready:boolean,auto:boolean,winner:Entry|null,resolved:boolean}} Match */
export const SIZES = [4, 8, 16, 32, 64];
/** @template T @param {T} value @returns {T} */
export const clone = (value) => structuredClone(value);
/** @returns {Tournament} */
export function createTournament(title = "", size = 8) {
  if (!SIZES.includes(size)) throw new Error("대진 규모를 확인해 주세요.");
  return {
    id: crypto.randomUUID(),
    title: title.trim() || "우리 반 토너먼트",
    size,
    phase: "edit",
    slots: Array(size).fill(null),
    winners: {},
    updatedAt: Date.now(),
  };
}
/** @param {string} text @returns {Entry[]} */
export function parseNames(text) {
  const names = text
    .split(/\r?\n/)
    .map((n) => n.normalize("NFC").trim())
    .filter(Boolean);
  if (
    names.length > 64 ||
    names.some((n) => [...n].length > 40 || /[\u0000-\u001f\u007f]/u.test(n))
  )
    throw new Error("이름은 40자, 참가자는 64명까지 입력할 수 있어요.");
  return names.map((name) => ({ id: crypto.randomUUID(), name }));
}
/** @param {Entry[]} entries @param {number} size @returns {(Entry|null)[]} */
export function placeEntries(entries, size) {
  if (entries.length > size)
    throw new Error(`${size}강에는 ${size}명까지 참가할 수 있어요.`);
  const slots = Array(size).fill(null);
  // Distribute the first entrants across both halves before filling opponents.
  const bits = Math.log2(size) - 1;
  entries.forEach((entry, i) => {
    const match = i % (size / 2);
    let reversed = 0;
    for (let bit = 0; bit < bits; bit++)
      reversed = (reversed << 1) | ((match >> bit) & 1);
    slots[reversed * 2 + (i < size / 2 ? 0 : 1)] = clone(entry);
  });
  return slots;
}
/** @param {(Entry|null)[]} slots @param {()=>number} [random] */
export function shuffleSlots(slots, random = Math.random) {
  const entries = slots.filter((e) => e !== null).map(clone);
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  return placeEntries(entries, slots.length);
}
/** @param {Tournament} t @returns {Match[][]} */
export function rounds(t) {
  /** @type {Match[][]} */ const result = [];
  for (let r = 0; r < Math.log2(t.size); r++) {
    const matches = [];
    for (let i = 0; i < t.size / 2 ** (r + 1); i++) {
      const previous = result[r - 1];
      const teams =
        r === 0
          ? [t.slots[i * 2], t.slots[i * 2 + 1]]
          : [previous[i * 2].winner, previous[i * 2 + 1].winner];
      const ready =
        r === 0 || (previous[i * 2].resolved && previous[i * 2 + 1].resolved);
      const id = `${r}-${i}`,
        auto = ready && teams.filter(Boolean).length < 2;
      const winner = auto
        ? (teams.find(Boolean) ?? null)
        : ready
          ? (teams.find((e) => e?.id === t.winners[id]) ?? null)
          : null;
      matches.push({
        id,
        r,
        i,
        teams,
        ready,
        auto,
        winner,
        resolved: auto || !!winner,
      });
    }
    result.push(matches);
  }
  return result;
}
/** @param {Tournament} t @param {string} matchId @param {string} participantId */
export function chooseWinner(t, matchId, participantId) {
  const match = rounds(t)
    .flat()
    .find((m) => m.id === matchId);
  if (
    t.phase !== "play" ||
    !match?.ready ||
    match.auto ||
    !match.teams.some((e) => e?.id === participantId)
  )
    return t;
  const next = clone(t);
  if (next.winners[matchId] === participantId) delete next.winners[matchId];
  else next.winners[matchId] = participantId;
  let index = match.i;
  for (let r = match.r + 1; r < Math.log2(t.size); r++) {
    index = Math.floor(index / 2);
    delete next.winners[`${r}-${index}`];
  }
  next.updatedAt = Date.now();
  return next;
}
/** @param {any} t @returns {Tournament} */
export function validateTournament(t) {
  if (
    !t ||
    typeof t.id !== "string" ||
    !t.id ||
    typeof t.title !== "string" ||
    !t.title.trim() ||
    [...t.title].length > 60 ||
    !SIZES.includes(t.size) ||
    !["edit", "play"].includes(t.phase) ||
    !Array.isArray(t.slots) ||
    t.slots.length !== t.size ||
    !t.winners ||
    typeof t.winners !== "object" ||
    Array.isArray(t.winners) ||
    !Number.isFinite(t.updatedAt)
  )
    throw new Error("토너먼트 저장 형식을 확인해 주세요. 원본을 보존합니다.");
  const ids = new Set();
  for (const e of t.slots.filter(Boolean)) {
    if (
      typeof e.id !== "string" ||
      !e.id ||
      ids.has(e.id) ||
      typeof e.name !== "string" ||
      !e.name.trim() ||
      [...e.name].length > 40 ||
      /[\u0000-\u001f\u007f]/u.test(e.name)
    )
      throw new Error("참가자 자료를 확인해 주세요.");
    ids.add(e.id);
  }
  if (t.phase === "play" && ids.size < 2)
    throw new Error("참가자가 두 명 이상 필요해요.");
  const matches = rounds(t).flat();
  for (const [id, winner] of Object.entries(t.winners)) {
    const m = matches.find((m) => m.id === id);
    if (!m || m.auto || !m.ready || !m.teams.some((e) => e?.id === winner))
      throw new Error("경기 결과가 참가자와 일치하지 않아요.");
  }
  return t;
}
