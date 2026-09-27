<script lang="ts">
  // 개표 대기(PRD 6절 "모두 투표했어요"): 자물쇠가 잠긴 투표함 + [개표 시작]. 개표 시작은 선생님 버튼(경고 팝업)을 거칩니다.
  import BallotBox from '../art/BallotBox.svelte';
  import { modeName as nameOfMode } from '../../../lib/vote/model.js';
  let { session, reduced, onteacher } = $props<{ session: any; reduced: boolean; onteacher: () => void }>();
  const all = $derived(session.ballots.length >= session.rules.voters);
  const modeName = $derived(nameOfMode(session.reveal.mode, session.type === 'yesno'));
</script>

<section class="vt-closed vt-stage-enter">
  <div class="vt-closed-art"><BallotBox size={280} state="locked" fill={1} /></div>
  <h2>{all ? `${session.rules.voters}명 모두 투표했어요!` : '투표를 마감했어요'}</h2>
  <p>{all ? '선생님이 개표를 시작할 거예요' : `${session.rules.voters}명 중 ${session.ballots.length}명이 투표했어요`}</p>
  <div class="vt-closed-mode"><span>개표 방법</span><b>{modeName}</b></div>
  <button class="vt-btn primary big" tabindex="-1" onclick={onteacher}>선생님: 개표 시작하기</button>
</section>

<style>
  .vt-closed {
    flex: 1;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
  }
  .vt-closed-art {
    margin-bottom: 6px;
  }
  .vt-closed h2 {
    margin: 0;
    font-size: clamp(30px, 4.4cqi, 62px);
    font-weight: 900;
    letter-spacing: -0.02em;
  }
  .vt-closed p {
    margin: 0;
    color: var(--vt-muted);
    font-size: clamp(16px, 1.9cqi, 26px);
    font-weight: 800;
  }
  .vt-closed-mode {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin: 10px 0 8px;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--vt-soft);
    font-size: 16px;
  }
  .vt-closed-mode span {
    color: var(--vt-muted);
    font-weight: 800;
  }
</style>
