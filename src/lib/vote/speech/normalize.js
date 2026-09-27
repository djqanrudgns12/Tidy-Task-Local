// 표시 원문과 분리된 음성용 읽기 규칙입니다. 사용자 문장의 숫자는 임의로 바꾸지 않습니다.
const ONES = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
/** @param {number} n @param {string} unit */
export function nativeCount(n, unit) {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new RangeError('수량 범위를 확인해 주세요.');
  const tens = Math.floor(n / 10), ones = n % 10;
  return `${tens === 2 && ones === 0 ? '스무' : TENS[tens]}${ONES[ones]} ${unit}`;
}
/** @param {number} n */
export function sinoNumber(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new RangeError('숫자 범위를 확인해 주세요.');
  if (!n) return '영';
  return [[100, '백'], [10, '십'], [1, '']].map(([place, unit]) => {
    const value = Math.floor(n / Number(place)) % 10;
    return value ? `${value === 1 && place !== 1 ? '' : DIGITS[value]}${unit}` : '';
  }).join('');
}
/** @param {number} n */
export const candidateNumber = (n) => `기호 ${sinoNumber(n)} 번`;
/** @param {unknown} value */
export function spokenText(value) {
  return typeof value === 'string' ? value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}
/** @param {unknown} value @param {{title?:string,items:{id:string,name?:string}[],agendas:{id:string,text?:string}[]}} config */
export function normalizeSpeechContent(value, config) {
  const raw = /** @type {any} */ (value ?? {});
  const aliases = (/** @type {{id:string,name?:string,text?:string}[]} */ entries, /** @type {any} */ map, /** @type {any} */ sources) => Object.fromEntries(entries.map((entry) => [entry.id, sources?.[entry.id] !== undefined && sources[entry.id] !== (entry.name ?? entry.text ?? '') ? '' : Array.from(spokenText(map?.[entry.id])).slice(0, 80).join('')]).filter(([, text]) => text));
  const itemAliases = aliases(config.items, raw.itemAliases, raw.itemSources), agendaAliases = aliases(config.agendas, raw.agendaAliases, raw.agendaSources);
  return {
    version: 2, readDynamic: raw.readDynamic === true,
    titleAlias: raw.titleSource !== undefined && raw.titleSource !== config.title ? '' : Array.from(spokenText(raw.titleAlias)).slice(0, 80).join(''),
    titleSource: config.title ?? '', itemAliases, agendaAliases,
    itemSources: Object.fromEntries(config.items.filter((it) => itemAliases[it.id]).map((it) => [it.id, it.name ?? ''])),
    agendaSources: Object.fromEntries(config.agendas.filter((it) => agendaAliases[it.id]).map((it) => [it.id, it.text ?? ''])),
  };
}
