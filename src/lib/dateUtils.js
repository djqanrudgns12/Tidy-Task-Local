// 날짜 계산 공용 함수 (마감일 뱃지·리마인더가 같은 기준을 쓰도록 한곳에 모읍니다)

// 오늘 날짜를 'YYYY-MM-DD'(로컬 시간) 문자열로 만듭니다. 알림 기록(lastNotified)의 기준입니다.
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 마감일 값을 Date로 바꿉니다.
// 왜 'YYYY-MM-DD'를 따로 처리하는가: new Date('2026-09-20')은 "영국 기준 자정"으로 해석되어
//   한국보다 시간이 늦은 지역에서는 하루 앞의 날짜가 됩니다. 로컬 자정으로 읽으면 어디서나 같은 날입니다.
//   (한국 시간에서는 예전 계산과 결과가 똑같습니다)
export function parseDeadline(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// 오늘부터 마감일까지 남은 날 수 (오늘=0, 지남=음수). 날짜로 읽을 수 없으면 NaN.
export function daysUntil(deadline, now = new Date()) {
  const due = parseDeadline(deadline);
  if (isNaN(due.getTime())) return NaN;
  return Math.ceil((startOfDay(due) - startOfDay(now)) / (1000 * 60 * 60 * 24));
}
