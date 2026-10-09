/* pdf.js — CR-33 §3.8: a small PDF writer for Print (no library from outside — plain JS, works offline / file://).
   - pages from JPEG pictures (the Payment summary is drawn by the browser into a picture, so Thai is shaped right · links on it stay clickable);
   - pages copied from an uploaded PDF (its page tree is read: classic xref tables, xref streams, object streams, PNG predictors) — an encrypted or
     unreadable PDF throws, and the caller lists it as "not included".
   Nothing is kept: the bytes go to the download and are dropped. → KT.pdf */
KT.pdf = (function () {
  'use strict';
  const A4 = [595.28, 841.89];
  const te = new TextEncoder();
  const fmt = n => { const v = Math.round(n * 100) / 100; return String(v); };

  /* ---------- values ---------- */
  const ref = n => ({ t: 'ref', n });
  const name = v => ({ t: 'name', v: v.startsWith('/') ? v : '/' + v });
  const num = v => ({ t: 'num', v: typeof v === 'number' ? fmt(v) : String(v) });
  const str = s => ({ t: 'str', b: typeof s === 'string' ? te.encode(s) : s });
  const dict = obj => ({ t: 'dict', m: new Map(Object.entries(obj).map(([k, v]) => [k.startsWith('/') ? k : '/' + k, v])) });
  const isT = (v, t) => v && typeof v === 'object' && v.t === t;

  /* ---------- writer ---------- */
  function create() {
    const objs = [];   // objs[n - 1] = value
    const add = v => { objs.push(v); return ref(objs.length); };
    const reserve = () => add(null);
    const pagesRef = reserve(), kids = [];
    const pageDict = (o) => dict(Object.assign({ Type: name('Page'), Parent: pagesRef, MediaBox: [num(0), num(0), num(A4[0]), num(A4[1])] }, o));
    /* a page with one JPEG on it · o.full: the whole page (the summary) · else fitted inside 28 pt margins · o.links [{x, y, w, h (picture px), url}] */
    function addJpegPage(jpeg, w, h, o = {}) {
      const img = add({ t: 'stream', dict: dict({ Type: name('XObject'), Subtype: name('Image'), Width: num(w), Height: num(h), ColorSpace: name('DeviceRGB'), BitsPerComponent: num(8), Filter: name('DCTDecode') }), data: jpeg });
      let dw, dh, dx, dy;
      if (o.full) { dw = A4[0]; dh = A4[1]; dx = 0; dy = 0; }
      else { const m = 28, k = Math.min((A4[0] - 2 * m) / w, (A4[1] - 2 * m) / h); dw = w * k; dh = h * k; dx = (A4[0] - dw) / 2; dy = (A4[1] - dh) / 2; }
      const content = add({ t: 'stream', dict: dict({}), data: te.encode(`q ${fmt(dw)} 0 0 ${fmt(dh)} ${fmt(dx)} ${fmt(dy)} cm /Im0 Do Q`) });
      const annots = (o.links || []).filter(l => /^https?:\/\//i.test(l.url)).map(l => {
        const sx = dw / w, sy = dh / h, x1 = dx + l.x * sx, x2 = dx + (l.x + l.w) * sx, y2 = dy + dh - l.y * sy, y1 = dy + dh - (l.y + l.h) * sy;
        return add(dict({ Type: name('Annot'), Subtype: name('Link'), Rect: [num(x1), num(y1), num(x2), num(y2)], Border: [num(0), num(0), num(0)], A: dict({ S: name('URI'), URI: str(l.url) }) }));
      });
      const page = add(pageDict(Object.assign({ Resources: dict({ XObject: dict({ Im0: img }) }), Contents: content }, annots.length ? { Annots: annots } : {})));
      kids.push(page); return kids.length;
    }
    /* every page of a PDF (bytes) → added at the end · → how many */
    async function importPdf(bytes) {
      const doc = await parse(bytes);
      if (doc.trailer.m.has('/Encrypt')) throw new Error('encrypted');
      const pages = pagesOf(doc); if (!pages.length) throw new Error('no pages');
      const map = new Map();
      const copy = v => {
        if (isT(v, 'ref')) {
          if (map.has(v.n)) return ref(map.get(v.n));
          const r = reserve(); map.set(v.n, r.n);
          objs[r.n - 1] = copy(doc.get(v.n));
          return r;
        }
        if (Array.isArray(v)) return v.map(copy);
        if (isT(v, 'dict')) { const m = new Map(); v.m.forEach((x, k) => m.set(k, copy(x))); return { t: 'dict', m }; }
        if (isT(v, 'stream')) { const m = new Map(); v.dict.m.forEach((x, k) => { if (k !== '/Length') m.set(k, copy(x)); }); return { t: 'stream', dict: { t: 'dict', m }, data: v.data }; }
        return v;
      };
      for (const p of pages) {
        const m = new Map([['/Type', name('Page')], ['/Parent', pagesRef]]);
        ['/MediaBox', '/CropBox', '/Rotate', '/Resources', '/Contents', '/UserUnit'].forEach(k => { if (p.attrs.has(k)) m.set(k, copy(p.attrs.get(k))); });
        if (!m.has('/MediaBox')) m.set('/MediaBox', [num(0), num(0), num(A4[0]), num(A4[1])]);
        kids.push(add({ t: 'dict', m }));
      }
      return pages.length;
    }
    function save() {
      objs[pagesRef.n - 1] = dict({ Type: name('Pages'), Kids: kids, Count: num(kids.length) });
      const catalog = add(dict({ Type: name('Catalog'), Pages: pagesRef }));
      const chunks = [], offsets = []; let pos = 0;
      const put = x => { const b = typeof x === 'string' ? te.encode(x) : x; chunks.push(b); pos += b.length; };
      put('%PDF-1.7\n'); put(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
      objs.forEach((v, i) => { offsets[i] = pos; put(`${i + 1} 0 obj\n`); write(v == null ? null : v, put); put('\nendobj\n'); });
      const xref = pos;
      put(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`); offsets.forEach(o => put(String(o).padStart(10, '0') + ' 00000 n \n'));
      put(`trailer\n<< /Size ${objs.length + 1} /Root ${catalog.n} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      const out = new Uint8Array(pos); let at = 0; chunks.forEach(c => { out.set(c, at); at += c.length; });
      return out;
    }
    return { addJpegPage, importPdf, save, get pageCount() { return kids.length; } };
  }
  function write(v, put) {
    if (v === null || v === undefined) { put('null'); return; }
    if (v === true || v === false) { put(String(v)); return; }
    if (Array.isArray(v)) { put('['); v.forEach((x, i) => { if (i) put(' '); write(x, put); }); put(']'); return; }
    switch (v.t) {
      case 'ref': put(`${v.n} 0 R`); return;
      case 'name': case 'num': case 'raw': put(v.v); return;
      case 'str': put('<' + [...v.b].map(x => x.toString(16).padStart(2, '0')).join('') + '>'); return;
      case 'dict': put('<<'); v.m.forEach((x, k) => { put(k + ' '); write(x, put); put(' '); }); put('>>'); return;
      case 'stream': { const m = new Map(v.dict.m); m.set('/Length', num(v.data.length)); write({ t: 'dict', m }, put); put('\nstream\n'); put(v.data); put('\nendstream'); return; }
      default: put('null');
    }
  }

  /* ---------- reader ---------- */
  const WS = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);
  const ascii = (b, a, z) => { let s = ''; for (let i = a; i < z; i++) s += String.fromCharCode(b[i]); return s; };
  function lexer(b, start) {
    let p = start || 0;
    const skip = () => { for (;;) { while (p < b.length && WS.has(b[p])) p++; if (b[p] === 37) { while (p < b.length && b[p] !== 10 && b[p] !== 13) p++; } else break; } };
    const word = () => { const a = p; while (p < b.length && !WS.has(b[p]) && !DELIM.has(b[p])) p++; return ascii(b, a, p); };
    function value() {
      skip(); const c = b[p];
      if (c === 60 && b[p + 1] === 60) { p += 2; const m = new Map(); for (;;) { skip(); if (b[p] === 62 && b[p + 1] === 62) { p += 2; break; } if (p >= b.length) throw new Error('eof'); const k = value(); if (!isT(k, 'name')) throw new Error('key'); m.set(k.v, value()); } return { t: 'dict', m }; }
      if (c === 60) { p++; let h = ''; while (p < b.length && b[p] !== 62) { if (!WS.has(b[p])) h += String.fromCharCode(b[p]); p++; } p++; if (h.length % 2) h += '0'; const out = new Uint8Array(h.length / 2); for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16); return { t: 'str', b: out }; }
      if (c === 40) {
        p++; const out = []; let depth = 1;
        while (p < b.length) {
          const x = b[p++];
          if (x === 92) { const y = b[p++]; const E = { 110: 10, 114: 13, 116: 9, 98: 8, 102: 12 };
            if (E[y] !== undefined) out.push(E[y]); else if (y >= 48 && y <= 55) { let o = y - 48; for (let k = 0; k < 2 && b[p] >= 48 && b[p] <= 55; k++) o = o * 8 + (b[p++] - 48); out.push(o & 255); }
            else if (y === 13) { if (b[p] === 10) p++; } else if (y !== 10) out.push(y); continue; }
          if (x === 40) depth++; else if (x === 41 && --depth === 0) break;
          out.push(x);
        }
        return { t: 'str', b: new Uint8Array(out) };
      }
      if (c === 91) { p++; const a = []; for (;;) { skip(); if (b[p] === 93) { p++; break; } if (p >= b.length) throw new Error('eof'); a.push(value()); } return a; }
      if (c === 47) { const a = p; p++; while (p < b.length && !WS.has(b[p]) && !DELIM.has(b[p])) p++; return name(ascii(b, a, p)); }
      const w = word(); if (!w) { p++; throw new Error('token'); }
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
        if (/^\d+$/.test(w)) { const save = p; skip(); const w2 = word(); if (/^\d+$/.test(w2)) { skip(); if (b[p] === 82 && (p + 1 >= b.length || WS.has(b[p + 1]) || DELIM.has(b[p + 1]))) { p++; return ref(Number(w)); } } p = save; }
        return num(w);
      }
      if (w === 'true') return true; if (w === 'false') return false; if (w === 'null') return null;
      return { t: 'raw', v: w };
    }
    return { value, skip, word, get pos() { return p; }, set pos(v) { p = v; } };
  }
  async function inflate(data) {
    const go = async kind => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream(kind))).arrayBuffer());
    try { return await go('deflate'); } catch (e) { return go('deflate-raw').catch(() => { throw new Error('inflate'); }); }
  }
  function unpredict(data, parms) {
    const pr = parms && parms.m.get('/Predictor') ? Number(parms.m.get('/Predictor').v) : 1; if (pr < 10) return data;
    const cols = parms.m.get('/Columns') ? Number(parms.m.get('/Columns').v) : 1, colors = parms.m.get('/Colors') ? Number(parms.m.get('/Colors').v) : 1, bpc = parms.m.get('/BitsPerComponent') ? Number(parms.m.get('/BitsPerComponent').v) : 8;
    const bpp = Math.max(1, Math.ceil(colors * bpc / 8)), row = Math.ceil(cols * colors * bpc / 8), out = new Uint8Array(Math.floor(data.length / (row + 1)) * row);
    let prev = new Uint8Array(row);
    for (let r = 0, i = 0; i + row < data.length + 1 && r * row < out.length; r++) {
      const type = data[i++], cur = out.subarray(r * row, r * row + row);
      for (let k = 0; k < row; k++) {
        const x = data[i++] || 0, a = k >= bpp ? cur[k - bpp] : 0, up = prev[k], c = k >= bpp ? prev[k - bpp] : 0;
        cur[k] = (type === 1 ? x + a : type === 2 ? x + up : type === 3 ? x + ((a + up) >> 1) : type === 4 ? x + paeth(a, up, c) : x) & 255;
      }
      prev = cur;
    }
    return out;
  }
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  async function decode(stream) {
    let data = stream.data; const f = stream.dict.m.get('/Filter'), filters = f ? (Array.isArray(f) ? f : [f]) : [];
    const pa = stream.dict.m.get('/DecodeParms'), parms = pa ? (Array.isArray(pa) ? pa : [pa]) : [];
    for (let i = 0; i < filters.length; i++) {
      if (filters[i].v !== '/FlateDecode' && filters[i].v !== '/Fl') throw new Error('filter ' + filters[i].v);
      data = unpredict(await inflate(data), parms[i]);
    }
    return data;
  }
  const findBack = (b, s, from) => { const t = te.encode(s); for (let i = Math.min(from, b.length - t.length); i >= 0; i--) { let ok = true; for (let k = 0; k < t.length; k++) if (b[i + k] !== t[k]) { ok = false; break; } if (ok) return i; } return -1; };
  /* the document: get(n) → the object (streams with their raw bytes) · trailer */
  async function parse(b) {
    const entries = new Map();   // n → { off } | { stm, idx }
    let trailer = null;
    const readObjAt = (off, lenOf) => {
      const L = lexer(b, off); L.value(); L.value(); L.skip(); L.word();   // n g obj
      const v = L.value(); L.skip();
      if (isT(v, 'dict') && b[L.pos] === 115 && ascii(b, L.pos, L.pos + 6) === 'stream') {
        let p = L.pos + 6; if (b[p] === 13) p++; if (b[p] === 10) p++;
        let len = v.m.get('/Length'); len = isT(len, 'ref') ? lenOf(len.n) : len ? Number(len.v) : 0;
        if (!(len >= 0) || p + len > b.length) { const e = findFwd(b, 'endstream', p); len = e < 0 ? 0 : e - p; while (len > 0 && (b[p + len - 1] === 10 || b[p + len - 1] === 13)) len--; }
        return { t: 'stream', dict: v, data: b.subarray(p, p + len) };
      }
      return v;
    };
    const cache = new Map(), stmCache = new Map();
    const lenOf = n => { const v = getSync(n); return v && v.t === 'num' ? Number(v.v) : -1; };
    const getSync = n => { const e = entries.get(n); if (!e || e.stm) return cache.get(n) || null; if (!cache.has(n)) cache.set(n, readObjAt(e.off, lenOf)); return cache.get(n); };
    async function loadStm(stmNo) {
      if (stmCache.has(stmNo)) return; stmCache.set(stmNo, true);
      const s = getSync(stmNo); if (!isT(s, 'stream')) return;
      const data = await decode(s), N = Number(s.dict.m.get('/N').v), first = Number(s.dict.m.get('/First').v), L = lexer(data, 0), heads = [];
      for (let i = 0; i < N; i++) { const a = L.value(), o = L.value(); heads.push([Number(a.v), Number(o.v)]); }
      heads.forEach(([n, o]) => { const e = entries.get(n); if (e && e.stm === stmNo && !cache.has(n)) { const L2 = lexer(data, first + o); cache.set(n, L2.value()); } });
    }
    async function readXrefAt(off, seen) {
      if (seen.has(off) || off < 0 || off >= b.length) return; seen.add(off);
      const L = lexer(b, off); L.skip();
      if (ascii(b, L.pos, L.pos + 4) === 'xref') {
        L.pos = L.pos + 4;
        for (;;) {
          L.skip(); const save = L.pos, w = L.word(); if (w === 'trailer') break; if (!/^\d+$/.test(w)) { L.pos = save; break; }
          const start = Number(w); L.skip(); const count = Number(L.word());
          for (let i = 0; i < count; i++) { L.skip(); const o = Number(L.word()); L.skip(); L.word(); L.skip(); const t = L.word(); if (t === 'n' && !entries.has(start + i)) entries.set(start + i, { off: o }); }
        }
        const t = L.value(); if (!trailer) trailer = t;
        if (t.m.has('/XRefStm')) await readXrefAt(Number(t.m.get('/XRefStm').v), seen);
        if (t.m.has('/Prev')) await readXrefAt(Number(t.m.get('/Prev').v), seen);
        return;
      }
      const s = readObjAt(off, () => -1); if (!isT(s, 'stream')) throw new Error('xref');
      if (!trailer) trailer = s.dict;
      const data = await decode(s), W = s.dict.m.get('/W').map(x => Number(x.v)), size = Number((s.dict.m.get('/Size') || num(0)).v);
      const idx = s.dict.m.get('/Index') ? s.dict.m.get('/Index').map(x => Number(x.v)) : [0, size], rowLen = W[0] + W[1] + W[2];
      const field = (p, n, def) => { if (!n) return def; let v = 0; for (let k = 0; k < n; k++) v = v * 256 + data[p + k]; return v; };
      let p = 0;
      for (let k = 0; k < idx.length; k += 2) for (let i = 0; i < idx[k + 1]; i++, p += rowLen) {
        const n = idx[k] + i, type = field(p, W[0], 1), f2 = field(p + W[0], W[1], 0), f3 = field(p + W[0] + W[1], W[2], 0);
        if (entries.has(n)) continue;
        if (type === 1) entries.set(n, { off: f2 }); else if (type === 2) entries.set(n, { stm: f2, idx: f3 });
      }
      if (s.dict.m.has('/Prev')) await readXrefAt(Number(s.dict.m.get('/Prev').v), seen);
    }
    try {
      const sx = findBack(b, 'startxref', b.length - 1); if (sx < 0) throw new Error('startxref');
      const L = lexer(b, sx + 9); L.skip(); await readXrefAt(Number(L.word()), new Set());
      if (!trailer || !trailer.m.has('/Root')) throw new Error('trailer');
    } catch (e) { rebuild(); }
    function rebuild() {   // a broken xref: every "n g obj" in the file
      entries.clear(); cache.clear(); trailer = null;
      const s = ascii(b, 0, b.length), re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
      while ((m = re.exec(s))) entries.set(Number(m[1]), { off: m.index });
      const t = findBack(b, 'trailer', b.length - 1);
      if (t >= 0) { const L = lexer(b, t + 7); trailer = L.value(); }
      if (!trailer || !isT(trailer, 'dict')) { for (const [n] of entries) { const v = getSync(n); if (isT(v, 'dict') && v.m.get('/Type') && v.m.get('/Type').v === '/Catalog') { trailer = { t: 'dict', m: new Map([['/Root', ref(n)]]) }; break; } } }
      if (!trailer) throw new Error('unreadable');
    }
    /* objects inside object streams are read before they are asked for */
    for (const e of [...entries.values()]) if (e.stm) await loadStm(e.stm);
    return { trailer, get: n => getSync(n) };
  }
  const findFwd = (b, s, from) => { const t = te.encode(s); for (let i = from; i <= b.length - t.length; i++) { let ok = true; for (let k = 0; k < t.length; k++) if (b[i + k] !== t[k]) { ok = false; break; } if (ok) return i; } return -1; };
  /* the pages in order, with what they inherit (Resources · MediaBox · CropBox · Rotate) */
  function pagesOf(doc) {
    const res = (v, d = 0) => (isT(v, 'ref') && d < 32 ? res(doc.get(v.n), d + 1) : v);
    const root = res(doc.trailer.m.get('/Root')); if (!isT(root, 'dict')) return [];
    const out = [], seen = new Set();
    const walk = (node, inh) => {
      const nd = res(node); if (!isT(nd, 'dict') || seen.has(nd)) return; seen.add(nd);
      const attrs = new Map(inh); ['/Resources', '/MediaBox', '/CropBox', '/Rotate'].forEach(k => { if (nd.m.has(k)) attrs.set(k, nd.m.get(k)); });
      const type = nd.m.get('/Type'), kids = res(nd.m.get('/Kids'));
      if ((type && type.v === '/Pages') || Array.isArray(kids)) { (kids || []).forEach(k => walk(k, attrs)); return; }
      ['/Contents', '/UserUnit'].forEach(k => { if (nd.m.has(k)) attrs.set(k, nd.m.get(k)); });
      out.push({ attrs });
    };
    walk(root.m.get('/Pages'), new Map());
    return out;
  }
  /* how many pages a PDF has (a check) */
  async function pageCount(bytes) { return pagesOf(await parse(bytes)).length; }
  return { A4, create, parse, pageCount };
})();
