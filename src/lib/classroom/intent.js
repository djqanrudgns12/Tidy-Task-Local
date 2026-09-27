/** 다른 도구가 학급 명단 창을 "할 일"과 함께 엽니다(예: 개인 점수판의 [학급 명단 등록하러 가기]).
 * Rust가 할 일을 10초 보관하고, 명단 창이 떠서 꺼내 가거나(새 창) 알림으로 받습니다(이미 열린 창).
 * 미리보기(브라우저)에서는 명단 창만 엽니다. */
import { invoke } from '@tauri-apps/api/core';
import { native } from './repository.js';
import { openTool } from '../toolkit/windows.js';

/** @param {{action:'create-class'} | {action:'add-students', classId:string}} intent */
export async function openRosterFor(intent) {
  if (native) await invoke('classroom_set_intent', { intent });
  await openTool('roster');
}
