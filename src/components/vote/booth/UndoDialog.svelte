<script lang="ts">
  // 다시 투표하기 팝업(투표판 오른쪽 위 [다시 투표하기] · 백스페이스, 2026-09-26 사용자 요청).
  // 학생은 키보드로 답합니다: Enter = 다시 투표하기, Esc · 백스페이스 = 아니요. 키는 VoteApp → Booth → ballot.js가 처리하고,
  // 이 창은 그림과 마우스 버튼만 맡습니다(버튼은 tabindex=-1이라 키보드 초점이 가지 않아 Enter가 두 번 들어가지 않음).
  // 어떤 표를 빼는지(누구를 골랐는지)는 보여 주지 않습니다 — 어느 표든 같은 팝업입니다(비밀 원칙).
  import { Undo2 } from 'lucide-svelte';
  let { onyes, onno } = $props<{ onyes: () => void; onno: () => void }>();
</script>

<div class="vt-undo-scrim" role="presentation" onpointerup={(e) => { if (e.target === e.currentTarget) onno(); }}>
  <div class="vt-undo-card vt-card vt-pop-in" role="alertdialog" aria-labelledby="vt-undo-title" aria-describedby="vt-undo-detail">
    <span class="vt-undo-icon" aria-hidden="true"><Undo2 size={30} /></span>
    <h2 id="vt-undo-title">방금 한 투표를 다시 할까요?</h2>
    <p id="vt-undo-detail">방금 들어간 표 1장을 빼고 처음부터 다시 골라요.</p>
    <small>방금 투표한 친구만 눌러 주세요 · 누구를 골랐는지는 보이지 않아요</small>
    <div class="vt-undo-actions">
      <button class="vt-btn big" tabindex="-1" onclick={onno}>아니요<kbd>Esc</kbd></button>
      <button class="vt-btn primary big" tabindex="-1" onclick={onyes}><Undo2 size={21} />다시 투표하기<kbd>Enter</kbd></button>
    </div>
  </div>
</div>

<style>
  /* 투표 부스 영역만 덮습니다(제목줄의 선생님 버튼·닫기는 그대로 누를 수 있게 제목줄(20)보다 아래). */
  .vt-undo-scrim {
    position: absolute;
    inset: 0;
    z-index: 15;
    display: grid;
    place-items: center;
    padding: 20px;
    background: color-mix(in srgb, var(--vt-ink) 24%, transparent);
    backdrop-filter: blur(2px);
  }
  .vt-undo-card {
    display: grid;
    justify-items: center;
    gap: 10px;
    width: min(560px, 100%);
    padding: clamp(24px, 3cqi, 36px) clamp(22px, 3cqi, 40px) clamp(20px, 2.4cqi, 30px);
    border-radius: 28px;
    text-align: center;
  }
  .vt-undo-icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 22px;
    background: color-mix(in srgb, var(--vt-accent) 14%, var(--vt-card));
    color: var(--vt-accent);
  }
  .vt-undo-card h2 {
    margin: 6px 0 0;
    font-size: clamp(24px, 2.8cqi, 36px);
    font-weight: 900;
    letter-spacing: -0.01em;
    word-break: keep-all;
  }
  .vt-undo-card p {
    margin: 0;
    font-size: clamp(16px, 1.7cqi, 21px);
    font-weight: 800;
    line-height: 1.5;
    word-break: keep-all;
  }
  .vt-undo-card small {
    color: var(--vt-muted);
    font-size: clamp(13px, 1.3cqi, 16px);
    font-weight: 700;
    word-break: keep-all;
  }
  .vt-undo-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
    margin-top: 12px;
  }
  /* 버튼 안의 키 이름: 이 버튼이 어느 키와 같은지 보여 줍니다(학생은 키보드로 답함). */
  .vt-undo-actions kbd {
    margin-left: 4px;
    padding: 2px 8px 3px;
    border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
    border-radius: 8px;
    font: inherit;
    font-size: 13px;
    font-weight: 800;
    opacity: 0.8;
  }
</style>
