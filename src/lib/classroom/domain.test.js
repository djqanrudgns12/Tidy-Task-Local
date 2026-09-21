import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcile,
  importCommand,
  validateStudents,
  nextNumber,
  pastedNames,
} from "./domain.js";
const existing = [
  { id: "a", number: 1, name: "같은이름", gender: "female" },
  { id: "b", number: 3, name: "같은이름", gender: "male" },
];
test("roster import preserves identity, gaps and missing gender", () => {
  const rows = reconcile(
    [{ number: "3", name: "같은이름", gender: null, issue: "" }],
    existing,
  );
  const command = importCommand("class", rows, existing);
  assert.equal(command.students[0].id, "b");
  assert.equal(command.students[0].gender, null);
  assert.equal(nextNumber(existing), 4);
});
test("name-only match is never silently merged", () => {
  const rows = reconcile(
    [{ number: "2", name: "같은이름", gender: null, issue: "" }],
    existing,
  );
  assert.equal(rows[0].needsMatch, true);
  assert.throws(() => importCommand("class", rows, existing));
});
test("duplicate numbers block complete batch while duplicate names are valid", () => {
  assert.doesNotThrow(() => validateStudents(existing));
  const rows = reconcile(
    [{ number: "1", name: "다른이름", gender: null, issue: "" }],
    existing,
  );
  rows[0].needsMatch = false;
  assert.throws(() => importCommand("class", rows, existing));
});
test("manual number swaps preserve both IDs", () => {
  const rows = [
    { ...existing[0], number: 3, include: true },
    { ...existing[1], number: 1, include: true },
  ];
  assert.deepEqual(
    importCommand("class", rows, existing).students.map((s) => s.id),
    ["a", "b"],
  );
});
test("names preserve internal spaces and imported omissions never delete", () => {
  const names = pastedNames(" Ann Lee \r\n\nJean-Luc");
  assert.equal(names[0].name, "Ann Lee");
  const rows = reconcile(names, existing);
  const command = importCommand("class", rows, existing);
  assert.deepEqual(command.deleteIds, []);
  assert.deepEqual(
    command.students.map((s) => s.number),
    [4, 5],
  );
});
test("one existing student cannot be mapped twice", () => {
  assert.throws(() =>
    importCommand(
      "class",
      [
        { ...existing[0], include: true },
        { ...existing[0], number: 2, include: true },
      ],
      existing,
    ),
  );
});
