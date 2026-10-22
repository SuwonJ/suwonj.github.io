import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MASTODON = 'https://maximux.suwonmars.com';
const ORIGIN = 'https://suwonmars.com';
const ID = /^[1-9]\d{0,19}$/;
const failure = status => Object.assign(new Error('Source request failed'), { status });

// fetchImpl injection is for tests only; the production upstream is not configurable.
export function createSourceServer({ token, accountId, probeId, probeSha256, fetchImpl = fetch, timeoutMs = 8000, maxBytes = 256 * 1024, rateLimit = 600 } = {}) {
  if (!token || !ID.test(accountId)) throw new Error('MASTODON_TOKEN and MASTODON_ACCOUNT_ID are required');
  let windowStart = Date.now(), requests = 0, active = 0;
  async function upstream(path, authenticated, signal) {
    const response = await fetchImpl(MASTODON + path, {
      headers: authenticated ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' },
      redirect: 'error', cache: 'no-store', signal
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw failure([403, 404, 410].includes(response.status) ? 404 : 502);
    }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw failure(502); }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) throw failure(502);
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw failure(502); }
  }
  async function source(id) {
    const signal = AbortSignal.timeout(timeoutMs);
    const path = `/api/v1/statuses/${id}`;
    const authorize = status => {
      if (status.id !== id || status.account?.id !== accountId || status.visibility !== 'public' || status.reblog) throw failure(404);
    };
    const before = await upstream(path, false, signal);
    authorize(before);
    const raw = await upstream(path + '/source', true, signal);
    // Revalidate after reading to catch deletion/privacy/edit races. Nothing cached.
    const after = await upstream(path, false, signal);
    authorize(after);
    if (before.edited_at !== after.edited_at || before.content !== after.content) throw failure(409);
    if (raw.id !== id || typeof raw.text !== 'string' || Buffer.byteLength(JSON.stringify(raw.text)) > maxBytes - 100) throw failure(502);
    return { id, text: raw.text };
  }
  const server = createServer(async (req, res) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    if (req.headers.origin === ORIGIN) headers['Access-Control-Allow-Origin'] = ORIGIN;
    const send = (code, body) => { res.writeHead(code, headers); res.end(JSON.stringify(body)); };
    // Global bounded limiter works behind the tunnel without trusting spoofable IP headers.
    if (Date.now() - windowStart >= 60000) { requests = 0; windowStart = Date.now(); }
    if (++requests > rateLimit || active >= 8) { headers['Retry-After'] = '60'; return send(429, { error: 'rate_limited' }); }
    if (req.method !== 'GET') { headers.Allow = 'GET'; return send(405, { error: 'method_not_allowed' }); }
    if (req.headers.origin && req.headers.origin !== ORIGIN) return send(403, { error: 'origin_not_allowed' });
    const match = /^\/status\/([1-9]\d{0,19})$/.exec(req.url);
    if (!match && req.url !== '/health') return send(404, { error: 'not_found' });
    active++;
    try {
      if (match) return send(200, await source(match[1]));
      if (!ID.test(probeId || '') || !/^[a-f0-9]{64}$/.test(probeSha256 || '')) throw failure(503);
      const probe = await source(probeId);
      if (createHash('sha256').update(probe.text).digest('hex') !== probeSha256) throw failure(503);
      return send(200, { ready: true, protocol: 'SULOG-TEXT/2', accountId });
    } catch (error) {
      const status = error.status || 502;
      return send(status, { error: status === 404 ? 'not_found' : 'source_unavailable' });
    } finally { active--; }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.timeout = timeoutMs + 2000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.maxConnections = 64;
  server.maxHeadersCount = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = process.env.MASTODON_TOKEN || (process.env.CREDENTIALS_DIRECTORY ? (await readFile(`${process.env.CREDENTIALS_DIRECTORY}/mastodon-token`, 'utf8')).trim() : '');
  const server = createSourceServer({ token, accountId: process.env.MASTODON_ACCOUNT_ID,
    probeId: process.env.SOURCE_PROBE_ID, probeSha256: process.env.SOURCE_PROBE_SHA256 });
  server.listen(8788, '127.0.0.1', () => console.log('Sulog Source API listening on 127.0.0.1:8788'));
  const stop = () => { server.close(); setTimeout(() => process.exit(0), 10000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
