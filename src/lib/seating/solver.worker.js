import { solve } from './solver.js';
self.onmessage=event=>{try{self.postMessage({runId:event.data.runId,...solve(event.data)});}catch{self.postMessage({runId:event.data.runId,status:'error',message:'배치를 계산하지 못했어요. 조건을 확인하고 다시 시도해 주세요.',candidates:[]});}};
