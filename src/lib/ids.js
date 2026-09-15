// 새 할 일의 고유 ID를 만듭니다.
// 왜 Date.now()가 아닌가: 같은 밀리초에 여러 개를 만들거나(붙여넣기·가져오기) 서로 다른 창에서 만들면
//   ID가 겹칠 수 있고, 겹친 ID는 목록 표시 오류나 리마인더 누락으로 이어졌습니다.
//   (기존 할 일의 ID는 그대로 두므로 저장 데이터 호환에는 영향이 없습니다)
export function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
