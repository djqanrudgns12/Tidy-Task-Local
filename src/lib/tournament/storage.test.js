import test from "node:test";
import assert from "node:assert/strict";
import { createTournament } from "./engine.js";
import {
  emptyLibrary,
  validateLibrary,
  readLibrary,
  writeLibrary,
} from "./storage.js";

test("saved document validation rejects duplicates and future versions", () => {
  const t = createTournament("교실 대회", 8);
  assert.throws(() => validateLibrary({ ...emptyLibrary(), schemaVersion: 2 }));
  assert.throws(() =>
    validateLibrary({ ...emptyLibrary(), tournaments: [t, t] }),
  );
  assert.throws(() =>
    validateLibrary({ ...emptyLibrary(), tournaments: [{ ...t, slots: [] }] }),
  );
});

test("storage restores drafts, rejects stale writes and preserves corrupt data", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const data = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (/** @type {string} */ key) => data.get(key) ?? null,
      setItem: (/** @type {string} */ key, /** @type {string} */ value) =>
        data.set(key, value),
    },
  });
  try {
    const draft = {
      ...emptyLibrary(),
      tournaments: [createTournament("자동 저장", 16)],
    };
    const saved = await writeLibrary(draft);
    assert.equal(saved.revision, 1);
    assert.deepEqual(await readLibrary(), saved);
    await assert.rejects(() => writeLibrary(draft));
    data.set("tidy-tournament-v1", "{broken");
    await assert.rejects(() => readLibrary());
    await assert.rejects(() => writeLibrary(saved));
    assert.equal(data.get("tidy-tournament-v1"), "{broken");
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
