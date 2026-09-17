<script>
  import { onMount } from 'svelte';
  import { getAnalyticsStatus, setAnalyticsConsent } from '../lib/analytics.js';
  let { prompt = false, dark = false } = $props();
  /** @type {import('../lib/analytics.js').AnalyticsStatus|null} */
  let status = $state(null);
  let busy = $state(false);
  let error = $state('');
  let dismissed = $state(false);
  onMount(() => {
    let alive = true;
    const refresh = () => getAnalyticsStatus().then(value => { if (alive) status = value; }).catch(() => {
      if (alive) error = '통계 설정을 불러오지 못했어요.';
    });
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(timer); };
  });
  /** @param {boolean} enabled */
  async function choose(enabled) {
    busy = true; error = '';
    try { status = await setAnalyticsConsent(enabled); dismissed = true; }
    catch { error = '설정을 저장하지 못했어요. 다시 시도해 주세요.'; }
    finally { busy = false; }
  }
</script>

{#if !prompt || (status?.configured && status.consent === null && !dismissed)}
  <section class="analytics" class:prompt class:dark aria-label="사용 통계 설정">
    <h2>{prompt ? '앱 개선에 참여해 주세요' : '사용 통계'}</h2>
    <p>참여하면 무작위 설치 ID, 사용 시각·횟수, 사용한 기능, 앱 버전, 운영체제·아키텍처, 오류 종류를 PostHog({status?.region || 'US'})로 보냅니다.</p>
    <p>메모·할 일 내용, 학교명, 파일 경로는 수집하지 않습니다. 설정에서 언제든 끌 수 있습니다.</p>
    {#if !status}
      <p role="status">통계 설정을 확인하고 있어요.</p>
    {:else if !status.configured}
      <p class="status">이 빌드는 통계 서버가 연결되지 않아 수집하지 않습니다.</p>
    {:else}
      {#if !prompt}
        <p class="status" role="status">
          {status.consent === true ? '참여 중' : '수집 안 함'}
          {#if status.consent === true}
            · 전송 대기 {status.queued}건
            {#if status.transport === 'configuration_error'} · 연결 설정 확인 필요
            {:else if status.transport === 'retrying'} · 연결되면 다시 전송
            {:else if status.transport === 'storage_error'} · 통계 저장 실패
            {:else if status.last_sent} · 최근 전송 {new Date(status.last_sent * 1000).toLocaleTimeString('ko-KR')}
            {/if}
          {/if}
        </p>
      {/if}
      <div class="actions">
        {#if status.consent !== true}
          <button class="primary" disabled={busy} onclick={() => choose(true)}>통계 참여</button>
        {/if}
        {#if status.consent !== false}
          <button disabled={busy} onclick={() => choose(false)}>{status.consent === true ? '참여 중지' : '참여 안 함'}</button>
        {/if}
      </div>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  .analytics { padding: 14px; border: 1px solid #d6dce1; border-radius: 12px; color: #263442; background: #f8fafb; font-family: sans-serif; }
  .analytics.dark { background: #252b34; color: #edf2f7; border-color: #536070; }
  .prompt { position: fixed; z-index: 100000; left: 10px; right: 10px; bottom: 10px; max-height: calc(100vh - 20px); overflow-y: auto; box-shadow: 0 4px 20px #0003; }
  h2 { font-size: 14px; margin: 0 0 8px; font-weight: 700; }
  p { font-size: 12px; line-height: 1.6; margin: 6px 0; overflow-wrap: anywhere; }
  .status { font-weight: 600; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  button { border: 1px solid #a8b4bf; background: transparent; color: inherit; border-radius: 7px; padding: 8px 12px; font-size: 12px; cursor: pointer; }
  button.primary { background: #1e5963; color: white; border-color: #1e5963; }
  button:focus-visible { outline: 2px solid #278795; outline-offset: 3px; }
  button:disabled { opacity: .6; cursor: wait; }
</style>
