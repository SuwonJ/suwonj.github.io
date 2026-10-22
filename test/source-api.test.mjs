import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSourceServer } from '../services/source-api/server.mjs';

async function fixture(t, options = {}) {
  const state = { text: '= 한글\r\n\t  $ x $\n\n', visibility: 'public', author: '123', deleted: false, calls: [], ...options.state };
  const fetchImpl = async (url, opts) => {
    state.calls.push({ url, opts });
    assert.ok(url.startsWith('https://maximux.suwonmars.com/api/v1/statuses/'));
    if (state.throw) throw Error('secret should never appear');
    if (state.deleted) return new Response('{}', { status: 404 });
    if (url.endsWith('/source')) {
      assert.equal(opts.headers.Authorization, 'Bearer secret');
      if (state.sourceError) return new Response('{}', { status: state.sourceError });
      if (state.race) state.visibility = 'private';
      return Response.json({ id: '1', text: state.text });
    }
    assert.equal(opts.headers.Authorization, undefined);
    return Response.json({ id: '1', account: { id: state.author }, visibility: state.visibility, content: 'html', edited_at: null });
  };
  const server = createSourceServer({ token: 'secret', accountId: '123', fetchImpl,
    probeId: '1', probeSha256: createHash('sha256').update(state.text).digest('hex'), ...options.server });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (path = '/status/1', init) => fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
  return { state, request };
}
test('public own source is exact, uncached, app auth only on source; updates/deletes are immediate', async t => {
  const { state, request } = await fixture(t);
  const r = await request('/status/1', { headers: { Origin: 'https://suwonmars.com' } });
  assert.equal(r.status, 200); assert.equal((await r.json()).text, state.text);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://suwonmars.com');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(state.calls.length, 3);
  state.text = '# Markdown\n\n수정\t';
  assert.equal((await (await request()).json()).text, state.text);
  state.deleted = true; assert.equal((await request()).status, 404);
});
test('other author and every non-public visibility are denied before source access', async t => {
  for (const state of [{ author: '456' }, ...['private', 'unlisted', 'direct'].map(visibility => ({ visibility }))]) {
    const f = await fixture(t, { state });
    assert.equal((await f.request()).status, 404);
    assert.equal(f.state.calls.length, 1);
  }
});
test('reply chunk uses the same guard; privacy change during source fetch is denied', async t => {
  const f = await fixture(t, { state: { race: true } });
  assert.equal((await f.request()).status, 404);
});
test('health checks known exact source and fails closed on edits or missing verification', async t => {
  const f = await fixture(t);
  assert.equal((await (await f.request('/health')).json()).ready, true);
  f.state.text += 'edit'; assert.equal((await f.request('/health')).status, 503);
  const missing = await fixture(t, { server: { probeSha256: '' } });
  assert.equal((await missing.request('/health')).status, 503);
});
test('GET only, strict IDs, CORS and global bounded rate limiting', async t => {
  const f = await fixture(t, { server: { rateLimit: 6 } });
  assert.equal((await f.request('/status/%2Fhealth')).status, 404);
  assert.equal((await f.request('/status/0')).status, 404);
  assert.equal((await f.request('/status/1?url=https://evil.example')).status, 404);
  assert.equal((await f.request('/status/1', { method: 'POST' })).status, 405);
  assert.equal((await f.request('/status/1', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const r = await f.request(); assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal((await f.request()).status, 429);
});
test('upstream auth/network errors and oversized responses never leak secrets or content', async t => {
  for (const state of [{ sourceError: 401 }, { throw: true }, { text: 'x'.repeat(300000) }]) {
    const f = await fixture(t, { state }); const r = await f.request();
    assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: 'source_unavailable' });
  }
});

test('upstream timeout is bounded and redirect is never followed', async t => {
  const f = await fixture(t, { server: { timeoutMs: 20, fetchImpl: async (url, options) => {
    assert.equal(options.redirect, 'error');
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } } });
  const start = Date.now();
  assert.equal((await f.request()).status, 502);
  assert.ok(Date.now() - start < 1000);
});
