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
const status = (id, title, text) => ({ id, spoiler_text: title, content: `<p>${text.replaceAll('\n','<br>')}</p>`, tags: [{name:'blog'}], account: {id:'account'}, replies_count: 0, media_attachments: [], created_at:'2026-10-04T00:00:00Z' });
const posts = [status('1','첫 글','본문 A'),status('2','둘째 글','본문 B')];
let delayed = false, releaseSource, releaseMedia, releasePublish;
let pauseMedia = false, pausePublish = false;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('mastodon_access_token', 'test-token');
    localStorage.setItem('sulog_admin_sidebar_open', 'false');
    localStorage.setItem('sulog_write_editor_mode', 'source');
  });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname !== 'maximux.suwonmars.com') return route.fulfill({ status: 204, body: '' });
    const path = url.pathname;
    let data;
    if (path.includes('verify_credentials')) data = { id:'account',acct:'test',avatar:'' };
    else if (path.endsWith('/statuses') && route.request().method() === 'GET') data = posts;
    else if (path.endsWith('/instance')) data = { configuration:{statuses:{max_characters:1000000}} };
    else if (path.endsWith('/media')) {
      if (pauseMedia) await new Promise(resolve => releaseMedia = resolve);
      data = { id:'media1',type:'image',url:'https://example.com/image.png' };
    } else if (route.request().method() === 'PUT' || (route.request().method() === 'POST' && path.endsWith('/statuses'))) {
      if (pausePublish) await new Promise(resolve => releasePublish = resolve);
      const body = new URLSearchParams(route.request().postData());
      data = status(path.endsWith('/statuses') ? '3' : path.split('/')[4], body.get('spoiler_text'), body.get('status'));
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
  await page.goto(origin + '/admin/');
  await page.waitForFunction(() => window.sulogEditor);
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
  results.push('admin shared editor input/undo');

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
  await page.locator('#input-title').fill('제목 변경');
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => window.preserved === document.querySelector('#preview-markdown-content').firstChild));
  results.push('worker preview, sanitization, metadata does not replace body');

  await page.locator('[data-write-mode=source]').click();
  await setDocument('복원할 초안'); await page.locator('#input-title').fill('로컬 제목');
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
  assert.match(await page.evaluate(() => window.sulogEditor.value), /^원문 2/);
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

  await page.locator('#input-title').fill('발행 검증');
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
  results.push('write template and shared initialization');
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
  // Cursor measurement after zooming the editor and changing its width.
  await page.locator('[data-write-mode=source]').click();
  await setDocument('좌표 확대 검증');
  await page.evaluate(() => { document.getElementById('cm-editor-host').style.zoom = '1.25'; window.sulogWriteEditor.requestMeasure(); });
  await page.waitForTimeout(100);
  const scaled = await page.evaluate(() => { const c=window.sulogWriteEditor.coordsAtPos(3); return {x:c.left,y:(c.top+c.bottom)/2}; });
  await page.mouse.click(scaled.x,scaled.y);
  assert.equal(await page.evaluate(() => window.sulogWriteEditor.state.selection.main.head),3);
  await page.evaluate(() => { document.getElementById('cm-editor-host').style.zoom = ''; window.sulogWriteEditor.requestMeasure(); });
  results.push('zoomed editor cursor coordinate round trip');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:results,errors},null,2));
  await mkdir('/tmp/sulog-editor-check', {recursive:true});
  await page.screenshot({path:'/tmp/sulog-editor-check/write.png'});
  await writeFile('/tmp/sulog-editor-check/results.json',JSON.stringify({passed:results,errors},null,2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
