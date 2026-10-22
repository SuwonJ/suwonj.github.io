// Run on the Pi, never in the website. Creates an app token, no account or posts.
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const [id, originalFile, directory = '/etc/sulog-source'] = process.argv.slice(2);
if (!/^[1-9]\d{0,19}$/.test(id || '') || !originalFile) {
  console.error('Usage: sudo node provision.mjs STATUS_ID EXACT_RAW_SOURCE_FILE [OUTPUT_DIRECTORY]');
  process.exit(1);
}
const original = await readFile(originalFile, 'utf8');
const base = 'https://maximux.suwonmars.com';
const accountId = '116979319977947616';
let app, token, saved = false;
const created = [];
async function json(path, init = {}) {
  const response = await fetch(base + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}
const post = (path, values) => json(path, { method: 'POST', body: new URLSearchParams(values) });
try {
  const status = await json(`/api/v1/statuses/${id}`);
  if (status.account?.id !== accountId || status.visibility !== 'public') throw new Error('Probe must be an existing own public status');
  app = await post('/api/v1/apps', { client_name: 'Sulog Source API', redirect_uris: 'urn:ietf:wg:oauth:2.0:oob', scopes: 'read:statuses' });
  token = await post('/oauth/token', { grant_type: 'client_credentials', client_id: app.client_id, client_secret: app.client_secret, scope: 'read:statuses' });
  if (token.scope !== 'read:statuses' || !token.access_token) throw new Error('Expected a read:statuses-only application token');
  const source = await json(`/api/v1/statuses/${id}/source`, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (source.id !== id || source.text !== original) throw new Error('Exact source comparison failed; no configuration activated');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // wx prevents accidental replacement of working credentials/configuration.
  await writeFile(`${directory}/mastodon-token`, token.access_token + '\n', { mode: 0o600, flag: 'wx' });
  created.push(`${directory}/mastodon-token`);
  await writeFile(`${directory}/config`, `MASTODON_ACCOUNT_ID=${accountId}\nSOURCE_PROBE_ID=${id}\nSOURCE_PROBE_SHA256=${createHash('sha256').update(original).digest('hex')}\n`, { mode: 0o600, flag: 'wx' });
  created.push(`${directory}/config`);
  saved = true;
  console.log('App-token source comparison succeeded. Protected credentials and probe config written. No posts created.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (!saved) {
    if (token?.access_token) await post('/oauth/revoke', { client_id: app.client_id, client_secret: app.client_secret, token: token.access_token }).catch(() => {
      console.error('Token revocation failed; revoke the verification app in Mastodon before retrying.');
    });
    // Remove only files created by this invocation; never touch an existing setup.
    for (const path of created) await unlink(path).catch(() => {});
  }
}
