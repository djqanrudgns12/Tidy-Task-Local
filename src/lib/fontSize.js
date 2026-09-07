// ✨ [공용] 글자 크기 프리셋 + 표출 정규화 유틸 (레거시 없이 순수 JS)
// 왜 별도 모듈인가: MainToolbar·FloatingRTE·ArchiveToolbar·ArchiveWindow 등 여러 곳에서
//   동일한 프리셋/정규화 로직을 공유해야 하므로 단일 소스로 관리합니다.

// 사진2(오피스 표준) 기준으로 확장한 프리셋 목록(pt)
export const FONT_SIZE_PRESETS = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 40,
  48, 56, 72, 96, 128, 160, 200, 256, 320, 400, 500
];

// Tidy Task(메인)·아카이브 등 "안정 표출 환경"의 최대 글자 크기(pt)
// 왜 40인가: 제목/강조에 충분히 크면서도 카드·행 레이아웃을 무너뜨리지 않는 균형점(사용자 확정).
export const STABLE_MAX_PT = 40;

// ✨ 인라인 font-size가 maxPt를 넘으면 "표출용으로만" maxPt로 낮춘 HTML을 반환합니다.
// 왜 원본을 바꾸지 않는가: 저장 데이터는 원본(예: Tiny Note의 120pt)을 유지해야
//   '꺼내기(복원)' 시 원래 크기로 되살아나기 때문입니다. 캡은 화면 표출 계층에서만 적용됩니다.
export function clampFontSizeHtml(html, maxPt = STABLE_MAX_PT) {
  if (!html || typeof document === 'undefined') return html || '';
  // font-size가 아예 없으면 파싱 비용을 아낍니다.
  if (!/font-size/i.test(html)) return html;

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  tmp.querySelectorAll('[style*="font-size" i]').forEach((el) => {
    const fs = el.style.fontSize;
    if (!fs) return;
    const num = parseFloat(fs);
    if (isNaN(num)) return;
    // px는 pt로 근사 변환(1pt ≈ 1.333px), 그 외(pt/무단위)는 pt로 간주
    const pt = /px\s*$/i.test(fs) ? num * 0.75 : num;
    if (pt > maxPt) el.style.fontSize = `${maxPt}pt`;
  });

  return tmp.innerHTML;
}
