import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZES,
  createTournament,
  parseNames,
  placeEntries,
  shuffleSlots,
  rounds,
  chooseWinner,
  validateTournament,
} from "./engine.js";
import { normalizeSettings } from "../toolkit/preferences.js";
/** @param {number} size @param {number} [count] */
function game(size, count = size) {
  const t = createTournament("교실 대회", size);
  t.slots = placeEntries(
    parseNames(Array.from({ length: count }, (_, i) => `참가 ${i}`).join("\n")),
    size,
  );
  t.phase = "play";
  return t;
}
/** @param {import("./engine.js").Tournament} t */
function finish(t) {
  for (let r = 0; r < Math.log2(t.size); r++)
    for (const m of rounds(t)[r])
      if (!m.auto && !m.winner) t = chooseWinner(t, m.id, m.teams[0]?.id ?? "");
  return t;
}
test("all bracket sizes and participant counts produce one valid champion", () => {
  for (const size of SIZES)
    for (let count = 2; count <= size; count++) {
      const t = finish(game(size, count));
      assert.ok(rounds(t).at(-1)?.[0].winner);
      validateTournament(t);
    }
});
test("repeat click removes only dependent results and immutable undo restores them", () => {
  const complete = finish(game(16));
  const first = rounds(complete)[0][0];
  const next = chooseWinner(complete, first.id, first.winner?.id ?? "");
  assert.equal(next.winners["0-0"], undefined);
  assert.equal(next.winners["1-0"], undefined);
  assert.equal(next.winners["2-0"], undefined);
  assert.equal(next.winners["3-0"], undefined);
  assert.equal(next.winners["2-1"], complete.winners["2-1"]);
  assert.ok(rounds(complete).at(-1)?.[0].winner);
  validateTournament(next);
});
test("switching winner clears ancestors but preserves the other bracket", () => {
  const t = finish(game(8));
  const m = rounds(t)[0][0];
  const n = chooseWinner(t, m.id, m.teams[1]?.id ?? "");
  assert.equal(n.winners[m.id], m.teams[1]?.id ?? "");
  assert.equal(n.winners["1-1"], t.winners["1-1"]);
  assert.equal(n.winners["2-0"], undefined);
});
test("pending opponent cannot win; final winner can be deselected", () => {
  let t = game(4);
  t = chooseWinner(t, "0-0", t.slots[0]?.id ?? "");
  assert.equal(chooseWinner(t, "1-0", t.slots[0]?.id ?? ""), t);
  t = finish(t);
  const final = rounds(t).at(-1)?.[0];
  assert.ok(final);
  assert.equal(
    rounds(chooseWinner(t, final.id, final.winner?.id ?? "")).at(-1)?.[0]
      .winner,
    null,
  );
});
test("shuffle conserves IDs and handles duplicate display names", () => {
  const t = game(32, 26);
  t.slots.filter((e) => e !== null).forEach((e) => (e.name = "동명"));
  const result = shuffleSlots(t.slots);
  assert.deepEqual(
    result
      .filter((e) => e !== null)
      .map((e) => e.id)
      .sort(),
    t.slots
      .filter((e) => e !== null)
      .map((e) => e.id)
      .sort(),
  );
  assert.equal(
    rounds({ ...t, slots: result })[0].filter((m) => m.auto).length,
    6,
  );
});
test("corrupt and impossible stored results are rejected", () => {
  const t = game(4);
  t.winners["1-0"] = t.slots[0]?.id ?? "";
  assert.throws(() => validateTournament(t));
  assert.throws(() => parseNames("a\u0000b"));
  assert.throws(() => placeEntries(parseNames("a\nb\nc\nd\ne"), 4));
});
test("toolkit migration adds tournament once and preserves hidden tools thereafter", () => {
  const old = normalizeSettings({
    schemaVersion: 4,
    toolkit: { visibleToolIds: [] },
  });
  assert.deepEqual(old.toolkit.visibleToolIds, ["tournament", "focus-bell", "dice", "clock", "scoreboard", "thermometer", "vote", "seating"]);
  assert.deepEqual(
    normalizeSettings({
      ...old,
      toolkit: { ...old.toolkit, visibleToolIds: [] },
    }).toolkit.visibleToolIds,
    [],
  );
});
