<script lang="ts">
  import {onMount,tick} from 'svelte';
  import {X,Pin,Maximize2,Minimize2,Shuffle,RotateCcw,Undo2,SlidersHorizontal,UsersRound,Plus,Check,ChevronDown,Volume2,VolumeX,MousePointer2,Hand,Target,Pencil,FolderOpen,Save,Trash2,Minus} from 'lucide-svelte';
  import {getCurrentWindow} from '@tauri-apps/api/window';
  import {native} from '../../lib/toolkit/store.js';
  import {openTool,closeWindow} from '../../lib/toolkit/windows.js';
  import {dragRegion} from '../../lib/dragRegion.js';
  import {readRoster,subscribeRoster} from '../../lib/classroom/repository.js';
  import {captureCandidates} from '../../lib/classroom/context.js';
  import {SOURCES,MODES,DURATION,createSession,bucket,candidates,filterEntries,beginDraw,finishDraw,updateBucket,parseList,makeList} from '../../lib/picker/engine.js';
  import {TOYS,BALLOONS,PALETTES} from '../../lib/picker/designs.js';
  import {emptyLibrary,readLibrary,writeLibrary} from '../../lib/picker/storage.js';
  import {createPickerAudio} from '../../lib/picker/audio.js';
  import ToolkitSwitch from '../toolkit/ToolkitSwitch.svelte';
  import PickerStage from './PickerStage.svelte';
  import './picker.css';
  type Entry=import('../../lib/picker/engine.js').Entry;
  type List={id:string;name:string;kind:string;entries:Entry[]};
  let mode=$state('classic'),source=$state('all'),classId=$state<string|null>(null),initialized=false;
  let roster=$state<Awaited<ReturnType<typeof readRoster>>>({classes:[],revision:0,defaultClassId:null});
  let rosterReady=$state(false),rosterError=$state(''),error=$state(''),notice=$state('');
  let session=$state(createSession()),repeat=$state(true);
  let lists=$state<Record<string,List>>({groups:makeList('groups',[]),custom:makeList('custom',[])});
  let library=$state<any>(emptyLibrary()),libraryReady=$state(false),saving=$state(false),storageError=$state('');
  let sound=$state(true),reduce=$state(false),osReduced=$state(false),pinned=$state(false),expanded=$state(false);
  let panel=$state(''),search=$state(''),allHistory=$state(false),palette=$state('sage');
  let designs=$state<Record<string,string>>({claw:'mixed',balloon:'mixed'}),seed=$state(0),target=$state(0);
  let runCount=$state(0),resultToySrc=$state(TOYS[0].src);
  let elapsed=$state(0),clock=$state(0),startedAt=$state(0),shuffling=$state(false),assetsReady=$state(false),assetError=$state('');
  let disposed=false,raf=0,watchdog:ReturnType<typeof setTimeout>,shuffleTimer:ReturnType<typeof setTimeout>,offRoster=()=>{};
  const audio=createPickerAudio();
  let cues=new Set<string>();
  let editor:HTMLDialogElement,confirmDialog:HTMLDialogElement;
  let editorFor=$state(''),editorKind=$state('custom'),editorName=$state(''),editorText=$state(''),editorRows=$state<Entry[]>([]),editorStep=$state('input'),editorError=$state(''),duplicateOK=$state(false);
  let confirmTitle=$state(''),confirmCopy=$state(''),confirmAction:()=>void=()=>{};
  const classroom=$derived(roster.classes.find(c=>c.id===classId)??null);
  const custom=$derived(source==='groups'||source==='custom');
  const currentList=$derived(lists[source]);
  const sourceKey=$derived(custom?`list:${currentList.id}`:`class:${classId??'none'}`);
  const entries=$derived<Entry[]>(custom?currentList.entries:filterEntries(classroom?.students??[],source));
  const sourceState=$derived(bucket(session,sourceKey));
  const eligible=$derived(candidates(entries,sourceState,repeat));
  const busy=$derived(!!session.active||shuffling);
  const reduced=$derived(reduce||osReduced);
  const history=$derived(sourceState.history);
  const result=$derived(history.at(-1)?.winner??null);
  const title=$derived(custom?currentList.name:classroom?.name??'학급을 선택해 주세요');
  const unit=$derived(custom?'개':'명');
  const art=$derived(PALETTES.find(p=>p.id===palette)??PALETTES[0]);
  const canDraw=$derived(!busy&&eligible.length>0&&(custom||rosterReady&&!rosterError&&!!classroom)&&(mode!=='claw'||assetsReady&&!assetError));
  const visibleEntries=$derived(entries.filter(e=>`${e.number??''} ${e.name}`.includes(search.trim())));
  const duplicates=$derived(editorRows.filter((e,i,a)=>a.findIndex(x=>x.name.trim()===e.name.trim())!==i).map(e=>e.name));
  const reveal=$derived(session.active&&mode==='balloon'&&elapsed>=2300?session.active.winner:null);
  const phase=$derived(mode==='claw'?(elapsed<1600?'집게가 내려오고 있어요':elapsed<3000?'인형을 집어 올리는 중': '이름을 확인해 볼까요'):mode==='balloon'?(elapsed<900?'풍선이 모이고 있어요':elapsed<1700?'다트가 날아가요':'이름을 확인해 볼까요'):'뽑는 중');
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
  async function preference(key:'sound'|'reduced',value:boolean){if(key==='sound'){sound=value;audio.setEnabled(value);}else reduce=value;
    if(libraryReady)await persist({...library,preferences:{...library.preferences,[key]:value}});
  }
  async function preload(){assetError='';assetsReady=false;try{await Promise.all(TOYS.map(t=>new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>img.decode().then(()=>resolve()).catch(reject);img.onerror=reject;img.src=t.src;})));if(!disposed)assetsReady=true;}catch{if(!disposed)assetError='인형 이미지를 불러오지 못했어요.';}}
  $effect(()=>{if(mode==='claw'&&!assetsReady&&!assetError)void preload();});
  $effect(()=>{if(reduced&&session.active)complete(session.active.id);});
  function complete(id:string){if(disposed||session.active?.id!==id)return;session=finishDraw(session,id);elapsed=0;clearTimeout(watchdog);if(!document.hidden)audio.play('result');}
  async function draw(){
    if(!canDraw)return;
    error='';notice='';
    try{
      // Commit the outcome synchronously before audio or any awaited work.
      session=beginDraw(session,sourceKey,custom?entries:filterEntries(captureCandidates(classroom!).students,source),mode,roster.revision,repeat);
      runCount=Math.min(30,eligible.length);
      target=(seed*3+history.length)% Math.max(1,runCount);
      if(mode==='claw')resultToySrc=TOYS[designs.claw==='mixed'?(target+seed)%6:Math.max(0,TOYS.findIndex(t=>t.id===designs.claw))].src;
      startedAt=session.active!.startedAt;clock=startedAt;elapsed=0;cues=new Set();
      const id=session.active!.id;
      await audio.unlock();
      if(disposed||session.active?.id!==id)return;
      if(reduced){watchdog=setTimeout(()=>complete(id),180);return;}
      audio.play('move');watchdog=setTimeout(()=>complete(id),DURATION[mode as keyof typeof DURATION]+150);
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
    if(e.repeat&&['Space','Enter'].includes(e.code)&&e.target instanceof Element&&e.target.closest('.picker-draw')){e.preventDefault();return;}
    if(e.key==='Escape'&&!editor?.open&&!confirmDialog?.open){if(panel){panel='';e.preventDefault();}else if(expanded){void fullscreen();e.preventDefault();}}
    if(e.code!=='Space'||e.repeat||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||editor?.open||confirmDialog?.open|| (e.target instanceof Element&&e.target.closest('button,input,textarea,select,[contenteditable="true"],[role="switch"]')))return;
    e.preventDefault();void draw();
  }
  function tabKey(e:KeyboardEvent,index:number){if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)&&!busy){e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowRight'?1:2))%3;changeMode(MODES[i].id);document.getElementById(`picker-tab-${MODES[i].id}`)?.focus();}}
  onMount(()=>{
    const mq=matchMedia('(prefers-reduced-motion: reduce)');osReduced=mq.matches;
    const media=()=>{osReduced=mq.matches;};mq.addEventListener('change',media);
    const visibility=()=>{if(document.hidden)audio.stop();else{void refreshRoster();if(session.active&&performance.now()-startedAt>=DURATION[mode as keyof typeof DURATION])complete(session.active.id);}};
    const focus=()=>void refreshRoster();
    const frame=(now:number)=>{if(disposed)return;if(!document.hidden){clock=now;if(session.active&&!reduced){elapsed=now-startedAt;
      const cue=mode==='claw'?(elapsed>=1900?'grip':''):mode==='balloon'?(elapsed>=1700?'pop':''):'';
      if(cue&&!cues.has(cue)){cues.add(cue);audio.play(cue as 'grip'|'pop');}
      if(elapsed>=DURATION[mode as keyof typeof DURATION])complete(session.active.id);
    }}raf=requestAnimationFrame(frame);};
    raf=requestAnimationFrame(frame);document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',focus);
    void (async()=>{try{const off=await subscribeRoster(()=>void refreshRoster());if(disposed){off();return;}offRoster=off;await refreshRoster();}catch{rosterError='학급 명단 연결을 확인해 주세요.';}})();
    void loadLibrary();
    return()=>{disposed=true;cancelAnimationFrame(raf);clearTimeout(watchdog);clearTimeout(shuffleTimer);offRoster();audio.dispose();mq.removeEventListener('change',media);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);};
  });
</script>

<svelte:window onkeydown={keys}/>
<section class="picker-app" style={`--picker-tint:${art.bg};--picker-accent:${art.accent};--picker-machine:${palette==='butter'?'#ead9b2':palette==='sky'?'#c9dce8':'#d0e1d4'}`}>
  <header class="picker-titlebar" use:draggable>
    <span class="picker-brand"><span class="picker-brand-dot"></span>간단 뽑기</span>
    <div class="picker-window-actions"><button aria-label="항상 위" aria-pressed={pinned} class:active={pinned} onclick={pin}><Pin size={16}/></button><button aria-label="최소화" onclick={minimize}><Minus size={17}/></button><button aria-label={expanded?'전체화면 해제':'전체화면'} onclick={fullscreen}>{#if expanded}<Minimize2 size={17}/>{:else}<Maximize2 size={17}/>{/if}</button><button aria-label="닫기" onclick={close}><X size={18}/></button></div>
  </header>
  <main class="picker-main">
    <div class="picker-topline"><div><p class="picker-kicker">CLASSROOM PICKER</p><h1>이번엔 누구일까요?</h1></div><button class="picker-quiet" aria-label={sound?'효과음 끄기':'효과음 켜기'} disabled={saving} onclick={()=>preference('sound',!sound)}>{#if sound}<Volume2 size={19}/>{:else}<VolumeX size={19}/>{/if}</button></div>
    <div class="picker-tabs" role="tablist" aria-label="뽑기 모드">{#each MODES as m,i}<button id={`picker-tab-${m.id}`} role="tab" aria-selected={mode===m.id} aria-controls="picker-mode-panel" tabindex={mode===m.id?0:-1} disabled={busy} class:chosen={mode===m.id} onclick={()=>changeMode(m.id)} onkeydown={e=>tabKey(e,i)}>{#if m.id==='classic'}<MousePointer2 size={17}/>{:else if m.id==='claw'}<Hand size={18}/>{:else}<Target size={18}/>{/if}{m.label}</button>{/each}</div>
    <div class="picker-sourcebar">
      <div class="picker-selects"><label><span class="picker-sr">뽑기 대상</span><select aria-label="뽑기 대상" value={source} disabled={busy} onchange={e=>changeSource(e.currentTarget.value)}>{#each SOURCES as s}<option value={s.value}>{s.label}</option>{/each}</select></label>
      {#if !custom}<select aria-label="학급 선택" value={classId??''} disabled={busy} onchange={e=>{classId=e.currentTarget.value||null;notice='';}}><option value="">학급 선택</option>{#each roster.classes as c}<option value={c.id}>{c.name}</option>{/each}</select>{:else}<button class="picker-list-title" disabled={busy} onclick={editList}>{currentList.name}<Pencil size={14}/></button>{/if}</div>
      <span class="picker-count">대상 {entries.length}{unit}<i></i><strong>남은 {eligible.length}{unit}</strong></span>
    </div>
    {#if custom}<div class="picker-list-actions"><button disabled={busy} onclick={editList}><Pencil size={13}/>목록 편집</button><button disabled={busy||saving||!libraryReady||!entries.length} onclick={saveList}><Save size={13}/>{saving?'저장 중…':'목록 저장'}</button><button disabled={busy||!libraryReady} onclick={()=>panel=panel==='library'?'':'library'}><FolderOpen size={13}/>불러오기</button><button disabled={busy} onclick={()=>ask('새 목록을 만들까요?','현재 적용한 목록 대신 새 목록을 입력해요. 저장하지 않은 목록은 이 화면에서 사라집니다.',()=>{lists={...lists,[source]:makeList(source,[])};editorFor='';void editList();})}><Plus size={13}/>새 목록</button></div>{/if}
    {#if ['male','female'].includes(source)&&classroom?.students.some(s=>s.gender==='unspecified')}<p class="picker-hint">성별 미등록 {classroom.students.filter(s=>s.gender==='unspecified').length}명은 포함되지 않아요. <button onclick={()=>openTool('roster')}>명단 수정</button></p>{/if}
    {#if eligible.length>30&&mode!=='classic'}<p class="picker-hint">무대에는 최대 30개를 표시하며, 남은 {eligible.length}{unit} 모두 같은 확률로 참여해요.</p>{/if}
    {#if rosterError&&!custom}<p class="picker-error" role="alert">{rosterError}<button onclick={refreshRoster}>다시 시도</button></p>{/if}
    {#if error}<p class="picker-error" role="alert">{error}</p>{/if}
    <div id="picker-mode-panel" role="tabpanel" aria-labelledby={`picker-tab-${mode}`} class="picker-mode-panel">
      <div class="picker-stage" class:classic={mode==='classic'} class:dense={mode!=='classic'&&eligible.length>15} class:reduced>
        <span class="picker-stage-label">{mode==='classic'?'CLASSIC':mode==='claw'?'TOY ROOM':'BALLOON GARDEN'}</span>
        {#if mode!=='classic'}<PickerStage {mode} {elapsed} {clock} {startedAt} drawing={!!session.active&&!reduced} {reduced} {seed} design={designs[mode]} {target} count={session.active?runCount:Math.min(30,eligible.length)} {shuffling} onasseterror={()=>{assetError='인형 이미지를 불러오지 못했어요.';if(session.active)complete(session.active.id);}}/>{:else}<div class="picker-classic-ornament" aria-hidden="true"><span></span><span></span><span></span></div>{/if}
        {#if !session.active && (!entries.length || (!custom&&!classroom))}
          <div class="picker-stage-message" class:over-scene={mode!=='classic'}><UsersRound size={28}/><h2>{custom?'목록을 입력해 주세요':!classroom?'학급 명단을 연결해 주세요':'해당하는 학생이 없어요'}</h2><p>{custom?'모둠이나 항목을 한 줄에 하나씩 넣어 주세요.':'등록한 명단에서 뽑거나 직접 목록을 입력할 수 있어요.'}</p><button class="picker-small-primary" onclick={()=>custom?editList():openTool('roster')}>{custom?'목록 입력':'학급 명단 열기'}</button></div>
        {:else if (!session.active&&result)||reveal}
          {@const winner=reveal??result!}
          <div class="picker-result" class:over-scene={mode!=='classic'} class:revealing={!!reveal} data-testid="picker-result">
            <span class="picker-result-caption">{custom?'이번에 뽑힌 항목':'이번에 뽑힌 학생'}</span>
            {#if mode==='claw'&&!assetError}<img class="picker-result-toy" src={resultToySrc} alt=""/>{/if}
            <span class="picker-result-number">{winner.number}{custom?'번째 항목':'번'}</span><strong class:long={winner.name.length>12}>{winner.name}</strong>
          </div>
        {:else if mode==='classic'}<div class="picker-classic-ready" class:selecting={!!session.active}><span class="picker-number-mark">?</span><h2>{session.active?'잠깐만요':'이름을 뽑아 볼까요?'}</h2><p>버튼을 누르거나 스페이스를 눌러 주세요</p></div>{/if}
        {#if mode==='claw'&&(!assetsReady||assetError)}<div class="picker-asset-state"><span>{assetError||'인형을 준비하고 있어요…'}</span>{#if assetError}<button onclick={preload}>다시 시도</button><button onclick={()=>changeMode('classic')}>클래식으로</button>{/if}</div>{/if}
        <div class="picker-stage-footer"><span>{session.active?phase:shuffling?'골고루 섞고 있어요':!eligible.length&&entries.length?'모두 뽑았거나 제외된 상태예요':mode==='classic'?'빠르게, 한 명씩':mode==='claw'?'인형을 집어 이름을 확인해요':'다트가 닿으면 이름이 나타나요'}</span>{#if session.active}<span class="picker-progress"><i style={`width:${Math.min(100,elapsed/DURATION[mode as keyof typeof DURATION]*100)}%`}></i></span>{/if}</div>
      </div>
      <div class="picker-draw-row"><span class="picker-keyhint">{mode==='classic'?'SPACE로 다음 뽑기':'버튼 한 번으로 자동 뽑기'}</span><button class="picker-draw" disabled={!canDraw} onclick={draw}>{#if session.active}<span class="picker-spinner"></span>뽑는 중…{:else if result}다음 뽑기{:else}뽑기{/if}<span aria-hidden="true">↗</span></button>{#if mode!=='classic'}<button class="picker-shuffle" disabled={busy||!entries.length||mode==='claw'&&!assetsReady} onclick={shuffleScene}><Shuffle size={16}/>섞기</button>{:else}<span></span>{/if}</div>
    </div>
    <div class="picker-controls"><label class="picker-repeat"><ToolkitSwitch label="뽑힌 대상 제외" checked={repeat} disabled={busy} onchange={v=>repeat=v}/><span>뽑힌 대상 제외</span></label><div><button class:active={panel==='targets'} disabled={busy} onclick={()=>{panel=panel==='targets'?'':'targets';search='';}}><UsersRound size={16}/>대상 관리</button><button class:active={panel==='settings'} onclick={()=>panel=panel==='settings'?'':'settings'}><SlidersHorizontal size={16}/>설정</button></div></div>
    {#if panel==='settings'}<section class="picker-panel" aria-label="뽑기 설정"><div class="picker-settings-row"><div><strong>효과음</strong><small>움직임과 결과를 소리로 알려요</small></div><ToolkitSwitch label="효과음" checked={sound} disabled={saving} onchange={v=>preference('sound',v)}/></div><div class="picker-settings-row"><div><strong>연출 줄이기</strong><small>{osReduced?'컴퓨터의 동작 줄이기가 적용 중이에요':'움직임을 줄이고 결과를 바로 보여줘요'}</small></div><ToolkitSwitch label="연출 줄이기" checked={reduced} disabled={saving||osReduced} onchange={v=>preference('reduced',v)}/></div>
      {#if mode!=='classic'}<div class="picker-design-heading"><strong>디자인</strong><span>모양이 달라도 뽑힐 확률은 같아요</span></div><div class="picker-design-grid"><button class:selected={designs[mode]==='mixed'} disabled={busy} onclick={()=>designs={...designs,[mode]:'mixed'}}><span class="picker-mixed-icon" aria-hidden="true">✳</span>다양하게</button>{#each mode==='claw'?TOYS:BALLOONS as d}<button class:selected={designs[mode]===d.id} disabled={busy} onclick={()=>designs={...designs,[mode]:d.id}}>{#if mode==='claw'}<img src={TOYS.find(t=>t.id===d.id)?.src} alt=""/>{:else}<svg viewBox="-65 -70 130 140" aria-hidden="true"><path d={BALLOONS.find(t=>t.id===d.id)?.path} fill="#b9d3c8"/></svg>{/if}{d.label}</button>{/each}</div>{/if}
      <div class="picker-palette-row"><strong>무대 색</strong>{#each PALETTES as p}<button aria-pressed={palette===p.id} class:selected={palette===p.id} disabled={busy} onclick={()=>palette=p.id}><i style={`background:${p.bg};border-color:${p.accent}`}></i>{p.label}</button>{/each}</div>
    </section>{/if}
    {#if panel==='targets'}<section class="picker-panel" aria-label="대상 관리"><div class="picker-panel-heading"><div><strong>이번 뽑기 대상</strong><small>원본 명단은 바뀌지 않아요</small></div><button onclick={()=>session=updateBucket(session,sourceKey,'restoreAll')}>일시 제외 해제</button></div><input aria-label="대상 검색" placeholder="번호 또는 이름 검색" bind:value={search}/><div class="picker-target-list">{#each visibleEntries as entry}<label><input type="checkbox" checked={!sourceState.excluded.includes(entry.id)} onchange={()=>session=updateBucket(session,sourceKey,'exclude',entry.id)}/><span class="picker-entry-number">{entry.number}</span><span>{entry.name}</span><small>{sourceState.excluded.includes(entry.id)?'일시 제외':sourceState.history.some(r=>r.winner.id===entry.id)?'뽑힌 대상':''}</small></label>{/each}{#if !visibleEntries.length}<p class="picker-hint">표시할 대상이 없어요.</p>{/if}</div></section>{/if}
    {#if panel==='library'}<section class="picker-panel" aria-label="저장 목록"><div class="picker-panel-heading"><strong>저장한 {source==='groups'?'모둠':'직접 입력'} 목록</strong><button onclick={loadLibrary}>새로고침</button></div>{#each library.lists.filter((l:List)=>l.kind===source) as list}<div class="picker-library-row"><button onclick={()=>loadList(list.id)}><FolderOpen size={15}/>{list.name}<small>{list.entries.length}개</small></button><button aria-label={`${list.name} 저장본 삭제`} onclick={()=>ask('저장본을 삭제할까요?','현재 사용 중인 목록은 창을 닫을 때까지 유지돼요.',()=>void persist({...library,lists:library.lists.filter((l:List)=>l.id!==list.id)}))}><Trash2 size={15}/></button></div>{/each}{#if !library.lists.some((l:List)=>l.kind===source)}<p class="picker-hint">저장한 목록이 없어요.</p>{/if}</section>{/if}
    <section class="picker-history"><div class="picker-history-heading"><button onclick={()=>allHistory=!allHistory} aria-expanded={allHistory}>최근 결과 <span>{history.length}</span><ChevronDown size={14}/></button><div><button disabled={busy||!history.length} onclick={()=>session=updateBucket(session,sourceKey,'undo')}><Undo2 size={14}/>직전 뽑기 취소</button><button disabled={busy||!history.length} onclick={reset}><RotateCcw size={14}/>다시 시작</button></div></div><div class="picker-history-items" class:expanded={allHistory}>{#each (allHistory?history:history.slice(-5)).toReversed() as r}<span><small>{r.winner.number}{custom?'':'번'}</small>{r.winner.name}</span>{/each}{#if !history.length}<p>뽑은 결과가 여기에 모여요.</p>{/if}</div></section>
    {#if notice}<p class="picker-notice" role="status">{notice}</p>{/if}
    {#if storageError}<p class="picker-error" role="alert">{storageError}<button onclick={loadLibrary}>저장 자료 다시 읽기</button></p>{/if}
    <div class="picker-sr" aria-live="polite" aria-atomic="true">{!session.active&&result?`${result.number}${custom?'번째 항목':'번'} ${result.name}, 남은 ${eligible.length}${unit}`:''}</div>
  </main>
  <dialog class="picker-dialog" bind:this={editor} oncancel={()=>{}}><header><div><small>{editorKind==='groups'?'모둠 선출':'직접 명단 등록'}</small><h2>뽑을 목록을 준비해요</h2></div><button aria-label="목록 편집 닫기" onclick={()=>editor.close()}><X size={20}/></button></header><label class="picker-field">목록 이름<input aria-label="목록 이름" maxlength="80" bind:value={editorName}/></label>
    {#if editorStep==='input'}<label class="picker-field">한 줄에 하나씩 입력<textarea aria-label="뽑기 목록 입력" bind:value={editorText} placeholder={editorKind==='groups'?'1모둠\n2모둠\n3모둠':'이름이나 활동을 한 줄에 하나씩 입력해 주세요'} rows="8"></textarea></label><p class="picker-hint">최대 500개 · 각 항목 40자</p><footer><button onclick={()=>editor.close()}>나중에</button><button class="picker-small-primary" onclick={previewList}>목록 확인</button></footer>
    {:else}<div class="picker-editor-count"><strong>{editorRows.length}개 항목</strong><button onclick={()=>{editorStep='input';editorText=editorRows.map(e=>e.name).join('\n');}}>전체 새로 입력</button></div><div class="picker-editor-rows">{#each editorRows as row,i}<div><span>{i+1}</span><input aria-label={`${i+1}번째 항목`} value={row.name} oninput={e=>{editorRows=editorRows.map((r,j)=>j===i?{...r,name:e.currentTarget.value}:r);duplicateOK=false;}}/><button aria-label={`${i+1}번째 항목 삭제`} onclick={()=>editorRows=editorRows.filter((_,j)=>j!==i)}><X size={15}/></button></div>{/each}</div><button class="picker-add-entry" onclick={()=>editorRows=[...editorRows,{id:crypto.randomUUID(),name:'',number:Math.max(0,...editorRows.map(e=>e.number??0))+1}]} disabled={editorRows.length>=500}><Plus size={14}/>항목 추가</button>{#if duplicates.length}<label class="picker-duplicate"><input type="checkbox" bind:checked={duplicateOK}/>같은 이름을 별개 항목으로 유지합니다. 입력한 개수만큼 뽑힐 확률이 늘어나요.</label>{/if}<footer><button onclick={()=>editor.close()}>나중에</button><button class="picker-small-primary" onclick={applyList}>이 목록으로 뽑기</button></footer>{/if}
    {#if editorError}<p class="picker-error" role="alert">{editorError}</p>{/if}
  </dialog>
  <dialog class="picker-dialog picker-confirm" bind:this={confirmDialog}><h2>{confirmTitle}</h2><p>{confirmCopy}</p><footer><button onclick={()=>confirmDialog.close()}>취소</button><button class="picker-small-primary" onclick={()=>{confirmDialog.close();confirmAction();}}>확인</button></footer></dialog>
  {#if native}{#each ['NorthWest','NorthEast','SouthWest','SouthEast'] as direction}<div class={`picker-resize picker-resize-${direction}`} role="presentation" onpointerdown={()=>void getCurrentWindow().startResizeDragging(direction as any)}></div>{/each}{/if}
</section>
