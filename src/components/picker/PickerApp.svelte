<script lang="ts">
  import {onMount,tick} from 'svelte';
  import {X,Pin,Maximize2,Minimize2,Shuffle,RotateCcw,Undo2,SlidersHorizontal,UsersRound,Plus,Check,ChevronDown,Volume2,VolumeX,MousePointer2,Hand,Target,Pencil,FolderOpen,Save,Trash2,Minus,ArrowRight,Sparkles} from 'lucide-svelte';
  import {getCurrentWindow} from '@tauri-apps/api/window';
  import {native} from '../../lib/toolkit/store.js';
  import {openTool,closeWindow} from '../../lib/toolkit/windows.js';
  import {dragRegion} from '../../lib/dragRegion.js';
  import {readRoster,subscribeRoster} from '../../lib/classroom/repository.js';
  import {captureCandidates} from '../../lib/classroom/context.js';
  import {MODES,DURATION,createSession,bucket,candidates,filterEntries,beginDraw,finishDraw,updateBucket,parseList,makeList} from '../../lib/picker/engine.js';
  import {TOYS,BALLOONS,PALETTES,createSuspense} from '../../lib/picker/designs.js';
  import {emptyLibrary,readLibrary,writeLibrary} from '../../lib/picker/storage.js';
  import {createPickerAudio} from '../../lib/picker/audio.js';
  import {rollingPlan,rollingStep,fitName} from '../../lib/picker/nameCard.js';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import PickerStage from './PickerStage.svelte';
  import PickerCelebration from './PickerCelebration.svelte';
  import './picker.css';
  type Entry=import('../../lib/picker/engine.js').Entry;
  type List={id:string;name:string;kind:string;entries:Entry[]};
  let mode=$state('classic'),source=$state('all'),classId=$state<string|null>(null),initialized=false;
  let roster=$state<Awaited<ReturnType<typeof readRoster>>>({classes:[],revision:0,defaultClassId:null});
  let rosterReady=$state(false),rosterError=$state(''),error=$state(''),notice=$state('');
  let session=$state(createSession()),repeat=$state(true);
  // 바로 결과 보기: 켜면 애니메이션 없이 누르는 즉시 결과가 나옵니다. "한 번씩 골고루"처럼 창을 열 때마다 꺼진 상태로 시작합니다.
  let instant=$state(false);
  let lists=$state<Record<string,List>>({groups:makeList('groups',[]),custom:makeList('custom',[])});
  let library=$state<any>(emptyLibrary()),libraryReady=$state(false),saving=$state(false),storageError=$state('');
  let sound=$state(true),reduce=$state(false),pinned=$state(false),expanded=$state(false);
  let panel=$state(''),search=$state(''),allHistory=$state(false),palette=$state('sage');
  let designs=$state<Record<string,string>>({claw:'mixed',balloon:'mixed'}),seed=$state(0),target=$state(0);
  let runScene=$state<Entry[]>([]),resultToySrc=$state(TOYS[0].src);
  let celebration=$state<Entry|null>(null);
  let suspense=$state({duration:0,visits:[] as {slot:number;pause:number;dip:number}[]});
  let elapsed=$state(0),clock=$state(0),startedAt=$state(0),shuffling=$state(false),assetsReady=$state(false),assetError=$state('');
  const sceneElapsed=$derived(Math.max(0,elapsed-suspense.duration));
  let disposed=false,raf=0,watchdog:ReturnType<typeof setTimeout>,shuffleTimer:ReturnType<typeof setTimeout>,offRoster=()=>{};
  const audio=createPickerAudio();
  let cues=new Set<string>();
  let editor:HTMLDialogElement,confirmDialog:HTMLDialogElement,utilityDialog:HTMLDialogElement;
  let drawEntries=$state<Entry[]>([]),runReduced=$state(false),runInstant=$state(false);
  let rolling=$state.raw<{at:number;index:number}[]>([]);
  let editorFor=$state(''),editorKind=$state('custom'),editorName=$state(''),editorText=$state(''),editorRows=$state<Entry[]>([]),editorStep=$state('input'),editorError=$state(''),duplicateOK=$state(false);
  let confirmTitle=$state(''),confirmCopy=$state(''),confirmAction:()=>void=()=>{};
  const classroom=$derived(roster.classes.find(c=>c.id===classId)??null);
  const custom=$derived(source==='groups'||source==='custom');
  const currentList=$derived(lists[source]);
  const sourceKey=$derived(custom?`list:${currentList.id}`:`class:${classId??'none'}`);
  const entries=$derived<Entry[]>(custom?currentList.entries:filterEntries(classroom?.students??[],source));
  const sourceState=$derived(bucket(session,sourceKey));
  const eligible=$derived(candidates(entries,sourceState,repeat));
  const sceneBase=$derived(entries.length<=30?entries:eligible.slice(0,30));
  const sceneEntries=$derived(session.active?runScene:sceneBase);
  const sceneVisible=$derived(new Set((session.active?drawEntries:eligible).map(e=>e.id)));
  const busy=$derived(!!session.active||shuffling);
  const reduced=$derived(reduce);
  const history=$derived(sourceState.history);
  const result=$derived(history.at(-1)?.mode===mode?history.at(-1)?.winner??null:null);
  const title=$derived(custom?currentList.name:classroom?.name??'학급을 선택해 주세요');
  const unit=$derived(custom?'개':'명');
  const canDraw=$derived(!busy&&eligible.length>0&&(custom||rosterReady&&!rosterError&&!!classroom)&&(mode!=='claw'||assetsReady&&!assetError));
  const visibleEntries=$derived(entries.filter(e=>`${e.number??''} ${e.name}`.includes(search.trim())));
  const duplicates=$derived(editorRows.filter((e,i,a)=>a.findIndex(x=>x.name.trim()===e.name.trim())!==i).map(e=>e.name));
  const phase=$derived(runReduced?'두근두근, 결과를 준비하고 있어요':elapsed<suspense.duration?(mode==='claw'?'이쪽일까요… 저쪽일까요?':'잠깐, 다른 풍선도 볼까요?'):mode==='claw'?(sceneElapsed<800?'집게가 인형을 찾아가요':sceneElapsed<1600?'집게가 천천히 내려와요':sceneElapsed<2100?'인형을 꼭 잡았어요!':sceneElapsed<3000?'인형을 들어 올려요':sceneElapsed<3650?'선물 출구로 이동해요':'인형이 나옵니다!'):mode==='balloon'?(sceneElapsed<900?'어떤 풍선일까요? 조준 중!':sceneElapsed<1700?'다트가 날아가요!':sceneElapsed<2300?'명중! 풍선이 터졌어요':'당첨된 이름을 공개해요'):'이름을 골고루 섞고 있어요');
  const rollingEntry=$derived(drawEntries[rolling[rollingStep(rolling,elapsed)]?.index??0]);
  // 클래식 이름 카드는 한 장이 대기(뒷면) → 넘기는 중 → 멈춤(당첨자가 나온 뒤 한 박자) → 결과로 이어집니다.
  // 동작 감소 모드는 넘기지 않고 뒷면인 채로 기다립니다.
  const cardState=$derived(session.active?(runReduced?'waiting':elapsed>=(rolling.at(-1)?.at??0)?'landed':'rolling'):result?'result':'idle');
  const cardEntry=$derived(cardState==='result'?result:cardState==='rolling'||cardState==='landed'?rollingEntry:null);
  const footerText=$derived(session.active?phase:shuffling?'골고루 섞고 있어요':!eligible.length&&entries.length?'이번 뽑기가 끝났어요. 다시 시작할 수 있어요.':!entries.length?'명단을 준비하면 시작할 수 있어요':instant?'애니메이션 없이 바로 결과를 보여 줘요':mode==='classic'?'이름이 섞이다가 오늘의 주인공이 나타나요':mode==='claw'?'집게가 인형을 잡아 선물 출구로 가져와요':'다트를 던져 풍선 속 이름을 확인해요');
  const duration=$derived(runReduced?900:DURATION[mode as keyof typeof DURATION]+suspense.duration);
  const steps=$derived(mode==='claw'?['이동','내려가기','잡기','올리기','선물 도착']:mode==='balloon'?['조준','다트 발사','풍선 팡!','결과 공개']:['이름 섞기','결과 공개']);
  const stepIndex=$derived(mode==='claw'?(elapsed<800?0:elapsed<1600?1:elapsed<2100?2:elapsed<3650?3:4):mode==='balloon'?(elapsed<900?0:elapsed<1700?1:elapsed<2300?2:3):(elapsed<1600?0:1));
  const draggable=(node:HTMLElement)=>native?dragRegion(node):{destroy(){}};
  const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
  let refreshTicket=0;
  async function refreshRoster(){
    const ticket=++refreshTicket;
    try{const next=await readRoster();if(disposed||ticket!==refreshTicket)return;
      if(!initialized){classId=next.defaultClassId;initialized=true;}
      if(session.active&&next.revision!==roster.revision)notice='명단 변경은 다음 뽑기부터 반영해요.';
      roster=next;rosterReady=true;rosterError='';
    }catch(e){if(!disposed&&ticket===refreshTicket){rosterError='학급 명단을 불러오지 못했어요.';rosterReady=false;}}
  }
  async function loadLibrary(){try{library=await readLibrary();sound=library.preferences.sound;reduce=library.preferences.reduced;audio.setEnabled(sound);libraryReady=true;storageError='';}catch(e){storageError=errorText(e);libraryReady=false;}}
  async function persist(value:any){if(saving||!libraryReady)return false;saving=true;try{library=await writeLibrary(value);storageError='';return true;}catch(e){storageError=errorText(e);return false;}finally{saving=false;}}
  async function preference(key:'sound'|'reduced',value:boolean){if(key==='sound'){sound=value;audio.setEnabled(value);}else{reduce=value;}
    if(libraryReady)await persist({...library,preferences:{...library.preferences,[key]:value}});
  }
  async function preload(){assetError='';assetsReady=false;try{await Promise.all(TOYS.map(t=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>img.decode().then(()=>resolve()).catch(reject);img.onerror=reject;img.src=t.src;})));if(!disposed)assetsReady=true;}catch{if(!disposed)assetError='인형 이미지를 불러오지 못했어요.';}}
  $effect(()=>{if(mode==='claw'&&!assetsReady&&!assetError)void preload();});
  $effect(()=>{if(!utilityDialog)return;if(panel&&!utilityDialog.open)utilityDialog.showModal();else if(!panel&&utilityDialog.open)utilityDialog.close();});
  // 소리는 잠금 해제 뒤에 냅니다. 바로 결과 보기에서는 첫 클릭과 같은 순간에 결과가 나와 아직 소리가 잠겨 있을 수 있습니다.
  function complete(id:string){if(disposed||session.active?.id!==id)return;const winner=session.active.winner;session=finishDraw(session,id);if(mode!=='classic')celebration={...winner};elapsed=0;clearTimeout(watchdog);if(!document.hidden)void audio.unlock().then(()=>{if(!disposed)audio.play('result');});}
  async function draw(){
    if(!canDraw)return;
    error='';notice='';
    try{
      // Commit the outcome synchronously before audio or any awaited work.
      drawEntries=eligible.map(e=>({...e}));runReduced=reduced;runInstant=instant;
      session=beginDraw(session,sourceKey,custom?entries:filterEntries(captureCandidates(classroom!).students,source),mode,roster.revision,repeat);
      const winner=session.active!.winner,id=session.active!.id;
      runScene=sceneBase.map(e=>({...e}));
      target=runScene.findIndex(e=>e.id===winner.id);
      if(target<0){target=runScene.length-1;runScene[target]={...winner};}
      if(mode==='claw')resultToySrc=TOYS[designs.claw==='mixed'?(target+seed)%6:Math.max(0,TOYS.findIndex(t=>t.id===designs.claw))].src;
      // 바로 결과 보기: 이미 정해진 결과를 연출 없이 곧바로 기록합니다(뽑는 방법과 확률은 같습니다).
      if(instant){complete(id);return;}
      suspense=runReduced||mode==='classic'?{duration:0,visits:[]}:createSuspense(runScene.flatMap((e,i)=>sceneVisible.has(e.id)?[i]:[]),target);
      if(mode==='classic'&&!runReduced){
        let at=drawEntries.findIndex(e=>e.id===winner.id);
        if(at<0){drawEntries=[...drawEntries,{...winner}];at=drawEntries.length-1;}
        rolling=rollingPlan(drawEntries.length,at,DURATION.classic);
      }
      startedAt=session.active!.startedAt;clock=startedAt;elapsed=0;cues=new Set();
      // Sound permission must never block or consume the visual sequence.
      void audio.unlock().then(()=>{if(!disposed&&session.active?.id===id&&!runReduced)audio.play('move');});
      watchdog=setTimeout(()=>complete(id),(runReduced?900:DURATION[mode as keyof typeof DURATION]+suspense.duration)+150);
    }catch(e){error=errorText(e);}
  }
  function shuffleScene(){if(busy)return;shuffling=true;void audio.unlock().then(()=>audio.play('shuffle'));
    shuffleTimer=setTimeout(()=>{if(disposed)return;seed++;shuffling=false;},reduced?0:750);
  }
  function changeMode(value:string){if(busy)return;mode=value;panel='';error='';}
  function changeSource(value:string){if(busy)return;source=value;panel='';search='';notice='';}
  async function editList(){
    if(busy||!custom)return;
    if(editorFor!==currentList.id){editorFor=currentList.id;editorKind=source;editorName=currentList.name;editorText='';editorRows=structuredClone($state.snapshot(currentList.entries));editorStep=editorRows.length?'preview':'input';editorError='';duplicateOK=false;}
    await tick();editor.showModal();
  }
  function previewList(){try{const parsed=parseList(editorText);editorRows=parsed.names.map((name,i)=>({id:crypto.randomUUID(),name,number:i+1}));editorStep='preview';duplicateOK=false;editorError='';}catch(e){editorError=errorText(e);}}
  function applyList(){try{
    parseList(editorRows.map(e=>e.name).join('\n'));
    if(editorRows.some(e=>!e.name.trim()))throw new Error('빈 항목을 수정하거나 삭제해 주세요.');
    if(duplicates.length&&!duplicateOK)throw new Error('같은 이름의 항목을 확인해 주세요.');
    if(!editorName.trim()||editorName.length>80||/[\u0000-\u001f\u007f]/.test(editorName))throw new Error('목록 이름을 80자 이내로 입력해 주세요.');
    const old=lists[editorKind];const replaced=editorText.trim()!=='';
    lists={...lists,[editorKind]:{id:replaced?crypto.randomUUID():old.id,kind:editorKind,name:editorName.trim(),entries:editorRows.map(e=>({...e,name:e.name.normalize('NFC').trim()}))}};
    editorFor='';editorText='';editor.close();notice='목록을 적용했어요. 보관하려면 목록 저장을 눌러 주세요.';
  }catch(e){editorError=errorText(e);}}
  async function saveList(){const saved=await persist({...library,lists:[...library.lists.filter((l:List)=>l.id!==currentList.id),$state.snapshot(currentList)]});if(saved)notice='목록을 저장했어요. 추첨 기록은 저장하지 않아요.';}
  function loadList(id:string){const list=library.lists.find((l:List)=>l.id===id);if(list){lists={...lists,[source]:structuredClone($state.snapshot(list))};editorFor='';panel='';notice='저장한 목록을 불러왔어요.';}}
  function ask(title:string,copy:string,action:()=>void){confirmTitle=title;confirmCopy=copy;confirmAction=action;confirmDialog.showModal();}
  function reset(){ask('다시 시작할까요?',`${title}의 뽑기 기록을 지워요. 일시 제외한 대상은 그대로 유지합니다.`,()=>{session=updateBucket(session,sourceKey,'reset');notice='뽑기 기록을 초기화했어요.';});}
  async function pin(){try{if(native)await getCurrentWindow().setAlwaysOnTop(!pinned);pinned=!pinned;}catch{error='창 고정을 바꾸지 못했어요.';}}
  async function fullscreen(){try{if(native){const w=getCurrentWindow();const v=await w.isFullscreen();await w.setFullscreen(!v);expanded=!v;}else if(document.fullscreenElement){await document.exitFullscreen();expanded=false;}else{await document.documentElement.requestFullscreen();expanded=true;}}catch{error='전체화면을 전환하지 못했어요.';}}
  async function minimize(){if(native)await getCurrentWindow().minimize();}
  async function close(){await closeWindow();}
  function keys(e:KeyboardEvent){
    if(celebration)return;
    if(e.repeat&&['Space','Enter'].includes(e.code)&&e.target instanceof Element&&e.target.closest('.picker-draw')){e.preventDefault();return;}
    if(e.key==='Escape'&&!editor?.open&&!confirmDialog?.open){if(panel){panel='';e.preventDefault();}else if(expanded){void fullscreen();e.preventDefault();}}
    if(e.code!=='Space'||e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||editor?.open||confirmDialog?.open||utilityDialog?.open|| (e.target instanceof Element&&e.target.closest('button,input,textarea,select,[contenteditable="true"],[role="switch"]')))return;
    e.preventDefault();void draw();
  }
  function tabKey(e:KeyboardEvent,index:number){if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)&&!busy){e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowRight'?1:2))%3;changeMode(MODES[i].id);document.getElementById(`picker-tab-${MODES[i].id}`)?.focus();}}
  // 프레임 루프는 추첨 중이거나 풍선이 둥실 떠 있는 동안에만 돕니다(클래식·인형뽑기 대기 화면은 멈춰 있음).
  const animating=$derived(!!session.active||(mode==='balloon'&&!reduced));
  function frame(now:number){raf=0;if(disposed||!(session.active||(mode==='balloon'&&!reduced)))return;if(!document.hidden){clock=now;if(session.active){elapsed=now-startedAt;
      const cue=runReduced?'':mode==='claw'?(sceneElapsed>=1900?'grip':''):mode==='balloon'?(sceneElapsed>=1700?'pop':''):'';
      if(cue&&!cues.has(cue)){cues.add(cue);audio.play(cue as 'grip'|'pop');}
      if(elapsed>=duration)complete(session.active.id);
    }}raf=requestAnimationFrame(frame);}
  $effect(()=>{if(animating&&!raf&&!disposed)raf=requestAnimationFrame(frame);});
  onMount(()=>{
    const visibility=()=>{if(document.hidden)audio.stop();else{void refreshRoster();if(session.active&&performance.now()-startedAt>=duration)complete(session.active.id);}};
    const focus=()=>void refreshRoster();
    document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',focus);
    void (async()=>{try{const off=await subscribeRoster(()=>void refreshRoster());if(disposed){off();return;}offRoster=off;await refreshRoster();}catch{rosterError='학급 명단 연결을 확인해 주세요.';}})();
    void loadLibrary();
    return()=>{disposed=true;cancelAnimationFrame(raf);clearTimeout(watchdog);clearTimeout(shuffleTimer);offRoster();audio.dispose();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);};
  });
</script>

<svelte:window onkeydown={keys}/>
<section class="picker-app" class:motion-full={!reduced} class:reduced style={`--picker-tint:var(--tk-soft);--picker-accent:var(--tk-accent);--picker-machine:${palette==='butter'?'#ead9b2':palette==='sky'?'#c9dce8':'#d0e1d4'}`}>
  <header class="picker-titlebar" use:draggable>
    <span class="picker-brand"><span class="picker-brand-dot"></span>간단 뽑기</span>
    <div class="picker-window-actions"><button aria-label="항상 위" aria-pressed={pinned} class:active={pinned} onclick={pin}><Pin size={16}/></button><button aria-label="최소화" onclick={minimize}><Minus size={17}/></button><button aria-label={expanded?'전체화면 해제':'전체화면'} onclick={fullscreen}>{#if expanded}<Minimize2 size={17}/>{:else}<Maximize2 size={17}/>{/if}</button><button aria-label="닫기" onclick={close}><X size={18}/></button></div>
  </header>
  <main class="picker-main">
    <div class="picker-topline"><div><p class="picker-kicker">우리 반의 작은 설렘</p><h1>이번엔 누구일까요?</h1></div><nav class="picker-toolbar" aria-label="뽑기 관리"><button disabled={busy} onclick={()=>{panel='targets';search='';}}><UsersRound size={19}/>대상 관리</button><button disabled={busy} onclick={()=>panel='settings'}><SlidersHorizontal size={19}/>설정</button><button disabled={busy||!history.length} onclick={reset}><RotateCcw size={19}/>다시 시작</button></nav></div>
    <div class="picker-workspace">
    <aside class="picker-preparation" aria-label="명단 준비">
      <h2 class="picker-step-heading"><span>1</span>누구를 뽑을까요?</h2>
      <div class="picker-source-options" role="group" aria-label="뽑기 대상">
        <button class:selected={!custom} aria-pressed={!custom} disabled={busy} onclick={()=>changeSource('all')}><UsersRound size={21}/><span><strong>학급 명단</strong><small>등록된 학생 중에서</small></span>{#if !custom}<Check size={18}/>{/if}</button>
        <button class:selected={source==='groups'} aria-pressed={source==='groups'} disabled={busy} onclick={()=>changeSource('groups')}><Hand size={21}/><span><strong>모둠 뽑기</strong><small>모둠 이름을 입력해서</small></span>{#if source==='groups'}<Check size={18}/>{/if}</button>
        <button class:selected={source==='custom'} aria-pressed={source==='custom'} disabled={busy} onclick={()=>changeSource('custom')}><Pencil size={21}/><span><strong>직접 입력</strong><small>이름 · 번호 · 활동</small></span>{#if source==='custom'}<Check size={18}/>{/if}</button>
      </div>
      <div class="picker-source-detail">
      {#if !custom}
        <label class="picker-field">우리 반<select aria-label="학급 선택" value={classId??''} disabled={busy} onchange={e=>{classId=e.currentTarget.value||null;notice='';}}><option value="">학급을 선택해 주세요</option>{#each roster.classes as c}<option value={c.id}>{c.name}</option>{/each}</select></label>
        <div class="picker-filter" role="group" aria-label="학생 범위">{#each [{id:'all',label:'전체'},{id:'male',label:'남학생'},{id:'female',label:'여학생'}] as f}<button aria-pressed={source===f.id} class:selected={source===f.id} disabled={busy} onclick={()=>changeSource(f.id)}>{f.label}</button>{/each}</div>
        <button class="picker-roster-link" disabled={busy} onclick={()=>openTool('roster')}><FolderOpen size={17}/>학급 명단 열기<ArrowRight size={16}/></button>
      {:else}
        <p class="picker-list-name">{currentList.name}</p>
        <button class="picker-edit-list" disabled={busy} onclick={editList}><Pencil size={18}/>{entries.length?'목록 편집':'목록 입력'}<span>{entries.length}개</span></button>
        <div class="picker-list-actions"><button disabled={busy||saving||!libraryReady||!entries.length} onclick={saveList}><Save size={16}/>{saving?'저장 중…':'목록 저장'}</button><button disabled={busy||!libraryReady} onclick={()=>panel='library'}><FolderOpen size={16}/>불러오기</button><button disabled={busy} onclick={()=>ask('새 목록을 만들까요?','현재 적용한 목록 대신 새 목록을 입력해요. 저장하지 않은 목록은 이 화면에서 사라집니다.',()=>{lists={...lists,[source]:makeList(source,[])};editorFor='';void editList();})}><Plus size={16}/>새 목록</button></div>
      {/if}
      </div>
      <div class="picker-rules">
        <div class="picker-rule"><div><strong>바로 결과 보기</strong><ToolkitSwitch label="바로 결과 보기" checked={instant} disabled={busy} onchange={v=>instant=v}/></div><p>{instant?'애니메이션 없이 바로 뽑아요.':'애니메이션과 함께 뽑아요.'}</p></div>
        <div class="picker-rule"><div><strong>한 번씩 골고루</strong><ToolkitSwitch label="뽑힌 대상 제외" checked={repeat} disabled={busy} onchange={v=>repeat=v}/></div><p>{repeat?'중복 없이 한 번씩 뽑아요.':'같은 대상도 다시 뽑아요.'}</p></div>
      </div>
      <div class="picker-pool"><div><span>전체 대상</span><strong>{entries.length}<small>{unit}</small></strong></div><div><span>남은 대상</span><strong>{eligible.length}<small>{unit}</small></strong></div></div>
    </aside>
    <div class="picker-play-area">
    <div class="picker-mode-heading"><h2 class="picker-step-heading"><span>2</span>어떻게 뽑을까요?</h2><div class="picker-play-options"><label class="picker-motion-toggle"><span>동작 감소 모드</span><ToolkitSwitch label="동작 감소 모드" checked={reduced} disabled={busy||saving} onchange={v=>preference('reduced',v)}/></label><button class="picker-sound" aria-label={sound?'효과음 끄기':'효과음 켜기'} disabled={saving} onclick={()=>preference('sound',!sound)}>{#if sound}<Volume2 size={18}/>{:else}<VolumeX size={18}/>{/if}<span>소리 {sound?'켜짐':'꺼짐'}</span></button></div></div>
    <div class="picker-tabs" role="tablist" aria-label="뽑기 모드">{#each MODES as m,i}<button id={`picker-tab-${m.id}`} role="tab" aria-label={m.label} aria-selected={mode===m.id} aria-controls="picker-mode-panel" tabindex={mode===m.id?0:-1} disabled={busy} class:chosen={mode===m.id} onclick={()=>changeMode(m.id)} onkeydown={e=>tabKey(e,i)}><span class={`picker-mode-icon ${m.id}`}>{#if m.id==='classic'}<MousePointer2 size={23}/>{:else if m.id==='claw'}<Hand size={23}/>{:else}<Target size={23}/>{/if}</span><span><strong>{m.label}</strong><small>{m.id==='classic'?'두근두근 이름 카드':m.id==='claw'?'집게로 쏙, 선물처럼':'다트를 던져 팡!'}</small></span>{#if mode===m.id}<Check class="picker-mode-check" size={16}/>{/if}</button>{/each}</div>
    {#if ['male','female'].includes(source)&&classroom?.students.some(s=>s.gender==='unspecified')}<p class="picker-hint">성별 미등록 {classroom.students.filter(s=>s.gender==='unspecified').length}명은 포함되지 않아요. <button onclick={()=>openTool('roster')}>명단 수정</button></p>{/if}
    {#if eligible.length>30&&mode!=='classic'}<p class="picker-hint">무대에는 최대 30개를 표시하며, 남은 {eligible.length}{unit} 모두 같은 확률로 참여해요.</p>{/if}
    {#if rosterError&&!custom}<p class="picker-error" role="alert">{rosterError}<button onclick={refreshRoster}>다시 시도</button></p>{/if}
    {#if error}<p class="picker-error" role="alert">{error}</p>{/if}
    <div id="picker-mode-panel" role="tabpanel" aria-labelledby={`picker-tab-${mode}`} class="picker-mode-panel">
      <div class="picker-stage" class:classic={mode==='classic'} class:dense={mode!=='classic'&&eligible.length>15} class:reduced class:instant={runInstant} class:has-result={!!result&&!session.active} class:ended={!busy&&entries.length>0&&!eligible.length}>
        <div class="picker-stage-top"><span class="picker-stage-label">{mode==='classic'?'두근두근 이름 카드':mode==='claw'?'우리 반 인형뽑기':'알록달록 풍선 다트'}</span><span class="picker-count">남은 {eligible.length}{unit}</span></div>
        {#if mode!=='classic'}<PickerStage {mode} {suspense} {elapsed} {clock} {startedAt} drawing={!!session.active&&!runReduced} {reduced} {seed} design={designs[mode]} {target} count={sceneEntries.length} entries={sceneEntries} visible={sceneVisible} {shuffling} onasseterror={()=>{assetError='인형 이미지를 불러오지 못했어요.';if(session.active)complete(session.active.id);}}/>{:else}<div class="picker-classic-ornament" aria-hidden="true"><span>?</span><span>?</span><span>?</span></div>{/if}
        {#if !session.active && (!entries.length || (!custom&&!classroom))}
          <div class="picker-stage-message" class:over-scene={mode!=='classic'}><span class="picker-empty-icon"><UsersRound size={32}/></span><h2>{custom?'뽑을 목록부터 준비해요':!classroom?'우리 반을 선택해 주세요':'해당하는 학생이 없어요'}</h2><p>{custom?'모둠, 학생 이름, 오늘의 활동까지.':'왼쪽에서 학급을 선택하거나 직접 입력해 보세요.'}<br/>{custom?'한 줄에 하나씩 입력하면 준비 끝!':'명단을 준비하면 즐거운 뽑기가 시작돼요.'}</p><div class="picker-empty-actions"><button class="picker-small-primary" onclick={()=>custom?editList():openTool('roster')}>{custom?'목록 입력하기':'학급 명단 열기'}<ArrowRight size={18}/></button>{#if !custom}<button onclick={()=>{changeSource('custom');void editList();}}>직접 입력하기</button>{/if}</div></div>
        {:else if session.active&&runReduced&&mode!=='classic'}<div class="picker-classic-ready"><Sparkles size={40}/><h2>두근두근, 누구일까요?</h2><p>잠시 후 결과를 보여드려요</p></div>
        {:else if !session.active&&result&&mode!=='classic'}
          {@const winner=result}
          <div class="picker-result" class:over-scene={mode!=='classic'} data-testid="picker-result">
            <span class="picker-result-caption"><Sparkles size={18}/>{custom?'이번에 뽑힌 주인공':'이번에 뽑힌 학생'}</span>
            {#if mode==='claw'&&!assetError}<img class="picker-result-toy" src={resultToySrc} alt=""/>{/if}
            <div class="picker-result-identity"><span class="picker-result-number">{winner.number}{custom?'번째 항목':'번'}</span><strong class:long={winner.name.length>12}>{winner.name}</strong></div>
          </div>
        {:else if mode==='classic'}
          <div class="picker-classic" data-state={cardState}>
            <p class="picker-classic-caption">{#if cardState==='result'}<Sparkles size={18}/>{custom?'이번에 뽑힌 주인공':'이번에 뽑힌 학생'}{:else if cardState==='idle'}오늘의 주인공은 누구?{:else if cardState==='waiting'}잠시 후 결과를 보여 드려요{:else}두근두근… 누가 뽑힐까요?{/if}</p>
            <!-- 넘기는 동안의 이름은 읽어 주지 않습니다. 결과는 아래 알림 영역(picker-sr)이 한 번 읽어 줍니다. -->
            <div class="picker-name-card" data-state={cardState} aria-hidden={cardState!=='result'} data-testid={cardState==='result'?'picker-result':undefined}>
              {#if cardEntry}<span class="picker-name-number">{cardEntry.number}{custom?'번째 항목':'번'}</span><strong use:fitName={cardEntry.name}>{cardEntry.name}</strong>
              {:else}<span class="picker-name-mark">?</span>{/if}
            </div>
          </div>
        {/if}
        {#if mode==='claw'&&(!assetsReady||assetError)}<div class="picker-asset-state"><span>{assetError||'인형을 준비하고 있어요…'}</span>{#if assetError}<button onclick={preload}>다시 시도</button><button onclick={()=>changeMode('classic')}>클래식으로</button>{/if}</div>{/if}
        <div class="picker-stage-footer"><span>{footerText}</span>{#if session.active}<span class="picker-progress"><i style={`width:${Math.min(100,elapsed/duration*100)}%`}></i></span>{/if}</div>
      </div>
      <div class="picker-sequence" aria-label="뽑기 진행 단계">{#each steps as step,i}<span class:current={!!session.active&&!runReduced&&i===stepIndex} class:done={!!session.active&&!runReduced&&i<stepIndex}><i>{i+1}</i>{step}</span>{/each}</div>
      <div class="picker-draw-row"><div class="picker-keyhint"><kbd>Space</kbd> 키로도 뽑을 수 있어요</div>{#if !busy&&entries.length&&!eligible.length}<button class="picker-draw" onclick={()=>history.length?reset():panel='targets'}><RotateCcw size={22}/>{history.length?'다시 시작하기':'제외한 대상 확인'}</button>{:else}<button class="picker-draw" disabled={!canDraw} onclick={draw}>{#if session.active}<span class="picker-spinner"></span>뽑는 중…{:else}<ArrowRight size={22}/>{result?'다음 뽑기':'뽑기 시작'}{/if}</button>{/if}{#if mode!=='classic'}<button class="picker-shuffle" disabled={busy||!entries.length||mode==='claw'&&!assetsReady} onclick={shuffleScene}><Shuffle size={18}/>{shuffling?'섞는 중':'다시 섞기'}</button>{/if}</div>
    </div>
    <section class="picker-history"><div class="picker-history-heading"><button onclick={()=>allHistory=!allHistory} aria-expanded={allHistory}>최근 결과 <span>{history.length}</span><ChevronDown size={17}/></button><button class="picker-undo" disabled={busy||!history.length} onclick={()=>session=updateBucket(session,sourceKey,'undo')}><Undo2 size={17}/>직전 뽑기 취소</button></div><div class="picker-history-items" class:expanded={allHistory}>{#each (allHistory?history:history.slice(-5)).toReversed() as r}<span><small>{r.winner.number}{custom?'':'번'}</small>{r.winner.name}</span>{/each}{#if !history.length}<p>뽑힌 이름이 여기에 차곡차곡 모여요.</p>{/if}</div></section>
    </div>
    </div>
    {#if notice}<p class="picker-notice" role="status">{notice}</p>{/if}
    {#if storageError}<p class="picker-error" role="alert">{storageError}<button onclick={loadLibrary}>저장 자료 다시 읽기</button></p>{/if}
    <div class="picker-sr" aria-live="polite" aria-atomic="true">{!session.active&&result?`${result.number}${custom?'번째 항목':'번'} ${result.name}, 남은 ${eligible.length}${unit}`:''}</div>
  </main>
  {#if celebration}<PickerCelebration winner={celebration} {mode} {custom} reduced={reduced||runInstant} toy={assetError?'':resultToySrc} onclose={()=>{celebration=null;void tick().then(()=>document.querySelector<HTMLButtonElement>('.picker-draw')?.focus({preventScroll:true}));}}/>{/if}
  <dialog class="picker-dialog picker-utility" bind:this={utilityDialog} onclose={()=>panel=''} oncancel={()=>panel=''} aria-labelledby="picker-utility-title">
    <header><div><small>간단 뽑기</small><h2 id="picker-utility-title">{panel==='settings'?'뽑기 설정':panel==='targets'?'대상 관리':'저장한 목록'}</h2></div><button aria-label="관리 창 닫기" onclick={()=>panel=''}><X size={22}/></button></header>
    {#if panel==='settings'}<section class="picker-panel" aria-label="뽑기 설정"><div class="picker-settings-row"><div><strong>효과음</strong><small>움직임과 결과를 소리로 알려요</small></div><ToolkitSwitch label="효과음" checked={sound} disabled={saving} onchange={v=>preference('sound',v)}/></div><div class="picker-settings-row"><div><strong>동작 감소 모드</strong><small>{reduced?'움직임 없이 잠시 기다린 뒤 결과를 보여줘요.':'집게 이동과 다트 비행을 처음부터 끝까지 보여줘요.'}</small></div><ToolkitSwitch label="동작 감소 모드" checked={reduced} disabled={busy||saving} onchange={v=>preference('reduced',v)}/></div>
      {#if mode!=='classic'}<div class="picker-design-heading"><strong>디자인</strong><span>모양이 달라도 뽑힐 확률은 같아요</span></div><div class="picker-design-grid"><button class:selected={designs[mode]==='mixed'} disabled={busy} onclick={()=>designs={...designs,[mode]:'mixed'}}><span class="picker-mixed-icon" aria-hidden="true">✳</span>다양하게</button>{#each mode==='claw'?TOYS:BALLOONS as d}<button class:selected={designs[mode]===d.id} disabled={busy} onclick={()=>designs={...designs,[mode]:d.id}}>{#if mode==='claw'}<img src={TOYS.find(t=>t.id===d.id)?.src} alt=""/>{:else}<svg viewBox="-65 -70 130 140" aria-hidden="true"><path d={BALLOONS.find(t=>t.id===d.id)?.path} fill="#b9d3c8"/></svg>{/if}{d.label}</button>{/each}</div>{/if}
      <div class="picker-palette-row"><strong>무대 색</strong>{#each PALETTES as p}<button aria-pressed={palette===p.id} class:selected={palette===p.id} disabled={busy} onclick={()=>palette=p.id}><i style={`background:${p.bg};border-color:${p.accent}`}></i>{p.label}</button>{/each}</div>
    </section>{/if}
    {#if panel==='targets'}<section class="picker-panel" aria-label="대상 관리"><div class="picker-panel-heading"><div><strong>이번 뽑기 대상</strong><small>원본 명단은 바뀌지 않아요</small></div><button onclick={()=>session=updateBucket(session,sourceKey,'restoreAll')}>일시 제외 해제</button></div><input aria-label="대상 검색" placeholder="번호 또는 이름 검색" bind:value={search}/><div class="picker-target-list">{#each visibleEntries as entry}<label><input type="checkbox" checked={!sourceState.excluded.includes(entry.id)} onchange={()=>session=updateBucket(session,sourceKey,'exclude',entry.id)}/><span class="picker-entry-number">{entry.number}</span><span>{entry.name}</span><small>{sourceState.excluded.includes(entry.id)?'일시 제외':sourceState.history.some(r=>r.winner.id===entry.id)?'뽑힌 대상':''}</small></label>{/each}{#if !visibleEntries.length}<p class="picker-hint">표시할 대상이 없어요.</p>{/if}</div></section>{/if}
    {#if panel==='library'}<section class="picker-panel" aria-label="저장 목록"><div class="picker-panel-heading"><strong>저장한 {source==='groups'?'모둠':'직접 입력'} 목록</strong><button onclick={loadLibrary}>새로고침</button></div>{#each library.lists.filter((l:List)=>l.kind===source) as list}<div class="picker-library-row"><button onclick={()=>loadList(list.id)}><FolderOpen size={15}/>{list.name}<small>{list.entries.length}개</small></button><button aria-label={`${list.name} 저장본 삭제`} onclick={()=>ask('저장본을 삭제할까요?','현재 사용 중인 목록은 창을 닫을 때까지 유지돼요.',()=>void persist({...library,lists:library.lists.filter((l:List)=>l.id!==list.id)}))}><Trash2 size={15}/></button></div>{/each}{#if !library.lists.some((l:List)=>l.kind===source)}<p class="picker-hint">저장한 목록이 없어요.</p>{/if}</section>{/if}
    <footer><button class="picker-small-primary" onclick={()=>panel=''}>완료</button></footer>
  </dialog>
  <dialog class="picker-dialog" bind:this={editor} aria-label="뽑을 목록을 준비해요"><header><div><small>{editorKind==='groups'?'모둠 선출':'직접 명단 등록'}</small><h2>뽑을 목록을 준비해요</h2></div><button aria-label="목록 편집 닫기" onclick={()=>editor.close()}><X size={20}/></button></header><label class="picker-field">목록 이름<input aria-label="목록 이름" maxlength="80" bind:value={editorName}/></label>
    {#if editorStep==='input'}<label class="picker-field">한 줄에 하나씩 입력<textarea aria-label="뽑기 목록 입력" bind:value={editorText} placeholder={editorKind==='groups'?'1모둠\n2모둠\n3모둠':'이름이나 활동을 한 줄에 하나씩 입력해 주세요'} rows="8"></textarea></label><p class="picker-hint">최대 500개 · 각 항목 40자</p><footer><button onclick={()=>editor.close()}>나중에</button><button class="picker-small-primary" onclick={previewList}>목록 확인</button></footer>
    {:else}<div class="picker-editor-count"><strong>{editorRows.length}개 항목</strong><button onclick={()=>{editorStep='input';editorText=editorRows.map(e=>e.name).join('\n');}}>전체 새로 입력</button></div><div class="picker-editor-rows">{#each editorRows as row,i}<div><span>{i+1}</span><input aria-label={`${i+1}번째 항목`} value={row.name} oninput={e=>{editorRows=editorRows.map((r,j)=>j===i?{...r,name:e.currentTarget.value}:r);duplicateOK=false;}}/><button aria-label={`${i+1}번째 항목 삭제`} onclick={()=>editorRows=editorRows.filter((_,j)=>j!==i)}><X size={15}/></button></div>{/each}</div><button class="picker-add-entry" onclick={()=>editorRows=[...editorRows,{id:crypto.randomUUID(),name:'',number:Math.max(0,...editorRows.map(e=>e.number??0))+1}]} disabled={editorRows.length>=500}><Plus size={14}/>항목 추가</button>{#if duplicates.length}<label class="picker-duplicate"><input type="checkbox" bind:checked={duplicateOK}/>같은 이름을 별개 항목으로 유지합니다. 입력한 개수만큼 뽑힐 확률이 늘어나요.</label>{/if}<footer><button onclick={()=>editor.close()}>나중에</button><button class="picker-small-primary" onclick={applyList}>이 목록으로 뽑기</button></footer>{/if}
    {#if editorError}<p class="picker-error" role="alert">{editorError}</p>{/if}
  </dialog>
  <dialog class="picker-dialog picker-confirm" bind:this={confirmDialog} aria-label={confirmTitle}><h2>{confirmTitle}</h2><p>{confirmCopy}</p><footer><button onclick={()=>confirmDialog.close()}>취소</button><button class="picker-small-primary" onclick={()=>{confirmDialog.close();confirmAction();}}>확인</button></footer></dialog>
  {#if native}{#each ['NorthWest','NorthEast','SouthWest','SouthEast'] as direction}<div class={`picker-resize picker-resize-${direction}`} role="presentation" onpointerdown={()=>void getCurrentWindow().startResizeDragging(direction as any)}></div>{/each}{/if}
</section>
