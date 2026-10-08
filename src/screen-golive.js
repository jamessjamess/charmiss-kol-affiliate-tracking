/* screen-golive.js — CR-11 §4.7: Settings › Go-live clean-up. A wizard in a modal L (Admin): 1 Go-live date · 2 Payments (what imported deals
   still owe → Mark paid outside app, with Match with PR file) · 3 Shipments (imported deals' To ship → Delivered (imported)) · 4 Review & apply
   (a Backup downloads first · Undo from a copy in memory until the page reloads). Accounting opens step 2 read only.
   Match with PR file: the file is read in this page's memory only (KT.xlsx.read / readCsv) — the Name / Amount / Paid date columns are taken,
   nothing of it is saved: not in the app's data, not in a Backup, not in a log; a matched line keeps the note "Matched with <file> · sheet … row …".
   Also the banner in Payments (and Shipments) until the clean-up has run or is dismissed. → KT.golive */
KT.golive = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, state, store, commit, toastAction, pref, userId, can, doBackup } = U;
  const G = C.golive, PM = C.pay;
  let gw = null;     // the wizard while it is open
  let snap = null;   // Undo: what the last clean-up changed (memory only)
  const STEPS = 4;
  const money = v => '฿' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ctxOf = () => { let e = 0; return { lineId: () => store.newId('line'), eventId: () => store.newEventId() + e++, now: new Date().toISOString(), user: userId() }; };
  const gl = () => R.goLive(state().lookups);
  const dismissKey = () => 'golive_dismiss_' + (userId() || '');

  /* ---------- the banner (Payments · Shipments) ---------- */
  function bannerHTML() {
    if (gl().completed_at || !(can('golive.run') || can('golive.view')) || pref.get(dismissKey(), '') === '1') return '';
    if (!R.cleanupLines(state(), today()).length && !R.cleanupShipments(state()).length) return '';
    return `<div class="gl-banner" role="status"><span>${esc(G.banner)}</span><span class="spacer"></span>` +
      `<button type="button" class="btn small" data-glgo>${esc(G.bannerGo)}</button><button type="button" class="btn small ghost" data-gldismiss>${esc(G.bannerDismiss)}</button></div>`;
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-glgo]')) { open(e.target.closest('[data-glgo]')); return; }
    const d = e.target.closest('[data-gldismiss]'); if (d) { pref.set(dismissKey(), '1'); const b = d.closest('.gl-banner'); if (b) b.remove(); }
  });

  /* ---------- Settings › Go-live clean-up (the card) ---------- */
  function settingsHTML() {
    const s = state(), g = gl(), td = today(), imp = s.deals.filter(R.isImported).length, open = s.deals.filter(d => R.isImported(d) && !R.isImportedClosed(d)).length;
    const lines = R.cleanupLines(s, td), ships = R.cleanupShipments(s);
    const last = g.completed_at ? G.lastRun(R.dmy(R.dateOfTimestamp(g.completed_at)), R.changedByName(s, g.completed_by) || '—') : G.notRun;
    return `<div class="card"><div class="card-head"><h3>${esc(G.title)}</h3></div><p class="hint" style="margin-top:0">${esc(G.intro)}</p>` +
      U.kv(G.dateL, R.dmy(g.date) || '—') + U.kv(G.importedN, G.importedLine(R.fmtNum(imp), R.fmtNum(open))) +
      U.kv(G.stillOwed, G.owedLine(R.fmtNum(lines.length), money(lines.reduce((a, x) => a + x.tax.gross, 0)), R.fmtNum(ships.length))) + U.kv(G.lastRunL, last) +
      `<div class="btns" style="margin-top:16px">${can('golive.run') ? `<button type="button" class="btn primary" data-glstart>${esc(g.completed_at ? G.again : G.start)}</button>`
        : can('golive.view') ? `<button type="button" class="btn" data-glstart>${esc(G.viewPayments)}</button>` : ''}` +
      (snap && can('golive.run') ? `<button type="button" class="btn" data-glundo>${esc(G.undoLast)}</button>` : '') + `</div>` +
      (snap && can('golive.run') ? `<div class="hint">${esc(G.undoHint)}</div>` : '') + `</div>`;
  }
  /* Settings › Data: the copy kept before the schema 12 upgrade */
  function beforeCopyHTML() {
    const t = store.beforeCopy(); if (!t) return '';
    let v = '?'; try { v = JSON.parse(t).schema_version; } catch (e) { /* shown as ? */ }
    return `<div class="hint" style="margin-top:12px">${esc(G.beforeCopy(v))} <button type="button" class="link" data-glbefore>${esc(G.beforeCopyDl)}</button></div>`;
  }
  function settingsClick(e, after) {
    if (e.target.closest('[data-glstart]')) { open(e.target.closest('[data-glstart]'), after); return true; }
    if (e.target.closest('[data-glundo]')) { undo(after); return true; }
    if (e.target.closest('[data-glbefore]')) { const t = store.beforeCopy(); if (t) U.download(`KOL-tracker-before-upgrade-v${(() => { try { return JSON.parse(t).schema_version; } catch (e) { return ''; } })()}.json`, t, 'application/json'); return true; }
    return false;
  }

  /* ---------- the wizard ---------- */
  function open(opener, after) {
    if (!can('golive.run') && !U.guard('golive.view')) return;
    const s = state(), td = today(), ro = !can('golive.run'), lines = R.cleanupLines(s, td), ships = R.cleanupShipments(s);
    gw = { step: ro ? 1 : 0, ro, date: gl().date || td, lines, pick: new Set(), ships, shipPick: new Set(ships.filter(x => x.pick).map(x => x.sh.shipment_id)),
      def: { date: '', note: '' }, file: null, map: null, match: new Map(), result: null, err: '', after, touched: false };
    gw.h = U.createModal({ size: 'L', title: G.title, opener, isDirty: () => !!gw && !gw.ro && gw.touched, onClose: () => { gw = null; },
      onClick: click, focus: () => (gw && gw.step === 0 ? '.gl-step .dtext' : null) });
    $('cm_root').addEventListener('change', change);
    $('cm_root').addEventListener('input', input);
    draw();
  }
  function draw(keep) {
    if (!gw) return;
    const h = gw.h, body = [stepDate, stepPay, stepShip, stepReview][gw.step]();
    h.setSub(gw.ro ? G.readOnly : `${G.stepOf(gw.step + 1, STEPS)} · ${G.steps[gw.step]}`);
    h.setBody(body, keep);
    const back = gw.step > 0 && !gw.ro ? `<button type="button" class="btn" data-glback>${esc(G.back)}</button>` : '';
    const main = gw.ro ? '' : gw.step < STEPS - 1 ? `<button type="button" class="btn primary" data-glnext>${esc(G.next)}</button>`
      : `<button type="button" class="btn primary" data-glapply${nothingToDo() ? ' disabled' : ''}>${esc(G.apply)}</button>`;
    h.setFoot(`<span class="muted small">${esc(gw.ro ? '' : G.steps.map((x, i) => (i === gw.step ? `● ${x}` : '○')).join(' '))}</span>`,
      `<button type="button" class="btn" data-cmclose>${esc(gw.ro ? C.common.close : C.common.cancel)}</button>${back}${main}`);
  }
  const nothingToDo = () => !gw.pick.size && !gw.shipPick.size && gw.date === gl().date;

  /* step 1 — the go-live date */
  function stepDate() {
    const s = state(), imp = s.deals.filter(R.isImported).length, open = s.deals.filter(d => R.isImported(d) && !R.isImportedClosed(d)).length;
    return `<div class="gl-step"><div class="field" style="max-width:280px"><label for="gl_date">${esc(G.dateL)}</label>${U.dateHTML('id="gl_date" data-gldate', gw.date, { label: G.dateL })}</div>` +
      `<p class="hint">${esc(G.dateHint)}</p><p class="muted small">${esc(G.importedLine(R.fmtNum(imp), R.fmtNum(open)))}</p>${gw.err ? `<div class="check err">✕ <span>${esc(gw.err)}</span></div>` : ''}</div>`;
  }
  /* step 2 — what imported deals still owe: tick what was paid already */
  function stepPay() {
    if (!gw.lines.length) return `<div class="card empty"><b>${esc(G.payNone)}</b></div>`;
    const s = state(), ro = gw.ro, sum = [...gw.pick].reduce((a, k) => a + ((gw.lines.find(x => x.key === k) || {}).tax || {}).gross || 0, 0);
    const groups = new Map();
    gw.lines.forEach(x => { const c = x.campaign_id || ''; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(x); });
    const campName = id => ((s.campaigns.find(c => c.campaign_id === id) || {}).campaign_name || PM.noCampaign);
    const kolOf = x => (x.kol ? x.kol.display_name : x.account_handle) || '—';
    const chip = x => { const m = gw.match.get(x.key); if (!m) return ''; return `<span class="chip ${m.status === 'matched' ? 'ok-chip' : 'warn-chip'}" title="${esc(m.note || '')}">${esc(G.status[m.status])}</span>${m.paid ? ` <span class="muted small">${esc(G.paidFromFile(R.dmy(m.paid)))}</span>` : ''}`; };
    const cb = x => (ro ? '' : `<td class="cb"><input type="checkbox" data-glline="${esc(x.key)}"${gw.pick.has(x.key) ? ' checked' : ''} aria-label="${esc(kolOf(x))}"></td>`);
    const rows = [...groups.entries()].sort((a, b) => campName(a[0]).localeCompare(campName(b[0]), 'th')).map(([cid, list]) => {
      list.sort((a, b) => kolOf(a).localeCompare(kolOf(b), 'th') || String(a.due_date || '').localeCompare(String(b.due_date || '')));
      const all = list.every(x => gw.pick.has(x.key));
      return `<tr class="ghead"><td colspan="${ro ? 6 : 7}"><span class="gl-gh">${ro ? '' : `<input type="checkbox" data-glgroup="${esc(cid)}"${all ? ' checked' : ''} aria-label="${esc(campName(cid))}">`}` +
        `<b>${esc(campName(cid))}</b> <span class="muted">${esc(G.groupLine(list.length, money(list.reduce((a, x) => a + x.tax.gross, 0))))}</span></span></td></tr>` +
        list.map(x => `<tr data-glrow="${esc(x.key)}">${cb(x)}<td><b class="nm">${esc(kolOf(x))}</b></td><td>${esc(PM.milestone[x.milestone] || x.milestone)}</td>` +
          `<td class="nowrap">${esc(R.dmy(x.due_date) || '—')}</td><td class="num">${esc(money(x.tax.gross))}</td><td class="num">${esc(money(x.tax.net))}</td><td>${chip(x)}</td></tr>`).join('');
    }).join('');
    const head = `<tr>${ro ? '' : `<th class="cb"><input type="checkbox" data-glall${gw.pick.size === gw.lines.length ? ' checked' : ''} aria-label="${esc(C.deal.selectAll)}"></th>`}` +
      `<th>${esc(PM.col.kol)}</th><th>${esc(PM.col.milestone)}</th><th>${esc(PM.col.due)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.net)}</th><th>${esc(G.colMatch)}</th></tr>`;
    const tools = ro ? '' : `<div class="gl-tools">${prHTML()}<div class="gl-def"><div class="field"><label for="gl_pdate">${esc(G.paidDate)}</label>${U.dateHTML('id="gl_pdate" data-gldef="date"', gw.def.date, { label: G.paidDate })}</div>` +
      `<div class="field"><label for="gl_note">${esc(G.note)}</label><input id="gl_note" data-gldef="note" value="${esc(gw.def.note)}" placeholder="${esc(G.notePh)}" autocomplete="off"></div>` +
      `<div class="hint">${esc(G.noteHint)}</div></div></div>`;
    return `<div class="gl-step"><p class="hint" style="margin-top:0">${esc(G.payHint)}</p>` +
      (ro ? '' : `<p class="hint"><button type="button" class="link" data-glvault>${esc(G.vaultLink)}</button></p>`) + tools +
      (ro ? '' : `<div class="gl-sel"><b>${esc(G.selLine(gw.pick.size, money(sum)))}</b></div>`) +
      (gw.err ? `<div class="check err" style="margin:8px 0">✕ <span>${esc(gw.err)}</span></div>` : '') +
      `<div class="tablewrap gl-wrap"><table class="tbl compact-sm gl-tbl${ro ? ' nocb' : ''}"><thead>${head}</thead><tbody>${rows}</tbody></table></div></div>`;
  }
  /* Match with PR file: pick a file → the columns → Match */
  function prHTML() {
    const f = gw.file, m = gw.map;
    let inner = `<div class="field"><label for="gl_file">${esc(G.matchPr)}</label><input type="file" id="gl_file" accept=".xlsx,.csv,text/csv"><div class="hint">${esc(G.matchPrHint)}</div></div>`;
    if (f && f.error) inner += `<div class="check err">✕ <span>${esc(f.error)}</span></div>`;
    if (f && f.sheets && m) {
      const sh = f.sheets.find(x => x.name === m.sheet) || f.sheets[0], hr = R.prHeaderRow(sh.rows), head = sh.rows[hr] || [], width = Math.max(1, ...f.sheets.map(x => Math.max(0, ...x.rows.map(r => r.length))));
      const opts = sel => `<option value="-1"${sel < 0 ? ' selected' : ''}>${esc(G.none)}</option>` + Array.from({ length: width }, (_, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(KT.xlsx.colName(i))}${head[i] != null && head[i] !== '' ? ' · ' + esc(String(head[i]).slice(0, 40)) : ''}</option>`).join('');
      inner += `<div class="muted small">${esc(f.name)} · ${esc(G.fileRows(R.fmtNum(f.sheets.reduce((a, x) => a + x.rows.length, 0))))}</div>` +
        `<div class="gl-map"><div class="field"><label for="gl_sheet">${esc(G.sheet)}</label><select id="gl_sheet" data-glmap="sheet"><option value="">${esc(G.allSheets)}</option>${f.sheets.map(x => `<option${x.name === m.sheet ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` +
        `<div class="field"><label for="gl_cname">${esc(G.colName)}</label><select id="gl_cname" data-glmap="name">${opts(m.name)}</select></div>` +
        `<div class="field"><label for="gl_camt">${esc(G.colAmount)}</label><select id="gl_camt" data-glmap="amount">${opts(m.amount)}</select></div>` +
        `<div class="field"><label for="gl_cpaid">${esc(G.colPaid)}</label><select id="gl_cpaid" data-glmap="paid">${opts(m.paid)}</select></div>` +
        `<button type="button" class="btn" data-glmatch${m.name < 0 || m.amount < 0 ? ' disabled' : ''}>${esc(G.applyMatch)}</button></div>`;
      if (gw.result) {
        const r = gw.result, n = k => r.filter(x => x.status === k).length, list = r.filter(x => x.status !== 'matched');
        inner += `<div class="gl-msum"><b>${esc(G.matchSum(n('matched'), n('amount'), n('notfound')))}</b></div>` + (list.length ? `<details class="gl-miss"><summary>${esc(G.notMatchedRows(list.length))}</summary><ul>` +
          list.map(x => `<li><span class="chip ${x.status === 'amount' ? 'warn-chip' : ''}">${esc(G.status[x.status])}</span> ${esc(G.fileRowLine(x.row.sheet, x.row.row, x.row.name, x.row.amount == null ? '—' : typeof x.row.amount === 'number' ? money(x.row.amount) : String(x.row.amount)))}</li>`).join('') + `</ul></details>` : '');
      }
    }
    return `<div class="gl-pr">${inner}</div>`;
  }
  /* step 3 — imported deals' shipments still To ship */
  function stepShip() {
    if (!gw.ships.length) return `<div class="card empty"><b>${esc(G.shipNone)}</b></div>`;
    const s = state(), SM = C.samples, kol = d => (R.kolById(s, d.kol_id) || {}).display_name || d.kol_id, camp = id => ((s.campaigns.find(c => c.campaign_id === id) || {}).campaign_name || '');
    return `<div class="gl-step"><p class="hint" style="margin-top:0">${esc(G.shipHint)}</p><div class="tablewrap gl-wrap"><table class="tbl compact-sm gl-tbl"><thead><tr>` +
      `<th class="cb"><input type="checkbox" data-glsall${gw.shipPick.size === gw.ships.length ? ' checked' : ''} aria-label="${esc(C.deal.selectAll)}"></th><th>${esc(SM.col.kol)}</th><th>${esc(C.deal.campaign)}</th><th>${esc(SM.col.stage)}</th><th>${esc(SM.col.items)}</th><th>${esc(SM.col.shipBy)}</th></tr></thead><tbody>` +
      gw.ships.map(x => `<tr><td class="cb"><input type="checkbox" data-glship="${esc(x.sh.shipment_id)}"${gw.shipPick.has(x.sh.shipment_id) ? ' checked' : ''} aria-label="${esc(kol(x.deal))}"></td>` +
        `<td><b class="nm">${esc(kol(x.deal))}</b></td><td>${esc(camp(x.deal.campaign_id))}</td><td>${U.stageChip(x.deal)}</td><td>${esc(x.sh.items && x.sh.items.length ? R.itemsText(x.sh.items) : '—')}</td><td class="nowrap">${esc(R.dmy(x.sh.ship_by) || '—')}</td></tr>`).join('') +
      `</tbody></table></div></div>`;
  }
  /* step 4 — what will change · the Backup first */
  function stepReview() {
    const sel = lineSel(), amt = sel.reduce((a, x) => a + x.item.tax.gross, 0), m = gw.shipPick.size, g = gl();
    return `<div class="gl-step"><div class="gl-review">` +
      (gw.date !== g.date ? `<div>${esc(G.dateL)}: <b>${esc(R.dmy(g.date))} → ${esc(R.dmy(gw.date))}</b></div>` : `<div>${esc(G.dateL)}: <b>${esc(R.dmy(gw.date))}</b></div>`) +
      `<div><b>${esc(G.review(sel.length, money(amt), m))}</b></div>` +
      (sel.length ? `<div class="muted small">${esc(G.reviewMatched(sel.filter(x => x.matched).length))}</div>` : '') +
      `</div><p class="hint">${esc(G.backupFirst)}</p>${gw.err ? `<div class="check err">✕ <span>${esc(gw.err)}</span></div>` : ''}</div>`;
  }
  /* the ticked lines with their date and note: a match uses the file's paid date (else the default) and the "Matched with …" note */
  function lineSel() {
    return gw.lines.filter(x => gw.pick.has(x.key)).map(x => { const m = gw.match.get(x.key), matched = !!(m && m.status === 'matched');
      return { item: x, matched, date: (matched && m.paid) || gw.def.date, note: matched ? m.note : R.trim(gw.def.note) }; });
  }
  function checkStep() {
    gw.err = '';
    if (gw.step === 0 && !R.isISODate(gw.date)) gw.err = C.msg.cleanupDate;
    if (gw.step === 1) { const bad = lineSel().map(x => R.validateCleanupLine(x).errs[0]).find(Boolean); if (bad) gw.err = bad.msg; }
    return !gw.err;
  }

  /* ---------- events ---------- */
  function click(e) {
    if (!gw) return;
    if (e.target.closest('[data-glnext]')) { if (!checkStep()) { draw(true); return; } gw.step++; draw(); return; }
    if (e.target.closest('[data-glback]')) { gw.err = ''; gw.step--; draw(); return; }
    if (e.target.closest('[data-glapply]')) { apply(); return; }
    if (e.target.closest('[data-glmatch]')) { runMatch(); return; }
    if (e.target.closest('[data-glvault]')) { U.requestCloseModal().then(ok => { if (ok) location.hash = 'settings/payments'; }); }
  }
  function change(e) {
    if (!gw) return;
    const t = e.target;
    if (t.matches('[data-gldate]')) { gw.date = t.value; gw.touched = true; return; }
    if (t.matches('[data-gldef]')) { gw.def[t.dataset.gldef] = t.value; gw.touched = true; return; }
    if (t.matches('[data-glline]')) { tick(gw.pick, t.dataset.glline, t.checked); draw(true); return; }
    if (t.matches('[data-glgroup]')) { gw.lines.filter(x => (x.campaign_id || '') === t.dataset.glgroup).forEach(x => tick(gw.pick, x.key, t.checked)); draw(true); return; }
    if (t.matches('[data-glall]')) { gw.lines.forEach(x => tick(gw.pick, x.key, t.checked)); draw(true); return; }
    if (t.matches('[data-glship]')) { tick(gw.shipPick, t.dataset.glship, t.checked); draw(true); return; }
    if (t.matches('[data-glsall]')) { gw.ships.forEach(x => tick(gw.shipPick, x.sh.shipment_id, t.checked)); draw(true); return; }
    if (t.matches('[data-glmap]')) { const k = t.dataset.glmap; gw.map[k] = k === 'sheet' ? t.value : Number(t.value); gw.result = null; draw(true); return; }
    if (t.id === 'gl_file') readFile(t.files && t.files[0]);
  }
  function input(e) { if (gw && e.target.matches('[data-gldef="note"]')) { gw.def.note = e.target.value; gw.touched = true; } }
  function tick(set, k, on) { if (on) set.add(k); else set.delete(k); gw.touched = true; }

  /* read the file in memory → the columns to map (first guess from the header texts) */
  async function readFile(file) {
    if (!file || !gw) return;
    const me = gw;
    try {
      const book = /\.csv$/i.test(file.name) ? KT.xlsx.readCsv(await file.text(), file.name.replace(/\.csv$/i, '')) : await KT.xlsx.read(new Uint8Array(await file.arrayBuffer()));
      if (gw !== me) return;
      if (!book.sheets.length) throw new Error('empty');
      const first = book.sheets.find(x => R.prHeaderRow(x.rows) >= 0) || book.sheets[0], guess = R.guessPrColumns(first.rows[R.prHeaderRow(first.rows)] || []);
      gw.file = { name: file.name, sheets: book.sheets }; gw.map = Object.assign({ sheet: '' }, guess); gw.result = null;
    } catch (err) { if (gw !== me) return; gw.file = { name: file.name, error: G.readFail }; gw.map = null; }
    gw.touched = true; draw(true);
  }
  /* Match: the rows of the file vs the lines → a Matched line is ticked and keeps where it was found (file · sheet · row) */
  function runMatch() {
    const rows = R.prRows(gw.file.sheets, gw.map), res = R.matchPrRows(gw.lines, rows);
    gw.match.clear();
    res.forEach(x => { if (!x.item) return; if (x.status === 'matched' || !gw.match.has(x.item.key)) gw.match.set(x.item.key, { status: x.status, paid: x.status === 'matched' ? x.row.paid : null, note: x.status === 'matched' ? R.prNote(gw.file.name, x.row.sheet, x.row.row) : '' }); });
    res.filter(x => x.status === 'matched').forEach(x => gw.pick.add(x.item.key));
    gw.result = res; gw.touched = true; draw(true);
  }
  /* Apply: the Backup downloads first → the clean-up → Undo (memory) */
  function apply() {
    if (!gw || gw.ro || !U.guard('golive.run')) return;
    const sel = lineSel();
    const bad = sel.map(x => R.validateCleanupLine(x).errs[0]).find(Boolean); if (bad) { gw.err = bad.msg; gw.step = 1; draw(); return; }
    doBackup();
    const s = state(), before = R.cleanupSnapshot(s), ctx = ctxOf(), ships = [...gw.shipPick];
    const evs = R.applyCleanup(s, { goLiveDate: gw.date, lines: sel.map(x => ({ item: x.item, date: x.date, note: x.note })), shipments: ships }, ctx);
    s.deal_events.push(...evs);
    snap = before;
    const after = gw.after; gw.touched = false; U.closeModal();
    commit();
    toastAction(G.applied(sel.length, ships.length), G.undo, () => undo(after), 10000);
    if (after) after(); else U.refresh();
  }
  function undo(after) {
    if (!snap || !U.guard('golive.run')) return;
    R.undoCleanup(state(), snap); snap = null;
    commit(G.undone);
    if (after) after(); else U.refresh();
  }

  return { bannerHTML, settingsHTML, beforeCopyHTML, settingsClick, open, _gw: () => gw };
})();
