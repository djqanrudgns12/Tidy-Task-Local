import { Schema, Slice, Fragment } from "prosemirror-model";
import {
  EditorState,
  TextSelection,
  Plugin,
  PluginKey,
} from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
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
/** 서식 도구로 붙잡아 둔 본문 범위. @typedef {{from:number,to:number}|null} HeldRange */
/** @type {PluginKey<HeldRange>} */
const heldSelection = new PluginKey("heldSelection");
// 왜 필요한가: 글자 크기 입력칸이나 글꼴 목록으로 초점이 넘어가면 브라우저가 본문의 선택 표시를
// 지웁니다(입력칸이 선택을 가져감). 사용자 눈에는 드래그해 둔 블록이 풀린 것처럼 보이므로,
// 초점이 도구에 있는 동안에는 그 범위를 직접 칠해 계속 보여 줍니다.
/** @type {Plugin<HeldRange>} */
const heldSelectionPlugin = new Plugin({
  key: heldSelection,
  state: {
    init: () => /** @type {HeldRange} */ (null),
    apply(tr, value) {
      const meta = tr.getMeta(heldSelection);
      if (meta !== undefined) return meta;
      if (!value) return null;
      // 붙잡아 둔 동안 본문이 바뀌어도 같은 글자를 가리키도록 위치를 따라 옮깁니다.
      return tr.docChanged
        ? { from: tr.mapping.map(value.from), to: tr.mapping.map(value.to) }
        : value;
    },
  },
  props: {
    decorations(state) {
      const range = heldSelection.getState(state);
      if (!range || range.from >= range.to) return null;
      return DecorationSet.create(state.doc, [
        Decoration.inline(range.from, range.to, { class: "nb-held-selection" }),
      ]);
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
    heldSelectionPlugin,
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
  /** 초점이 서식 도구로 넘어간 동안 지키고 있는 선택 범위. @type {import('prosemirror-state').SelectionBookmark | null} */
  let held = null;
  /** 서식 도구를 누르는 순간(초점이 옮겨가기 직전)의 선택. @type {import('prosemirror-state').SelectionBookmark | null} */
  let pendingHold = null;
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
        if (held) held = held.map(tr.mapping);
        if (pendingHold) pendingHold = pendingHold.map(tr.mapping);
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
      focus() {
        // 본문으로 돌아오면 브라우저가 다시 선택을 칠해 주므로 붙잡아 둔 범위를 놓아 줍니다.
        releaseSelection();
        return false;
      },
      blur() {
        // 여기서 DOM 선택을 다시 읽지 않습니다: 초점이 입력칸으로 넘어가는 순간의 DOM 선택은
        // 이미 지워졌거나 한 점으로 접혀 있어, 그대로 반영하면 잡아 둔 범위가 사라집니다.
        holdSelection();
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
  /** @param {HeldRange} range */
  function setHeldRange(range) {
    if (view.isDestroyed || !session.active) return;
    const current = heldSelection.getState(view.state);
    if (
      current === range ||
      (current &&
        range &&
        current.from === range.from &&
        current.to === range.to)
    )
      return;
    view.dispatch(view.state.tr.setMeta(heldSelection, range));
  }
  /** 서식 도구를 누른 순간의 선택을 미리 떠 둡니다.
   *  왜 이 시점인가: 글꼴 목록 같은 요소는 초점이 넘어가기 전에 이미 브라우저가 선택을 접어 버려,
   *  blur 때 다시 읽으면 빈 범위만 남습니다. 누르는 순간이 마지막으로 온전한 때입니다. */
  function holdForTools() {
    captureSelection();
    if (view.isDestroyed) return;
    // 커서만 있을 때는 붙잡지 않습니다: 나중에 setSelection으로 되살리면
    // 미리 눌러 둔 서식(storedMarks)이 함께 지워지기 때문입니다.
    pendingHold = view.state.selection.empty
      ? null
      : view.state.selection.getBookmark();
  }
  /** 초점이 서식 도구로 옮겨가도 잡아 둔 범위를 기억하고 화면에도 계속 칠해 둡니다. */
  function holdSelection() {
    if (view.isDestroyed || !session.active) return;
    const bookmark =
      pendingHold ||
      (view.state.selection.empty ? null : view.state.selection.getBookmark());
    if (!bookmark) return;
    try {
      const selection = bookmark.resolve(view.state.doc);
      if (selection.empty) return;
      held = bookmark;
      setHeldRange({ from: selection.from, to: selection.to });
    } catch {
      /* 위치를 잃은 표시는 버립니다. */
    }
  }
  function releaseSelection() {
    held = null;
    pendingHold = null;
    setHeldRange(null);
  }
  /** 도구에서 되돌아올 때 붙잡아 둔 범위를 그대로 되살립니다. */
  function restoreHeldSelection() {
    const bookmark = held || pendingHold;
    releaseSelection();
    if (!bookmark) return;
    try {
      const selection = bookmark.resolve(view.state.doc);
      if (!selection.eq(view.state.selection))
        view.dispatch(view.state.tr.setSelection(selection));
    } catch {
      /* 본문이 크게 바뀌었으면 지금 선택을 그대로 씁니다. */
    }
  }
  return {
    view,
    holdForTools,
    beginBoard() {
      normalAnchor = view.state.selection.getBookmark();
      // 전체화면으로 넘어가며 초점을 잃어도 잡아 둔 블록이 그대로 보이게 합니다.
      // 도구를 누른 기록은 지웁니다: 지금 보고 있는 선택이 기준이어야 합니다.
      pendingHold = null;
      if (!view.hasFocus()) holdSelection();
    },
    endBoard() {
      if (!normalAnchor) return;
      const bookmark = normalAnchor;
      normalAnchor = null;
      releaseSelection();
      view.dispatch(
        view.state.tr.setSelection(bookmark.resolve(view.state.doc)),
      );
      if (!view.hasFocus()) holdSelection();
    },
    switchDate() {
      // 날짜가 바뀌면 이전 문서의 위치를 가리키던 표시는 버립니다.
      held = null;
      pendingHold = null;
      view.updateState(active().editor || fresh(active().doc));
      setHeldRange(null);
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
      // 글자 크기 입력칸·글꼴 목록을 거쳐 왔다면, 초점이 옮겨가기 전에 잡아 둔 범위를 먼저 되살립니다.
      restoreHeldSelection();
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
