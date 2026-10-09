/* rules-ops.js — CR-17 §4.1–4.4: Operations mode (Simple / Full) for Payments and Shipments.
   Simple payments: the KOL team records what was paid — Mark paid (To pay or Sent) · Export for accounting → Sent (an automatic run "Sent dd/mm",
   With Accounting) · Mark unpaid (a reason) · Undo · documents do not block. Simple shipments: Shipped · Shipped & delivered · Delivered · Undo delivered.
   The same payment_lines / payment_runs / sample_shipments as Full mode — switching back and forth loses nothing; syncDealPayment keeps the deals' flags.
   Pure functions; adds to KT.rules (load after rules-profile.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { trim, isISODate } = R;
  const OPS_KINDS = ['payments', 'shipments'], OPS_MODES = ['simple', 'full'];
  const OPS_DEFAULT = { payments: 'simple', shipments: 'simple' };
  /* §4.1 — the one place a screen asks which flow to show */
  const opsMode = (state, kind) => { const m = (state && state.lookups && state.lookups.ops_mode) || {}; return OPS_MODES.includes(m[kind]) ? m[kind] : OPS_DEFAULT[kind] || 'simple'; };
  const isSimple = (state, kind) => opsMode(state, kind) === 'simple';
  function setOpsMode(state, kind, mode) {
    if (!OPS_KINDS.includes(kind) || !OPS_MODES.includes(mode)) return false;
    state.lookups.ops_mode = Object.assign({}, OPS_DEFAULT, state.lookups.ops_mode || {}, { [kind]: mode });
    return true;
  }

  /* ===================== §4.2 Payments — Simple ===================== */
  const runOf = (state, id) => (id ? (state.payment_runs || []).find(r => r.run_id === id) || null : null);
  const lineOf = (state, id) => (state.payment_lines || []).find(l => l.line_id === id) || null;
  const payEvent = (l, from, to, ctx, note) => ({ event_id: ctx.eventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payment', from: from || null, to, changed_at: ctx.now, changed_by: ctx.user || null, note: note || null });
  /* where a To pay row is in Simple mode: To pay · Sent (with Accounting) · Paid */
  const simpleBucket = x => (x.status === 'paid' ? 'paid' : x.status === 'submitted' ? 'sent' : 'to_pay');
  /* when a line was sent: its own sent_at, else the day its run went to Accounting (Full mode) */
  const sentAt = (state, l) => (l && (l.sent_at || (runOf(state, l.run_id) || {}).submitted_at)) || null;
  /* a Sent line waiting more than 7 days → yellow · "Payments to confirm" (§4.4) */
  const SENT_LATE_DAYS = 7;
  const sentDays = (state, l, today) => { const at = sentAt(state, l); return at ? R.dayDiff(today, R.dateOfTimestamp(at)) : null; };
  /* §4.2 — who may: Mark paid · Export for accounting · Hold = Admin · KOL Manager · Accounting · Staff on the deals they are PIC of (a line without a deal: the person
     who made it) · Mark unpaid = Admin · KOL Manager · Accounting (§9 #6) · WHT cert sent = like Mark paid */
  const PAY_ALL = ['admin', 'kol_manager', 'accounting'];
  function canPaySimple(state, user, item) {
    if (!user || user.active === false) return false;
    if (PAY_ALL.includes(user.role)) return true;
    if (user.role !== 'staff' || !item) return false;
    const me = R.picName(user), deal = item.deal || (item.deal_id ? (state.deals || []).find(d => d.deal_id === item.deal_id) : null);
    /* CR-20 §4.8 — a package row: the KOL's owner (PIC in KOL Master) or the person who made it */
    if (!deal && (item.package_id || (item.line && item.line.package_id))) { const k = R.kolById(state, item.kol_id) || {}, p = R.packageById(state, item.package_id || item.line.package_id) || {};
      return (!!me && k.pic === me) || p.created_by === user.user_id || !!(item.line && item.line.created_by === user.user_id); }
    return deal ? !!me && deal.pic === me : !!(item.line && item.line.created_by && item.line.created_by === user.user_id);
  }
  const canUnpay = user => !!user && user.active !== false && PAY_ALL.includes(user.role);
  const keep = l => ({ status: l.status, paid_date: l.paid_date || null, paid_by: l.paid_by || null, paid_ref: l.paid_ref || null, unpaid_reason: l.unpaid_reason || null, note: l.note || null,
    run_id: l.run_id || null, sent_at: l.sent_at || null, sent_by: l.sent_by || null, sent_ref: l.sent_ref || null });
  const FLAGS = ['paid_50', 'paid_50_date', 'paid_full', 'paid_full_date', 'docs_done', 'docs_done_date'];
  const dealFlags = (state, ids) => [...new Set(ids.filter(Boolean))].map(id => { const d = state.deals.find(x => x.deal_id === id); return d ? { deal_id: id, flags: Object.fromEntries(FLAGS.map(k => [k, d[k] === undefined ? null : d[k]])) } : null; }).filter(Boolean);
  /* a row that has no line yet (worked out from the deal) becomes one — the amounts as CR-08 works them out · CR-27: its docs-only line is used (made full) →
     { line, prev (the docs-only line as it was, for Undo) | null — a new line is not in state yet } */
  function lineFor(state, x, ctx) {
    const o = { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, pay_to: x.pay_to, reimburse_user: x.reimburse_user, user: ctx.user, now: ctx.now };
    if (R.isDocsOnly(x.docsLine)) { const prev = JSON.parse(JSON.stringify(x.docsLine)); return { line: R.promoteDocsLine(state, x, o), prev }; }
    return { line: R.newLine(state, x, o), prev: null };
  }
  /* a line back as it was (a docs-only line that was made full) */
  const restore = (l, prev) => { Object.keys(l).forEach(k => { delete l[k]; }); Object.assign(l, prev); };
  /* Mark paid (To pay · Sent · Deal drawer · Go-live "outside the app"): each row Paid on o.date with o.ref (and o.note) · a worked-out instalment gets its line first ·
     a line in a run stays in it (the run is Paid once all its lines are) · the deals' flags follow (syncDealPayment) → { events, undo, n } */
  function markItemsPaid(state, items, o, ctx) {
    const events = [], undo = { created: [], lines: [], runs: [], deals: dealFlags(state, items.map(x => x.deal_id)) }, runs = new Set();
    let n = 0;
    items.forEach(x => {
      let l = x.line;
      if (x.status === 'paid' || (l && (l.status === 'paid' || l.status === 'cancelled'))) return;
      if (!l) { const f = lineFor(state, x, ctx); l = f.line; if (f.prev) undo.lines.push({ line_id: l.line_id, prev: f.prev, full: true }); else { state.payment_lines.push(l); undo.created.push(l.line_id); } if (o.legacy) l.source = 'legacy'; }
      else undo.lines.push({ line_id: l.line_id, prev: keep(l) });
      events.push(payEvent(l, l.status, 'paid', ctx, trim(o.note) || trim(o.ref) || null));
      Object.assign(l, { status: 'paid', paid_date: o.date, paid_by: ctx.user || null, paid_ref: trim(o.ref) || null, unpaid_reason: null });
      if (trim(o.note)) l.note = [l.note, trim(o.note)].filter(Boolean).join(' · ') || null;
      if (l.run_id) runs.add(l.run_id);
      n++;
    });
    runs.forEach(id => {
      const run = runOf(state, id), live = R.runLines(state, id).filter(l => l.status !== 'cancelled');
      if (run && live.length && live.every(l => l.status === 'paid') && run.status !== 'paid' && run.status !== 'closed') { undo.runs.push({ run_id: id, prev: run.status }); run.status = 'paid'; }
    });
    R.syncDeals(state, items.map(x => x.deal_id));
    return { events, undo, n };
  }
  /* Undo (10 seconds): lines made go · the others get back what they had · runs and the deals' flags too */
  function undoMarkPaid(state, undo, ctx) {
    const events = [];
    undo.created.forEach(id => { const l = lineOf(state, id); if (l) events.push(payEvent(l, 'paid', null, ctx, 'undo')); });
    state.payment_lines = state.payment_lines.filter(l => !undo.created.includes(l.line_id));
    undo.lines.forEach(u => { const l = lineOf(state, u.line_id); if (!l) return; events.push(payEvent(l, l.status, u.prev.status, ctx, 'undo')); if (u.full) restore(l, u.prev); else Object.assign(l, u.prev); });
    undo.runs.forEach(u => { const run = runOf(state, u.run_id); if (run) run.status = u.prev; });
    undo.deals.forEach(u => { const d = state.deals.find(x => x.deal_id === u.deal_id); if (d) Object.assign(d, u.flags); });
    return events;
  }
  /* Mark unpaid (a reason · §9 #6): the line goes back to To pay (out of its run) · the deal's flags go back · Dashboard Paid follows */
  function markUnpaid(state, l, reason, ctx) {
    if (!l || l.status !== 'paid' || !trim(reason)) return null;
    const run = runOf(state, l.run_id), ev = payEvent(l, 'paid', 'open', ctx, trim(reason));
    Object.assign(l, { status: 'open', paid_date: null, paid_by: null, paid_ref: null, unpaid_reason: trim(reason), run_id: null, sent_at: null, sent_by: null });
    if (run && run.status === 'paid') { const live = R.runLines(state, run.run_id).filter(x => x.status !== 'cancelled'); if (live.some(x => x.status !== 'paid')) run.status = 'submitted'; }
    R.syncDeals(state, [l.deal_id]);
    return [ev];
  }
  /* Export for accounting → Sent: the rows (not paid · not on hold) go into a new run "Sent dd/mm" that is With Accounting at once — sent_at · sent_by ·
     the payee and its details version are kept like a Submit (CR-08) → { run, events, undo, lines } | null */
  function sendToAccounting(state, items, o, ctx) {
    const run = Object.assign(R.newRun(state, { pay_date: o.date, user: ctx.user, now: ctx.now }), { status: 'submitted', submitted_at: ctx.now, label: C.pay.sentRunLabel(R.dmy(o.date).slice(0, 5)), auto: 'simple' });
    const events = [], lines = [], undo = { run_id: run.run_id, created: [], lines: [] };
    state.payment_runs.push(run);
    items.forEach(x => {
      let l = x.line;
      if (x.status === 'paid' || x.status === 'on_hold' || x.status === 'submitted' || (l && ['paid', 'cancelled', 'on_hold', 'submitted'].includes(l.status))) return;
      if (!l) { const f = lineFor(state, x, ctx); l = f.line; if (f.prev) undo.lines.push({ line_id: l.line_id, prev: f.prev, full: true }); else { state.payment_lines.push(l); undo.created.push(l.line_id); } }
      else undo.lines.push({ line_id: l.line_id, prev: Object.assign(keep(l), { payee_id: l.payee_id, payee_version_at_submit: l.payee_version_at_submit }) });
      const p = R.payeeOfLine(state, l), ref = trim(o.ref) || null;
      events.push(payEvent(l, l.status, 'submitted', ctx, [run.run_id, ref].filter(Boolean).join(' · ')));
      /* CR-27 §3.2 — Send from the row / details / bulk: the day chosen and a ref (the Export keeps today) */
      const at = isISODate(o.date) && o.date !== String(ctx.now || '').slice(0, 10) ? `${o.date}T00:00:00.000Z` : ctx.now;
      Object.assign(l, { run_id: run.run_id, status: 'submitted', sent_at: at, sent_by: ctx.user || null, sent_ref: ref, payee_id: p ? p.payee_id : l.payee_id, payee_version_at_submit: p ? p.details_version || 0 : null });
      lines.push(l);
    });
    if (!lines.length) { state.payment_runs = state.payment_runs.filter(r => r !== run); return null; }
    return { run, events, undo, lines };
  }
  /* "No" after the download: nothing was sent — every line and the run as they were */
  function undoSend(state, undo) {
    state.payment_lines = state.payment_lines.filter(l => !undo.created.includes(l.line_id));
    undo.lines.forEach(u => { const l = lineOf(state, u.line_id); if (l) { if (u.full) restore(l, u.prev); else Object.assign(l, u.prev); } });
    state.payment_runs = state.payment_runs.filter(r => r.run_id !== undo.run_id);
  }
  /* Sent › Move back to To pay: out of its run (an automatic run left empty goes too) · CR-27 §5 U1: a reason is needed */
  function moveBackToPay(state, l, ctx, note) {
    if (!l || l.status !== 'submitted' || !trim(note)) return null;
    const run = runOf(state, l.run_id), ev = payEvent(l, 'submitted', 'open', ctx, trim(note) || null);
    Object.assign(l, { status: 'open', run_id: null, sent_at: null, sent_by: null, sent_ref: null });
    if (run && run.auto && !R.runLines(state, run.run_id).length) state.payment_runs = state.payment_runs.filter(r => r !== run);
    return [ev];
  }
  /* ===================== CR-27 §3.2 · CR-32 §2.3 — Payment details › Documents ===================== */
  /* the documents of a row: ID copy · Bank book (a company: Company certificate · Bank book · VAT certificate when VAT registered) · Post proof for an
     instalment paid after the post · the ones added by hand · "All documents in one file" (one link stands for all of them) · one Note for the section ·
     Bank details are not a document any more (they are the payee's, in the vault — Pay to) */
  const afterPost = (x, deal) => !!deal && (x.milestone === 'final' || (x.milestone === 'full' && R.termOf(deal) !== 'prepaid'));
  const dealOfX = (state, x) => x.deal || (x.deal_id ? state.deals.find(d => d.deal_id === x.deal_id) || null : null);
  function docKeys(state, x) {
    if (!x || x.pay_to === 'reimburse') return [];
    const p = x.payee === undefined ? R.payeeOfLine(state, x.line || x) : x.payee, company = !!p && p.payee_type === 'company';
    return (company ? ['company_cert', 'bank_book'].concat(p.vat_registered ? ['vat_cert'] : []) : ['id_copy', 'bank_book']).concat(afterPost(x, dealOfX(state, x)) ? ['post_proof'] : []);
  }
  /* what a line keeps, read the CR-32 way: an old "Post evidence" tick = Post proof · an old "Bank details" tick = a document of its own (kept) ·
     the old notes of each document become the one Note (when there is none yet) */
  function lineDocsOf(l) {
    const raw = R.lineDocs(l);
    const items = raw.map(d => (d.key === 'post_evidence' && !d.custom ? Object.assign({}, d, { key: 'post_proof' })
      : d.key === 'bank_details' && !d.custom ? Object.assign({}, d, { custom: true, label: d.label || C.payee.missingBank }) : d));
    const oldNotes = raw.filter(d => trim(d.note)).map(d => `${d.custom ? d.label || '' : d.key === 'bank_details' ? C.payee.missingBank : R.docLabel(d.key === 'post_evidence' ? 'post_proof' : d.key)}: ${trim(d.note)}`);
    const one = (l && l.docs_one) || {};
    return { items, note: l && l.docs_note != null ? l.docs_note : oldNotes.join(' · '), one: { on: !!one.on, link: one.link || '', received_at: one.received_at || null } };
  }
  /* the latest post date of the deal (Post proof › Posted on starts with it) */
  const lastPostDate = (state, dealId) => (dealId ? R.postsOf(state, dealId).map(p => p.post_date).filter(Boolean).sort().pop() || null : null);
  /* the checklist of a row → [{ key, label, custom, auto (on file in the payee profile), received, received_at, link, posted_on (Post proof) }] ·
     All in one file with a link: every one counts as received */
  function docsChecklist(state, x) {
    if (!x || x.pay_to === 'reimburse') return [];
    const p = x.payee === undefined ? R.payeeOfLine(state, x.line || x) : x.payee, v = lineDocsOf(x.line || x.docsLine || x), one = v.one.on && /^https:\/\//i.test(v.one.link);
    const deal = dealOfX(state, x);
    return docKeys(state, x).map(k => {
      const d = v.items.find(y => y.key === k && !y.custom) || {}, onFile = k !== 'post_proof' && p && p.docs && isISODate(p.docs[k]) ? p.docs[k] : null;
      const got = !!d.received_at || !!onFile || one;
      return { key: k, label: R.docLabel(k), custom: false, auto: !d.received_at && !!onFile, received: got, received_at: d.received_at || onFile || (one ? v.one.received_at : null),
        link: d.link || (onFile && p.docs_link ? p.docs_link : '') || '', posted_on: k === 'post_proof' ? d.posted_on || lastPostDate(state, deal && deal.deal_id) : null };
    }).concat(v.items.filter(d => d.custom).map(d => ({ key: d.key, label: d.label || '', custom: true, auto: false, received: !!d.received_at || one, received_at: d.received_at || null, link: d.link || '', posted_on: null })));
  }
  /* All in one file · the Note (the section's own, read the CR-32 way) */
  const docsMeta = x => { const v = lineDocsOf(x && (x.line || x.docsLine || x)); return { one: v.one, note: v.note }; };
  /* "Docs 2/3" (information · the readiness asks for the links) → { need, have, missing [keys] } */
  function docsTally(state, x) {
    if (!x || x.pay_to === 'reimburse') return null;
    const list = docsChecklist(state, x);
    return { need: list.length, have: list.filter(d => d.received).length, missing: list.filter(d => !d.received).map(d => d.key) };
  }
  /* Note / Link: no ID-card, phone or bank-account number (9 or more digits in a row, - and spaces left out) · a link starts with https:// · an own document needs a name ·
     CR-32: the one Note · the All-in-one link */
  const longDigits = v => /\d{9,}/.test(String(v == null ? '' : v).replace(/[-\s]/g, ''));
  const linkErr = v => (!trim(v) ? null : !/^https:\/\/\S+$/i.test(trim(v)) ? C.pay.docs.linkHttps : longDigits(v) ? C.pay.docs.noNumbers : null);
  function validateDocs(entries, meta) {
    const errs = [];
    (entries || []).forEach((e, i) => {
      if (e.custom && !trim(e.label)) errs.push({ field: `doc${i}_label`, msg: C.pay.docs.nameRequired });
      if (e.custom && (R.looksSensitive(e.label) || longDigits(e.label))) errs.push({ field: `doc${i}_label`, msg: C.msg.sensitive });
      if (trim(e.note) && (R.looksSensitive(e.note) || longDigits(e.note))) errs.push({ field: `doc${i}_note`, msg: C.pay.docs.noNumbers });
      const le = linkErr(e.link); if (le) errs.push({ field: `doc${i}_link`, msg: le });
      if (e.received_at && !isISODate(e.received_at)) errs.push({ field: `doc${i}_date`, msg: C.msg.dateInvalid(C.pay.docs.received) });
      if (e.posted_on && !isISODate(e.posted_on)) errs.push({ field: `doc${i}_posted`, msg: C.msg.dateInvalid(C.pay.docs.postedOn) });
    });
    if (meta) {
      if (trim(meta.note) && (R.looksSensitive(meta.note) || longDigits(meta.note))) errs.push({ field: 'docs_note', msg: C.pay.docs.noNumbers });
      const one = meta.one || {}, le = linkErr(one.link); if (le) errs.push({ field: 'docs_onelink', msg: le });
      if (one.received_at && !isISODate(one.received_at)) errs.push({ field: 'docs_onedate', msg: C.msg.dateInvalid(C.pay.docs.received) });
    }
    return { errs, warns: [], infos: [] };
  }
  const docsText = list => { const n = list.filter(d => d.received).length; return `${n}/${list.length}`; };
  /* entries = the checklist as edited ({key, label, custom, received_at, link, posted_on}) · meta = { note, one: {on, link, received_at} } (left out = as it is) →
     the row's line keeps them (a row with no line gets a docs-only one) · an event 'payment_docs' "2/3 → 3/3" · the deal's Docs done follows · → { line, event, created } | { errs } */
  function setItemDocs(state, x, entries, ctx, meta) {
    const cur = docsMeta(x), m = { note: meta && meta.note !== undefined ? meta.note : cur.note, one: Object.assign({}, cur.one, (meta && meta.one) || {}) };
    const v = validateDocs(entries, m); if (v.errs.length) return { errs: v.errs };
    const before = docsChecklist(state, x);
    let l = x.line || x.docsLine, created = false;
    const keepIt = e => e.custom || e.received_at || trim(e.link) || (e.posted_on && e.key === 'post_proof');
    const list = (entries || []).filter(keepIt).map((e, i) => ({ key: e.custom ? e.key || `own_${Date.now().toString(36)}_${i}` : e.key, label: e.custom ? trim(e.label) : null, custom: !!e.custom,
      received_at: e.received_at || null, note: null, link: trim(e.link) || null, posted_on: e.key === 'post_proof' ? e.posted_on || null : undefined }))
      .map(e => { if (e.posted_on === undefined) delete e.posted_on; return e; });
    const one = { on: !!m.one.on, link: trim(m.one.link) || null, received_at: m.one.received_at || null }, note = trim(m.note) || null, anyOne = one.on || one.link;
    if (!l) {
      if (!list.length && !anyOne && !note) return { line: null, event: null, created: false };
      l = R.newLine(state, x, { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, pay_to: x.pay_to, reimburse_user: x.reimburse_user, user: ctx.user, now: ctx.now });
      l.docs_only = true; state.payment_lines.push(l); created = true;
    }
    l.docs = list; l.docs_note = note; l.docs_one = anyOne ? one : null;
    if (R.isDocsOnly(l) && !list.length && !anyOne && !note) state.payment_lines = state.payment_lines.filter(y => y !== l);   // nothing left to keep
    const after = docsChecklist(state, Object.assign({}, x, x.line ? { line: l } : { docsLine: l }));
    const ev = { event_id: ctx.eventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payment_docs', from: docsText(before), to: docsText(after), changed_at: ctx.now, changed_by: ctx.user || null,
      note: (one.on && one.link && !(cur.one.on && cur.one.link) ? C.pay.docs.oneFile : after.filter(d => d.received && !before.some(b => b.key === d.key && b.received)).map(d => d.label).join(' · ')) || null };
    if (l.deal_id) syncDocsDone(state, l.deal_id, String(ctx.now || '').slice(0, 10));
    return { line: l, event: ev, created };
  }
  /* Mark all received (a row or many): every document not received yet → received on date */
  const allReceived = (state, x, date) => docsChecklist(state, x).map(d => Object.assign({}, d, d.auto || d.received ? {} : { received_at: date }));

  /* ===================== CR-32 §2.5 — Ready to send ===================== */
  /* the products of a deal (its Products, else what its samples carried) — the "Project" of the PR file */
  function dealProjectNames(state, deal) {
    if (!deal) return [];
    const codes = R.dealProductList(state, deal.deal_id).map(x => x.tr_code);
    const from = codes.length ? codes : (state.sample_shipments || []).filter(sh => sh.deal_id === deal.deal_id && sh.status !== 'cancelled' && sh.status !== 'not_required').flatMap(sh => (sh.items || []).map(i => i.tr_code));
    return [...new Set(from.filter(Boolean))].map(c => { const p = R.productByCode(state, c); return p ? R.productShort(p) || p.tr_code : c; }).filter(Boolean);
  }
  /* the documents' links of a row (All in one file, else one per document) — the Link column of the PR file · [] when a document has no link */
  function docsLinks(state, x) {
    const m = docsMeta(x); if (m.one.on && /^https:\/\//i.test(m.one.link)) return [m.one.link];
    return docsChecklist(state, x).filter(d => !d.custom).map(d => d.link).filter(Boolean);
  }
  /* the payee's encrypted fields are never read here — the payee keeps which ones are filled (details_filled, written each time they are saved;
     an older payee gets it the next time the vault is unlocked) */
  const filledOf = p => (p && p.secure ? (Array.isArray(p.details_filled) ? p.details_filled : null) : []);
  /* → { ready, items [{ key, ok, warn (only a warning), unknown (unlock to check), act }], missing [keys that block], warns [keys] } ·
     a reimbursement needs only the amount and the PIC · a manual line has no posts or payment term to check */
  function paymentReadiness(state, x) {
    const items = [], put = (key, ok, o = {}) => items.push(Object.assign({ key, ok: !!ok, warn: false, unknown: false, act: null }, o));
    const deal = dealOfX(state, x), staff = x.pay_to === 'reimburse';
    if (!staff) {
      const p = x.payee, f = filledOf(p), has = k => !!f && f.includes(k), unk = !!p && p.secure && !f;
      put('payee', !!p && !!p.secure, { act: 'payee' });
      if (p && p.secure) {
        put('full_name', has('full_name'), { unknown: unk, act: 'payee' });
        put('id_address', has('id_address'), { unknown: unk, act: 'payee' });
        put('bank', has('bank_name') && has('account_no') && has('account_name'), { unknown: unk, act: 'payee' });
      }
      const list = docsChecklist(state, x), m = docsMeta(x), oneOk = m.one.on && /^https:\/\//i.test(m.one.link);
      put('docs', oneOk || (list.length > 0 && list.filter(d => !d.custom).every(d => d.received && /^https:\/\//i.test(d.link))), { act: 'docs' });
      if (deal && afterPost(x, deal)) { const ps = R.postsOf(state, deal.deal_id); put('posted', ps.length > 0 && ps.every(R.postDone), { act: 'posts' }); }
      put('project', deal ? dealProjectNames(state, deal).length > 0 : !!trim(x.project_label), { act: deal ? 'products' : null });
    }
    put('amount', (x.tax ? x.tax.gross : 0) > 0 && (!deal || !!R.termOf(deal)), { act: deal ? 'deal' : null });
    put('pic', !!(x.pic || (staff && x.reimburse_user)), { act: deal ? 'pic' : null });
    if (!staff && x.tax && x.tax.wht > 0) { const f = filledOf(x.payee); put('wht_contact', !!f && f.includes('wht_contact'), { warn: true, unknown: !!x.payee && x.payee.secure && !f, act: x.payee ? 'payee' : null }); }
    const missing = items.filter(i => !i.ok && !i.warn).map(i => i.key), warns = items.filter(i => !i.ok && i.warn).map(i => i.key);
    return { ready: !missing.length, items, missing, warns };
  }
  /* a deal's Docs done: every instalment (not cancelled) has what it needs — set once all are in (the warning "Marked as paid, but documents aren't checked yet" goes) */
  function syncDocsDone(state, dealId, today) {
    const d = state.deals.find(y => y.deal_id === dealId); if (!d) return;
    const items = R.dealPayItems(state, d, today || R.todayISO()).filter(y => y.status !== 'cancelled' && y.pay_to !== 'reimburse');
    const ok = items.length > 0 && items.every(y => !docsTally(state, y) || docsTally(state, y).have >= docsTally(state, y).need);   // CR-32: the documents of each (Bank details are the payee's)
    if (ok && !d.docs_done) Object.assign(d, { docs_done: true, docs_done_date: today || R.todayISO() });
  }
  /* the history of a row: the events of its line (status · hold · documents), oldest first */
  const lineHistory = (state, x) => { const l = x.line || x.docsLine; if (!l) return []; return (state.deal_events || []).filter(e => e.line_id === l.line_id).sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at))); };
  /* WHT certificate sent on the row (☐ ticks it · unticking clears it) */
  function setWhtSent(l, date) { if (!l || !(l.wht > 0)) return false; l.wht_cert_sent_date = date || null; return true; }
  /* §4.4 Operations — "Payments to confirm": Sent more than 7 days ago and not paid (the PIC / Campaign of the To do filters) */
  function paymentsToConfirm(state, f, today) {
    return R.payQueue(state, today).items.filter(x => x.status === 'submitted' && x.line && (sentDays(state, x.line, today) || 0) > SENT_LATE_DAYS)
      .filter(x => (!f || !f.pic || x.pic === f.pic) && (!f || !f.campaign || x.campaign_id === f.campaign));
  }
  /* the Journey's payment track in Simple mode: To pay → Sent dd/mm → Paid dd/mm (the latest instalment that moved) */
  function simplePayTrack(state, deal, today) {
    const items = R.dealPayItems(state, deal, today).filter(x => x.status !== 'cancelled');
    const sent = items.filter(x => x.line && sentAt(state, x.line)).map(x => R.dateOfTimestamp(sentAt(state, x.line))).sort().pop() || null;
    const paid = items.filter(x => x.status === 'paid').map(x => x.paid_date || (x.line && x.line.paid_date)).filter(Boolean).sort().pop() || null;
    const all = items.length > 0 && items.every(x => x.status === 'paid'), owed = items.filter(x => x.status !== 'paid' && x.status !== 'not_due').length;
    return { n: items.length, owed, sent, paid, allPaid: all, state: all ? 'paid' : items.some(x => x.status === 'submitted') ? 'sent' : owed ? 'to_pay' : items.length ? 'not_due' : 'none' };
  }

  /* ===================== §4.3 Shipments — Simple ===================== */
  /* Shipped (date · carrier and tracking not needed) · Shipped & delivered (both dates at once) · Delivered → the 'sample' events · the address used is kept */
  function shipQuick(state, sh, kind, o, ctx) {
    if (!sh || !isISODate(o.date)) return null;
    const events = [], c = (k, x) => R.updateShipment(sh, Object.assign({ kind: k, date: o.date }, x || {}), { eventId: ctx.eventId(), now: ctx.now, user: ctx.user });
    if (kind === 'shipped' || kind === 'both') {
      if (['shipped', 'delivered', 'not_required'].includes(sh.status) && kind === 'shipped') return null;
      if (sh.status !== 'shipped' && sh.status !== 'delivered') { events.push(c('shipped', { carrier: trim(o.carrier) || null, tracking: o.tracking || '' })); R.pinAddress(state, sh, o.addressId); }
    }
    if (kind === 'delivered' || kind === 'both') {
      if (sh.status === 'delivered' || sh.status === 'not_required') return events.length ? events : null;
      events.push(c('delivered'));
    }
    return events.length ? events : null;
  }
  /* Undo delivered: back to Shipped (the delivered date goes) */
  function undoDelivered(sh, ctx) {
    if (!sh || sh.status !== 'delivered') return null;
    Object.assign(sh, { status: 'shipped', delivered_date: null, updated_at: ctx.now, updated_by: ctx.user || null });
    return [{ event_id: ctx.eventId(), deal_id: sh.deal_id, shipment_id: sh.shipment_id, type: 'sample', from: 'delivered', to: 'shipped', changed_at: ctx.now, changed_by: ctx.user || null, note: 'undo' }];
  }

  /* ===================== schema 16 ===================== */
  /* ops_mode simple / simple · lines in a run that went to Accounting: sent_at = when the run was submitted · new line fields null · Campaigns / Phases approved */
  function migrateV16(obj) {
    obj.lookups = obj.lookups || {};
    if (!obj.lookups.ops_mode || typeof obj.lookups.ops_mode !== 'object') obj.lookups.ops_mode = Object.assign({}, OPS_DEFAULT);
    const runs = new Map((obj.payment_runs || []).map(r => [r.run_id, r]));
    (obj.payment_lines || []).forEach(l => {
      ['paid_by', 'paid_ref', 'sent_by', 'unpaid_reason'].forEach(k => { if (l[k] === undefined) l[k] = null; });
      if (l.sent_at === undefined) { const r = runs.get(l.run_id); l.sent_at = r && r.status !== 'draft' && r.submitted_at && (l.status === 'submitted' || l.status === 'paid') ? r.submitted_at : null; }
    });
    R.migrateApprovals(obj);
    obj.schema_version = Math.max(obj.schema_version || 0, 16);   // never down (run again on newer data)
    return obj;
  }

  return { OPS_KINDS, OPS_MODES, OPS_DEFAULT, opsMode, isSimple, setOpsMode, simpleBucket, sentAt, sentDays, SENT_LATE_DAYS, canPaySimple, canUnpay,
    markItemsPaid, undoMarkPaid, markUnpaid, sendToAccounting, undoSend, moveBackToPay, docsTally, setWhtSent, paymentsToConfirm, simplePayTrack,
    docsChecklist, validateDocs, setItemDocs, allReceived, syncDocsDone, lineHistory, docKeys, lineDocsOf, docsMeta, dealProjectNames, docsLinks, paymentReadiness, afterPost,
    shipQuick, undoDelivered, migrateV16 };
})(KT.rules, KT.content));
