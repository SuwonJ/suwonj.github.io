import test from 'node:test';
import assert from 'node:assert/strict';
import { parser } from '@lezer/markdown';
import { mathMarkdown } from '../write/math-parser.js';
import { formatText, stripMetadataTags } from '../components/editor-tools.js';
import { renderMarkdown, renderMarkdownBlocks } from '../components/markdown-engine.js';
import { normalizeMarkdownMath } from '../components/content-dependencies.js';
const mathParser = parser.configure(mathMarkdown);
const nodes = text => {
  const result = []; mathParser.parse(text).iterate({ enter(node) { result.push(node.name); } }); return result;
};
test('long code fences never parse inner math/headings as prose', () => {
  const names = nodes('```js\n' + 'const x = 1;\n'.repeat(600) + '# title\n> quote\n$$\nx\n$$\n```');
  assert.ok(names.includes('FencedCode'));
  assert.ok(!names.includes('BlockMath')); assert.ok(!names.includes('ATXHeading1'));
});
test('math syntax preserves block, inline, escape and code context', () => {
  assert.ok(nodes('$$\na+b\n$$').includes('BlockMath'));
  assert.ok(nodes('cost $x$ and $$y$$').includes('InlineMath'));
  assert.ok(!nodes('`$x$` and \\$y\\$').includes('InlineMath'));
  assert.ok(nodes('$$\nunclosed').includes('BlockMath'));
});
test('metadata removal preserves comments, inline hashtags, unknown trailing tags', () => {
  const body = '본문 #tag\n\n```python\n#comment\n  print(1)\n```';
  assert.equal(stripMetadataTags(body + '\n\n#blog #tag', ['blog', 'tag']), body);
  assert.equal(stripMetadataTags(body, ['blog', 'tag']), body);
  assert.equal(stripMetadataTags('본문\n\n#unknown', ['blog']), '본문\n\n#unknown');
});
test('format placeholders expose exactly the editable body', () => {
  const result = formatText('bold', '한글');
  assert.equal(result.insert, '**한글**');
  assert.equal(result.insert.slice(result.from, result.to), '한글');
});
test('preview renders math without corrupting fenced code', () => {
  const html = renderMarkdown('$$\na+b\n$$\n\n```python\n#comment\n$$x$$\n```');
  assert.match(html, /katex/); assert.match(html, /#comment/); assert.match(html, /\$\$x\$\$/);
});

test('block rendering retains references and structured Markdown semantics', () => {
  const text = '# Heading\n\n[example][ref]\n\n[ref]: https://example.com\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n$x$';
  assert.equal(renderMarkdownBlocks(text).join(''), renderMarkdown(text));
  assert.equal(stripMetadataTags('본문\n\n#comment', ['comment']), '본문\n\n#comment');
});

test('IA display math survives an unmatched backtick in preceding LaTeX text', () => {
  const tick = String.fromCharCode(96);
  const iaExcerpt = [
    "엔트로피 $H(X|g=\\text{" + tick + "ㄴㅗㄴ'})$은 각 그룹의 엔트로피이다. ",
    "$$\\begin{align*}",
    "H(X|g)&=\\sum_f P(f)H(W_f) \\\\",
    "&=1",
    "\\end{align*}$$",
    "",
    "따라서 정보 이득은 다음과 같다.",
    "$$IG(g=\\text{" + tick + "ㄴㅗㄴ'}) = H(X)-H(X|g) = 1 \\text{bit}$$"
  ].join('\n');
  const normalized = normalizeMarkdownMath(iaExcerpt);
  assert.ok(normalized.includes("$$\n\\begin{align*}"));
  assert.ok(normalized.includes("$$\nIG(g="));
  assert.equal(normalizeMarkdownMath(normalized), normalized);
  const html = renderMarkdown(iaExcerpt);
  assert.ok((html.match(/katex-display/g) || []).length >= 2, 'both displays rendered');
  assert.ok(!html.includes('$$IG('));
});

test('inline code and fenced code remain unchanged', () => {
  const tick = String.fromCharCode(96);
  const input = ['Before ' + tick + '$$literal$$' + tick, '$$x$$', '', '~~~latex', '$$code$$', '~~~'].join('\n');
  const output = normalizeMarkdownMath(input);
  assert.ok(output.includes(tick + '$$literal$$' + tick));
  assert.ok(output.includes('~~~latex\n$$code$$\n~~~'));
  assert.ok(output.includes('$$\nx\n$$'));
});
