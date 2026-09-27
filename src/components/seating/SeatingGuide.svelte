<script lang="ts">
  let active=$state('start');
  const chapters=[
    ['start','처음 시작'],
    ['prepare','교실 준비'],
    ['rearrange','자리 재배치'],
    ['edit','직접 수정'],
    ['share','보여 주고 저장'],
    ['help','막혔을 때']
  ] as const;
  function go(id:string){active=id;document.getElementById(`seat-guide-${id}`)?.scrollIntoView({behavior:'smooth',block:'start'});}
</script>

<div class="seat-guide-body">
  <nav class="seat-guide-nav" aria-label="가이드북 목차">
    <span class="seat-guide-nav-title">목차</span>
    {#each chapters as [id,label],i}<button class:active={active===id} onclick={()=>go(id)}><span>{String(i+1).padStart(2,'0')}</span>{label}</button>{/each}
  </nav>
  <div class="seat-guide-pages">
    <div class="seat-guide-hero"><span class="seat-guide-kicker">처음 쓰는 선생님을 위한 안내</span><h3>우리 반 자리를 정하는 가장 쉬운 순서</h3><p>학급과 교실 모양을 확인하고, 자리 재배치로 배치를 만든 뒤 필요한 자리만 손으로 고치면 됩니다. 완성된 배치는 자동으로 기록돼요.</p><div class="seat-guide-route"><span>학급 확인</span><i>→</i><span>교실 모양</span><i>→</i><span>자리 재배치</span><i>→</i><span>필요한 자리 수정</span></div></div>

    <section id="seat-guide-start" class="seat-guide-chapter"><div class="seat-guide-chapter-head"><span>01</span><div><small>START</small><h3>처음 시작</h3></div></div><div class="seat-guide-steps"><article><b>① 학급을 고르세요</b><p>상단에 표시된 학급 이름과 학생 수를 확인하세요. 학급이 없다면 <strong>학급 명단 등록하기</strong>로 먼저 명단을 만듭니다.</p></article><article><b>② 자동 전환 여부를 확인하세요</b><p><strong>기본 학급 따라가는 중</strong>이면 명단의 기본 학급이 바뀔 때 이 화면도 바뀝니다. 다른 학급을 직접 선택하면 그 학급을 유지합니다.</p></article></div></section>

    <section id="seat-guide-prepare" class="seat-guide-chapter"><div class="seat-guide-chapter-head"><span>02</span><div><small>SET UP</small><h3>교실 준비</h3></div></div><div class="seat-guide-steps"><article><b>① 교실 모양을 맞추세요</b><p>상단 <strong>교실 모양</strong>에서 앉는 모양과 가로 책상 수를 고릅니다. 교실 안의 +/− 버튼으로 가로·세로 자리를 조금씩 늘리거나 줄일 수도 있어요.</p></article><article><b>② 꼭 필요한 조건만 정하세요</b><p><strong>선생님 설정</strong>의 <strong>배치 조건</strong>에서 떨어져 앉기·함께 앉기 등을 정합니다. <strong>사전 지정</strong>에서는 특정 학생이 앉을 자리를 먼저 정할 수 있어요. <strong>지난 자리</strong>에서는 자동 기록된 배치를 살펴볼 수 있습니다.</p></article></div><div class="seat-guide-note"><b>교실 모양을 다시 바꿀 때</b><p>사전 지정이나 고정 자리가 있으면 해제 여부를 먼저 묻습니다. 책상 수를 줄일 수 없다면 학생이나 지정 조건이 있는 자리를 확인하세요.</p></div></section>

    <section id="seat-guide-rearrange" class="seat-guide-chapter"><div class="seat-guide-chapter-head"><span>03</span><div><small>ARRANGE</small><h3>자리 재배치</h3></div></div><div class="seat-guide-steps"><article><b>① 보여 주는 방법을 고르세요</b><p>하단 <strong>공개 효과</strong>에서 <strong>효과 없음</strong>은 한 번에 보기, <strong>가림막</strong>은 선생님이 직접 열기, <strong>순차적 공개</strong>는 학생 자리를 자동으로 차례로 보여 주기, <strong>1개씩 클릭</strong>은 이름 없는 실루엣을 눌러 한 명씩 보여 주기입니다. 3·2·1 애니메이션과 효과음은 각각 따로 켜거나 끌 수 있어요.</p></article><article><b>② 자리 재배치를 누르세요</b><p>조건에 맞는 배치를 계산해 첫 결과를 적용합니다. 다른 결과가 있으면 교실 아래 <strong>배치 1·2·3</strong>에서 골라 보세요. 계산 중에는 <strong>재배치 취소</strong>를 누를 수 있습니다.</p></article><article><b>③ 결과를 확인하세요</b><p>가림막을 골랐다면 <strong>새 자리 보여 주기</strong>를 눌러 엽니다. 1개씩 클릭에서는 원하는 실루엣이나 <strong>다음 자리 공개</strong>를 누르세요. 공개 중 빠르게 끝내려면 <strong>한 번에 보기</strong>를 누르세요. 학생 자리가 모두 정해지면 마지막으로 고른 배치가 자동 기록됩니다.</p></article></div></section>

    <section id="seat-guide-edit" class="seat-guide-chapter"><div class="seat-guide-chapter-head"><span>04</span><div><small>EDIT</small><h3>직접 수정</h3></div></div><div class="seat-guide-steps"><article><b>학생 둘을 바꾸기</b><p>한 학생의 자리를 누른 뒤 다른 학생의 자리를 누르세요. 마우스로 학생을 다른 자리까지 끌어도 됩니다. 빈자리로 옮길 때는 학생을 누른 뒤 빈자리를 누르세요.</p></article><article><b>아직 자리 없는 학생 앉히기</b><p>교실 아래 <strong>아직 자리 없는 학생</strong>에서 이름을 고르고 빈자리를 누르세요. 이미 학생이 앉은 자리라면 먼저 빈자리를 골라야 합니다.</p></article><article><b>자리를 유지하거나 되돌리기</b><p>학생 자리의 자물쇠를 누르면 다음 재배치에서도 그 자리를 지킵니다. 상단 도구의 되돌리기·다시 하기로 최근 수정을 되짚을 수 있어요.</p></article></div><div class="seat-guide-note"><b>키보드로도 사용할 수 있어요</b><p>Tab으로 버튼을 찾아 Enter 또는 스페이스로 누르세요. Escape는 자리 선택을 취소하고, Ctrl+Z는 되돌리기, Ctrl+Shift+Z는 다시 하기입니다.</p></div></section>

    <section id="seat-guide-share" class="seat-guide-chapter"><div class="seat-guide-chapter-head"><span>05</span><div><small>VIEW & SAVE</small><h3>보여 주고 저장</h3></div></div><div class="seat-guide-steps"><article><b>보는 방향과 화면을 정하세요</b><p>상단 도구의 <strong>학생 기준·교사 기준</strong>으로 칠판 방향을 바꾸고, −/+/교실에 맞추기로 크기를 조절하세요. <strong>간단히 보기</strong>를 누르면 학생 그림 없이 이름과 자리 위주로 볼 수 있어요.</p></article><article><b>PNG로 저장하세요</b><p>하단 <strong>PNG 저장</strong>에서 학생·교사 기준, 번호만 표시, 간단한 배치도를 선택한 뒤 다운로드하세요. 화면을 학생에게 보여 줄 때는 선생님 설정 창을 닫고 공유 화면을 확인하세요.</p></article></div></section>

    <section id="seat-guide-help" class="seat-guide-chapter"><div class="seat-guide-chapter-head"><span>06</span><div><small>WHEN STUCK</small><h3>막혔을 때</h3></div></div><div class="seat-guide-troubles"><div><b>학급이 보이지 않아요</b><p>학급 명단에 학급을 등록하고, 상단 학급 선택이나 기본 학급 설정을 확인하세요.</p></div><div><b>배치를 찾지 못했어요</b><p>선생님 설정에서 서로 충돌하는 조건이 없는지 확인하세요. 학생 수보다 앉을 수 있는 자리가 적어도 배치를 만들 수 없습니다.</p></div><div><b>자리를 옮길 수 없어요</b><p>고정 자리·사전 지정·배치 조건을 확인하세요. 조건을 어기는 이동은 적용되지 않습니다.</p></div><div><b>저장 오류가 보여요</b><p>화면의 오류 내용을 먼저 확인하세요. <strong>저장된 내용 다시 불러오기</strong>는 저장되지 않은 변경을 버릴 수 있어 확인을 요청합니다.</p></div></div></section>
  </div>
</div>
