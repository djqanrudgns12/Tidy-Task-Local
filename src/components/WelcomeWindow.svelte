<script>
  import { appState } from '../lib/appState.svelte.js';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { onMount } from 'svelte';

  let hideNextTime = $state(false);

  function closeWindow() {
    if (hideNextTime) {
      appState.hideWelcomeMessage = true;
      appState.setHideWelcomeMessage?.(true); // Optional if using the helper
    }
    getCurrentWindow().close();
  }

  // Helper inside WelcomeWindow if not in appState
  async function savePreference() {
    const { LazyStore } = await import('@tauri-apps/plugin-store');
    const store = new LazyStore('tidy-task-config.json');
    if (hideNextTime) {
      await store.set('hideWelcomeMessage', true);
      await store.save();
    }
  }

  async function handleClose() {
    await savePreference();
    closeWindow();
  }
</script>

<div class="welcome-container" data-tauri-drag-region>
  <div class="welcome-card">
    <div class="welcome-header" data-tauri-drag-region>
      <div class="logo">🎈 Tidy Task</div>
      <div class="maker">Made by. 달디단</div>
    </div>
    
    <div class="content">
      <div class="title-row">
        <h3>[개발자의 말]</h3>
        <span>💝</span>
      </div>
      
      <p>
        이 <strong>'To do list'</strong> 프로그램은 선생님들의 <strong>'번아웃'</strong> 방지용 
        당 보충제 같은 공간입니다. 그 공간을 위해 예쁜 테마와 아기자기한 폰트 등의 기능을 넣어 놨어요!
      </p>
      
      <p>
        산더미 같은 일들도 하나씩 지워가다 보면 어느새 퇴근 시간이 달콤하게 다가올 거예요.
        <br>오늘도 교실을 지키느라 고생 많으셨습니다!
      </p>

      <div class="tip-box">
        <span class="tip-icon">💡</span>
        <span><strong>Tip!</strong> 프로그램에 우측 클릭 후 <strong>'기능 설명'</strong> 탭을 열어 기능을 익혀 보세요!</span>
      </div>

      <div class="notice-box">
        <span class="notice-icon">💌</span>
        <span>선생님의 소중한 기록은 사용자님의 컴퓨터 내부에만 안전하게 저장됩니다. 하지만 프로그램의 예기치 못한 오류나 하드웨어 손상에 대비하여, 매우 중요한 내용은 주기적으로 <strong>'내보내기'</strong> 기능을 통해 백업해 두시는 것을 권장드려요!</span>
      </div>
    </div>

    <div class="font-notice-box">
      <span class="font-notice-icon">🔤</span>
      <span>이 프로그램은 네이버 나눔글꼴, 우아한형제들 배달의민족 서체, 넥슨 메이플스토리 서체, 학교안심 폰트 등 상업용 무료 폰트를 사용하고 있습니다.</span>
    </div>

    <div class="footer">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={hideNextTime} />
        <span class="custom-check"></span>
        본 창을 앞으로 보지 않기
      </label>
      
      <button class="close-btn" onclick={handleClose}>
        다 읽었어요!
      </button>
    </div>
  </div>
</div>

<style>
  @font-face {
    font-family: 'MaplestoryOTFLight';
    src: url('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@2.1/MaplestoryOTFLight.woff') format('woff');
    font-weight: 300;
    font-style: normal;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background: transparent;
    user-select: none;
  }

  .welcome-container {
    width: 100vw;
    height: 100vh;
    padding: 0;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: center;
    background: transparent;
    overflow: hidden;
  }

  .welcome-card {
    width: 100%;
    height: 100%;
    background: #fdfaf3;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'MaplestoryOTFLight', 'Malgun Gothic', sans-serif;
    color: #4b5563;
    animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    border: 1px solid #fbbf24;
  }

  @keyframes popIn {
    0% { transform: scale(0.85); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  .welcome-header {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    color: white;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: default;
  }

  .logo {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 1px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .maker {
    font-size: 12px;
    opacity: 0.9;
    background: rgba(255,255,255,0.2);
    padding: 4px 10px;
    border-radius: 12px;
    backdrop-filter: blur(4px);
  }

  .content {
    padding: 18px 20px;
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font-size: 12.5px;
    line-height: 1.6;
    color: #374151;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .title-row h3 {
    margin: 0;
    font-size: 14px;
    color: #d97706;
    font-weight: bold;
  }

  strong {
    color: #b45309;
  }

  .tip-box {
    background: #fffbeb;
    border: 1px dashed #f59e0b;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: #92400e;
  }

  .tip-icon {
    font-size: 14px;
    margin-top: -1px;
    flex-shrink: 0;
  }

  /* 백업 안내 박스 */
  .notice-box {
    background: #fff7ed;
    border: 1px dashed #fb923c;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: #7c2d12;
    line-height: 1.6;
  }

  .notice-icon {
    font-size: 14px;
    margin-top: -1px;
    flex-shrink: 0;
  }

  /* 폰트 저작권 박스 */
  .font-notice-box {
    background: #f5f3ff;
    border-top: 1px solid #ddd6fe;
    padding: 10px 20px;
    font-size: 11px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: #6d28d9;
    line-height: 1.55;
  }

  .font-notice-icon {
    font-size: 13px;
    margin-top: 0px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  .footer {
    padding: 12px 20px;
    background: #fefce8;
    border-top: 1px dashed #fcd34d;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11.5px;
    color: #78350f;
    cursor: pointer;
  }

  .checkbox-label input {
    display: none;
  }

  .custom-check {
    width: 16px;
    height: 16px;
    border: 2px solid #fbbf24;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    background: white;
  }

  .checkbox-label input:checked + .custom-check {
    background: #f59e0b;
    border-color: #f59e0b;
  }

  .checkbox-label input:checked + .custom-check::after {
    content: '✓';
    color: white;
    font-size: 12px;
    font-weight: bold;
  }

  .close-btn {
    background: #f59e0b;
    color: white;
    border: none;
    padding: 7px 16px;
    border-radius: 20px;
    font-family: inherit;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(245,158,11,0.3);
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #d97706;
    transform: translateY(-2px);
    box-shadow: 0 6px 14px rgba(245,158,11,0.4);
  }

  .close-btn:active {
    transform: translateY(0);
  }
</style>
