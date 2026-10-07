/* xlsx.js — CR-08 §4.7: a small .xlsx writer of our own (no library, nothing from a CDN): SpreadsheetML parts in a zip that only
   stores (no compression). Cells: text (inline strings), numbers (2 decimals shown with #,##0.00), TRUE / FALSE and =SUM() formulas.
   KT.xlsx.workbook([{ name, rows: [[cell…]…], widths: [chars…] }]) → Uint8Array · cell = value | { v, t: 'n' | 's' | 'b' | 'f', bold, money }
   CR-11 §4.7 — and a reader, for Match with PR file: KT.xlsx.read(bytes) → Promise<{ sheets: [{ name, rows: [[text | number]…] }] }> (stored or deflated
   parts — DecompressionStream, nothing from a CDN) · KT.xlsx.readCsv(text) → the same shape. All in memory: the caller keeps only the columns it maps. */
KT.xlsx = (function () {
  'use strict';
  const te = new TextEncoder();
  /* ---------- zip (store) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /* files: [{ name, data: Uint8Array }] → the zip */
  function zip(files) {
    const parts = [], central = []; let offset = 0;
    const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF], u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;   // a fixed stamp: the same input gives the same bytes
    files.forEach(f => {
      const name = te.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const head = new Uint8Array([0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
      parts.push(head, name, f.data);
      central.push(new Uint8Array([0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(size), ...u32(size),
        ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += head.length + name.length + size;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const all = parts.concat(central, [end]), out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; all.forEach(b => { out.set(b, p); p += b.length; });
    return out;
  }
  /* ---------- SpreadsheetML ---------- */
  const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const colName = i => { let s = '', n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const ref = (c, r) => colName(c) + (r + 1);
  /* styles: 0 plain · 1 bold · 2 money · 3 bold money */
  const styleOf = c => (c.money ? (c.bold ? 3 : 2) : c.bold ? 1 : 0);
  function cellXML(cell, c, r) {
    if (cell == null || cell === '') return '';
    const o = typeof cell === 'object' ? cell : { v: cell }, s = styleOf(o), at = `r="${ref(c, r)}"${s ? ` s="${s}"` : ''}`;
    const t = o.t || (typeof o.v === 'number' ? 'n' : typeof o.v === 'boolean' ? 'b' : 's');
    if (t === 'f') return `<c ${at}><f>${xml(o.v)}</f></c>`;
    if (t === 'n') return isFinite(o.v) ? `<c ${at}><v>${Number(o.v)}</v></c>` : '';
    if (t === 'b') return `<c ${at} t="b"><v>${o.v ? 1 : 0}</v></c>`;
    return `<c ${at} t="inlineStr"><is><t xml:space="preserve">${xml(o.v)}</t></is></c>`;
  }
  function sheetXML(sheet) {
    const cols = (sheet.widths || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const rows = sheet.rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => cellXML(cell, c, r)).join('')}</row>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      (sheet.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '') +
      (cols ? `<cols>${cols}</cols>` : '') + `<sheetData>${rows}</sheetData></worksheet>`;
  }
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  /* sheet names: at most 31 characters, none of : \ / ? * [ ] */
  const sheetName = n => String(n).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);
  function workbook(sheets) {
    const files = [];
    const add = (name, text) => files.push({ name, data: te.encode(text) });
    add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + `</Types>`);
    add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheets.map((s, i) => `<sheet name="${xml(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`);
    add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    add('xl/styles.xml', STYLES);
    sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXML(s)));
    return zip(files);
  }
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  /* ===================== reading (CR-11 §4.7) ===================== */
  const td = new TextDecoder('utf-8');
  /* the parts of a zip from its central directory → Map name → { method, data (as stored), size } */
  function unzip(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let e = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054B50) { e = i; break; }
    if (e < 0) throw new Error('not a zip');
    const count = dv.getUint16(e + 10, true), out = new Map();
    let p = dv.getUint32(e + 16, true);
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014B50) throw new Error('bad zip');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = td.decode(b.subarray(p + 46, p + 46 + nl));
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      out.set(name, { method, data: b.subarray(start, start + csize), size });
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function inflateRaw(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function partText(parts, name) {
    const f = parts.get(name); if (!f) return null;
    return td.decode(f.method === 0 ? f.data : f.method === 8 ? await inflateRaw(f.data) : new Uint8Array(0));
  }
  const unxml = t => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
  const attr = (tag, name) => { const m = tag.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"')); return m ? unxml(m[1]) : null; };
  /* the text of an <si> / <is>: every <t> run (not the phonetic <rPh>) */
  const runs = x => unxml(x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<t\b[^>]*\/>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>/g)?.map(t => t.replace(/^<t\b[^>]*>|<\/t>$/g, '')).join('') || '');
  const colIndex = r => { const m = /^([A-Z]+)/.exec(r || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  function sheetRows(xml, shared) {
    const rows = [];
    (xml.match(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g) || []).forEach((rowXml, ri) => {
      const rn = Number(attr(rowXml.match(/^<row\b[^>]*>/)[0], 'r')) || ri + 1, row = [];
      (rowXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach((c, ci) => {
        const open = c.match(/^<c\b[^>]*?\/?>/)[0], t = attr(open, 't'), r = attr(open, 'r'), i = r ? colIndex(r) : ci;
        const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = null;
        if (t === 's') val = v == null ? null : shared[Number(v)] == null ? null : shared[Number(v)];
        else if (t === 'inlineStr') val = runs((c.match(/<is>[\s\S]*?<\/is>/) || [''])[0]);
        else if (t === 'str' || t === 'e') val = v == null ? null : unxml(v);
        else if (t === 'b') val = v == null ? null : v === '1' ? 'TRUE' : 'FALSE';
        else val = v == null || v === '' ? null : isNaN(v) ? unxml(v) : Number(v);
        if (i >= 0) row[i] = val;
      });
      for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = null;
      rows[rn - 1] = row;
    });
    for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
    return rows;
  }
  /* bytes of a .xlsx → { sheets: [{ name, rows }] } in the order of the workbook */
  async function read(bytes) {
    const parts = unzip(bytes), wb = await partText(parts, 'xl/workbook.xml');
    if (wb == null) throw new Error('not a workbook');
    const rels = (await partText(parts, 'xl/_rels/workbook.xml.rels')) || '', target = new Map();
    (rels.match(/<Relationship\b[^>]*>/g) || []).forEach(t => target.set(attr(t, 'Id'), attr(t, 'Target')));
    const ssXml = await partText(parts, 'xl/sharedStrings.xml'), shared = ssXml ? (ssXml.match(/<si\b[^>]*>[\s\S]*?<\/si>|<si\s*\/>/g) || []).map(runs) : [];
    const sheets = [];
    for (const [k, t] of (wb.match(/<sheet\b[^>]*>/g) || []).entries()) {
      const id = attr(t, 'r:id'), tg = target.get(id) || `worksheets/sheet${k + 1}.xml`;
      const path = tg.startsWith('/') ? tg.slice(1) : 'xl/' + tg.replace(/^\.\//, '');
      const xml = await partText(parts, path); if (xml == null) continue;
      sheets.push({ name: attr(t, 'name') || `Sheet${k + 1}`, rows: sheetRows(xml, shared) });
    }
    return { sheets };
  }
  /* a .csv (comma, or Tab / semicolon when the first line has more of them) → one sheet · quotes "…" with "" inside */
  function readCsv(text, name) {
    const t = String(text || '').replace(/^\uFEFF/, ''), first = t.split(/\r?\n/)[0] || '';
    const sep = [',', '\t', ';'].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
      if (ch === '"' && cell === '') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return { sheets: [{ name: name || 'CSV', rows: rows.map(r => r.map(c => (c.trim() === '' ? null : c))) }] };
  }

  return { crc32, zip, colName, ref, sheetName, workbook, MIME, unzip, read, readCsv };
})();
