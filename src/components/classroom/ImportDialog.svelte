<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { X, Upload, Check, ArrowRight, LoaderCircle } from "lucide-svelte";
  import { parseFile, parsePaste } from "../../lib/classroom/import.js";
  import {
    reconcile,
    importCommand,
    genders,
  } from "../../lib/classroom/domain.js";
  let { classroom, oncommit, onclose, takeFile } = $props<{
    classroom: any;
    oncommit: (command: any, revision: number) => Promise<boolean>;
    onclose: () => void;
    takeFile?: () => File | undefined;
  }>();
  let dialog: HTMLDialogElement;
  let stage = $state("choose"),
    tables = $state<any[]>([]),
    candidates = $state<any[]>([]),
    tableIndex = $state(0),
    error = $state(""),
    paste = $state(""),
    busy = $state(false),
    initialRevision = $state(0);
  let abort: AbortController | undefined;
  let generation = 0;
  let expiry: ReturnType<typeof setTimeout>;
  function touch() {
    clearTimeout(expiry);
    expiry = setTimeout(
      () => {
        if (stage === "committing") {
          touch();
          return;
        }
        candidates = [];
        tables = [];
        stage = "choose";
        error =
          "30분 동안 사용하지 않아 임시 명단을 지웠어요. 파일을 다시 선택해 주세요.";
      },
      30 * 60 * 1000,
    );
  }
  let manual = $state(false),
    colNumber = $state(1),
    colName = $state(2),
    colGender = $state(0),
    startRow = $state(2);
  let deleteIds = $state<string[]>([]);
  const selected = $derived(candidates.filter((c) => c.include));
  const added = $derived(selected.filter((c) => !c.id).length);
  const modified = $derived(selected.length - added);
  function selectTable(index: number) {
    touch();
    tableIndex = index;
    candidates = reconcile(tables[index].students, classroom.students);
    initialRevision = classroom.revision;
    deleteIds = [];
  }
  async function load(file?: File) {
    const gen = ++generation;
    abort?.abort();
    abort = new AbortController();
    busy = true;
    error = "";
    stage = "reading";
    const timer = setTimeout(() => abort?.abort(), 30000);
    try {
      const result = file
        ? await parseFile(
            file,
            abort.signal,
            manual
              ? {
                  number: colNumber ? colNumber - 1 : null,
                  name: colName - 1,
                  gender: colGender ? colGender - 1 : null,
                  startRow,
                }
              : null,
          )
        : await parsePaste(paste);
      if (gen !== generation) return;
      tables = result;
      selectTable(0);
      stage = "review";
      paste = "";
    } catch (e) {
      if (gen === generation) {
        error = e instanceof Error ? e.message : String(e);
        if (abort.signal.aborted)
          error = "분석을 중단했어요. 파일 크기와 형식을 확인해 주세요.";
        stage = "choose";
      }
    } finally {
      clearTimeout(timer);
      if (gen === generation) busy = false;
    }
  }
  function close() {
    if (stage === "committing") return;
    generation++;
    abort?.abort();
    candidates = [];
    tables = [];
    onclose();
  }
  function edit(index: number, field: string, value: any) {
    touch();
    candidates[index][field] = value;
    const issue = candidates[index].issue || "";
    if (
      (field === "gender" && issue.includes("성별")) ||
      (field === "number" && issue.includes("번호"))
    )
      candidates[index].issue = "";
    if (field === "id") candidates[index].needsMatch = false;
  }
  async function commit() {
    error = "";
    try {
      const command = importCommand(
        classroom.id,
        candidates,
        classroom.students,
        deleteIds,
      );
      stage = "committing";
      if (await oncommit(command, initialRevision)) {
        stage = "done";
        close();
      } else stage = "review";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      stage = "review";
    }
  }
  onMount(() => {
    const file = takeFile?.();
    if (file) void load(file);
  });
  onDestroy(() => {
    clearTimeout(expiry);
    generation++;
    abort?.abort();
  });
  const open = (node: HTMLDialogElement) => {
    dialog = node;
    node.showModal();
    return {
      destroy() {
        node.close();
      },
    };
  };
</script>

<dialog
  class="roster-dialog import-dialog"
  use:open
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <header>
    <div>
      <span class="eyebrow">학생 등록</span>
      <h2>명단 가져오기</h2>
    </div>
    <button
      class="icon"
      aria-label="닫기"
      onclick={close}
      disabled={stage === "committing"}><X size={20} /></button
    >
  </header>
  {#if stage === "choose" || stage === "reading"}
    <div class="import-start">
      <div class="file-drop">
        <Upload size={30} />
        <h3>명렬표 파일을 선택하세요</h3>
        <p>PDF · XLSX · CSV · HWPX / 최대 20MB</p>
        <label class="primary file-button"
          >파일 선택<input
            type="file"
            accept=".pdf,.xlsx,.csv,.hwpx"
            disabled={busy}
            onchange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void load(f);
            }}
          /></label
        >
      </div>
      <div class="paste-area">
        <label for="roster-paste">또는 이름·표 붙여넣기</label><textarea
          id="roster-paste"
          rows="5"
          placeholder="김하늘&#10;이바다&#10;박나무"
          bind:value={paste}
          disabled={busy}
        ></textarea><button
          class="secondary"
          onclick={() => load()}
          disabled={!paste.trim() || busy}
          >명단 확인 <ArrowRight size={15} /></button
        >
      </div>
      <details class="manual-columns">
        <summary>열을 자동으로 찾지 못할 때</summary><label
          ><input type="checkbox" bind:checked={manual} /> 직접 열 지정</label
        >{#if manual}<div>
            <label
              >번호 열 (없으면 0)<input
                type="number"
                min="0"
                max="100"
                bind:value={colNumber}
              /></label
            ><label
              >이름 열<input
                type="number"
                min="1"
                max="100"
                bind:value={colName}
              /></label
            ><label
              >성별 열 (없으면 0)<input
                type="number"
                min="0"
                max="100"
                bind:value={colGender}
              /></label
            ><label
              >학생 시작 행<input
                type="number"
                min="1"
                max="10000"
                bind:value={startRow}
              /></label
            >
          </div>
          <p>왼쪽부터 1열입니다. 열을 지정한 후 파일을 다시 선택하세요.</p>{/if}
      </details>
      <p class="privacy-note">
        이 기기에서 번호·이름·성별만 가져옵니다. 원본 사본은 저장하지 않습니다.
      </p>
    </div>
  {:else}
    <div class="import-summary">
      <span
        ><strong>{selected.length}명</strong> 선택 · 신규 {added} · 연결 {modified}
        · 삭제 {deleteIds.length}</span
      >{#if tables.length > 1}<select
          aria-label="가져올 표"
          value={tableIndex}
          onchange={(e) => selectTable(Number(e.currentTarget.value))}
          >{#each tables as t, i}<option value={i}
              >{t.label} ({t.students.length}명)</option
            >{/each}</select
        >{/if}
    </div>
    <p class="import-hint">
      번호와 이름이 같은 학생은 기존 기록에 연결해요. 연결이 애매한 학생만
      확인해 주세요.
    </p>
    <div class="import-table">
      <table>
        <thead
          ><tr
            ><th>등록</th><th>번호</th><th>이름</th><th>성별</th><th
              >기존 학생 연결</th
            ></tr
          ></thead
        ><tbody
          >{#each candidates as c, i}<tr class:issue={!!c.issue || c.needsMatch}
              ><td
                ><input
                  type="checkbox"
                  aria-label={`${i + 1}행 등록`}
                  bind:checked={c.include}
                /></td
              ><td
                ><input
                  class="number"
                  aria-label={`${i + 1}행 번호`}
                  type="number"
                  min="1"
                  max="9999"
                  value={c.number}
                  oninput={(e) => edit(i, "number", e.currentTarget.value)}
                /></td
              ><td
                ><input
                  aria-label={`${i + 1}행 이름`}
                  value={c.name}
                  oninput={(e) => edit(i, "name", e.currentTarget.value)}
                />{#if c.issue}<small class="field-error">{c.issue}</small
                  >{/if}</td
              ><td
                ><select
                  aria-label={`${i + 1}행 성별`}
                  value={c.gender ?? ""}
                  onchange={(e) =>
                    edit(i, "gender", e.currentTarget.value || null)}
                  ><option value="">자료에 없음</option
                  >{#each genders as g}<option value={g.value}>{g.label}</option
                    >{/each}</select
                ></td
              ><td
                ><select
                  aria-label={`${i + 1}행 기존 학생`}
                  value={c.needsMatch ? "choose" : c.id || ""}
                  onchange={(e) => edit(i, "id", e.currentTarget.value || null)}
                  >{#if c.needsMatch}<option value="choose" disabled
                      >연결 확인 필요</option
                    >{/if}<option value="">새 학생</option
                  >{#each classroom.students as s}<option value={s.id}
                      >{s.number}번 {s.name}</option
                    >{/each}</select
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
    {#if classroom.students.length}<details class="import-delete">
        <summary>기존 학생 삭제 선택 · 기본은 모두 유지</summary>
        <div>
          {#each classroom.students as s}<label
              ><input
                type="checkbox"
                checked={deleteIds.includes(s.id)}
                onchange={(e) =>
                  (deleteIds = e.currentTarget.checked
                    ? [...deleteIds, s.id]
                    : deleteIds.filter((id) => id !== s.id))}
              />{s.number}번 {s.name}</label
            >{/each}
        </div>
      </details>{/if}
  {/if}
  {#if error}<p class="roster-error" role="alert">{error}</p>{/if}
  <footer>
    <button class="secondary" onclick={close} disabled={stage === "committing"}
      >취소</button
    >{#if busy}<span class="processing"
        ><LoaderCircle size={16} /> 파일을 읽고 있어요…</span
      >{/if}{#if stage === "review" || stage === "committing"}<button
        class="primary"
        onclick={commit}
        disabled={stage === "committing" ||
          (!selected.length && !deleteIds.length)}
        ><Check size={16} />{stage === "committing"
          ? "등록 중…"
          : `${selected.length}명 반영`}</button
      >{/if}
  </footer>
</dialog>
