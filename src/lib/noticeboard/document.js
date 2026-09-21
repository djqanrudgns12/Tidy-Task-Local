export const DEFAULT_FONT = "메이플스토리 L";
export const COLORS = [
  "#253b40",
  "#a92c36",
  "#925014",
  "#216750",
  "#265fa0",
  "#72459a",
];
export const emptyDocument = (fontId = DEFAULT_FONT) => ({
  type: "doc",
  attrs: { fontId },
  content: [{ type: "paragraph" }],
});
/** @param {import("./types").Document | null | undefined} doc */
export function plainText(doc) {
  return (doc?.content || [])
    .map((p) =>
      (p.content || [])
        .map((n) => (n.type === "hardBreak" ? "\n" : n.text || ""))
        .join(""),
    )
    .join("\n");
}
/** @param {import("./types").Document | null | undefined} doc */
export const hasContent = (doc) =>
  /[^\s\u200B-\u200D\uFEFF]/u.test(plainText(doc));
/** @param {unknown} a @param {unknown} b */
export const equalDocuments = (a, b) => canonical(a) === canonical(b);
/** @param {any} value @returns {string} */
function canonical(value) {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
}
/** @param {any} doc @returns {import("./types").Document} */
export function validateDocument(doc) {
  /** @param {any} value @param {string[]} keys */
  const only = (value, keys) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((k) => !keys.includes(k))
    )
      throw new Error("INVALID_DOCUMENT");
  };
  only(doc, ["type", "attrs", "content"]);
  only(doc.attrs, ["fontId"]);
  if (
    !doc ||
    doc.type !== "doc" ||
    !doc.attrs ||
    typeof doc.attrs.fontId !== "string" ||
    !doc.attrs.fontId.length ||
    doc.attrs.fontId.length > 100 ||
    /[<>;{}]/.test(doc.attrs.fontId)
  )
    throw new Error("INVALID_DOCUMENT");
  if (
    !Array.isArray(doc.content) ||
    !doc.content.length ||
    doc.content.length > 5000
  )
    throw new Error("LIMIT_EXCEEDED");
  for (const p of doc.content) {
    only(p, ["type", "content"]);
    if (p.type !== "paragraph" || (p.content && !Array.isArray(p.content)))
      throw new Error("INVALID_DOCUMENT");
    for (const n of p.content || []) {
      only(
        n,
        n.type === "text" ? ["type", "text", "marks"] : ["type", "marks"],
      );
      if (n.marks !== undefined && !Array.isArray(n.marks))
        throw new Error("INVALID_DOCUMENT");
      if (
        !["text", "hardBreak"].includes(n.type) ||
        (n.type === "text" && (typeof n.text !== "string" || !n.text))
      )
        throw new Error("INVALID_DOCUMENT");
      const seen = new Set();
      for (const mark of n.marks || []) {
        only(mark, ["type", "attrs"]);
        if (mark.type === "fontSize") only(mark.attrs, ["size"]);
        else if (mark.type === "color") only(mark.attrs, ["color"]);
        else if (mark.attrs !== undefined) only(mark.attrs, []);
        if (
          ![
            "bold",
            "italic",
            "strike",
            "underline",
            "fontSize",
            "color",
          ].includes(mark.type) ||
          seen.has(mark.type)
        )
          throw new Error("INVALID_DOCUMENT");
        seen.add(mark.type);
        if (
          mark.type === "fontSize" &&
          (!Number.isInteger(mark.attrs?.size) ||
            mark.attrs.size < 8 ||
            mark.attrs.size > 96)
        )
          throw new Error("INVALID_DOCUMENT");
        if (mark.type === "color" && !COLORS.includes(mark.attrs?.color))
          throw new Error("INVALID_DOCUMENT");
      }
    }
  }
  if (
    [...plainText(doc)].length > 100000 ||
    new TextEncoder().encode(JSON.stringify(doc)).length > 2 * 1024 * 1024
  )
    throw new Error("LIMIT_EXCEEDED");
  return doc;
}
/** @param {unknown} error */
export function messageFor(error) {
  const raw = String(error);
  for (const [key, value] of Object.entries({
    EMPTY_CONTENT: "내용을 입력한 뒤 저장해 주세요.",
    LIMIT_EXCEEDED: "내용이 너무 길어요. 붙여넣을 분량을 줄여 주세요.",
    INVALID_DOCUMENT: "지원하지 않는 내용 형식이에요.",
    CONFLICT: "자료가 변경되었어요. 현재 내용을 보존한 채 다시 시도해 주세요.",
    NOT_ACTIVE: "삭제되거나 바뀐 알림장이에요. 다시 열어 주세요.",
    UNSUPPORTED_SCHEMA:
      "더 최신 버전에서 만든 자료예요. 앱을 업데이트해 주세요.",
    CORRUPT_STORAGE: "저장소를 읽지 못했어요. 원본은 그대로 보존했어요.",
  }))
    if (raw.includes(key)) return value;
  return "자료를 읽거나 보관하지 못했어요. 내용을 유지하고 있어요. 다시 시도해 주세요.";
}
