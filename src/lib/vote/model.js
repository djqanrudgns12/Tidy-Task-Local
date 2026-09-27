// 학급 투표 자료 모양·한도·기본값·정규화(PRD 4·11절). 화면과 저장소를 모르는 순수 함수만 둡니다.
// 저장 파일(tidy-task-vote.json)의 구역: session(진행 중 투표 1개) · archive(끝난 투표) · draft(만들던 설정) · prefs.
import { repairItems } from './assign.js';
import { normalizeSpeechContent } from './speech/normalize.js';

export const LIMITS = Object.freeze({
  itemsMin: 2,
  itemsMax: 9, // 숫자키 1~9
  votersMin: 2,
  votersMax: 60,
  votesMin: 1,
  votesMax: 5,
  seatsMin: 1,
  seatsMax: 4,
  agendasMin: 1,
  agendasMax: 5,
  titleMax: 30,
  nameMax: 12,
  opinionNameMax: 16,
  introMax: 30,
  agendaMax: 120,
  archiveMax: 30,
});

export const TYPES = /** @type {const} */ (['candidate', 'opinion', 'yesno']);
export const MODES = /** @type {const} */ (['instant', 'paper', 'race', 'broadcast', 'reverse', 'pick']);
export const PHASES = /** @type {const} */ (['ready', 'tutorial', 'voting', 'paused', 'closed', 'counting', 'done']);
export const PASS_RULES = /** @type {const} */ (['yesOverNo', 'majority', 'twoThirds', 'none']);
export const SPEEDS = /** @type {const} */ (['slow', 'normal']);

/** 진행 단계 이름(선생님 메뉴 · 선생님 창). @param {string} phase */
export function phaseLabel(phase) {
  return /** @type {Record<string,string>} */ ({ ready: '준비', tutorial: '안내 중', voting: '투표 받는 중', paused: '잠시 멈춤', closed: '마감', counting: '개표 중', done: '개표 끝' })[phase] ?? '';
}

/** 개표 방식 이름(만들기 · 개표 대기 · 선생님 창이 같은 이름을 쓰도록 한곳에). 찬반의 레이스는 줄다리기입니다.
 * @param {string} mode @param {boolean} [yesno] */
export function modeName(mode, yesno = false) {
  if (yesno && mode === 'race') return '줄다리기';
  return /** @type {Record<string,string>} */ ({ instant: '바로 결과', paper: '한 장씩 펼치기', race: '실시간 레이스', broadcast: '개표 방송', reverse: '반전 공개', pick: '골라 공개' })[mode] ?? '';
}

/** @typedef {'candidate'|'opinion'|'yesno'} VoteType */
/** @typedef {'instant'|'paper'|'race'|'broadcast'|'reverse'|'pick'} Mode */
/** @typedef {{id:string, number:number, name:string, gender:'m'|'f'|null, character:string|null, color:string|null, pattern:string|null, intro:string}} Item */
/** @typedef {{id:string, text:string}} Agenda */
/** @typedef {{voters:number, votesPerVoter:number, allowRepeat:boolean, allowAbstain:boolean, seats:number, passRule:string}} Rules */
/** @typedef {{type:VoteType, title:string, items:Item[], agendas:Agenda[], rules:Rules, reveal:{mode:Mode, visibility:string}, tutorial:{enabled:boolean, speed:string, speech:boolean}, speechContent?:ReturnType<typeof normalizeSpeechContent>}} Config */
/** @typedef {{id:string, p:string[], a:number}} Ballot */
/** @typedef {{order:string[], cursor:number, agenda:number, revealed:string[]}} Counting */
/** @typedef {Config & {id:string, createdOn:string, phase:string, ballots:Ballot[], lastBallotId:string|null, counting:Counting|null, runoffOf:string|null, round:number}} Session */

export { PALETTE, COLOR_IDS, PATTERNS, PATTERN_IDS, paletteOf } from './palette.js';

/** 찬반 선택지(키 1 · 2 · 0). */
export const YESNO = Object.freeze({ y: { key: 1, label: '찬성' }, n: { key: 2, label: '반대' }, a: { key: 0, label: '기권' } });

/** 공개 범위: 후보·의견은 모두·순위만·당선자만, 찬반은 모두·결과만. */
export const VISIBILITIES = Object.freeze({
  candidate: ['all', 'rank', 'winner'],
  opinion: ['all', 'rank', 'winner'],
  yesno: ['all', 'result'],
});

/** 모드 × 공개 범위 × 방식 가능표(PRD 8절). 이 표가 만들기 화면·정규화·개표의 단일 원천입니다. */
const AVAILABLE = Object.freeze({
  all: ['instant', 'paper', 'race', 'broadcast', 'reverse', 'pick'],
  rank: ['instant', 'reverse', 'pick'],
  winner: ['instant', 'reverse'],
});
const AVAILABLE_YESNO = Object.freeze({ all: ['instant', 'paper', 'race', 'broadcast'], result: ['instant'] });

/** @param {string} type @param {string} visibility @returns {Mode[]} */
export function availableModes(type, visibility) {
  if (type === 'yesno') return /** @type {Mode[]} */ ([...(AVAILABLE_YESNO[/** @type {'all'} */ (visibility)] ?? AVAILABLE_YESNO.all)]);
  return /** @type {Mode[]} */ ([...(AVAILABLE[/** @type {'all'} */ (visibility)] ?? AVAILABLE.all)]);
}

/** 고를 수 없는 조합의 이유(만들기 화면 안내). 고를 수 있으면 null. @param {string} type @param {string} visibility @param {string} mode */
export function modeBlockedReason(type, visibility, mode) {
  if (availableModes(type, visibility).includes(/** @type {Mode} */ (mode))) return null;
  if (type === 'yesno') {
    if (visibility === 'result') return '결과만 공개할 때는 바로 결과로만 발표해요.';
    return '찬반은 두 가지뿐이라 카드 공개가 어울리지 않아요.';
  }
  if (mode === 'race') return '레이스는 득표 차이가 거리로 보여서 숫자를 숨길 수 없어요.';
  if (mode === 'paper') return '한 장씩 펼치면 표 수가 모두 보여서 숫자를 숨길 수 없어요.';
  if (mode === 'broadcast') return '개표 방송은 득표율을 보여 줘서 숫자를 숨길 수 없어요.';
  if (mode === 'pick') return '당선자만 공개할 때는 다른 후보 카드를 열 수 없어요.';
  return '이 공개 범위와 함께 쓸 수 없어요.';
}

// ── 작은 도우미 ──
const CONTROL = /[\u0000-\u001f\u007f]/g;
/** 제어 문자를 빼고 코드포인트 기준으로 자릅니다. @param {unknown} v @param {number} max */
export function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return Array.from(v.replace(CONTROL, '')).slice(0, max).join('');
}
/** @param {string} s */
export const codeLength = (s) => Array.from(s).length;
/** @param {unknown} v @param {number} min @param {number} max @param {number} fallback */
function int(v, min, max, fallback) {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}
/** @param {unknown} v @param {boolean} fallback */
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
/** @template T @param {unknown} v @param {readonly T[]} list @param {T} fallback @returns {T} */
const oneOf = (v, list, fallback) => (list.includes(/** @type {T} */ (v)) ? /** @type {T} */ (v) : fallback);
const ID = /^[a-z]_[0-9a-z]{1,16}$|^[a-z][0-9a-z_-]{0,23}$/i;
/** @param {unknown} v */
const validId = (v) => typeof v === 'string' && ID.test(v);

/** 이름 글자 수 한도(방식별). @param {string} type */
export const nameLimit = (type) => (type === 'opinion' ? LIMITS.opinionNameMax : LIMITS.nameMax);

// ── 기본값 ──
/** @returns {Rules} */
export function defaultRules() {
  return { voters: 25, votesPerVoter: 1, allowRepeat: false, allowAbstain: true, seats: 1, passRule: 'yesOverNo' };
}
/** @param {VoteType} [type] @returns {Config} */
export function defaultConfig(type = 'candidate') {
  return {
    type,
    title: '',
    items: [],
    agendas: [],
    rules: defaultRules(),
    reveal: { mode: 'paper', visibility: 'all' },
    tutorial: { enabled: true, speed: 'slow', speech: true },
    speechContent: normalizeSpeechContent(null, { items: [], agendas: [] }),
  };
}
export function defaultPrefs() {
  // music: 배경 음악(music.js). 한 화면에서 끄면 다른 화면·다음에 열 때도 꺼진 채로 있도록 여기(prefs 구역)에 저장합니다.
  return { volume: 70, muted: false, speech: true, speechVoice: 'female', reduced: false, lastVoters: 25, music: true };
}
/** 진행 중 투표가 없을 때의 session 구역 값(Rust 저장소는 객체만 받으므로 null 대신 이것을 씁니다). */
export const EMPTY_SESSION = Object.freeze({ id: null });

// ── 정규화 ──
/** @param {unknown} raw @param {number} index @param {string} type @returns {Item|null} */
function normalizeItem(raw, index, type) {
  const r = /** @type {any} */ (raw);
  if (!r || typeof r !== 'object') return null;
  return {
    id: validId(r.id) ? r.id : `i${index + 1}`,
    number: int(r.number, 1, 9, index + 1),
    name: cleanText(r.name, nameLimit(type)),
    gender: type === 'candidate' && (r.gender === 'm' || r.gender === 'f') ? r.gender : null,
    character: type === 'candidate' && typeof r.character === 'string' ? r.character : null,
    color: typeof r.color === 'string' ? r.color : null,
    pattern: type === 'opinion' && typeof r.pattern === 'string' ? r.pattern : null,
    intro: cleanText(r.intro, LIMITS.introMax),
  };
}

/** 설정(만들기 결과) 정규화. 잘못된 값은 기본값으로, 캐릭터·색·무늬 중복은 바로잡습니다.
 * @param {unknown} raw @param {string} [seed] 캐릭터 섞는 순서의 씨앗(투표 id) @returns {Config} */
export function normalizeConfig(raw, seed = '') {
  const r = /** @type {any} */ (raw ?? {});
  const type = oneOf(r.type, TYPES, 'candidate');
  const d = defaultConfig(type);
  /** @type {Item[]} */
  let items = [];
  if (type !== 'yesno' && Array.isArray(r.items)) {
    items = r.items.slice(0, LIMITS.itemsMax).map((/** @type {unknown} */ x, /** @type {number} */ i) => normalizeItem(x, i, type)).filter(/** @returns {x is Item} */ (/** @type {Item|null} */ x) => !!x);
    // id·번호가 겹치면 뒤쪽을 순서대로 다시 매깁니다(키 하나가 두 후보를 가리키면 안 됨).
    const ids = new Set();
    items.forEach((it, i) => {
      if (ids.has(it.id)) it.id = `i${i + 1}_${i}`;
      ids.add(it.id);
    });
    const numbers = items.map((it) => it.number);
    if (new Set(numbers).size !== numbers.length) items.forEach((it, i) => (it.number = i + 1));
    items = repairItems(items, type, seed);
  }
  /** @type {Agenda[]} */
  const agendas = type === 'yesno' && Array.isArray(r.agendas)
    ? r.agendas.slice(0, LIMITS.agendasMax).map((/** @type {any} */ a, /** @type {number} */ i) => ({ id: validId(a?.id) ? a.id : `a${i + 1}`, text: cleanText(a?.text, LIMITS.agendaMax) }))
    : [];
  // 안건 id가 겹치면 뒤쪽을 다시 매깁니다. 화면 목록이 id로 칸을 구분하므로 겹치면 그리기가 멈춥니다(후보 id와 같은 규칙).
  const agendaIds = new Set();
  agendas.forEach((a, i) => {
    if (agendaIds.has(a.id)) a.id = `a${i + 1}_${i}`;
    agendaIds.add(a.id);
  });
  const rr = r.rules ?? {};
  const rules = {
    voters: int(rr.voters, LIMITS.votersMin, LIMITS.votersMax, d.rules.voters),
    votesPerVoter: type === 'yesno' ? 1 : int(rr.votesPerVoter, LIMITS.votesMin, LIMITS.votesMax, 1),
    allowRepeat: type === 'yesno' ? false : bool(rr.allowRepeat, false),
    allowAbstain: bool(rr.allowAbstain, true),
    seats: type === 'yesno' ? 1 : int(rr.seats, LIMITS.seatsMin, LIMITS.seatsMax, 1),
    passRule: oneOf(rr.passRule, PASS_RULES, 'yesOverNo'),
  };
  const visibility = oneOf(r.reveal?.visibility, VISIBILITIES[type], 'all');
  const allowed = availableModes(type, visibility);
  const mode = oneOf(r.reveal?.mode, allowed, allowed.includes('paper') ? 'paper' : 'instant');
  const tutorial = {
    enabled: bool(r.tutorial?.enabled, true),
    speed: oneOf(r.tutorial?.speed, SPEEDS, 'slow'),
    speech: bool(r.tutorial?.speech, true),
  };
  return { type, title: cleanText(r.title, LIMITS.titleMax), items, agendas, rules, reveal: { mode, visibility }, tutorial, speechContent: normalizeSpeechContent(r.speechContent, { items, agendas }) };
}

/** 표 하나 정규화. 후보·의견은 있는 항목 id만, 찬반은 안건 수만큼 y·n·a. @returns {Ballot|null} */
function normalizeBallot(/** @type {any} */ raw, /** @type {Config} */ config, /** @type {Set<string>} */ itemIds) {
  if (!raw || typeof raw !== 'object' || !validId(raw.id) || !Array.isArray(raw.p)) return null;
  if (config.type === 'yesno') {
    if (raw.p.length !== config.agendas.length || !raw.p.every((/** @type {unknown} */ x) => x === 'y' || x === 'n' || x === 'a')) return null;
    return { id: raw.id, p: [...raw.p], a: 0 };
  }
  const p = raw.p.filter((/** @type {unknown} */ x) => typeof x === 'string' && itemIds.has(x));
  if (p.length !== raw.p.length) return null;
  const a = int(raw.a, 0, LIMITS.votesMax, 0);
  // 한 표의 칸 수(고른 표 + 기권) = 1인 표 수여야 합니다.
  if (p.length + a !== config.rules.votesPerVoter) return null;
  if (!config.rules.allowRepeat && new Set(p).size !== p.length) return null;
  return { id: raw.id, p, a };
}

/** @param {unknown} raw @returns {Session|typeof EMPTY_SESSION} */
export function normalizeSession(raw) {
  const r = /** @type {any} */ (raw);
  if (!r || typeof r !== 'object' || !validId(r.id)) return EMPTY_SESSION;
  const config = normalizeConfig(r, r.id);
  const itemIds = new Set(config.items.map((it) => it.id));
  /** @type {Ballot[]} */
  const ballots = [];
  const seen = new Set();
  if (Array.isArray(r.ballots)) {
    for (const b of r.ballots) {
      const ok = normalizeBallot(b, config, itemIds);
      if (ok && !seen.has(ok.id) && ballots.length < LIMITS.votersMax) {
        seen.add(ok.id);
        ballots.push(ok);
      }
    }
  }
  // 이미 받은 표보다 인원이 적으면 인원을 표 수에 맞춥니다(표를 버리지 않음).
  config.rules.voters = Math.max(config.rules.voters, ballots.length, LIMITS.votersMin);
  const phase = oneOf(r.phase, PHASES, 'ready');
  const ballotIds = new Set(ballots.map((b) => b.id));
  /** @type {Counting|null} */
  let counting = null;
  if (r.counting && typeof r.counting === 'object' && (phase === 'closed' || phase === 'counting' || phase === 'done')) {
    const order = Array.isArray(r.counting.order) ? r.counting.order.filter((/** @type {unknown} */ id) => typeof id === 'string' && ballotIds.has(id)) : [];
    // 개표 순서가 표 목록과 어긋나면(손상) 저장된 표 순서를 그대로 씁니다. 표는 이미 무작위 위치에 들어가 있습니다.
    const valid = order.length === ballots.length && new Set(order).size === order.length;
    counting = {
      order: valid ? order : ballots.map((b) => b.id),
      cursor: int(r.counting.cursor, 0, 100000, 0),
      agenda: int(r.counting.agenda, 0, Math.max(0, config.agendas.length - 1), 0),
      revealed: Array.isArray(r.counting.revealed) ? r.counting.revealed.filter((/** @type {unknown} */ id) => typeof id === 'string' && itemIds.has(id)) : [],
    };
  }
  return {
    ...config,
    id: r.id,
    createdOn: typeof r.createdOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.createdOn) ? r.createdOn : '',
    phase: (phase === 'counting' || phase === 'done') && !counting ? 'closed' : phase,
    ballots,
    lastBallotId: typeof r.lastBallotId === 'string' && ballotIds.has(r.lastBallotId) ? r.lastBallotId : null,
    counting,
    runoffOf: typeof r.runoffOf === 'string' && validId(r.runoffOf) ? r.runoffOf : null,
    round: int(r.round, 0, 20, 0),
  };
}

/** @param {unknown} raw */
export function normalizeDraft(raw) {
  const r = /** @type {any} */ (raw);
  if (!r || typeof r !== 'object' || !r.config) return { config: null, step: 0, seed: '', templateId: '' };
  const seed = typeof r.seed === 'string' ? cleanText(r.seed, 24) : '';
  return {
    config: normalizeConfig(r.config, seed),
    step: int(r.step, 0, 3, 0),
    seed,
    templateId: typeof r.templateId === 'string' ? cleanText(r.templateId, 24) : '',
  };
}

/** @param {unknown} raw */
export function normalizePrefs(raw) {
  const r = /** @type {any} */ (raw ?? {});
  const d = defaultPrefs();
  return {
    volume: int(r.volume, 0, 100, d.volume),
    muted: bool(r.muted, d.muted),
    speech: bool(r.speech, d.speech),
    speechVoice: oneOf(r.speechVoice, ['female', 'male'], 'female'),
    reduced: bool(r.reduced, d.reduced),
    lastVoters: int(r.lastVoters, LIMITS.votersMin, LIMITS.votersMax, d.lastVoters),
    music: bool(r.music, d.music),
  };
}

/** 오늘 날짜(기기 시간대) YYYY-MM-DD. @param {Date} [now] */
export function todayString(now = new Date()) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 날짜 표시: 'YYYY-MM-DD' → '2026년 9월 24일'(short면 '9월 24일'). 형식이 다르면 그대로.
 * @param {string} d @param {boolean} [short] */
export function dateLabel(d, short = false) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const md = `${Number(m[2])}월 ${Number(m[3])}일`;
  return short ? md : `${m[1]}년 ${md}`;
}

/** 만들기 설정으로 새 투표(session)를 만듭니다. 이름 앞뒤 공백은 이때 정리합니다.
 * @param {Config} config @param {string} id @param {string} createdOn @returns {Session} */
export function sessionFromConfig(config, id, createdOn) {
  const c = normalizeConfig(config, id);
  return {
    ...c,
    title: c.title.trim(),
    items: c.items.map((it) => ({ ...it, name: it.name.trim(), intro: it.intro.trim() })),
    agendas: c.agendas.map((a) => ({ ...a, text: a.text.trim() })),
    id,
    createdOn,
    phase: 'ready',
    ballots: [],
    lastBallotId: null,
    counting: null,
    runoffOf: null,
    round: 0,
  };
}

/** 투표 한 사람이 고르는 칸 수(찬반은 안건 수). @param {Config} c */
export const slotsPerBallot = (c) => (c.type === 'yesno' ? c.agendas.length : c.rules.votesPerVoter);

/** 방식 이름. @param {string} type */
export const typeLabel = (type) => (type === 'yesno' ? '찬반 투표' : type === 'opinion' ? '의견 투표' : '후보 투표');
/** 항목을 부르는 말(후보·항목). @param {string} type */
export const itemNoun = (type) => (type === 'opinion' ? '항목' : '후보');

/** 받침에 맞는 조사를 붙입니다. 예: withJosa('항목', '을/를') → '항목을', withJosa('후보', '을/를') → '후보를'.
 * 숫자로 끝나면 읽는 소리(일·이·삼…)의 받침을 봅니다. @param {string} word @param {'을/를'|'이/가'|'은/는'|'과/와'|'으로/로'} pair */
export function withJosa(word, pair) {
  const [withBatchim, without] = pair.split('/');
  const last = word.at(-1) ?? '';
  const code = last.charCodeAt(0);
  let batchim = false;
  let rieul = false;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    batchim = jong !== 0;
    rieul = jong === 8;
  } else if (/[0-9]/.test(last)) {
    // 0 영 1 일 2 이 3 삼 4 사 5 오 6 육 7 칠 8 팔 9 구
    batchim = '013678'.includes(last);
    rieul = '178'.includes(last);
  }
  if (pair === '으로/로') return word + (batchim && !rieul ? withBatchim : without);
  return word + (batchim ? withBatchim : without);
}
