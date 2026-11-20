<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { native } from "../../lib/toolkit/store.js";
  import {
    watchAppearance,
    appearanceStyle,
    uiFontStack,
  } from "../../lib/toolkit/appearance.js";
  import { numeralStyleFor } from "../../lib/toolkit/fontMetrics.js";
  import { TIMER_KINDS } from "../../lib/toolkit/preferences.js";
  import { closeWindow } from "../../lib/toolkit/windows.js";
  import ToolkitToolbar from "./ToolkitToolbar.svelte";
  import ToolkitMenu from "./ToolkitMenu.svelte";
  import "../../lib/toolkit/toolkit.css";
  // 툴바·메뉴 창은 늘 떠 있으므로 가볍게 둡니다. 설정·타이머는 그 창을 열 때만 불러옵니다.
  let { label } = $props<{ label: string }>();
  let appearance = $state<Record<string, any>>({});
  // 큰 숫자를 글꼴에 맞춰 배치하는 측정값(CSS 변수). 비어 있으면 CSS의 기본값(기본 글꼴 기준)을 씁니다.
  let numerals = $state("");
  const role = $derived(
    label.startsWith("timer-") ? label.split("-")[1] : label,
  );
  const rootStyle = $derived(appearanceStyle(appearance) + numerals);
  $effect(() => {
    document.documentElement.style.cssText = rootStyle;
  });
  // 왜 타이머 창만 재는가: 큰 숫자 시계는 타이머에만 있고, 늘 떠 있는 툴바·메뉴는 가볍게 두려는 것입니다.
  // 글꼴이 바뀌거나(설정 변경) 글꼴 파일이 뒤늦게 도착하면(loadingdone) 다시 잽니다.
  $effect(() => {
    if (!TIMER_KINDS.includes(role)) return;
    const stack = uiFontStack(appearance);
    let current = true;
    const measure = () =>
      void numeralStyleFor(stack)
        .then((style) => {
          if (current) numerals = style;
        })
        .catch(() => {});
    measure();
    document.fonts.addEventListener("loadingdone", measure);
    return () => {
      current = false;
      document.fonts.removeEventListener("loadingdone", measure);
    };
  });
  onMount(() => {
    let disposed = false;
    let off = () => {};
    void watchAppearance((a) => {
      if (!disposed) appearance = a;
    })
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      })
      .catch(() => {});
    if (native && !role.endsWith("-menu") && role !== "toolkit" && role !== "thermometer-display" && role !== "dday")
      void getCurrentWindow()
        .show()
        .then(() => getCurrentWindow().setFocus());
    return () => {
      disposed = true;
      off();
    };
  });
</script>

<div class="tk-root" style={rootStyle}>
  {#if role === "toolkit"}<ToolkitToolbar />
  {:else if role === "toolkit-settings"}{#await import('./ToolkitSettings.svelte')}<div
        aria-label="툴킷 설정 준비 중"
      ></div>{:then module}<!-- 왜 경계로 감싸는가(6.0.1): 설정 화면이 그리다 멈추면 창은 이미 보이는(show) 상태라
        투명한 빈 창이 화면 가운데 남아 툴바 클릭·이동을 가로챘습니다. 실패하면 보이는 안내와 닫기 버튼을 그립니다. --><svelte:boundary
        onerror={(cause) => console.error("툴킷 설정 화면 오류", cause)}
        ><module.default />{#snippet failed()}<div class="tk-crash" role="alert">
            <p>설정 화면을 그리지 못했어요.<br />창을 닫고 다시 열어 주세요.</p>
            <button type="button" onclick={() => void closeWindow()}>창 닫기</button>
          </div>{/snippet}</svelte:boundary
      >{:catch}<div class="tk-crash" role="alert">
        <p>설정 화면을 불러오지 못했어요.<br />창을 닫고 다시 열어 주세요.</p>
        <button type="button" onclick={() => void closeWindow()}>창 닫기</button>
      </div>{/await}
  {:else if role === "toolkit-menu"}<ToolkitMenu />
  {:else if role === "toolkit-picker-menu"}<ToolkitMenu kind="picker" />
  {:else if role === "toolkit-scoreboard-menu"}<ToolkitMenu kind="scoreboard" />
  {:else if role === "toolkit-external-menu"}<ToolkitMenu kind="external" />
  {:else if role === "toolkit-more-menu"}<ToolkitMenu kind="more" />
  {:else if role === "toolkit-context-menu"}<ToolkitMenu kind="context" />
  {:else if role === "focus-bell"}{#await import('../focus-bell/FocusBellApp.svelte')}<p>집중벨을 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">집중벨을 불러오지 못했어요. 창을 다시 열어주세요.</p>{/await}
  {:else if role === "tournament"}{#await import('../tournament/TournamentApp.svelte')}<p>토너먼트를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">토너먼트를 불러오지 못했어요.</p>{/await}
  {:else if role.startsWith("scoreboard-")}{#await import('../scoreboard/ScoreboardApp.svelte')}<p>점수판을 준비하고 있어요…</p>{:then module}<module.default kind={role.slice("scoreboard-".length)} />{:catch}<p role="alert">점수판을 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "thermometer-display"}{#await import('../thermometer/ThermometerDisplay.svelte')}<p>미니 온도계를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">미니 온도계를 불러오지 못했어요.</p>{/await}
  {:else if role === "dday"}{#await import('../dday/DdayWidget.svelte')}<p>D-Day 위젯을 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">D-Day 위젯을 불러오지 못했어요.</p>{/await}
  {:else if role === "thermometer"}{#await import('../thermometer/ThermometerApp.svelte')}<p>학급 온도계를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">학급 온도계를 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "vote"}{#await import('../vote/VoteApp.svelte')}<p>학급 투표를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">학급 투표를 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "seating" || role === "seating-teacher"}{#await import('../seating/SeatingApp.svelte')}<p>교실을 준비하고 있어요…</p>{:then module}<module.default teacherOnly={role === 'seating-teacher'} />{:catch}<p role="alert">자리 배치를 불러오지 못했어요.</p>{/await}
  {:else if role === "seating-display"}{#await import('../seating/SeatingDisplayApp.svelte')}<p>교실을 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">공개 화면을 불러오지 못했어요.</p>{/await}
  {:else if role === "vote-teacher"}{#await import('../vote/VoteTeacherApp.svelte')}<p>선생님 창을 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">선생님 창을 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "dice"}{#await import('../dice/DiceApp.svelte')}<p>주사위를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">주사위를 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "clock"}{#await import('../clock/ClockApp.svelte')}<p>시계를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">시계를 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "picker"}{#await import('../picker/PickerApp.svelte')}<p>뽑기를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">뽑기 화면을 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "picker-group"}{#await import('../group-picker/GroupPickerApp.svelte')}<p>모둠원 뽑기를 준비하고 있어요…</p>{:then module}<module.default />{:catch}<p role="alert">모둠원 뽑기를 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}
  {:else if role === "noticeboard"}{#await import('../noticeboard/NoticeboardApp.svelte')}<div
        aria-label="알림장 준비 중"
      ></div>{:then module}<module.default
      />{/await}{:else if role === "roster"}{#await import('../classroom/RosterApp.svelte')}<p
      >
        학급 명단을 불러오고 있어요…
      </p>{:then module}<module.default
      />{/await}{:else if TIMER_KINDS.includes(role)}{#await import('../timers/TimerApp.svelte')}<div
        aria-label="타이머 준비 중"
      ></div>{:then module}<module.default kind={role} />{:catch}<p role="alert">타이머를 불러오지 못했어요. 창을 다시 열어 주세요.</p>{/await}{:else}<p role="alert">알 수 없는 도구예요.</p>{/if}
</div>

<style>
  /* 투명 창이라 배경을 꼭 칠해야 안내가 보이고, 빈 창이 클릭을 가로채는 일이 없습니다. */
  .tk-crash {
    box-sizing: border-box;
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 24px;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    background: #ffffff;
    color: #1f2937;
    font-size: 14px;
    line-height: 1.6;
    text-align: center;
  }
  .tk-crash p {
    margin: 0;
  }
  .tk-crash button {
    padding: 8px 18px;
    border: 0;
    border-radius: 999px;
    background: #4f46e5;
    color: #ffffff;
    font-weight: 700;
    cursor: pointer;
  }
</style>
