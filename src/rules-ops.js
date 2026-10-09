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
    Object.assign(l, { status: 'open', run_id: null, sent_at: null, sent_by: null, sent_ref: null, verified_at: null, verified_by: null });
    dropEmpty(state, run);   // CR-33: a round left empty goes too
    return [ev];
  }
  /* ===================== CR-33 §3.4–3.7 — rounds: a PR round = a payment run Submitted (to Accounting) → Paid (confirmed) ===================== */
  /* what is owed to be billed now, by the payment term (Pay after post = posted · Prepaid = Confirm QT · 50/50 = each instalment · Package = Confirm QT) */
  const dueToSubmit = (state, deal, today) => R.dueLines(state, deal, today).filter(i => i.reached && !i.paid);
  /* the run of a round · a line in it · lines live in it */
  const roundLines = (state, runId) => R.runLines(state, runId).filter(l => l.status !== 'cancelled');
  /* Create round (Staff): the rows Ready to send only (the others skipped and counted) → a round "PR-yyyy-mm-dd" (a name can be given) Submitted at once ·
     o: { name, expectedPayDate, today, addTo (a round to add the rows to) } → { run, lines, events, skipped, undo } */
  function createRound(state, items, o, ctx) {
    const live = items.filter(x => !['paid', 'on_hold', 'submitted', 'in_run', 'cancelled'].includes(x.status) && !(x.line && ['paid', 'cancelled', 'on_hold', 'submitted', 'in_run'].includes(x.line.status)));
    const ready = live.filter(x => paymentReadiness(state, x).ready), skipped = items.length - ready.length;
    if (!ready.length) return { run: null, lines: [], events: [], skipped, undo: null };
    let run = o.addTo ? runOf(state, o.addTo) : null, made = false;
    if (!run) {
      run = Object.assign(R.newRun(state, { pay_date: o.today, user: ctx.user, now: ctx.now }), { status: 'submitted', submitted_at: ctx.now, submitted_by: ctx.user || null, round: true });
      Object.assign(run, { name: trim(o.name) || run.run_id, label: trim(o.name) || run.run_id, pay_date: isISODate(o.expectedPayDate) ? o.expectedPayDate : run.pay_date, expected_pay_date: isISODate(o.expectedPayDate) ? o.expectedPayDate : null,
        paid_at: null, paid_ref: null, confirmed_by: null, confirmed_at: null, external_ref: null, voucher_status: null });
      state.payment_runs.push(run); made = true;
    }
    const events = [], lines = [], undo = { run_id: made ? run.run_id : null, created: [], lines: [] };
    ready.forEach(x => {
      let l = x.line;
      if (!l) { const f = lineFor(state, x, ctx); l = f.line; if (f.prev) undo.lines.push({ line_id: l.line_id, prev: f.prev, full: true }); else { state.payment_lines.push(l); undo.created.push(l.line_id); } }
      else undo.lines.push({ line_id: l.line_id, prev: JSON.parse(JSON.stringify(l)), full: true });
      const p = R.payeeOfLine(state, l);
      events.push(payEvent(l, l.status, 'submitted', ctx, run.run_id));
      Object.assign(l, { run_id: run.run_id, status: 'submitted', sent_at: ctx.now, sent_by: ctx.user || null, sent_ref: null, payee_id: p ? p.payee_id : l.payee_id, payee_version_at_submit: p ? p.details_version || 0 : null,
        verified_at: null, verified_by: null, returned_reason: null, returned_at: null, returned_by: null });
      lines.push(l);
    });
    return { run, lines, events, skipped, undo };
  }
  /* Undo (10 seconds): the round and its lines as they were */
  function undoRound(state, undo) {
    if (!undo) return;
    state.payment_lines = state.payment_lines.filter(l => !undo.created.includes(l.line_id));
    undo.lines.forEach(u => { const l = lineOf(state, u.line_id); if (l) restore(l, u.prev); });
    if (undo.run_id) state.payment_runs = state.payment_runs.filter(r => r.run_id !== undo.run_id);
  }
  /* a round left with no lines goes (an automatic "Sent dd/mm" run too) */
  const dropEmpty = (state, run) => { if (run && (run.auto || run.round) && !R.runLines(state, run.run_id).length) state.payment_runs = state.payment_runs.filter(r => r !== run); };
  /* Accounting (§3.7): Verify — the documents are right (✓ Verified · who · when) · again = not verified */
  function verifyLine(state, l, on, ctx) {
    if (!l || l.status !== 'submitted') return null;
    const ev = { event_id: ctx.eventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payment_verified', from: l.verified_at ? 'verified' : null, to: on ? 'verified' : null, changed_at: ctx.now, changed_by: ctx.user || null, note: l.run_id || null };
    Object.assign(l, on ? { verified_at: ctx.now, verified_by: ctx.user || null } : { verified_at: null, verified_by: null });
    return [ev];
  }
  /* Accounting: Return (a reason) — the line leaves the round and is back in To submit of the person who sent it (chip Returned) */
  function returnLine(state, l, reason, ctx) {
    if (!l || l.status !== 'submitted' || !trim(reason)) return null;
    const run = runOf(state, l.run_id), ev = payEvent(l, 'submitted', 'open', ctx, C.pay.rounds.returnedNote(trim(reason)));
    Object.assign(l, { status: 'open', run_id: null, sent_at: null, sent_ref: null, verified_at: null, verified_by: null, returned_reason: trim(reason), returned_at: ctx.now, returned_by: ctx.user || null });
    dropEmpty(state, run);
    return [ev];
  }
  /* Confirm paid (a round · optional): every line Paid on o.date with o.ref · o.exclude [line ids] "Not paid in this round" → back to To submit ·
     the deals' flags follow → { events, undo } */
  function confirmRoundPaid(state, run, o, ctx) {
    if (!run || run.status !== 'submitted' || !isISODate(o.date)) return null;
    const live = roundLines(state, run.run_id), ex = new Set(o.exclude || []);
    const undo = { run: JSON.parse(JSON.stringify(run)), lines: live.map(l => ({ line_id: l.line_id, prev: JSON.parse(JSON.stringify(l)) })), deals: dealFlags(state, live.map(l => l.deal_id)) }, events = [];
    live.forEach(l => {
      if (ex.has(l.line_id)) { events.push(payEvent(l, l.status, 'open', ctx, C.pay.rounds.notPaidNote)); Object.assign(l, { status: 'open', run_id: null, sent_at: null, sent_ref: null, verified_at: null, verified_by: null }); return; }
      if (l.status === 'paid') return;
      events.push(payEvent(l, l.status, 'paid', ctx, [run.run_id, trim(o.ref)].filter(Boolean).join(' · ')));
      Object.assign(l, { status: 'paid', paid_date: o.date, paid_by: ctx.user || null, paid_ref: trim(o.ref) || null, unpaid_reason: null });
    });
    Object.assign(run, { status: 'paid', paid_at: o.date, paid_ref: trim(o.ref) || null, confirmed_by: ctx.user || null, confirmed_at: ctx.now });
    R.syncDeals(state, live.map(l => l.deal_id));
    return { events, undo };
  }
  /* Undo confirm (a reason): the round is Submitted again, its lines too · the deals' flags go back */
  function undoConfirmRound(state, run, reason, ctx) {
    if (!run || run.status !== 'paid' || !trim(reason)) return null;
    const events = [];
    roundLines(state, run.run_id).filter(l => l.status === 'paid').forEach(l => { events.push(payEvent(l, 'paid', 'submitted', ctx, trim(reason))); Object.assign(l, { status: 'submitted', paid_date: null, paid_by: null, paid_ref: null }); });
    Object.assign(run, { status: 'submitted', paid_at: null, paid_ref: null, confirmed_by: null, confirmed_at: null, unconfirm_reason: trim(reason) });
    R.syncDeals(state, R.runLines(state, run.run_id).map(l => l.deal_id));
    return events;
  }
  /* the undo of Confirm paid (10 seconds) */
  function restoreConfirm(state, undo) {
    const run = runOf(state, undo.run.run_id); if (run) { Object.keys(run).forEach(k => { delete run[k]; }); Object.assign(run, undo.run); }
    undo.lines.forEach(u => { const l = lineOf(state, u.line_id); if (l) restore(l, u.prev); });
    undo.deals.forEach(u => { const d = state.deals.find(x => x.deal_id === u.deal_id); if (d) Object.assign(d, u.flags); });
  }
  /* the head of a round: lines · Gross / WHT / Net · Verified n/m · days since it was sent (more than 7 = yellow) · who sent it */
  function roundInfo(state, run, today) {
    const lines = roundLines(state, run.run_id), t = R.runTotals(lines);
    const at = run.submitted_at || (lines.map(l => l.sent_at).filter(Boolean).sort()[0]) || null, days = at ? R.dayDiff(today, R.dateOfTimestamp(at)) : null;
    return { lines, totals: t, verified: lines.filter(l => l.verified_at).length, n: lines.length, sentAt: at, days, late: days != null && days > SENT_LATE_DAYS,
      sender: run.submitted_by || run.prepared_by || (lines[0] && lines[0].sent_by) || null, name: run.name || run.label || run.run_id };
  }
  /* Print (§3.8): who printed and when, on each line · one event for the round ("printed PR-… · n lines" — nothing of the file) */
  function markPrinted(state, lines, label, ctx) {
    lines.forEach(l => Object.assign(l, { printed_at: ctx.now, printed_by: ctx.user || null }));
    return lines.length ? [{ event_id: ctx.eventId(), deal_id: null, line_id: null, run_id: lines[0].run_id || null, type: 'payment_printed', from: null, to: label || null, changed_at: ctx.now, changed_by: ctx.user || null, note: C.pay.rounds.printedLog(label || '', lines.length) }] : [];
  }
  /* To submit › "Posted but not submitted": rows owed after their post, not in a round — red when one was posted more than 7 days ago */
  function postedNotSubmitted(state, items, today) {
    const rows = items.filter(x => x.deal && ['ready', 'missing_docs'].includes(x.status) && !x.run_id && R.firstPostDate(state, x.deal));
    const oldest = rows.map(x => R.firstPostDate(state, x.deal)).sort()[0] || null;
    return { n: rows.length, gross: Math.round(rows.reduce((a, x) => a + x.tax.gross, 0) * 100) / 100, late: !!oldest && R.dayDiff(today, oldest) > SENT_LATE_DAYS, oldest };
  }

  /* ===================== CR-27 · CR-32 · CR-33 §3.2 — Payment details › Documents ===================== */
  /* the documents of a row: the payee's (ID copy · Bank book · Company certificate · VAT certificate — kept once on the payee and used by every round: "From payee") ·
     the round's own: Post proof for an instalment paid after the post + any added by hand · All documents in one file (a file or a link) · one Note ·
     each document is a file (encrypted in IndexedDB · KT.docfiles) or an https link · Bank details are the payee's (the vault — Pay to) */
  const afterPost = (x, deal) => !!deal && (x.milestone === 'final' || (x.milestone === 'full' && R.termOf(deal) !== 'prepaid'));
  const dealOfX = (state, x) => x.deal || (x.deal_id ? state.deals.find(d => d.deal_id === x.deal_id) || null : null);
  const payeeOfX = (state, x) => (x.payee === undefined ? R.payeeOfLine(state, x.line || x) : x.payee);
  function docKeys(state, x) {
    if (!x || x.pay_to === 'reimburse') return [];
    return R.payeeDocKeys(payeeOfX(state, x)).concat(afterPost(x, dealOfX(state, x)) ? ['post_proof'] : []);
  }
  /* a stored document → { kind: file | link, file_id, url, name, mime, bytes, received_at, … } (CR-32 kept "link") */
  const asDoc = d => { if (!d) return {}; const o = Object.assign({}, d, { kind: d.file_id ? 'file' : 'link', url: d.url || d.link || '' }); delete o.link; return o; };   // CR-32 kept it as link
  /* what a line keeps, read the CR-33 way: an old "Post evidence" tick = Post proof · an old "Bank details" tick = a document of its own (kept) ·
     the old notes of each document become the one Note (when there is none yet) */
  function lineDocsOf(l) {
    const raw = R.lineDocs(l);
    const items = raw.map(d => asDoc(d.key === 'post_evidence' && !d.custom ? Object.assign({}, d, { key: 'post_proof' })
      : d.key === 'bank_details' && !d.custom ? Object.assign({}, d, { custom: true, label: d.label || C.payee.missingBank }) : d));
    const oldNotes = raw.filter(d => trim(d.note)).map(d => `${d.custom ? d.label || '' : d.key === 'bank_details' ? C.payee.missingBank : R.docLabel(d.key === 'post_evidence' ? 'post_proof' : d.key)}: ${trim(d.note)}`);
    const one = (l && l.docs_one) || {};
    return { items, note: l && l.docs_note != null ? l.docs_note : oldNotes.join(' · '), one: Object.assign(asDoc(one), { on: !!one.on, received_at: one.received_at || null }) };
  }
  /* the latest post date of the deal (Post proof › Posted on starts with it) */
  const lastPostDate = (state, dealId) => (dealId ? R.postsOf(state, dealId).map(p => p.post_date).filter(Boolean).sort().pop() || null : null);
  const docRow = (key, label, d, one, o) => Object.assign({ key, label, custom: false, fromPayee: false, attached: R.docAttached(d), received: one || R.docAttached(d) || !!d.received_at,
    received_at: d.received_at || null, kind: d.file_id ? 'file' : d.url ? 'link' : null, file_id: d.file_id || null, url: d.url || '', name: d.name || '', mime: d.mime || null, bytes: d.bytes || null }, o || {});
  /* the checklist of a row → [{ key, label, fromPayee, custom, attached (a file or a link), received, received_at, kind, file_id, url, name, posted_on (Post proof) }] ·
     All in one file with a file or a link: every one counts as received */
  function docsChecklist(state, x) {
    if (!x || x.pay_to === 'reimburse') return [];
    const p = payeeOfX(state, x), v = lineDocsOf(x.line || x.docsLine || x), one = v.one.on && R.docAttached(v.one), deal = dealOfX(state, x);
    const out = R.payeeDocKeys(p).map(k => { const d = asDoc(R.payeeDoc(p, k)); return docRow(k, R.docLabel(k), d.key ? d : {}, one, { fromPayee: true }); });
    if (afterPost(x, deal)) { const d = v.items.find(y => y.key === 'post_proof' && !y.custom) || {}; out.push(docRow('post_proof', R.docLabel('post_proof'), d, one, { posted_on: d.posted_on || lastPostDate(state, deal && deal.deal_id) })); }
    v.items.filter(d => d.custom).forEach(d => out.push(docRow(d.key, d.label || '', d, one, { custom: true })));
    return out;
  }
  /* All in one file · the Note (the section's own) */
  const docsMeta = x => { const v = lineDocsOf(x && (x.line || x.docsLine || x)); return { one: v.one, note: v.note }; };
  /* "Docs 2/3" → { need, have, missing [keys] } */
  function docsTally(state, x) {
    if (!x || x.pay_to === 'reimburse') return null;
    const list = docsChecklist(state, x);
    return { need: list.length, have: list.filter(d => d.received).length, missing: list.filter(d => !d.received).map(d => d.key) };
  }
  /* Note / Link: no ID-card, phone or bank-account number (9 or more digits in a row, - and spaces left out) · a link starts with https:// · an own document needs a name */
  const longDigits = v => /\d{9,}/.test(String(v == null ? '' : v).replace(/[-\s]/g, ''));
  const linkErr = v => (!trim(v) ? null : !/^https:\/\/\S+$/i.test(trim(v)) ? C.pay.docs.linkHttps : longDigits(v) ? C.pay.docs.noNumbers : null);
  function validateDocs(entries, meta) {
    const errs = [];
    (entries || []).forEach((e, i) => {
      if (e.custom && !trim(e.label)) errs.push({ field: `doc${i}_label`, msg: C.pay.docs.nameRequired });
      if (e.custom && (R.looksSensitive(e.label) || longDigits(e.label))) errs.push({ field: `doc${i}_label`, msg: C.msg.sensitive });
      const le = linkErr(e.url != null ? e.url : e.link); if (le) errs.push({ field: `doc${i}_link`, msg: le });
      if (e.received_at && !isISODate(e.received_at)) errs.push({ field: `doc${i}_date`, msg: C.msg.dateInvalid(C.pay.docs.received) });
      if (e.posted_on && !isISODate(e.posted_on)) errs.push({ field: `doc${i}_posted`, msg: C.msg.dateInvalid(C.pay.docs.postedOn) });
    });
    if (meta) {
      if (trim(meta.note) && (R.looksSensitive(meta.note) || longDigits(meta.note))) errs.push({ field: 'docs_note', msg: C.pay.docs.noNumbers });
      const one = meta.one || {}, le = linkErr(one.url != null ? one.url : one.link); if (le) errs.push({ field: 'docs_onelink', msg: le });
      if (one.received_at && !isISODate(one.received_at)) errs.push({ field: 'docs_onedate', msg: C.msg.dateInvalid(C.pay.docs.received) });
    }
    return { errs, warns: [], infos: [] };
  }
  const docsText = list => { const n = list.filter(d => d.received).length; return `${n}/${list.length}`; };
  const fileFields = d => ({ file_id: d.file_id || null, url: trim(d.url != null ? d.url : d.link) || null, name: d.file_id ? d.name || null : null, mime: d.file_id ? d.mime || null : null, bytes: d.file_id ? d.bytes || null : null });
  /* entries = the round's own documents as edited ({key, label, custom, file_id | url, name, mime, bytes, received_at, posted_on}) · meta = { note, one: {on, file_id | url, …, received_at} }
     (left out = as it is) → kept on the row's line (a row with no line gets a docs-only one) · an event 'payment_docs' "2/3 → 3/3" · the deal's Docs done follows ·
     → { line, event, created, dropped [file_ids no longer used] } | { errs } */
  function setItemDocs(state, x, entries, ctx, meta) {
    const mo = Object.assign({}, (meta && meta.one) || {}); if (mo.link !== undefined && mo.url === undefined) mo.url = mo.link; delete mo.link;   // a CR-32 caller's link
    const cur = docsMeta(x), m = { note: meta && meta.note !== undefined ? meta.note : cur.note, one: Object.assign({}, cur.one, mo) };
    const v = validateDocs(entries, m); if (v.errs.length) return { errs: v.errs };
    const before = docsChecklist(state, x), oldFiles = lineFiles(x.line || x.docsLine);
    let l = x.line || x.docsLine, created = false;
    const list = (entries || []).filter(e => !e.fromPayee).filter(e => e.custom || e.file_id || trim(e.url != null ? e.url : e.link) || e.received_at || (e.posted_on && e.key === 'post_proof'))
      .map((e, i) => Object.assign({ key: e.custom ? e.key || `own_${Date.now().toString(36)}_${i}` : e.key, label: e.custom ? trim(e.label) : null, custom: !!e.custom, received_at: e.received_at || null, note: null },
        fileFields(e), e.key === 'post_proof' ? { posted_on: e.posted_on || null } : {}));
    const one = Object.assign({ on: !!m.one.on, received_at: m.one.received_at || null }, fileFields(m.one)), note = trim(m.note) || null, anyOne = one.on || one.url || one.file_id;
    if (!l) {
      if (!list.length && !anyOne && !note) return { line: null, event: null, created: false, dropped: [] };
      l = R.newLine(state, x, { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, pay_to: x.pay_to, reimburse_user: x.reimburse_user, user: ctx.user, now: ctx.now });
      l.docs_only = true; state.payment_lines.push(l); created = true;
    }
    l.docs = list; l.docs_note = note; l.docs_one = anyOne ? one : null;
    if (R.isDocsOnly(l) && !list.length && !anyOne && !note && !l.payee_confirmed_at) state.payment_lines = state.payment_lines.filter(y => y !== l);   // nothing left to keep
    const after = docsChecklist(state, Object.assign({}, x, x.line ? { line: l } : { docsLine: l })), now = new Set(lineFiles(l));
    const ev = { event_id: ctx.eventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payment_docs', from: docsText(before), to: docsText(after), changed_at: ctx.now, changed_by: ctx.user || null,
      note: (one.on && (one.url || one.file_id) && !(cur.one.on && (cur.one.url || cur.one.file_id)) ? C.pay.docs.oneFile : after.filter(d => d.received && !before.some(b => b.key === d.key && b.received)).map(d => d.label).join(' · ')) || null };
    if (l.deal_id) syncDocsDone(state, l.deal_id, String(ctx.now || '').slice(0, 10));
    return { line: l, event: ev, created, dropped: oldFiles.filter(id => !now.has(id)) };
  }
  /* the file ids a line keeps (its documents · All in one file) */
  const lineFiles = l => (!l ? [] : R.lineDocs(l).map(d => d.file_id).concat(l.docs_one ? [l.docs_one.file_id] : []).filter(Boolean));
  /* Mark all received (a row or many): every document of the round not received yet → received on date (the payee's stay as they are) */
  const allReceived = (state, x, date) => docsChecklist(state, x).filter(d => !d.fromPayee).map(d => Object.assign({}, d, d.received ? {} : { received_at: date }));

  /* ===================== CR-32 §2.5 · CR-33 — Ready to send ===================== */
  /* the products of a deal (its Products, else what its samples carried) — the "Project" of the PR file */
  function dealProjectNames(state, deal) {
    if (!deal) return [];
    const codes = R.dealProductList(state, deal.deal_id).map(x => x.tr_code);
    const from = codes.length ? codes : (state.sample_shipments || []).filter(sh => sh.deal_id === deal.deal_id && sh.status !== 'cancelled' && sh.status !== 'not_required').flatMap(sh => (sh.items || []).map(i => i.tr_code));
    return [...new Set(from.filter(Boolean))].map(c => { const p = R.productByCode(state, c); return p ? R.productShort(p) || p.tr_code : c; }).filter(Boolean);
  }
  /* the documents of a row for the PR file's Link column: All in one file, else one per document (a link · a file kept in the app) */
  function docsLinks(state, x) {
    const m = docsMeta(x); if (m.one.on && R.docAttached(m.one)) return [m.one.url || C.pay.docs.fileInApp(C.pay.docs.oneFile)];
    return docsChecklist(state, x).filter(d => !d.custom && d.attached).map(d => d.url || C.pay.docs.fileInApp(d.label));
  }
  /* the payee's encrypted fields are never read here — the payee keeps which ones are filled (details_filled, written each time they are saved;
     an older payee gets it the next time the vault is unlocked) */
  const filledOf = p => (p && p.secure ? (Array.isArray(p.details_filled) ? p.details_filled : null) : []);
  /* CR-33 §3.3 — the payee of the row was confirmed (1 payee: Confirm · more: chosen) */
  const payeeConfirmed = (state, x) => { const l = x.line || x.docsLine, p = x.payee; return !!(l && l.payee_confirmed_at && p && (l.payee_id || null) === p.payee_id); };
  /* → { ready, items [{ key, ok, warn (only a warning), unknown (unlock to check), act }], missing [keys that block], warns [keys] } ·
     a reimbursement needs only the amount and the PIC · a manual line has no posts or payment term to check */
  function paymentReadiness(state, x) {
    const items = [], put = (key, ok, o = {}) => items.push(Object.assign({ key, ok: !!ok, warn: false, unknown: false, act: null }, o));
    const deal = dealOfX(state, x), staff = x.pay_to === 'reimburse';
    if (!staff) {
      const p = x.payee, f = filledOf(p), has = k => !!f && f.includes(k), unk = !!p && p.secure && !f;
      put('payee', !!p && !!p.secure, { act: 'payee' });
      if (p) put('payee_confirmed', payeeConfirmed(state, x), { act: 'confirm' });   // CR-33 §3.3
      if (p && p.secure) {
        put('full_name', has('full_name'), { unknown: unk, act: 'payee' });
        put('id_address', has('id_address'), { unknown: unk, act: 'payee' });
        put('bank', has('bank_name') && has('account_no') && has('account_name'), { unknown: unk, act: 'payee' });
        if (p.payee_type === 'company') put('tax_id', has('tax_id'), { unknown: unk, act: 'payee' });   // CR-33 §3.1
      }
      const list = docsChecklist(state, x), m = docsMeta(x), oneOk = m.one.on && R.docAttached(m.one);
      put('docs', oneOk || (list.length > 0 && list.filter(d => !d.custom).every(d => d.attached)), { act: 'docs' });
      if (deal && afterPost(x, deal)) { const ps = R.postsOf(state, deal.deal_id); put('posted', ps.length > 0 && ps.every(R.postDone), { act: 'posts' }); }
      put('project', deal ? dealProjectNames(state, deal).length > 0 : !!trim(x.project_label), { act: deal ? 'products' : null });
    }
    put('amount', (x.tax ? x.tax.gross : 0) > 0 && (!deal || !!R.termOf(deal)), { act: deal ? 'deal' : null });
    put('pic', !!(x.pic || (staff && x.reimburse_user)), { act: deal ? 'pic' : null });
    if (!staff && x.tax && x.tax.wht > 0) { const f = filledOf(x.payee); put('wht_contact', !!f && f.includes('wht_contact'), { warn: true, unknown: !!x.payee && x.payee.secure && !f, act: x.payee ? 'payee' : null }); }
    const missing = items.filter(i => !i.ok && !i.warn).map(i => i.key), warns = items.filter(i => !i.ok && i.warn).map(i => i.key);
    return { ready: !missing.length, items, missing, warns };
  }
  /* CR-33 §3.3 — Pay to: the payee is confirmed on the row (1 payee: Confirm payee · more: chosen from an empty list — never a default) · a deal's row: the deal's
     Pay to follows (its open lines too) · a row with no line keeps it on a docs-only line → { line, events, created } | null */
  function confirmPayee(state, x, payeeId, ctx) {
    const p = R.payeeById(state, payeeId); if (!p || p.archived || (x.kol_id && p.kol_id && p.kol_id !== x.kol_id)) return null;
    let l = x.line || x.docsLine; if (l && R.linePayeeLocked(l)) return null;
    const deal = dealOfX(state, x);
    const events = [];
    if (deal && (!x.payee || x.payee.payee_id !== p.payee_id)) { const def = R.defaultPayee(state, deal.kol_id), r = R.setDealPayee(state, deal, def && def.payee_id === p.payee_id ? null : p.payee_id, { eventId: ctx.eventId(), now: new Date(ctx.now || Date.now()), user: ctx.user }); if (r && r.event) events.push(r.event); }
    let created = false;
    if (!l) { l = R.newLine(state, Object.assign({}, x, { payee: p }), { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, pay_to: x.pay_to, reimburse_user: x.reimburse_user, user: ctx.user, now: ctx.now }); l.docs_only = true; state.payment_lines.push(l); created = true; }
    else if (!deal && l.payee_id !== p.payee_id) R.setLinePayee(state, l, p.payee_id);
    const ev = { event_id: ctx.eventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payee_confirmed', from: l.payee_confirmed_at ? l.payee_id : null, to: p.payee_id, changed_at: ctx.now, changed_by: ctx.user || null, note: p.label || null };
    Object.assign(l, { payee_id: p.payee_id, payee_type: p.payee_type, payee_confirmed_at: ctx.now, payee_confirmed_by: ctx.user || null });
    return { line: l, events: events.concat([ev]), created };
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

  /* ===================== CR-33 §3.8 — Print: what goes into the PDF, in order ===================== */
  /* a row (a line or a To pay row) → { key, summary (the plain part — the personal fields are filled from the vault by the caller), parts [{ key, label, fromPayee, file_id | url, name, mime }]
     in the PDF's order: All documents in one file · else ID copy → Bank book → Company certificate → VAT certificate → Post proof → others · files = what goes in · links = "Linked — not included" } */
  const PRINT_ORDER = ['id_copy', 'bank_book', 'company_cert', 'vat_cert', 'post_proof'];
  function printPlan(state, item) {
    const x = item.line_id && !item.tax ? { line: item, payee: R.payeeOfLine(state, item), deal_id: item.deal_id, milestone: item.milestone, pay_to: item.pay_to, kol_id: item.kol_id } : item;
    const l = x.line || x.docsLine || null, deal = dealOfX(state, x), p = x.payee || null, kol = x.kol_id ? R.kolById(state, x.kol_id) : null;
    const names = deal ? dealProjectNames(state, deal) : [], run = l && l.run_id ? runOf(state, l.run_id) : null;
    const tax = x.tax || (l ? { gross: l.gross, vat: l.vat, wht: l.wht, net: l.net, wht_rate: l.wht_rate } : { gross: 0, vat: 0, wht: 0, net: 0, wht_rate: 0 });
    const posts = deal ? R.postsOf(state, deal.deal_id).filter(ps => ps.post_link).map(ps => ({ link: ps.post_link, date: ps.post_date || null })) : [];
    const summary = { project: names.length ? names.join(', ') : (l && l.project_label) || x.project_label || (deal ? R.campaignName(state, deal.campaign_id) : ''),
      account: (l && l.account_handle) || x.account_handle || '', type: (l && l.source === 'affiliate') || (kol && R.partnerTypeOf(kol) === 'affiliate') ? 'AFF' : 'KOL',
      bank: p ? R.bankPr(state.lookups, p.bank_name) : '', gross: tax.gross, vat: tax.vat, wht: tax.wht, wht_rate: tax.wht_rate, net: tax.net,
      pic: deal ? deal.pic || '' : x.pic || '', round: run ? run.name || run.label || run.run_id : '', round_id: run ? run.run_id : '', deal_id: x.deal_id || '', line_id: l ? l.line_id : '', posts, payee_id: p ? p.payee_id : '' };
    const m = docsMeta(x), one = m.one.on && R.docAttached(m.one);
    const part = d => ({ key: d.key, label: d.label, fromPayee: !!d.fromPayee, file_id: d.file_id || null, url: d.file_id ? null : d.url || null, name: d.name || '', mime: d.mime || null, posted_on: d.posted_on || null });
    const parts = one ? [{ key: 'one', label: C.pay.docs.oneFile, fromPayee: false, file_id: m.one.file_id || null, url: m.one.file_id ? null : m.one.url || null, name: m.one.name || '', mime: m.one.mime || null }]
      : docsChecklist(state, x).filter(d => d.attached).sort((a, b) => (PRINT_ORDER.indexOf(a.key) < 0 ? 99 : PRINT_ORDER.indexOf(a.key)) - (PRINT_ORDER.indexOf(b.key) < 0 ? 99 : PRINT_ORDER.indexOf(b.key))).map(part);
    return { key: x.key || (l && l.line_id), summary, parts, files: parts.filter(q => q.file_id), links: parts.filter(q => !q.file_id && q.url), missing: docsChecklist(state, x).filter(d => !d.attached && !one).map(d => d.label) };
  }

  /* the Payment summary page, row by row (label · value · links) — the personal fields from rec (the payee's, decrypted by the caller, in memory only) */
  function printRows(plan, rec) {
    const P = C.pay.print, s = plan.summary, money = v => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), r = rec || {};
    return [[P.project, s.project], [P.account, s.account], [P.type, s.type], [P.fullName, r.full_name || P.notAvailable], [P.idAddress, r.id_address || P.notAvailable],
      [P.bank, s.bank || (r.bank_name ? R.bankPr({}, r.bank_name) : '')], [P.accountNo, r.account_no || P.notAvailable], [P.gross, money(s.gross)], [P.vat, money(s.vat)],
      [P.wht(s.wht_rate || 0), money(s.wht)], [P.net, money(s.net)], [P.pic, s.pic], [P.round, s.round || P.noRound], [P.dealId, s.deal_id || '—'], [P.lineId, s.line_id || '—']]
      .concat(s.posts.length ? s.posts.map((x, i) => [i ? '' : P.postLink, `${x.link}${x.date ? `  ·  ${P.postedOn} ${R.dmy(x.date)}` : ''}`, x.link]) : [[P.postLink, '—']]);
  }

  /* ===================== schema 24 (CR-33 §4 — once) ===================== */
  /* payee documents → [{ key, kind, file_id, url, received_at }] (a date = "Received dd/mm · file not attached") · ID copy / Bank book kept on a payment line (CR-32) → the payee ·
     lines with a payee → confirmed (the day of the migration) · the CR-33 fields null · rounds: every run gets a name · a run with every line paid → Paid ·
     paid lines with no run → one Paid round a paid date (PR-<date>) · no amount changes */
  function migrateV24(obj, nowIso) {
    const at = nowIso || new Date().toISOString(), payees = obj.payee_profiles || [], lines = obj.payment_lines || [];
    obj.payment_runs = obj.payment_runs || [];
    payees.forEach(p => {
      if (p.docs && !Array.isArray(p.docs)) p.docs = Object.entries(p.docs).filter(([, v]) => v).map(([key, v]) => ({ key, kind: 'link', file_id: null, url: null, name: null, received_at: isISODate(v) ? v : null }));
      else if (!p.docs) p.docs = [];
    });
    const UP = ['id_copy', 'bank_book', 'company_cert', 'vat_cert'];
    lines.forEach(l => {
      const items = Array.isArray(l.docs) ? l.docs : [], up = items.filter(d => d && !d.custom && UP.includes(d.key));
      if (up.length) {
        const p = payees.find(x => x.payee_id === l.payee_id) || payees.find(x => x.kol_id && x.kol_id === l.kol_id && x.is_default) || null;
        up.forEach(d => { if (p && !p.docs.some(x => x.key === d.key)) p.docs.push({ key: d.key, kind: 'link', file_id: null, url: d.url || d.link || null, name: null, received_at: d.received_at || null }); });
        l.docs = items.filter(d => !up.includes(d));
      }
      ['payee_confirmed_at', 'payee_confirmed_by', 'verified_at', 'verified_by', 'returned_reason', 'returned_at', 'returned_by', 'printed_at', 'printed_by', 'external_ref', 'voucher_status'].forEach(k => { if (l[k] === undefined) l[k] = null; });
      if (l.payee_id && !l.payee_confirmed_at) Object.assign(l, { payee_confirmed_at: at, payee_confirmed_by: 'system' });
    });
    /* a run made by Send to accounting (Simple) is named by its send date: PR-<date> (-2 · -3 when a day has more) · a Full-mode run keeps its label */
    const taken = new Set(obj.payment_runs.map(r => r.name).filter(Boolean)), prName = d => { let id = 'PR-' + d, n = 2; while (taken.has(id)) id = `PR-${d}-${n++}`; taken.add(id); return id; };
    obj.payment_runs.forEach(r => {
      if (!r.name) r.name = r.auto === 'simple' && r.submitted_at ? prName(String(r.submitted_at).slice(0, 10)) : r.label || r.run_id;
      ['expected_pay_date', 'paid_at', 'paid_ref', 'confirmed_by', 'confirmed_at', 'external_ref', 'voucher_status', 'submitted_by'].forEach(k => { if (r[k] === undefined) r[k] = null; });
      const live = lines.filter(l => l.run_id === r.run_id && l.status !== 'cancelled');
      if (live.length && live.every(l => l.status === 'paid') && r.status !== 'paid' && r.status !== 'closed') Object.assign(r, { status: 'paid', paid_at: live.map(l => l.paid_date).filter(Boolean).sort().pop() || null, confirmed_by: 'system' });
      else if (r.status === 'paid' && !r.paid_at) r.paid_at = live.map(l => l.paid_date).filter(Boolean).sort().pop() || null;
    });
    /* lines Sent with no run → a Submitted round a send date · Paid with no run → a Paid round a paid date (PR-<date>) */
    const ids = new Set(obj.payment_runs.map(r => r.run_id));
    const group = (pick, dateOf) => { const m = new Map(); lines.filter(pick).forEach(l => { const d = dateOf(l); if (!m.has(d)) m.set(d, []); m.get(d).push(l); }); return m; };
    const sent = group(l => l.status === 'submitted' && !l.run_id && !l.docs_only, l => String(l.sent_at || at).slice(0, 10));
    const paid = group(l => l.status === 'paid' && !l.run_id && !l.docs_only, l => l.paid_date || at.slice(0, 10));
    [[sent, 'submitted'], [paid, 'paid']].forEach(([m, st]) => [...m.keys()].sort().forEach(d => {
      let id = 'PR-' + d, n = 2; while (ids.has(id)) id = `PR-${d}-${n++}`; ids.add(id); taken.add(id);
      const first = m.get(d)[0];
      obj.payment_runs.push({ run_id: id, name: id, label: id, pay_date: d, prepared_by: null, status: st, submitted_at: st === 'submitted' ? first.sent_at || at : null, submitted_by: st === 'submitted' ? first.sent_by || null : null,
        note: null, created_at: at, round: true, migrated: true, expected_pay_date: null, paid_at: st === 'paid' ? d : null, paid_ref: null, confirmed_by: st === 'paid' ? 'system' : null, confirmed_at: st === 'paid' ? at : null,
        external_ref: null, voucher_status: null });
      m.get(d).forEach(l => { l.run_id = id; });
    }));
    obj.schema_version = Math.max(obj.schema_version || 0, 24);
    return obj;
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
    payeeConfirmed, confirmPayee, lineFiles, dueToSubmit, roundLines, createRound, undoRound, verifyLine, returnLine, confirmRoundPaid, undoConfirmRound, restoreConfirm, roundInfo, markPrinted, postedNotSubmitted,
    shipQuick, undoDelivered, migrateV16, printPlan, printRows, migrateV24 };
})(KT.rules, KT.content));
