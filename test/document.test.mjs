import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDocument } from '../components/document.js';
import { splitSourceThread, readTextChunk, readableMetadataTags, joinSourceThread, decodeSourceThread } from '../components/source-thread.js';
test('first nonblank line selects format and title without changing source', () => {
  for (const [source, format, title] of [
    ['\n\r\n= 한글 제목\r\n\r\n== 소제목', 'typst', '한글 제목'],
    ['# Markdown 제목\n\n본문', 'markdown', 'Markdown 제목'],
    ['#set text(lang: "ko")\n= 제목', 'markdown', ''],
    ['== 소제목', 'markdown', '== 소제목'],
    ['plain text\n= later', 'markdown', 'plain text']
  ]) {
    const result = inspectDocument(source);
    assert.equal(result.format, format); assert.equal(result.title, title); assert.equal(result.source, source);
  }
  assert.equal(inspectDocument('본문', '기존 CW').title, '기존 CW');
});
test('public source envelopes preserve UTF-8, CRLF, whitespace, math, code and metadata-like body', () => {
  const source = '\n= 한글 😀 <제목>\r\n\n  들여쓰기\t  \r\n' +
    '#let x = "<&>\\\\\""\n$ sum_(i=1)^n i $\n```typ\n#comment\n```\n\n#blog\n\n'.repeat(80);
  const chunks = splitSourceThread(source, '#research #수학', 488);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 488));
  assert.ok(chunks[0].endsWith('#research #수학'));
  assert.ok(chunks.slice(1).every(chunk => !chunk.endsWith('#research #수학')));
  assert.ok(chunks.join('').includes('들여쓰기'));
  assert.ok(!chunks.join('').includes('SULOG-SOURCE/1'));
  assert.equal(joinSourceThread(chunks.map((chunk, i) => i ? '\u2063\u2063' + chunk : chunk)), source);
  assert.equal(readTextChunk(chunks[0]).index, 1);
  assert.throws(() => joinSourceThread(chunks.slice(0, -1)), /누락/);
  assert.throws(() => joinSourceThread([chunks[0], chunks[0]]), /누락/);
  const changed = [...chunks]; changed[1] = changed[1].replace(/\n./, '\nA');
  assert.throws(() => joinSourceThread(changed));
});

test('legacy Base64 fixture stays readable; incomplete input fails', () => {
  const text = 'SULOG-SOURCE/1 1/1 39472c38\nPSDquLDsobQgVHlwc3QKCu2VnOq4gCAkIHheMiAkDQoJ64GdICA=\n\n#blog';
  assert.equal(decodeSourceThread([text]), '= 기존 Typst\n\n한글 $ x^2 $\r\n\t끝  ');
  assert.throws(() => decodeSourceThread([text.replace('1/1', '1/2')]));
});

test('boundaries preserve whitespace, literal markers and surrogate pairs', () => {
  for (const source of ['\u2063\u2063= 제목\r\n\t  ', ' \r\n= 제목\r\n\r\n', '= 제목\n' + '😀한\t\r\n'.repeat(200)]) {
    const chunks = splitSourceThread(source, '#blog', 150).map((c, i) => i ? '\u2063\u2063' + c : c);
    assert.equal(joinSourceThread(chunks), source);
    if (chunks.length > 1) assert.throws(() => joinSourceThread([chunks[0], ...chunks.slice(2)]));
    assert.throws(() => joinSourceThread(chunks.map((c, i) => i ? c : c.replace('제목', '변경'))));
  }
});

test('v2 metadata footer remains separate from body hashtags', () => {
  const [text] = splitSourceThread('= Title\n\n#tmp #research #body', '#blog #math', 488);
  assert.deepEqual(readableMetadataTags(text + '\n\n'), ['blog', 'math']);
  assert.equal(readableMetadataTags('legacy body\n\n#blog'), null);
});
