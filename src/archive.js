/* archive.js — CR-31 §2.7: the copies the tracker keeps aside (the data before an upgrade · data that could not be read) live in IndexedDB, not in
   localStorage — localStorage has room for about 5 MB for the whole site and the working data needs it. A small key → text store; nothing here is read
   by the screens while they run (only Settings › Data downloads a copy). → KT.archive */
KT.archive = (function () {
  'use strict';
  const DB = 'charmiss_kol_tracker_archive', ST = 'kv';
  let dbp = null;
  const available = () => { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; } };
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
      r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  /* one request in its own transaction → its result once the transaction is done */
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction(ST, mode), q = fn(t.objectStore(ST));
    t.oncomplete = () => res(q ? q.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  const put = (key, text) => run('readwrite', s => s.put(text, key));
  const get = key => run('readonly', s => s.get(key)).then(v => (v == null ? null : v));
  const del = key => run('readwrite', s => s.delete(key));
  const keys = () => run('readonly', s => s.getAllKeys());
  /* { key: characters } of everything kept here */
  async function sizes() { const out = {}; for (const k of await keys()) { const v = await get(k); out[k] = v ? String(v).length : 0; } return out; }
  return { available, put, get, del, keys, sizes };
})();
