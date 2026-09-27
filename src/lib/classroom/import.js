import { invoke } from "@tauri-apps/api/core";
import { native } from "./repository.js";
import { pastedNames } from "./domain.js";
/** @param {string[][]} rows @param {any} [columns] @returns {Promise<any[]>} */
export async function projectRows(rows, columns = null) {
  if (native) return invoke("classroom_project", { rows, columns });
  if (columns) {
    const mapped = rows
      .slice(Math.max(0, columns.startRow - 1))
      .map((r) => [
        columns.number == null ? "" : r[columns.number] || "",
        r[columns.name] || "",
        columns.gender == null ? "" : r[columns.gender] || "",
      ]);
    rows = [
      [
        columns.number == null ? "" : "번호",
        "이름",
        columns.gender == null ? "" : "성별",
      ],
      ...mapped,
    ];
  }
  const norm = /** @param {string} s */ (s) =>
    String(s).normalize("NFKC").replace(/\s/g, "");
  let header = rows.findIndex((r) =>
    r.some((s) => ["이름", "성명", "학생명"].includes(norm(s))),
  );
  if (header < 0) throw new Error("이름 또는 성명 머리글을 찾지 못했어요.");
  const keys = rows[header].map(norm),
    name = keys.findIndex((s) => ["이름", "성명", "학생명"].includes(s));
  const num = keys.findIndex((s) => ["번호", "출석번호"].includes(s)),
    gender = keys.indexOf("성별");
  return [
    {
      label: "가져온 명단",
      excluded: 0,
      students: rows
        .slice(header + 1)
        .filter(
          (r) => r[name]?.trim() && !["이름", "성명"].includes(norm(r[name])),
        )
        .map((r) => ({
          number: num < 0 ? "" : norm(r[num] || ""),
          name: r[name],
          gender:
            gender < 0
              ? null
              : /^(남|남성)$/.test(r[gender])
                ? "male"
                : /^(여|여성)$/.test(r[gender])
                  ? "female"
                  : "unspecified",
          issue: "",
        })),
    },
  ];
}
/** @param {string} text */
export async function parsePaste(text) {
  return text.includes("\t")
    ? projectRows(text.split(/\r?\n/).map((r) => r.split("\t")))
    : [{ label: "붙여넣은 이름", students: pastedNames(text), excluded: 0 }];
}
/** @param {File} file @param {AbortSignal} [signal] @param {any} [columns] @returns {Promise<any[]>} */
export async function parseFile(file, signal, columns = null) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("20MB 이하 파일을 선택해 주세요.");
  const extension = (file.name.split(".").pop() || "").toLowerCase();
  if (!["pdf", "xlsx", "csv", "hwpx"].includes(extension))
    throw new Error("PDF, XLSX, CSV, HWPX 파일을 선택해 주세요.");
  /** @type {Uint8Array|null} */ let bytes = new Uint8Array(
    await file.arrayBuffer(),
  );
  try {
    signal?.throwIfAborted();
    if (extension === "pdf") {
      const { extractPdfRows } = await import("./pdf.js");
      const rows = await extractPdfRows(bytes, signal);
      signal?.throwIfAborted();
      return await projectRows(rows, columns);
    }
    if (native) {
      const requestId = crypto.randomUUID();
      const cancel = () => {
        void invoke("classroom_cancel_parse", { requestId });
      };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        // 파일은 원본 바이트로, 나머지는 헤더로 보냅니다(tauri-plugin-fs의 writeFile과 같은 방식).
        // 왜: 예전의 Array.from(bytes)는 JSON 숫자 배열(원래 크기의 약 3.6배)이 되어, 만드는 데 이 창이,
        //   Rust가 메인 스레드에서 해석하는 동안 앱 전체가 멈췄습니다(5MB 파일 기준 만들기 약 0.16초 + 해석 약 0.2초).
        const result = await invoke("classroom_parse", bytes, {
          headers: {
            extension,
            "request-id": requestId,
            columns: JSON.stringify(columns ?? null),
          },
        });
        signal?.throwIfAborted();
        return /** @type {any[]} */ (result);
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    }
    if (extension === "csv")
      return projectRows(
        new TextDecoder()
          .decode(bytes)
          .split(/\r?\n/)
          .map((r) => r.split(",")),
      );
    throw new Error(
      "XLSX·HWPX 가져오기는 Tidy 데스크톱 앱에서 사용할 수 있어요.",
    );
  } finally {
    bytes = null;
  }
}
