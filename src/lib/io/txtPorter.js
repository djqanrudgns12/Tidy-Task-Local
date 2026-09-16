// ═══════════════════════════════════════════════════════════════════
// [TXT 내보내기/가져오기 형식] (순수 함수)
//
// 형식 (5.0.0과 동일):
//   === Tidy Task 내보내기 ===
//   [할 일 목록]      - [YYYY-MM-DD] 내용
//   [마감된 일]       - [YYYY-MM-DD] 내용
//   [중요한 일 메모]  여러 줄 텍스트
//   ===========================
//
// 5.0.2 개선: 메모의 줄바꿈을 보존합니다.
//   예전에는 메모 전체를 한 줄로 합쳐 내보내서, 백업 파일로 되돌려도 문단이 모두 붙어 버렸습니다.
//   예전 버전이 만든 TXT(메모 한 줄)도 그대로 읽을 수 있습니다.
// ═══════════════════════════════════════════════════════════════════

export const TXT_HEADER = '=== Tidy Task 내보내기 ===';
export const SECTION_TODO = '[할 일 목록]';
export const SECTION_DONE = '[마감된 일]';
export const SECTION_NOTES = '[중요한 일 메모]';
export const SECTION_END = '===========================';
export const EMPTY_MARK = '(없음)';

/** @type {Record<string, string>} */
const NAMED_ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** @param {string} text */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (/** @type {string} */ match, /** @type {string} */ code) => {
    if (code[0] === '#') {
      const num = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** @param {unknown} text */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 편집기 HTML을 "줄 목록"으로 바꿉니다. (문단 div·p·줄바꿈 br을 줄 경계로 봅니다)
/** @param {unknown} html @returns {string[]} */
export function htmlToLines(html) {
  if (!html) return [];
  const text = decodeEntities(
    String(html)
      // 문단 끝의 <br>은 빈 줄을 만들지 않으므로 먼저 지웁니다 (<div><br></div> = 빈 줄 1개)
      .replace(/<br\s*\/?>(\s*<\/(?:div|p|li)>)/gi, '$1')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<(?:div|p|li)(?:\s[^>]*)?>/gi, '\n')
      .replace(/<[^>]*>?/g, ''),
  )
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/ /g, ' ');

  const lines = text.split('\n').map((line) => line.replace(/\s+$/, ''));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

// 줄 목록을 편집기 HTML로 바꿉니다. (편집기가 스스로 만드는 모양: 첫 줄 + 나머지 줄은 div)
/** @param {string[]} lines */
export function linesToHtml(lines) {
  if (!lines || lines.length === 0) return '';
  const [first, ...rest] = lines;
  return escapeHtml(first) + rest.map((line) => (line ? `<div>${escapeHtml(line)}</div>` : '<div><br></div>')).join('');
}

/**
 * 내보내기 문자열을 만듭니다.
 * @param {{ todos: {text: string, deadline?: string}[], archived: {text: string, deadline?: string}[], notesLines: string[] }} data
 *   todos/archived의 text는 이미 한 줄짜리 순수 텍스트여야 합니다.
 */
export function buildExportText({ todos, archived, notesLines }) {
  /** @param {{ text: string, deadline?: string }} t */
  const itemLine = (t) => `- ${t.deadline ? `[${t.deadline}] ` : ''}${t.text}`;
  const lines = [TXT_HEADER, ''];

  lines.push(SECTION_TODO);
  if (todos.length === 0) lines.push(EMPTY_MARK);
  else todos.forEach((t) => lines.push(itemLine(t)));
  lines.push('');

  lines.push(SECTION_DONE);
  if (archived.length === 0) lines.push(EMPTY_MARK);
  else archived.forEach((t) => lines.push(itemLine(t)));
  lines.push('');

  lines.push(SECTION_NOTES);
  if (notesLines.length === 0) lines.push(EMPTY_MARK);
  else lines.push(...notesLines);
  lines.push('');
  lines.push(SECTION_END);

  return lines.join('\n');
}

// 내보낸 TXT를 읽어 할 일·마감된 일·메모 줄로 나눕니다.
/** @param {unknown} content */
export function parseExportText(content) {
  /** @type {{ text: string, deadline: string }[]} */
  const todos = [];
  /** @type {{ text: string, deadline: string }[]} */
  const archived = [];
  /** @type {string[]} */
  const notesLines = [];
  let mode = null;

  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    if (line.startsWith(SECTION_TODO)) { mode = 'todo'; continue; }
    if (line.startsWith(SECTION_DONE)) { mode = 'done'; continue; }
    if (line.startsWith(SECTION_NOTES)) { mode = 'notes'; continue; }
    if (line.startsWith(SECTION_END)) { mode = null; continue; }
    if (line.startsWith('=== Tidy Task')) continue;

    if (mode === 'todo' || mode === 'done') {
      if (!line.startsWith('- ')) continue;
      let text = line.slice(2).trim();
      let deadline = '';
      // ✨ 줄 시작 부분의 [YYYY-MM-DD] 패턴을 마감일로 분리합니다.
      const dateMatch = text.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.*)/);
      if (dateMatch) {
        deadline = dateMatch[1];
        text = dateMatch[2];
      }
      (mode === 'todo' ? todos : archived).push({ text, deadline });
    } else if (mode === 'notes') {
      if (line !== EMPTY_MARK) notesLines.push(line);
    }
  }

  // 메모 앞뒤의 빈 줄은 형식상 구분선이므로 뺍니다.
  while (notesLines.length && !notesLines[0].trim()) notesLines.shift();
  while (notesLines.length && !notesLines[notesLines.length - 1].trim()) notesLines.pop();

  return { todos, archived, notesLines };
}
