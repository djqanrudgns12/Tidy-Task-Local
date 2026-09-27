<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    UsersRound,
    Plus,
    Search,
    Upload,
    Undo2,
    Pin,
    X,
    MoreHorizontal,
    Check,
    FolderOpen,
    Download,
    Trash2,
    LayoutGrid,
    List,
    ArrowRight,
    ArrowUp,
    ArrowDown,
  } from "lucide-svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { listen } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/core";
  import { dragRegion } from "../../lib/dragRegion.js";
  import {
    native,
    readRoster,
    execute,
    subscribeRoster,
    clearHistory,
    exportRoster,
  } from "../../lib/classroom/repository.js";
  import {
    genders,
    nextNumber,
    validateStudents,
  } from "../../lib/classroom/domain.js";
  import ImportDialog from "./ImportDialog.svelte";
  import "./classroom.css";
  let snapshot = $state<any>({
    revision: 0,
    defaultClassId: null,
    classes: [],
  });
  let selectedClass = $state(""),
    tab = $state("students"),
    search = $state(""),
    filter = $state("all"),
    sort = $state("number");
  let editingId = $state(""),
    editingOrder = $state<string[]>([]);
  let editGeneration = 0;
  function beginEdit(id: string) {
    editGeneration++;
    if (editingId !== id) editingOrder = visible.map((p: any) => p.id);
    editingId = id;
  }
  function endEdit(id: string) {
    const generation = editGeneration;
    void saveRow(id);
    setTimeout(() => {
      if (editGeneration === generation && editingId === id) editingId = "";
    }, 0);
  }
  let selected = $state<string[]>([]),
    drafts = $state<Record<string, any>>({}),
    error = $state(""),
    busy = $state(0),
    ready = $state(false),
    canUndo = $state(false),
    importing = $state(false),
    pinned = $state(false),
    options = $state(false);
  let newName = $state(""),
    newNumber = $state<number | undefined>(1),
    newGender = $state("unspecified"),
    assignTarget = $state("");
  let nameInput = $state<HTMLInputElement>();
  let dialog: HTMLDialogElement;
  let droppedFile: File | undefined;
  function takeFile() {
    const file = droppedFile;
    droppedFile = undefined;
    return file;
  }
  async function importFile(file: File) {
    if (!cl) {
      error = "학급을 먼저 추가해 주세요.";
      return;
    }
    if (importing) return;
    if (await flush()) {
      droppedFile = file;
      importing = true;
    }
  }
  function dropFiles(node: HTMLElement) {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      if (e.dataTransfer.files.length !== 1) {
        error = "파일은 한 번에 하나씩 가져와 주세요.";
        return;
      }
      void importFile(e.dataTransfer.files[0]);
    };
    node.addEventListener("dragover", over);
    node.addEventListener("drop", drop);
    return {
      destroy() {
        node.removeEventListener("dragover", over);
        node.removeEventListener("drop", drop);
      },
    };
  }
  function dragMember(node: HTMLElement, p: any) {
    node.draggable = true;
    const start = (e: DragEvent) => {
      e.dataTransfer?.setData(
        "application/x-tidy-students",
        JSON.stringify({
          classId: cl.id,
          ids: selected.includes(p.id) ? selected : [p.id],
        }),
      );
    };
    node.addEventListener("dragstart", start);
    return {
      destroy() {
        node.removeEventListener("dragstart", start);
      },
    };
  }
  function dropMembers(node: HTMLElement, groupId: string | null) {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("application/x-tidy-students"))
        e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const data = e.dataTransfer?.getData("application/x-tidy-students");
      if (!data) return;
      e.preventDefault();
      try {
        const { classId, ids } = JSON.parse(data);
        if (classId === cl.id && Array.isArray(ids)) void assign(groupId, ids);
      } catch {
        error = "학생 이동을 다시 시도해 주세요.";
      }
    };
    node.addEventListener("dragover", over);
    node.addEventListener("drop", drop);
    return {
      destroy() {
        node.removeEventListener("dragover", over);
        node.removeEventListener("drop", drop);
      },
    };
  }
  let question = $state<any>(null),
    answer = $state("");
  let resolveQuestion: ((v: string | null) => void) | undefined;
  let pending: Promise<any> = Promise.resolve();
  const savingRows = new Map<string, Promise<boolean>>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let failure = $state<any>(null),
    closing = false;
  const cl = $derived(
    snapshot.classes.find((c: any) => c.id === selectedClass),
  );
  const visible = $derived(
    cl?.students
      .filter(
        (p: any) =>
          (!search || `${p.number} ${p.name}`.includes(search)) &&
          (filter === "all" ||
            (filter === "unassigned" ? !p.groupId : p.gender === filter)),
      )
      .slice()
      .sort((a: any, b: any) =>
        editingId
          ? editingOrder.indexOf(a.id) - editingOrder.indexOf(b.id)
          : sort === "name"
            ? a.name.localeCompare(b.name, "ko")
            : a.number - b.number,
      ) || [],
  );
  const draggable = (node: HTMLElement) =>
    native ? dragRegion(node) : { destroy() {} };
  function accept(data: any) {
    if (data.revision < snapshot.revision) return;
    snapshot = data;
    if (!data.classes.some((c: any) => c.id === selectedClass))
      selectedClass = data.defaultClassId || data.classes[0]?.id || "";
    if (!newName.trim())
      newNumber = nextNumber(
        data.classes.find((c: any) => c.id === selectedClass)?.students || [],
      );
  }
  async function refresh() {
    try {
      accept(await readRoster());
    } catch (e) {
      error = String(e);
    }
  }
  function run(
    command: any,
    operationId = crypto.randomUUID(),
  ): Promise<boolean> {
    busy++;
    const task = pending.then(async () => {
      try {
        const result = await execute(command, snapshot.revision, operationId);
        accept(result.snapshot);
        canUndo = result.canUndo;
        failure = null;
        error = "";
        return true;
      } catch (e) {
        failure = { command, operationId };
        error = String(e).replace(/^Error: /, "");
        if (error.includes("REVISION_CONFLICT")) await refresh();
        return false;
      } finally {
        busy--;
      }
    });
    pending = task;
    return task;
  }
  async function ask(
    title: string,
    body: string,
    initial: string | null = null,
    danger = false,
  ): Promise<string | null> {
    question = { title, body, input: initial !== null, danger };
    answer = initial ?? "";
    await tick();
    dialog.showModal();
    return new Promise((resolve) => (resolveQuestion = resolve));
  }
  function respond(value: string | null) {
    dialog.close();
    question = null;
    resolveQuestion?.(value);
  }
  // 다른 도구(개인 점수판 등)가 "할 일"과 함께 명단 창을 열었을 때 알맞은 칸에 초점을 둡니다.
  let firstClassButton = $state<HTMLButtonElement>();
  let highlightFirst = $state(false);
  async function applyIntent(intent: any) {
    if (!intent) return;
    await tick();
    if (intent.action === "add-students" && snapshot.classes.some((c: any) => c.id === intent.classId)) {
      selectedClass = intent.classId;
      tab = "students";
      await tick();
      nameInput?.focus();
    } else if (intent.action === "create-class") {
      if (!snapshot.classes.length) {
        firstClassButton?.focus();
        highlightFirst = true;
        setTimeout(() => (highlightFirst = false), 1200);
      } else if (!question) {
        // 학급이 이미 있으면 [학급 추가]를 누른 것과 같게 이름 입력 창을 바로 엽니다(예: 자리 배치 드롭다운의 "학급 추가").
        // 다른 확인 창이 떠 있으면 그 답을 덮어쓰지 않도록 건너뜁니다. 입력을 기다리므로 await하지 않습니다.
        void createClass();
      }
    }
  }
  async function takeIntent() {
    if (!native) return;
    try {
      await applyIntent(await invoke("classroom_take_intent"));
    } catch {}
  }
  async function createClass() {
    if (!(await flush())) return;
    const n = await ask("학급 추가", "학급 이름을 입력해 주세요.", "");
    if (!n?.trim()) return;
    if (await run({ type: "createClass", name: n })) {
      selectedClass = snapshot.classes.at(-1).id;
      newNumber = 1;
      await tick();
      nameInput?.focus();
    }
  }
  async function renameClass() {
    const id = cl.id;
    const n = await ask(
      "학급 이름 변경",
      "학생과 모둠은 그대로 유지됩니다.",
      cl.name,
    );
    if (n?.trim()) await run({ type: "renameClass", classId: id, name: n });
  }
  async function deleteClass() {
    if (!(await flush())) return;
    const id = cl.id;
    if (
      (await ask(
        "학급을 삭제할까요?",
        `${cl.name}의 학생 ${cl.students.length}명과 모둠 ${cl.groups.length}개가 삭제됩니다.`,
        null,
        true,
      )) !== null
    ) {
      await run({ type: "deleteClass", classId: id });
      selected = [];
    }
  }
  async function switchClass(id: string) {
    if (!(await flush())) return;
    selectedClass = id;
    selected = [];
    search = "";
    filter = "all";
    newNumber = nextNumber(cl?.students || []);
    newName = "";
  }
  function edit(p: any, field: string, value: any) {
    drafts[p.id] = { ...(drafts[p.id] || p), [field]: value };
    clearTimeout(timers.get(p.id));
    timers.set(
      p.id,
      setTimeout(() => saveRow(p.id), 500),
    );
  }
  function saveRow(id: string): Promise<boolean> {
    if (savingRows.has(id)) return savingRows.get(id)!;
    let success = false;
    const task = saveRowNow(id)
      .then((ok) => {
        success = ok;
        return ok;
      })
      .finally(() => {
        savingRows.delete(id);
        if (success && drafts[id] && !failure) {
          clearTimeout(timers.get(id));
          timers.set(
            id,
            setTimeout(() => saveRow(id), 500),
          );
        }
      });
    savingRows.set(id, task);
    return task;
  }
  async function saveRowNow(id: string) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    const draft = drafts[id];
    if (!draft || !cl) return true;
    const captured = JSON.stringify(draft);
    const classId = cl.id;
    try {
      validateStudents(cl.students.map((p: any) => (p.id === id ? draft : p)));
    } catch (e) {
      error = String(e).replace("Error: ", "");
      return false;
    }
    const ok = await run({
      type: "saveStudents",
      classId,
      students: [
        {
          id,
          number: Number(draft.number),
          name: draft.name,
          gender: draft.gender,
        },
      ],
      deleteIds: [],
    });
    if (ok && JSON.stringify(drafts[id]) === captured) delete drafts[id];
    return ok;
  }
  async function addStudent() {
    if (!newName.trim() || !cl || busy) return;
    const name = newName,
      number = Number(newNumber),
      gender = newGender;
    try {
      validateStudents([...cl.students, { name, number, gender }]);
    } catch (e) {
      error = String(e);
      return;
    }
    if (
      await run({
        type: "saveStudents",
        classId: cl.id,
        students: [{ id: null, number, name, gender }],
        deleteIds: [],
      })
    ) {
      newName = "";
      newNumber = nextNumber(cl.students);
      await tick();
      nameInput?.focus();
    }
  }
  async function flush() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    await pending;
    for (const id of Object.keys(drafts)) {
      if (!(await saveRow(id))) return false;
    }
    await pending;
    if (newName.trim() && !failure) await addStudent();
    return !failure && !newName.trim();
  }
  function rowKey(e: KeyboardEvent, id: string) {
    if (e.isComposing) return;
    if (e.key === "Escape") {
      clearTimeout(timers.get(id));
      timers.delete(id);
      delete drafts[id];
      error = "";
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void saveRow(id);
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>("input.student-name"),
      );
      const i = inputs.indexOf(e.currentTarget as HTMLInputElement);
      (inputs[i + 1] || nameInput)?.focus();
    }
  }
  function choose(id: string, checked: boolean) {
    selected = checked
      ? [...new Set([...selected, id])]
      : selected.filter((v) => v !== id);
  }
  async function remove(ids: string[]) {
    if (!(await flush())) return;
    if (
      ids.length > 1 &&
      (await ask(
        "학생을 삭제할까요?",
        `선택한 학생 ${ids.length}명을 삭제합니다.`,
        null,
        true,
      )) === null
    )
      return;
    if (await run({ type: "deleteStudents", classId: cl.id, ids }))
      selected = selected.filter((id) => !ids.includes(id));
  }
  async function addGroups() {
    const count = await ask(
      "모둠 만들기",
      "만들 모둠 수를 입력해 주세요.",
      "1",
    );
    if (count === null) return;
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      error = "1~100 사이의 모둠 수를 입력해 주세요.";
      return;
    }
    await run({ type: "createGroups", classId: cl.id, count: n });
  }
  async function renameGroup(g: any) {
    const name = await ask(
      "모둠 이름 변경",
      "모둠 이름을 입력해 주세요.",
      g.name,
    );
    if (name?.trim())
      await run({ type: "renameGroup", classId: cl.id, groupId: g.id, name });
  }
  async function deleteGroup(g: any) {
    const n = cl.students.filter((p: any) => p.groupId === g.id).length;
    if (
      n &&
      (await ask(
        "모둠을 삭제할까요?",
        `${g.name}의 학생 ${n}명은 미배정으로 이동합니다.`,
        null,
        true,
      )) === null
    )
      return;
    await run({ type: "deleteGroup", classId: cl.id, groupId: g.id });
  }
  async function assign(groupId: string | null, ids = selected) {
    if (!ids.length) return;
    if (await run({ type: "assign", classId: cl.id, ids, groupId }))
      selected = [];
  }
  async function reorder(index: number, delta: number) {
    const ids = cl.groups.map((g: any) => g.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    await run({ type: "reorderGroups", classId: cl.id, ids });
  }
  async function backup() {
    if (await flush()) {
      try {
        await exportRoster(await readRoster());
      } catch {
        error = "백업을 저장하지 못했어요.";
      }
    }
  }
  async function restore(file: File) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("백업이 너무 커요.");
      const backup = JSON.parse(await file.text());
      if (
        backup.format !== "tidy-classroom" ||
        ![1, 2].includes(backup.schemaVersion) ||
        !Array.isArray(backup.data?.classes)
      )
        throw new Error("지원하지 않는 학급 백업이에요.");
      if (
        (await ask(
          "학급 데이터를 복원할까요?",
          `현재 학급과 자리 배치·지난 자리 기록을 백업의 학급 ${backup.data.classes.length}개로 대체합니다. 이전 형식 백업에는 자리 배치가 없습니다.`,
          null,
          true,
        )) === null
      )
        return;
      if (await flush()) await run({ type: "restore", backup });
    } catch (e) {
      error = String(e);
    }
  }
  let quitPreparing = $state(false);
  async function closeWindow() {
    if (closing || quitPreparing) return;
    closing = true;
    try {
      if (importing) {
        if (
          (await ask(
            "등록을 취소할까요?",
            "가져오는 중인 미등록 명단을 버립니다.",
            null,
            true,
          )) === null
        )
          return;
        importing = false;
      }
      if (newName.trim() || !(await flush())) {
        if (
          (await ask(
            "저장하지 않은 내용이 있어요.",
            "수정 중인 내용을 버리고 창을 닫을까요?",
            null,
            true,
          )) === null
        )
          return;
      }
      clearHistory();
      if (native) await getCurrentWindow().destroy();
      else window.close();
    } finally {
      closing = false;
    }
  }
  async function openImport() {
    if (await flush()) importing = true;
  }
  async function importCommit(command: any, revision: number) {
    if (cl.revision !== revision) {
      error = "명단이 변경되었어요. 파일을 다시 비교해 주세요.";
      return false;
    }
    return run(command);
  }
  onMount(() => {
    let disposed = false;
    const offs: (() => void)[] = [];
    void (async () => {
      try {
        if (native) offs.push(await listen("noticeboard-quit-cancel", () => { quitPreparing = false; }));
        const off = await subscribeRoster(() => void refresh());
        if (disposed) {
          off();
          return;
        }
        offs.push(off);
        await refresh();
        ready = true;
        newNumber = nextNumber(cl?.students || []);
        if (native) {
          const win = getCurrentWindow();
          await takeIntent();
          offs.push(await listen("roster-intent", () => void takeIntent()));
          offs.push(
            await listen<{ token: string; name: string }>("classroom-file-dropped", async (e) => {
              try {
                // 파일 내용은 원본 바이트(ArrayBuffer)로 옵니다(예비 통로 postMessage에서는 숫자 배열).
                // 이름은 떨어뜨림 알림에 함께 옵니다.
                const bytes = await invoke<ArrayBuffer | number[]>("classroom_take_drop", {
                  token: e.payload.token,
                });
                const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : Uint8Array.from(bytes);
                await importFile(new File([data], e.payload.name));
              } catch {
                error =
                  "파일을 가져오지 못했어요. 파일 선택으로 다시 시도해 주세요.";
              }
            }),
          );
          offs.push(
            await win.onCloseRequested((e) => {
              e.preventDefault();
              void closeWindow();
            }),
          );
          offs.push(
            await listen<any>("classroom-quit-request", async (event) => {
              quitPreparing = true;
              const ok = !importing && !newName.trim() && (await flush());
              if (event.payload?.requestId) await invoke("noticeboard_quit_reply", {requestId: event.payload.requestId, allow: ok});
              else await invoke("classroom_quit_reply", { allow: ok });
              if (!ok) quitPreparing = false;
              if (!ok) {
                error = "종료 전에 미저장 내용과 가져오기를 확인해 주세요.";
                await win.show();
                await win.setFocus();
              }
            }),
          );
        }
      } catch (e) {
        error = String(e);
        ready = true;
      }
    })();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      offs.forEach((off) => off());
      timers.forEach(clearTimeout);
      window.removeEventListener("focus", focus);
      void clearHistory();
    };
  });
</script>

{#if quitPreparing}<div class="roster-quit-status" role="status" style="position:fixed;z-index:100;bottom:12px;left:12px;background:white;padding:12px;border-radius:12px">종료 전에 자료를 보관하고 있어요. <button onclick={() => invoke("noticeboard_cancel_quit")}>종료 취소</button></div>{/if}
<div class="roster-app" use:dropFiles inert={quitPreparing}>
  <header class="roster-titlebar" use:draggable>
    <div class="roster-brand">
      <span><UsersRound size={19} /></span><strong>학급 명단</strong><small
        >Tidy 툴킷</small
      >
    </div>
    <div class="roster-window-actions">
      <span class="save-status" aria-live="polite"
        >{busy
          ? "저장 중…"
          : Object.keys(drafts).length
            ? "수정 중"
            : error
              ? "확인 필요"
              : "저장됨"}</span
      ><button
        class="icon"
        title="항상 위"
        aria-label="항상 위"
        aria-pressed={pinned}
        onclick={async () => {
          if (native) await getCurrentWindow().setAlwaysOnTop(!pinned);
          pinned = !pinned;
        }}><Pin size={16} /></button
      ><button class="icon" aria-label="창 닫기" onclick={closeWindow}
        ><X size={19} /></button
      >
    </div>
  </header>
  <div class="roster-layout">
    <aside class="class-sidebar">
      <div class="sidebar-heading">
        <span>내 학급 <b>{snapshot.classes.length}</b></span><button
          class="icon"
          aria-label="학급 추가"
          onclick={createClass}><Plus size={18} /></button
        >
      </div>
      <nav aria-label="학급 목록">
        {#each snapshot.classes as c}<button
            class:active={selectedClass === c.id}
            onclick={() => switchClass(c.id)}
            ><span class="class-symbol"><UsersRound size={17} /></span><span
              ><strong>{c.name}</strong><small
                >{c.students.length}명 · 모둠 {c.groups.length}개</small
              ></span
            >{#if snapshot.defaultClassId === c.id}<i title="기본 학급"
              ></i>{/if}</button
          >{/each}
      </nav>
      <button class="add-class" onclick={createClass}
        ><Plus size={16} /> 학급 추가</button
      >
      <div class="sidebar-bottom">
        <span>이 기기에 저장됩니다</span><button onclick={backup}
          ><Download size={15} /> 데이터 내보내기</button
        ><label
          ><FolderOpen size={15} /> 백업 복원<input
            type="file"
            accept=".json"
            onchange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void restore(f);
            }}
          /></label
        >
      </div>
    </aside>
    <main class="roster-main">
      <div class="compact-class">
        <select
          aria-label="학급 선택"
          value={selectedClass}
          onchange={(e) => switchClass(e.currentTarget.value)}
          >{#each snapshot.classes as c}<option value={c.id}>{c.name}</option
            >{/each}</select
        ><button onclick={createClass}><Plus size={16} /> 학급 추가</button
        ><button class="icon" title="데이터 내보내기" onclick={backup}
          ><Download size={17} /></button
        >
        <label class="compact-restore" title="백업 복원"
          ><FolderOpen size={17} /><input
            type="file"
            accept=".json"
            aria-label="백업 복원 파일"
            onchange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void restore(f);
            }}
          /></label
        >
      </div>
      {#if error}<div class="roster-error" role="alert">
          <span>{error}</span>{#if failure}<button
              onclick={() => run(failure.command, failure.operationId)}
              >다시 시도</button
            >{/if}<button
            class="icon"
            aria-label="오류 안내 닫기"
            onclick={() => (error = "")}><X size={14} /></button
          >
        </div>{/if}
      {#if !ready}<div class="empty-roster">
          <p>학급을 불러오고 있어요…</p>
        </div>{:else if !cl}<div class="empty-roster">
          <!-- 원 안의 더하기는 글자 "+" 대신 아이콘으로 그립니다. 글자는 글꼴마다 놓이는 높이가 달라 원 중앙에서 최대 4px가량 벗어났습니다. -->
          <div class="empty-art"><UsersRound size={44} /><span aria-hidden="true"><Plus size={15} strokeWidth={3} /></span></div>
          <span class="eyebrow">우리 반의 시작</span>
          <h1>학생과 모둠을 한곳에</h1>
          <p>
            학급을 만들고 명단을 등록하세요.<br />등록한 학생은 여러 툴킷
            도구에서 함께 사용할 수 있어요.
          </p>
          <button class="primary" class:intent-highlight={highlightFirst} bind:this={firstClassButton} onclick={createClass}
            ><Plus size={18} /> 첫 학급 만들기</button
          >
        </div>{:else}
        <div class="class-heading">
          <div>
            <span class="eyebrow">우리 반 관리</span>
            <h1>{cl.name}<span>{cl.students.length}명</span></h1>
          </div>
          <div class="heading-actions">
            <button
              class:default-active={snapshot.defaultClassId === cl.id}
              onclick={() => run({ type: "setDefault", classId: cl.id })}
              >{#if snapshot.defaultClassId === cl.id}<Check size={14} /> 기본 학급{:else}기본
                학급으로{/if}</button
            ><button
              class="icon"
              aria-label="학급 메뉴"
              aria-expanded={options}
              onclick={() => (options = !options)}
              ><MoreHorizontal size={20} /></button
            >{#if options}<div class="class-options">
                <button
                  onclick={() => {
                    options = false;
                    void renameClass();
                  }}>학급 이름 변경</button
                ><button
                  class="danger-text"
                  onclick={() => {
                    options = false;
                    void deleteClass();
                  }}>학급 삭제</button
                >
              </div>{/if}
          </div>
        </div>
        <div class="roster-tabs">
          <div>
            <button
              class:active={tab === "students"}
              onclick={() => {
                tab = "students";
                selected = [];
              }}><List size={16} /> 학생 명단</button
            ><button
              class:active={tab === "groups"}
              onclick={() => {
                tab = "groups";
                selected = [];
              }}><LayoutGrid size={16} /> 모둠 구성</button
            >
          </div>
          <button
            class="undo-button"
            disabled={!canUndo || !!busy}
            onclick={async () => {
              if (await flush()) await run({ type: "undo" });
            }}><Undo2 size={15} /> 실행 취소</button
          >
        </div>
        {#if tab === "students"}
          <section class="roster-sheet" aria-label="학생 명단 관리">
            <div class="roster-tools">
              <label class="search-box"
                ><Search size={16} /><input
                  placeholder="이름 또는 번호 검색"
                  aria-label="학생 검색"
                  bind:value={search}
                  oninput={() => (selected = [])}
                /></label
              ><select
                aria-label="학생 필터"
                bind:value={filter}
                onchange={() => (selected = [])}
                ><option value="all">전체 학생</option><option value="unassigned"
                  >미배정</option
                >{#each genders as g}<option value={g.value}>{g.label}</option
                  >{/each}</select
              ><select aria-label="정렬" bind:value={sort}
                ><option value="number">번호순</option><option value="name"
                  >이름순</option
                ></select
              ><button class="secondary" onclick={openImport}
                ><Upload size={15} /> 파일 가져오기</button
              >
            </div>
            {#if selected.length}<div class="selection-bar">
                <strong>{selected.length}명 선택</strong><select
                  aria-label="배정할 모둠"
                  bind:value={assignTarget}
                  ><option value="">미배정</option>{#each cl.groups as g}<option
                      value={g.id}>{g.name}</option
                    >{/each}</select
                ><button onclick={() => assign(assignTarget || null)}
                  >모둠 이동</button
                ><button class="danger-text" onclick={() => remove(selected)}
                  >삭제</button
                ><button onclick={() => (selected = [])}>선택 해제</button>
              </div>{/if}
            <div class="student-scroll" role="region" aria-label="학생 명단 표">
              <table class="student-table" aria-label="학생 명단">
                <thead
                  ><tr
                    ><th class="check-cell"
                      ><input
                        type="checkbox"
                        aria-label="검색 결과 전체 선택"
                        checked={visible.length > 0 &&
                          visible.every((p: any) => selected.includes(p.id))}
                        onchange={(e) =>
                          (selected = e.currentTarget.checked
                            ? visible.map((p: any) => p.id)
                            : [])}
                      /></th
                    ><th class="number-cell" scope="col">번호</th><th scope="col">이름</th><th
                      class="gender-cell" scope="col">성별 <small>선택 사항</small></th
                    ><th class="row-action" scope="col"><span class="roster-sr-only">삭제</span></th></tr
                  ></thead
                ><tbody
                  >{#each visible as p (p.id)}<tr
                      class:row-selected={selected.includes(p.id)}
                      ><td
                        ><input
                          type="checkbox"
                          aria-label={`${p.number}번 ${p.name} 선택`}
                          checked={selected.includes(p.id)}
                          onchange={(e) => choose(p.id, e.currentTarget.checked)}
                        /></td
                      ><td
                        ><input
                          class="student-number"
                          aria-label={`${p.name} 번호`}
                          type="number"
                          min="1"
                          max="9999"
                          value={drafts[p.id]?.number ?? p.number}
                          oninput={(e) =>
                            edit(p, "number", Number(e.currentTarget.value))}
                          onfocus={() => beginEdit(p.id)}
                          onblur={() => endEdit(p.id)}
                          onkeydown={(e) => rowKey(e, p.id)}
                        /></td
                      ><td
                        ><input
                          class="student-name"
                          aria-label={`${p.number}번 이름`}
                          value={drafts[p.id]?.name ?? p.name}
                          oninput={(e) => {
                            if (!("isComposing" in e && e.isComposing))
                              edit(p, "name", e.currentTarget.value);
                          }}
                          oncompositionend={(e) =>
                            edit(p, "name", e.currentTarget.value)}
                          onfocus={() => beginEdit(p.id)}
                          onblur={() => endEdit(p.id)}
                          onkeydown={(e) => rowKey(e, p.id)}
                        /></td
                      ><td
                        ><div
                          class="gender-options"
                          role="group"
                          aria-label={`${p.name} 성별`}
                        >
                          {#each genders as g}<button
                              class:chosen={(drafts[p.id]?.gender ?? p.gender) ===
                                g.value}
                              class:unspecified={g.value === "unspecified"}
                              aria-pressed={(drafts[p.id]?.gender ?? p.gender) ===
                                g.value}
                              onclick={() => {
                                edit(p, "gender", g.value);
                                void saveRow(p.id);
                              }}>{g.label}</button
                            >{/each}
                        </div></td
                      ><td
                        ><button
                          class="icon delete-student"
                          aria-label={`${p.name} 삭제`}
                          onclick={() => remove([p.id])}
                          ><Trash2 size={15} /></button
                        ></td
                      ></tr
                    >{/each}</tbody
                >
              </table>
              {#if !visible.length}<div class="table-empty">
                  <UsersRound size={26} />
                  <p>
                    {cl.students.length
                      ? "검색 결과가 없어요."
                      : "첫 학생의 이름을 아래에 입력해 주세요."}
                  </p>
                  {#if !cl.students.length}<button onclick={openImport}
                      >명렬표 파일로 한 번에 등록하기 <ArrowRight
                        size={14}
                      /></button
                    >{/if}
                </div>{/if}
            </div>
            <div class="table-foot">
              <span
                >전체 <strong>{cl.students.length}명</strong>{#if search || filter !== "all"}
                  · 표시 <strong>{visible.length}명</strong>{/if}</span
              ><span>이름·번호를 누르면 바로 수정</span>
            </div>
          </section>
          <form
            class="new-student"
            onsubmit={(e) => {
              e.preventDefault();
              void addStudent();
            }}
          >
            <div class="new-student-heading">
              <strong><Plus size={18} /> 학생 추가</strong>
              <span>Enter로 연속 등록</span>
            </div>
            <div class="new-student-fields">
              <label class="new-number-field">
                <span>번호</span>
                <input
                  aria-label="새 학생 번호"
                  type="number"
                  min="1"
                  max="9999"
                  bind:value={newNumber}
                />
              </label>
              <label class="new-name-field">
                <span>이름</span>
                <input
                  bind:this={nameInput}
                  aria-label="새 학생 이름"
                  placeholder="이름 입력 후 Enter"
                  bind:value={newName}
                  onkeydown={(e) => {
                    if (e.isComposing && e.key === "Enter") e.preventDefault();
                  }}
                />
              </label>
              <label class="new-gender-field">
                <span>성별 <small>선택 사항</small></span>
                <select aria-label="새 학생 성별" bind:value={newGender}>
                  {#each genders as g}<option value={g.value}>{g.label}</option>{/each}
                </select>
              </label>
              <button class="primary" type="submit" disabled={!newName.trim() || !!busy}>
                명단에 추가
              </button>
            </div>
          </form>
        {:else}
          <div class="group-tools">
            <p>학생을 선택하고 모둠으로 이동하세요.</p>
            <button class="secondary" onclick={addGroups}
              ><Plus size={16} /> 모둠 만들기</button
            >
          </div>
          {#if selected.length}<div class="selection-bar">
              <strong>{selected.length}명 선택</strong><select
                aria-label="이동할 모둠"
                bind:value={assignTarget}
                ><option value="">미배정</option>{#each cl.groups as g}<option
                    value={g.id}>{g.name}</option
                  >{/each}</select
              ><button
                class="primary"
                onclick={() => assign(assignTarget || null)}>이동</button
              ><button onclick={() => (selected = [])}>선택 해제</button>
            </div>{/if}
          <div class="group-board">
            {#each [{ id: null, name: "미배정" }, ...cl.groups] as g, i}<section
                use:dropMembers={g.id}
                class="group-card"
                class:unassigned={!g.id}
              >
                <header>
                  <button
                    class="group-name"
                    onclick={() => g.id && renameGroup(g)}>{g.name}</button
                  ><span
                    >{cl.students.filter((p: any) => p.groupId === g.id)
                      .length}명</span
                  >{#if g.id}<div>
                      <button
                        class="icon"
                        aria-label={`${g.name} 앞으로`}
                        disabled={i === 1}
                        onclick={() => reorder(i - 1, -1)}
                        ><ArrowUp size={13} /></button
                      ><button
                        class="icon"
                        aria-label={`${g.name} 뒤로`}
                        disabled={i === cl.groups.length}
                        onclick={() => reorder(i - 1, 1)}
                        ><ArrowDown size={13} /></button
                      ><button
                        class="icon"
                        aria-label={`${g.name} 삭제`}
                        onclick={() => deleteGroup(g)}><X size={14} /></button
                      >
                    </div>{/if}
                </header>
                <div class="group-members">
                  {#each cl.students.filter((p: any) => p.groupId === g.id) as p}<label
                      use:dragMember={p}
                      class:selected={selected.includes(p.id)}
                      ><input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onchange={(e) => choose(p.id, e.currentTarget.checked)}
                      /><span>{p.number}</span><strong>{p.name}</strong></label
                    >{/each}{#if !cl.students.some((p: any) => p.groupId === g.id)}<p
                    >
                      {g.id
                        ? "아직 구성원이 없어요."
                        : "모두 모둠에 배정됐어요."}
                    </p>{/if}
                </div>
                {#if selected.length}<button
                    class="assign-here"
                    onclick={() => assign(g.id)}
                    >선택한 {selected.length}명 여기로 <ArrowRight
                      size={14}
                    /></button
                  >{/if}
              </section>{/each}
          </div>
        {/if}{/if}
    </main>
  </div>
</div>
<dialog
  class="roster-dialog question-dialog"
  bind:this={dialog}
  oncancel={(e) => {
    e.preventDefault();
    respond(null);
  }}
>
  {#if question}<form
      onsubmit={(e) => {
        e.preventDefault();
        respond(question.input ? answer : "yes");
      }}
    >
      <header><h2>{question.title}</h2></header>
      <p>{question.body}</p>
      {#if question.input}<input
          aria-label={question.title}
          bind:value={answer}
          maxlength="80"
        />{/if}
      <footer>
        <button class="secondary" type="button" onclick={() => respond(null)}
          >취소</button
        ><button
          class:danger={question.danger}
          class="primary"
          disabled={question.input && !answer.trim()}
          type="submit">{question.danger ? "삭제 / 확인" : "확인"}</button
        >
      </footer>
    </form>{/if}
</dialog>
{#if importing && cl}<ImportDialog
    {takeFile}
    classroom={cl}
    oncommit={importCommit}
    onclose={() => (importing = false)}
  />{/if}
