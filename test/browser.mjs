import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    let path = resolve('.' + new URL(req.url, 'http://localhost').pathname);
    if (!path.startsWith(resolve('.') + '/')) throw new Error('Invalid path');
    if ((await stat(path)).isDirectory()) path += '/index.html';
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(await readFile(path));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
async function waitFor(predicate) {
  const start=Date.now();
  while(!predicate()) { if(Date.now()-start>5000) throw new Error('Mock request did not start'); await new Promise(resolve=>setTimeout(resolve,20)); }
}
const errors = [], results = [];
const status = (id, title, text) => ({ id, visibility: 'public', spoiler_text: title, content: `<p>${text.replaceAll('\n','<br>')}</p>`, tags: [{name:'blog'}], account: {id:'116979319977947616'}, replies_count: 0, media_attachments: [], created_at:'2026-10-04T00:00:00Z' });
const posts = [status('1','첫 글','본문 A'),status('2','둘째 글','본문 B')];
let delayed = false, releaseSource, releaseMedia, releasePublish;
let pauseMedia = false, pausePublish = false;
const publishedSources = new Map(posts.map(post => [post.id, `원문 ${post.id}\n\n\`\`\`python\n#comment\n  print(1)\n\`\`\`\n\n#blog`]));
try {
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true, args: ['--no-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('mastodon_access_token', 'test-token');
    localStorage.setItem('sulog_admin_sidebar_open', 'false');
    localStorage.setItem('sulog_write_editor_mode', 'source');
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'source.suwonmars.com') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname === '/health' ? { ready: true, protocol: 'SULOG-TEXT/2', accountId: '116979319977947616' } : { id: url.pathname.split('/')[2], text: publishedSources.get(url.pathname.split('/')[2]) }) });
    if (url.hostname !== 'maximux.suwonmars.com') return route.fulfill({ status: 204, body: '' });
    const path = url.pathname;
    let data;
    if (path.includes('verify_credentials')) data = { id:'116979319977947616',acct:'test',avatar:'' };
    else if (path.endsWith('/statuses') && route.request().method() === 'GET') data = posts;
    else if (path.endsWith('/instance')) data = { configuration:{statuses:{max_characters:1000000}} };
    else if (path.endsWith('/media')) {
      if (pauseMedia) await new Promise(resolve => releaseMedia = resolve);
      data = { id:'media1',type:'image',url:'https://example.com/image.png' };
    } else if (route.request().method() === 'PUT' || (route.request().method() === 'POST' && path.endsWith('/statuses'))) {
      if (pausePublish) await new Promise(resolve => releasePublish = resolve);
      const body = new URLSearchParams(route.request().postData());
      data = status(path.endsWith('/statuses') ? '3' : path.split('/')[4], body.get('spoiler_text'), body.get('status'));
      publishedSources.set(data.id, body.get('status'));
    }
    else if (/\/statuses\/\d+\/source/.test(path)) {
      const id = path.split('/')[4];
      if (id === '1' && delayed) await new Promise(resolve => releaseSource = resolve);
      data = { id, text: `원문 ${id}\n\n\`\`\`python\n#comment\n  print(1)\n\`\`\`\n\n#blog` };
    } else if (/\/statuses\/\d+$/.test(path)) data = posts.find(post=>post.id===path.split('/')[4]);
    else if (path.includes('/context')) data = { descendants:[] };
    else data = {};
    await route.fulfill({ contentType:'application/json', body:JSON.stringify(data) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /plugin|initialization|preview|RangeError|Uncaught/i.test(message.text())) errors.push(message.text()); });
  const missingAdmin = await page.request.get(origin + '/admin/');
  assert.equal(missingAdmin.status(), 404);
  results.push('legacy admin route returns 404');
  await page.goto(origin + '/write/');
  await page.waitForFunction(() => window.sulogEditor);
  assert.equal(await page.locator('.brand-logo').count(), 0);
  assert.equal(await page.locator('#btn-toggle-sidebar .btn-text').count(), 0);
  assert.equal(await page.locator('#write-category').count(), 1);
  assert.equal(await page.locator('#posts-sidebar.collapsed').count(), 1);
  await page.locator('#write-category').selectOption('research');
  assert.equal(await page.locator('.cat-opt.active').getAttribute('data-cat'), 'research');
  await page.locator('#write-category').selectOption('blog');
  assert.equal(await page.locator('.cat-opt.active').getAttribute('data-cat'), 'blog');
  results.push('minimal write chrome and category selection');
  assert.equal(await page.locator('.cm-editor').count(), 1);
  const setDocument = async text => page.evaluate(text => {
    window.sulogEditor.replaceDocument(text);
    document.getElementById('editor-textarea').dispatchEvent(new Event('input', { bubbles:true }));
  }, text);
  await setDocument('입력 테스트');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End'); await page.keyboard.type(' abc');
  assert.equal(await page.evaluate(() => window.sulogEditor.value), '입력 테스트 abc');
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(() => window.sulogEditor.value), '입력 테스트');
  results.push('write editor input/undo');

  const mixed = '# 제목\n\n**강조**와 $x^2$\n\n$$\na+b\n$$\n\n```python\n' + 'x = 1\n'.repeat(600) + '#comment\n> source\n$$not_math$$\n```\n\n끝';
  await setDocument(mixed);
  await page.evaluate(() => window.sulogWriteEditor.dispatch({ selection:{anchor:window.sulogEditor.length} }));
  await page.locator('[data-write-mode=live]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.sulogWriteEditor.dispatch({ selection:{anchor:0}, scrollIntoView:true }));
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.cm-live-math-block').count());
  await page.locator('.cm-live-math-block').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.cm-live-math-block').count(), 0);
  assert.ok(await page.locator('.cm-content').innerText().then(text => text.includes('a+b')));
  await page.evaluate(() => {
    const view = window.sulogWriteEditor, pos = window.sulogEditor.value.indexOf('#comment');
    view.dispatch({ selection:{anchor:pos}, scrollIntoView:true });
  });
  await page.waitForTimeout(100);
  assert.ok((await page.locator('.cm-content').innerText()).includes('#comment'));
  assert.equal(await page.locator('.cm-live-h1').count(), 0);
  results.push('live block math edit and long fence context');

  await page.locator('[data-write-mode=source]').click();
  await setDocument('abc def');
  await page.evaluate(() => { window.sulogWriteEditor.dispatch({ selection:{anchor:7,head:4} }); window.sulogWriteEditor.focus(); });
  await page.keyboard.press('Control+b');
  assert.equal(await page.evaluate(() => window.sulogEditor.value), 'abc **def**');
  await page.keyboard.press('Control+z'); assert.equal(await page.evaluate(() => window.sulogEditor.value), 'abc def');
  await page.keyboard.press('Control+a');
  assert.deepEqual(await page.evaluate(() => ({from:window.sulogWriteEditor.state.selection.main.from,to:window.sulogWriteEditor.state.selection.main.to})),{from:0,to:7});
  results.push('reverse selection, formatting, undo, select all');

  const coordinates = await page.evaluate(() => {
    const v=window.sulogWriteEditor; v.dispatch({ selection:{anchor:3} });
    const c=v.coordsAtPos(3); return {x:c.left,y:(c.top+c.bottom)/2};
  });
  await page.mouse.click(coordinates.x,coordinates.y);
  assert.equal(await page.evaluate(() => window.sulogWriteEditor.state.selection.main.head),3);
  results.push('cursor coordinate round trip');

  await page.locator('[data-write-mode=split]').click();
  await setDocument('본문 <img src=x onerror="window.attacked=1">\n\n$$\na+b\n$$');
  await page.evaluate(() => window.sulogRenderPreview());
  assert.ok(await page.locator('#preview-markdown-content .katex').count());
  assert.equal(await page.locator('#preview-markdown-content [onerror]').count(),0);
  await page.evaluate(() => window.preserved = document.querySelector('#preview-markdown-content').firstChild);
  await page.locator('#input-tags').fill('metadata');
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => window.preserved === document.querySelector('#preview-markdown-content').firstChild));
  results.push('worker preview, sanitization, metadata does not replace body');

  const tick = String.fromCharCode(96);
  const iaExcerpt = [
    "엔트로피 $H(X|g=\\text{" + tick + "ㄴㅗㄴ'})$은 각 그룹의 엔트로피이다. ",
    "$\\begin{align*}",
    "H(X|g)&=\\sum_f P(f)H(W_f) \\\\",
    "&=1",
    "\\end{align*}$",
    "",
    "따라서 정보 이득은 다음과 같다.",
    "$IG(g=\\text{" + tick + "ㄴㅗㄴ'}) = H(X)-H(X|g) = 1 \\text{bit}$"
  ].join('\n');
  await setDocument(iaExcerpt);
  await page.evaluate(() => window.sulogRenderPreview());
  await page.waitForFunction(() => document.querySelectorAll('#preview-markdown-content .katex-display').length >= 2);
  results.push('IA align and information gain render in write preview');
  const iaText = await readFile(resolve('content/research/math-ia-current/mathiav2.md'), 'utf8');
  await setDocument(iaText);
  await page.evaluate(() => window.sulogRenderPreview());
  await page.waitForFunction(() => document.querySelectorAll('#preview-markdown-content .katex-display').length >= 15);
  assert.equal(await page.locator('#preview-markdown-content .katex-error').count(), 0);
  assert.ok((await page.locator('#preview-markdown-content h1').allTextContents()).includes('본론 (Exploration)'));
  results.push('complete IA document renders in write preview');



  await page.locator('[data-write-mode=live]').click();
  assert.equal(await page.locator('#preview-markdown-content').evaluate(root => root.childNodes.length), 0);
  await page.locator('[data-write-mode=split]').click();
  await page.evaluate(() => window.sulogRenderPreview());
  assert.ok(await page.locator('#preview-markdown-content .katex').count());
  results.push('hidden live preview skips offscreen DOM work and restores on return');

  await setDocument('= Typst 도입기\n\n본문입니다.\n\n== 첫 번째 소제목\n\n$ sum_(i=1)^n i $');
  await page.evaluate(() => window.sulogRenderPreview());
  assert.equal(await page.locator('#preview-title').textContent(), 'Typst 도입기');
  assert.equal(await page.locator('#preview-markdown-content h1').count(), 0);
  assert.ok(await page.locator('#preview-markdown-content h2').count());
  assert.ok(await page.locator('#preview-markdown-content math, #preview-markdown-content svg').count());
  assert.ok((await page.locator('#preview-markdown-content').textContent()).includes('본문입니다.'));
  const same = await page.evaluate(async () => {
    const { renderBody } = await import('/assets/preview.js?v=26');
    const root = document.createElement('div'); document.body.append(root);
    await renderBody(root, window.sulogEditor.value);
    const equal = root.innerHTML === document.getElementById('preview-markdown-content').innerHTML;
    root.remove(); return equal;
  });
  assert.ok(same);
  await page.evaluate(async () => {
    const { renderBody } = await import('/assets/preview.js?v=26');
    const root = document.createElement('div'); document.body.append(root);
    try {
      await renderBody(root, '= 안전 검증\n\n#html.elem("span", attrs: (onclick: "window.attacked=1", style: "position:fixed"), [안전])');
      if (root.querySelector('[onclick], [style], script') || !root.textContent.includes('안전')) throw new Error('Unsafe Typst HTML');
      let rejected = false;
      try { await renderBody(root, '= 오류 검증\n\n#let x = ('); } catch (error) { rejected = Boolean(error.message); }
      if (!rejected) throw new Error('Invalid Typst must fail explicitly');
    } finally { root.remove(); }
  });
  await page.locator('[data-write-mode=live]').click();
  assert.equal(await page.locator('.cm-live-math-inline, .cm-live-math-block').count(), 0);
  assert.ok(await page.locator('.cm-content .tok-keyword, .cm-content .ͼb').count() || await page.locator('.cm-content span').count());
  await page.evaluate(() => window.sulogWriteEditor.dispatch({ changes: { from: 0, to: 1, insert: '#' } }));
  await page.waitForFunction(() => document.querySelector('.cm-live-math-inline, .cm-live-math-block'));
  await page.evaluate(() => window.sulogWriteEditor.dispatch({ changes: { from: 0, to: 1, insert: '=' } }));
  await page.waitForFunction(() => !document.querySelector('.cm-live-math-inline, .cm-live-math-block'));
  results.push('real Typst HTML, Korean prose, heading, math, shared body renderer, no Markdown math decorations');
  await page.locator('[data-write-mode=split]').click();
  const protocol = await page.evaluate(async () => {
    const { postStatus, updateStatus, fetchEditableStatus, deleteStatus } = await import('/components/mastodon_oauth.js?protocol-test=1');
    const { fetchPostById, fetchPostComments, parseMastodonStatus } = await import('/components/mastodon.js');
    const nativeFetch = window.fetch;
    const stored = new Map(), writes = []; let next = 100;
    let ready = true, unavailable = false, omitted = null, branch = false;
    const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (url, init = {}) => {
      const path = new URL(url, location.origin).pathname;
      if (path.endsWith('/instance')) return json({ configuration: { statuses: { max_characters: 500 } } });
      if (path.includes('verify_credentials')) return json({ id: '116979319977947616' });
      if (new URL(url, location.origin).hostname === 'source.suwonmars.com') {
        if (path === '/health') return json({ ready, protocol: 'SULOG-TEXT/2', accountId: '116979319977947616' });
        if (unavailable) return new Response('{}', { status: 503 });
        const key = path.split('/')[2];
        return json({ id: key, text: stored.get(key)?.raw });
      }
      if (path.endsWith('/source')) { const key = path.split('/')[4]; return json({ id: key, text: stored.get(key)?.raw }); }
      const id = path.split('/')[4];
      if (init.method === 'DELETE') { stored.delete(id); return json({}); }
      if (init.method === 'POST' || init.method === 'PUT') {
        const body = new URLSearchParams(init.body);
        writes.push({ text: body.get('status'), spoiler: body.get('spoiler_text'), media: body.getAll('media_ids[]') });
        if ([...body.get('status')].length > 500) throw new Error('Instance character limit exceeded');
        const key = init.method === 'POST' ? String(next++) : id;
        const old = stored.get(key);
        const status = { id: key, visibility: body.get('visibility') || old?.visibility || 'public', raw: body.get('status'), content: '<p>' + escape(body.get('status')).replaceAll('\n', '<br>') + '</p>',
          account: { id: '116979319977947616', username: 'test', acct: 'test' }, tags: [{ name: 'blog' }, { name: '수학' }],
          in_reply_to_id: body.get('in_reply_to_id') || old?.in_reply_to_id || null,
          media_attachments: [], spoiler_text: body.get('spoiler_text') || '', replies_count: 1,
          created_at: '2026-10-20T00:00:00Z', url: 'https://example.com/' + key };
        stored.set(key, status); return json(status);
      }
      if (path.endsWith('/context')) {
        const available = [...stored.values()].filter(s => s.id !== id && s.id !== omitted);
        // Reproduce Mastodon's public 20-level context window for long threads.
        const descendants = available.filter(s => s.in_reply_to_id === id && s.raw?.startsWith('\u2063\u2064'));
        let parent = id;
        for (let i = 0; i < 20; i++) {
          const next = available.find(s => s.in_reply_to_id === parent && s.raw?.startsWith('\u2063\u2063'));
          if (!next) break;
          descendants.push(next); parent = next.id;
        }
        if (branch && descendants.some(s => s.raw?.startsWith('\u2063\u2063'))) {
          const next = descendants.find(s => s.raw?.startsWith('\u2063\u2063'));
          descendants.push({ ...next, id: '999' });
        }
        return json({ descendants });
      }
      return json(stored.get(id));
    };
    try {
      const source = '\n= 정확한 원문 😀\r\n\r\n' + '#let x = "<&>"\n  공백\t  \r\n$ sum_(i=1)^n i $\n\n#blog\n'.repeat(160) + '\n\n';
      const root = await postStatus({ statusText: source + '\n\n#blog #수학', sourceText: source, spoilerText: '', mediaIds: ['media1'] });
      if (writes.some(w => w.text.includes('SULOG-SOURCE/1')) || !writes[0].text.includes('정확한 원문')) throw new Error('Unreadable new publication');
      stored.get(root.id).tags.push({ name: 'tmp' });
      const publicPost = await fetchPostById(root.id);
      if (publicPost?.source !== source) throw new Error('Public source differs');
      if (publicPost.title !== '정확한 원문 😀' || publicPost.format !== 'typst') throw new Error('Metadata differs');
      if (publicPost.category !== 'blog') throw new Error('Body hashtag changed category');
      if (publicPost.tags.join(',') !== '수학') throw new Error('Tags differ');
      const editable = await fetchEditableStatus(stored.get(root.id));
      if (parseMastodonStatus(editable).source !== source) throw new Error('Editable source differs');
      if ((await fetchPostComments(root.id)).length) throw new Error('Document chunks became comments');
      if (writes.some(write => write.spoiler) || writes[0].media.length || writes.filter(write => write.media.includes('media1')).length !== 1) throw new Error('CW or media vault changed');
      const oldIds = root.sulog_thread_chunk_ids;
      const longEdit = source.replace('정확한', '변경된');
      const edited = await updateStatus({ id: root.id, statusText: longEdit + '\n\n#blog #수학', sourceText: longEdit, spoilerText: '' });
      if (edited.id !== root.id || edited.sulog_thread_chunk_ids.join(',') !== oldIds.join(',')) throw new Error('IDs changed');
      if ((await fetchPostById(root.id)).source !== longEdit) throw new Error('Long update differs');
      unavailable = true;
      if (await fetchPostById(root.id) !== null) throw new Error('API failure rendered a document');
      unavailable = false; omitted = oldIds[0];
      if (await fetchPostById(root.id) !== null) throw new Error('Missing chunk rendered a document');
      const writesBeforeMissingEdit = writes.length;
      let missingEditRejected = false;
      try { await updateStatus({ id: root.id, statusText: longEdit + '\n\n#blog #수학', sourceText: longEdit }); } catch { missingEditRejected = true; }
      if (!missingEditRejected || writes.length !== writesBeforeMissingEdit) throw new Error('Missing chunk was overwritten');
      omitted = null; branch = true;
      if (await fetchPostById(root.id) !== null) throw new Error('Ambiguous chain rendered a document');
      branch = false; ready = false;
      const before = writes.length;
      let rejected = false;
      try { await postStatus({ statusText: source + '\n\n#blog', sourceText: source }); } catch { rejected = true; }
      if (!rejected || writes.length !== before) throw new Error('Publication was not blocked before writes');
      ready = true;
      localStorage.setItem('sulog_write_visibility', 'unlisted');
      document.getElementById('write-visibility').value = 'unlisted';
      let visibilityRejected = false;
      try { await postStatus({ statusText: source + '\n\n#blog', sourceText: source }); } catch { visibilityRejected = true; }
      localStorage.removeItem('sulog_write_visibility');
      document.getElementById('write-visibility').value = 'public';
      if (!visibilityRejected || writes.length !== before) throw new Error('Unlisted choice was silently published');
      const updatedSource = '= 수정된 제목\n\n== 수식\n\n$ x^2 $\n  끝  \n';
      await updateStatus({ id: root.id, statusText: updatedSource + '\n\n#blog #수학', sourceText: updatedSource, spoilerText: '', existingThread: root.sulog_thread_chunks });
      if ((await fetchPostById(root.id)).source !== updatedSource) throw new Error('Edited source differs');
      const markdown = '# Markdown 원문\r\n\t  본문\n\n#blog\n\n';
      const md = await postStatus({ statusText: markdown + '\n\n#blog', sourceText: markdown });
      if ((await fetchPostById(md.id)).source !== markdown) throw new Error('Markdown source differs');
      stored.set('700', { id: '700', visibility: 'public', account: { id: '116979319977947616' }, tags: [{ name: 'blog' }],
        content: '<p>SULOG-SOURCE/1 1/1 39472c38<br>PSDquLDsobQgVHlwc3QKCu2VnOq4gCAkIHheMiAkDQoJ64GdICA=</p>' });
      unavailable = true;
      if ((await fetchPostById('700')).source !== '= 기존 Typst\n\n한글 $ x^2 $\r\n\t끝  ') throw new Error('Legacy Base64 read failed');
      unavailable = false;
      await deleteStatus(root.id);
      if (stored.has(root.id) || oldIds.some(id => stored.has(id))) throw new Error('Thread deletion failed');
      return { chunks: root.sulog_thread_chunks.length + 1, writes: writes.length };

    } finally { window.fetch = nativeFetch; }
  });
  assert.ok(protocol.chunks > 1);
  results.push({ 'mocked Typst publish/public read/edit round trip; CW/media/tags/comments': protocol });
  // Exercise the actual published routes with public readable source responses.
  const fixtures = await page.evaluate(async () => {
    const { splitSourceThread } = await import('/components/source-thread.js');
    const source = '= 공개 Typst 검증\n\n본문입니다.\n\n== 소제목\n\n$ sum_(i=1)^n i $';
    return { source, chunks: splitSourceThread(source, '#page #수학', 488) };
  });
  const publicStatuses = fixtures.chunks.map((text, i) => ({
    ...status(String(900 + i), '', (i ? '\u2063\u2063' : '') + text),
    tags: [{ name: 'page' }, { name: '수학' }], in_reply_to_id: i ? String(899 + i) : null, replies_count: fixtures.chunks.length - 1
  }));
  await context.route('https://source.suwonmars.com/status/9*', route => {
    const id = new URL(route.request().url()).pathname.split('/')[2];
    const i = Number(id) - 900;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id, text: (i ? '\u2063\u2063' : '') + fixtures.chunks[i] }) });
  });
  const markdownFixture = status('800', '', '# 기존 Markdown\n\n## 소제목\n\n$x^2$\n\n```js\nconst x = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![이미지](/assets/maximux_logo.svg)');
  await context.route('**/api/v1/statuses/9*', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/context') ? { descendants: publicStatuses.slice(1) } : publicStatuses.find(s => s.id === path.split('/')[4]);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await context.route('**/api/v1/statuses/800*', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify(route.request().url().endsWith('/context') ? { descendants: [] } : markdownFixture)
  }));
  const published = await context.newPage();
  published.on('pageerror', error => errors.push(error.message));
  for (const route of ['/blog/?id=900', '/research/?id=900', '/p/?id=900']) {
    await published.goto(origin + route);
    await published.waitForSelector('#content math');
    assert.equal(await published.locator('#page-title').textContent(), '공개 Typst 검증');
    assert.equal(await published.locator('#content h2').textContent(), '소제목');
    assert.equal(await published.locator('#content h1').count(), 0);
  }
  await mkdir('/tmp/sulog-editor-check', { recursive: true });
  await published.screenshot({ path: '/tmp/sulog-editor-check/typst-research.png' });
  await published.goto(origin + '/blog/?id=800');
  await published.waitForSelector('#content .katex');
  assert.equal(await published.locator('#page-title').textContent(), '기존 Markdown');
  assert.equal(await published.locator('#content h1').textContent(), '기존 Markdown');
  assert.equal(await published.locator('#content .table-wrapper table').count(), 1);
  assert.equal(await published.locator('#content .table-wrapper .table-wrapper').count(), 0);
  assert.equal(await published.locator('#content pre code.hljs').count(), 1);
  assert.equal(await published.locator('#content .code-copy-btn').count(), 1);
  await published.locator('#content img').first().click();
  assert.ok(await published.locator('#lightbox').evaluate(el => el.classList.contains('active')));
  await published.close();
  results.push('published blog/research Typst HTML and existing Markdown math/code/table/image interactions');
  await page.locator('[data-write-mode=source]').click();
  await setDocument('복원할 초안'); assert.equal(await page.locator('#input-title').getAttribute('readonly'), '');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.getElementById('status-draft').textContent.includes('로컬 저장됨'));
  await page.reload(); await page.waitForFunction(() => window.sulogEditor);
  assert.equal(await page.evaluate(() => window.sulogEditor.value), '복원할 초안');
  results.push('new draft manual save/reload');

  await page.locator('#btn-toggle-sidebar').click();
  await page.locator('.post-card').filter({hasText:'첫 글'}).locator('.edit-btn').click();
  await page.waitForFunction(() => document.getElementById('editing-post-id').textContent === '1');
  assert.match(await page.evaluate(() => window.sulogEditor.value), /#comment\n  print\(1\)/);
  await page.locator('#btn-toggle-sidebar').click();
  await setDocument('수정 중 초안'); await page.locator('.cm-content').click(); await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.getElementById('status-draft').textContent.includes('로컬 저장됨'));
  await page.reload(); await page.waitForFunction(() => window.sulogEditor);
  assert.equal(await page.evaluate(() => window.sulogEditor.value), '수정 중 초안');
  assert.equal(await page.locator('#editing-post-id').textContent(), '1');
  results.push('source endpoint preserves comments; edited draft resumes identity');
  await page.evaluate(async () => {
    const { parseMastodonStatus } = await import('/components/mastodon.js?v=20');
    const base={id:'x',spoiler_text:'Title',tags:[{name:'blog'}],media_attachments:[]};
    const fallback=parseMastodonStatus({...base,content:'unused',sulog_root_content:'<p>Root<br><br>#blog</p>',sulog_thread_chunks:[{text:'```python\n#comment\n  print(1)\n```'}]});
    if(fallback.markdown !== 'Root\n\n```python\n#comment\n  print(1)\n```') throw new Error('HTML thread fallback corrupted content: '+fallback.markdown);
  });
  results.push('HTML thread fallback strips only root metadata');

  await page.locator('#btn-toggle-sidebar').click();
  delayed = true;
  await page.locator('.post-card').filter({hasText:'첫 글'}).locator('.edit-btn').click();
  await waitFor(() => releaseSource);
  await page.locator('.post-card').filter({hasText:'둘째 글'}).locator('.edit-btn').click();
  await page.waitForFunction(() => document.getElementById('editing-post-id').textContent === '2');
  releaseSource(); delayed = false; await page.waitForTimeout(150);
  assert.equal(await page.locator('#editing-post-id').textContent(),'2');
  await page.locator('#btn-toggle-sidebar').click();
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+z');
  assert.match(await page.evaluate(() => window.sulogEditor.value), /^# 둘째 글\n\n원문 2/);
  results.push('stale open response ignored and per-document undo history');

  await setDocument('AB');
  pauseMedia = true;
  await page.evaluate(() => {
    const v = window.sulogWriteEditor, c = v.coordsAtPos(1), data = new DataTransfer();
    data.items.add(new File(['image'], 'image.png', {type:'image/png'}));
    v.contentDOM.dispatchEvent(new DragEvent('drop', {bubbles:true,cancelable:true,dataTransfer:data,clientX:c.left,clientY:(c.top+c.bottom)/2}));
    v.dispatch({changes:{from:0,insert:'X'}});
  });
  await waitFor(() => releaseMedia);
  releaseMedia(); pauseMedia = false;
  await page.waitForFunction(() => window.sulogEditor.value.includes('image.png'));
  assert.match(await page.evaluate(() => window.sulogEditor.value), /^XA\n!\[image.png\]/);
  results.push('file drop position mapped across concurrent edits');

  await page.evaluate(() => {
    window.originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value,key) { if(String(key).startsWith('draft:')) throw new Error('test quota'); return window.originalPut.call(this,value,key); };
    document.dispatchEvent(new Event('sulog:save'));
  });
  await page.waitForFunction(() => document.getElementById('status-draft').textContent.includes('저장 실패'));
  await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalPut; document.dispatchEvent(new Event('sulog:save')); });
  await page.waitForFunction(() => document.getElementById('status-draft').textContent.includes('로컬 저장됨'));
  results.push('draft failure is visible and retry succeeds');

  await setDocument('# 발행 검증\n\n본문');
  pausePublish = true;
  await page.locator('#btn-publish').click();
  await waitFor(() => releasePublish);
  await setDocument('발행 중 추가한 글');
  releasePublish(); pausePublish = false;
  await page.waitForFunction(() => !document.getElementById('btn-publish').disabled);
  assert.equal(await page.evaluate(() => window.sulogEditor.value), '발행 중 추가한 글');
  await page.locator('.cm-content').click(); await page.keyboard.press('Control+s');
  await page.waitForFunction(() => document.getElementById('status-draft').textContent.includes('로컬 저장됨'));
  await page.reload(); await page.waitForFunction(() => window.sulogEditor);
  assert.equal(await page.evaluate(() => window.sulogEditor.value), '발행 중 추가한 글');
  results.push('edits during publishing preserved through reload');

  await page.setViewportSize({width:390,height:740});
  await page.waitForTimeout(100);
  const box = await page.locator('.cm-scroller').boundingBox();
  assert.ok(box.height > 100 && box.y+box.height <= 740);
  results.push('mobile scroller fits viewport');
  await page.locator('[data-write-mode=preview]').click();
  await page.waitForFunction(() => document.body.classList.contains('write-mode-preview'));
  await page.evaluate(() => window.sulogRenderPreview());
  assert.ok(await page.locator('#preview-body').isVisible());
  await page.locator('#btn-preview-edit').click();
  assert.ok(await page.locator('.cm-editor').isVisible());
  results.push('mobile preview and return to editing');
  await page.setViewportSize({width:1440,height:1000});
  const large = ('일반 문단의 긴 글 입력 성능을 검사합니다. **강조** $x+1$\n\n').repeat(6000);
  await setDocument(large);
  const timings = await page.evaluate(async () => {
    const view = window.sulogWriteEditor, samples = [];
    for (let i=0;i<30;i++) {
      const start=performance.now();
      view.dispatch({ changes:{from:view.state.doc.length,insert:'가'}, selection:{anchor:view.state.doc.length+1} });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      samples.push(performance.now()-start);
    }
    samples.sort((a,b)=>a-b); return {length:view.state.doc.length,p95:samples[Math.floor(samples.length*.95)],max:Math.max(...samples)};
  });
  results.push({sourceInput:timings});
  assert.ok(timings.p95 < 100, `source input p95 ${timings.p95}`);
  await page.locator('[data-write-mode=live]').click();
  await page.waitForTimeout(500);
  const liveTimings = await page.evaluate(async () => {
    const v=window.sulogWriteEditor,samples=[];
    for(let i=0;i<20;i++) {const t=performance.now();v.dispatch({selection:{anchor:v.state.doc.length-i}});await new Promise(r=>requestAnimationFrame(r));samples.push(performance.now()-t);}
    samples.sort((a,b)=>a-b);return {p95:samples[Math.floor(samples.length*.95)]};
  });
  results.push({liveSelection:liveTimings});
  const liveInput = await page.evaluate(async () => {
    const v=window.sulogWriteEditor,samples=[];
    for(let i=0;i<20;i++) { const t=performance.now(); v.dispatch({changes:{from:v.state.doc.length,insert:'나'},selection:{anchor:v.state.doc.length+1}}); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))); samples.push(performance.now()-t); }
    samples.sort((a,b)=>a-b);return {p95:samples[Math.floor(samples.length*.95)]};
  });
  assert.ok(liveInput.p95 < 100, `live input p95 ${liveInput.p95}`);
  results.push({liveInput});
  await page.locator('[data-write-mode=split]').click();
  await page.evaluate(() => window.sulogRenderPreview());
  assert.ok(await page.locator('#preview-markdown-content .katex').count());
  results.push('large mixed document preview completes');
  await page.goto(origin + '/write/'); await page.waitForFunction(() => window.sulogEditor);
  assert.equal(await page.locator('.cm-editor').count(),1);
  assert.equal(await page.locator('#btn-export-pdf').count(),1);
  results.push('write editor initialization');
  await page.locator('[data-write-mode=source]').click();
  await setDocument('한국어');
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const view=window.sulogWriteEditor;
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'한'}));
    view.dispatch({changes:{from:3,insert:' 조합'}});
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'조합'}));
  });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.sulogEditor.value),'한국어 조합');
  results.push('synthetic composition preserves text');
  await page.evaluate(() => { window.print = () => window.dispatchEvent(new Event('afterprint')); });
  await page.locator('#btn-export-pdf').click();
  await page.waitForFunction(() => !document.getElementById('btn-export-pdf').disabled);
  assert.equal(await page.locator('#write-print-root').count(),0);
  results.push('PDF preparation and cleanup');
  await page.evaluate(() => document.dispatchEvent(new Event('sulog:save')));
  await page.waitForFunction(() => document.getElementById('status-draft').textContent.includes('로컬 저장됨'));
  const offlineContext = await browser.newContext({ viewport:{width:1200,height:800} });
  await offlineContext.route('https://**/*', route => route.fulfill({status:204,body:''}));
  const offlinePage = await offlineContext.newPage();
  offlinePage.on('pageerror', error => errors.push(error.message));
  await offlinePage.goto(origin+'/write/');
  await offlinePage.waitForFunction(() => window.sulogEditor);
  await offlinePage.evaluate(() => navigator.serviceWorker.ready);
  await offlinePage.reload(); await offlinePage.waitForFunction(() => navigator.serviceWorker.controller && window.sulogEditor);
  await offlineContext.setOffline(true);
  await offlinePage.reload(); await offlinePage.waitForFunction(() => window.sulogEditor);
  await offlinePage.locator('.cm-content').click(); await offlinePage.keyboard.type('offline draft');
  await offlinePage.keyboard.press('Control+s');
  await offlinePage.waitForFunction(() => document.getElementById('status-draft').textContent.includes('로컬 저장됨'));
  results.push('offline app shell/editor/draft save works without CDN');
  await offlineContext.close();
  await page.locator('[data-write-mode=source]').click();
  await setDocument('좌표 확대 검증');
  await page.evaluate(() => { document.getElementById('cm-editor-host').style.zoom = '1.25'; window.sulogWriteEditor.requestMeasure(); });
  await page.waitForTimeout(100);
  const scaled = await page.evaluate(() => { const c=window.sulogWriteEditor.coordsAtPos(3); return {x:c.left,y:(c.top+c.bottom)/2}; });
  await page.mouse.click(scaled.x,scaled.y);
  assert.equal(await page.evaluate(() => window.sulogWriteEditor.state.selection.main.head),3);
  await page.evaluate(() => { document.getElementById('cm-editor-host').style.zoom = ''; window.sulogWriteEditor.requestMeasure(); });
  results.push('zoomed editor cursor coordinate round trip');

  const publicContext = await browser.newContext({ viewport: {width: 1280, height: 900}, serviceWorkers: 'block' });
  await publicContext.addInitScript(() => {
    window.marked = { parse: source => source };
  });
  const maliciousBody = '<p>안전한 글</p><h2>제목 테스트</h2><img src=x onerror="window.postXss=1"><a href="javascript:alert(1)">evil</a><strong>유지할 강조</strong>';
  const externalComment = {
    id: 'comment-1',
    in_reply_to_id: '911',
    account: { id: 'external', username: 'attacker', acct: 'attacker', display_name: '<img src=x onerror="window.nameXss=1">', avatar: 'javascript:alert(1)', avatar_static: 'javascript:alert(1)', url: 'javascript:alert(1)' },
    content: '<p>정상 댓글</p><img src=x onerror="window.commentXss=1"><a href="javascript:alert(1)">unsafe link</a><em>유지할 강조</em>',
    created_at: '2026-10-12T00:00:00Z',
    media_attachments: [{type:'image',url:'javascript:alert(1)',description:'" onerror="window.mediaXss=1'}]
  };
  await publicContext.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'source.suwonmars.com') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname === '/health' ? { ready: true, protocol: 'SULOG-TEXT/2', accountId: '116979319977947616' } : { id: url.pathname.split('/')[2], text: publishedSources.get(url.pathname.split('/')[2]) }) });
    if (url.hostname !== 'maximux.suwonmars.com') return route.fulfill({status:204,body:''});
    if (/\/api\/v1\/statuses\/\d+\/context$/.test(url.pathname)) return route.fulfill({
      contentType:'application/json',body:JSON.stringify({descendants:[externalComment]})
    });
    if (/\/api\/v1\/statuses\/\d+$/.test(url.pathname)) {
      const id = url.pathname.split('/').pop();
      const category = ({911:'blog',912:'research',913:'personal',914:'page'})[id] || 'blog';
      return route.fulfill({contentType:'application/json',body:JSON.stringify({
        id, spoiler_text:'<img src=x onerror="window.titleXss=1">제목',
        sulog_source_text:maliciousBody,
        content:'<p>placeholder</p>',tags:[{name:category},{name:'<img src=x onerror="window.tagXss=1">'}],
        account:{id:'owner'}, media_attachments:[{type:'image',url:'javascript:alert(1)',description:'" onerror="window.altXss=1'}],
        url:'javascript:alert(1)', created_at:'2026-10-12T00:00:00Z',
        in_reply_to_id:null
      })});
    }
    if (url.pathname.includes('/api/v1/accounts/') && url.pathname.endsWith('/statuses')) {
      const category = url.searchParams.get('tagged') || 'blog';
      return route.fulfill({contentType:'application/json',body:JSON.stringify([{
        id:'920',spoiler_text:'목록 회귀 테스트',content:'<p>테스트 본문</p>',
        tags:[{name:category},{name:'topic'}],account:{id:'owner'},
        created_at:'2026-10-12T00:00:00Z',media_attachments:[],in_reply_to_id:null
      }])});
    }
    return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  for (const root of ['/blog/', '/research/', '/log/']) {
    const listing = await publicContext.newPage();
    const listErrors = [];
    listing.on('pageerror', error => listErrors.push(error.message));
    await listing.goto(origin + root);
    await listing.waitForSelector('.blog-post-link');
    assert.equal(await listing.locator('.blog-post-link').getAttribute('href'), root + '?id=920');
    assert.equal(await listing.locator('.tag[data-tag="topic"]').count(), 1);
    assert.equal(await listing.locator('.tag[data-tag=""]').count(), root === '/research/' ? 0 : 1);
    await listing.locator('.tag[data-tag="topic"]').click();
    assert.equal(new URL(listing.url()).searchParams.get('tags'), 'topic');
    assert.equal(await listing.locator('.blog-post-link').count(), 1);
    assert.deepEqual(listErrors, [], root + ': listing errors');
    await listing.close();
  }
  results.push('shared post listing and filters on blog/research/log');
  for (const routePath of ['/blog/?id=911', '/research/?id=912', '/log/?id=913', '/p/?id=914']) {
    const publicPage = await publicContext.newPage();
    const publicErrors = [];
    publicPage.on('pageerror', error => publicErrors.push(error.message));
    await publicPage.goto(origin + routePath);
    await publicPage.waitForSelector('#content strong');
    await publicPage.waitForSelector('.comment-body em');
    const security = await publicPage.evaluate(() => ({
      events:document.querySelectorAll('[onerror],[onload],[onclick]').length,
      badLinks:[...document.querySelectorAll('a[href]')].some(a => a.getAttribute('href').trim().toLowerCase().startsWith('javascript:')),
      injected: ['postXss','commentXss','titleXss','nameXss','tagXss','altXss','mediaXss'].some(key => window[key] === 1),
      markup: !!document.querySelector('#content strong, .comment-body em')
    }));
    assert.equal(security.events,0,routePath + ': event attributes retained');
    assert.equal(security.badLinks,false,routePath + ': dangerous link');
    assert.equal(security.injected,false,routePath + ': executable markup');
    assert.equal(security.markup,true,routePath + ': harmless rich text removed');
    assert.equal(await publicPage.locator('#floating-toc a').count(), 1, routePath + ': heading TOC');
    assert.ok((await publicPage.locator('#bc-title').textContent()).includes('제목'), routePath + ': breadcrumb');
    assert.deepEqual(publicErrors,[],routePath + ': runtime errors');
    await publicPage.close();
  }
  results.push('public blog/research/log/p Markdown, Mastodon comments and attributes sanitized');
  await publicContext.close();

  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:results,errors},null,2));
  await mkdir('/tmp/sulog-editor-check', {recursive:true});
  await page.screenshot({path:'/tmp/sulog-editor-check/write.png'});
  await writeFile('/tmp/sulog-editor-check/results.json',JSON.stringify({passed:results,errors},null,2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
