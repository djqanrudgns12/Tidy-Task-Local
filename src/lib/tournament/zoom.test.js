import test from "node:test";
import assert from "node:assert/strict";
import {
  fitTournamentZoom,
  normalizeTournamentZoom,
  stepTournamentZoom,
} from "./zoom.js";

test("tournament zoom always lands on a 5 percent boundary", () => {
  assert.equal(normalizeTournamentZoom(1.19), 1.2);
  assert.equal(stepTournamentZoom(1, 1), 1.05);
  assert.equal(stepTournamentZoom(1.05, -1), 1);
  assert.equal(stepTournamentZoom(1.6, 1), 1.6);
  assert.equal(stepTournamentZoom(0.15, -1), 0.15);
});

test("fit zoom rounds down so the bracket remains inside the panel", () => {
  assert.equal(fitTournamentZoom(1.19), 1.15);
  assert.equal(fitTournamentZoom(0.789), 0.75);
  assert.equal(fitTournamentZoom(0.12), 0.15);
});
