<script lang="ts">
  import { onDestroy } from 'svelte';
  import { normalizeSpeechContent } from '../../../lib/vote/speech/normalize.js';
  let { session, prefs, speech, onprefs, oncontent } = $props<{session:any;prefs:any;speech:any;onprefs:(p:any)=>void;oncontent:(p:any)=>void}>();
  const content = $derived(normalizeSpeechContent(session.speechContent, session));
  let busy = $state(false), message = $state(''), ready = $state(false), ticket = 0;
  const voice = $derived(prefs.speechVoice ?? 'female');
  const speed = $derived(session.tutorial.speed);
  $effect(() => {
    const config = session, v = voice, s = speed;
    JSON.stringify(content);
    const mine = ++ticket;
    ready = false;
    message = '';
    speech.local.cancel();
    void speech.local.ready(config, v, s).then((ok:boolean) => { if (mine === ticket) ready = ok; });
  });
  function change(p:any) { speech.cancel(); speech.local.cancel(); message = ''; oncontent({ ...content, ...p }); }
  async function prepare() {
    busy = true; message = '음성을 준비하고 있어요.';
    const mine = ticket;
    try {
      await speech.local.prepare(session, voice, speed, (text:string) => { if (mine === ticket) message = text; });
      if (mine === ticket) { ready = true; message = '준비됐어요. 소개 들어 보기로 발음을 확인해 주세요.'; }
    } catch (e) { message = e instanceof Error ? e.message : '준비하지 못했어요. 기본 안내를 사용할 수 있어요.'; }
    finally { busy = false; }
  }
  async function preview(id:string) {
    message = '재생 중이에요.';
    speech.configure(prefs); speech.setSpeed(speed);
    const result = await speech.speakSlide(session, id);
    if (result === 'completed') message = '재생을 마쳤어요. 발음과 소리 크기를 확인해 주세요.';
    if (result !== 'completed' && result !== 'cancelled') message = '재생하지 못했어요. 소리 크기와 음소거를 확인하고 다시 눌러 주세요.';
  }
  async function clear(uninstall = false) {
    busy = true; speech.cancel(); ready = false;
    try {
      if (uninstall) await speech.local.uninstall(); else await speech.local.clear();
      message = uninstall ? '내려받은 음성 자료와 이름·안건 음성을 지웠어요. 기본 안내는 유지돼요.' : '준비한 이름·안건 음성을 지웠어요.';
    } catch { message = '음성 자료를 지우지 못했어요. 다시 시도해 주세요.'; }
    finally { busy = false; }
  }
  onDestroy(() => { ticket++; speech.cancel(); speech.local.cancel(); });
</script>

<details class="speech-settings">
  <summary>안내 음성 · {voice === 'male' ? '남성' : '여성'} · {content.readDynamic && ready ? '이름·안건 준비됨' : '기본 안내'}</summary>
  <div class="settings-body">
    <div class="row" role="group" aria-label="안내 목소리">
      {#each [['female','여성'],['male','남성']] as [value,label]}
        <button class="vt-btn" aria-pressed={voice === value} onclick={() => onprefs({speechVoice:value})}>{label}</button>
      {/each}
      <label><input type="checkbox" checked={prefs.speech} onchange={(e) => onprefs({speech:e.currentTarget.checked})} /> 안내 음성 켜기</label>
      <button class="vt-btn" onclick={() => preview('preview')}>목소리 들어 보기</button>
    </div>
    <label><input type="checkbox" checked={content.readDynamic} disabled={busy} onchange={(e) => change({readDynamic:e.currentTarget.checked})} /> 제목·이름·안건도 읽기</label>
    {#if content.readDynamic}
      <p>처음 준비할 때 약 380MB를 내려받아요. 이후 인터넷 없이 사용할 수 있고, 입력한 내용은 이 PC에서 음성으로 만들어요. 준비하지 못하면 기본 안내를 읽어요.</p>
      <details><summary>발음 수정 · 화면의 이름은 바뀌지 않아요</summary>
        <div class="aliases">
          <label>제목<input maxlength="80" value={content.titleAlias} placeholder={session.title} disabled={busy} onchange={(e) => change({titleAlias:e.currentTarget.value})} /></label>
          {#each session.type === 'yesno' ? session.agendas : session.items as item (item.id)}
            {@const field = session.type === 'yesno' ? 'agendaAliases' : 'itemAliases'}
            <label>{item.name ?? item.text}<input maxlength="80" value={content[field][item.id] ?? ''} placeholder="읽을 발음 입력" disabled={busy} onchange={(e) => change({[field]:{...content[field],[item.id]:e.currentTarget.value}})} /></label>
          {/each}
        </div>
      </details>
      <div class="row">
        <button class="vt-btn" disabled={busy} onclick={prepare}>{ready ? '음성 준비 확인' : '이름·안건 음성 준비'}</button>
        {#if busy}<button class="vt-btn" onclick={() => speech.local.cancel()}>준비 취소</button>{/if}
        <button class="vt-btn" disabled={!ready || busy} onclick={() => preview('meet')}>소개 들어 보기</button>
        <button class="vt-btn ghost" disabled={busy} onclick={() => clear()}>이름·안건 음성 지우기</button>
        <button class="vt-btn ghost" disabled={busy} onclick={() => clear(true)}>내려받은 자료 지우기</button>
      </div>
    {/if}
    {#if message}<p role="status">{message}</p>{/if}
    <p><a href="/licenses/vote-speech/Supertonic-MIT.txt" target="_blank" rel="noopener">음성 코드 라이선스</a> · <a href="/licenses/vote-speech/Supertonic-OpenRAIL-M.txt" target="_blank" rel="noopener">모델 이용 조건</a></p>
  </div>
</details>
<style>
  .speech-settings { border:1px solid var(--vt-line); border-radius:14px; padding:12px 16px; background:var(--vt-card); }
  summary { cursor:pointer; font-weight:800; }
  .settings-body,.aliases { display:grid; gap:12px; margin-top:12px; }
  .row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
  p { margin:0; font-size:14px; color:var(--vt-muted); line-height:1.5; }
  label { display:flex; align-items:center; gap:8px; }
  input:not([type=checkbox]) { flex:1; min-width:80px; border:1px solid var(--vt-line); border-radius:8px; padding:8px; color:var(--vt-ink); background:var(--vt-bg); }
  button[aria-pressed=true] { border-color:var(--vt-accent); background:var(--vt-soft); }
</style>
