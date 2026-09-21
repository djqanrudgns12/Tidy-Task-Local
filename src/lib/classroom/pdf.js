import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
/** @typedef {import('pdfjs-dist/types/src/display/api').TextItem} TextItem */
/** @param {string} s */
const normalize = (s) => s.replace(/\s/g, "");
/** @param {Uint8Array} bytes @param {AbortSignal} [signal] */
export async function extractPdfRows(bytes, signal) {
  const task = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const abort = () => {
    void task.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > 50) throw new Error("50쪽 이하 PDF를 선택해 주세요.");
    /** @type {string[][]} */ const rows = [];
    /** @type {{x:number,label:string}[]} */ let anchors = [];
    for (let i = 1; i <= doc.numPages; i++) {
      signal?.throwIfAborted();
      const page = await doc.getPage(i),
        content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const items = /** @type {TextItem[]} */ (
        content.items.filter((x) => "str" in x && x.str.trim())
      )
        .map((item) => {
          const [x, y] = viewport.convertToViewportPoint(
            item.transform[4],
            item.transform[5],
          );
          return { ...item, transform: [1, 0, 0, 1, x, -y] };
        })
        .sort(
          (a, b) =>
            b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4],
        );
      /** @type {{y:number,items:TextItem[]}[]} */ const lines = [];
      for (const item of items) {
        let line = lines.find((l) => Math.abs(l.y - item.transform[5]) < 3);
        if (!line) {
          line = { y: item.transform[5], items: [] };
          lines.push(line);
        }
        line.items.push(item);
      }
      for (const line of lines) {
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        if (
          line.items.some((t) => ["성명", "이름"].includes(normalize(t.str)))
        ) {
          anchors = line.items.map((t) => ({
            x: t.transform[4] + t.width / 2,
            label: t.str,
          }));
          rows.push(anchors.map((a) => a.label));
          continue;
        }
        if (!anchors.length) continue;
        const row = anchors.map(() => "");
        for (const t of line.items) {
          const x = t.transform[4] + t.width / 2;
          let index = 0;
          anchors.forEach((a, j) => {
            if (Math.abs(a.x - x) < Math.abs(anchors[index].x - x)) index = j;
          });
          row[index] += t.str;
        }
        const numberColumn = anchors.findIndex((a) =>
          ["번호", "출석번호"].includes(normalize(a.label)),
        );
        if (numberColumn >= 0 && !row[numberColumn].trim()) continue;
        rows.push(row);
      }
      page.cleanup();
    }
    if (!rows.length)
      throw new Error(
        "텍스트를 읽지 못했어요. 스캔 PDF는 XLSX로 받거나 직접 입력해 주세요.",
      );
    return rows;
  } finally {
    signal?.removeEventListener("abort", abort);
    await task.destroy();
  }
}
