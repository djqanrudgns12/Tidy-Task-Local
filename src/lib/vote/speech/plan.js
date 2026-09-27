import { CATALOG, CATALOG_VERSION } from './catalog.js';
import { candidateNumber, normalizeSpeechContent, spokenText } from './normalize.js';

/** @param {any} config @param {string} slideId */
export function speechPlan(config, slideId) {
  const type = config.type, r = config.rules;
  const content = normalizeSpeechContent(config.speechContent, config);
  const count = type === 'yesno' ? config.agendas.length : config.items.length;
  /** @param {string} id */
  const fixed = (id) => ({ id, text: CATALOG[id], dynamic: false });
  /** @param {string} id @param {string} text */
  const dynamic = (id, text) => ({ id, text: spokenText(text), dynamic: true });
  const keys = /** @type {Record<string,string[]>} */ ({
    today: [`today.${type}`, `voters.${r.voters}`],
    meet: [`count.${type}.${count}`, `screen.${type}`],
    line: ['line'], press: [`press.${type}`],
    multi: [`multi.${type}.${r.votesPerVoter}.${r.allowRepeat}`],
    agendas: [`agendas.${count}`],
    abstain: [type === 'yesno' ? `abstain.yesno${count === 1 ? '.single' : ''}` : `abstain.${type}${r.votesPerVoter > 1 ? '.multi' : ''}`],
    undo: ['undo'], secret: ['secret'], ready: [`ready.${type}`], preview: ['preview'],
  });
  const fallback = (keys[slideId] ?? []).map(fixed).filter((s) => !!s.text);
  let segments = fallback;
  if (content.readDynamic && slideId === 'today') {
    const title = spokenText(content.titleAlias || config.title);
    if (title) segments = [dynamic('title', `오늘의 투표 주제입니다. ${title}.`), fixed(`voters.${r.voters}`)];
  }
  if (content.readDynamic && slideId === 'meet') {
    const entries = type === 'yesno'
      ? config.agendas.map((/** @type {any} */ a, /** @type {number} */ i) => dynamic(a.id, `${['첫', '두', '세', '네', '다섯'][i]} 번째 안건입니다. ${content.agendaAliases[a.id] || a.text}.`))
      : [...config.items].sort((a, b) => a.number - b.number).map((it) => dynamic(it.id, `${candidateNumber(it.number)}. ${content.itemAliases[it.id] || it.name}.`));
    segments = [fixed(`count.${type}.${count}`), ...entries];
  }
  return { version: CATALOG_VERSION, slideId, segments, fallback };
}
