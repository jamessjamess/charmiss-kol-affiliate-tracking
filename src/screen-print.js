/* screen-print.js — CR-33 §3.8: Print — one PDF for a row or a whole round (a new page for each row), made here and downloaded at once (nothing kept):
   1. Payment summary (Project · Account · Type · Full name · ID-card address · Bank · Account number · Gross · VAT · WHT · Net · PIC · PR round · Deal ID · Post link + Posted on)
      drawn by the browser (Thai shaped right) into a page picture — the links on it stay clickable · "Linked — not included" lists the documents that are links;
   2. ID copy → Bank book → (Company certificate · VAT certificate); 3. Post proof → the others (a picture = one page fitted to A4 · a PDF = its own pages) ·
   All documents in one file (a file) goes right after the summary. The vault is unlocked for it (the personal fields and the files) · Printed dd/mm · who on each line. → KT.print */
KT.print = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, esc, state, commit, toast, can, store, userId } = U;
  const P = () => C.pay.print;
  const W = 1240, H = 1754, M = 90;   // A4 at 150 dpi
  const FONT = '"Sarabun","Noto Sans Thai","Leelawadee UI","Tahoma",sans-serif';

  /* Thai has no spaces between words: lines break at word ends (Intl.Segmenter), else at any character */
  function wrap(g, text, width) {
    const parts = typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter('th', { granularity: 'word' }).segment(String(text))].map(x => x.segment) : String(text).split('');
    const lines = []; let cur = '';
    parts.forEach(w => {
      if (g.measureText(cur + w).width <= width || !cur) { cur += w; while (g.measureText(cur).width > width && cur.length > 1) { let k = cur.length - 1; while (k > 1 && g.measureText(cur.slice(0, k)).width > width) k--; lines.push(cur.slice(0, k)); cur = cur.slice(k); } }
      else { lines.push(cur); cur = w.replace(/^\s+/, ''); }
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  /* the summary page → { jpeg (bytes), w, h, links [{x, y, w, h, url}] } */
  async function summaryPage(plan, rec, meta) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), links = [];
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.textBaseline = 'top';
    let y = M;
    g.fillStyle = '#101828'; g.font = `700 44px ${FONT}`; g.fillText(P().title, M, y); y += 60;
    g.fillStyle = '#475467'; g.font = `26px ${FONT}`;
    wrap(g, [plan.summary.round ? `${P().round}: ${plan.summary.round}` : P().noRound, meta.when, meta.by ? P().printedBy(meta.by) : ''].filter(Boolean).join('  ·  '), W - 2 * M).forEach(t => { g.fillText(t, M, y); y += 36; });
    y += 18; g.fillStyle = '#d0d5dd'; g.fillRect(M, y, W - 2 * M, 2); y += 22;
    const LW = 300, VX = M + LW + 20, VW = W - M - VX;
    R.printRows(plan, rec).forEach(([label, value, url]) => {
      g.font = `26px ${FONT}`; g.fillStyle = '#667085'; if (label) g.fillText(label, M, y);
      g.font = `28px ${FONT}`; g.fillStyle = url ? '#175cd3' : '#101828';
      const lines = wrap(g, value == null || value === '' ? '—' : String(value), VW), y0 = y;
      lines.forEach(t => { g.fillText(t, VX, y); y += 38; });
      if (url) { g.fillRect(VX, y - 4, Math.min(VW, g.measureText(lines[0]).width), 2); links.push({ x: VX, y: y0, w: VW, h: y - y0, url }); }
      y += 8;
    });
    y += 10; g.fillStyle = '#d0d5dd'; g.fillRect(M, y, W - 2 * M, 2); y += 22;
    const list = (title, rows, color) => {
      if (!rows.length) return;
      g.font = `700 28px ${FONT}`; g.fillStyle = color; g.fillText(title, M, y); y += 42;
      rows.forEach(r => { g.font = `26px ${FONT}`; g.fillStyle = r.url ? '#175cd3' : '#344054'; const t = `•  ${r.label}${r.url ? ` — ${r.url}` : r.note ? ` — ${r.note}` : ''}`, y0 = y;
        wrap(g, t, W - 2 * M - 20).forEach(s1 => { g.fillText(s1, M + 20, y); y += 34; }); if (r.url) links.push({ x: M + 20, y: y0, w: W - 2 * M - 20, h: y - y0, url: r.url }); y += 4; });
      y += 14;
    };
    list(P().included, meta.included.map(x => ({ label: x.label, note: x.name })), '#067647');
    list(P().linked, meta.linked.map(x => ({ label: x.label, url: x.url })), '#b54708');
    list(P().notIncluded, meta.failed.map(x => ({ label: x.label, note: x.why })), '#b42318');
    list(P().missing, (plan.missing || []).map(m => ({ label: m })), '#b42318');
    g.font = `22px ${FONT}`; g.fillStyle = '#98a2b3'; g.fillText(P().footer(plan.summary.line_id || plan.key || '', plan.summary.deal_id || ''), M, H - M + 20);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: W, h: H, links };
  }
  /* a picture file → a JPEG page picture (white behind a PNG / WEBP) */
  async function toJpeg(bytes, mime) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0); bmp.close && bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
  }
  const vaultOf = () => state().lookups.payee_vault || null;
  /* who may print: whoever may export (the file has personal data) */
  const canPrint = () => can('payment.export');
  /* items = rows (To pay / Submitted rows or lines) · o = { label (the round's name — the file name), after } */
  async function print(items, o = {}) {
    if (!canPrint()) { toast(C.pay.simple.exportNeedsManager); return; }
    const s = state(), vault = vaultOf();
    if (!vault) { toast(C.newKol.vaultNone); return; }
    /* after the unlock dialog has closed (its close event comes a moment later and would answer the next dialog) */
    if (!KT.vault.isUnlocked(vault)) { KT.payee.unlockDialog(() => setTimeout(() => print(items, o), 60), { for: 'export' }); return; }
    const plans = items.map(x => R.printPlan(s, x));
    /* links can't go into the PDF (Google Drive asks to sign in): said before the file is made */
    const nLinks = plans.reduce((a, pl) => a + pl.links.length, 0);
    if (nLinks && !(await U.confirmDialog(P().linksTitle(nLinks), P().linksBody, P().printAnyway))) return;
    toast(P().working);
    const doc = KT.pdf.create(), when = R.dmy(U.today()), by = R.changedByName(s, userId());
    for (const pl of plans) {
      const p = pl.summary.payee_id ? R.payeeById(s, pl.summary.payee_id) : null, rec = p && p.secure ? await KT.vault.decrypt(p.secure) : null;
      /* the files first (to know what could not go in), then the summary in front of them */
      const pages = [], failed = [], included = [];
      for (const f of pl.files) {
        const got = await KT.docfiles.read(f.file_id);
        if (!got) { failed.push({ label: f.label, why: P().cannotRead }); continue; }
        try {
          if (/^image\//.test(got.mime)) pages.push({ kind: 'img', data: await toJpeg(got.bytes, got.mime) });
          else if (got.mime === 'application/pdf') pages.push({ kind: 'pdf', data: got.bytes });
          else { failed.push({ label: f.label, why: P().cannotRead }); continue; }
          included.push({ label: f.label, name: f.name });
        } catch (e) { failed.push({ label: f.label, why: P().cannotRead }); }
      }
      const sum = await summaryPage(pl, rec, { when, by, included, linked: pl.links, failed });
      doc.addJpegPage(sum.jpeg, sum.w, sum.h, { full: true, links: sum.links });
      for (const pg of pages) {
        if (pg.kind === 'img') doc.addJpegPage(pg.data.jpeg, pg.data.w, pg.data.h);
        else { try { await doc.importPdf(pg.data); } catch (e) { /* listed as not included would need a redraw — a page saying so instead */ const n = await notePage(P().pdfNotAdded(e && e.message === 'encrypted' ? P().protectedPdf : P().cannotRead)); doc.addJpegPage(n.jpeg, n.w, n.h, { full: true }); } }
        if (pg.kind === 'pdf') pg.data.fill(0);
      }
    }
    const bytes = doc.save(), name = `Print_${R.trim(o.label || (plans[0] && (plans[0].summary.round_id || plans[0].summary.line_id)) || 'payment').replace(/[^\w\-.]+/g, '_').replace(/^_+|_+$/g, '') || 'payment'}_${U.today().replace(/-/g, '')}.pdf`;
    U.download(name, bytes, 'application/pdf');
    /* Printed dd/mm · who — on the lines (a row with no line yet keeps nothing) · one event, nothing of the file */
    const s2 = state(), lines = items.map(x => (x.line_id && !x.tax ? x : x.line)).filter(Boolean).map(l => s2.payment_lines.find(y => y.line_id === l.line_id)).filter(Boolean);
    let e = 0; const base = store.newEventId();
    s2.deal_events.push(...R.markPrinted(s2, lines, o.label || (lines[0] && lines[0].run_id) || '', { eventId: () => base + e++, now: new Date().toISOString(), user: userId() }));
    commit(P().done(plans.length));
    if (!can('payee.unlock')) KT.vault.lock();   // unlocked for this file only
    if (o.after) o.after();
  }
  /* a page with one line on it (a PDF that could not be added) */
  async function notePage(text) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#b42318'; g.font = `30px ${FONT}`; g.textBaseline = 'top';
    wrap(g, text, W - 2 * M).forEach((t, i) => g.fillText(t, M, M + i * 42));
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return { jpeg: new Uint8Array(await blob.arrayBuffer()), w: W, h: H };
  }
  return { print, canPrint, summaryPage };
})();
