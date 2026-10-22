import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve('.');
const server = createServer(async (req, res) => {
  try {
    let path = resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (path !== root && !path.startsWith(root + '/')) throw new Error('Invalid path');
    if ((await stat(path)).isDirectory()) path += '/index.html';
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', args: ['--no-sandbox'] });
  const pages = ['/', '/profile/', '/blog/', '/research/', '/p/'];
  for (const blockModules of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || (blockModules && url.pathname.endsWith('.js'))) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const theme of ['dark', 'light']) {
      await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
      await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
      for (const path of pages) {
        await page.goto(origin + path);
        assert.equal(await page.locator('.navbar').count(), 1);
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('main'), '::before').content), 'none', 'no full-content veil');
        if (path === '/') assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('main')).maskImage), 'none', 'landing page has no mask');
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), theme);
        assert.equal(await page.locator(theme === 'light' ? '.theme-icon-light' : '.theme-icon-dark').isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
        assert.equal(await page.evaluate(() => {
          const c = document.querySelector('canvas');
          return c.getContext('2d').getImageData(17, 0, 1, 1).data[3] > 0;
        }), true, 'dots exist even without modules');
        await page.reload();
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('light-mode')), theme === 'light');
        if (!blockModules) {
          await page.waitForFunction(() => document.getElementById('theme-toggle').dataset.bound);
          await page.locator('#theme-toggle').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.evaluate(() => localStorage.getItem('theme')), theme === 'light' ? 'dark' : 'light');
          assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgba(0, 0, 0, 0)', 'body must not cover the negative-z dot canvas');
        }
      }
    }
    assert.deepEqual(errors, []);
    if (!blockModules) {
      await page.goto(origin + '/');
      await page.locator('.nav-links a[href="/profile/"]').click();
      await page.waitForURL(origin + '/profile/');
      await page.goBack();
      assert.equal(new URL(page.url()).pathname, '/');
      // Simulate ignoring the optional View Transition at-rule.
      await context.route('**/css/global.css', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/@view-transition\s*\{[^}]*\}/g, '') });
      });
      await page.goto(origin + '/');
      await page.locator('.nav-links a[href="/profile/"]').click();
      await page.waitForURL(origin + '/profile/');
      await page.goBack();
      assert.equal(new URL(page.url()).pathname, '/');
      for (const width of [320, 360, 414, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(origin + '/blog/');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      }
    }
    await context.close();
  }
  const context = await browser.newContext({ reducedMotion: 'reduce', colorScheme: 'light' });
  await context.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
  const page = await context.newPage();
  await page.goto(origin + '/');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark', 'existing no-preference dark default');
  assert.equal(await page.evaluate(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).some(r => r.conditionText === '(prefers-reduced-motion: reduce)' && r.cssText.includes('navigation: none'))), true);
  await context.close();
  console.log('PASS: initial dots/icons without modules, themes/reload, keyboard toggle, 320–1440px widths, native links/back without transitions, reduced-motion rule and existing default');
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
