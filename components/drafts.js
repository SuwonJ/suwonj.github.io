const DB_NAME = 'sulog-write';
let connection;
export function openDb() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('kv');
    request.onerror = () => { connection = null; reject(request.error); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  });
  return connection;
}
export async function dbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const request = tx.objectStore('kv').get(key);
    tx.oncomplete = () => resolve(request.result ?? null);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('초안 읽기 실패'));
  });
}
export async function dbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    if (value == null) tx.objectStore('kv').delete(key);
    else tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('초안 저장 실패'));
  });
}
export const draftKey = id => `draft:${id || 'new'}`;
export async function readDraft(id) {
  const current = await dbGet(draftKey(id));
  if (current || id) return current;
  // Only migrate legacy backups once; deletion after publishing must not resurrect them.
  const legacy = await dbGet('current-draft');
  let local;
  try { local = JSON.parse(localStorage.getItem('sulog_admin_draft') || 'null'); } catch {}
  const candidates = [local, legacy?.draft && { ...legacy.draft, savedAt: legacy.savedAt }].filter(Boolean);
  candidates.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  const draft = candidates[0] || null;
  if (draft) await dbSet(draftKey(null), draft);
  await dbSet('current-draft', null);
  localStorage.removeItem('sulog_admin_draft');
  return draft;
}
export async function removeDraft(id) {
  await dbSet(draftKey(id), null);
  if (!id) {
    await dbSet('current-draft', null);
    localStorage.removeItem('sulog_admin_draft');
  }
}
