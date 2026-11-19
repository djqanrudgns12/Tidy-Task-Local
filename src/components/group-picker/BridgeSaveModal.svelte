<script lang="ts">
  import { X, UsersRound, Trophy } from 'lucide-svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';

  let {
    open,
    isCustomMode,
    className,
    groupCount,
    busy = false,
    onClose,
    onConfirm,
  } = $props<{
    open: boolean;
    isCustomMode: boolean;
    className: string;
    groupCount: number;
    busy?: boolean;
    onClose: () => void;
    onConfirm: (opts: {
      saveRoster: boolean;
      syncScoreboard: boolean;
      resetScores: boolean;
      openScoreboardAfter: boolean;
    }) => void;
  }>();

  let dialogEl = $state<HTMLDialogElement>();
  let saveRoster = $state(true);
  let syncScoreboard = $state(true);
  let resetScores = $state(true);
  let openScoreboardAfter = $state(false);

  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      saveRoster = !isCustomMode;
      syncScoreboard = groupCount >= 2 && groupCount <= 12;
      dialogEl.showModal();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  const canScoreboard = $derived(groupCount >= 2 && groupCount <= 12);
</script>

<dialog
  class="gp-dialog"
  bind:this={dialogEl}
  aria-labelledby="gp-bridge-title"
  oncancel={(e) => {
    e.preventDefault();
    if (!busy) onClose();
  }}
>
  <div class="gp-dialog-inner">
    <header class="gp-dialog-head">
      <h2 id="gp-bridge-title">학급 명단 · 모둠 점수판 반영</h2>
      <button type="button" class="gp-icon-btn" aria-label="닫기" disabled={busy} onclick={onClose}><X size={18} /></button>
    </header>

    <div class="gp-dialog-body">
      <div class="gp-rule-card">
        <div class="gp-rule-row">
          <div style="display:flex; align-items:flex-start; gap:8px">
            <UsersRound size={18} style="margin-top:2px; color:var(--gp-accent)" />
            <div>
              <strong style="font-size:13.5px">학급 명단({className})에 모둠 저장</strong>
              <div style="font-size:11.5px; color:var(--gp-muted)">
                {#if isCustomMode}
                  직접 입력 명단에서는 학급 DB에 저장할 수 없어요. 아래 점수판 동기화만 쓸 수 있습니다.
                {:else}
                  개인 점수판과 자리 배치에도 새 모둠이 즉시 반영되며, 결석생은 미배정으로 남고 1회 실행 취소가 가능해요.
                {/if}
              </div>
            </div>
          </div>
          <ToolkitSwitch
            checked={!isCustomMode && saveRoster}
            label="학급 명단에 모둠 저장"
            disabled={isCustomMode || busy}
            onchange={(v) => (saveRoster = v)}
          />
        </div>
      </div>

      <div class="gp-rule-card">
        <div class="gp-rule-row">
          <div style="display:flex; align-items:flex-start; gap:8px">
            <Trophy size={18} style="margin-top:2px; color:var(--gp-accent)" />
            <div>
              <strong style="font-size:13.5px">모둠 점수판도 새 결과로 맞추기</strong>
              <div style="font-size:11.5px; color:var(--gp-muted)">
                열려 있는 모둠 점수판 창의 카드 이름·모양·색깔을 뽑힌 {groupCount}모둠으로 즉시 바꿉니다.
              </div>
            </div>
          </div>
          <ToolkitSwitch
            checked={canScoreboard && syncScoreboard}
            label="모둠 점수판 동기화"
            disabled={!canScoreboard || busy}
            onchange={(v) => (syncScoreboard = v)}
          />
        </div>

        {#if canScoreboard && syncScoreboard}
          <div style="display:flex; flex-direction:column; gap:6px; padding-left:26px; padding-top:4px">
            <label style="display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; cursor:pointer">
              <input type="radio" name="gp-score-reset" checked={resetScores} onchange={() => (resetScores = true)} />
              점수를 0점으로 새로 시작하기 (추천)
            </label>
            <label style="display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:700; cursor:pointer">
              <input type="radio" name="gp-score-reset" checked={!resetScores} onchange={() => (resetScores = false)} />
              기존 점수 그대로 유지하고 이름만 바꾸기
            </label>
            <label style="display:flex; align-items:center; gap:7px; font-size:12px; color:var(--gp-muted); cursor:pointer; margin-top:2px">
              <input type="checkbox" bind:checked={openScoreboardAfter} />
              반영 후 모둠 점수판 창 바로 열기
            </label>
          </div>
        {/if}
      </div>
    </div>

    <footer class="gp-dialog-foot">
      <span style="font-size:11.5px; color:var(--gp-muted)">
        {(!saveRoster && !syncScoreboard) ? '하나 이상 선택해 주세요.' : '저장 중에도 기존 자리 배치 기록은 안전하게 지켜집니다.'}
      </span>
      <div class="gp-toolbar-group">
        <button type="button" class="gp-pill-btn" disabled={busy} onclick={onClose}>취소</button>
        <button
          type="button"
          class="gp-pill-btn active"
          disabled={busy || (!saveRoster && !syncScoreboard)}
          onclick={() => onConfirm({ saveRoster: !isCustomMode && saveRoster, syncScoreboard: canScoreboard && syncScoreboard, resetScores, openScoreboardAfter })}
        >{busy ? '반영하는 중…' : '적용하기'}</button>
      </div>
    </footer>
  </div>
</dialog>
