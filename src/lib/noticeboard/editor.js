import { Schema, Slice, Fragment } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  history,
  undo,
  redo,
  undoDepth,
  redoDepth,
  closeHistory,
} from "prosemirror-history";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { DEFAULT_FONT, COLORS, validateDocument } from "./document.js";
/** @param {string} tag @param {string} [style] @returns {import("prosemirror-model").MarkSpec} */
const simpleMark = (tag, style) => ({
  parseDOM: [{ tag }, ...(style ? [{ style }] : [])],
  toDOM: () => [tag, 0],
});
export const schema = new Schema({
  nodes: {
    doc: {
      content: "paragraph+",
      attrs: { fontId: { default: DEFAULT_FONT } },
    },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
    hardBreak: {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br" }],
      toDOM: () => ["br"],
    },
  },
  marks: {
    bold: simpleMark("strong", "font-weight=bold"),
    italic: simpleMark("em", "font-style=italic"),
    strike: simpleMark("s"),
    underline: simpleMark("u"),
    fontSize: {
      attrs: { size: {} },
      toDOM: (m) => [
        "span",
        {
          style: `font-size: ${m.attrs.size / 22}em`,
          "data-size": m.attrs.size,
        },
        0,
      ],
    },
    color: {
      attrs: { color: {} },
      toDOM: (m) => ["span", { style: `color: ${m.attrs.color}` }, 0],
    },
  },
});
/** @type {{token:string,slice:any}|null} */
let copied = null;
/** @param {HTMLElement} host @param {import("./session.js").NoticeSession} session @param {{changed:()=>void,error:(e:unknown)=>void}} callbacks */
export function createEditor(host, session, { changed, error }) {
  function active() {
    if (!session.active) throw new Error("NO_ACTIVE_DOCUMENT");
    return session.active;
  }
  let composing = false,
    locked = false;
  const plugins = [
    history({ depth: 200, newGroupDelay: 500 }),
    keymap({
      "Mod-z": (s, d, v) => !v?.composing && undo(s, d),
      "Mod-y": (s, d, v) => !v?.composing && redo(s, d),
      "Mod-Shift-z": (s, d, v) => !v?.composing && redo(s, d),
      "Mod-b": toggleMark(schema.marks.bold),
      "Mod-i": toggleMark(schema.marks.italic),
      "Mod-u": toggleMark(schema.marks.underline),
      "Shift-Enter": (s, d) => {
        d?.(
          s.tr
            .replaceSelectionWith(schema.nodes.hardBreak.create())
            .scrollIntoView(),
        );
        return true;
      },
    }),
    keymap(baseKeymap),
  ];
  /** @param {import("./types").Document} doc */
  const fresh = (doc) =>
    EditorState.create({ schema, doc: schema.nodeFromJSON(doc), plugins });
  /** @type {import('prosemirror-state').SelectionBookmark | null} */
  let normalAnchor = null;
  const view = new EditorView(host, {
    state: active().editor || fresh(active().doc),
    attributes: {
      role: "textbox",
      "aria-label": "알림장 내용",
      "aria-multiline": "true",
      spellcheck: "false",
      "data-placeholder": "오늘 전할 이야기를 적어 주세요.",
    },
    editable: () => !locked,
    dispatchTransaction(tr) {
      try {
        const next = view.state.apply(tr);
        if (tr.docChanged) validateDocument(next.doc.toJSON());
        if (normalAnchor) normalAnchor = normalAnchor.map(tr.mapping);
        view.updateState(next);
        active().editor = next;
        if (tr.docChanged && !view.composing && !composing)
          session.edit(next.doc.toJSON(), next);
        changed();
      } catch (e) {
        error(e);
      }
    },
    handlePaste(v, event) {
      event.preventDefault();
      try {
        const token = event.clipboardData?.getData("application/x-tidy-notice");
        let slice;
        if (copied && token === copied.token)
          slice = Slice.fromJSON(schema, copied.slice);
        else {
          const text = event.clipboardData
            ?.getData("text/plain")
            .replace(/\r\n?/g, "\n");
          if (!text) return true;
          const marks = v.state.storedMarks || v.state.selection.$from.marks();
          slice = new Slice(
            Fragment.from(
              text
                .split("\n")
                .map((line) =>
                  schema.nodes.paragraph.create(
                    null,
                    line ? schema.text(line, marks) : null,
                  ),
                ),
            ),
            1,
            1,
          );
        }
        v.dispatch(
          closeHistory(v.state.tr).replaceSelection(slice).scrollIntoView(),
        );
      } catch (e) {
        error(e);
      }
      return true;
    },
    handleDrop(_v, e) {
      e.preventDefault();
      error(new Error("INVALID_DOCUMENT"));
      return true;
    },
    handleDOMEvents: {
      keyup() {
        captureSelection();
        return false;
      },
      mouseup() {
        captureSelection();
        return false;
      },
      blur() {
        captureSelection();
        return false;
      },
      compositionstart() {
        composing = true;
        return false;
      },
      compositionend() {
        composing = false;
        setTimeout(() => {
          if (!view.isDestroyed) {
            session.edit(view.state.doc.toJSON(), view.state);
            changed();
          }
        }, 0);
        return false;
      },
      copy(v, e) {
        return copy(v, e, false);
      },
      cut(v, e) {
        return copy(v, e, true);
      },
    },
  });
  /** @param {EditorView} v @param {ClipboardEvent} event @param {boolean} cut */
  function copy(v, event, cut) {
    if (v.state.selection.empty || !event.clipboardData) return false;
    const slice = v.state.selection.content();
    const token = crypto.randomUUID();
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      v.state.doc.textBetween(
        v.state.selection.from,
        v.state.selection.to,
        "\n",
      ),
    );
    event.clipboardData.setData("application/x-tidy-notice", token);
    copied = { token, slice: slice.toJSON() };
    if (cut) v.dispatch(closeHistory(v.state.tr).deleteSelection());
    return true;
  }
  /** @param {string} type */
  function marksForSelection(type) {
    const { from, to, empty, $from } = view.state.selection;
    if (empty)
      return [
        (view.state.storedMarks || $from.marks()).find(
          (m) => m.type.name === type,
        ),
      ];
    /** @type {(import("prosemirror-model").Mark | undefined)[]} */
    const values = [];
    view.state.doc.nodesBetween(from, to, (n) => {
      if (n.isText) values.push(n.marks.find((m) => m.type.name === type));
    });
    return values;
  }
  function captureSelection() {
    const selection = host.ownerDocument.getSelection();
    if (
      !selection?.anchorNode ||
      !selection.focusNode ||
      !view.dom.contains(selection.anchorNode) ||
      !view.dom.contains(selection.focusNode) ||
      view.composing
    )
      return;
    const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset);
    const head = view.posAtDOM(selection.focusNode, selection.focusOffset);
    const next = TextSelection.create(view.state.doc, anchor, head);
    if (!next.eq(view.state.selection))
      view.dispatch(view.state.tr.setSelection(next));
  }
  return {
    view,
    captureSelection,
    beginBoard() { normalAnchor = view.state.selection.getBookmark(); },
    endBoard() { if (normalAnchor) { const bookmark=normalAnchor; normalAnchor=null; view.dispatch(view.state.tr.setSelection(bookmark.resolve(view.state.doc))); } },
    switchDate() {
      view.updateState(active().editor || fresh(active().doc));
      changed();
    },
    /** @param {boolean} value */
    lock(value) {
      locked = value;
      view.setProps({ editable: () => !locked });
    },
    async finishComposition() {
      if (composing || view.composing) view.dom.blur();
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (composing || view.composing) throw new Error("COMPOSING");
      if (!view.state.doc.eq(schema.nodeFromJSON(active().doc)))
        session.edit(view.state.doc.toJSON(), view.state);
    },
    /** @param {string} name */
    markState(name) {
      const values = marksForSelection(name);
      return values.every(Boolean)
        ? "true"
        : values.some(Boolean)
          ? "mixed"
          : "false";
    },
    size() {
      const sizes = marksForSelection("fontSize").map(
        (m) => m?.attrs.size || 22,
      );
      return sizes.every((s) => s === sizes[0]) ? sizes[0] || 22 : "";
    },
    canUndo: () => undoDepth(view.state) > 0,
    canRedo: () => redoDepth(view.state) > 0,
    /** @param {string} name @param {any} [value] */
    command(name, value) {
      if (locked || composing || view.composing) return;
      const { state } = view;
      if (name === "undo" || name === "redo") {
        (name === "undo" ? undo : redo)(state, view.dispatch);
      } else if (name === "font")
        view.dispatch(closeHistory(state.tr).setDocAttribute("fontId", value));
      else if (name === "replace") {
        const doc = schema.nodeFromJSON(value);
        view.dispatch(
          closeHistory(state.tr)
            .replaceWith(0, state.doc.content.size, doc.content)
            .setDocAttribute("fontId", doc.attrs.fontId),
        );
      } else if (["bold", "italic", "underline", "strike"].includes(name)) {
        const type = schema.marks[name];
        if (state.selection.empty) toggleMark(type)(state, view.dispatch);
        else {
          const tr = closeHistory(state.tr),
            { from, to } = state.selection;
          view.dispatch(
            this.markState(name) === "true"
              ? tr.removeMark(from, to, type)
              : tr.addMark(from, to, type.create()),
          );
        }
      } else {
        const type =
          schema.marks[
            name === "size" || name === "adjustSize" ? "fontSize" : "color"
          ];
        if (
          name === "size" &&
          (!Number.isInteger(value) || value < 8 || value > 96)
        )
          return error(new Error("INVALID_SIZE"));
        if (name === "color" && !COLORS.includes(value)) return;
        const { from, to, empty } = state.selection;
        let tr = closeHistory(state.tr);
        /** @param {number} size */
        const attrs = (size) =>
          type.name === "fontSize" ? { size } : { color: value };
        if (empty) {
          const size =
            name === "adjustSize"
              ? Math.max(8, Math.min(96, Number(this.size() || 22) + value))
              : value;
          tr = tr.addStoredMark(type.create(attrs(size)));
        } else if (name === "adjustSize")
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.isText) {
              const size = Math.max(
                8,
                Math.min(
                  96,
                  (node.marks.find((m) => m.type === type)?.attrs.size || 22) +
                    value,
                ),
              );
              tr.addMark(
                Math.max(from, pos),
                Math.min(to, pos + node.nodeSize),
                type.create({ size }),
              );
            }
          });
        else tr = tr.addMark(from, to, type.create(attrs(value)));
        view.dispatch(tr);
      }
      view.focus();
      changed();
    },
    destroy() {
      view.destroy();
    },
  };
}
