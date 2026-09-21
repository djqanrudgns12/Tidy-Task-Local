export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** @param {string} key */
export function parseDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("INVALID_DATE");
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(2000, m - 1, d, 12);
  date.setFullYear(y);
  if (y < 1900 || y > 9999 || dateKey(date) !== key)
    throw new Error("INVALID_DATE");
  return date;
}
/** @param {string} key @param {number} delta */
export function shiftDate(key, delta) {
  const d = parseDate(key);
  d.setDate(d.getDate() + delta);
  const k = dateKey(d);
  parseDate(k);
  return k;
}
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
/** @param {string} key */
export const formatDate = (key) => dateFormatter.format(parseDate(key));
const shortWeekdays = ["일", "월", "화", "수", "목", "금", "토"];
/** @param {string} key */
export function formatCompactDate(key) {
  const date = parseDate(key);
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}(${shortWeekdays[date.getDay()]})`;
}
/** @param {string} key @param {string} period @param {string} today */
export function inPeriod(key, period, today) {
  if (period === "month") return key.slice(0, 7) === today.slice(0, 7);
  if (period === "week") {
    const day = (parseDate(today).getDay() + 6) % 7;
    const start = shiftDate(today, -day);
    return key >= start && key <= shiftDate(start, 6);
  }
  return true;
}
/** @param {import("./types").Entry[]} entries @param {string} query @param {string} period @param {string} today */
export function searchEntries(entries, query, period, today) {
  const q = query.normalize("NFC").toLocaleLowerCase().trim();
  return entries
    .filter((e) => {
      if (!inPeriod(e.dateKey, period, today)) return false;
      const d = parseDate(e.dateKey),
        key = e.dateKey;
      return [
        key,
        key.replaceAll("-", "."),
        key.replaceAll("-", "/"),
        formatDate(key),
        `${d.getMonth() + 1}월 ${d.getDate()}일`,
        e.savedText,
        e.draftText,
      ].some((v) => (v || "").normalize("NFC").toLocaleLowerCase().includes(q));
    })
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}
