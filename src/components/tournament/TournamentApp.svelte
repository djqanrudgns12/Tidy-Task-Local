<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    Trophy as TrophyIcon,
    X,
    Plus,
    Shuffle,
    ArrowLeft,
    ArrowRight,
    Check,
    Undo2,
    RotateCcw,
    Maximize2,
    Minus,
    Pin,
    UsersRound,
    List,
    Volume2,
    VolumeX,
  } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { native } from "../../lib/toolkit/store.js";
  import { closeWindow } from "../../lib/toolkit/windows.js";
  import { dragRegion } from "../../lib/dragRegion.js";
  import { readRoster } from "../../lib/classroom/repository.js";
  import {
    SIZES,
    createTournament,
    parseNames,
    placeEntries,
    shuffleSlots,
    rounds,
    chooseWinner,
    clone,
  } from "../../lib/tournament/engine.js";
  import {
    emptyLibrary,
    readLibrary,
    writeLibrary,
  } from "../../lib/tournament/storage.js";
  import Trophy from "./Trophy.svelte";
  import WinnerCelebration from "./WinnerCelebration.svelte";
  import RosterPicker from "./RosterPicker.svelte";
  import { createTournamentAudio } from "../../lib/tournament/audio.js";
  import {
    fitTournamentZoom,
    stepTournamentZoom,
  } from "../../lib/tournament/zoom.js";
  import "./tournament.css";
  let library = $state<any>(emptyLibrary()),
    current = $state<any>(null),
    history = $state<any[]>([]);
  let ready = $state(false),
    busy = $state(false),
    error = $state(""),
    notice = $state(""),
    title = $state(""),
    size = $state(8);
  let screen = $state("home"),
    bulk = $state(""),
    roster = $state<any>(null),
    rosterPicking = $state(false),
    rosterLoading = $state(false);
  let zoom = $state(1),
    focus = $state("all"),
    pinned = $state(false),
    sound = $state(true),
    // 움직임은 앱 안 "동작 줄이기" 스위치로만 줄입니다(Windows "애니메이션 효과" 설정은 따르지 않음).
    reduced = $state(false);
  let viewport = $state<HTMLDivElement>(null!),
    confirmDialog: HTMLDialogElement;
  let confirmTitle = $state(""),
    confirmCopy = $state(""),
    confirmAction: () => void = () => {};
  let swap = $state(-1),
    fullscreen = $state(false),
    saveFailed = $state(false),
    loaded = $state(false);
  const audio = createTournamentAudio();
  let celebrating = $state(false),
    audioReady = $state<Promise<boolean>>(Promise.resolve(false));
  let editorVisible = $state(true);
  let wheelAmount = 0,
    wheelTimer: ReturnType<typeof setTimeout> | undefined;
  function audioError() {
    notice = "소리를 재생하지 못했어요. 소리 미리듣기를 눌러 주세요.";
  }
  function toggleSound() {
    sound = !sound;
    if (!sound) audio.stop();
    else
      void audio.unlock().then((ok) => {
        if (!ok) audioError();
        else if (celebrating) audio.play(true);
      });
    try {
      localStorage.setItem("tidy-tournament-sound", String(sound));
    } catch {}
  }
  async function testSound() {
    sound = true;
    try {
      localStorage.setItem("tidy-tournament-sound", "true");
    } catch {}
    if (await audio.unlock()) {
      audio.playSelection("select");
      notice = "선택 효과음을 미리 듣고 있어요.";
    } else audioError();
  }
  const bracket = $derived(
    current
      ? rounds(current).map((row, r) =>
          current.phase === "edit"
            ? row.map((m) => ({
                ...m,
                teams: r === 0 ? m.teams : [null, null],
                winner: null,
                resolved: false,
                ready: false,
                auto: false,
              }))
            : row,
        )
      : [],
  );
  const final = $derived(bracket.at(-1)?.[0]);
  const champion = $derived(final?.winner);
  const count = $derived(current?.slots.filter(Boolean).length ?? 0);
  const depth = $derived(current ? Math.log2(current.size) - 1 : 1);
  const width = $derived(depth * 202 * 2 + 280);
  const height = $derived(
    current ? Math.max(450, (current.size / 4) * 136 + 100) : 500,
  );
  const nodes = $derived(
    bracket.slice(0, -1).flatMap((row: any[], r: number) =>
      row.map((m: any, i: number) => {
        const half = row.length / 2,
          right = i >= half,
          local = i % half;
        return {
          ...m,
          right,
          x: right ? width - 192 - r * 202 : 16 + r * 202,
          y: 68 + ((local + 0.5) * (height - 112)) / half - 56,
        };
      }),
    ),
  );
  const connectors = $derived(
    nodes.map((m: any) => {
      const parent = nodes.find(
        (n: any) => n.r === m.r + 1 && n.i === Math.floor(m.i / 2),
      );
      const x1 = m.right ? m.x : m.x + 176,
        y1 = m.y + 56;
      const x2 = parent
        ? m.right
          ? parent.x + 176
          : parent.x
        : width / 2 + (m.right ? 106 : -106);
      const y2 = parent ? parent.y + 56 : height / 2;
      return {
        id: m.id,
        winner: !!m.winner,
        d: `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`,
      };
    }),
  );
  const draggable = (node: HTMLElement) =>
    native ? dragRegion(node) : { destroy() {} };
  function message(e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
  async function persist(next: any, record = true) {
    if (busy || !loaded) return false;
    busy = true;
    error = "";
    saveFailed = false;
    const previous = current ? clone($state.snapshot(current)) : null;
    current = next;
    try {
      const saved = {
        ...clone($state.snapshot(library)),
        tournaments: [
          clone(next),
          ...library.tournaments
            .filter((t: any) => t.id !== next.id)
            .map((t: any) => clone($state.snapshot(t))),
        ],
      };
      library = await writeLibrary(saved);
      if (record && previous) history = [...history.slice(-49), previous];
      return true;
    } catch (e) {
      error = `${message(e)} 변경 사항을 저장하지 못했어요.`;
      current = previous;
      saveFailed = true;
      return false;
    } finally {
      busy = false;
    }
  }
  function draft() {
    return clone($state.snapshot(current));
  }
  async function create() {
    if (!loaded) return;
    const next = createTournament(title.slice(0, 60), size);
    if (await persist(next, false)) {
      history = [];
      screen = "board";
      focus = "all";
      editorVisible = true;
      await readableView();
    }
  }
  async function open(t: any) {
    current = clone($state.snapshot(t));
    screen = "board";
    history = [];
    focus = "all";
    error = "";
    editorVisible = true;
    await readableView();
  }
  async function readableView() {
    await tick();
    if (!viewport) return;
    if (current.size <= 8) {
      zoom = 1;
      focus = "all";
      await tick();
      viewport.scrollTo(0, 0);
    } else await focusOn("left");
  }
  async function toggleEditor() {
    editorVisible = !editorVisible;
    await readableView();
  }
  async function fit() {
    await tick();
    if (viewport) {
      zoom = fitTournamentZoom(
        Math.min(
          1,
          (viewport.clientWidth - 30) / width,
          (viewport.clientHeight - 24) / height,
        ),
      );
      await tick();
      viewport.scrollTo(0, 0);
    }
  }
  function changeZoom(delta: number) {
    zoom = stepTournamentZoom(zoom, delta);
  }
  async function wheelZoom(e: WheelEvent) {
    if (focus === "final" || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    wheelAmount +=
      e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
    if (Math.abs(wheelAmount) < 24) {
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => (wheelAmount = 0), 180);
      return;
    }
    const direction = wheelAmount < 0 ? 1 : -1;
    wheelAmount = 0;
    clearTimeout(wheelTimer);
    const before = zoom,
      rect = viewport.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top,
      contentX = (viewport.scrollLeft + x) / before,
      contentY = (viewport.scrollTop + y) / before;
    changeZoom(direction);
    if (zoom === before) return;
    await tick();
    viewport.scrollTo({
      left: contentX * zoom - x,
      top: contentY * zoom - y,
    });
  }
  async function focusOn(value: string) {
    focus = value;
    if (value === "all") return fit();
    if (value === "final") {
      zoom = 1;
      await tick();
      viewport.scrollTo(0, 0);
      return;
    }
    zoom = 1;
    await tick();
    viewport.scrollTo({
      left:
        value === "left"
          ? 0
          : value === "right"
            ? width * zoom
            : (width * zoom) / 2 - viewport.clientWidth / 2,
      top: (height * zoom) / 2 - viewport.clientHeight / 2,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  async function renameSlot(index: number, value: string) {
    const next = draft(),
      name = value.normalize("NFC").trim();
    if (
      name &&
      ([...name].length > 40 || /[\u0000-\u001f\u007f]/u.test(name))
    ) {
      error = "이름은 40자 이내로 입력해 주세요.";
      return;
    }
    if ((next.slots[index]?.name ?? "") === name) return;
    next.slots[index] = name
      ? { id: next.slots[index]?.id ?? crypto.randomUUID(), name }
      : null;
    next.winners = {};
    await persist(next);
  }
  async function applyEntries(entries: any[]) {
    try {
      return await applySlots(placeEntries(entries, current.size));
    } catch (e) {
      error = message(e);
      return false;
    }
  }
  async function applySlots(slots: any[]) {
    const next = draft();
    next.slots = slots;
    next.winners = {};
    if (await persist(next)) {
      bulk = "";
      swap = -1;
      notice = `${slots.filter(Boolean).length}명의 참가자를 배치했어요.`;
      return true;
    }
    return false;
  }
  async function paste() {
    try {
      const entries = parseNames(bulk);
      if (!entries.length)
        throw new Error("이름을 한 줄에 하나씩 입력해 주세요.");
      await applyEntries(entries);
    } catch (e) {
      error = message(e);
    }
  }
  async function importRoster() {
    if (rosterLoading || busy) return;
    rosterLoading = true;
    error = "";
    try {
      roster = await readRoster();
      if (current?.phase === "edit" && screen === "board") rosterPicking = true;
    } catch (e) {
      error = message(e);
    } finally {
      rosterLoading = false;
    }
  }
  async function shuffle() {
    const next = draft();
    next.slots = shuffleSlots(next.slots);
    await persist(next);
    notice = "대진을 새롭게 섞었어요.";
  }
  async function swapSlot(index: number) {
    if (swap < 0) {
      swap = index;
      return;
    }
    const next = draft();
    [next.slots[swap], next.slots[index]] = [
      next.slots[index],
      next.slots[swap],
    ];
    swap = -1;
    await persist(next);
  }
  function ask(text: string, copy: string, action: () => void) {
    confirmTitle = text;
    confirmCopy = copy;
    confirmAction = action;
    confirmDialog.showModal();
  }
  async function start() {
    if (count < 2) {
      error = "참가자를 두 명 이상 입력해 주세요.";
      return;
    }
    const next = draft();
    next.phase = "play";
    swap = -1;
    if (await persist(next)) {
      notice = "승자를 클릭하세요. 같은 경기에서 다시 누르면 취소돼요.";
      await readableView();
    }
  }
  async function pick(match: any, entry: any) {
    if (busy || !entry || celebrating) return;
    if (!match.ready) {
      notice = "상대가 정해지면 진행할 수 있어요.";
      return;
    }
    if (match.auto) {
      notice = "부전승은 자동으로 진출해요.";
      return;
    }
    const wasSelected = current.winners[match.id] === entry.id;
    const cueReady = sound ? audio.unlock() : Promise.resolve(false);
    const next = chooseWinner(draft(), match.id, entry.id);
    const won = !!rounds(next).at(-1)?.[0].winner;
    const unlocked = won ? cueReady : Promise.resolve(false);
    if (await persist(next)) {
      if (sound && (await cueReady))
        audio.playSelection(wasSelected ? "cancel" : "select");
      notice = next.winners[match.id]
        ? `${entry.name} 진출! 다시 누르면 취소돼요.`
        : "진출을 취소했어요. 연결된 이후 결과도 정리했어요.";
      if (won) {
        audioReady = unlocked;
        celebrating = true;
      }
    }
  }
  function showWinner() {
    if (!champion || celebrating) return;
    audioReady = sound ? audio.unlock() : Promise.resolve(false);
    celebrating = true;
  }
  async function undo() {
    const previous = history.at(-1);
    if (previous && (await persist(clone($state.snapshot(previous)), false))) {
      history = history.slice(0, -1);
      notice = "직전 작업을 되돌렸어요.";
    }
  }
  async function toggleFull() {
    try {
      if (native) {
        const win = getCurrentWindow();
        fullscreen = !(await win.isFullscreen());
        await win.setFullscreen(fullscreen);
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        fullscreen = false;
      } else {
        await document.documentElement.requestFullscreen();
        fullscreen = true;
      }
    } catch (e) {
      error = message(e);
    }
  }
  async function pin() {
    if (!native) return;
    try {
      await getCurrentWindow().setAlwaysOnTop(!pinned);
      pinned = !pinned;
    } catch (e) {
      error = message(e);
    }
  }
  function pan(node: HTMLElement) {
    let start: {
      x: number;
      y: number;
      l: number;
      t: number;
      id: number;
    } | null = null;
    const down = (e: PointerEvent) => {
      if (
        e.button !== 0 ||
        (e.target as Element).closest("button,input,textarea,select")
      )
        return;
      start = {
        x: e.clientX,
        y: e.clientY,
        l: node.scrollLeft,
        t: node.scrollTop,
        id: e.pointerId,
      };
      node.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (start) {
        node.scrollLeft = start.l - e.clientX + start.x;
        node.scrollTop = start.t - e.clientY + start.y;
      }
    };
    const up = () => {
      start = null;
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    return {
      destroy() {
        node.removeEventListener("pointerdown", down);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
      },
    };
  }
  async function inputKey(e: KeyboardEvent, index: number) {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      await renameSlot(index, (e.currentTarget as HTMLInputElement).value);
      await tick();
      document.getElementById(`entrant-${(index + 1) % current.size}`)?.focus();
    }
  }
  onMount(() => {
    let disposed = false;
    try {
      const saved = localStorage.getItem("tidy-tournament-sound");
      if (saved !== null) sound = saved !== "false";
      reduced = localStorage.getItem("tidy-tournament-reduced") === "true";
    } catch {}
    void readLibrary()
      .then((value) => {
        if (!disposed) {
          library = value;
          loaded = true;
        }
      })
      .catch((e) => (error = message(e)))
      .finally(() => (ready = true));
    return () => {
      disposed = true;
      void audio.dispose();
    };
  });
</script>

<div class="tn-app" class:tn-reduced={reduced} class:tn-full-motion={!reduced}>
  <header class="tn-titlebar" use:draggable>
    <span class="tn-brand"
      ><TrophyIcon size={17} /> 토너먼트 <span>학급 툴킷</span></span
    >
    <div class="tn-window-actions">
      <button
        title="항상 위"
        aria-label="항상 위"
        aria-pressed={pinned}
        disabled={!native}
        onclick={pin}><Pin size={16} /></button
      ><button
        title="전체 화면"
        aria-label="전체 화면"
        aria-pressed={fullscreen}
        onclick={toggleFull}><Maximize2 size={16} /></button
      ><button
        title="닫기"
        aria-label="닫기"
        disabled={busy}
        onclick={closeWindow}><X size={18} /></button
      >
    </div>
  </header>
  {#if error}<div class="tn-error" role="alert">
      {error}{#if saveFailed}
        <span>저장된 상태로 되돌렸어요. 다시 시도해 주세요.</span>{/if}
    </div>{/if}
  {#if !ready}<div class="tn-loading">토너먼트를 준비하고 있어요…</div>
  {:else if screen === "home"}
    <main class="tn-home">
      <section class="tn-create">
        <div class="tn-hero-art">
          <div class="tn-orbit"></div>
          <Trophy large /><span class="tn-hero-badge"
            >누구나 주인공이 되는 시간</span
          >
        </div>
        <div class="tn-create-copy">
          <span class="tn-eyebrow">우리 반의 작은 챔피언십</span>
          <!-- <br> 앞의 띄어쓰기는 좁은 창에서 줄바꿈을 숨길 때(tournament.css) 두 문장이 붙지 않게 하려는 것입니다.
               줄바꿈이 보일 때는 줄 끝 공백이라 화면에 나타나지 않습니다. -->
          <h1>오늘의 우승자는 <br />누구일까요?</h1>
          <p>
            이름을 넣고, 대진을 섞고, 승자를 눌러 보세요. <br />함께 만드는
            즐거운 토너먼트.
          </p>
          <label class="tn-field"
            >대회 이름 <input
              placeholder="예: 우리 반 가위바위보 챔피언십"
              maxlength="60"
              bind:value={title}
            /></label
          >
          <fieldset class="tn-size">
            <legend>대진 규모</legend>{#each SIZES as n}<button
                class:active={size === n}
                aria-pressed={size === n}
                onclick={() => (size = n)}>{n}<small>강</small></button
              >{/each}
          </fieldset>
          <button
            class="tn-primary tn-create-button"
            disabled={busy || !loaded || library.tournaments.length >= 100}
            onclick={create}>대진표 만들기 <ArrowRight size={18} /></button
          ><small class="tn-help"
            >참가자가 적으면 남는 자리는 부전승으로 진행해요.</small
          >
        </div>
      </section>
      {#if library.tournaments.length}<section class="tn-saved">
          <div class="tn-section-heading">
            <h2>이어서 진행하기</h2>
            <span>{library.tournaments.length}개의 대회 · 자동 저장</span>
          </div>
          <div class="tn-saved-grid">
            {#each library.tournaments as t}<article>
                <button class="tn-saved-open" onclick={() => open(t)}
                  ><span class="tn-mini-cup"><TrophyIcon size={23} /></span
                  ><span
                    ><strong>{t.title}</strong><small
                      >{t.size}강 · {t.phase === "edit"
                        ? "대진 준비 중"
                        : rounds(t).at(-1)?.[0].winner
                          ? "대회 완료"
                          : "경기 진행 중"}</small
                    ></span
                  ><ArrowRight size={17} /></button
                ><button
                  class="tn-delete"
                  title="대회 삭제"
                  aria-label={`${t.title} 삭제`}
                  onclick={() =>
                    ask(
                      "대회를 삭제할까요?",
                      "이 대회의 참가자와 경기 결과가 삭제돼요.",
                      async () => {
                        try {
                          busy = true;
                          library = await writeLibrary({
                            ...clone($state.snapshot(library)),
                            tournaments: library.tournaments
                              .filter((v: any) => v.id !== t.id)
                              .map((v: any) => clone($state.snapshot(v))),
                          });
                        } catch (e) {
                          error = message(e);
                        } finally {
                          busy = false;
                        }
                      },
                    )}><X size={14} /></button
                >
              </article>{/each}
          </div>
        </section>{/if}
    </main>
  {:else if current}
    <section class="tn-board-heading">
      <div>
        <button
          class="tn-back"
          disabled={busy}
          onclick={() => {
            screen = "home";
            current = null;
            notice = "";
          }}><ArrowLeft size={15} /> 대회 목록</button
        >
        <h1>{current.title}</h1>
        <p>
          <span class="tn-status"
            >{current.phase === "edit"
              ? "대진 준비"
              : champion
                ? "대회 완료"
                : "경기 진행"}</span
          >
          {current.size}강 <span>·</span>
          {count}명 참가 <span>·</span>
          {busy ? "저장 중…" : "자동 저장됨"}
        </p>
      </div>
      <div class="tn-heading-right">
        <button
          class="tn-sound-button"
          aria-label="토너먼트 효과음"
          aria-pressed={sound}
          onclick={toggleSound}
        >
          {#if sound}<Volume2 size={20} />{:else}<VolumeX size={20} />{/if} 소리 {sound
            ? "켜짐"
            : "꺼짐"}
        </button><button class="tn-sound-test" onclick={testSound}
          >효과음 미리듣기</button
        ><label class="tn-motion"
          ><input
            type="checkbox"
            bind:checked={reduced}
            onchange={() => {
              try {
                localStorage.setItem(
                  "tidy-tournament-reduced",
                  String(reduced),
                );
              } catch {}
            }}
          /> 간단한 연출</label
        >
      </div>
    </section>
    <div class="tn-guidance" role="status">
      <strong
        >{current.phase === "edit"
          ? "① 참가자 입력"
          : champion
            ? "③ 우승 결정"
            : "② 승자 선택"}</strong
      >
      <span
        >{current.phase === "edit"
          ? "이름을 넣고 → 대진을 섞은 뒤 → 경기 시작을 누르세요."
          : champion
            ? "우승자 보기를 눌러 다시 축하할 수 있어요."
            : "이긴 팀을 누르세요. 선택한 팀을 다시 누르면 취소됩니다."}</span
      >
    </div>
    <div class="tn-workspace" class:editing={current.phase === "edit"}>
      {#if current.phase === "edit" && editorVisible}<aside class="tn-editor">
          <span class="tn-eyebrow">첫 번째 단계</span>
          <h2>참가자 넣기</h2>
          <p>대진표에 직접 입력하거나<br />이름을 한 번에 붙여 넣으세요.</p>
          <label class="tn-field"
            >한 줄에 한 명<textarea
              bind:value={bulk}
              placeholder={"김하늘\n이바다\n박여름\n최우주"}
              rows="4"></textarea></label
          ><button
            class="tn-secondary"
            disabled={busy || !bulk.trim()}
            onclick={paste}><List size={16} /> 명단 적용</button
          ><button class="tn-secondary" disabled={busy || rosterLoading} onclick={importRoster}
            ><UsersRound size={16} /> {rosterLoading ? "명단 불러오는 중…" : "학급 명단 불러오기"}</button
          >
          <details class="tn-editor-tip">
            <summary>자리 바꾸는 방법</summary>

            <p>
              대진을 섞거나 각 칸 옆 번호를 두 번 선택해 서로 자리를 바꿀 수
              있어요.
            </p>
          </details>
        </aside>{/if}
      <div class="tn-canvas-shell" class:tn-final-focus={focus === "final"}>
        <div class="tn-canvas-tools">
          <div class="tn-focus-tabs">
            {#if current.phase === "edit"}<button
                class="tn-editor-toggle"
                aria-expanded={editorVisible}
                onclick={toggleEditor}
                >{editorVisible ? "입력 닫기" : "참가자 입력"}</button
              >{/if}
            {#each [["all", "전체 대진"], ["left", "왼쪽 경기"], ["final", "결승"], ["right", "오른쪽 경기"]] as item}<button
                class:active={focus === item[0]}
                onclick={() => focusOn(item[0])}>{item[1]}</button
              >{/each}
          </div>
          <div class="tn-zoom">
            <button aria-label="5% 축소" onclick={() => changeZoom(-1)}
              ><Minus size={15} /></button
            ><span>{Math.round(zoom * 100)}%</span><button
              aria-label="5% 확대"
              onclick={() => changeZoom(1)}><Plus size={15} /></button
            ><button
              onclick={() => {
                zoom = 1.1;
              }}>큰 글씨</button
            >
          </div>
        </div>
        <div
          class="tn-viewport"
          bind:this={viewport}
          use:pan
          onwheel={wheelZoom}
          role="region"
          aria-label="대진표. 마우스 휠로 5%씩 확대하거나 축소할 수 있습니다."
        >
          <div
            class="tn-scaled"
            style:width={`${width * zoom}px`}
            style:height={`${height * zoom}px`}
          >
            <div
              class="tn-bracket"
              style:width={`${width}px`}
              style:height={`${height}px`}
              style:transform={`scale(${zoom})`}
            >
              <svg class="tn-lines" {width} {height} aria-hidden="true"
                >{#each connectors as line}<path
                    d={line.d}
                    class:won={line.winner}
                  />{/each}</svg
              >
              {#each nodes as m}<div
                  class="tn-match"
                  style:left={`${m.x}px`}
                  style:top={`${m.y}px`}
                >
                  <span class="tn-round-label"
                    >{current.size / 2 ** m.r === 4
                      ? "준결승"
                      : `${current.size / 2 ** m.r}강`}
                    <small>{m.i + 1}경기</small></span
                  >{#each m.teams as entry, j}{@const index = m.i * 2 + j}
                    {#if current.phase === "edit" && m.r === 0}<div
                        class="tn-entry"
                      >
                        <button
                          class:selected={swap === index}
                          aria-label={`${index + 1}번 자리 교환`}
                          disabled={busy}
                          onclick={() => swapSlot(index)}>{index + 1}</button
                        ><input
                          id={`entrant-${index}`}
                          aria-label={`${index + 1}번 참가자`}
                          placeholder="이름 입력"
                          maxlength="40"
                          value={current.slots[index]?.name ?? ""}
                          readonly={busy}
                          onchange={(e) =>
                            renameSlot(index, e.currentTarget.value)}
                          onkeydown={(e) => inputKey(e, index)}
                        />
                      </div>
                    {:else}<button
                        class="tn-team"
                        title={entry?.name}
                        class:winner={!!entry && m.winner?.id === entry.id}
                        class:loser={!!m.winner && m.winner?.id !== entry?.id}
                        disabled={busy || current.phase === "edit" || !entry}
                        aria-pressed={!!entry && m.winner?.id === entry.id}
                        aria-label={`${current.size / 2 ** m.r}강 ${m.i + 1}경기 ${entry?.name ?? "대기"}${entry && m.winner?.id === entry.id ? ", 다시 누르면 진출 취소" : ""}`}
                        onclick={() => pick(m, entry)}
                        ><span
                          >{entry?.name ??
                            (m.ready ? "부전승" : "진출 대기")}</span
                        >{#if entry && m.winner?.id === entry.id}<Check
                            size={15}
                          />{/if}</button
                      >{/if}
                  {/each}
                </div>{/each}
              <div
                class="tn-final"
                class:ready={final?.teams.every(Boolean)}
                style:left={`${width / 2 - 106}px`}
                style:top={`${height / 2 - 198}px`}
              >
                <span class="tn-eyebrow">마지막 승부</span>
                <h2>결승전</h2>
                <div class="tn-final-trophy"><Trophy /></div>
                <div class="tn-final-teams">
                  {#each final?.teams ?? [] as entry, j}<button
                      class="tn-team"
                      class:winner={!!entry && champion?.id === entry.id}
                      disabled={busy || current.phase === "edit" || !entry}
                      aria-pressed={!!entry && champion?.id === entry.id}
                      onclick={() => pick(final, entry)}
                      ><span
                        >{entry?.name ??
                          `${j === 0 ? "왼쪽" : "오른쪽"} 진출자`}</span
                      >{#if entry && champion?.id === entry.id}<TrophyIcon
                          size={16}
                        />{/if}</button
                    >{#if j === 0}<span class="tn-vs">VS</span>{/if}{/each}
                </div>
                <p>
                  {champion
                    ? "우리 반 챔피언 탄생!"
                    : final?.teams.every(Boolean)
                      ? "우승할 팀을 눌러 주세요"
                      : "챔피언을 향한 마지막 경기"}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div class="tn-canvas-hint">
          {swap >= 0
            ? `${swap + 1}번과 바꿀 자리의 번호를 선택하세요.`
            : "화면 밖의 경기는 왼쪽·오른쪽 경기 버튼으로 이동하세요."}
        </div>
      </div>
    </div>
    <footer class="tn-footer">
      <div class="tn-footer-left">
        <button
          class="tn-secondary"
          disabled={busy || !history.length}
          onclick={undo}><Undo2 size={16} /> 되돌리기</button
        ><span role="status"
          >{notice ||
            (current.phase === "edit"
              ? "준비되면 대진을 확정해 주세요."
              : "승자를 클릭 · 같은 경기에서 다시 클릭하면 취소")}</span
        >
      </div>
      <div class="tn-footer-actions">
        {#if current.phase === "edit"}<button
            class="tn-secondary"
            disabled={busy || count < 2}
            onclick={shuffle}><Shuffle size={17} /> 대진 섞기</button
          ><button
            class="tn-primary"
            disabled={busy || count < 2}
            onclick={() =>
              count < current.size
                ? ask(
                    "대진을 확정할까요?",
                    `빈 ${current.size - count}자리는 부전승으로 처리해요.`,
                    start,
                  )
                : start()}><Check size={18} /> 경기 시작</button
          >{:else}<button
            class="tn-secondary"
            disabled={busy}
            onclick={() =>
              ask(
                "대진을 수정할까요?",
                "참가자와 배치는 유지하고 경기 결과를 초기화해요. 되돌리기로 복구할 수 있어요.",
                async () => {
                  const next = draft();
                  next.phase = "edit";
                  next.winners = {};
                  await persist(next);
                },
              )}>대진 수정</button
          ><button
            class="tn-secondary"
            disabled={busy || !Object.keys(current.winners).length}
            onclick={() =>
              ask(
                "경기 결과를 초기화할까요?",
                "참가자와 대진 배치는 그대로 유지해요.",
                async () => {
                  const next = draft();
                  next.winners = {};
                  await persist(next);
                },
              )}><RotateCcw size={16} /> 결과 초기화</button
          ><button
            class="tn-primary"
            disabled={!champion || busy}
            onclick={showWinner}><TrophyIcon size={18} /> 우승자 보기</button
          >{/if}
      </div>
    </footer>
  {/if}
  {#if rosterPicking && current && roster}
    <RosterPicker
      {roster}
      size={current.size}
      replacing={count > 0}
      onapply={applySlots}
      onclose={() => (rosterPicking = false)}
    />
  {/if}
  <dialog class="tn-confirm" bind:this={confirmDialog}>
    <h2>{confirmTitle}</h2>
    <p>{confirmCopy}</p>
    <div>
      <button class="tn-secondary" onclick={() => confirmDialog.close()}
        >취소</button
      ><button
        class="tn-primary"
        onclick={() => {
          confirmDialog.close();
          confirmAction();
        }}>확인</button
      >
    </div>
  </dialog>
  {#if celebrating && champion}
    <WinnerCelebration
      name={champion.name}
      title={current.title}
      {reduced}
      {sound}
      {audioReady}
      {audio}
      onclose={() => (celebrating = false)}
      onsound={toggleSound}
      onaudioerror={audioError}
    />
  {/if}
  {#if native}{#each ["NorthWest", "NorthEast", "SouthWest", "SouthEast"] as direction}<div
        class={`tn-resize ${direction}`}
        role="presentation"
        onpointerdown={() => {
          void getCurrentWindow().startResizeDragging(direction as any);
        }}
      ></div>{/each}{/if}
</div>
