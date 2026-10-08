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
    run_id: l.run_id || null, sent_at: l.sent_at || null, sent_by: l.sent_by || null });
  const FLAGS = ['paid_50', 'paid_50_date', 'paid_full', 'paid_full_date', 'docs_done', 'docs_done_date'];
  const dealFlags = (state, ids) => [...new Set(ids.filter(Boolean))].map(id => { const d = state.deals.find(x => x.deal_id === id); return d ? { deal_id: id, flags: Object.fromEntries(FLAGS.map(k => [k, d[k] === undefined ? null : d[k]])) } : null; }).filter(Boolean);
  /* a row that has no line yet (worked out from the deal) becomes one — the amounts as CR-08 works them out */
  const lineFor = (state, x, ctx) => R.newLine(state, x, { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, pay_to: x.pay_to, reimburse_user: x.reimburse_user, user: ctx.user, now: ctx.now });
  /* Mark paid (To pay · Sent · Deal drawer · Go-live "outside the app"): each row Paid on o.date with o.ref (and o.note) · a worked-out instalment gets its line first ·
     a line in a run stays in it (the run is Paid once all its lines are) · the deals' flags follow (syncDealPayment) → { events, undo, n } */
  function markItemsPaid(state, items, o, ctx) {
    const events = [], undo = { created: [], lines: [], runs: [], deals: dealFlags(state, items.map(x => x.deal_id)) }, runs = new Set();
    let n = 0;
    items.forEach(x => {
      let l = x.line;
      if (x.status === 'paid' || (l && (l.status === 'paid' || l.status === 'cancelled'))) return;
      if (!l) { l = lineFor(state, x, ctx); if (o.legacy) l.source = 'legacy'; state.payment_lines.push(l); undo.created.push(l.line_id); }
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
    undo.lines.forEach(u => { const l = lineOf(state, u.line_id); if (!l) return; events.push(payEvent(l, l.status, u.prev.status, ctx, 'undo')); Object.assign(l, u.prev); });
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
      if (!l) { l = lineFor(state, x, ctx); state.payment_lines.push(l); undo.created.push(l.line_id); }
      else undo.lines.push({ line_id: l.line_id, prev: Object.assign(keep(l), { payee_id: l.payee_id, payee_version_at_submit: l.payee_version_at_submit }) });
      const p = R.payeeOfLine(state, l);
      events.push(payEvent(l, l.status, 'submitted', ctx, run.run_id));
      Object.assign(l, { run_id: run.run_id, status: 'submitted', sent_at: ctx.now, sent_by: ctx.user || null, payee_id: p ? p.payee_id : l.payee_id, payee_version_at_submit: p ? p.details_version || 0 : null });
      lines.push(l);
    });
    if (!lines.length) { state.payment_runs = state.payment_runs.filter(r => r !== run); return null; }
    return { run, events, undo, lines };
  }
  /* "No" after the download: nothing was sent — every line and the run as they were */
  function undoSend(state, undo) {
    state.payment_lines = state.payment_lines.filter(l => !undo.created.includes(l.line_id));
    undo.lines.forEach(u => { const l = lineOf(state, u.line_id); if (l) Object.assign(l, u.prev); });
    state.payment_runs = state.payment_runs.filter(r => r.run_id !== undo.run_id);
  }
  /* Sent › Move back to To pay: out of its run (an automatic run left empty goes too) */
  function moveBackToPay(state, l, ctx, note) {
    if (!l || l.status !== 'submitted') return null;
    const run = runOf(state, l.run_id), ev = payEvent(l, 'submitted', 'open', ctx, trim(note) || null);
    Object.assign(l, { status: 'open', run_id: null, sent_at: null, sent_by: null });
    if (run && run.auto && !R.runLines(state, run.run_id).length) state.payment_runs = state.payment_runs.filter(r => r !== run);
    return [ev];
  }
  /* "Docs 2/4" (§4.2 — information only, never a block): the payee's documents + bank details + post evidence when the instalment needs it */
  function docsTally(state, x) {
    if (!x || x.pay_to === 'reimburse') return null;
    const p = x.payee, company = !!p && p.payee_type === 'company', deal = x.deal || null;
    const need = (company ? ['company_cert', 'bank_book'].concat(p.vat_registered ? ['vat_cert'] : []) : ['id_copy', 'bank_book']).concat(['bank_details']);
    if (deal && (x.milestone === 'final' || (x.milestone === 'full' && R.termOf(deal) !== 'prepaid'))) need.push('post_evidence');
    const miss = R.docsRequired(state, x.line || { deal_id: x.deal_id, milestone: x.milestone, pay_to: x.pay_to }, p || null);
    return { need: need.length, have: need.filter(k => !miss.includes(k)).length, missing: miss };
  }
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
    shipQuick, undoDelivered, migrateV16 };
})(KT.rules, KT.content));
