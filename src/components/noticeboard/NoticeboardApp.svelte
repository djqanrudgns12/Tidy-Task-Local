<script lang="ts">
  import { onMount } from "svelte";
  import {
    BookOpenText,
    ChevronLeft,
    ChevronRight,
    CalendarDays,
    Search,
    Trash2,
    Undo2,
    Redo2,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Minus,
    Plus,
    X,
    Maximize2,
    Minimize2,
    Pin,
    Check,
    PanelRight,
    SlidersHorizontal,
    Presentation,
    ArrowDown,
    RotateCcw,
  } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { LazyStore } from "@tauri-apps/plugin-store";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { BUILTIN_FONTS } from "../../lib/builtinFonts.js";
  import { registerFontFace } from "../../lib/fonts.js";
  import { dragRegion } from "../../lib/dragRegion.js";
  import { ensureWindowOnScreen } from "../../lib/windows/windowRegistry.js";
  import { repository, native } from "../../lib/noticeboard/repository.js";
  import { NoticeSession } from "../../lib/noticeboard/session.js";
  import { createEditor } from "../../lib/noticeboard/editor.js";
  import {
    COLORS,
    DEFAULT_FONT,
    hasContent,
    plainText,
    messageFor,
    equalDocuments,
  } from "../../lib/noticeboard/document.js";
  import {
    dateKey,
    shiftDate,
    formatDate,
    formatCompactDate,
    searchEntries,
  } from "../../lib/noticeboard/dates.js";
  import "./noticeboard.css";

  let recovery = $state<{ available: boolean; modified: number | null } | null>(
    null,
  );
  let savedHint = $state(false);
  let hintTimer: ReturnType<typeof setTimeout>;
  let quitRequest = $state<string | null>(null);
  let revision = $state(0),
    ready = $state(false),
    busy = $state(false),
    error = $state("");
  let board = $state(false),
    toolsOpen = $state(false),
    archiveOpen = $state(false),
    trashOpen = $state(false),
    colorOpen = $state(false),
    pinned = $state(false);
  let today = $state(dateKey()),
    query = $state(""),
    period = $state("all"),
    limit = $state(50);
  let entries = $state<any[]>([]),
    trash = $state<any[]>([]),
    fonts = $state<any[]>([...BUILTIN_FONTS]);
  let normalZoom = $state(100),
    boardZoom = $state(200),
    moreBelow = $state(false),
    sizeText = $state("22");
  let editorHost: HTMLDivElement, scrollHost: HTMLDivElement;
  let editor = $state.raw<ReturnType<typeof createEditor>>();
  let confirmation = $state<{
    title: string;
    message: string;
    accept: string;
    left?: string;
    right?: string;
    resolve: (v: boolean) => void;
  } | null>(null);
  let normalBounds: any = null,
    normalScroll = 0,
    disposed = false,
    listEpoch = 0,
    listTimer: ReturnType<typeof setTimeout>,
    lastListed = "";
  const session = new NoticeSession(
    repository,
    () => {
      revision++;
      const s = session.active;
      const stamp = `${s?.id}:${s?.revision}`;
      if (s?.exists && stamp !== lastListed) {
        lastListed = stamp;
        clearTimeout(listTimer);
        listTimer = setTimeout(() => void refresh(), 120);
      }
    },
    DEFAULT_FONT,
  );
  const ui = $derived.by(() => {
    revision;
    const s = session.active;
    return {
      key: s?.key || today,
      doc: s?.doc,
      saved: s?.saved,
      exists: !!s?.exists,
      status: session.status(),
      storageError: session.error,
      dirty: s?.saved && !equalDocuments(s.doc, s.saved),
      undo: editor?.canUndo() || false,
      redo: editor?.canRedo() || false,
    };
  });
  const results = $derived(searchEntries(entries, query, period, today));
  const fontFamily = $derived(
    fonts.find((f) => f.name === ui.doc?.attrs?.fontId)?.family ||
      '"Malgun Gothic", sans-serif',
  );
  const zoom = $derived(board ? boardZoom : normalZoom);
  const draggable = (node: HTMLElement) =>
    native ? dragRegion(node) : { destroy() {} };
  function fail(e: unknown) {
    error = String(e).includes("INVALID_SIZE")
      ? "글자 크기는 8~96 사이의 정수로 입력해 주세요."
      : String(e).includes("COMPOSING")
        ? "입력 중인 글자를 마친 뒤 다시 눌러 주세요."
        : messageFor(e);
  }
  async function run(fn: () => any) {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await editor?.finishComposition();
      editor?.lock(true);
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      if (!quitRequest) {
        busy = false;
        editor?.lock(false);
      }
      revision++;
    }
  }
  async function refresh() {
    const epoch = ++listEpoch;
    try {
      const data = await repository.list();
      if (!disposed && epoch === listEpoch) entries = data;
    } catch (e) {
      if (!disposed) fail(e);
    }
  }
  async function navigate(key: string) {
    await run(async () => {
      if (await session.open(key)) {
        editor?.switchDate();
        scrollHost.scrollTop = 0;
      }
    });
  }
  function shift(delta: number) {
    try {
      void navigate(shiftDate(ui.key, delta));
    } catch (e) {
      fail(e);
    }
  }
  async function save() {
    if (busy) return;
    error = "";
    try {
      await editor?.finishComposition();
      await session.save();
      savedHint = true;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => (savedHint = false), 2500);
      await refresh();
    } catch (e) {
      fail(e);
    }
  }
  function format(name: string, value?: any) {
    error = "";
    editor?.command(name, value);
    revision++;
  }
  function keepSelection(e: PointerEvent) {
    e.preventDefault();
  }
  function updateSize() {
    const n = Number(sizeText);
    if (!sizeText.trim() || !Number.isInteger(n) || n < 8 || n > 96) {
      fail("INVALID_SIZE");
      sizeText = String(editor?.size() || "");
      return;
    }
    format("size", n);
  }
  function measure() {
    if (scrollHost)
      moreBelow =
        scrollHost.scrollHeight -
          scrollHost.clientHeight -
          scrollHost.scrollTop >
        8;
  }
  function adjustZoom(delta: number) {
    const n = Math.max(50, Math.min(300, zoom + delta));
    if (board) boardZoom = n;
    else normalZoom = n;
    try {
      localStorage.setItem(
        "tidy-noticeboard-view-v1",
        JSON.stringify({ normalZoom, boardZoom }),
      );
    } catch {
      error = "보기 배율을 기억하지 못했어요. 본문 보관에는 영향이 없어요.";
    }
    requestAnimationFrame(measure);
  }
  function ask(
    title: string,
    message: string,
    accept = "확인",
    left?: string,
    right?: string,
  ) {
    return new Promise<boolean>(
      (resolve) =>
        (confirmation = { title, message, accept, left, right, resolve }),
    );
  }
  function answer(value: boolean) {
    const c = confirmation;
    confirmation = null;
    c?.resolve(value);
  }
  function modal(node: HTMLDialogElement) {
    node.showModal();
    return {
      destroy() {
        node.close();
      },
    };
  }
  async function revert() {
    if (
      await ask(
        "저장본으로 되돌릴까요?",
        "수정 중인 내용을 마지막 저장본으로 되돌려요. 실행 취소로 다시 가져올 수 있어요.",
        "되돌리기",
      )
    )
      format("replace", ui.saved);
  }
  async function remove() {
    if (
      await ask(
        `${formatDate(ui.key)} 알림장을 삭제할까요?`,
        "저장본과 수정 중인 초안을 함께 휴지통으로 옮겨요. 나중에 복원할 수 있어요.",
        "휴지통으로 이동",
      )
    )
      await run(async () => {
        await session.trash();
        editor?.switchDate();
        await refresh();
      });
  }
  async function openTrash() {
    await run(async () => {
      await session.flush();
      trash = await repository.trashList();
      trashOpen = true;
    });
  }
  async function restore(item: any) {
    await run(async () => {
      await session.flush();
      const active = await repository.readDate(item.dateKey);
      if (
        active &&
        !(await ask(
          "같은 날짜의 알림장이 있어요.",
          "복원하면 현재 알림장은 휴지통으로 옮겨 보관해요.",
          "휴지통 알림장으로 복원",
          plainText(active.draft || active.saved),
          plainText(item.draft || item.saved),
        ))
      )
        return;
      await repository.execute({
        type: "restore",
        id: item.id,
        expectedRevision: item.revision,
        replaceId: active?.id || null,
        replaceRevision: active?.revision || null,
        operationId: crypto.randomUUID(),
      });
      session.sessions.delete(item.dateKey);
      if (session.active?.key === item.dateKey) session.active = null;
      await session.open(item.dateKey);
      editor?.switchDate();
      trashOpen = false;
      await refresh();
    });
  }
  async function purge(item: any) {
    if (
      !(await ask(
        "영구 삭제할까요?",
        "이 알림장의 저장본과 초안을 앱에서 다시 복원할 수 없어요.",
        "영구 삭제",
      ))
    )
      return;
    await run(async () => {
      await repository.execute({
        type: "purge",
        id: item.id,
        expectedRevision: item.revision,
        operationId: crypto.randomUUID(),
      });
      trash = await repository.trashList();
    });
  }
  async function toggleBoard() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await editor?.finishComposition();
      if (!board) {
        normalScroll = scrollHost.scrollTop;
        if (native) {
          const w = getCurrentWindow();
          normalBounds = {
            position: await w.outerPosition(),
            size: await w.innerSize(),
            maximized: await w.isMaximized(),
          };
          await w.setFullscreen(true);
        } else await document.documentElement.requestFullscreen();
        editor?.beginBoard();
        board = true;
        toolsOpen = false;
        archiveOpen = false;
        colorOpen = false;
        requestAnimationFrame(() => {
          scrollHost.scrollTop = 0;
          measure();
        });
      } else {
        if (native) {
          const w = getCurrentWindow();
          await w.setFullscreen(false);
          if (normalBounds) {
            if (normalBounds.maximized) await w.maximize();
            else {
              await w.setSize(
                new PhysicalSize(
                  normalBounds.size.width,
                  normalBounds.size.height,
                ),
              );
              await w.setPosition(
                new PhysicalPosition(
                  normalBounds.position.x,
                  normalBounds.position.y,
                ),
              );
              await ensureWindowOnScreen(w);
            }
          }
        } else if (document.fullscreenElement) await document.exitFullscreen();
        editor?.endBoard();
        board = false;
        toolsOpen = false;
        requestAnimationFrame(() => {
          scrollHost.scrollTop = normalScroll;
          measure();
        });
      }
    } catch {
      error = "전체화면을 전환하지 못했어요. 다시 시도해 주세요.";
    } finally {
      busy = false;
    }
  }
  async function close() {
    await run(async () => {
      await session.flush();
      if (native) await getCurrentWindow().destroy();
      else window.close();
    });
  }
  async function retry() {
    if (!ready) {
      location.reload();
      return;
    }
    await run(async () => {
      await session.flush();
      editor?.switchDate();
      await refresh();
    });
  }
  async function recoverStorage() {
    if (
      !(await ask(
        "복구 사본으로 돌아갈까요?",
        `마지막 복구 사본${recovery?.modified ? " (" + new Date(recovery.modified * 1000).toLocaleString("ko-KR") + ")" : ""}으로 돌아가요. 손상된 원본 파일은 별도로 보존해요.`,
        "복구",
      ))
    )
      return;
    try {
      await repository.execute({ type: "recover" });
      location.reload();
    } catch (e) {
      fail(e);
    }
  }
  function resize(
    e: PointerEvent,
    direction: "NorthWest" | "NorthEast" | "SouthWest" | "SouthEast",
  ) {
    if (!native || board || e.button !== 0) return;
    e.preventDefault();
    void getCurrentWindow()
      .startResizeDragging(direction)
      .catch(() => (error = "창 크기를 바꾸지 못했어요."));
  }
  async function windowAction(name: string) {
    if (!native) return;
    try {
      const w = getCurrentWindow();
      if (name === "pin") {
        await w.setAlwaysOnTop(!pinned);
        pinned = !pinned;
      }
      if (name === "minimize") await w.minimize();
      if (name === "maximize") await w.toggleMaximize();
    } catch {
      error = "창 상태를 바꾸지 못했어요.";
    }
  }
  function keys(e: KeyboardEvent) {
    if (e.isComposing || editor?.view.composing) return;
    if (e.key === "Escape" && !confirmation) {
      if (colorOpen) {
        colorOpen = false;
        e.preventDefault();
      } else if (trashOpen) {
        trashOpen = false;
        e.preventDefault();
      } else if (board) {
        e.preventDefault();
        void toggleBoard();
      } else if (archiveOpen) {
        archiveOpen = false;
        e.preventDefault();
      }
    }
    const target = e.target as HTMLElement;
    if (
      (e.ctrlKey || e.metaKey) &&
      !target.closest("input,select,textarea,.ProseMirror") &&
      target.closest(".nb-format")
    ) {
      if (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") {
        e.preventDefault();
        format(e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo");
      }
    }
  }
  async function prepareFonts() {
    if (!native) return;
    try {
      const store = new LazyStore("tidy-task-config.json");
      const [storedFonts, main] = await Promise.all([
        store.get<any[]>("customFonts"),
        store.get<any>("main"),
      ]);
      const custom = Array.isArray(storedFonts) ? storedFonts : [];
      fonts = [
        ...BUILTIN_FONTS,
        ...custom.map((font) => ({
          name: font.name,
          family: `"${font.name}",sans-serif`,
        })),
      ];
      session.fontId = fonts.some((font) => font.name === main?.fontFamily)
        ? main.fontFamily
        : DEFAULT_FONT;
      void Promise.allSettled(
        custom.map((font) => registerFontFace(font.name, font.path)),
      ).then(() => {
        if (!disposed) revision++;
      });
    } catch {
      if (!disposed) error = "글꼴 설정을 읽지 못해 기본 글꼴로 표시해요.";
    }
  }
  onMount(() => {
    const offs: (() => void)[] = [];
    const resize = new ResizeObserver(measure);
    resize.observe(scrollHost);
    resize.observe(editorHost);
    void (async () => {
      try {
        let prefs: any = {};
        try {
          prefs = JSON.parse(
            localStorage.getItem("tidy-noticeboard-view-v1") || "{}",
          );
        } catch {
          /* View preferences must not prevent opening a document. */
        }
        normalZoom = Number.isFinite(prefs.normalZoom)
          ? Math.max(50, Math.min(300, prefs.normalZoom))
          : 100;
        boardZoom = Number.isFinite(prefs.boardZoom)
          ? Math.max(50, Math.min(300, prefs.boardZoom))
          : 200;
        await Promise.all([session.open(today), prepareFonts()]);
        if (disposed) return;
        const active = session.active;
        if (
          active &&
          !active.exists &&
          !active.everContent &&
          active.version === 0 &&
          active.doc.attrs.fontId !== session.fontId
        )
          active.doc = {
            ...active.doc,
            attrs: {
              ...active.doc.attrs,
              fontId: session.fontId || DEFAULT_FONT,
            },
          };
        editor = createEditor(editorHost, session, {
          changed: () => {
            revision++;
            if (
              !(document.activeElement instanceof HTMLElement) ||
              !document.activeElement.closest(".nb-size")
            )
              sizeText = String(editor?.size() || "");
            requestAnimationFrame(measure);
          },
          error: fail,
        });
        ready = true;
        revision++;
        await refresh();
        if (native) {
          const w = getCurrentWindow();
          offs.push(
            await w.onCloseRequested((e) => {
              e.preventDefault();
              void close();
            }),
          );
          offs.push(
            await w.onResized(async () => {
              if (board && !(await w.isFullscreen())) {
                editor?.endBoard();
                board = false;
                toolsOpen = false;
                requestAnimationFrame(
                  () => (scrollHost.scrollTop = normalScroll),
                );
              }
            }),
          );
          offs.push(
            await listen<any>("noticeboard-quit-request", async (e) => {
              const id = e.payload.requestId;
              quitRequest = id;
              let ok = false;
              try {
                busy = true;
                await editor?.finishComposition();
                if (quitRequest !== id) return;
                editor?.lock(true);
                await session.flush();
                ok = true;
              } catch (err) {
                fail(err);
              }
              if (quitRequest === id)
                await invoke("noticeboard_quit_reply", {
                  requestId: id,
                  allow: ok,
                });
              if (!ok) {
                quitRequest = null;
                busy = false;
                editor?.lock(false);
              }
            }),
          );
          offs.push(
            await listen("noticeboard-quit-cancel", () => {
              quitRequest = null;
              busy = false;
              editor?.lock(false);
            }),
          );
        }
      } catch (e) {
        fail(e);
        if (native && !ready)
          try {
            recovery = await repository.execute({ type: "recoveryInfo" });
          } catch {
            /* Keep original read error. */
          }
      }
    })();
    const timer = setInterval(() => {
      today = dateKey();
      measure();
    }, 15000);
    const fs = () => {
      if (!native && board && !document.fullscreenElement) {
        editor?.endBoard();
        board = false;
        requestAnimationFrame(() => (scrollHost.scrollTop = normalScroll));
      }
    };
    document.addEventListener("fullscreenchange", fs);
    const preventLoss = (e: BeforeUnloadEvent) => {
      if (session.active && session.active.version > session.active.persisted) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => {
      disposed = true;
      session.dispose();
      editor?.destroy();
      resize.disconnect();
      clearInterval(timer);
      clearTimeout(listTimer);
      clearTimeout(hintTimer);
      offs.forEach((fn) => fn());
      document.removeEventListener("fullscreenchange", fs);
      window.removeEventListener("beforeunload", preventLoss);
    };
  });
</script>

<svelte:window onkeydown={keys} />
<section
  class="noticeboard-app"
  class:board
  class:show-archive={archiveOpen}
  aria-label="알림장"
>
  {#if !board}<header class="nb-titlebar" use:draggable>
      <span><BookOpenText size={16} /> 학급 툴킷 <i>·</i> 알림장</span>
      <div>
        <button
          aria-label="항상 위"
          aria-pressed={pinned}
          onclick={() => windowAction("pin")}><Pin size={16} /></button
        ><button aria-label="최소화" onclick={() => windowAction("minimize")}
          ><Minus size={17} /></button
        ><button aria-label="최대화" onclick={() => windowAction("maximize")}
          ><Maximize2 size={16} /></button
        ><button aria-label="창 닫기" onclick={close}><X size={18} /></button>
      </div>
    </header>{/if}
  {#if quitRequest}<div class="nb-error" role="status">
      <span>종료 전에 자료를 보관하고 있어요.</span><button
        onclick={() => invoke("noticeboard_cancel_quit")}>종료 취소</button
      >
    </div>{/if}
  <div class="nb-workspace">
    <main class="nb-paper">
      <header class="nb-heading">
        {#if board}<p class="nb-board-date">{formatDate(ui.key)}</p>{:else}<p
            class="nb-attribution"
          >
            <span class="nb-attribution-label">@Powered by</span><a
              href="https://www.clanner.kr/"
              target="_blank"
              rel="noopener noreferrer"
              onclick={async (event) => {
                if (native) {
                  event.preventDefault();
                  try {
                    await openUrl("https://www.clanner.kr/");
                  } catch {
                    error =
                      "클래너 사이트를 열지 못했어요. 다시 시도해 주세요.";
                  }
                }
              }}
              ><img
                src="/images/toolkit/clanner.png"
                alt=""
                aria-hidden="true"
              /><span class="nb-attribution-name">Clanner</span></a
            >
          </p>
          <div class="nb-heading-top">
            <div>
              <span class="nb-eyebrow">우리 반의 하루</span>
              <h1>알림장</h1>
            </div>
            <button
              class="nb-archive-toggle"
              aria-label="기록 열기"
              onclick={() => (archiveOpen = !archiveOpen)}
              ><PanelRight size={19} /></button
            >
          </div>
          <div class="nb-date-row">
            <button
              aria-label="이전 날짜"
              disabled={busy}
              onclick={() => shift(-1)}><ChevronLeft size={18} /></button
            ><label class="nb-date"
              ><CalendarDays size={17} /><span aria-hidden="true"
                >{formatCompactDate(ui.key)}</span
              ><input
                aria-label="알림장 날짜"
                type="date"
                min="1900-01-01"
                max="9999-12-31"
                value={ui.key}
                disabled={busy}
                onchange={async (e) => {
                  const input = e.currentTarget;
                  await navigate(input.value);
                  input.value = session.active?.key || today;
                }}
              /></label
            ><button
              aria-label="다음 날짜"
              disabled={busy}
              onclick={() => shift(1)}><ChevronRight size={18} /></button
            ><button
              class="nb-today"
              disabled={busy || ui.key === today}
              onclick={() => navigate(today)}>오늘</button
            ><button
              class="nb-board-entry"
              aria-label="화이트 보드 전체화면 열기"
              title="화이트 보드를 전체화면으로 열기"
              onclick={toggleBoard}
              disabled={!ready || busy}
              ><span class="nb-board-entry-icon"
                ><Presentation size={18} /></span
              ><span>화이트 보드<small>(전체화면)</small></span></button
            >
          </div>{/if}
      </header>
      <div
        class="nb-format"
        role="toolbar"
        tabindex="-1"
        class:closed={board && !toolsOpen}
        aria-label="본문 서식"
        onpointerdown={() => editor?.captureSelection()}
      >
        <select
          aria-label="글꼴"
          disabled={!ready || busy}
          value={ui.doc?.attrs?.fontId || DEFAULT_FONT}
          onchange={(e) => format("font", e.currentTarget.value)}
          >{#each fonts as f}<option value={f.name}>{f.name}</option
            >{/each}</select
        >
        <div class="nb-size">
          <button
            aria-label="글자 크기 줄이기"
            onpointerdown={keepSelection}
            disabled={!ready || busy}
            onclick={() => format("adjustSize", -1)}><Minus size={14} /></button
          ><input
            aria-label="글자 크기"
            inputmode="numeric"
            placeholder="혼합"
            bind:value={sizeText}
            disabled={!ready || busy}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                updateSize();
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                sizeText = String(editor?.size() || "");
                editor?.view.focus();
              }
            }}
            onchange={updateSize}
          /><button
            aria-label="글자 크기 늘리기"
            onpointerdown={keepSelection}
            disabled={!ready || busy}
            onclick={() => format("adjustSize", 1)}><Plus size={14} /></button
          >
        </div>
        <span class="nb-divider"></span>
        {#each [{ name: "bold", label: "굵게", icon: Bold }, { name: "italic", label: "기울임", icon: Italic }, { name: "strike", label: "취소선", icon: Strikethrough }, { name: "underline", label: "밑줄", icon: Underline }] as item}<button
            aria-label={item.label}
            title={item.label}
            aria-pressed={revision >= 0
              ? (editor?.markState(item.name) as any) || "false"
              : "false"}
            disabled={!ready || busy}
            onpointerdown={keepSelection}
            onclick={() => format(item.name)}><item.icon size={17} /></button
          >{/each}
        <div class="nb-color-wrap">
          <button
            class="nb-color-trigger"
            aria-label="글자색"
            aria-expanded={colorOpen}
            disabled={!ready || busy}
            onpointerdown={keepSelection}
            onclick={() => (colorOpen = !colorOpen)}>A<span></span></button
          >{#if colorOpen}<div class="nb-colors">
              {#each COLORS as color, i}<button
                  aria-label={[
                    "기본색",
                    "빨강",
                    "갈색",
                    "초록",
                    "파랑",
                    "보라",
                  ][i]}
                  style:background={color}
                  onpointerdown={keepSelection}
                  onclick={() => {
                    format("color", color);
                    colorOpen = false;
                  }}
                ></button>{/each}
            </div>{/if}
        </div>
        <span class="nb-divider"></span><button
          aria-label="실행 취소"
          title="실행 취소 (Ctrl+Z)"
          disabled={!ui.undo || busy}
          onpointerdown={keepSelection}
          onclick={() => format("undo")}><Undo2 size={17} /></button
        ><button
          aria-label="다시 실행"
          title="다시 실행 (Ctrl+Y)"
          disabled={!ui.redo || busy}
          onpointerdown={keepSelection}
          onclick={() => format("redo")}><Redo2 size={17} /></button
        >
        <div class="nb-zoom">
          <span>보기</span><button
            aria-label="보기 축소"
            disabled={zoom <= 50}
            onclick={() => adjustZoom(-10)}><Minus size={13} /></button
          ><span>{zoom}%</span><button
            aria-label="보기 확대"
            disabled={zoom >= 300}
            onclick={() => adjustZoom(10)}><Plus size={13} /></button
          >
        </div>
      </div>
      <div
        class="nb-scroll"
        bind:this={scrollHost}
        onscroll={measure}
        style:font-family={fontFamily}
        style:font-size={`${(22 * zoom) / 100}px`}
      >
        <div class="nb-editor" bind:this={editorHost}></div>
        {#if !ready}<div class="nb-loading" aria-label="알림장 준비 중">
            오늘 전할 이야기를 적어 주세요.
          </div>{/if}
      </div>
      {#if board && moreBelow}<div class="nb-more">
          <ArrowDown size={14} /> 아래에 내용이 더 있어요
        </div>{/if}
      {#if error || ui.storageError}<div class="nb-error" role="alert">
          <span>{error || messageFor(ui.storageError)}</span><button
            onclick={retry}>다시 시도</button
          >
          {#if !ready && recovery?.available}<button onclick={recoverStorage}
              >복구 사본 사용</button
            >{/if}
        </div>{/if}
      <footer class="nb-footer">
        {#if board && savedHint}<span class="nb-save-state" role="status"
            >저장했어요</span
          >{/if}
        {#if board}<button
            class="nb-soft"
            aria-label="서식 도구 열기"
            aria-expanded={toolsOpen}
            onclick={() => (toolsOpen = !toolsOpen)}
            ><SlidersHorizontal size={17} /><span>도구</span></button
          ><button class="nb-text" onclick={toggleBoard} disabled={busy}
            ><Minimize2 size={17} /><span>일반 화면 <kbd>Esc</kbd></span
            ></button
          >{:else}<div class="nb-save-state">
            <span class:pending={ui.status.includes("중")}
            ></span>{ui.status}{#if ui.dirty}<small
                >저장하지 않은 수정사항</small
              >{/if}
          </div>
          {#if ui.dirty}<button
              class="nb-text nb-revert"
              onclick={revert}
              disabled={busy}><RotateCcw size={15} />저장본으로</button
            >{/if}{/if}
        <div class="nb-footer-actions">
          <button
            class="nb-primary"
            onclick={save}
            disabled={!ready || busy || !hasContent(ui.doc)}
            title={!hasContent(ui.doc)
              ? "내용을 입력한 뒤 저장해 주세요."
              : "현재 내용을 저장본으로 확정"}><Check size={17} />저장</button
          >
        </div>
      </footer>
    </main>
    {#if !board}<aside class="nb-archive">
        <header>
          <div>
            <h2>최근 알림장</h2>
            <span>{results.length}일의 기록</span>
          </div>
          <button aria-label="휴지통 열기" title="휴지통" onclick={openTrash}
            ><Trash2 size={18} /></button
          ><button
            class="nb-archive-close"
            aria-label="기록 닫기"
            onclick={() => (archiveOpen = false)}><X size={18} /></button
          >
        </header>
        <div class="nb-filters">
          {#each [{ id: "all", label: "전체" }, { id: "week", label: "이번 주" }, { id: "month", label: "이번 달" }] as filter}<button
              class:active={period === filter.id}
              aria-pressed={period === filter.id}
              onclick={() => {
                period = filter.id;
                limit = 50;
              }}>{filter.label}</button
            >{/each}
        </div>
        <label class="nb-search"
          ><Search size={17} /><input
            aria-label="날짜 또는 내용 검색"
            placeholder="날짜 또는 내용 검색"
            bind:value={query}
            oninput={() => (limit = 50)}
          /></label
        >
        <div class="nb-entries">
          {#each results.slice(0, limit) as entry (entry.id)}<button
              class="nb-entry"
              class:selected={entry.dateKey === ui.key}
              onclick={() => navigate(entry.dateKey)}
              disabled={busy}
              ><span class="nb-entry-heading"
                ><strong
                  >{formatDate(entry.dateKey).replace(/^\d+년 /, "")}</strong
                ><small
                  >{!entry.hasSaved
                    ? "초안"
                    : entry.hasDraft
                      ? "수정 중"
                      : "저장됨"}</small
                ></span
              >
              <p>
                {query &&
                entry.draftText?.includes(query) &&
                !entry.savedText?.includes(query)
                  ? entry.draftText
                  : entry.savedText || entry.draftText || "빈 초안"}
              </p>
              {#if query && entry.draftText?.includes(query) && !entry.savedText?.includes(query)}<em
                  >초안에서 찾음</em
                >{/if}</button
            >{:else}<div class="nb-empty">
              <BookOpenText size={30} />
              <p>
                {query || period !== "all"
                  ? "찾는 알림장이 없어요."
                  : "하루의 이야기가 여기에 쌓여요."}
              </p>
              <small
                >{query || period !== "all"
                  ? "검색어나 기간을 바꿔 보세요."
                  : "작성 중인 초안도 안전하게 보관해요."}</small
              >
            </div>{/each}{#if results.length > limit}<button
              class="nb-soft"
              onclick={() => (limit += 50)}>더 보기</button
            >{/if}
        </div>
        {#if ui.exists}<button
            class="nb-delete"
            onclick={remove}
            disabled={busy}><Trash2 size={14} />이 날짜 알림장 삭제</button
          >{/if}
      </aside>{/if}
  </div>
</section>
{#if native && !board}{#each ["NorthWest", "NorthEast", "SouthWest", "SouthEast"] as corner}<button
      class="nb-resize"
      class:north={corner.startsWith("North")}
      class:south={corner.startsWith("South")}
      class:west={corner.endsWith("West")}
      class:east={corner.endsWith("East")}
      aria-label="창 크기 조절"
      tabindex="-1"
      onpointerdown={(e) => resize(e, corner as any)}
    ></button>{/each}{/if}
{#if trashOpen}<dialog
    class="nb-dialog nb-trash-dialog"
    use:modal
    oncancel={(e) => {
      e.preventDefault();
      trashOpen = false;
    }}
  >
    <header>
      <div>
        <h2>휴지통</h2>
        <p>삭제한 알림장을 다시 가져올 수 있어요.</p>
      </div>
      <button aria-label="휴지통 닫기" onclick={() => (trashOpen = false)}
        ><X size={20} /></button
      >
    </header>
    <div class="nb-trash-list">
      {#each trash as item (item.id)}<article>
          <strong>{formatDate(item.dateKey)}</strong><small
            >삭제한 알림장 · {item.saved ? "저장본 있음" : "초안"}</small
          >
          <pre>{plainText(item.draft || item.saved) || "빈 초안"}</pre>
          <div>
            <button
              class="nb-soft"
              onclick={() => restore(item)}
              disabled={busy}><RotateCcw size={15} />복원</button
            ><button
              class="nb-delete"
              onclick={() => purge(item)}
              disabled={busy}>영구 삭제</button
            >
          </div>
        </article>{:else}<div class="nb-empty">
          <Trash2 size={30} />
          <p>휴지통이 비어 있어요.</p>
        </div>{/each}
    </div>
  </dialog>{/if}
{#if confirmation}<dialog
    class="nb-dialog"
    use:modal
    oncancel={(e) => {
      e.preventDefault();
      answer(false);
    }}
  >
    <h2>{confirmation.title}</h2>
    <p>{confirmation.message}</p>
    {#if confirmation.left !== undefined}<div class="nb-compare">
        <section>
          <h3>현재 알림장</h3>
          <pre>{confirmation.left || "빈 초안"}</pre>
        </section>
        <section>
          <h3>복원할 알림장</h3>
          <pre>{confirmation.right || "빈 초안"}</pre>
        </section>
      </div>{/if}
    <footer>
      <button class="nb-soft" onclick={() => answer(false)}>취소</button><button
        class="nb-primary"
        onclick={() => answer(true)}>{confirmation.accept}</button
      >
    </footer>
  </dialog>{/if}
