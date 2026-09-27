import { Vote, FilePenLine, SlidersHorizontal, Megaphone } from 'lucide-svelte';

// 단계 표시와 제목 패널에서 같은 이름과 아이콘을 사용합니다.
export const WIZARD_STEPS = [
  { label: '투표 방식', icon: Vote, hint: '무엇을 고를까요?' },
  { label: '투표 내용', icon: FilePenLine, hint: '제목과 후보·안건' },
  { label: '투표 규칙', icon: SlidersHorizontal, hint: '인원과 참여 방법' },
  { label: '개표 방식·안내', icon: Megaphone, hint: '공개 범위와 결과 발표' },
];
