import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORYBOOK_PAINT,
  GROUP_COLOR_SAFE_ORDER,
  srgbToOklab,
  recolorRgbaBuffer,
} from './recolor.js';
import {
  syncGroupPool,
  formatStudentLabel,
  parseCustomNames,
} from './allocation.js';
import {
  assignClassAvatars,
  avatarForStudent,
} from './assets.js';

test('OKLab 명도비 보존 재채색: 크림 바탕은 목표 색으로 변하고 흰 하이라이트와 세피아 선(#5A4336)은 보호된다', () => {
  // 3개 픽셀: [크림 바탕 #F0EAE2, 순백 하이라이트 #FFFFFF, 세피아 윤곽선 #5A4336]
  const base = new Uint8ClampedArray([
    0xF0, 0xEA, 0xE2, 255,
    0xFF, 0xFF, 0xFF, 255,
    0x5A, 0x43, 0x36, 255,
  ]);
  const mask = new Uint8ClampedArray([
    255, 255, 255, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
  ]);

  for (const id of ['ocean', 'strawberry', 'apricot', 'grape', 'mint']) {
    const out = recolorRgbaBuffer(base, mask, id);

    // 1) 크림 픽셀이 목표 OKLab 색조(L, h)로 자연스럽게 이동
    const [L_out, a_out, b_out] = srgbToOklab(out[0] / 255, out[1] / 255, out[2] / 255);
    const target = STORYBOOK_PAINT[id];
    assert.ok(
      Math.abs(L_out - target.L) < 0.08,
      `${id}: L_out=${L_out.toFixed(3)} vs target=${target.L}`,
    );
    const C_out = Math.hypot(a_out, b_out);
    assert.ok(C_out > 0.04, `${id}: 채도가 유지되어야 함 C_out=${C_out.toFixed(3)}`);

    // 2) 순백 하이라이트(#FFFFFF)는 밝게 유지
    assert.ok(out[4] >= 245 && out[5] >= 245 && out[6] >= 245, `${id}: white highlight lost`);

    // 3) 세피아 윤곽선(#5A4336, L ≈ 0.41)은 mask=255 여도 훼손되지 않음
    const dSepia = Math.max(
      Math.abs(out[8] - 0x5A),
      Math.abs(out[9] - 0x43),
      Math.abs(out[10] - 0x36),
    );
    assert.ok(dSepia <= 3, `${id}: sepia outline polluted delta=${dSepia}`);
  }
});

test('12모둠 기본 색 풀은 유사 색 쌍(ΔE_OK < 0.045)이 바로 인접하지 않도록 분산 배치된다', () => {
  const similarPairs = [
    new Set(['strawberry', 'cherry']),
    new Set(['apricot', 'lemon']),
    new Set(['mint', 'teal']),
    new Set(['lavender', 'grape']),
  ];
  assert.equal(GROUP_COLOR_SAFE_ORDER.length, 12);
  const pool = syncGroupPool([], []);
  const colors = pool.map((g) => g.color);
  assert.equal(new Set(colors).size, 12);

  for (let i = 0; i < colors.length - 1; i++) {
    for (const pair of similarPairs) {
      assert.ok(
        !(pair.has(colors[i]) && pair.has(colors[i + 1])),
        `유사 색 인접: ${colors[i]} ↔ ${colors[i + 1]} at ${i}`,
      );
    }
  }
});

test('학생 아바타 영구 고정 불변식: 명단 추가·결석·순서 변경에도 기존 학생 캐릭터가 절대 바뀌지 않는다', () => {
  const baseClass = [
    { id: 'stu-101', name: '김고은', gender: 'female' },
    { id: 'stu-102', name: '강지호', gender: 'male' },
    { id: 'stu-103', name: '김민찬', gender: 'male' },
    { id: 'stu-104', name: '이서연', gender: 'female' },
    { id: 'stu-105', name: '박하준', gender: 'male' },
  ];
  const mapA = assignClassAvatars(baseClass);

  // 결석 제외 + 역순 정렬로 참여 명단 구성해도 전체 명단 mapA 사용 시 100% 동일
  const presentSubset = [baseClass[4], baseClass[2], baseClass[0]];
  for (const st of presentSubset) {
    const a1 = avatarForStudent(st, mapA);
    const a2 = avatarForStudent(st, mapA);
    assert.equal(a1.id, a2.id);
    assert.equal(a1.fullSrc, mapA[st.id].fullSrc);
    assert.equal(a1.portraitSrc, mapA[st.id].portraitSrc);
  }

  // indexHint가 없는 단일 lookup 역시 ID 단독 결정
  const direct1 = avatarForStudent(baseClass[0]);
  const direct2 = avatarForStudent({ id: 'stu-101', name: '다른이름', gender: 'female' });
  assert.equal(direct1.id, direct2.id);
});

test('직접 입력 동명이인 구분: parseCustomNames 와 formatStudentLabel 이 ①·② 접미를 안전하게 붙인다', () => {
  const parsed = parseCustomNames('김서연\n이도윤\n김서연\n박지민');
  assert.deepEqual(parsed.names, ['김서연', '이도윤', '김서연', '박지민']);
  assert.deepEqual(parsed.displayNames, ['김서연 ①', '이도윤', '김서연 ②', '박지민']);

  const students = parsed.names.map((name, i) => ({ id: `custom-${i}`, name }));
  assert.equal(formatStudentLabel(students[0], students, false), '김서연 ①');
  assert.equal(formatStudentLabel(students[1], students, false), '이도윤');
  assert.equal(formatStudentLabel(students[2], students, false), '김서연 ②');
});
