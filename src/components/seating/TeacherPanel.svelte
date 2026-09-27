<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type {Draft,Classroom,SeatingDocument,Archive} from '../../lib/seating/types';
  import { clone, uid, publicBoard, resizeLayout } from '../../lib/seating/model.js';
  import { dailyArchives, importSeatLayout } from '../../lib/seating/model.js';
  import { RULE_NAMES, violations } from '../../lib/seating/solver.js';
  import { checkRules } from '../../lib/seating/ruleCheck.js';
  import { Check, ClipboardList, History, ListChecks, LockKeyhole, MapPin, Maximize2, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, X } from 'lucide-svelte';
  import ClassroomScene from './ClassroomScene.svelte';
  let { draft, classroom, document, onchange, onaction, busy=false }: {draft:Draft,classroom:Classroom,document:SeatingDocument,onchange:(d:Draft)=>void,onaction:(a:any)=>void,busy?:boolean} = $props();
  let tab=$state('rules'),kind=$state('apart'),first=$state(''),second=$state(''),distance=$state('near'),presetStudent=$state(''),notice=$state(''),record=$state<Archive|null>(null),enlarged=$state<Archive|null>(null),person=$state('');
  let showAllPins=$state(false),presetToast=$state(''),presetToastUndo=$state<(()=>void)|null>(null),archivePicker=$state(false),rosterDrag=$state<{studentId:string;startX:number;startY:number;x:number;y:number;moved:boolean;hoverSeat:string}|null>(null);
  let toastTimer:ReturnType<typeof setTimeout>|null=null,ignoreTagClick:{studentId:string;until:number}|null=null;
  let ruleBuilder=$state<HTMLElement|undefined>(undefined);
  let editingId=$state(''),editingTitle=$state(''),editInput=$state<HTMLInputElement|undefined>(undefined);
  const archives=$derived(dailyArchives(document.archives));
  const previousArchives=$derived(archives.filter(a=>a.id!==document.currentId&&a.used!==false));
  const comparisonArchives=$derived(archives.filter(a=>a.used!==false));
  const comparisonId=$derived(comparisonArchives.some(a=>a.id===draft.comparisonArchiveId)?draft.comparisonArchiveId||'':'');
  const RULE_HELP:Record<string,string>={apart:'집중이나 관계를 위해 두 학생 사이에 거리가 필요할 때',together:'도움이 필요한 두 학생을 짝이나 같은 모둠에 앉힐 때',front:'칠판과 선생님 설명을 가까이에서 봐야 할 때',back:'뒤쪽 자리가 더 편한 학생을 배려할 때'};
  const RULE_KINDS=Object.entries(RULE_NAMES).filter(([id])=>id!=='zone'&&id!=='fixed');
  const name=(id:string)=>classroom.students.find(p=>p.id===id)?.name||'삭제된 학생';
  const conflicts=$derived(violations(draft));
  // 사전 지정·자리 유지도 재배치 때 반드시 지키는 조건이라, 선생님이 추가한 조건과 함께 보여 주고 서로 부딪히는지 미리 따집니다.
  const check=$derived(checkRules(draft,classroom.students));
  const PIN_LIMIT=8;
  const shownPins=$derived(showAllPins?check.pins:check.pins.slice(0,PIN_LIMIT));
  const pinIssues=$derived(check.pins.filter(p=>p.issue));
  const presetPinCount=$derived(check.pins.filter(p=>p.source==='preset').length);
  const fixedPinCount=$derived(check.pins.filter(p=>p.source==='fixed').length);
  // 규칙 줄에 자리 범위를 짧게 붙여, 같은 두 학생의 조건도 한눈에 구분되게 합니다.
  const DISTANCE_NAMES:Record<string,string>={near:'주변 자리도',far:'멀리',pair:'짝 기준',group:'모둠 기준'};
  // "추가" 버튼: 조건 목록에서 바로 아래 규칙 추가 칸으로 옮겨 첫 학생 칸에 커서를 둡니다.
  // 초점을 먼저 옮깁니다. 부드러운 스크롤 중에 초점을 옮기면 Chromium이 스크롤을 멈춥니다.
  // 창이 가려져 화면을 그리지 않으면 부드러운 스크롤이 멈춰 있으므로, 0.5초 안에 움직이지 않으면 바로 옮깁니다.
  function focusRuleBuilder(){
    const target=ruleBuilder;if(!target)return;
    target.querySelector('select')?.focus({preventScroll:true});
    const startTop=target.getBoundingClientRect().top;
    target.scrollIntoView({behavior:'smooth',block:'start'});
    setTimeout(()=>{if(Math.abs(target.getBoundingClientRect().top-startTop)<1)target.scrollIntoView({block:'start'});},500);
  }
  const visibleRules=$derived(draft.rules.filter(r=>r.kind!=='zone'&&r.kind!=='fixed'));
  const ruleConflictCount=$derived(visibleRules.filter(r=>check.rules.get(r.id)?.status==='conflict').length);
  const presetRules=$derived(draft.rules.filter(r=>r.kind==='zone'));
  const presetSeats=$derived(presetRules.find(r=>r.students[0]===presetStudent)?.seatIds||[]);
  const fixedRules=$derived(draft.rules.filter(r=>r.kind==='fixed'));
  const sortedStudents=$derived([...classroom.students].sort((a,b)=>a.number-b.number||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id)));
  const presetByStudent=$derived(new Map(presetRules.map(r=>[r.students[0],r.seatIds?.[0]])));
  const fixedStudents=$derived(new Set(fixedRules.map(r=>r.students[0])));
  const unassignedCount=$derived(sortedStudents.filter(p=>!presetByStudent.has(p.id)&&!fixedStudents.has(p.id)).length);
  const presetBoard=$derived.by(()=>{
    const base=publicBoard(draft,classroom.students,classroom.name);
    const bySeat=new Map([...fixedRules.map(r=>[r.seatId,r.students[0]] as const),...presetRules.flatMap(r=>(r.seatIds||[]).map(id=>[id,r.students[0]] as const))]);
    return {...base,seats:draft.layout.seats.map(s=>{
      const p=classroom.students.find(p=>p.id===bySeat.get(s.id));
      return {...s,name:p?.name||'',number:p?.number||'',appearance:'',gender:p?.gender||'unspecified'};
    })};
  });
  onDestroy(()=>{if(toastTimer)clearTimeout(toastTimer);});
  // 되돌리기 버튼이 붙은 알림은 누를 시간이 필요해 조금 더 오래 보여 줍니다.
  function showPresetToast(message:string,undo:(()=>void)|null=null){presetToast=message;presetToastUndo=undo;if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>{presetToast='';presetToastUndo=null;toastTimer=null;},undo?6000:2000);}
  function addRule(){if(!first||(['apart','together'].includes(kind)&&(!second||first===second))){notice='학생을 골라 주세요. 두 학생은 서로 달라야 해요.';return;}
    const r={id:uid(),kind,students:['apart','together'].includes(kind)?[first,second]:[first],distance};const d=clone(draft);d.rules.push(r);
    // 추가하기 전에 지정 자리·다른 조건과 맞는지 보고 결과를 바로 알려 줍니다(같은 조건은 다시 넣지 않음).
    const info=checkRules(d,classroom.students).rules.get(r.id);
    if(info?.status==='duplicate'){notice='같은 조건이 이미 있어요.';return;}
    onchange(d);first='';second='';
    notice=info?.status==='conflict'?`규칙을 추가했지만 확인이 필요해요. ${info.message}`:info?.status==='covered'?`규칙을 추가했어요. ${info.message}`:'규칙을 추가했어요. 자리 재배치 때 꼭 지켜요.';}
  // 사전 지정을 바꾼 결과 새로 부딪히는 배치 조건이 생기면, 배치 조건 탭으로 가지 않아도 바로 알 수 있게 알려 줍니다.
  function warnNewConflicts(next:Draft){
    const before=check.rules,after=checkRules(next,classroom.students).rules;
    const fresh=[...after].filter(([id,v])=>v.status==='conflict'&&before.get(id)?.status!=='conflict').map(([id])=>next.rules.find(r=>r.id===id)).filter(r=>!!r);
    if(!fresh.length)return;
    const rule=fresh[0];
    showPresetToast(fresh.length===1?`${rule.students.map(name).join(' · ')} '${RULE_NAMES[rule.kind]}' 조건과 맞지 않아요. 배치 조건에서 확인해 주세요.`:`배치 조건 ${fresh.length}개와 맞지 않아요. 배치 조건에서 확인해 주세요.`);
  }
  function selectKind(id:string){if(kind===id)return;kind=id;distance=id==='apart'?'near':'pair';}
  function setPresetSeat(id:string,studentId=presetStudent,toggle=true){if(!studentId){showPresetToast('오른쪽 명단에서 학생을 골라 주세요.');return;}
    if(!classroom.students.some(p=>p.id===studentId)){showPresetToast('학급 명단에서 학생을 찾을 수 없어요.');return;}
    const fixed=draft.rules.find(r=>r.kind==='fixed'&&(r.students[0]===studentId||r.seatId===id));
    if(fixed&&fixed.seatId!==id){showPresetToast('고정된 학생이나 자리예요. 메인 화면에서 자물쇠를 해제해 주세요.');return;}
    if(fixed&&fixed.students[0]!==studentId){showPresetToast('다른 학생이 고정된 자리예요.');return;}
    if(fixed&&fixed.students[0]===studentId){showPresetToast('이미 자리가 고정된 학생이에요.');return;}
    const d=clone(draft),existing=d.rules.find(r=>r.kind==='zone'&&r.students[0]===studentId),wasSame=existing?.seatIds?.length===1&&existing.seatIds[0]===id;
    if(wasSame&&!toggle)return;
    d.rules=d.rules.filter(r=>r.kind!=='zone'||r.students[0]===studentId||!r.seatIds?.includes(id));
    if(existing){if(wasSame)d.rules=d.rules.filter(r=>r.id!==existing.id);else existing.seatIds=[id];}
    else d.rules.push({id:uid(),kind:'zone',students:[studentId],seatIds:[id]});
    onchange(d);warnNewConflicts(d);
  }
  // 배치도의 × 버튼: 그 자리에 걸린 사전 지정만 지웁니다. 메인 화면의 자리 유지(fixed)는 자물쇠로만 풀 수 있게 x를 달지 않습니다.
  const presetSeatIds=$derived(presetRules.flatMap(r=>r.seatIds||[]));
  function clearPresetSeat(seatId:string){
    const rule=presetRules.find(r=>r.seatIds?.includes(seatId));if(!rule)return;
    const d=clone(draft),target=d.rules.find(r=>r.id===rule.id);
    if(target){target.seatIds=(target.seatIds||[]).filter(id=>id!==seatId);if(!target.seatIds.length)d.rules=d.rules.filter(r=>r.id!==rule.id);}
    if(presetStudent===rule.students[0])presetStudent='';
    onchange(d);showPresetToast(`${name(rule.students[0])} 자리를 비웠어요.`,()=>restorePresets([clone(rule)]));
  }
  function clearPreset(studentId:string){const rule=presetRules.find(r=>r.students[0]===studentId);if(!rule)return;const d=clone(draft);d.rules=d.rules.filter(r=>r.id!==rule.id);onchange(d);}
  // 사전 지정만 모두 지웁니다. 메인 화면의 자리 유지(fixed)는 선생님이 따로 푼 것이 아니므로 건드리지 않습니다.
  function resetPresets(){
    if(!presetRules.length){showPresetToast('지울 사전 지정이 없어요.');return;}
    const cleared=clone(presetRules),d=clone(draft);
    d.rules=d.rules.filter(r=>r.kind!=='zone');
    presetStudent='';archivePicker=false;onchange(d);
    showPresetToast(`사전 지정 ${cleared.length}명을 모두 비웠어요.`,()=>restorePresets(cleared));
  }
  // 초기화 뒤 새로 지정한 학생·자리가 있으면 그쪽을 우선하고, 겹치지 않는 옛 지정만 되살립니다.
  function restorePresets(cleared:typeof presetRules){
    const d=clone(draft),valid=new Set(classroom.students.map(p=>p.id)),seats=new Set(d.layout.seats.map(s=>s.id));
    const takenPeople=new Set(d.rules.filter(r=>r.kind==='zone'||r.kind==='fixed').map(r=>r.students[0]));
    const takenSeats=new Set(d.rules.flatMap(r=>r.kind==='fixed'?[r.seatId]:r.kind==='zone'?(r.seatIds||[]):[]));
    let restored=0;
    for(const r of cleared){
      const seatId=r.seatIds?.[0],studentId=r.students[0];
      if(!seatId||!valid.has(studentId)||!seats.has(seatId)||takenPeople.has(studentId)||takenSeats.has(seatId))continue;
      d.rules.push(clone(r));takenPeople.add(studentId);takenSeats.add(seatId);restored++;
    }
    if(!restored){showPresetToast('되살릴 수 있는 지정이 없어요.');return;}
    onchange(d);showPresetToast(`사전 지정 ${restored}명을 되살렸어요.`);
  }
  function resizePreset(axis:'columns'|'rows',delta:number){const d=resizeLayout(draft,axis,delta);if(!d){showPresetToast('학생이 앉아 있거나 지정된 자리까지는 줄일 수 없어요.');return;}onchange(d);}
  function loadPresetFrom(source:Draft){
    const d=clone(draft),valid=new Set(classroom.students.map(p=>p.id)),fixedPeople=new Set(fixedRules.map(r=>r.students[0])),fixedSeats=new Set(fixedRules.map(r=>r.seatId));
    d.rules=d.rules.filter(r=>r.kind!=='zone');
    const seen=new Set<string>();
    source.layout.seats.forEach((seat,i)=>{
      const studentId=source.assignments[seat.id],target=d.layout.seats[i];
      if(!target||!studentId||!valid.has(studentId)||fixedPeople.has(studentId)||fixedSeats.has(target.id)||seen.has(studentId))return;
      d.rules.push({id:uid(),kind:'zone',students:[studentId],seatIds:[target.id]});seen.add(studentId);
    });
    if(!seen.size){showPresetToast('불러올 학생 자리가 없어요.');return;}
    archivePicker=false;presetStudent='';onchange(d);warnNewConflicts(d);
  }
  function openArchivePicker(){if(!previousArchives.length){showPresetToast('이전 자리가 없어요.');return;}archivePicker=!archivePicker;}
  function seatAt(x:number,y:number){const element=window.document.elementFromPoint(x,y)?.closest('[data-seat-id]');return element?.closest('.teacher-preset-scene')?element.getAttribute('data-seat-id')||'':'';}
  function startRosterPointer(e:PointerEvent,studentId:string){if(busy||fixedStudents.has(studentId)||e.button!==0)return;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);rosterDrag={studentId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,hoverSeat:''};}
  function moveRosterPointer(e:PointerEvent){if(!rosterDrag)return;const moved=rosterDrag.moved||Math.hypot(e.clientX-rosterDrag.startX,e.clientY-rosterDrag.startY)>5;rosterDrag={...rosterDrag,x:e.clientX,y:e.clientY,moved,hoverSeat:moved?seatAt(e.clientX,e.clientY):''};}
  function endRosterPointer(e:PointerEvent){if(!rosterDrag)return;const {studentId,moved}=rosterDrag,seatId=moved?seatAt(e.clientX,e.clientY):'';rosterDrag=null;if(moved){ignoreTagClick={studentId,until:Date.now()+300};if(seatId){presetStudent=studentId;setPresetSeat(seatId,studentId,false);}}}
  function change(key:string,value:any){const d=clone(draft);Object.assign(d,{[key]:value});onchange(d);}
  function restore(a:Archive,layoutOnly=false){
    const d=importSeatLayout(draft,a.draft,classroom.students.length);
    if(!layoutOnly){
      const valid=new Set(classroom.students.map(p=>p.id));
      const archived=Object.fromEntries(Object.entries(a.draft.assignments).filter(([seat,p])=>valid.has(p)&&d.layout.seats.some(s=>s.id===seat)));
      const placed=new Set(Object.values(archived));
      for(const [seat,p] of Object.entries(d.assignments))if(!placed.has(p)){
        const destination=!archived[seat]?seat:d.layout.seats.find(s=>s.active!==false&&!archived[s.id])?.id;
        if(destination){archived[destination]=p;placed.add(p);}
      }
      d.assignments=archived;
    }
    onchange(d);notice=layoutOnly?'책상 배치를 가져오고 현재 학생은 가까운 자리에 유지했어요.':'지난 배치로 다시 시작했어요. 명단이 달라진 학생은 가능한 자리에 유지했어요.';
  }
  function remove(a:Archive){if(!confirm(`${a.date} 자리 기록을 삭제할까요? 삭제한 기록은 다시 참고할 수 없어요.`))return;record=null;enlarged=null;onaction({type:'deleteArchive',id:a.id});}
  async function editArchive(a:Archive){editingId=a.id;editingTitle=a.title;await tick();editInput?.focus();editInput?.select();}
  function commitArchive(a:Archive){if(editingId!==a.id)return;const title=editingTitle.trim();editingId='';if(title&&title!==a.title)onaction({type:'renameArchive',id:a.id,title});}
</script>

<svelte:window onkeydown={e=>{if(e.key==='Escape'){enlarged=null;archivePicker=false;rosterDrag=null;}}}/>
<div class="seat-teacher-panel">
  <header class="teacher-header">
    <div class="teacher-intro"><div class="teacher-title"><span class="teacher-tag">선생님 전용</span><h2>{classroom.name}</h2></div><!-- 지난 자리는 자주 고치는 설정이 아니라 가끔 꺼내 보는 기록이라, 탭 대신 머리 오른쪽의 열람 버튼으로 둡니다. -->
      <button class="teacher-history-button" class:active={tab==='history'} aria-pressed={tab==='history'} title="지금까지 사용한 자리 배치를 열람해요" onclick={()=>{tab='history';notice='';}}><History size={16}/>지난 자리 기록<small>{archives.length}</small></button></div>
    <nav class="seat-tabs" aria-label="선생님 설정"><button class:active={tab==='rules'} aria-current={tab==='rules'?'page':undefined} onclick={()=>tab='rules'}>배치 조건{#if check.conflictCount}<small class="warn" title="확인이 필요한 조건">{check.conflictCount}</small>{/if}</button><button class:active={tab==='preset'} aria-current={tab==='preset'?'page':undefined} onclick={()=>{tab='preset';notice='';}}>사전 지정 <small>{presetRules.length}</small></button></nav>
  </header>
  {#if notice&&tab!=='preset'}<p class="seat-notice" role="status">{notice}</p>{/if}
  {#if tab==='rules'}
    <div class="teacher-rules-content">
      <!-- 사전 지정(자리를 정해 두는 것)과 자리 배정 규칙(학생 사이 관계)은 성격이 달라 두 칸으로 나누되, 머리·줄 모양은 같게 맞춥니다. -->
      <section class="teacher-section teacher-conditions" aria-label="현재 추가한 조건">
        <div class="cond-head"><h3><span class="cond-head-icon" aria-hidden="true"><ClipboardList size={15}/></span>현재 추가한 조건 <small>{visibleRules.length+check.pins.length}</small></h3>{#if check.conflictCount}<p class="cond-alert" role="status"><TriangleAlert size={14}/>확인이 필요한 조건 {check.conflictCount}개 · 고치기 전에는 자리 재배치를 할 수 없어요.</p>{:else}<p>자리 재배치 때 모두 적용해요.</p>{/if}</div>
        <div class="cond-panels">
          <section class="cond-panel cond-panel-preset" class:warn={pinIssues.length>0} aria-label="사전 지정">
            <header><span class="cond-icon"><MapPin size={15}/></span><div><h4>사전 지정 <small>{check.pins.length}</small></h4><p>{fixedPinCount?`자리 유지 ${fixedPinCount}명 포함 · `:''}재배치 때 이 자리에 먼저 앉혀요</p></div><button class="cond-action" onclick={()=>{tab='preset';notice='';}} disabled={busy}>{presetPinCount?'편집':'지정하기'}</button></header>
            <!-- 두 칸의 몸통은 남는 높이를 채워, 내용 양이 달라도 두 칸의 높이가 같게 보이도록 합니다. -->
            <div class="cond-body">
            {#if check.pins.length}
              <ul class="cond-pins">
                {#each shownPins as p (p.studentId)}<li class:fixed={p.source==='fixed'} class:issue={!!p.issue} title={p.issue||(p.source==='fixed'?'메인 화면에서 자리 유지 중':'사전 지정')}><span class="cond-num">{#if p.source==='fixed'}<LockKeyhole size={10}/>{:else}{p.number}{/if}</span><b>{p.name}</b><em>{p.label}</em></li>{/each}
                {#if check.pins.length>PIN_LIMIT}<li class="cond-more"><button aria-expanded={showAllPins} onclick={()=>showAllPins=!showAllPins}>{showAllPins?'접기':`+${check.pins.length-PIN_LIMIT}명 더 보기`}</button></li>{/if}
              </ul>
              {#each pinIssues as p (p.studentId)}<p class="cond-status conflict"><TriangleAlert size={12}/>{p.name}: {p.issue}</p>{/each}
            {:else}<p class="cond-empty">자리를 미리 정한 학생이 없어요.</p>{/if}
            </div>
          </section>
          <section class="cond-panel cond-panel-rules" class:warn={ruleConflictCount>0} aria-label="자리 배정 규칙">
            <header><span class="cond-icon"><ListChecks size={15}/></span><div><h4>자리 배정 규칙 <small>{visibleRules.length}</small></h4><p>학생 사이 거리와 앞뒤 위치를 지켜요</p></div><button class="cond-action" onclick={focusRuleBuilder} disabled={busy}><Plus size={13}/>추가</button></header>
            <div class="cond-body">
            {#if visibleRules.length}
              <ul class="cond-rules">
                {#each visibleRules as r (r.id)}
                  {@const info=check.rules.get(r.id)}
                  {@const status=info?.status||'free'}
                  {@const draftMiss=status==='free'&&conflicts.some(v=>v.id===r.id)}
                  <li class="cond-rule {status}">
                    <span class="cond-kind" data-kind={r.kind}>{RULE_NAMES[r.kind]}</span>
                    <div class="cond-rule-body">
                      <div class="cond-rule-line"><b>{r.students.map(name).join(' · ')}</b>{#if r.distance&&['apart','together'].includes(r.kind)}<em>{DISTANCE_NAMES[r.distance]||''}</em>{/if}</div>
                      {#if status==='covered'}<p class="cond-status ok"><Check size={12}/>{info?.message}</p>
                      {:else if status==='conflict'}<p class="cond-status conflict"><TriangleAlert size={12}/>{info?.message}</p>
                      {:else if info?.message}<p class="cond-status">{info.message}</p>
                      {:else if draftMiss}<p class="cond-status">지금 화면의 배치에서는 지켜지지 않아요. 재배치 때 맞춰요.</p>{/if}
                      <!-- 고치기 버튼은 판정 문구 아래에 둡니다. 옆에 두면 좁은 카드에서 문구가 세로로 꺾였습니다. -->
                      {#if status==='conflict'&&info?.source==='preset'}<button class="cond-fix" onclick={()=>{tab='preset';presetStudent=info.studentId;notice='';}} disabled={busy}><MapPin size={12}/>사전 지정 고치기</button>{/if}
                    </div>
                    <div class="cond-rule-actions">
                      <button class="cond-delete" aria-label={`${r.students.map(name).join(', ')} ${RULE_NAMES[r.kind]} 조건 삭제`} title="조건 삭제" onclick={()=>change('rules',draft.rules.filter(v=>v.id!==r.id))} disabled={busy}><X size={13}/></button>
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}<p class="cond-empty">아직 규칙이 없어요. 아래에서 규칙을 골라 추가하세요.</p>{/if}
            </div>
          </section>
        </div>
      </section>
      <section class="teacher-section teacher-rule-builder" data-kind={kind} bind:this={ruleBuilder}>
        <div class="teacher-section-heading"><span>1</span><div><h3>자리 배정 규칙 추가</h3><p>규칙을 고르고 필요한 학생을 선택하세요.</p></div></div>
        <div class="teacher-rule-workspace">
          <div class="rule-kind-grid" aria-label="자리 배정 규칙">{#each RULE_KINDS as [id,label]}<button class:active={kind===id} data-kind={id} aria-pressed={kind===id} onclick={()=>selectKind(id)}><b>{label}</b><small>{RULE_HELP[id]}</small></button>{/each}</div>
          <div class="seat-rule-form"><div class="teacher-form-heading"><h4>{RULE_NAMES[kind]} 설정</h4><p>{RULE_HELP[kind]}</p></div>
            <div class="seat-fields">
              <label><b>학생</b><select bind:value={first}><option value="">학생 고르기</option>{#each classroom.students as p}<option value={p.id}>{p.number} {p.name}</option>{/each}</select></label>
              {#if ['apart','together'].includes(kind)}<label><b>함께 살펴볼 학생</b><select bind:value={second}><option value="">학생 고르기</option>{#each classroom.students as p}<option value={p.id}>{p.number} {p.name}</option>{/each}</select></label>{/if}
              {#if ['apart','together'].includes(kind)}<label class="teacher-range-field"><b>자리 범위</b><select bind:value={distance}>{#if kind==='apart'}<option value="near">주변 자리도 피하기</option><option value="far">멀리 떨어뜨리기</option>{/if}<option value="pair">짝 기준</option><option value="group">모둠 기준</option></select><small>{kind==='apart'?'두 학생 사이를 어느 정도 비울지 정해요.':'둘을 짝으로 둘지 같은 모둠에 둘지 정해요.'}</small></label>{/if}
            </div>
            <button class="seat-primary teacher-add-rule" onclick={addRule} disabled={busy}>이 규칙 추가</button>
          </div>
        </div>
      </section>
      <section class="teacher-section teacher-detail-settings"><div class="teacher-section-heading"><span>2</span><div><h3>세부 설정</h3><p>성별 배치와 지난 자리 반복을 조정하세요.</p></div></div>
        <div class="teacher-detail-row"><label class="teacher-gender-field"><b>성별 배치</b><select value={draft.gender} onchange={e=>change('gender',e.currentTarget.value)}><option value="any">성별에 관계없이</option><option value="different">짝의 성별 다르게</option><option value="same">짝의 성별 같게</option><option value="balanced">모둠에 고르게</option></select></label><p>성별 미입력 학생도 배치에 참여해요.</p></div>
        <div class="teacher-comparison-head"><div><h4>직전 자리 비교</h4><p>{comparisonArchives.length?'선택하지 않으면 직전 자동 저장 자리를 기준으로 해요.':'저장된 자리가 없어 첫 배치는 비교 없이 진행해요.'}</p></div><label><span>비교할 자리</span><select value={comparisonId} disabled={!comparisonArchives.length} onchange={e=>change('comparisonArchiveId',e.currentTarget.value||null)}><option value="">자동 · 직전 저장 자리</option>{#each [...comparisonArchives].reverse() as a (a.id)}<option value={a.id}>{a.date} · {a.title}</option>{/each}</select></label></div>
        <div class="teacher-option-list"><label><input type="checkbox" checked={draft.avoidPartners} onchange={e=>change('avoidPartners',e.currentTarget.checked)}/><span><b>지난 짝꿍 피하기</b><small>같은 짝 반복 줄이기</small></span></label><label><input type="checkbox" checked={draft.avoidGroups} onchange={e=>change('avoidGroups',e.currentTarget.checked)}/><span><b>지난 모둠 친구 피하기</b><small>같은 모둠 조합 줄이기</small></span></label><label><input type="checkbox" checked={draft.avoidPosition} onchange={e=>change('avoidPosition',e.currentTarget.checked)}/><span><b>같은 위치 반복 줄이기</b><small>앞·뒤·창가 위치 바꾸기</small></span></label></div>
      </section>
    </div>
  {:else if tab==='preset'}
    <section class="teacher-preset">
      <div class="teacher-preset-heading"><div><h3>사전 지정</h3><p>오른쪽 명단에서 학생을 자리로 끌어 놓으세요. 학생을 누른 뒤 자리를 눌러도 돼요.</p></div><b>{presetRules.length}명 지정</b></div>
      <div class="teacher-preset-workspace">
        <div class="teacher-preset-scene"><ClassroomScene board={presetBoard} selected={presetSeats} dropHighlight={rosterDrag?.hoverSeat||''} onselect={id=>setPresetSeat(id)} clearable={presetSeatIds} onclear={clearPresetSeat} onresize={resizePreset} resizable simple fit disabled={busy}/></div>
        <aside class="teacher-preset-roster" aria-label="학생 명단">
          <div class="teacher-preset-roster-heading"><div><h4>학생 명단</h4><span>번호순 · 미지정 {unassignedCount}명</span></div><button class="teacher-preset-reset" disabled={busy||!presetRules.length} title="사전 지정을 모두 지워 빈자리로 만들어요" onclick={resetPresets}><RotateCcw size={14}/>초기화</button></div>
          <div class="teacher-preset-roster-actions"><button disabled={busy} onclick={()=>loadPresetFrom(draft)}>현재 설정 불러오기</button><button disabled={busy} aria-expanded={archivePicker} onclick={openArchivePicker}>이전 자리 불러오기</button>
            {#if archivePicker}<div class="teacher-preset-archive-menu" aria-label="불러올 이전 자리"><strong>이전 자리 선택</strong>{#each [...previousArchives].reverse() as a (a.id)}<button disabled={busy} onclick={()=>loadPresetFrom(a.draft)}><span>{a.title}</span><small>{a.date}</small></button>{/each}</div>{/if}
          </div>
          <p class="teacher-preset-roster-hint">태그를 끌어 빈 자리나 다른 지정 자리로 옮기세요.</p>
          <div class="teacher-preset-students">
            {#each sortedStudents as p (p.id)}
              {@const assigned=presetByStudent.has(p.id)}
              {@const fixed=fixedStudents.has(p.id)}
              <div class="teacher-preset-person" class:assigned class:fixed>
                <button class="teacher-preset-tag" class:active={presetStudent===p.id} class:dragging={rosterDrag?.studentId===p.id&&rosterDrag.moved} aria-pressed={presetStudent===p.id} aria-label={`${p.number}번 ${p.name}${fixed?', 자리 유지 중':assigned?', 사전 지정됨':', 미지정'}`} title={fixed?'자리 유지 중 · 메인 화면에서 해제':assigned?'끌어서 자리 변경':'끌어서 자리 지정'} disabled={busy||fixed} onpointerdown={event=>startRosterPointer(event,p.id)} onpointermove={moveRosterPointer} onpointerup={endRosterPointer} onpointercancel={()=>rosterDrag=null} onclick={()=>{if(ignoreTagClick?.studentId===p.id&&Date.now()<ignoreTagClick.until)return;presetStudent=presetStudent===p.id?'':p.id;}}><span class="teacher-preset-number">{p.number}</span><span class="teacher-preset-name">{p.name}</span>{#if fixed}<span class="teacher-preset-state">유지</span>{:else if assigned}<span class="teacher-preset-state">지정</span>{/if}</button>
                {#if assigned&&!fixed}<button class="teacher-preset-remove" aria-label={`${p.number}번 ${p.name} 사전 지정 지우기`} title="사전 지정 지우기" disabled={busy} onclick={()=>clearPreset(p.id)}>×</button>{/if}
              </div>
            {/each}
          </div>
        </aside>
      </div>
      <p class="teacher-preset-foot">지정하지 않은 학생만 다음 자리 재배치에서 새 자리를 찾습니다. 지정 자리에는 해당 학생이 앉아요.</p>
    </section>
  {:else}
    <section class="teacher-section"><h3>사용한 자리를 기억해요</h3><p>완성된 마지막 배치를 자동으로 기록하며, 다음 자리 재배치에 참고합니다.</p>
    <label>학생별로 살펴보기<select bind:value={person}><option value="">우리 반 전체</option>{#each classroom.students as p}<option value={p.id}>{p.number} {p.name}</option>{/each}</select></label>
    {#if !archives.length}<div class="seat-empty-small">첫 자리를 정하면 여기에 차곡차곡 쌓여요.</div>{/if}
    {#each [...archives].reverse() as a (a.id)}<article class="archive-entry"><div class="archive-entry-top"><div class="archive-heading"><div class="archive-heading-label">{#if editingId===a.id}<input bind:this={editInput} bind:value={editingTitle} aria-label="자리 기록 이름" maxlength="100" onblur={()=>commitArchive(a)} onkeydown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();commitArchive(a);}else if(e.key==='Escape'){editingId='';}}}/>{:else}<button class="archive-title-button" aria-expanded={record?.id===a.id} onclick={()=>record=record?.id===a.id?null:a}><b>{a.title}</b><small>{a.date}{document.currentId===a.id?' · 현재 자리':''}</small></button>{/if}</div><button class="archive-edit" aria-label={`${a.title} 이름 수정`} title="이름 수정" disabled={busy} onclick={()=>editArchive(a)}><Pencil size={17}/></button><button class="archive-open" aria-label={`${a.title} ${record?.id===a.id?'접기':'보기'}`} aria-expanded={record?.id===a.id} onclick={()=>record=record?.id===a.id?null:a}>{record?.id===a.id?'접기':'보기'}</button></div><button class="archive-delete" aria-label={`${a.date} 자리 기록 삭제`} title="기록 삭제" disabled={busy} onclick={()=>remove(a)}><Trash2 size={18}/></button></div>
      {#if record?.id===a.id}<div class="archive-detail">
        {#if person}<p class="archive-person-note">{name(person)}의 지난 짝꿍: {a.relations.pairs.filter(k=>k.split('|').includes(person)).map(k=>k.split('|').filter(id=>id!==person).map(name).join(', ')).join(', ')||'기록 없음'}</p>{/if}
        <div class="archive-preview"><ClassroomScene board={publicBoard(a.draft,a.students,classroom.name,a.date)} disabled/><button class="archive-preview-open" aria-label={`${a.date} 자리 배치 크게 보기`} title="클릭해서 크게 보기" onclick={()=>enlarged=a}><Maximize2 size={18}/><span>크게 보기</span></button></div>
        <p class="archive-difference">현재 초안과 다른 자리 <b>{classroom.students.filter(p=>Object.keys(draft.assignments).find(s=>draft.assignments[s]===p.id)!==Object.keys(a.draft.assignments).find(s=>a.draft.assignments[s]===p.id)).length}명</b></p>
        <div class="archive-action-grid"><button onclick={()=>restore(a)} disabled={busy}><b>이 배치로 다시 시작</b><small>지난 학생 자리까지 가져와요</small></button><button onclick={()=>restore(a,true)} disabled={busy}><b>자리 배치 가져오기</b><small>책상 위치를 가져오고 현재 학생을 유지해요</small></button></div>
      </div>{/if}
    </article>{/each}</section>
  {/if}
</div>
{#if rosterDrag?.moved}<div class="teacher-preset-drag-ghost" style:left={`${rosterDrag.x+14}px`} style:top={`${rosterDrag.y+14}px`} aria-hidden="true">{name(rosterDrag.studentId)}</div>{/if}
{#if tab==='preset'&&presetToast}<div class="teacher-preset-toast" role="status"><span>{presetToast}</span>{#if presetToastUndo}<button disabled={busy} onclick={()=>{const undo=presetToastUndo;presetToastUndo=null;undo?.();}}>되돌리기</button>{/if}</div>{/if}
{#if enlarged}<div class="archive-lightbox" role="dialog" aria-modal="true" aria-label={`${enlarged.date} 자리 배치 크게 보기`}><div class="archive-lightbox-panel"><header><div><b>{enlarged.title}</b><small>{enlarged.date}</small></div><button aria-label="확대 보기 닫기" onclick={()=>enlarged=null}><X size={22}/></button></header><ClassroomScene board={publicBoard(enlarged.draft,enlarged.students,classroom.name,enlarged.date)} disabled/></div></div>{/if}
