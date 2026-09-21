import { readRoster, subscribeRoster } from "./repository.js";

/** A tool binds once; changing the default class never silently switches it.
 * @param {(value:{classroom:any|null,deleted:boolean,revision:number})=>void} onChange
 * @param {string|null} [initialClassId]
 * @param {{readRoster:typeof readRoster,subscribeRoster:typeof subscribeRoster}} [repository]
 */
export async function createClassContext(
  onChange,
  initialClassId = null,
  repository = { readRoster, subscribeRoster },
) {
  let boundId = initialClassId;
  let disposed = false;
  let revision = -1;
  let initialized = false;
  let generation = 0;
  async function refresh() {
    const ticket = generation;
    const snapshot = await repository.readRoster();
    if (disposed || ticket !== generation || snapshot.revision < revision)
      return;
    if (!initialized) {
      boundId ??= snapshot.defaultClassId;
      initialized = true;
    }
    revision = snapshot.revision;
    const classroom = snapshot.classes.find((c) => c.id === boundId) ?? null;
    onChange({ classroom, deleted: !!boundId && !classroom, revision });
  }
  const off = await repository.subscribeRoster(() => {
    void refresh().catch(() => {});
  });
  try {
    await refresh();
  } catch (error) {
    off();
    throw error;
  }
  const focus = () => {
    void refresh().catch(() => {});
  };
  window.addEventListener("focus", focus);
  return {
    get classId() {
      return boundId;
    },
    /** @param {string|null} classId */
    async selectClass(classId) {
      boundId = classId;
      initialized = true;
      generation++;
      revision = -1;
      await refresh();
    },
    refresh,
    dispose() {
      disposed = true;
      generation++;
      off();
      window.removeEventListener("focus", focus);
    },
  };
}

/** Freeze candidates once when starting a draw; no live state is shared with the animation.
 * @param {{id:string,revision:number,students:any[]}} classroom
 */
export function captureCandidates(classroom) {
  return Object.freeze({
    classId: classroom.id,
    revision: classroom.revision,
    students: Object.freeze(
      classroom.students.map((s) =>
        Object.freeze({
          id: s.id,
          number: s.number,
          name: s.name,
          gender: s.gender,
          groupId: s.groupId,
        }),
      ),
    ),
  });
}
