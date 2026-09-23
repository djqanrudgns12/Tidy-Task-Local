import { normalizeSettings } from "../toolkit/preferences.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyDocument,
  plainText,
  hasContent,
  equalDocuments,
  validateDocument,
} from "./document.js";
import {
  dateKey,
  shiftDate,
  parseDate,
  formatCompactDate,
  inPeriod,
  searchEntries,
} from "./dates.js";
import { NoticeSession } from "./session.js";
import {
  pickKey,
  allSelected,
  toggleAllKeys,
  describeKeys,
} from "./selection.js";
import { createPreviewRepository } from "./repository.js";
/** @param {string} text */
const doc = (text) => ({
  ...emptyDocument(),
  content: [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ],
});
function repo() {
  const data = new Map();
  return createPreviewRepository({
    getItem: /** @param {string} k */ (k) => data.get(k) || null,
    setItem: /** @param {string} k @param {string} v */ (k, v) => {
      data.set(k, v);
    },
  });
}
test("startup status uses neutral preparation copy", () => {
  const s = new NoticeSession(repo());
  assert.equal(s.status(), "준비 중");
  s.dispose();
});
/** @param {import('./types').Repository} [repository] */
async function session(repository = repo()) {
  const s = new NoticeSession(repository);
  await s.open("2026-09-21");
  return s;
}
test("local dates preserve month, leap and week boundaries", () => {
  assert.equal(shiftDate("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(formatCompactDate("2026-09-21"), "09-21(월)");
  assert.equal(formatCompactDate("2026-09-22"), "09-22(화)");
  assert.throws(() => parseDate("2026-02-29"));
  assert(inPeriod("2026-09-27", "week", "2026-09-21"));
  assert(!inPeriod("2026-09-20", "week", "2026-09-21"));
});
test("empty and reordered JSON documents are correctly recognized", () => {
  assert(!hasContent(doc(" \n\u200b")));
  assert(hasContent(doc("ㄱ😀")));
  const a = doc("가");
  const b = JSON.parse(JSON.stringify(a, Object.keys(a).sort()));
  assert(
    equalDocuments(a, { content: a.content, attrs: a.attrs, type: a.type }),
  );
  assert.equal(plainText(emptyDocument()), "");
  assert.throws(() => validateDocument(doc("가".repeat(100001))), /LIMIT/);
});
test("opening an untouched date does not create a record", async () => {
  const s = await session();
  await s.flush();
  assert.equal((await s.repository.list()).length, 0);
  s.dispose();
});
test("saved snapshot survives edited and empty drafts across reopen", async () => {
  const r = repo();
  const s = await session(r);
  s.edit(doc("색연필"), null);
  await s.save();
  s.edit(doc("색연필, 풀"), null);
  await s.flush();
  let record = await r.readDate("2026-09-21");
  assert.equal(plainText(record?.saved), "색연필");
  s.dispose();
  const reopened = await session(r);
  assert.equal(plainText(reopened.active?.doc), "색연필, 풀");
  reopened.edit(doc(""), null);
  await reopened.flush();
  await assert.rejects(() => reopened.save(), /EMPTY_CONTENT/);
  assert.equal(plainText((await r.readDate("2026-09-21"))?.saved), "색연필");
  reopened.dispose();
});
test("saving a newer edit never reopens the previous autosaved draft", async () => {
  const r = repo();
  const s = await session(r);
  s.edit(doc("이전 초안"), null);
  await s.flush();
  s.edit(doc("최종 저장"), null);
  await s.save();
  s.dispose();
  const next = await session(r);
  assert.equal(plainText(next.active?.doc), "최종 저장");
  assert.equal(next.status(), "저장됨");
  next.dispose();
});
test("typing immediately after save keeps click snapshot and newer draft", async () => {
  const s = await session();
  s.edit(doc("클릭 시점"), null);
  const saving = s.save();
  s.edit(doc("클릭 이후 입력"), null);
  const flush = s.flush();
  await saving;
  await flush;
  const r = await s.repository.readDate("2026-09-21");
  assert.equal(plainText(r?.saved), "클릭 시점");
  assert.equal(plainText(r?.draft), "클릭 이후 입력");
  assert.equal(plainText(s.active?.doc), "클릭 이후 입력");
  s.dispose();
});
test("a lost response retries the same operation without duplicate write", async () => {
  const r = repo();
  const execute = r.execute.bind(r);
  let lose = true;
  r.execute = async (cmd) => {
    const result = await execute(cmd);
    if (cmd.type === "draft" && lose) {
      lose = false;
      throw new Error("STORAGE_UNAVAILABLE");
    }
    return result;
  };
  const s = await session(r);
  s.edit(doc("복구"), null);
  await assert.rejects(() => s.flush());
  assert.equal(plainText(s.active?.doc), "복구");
  await s.flush();
  assert.equal((await r.list()).length, 1);
  assert.equal(s.status(), "초안 보관됨");
  s.dispose();
});
test("failed flush blocks navigation and retains current date", async () => {
  const r = repo();
  const execute = r.execute.bind(r);
  r.execute = async (cmd) => {
    if (cmd.type === "draft") throw new Error("STORAGE_UNAVAILABLE");
    return execute(cmd);
  };
  const s = await session(r);
  s.edit(doc("남겨둘 내용"), null);
  await assert.rejects(() => s.open("2026-09-22"));
  assert.equal(s.active?.key, "2026-09-21");
  s.dispose();
});
test("latest navigation wins when a previous read arrives last", async () => {
  const r = repo();
  const read = r.readDate.bind(r);
  r.readDate = async (key) => {
    if (key === "2026-09-22") await new Promise((r) => setTimeout(r, 30));
    return read(key);
  };
  const s = await session(r);
  await Promise.all([s.open("2026-09-22"), s.open("2026-09-23")]);
  assert.equal(s.active?.key, "2026-09-23");
  s.dispose();
});
test("deleted identity rejects a delayed write and a new day record has new ID", async () => {
  const s = await session();
  s.edit(doc("원본"), null);
  await s.save();
  const old = s.active?.id;
  await s.trash();
  assert.notEqual(s.active?.id, old);
  await assert.rejects(
    () =>
      s.repository.execute({
        type: "draft",
        id: old,
        expectedRevision: 3,
        dateKey: "2026-09-21",
        document: doc("부활 금지"),
        operationId: crypto.randomUUID(),
      }),
    /NOT_ACTIVE/,
  );
  s.dispose();
});
test("same-day restore conflict is explicit, replacement keeps both records", async () => {
  const s = await session();
  s.edit(doc("원본"), null);
  await s.save();
  await s.trash();
  const [deleted] = await s.repository.trashList();
  s.edit(doc("새 알림장"), null);
  await s.save();
  await assert.rejects(
    () =>
      s.repository.execute({
        type: "restore",
        id: deleted.id,
        expectedRevision: deleted.revision,
        operationId: crypto.randomUUID(),
      }),
    /CONFLICT/,
  );
  await s.repository.execute({
    type: "restore",
    id: deleted.id,
    expectedRevision: deleted.revision,
    replaceId: s.active?.id,
    replaceRevision: s.active?.revision,
    operationId: crypto.randomUUID(),
  });
  assert.equal(
    plainText((await s.repository.readDate("2026-09-21"))?.saved),
    "원본",
  );
  assert.equal((await s.repository.trashList()).length, 1);
  s.dispose();
});
test("search combines dates, draft text, periods and normalized query", () => {
  const entries = [
    {
      id: "a",
      dateKey: "2026-09-21",
      revision: 1,
      saved: null,
      draft: null,
      deletedAt: null,
      draftText: "준비물 풀",
    },
  ];
  assert.equal(
    searchEntries(entries, "2026.09.21", "month", "2026-09-22").length,
    1,
  );
  assert.equal(searchEntries(entries, "풀", "all", "2026-09-22").length, 1);
  assert.equal(searchEntries(entries, "풀", "month", "2026-10-01").length, 0);
});
test("lost deletion acknowledgement recovers without resurrecting a draft", async () => {
  const r = repo();
  const execute = r.execute.bind(r);
  let lose = true;
  r.execute = async (cmd) => {
    const result = await execute(cmd);
    if (cmd.type === "trash" && lose) {
      lose = false;
      throw new Error("STORAGE_UNAVAILABLE");
    }
    return result;
  };
  const s = await session(r);
  s.edit(doc("삭제"), null);
  await s.save();
  await assert.rejects(() => s.trash());
  await s.flush();
  assert.equal((await r.list()).length, 0);
  assert.equal((await r.trashList()).length, 1);
  assert.equal(s.active?.exists, false);
  s.dispose();
});
test("duplicate save clicks share a commit operation", async () => {
  const s = await session();
  s.edit(doc("한 번"), null);
  const first = s.save();
  const second = s.save();
  assert.equal(first, second);
  await first;
  assert.equal(s.active?.revision, 2);
  s.dispose();
});
test("purged IDs remain retired, including delayed first creation requests", async () => {
  const s = await session();
  s.edit(doc("삭제할 내용"), null);
  await s.save();
  await s.trash();
  const [entry] = await s.repository.trashList();
  await s.repository.execute({
    type: "purge",
    id: entry.id,
    expectedRevision: entry.revision,
    operationId: crypto.randomUUID(),
  });
  await assert.rejects(
    () =>
      s.repository.execute({
        type: "draft",
        id: entry.id,
        dateKey: entry.dateKey,
        expectedRevision: 0,
        document: doc("부활 금지"),
        operationId: crypto.randomUUID(),
      }),
    /NOT_ACTIVE/,
  );
  s.dispose();
});
test("unknown marks, attributes and executable markup cannot enter documents", () => {
  const d = doc("본문");
  assert.throws(
    () => validateDocument({ ...d, html: "<script>alert(1)</script>" }),
    /INVALID/,
  );
  assert.throws(
    () =>
      validateDocument({
        ...d,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "가",
                marks: [{ type: "link", attrs: { href: "javascript:1" } }],
              },
            ],
          },
        ],
      }),
    /INVALID/,
  );
});

test("formatting an untouched empty date does not create a draft", async () => {
  const s = await session();
  const d = emptyDocument("맑은고딕");
  s.edit(d, null);
  await s.flush();
  assert.equal((await s.repository.list()).length, 0);
  s.dispose();
});

test('toolkit migration adds only the new tool and honors later hiding',()=>{ const old=normalizeSettings({schemaVersion:2,toolkit:{visibleToolIds:[],hiddenPlatformIds:['clanner']}});assert.deepEqual(old.toolkit.visibleToolIds,['noticeboard','picker','tournament','focus-bell','dice','clock']);assert.deepEqual(old.toolkit.hiddenPlatformIds,['clanner']);assert.deepEqual(normalizeSettings({schemaVersion:3,toolkit:{visibleToolIds:[]}}).toolkit.visibleToolIds,['picker','tournament','focus-bell','dice','clock']);assert.deepEqual(normalizeSettings({schemaVersion:8,toolkit:{visibleToolIds:[]}}).toolkit.visibleToolIds,[]);});

const shown = ["2026-09-22", "2026-09-21", "2026-09-18", "2026-09-17"];
test("목록 선택: 누를 때마다 고르고 풀며, 기준점은 마지막에 누른 날짜", () => {
  const first = pickKey([], shown, "2026-09-21");
  assert.deepEqual(first, { selected: ["2026-09-21"], anchor: "2026-09-21" });
  const off = pickKey(first.selected, shown, "2026-09-21");
  assert.deepEqual(off.selected, []);
});
test("목록 선택: Shift는 기준점부터 누른 곳까지를 더하기만 한다", () => {
  const start = pickKey([], shown, "2026-09-22");
  const range = pickKey(start.selected, shown, "2026-09-17", {
    shift: true,
    anchor: start.anchor,
  });
  assert.deepEqual(range.selected, shown);
  assert.equal(range.anchor, "2026-09-22", "기준점은 그대로 남는다");
  // 거꾸로 올라가도 같은 범위, 이미 고른 항목은 풀리지 않는다.
  const back = pickKey(["2026-09-18"], shown, "2026-09-22", {
    shift: true,
    anchor: "2026-09-17",
  });
  assert.deepEqual([...back.selected].sort(), [...shown].sort());
});
test("목록 선택: 기준점이 목록에서 사라졌으면 Shift도 한 개만 고른다", () => {
  const picked = pickKey([], shown, "2026-09-18", {
    shift: true,
    anchor: "2026-01-01",
  });
  assert.deepEqual(picked.selected, ["2026-09-18"]);
});
test("전체 선택은 보이는 항목만 다루고, 숨은 선택은 건드리지 않는다", () => {
  const hidden = ["2026-08-01"];
  const all = toggleAllKeys(hidden, shown);
  assert.deepEqual(all, [...hidden, ...shown]);
  assert.equal(allSelected(all, shown), true);
  const cleared = toggleAllKeys(all, shown);
  assert.deepEqual(cleared, hidden, "걸러져 보이지 않던 선택은 남는다");
  assert.equal(allSelected([], []), false, "빈 목록은 '전체 선택됨'이 아니다");
});
test("확인 문구는 날짜를 6개까지만 적고 나머지는 세어 준다", () => {
  assert.equal(describeKeys(["2026-09-22"]), "09-22(화)");
  assert.equal(
    describeKeys([...shown, "2026-09-16", "2026-09-15", "2026-09-14"]),
    "09-22(화), 09-21(월), 09-18(금), 09-17(목), 09-16(수), 09-15(화) 외 1일",
  );
});
