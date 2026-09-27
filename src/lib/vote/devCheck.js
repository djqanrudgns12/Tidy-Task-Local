// Temporary DEV-only result inspection. No store access; delete with dev/ResultCheck.svelte.
import { sessionFromConfig, todayString, availableModes, VISIBILITIES } from './model.js';
import { seededRandom, fisherYates, randomId } from './random.js';

export const CHECK_DEFAULTS = { type: 'candidate', count: 5, voters: 24, votes: 1, repeat: false, seats: 1, visibility: 'all', mode: 'paper', scenario: 'random', passRule: 'yesOverNo', longNames: false };
export const CHECK_PRESETS = [
  { label: '기본', patch: {} },
  { label: '최대 인원·긴 이름', patch: { count: 9, voters: 60, votes: 5, seats: 4, longNames: true, mode: 'race' } },
  { label: '1위 동률', patch: { scenario: 'tie', mode: 'reverse' } },
  { label: '당선 경계 동률', patch: { count: 3, seats: 2, scenario: 'boundary', mode: 'broadcast' } },
  { label: '모두 동률', patch: { count: 6, scenario: 'equal', mode: 'pick' } },
  { label: '전원 기권', patch: { scenario: 'abstain' } },
  { label: '몰아주기', patch: { type: 'opinion', votes: 5, repeat: true, scenario: 'landslide', mode: 'race' } },
  { label: '찬반 5개 안건', patch: { type: 'yesno', count: 5, scenario: 'mixed', mode: 'broadcast' } },
];

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
const integer = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
/** Keep controls within the same limits as the real wizard. @param {any} raw */
export function normalizeCheck(raw) {
  const o = { ...CHECK_DEFAULTS, ...raw };
  if (!['candidate', 'opinion', 'yesno'].includes(o.type)) o.type = 'candidate';
  const scenarios = ['random', 'landslide', 'tie', 'equal', 'abstain', ...(o.type === 'yesno' ? ['fail', 'threshold', 'mixed'] : ['boundary'])];
  if (!scenarios.includes(o.scenario)) o.scenario = 'random';
  o.count = integer(o.count, o.type === 'yesno' ? 1 : 2, o.type === 'yesno' ? 5 : 9, 5);
  o.voters = integer(o.voters, 2, 60, 24);
  o.votes = o.type === 'yesno' ? 1 : integer(o.votes, 1, o.repeat ? 5 : Math.min(5, o.count - 1), 1);
  o.seats = integer(o.seats, 1, Math.min(4, Math.max(1, o.count - 1)), 1);
  if (!VISIBILITIES[/** @type {import('./model.js').VoteType} */ (o.type)].includes(o.visibility)) o.visibility = 'all';
  const modes = availableModes(o.type, o.visibility);
  if (!modes.includes(o.mode)) o.mode = modes[0];
  return o;
}

/** Generate valid anonymous ballots, then use the real tally/rendering pipeline. @param {any} raw @param {string} [seed] */
export function createCheckEntry(raw, seed = 'check') {
  const o = normalizeCheck(raw);
  const rng = seededRandom(seed);
  const names = ['김하늘', '이도윤', '박서아', '최준우', '정다은', '강민재', '조예린', '윤시우', '장하윤'];
  const opinions = ['놀이공원', '과학관', '수목원', '박물관', '동물원', '영화관', '미술관', '체육관', '도서관'];
  const yesno = o.type === 'yesno';
  const config = sessionFromConfig({
    type: o.type, title: o.type === 'candidate' ? '학급 회장 선거' : o.type === 'opinion' ? '체험학습 장소 정하기' : '학급회의 안건',
    items: yesno ? [] : Array.from({ length: o.count }, (_, i) => ({ id: `i${i + 1}`, number: i + 1, name: o.longNames ? (o.type === 'candidate' ? `아주긴이름의점검후보자${i + 1}` : `우리반이함께떠나는현장체험장소${i + 1}`) : (o.type === 'candidate' ? names[i] : opinions[i]), gender: i % 2 ? 'm' : 'f', character: null, color: null, pattern: null, intro: '점검용 자동 생성 후보' })),
    agendas: yesno ? Array.from({ length: o.count }, (_, i) => ({ id: `a${i + 1}`, text: o.longNames ? `${i + 1}번 안건: 우리 반이 함께 정하는 학급 생활 규칙을 다음 달부터 적용하기` : `${i + 1}번 안건 · 학급 생활 규칙` })) : [],
    rules: { voters: o.voters, votesPerVoter: o.votes, allowRepeat: o.repeat, allowAbstain: true, seats: o.seats, passRule: o.passRule },
    reveal: { visibility: o.visibility, mode: o.mode }, tutorial: { enabled: false, speech: false, speed: 'normal' },
  }, randomId('devcheck'), todayString());
  const slots = config.rules.votesPerVoter;
  const group = o.scenario === 'tie' ? 2 : o.count;
  const perBallot = o.repeat ? slots : Math.min(slots, group);
  const equalSlots = Math.floor(o.voters * perBallot / group) * group;
  const ballots = Array.from({ length: o.voters }, (_, n) => {
    if (yesno) {
      const p = config.agendas.map((_, k) => {
        const scenario = o.scenario === 'mixed' ? ['landslide', 'fail', 'tie', 'abstain', 'threshold'][k % 5] : o.scenario;
        if (scenario === 'abstain') return 'a';
        if (scenario === 'landslide') return 'y';
        if (scenario === 'fail') return 'n';
        if (scenario === 'tie' || scenario === 'equal') return n < 2 * Math.floor(o.voters / 2) ? (n % 2 ? 'n' : 'y') : 'a';
        if (scenario === 'threshold') return n < (o.passRule === 'twoThirds' ? Math.ceil(o.voters * 2 / 3) : Math.floor(o.voters / 2) + 1) ? 'y' : 'n';
        return rng() < 0.1 ? 'a' : rng() < 0.6 ? 'y' : 'n';
      });
      return { id: `b${n + 1}`, p, a: 0 };
    }
    /** @type {string[]} */ const p = [];
    for (let slot = 0; slot < slots; slot++) {
      let index = -1;
      if (o.scenario === 'tie' || o.scenario === 'equal') {
        const position = n * perBallot + slot;
        if (slot < perBallot && position < equalSlots) index = position % group;
      } else if (o.scenario === 'boundary') {
        // Preset: 24 people, one vote, 2 seats => 12 / 6 / 6.
        index = n < Math.floor(o.voters / 2) ? 0 : 1 + n % Math.min(2, o.count - 1);
      } else if (o.scenario === 'landslide') index = o.repeat ? 0 : slot;
      else if (o.scenario !== 'abstain') {
        const eligible = config.items.map((_, i) => i).filter(i => o.repeat || !p.includes(config.items[i].id));
        if (rng() >= 0.1 && eligible.length) index = eligible[Math.floor(rng() * eligible.length)];
      }
      const id = config.items[index]?.id;
      if (id && (o.repeat || !p.includes(id))) p.push(id);
    }
    return { id: `b${n + 1}`, p, a: slots - p.length };
  });
  return { id: config.id, config, finishedOn: todayString(), ballots: fisherYates(ballots, rng), runoffs: [] };
}
