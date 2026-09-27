<script lang="ts">
  // 선생님 버튼을 누르면 먼저 뜨는 경고(PRD 7절). 버튼은 마우스로만 눌립니다:
  // tabindex=-1이라 키보드 초점이 가지 않고, Enter·Space는 창 전체의 키 잡기가 막습니다. Esc는 닫기만 합니다.
  import { Lock } from 'lucide-svelte';
  // action: 경고를 지나 바로 실행할 일(예: 개표 시작). 없으면 [메뉴 열기]만 있습니다.
  let { onopen, onclose, action = null } = $props<{ onopen: () => void; onclose: () => void; action?: { label: string; run: () => void } | null }>();
</script>

<div class="vt-scrim" role="presentation" onpointerup={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="vt-warn vt-card vt-pop-in" role="alertdialog" aria-label="선생님 전용 메뉴">
    <span class="vt-warn-icon"><Lock size={26} /></span>
    <h2>선생님 전용 메뉴예요</h2>
    <p>학생은 누르지 말아 주세요.<br />투표 중인 친구가 있다면 끝날 때까지 기다려 주세요.</p>
    <div class="vt-warn-actions">
      <button class="vt-btn" tabindex="-1" onpointerup={onclose}>닫기</button>
      <button class="vt-btn" class:primary={!action} tabindex="-1" onpointerup={onopen}>메뉴 열기</button>
      {#if action}<button class="vt-btn primary" tabindex="-1" onpointerup={action.run}>{action.label}</button>{/if}
    </div>
  </div>
</div>

<style>
  .vt-scrim {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--vt-ink) 28%, transparent);
    backdrop-filter: blur(2px);
  }
  .vt-warn {
    width: min(420px, calc(100% - 40px));
    padding: 28px 28px 22px;
    text-align: center;
  }
  .vt-warn-icon {
    display: inline-grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--vt-gold) 45%, var(--vt-card));
    color: #6d5313;
  }
  .vt-warn h2 {
    margin: 14px 0 8px;
    font-size: 21px;
  }
  .vt-warn p {
    margin: 0;
    color: var(--vt-muted);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.6;
  }
  .vt-warn-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 20px;
  }
</style>
