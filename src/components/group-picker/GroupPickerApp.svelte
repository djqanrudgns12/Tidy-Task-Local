<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import {
    Pin,
    Maximize2,
    Minimize2,
    X,
    Volume2,
    VolumeX,
    SlidersHorizontal,
    UserX,
    Settings2,
    UsersRound,
    ArrowRight,
  } from 'lucide-svelte';
  import { native } from '../../lib/toolkit/store.js';
  import { closeWindow, openTool } from '../../lib/toolkit/windows.js';
  import { dragRegion } from '../../lib/dragRegion.js';
  import { track } from '../../lib/analytics.js';
  import { createSection } from '../../lib/scores/section.js';
  import { subscribeStore } from '../../lib/scores/store.js';
  import { readRoster, subscribeRoster, execute } from '../../lib/classroom/repository.js';
  import { openRosterFor } from '../../lib/classroom/intent.js';
  import { clearFitCache } from '../../lib/scoreboard/fitText.js';
  import ToolIcon from '../toolkit/ToolIcon.svelte';
  import ToolkitSelect from '../toolkit/ToolkitSelect.svelte';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import SetupSidebar from './SetupSidebar.svelte';
  import LiveManifestBoard from './LiveManifestBoard.svelte';
  import TicketFlightOverlay from './TicketFlightOverlay.svelte';
  import ResultBoard from './ResultBoard.svelte';
  import AbsenceModal from './AbsenceModal.svelte';
  import ConstraintsModal from './ConstraintsModal.svelte';
  import BridgeSaveModal from './BridgeSaveModal.svelte';
  import TrainStage from './stages/TrainStage.svelte';
  import GlacierStage from './stages/GlacierStage.svelte';
  import ElevatorStage from './stages/ElevatorStage.svelte';
  import {
    GROUP_MAX,
    GROUP_MIN,
    MAX_PARTICIPANTS,
    syncGroupPool,
    resolveGroupName,
    createDefaultIntent,
    deriveEffectiveCapacities,
    evenPartition,
    computeRemainderOptions,
    stepGroupCapacity,
    autoBalanceUnlocked,
    addGroupCapacity,
    removeGroupCapacity,
    checkGlobalSwitchLockConflict,
    formatStudentLabel,
    normalizeRatios,
    cleanLabel,
  } from '../../lib/group-picker/allocation.js';
  import { solveGroupDraw, filterActiveRules, type DrawRun } from '../../lib/group-picker/solver.js';
  import {
    STORE_NAME,
    MAX_RECENT_HISTORY,
    normalizePrefs,
    normalizeClasses,
    normalizeCustom,
    normalizeClassEntry,
    toHistoryEntry,
    saveGroupsToRoster,
    syncGroupsToScoreboard,
  } from '../../lib/group-picker/storage.js';
  import { createGroupPickerAudio } from '../../lib/group-picker/audio.js';
  import { assignClassAvatars, preloadGroupPickerAssets } from '../../lib/group-picker/assets.js';
  import { renderBoardPng, saveBoardPng, copyBoardPng } from '../../lib/group-picker/export.js';
  import {
    ARM_MS,
    SETTLED_ARM_MS,
    TICKET_FLIGHT_MS,
    missedTicketEvents,
  } from '../../lib/group-picker/choreography/suspense.js';
  import { createTrainPlan, trainPoseAt } from '../../lib/group-picker/choreography/train.js';
  import { createGlacierPlan, glacierPoseAt } from '../../lib/group-picker/choreography/glacier.js';
  import { createElevatorPlan, elevatorPoseAt } from '../../lib/group-picker/choreography/elevator.js';
  import './group-picker.css';

  const CUSTOM_CLASS_ID = '__custom__';
  const ADD_CLASS_ID = '__add_class__';
  const STAGE_MODES = [
    { id: 'train' as const, label: '모둠 열차' },
    { id: 'glacier' as const, label: '빙하 갈라지기' },
    { id: 'elevator' as const, label: '엘리베이터' },
  ];

  // ── 창·테마·글꼴 ──
  let pinned = $state(false);
  let fullscreen = $state(false);
  let scheme = $state<'light' | 'dark'>('light');
  let fontFamily = $state('"Pretendard", "Malgun Gothic", sans-serif');
  let fontEpoch = $state(0);
  const draggable = (node: HTMLElement) => (native ? dragRegion(node) : { destroy() {} });

  // ── 영속 저장소 (scores.rs "group-picker") ──
  let ready = $state(false);
  let storageError = $state('');
  let prefsData = $state.raw(normalizePrefs(undefined));
  let classesData = $state.raw(normalizeClasses(undefined));
  let customData = $state.raw(normalizeCustom(undefined));

  const prefsClient = createSection({
    store: STORE_NAME,
    section: 'prefs',
    normalize: normalizePrefs,
    onChange: (d) => (prefsData = d),
    onError: (m) => (storageError = m),
  });
  const classesClient = createSection({
    store: STORE_NAME,
    section: 'classes',
    normalize: normalizeClasses,
    onChange: (d) => (classesData = d),
    onError: (m) => (storageError = m),
  });
  const customClient = createSection({
    store: STORE_NAME,
    section: 'custom',
    normalize: normalizeCustom,
    onChange: (d) => (customData = d),
    onError: (m) => (storageError = m),
  });

  // ── 학급 명단 (SQLite) ──
  let roster = $state<Awaited<ReturnType<typeof readRoster>>>({ classes: [], revision: 0, defaultClassId: null });
  let rosterReady = $state(false);
  let rosterError = $state('');
  let activeClassId = $state<string>(CUSTOM_CLASS_ID);
  let classInitialized = false;

  // ── UI 모달·팝오버·배너 상태 ──
  let absenceOpen = $state(false);
  let constraintsOpen = $state(false);
  let bridgeOpen = $state(false);
  let bridgeBusy = $state(false);
  let displayMenuOpen = $state(false);
  let closeConfirmOpen = $state(false);
  let pendingLockSwitch = $state<{ message: string; onConfirm: () => void } | null>(null);
  let rosterDriftBanner = $state(false);

  // ── 토스트·에러 ──
  let drawError = $state('');
  let toast = $state<{ text: string; undoRoster?: boolean } | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  // ── 에셋 & 오디오 ──
  const audio = createGroupPickerAudio();
  let brokenAssets = $state<Set<string>>(new Set());

  // ── 단계 상태 기계 (idle -> running -> settled) ──
  let phase = $state<'idle' | 'running' | 'settled'>('idle');
  let phaseEnteredAt = $state(0);
  let freeEditCaps = $state<number[] | null>(null);

  // Object.freeze 된 추첨 결과 및 결과 보드 스냅샷은 반드시 $state.raw 에 보관합니다.
  let activeRun = $state.raw<Readonly<DrawRun> | null>(null);
  let activePlan = $state.raw<any>(null);
  let elapsed = $state(0);
  let committedIds = $state<Set<string>>(new Set());

  type SettledGroup = {
    index: number;
    name: string;
    color: string;
    symbol: string;
    studentIds: string[];
    locked: boolean;
  };
  let settledGroups = $state.raw<SettledGroup[]>([]);
  let resultUndoStack = $state.raw<SettledGroup[][]>([]);
  let resultRedoStack = $state.raw<SettledGroup[][]>([]);
  let unsavedResult = $state(false);

  let flightOverlay = $state<ReturnType<typeof TicketFlightOverlay>>();
  let trainStageRef = $state<ReturnType<typeof TrainStage>>();
  let glacierStageRef = $state<ReturnType<typeof GlacierStage>>();
  let elevatorStageRef = $state<ReturnType<typeof ElevatorStage>>();
  let sidebarSlotEl = $state<HTMLDivElement>();
  let preparingStage = $state(false);
  let docHidden = $state(false);

  // 런타임 비반응 추적 변수(매 프레임 타이머/이펙트 경합 방지)
  let disposed = false;
  let rafId = 0;
  let runStartedAt = 0;
  let lastFrameElapsed = 0;
  let drawGeneration = 0;
  let lastElevatorFloor = '';
  let themeReadyPromise: Promise<any> = Promise.resolve();
  let audioCuesPlayed = new Set<string>();
  let launchedTicketKeys = new Set<string>();
  let commitTimers: ReturnType<typeof setTimeout>[] = [];

  // ── 파생 상태 ──
  const isCustomMode = $derived(activeClassId === CUSTOM_CLASS_ID);
  const classroom = $derived(
    !isCustomMode ? roster.classes.find((c) => c.id === activeClassId) ?? null : null,
  );
  const classDeleted = $derived(
    !isCustomMode && rosterReady && roster.classes.length > 0 && !classroom,
  );
  type StudentItem = { id: string; number?: number; name: string; gender?: string };
  const allStudents = $derived.by<StudentItem[]>(() => {
    if (isCustomMode) {
      return customData.lines.map((name: string, idx: number) => ({
        id: `custom-${idx + 1}`,
        number: idx + 1,
        name,
        gender: 'unspecified',
      }));
    }
    return classroom?.students ?? [];
  });
  // C3: 학급 전체 명단 기준 영구 아바타 매핑 (장면·스왑·결과보드 영구 불변)
  const classAvatarMap = $derived(assignClassAvatars(allStudents));

  const entryState = $derived.by(() => {
    if (isCustomMode) return customData.state;
    if (classroom && classesData.items[classroom.id]) return classesData.items[classroom.id];
    return normalizeClassEntry({});
  });

  const excludedSet = $derived(new Set(entryState.excludedIds));
  const presentStudents = $derived(allStudents.filter((s) => !excludedSet.has(s.id)));
  const presentCount = $derived(presentStudents.length);
  const over50 = $derived(presentCount > MAX_PARTICIPANTS);
  const effectiveParticipants = $derived(presentStudents.slice(0, MAX_PARTICIPANTS));
  const rosterGroups = $derived(!isCustomMode && classroom ? classroom.groups : []);
  const groupPool = $derived(syncGroupPool(entryState.groupPool, rosterGroups));

  const effectiveBaseIntent = $derived.by(() => {
    if (entryState.anchorSnapshot || entryState.baseIntent.ratios.length > 0) {
      return entryState.baseIntent;
    }
    return createDefaultIntent(Math.min(MAX_PARTICIPANTS, presentCount)).baseIntent;
  });

  const pinnedFloors = $derived.by(() => {
    const activeIds = new Set(effectiveParticipants.map((s) => s.id));
    const floors = Array(GROUP_MAX).fill(0);
    for (const [sid, gi] of Object.entries(entryState.pinnedByGroup)) {
      if (activeIds.has(sid) && gi >= 0 && gi < GROUP_MAX) floors[gi]++;
    }
    return floors;
  });

  const derivedAlloc = $derived(
    deriveEffectiveCapacities({
      baseIntent: effectiveBaseIntent,
      anchorSnapshot: entryState.anchorSnapshot,
      n: Math.min(MAX_PARTICIPANTS, presentCount),
      pinnedFloors,
      groupPool,
    }),
  );

  const activeCapacities = $derived(freeEditCaps ?? derivedAlloc.capacities);
  const activeLocks = $derived.by(() =>
    activeCapacities.map((_, i) => derivedAlloc.locks[i] ?? null),
  );
  const activeGroupCount = $derived(activeCapacities.length);
  const sumMatches = $derived(
    presentCount >= 2 &&
      !over50 &&
      activeCapacities.reduce((a, b) => a + b, 0) === presentCount,
  );
  const canStart = $derived(
    ready &&
      phase === 'idle' &&
      !over50 &&
      presentCount >= 2 &&
      sumMatches &&
      (isCustomMode || (rosterReady && !!classroom)),
  );
  const startDisabledReason = $derived.by(() => {
    if (!ready) return '설정을 불러오고 있어요…';
    if (!isCustomMode && !rosterReady) return '학급 명단을 확인하고 있어요…';
    if (over50) return `참여 인원(${presentCount}명)이 50명을 넘어 결석 제외가 필요해요`;
    if (presentCount < 2) return '최소 2명 이상이어야 모둠을 나눌 수 있어요';
    if (!sumMatches) return '왼쪽 패널에서 [나머지 자동 맞추기]를 눌러 정원 합계를 맞춰 주세요';
    return '';
  });

  const stageGroupsIdle = $derived(
    activeCapacities.map((_, idx) => ({
      index: idx,
      name: resolveGroupName(groupPool[idx], idx, rosterGroups),
      color: groupPool[idx]?.color ?? 'mint',
      symbol: groupPool[idx]?.symbol ?? 'star',
      studentIds: [] as string[],
    })),
  );

  const stageGroupsRunning = $derived(activeRun?.groups ?? stageGroupsIdle);
  const activeGroupIndex = $derived.by(() => {
    if (phase !== 'running' || !activePlan) return -1;
    if (activePlan.mode === 'train') return trainPoseAt(activePlan, elapsed).car.groupIndex;
    if (activePlan.mode === 'elevator') return elevatorPoseAt(activePlan, elapsed).car.groupIndex;
    if (activePlan.mode === 'glacier') {
      if (elapsed >= 17800) return stageGroupsRunning[stageGroupsRunning.length - 1]?.index ?? -1;
      if (elapsed >= 12800 && stageGroupsRunning.length > 0) {
        const focusIdx = Math.floor((elapsed - 12800) / 900) % stageGroupsRunning.length;
        return stageGroupsRunning[focusIdx]?.index ?? -1;
      }
    }
    return -1;
  });
  const activeRuleSummary = $derived(
    filterActiveRules({
      participants: effectiveParticipants,
      groupCount: Math.max(GROUP_MIN, activeGroupCount),
      apartPairs: entryState.apartPairs,
      pinnedByGroup: entryState.pinnedByGroup,
      leaderIds: entryState.leaderIds,
    }),
  );
  const activeRuleCount = $derived(
    (entryState.genderBalance && !isCustomMode ? 1 : 0) +
      activeRuleSummary.activeApart.length +
      Object.keys(activeRuleSummary.activePinned).length,
  );

  const classSelectOptions = $derived([
    ...roster.classes.map((c) => ({
      value: c.id,
      label: c.name,
      note: `${c.students.length}명`,
      group: '우리 반 명단',
    })),
    {
      value: CUSTOM_CLASS_ID,
      label: '✏️ 직접 입력 (임시 명단)',
      note: `${customData.lines.length}명`,
      group: '직접 입력 · 관리',
    },
    {
      value: ADD_CLASS_ID,
      label: '＋ 새 학급 추가하러 가기…',
      group: '직접 입력 · 관리',
    },
  ]);

  const titleSummary = $derived(
    isCustomMode
      ? `직접 입력 · ${presentCount}명`
      : classroom
        ? `${classroom.name} · ${presentCount}/${allStudents.length}명`
        : '학급 없음',
  );

  const settledStudentMap = $derived.by(() => {
    if (phase === 'idle' && activeRun == null) {
      return Object.fromEntries(allStudents.map((s) => [s.id, s]));
    }
    const base = activeRun?.participantsSnapshot ?? {};
    const live = Object.fromEntries(allStudents.map((s) => [s.id, s]));
    return { ...base, ...live };
  });

  // ── 헬퍼: 토스트 & 저장 업데이트 ──
  function showToast(text: string, undoRoster = false) {
    clearTimeout(toastTimer);
    toast = { text, undoRoster };
    toastTimer = setTimeout(() => (toast = null), undoRoster ? 7000 : 4200);
  }

  function markBroken(src: string) {
    if (!src || brokenAssets.has(src)) return;
    brokenAssets = new Set([...brokenAssets, src]);
  }

  function mutateEntry(fn: (entry: ReturnType<typeof normalizeClassEntry>) => ReturnType<typeof normalizeClassEntry>) {
    if (isCustomMode) {
      customClient.mutate((cur) => ({
        ...cur,
        state: fn(cur.state),
      }));
    } else if (classroom) {
      const cid = classroom.id;
      classesClient.mutate((cur) => {
        const prev = cur.items[cid] ?? normalizeClassEntry({});
        return {
          ...cur,
          items: {
            ...cur.items,
            [cid]: { ...fn(prev), updatedAt: Date.now() },
          },
        };
      });
    }
  }

  function updateAllocState({
    nextBaseIntent,
    nextCapacities,
    nextLocks,
    nextPool,
  }: {
    nextBaseIntent?: typeof entryState.baseIntent;
    nextCapacities: number[];
    nextLocks?: (number | null)[];
    nextPool?: typeof groupPool;
  }) {
    const sum = nextCapacities.reduce((a, b) => a + b, 0);
    const matches = presentCount >= 2 && sum === presentCount;
    freeEditCaps = matches ? null : nextCapacities;

    mutateEntry((prev) => {
      const basePool = nextPool ?? syncGroupPool(prev.groupPool, rosterGroups);
      const updatedPool = nextLocks
        ? basePool.map((slot, i) => ({
            ...slot,
            lockedCap: i < nextLocks.length ? nextLocks[i] : slot.lockedCap,
          }))
        : basePool;
      const baseIntent = nextBaseIntent ?? {
        ...prev.baseIntent,
        groupCount: nextCapacities.length,
        ratios: normalizeRatios(nextCapacities),
      };
      return {
        ...prev,
        baseIntent,
        groupPool: updatedPool,
        anchorSnapshot: matches
          ? {
              n: presentCount,
              capacities: [...nextCapacities],
              locked: nextCapacities.map((_, i) => nextLocks?.[i] ?? updatedPool[i]?.lockedCap ?? null),
            }
          : prev.anchorSnapshot,
      };
    });
  }

  // ── 셋업 조작 콜백 ──
  function runWithLockGuard(targetG: number, label: string, applyFn: () => void) {
    const conflict = checkGlobalSwitchLockConflict({
      locks: activeLocks,
      n: presentCount,
      targetGroupCount: targetG,
    });
    if (!conflict.unlockRequired) {
      applyFn();
      return;
    }
    pendingLockSwitch = {
      message: `${conflict.lockedCount}개 모둠이 잠겨 있어 '${label}' 구성을 적용할 수 없어요. 잠금을 풀고 적용할까요?`,
      onConfirm: () => {
        pendingLockSwitch = null;
        // 잠금 일괄 해제 후 적용
        mutateEntry((prev) => ({
          ...prev,
          groupPool: syncGroupPool(prev.groupPool, rosterGroups).map((s) => ({ ...s, lockedCap: null })),
          anchorSnapshot: prev.anchorSnapshot
            ? { ...prev.anchorSnapshot, locked: prev.anchorSnapshot.locked.map(() => null) }
            : null,
        }));
        applyFn();
      },
    };
  }

  function handleApplyRecommendation(gCount: number) {
    runWithLockGuard(gCount, `${gCount}모둠 추천`, () => {
      const caps = evenPartition(presentCount, gCount);
      updateAllocState({
        nextBaseIntent: {
          mode: 'byGroups',
          groupCount: gCount,
          targetSize: Math.max(2, Math.round(presentCount / gCount)),
          remainderChoice: 'absorb',
          ratios: normalizeRatios(caps),
        },
        nextCapacities: caps,
        nextLocks: caps.map(() => null),
      });
    });
  }

  function handleSwitchAllocMode(mode: 'byGroups' | 'bySize') {
    if (mode === 'byGroups') {
      const caps = [...activeCapacities];
      updateAllocState({
        nextBaseIntent: {
          ...effectiveBaseIntent,
          mode: 'byGroups',
          groupCount: caps.length,
          ratios: normalizeRatios(caps),
        },
        nextCapacities: caps,
      });
      return;
    }
    const targetSize = Math.max(2, Math.min(25, Math.round(presentCount / Math.max(2, activeGroupCount))));
    const rem = computeRemainderOptions(presentCount, targetSize);
    const opt = rem.options[0];
    runWithLockGuard(opt.groupCount, `한 모둠 ${targetSize}명`, () => {
      updateAllocState({
        nextBaseIntent: {
          mode: 'bySize',
          groupCount: opt.groupCount,
          targetSize,
          remainderChoice: opt.kind === 'extra' ? 'extra' : 'absorb',
          ratios: normalizeRatios(opt.capacities),
        },
        nextCapacities: opt.capacities,
        nextLocks: opt.capacities.map(() => null),
      });
    });
  }

  function handleSetGroupCount(nextG: number) {
    const safeG = Math.max(GROUP_MIN, Math.min(GROUP_MAX, nextG));
    runWithLockGuard(safeG, `${safeG}개 모둠`, () => {
      const caps = evenPartition(presentCount, safeG);
      updateAllocState({
        nextBaseIntent: {
          mode: 'byGroups',
          groupCount: safeG,
          targetSize: Math.max(2, Math.round(presentCount / safeG)),
          remainderChoice: 'absorb',
          ratios: normalizeRatios(caps),
        },
        nextCapacities: caps,
      });
    });
  }

  function handleSetTargetSize(size: number) {
    const rem = computeRemainderOptions(presentCount, size);
    const chosen = effectiveBaseIntent.remainderChoice === 'extra'
      ? (rem.options.find((o) => o.kind === 'extra') ?? rem.options[0])
      : rem.options[0];
    runWithLockGuard(chosen.groupCount, `한 모둠 ${size}명`, () => {
      updateAllocState({
        nextBaseIntent: {
          mode: 'bySize',
          groupCount: chosen.groupCount,
          targetSize: size,
          remainderChoice: chosen.kind === 'extra' ? 'extra' : 'absorb',
          ratios: normalizeRatios(chosen.capacities),
        },
        nextCapacities: chosen.capacities,
        nextLocks: chosen.capacities.map(() => null),
      });
    });
  }

  function handleSelectRemainder(kind: 'absorb' | 'extra') {
    const rem = computeRemainderOptions(presentCount, effectiveBaseIntent.targetSize);
    const chosen = rem.options.find((o) => o.kind === kind) ?? rem.options[0];
    runWithLockGuard(chosen.groupCount, chosen.badge, () => {
      updateAllocState({
        nextBaseIntent: {
          ...effectiveBaseIntent,
          mode: 'bySize',
          groupCount: chosen.groupCount,
          remainderChoice: kind,
          ratios: normalizeRatios(chosen.capacities),
        },
        nextCapacities: chosen.capacities,
        nextLocks: chosen.capacities.map(() => null),
      });
    });
  }

  function handleStepGroup(index: number, delta: 1 | -1, allowOnePerson = false) {
    const res = stepGroupCapacity({
      capacities: activeCapacities,
      locks: activeLocks,
      pinnedFloors,
      n: presentCount,
      index,
      delta,
      keepTotal: prefsData.keepTotal,
      allowOnePerson,
    });
    if (!res.ok) {
      if (res.needsOnePersonConfirm) return { needsConfirm: true };
      showToast(res.reason);
      audio.play('error');
      return {};
    }
    updateAllocState({ nextCapacities: res.capacities });
    return {};
  }

  function handleToggleLock(index: number) {
    if (index < 0 || index >= activeCapacities.length) return;
    const nextLocks = [...activeLocks];
    nextLocks[index] = nextLocks[index] != null ? null : activeCapacities[index];
    audio.play('lock');
    updateAllocState({ nextCapacities: [...activeCapacities], nextLocks });
  }

  function handleRenameSetupGroup(index: number, nextName: string) {
    const nextPool = groupPool.map((slot, i) => (i === index ? { ...slot, customName: nextName } : slot));
    updateAllocState({ nextCapacities: [...activeCapacities], nextPool });
  }

  function handleAddGroup() {
    const res = addGroupCapacity({
      capacities: activeCapacities,
      locks: activeLocks,
      pinnedFloors,
      n: presentCount,
    });
    if (!res) {
      showToast('미잠금 모둠에 여유 인원이 부족해 모둠을 추가할 수 없어요.');
      return;
    }
    updateAllocState({
      nextCapacities: res.capacities,
      nextLocks: res.locks,
    });
  }

  function handleRemoveGroup(index: number) {
    const res = removeGroupCapacity({
      capacities: activeCapacities,
      locks: activeLocks,
      pinnedFloors,
      index,
    });
    if (!res) return;
    // 삭제된 모둠의 커스텀 이름·핀 조정
    const nextPool = [...groupPool];
    if (index < nextPool.length) {
      nextPool.splice(index, 1);
      while (nextPool.length < GROUP_MAX) {
        const i = nextPool.length;
        nextPool.push({
          index: i,
          id: `slot-${Date.now()}-${i}`,
          sourceGroupId: null,
          customName: null,
          color: groupPool[i]?.color ?? 'mint',
          symbol: groupPool[i]?.symbol ?? 'star',
          lockedCap: null,
        });
      }
    }
    updateAllocState({
      nextCapacities: res.capacities,
      nextLocks: res.locks,
      nextPool: nextPool.map((s, i) => ({ ...s, index: i })),
    });
  }

  function handleAutoBalance() {
    const res = autoBalanceUnlocked({
      capacities: activeCapacities,
      locks: activeLocks,
      pinnedFloors,
      n: presentCount,
    });
    if (!res.ok || !res.capacities) {
      showToast(res.reason ?? '자동 맞춤을 진행할 수 없어요.');
      audio.play('error');
      return;
    }
    updateAllocState({ nextCapacities: res.capacities });
  }

  // ── 추첨 실행 & 3막 애니메이션 루프 ──
  function clearAnimationTimers() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    commitTimers.forEach((t) => clearTimeout(t));
    commitTimers = [];
    flightOverlay?.clearFlights();
  }

  function emitTicketFlight(ev: { studentId: string; groupIndex: number; atMs: number }) {
    if (launchedTicketKeys.has(ev.studentId) || !activeRun) return;
    launchedTicketKeys.add(ev.studentId);

    const st = settledStudentMap[ev.studentId];
    const grp = activeRun.groups[ev.groupIndex];
    if (!st || !grp) return;

    const slotIndex =
      activePlan.ticketEvents.filter(
        (item: any) => item.groupIndex === ev.groupIndex && item.atMs <= ev.atMs,
      ).length - 1;

    const launchPt =
      prefsData.lastMode === 'train'
        ? trainStageRef?.getLaunchScreenPoint()
        : prefsData.lastMode === 'glacier'
          ? glacierStageRef?.getLaunchScreenPoint(ev.studentId)
          : elevatorStageRef?.getLaunchScreenPoint();

    if (!prefsData.reduced && launchPt) {
      flightOverlay?.launchFlight({
        key: `${activeRun.runId}-${ev.studentId}`,
        label: formatStudentLabel(st, allStudents, prefsData.alwaysShowNumber),
        colorId: grp.color,
        groupIndex: ev.groupIndex,
        slotIndex: Math.max(0, slotIndex),
        fromX: launchPt.x,
        fromY: launchPt.y,
      });
    }
    // 열차 착지음(ticketLand)은 각 호차 마지막 학생에게만 부착해 소리 폭주 차단(PRD §6),
    // 빙하/엘리베이터는 6Hz 롤링 차임(audio.js)으로 자동 병합됩니다.
    if (activePlan.mode === 'train') {
      const car = activePlan.cars?.[ev.groupIndex];
      const isLastInCar = car?.boardings?.[car.boardings.length - 1]?.studentId === ev.studentId;
      if (isLastInCar) audio.play('ticketLand');
    } else {
      audio.play('ticketPop');
    }

    const settleDelay = prefsData.reduced ? 40 : Math.round(TICKET_FLIGHT_MS * 0.86);
    const tid = setTimeout(() => {
      if (disposed || phase !== 'running') return;
      if (!committedIds.has(ev.studentId)) {
        committedIds = new Set([...committedIds, ev.studentId]);
      }
    }, settleDelay);
    commitTimers.push(tid);
  }

  function enterSettled(run: Readonly<DrawRun>) {
    drawGeneration++;
    preparingStage = false;
    clearAnimationTimers();
    committedIds = new Set(run.participantIds);
    elapsed = activePlan?.totalDurationMs ?? 0;
    settledGroups = run.groups.map((g) => ({
      index: g.index,
      name: g.name,
      color: g.color,
      symbol: g.symbol,
      studentIds: [...g.studentIds],
      locked: g.locked,
    }));
    resultUndoStack = [];
    resultRedoStack = [];
    rosterDriftBanner = false;
    unsavedResult = true;
    phase = 'settled';
    phaseEnteredAt = performance.now();
    audio.play('fanfare');
  }

  function stepAnimation(now: number) {
    if (disposed || phase !== 'running' || !activePlan || !activeRun) {
      rafId = 0;
      return;
    }
    const prevElapsed = lastFrameElapsed;
    const nextElapsed = Math.min(activePlan.totalDurationMs, now - runStartedAt);
    lastFrameElapsed = nextElapsed;
    elapsed = nextElapsed;

    // 1) 새로 도달한 티켓 발사
    const crossed = missedTicketEvents(activePlan.ticketEvents, prevElapsed, nextElapsed);
    for (const ev of crossed) emitTicketFlight(ev);

    // 2) 무대별 주요 전환 효과음 트리거 (PRD §6 2-버스 & 3단계 우선순위)
    if (!prefsData.reduced) {
      if (activePlan.mode === 'train') {
        const pose = trainPoseAt(activePlan, nextElapsed);
        const arriveKey = `tr-arrive-${pose.carIndex}`;
        if (!audioCuesPlayed.has(arriveKey)) {
          audioCuesPlayed.add(arriveKey);
          audio.play('trainArrive');
        }
        if (pose.doorOpenRatio > 0.25 && !audioCuesPlayed.has(`tr-door-${pose.carIndex}`)) {
          audioCuesPlayed.add(`tr-door-${pose.carIndex}`);
          audio.play('whistle');
          audio.play('doorSlide');
        }
        if (pose.boarding && !audioCuesPlayed.has(`tr-jump-${pose.boarding.studentId}`)) {
          audioCuesPlayed.add(`tr-jump-${pose.boarding.studentId}`);
          audio.play('boardJump');
        }
      } else if (activePlan.mode === 'glacier') {
        const pose = glacierPoseAt(activePlan, nextElapsed);
        if (nextElapsed >= 4900 && !audioCuesPlayed.has('gl-rumble')) {
          audioCuesPlayed.add('gl-rumble');
          audio.play('glacierRumble');
        }
        if (pose.crackProgress > 0.08 && !audioCuesPlayed.has('gl-crack1')) {
          audioCuesPlayed.add('gl-crack1');
          audio.play('iceCrack');
        }
        if (pose.crackProgress > 0.42 && !audioCuesPlayed.has('gl-crack2')) {
          audioCuesPlayed.add('gl-crack2');
          audio.play('iceCrack');
        }
        if (pose.crackProgress > 0.78 && !audioCuesPlayed.has('gl-crack3')) {
          audioCuesPlayed.add('gl-crack3');
          audio.play('iceCrack');
        }
        if (nextElapsed >= 17650 && !audioCuesPlayed.has('gl-heartbeat')) {
          audioCuesPlayed.add('gl-heartbeat');
          audio.play('suspenseHeartbeat');
        }
        if (nextElapsed >= 17800 && !audioCuesPlayed.has('gl-jump')) {
          audioCuesPlayed.add('gl-jump');
          audio.play('glacierJump');
        }
      } else if (activePlan.mode === 'elevator') {
        const pose = elevatorPoseAt(activePlan, nextElapsed);
        if (pose.dialFloor !== lastElevatorFloor) {
          lastElevatorFloor = pose.dialFloor;
          if (nextElapsed < pose.car.arriveMs) {
            audio.play('elevatorTick');
          }
        }
        if (pose.bellRing && !audioCuesPlayed.has(`el-bell-${pose.activeGroupIndex}`)) {
          audioCuesPlayed.add(`el-bell-${pose.activeGroupIndex}`);
          const isLastCar = pose.activeGroupIndex === activePlan.cars.length - 1;
          audio.play(isLastCar ? 'dingDongClimax' : 'dingDong');
        }
        if (pose.doorOpen > 0.25 && !audioCuesPlayed.has(`el-door-${pose.activeGroupIndex}`)) {
          audioCuesPlayed.add(`el-door-${pose.activeGroupIndex}`);
          audio.play('doorSlide');
        }
        if (pose.act === 3 && pose.exiting === null && !pose.surprisePeek && !audioCuesPlayed.has('el-heartbeat')) {
          const lastCar = activePlan.cars[activePlan.cars.length - 1];
          const lastEx = lastCar?.exits?.[lastCar.exits.length - 1];
          if (lastEx && nextElapsed >= lastEx.startMs && nextElapsed < lastEx.startMs + 450) {
            audioCuesPlayed.add('el-heartbeat');
            audio.play('suspenseHeartbeat');
          }
        }
        if (pose.surprisePeek && !audioCuesPlayed.has('el-wait')) {
          audioCuesPlayed.add('el-wait');
          audio.play('waitPop');
        }
      }
    }

    if (nextElapsed >= activePlan.totalDurationMs) {
      enterSettled(activeRun);
      return;
    }
    rafId = requestAnimationFrame(stepAnimation);
  }

  /** 시어터 접힘 전환(280ms)과 테마 리컬러 웜업 완료 중 늦은 시점을 시계 0ms로 동기화 (상한 800ms 가드, PRD §2.1). */
  async function waitForTheaterClockGate(reducedMode: boolean) {
    await tick();
    const sidebarWait = reducedMode || !sidebarSlotEl
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            sidebarSlotEl?.removeEventListener('transitionend', onEnd);
            clearTimeout(fbTimer);
            resolve();
          };
          const onEnd = (e: TransitionEvent) => {
            if (e.propertyName === 'width') finish();
          };
          sidebarSlotEl?.addEventListener('transitionend', onEnd);
          const fbTimer = setTimeout(finish, 340);
        });

    await Promise.race([
      Promise.all([sidebarWait, themeReadyPromise]),
      new Promise<void>((resolve) => setTimeout(resolve, 800)),
    ]);
  }

  async function startDraw(lockedGroupsMap?: Map<number, string[]>) {
    if (!ready) return;
    if (phase === 'idle' && !canStart) {
      showToast(startDisabledReason || '인원 배정을 확인해 주세요.');
      audio.play('error');
      return;
    }

    drawError = '';
    const caps = lockedGroupsMap
      ? settledGroups.map((g) => g.studentIds.length)
      : activeCapacities;

    const specs = caps.map((capacity, idx) => ({
      index: idx,
      name: lockedGroupsMap
        ? settledGroups[idx]?.name ?? resolveGroupName(groupPool[idx], idx, rosterGroups)
        : resolveGroupName(groupPool[idx], idx, rosterGroups),
      color: lockedGroupsMap ? settledGroups[idx]?.color ?? groupPool[idx]?.color ?? 'mint' : groupPool[idx]?.color ?? 'mint',
      symbol: lockedGroupsMap ? settledGroups[idx]?.symbol ?? groupPool[idx]?.symbol ?? 'star' : groupPool[idx]?.symbol ?? 'star',
      capacity,
    }));

    const res = solveGroupDraw({
      participants: effectiveParticipants,
      groupSpecs: specs,
      apartPairs: entryState.apartPairs,
      pinnedByGroup: entryState.pinnedByGroup,
      leaderIds: entryState.leaderIds,
      genderBalance: !isCustomMode && entryState.genderBalance,
      avoidRecentRepeat: entryState.avoidRecentRepeat,
      recentHistory: entryState.recentHistory,
      lockedGroups: lockedGroupsMap,
    });

    if (!res.ok) {
      drawError = res.hint ? `${res.reason} (${res.hint})` : res.reason;
      audio.play('error');
      return;
    }

    clearAnimationTimers();
    activeRun = res.run;

    // 최근 겹침 방지 이력 저장 & PostHog 집계 (개인정보 0건, 모둠 수만 기록)
    mutateEntry((prev) => ({
      ...prev,
      recentHistory: [toHistoryEntry(res.run.groups), ...prev.recentHistory].slice(0, MAX_RECENT_HISTORY),
    }));
    track('group_picker_drawn', { count: res.run.groups.length, operation: res.run.runId });
    void audio.unlock();

    if (res.run.dormantCount > 0) {
      showToast(`결석 학생이 포함된 조건 ${res.run.dormantCount}개는 오늘 건너뛰었어요.`);
    }

    const planArgs = {
      groups: res.run.groups,
      allStudentIds: res.run.participantIds,
      reduced: prefsData.reduced,
    };
    activePlan =
      prefsData.lastMode === 'glacier'
        ? createGlacierPlan(planArgs)
        : prefsData.lastMode === 'elevator'
          ? createElevatorPlan(planArgs)
          : createTrainPlan(planArgs);

    committedIds = new Set();
    launchedTicketKeys = new Set();
    audioCuesPlayed = new Set();
    lastElevatorFloor = '';
    elapsed = 0;
    lastFrameElapsed = -1;
    const myGen = ++drawGeneration;
    preparingStage = !prefsData.reduced;
    phaseEnteredAt = performance.now();
    phase = 'running';

    await waitForTheaterClockGate(prefsData.reduced);
    if (disposed || phase !== 'running' || myGen !== drawGeneration) return;

    preparingStage = false;
    runStartedAt = performance.now();
    phaseEnteredAt = runStartedAt;
    rafId = requestAnimationFrame(stepAnimation);
  }

  function skipToResult() {
    if (phase !== 'running' || !activeRun) return;
    if (performance.now() - phaseEnteredAt < ARM_MS) return;
    audio.stopStageAudio();
    enterSettled(activeRun);
  }

  // ── 결과 보드 편집 (50단계 Undo/Redo) ──
  function commitSettledGroups(nextGroups: SettledGroup[]) {
    resultUndoStack = [...resultUndoStack.slice(-49), settledGroups];
    resultRedoStack = [];
    settledGroups = nextGroups;
    unsavedResult = true;
  }

  function undoResultEdit() {
    if (!resultUndoStack.length) return;
    const prev = resultUndoStack[resultUndoStack.length - 1];
    resultUndoStack = resultUndoStack.slice(0, -1);
    resultRedoStack = [...resultRedoStack, settledGroups];
    settledGroups = prev;
    audio.play('swap');
  }

  function redoResultEdit() {
    if (!resultRedoStack.length) return;
    const nxt = resultRedoStack[resultRedoStack.length - 1];
    resultRedoStack = resultRedoStack.slice(0, -1);
    resultUndoStack = [...resultUndoStack, settledGroups];
    settledGroups = nxt;
    audio.play('swap');
  }

  function handleSwapStudents(aId: string, bId: string) {
    let gA = -1, idxA = -1, gB = -1, idxB = -1;
    settledGroups.forEach((g, gi) => {
      const ia = g.studentIds.indexOf(aId);
      const ib = g.studentIds.indexOf(bId);
      if (ia >= 0) { gA = gi; idxA = ia; }
      if (ib >= 0) { gB = gi; idxB = ib; }
    });
    if (gA < 0 || gB < 0 || (gA === gB && idxA === idxB)) return;

    const next = settledGroups.map((g) => ({ ...g, studentIds: [...g.studentIds] }));
    next[gA].studentIds[idxA] = bId;
    next[gB].studentIds[idxB] = aId;

    // 다른 모둠 간 맞바꾸기 시 기존 pinned 규칙과 충돌하지 않도록 이동 학생의 pin 해제
    if (gA !== gB && (entryState.pinnedByGroup[aId] != null || entryState.pinnedByGroup[bId] != null)) {
      mutateEntry((prev) => {
        const pinned = { ...prev.pinnedByGroup };
        delete pinned[aId];
        delete pinned[bId];
        return { ...prev, pinnedByGroup: pinned };
      });
    }
    commitSettledGroups(next);
    audio.play('swap');
  }

  function handleMoveStudent(studentId: string, toGroupIdx: number) {
    const fromIdx = settledGroups.findIndex((g) => g.studentIds.includes(studentId));
    if (fromIdx < 0 || fromIdx === toGroupIdx || toGroupIdx < 0 || toGroupIdx >= settledGroups.length) return;
    if (settledGroups[fromIdx].studentIds.length <= 1) {
      showToast('모둠에 최소 1명은 남아야 해서 옮길 수 없어요.');
      audio.play('error');
      return;
    }
    const next = settledGroups.map((g, idx) => {
      if (idx === fromIdx) return { ...g, studentIds: g.studentIds.filter((id) => id !== studentId) };
      if (idx === toGroupIdx) return { ...g, studentIds: [...g.studentIds, studentId] };
      return g;
    });

    if (entryState.pinnedByGroup[studentId] != null) {
      mutateEntry((prev) => {
        const pinned = { ...prev.pinnedByGroup };
        delete pinned[studentId];
        return { ...prev, pinnedByGroup: pinned };
      });
    }
    commitSettledGroups(next);
    audio.play('swap');
  }

  function handleToggleResultLock(groupIdx: number) {
    const next = settledGroups.map((g, i) => (i === groupIdx ? { ...g, locked: !g.locked } : g));
    commitSettledGroups(next);
    audio.play('lock');
  }

  function handleRenameResultGroup(groupIdx: number, name: string) {
    const next = settledGroups.map((g, i) => (i === groupIdx ? { ...g, name } : g));
    commitSettledGroups(next);
    handleRenameSetupGroup(groupIdx, name);
  }

  function handleRerollUnlocked() {
    const lockedMap = new Map<number, string[]>();
    settledGroups.forEach((g) => {
      if (g.locked) lockedMap.set(g.index, [...g.studentIds]);
    });
    startDraw(lockedMap);
  }

  // ── 내보내기 & 브릿지 저장 ──
  async function handleCopyPng() {
    try {
      const blob = await renderBoardPng({
        title: isCustomMode ? '모둠원 뽑기 결과' : `${classroom?.name ?? '우리 반'} 모둠 편성`,
        subtitle: `${settledGroups.length}개 모둠 · ${effectiveParticipants.length}명`,
        groups: settledGroups,
        studentMap: settledStudentMap,
        allStudents,
        alwaysShowNumber: prefsData.alwaysShowNumber,
        fontFamily,
        scheme,
      });
      await copyBoardPng(blob);
      unsavedResult = false;
      showToast('결과 이미지를 클립보드에 복사했어요.');
    } catch {
      showToast('이미지 복사에 실패했어요. PNG 저장을 이용해 보세요.');
    }
  }

  async function handleSavePng() {
    try {
      const blob = await renderBoardPng({
        title: isCustomMode ? '모둠원 뽑기 결과' : `${classroom?.name ?? '우리 반'} 모둠 편성`,
        subtitle: `${settledGroups.length}개 모둠 · ${effectiveParticipants.length}명`,
        groups: settledGroups,
        studentMap: settledStudentMap,
        allStudents,
        alwaysShowNumber: prefsData.alwaysShowNumber,
        fontFamily,
        scheme,
      });
      const saved = await saveBoardPng(classroom?.name || '모둠원뽑기', blob);
      if (saved) {
        unsavedResult = false;
        showToast('PNG 이미지로 저장했어요.');
      }
    } catch {
      showToast('PNG 이미지 저장 중 문제가 생겼어요.');
    }
  }

  async function handleBridgeConfirm(opts: {
    saveRoster: boolean;
    syncScoreboard: boolean;
    resetScores: boolean;
    openScoreboardAfter: boolean;
  }) {
    bridgeBusy = true;
    try {
      let savedRoster = false;
      if (opts.saveRoster && !isCustomMode && classroom) {
        await saveGroupsToRoster(classroom.id, settledGroups, roster.revision);
        roster = await readRoster();
        savedRoster = true;
      }
      if (opts.syncScoreboard) {
        const res = await syncGroupsToScoreboard({ groups: settledGroups, resetScores: opts.resetScores });
        if (!res.ok) throw new Error('모둠 점수판 동기화에 실패했어요.');
      }
      unsavedResult = false;
      bridgeOpen = false;
      showToast(
        savedRoster && opts.syncScoreboard
          ? '학급 명단과 모둠 점수판에 모두 반영했어요!'
          : savedRoster
            ? '학급 명단에 모둠을 저장했어요!'
            : '모둠 점수판에 새 모둠을 반영했어요!',
        savedRoster,
      );
      if (opts.openScoreboardAfter) {
        await openTool('scoreboard-group');
      }
    } catch (e) {
      showToast(String((e as Error)?.message || '반영 중 오류가 발생했어요.'));
    } finally {
      bridgeBusy = false;
    }
  }

  async function handleUndoRosterSave() {
    try {
      const latest = await readRoster();
      await execute({ type: 'undo' }, latest.revision);
      roster = await readRoster();
      showToast('방금 저장한 학급 명단 변경을 되돌렸어요.');
    } catch {
      showToast('학급 명단에서 다른 변경이 있어 되돌리지 못했어요.');
    }
  }

  // ── 창 액션 & 닫기 방어 ──
  async function performClose() {
    closeConfirmOpen = false;
    await Promise.all([prefsClient.settle(), classesClient.settle(), customClient.settle()]);
    await closeWindow();
  }

  function requestClose() {
    if (phase === 'settled' && unsavedResult) {
      closeConfirmOpen = true;
      return;
    }
    void performClose();
  }

  async function togglePin() {
    if (!native) return;
    await getCurrentWindow().setAlwaysOnTop(!pinned);
    pinned = !pinned;
  }

  async function toggleFullscreen() {
    if (native) {
      const win = getCurrentWindow();
      const next = !(await win.isFullscreen());
      await win.setFullscreen(next);
      fullscreen = next;
    } else if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  function resizeFromCorner(e: MouseEvent, dir: 'NorthWest' | 'NorthEast' | 'SouthWest' | 'SouthEast') {
    if (!native || e.button !== 0 || fullscreen) return;
    e.preventDefault();
    void getCurrentWindow().startResizeDragging(dir);
  }

  // ── 키보드 처리 (IME + defaultPrevented + 쿨다운 + Space keyup 차단) ──
  function handleKeydown(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
    const tag = (e.target as HTMLElement)?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape') {
      if (displayMenuOpen) { displayMenuOpen = false; e.preventDefault(); return; }
      if (closeConfirmOpen) { closeConfirmOpen = false; e.preventDefault(); return; }
      if (pendingLockSwitch) { pendingLockSwitch = null; e.preventDefault(); return; }
      return;
    }

    if (typing || absenceOpen || constraintsOpen || bridgeOpen || closeConfirmOpen) return;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && phase === 'settled') {
      e.preventDefault();
      undoResultEdit();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) && phase === 'settled') {
      e.preventDefault();
      redoResultEdit();
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      if (e.repeat) { e.preventDefault(); return; }
      const onInteractive = e.target instanceof Element && Boolean(e.target.closest('button,input,textarea,select,[contenteditable="true"],[role="switch"],[role="tab"]'));
      if (phase === 'idle' && canStart && !onInteractive) {
        e.preventDefault();
        startDraw();
      } else if (phase === 'running') {
        e.preventDefault();
        if (performance.now() - phaseEnteredAt >= ARM_MS) skipToResult();
      }
    }
  }

  function handleKeyup(e: KeyboardEvent) {
    if ((e.key === ' ' || e.code === 'Space') && phase === 'running') {
      e.preventDefault();
    }
  }

  // ── 학급 명단 갱신 & 외부 변경 감지 ──
  async function refreshRoster() {
    try {
      const next = await readRoster();
      if (disposed) return;
      if (!classInitialized) {
        classInitialized = true;
        const saved = untrack(() => prefsData.lastClassId);
        if (saved === CUSTOM_CLASS_ID) activeClassId = CUSTOM_CLASS_ID;
        else if (saved && next.classes.some((c) => c.id === saved)) activeClassId = saved;
        else activeClassId = next.defaultClassId ?? next.classes[0]?.id ?? CUSTOM_CLASS_ID;
      }
      if (phase === 'settled' && activeRun && !isCustomMode) {
        const cls = next.classes.find((c) => c.id === activeClassId);
        if (cls) {
          const oldIds = new Set(activeRun.participantIds);
          const newActiveIds = new Set(
            cls.students.filter((s) => !excludedSet.has(s.id)).map((s) => s.id),
          );
          const changed =
            oldIds.size !== newActiveIds.size ||
            [...oldIds].some((id) => !newActiveIds.has(id));
          if (changed) rosterDriftBanner = true;
        }
      }
      roster = next;
      rosterReady = true;
      rosterError = '';
    } catch {
      if (!disposed) {
        rosterError = '학급 명단을 불러오지 못했어요.';
        rosterReady = false;
      }
    }
  }

  function chooseClassOption(val: string) {
    if (val === ADD_CLASS_ID) {
      void openRosterFor({ action: 'create-class' });
      return;
    }
    activeClassId = val;
    freeEditCaps = null;
    drawError = '';
    if (phase !== 'idle') {
      clearAnimationTimers();
      phase = 'idle';
      unsavedResult = false;
    }
    prefsClient.mutate((p) => ({ ...p, lastClassId: val }));
  }

  $effect(() => {
    audio.setEnabled(prefsData.sound);
    audio.setVolume(prefsData.volume);
  });

  // 현재 활성 테마 + 사용 groupPool 색 OKLab 웜업 (≤96MB 예산)
  $effect(() => {
    const colorIds = stageGroupsIdle.map((g) => g.color);
    themeReadyPromise = preloadGroupPickerAssets(prefsData.lastMode, colorIds).then(({ broken }) => {
      if (!disposed && broken.size > 0) brokenAssets = broken;
    });
  });

  onMount(() => {
    const offs: (() => void)[] = [];

    const readThemeVars = () => {
      const st = getComputedStyle(document.documentElement);
      scheme = st.colorScheme.includes('dark') ? 'dark' : 'light';
      const f = st.getPropertyValue('--tk-font').trim();
      if (f) fontFamily = f;
    };
    readThemeVars();
    const observer = new MutationObserver(readThemeVars);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    offs.push(() => observer.disconnect());

    const onFontsDone = () => {
      clearFitCache();
      fontEpoch++;
    };
    document.fonts?.addEventListener('loadingdone', onFontsDone);
    offs.push(() => document.fonts?.removeEventListener('loadingdone', onFontsDone));

    const onVisibility = () => {
      docHidden = document.visibilityState === 'hidden';
      if (docHidden) return;
      void refreshRoster();
      if (phase === 'running' && !preparingStage && activePlan && activeRun) {
        const nowElapsed = performance.now() - runStartedAt;
        if (nowElapsed >= activePlan.totalDurationMs) {
          enterSettled(activeRun);
        } else {
          // 창 숨김 동안 지나간 학생들을 비행 폭주 없이 현황판에 즉시 스냅 정착
          const passed = missedTicketEvents(activePlan.ticketEvents, lastFrameElapsed, nowElapsed);
          if (passed.length > 0) {
            const nextSet = new Set(committedIds);
            for (const ev of passed) {
              launchedTicketKeys.add(ev.studentId);
              nextSet.add(ev.studentId);
            }
            committedIds = nextSet;
          }
          lastFrameElapsed = nowElapsed;
          elapsed = nowElapsed;
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    offs.push(() => document.removeEventListener('visibilitychange', onVisibility));

    const onDocPointerDown = (e: PointerEvent) => {
      if (displayMenuOpen && !(e.target as Element)?.closest('.gp-popover-anchor')) {
        displayMenuOpen = false;
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    offs.push(() => document.removeEventListener('pointerdown', onDocPointerDown));

    audio.prefetchSamples();

    void (async () => {
      try {
        await Promise.all([prefsClient.load(), classesClient.load(), customClient.load()]);
        offs.push(
          await subscribeStore(STORE_NAME, ({ section, revision }) => {
            if (section === 'prefs') void prefsClient.external(revision);
            else if (section === 'classes') void classesClient.external(revision);
            else if (section === 'custom') void customClient.external(revision);
          }),
        );
        offs.push(await subscribeRoster(() => void refreshRoster()));
        await refreshRoster();
      } catch {
        storageError = '설정을 불러오지 못했어요.';
      }
      if (!disposed) ready = true;
    })();

    if (native) {
      void (async () => {
        try {
          const win = getCurrentWindow();
          fullscreen = await win.isFullscreen();
          const closeOff = await win.onCloseRequested((e) => {
            if (phase === 'settled' && unsavedResult) {
              e.preventDefault();
              closeConfirmOpen = true;
            } else {
              e.preventDefault();
              void performClose();
            }
          });
          if (disposed) closeOff();
          else offs.push(closeOff);
        } catch {}
      })();
    }

    return () => {
      disposed = true;
      clearAnimationTimers();
      clearTimeout(toastTimer);
      offs.forEach((fn) => fn());
      prefsClient.dispose();
      classesClient.dispose();
      customClient.dispose();
      audio.dispose();
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} onkeyup={handleKeyup} />

<section class="gp-app" data-scheme={scheme} data-reduced={prefsData.reduced ? 'true' : 'false'} data-hidden={docHidden ? 'true' : 'false'} aria-label="모둠원 뽑기">
  {#if native}
    <div class="gp-resize gp-resize-nw" role="presentation" onmousedown={(e) => resizeFromCorner(e, 'NorthWest')}></div>
    <div class="gp-resize gp-resize-ne" role="presentation" onmousedown={(e) => resizeFromCorner(e, 'NorthEast')}></div>
    <div class="gp-resize gp-resize-sw" role="presentation" onmousedown={(e) => resizeFromCorner(e, 'SouthWest')}></div>
    <div class="gp-resize gp-resize-se" role="presentation" onmousedown={(e) => resizeFromCorner(e, 'SouthEast')}></div>
  {/if}

  <!-- 제목줄 (48px) -->
  <header class="gp-titlebar" use:draggable>
    <div class="gp-brand">
      <ToolIcon kind="picker-group" size={24} />
      <strong>모둠원 뽑기</strong>
      <span class="gp-divider" aria-hidden="true"></span>
      <span class="gp-context-pill" title={titleSummary}>{titleSummary}</span>
    </div>

    <div class="gp-window-actions">
      {#if native}
        <button type="button" class="gp-icon-btn" class:active={pinned} aria-label="항상 위" aria-pressed={pinned} title="항상 위" onclick={togglePin}>
          <Pin size={16} />
        </button>
      {/if}
      <button type="button" class="gp-icon-btn" aria-label={fullscreen ? '전체화면 종료' : '전체화면'} title={fullscreen ? '전체화면 종료' : '전체화면'} onclick={toggleFullscreen}>
        {#if fullscreen}<Minimize2 size={17} />{:else}<Maximize2 size={17} />{/if}
      </button>
      <button type="button" class="gp-icon-btn" aria-label="닫기" title="닫기" onclick={requestClose}>
        <X size={18} />
      </button>
    </div>
  </header>

  <!-- 보조 도구줄 (52px) -->
  {#if phase !== 'settled'}
    <div class="gp-toolbar">
      <div class="gp-toolbar-group">
        <ToolkitSelect
          value={activeClassId}
          label="학급 또는 명단 선택"
          options={classSelectOptions}
          disabled={phase === 'running'}
          onchange={chooseClassOption}
        />
        <button
          type="button"
          class="gp-pill-btn"
          disabled={phase === 'running' || allStudents.length === 0}
          onclick={() => (absenceOpen = true)}
        >
          <UserX size={14} />
          <span class="gp-hide-narrow">결석 제외</span>
          {#if entryState.excludedIds.length > 0}
            <span class="gp-badge-count">{entryState.excludedIds.length}</span>
          {/if}
        </button>
        <button
          type="button"
          class="gp-pill-btn"
          disabled={phase === 'running' || effectiveParticipants.length < 2}
          onclick={() => (constraintsOpen = true)}
        >
          <SlidersHorizontal size={14} />
          <span class="gp-hide-narrow">조건 설정</span>
          {#if activeRuleCount > 0}
            <span class="gp-badge-count">{activeRuleCount}</span>
          {/if}
        </button>
      </div>

      <div class="gp-mode-tabs" role="tablist" aria-label="뽑기 연출 선택">
        {#each STAGE_MODES as m (m.id)}
          <button
            type="button"
            role="tab"
            aria-selected={prefsData.lastMode === m.id}
            class:active={prefsData.lastMode === m.id}
            disabled={phase === 'running'}
            onclick={() => prefsClient.mutate((p) => ({ ...p, lastMode: m.id }))}
          >{m.label}</button>
        {/each}
      </div>

      <div class="gp-toolbar-group">
        <button
          type="button"
          class="gp-icon-btn"
          class:active={prefsData.sound}
          aria-label={prefsData.sound ? '소리 끄기' : '소리 켜기'}
          title={prefsData.sound ? '소리 켜짐' : '소리 꺼짐'}
          onclick={() => prefsClient.mutate((p) => ({ ...p, sound: !p.sound }))}
        >
          {#if prefsData.sound}<Volume2 size={17} />{:else}<VolumeX size={17} />{/if}
        </button>

        <div class="gp-popover-anchor">
          <button
            type="button"
            class="gp-icon-btn"
            class:active={displayMenuOpen}
            aria-label="표시 설정"
            aria-expanded={displayMenuOpen}
            title="표시 설정"
            onclick={() => (displayMenuOpen = !displayMenuOpen)}
          >
            <Settings2 size={17} />
          </button>

          {#if displayMenuOpen}
            <div class="gp-popover" role="dialog" aria-label="표시 설정">
              <div class="gp-popover-row">
                <span>동작 감소 모드</span>
                <ToolkitSwitch
                  checked={prefsData.reduced}
                  label="동작 감소 모드"
                  disabled={phase === 'running'}
                  onchange={(v) => prefsClient.mutate((p) => ({ ...p, reduced: v }))}
                />
              </div>
              <div class="gp-popover-row">
                <span>번호 항상 보기</span>
                <ToolkitSwitch
                  checked={prefsData.alwaysShowNumber}
                  label="번호 항상 보기"
                  onchange={(v) => prefsClient.mutate((p) => ({ ...p, alwaysShowNumber: v }))}
                />
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- 배너 영역 (비차단 안내) -->
  {#if storageError || rosterError}
    <div class="gp-banner warn" role="alert">
      <span>{storageError || rosterError}</span>
      <button type="button" class="gp-pill-btn" onclick={() => void refreshRoster()}>다시 시도</button>
    </div>
  {:else if classDeleted}
    <div class="gp-banner warn" role="status">
      <span>선택했던 학급이 삭제되었어요. 다른 학급이나 직접 입력으로 전환할까요?</span>
      <button type="button" class="gp-pill-btn active" onclick={() => chooseClassOption(roster.classes[0]?.id ?? CUSTOM_CLASS_ID)}>전환하기</button>
    </div>
  {:else if drawError}
    <div class="gp-banner warn" role="alert">
      <span>{drawError}</span>
      <div class="gp-banner-actions">
        <button type="button" class="gp-pill-btn" onclick={() => (constraintsOpen = true)}>조건 수정</button>
        <button type="button" class="gp-pill-btn" onclick={() => (drawError = '')}>닫기</button>
      </div>
    </div>
  {:else if pendingLockSwitch}
    <div class="gp-banner warn" role="alertdialog" aria-label="잠긴 모둠 안내">
      <span>{pendingLockSwitch.message}</span>
      <div class="gp-banner-actions">
        <button type="button" class="gp-pill-btn" onclick={() => (pendingLockSwitch = null)}>취소</button>
        <button type="button" class="gp-pill-btn active" onclick={() => pendingLockSwitch?.onConfirm()}>잠금 풀고 적용</button>
      </div>
    </div>
  {:else if phase === 'settled' && rosterDriftBanner}
    <div class="gp-banner" role="status">
      <span>학급 명단의 학생 구성이 바뀌었어요.</span>
      <div class="gp-banner-actions">
        <button type="button" class="gp-pill-btn" onclick={() => (rosterDriftBanner = false)}>현재 결과 유지</button>
        <button
          type="button"
          class="gp-pill-btn active"
          onclick={() => {
            rosterDriftBanner = false;
            phase = 'idle';
          }}
        >새 명단에 맞추기</button>
      </div>
    </div>
  {/if}

  <!-- 메인 작업 영역 (실행 중 시어터 모드: 좌측 사이드바 접고 무대 64% : 현황판 36% 확장) -->
  <div class="gp-body" class:theater={phase === 'running'}>
    {#if phase === 'settled'}
      <ResultBoard
        groups={settledGroups}
        studentMap={settledStudentMap}
        {allStudents}
        {classAvatarMap}
        {isCustomMode}
        sortOrder={prefsData.sortOrder}
        alwaysShowNumber={prefsData.alwaysShowNumber}
        {fontFamily}
        {fontEpoch}
        canUndo={resultUndoStack.length > 0}
        canRedo={resultRedoStack.length > 0}
        {brokenAssets}
        onBackToSetup={() => {
          if (performance.now() - phaseEnteredAt < SETTLED_ARM_MS) return;
          phase = 'idle';
          drawError = '';
        }}
        onChangeSort={(sortOrder) => prefsClient.mutate((p) => ({ ...p, sortOrder }))}
        onUndo={undoResultEdit}
        onRedo={redoResultEdit}
        onRerollUnlocked={handleRerollUnlocked}
        onSwapStudents={handleSwapStudents}
        onMoveStudent={handleMoveStudent}
        onToggleLock={handleToggleResultLock}
        onRenameGroup={handleRenameResultGroup}
        onCopyPng={handleCopyPng}
        onSavePng={handleSavePng}
        onOpenBridge={() => (bridgeOpen = true)}
        onMarkBroken={markBroken}
      />
    {:else}
      <div class="gp-sidebar-slot" class:collapsed={phase === 'running'} bind:this={sidebarSlotEl}>
        <SetupSidebar
          {presentCount}
          {isCustomMode}
          customLines={customData.lines}
          baseIntent={effectiveBaseIntent}
          capacities={activeCapacities}
          locks={activeLocks}
          {pinnedFloors}
          {groupPool}
          {rosterGroups}
          keepTotal={prefsData.keepTotal}
          hasOnePersonDueToSmallN={derivedAlloc.hasOnePersonDueToSmallN}
          disabled={phase === 'running'}
          onApplyRecommendation={handleApplyRecommendation}
          onSwitchMode={handleSwitchAllocMode}
          onSetGroupCount={handleSetGroupCount}
          onSetTargetSize={handleSetTargetSize}
          onSelectRemainder={handleSelectRemainder}
          onStepGroup={handleStepGroup}
          onToggleLock={handleToggleLock}
          onRenameGroup={handleRenameSetupGroup}
          onAddGroup={handleAddGroup}
          onRemoveGroup={handleRemoveGroup}
          onAutoBalance={handleAutoBalance}
          onToggleKeepTotal={(keepTotal) => prefsClient.mutate((p) => ({ ...p, keepTotal }))}
          onUpdateCustomLines={(lines) => {
            freeEditCaps = null;
            customClient.mutate((cur) => ({ ...cur, lines }));
          }}
        />
      </div>

      <main class="gp-workspace" class:theater={phase === 'running'}>
        <div class="gp-stage-shell">
          {#if !isCustomMode && rosterReady && roster.classes.length === 0}
            <div class="gp-empty-card">
              <UsersRound size={36} style="color:var(--gp-accent)" />
              <h2>등록된 학급 명단이 없어요</h2>
              <p>학급 명단을 등록하거나, 임시 이름 목록을 바로 입력해서 모둠을 뽑을 수 있어요.</p>
              <div class="gp-toolbar-group" style="justify-content:center">
                <button type="button" class="gp-pill-btn active" onclick={() => void openRosterFor({ action: 'create-class' })}>
                  학급 명단 등록하기 <ArrowRight size={14} />
                </button>
                <button type="button" class="gp-pill-btn" onclick={() => chooseClassOption(CUSTOM_CLASS_ID)}>
                  ✏️ 직접 입력하기
                </button>
              </div>
            </div>
          {:else if over50 && phase === 'idle'}
            <div class="gp-empty-card">
              <h2>참여 인원이 {presentCount}명이에요 (최대 50명)</h2>
              <p>모둠원 뽑기는 한 번에 최대 50명까지 지원해요. 결석 학생을 제외해 50명 이하로 맞춰 주세요.</p>
              <button type="button" class="gp-primary-cta" style="height:44px" onclick={() => (absenceOpen = true)}>
                결석 제외로 인원 조정하기
              </button>
            </div>
          {:else if presentCount < 2 && phase === 'idle'}
            <div class="gp-empty-card">
              <h2>참여 학생이 {presentCount}명이에요</h2>
              <p>모둠을 나누려면 최소 2명 이상이 필요해요. 한 명만 뽑아야 한다면 간단 뽑기를 이용해 보세요.</p>
              <div class="gp-toolbar-group" style="justify-content:center">
                {#if allStudents.length >= 2}
                  <button type="button" class="gp-pill-btn active" onclick={() => (absenceOpen = true)}>결석 체크 확인</button>
                {:else if !isCustomMode && classroom}
                  <button type="button" class="gp-pill-btn active" onclick={() => void openRosterFor({ action: 'add-students', classId: classroom.id })}>학생 추가하기</button>
                {/if}
                <button type="button" class="gp-pill-btn" onclick={() => void openTool('picker')}>한 명 뽑기 열기</button>
              </div>
            </div>
          {:else if prefsData.lastMode === 'glacier'}
            <GlacierStage
              bind:this={glacierStageRef}
              {phase}
              plan={activePlan}
              {elapsed}
              groups={phase === 'running' ? stageGroupsRunning : stageGroupsIdle}
              capacities={activeCapacities}
              participants={effectiveParticipants}
              {committedIds}
              {allStudents}
              {classAvatarMap}
              alwaysShowNumber={prefsData.alwaysShowNumber}
              {scheme}
              {brokenAssets}
              {canStart}
              {startDisabledReason}
              {preparingStage}
              {fontFamily}
              onStart={() => void startDraw()}
              onSkip={skipToResult}
              onMarkBroken={markBroken}
            />
          {:else if prefsData.lastMode === 'elevator'}
            <ElevatorStage
              bind:this={elevatorStageRef}
              {phase}
              plan={activePlan}
              {elapsed}
              groups={phase === 'running' ? stageGroupsRunning : stageGroupsIdle}
              participants={effectiveParticipants}
              {allStudents}
              {classAvatarMap}
              alwaysShowNumber={prefsData.alwaysShowNumber}
              {scheme}
              {brokenAssets}
              {canStart}
              {startDisabledReason}
              {preparingStage}
              {fontFamily}
              onStart={() => void startDraw()}
              onSkip={skipToResult}
              onMarkBroken={markBroken}
            />
          {:else}
            <TrainStage
              bind:this={trainStageRef}
              {phase}
              plan={activePlan}
              {elapsed}
              groups={phase === 'running' ? stageGroupsRunning : stageGroupsIdle}
              participants={effectiveParticipants}
              {allStudents}
              {classAvatarMap}
              alwaysShowNumber={prefsData.alwaysShowNumber}
              {scheme}
              {brokenAssets}
              {canStart}
              {startDisabledReason}
              {preparingStage}
              {fontFamily}
              onStart={() => void startDraw()}
              onSkip={skipToResult}
              onMarkBroken={markBroken}
            />
          {/if}
        </div>

        <LiveManifestBoard
          {phase}
          theater={phase === 'running'}
          groups={phase === 'running' ? stageGroupsRunning : stageGroupsIdle}
          capacities={activeCapacities}
          {activeGroupIndex}
          {committedIds}
          studentMap={settledStudentMap}
          {allStudents}
          alwaysShowNumber={prefsData.alwaysShowNumber}
        />
      </main>
    {/if}
  </div>

  <TicketFlightOverlay bind:this={flightOverlay} />

  {#if toast}
    <div class="gp-toast" role="status" aria-live="polite">
      <span>{toast.text}</span>
      {#if toast.undoRoster}
        <button type="button" onclick={handleUndoRosterSave}>실행 취소</button>
      {/if}
    </div>
  {/if}

  <!-- 모달 3종 + 미저장 닫기 확인 -->
  <AbsenceModal
    open={absenceOpen}
    students={allStudents}
    excludedIds={entryState.excludedIds}
    onClose={() => (absenceOpen = false)}
    onChangeExcluded={(excludedIds) => {
      freeEditCaps = null;
      mutateEntry((prev) => ({ ...prev, excludedIds }));
    }}
  />

  <ConstraintsModal
    open={constraintsOpen}
    {isCustomMode}
    {allStudents}
    {presentStudents}
    groupNames={stageGroupsIdle.map((g) => g.name)}
    genderBalance={entryState.genderBalance}
    avoidRecentRepeat={entryState.avoidRecentRepeat}
    apartPairs={entryState.apartPairs}
    pinnedByGroup={entryState.pinnedByGroup}
    onClose={() => (constraintsOpen = false)}
    onApply={(next) => mutateEntry((prev) => ({ ...prev, ...next }))}
  />

  <BridgeSaveModal
    open={bridgeOpen}
    {isCustomMode}
    className={classroom?.name ?? '직접 입력'}
    groupCount={settledGroups.length}
    busy={bridgeBusy}
    onClose={() => (bridgeOpen = false)}
    onConfirm={handleBridgeConfirm}
  />

  {#if closeConfirmOpen}
    <dialog
      class="gp-dialog"
      open
      aria-labelledby="gp-unsaved-close-title"
      oncancel={(e) => {
        e.preventDefault();
        closeConfirmOpen = false;
      }}
    >
      <div class="gp-dialog-inner" style="max-width:440px">
        <header class="gp-dialog-head">
          <h2 id="gp-unsaved-close-title">저장하지 않은 모둠 결과가 있어요</h2>
          <button type="button" class="gp-icon-btn" aria-label="닫기" onclick={() => (closeConfirmOpen = false)}><X size={18} /></button>
        </header>
        <p style="margin:0; font-size:13.5px; line-height:1.5; color:var(--gp-muted)">
          창을 닫기 전에 방금 뽑은 모둠 구성을 학급 명단이나 점수판에 반영할까요?
        </p>
        <footer class="gp-dialog-foot">
          <button type="button" class="gp-pill-btn" onclick={() => void performClose()}>저장 안 하고 닫기</button>
          <div class="gp-toolbar-group">
            <button type="button" class="gp-pill-btn" onclick={() => (closeConfirmOpen = false)}>계속 보기</button>
            <button
              type="button"
              class="gp-pill-btn active"
              onclick={() => {
                closeConfirmOpen = false;
                bridgeOpen = true;
              }}
            >반영하러 가기</button>
          </div>
        </footer>
      </div>
    </dialog>
  {/if}
</section>
