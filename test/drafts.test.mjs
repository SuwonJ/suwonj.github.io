import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb, dbGet, dbSet, draftKey, readDraft, removeDraft } from '../components/drafts.js';
const local = new Map();
globalThis.localStorage = { getItem: key => local.get(key) || null, removeItem: key => local.delete(key) };
test('connection is reused and edited/new documents are isolated', async () => {
  assert.equal(await openDb(), await openDb());
  await dbSet(draftKey('post1'), { markdown: '수정 글' });
  await dbSet(draftKey(null), { markdown: '새 글' });
  assert.equal((await readDraft('post1')).markdown, '수정 글');
  assert.equal((await readDraft(null)).markdown, '새 글');
  await removeDraft('post1'); assert.equal(await readDraft('post1'), null);
});
test('legacy migration picks newer backup and publication cannot resurrect it', async () => {
  await removeDraft(null);
  local.set('sulog_admin_draft', JSON.stringify({ markdown: 'older', savedAt: 1 }));
  await dbSet('current-draft', { draft: { markdown: 'newer' }, savedAt: 2 });
  assert.equal((await readDraft(null)).markdown, 'newer');
  await removeDraft(null);
  assert.equal(await readDraft(null), null);
  assert.equal(await dbGet('current-draft'), null);
});
