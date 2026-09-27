import test from "node:test";
import assert from "node:assert/strict";
import { rosterCandidates, assignRosterEntry, sequentialRosterSlots, randomRosterSlots, shuffleSlots } from "./rosterSelection.js";
import { createTournament, validateTournament, SIZES } from "./engine.js";

const candidates = Array.from({ length: 30 }, (_, i) => ({ id: `student-${i + 1}`, name: `${i + 1}. 학생` }));

test("roster preserves identities and sorts student numbers without mutating the class", () => {
  const classroom = { id: "c", name: "학급", revision: 0, students: [
    { id: "b", number: 12, name: "동명", gender: "unspecified", groupId: null },
    { id: "a", number: 2, name: "동명", gender: "unspecified", groupId: null },
  ], groups: [{ id: "g", name: "1모둠" }] };
  assert.deepEqual(rosterCandidates(classroom, "students"), [{ id: "a", name: "2. 동명" }, { id: "b", name: "12. 동명" }]);
  assert.equal(classroom.students[0].id, "b");
  assert.deepEqual(rosterCandidates(classroom, "groups"), classroom.groups);
  assert.deepEqual(rosterCandidates(undefined, "students"), []);
});

test("selection fills gaps, respects the capacity and replaces an explicitly chosen seat", () => {
  let slots = Array(4).fill(null);
  for (const entry of candidates.slice(0, 4)) slots = assignRosterEntry(slots, entry);
  const original = structuredClone(slots);
  assert.throws(() => assignRosterEntry(slots, candidates[4]), /빈자리/);
  assert.throws(() => assignRosterEntry(slots, candidates[4], 4));
  slots = assignRosterEntry(slots, candidates[4], 1);
  assert.equal(slots[1].id, candidates[4].id);
  assert.deepEqual(original.map((e) => e.id), candidates.slice(0, 4).map((e) => e.id));
  slots[2] = null;
  slots = assignRosterEntry(slots, candidates[5]);
  assert.equal(slots[2].id, candidates[5].id);
  validateTournament({ ...createTournament("선택", 4), slots });
});

test("moving a selected student swaps seats and cannot create duplicates", () => {
  const slots = sequentialRosterSlots(candidates.slice(0, 3), 4);
  const swapped = assignRosterEntry(slots, candidates[0], 1);
  assert.deepEqual(swapped.map((e) => e?.id ?? null), ["student-2", "student-1", "student-3", null]);
  const moved = assignRosterEntry(swapped, candidates[0], 3);
  assert.equal(moved[1], null);
  assert.equal(moved[3]?.id, candidates[0].id);
  assert.equal(moved.filter((e) => e?.id === candidates[0].id).length, 1);
  assert.equal(slots[0]?.id, candidates[0].id);
});

test("ordered seats exactly match the preview and reject oversized or duplicate selections", () => {
  assert.deepEqual(sequentialRosterSlots(candidates.slice(0, 3), 4), [...candidates.slice(0, 3), null]);
  assert.throws(() => sequentialRosterSlots(candidates.slice(0, 5), 4), /4강/);
  assert.throws(() => sequentialRosterSlots([candidates[0], candidates[0]], 4), /한 번/);
});

test("random roster selection caps 4/8/16 brackets and shuffling preserves chosen participants", () => {
  const original = structuredClone(candidates);
  for (const size of SIZES) {
    const slots = randomRosterSlots(candidates, size, () => 0.25);
    const chosen = slots.filter((e) => e !== null).map((e) => e.id).sort();
    assert.equal(slots.length, size);
    assert.equal(chosen.length, Math.min(size, candidates.length));
    assert.equal(new Set(chosen).size, chosen.length);
    assert.ok(chosen.every((id) => candidates.some((e) => e.id === id)));
    assert.deepEqual(shuffleSlots(slots, () => 0.5).filter((e) => e !== null).map((e) => e.id).sort(), chosen);
    validateTournament({ ...createTournament("랜덤", size), slots });
  }
  assert.deepEqual(candidates, original);
  assert.deepEqual(randomRosterSlots([], 8), Array(8).fill(null));
});
