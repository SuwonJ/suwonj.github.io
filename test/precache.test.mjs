import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, 'write/precache.json'), 'utf8'));

test('precache manifest has no removed routes or duplicate entries', () => {
  assert.ok(!manifest.includes('/admin/index.html'));
  assert.equal(new Set(manifest).size, manifest.length);
});

test('every precache entry resolves to a real local file', async () => {
  for (const entry of manifest) {
    const pathname = new URL(entry, 'https://example.invalid').pathname;
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    assert.ok((await stat(file)).isFile(), `Missing offline asset: ${entry}`);
  }
});

test('precache versions match the writing app entrypoints', async () => {
  const html = await readFile(resolve(root, 'write/index.html'), 'utf8');
  const write = await readFile(resolve(root, 'write/write.js'), 'utf8');
  const admin = await readFile(resolve(root, 'admin/admin.js'), 'utf8');
  const preview = await readFile(resolve(root, 'components/preview.js'), 'utf8');
  const dependencies = [
    ['/write/write.js?v=24', html.includes('src="./write.js?v=24"')],
    ['/write/pdf.js?v=21', html.includes('src="./pdf.js?v=21"')],
    ['/write/page-mode.js?v=21', html.includes('src="./page-mode.js?v=21"')],
    ['/assets/studio-ui.css?v=24', html.includes('/assets/studio-ui.css?v=24')],
    ['/admin/admin.js?v=23', write.includes('../admin/admin.js?v=23')],
    ['/assets/editor.js?v=21', admin.includes('../assets/editor.js?v=21')],
    ['/assets/preview.js?v=21', admin.includes('../assets/preview.js?v=21')],
    ['/assets/preview-worker.js?v=20', preview.includes('/assets/preview-worker.js?v=20')]
  ];
  for (const [url, inSource] of dependencies) {
    assert.ok(inSource, `Update the expected app reference: ${url}`);
    assert.ok(manifest.includes(url), `Missing precache dependency: ${url}`);
  }
});
