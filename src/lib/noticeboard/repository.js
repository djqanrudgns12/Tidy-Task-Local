import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  validateDocument,
  plainText,
  hasContent,
  equalDocuments,
} from "./document.js";
export const native = isTauri();
/** @param {Pick<Storage, 'getItem' | 'setItem'>} [storage] */
export function createPreviewRepository(storage = globalThis.localStorage) {
  const key = "tidy-noticeboard-preview-v1";
  /** @returns {{docs: import("./types").Entry[], ops: {id:string,documentId:string,request:string,response:any}[], tombstones:string[]}} */
  const load = () => {
    const raw = storage.getItem(key);
    const data = raw ? JSON.parse(raw) : { docs: [], ops: [], tombstones: [] };
    if (!Array.isArray(data.docs) || !Array.isArray(data.ops))
      throw new Error("CORRUPT_STORAGE");
    data.tombstones ||= [];
    return data;
  };
  return {
    /** @param {import("./types").Command} cmd @returns {Promise<any>} */
    async execute(cmd) {
      const data = load();
      const r = data.docs.find((d) => d.id === cmd.id);
      if (cmd.type === "read")
        return (
          data.docs.find((d) => d.dateKey === cmd.dateKey && !d.deletedAt) ||
          null
        );
      if (cmd.type === "list" || cmd.type === "trashList")
        return data.docs
          .filter((d) => (cmd.type === "list" ? !d.deletedAt : d.deletedAt))
          .map((d) => ({
            ...d,
            savedText: plainText(d.saved),
            draftText: plainText(d.draft),
            hasSaved: !!d.saved,
            hasDraft: !!d.draft,
          }))
          .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
      const prior = data.ops.find((o) => o.id === cmd.operationId);
      if (prior) {
        if (prior.request !== JSON.stringify(cmd)) throw new Error("CONFLICT");
        return prior.response;
      }
      if ((r?.revision || 0) !== cmd.expectedRevision)
        throw new Error("CONFLICT");
      /** @type {import('./types').Entry | null | undefined} */
      let result = r;
      if (["draft", "save"].includes(cmd.type)) {
        if (data.tombstones.includes(cmd.id)) throw new Error("NOT_ACTIVE");
        validateDocument(cmd.document);
        if (r?.deletedAt) throw new Error("NOT_ACTIVE");
        if (cmd.type === "save" && !hasContent(cmd.document))
          throw new Error("EMPTY_CONTENT");
        if (
          !r &&
          data.docs.some((d) => d.dateKey === cmd.dateKey && !d.deletedAt)
        )
          throw new Error("CONFLICT");
        result ||= {
          id: cmd.id,
          dateKey: cmd.dateKey,
          revision: 0,
          saved: null,
          draft: null,
          deletedAt: null,
        };
        if (!r) data.docs.push(result);
        if (cmd.type === "draft")
          result.draft = equalDocuments(cmd.document, result.saved)
            ? null
            : cmd.document;
        else {
          result.saved = cmd.document;
          if (equalDocuments(result.draft, cmd.document)) result.draft = null;
        }
      } else if (cmd.type === "trash") {
        if (!r || r.deletedAt) throw new Error("NOT_ACTIVE");
        r.deletedAt = Date.now();
      } else if (cmd.type === "restore") {
        if (!r?.deletedAt) throw new Error("NOT_ACTIVE");
        const active = data.docs.find(
          (d) => d.dateKey === r.dateKey && !d.deletedAt,
        );
        if (active) {
          if (
            active.id !== cmd.replaceId ||
            active.revision !== cmd.replaceRevision
          )
            throw new Error("CONFLICT");
          active.deletedAt = Date.now();
          active.revision++;
        } else if (cmd.replaceId) throw new Error("CONFLICT");
        r.deletedAt = null;
      } else if (cmd.type === "purge") {
        if (!r?.deletedAt) throw new Error("NOT_ACTIVE");
        data.docs = data.docs.filter((d) => d.id !== r.id);
        data.ops = data.ops.filter((o) => o.documentId !== r.id);
        data.tombstones.push(r.id);
        result = null;
      } else throw new Error("INVALID_COMMAND");
      if (result) {
        result.revision++;
        result.updatedAt = Date.now();
      }
      data.ops.push({
        id: cmd.operationId,
        documentId: cmd.id,
        request: JSON.stringify(cmd),
        response: structuredClone(result),
      });
      data.ops = data.ops.slice(-2000);
      storage.setItem(key, JSON.stringify(data));
      return result;
    },
    /** @param {string} key */
    readDate(key) {
      return this.execute({ type: "read", dateKey: key });
    },
    list() {
      return this.execute({ type: "list" });
    },
    trashList() {
      return this.execute({ type: "trashList" });
    },
  };
}
/** @type {import("./types").Repository} */
export const repository = native
  ? {
      execute: (command) => invoke("noticeboard_execute", { command }),
      readDate(dateKey) {
        return this.execute({ type: "read", dateKey });
      },
      list() {
        return this.execute({ type: "list" });
      },
      trashList() {
        return this.execute({ type: "trashList" });
      },
    }
  : createPreviewRepository();
