// 비동기 작업을 "한 줄로 세워" 하나씩 실행하는 큐입니다.
// 왜 필요한가: 저장은 "읽기 → 고치기 → 쓰기" 구조라 두 작업이 겹치면
//   나중 작업이 옛 값을 읽어 앞 작업의 결과를 덮어씁니다. 한 번에 하나씩만 돌리면
//   같은 창 안에서의 이런 경합(race)이 원천 차단됩니다.
export function createSerialQueue() {
  let tail = Promise.resolve();

  return {
    // task의 결과(또는 오류)를 그대로 돌려줍니다.
    // 실패해도 다음 작업이 멈추지 않도록 체인은 성공/실패 양쪽에서 이어 줍니다.
    /**
     * @template T
     * @param {() => Promise<T> | T} task
     * @returns {Promise<T>}
     */
    enqueue(task) {
      const run = tail.then(task, task);
      tail = run.then(() => {}, () => {});
      return run;
    },
    // 지금까지 줄에 선 작업이 모두 끝나면 풀리는 Promise (창을 닫기 전 대기용)
    settled() {
      return tail;
    },
  };
}
