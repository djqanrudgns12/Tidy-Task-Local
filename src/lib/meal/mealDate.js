export function dateKey(date = new Date()) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}
/** @param {string} key */
export function fromKey(key) {
  return new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(4, 6)) - 1,
    Number(key.slice(6, 8)),
    12,
  );
}
/** @param {string} key @param {number} count */
export function addDays(key, count) {
  const d = fromKey(key);
  d.setDate(d.getDate() + count);
  return dateKey(d);
}
/** @param {string} key */
export function dateLabel(key) {
  return fromKey(key).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
/** @param {string} key */
export function weekDays(key) {
  const d = fromKey(key);
  const monday = addDays(key, -((d.getDay() + 6) % 7));
  return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
}
/** @param {string} month */
export function monthRange(month) {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(4, 6));
  return { start: `${month}01`, end: dateKey(new Date(y, m, 0, 12)) };
}
