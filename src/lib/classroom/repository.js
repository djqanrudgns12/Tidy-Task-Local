import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { validateStudents, cleanName } from "./domain.js";
export const native = isTauri();
/** @typedef {{id:string,number:number,name:string,gender:string,groupId:string|null}} Student */
/** @typedef {{id:string,name:string,revision:number,students:Student[],groups:{id:string,name:string}[]}} Class */
/** @typedef {{revision:number,defaultClassId:string|null,classes:Class[]}} Snapshot */
/** @type {Snapshot[]} */ let history = [];
/** @type {Snapshot} */ let preview = {
  revision: 0,
  defaultClassId: null,
  classes: [],
};
/** @type {Set<()=>void>} */ const listeners = new Set();
const seen = new Set();
/** @returns {Promise<Snapshot>} */
export const readRoster = () =>
  native ? invoke("classroom_read") : Promise.resolve(structuredClone(preview));
/** @param {()=>void} callback */
export async function subscribeRoster(callback) {
  if (native) return listen("classroom-changed", () => callback());
  listeners.add(callback);
  return () => listeners.delete(callback);
}
/** @param {any} command @param {number} revision @param {string} [operationId] @returns {Promise<{snapshot:Snapshot,canUndo:boolean}>} */
export async function execute(
  command,
  revision,
  operationId = crypto.randomUUID(),
) {
  if (native)
    return invoke("classroom_execute", {
      command,
      expectedRevision: revision,
      operationId,
    });
  if (seen.has(operationId))
    return { snapshot: structuredClone(preview), canUndo: history.length > 0 };
  if (revision !== preview.revision)
    throw new Error("다른 변경이 있어요. 최신 내용을 확인해 주세요.");
  const before = structuredClone(preview);
  let s = structuredClone(preview);
  const c = s.classes.find((c) => c.id === command.classId) || {
    id: "",
    name: "",
    revision: 0,
    students: [],
    groups: [],
  };
  const uid = () => crypto.randomUUID();
  switch (command.type) {
    case "createClass": {
      const cl = {
        id: uid(),
        name: cleanName(command.name),
        revision: 0,
        students: [],
        groups: [],
      };
      if (!cl.name) throw new Error("학급 이름을 입력해 주세요.");
      s.classes.push(cl);
      if (s.classes.length === 1) s.defaultClassId = cl.id;
      break;
    }
    case "renameClass":
      c.name = cleanName(command.name);
      if (!c.name) throw new Error("학급 이름을 입력해 주세요.");
      break;
    case "deleteClass":
      s.classes = s.classes.filter((cl) => cl.id !== c.id);
      if (s.defaultClassId === c.id) s.defaultClassId = null;
      break;
    case "setDefault":
      s.defaultClassId = command.classId;
      break;
    case "saveStudents":
      for (const input of command.students) {
        if (input.id) {
          const old = c.students.find((s) => s.id === input.id);
          if (!old) throw new Error("학생을 찾지 못했어요.");
          Object.assign(old, input, { gender: input.gender ?? old.gender });
        } else
          c.students.push({
            ...input,
            id: uid(),
            gender: input.gender ?? "unspecified",
            groupId: null,
          });
      }
      c.students = c.students.filter((p) => !command.deleteIds.includes(p.id));
      break;
    case "deleteStudents":
      c.students = c.students.filter((p) => !command.ids.includes(p.id));
      break;
    case "createGroups":
      for (let i = 0; i < command.count; i++) {
        let n = 1;
        while (c.groups.some((g) => g.name === `${n}모둠`)) n++;
        c.groups.push({ id: uid(), name: `${n}모둠` });
      }
      break;
    case "renameGroup": {
      const group = c.groups.find((g) => g.id === command.groupId);
      if (!group) throw new Error("모둠을 찾지 못했어요.");
      group.name = cleanName(command.name);
      break;
    }
    case "deleteGroup":
      c.groups = c.groups.filter((g) => g.id !== command.groupId);
      c.students.forEach((s) => {
        if (s.groupId === command.groupId) s.groupId = null;
      });
      break;
    case "reorderGroups":
      c.groups = command.ids.map(
        /** @param {string} id */ (id) => c.groups.find((g) => g.id === id),
      );
      break;
    case "assign":
      c.students.forEach((s) => {
        if (command.ids.includes(s.id)) s.groupId = command.groupId;
      });
      break;
    case "undo":
      if (!history.length) throw new Error("실행 취소할 작업이 없어요.");
      s = history.pop() || before;
      break;
    case "restore":
      if (
        command.backup.format !== "tidy-classroom" ||
        command.backup.schemaVersion !== 1
      )
        throw new Error("지원하지 않는 백업이에요.");
      s = structuredClone(command.backup.data);
      history = [];
      break;
    default:
      throw new Error("지원하지 않는 작업이에요.");
  }
  s.classes.forEach((cl) => {
    validateStudents(cl.students);
    if (new Set(cl.groups.map((g) => g.name)).size !== cl.groups.length)
      throw new Error("모둠 이름이 중복돼요.");
  });
  if (!["undo", "restore"].includes(command.type)) {
    history.push(before);
    if (history.length > 20) history.shift();
  }
  s.revision = before.revision + 1;
  s.classes.forEach((c) => c.students.sort((a, b) => a.number - b.number));
  preview = s;
  seen.add(operationId);
  listeners.forEach((fn) => fn());
  return { snapshot: structuredClone(preview), canUndo: history.length > 0 };
}
export const clearHistory = () =>
  native ? invoke("classroom_clear_history") : (history = []);
/** @param {Snapshot} snapshot */
export async function exportRoster(snapshot) {
  const text = JSON.stringify(
    { format: "tidy-classroom", schemaVersion: 1, data: snapshot },
    null,
    2,
  );
  if (native) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({
      defaultPath: "학급-백업.json",
      filters: [{ name: "학급 백업", extensions: ["json"] }],
    });
    if (path) {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      await writeTextFile(path, text);
    }
  } else {
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "학급-백업.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
