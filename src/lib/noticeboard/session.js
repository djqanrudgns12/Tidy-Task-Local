import {
  emptyDocument,
  equalDocuments,
  hasContent,
  validateDocument,
} from "./document.js";
import { parseDate } from "./dates.js";
export class NoticeSession {
  /** @type {Map<string, import("./types").DateSession>} */
  sessions = new Map();
  /** @type {import("./types").DateSession | null} */
  active = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  timer;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  deadline;
  /** @type {unknown} */
  error;
  /** @type {Promise<any>} */
  tail = Promise.resolve();
  /** @type {{doc: import('./types').Document, promise: Promise<any>} | null} */
  pendingSave = null;
  /** @param {import("./types").Repository} repository @param {()=>void} notify @param {string} [fontId] */
  constructor(repository, notify = () => {}, fontId) {
    this.repository = repository;
    this.notify = notify;
    this.fontId = fontId;
    this.sessions = new Map();
    this.active = null;
    this.tail = Promise.resolve();
    this.epoch = 0;
    this.timer = undefined;
    this.deadline = undefined;
    this.error = null;
    this.disposed = false;
  }
  emit() {
    if (!this.disposed) this.notify();
  }
  /** @param {string} key */
  async open(key) {
    parseDate(key);
    const epoch = ++this.epoch;
    await this.flush();
    let next = this.sessions.get(key);
    if (!next) {
      const record = await this.repository.readDate(key);
      if (record?.saved) validateDocument(record.saved);
      if (record?.draft) validateDocument(record.draft);
      next = {
        key,
        id: record?.id || crypto.randomUUID(),
        revision: record?.revision || 0,
        saved: record?.saved || null,
        doc: record?.draft || record?.saved || emptyDocument(this.fontId),
        version: 0,
        persisted: 0,
        exists: !!record,
        everContent: !!record,
        editor: null,
        uncertain: null,
      };
    }
    if (epoch !== this.epoch || this.disposed) return false;
    this.sessions.set(key, next);
    this.active = next;
    this.error = null;
    this.emit();
    return true;
  }
  /** @param {import("./types").Document} doc @param {import("prosemirror-state").EditorState | null} editor */
  edit(doc, editor) {
    const s = this.active;
    if (!s) return;
    validateDocument(doc);
    s.doc = doc;
    s.everContent ||= hasContent(doc);
    s.editor = editor;
    s.version++;
    this.emit();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush().catch(() => {}), 500);
    if (!this.deadline)
      this.deadline = setTimeout(() => void this.flush().catch(() => {}), 2000);
  }
  clearTimers() {
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = this.deadline = undefined;
  }
  /** @param {()=>Promise<any>} job */
  enqueue(job) {
    const task = this.tail.catch(() => {}).then(job);
    this.tail = task;
    return task.catch((e) => {
      this.error = e;
      this.emit();
      throw e;
    });
  }
  /** @param {import("./types").DateSession} s @param {import("./types").Command} command */
  async send(s, command) {
    if (s.uncertain) {
      const previous = s.uncertain;
      const result = await this.repository.execute(previous.command);
      this.accept(s, result, previous.version);
      s.uncertain = null;
    }
    const request = {
      ...command,
      id: s.id,
      dateKey: s.key,
      expectedRevision: s.revision,
      operationId: crypto.randomUUID(),
    };
    s.uncertain = { command: request, version: command.editVersion };
    try {
      const result = await this.repository.execute(request);
      this.accept(s, result, command.editVersion);
      s.uncertain = null;
      this.error = null;
      this.emit();
      return result;
    } catch (e) {
      if (
        /CONFLICT|NOT_ACTIVE|INVALID_|EMPTY_CONTENT|LIMIT_EXCEEDED/.test(
          String(e),
        )
      )
        s.uncertain = null;
      throw e;
    }
  }
  /** @param {import("./types").DateSession} s @param {import("./types").Entry | null} record @param {number | undefined} version */
  accept(s, record, version) {
    if (record) {
      s.revision = record.revision;
      s.exists = true;
      s.saved = record.saved;
    }
    if (typeof version === "number" && Number.isInteger(version))
      s.persisted = Math.max(s.persisted, version);
  }
  flush() {
    this.clearTimers();
    const s = this.active;
    if (s?.uncertain?.command.type === "trash") return this.trash();
    if (!s) return this.tail;
    const doc = structuredClone(s.doc),
      version = s.version;
    return this.enqueue(async () => {
      if (!s.uncertain && version <= s.persisted) return;
      if (!s.exists && !s.everContent) {
        s.persisted = version;
        this.emit();
        return;
      }
      await this.send(s, {
        type: "draft",
        document: doc,
        editVersion: version,
      });
    });
  }
  save() {
    this.clearTimers();
    const s = this.active;
    if (!s || !hasContent(s.doc))
      return Promise.reject(new Error("EMPTY_CONTENT"));
    const doc = structuredClone(s.doc),
      version = s.version;
    if (this.pendingSave && equalDocuments(this.pendingSave.doc, doc))
      return this.pendingSave.promise;
    const promise = this.enqueue(async () => {
      // Establish the exact click snapshot as draft before committing. Newer edits
      // are queued after this barrier and never replaced by its acknowledgement.
      await this.send(s, {
        type: "draft",
        document: doc,
        editVersion: version,
      });
      return this.send(s, {
        type: "save",
        document: doc,
        editVersion: version,
      });
    });
    const pending = { doc, promise };
    this.pendingSave = pending;
    void promise
      .finally(() => {
        if (this.pendingSave === pending) this.pendingSave = null;
      })
      .catch(() => {});
    return promise;
  }
  async trash() {
    const s = this.active;
    if (s?.uncertain?.command.type === "trash") {
      const pending = s.uncertain;
      await this.enqueue(async () => {
        await this.repository.execute(pending.command);
        s.uncertain = null;
      });
    } else {
      await this.flush();
      if (!s?.exists) return;
      await this.enqueue(() => this.send(s, { type: "trash" }));
    }
    if (!s?.exists) return;
    this.sessions.delete(s.key);
    this.active = null;
    await this.open(s.key);
  }
  status() {
    const s = this.active;
    if (this.error) return "보관 실패";
    if (!s) return "준비 중";
    if (s.version > s.persisted) return "초안 보관 중…";
    if (!s.exists) return "새 알림장";
    return s.saved && equalDocuments(s.doc, s.saved) ? "저장됨" : "초안 보관됨";
  }
  dispose() {
    this.disposed = true;
    this.clearTimers();
  }
}
