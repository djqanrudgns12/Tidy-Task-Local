/** 메뉴가 숨겨진 채 로딩 중이어도 첫 요청을 잃지 않도록 준비 응답을 기다립니다.
 * @param {{token:string, subscribe:(handler:(token:string)=>void)=>Promise<()=>void>, ping:()=>Promise<unknown>, timeoutMs?:number, retryMs?:number}} options
 */
export async function waitForMenuReady({ token, subscribe, ping, timeoutMs = 5000, retryMs = 150 }) {
  /** @type {ReturnType<typeof setInterval>|undefined} */ let timer;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let deadline;
  let off = () => {};
  let finished = false;
  try {
    await new Promise((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('우클릭 메뉴 준비 시간이 초과되었습니다.')), timeoutMs);
      void subscribe(received => { if (received === token) resolve(undefined); }).then(unlisten => {
        if (finished) { unlisten(); return; }
        off = unlisten;
        const probe = () => { void ping().catch(() => {}); };
        timer = setInterval(probe, retryMs);
        probe();
      }, reject);
    });
  } finally {
    finished = true;
    clearTimeout(deadline);
    clearInterval(timer);
    off?.();
  }
}
