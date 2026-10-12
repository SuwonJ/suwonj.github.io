import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, safeHttpUrl } from '../components/safe-html.js';

test('HTML escaping protects text and quoted attribute boundaries', () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('x')">&`),
    '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml('한국어 · $x^2$'), '한국어 · $x^2$');
});
test('links used by templates accept HTTP(S) but reject script URLs', () => {
  assert.equal(safeHttpUrl('https://example.com/file.pdf'), 'https://example.com/file.pdf');
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('data:image/svg+xml,<svg/>'), '');
  assert.equal(safeHttpUrl(''), '');
});
