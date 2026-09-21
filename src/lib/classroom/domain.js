export const genders = [
  { value: "unspecified", label: "미선택" },
  { value: "male", label: "남" },
  { value: "female", label: "여" },
];
/** @param {unknown} s */
export const cleanName = (s) => String(s).normalize("NFC").trim();
/** @param {any[]} students */
export const nextNumber = (students) =>
  Math.max(0, ...students.map((s) => Number(s.number) || 0)) + 1;
/** @param {any[]} students */
export function validateStudents(students) {
  const numbers = new Set();
  for (const s of students) {
    if (
      !Number.isInteger(Number(s.number)) ||
      Number(s.number) < 1 ||
      Number(s.number) > 9999 ||
      numbers.has(Number(s.number))
    )
      throw new Error("번호는 1~9999의 서로 다른 숫자여야 해요.");
    numbers.add(Number(s.number));
    if (
      !cleanName(s.name) ||
      cleanName(s.name).length > 80 ||
      /[\u0000-\u001f\u007f]/u.test(s.name)
    )
      throw new Error("학생 이름을 확인해 주세요.");
    if (s.gender != null && !genders.some((g) => g.value === s.gender))
      throw new Error("성별을 확인해 주세요.");
  }
  if (students.length > 500)
    throw new Error("한 학급은 500명까지 등록할 수 있어요.");
}
/** @param {any[]} candidates @param {any[]} existing */
export function reconcile(candidates, existing) {
  let next = nextNumber(existing);
  return candidates.map((c) => {
    const number = c.number === "" ? next++ : Number(c.number);
    const exact = existing.filter(
      (s) => s.number === number && cleanName(s.name) === cleanName(c.name),
    );
    const possible = existing.filter(
      (s) => s.number === number || cleanName(s.name) === cleanName(c.name),
    );
    return {
      ...c,
      number,
      name: cleanName(c.name),
      id: exact.length === 1 ? exact[0].id : null,
      needsMatch: exact.length !== 1 && possible.length > 0,
      include: true,
    };
  });
}
/** @param {string} classId @param {any[]} candidates @param {any[]} existing @param {string[]} [deleteIds] */
export function importCommand(classId, candidates, existing, deleteIds = []) {
  const selected = candidates.filter((c) => c.include);
  if (selected.some((c) => c.issue || c.needsMatch))
    throw new Error("확인이 필요한 항목을 먼저 수정해 주세요.");
  const ids = selected.filter((c) => c.id).map((c) => c.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("한 학생을 두 행에 연결할 수 없어요.");
  const inputs = selected.map((c) => ({
    id: c.id || null,
    number: Number(c.number),
    name: cleanName(c.name),
    gender: c.gender ?? null,
  }));
  const final = existing
    .filter((s) => !ids.includes(s.id) && !deleteIds.includes(s.id))
    .concat(inputs);
  validateStudents(final);
  return { type: "saveStudents", classId, students: inputs, deleteIds };
}
// Headerless paste is explicitly a list of names. Tabular paste requires headers.
/** @param {string} text */
export function pastedNames(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ number: "", name, gender: null, issue: "" }));
}
