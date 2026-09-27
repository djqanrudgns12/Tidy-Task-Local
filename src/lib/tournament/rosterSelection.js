import { clone, placeEntries, shuffleSlots } from "./engine.js";

/** @typedef {import('./engine.js').Entry} Entry */
/** @param {import('../classroom/repository.js').Class | undefined} classroom @param {string} source @returns {Entry[]} */
export function rosterCandidates(classroom, source) {
  if (!classroom) return [];
  if (source === "groups") return classroom.groups.map(({ id, name }) => ({ id, name }));
  return [...classroom.students]
    .sort((a, b) => a.number - b.number)
    .map(({ id, number, name }) => ({ id, name: `${number}. ${name}` }));
}

/** Assign to the requested seat, or the first free seat. Moving an existing entry swaps seats.
 * @param {(Entry|null)[]} slots @param {Entry} entry @param {number} [index] */
export function assignRosterEntry(slots, entry, index = slots.indexOf(null)) {
  if (!Number.isInteger(index) || index < 0 || index >= slots.length)
    throw new Error("빈자리가 없어요. 선택을 취소하거나 바꿀 자리를 먼저 눌러 주세요.");
  const next = clone(slots);
  const previous = next.findIndex((candidate) => candidate?.id === entry.id);
  if (previous >= 0) next[previous] = next[index];
  next[index] = clone(entry);
  return next;
}

/** @param {Entry[]} entries @param {number} size @returns {(Entry|null)[]} */
export function sequentialRosterSlots(entries, size) {
  // Keep the engine's capacity guard for every import path.
  placeEntries(entries, size);
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length)
    throw new Error("같은 참가자는 한 번만 배정할 수 있어요.");
  return [...entries.map(clone), ...Array(size - entries.length).fill(null)];
}

/** Select without replacement from the entire class; shuffling the preview never changes this set.
 * @param {Entry[]} candidates @param {number} size @param {()=>number} [random] */
export function randomRosterSlots(candidates, size, random = Math.random) {
  const shuffled = candidates.map(clone);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return placeEntries(shuffled.slice(0, size), size);
}

export { shuffleSlots };
