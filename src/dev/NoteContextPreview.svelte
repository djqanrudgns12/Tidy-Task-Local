<script lang="ts">
  import ContextMenu from '../components/ContextMenu.svelte';
  import { captureEditorContext, runEditorContextAction } from '../lib/windows/editorContext.js';
  let context = $state<ReturnType<typeof captureEditorContext>>(null);
  let open = $state(false);
  let status = $state('노트 안에서 우클릭하세요.');
  let revision = $state(0);
  function show(event: MouseEvent) {
    event.preventDefault();
    context = captureEditorContext(event.target);
    revision++;
    open = true;
  }
  async function action(name: string) {
    open = false;
    if (['undo','redo','cut','copy','paste','select-all'].includes(name)) {
      try { await runEditorContextAction(context, name); status = `${name} 완료`; }
      catch { status = `${name} 실패`; }
    } else status = `${name} 요청`;
  }
</script>
<div class="qa">
  <section class="note-wrapper" oncontextmenu={show} role="presentation">
    <header>Tiny Note · 동작 검증</header>
    <div class="note-editor" role="textbox" aria-label="테스트 노트" tabindex="0" contenteditable="true">선택한 글자를 복사하고 원하는 위치에 붙여넣습니다.</div>
  </section>
  <p role="status">{status}</p>
  {#if open}{#key revision}<ContextMenu preview previewType="tiny" previewConfig={{ hasEditor: !!context, hasSelection: !!context?.hasSelection }} onaction={action}/>{/key}{/if}
</div>
<style>
.qa { display:flex; align-items:flex-start; gap:18px; padding:24px; }
.note-wrapper { background:#fff5c5; border:1px solid #dfd2a0; border-radius:12px; width:320px; height:370px; display:flex; flex-direction:column; }
header { padding:12px; font:14px sans-serif; }
.note-editor { padding:16px; flex:1; outline:none; font:16px/1.7 sans-serif; }
p { position:absolute; top:415px; left:24px; font:13px sans-serif; }
</style>
