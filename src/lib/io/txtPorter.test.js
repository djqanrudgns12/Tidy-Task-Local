import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExportText, htmlToLines, linesToHtml, parseExportText } from './txtPorter.js';

test('편집기 HTML의 문단·빈 줄·줄바꿈을 줄 목록으로 바꾼다', () => {
  assert.deepEqual(htmlToLines('첫 줄<div>둘째 줄</div><div><br></div><div>넷째 줄</div>'), ['첫 줄', '둘째 줄', '', '넷째 줄']);
  assert.deepEqual(htmlToLines('<div>a</div><div>b</div>'), ['a', 'b']);
  assert.deepEqual(htmlToLines('a<br>b'), ['a', 'b']);
  assert.deepEqual(htmlToLines('<p><span style="color:red">빨강</span> 글자</p>'), ['빨강 글자']);
});

test('문자 참조를 올바른 글자로 되돌리고, 폭 없는 공백은 지운다', () => {
  assert.deepEqual(htmlToLines('A &amp; B &lt;태그&gt; &quot;인용&quot;&nbsp;끝​'), ['A & B <태그> "인용" 끝']);
  assert.deepEqual(htmlToLines('&#54620;&#xAE00;'), ['한글']);
});

test('비어 있는 메모는 빈 목록', () => {
  assert.deepEqual(htmlToLines(''), []);
  assert.deepEqual(htmlToLines('<div><br></div>'), []);
  assert.deepEqual(htmlToLines('<br><br>'), []);
});

test('줄 목록 → HTML은 특수문자를 안전하게 바꾸고 다시 줄 목록으로 돌아온다', () => {
  const lines = ['a < b & c', '', '<b>굵게 아님</b>'];
  const html = linesToHtml(lines);
  assert.equal(html, 'a &lt; b &amp; c<div><br></div><div>&lt;b&gt;굵게 아님&lt;/b&gt;</div>');
  assert.deepEqual(htmlToLines(html), lines);
});

test('내보내기 → 가져오기 왕복 시 할 일·마감일·메모 줄바꿈이 보존된다', () => {
  const text = buildExportText({
    todos: [{ text: '보고서 제출', deadline: '2026-09-20' }, { text: '회의' }],
    archived: [{ text: '끝난 일', deadline: '' }],
    notesLines: ['1학기 정리', '', '- 준비물 챙기기'],
  });
  const parsed = parseExportText(text);
  assert.deepEqual(parsed.todos, [{ text: '보고서 제출', deadline: '2026-09-20' }, { text: '회의', deadline: '' }]);
  assert.deepEqual(parsed.archived, [{ text: '끝난 일', deadline: '' }]);
  assert.deepEqual(parsed.notesLines, ['1학기 정리', '', '- 준비물 챙기기']);
});

test('비어 있는 구역은 (없음)으로 내보내고, 가져올 때는 무시한다', () => {
  const text = buildExportText({ todos: [], archived: [], notesLines: [] });
  assert.equal(text.split('\n').filter((l) => l === '(없음)').length, 3);
  assert.deepEqual(parseExportText(text), { todos: [], archived: [], notesLines: [] });
});

test('5.0.0이 만든 TXT(메모 한 줄, CRLF)도 그대로 읽는다', () => {
  const legacy = [
    '=== Tidy Task 내보내기 ===', '',
    '[할 일 목록]', '- [2026-01-02] 새해 계획', '',
    '[마감된 일]', '(없음)', '',
    '[중요한 일 메모]', '한 줄로 합쳐진 메모', '',
    '===========================',
  ].join('\r\n');
  const parsed = parseExportText(legacy);
  assert.deepEqual(parsed.todos, [{ text: '새해 계획', deadline: '2026-01-02' }]);
  assert.deepEqual(parsed.archived, []);
  assert.deepEqual(parsed.notesLines, ['한 줄로 합쳐진 메모']);
});
