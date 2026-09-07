import { LazyStore } from '@tauri-apps/plugin-store';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
// ✨ [Full Toolbar] BUILTIN_FONTS는 순수 데이터 상수라 import해도 appState.init() 같은
//   부작용(windowLabel 세팅, 디스크 IO)이 전혀 없습니다. 아카이브 툴바의 글꼴 목록 구성에만 사용합니다.
import { BUILTIN_FONTS } from './appState.svelte.js';

// 전역 스토어 인스턴스 (appState와 동일한 파일 사용)
let tauriStore = null;

class ArchiveState {
  // Svelte 5 반응형 상태 선언
  notes = $state([]);
  isReady = $state(false);

  // ✨ [Full Toolbar] 상단 고정 서식 툴바의 글꼴 드롭다운용 폰트 목록
  //   기본값은 내장 폰트, init() 시점에 커스텀 폰트를 추가로 로드합니다.
  allFonts = $state([...BUILTIN_FONTS]);

  // ✨ [Settings Sync] 앱 전역 설정 (메인 창 설정 동기화용)
  globalSettings = $state({
    fontFamily: '메이플스토리 L',
    isDarkMode: false
  });

  async init() {
    try {
      // 🚀 [Compatibility] 기존 설정 파일 공유, 단 독립적인 키 'archivedNotes'만 사용
      tauriStore = new LazyStore('tidy-task-config.json');
      
      try {
        if (typeof tauriStore.reload === 'function') {
          await tauriStore.reload();
        }
      } catch (e) {
        console.warn("스토어 리로드 실패 (아카이브 초기화 중):", e);
      }

      // 🚀 [Resilience] 데이터가 없을 경우 빈 배열로 안전하게 초기화
      const savedNotes = await tauriStore.get('archivedNotes');
      this.notes = Array.isArray(savedNotes) ? savedNotes : [];

      // ✨ [Settings Sync] 글로벌 설정(메인 창 설정) 불러오기
      const mainData = await tauriStore.get('main');
      if (mainData) {
        this.globalSettings.fontFamily = mainData.fontFamily || '메이플스토리 L';
        this.globalSettings.isDarkMode = mainData.isDarkMode || false;
      } else {
        // 구버전(루트 키 방식)일 경우 대비
        this.globalSettings.fontFamily = await tauriStore.get('fontFamily') || '메이플스토리 L';
        this.globalSettings.isDarkMode = await tauriStore.get('isDarkMode') || false;
      }

      // ✨ [Full Toolbar] 아카이브 툴바의 글꼴 선택을 위한 폰트 목록 + @font-face 등록
      await this._loadFonts();
    } catch (e) {
      console.error("아카이브 로드 중 오류:", e);
      this.notes = [];
    } finally {
      this.isReady = true;
    }
  }

  // ✨ [Full Toolbar] 커스텀 폰트를 로드하고 아카이브 창에 @font-face로 직접 등록합니다.
  // 왜 아카이브에서 별도로 등록하는가:
  //   App.svelte의 onMount는 label==='archive'일 때 조기 종료되어(유령 데이터 방지)
  //   커스텀 폰트 FontFace 등록 로직을 타지 않습니다. 따라서 툴바 드롭다운에서
  //   커스텀 폰트를 골라도 실제로 렌더되지 않으므로, 여기서 직접 로드해야 합니다.
  async _loadFonts() {
    try {
      const savedFonts = await tauriStore.get('customFonts');
      const custom = Array.isArray(savedFonts) ? savedFonts : [];

      for (const cf of custom) {
        if (!cf?.name || !cf?.path) continue;
        try {
          // 이미 등록된 동일 이름 폰트는 중복 로드하지 않음
          const already = Array.from(document.fonts).some((f) => f.family === cf.name || f.family === `"${cf.name}"`);
          if (already) continue;

          const assetUrl = convertFileSrc(cf.path);
          const face = new FontFace(cf.name, `url(${assetUrl})`);
          const loaded = await face.load();
          document.fonts.add(loaded);
        } catch (e) {
          // 로드 실패해도 목록에는 남겨 사용자가 존재를 인지할 수 있게 합니다.
          console.warn(`아카이브 커스텀 폰트 로드 실패: ${cf.name}`, e);
        }
      }

      const customList = custom.map((f) => ({
        name: f.name,
        family: `"${f.name}", sans-serif`,
        isCustom: true
      }));
      this.allFonts = [...BUILTIN_FONTS, ...customList];
    } catch (e) {
      console.warn("아카이브 폰트 목록 로드 오류:", e);
      this.allFonts = [...BUILTIN_FONTS];
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ✨ [Zero-Loss 핵심 엔진] Read-Modify-Write 원자 체인
  // 왜 이 패턴이 필요한가:
  //   각 Tiny Note 창은 별도의 JS 컨텍스트를 가져 독립된 archiveState 인스턴스를 사용합니다.
  //   단순히 this.notes를 디스크에 덮어쓰면, 다른 창이 방금 추가한 메모를 날려버립니다.
  //   따라서 "디스크에서 최신값 읽기 → 변환 함수 적용 → 메모리 동기화 → 저장"을
  //   하나의 끊김 없는 체인으로 묶어 데이터 유실을 원천 차단합니다.
  // ═══════════════════════════════════════════════════════════
  async _safeModify(transformFn) {
    if (!tauriStore) return;
    try {
      // 1단계: 디스크 최신 상태 읽기 (다른 창이 쓴 변경사항 포함)
      try { await tauriStore.reload(); } catch(e) {}
      const diskNotes = await tauriStore.get('archivedNotes') || [];

      // 2단계: 변환 함수 적용 (추가, 삭제, 수정 등 — 디스크 최신값 기반)
      const updatedNotes = transformFn(Array.isArray(diskNotes) ? diskNotes : []);

      // 3단계: 메모리 상태 동기화 + 디스크 저장
      this.notes = updatedNotes;
      await tauriStore.set('archivedNotes', $state.snapshot(this.notes));
      await tauriStore.save();
    } catch(e) {
      console.error("아카이브 안전 저장 오류:", e);
    }
  }

  // ✨ [Phase 3: 안전 장치] 기존 save()를 _safeModify 래퍼로 유지
  // 왜: 외부 코드가 직접 save()를 호출해도 Read-Modify-Write 패턴이 강제되어
  //     오래된 메모리값이 디스크를 덮어쓰는 결함 C를 방지합니다.
  async save() {
    if (!tauriStore) return;
    await this._safeModify(() => $state.snapshot(this.notes));
  }

  // ✨ [Phase 2: 경량 동기화] 아카이브 창에서 실시간 목록 갱신용
  // 왜 init() 대신 별도 메서드인가:
  //   init()은 tauriStore 인스턴스 생성, globalSettings 로드 등 무거운 초기화를 포함합니다.
  //   실시간 동기화에서는 archivedNotes만 갱신하면 충분합니다.
  //   또한 init() 전체 재호출은 진행 중인 로컬 편집 상태(모달 수정 등)를 소멸시킬 수 있습니다.
  async refreshFromDisk() {
    if (!tauriStore) return;
    try {
      try { await tauriStore.reload(); } catch(e) {}
      const diskNotes = await tauriStore.get('archivedNotes');
      if (Array.isArray(diskNotes)) {
        this.notes = diskNotes;
      }
    } catch(e) {
      console.warn("아카이브 새로고침 오류:", e);
    }
  }

  // ✨ [Phase 1: 결함 A, B 해결] 보관함에 노트 추가 — 항상 Insert (Upsert 완전 제거)
  // 왜 Upsert를 제거하는가:
  //   동일한 sourceLabel(창 이름)로 Upsert하면, 같은 창에서 연속 아카이빙 시
  //   이전 메모가 최신 메모로 덮어써져 "누적 보관"이 아니라 "1건만 유지"가 됩니다.
  //   이제 아카이브 버튼을 누를 때마다 무조건 새로운 독립된 메모로 쌓입니다.
  async addNote(item) {
    const newNote = {
      id: crypto.randomUUID(), // 결함 G 해결: 충돌 불가능한 UUID
      title: item.title || '제목 없음',
      content: item.content || '',
      themeColor: item.themeColor || 'amber',
      isDarkMode: item.isDarkMode || false,
      bookmarked: false,
      archivedAt: Date.now(), // 🚀 [Traceability] 보관 시각 기록
      sourceLabel: item.sourceLabel || 'unknown'
    };

    // 🚀 [Zero-Loss] 디스크 최신 목록에 새 메모를 맨 앞에 추가
    await this._safeModify((diskNotes) => [newNote, ...diskNotes]);
    emit('archive-updated');
    return true;
  }

  // ✨ [Phase 1: 결함 C 해결] 노트 영구 삭제 (단일) — _safeModify 기반
  async removeNote(id) {
    await this._safeModify((diskNotes) =>
      diskNotes.filter(n => n.id !== id)
    );
    emit('archive-updated');
  }

  // ✨ [Phase 1: 결함 C 해결] 노트 다중 삭제 (선택 삭제용) — _safeModify 기반
  // 왜 removeNote를 반복 호출하지 않는가:
  //   매번 디스크 I/O가 발생하므로, 한 번의 _safeModify로 일괄 처리합니다.
  async removeNotes(ids) {
    if (!ids || ids.length === 0) return;
    const deleteSet = new Set(ids); // O(1) 조회를 위해 Set 사용
    await this._safeModify((diskNotes) =>
      diskNotes.filter(n => !deleteSet.has(n.id))
    );
    emit('archive-updated');
  }

  // ✨ [Phase 1: 결함 C 해결] 노트 정보 수정 (편집 모달용) — _safeModify 기반
  async updateNote(id, updates) {
    let found = false;
    await this._safeModify((diskNotes) =>
      diskNotes.map(n => {
        if (n.id === id) {
          found = true;
          return { ...n, ...updates };
        }
        return n;
      })
    );
    if (found) emit('archive-updated');
    return found;
  }

  // ✨ [Phase 1: 결함 C 해결] 북마크 토글 — _safeModify 기반
  async toggleBookmark(id) {
    await this._safeModify((diskNotes) =>
      diskNotes.map(n => {
        if (n.id === id) {
          return { ...n, bookmarked: !n.bookmarked };
        }
        return n;
      })
    );
    emit('archive-updated');
  }

  // ✨ [Feature] 드래그 재정렬 — 표시 순서를 디스크 배열 순서로 영속화
  // 왜 objects가 아닌 orderedIds를 받는가:
  //   드래그 시점의 노트 객체는 오래된 메모리 스냅샷일 수 있습니다. id만 받아 디스크 최신
  //   객체와 재조합하면(Read-Modify-Write) 동시 편집/추가로 인한 데이터 유실을 방지합니다.
  async reorderNotes(orderedIds) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
    await this._safeModify((diskNotes) => {
      const byId = new Map(diskNotes.map((n) => [n.id, n]));
      const result = [];
      for (const id of orderedIds) {
        if (byId.has(id)) {
          result.push(byId.get(id));
          byId.delete(id);
        }
      }
      // 드래그 목록에 없던(다른 창이 동시에 추가한) 노트는 맨 앞에 보존하여 유실 방지
      return [...byId.values(), ...result];
    });
    emit('archive-updated');
  }

  // 꺼내기를 위해 단일 노트를 복사해서 가져옴
  getNote(id) {
    const note = this.notes.find(n => n.id === id);
    return note ? JSON.parse(JSON.stringify(note)) : null;
  }

  // ✨ [TCREI: Integrity] 아카이브에서 Tiny Note로 복원하는 독립 함수
  // 왜 appState.restoreTinyNote()를 쓰지 않는가:
  //   아카이브 창에서 appState를 사용하면 windowLabel="archive"로 init되어
  //   performSave가 유령 데이터를 생성합니다. 따라서 LazyStore를 직접 조작합니다.
  async restoreToTinyNote(noteData) {
    if (!tauriStore) return false;

    try {
      // 최신 디스크 상태 읽기
      try { await tauriStore.reload(); } catch(e) {}

      let activeWindows = await tauriStore.get('activeExtraWindows') || [];

      let emptyLabel = null;
      let activeCount = 0;

      // 현재 떠 있는 Tiny Note 수 확인
      for (let i = 1; i <= 10; i++) {
        const win = await WebviewWindow.getByLabel(`tinynote-${i}`);
        if (win) activeCount++;
      }

      if (activeCount >= 10) {
        return false; // 최대 개수 초과
      }

      // 데이터를 덮어쓰지 않도록 '완전히 비어있는' 라벨 찾기
      for (let i = 1; i <= 10; i++) {
        const label = `tinynote-${i}`;
        const win = await WebviewWindow.getByLabel(label);
        
        if (!win) {
          const winData = await tauriStore.get(label);
          const hasData = winData && (
            (winData.todos && winData.todos.length > 0) ||
            (winData.archivedTodos && winData.archivedTodos.length > 0) ||
            (winData.notes && winData.notes.trim().length > 0)
          );

          if (!hasData) {
            emptyLabel = label;
            break;
          }
        }
      }

      // 🚀 [Resilience] 모든 슬롯이 차있으면 복원 불가
      if (!emptyLabel) {
        return false;
      }

      // 빈방에 아카이브 데이터 주입
      const restoreData = {
        title: noteData.title,
        notes: noteData.content,
        themeColor: noteData.themeColor,
        isDarkMode: noteData.isDarkMode,
        todos: [],
        archivedTodos: []
      };
      await tauriStore.set(emptyLabel, restoreData);

      if (!activeWindows.includes(emptyLabel)) {
        activeWindows.push(emptyLabel);
        await tauriStore.set('activeExtraWindows', activeWindows);
      }
      await tauriStore.save();

      // 윈도우 생성 (복원된 데이터가 담겨서 로드됨)
      const newWin = new WebviewWindow(emptyLabel, { 
        url: "index.html", title: `Tiny Note ${emptyLabel.split('-')[1]}`, 
        width: 250, height: 280, minWidth: 160, minHeight: 45,
        transparent: false, decorations: false, alwaysOnTop: false,
        maximizable: false, visible: false 
      });

      newWin.once('tauri://created', async () => {
        await newWin.show();
        await newWin.setFocus();
      });

      return true; // 복원 성공
    } catch (e) {
      console.error("아카이브 복원 중 오류:", e);
      return false;
    }
  }
}

// 글로벌 싱글톤 인스턴스 수출
export const archiveState = new ArchiveState();
