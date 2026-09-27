// 개발 미리보기용 예시 투표(PRD 13절 "검수"). `?toolkit-preview=vote&vote-fixture=<이름>`으로 여는 화면을 채웁니다.
// 개발 서버에서만 불러옵니다(VoteApp이 import.meta.env.DEV일 때만 동적 import). 실제 앱의 저장 파일에는 들어가지 않습니다.
// 표는 고정 씨앗으로 만들어 매번 같은 결과가 나옵니다(화면 비교·스크린샷 검수용).
//
// 이름:
//   candidate9 · opinion · yesno3        준비 화면(후보 9명 / 의견 6개 / 안건 3개)
//   voting                               투표 받는 중(25명 중 12명)
//   counting[-<방식>][-yesno]            개표 대기(방식: instant·paper·race·broadcast·reverse·pick, 기본 paper)
//   result · result-tie · result-winner  결과 화면(모두 공개 / 1위 동점 / 당선자만)
//   archive                              기록함(4개)
//   archive-disclosure                   기록함 공개 범위 전환(숨긴 득표·찬반·동점·기권)
import { sessionFromConfig, MODES } from './model.js';
import { seededRandom } from './random.js';
import * as B from './ballots.js';
import { archiveSession } from './archive.js';

const DATE = '2026-09-24';

const CANDIDATES = [
  ['김하늘', 'f', '웃음이 많은 반장'],
  ['이도윤', 'm', '약속은 꼭 지켜요'],
  ['박서아', 'f', '급식 줄 정리 담당'],
  ['최준우', 'm', '체육 시간의 희망'],
  ['정다은', 'f', '칭찬 스티커 부자'],
  ['강민재', 'm', '분리수거 지킴이'],
  ['조예린', 'f', '책 읽어 주는 친구'],
  ['윤시우', 'm', '아침 인사 대장'],
  ['장하윤', 'f', '모두의 이야기를 들어요'],
];
const PLACES = ['놀이공원', '과학관', '수목원', '박물관', '동물원', '영화관'];

/** @param {number} n @param {string} [prefix] */
function candidates(n, prefix = 'c') {
  return CANDIDATES.slice(0, n).map(([name, gender, intro], i) => ({
    id: `${prefix}${i + 1}`, number: i + 1, name, gender, character: null, color: null, pattern: null, intro,
  }));
}

/** @param {any} config @param {string} id */
const fresh = (config, id) => sessionFromConfig(config, id, DATE);

/** 진행 중 투표 예시의 id. 같은 예시를 다시 열 때마다 새 id를 붙입니다.
 * 왜: 같은 id가 이미 기록함에 있으면 앱이 "기록 뒤 비우기 전에 꺼진 투표"로 보고 곧바로 정리합니다(recover). @param {string} base */
const liveId = (base) => `${base}-${Date.now().toString(36).slice(-6)}`;

/**
 * 고정 씨앗으로 표를 만듭니다. weights: 항목별 뽑힐 비중(0이면 기권 비중 없음).
 * @param {any} s @param {number} count @param {number[]} weights @param {string} seed @param {number} [abstainWeight]
 */
function fillBallots(s, count, weights, seed, abstainWeight = 0) {
  const rng = seededRandom(seed);
  const total = weights.reduce((a, b) => a + b, 0) + abstainWeight;
  const pick = () => {
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return -1;
  };
  /** @type {{id:string, p:string[], a:number}[]} */ const ballots = [];
  for (let n = 0; n < count; n++) {
    const id = `b${String(n + 1).padStart(3, '0')}`;
    if (s.type === 'yesno') {
      ballots.push({ id, p: s.agendas.map(() => { const k = pick(); return k === 0 ? 'y' : k === 1 ? 'n' : 'a'; }), a: 0 });
      continue;
    }
    /** @type {string[]} */ const p = [];
    let a = 0;
    for (let slot = 0; slot < s.rules.votesPerVoter; slot++) {
      const k = pick();
      if (k < 0) a++;
      else if (!s.rules.allowRepeat && p.includes(s.items[k].id)) a++;
      else p.push(s.items[k].id);
    }
    ballots.push({ id, p, a });
  }
  return { ...s, phase: 'voting', ballots, lastBallotId: ballots.at(-1)?.id ?? null };
}

/** 정해 둔 표 묶음(동점 만들기용). @param {any} s @param {Array<[string, number]>} plan [항목 id 또는 '기권', 장 수] */
function planBallots(s, plan) {
  /** @type {{id:string, p:string[], a:number}[]} */ const ballots = [];
  for (const [target, times] of plan) {
    for (let t = 0; t < times; t++) {
      const id = `b${String(ballots.length + 1).padStart(3, '0')}`;
      ballots.push(target === '기권' ? { id, p: [], a: 1 } : { id, p: [target], a: 0 });
    }
  }
  return { ...s, phase: 'voting', ballots, lastBallotId: null };
}

/** 마감(개표 순서는 고정 씨앗으로 섞음 — 매번 같은 개표 순서). @param {any} s @param {string} [key] 씨앗(기본: 투표 id) */
const closeWith = (s, key = s.id) => B.close(B.countingOrder(s, seededRandom(`${key}:order`)))(s);

/** @param {any} s @param {{entries:any[]}} a */
const archived = (s, a = { entries: [] }) => archiveSession(B.finish(B.startCounting(closeWith(s))), DATE)(a);

function candidateConfig(title = '2학기 반장 선거', n = 5, extra = {}) {
  return { type: 'candidate', title, items: candidates(n), agendas: [], rules: { voters: 25, votesPerVoter: 1, allowRepeat: false, allowAbstain: true, seats: 1, passRule: 'yesOverNo' }, reveal: { mode: 'paper', visibility: 'all' }, tutorial: { enabled: true, speed: 'slow', speech: true }, ...extra };
}
function opinionConfig() {
  return {
    ...candidateConfig('가을 현장 체험 학습 장소', 0),
    type: 'opinion',
    items: PLACES.map((name, i) => ({ id: `o${i + 1}`, number: i + 1, name, gender: null, character: null, color: null, pattern: null, intro: '' })),
    rules: { voters: 24, votesPerVoter: 2, allowRepeat: false, allowAbstain: true, seats: 1, passRule: 'yesOverNo' },
    reveal: { mode: 'race', visibility: 'all' },
  };
}
function yesnoConfig() {
  return {
    ...candidateConfig('학급 회의 안건', 0),
    type: 'yesno',
    items: [],
    agendas: [
      { id: 'a1', text: '금요일 아침에 반 음악 틀기' },
      { id: 'a2', text: '청소 당번을 2주마다 바꾸기' },
      { id: 'a3', text: '생일 축하는 한 달에 한 번 모아서 하기' },
    ],
    reveal: { mode: 'broadcast', visibility: 'all' },
  };
}

/**
 * @param {string} name
 * @returns {{session?:any, archive?:{entries:any[]}, screen?:string, focus?:string}}
 */
export function fixture(name) {
  switch (name) {
    case 'candidate9':
      return { session: fresh(candidateConfig('전교 어린이회 임원 선거', 9, { rules: { ...candidateConfig().rules, seats: 2 } }), liveId('vfx-c9')) };
    case 'opinion':
      return { session: fresh(opinionConfig(), liveId('vfx-op')) };
    case 'yesno3':
      return { session: fresh(yesnoConfig(), liveId('vfx-yn')) };
    case 'voting':
      return { session: fillBallots(fresh(candidateConfig(), liveId('vfx-vt')), 12, [5, 4, 3, 2, 2], 'voting', 1) };
    case 'voting-last': {
      const s = fillBallots(fresh(candidateConfig(), liveId('vfx-last')), 12, [5, 4, 3, 2, 2], 'voting', 1);
      return { session: { ...s, rules: { ...s.rules, voters: 13 } } };
    }
    case 'result':
      return withResult(archived(fillBallots(fresh(candidateConfig(), 'vfx-r1'), 24, [7, 5, 4, 3, 2], 'result', 1)), 'vfx-r1');
    case 'result-tie': {
      const s = planBallots(fresh(candidateConfig('학급 이름 짓기 대표', 4), 'vfx-rt'), [['c1', 8], ['c2', 8], ['c3', 5], ['c4', 3], ['기권', 1]]);
      return withResult(archived(s), 'vfx-rt');
    }
    case 'result-winner': {
      const s = fillBallots(fresh(candidateConfig('모둠 이끔이 뽑기', 5, { reveal: { mode: 'reverse', visibility: 'winner' } }), 'vfx-rw'), 22, [3, 6, 4, 5, 2], 'winner', 1);
      return withResult(archived(s), 'vfx-rw');
    }
    case 'result-opinion-tie': {
      const config = opinionConfig();
      config.items = config.items.slice(0, 3).map(it => ({ ...it, name: '우리 반의 약속' }));
      config.rules = { ...config.rules, voters: 20, votesPerVoter: 1 };
      const s = planBallots(fresh(config, 'vfx-ot'), [['o1', 2], ['o2', 2], ['o3', 2]]);
      return withResult(archived(s), s.id);
    }
    case 'result-nine-tie': {
      const s = planBallots(fresh(candidateConfig('모두 같은 표를 받은 선거', 9), 'vfx-nt'), candidates(9).map(it => [it.id, 2]));
      return withResult(archived(s), s.id);
    }
    case 'result-mixed': {
      const config = candidateConfig('학급 임원 선거', 5);
      config.rules.seats = 2;
      const s = planBallots(fresh(config, 'vfx-mx'), [['c1', 9], ['c2', 6], ['c3', 6], ['c4', 2], ['c5', 1]]);
      return withResult(archived(s), s.id);
    }
    case 'result-abstain': {
      const s = planBallots(fresh(candidateConfig(), 'vfx-ab'), [['기권', 20]]);
      return withResult(archived(s), s.id);
    }
    case 'result-rank': {
      const config = candidateConfig();
      config.reveal = { mode: 'reverse', visibility: 'rank' };
      const s = planBallots(fresh(config, 'vfx-rk'), [['c1', 10], ['c2', 7], ['c3', 4], ['c4', 2], ['c5', 1]]);
      return withResult(archived(s), s.id);
    }
    case 'result-yesno':
    case 'result-yesno-hidden': {
      const config = yesnoConfig();
      config.agendas.push({ id: 'a4', text: '우리 반 도서관에 읽고 싶은 책을 함께 골라 신청하기' }, { id: 'a5', text: '한 달에 한 번 친구들에게 고마운 마음 전하기' });
      if (name.endsWith('hidden')) config.reveal.visibility = 'result';
      const s = fillBallots(fresh(config, 'vfx-ynr'), 25, [6, 3], 'yn-result', 1);
      return withResult(archived(s), s.id);
    }
    case 'archive-disclosure': {
      const names = ['result-rank', 'result-winner', 'result-yesno-hidden', 'result-opinion-tie', 'result-nine-tie', 'result-abstain', 'result-mixed'];
      return { archive: { entries: names.flatMap(name => fixture(name).archive?.entries ?? []) }, screen: 'archive' };
    }
    case 'archive': {
      let a = archived(fillBallots(fresh(candidateConfig(), 'vfx-a1'), 24, [7, 5, 4, 3, 2], 'a1', 1));
      a = archived(fillBallots(fresh(opinionConfig(), 'vfx-a2'), 24, [6, 5, 4, 3, 2, 1], 'a2', 1), a);
      a = archived(fillBallots(fresh(yesnoConfig(), 'vfx-a3'), 25, [6, 3], 'a3', 1), a);
      a = archived(planBallots(fresh(candidateConfig('학급 이름 짓기 대표', 4), 'vfx-a4'), [['c1', 8], ['c2', 8], ['c3', 5], ['c4', 3]]), a);
      return { archive: a, screen: 'archive' };
    }
    default: {
      // counting[-<방식>][-yesno]
      const parts = name.split('-');
      if (parts[0] !== 'counting') return {};
      const yesno = parts.includes('yesno');
      const mode = MODES.find((m) => parts.includes(m)) ?? 'paper';
      if (yesno) {
        const config = { ...yesnoConfig(), reveal: { mode: mode === 'reverse' || mode === 'pick' ? 'paper' : mode, visibility: 'all' } };
        return { session: closeWith(fillBallots(fresh(config, liveId('vfx-cy')), 25, [6, 3], 'count-yn', 1), `count-yn-${mode}`) };
      }
      const visibility = mode === 'pick' ? 'rank' : 'all';
      const config = parts.includes('opinion') ? opinionConfig() : candidateConfig('2학기 반장 선거', parts.includes('nine') ? 9 : 5);
      config.reveal = { mode, visibility };
      return { session: closeWith(fillBallots(fresh(config, liveId('vfx-cc')), 24, config.items.map((_, i) => 10 - i), `count-${mode}`, 1), `count-${mode}`) };
    }
  }
}

/** @param {{entries:any[]}} archive @param {string} id */
const withResult = (archive, id) => ({ archive, screen: 'result', focus: id });
