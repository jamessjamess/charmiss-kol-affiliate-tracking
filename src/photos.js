/* photos.js — CR-16 §4.4 profile photos of KOLs: kept in this browser's IndexedDB (store kol_photos · key = kol_id · a WebP 256×256 Blob) —
   never in localStorage (no room for 911 × ~20 KB) and never in the state (kol_master.photo only holds {updated_at, updated_by, w, h, bytes}).
   The pictures are read once at start into object URLs, so a screen can draw them straight away (url(kolId)). A browser where IndexedDB
   does not work (some file:// set-ups) → available() false: the upload is switched off, everything else works.
   CR-20 §4.13 — the same database (version 2) keeps the images of Draft notes: store step_images (key = image_id · { image_id, deal_id, step_key,
   blob (WebP, long side ≤ 1600px), w, h, bytes, created_at }) — read on demand (stepUrl), never in localStorage or the state. → KT.photos */
KT.photos = (function () {
  'use strict';
  const DB_NAME = 'charmiss_kol_tracker', STORE = 'kol_photos', STEP = 'step_images';
  let db = null, state = 'idle', stepSizes = new Map();   // idle · ready · off
  const urls = new Map(), sizes = new Map(), listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { /* a listener's own problem */ } });
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = (mode, store) => db.transaction(store || STORE, mode).objectStore(store || STORE);

  /* open the database and read every picture into memory (once, at start) */
  async function init() {
    if (state !== 'idle') return;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('no IndexedDB');
      db = await new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 2); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); if (!r.result.objectStoreNames.contains(STEP)) r.result.createObjectStore(STEP, { keyPath: 'image_id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked')); });
      stepSizes = new Map(((await req(tx('readonly', STEP).getAll())) || []).map(x => [x.image_id, x.bytes || (x.blob && x.blob.size) || 0]));
      const keys = await req(tx('readonly').getAllKeys()), blobs = await req(tx('readonly').getAll());
      keys.forEach((k, i) => { const b = blobs[i]; if (b instanceof Blob) { urls.set(String(k), URL.createObjectURL(b)); sizes.set(String(k), b.size); } });
      state = 'ready';
    } catch (e) { state = 'off'; db = null; }
    emit();
  }
  const available = () => state === 'ready';
  const url = kolId => urls.get(kolId) || null;
  const totals = () => ({ n: sizes.size + stepSizes.size, bytes: [...sizes.values()].concat([...stepSizes.values()]).reduce((a, b) => a + b, 0), profiles: sizes.size, drafts: stepSizes.size });
  function remember(kolId, blob) {
    const old = urls.get(kolId); if (old) URL.revokeObjectURL(old);
    if (blob) { urls.set(kolId, URL.createObjectURL(blob)); sizes.set(kolId, blob.size); } else { urls.delete(kolId); sizes.delete(kolId); }
  }
  async function put(kolId, blob) { if (!available()) throw new Error('photos off'); await req(tx('readwrite').put(blob, kolId)); remember(kolId, blob); emit(); }
  async function remove(kolId) { if (!available()) return; await req(tx('readwrite').delete(kolId)); remember(kolId, null); emit(); }
  /* Merge: the removed KOL's picture goes to the one kept when that one has none · the old key is deleted either way → true when it moved */
  async function move(fromId, toId) {
    if (!available() || fromId === toId) return false;
    const blob = await req(tx('readonly').get(fromId)), moved = blob instanceof Blob && !urls.has(toId);
    if (moved) { await req(tx('readwrite').put(blob, toId)); remember(toId, blob); }
    await req(tx('readwrite').delete(fromId)); remember(fromId, null); emit();
    return moved;
  }

  /* a picked / dropped / pasted image → an <img> (decoded) */
  function load(blob) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { res({ img: im, url: u }); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('not an image')); }; im.src = u; });
  }
  /* the square (R.cropSquare: pan −1 … 1 · zoom ≥ 1) → 256 × 256 WebP (quality 0.8) · a browser without WebP output → JPEG */
  async function render(img, pan, zoom) {
    const R = KT.rules, c = R.cropSquare(img.naturalWidth, img.naturalHeight, pan.x, pan.y, zoom), size = R.PHOTO_SIZE;
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, c.sx, c.sy, c.side, c.side, 0, 0, size, size);
    const out = await new Promise(res => cv.toBlob(res, 'image/webp', R.PHOTO_QUALITY));
    return out && out.type === 'image/webp' ? out : new Promise(res => cv.toBlob(res, 'image/jpeg', R.PHOTO_QUALITY));
  }
  /* ===================== CR-20 §4.13 — Draft note images ===================== */
  const stepUrls = new Map();
  const newImageId = () => 'IMG' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  /* a picked / dropped / pasted image → WebP (quality 0.8 · the long side 1600px at most) → stored · → { image_id, w, h, bytes } */
  async function addStepImage(file, dealId, stepKey) {
    if (!available()) throw new Error('photos off');
    if (!file || !/^image\//.test(file.type || '')) throw new Error('not an image');
    const R = KT.rules, { img, url: u } = await load(file), sz = R.fitImage(img.naturalWidth, img.naturalHeight, R.STEP_IMAGE_SIDE);
    const cv = document.createElement('canvas'); cv.width = sz.w; cv.height = sz.h;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, sz.w, sz.h); URL.revokeObjectURL(u);
    let blob = await new Promise(res => cv.toBlob(res, 'image/webp', R.STEP_IMAGE_QUALITY));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', R.STEP_IMAGE_QUALITY));
    const rec = { image_id: newImageId(), deal_id: dealId, step_key: stepKey, blob, w: sz.w, h: sz.h, bytes: blob.size, created_at: new Date().toISOString() };
    await req(tx('readwrite', STEP).put(rec)); stepSizes.set(rec.image_id, rec.bytes); stepUrls.set(rec.image_id, URL.createObjectURL(blob)); emit();
    return { image_id: rec.image_id, w: rec.w, h: rec.h, bytes: rec.bytes };
  }
  /* the object URL of an image (read once) · null when it is not in this browser */
  async function stepUrl(id) {
    if (stepUrls.has(id)) return stepUrls.get(id);
    if (!available()) return null;
    const rec = await req(tx('readonly', STEP).get(id));
    const u = rec && rec.blob instanceof Blob ? URL.createObjectURL(rec.blob) : null; if (u) stepUrls.set(id, u); return u;
  }
  const stepUrlNow = id => stepUrls.get(id) || null;
  async function removeStepImages(ids) {
    if (!available() || !ids || !ids.length) return;
    for (const id of ids) { await req(tx('readwrite', STEP).delete(id)); const u = stepUrls.get(id); if (u) URL.revokeObjectURL(u); stepUrls.delete(id); stepSizes.delete(id); }
    emit();
  }
  /* Backup › Include photos & draft images: { image_id: { deal_id, step_key, w, h, created_at, data: 'data:image/webp;base64,…' } } */
  async function exportStepImages() {
    if (!available()) return {};
    const all = await req(tx('readonly', STEP).getAll()), out = {};
    for (const r of all) out[r.image_id] = { deal_id: r.deal_id, step_key: r.step_key, w: r.w, h: r.h, created_at: r.created_at, data: await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(r.blob); }) };
    return out;
  }
  async function importStepImages(map) {
    if (!available() || !map) return 0;
    let n = 0;
    for (const [id, v] of Object.entries(map)) {
      if (!v || typeof v.data !== 'string' || !/^data:image\/(webp|png|jpeg);base64,/.test(v.data)) continue;
      const blob = await (await fetch(v.data)).blob();
      await req(tx('readwrite', STEP).put({ image_id: id, deal_id: v.deal_id || null, step_key: v.step_key || null, blob, w: v.w || null, h: v.h || null, bytes: blob.size, created_at: v.created_at || null }));
      stepSizes.set(id, blob.size); n++;
    }
    emit(); return n;
  }

  /* Backup › Include photos: every picture as a data URL { kol_id: 'data:image/webp;base64,…' } */
  async function exportAll() {
    if (!available()) return {};
    const keys = await req(tx('readonly').getAllKeys()), blobs = await req(tx('readonly').getAll()), out = {};
    for (let i = 0; i < keys.length; i++) out[keys[i]] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blobs[i]); });
    return out;
  }
  /* Restore with photos: they are written back (one kol_id at a time; the ones not in the file stay as they are) */
  async function importAll(map) {
    if (!available() || !map) return 0;
    let n = 0;
    for (const [k, v] of Object.entries(map)) {
      if (typeof v !== 'string' || !/^data:image\/(webp|png|jpeg);base64,/.test(v)) continue;
      const blob = await (await fetch(v)).blob(); await req(tx('readwrite').put(blob, k)); remember(k, blob); n++;
    }
    emit(); return n;
  }
  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  return { init, available, url, totals, put, remove, move, load, render, exportAll, importAll, onChange, isReady: () => state !== 'idle',
    addStepImage, stepUrl, stepUrlNow, removeStepImages, exportStepImages, importStepImages };
})();
