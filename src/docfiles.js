/* docfiles.js — CR-33 §3.2: the payee / payment document files (ID copy · Bank book · Company certificate · VAT certificate · Post proof · others).
   A file is encrypted with the Payee vault (public key — anyone allowed can upload without the passphrase) and kept in IndexedDB only:
   never in localStorage, the state, a log or a Backup (unless "Include payee documents (encrypted)" is ticked — still encrypted).
   The state keeps only { file_id, name, mime, bytes }. Reading a file back (Preview · Print) needs the vault unlocked. → KT.docfiles */
KT.docfiles = (function () {
  'use strict';
  const DB = 'charmiss_kol_tracker_docs', ST = 'doc_files';
  const MAX_BYTES = 5 * 1024 * 1024, MAX_SIDE = 2000;
  const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  let dbp = null;
  const available = () => { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; } };
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST, { keyPath: 'file_id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const t = db.transaction(ST, mode), q = fn(t.objectStore(ST));
    t.oncomplete = () => res(q ? q.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  const putRec = rec => run('readwrite', s => s.put(rec));
  const getRec = id => run('readonly', s => s.get(id)).then(v => v || null);
  const del = id => (id ? run('readwrite', s => s.delete(id)) : Promise.resolve());
  const all = () => run('readonly', s => s.getAll()).then(v => v || []);
  const newId = () => 'DF-' + [...crypto.getRandomValues(new Uint8Array(6))].map(x => x.toString(16).padStart(2, '0')).join('');

  /* what a picked file may be: PDF / JPG / PNG / WEBP · 5 MB or less → '' or the problem */
  function problem(file) {
    if (!file) return 'none';
    const mime = file.type || '', ext = String(file.name || '').toLowerCase().split('.').pop();
    const ok = TYPES[mime] || (['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : '');
    if (!ok) return 'type';
    if (file.size > MAX_BYTES) return 'size';
    return '';
  }
  const mimeOf = file => file.type || { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[String(file.name || '').toLowerCase().split('.').pop()] || 'application/octet-stream';
  /* a picture with a side over 2000 px is made smaller (the same kind of file · a WEBP stays WEBP) */
  async function shrink(file, mime) {
    if (!/^image\//.test(mime) || typeof createImageBitmap === 'undefined') return new Uint8Array(await file.arrayBuffer());
    let bmp = null; try { bmp = await createImageBitmap(file); } catch (e) { return new Uint8Array(await file.arrayBuffer()); }
    const side = Math.max(bmp.width, bmp.height);
    if (side <= MAX_SIDE) { bmp.close && bmp.close(); return new Uint8Array(await file.arrayBuffer()); }
    const k = MAX_SIDE / side, c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d'); if (mime === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    const blob = await new Promise(r => c.toBlob(r, mime, 0.88));
    return new Uint8Array(await (blob || file).arrayBuffer());
  }
  /* a picked file → encrypted into IndexedDB → { file_id, name, mime, bytes } (only this goes into the state) */
  async function add(vault, file, owner) {
    const p = problem(file); if (p) throw new Error(p);
    const mime = mimeOf(file), bytes = await shrink(file, mime);
    if (bytes.length > MAX_BYTES) throw new Error('size');
    const enc = await KT.vault.encryptBytes(vault, bytes);
    /* the name kept is the kind of document + the type (a picked file's own name may carry a person's name — it is never kept) */
    const id = newId(), kind = String((owner && owner.key) || 'document').replace(/[^\w-]+/g, '_').slice(0, 40);
    const rec = { file_id: id, owner: owner ? { type: owner.type || null, id: owner.id || null } : null, mime, bytes: bytes.length, name: `${kind}.${TYPES[mime] || 'bin'}`, enc, created_at: new Date().toISOString() };
    await putRec(rec);
    bytes.fill(0);
    return { file_id: rec.file_id, name: rec.name, mime, bytes: rec.bytes };
  }
  /* the bytes of a file (vault unlocked) → { bytes, mime, name } or null */
  async function read(fileId) {
    const rec = await getRec(fileId); if (!rec) return null;
    const bytes = await KT.vault.decryptBytes(rec.enc);
    return bytes ? { bytes, mime: rec.mime, name: rec.name } : null;
  }
  /* Settings › Data: how many files and how much room */
  async function sizes() { const list = await all(); return { n: list.length, bytes: list.reduce((a, r) => a + (r.enc && r.enc.data ? r.enc.data.byteLength : r.bytes || 0), 0) }; }
  /* Backup (ticked): every file still encrypted, as text · Restore puts them back */
  const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  async function exportAll() { return (await all()).map(r => Object.assign({}, r, { enc: Object.assign({}, r.enc, { data: b64(r.enc.data) }) })); }
  async function importAll(list) {
    let n = 0;
    for (const r of list || []) { if (!r || !r.file_id || !r.enc) continue; await putRec(Object.assign({}, r, { enc: Object.assign({}, r.enc, { data: unb64(r.enc.data).buffer }) })); n++; }
    return n;
  }
  return { MAX_BYTES, MAX_SIDE, available, problem, add, read, del, all, sizes, exportAll, importAll, getRec };
})();
