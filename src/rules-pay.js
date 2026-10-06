/* rules-pay.js — CR-08 Payments: tax (VAT / WHT, half up to the satang), the instalments a deal owes by its payment term (dueLines),
   payee profiles and their documents, the payee-details CSV and Settings › Payments. Pure functions; adds to KT.rules (load after rules-journey.js).
   A payee's personal data (name, address, phone, account number, tax ID) is never here in plain text: vault.js encrypts it into
   payee.secure and only the bank name + last 4 digits stay readable. */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg;
  const { isBlank, trim, isISODate, totalCost, termOf, looksSensitive } = R;
  const issue = (field, msg) => ({ field, msg });

  /* ===================== settings (lookups.payment_settings) ===================== */
  const PAYMENT_SETTINGS_DEFAULT = { vat_rate: 7, wht_threshold: 1000, wht_rates: [0, 1, 2, 3, 5], default_wht_individual: 3, default_wht_company: 3, bands: [1000, 10000], run_weekday: 5 };
  const paymentSettingsDefault = () => JSON.parse(JSON.stringify(PAYMENT_SETTINGS_DEFAULT));
  const paySettings = L => Object.assign(paymentSettingsDefault(), (L && L.payment_settings) || {});
  /* Settings › Payments: numbers ≥ 0 · VAT and rates are percentages · the defaults are among the rates · bands go up · a weekday 0–6 */
  function validatePaymentSettings(d) {
    const errs = [], n = v => (isBlank(v) || isNaN(v) ? NaN : Number(v));
    if (!(n(d.vat_rate) >= 0 && n(d.vat_rate) <= 100)) errs.push(issue('vat_rate', M.payPercent(C.pay.set.vat)));
    if (!(n(d.wht_threshold) >= 0)) errs.push(issue('wht_threshold', M.payAmount(C.pay.set.threshold)));
    const rates = String(d.wht_rates).split(/[\s,]+/).filter(Boolean).map(Number);
    if (!rates.length || rates.some(r => isNaN(r) || r < 0 || r >= 100)) errs.push(issue('wht_rates', M.payRates));
    ['default_wht_individual', 'default_wht_company'].forEach(k => { if (!rates.includes(n(d[k]))) errs.push(issue(k, M.payDefaultRate)); });
    const b = [n(d.band1), n(d.band2)];
    if (!(b[0] > 0 && b[1] > b[0])) errs.push(issue('bands', M.payBands));
    if (!(Number.isInteger(n(d.run_weekday)) && n(d.run_weekday) >= 0 && n(d.run_weekday) <= 6)) errs.push(issue('run_weekday', M.payWeekday));
    const value = errs.length ? null : { vat_rate: n(d.vat_rate), wht_threshold: n(d.wht_threshold), wht_rates: [...new Set(rates)].sort((x, y) => x - y),
      default_wht_individual: n(d.default_wht_individual), default_wht_company: n(d.default_wht_company), bands: b, run_weekday: n(d.run_weekday) };
    return { errs, warns: [], infos: [], value };
  }

  /* ===================== tax (§4.3) ===================== */
  /* half up to 2 decimals: 1030.9278 → 1030.93 · 1.005 → 1.01 */
  const round2 = x => { const v = Number(x) || 0, a = Math.round(Number((Math.abs(v) * 100).toFixed(6))) / 100; return v < 0 ? -a : a; };
  /* {agreed_amount, price_basis (gross | net), payee_type, vat_registered, wht_rate (%; empty = the default of the payee type)} →
     {gross, vat, wht, wht_rate, net} · net basis (the company bears the WHT): gross = agreed ÷ (1 − rate) from the threshold up ·
     VAT 7% when VAT registered · WHT on gross from the threshold · net = gross + VAT − WHT (what is transferred) */
  function calcPaymentTax(o, settings) {
    const S = Object.assign(paymentSettingsDefault(), settings || {});
    const rate = !isBlank(o.wht_rate) && !isNaN(o.wht_rate) ? Number(o.wht_rate) : (o.payee_type === 'company' ? S.default_wht_company : S.default_wht_individual);
    const r = rate / 100, amt = round2(o.agreed_amount);
    const gross = o.price_basis === 'net' && amt >= S.wht_threshold && r > 0 ? round2(amt / (1 - r)) : amt;
    const vat = o.vat_registered ? round2(gross * S.vat_rate / 100) : 0;
    const wht = gross >= S.wht_threshold ? round2(gross * r) : 0;
    return { gross, vat, wht, wht_rate: rate, net: round2(gross + vat - wht) };
  }
  /* CR-09 §4.14 — the amount range words: Under ฿1,000 · ฿1,000 – ฿9,999 · ฿10,000 and above (from the settings' limits) */
  const amountLabels = settings => { const b = (settings || PAYMENT_SETTINGS_DEFAULT).bands, f = n => '฿' + R.fmtNum(n);
    return [C.pay.amountUnder(f(b[0])), `${f(b[0])} – ${f(b[1] - 1)}`, C.pay.amountFrom(f(b[1]))]; };
  /* the band of an amount: 0 = under 1,000 · 1 = 1,000–9,999 · 2 = 10,000 and above */
  const bandOf = (gross, settings) => { const b = (settings || PAYMENT_SETTINGS_DEFAULT).bands; return gross < b[0] ? 0 : gross < b[1] ? 1 : 2; };

  /* ===================== instalments of a deal (§4.3) ===================== */
  /* when the deal reached Confirm QT (the first dated log at or after it) and when it was completed (the last post date, else the Post log) */
  function reachedDates(state, deal) {
    const L = state.lookups, qt = R.stepOf(L, 'Confirm QT'), logs = R.logsOf(state, deal.deal_id).filter(l => l.effective_date);
    const atOrAfter = l => { const st = R.stepOf(L, l.sub_status); return st && qt && !R.isCancelStep(st) && st.sort_order >= qt.sort_order; };
    const qtLog = logs.find(atOrAfter), posted = R.postsOf(state, deal.deal_id).map(p => p.post_date).filter(Boolean).sort().pop();
    const postLog = logs.filter(l => R.isPostStep(R.stepOf(L, l.sub_status))).pop();
    return { qt: qtLog ? qtLog.effective_date : deal.brief_date || null, done: posted || (postLog ? postLog.effective_date : null) };
  }
  /* by payment term (CR-02 §4.3): prepaid = Full at Confirm QT · split_50 = Deposit at Confirm QT (half of the total, half up to the baht) + Final at Complete ·
     postpaid / not set = Full at Complete · free = nothing · a cancelled deal or a ฿0 deal = nothing (a ฿0 deal is "Needs check") →
     [{ deal_id, milestone, amount, reached (owed now), due_date, paid, paid_date, term_not_set }] — paid comes from the deal's flags */
  function dueLines(state, deal, today) {
    const term = termOf(deal), total = totalCost(deal);
    if (term === 'free' || deal.status === 'Cancel' || total <= 0) return [];
    const L = state.lookups, qt = R.stepOf(L, 'Confirm QT'), cur = R.stepOf(L, deal.sub_status), complete = deal.status === 'Complete';
    const atQt = complete || (!!cur && !!qt && !R.isCancelStep(cur) && cur.sort_order >= qt.sort_order);
    const d = reachedDates(state, deal);
    const mk = (milestone, amount, reached, due, paid, paidDate) => ({ deal_id: deal.deal_id, milestone, amount: round2(amount), reached, due_date: reached ? due || null : null,
      paid, paid_date: paid ? paidDate || null : null, term_not_set: !term });
    if (term === 'prepaid') return [mk('full', total, atQt, d.qt, !!deal.paid_full, deal.paid_full_date)];
    if (term === 'split_50') {
      const dep = Math.round(total / 2);
      return [mk('deposit', dep, atQt, d.qt, !!deal.paid_50 || !!deal.paid_full, deal.paid_50_date || deal.paid_full_date), mk('final', total - dep, complete, d.done, !!deal.paid_full, deal.paid_full_date)];
    }
    return [mk('full', total, complete, d.done, !!deal.paid_full, deal.paid_full_date)];
  }

  /* ===================== payee profiles (§4.4) ===================== */
  const PAYEE_TYPES = ['individual', 'company'];
  const PRICE_BASES = ['gross', 'net'];
  const PAYEE_DOCS = ['id_copy', 'bank_book', 'company_cert', 'vat_cert'];
  /* what payee.secure holds (encrypted) — never stored in plain text */
  const BANK_FIELDS = ['account_name', 'bank_name', 'account_no', 'full_name', 'id_address', 'phone', 'wht_contact', 'tax_id'];
  const BANK_REQUIRED = ['account_name', 'bank_name', 'account_no', 'full_name'];
  const payeeOfKol = (state, kolId) => (state.payee_profiles || []).find(p => p.kol_id && p.kol_id === kolId) || null;
  const payeeById = (state, id) => (state.payee_profiles || []).find(p => p.payee_id === id) || null;
  /* the handle a payee goes by: the KOL's account with the most followers */
  function mainHandle(state, kolId) {
    const accs = R.accountsOfKol(state, kolId).slice().sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0));
    return accs.length ? accs[0].handle : ((R.kolById(state, kolId) || {}).display_name || '');
  }
  function blankPayee(state, o) {
    const S = paySettings(state.lookups), type = PAYEE_TYPES.includes(o.payee_type) ? o.payee_type : 'individual';
    return { payee_id: o.payee_id, kol_id: o.kol_id || null, account_handle: o.kol_id ? mainHandle(state, o.kol_id) : trim(o.account_handle).replace(/^@+/, ''), payee_type: type, vat_registered: false,
      default_wht_rate: type === 'company' ? S.default_wht_company : S.default_wht_individual, price_basis: 'gross', bank_name: null, account_last4: null,
      docs: { id_copy: null, bank_book: null, company_cert: null, vat_cert: null }, docs_link: null, secure: null,
      details_version: 0, details_updated_at: null, details_updated_by: null, needs_verification: false, verified_at: null, verified_by: null,
      created_by: o.user || null, created_at: o.now || null, updated_at: o.now || null, updated_by: o.user || null };
  }
  /* the documents a payee needs on file: Individual = ID copy · Bank book · Bank details · Company = Company certificate · Bank book · Bank details (+ VAT certificate when VAT registered) */
  function payeeDocsMissing(payee) {
    if (!payee) return ['id_copy', 'bank_book', 'bank_details'];   // no payee yet: what an Individual needs
    const need = payee.payee_type === 'company' ? ['company_cert', 'bank_book'].concat(payee.vat_registered ? ['vat_cert'] : []) : ['id_copy', 'bank_book'];
    return need.filter(k => !(payee.docs && payee.docs[k])).concat(payee.secure ? [] : ['bank_details']);
  }
  const digitsOf = v => String(v == null ? '' : v).replace(/\D/g, '');
  const last4 = v => { const d = digitsOf(v); return d.length >= 4 ? d.slice(-4) : null; };
  /* the plain part of a payee (Tax & terms · Documents) */
  function validatePayee(state, d) {
    const errs = [], S = paySettings(state.lookups);
    if (!PAYEE_TYPES.includes(d.payee_type)) errs.push(issue('payee_type', M.payeeType));
    if (!PRICE_BASES.includes(d.price_basis)) errs.push(issue('price_basis', M.payeeBasis));
    if (isBlank(d.default_wht_rate) || !S.wht_rates.includes(Number(d.default_wht_rate))) errs.push(issue('default_wht_rate', M.payDefaultRate));
    PAYEE_DOCS.forEach(k => { const v = (d.docs || {})[k]; if (!isBlank(v) && !isISODate(v)) errs.push(issue('doc_' + k, M.dateInvalid(C.payee.docs[k]))); });
    if (!isBlank(d.docs_link)) {
      if (looksSensitive(d.docs_link)) errs.push(issue('docs_link', M.sensitive));
      else if (!R.isHttpLink(d.docs_link)) errs.push(issue('docs_link', M.payeeLink));
    }
    return { errs, warns: [], infos: [] };
  }
  /* the encrypted part: holder, bank, account number (6–15 digits), full name · tax ID 13 digits when given */
  function validateBankDetails(d) {
    const errs = [];
    BANK_REQUIRED.forEach(k => { if (isBlank(d[k])) errs.push(issue('b_' + k, M.payeeRequired(C.payee.bank[k]))); });
    const acc = digitsOf(d.account_no);
    if (!isBlank(d.account_no) && (acc.length < 6 || acc.length > 15 || /[^\d\s-]/.test(d.account_no))) errs.push(issue('b_account_no', M.payeeAccountNo));
    if (!isBlank(d.tax_id) && digitsOf(d.tax_id).length !== 13) errs.push(issue('b_tax_id', M.payeeTaxId));
    return { errs, warns: [], infos: [] };
  }
  /* only the fields of the form, trimmed (what goes into the ciphertext) */
  const bankRecord = d => Object.fromEntries(BANK_FIELDS.map(k => [k, trim(d[k]) || null]));
  /* a payee with a line already paid: changed bank details must be verified with the KOL before the next submit (§4.4) */
  const payeeHasPaid = (state, payeeId) => (state.payment_lines || []).some(l => l.payee_id === payeeId && l.status === 'paid');
  /* Staff edit the payee of a KOL they are PIC of, or a payee they created · Admin / KOL Manager any */
  function canEditPayee(state, user, payee, kol) {
    if (!R.can(user, 'payee.edit')) return false;
    if (user.role === 'admin' || user.role === 'kol_manager' || user.role === 'accounting') return true;   // CR-09 §4.16: the accounts team keeps payee details up to date
    if (!payee && !kol) return true;   // a new payee outside KOL Master (Affiliate / Other) — it becomes theirs
    const k = kol || (payee && payee.kol_id ? R.kolById(state, payee.kol_id) : null), me = R.picName(user);
    return !!((k && me && k.pic === me) || (payee && payee.created_by && payee.created_by === user.user_id));
  }

  /* ===================== payee-details CSV (§4.4 Import) ===================== */
  const PAYEE_CSV_COLS = ['account_handle', 'payee_type', 'full_name', 'id_address', 'phone', 'wht_contact', 'bank_name', 'account_name', 'account_no', 'tax_id', 'docs_link'];
  const normHandle = h => trim(h).replace(/^@+/, '').toLowerCase();
  /* table (first row = header) → rows: match (a KOL by account handle) · new (no KOL, or an unlinked payee by handle) · error ·
     has_details = that payee already has bank details (Skip or Replace is chosen in the dialog) */
  function planPayeeImport(state, table) {
    const head = (table[0] || []).map(h => trim(h).toLowerCase());
    const missing = ['account_handle', 'account_no'].filter(c => !head.includes(c));
    if (missing.length) return { headerError: M.importHeader(missing.join(', ')), rows: [] };
    const byHandle = new Map(); (state.kol_accounts || []).forEach(a => { const k = normHandle(a.handle); if (k && !byHandle.has(k)) byHandle.set(k, a.kol_id); });
    const seen = new Set(), rows = [];
    table.slice(1).forEach((cells, i) => {
      if (!cells.some(c => trim(c))) return;
      const row = {}; head.forEach((h, j) => { row[h] = trim(cells[j]); });
      const n = i + 2, handle = normHandle(row.account_handle), errs = [];
      const kolId = byHandle.get(handle) || null, kol = kolId ? R.kolById(state, kolId) : null;
      const payee = kol ? payeeOfKol(state, kolId) : (state.payee_profiles || []).find(p => !p.kol_id && normHandle(p.account_handle) === handle) || null;
      if (!handle) errs.push(M.payeeImportNoHandle);
      else if (seen.has(handle)) errs.push(M.payeeImportDup);
      seen.add(handle);
      const type = isBlank(row.payee_type) ? 'individual' : row.payee_type.toLowerCase();
      if (!PAYEE_TYPES.includes(type)) errs.push(M.payeeType);
      validateBankDetails(row).errs.forEach(e => errs.push(e.msg));
      if (!isBlank(row.docs_link) && (looksSensitive(row.docs_link) || !R.isHttpLink(row.docs_link))) errs.push(M.payeeLink);
      rows.push({ n, handle: trim(row.account_handle).replace(/^@+/, ''), kol, payee, kind: errs.length ? 'error' : kol ? 'match' : 'new', has_details: !!(payee && payee.secure),
        payee_type: type, docs_link: row.docs_link || null, details: bankRecord(row), errs });
    });
    return { headerError: null, rows };
  }

  /* ===================== payment lines · To pay (§4.3, §4.5) ===================== */
  /* stored line status: open (requested, not in a run) · in_run · submitted · paid · cancelled — what the screen shows comes from lineStatus */
  const LINE_STATUSES = ['not_due', 'missing_docs', 'ready', 'in_run', 'submitted', 'paid', 'cancelled'];
  const dealOf = (state, id) => (id ? state.deals.find(d => d.deal_id === id) || null : null);
  const runOf = (state, id) => (id ? (state.payment_runs || []).find(r => r.run_id === id) || null : null);
  /* a line's payee: the one it names, else the payee of its KOL (bank details may be entered after the line was requested) */
  const payeeOfLine = (state, l) => (l.payee_id ? payeeById(state, l.payee_id) : null) || (l.kol_id ? payeeOfKol(state, l.kol_id) : null);
  /* post evidence: every post planned for the deal has a link and a post date */
  const postEvidence = (state, dealId) => { const ps = R.postsOf(state, dealId); return ps.length > 0 && ps.every(R.postDone); };
  /* what a line still needs (§4.4): the payee's documents and bank details · post evidence for the Final / Full instalment of a deal (not prepaid) · nothing when it reimburses staff */
  function docsRequired(state, line, payee) {
    if (line.pay_to === 'reimburse') return [];
    const miss = payeeDocsMissing(payee === undefined ? payeeOfLine(state, line) : payee), deal = dealOf(state, line.deal_id);
    if (deal && (line.milestone === 'final' || (line.milestone === 'full' && termOf(deal) !== 'prepaid')) && !postEvidence(state, deal.deal_id)) miss.push('post_evidence');
    return miss;
  }
  /* the status on screen: Paid · Cancelled · In run (a Draft run) · Submitted · else Not due (due date ahead) · Missing docs · Ready */
  function lineStatus(state, line, today) {
    if (line.status === 'paid') return 'paid';
    if (line.status === 'cancelled') return 'cancelled';
    const run = runOf(state, line.run_id);
    if (run) return run.status === 'draft' ? 'in_run' : 'submitted';
    if (line.due_date && line.due_date > today) return 'not_due';
    return docsRequired(state, line).length ? 'missing_docs' : 'ready';
  }
  /* the tax inputs of an instalment: the amount agreed · the payee's basis, type, VAT and default WHT (Individual 3% when there is no payee yet) */
  function taxOf(state, o, payee) {
    const S = paySettings(state.lookups);
    return calcPaymentTax({ agreed_amount: o.agreed_amount, price_basis: o.price_basis || (payee && payee.price_basis) || 'gross', payee_type: (payee && payee.payee_type) || 'individual',
      vat_registered: !!(payee && payee.vat_registered), wht_rate: !isBlank(o.wht_rate) ? o.wht_rate : payee && !isBlank(payee.default_wht_rate) ? payee.default_wht_rate : null }, S);
  }
  /* an expected date for an instalment not owed yet: Final / Full at Complete → the deal's expected post date (else the earliest expected post) · Confirm QT ones have none */
  function expectedDue(state, deal, milestone) {
    if (milestone === 'deposit' || (milestone === 'full' && termOf(deal) === 'prepaid')) return null;
    return deal.expected_post_date || R.postsOf(state, deal.deal_id).filter(p => !p.post_date).map(p => p.expected_post_date).filter(Boolean).sort()[0] || null;
  }
  const picOfLine = (state, l, deal) => (deal ? deal.pic || null : R.picName(R.userById(state, l.created_by)) || null);
  /* one row of To pay — a stored line, or an instalment worked out from the deal that nobody has requested yet (virtual) */
  function payItem(state, today, o) {
    const l = o.line, deal = o.deal || dealOf(state, l && l.deal_id), payee = l ? payeeOfLine(state, l) : deal ? payeeOfKol(state, deal.kol_id) : null;
    const base = l || { source: 'deal', deal_id: deal.deal_id, milestone: o.inst.milestone, kol_id: deal.kol_id, agreed_amount: o.inst.amount, due_date: o.inst.reached ? o.inst.due_date || null : expectedDue(state, deal, o.inst.milestone),
      price_basis: null, wht_rate: null, pay_to: 'payee', status: 'open' };
    const tax = l ? { gross: l.gross, vat: l.vat, wht: l.wht, net: l.net, wht_rate: l.wht_rate } : taxOf(state, base, payee);
    const status = l ? lineStatus(state, l, today) : !o.inst.reached ? 'not_due' : docsRequired(state, base, payee).length ? 'missing_docs' : 'ready';
    const kol = base.kol_id ? R.kolById(state, base.kol_id) : null;
    return { key: l ? l.line_id : `${deal.deal_id}:${base.milestone}`, line: l || null, virtual: !l, source: base.source, deal, deal_id: base.deal_id || null, milestone: base.milestone,
      kol, kol_id: base.kol_id || null, payee, account_handle: (payee && payee.account_handle) || (kol ? mainHandle(state, kol.kol_id) : (l && l.account_handle) || ''),
      campaign_id: deal ? deal.campaign_id : (l && l.campaign_id) || null, project_label: l && l.project_label ? l.project_label : deal ? R.campaignName(state, deal.campaign_id) : '',
      pic: picOfLine(state, base, deal), agreed: base.agreed_amount, price_basis: base.price_basis || (payee && payee.price_basis) || 'gross', tax, band: bandOf(tax.gross, paySettings(state.lookups)),
      due_date: base.due_date || null, status, missing: status === 'missing_docs' || status === 'not_due' || status === 'in_run' ? docsRequired(state, base, payee) : [],
      term_not_set: !!deal && !termOf(deal), overdue: !!deal && status !== 'paid' && R.paymentState(deal, today) === 'overdue', run_id: (l && l.run_id) || null,
      paid_date: (l && l.paid_date) || (o.inst && o.inst.paid_date) || null, pay_to: base.pay_to || 'payee', reimburse_user: (l && l.reimburse_user) || null };
  }
  /* §4.5 To pay — every instalment owed or coming (one per deal + milestone: a stored line wins over the worked-out one, a cancelled line too) + manual lines ·
     paid / cancelled ones are left out · checks = ฿0 deals that are owed something and payments made on cancelled deals */
  function payQueue(state, today) {
    const lines = state.payment_lines || [], taken = new Set(lines.filter(l => l.deal_id).map(l => `${l.deal_id}:${l.milestone}`));
    const items = [], checks = [];
    lines.forEach(l => { if (l.status !== 'paid' && l.status !== 'cancelled') items.push(payItem(state, today, { line: l })); });
    state.deals.forEach(d => {
      dueLines(state, d, today).forEach(inst => { if (!inst.paid && !taken.has(`${d.deal_id}:${inst.milestone}`)) items.push(payItem(state, today, { deal: d, inst })); });
      if (d.status !== 'Cancel' && termOf(d) !== 'free' && totalCost(d) <= 0 && !d.paid_full && zeroOwed(state, d)) checks.push({ kind: 'zero', deal: d });
    });
    lines.forEach(l => { const d = dealOf(state, l.deal_id); if (l.status === 'paid' && d && d.status === 'Cancel') checks.push({ kind: 'paid_cancelled', deal: d, line: l }); });
    return { items, checks };
  }
  /* a ฿0 deal is a "Needs check" once its first instalment would be owed (Confirm QT for prepaid / 50-50, Complete otherwise) */
  function zeroOwed(state, d) {
    const t = termOf(d), L = state.lookups, qt = R.stepOf(L, 'Confirm QT'), cur = R.stepOf(L, d.sub_status);
    if (d.status === 'Complete') return true;
    return (t === 'prepaid' || t === 'split_50') && !!cur && !!qt && !R.isCancelStep(cur) && cur.sort_order >= qt.sort_order;
  }
  /* the queue cards: Ready · Missing docs · Upcoming 14 days (not owed yet, expected today … today + 14) · Needs check */
  function payCards(items, checks, today) {
    const end = R.addDays(today, 14), sum = list => ({ n: list.length, gross: round2(list.reduce((a, x) => a + x.tax.gross, 0)) });
    return { ready: sum(items.filter(x => x.status === 'ready')), missing: sum(items.filter(x => x.status === 'missing_docs')),
      upcoming: sum(items.filter(x => x.status === 'not_due' && x.due_date && x.due_date >= today && x.due_date <= end)), check: { n: checks.length } };
  }
  /* who may ask for a payment: Admin / KOL Manager any deal · Staff the deals they are PIC of */
  function canRequest(state, user, deal) {
    if (!R.can(user, 'payment.request')) return false;
    if (user.role === 'admin' || user.role === 'kol_manager') return true;
    const me = R.picName(user); return !!(deal && me && deal.pic === me);
  }
  /* Request payment: a virtual instalment becomes a stored line (open) with the amount, basis and WHT confirmed · o: {lineId, agreed_amount, price_basis, wht_rate, pay_to, reimburse_user, note, user, now} */
  function newLine(state, item, o) {
    const payee = item.payee, tax = taxOf(state, { agreed_amount: o.agreed_amount, price_basis: o.price_basis, wht_rate: o.wht_rate }, payee), miss = docsRequired(state, Object.assign({}, item, { pay_to: o.pay_to }), payee);
    return { line_id: o.lineId, source: item.source || 'deal', deal_id: item.deal_id, payee_id: payee ? payee.payee_id : null, payee_version_at_submit: null, milestone: item.milestone,
      kol_id: item.kol_id, account_handle: item.account_handle, campaign_id: item.campaign_id, project_label: item.project_label, payee_type: payee ? payee.payee_type : 'individual',
      pay_to: o.pay_to === 'reimburse' ? 'reimburse' : 'payee', reimburse_user: o.pay_to === 'reimburse' ? o.reimburse_user || null : null, price_basis: o.price_basis || 'gross',
      agreed_amount: round2(o.agreed_amount), gross: tax.gross, vat: tax.vat, wht_rate: tax.wht_rate, wht: tax.wht, net: tax.net, due_date: item.due_date || null,
      docs_check: Object.fromEntries(['id_copy', 'bank_book', 'company_cert', 'vat_cert', 'post_evidence'].map(k => [k, !miss.includes(k)])),
      status: 'open', run_id: null, printed: false, paid_date: null, wht_cert_sent_date: null, cancel_reason: null, note: trim(o.note) || null, created_by: o.user || null, created_at: o.now || null };
  }
  function validateRequest(state, o) {
    const errs = [];
    if (isBlank(o.agreed_amount) || isNaN(o.agreed_amount) || Number(o.agreed_amount) <= 0) errs.push(issue('agreed_amount', M.payAmountPositive));
    if (!PRICE_BASES.includes(o.price_basis)) errs.push(issue('price_basis', M.payeeBasis));
    if (!paySettings(state.lookups).wht_rates.includes(Number(o.wht_rate))) errs.push(issue('wht_rate', M.payDefaultRate));
    if (o.pay_to === 'reimburse' && !o.reimburse_user) errs.push(issue('reimburse_user', M.payReimburseUser));
    if (looksSensitive(o.note)) errs.push(issue('note', M.sensitive));
    return { errs, warns: [], infos: [] };
  }
  /* every instalment of one deal for the Deal drawer (paid ones too): stored lines first, then the worked-out ones */
  function dealPayItems(state, deal, today) {
    const lines = (state.payment_lines || []).filter(l => l.deal_id === deal.deal_id), taken = new Set(lines.map(l => l.milestone));
    return lines.map(l => payItem(state, today, { line: l })).concat(dueLines(state, deal, today).filter(i => !taken.has(i.milestone)).map(inst => Object.assign(payItem(state, today, { deal, inst }), inst.paid ? { status: 'paid' } : {})));
  }

  /* ===================== payment runs (§4.6) ===================== */
  const RUN_STATUSES = ['draft', 'submitted', 'paid', 'closed'];
  /* the next run day after today (Friday by default): Tuesday 06/10/2026 → Friday 09/10/2026 */
  function nextRunDate(today, weekday) {
    const d = new Date(today + 'T00:00:00Z'), w = weekday == null ? 5 : weekday;
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== w);
    return d.toISOString().slice(0, 10);
  }
  /* PR-2026-10-09 · a second run that day PR-2026-10-09-2 … */
  function runIdFor(state, payDate) {
    const base = 'PR-' + payDate, ids = new Set((state.payment_runs || []).map(r => r.run_id));
    if (!ids.has(base)) return base;
    let n = 2; while (ids.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }
  const newRun = (state, o) => ({ run_id: runIdFor(state, o.pay_date), pay_date: o.pay_date, prepared_by: o.preparedBy || o.user || null, status: 'draft', submitted_at: null, note: null, created_at: o.now || null });
  /* CR-09 §3 — what a run is called on screen: Draft · Returned (a draft Accounting sent back) · With Accounting (submitted) · Paid · Closed */
  const runStatusKey = run => (run.status === 'draft' ? (run.returned_at ? 'returned' : 'draft') : run.status === 'submitted' ? 'with_accounting' : run.status);
  const runStatusLabel = run => C.pay.runStatus[runStatusKey(run)] || run.status;
  /* Return to team (Accounting, a reason): the run is a Draft again, marked Returned · its submitted lines go back into the draft run */
  function returnRun(state, run, reason, ctx) {
    const events = [];
    runLines(state, run.run_id).filter(l => l.status === 'submitted').forEach(l => { events.push(payEvent(l, 'submitted', 'in_run', ctx, trim(reason))); l.status = 'in_run'; });
    Object.assign(run, { status: 'draft', returned_reason: trim(reason), returned_at: ctx.now, returned_by: ctx.user || null });
    return events;
  }
  const runLines = (state, runId) => (state.payment_lines || []).filter(l => l.run_id === runId);
  /* Gross · VAT · WHT · Net of lines (cancelled ones left out) · WHT borne by company = what net-basis lines were grossed up by */
  function runTotals(lines) {
    const live = lines.filter(l => l.status !== 'cancelled'), sum = k => round2(live.reduce((a, l) => a + (l[k] || 0), 0));
    return { n: live.length, gross: sum('gross'), vat: sum('vat'), wht: sum('wht'), net: sum('net'),
      borne: round2(live.filter(l => l.price_basis === 'net').reduce((a, l) => a + (l.gross - l.agreed_amount), 0)) };
  }
  const lineName = (state, l) => ((l.kol_id && R.kolById(state, l.kol_id)) || {}).display_name || l.account_handle || l.line_id;
  const docLabel = k => (k === 'bank_details' ? C.payee.missingBank : k === 'post_evidence' ? C.pay.postEvidence : C.payee.docs[k]);
  /* §4.6 Checks — ✕ cannot submit: documents / bank details missing · bank details changed and not verified · gross 0 · the same instalment in another run or paid · reimburse without the person ·
     ! amount differs from the deal · term not set · 10,000 and above · bank details changed after submit (re-export) · a line cancelled with its deal · i net basis (WHT borne) · reimburse */
  function runChecks(state, run, today) {
    const errs = [], warns = [], infos = [], S = paySettings(state.lookups), all = state.payment_lines || [];
    runLines(state, run.run_id).forEach(l => {
      const who = lineName(state, l), at = msg => ({ field: 'line_' + l.line_id, line_id: l.line_id, msg });
      if (l.status === 'cancelled') { warns.push(at(M.runCancelled(who, l.cancel_reason || ''))); return; }
      const p = payeeOfLine(state, l), deal = dealOf(state, l.deal_id), miss = docsRequired(state, l, p);
      if (miss.length) errs.push(at(M.runMissing(who, miss.map(docLabel).join(' · '))));
      if (p && p.needs_verification) errs.push(Object.assign(at(M.runVerify(who)), { payee_id: p.payee_id, verify: true }));
      if (!(l.gross > 0)) errs.push(at(M.runGross(who)));
      if (l.deal_id) {
        const dup = all.find(x => x !== l && x.deal_id === l.deal_id && x.milestone === l.milestone && x.status !== 'cancelled' && (x.status === 'paid' || (x.run_id && x.run_id !== l.run_id)));
        if (dup) errs.push(at(M.runDup(who, dup.status === 'paid' ? C.pay.status.paid : dup.run_id)));
      }
      if (l.pay_to === 'reimburse' && !l.reimburse_user) errs.push(at(M.payReimburseUser));
      if (deal) {
        const inst = dueLines(state, deal, today).find(i => i.milestone === l.milestone);
        if (inst && round2(inst.amount) !== round2(l.agreed_amount)) warns.push(at(M.runAmount(who, round2(l.agreed_amount).toFixed(2), round2(inst.amount).toFixed(2))));
        if (!termOf(deal)) warns.push(Object.assign(at(M.runTerm(who)), { kind: 'term', who }));
        if (deal.status === 'Cancel') warns.push(at(M.runDealCancelled(who)));
      }
      if (l.gross >= S.bands[1]) warns.push(Object.assign(at(M.runBig(who)), { kind: 'big', who }));
      if (run.status !== 'draft' && p && l.payee_version_at_submit != null && (p.details_version || 0) !== l.payee_version_at_submit) warns.push(at(M.runChangedAfter(who)));
      if (l.price_basis === 'net' && l.gross > l.agreed_amount) infos.push(at(M.runBorne(who, round2(l.gross - l.agreed_amount).toFixed(2))));
      if (l.pay_to === 'reimburse' && l.reimburse_user) infos.push(at(M.runReimburse(who, R.changedByName(state, l.reimburse_user))));
    });
    return { errs, warns, infos };
  }
  /* deal_events type 'payment': each change of a line's status (§3) */
  const payEvent = (l, from, to, ctx, note) => ({ event_id: ctx.eventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payment', from, to, changed_at: ctx.now, changed_by: ctx.user || null, note: note || null });
  /* items (To pay rows) → lines of the run: a worked-out instalment is stored first · a line already in another run is copied (the Checks then say it is twice) ·
     ctx {lineId(), eventId(), now, user} → events */
  function addToRun(state, run, items, ctx) {
    const events = [];
    items.forEach(x => {
      let l = x.line;
      if (!l || (l.run_id && l.run_id !== run.run_id) || l.status === 'paid' || l.status === 'cancelled') {
        l = newLine(state, x, { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, pay_to: x.pay_to, reimburse_user: x.reimburse_user, user: ctx.user, now: ctx.now });
        if (x.line) Object.assign(l, { source: x.line.source, note: x.line.note, project_label: x.line.project_label, campaign_id: x.line.campaign_id, payee_id: x.line.payee_id, kol_id: x.line.kol_id, account_handle: x.line.account_handle });
        state.payment_lines.push(l); events.push(payEvent(l, null, 'open', ctx));
      }
      if (l.run_id === run.run_id) return;
      events.push(payEvent(l, l.status, 'in_run', ctx, run.run_id));
      Object.assign(l, { run_id: run.run_id, status: run.status === 'draft' ? 'in_run' : 'submitted' });
    });
    return events;
  }
  function removeFromRun(state, l, ctx, note) { const ev = payEvent(l, l.status, 'open', ctx, note); Object.assign(l, { run_id: null, status: 'open' }); return [ev]; }
  /* Submit: every line Submitted with the payee's details version · a deal whose lines here have every document → docs_done (today) */
  function submitRun(state, run, today, ctx) {
    if (runChecks(state, run, today).errs.length) return null;
    const events = [];
    Object.assign(run, { status: 'submitted', returned_reason: null, returned_at: null, returned_by: null, submitted_at: ctx.now });
    runLines(state, run.run_id).filter(l => l.status !== 'cancelled').forEach(l => {
      const p = payeeOfLine(state, l);
      events.push(payEvent(l, l.status, 'submitted', ctx, run.run_id));
      Object.assign(l, { status: 'submitted', payee_id: p ? p.payee_id : l.payee_id, payee_version_at_submit: p ? p.details_version || 0 : null });
      const deal = dealOf(state, l.deal_id);
      if (deal && !deal.docs_done && !docsRequired(state, l, p).length) Object.assign(deal, { docs_done: true, docs_done_date: deal.docs_done_date || today });
    });
    return events;
  }
  /* §4.6 the deal's flags follow its paid lines: Deposit → paid_50 · Final / Full → paid_full (50/50: paid_50 too) · undoing Paid takes them back ·
     an instalment with no line (paid before Payments) keeps its flag */
  function syncDealPayment(deal, lines) {
    const mine = lines.filter(l => l.deal_id === deal.deal_id && l.status !== 'cancelled');
    const latest = ms => mine.filter(l => l.status === 'paid' && ms.includes(l.milestone)).sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date)))[0] || null;
    const has = ms => mine.some(l => ms.includes(l.milestone));
    const dep = latest(['deposit']), fin = latest(['final', 'full']), out = {};
    if (fin) Object.assign(out, { paid_full: true, paid_full_date: fin.paid_date });
    else if (has(['final', 'full'])) Object.assign(out, { paid_full: false, paid_full_date: null });
    if (dep) Object.assign(out, { paid_50: true, paid_50_date: dep.paid_date });
    else if (fin && termOf(deal) === 'split_50') Object.assign(out, { paid_50: true, paid_50_date: deal.paid_50_date || fin.paid_date });
    else if (has(['deposit'])) Object.assign(out, { paid_50: false, paid_50_date: null });
    return Object.assign({}, deal, out);
  }
  function syncDeals(state, dealIds) {
    [...new Set(dealIds.filter(Boolean))].forEach(id => { const i = state.deals.findIndex(d => d.deal_id === id); if (i >= 0) state.deals[i] = syncDealPayment(state.deals[i], state.payment_lines || []); });
  }
  /* Mark paid (all lines or the ones given) on a date → the deals follow · a run with every line paid becomes Paid */
  function markPaid(state, run, lineIds, date, ctx) {
    const events = [], live = runLines(state, run.run_id).filter(l => l.status !== 'cancelled'), pick = lineIds ? live.filter(l => lineIds.includes(l.line_id)) : live;
    pick.filter(l => l.status !== 'paid').forEach(l => { events.push(payEvent(l, l.status, 'paid', ctx, date)); Object.assign(l, { status: 'paid', paid_date: date }); });
    syncDeals(state, pick.map(l => l.deal_id));
    if (live.length && live.every(l => l.status === 'paid')) run.status = 'paid';
    return events;
  }
  /* Admin: undo Paid (with a reason) → the line is Submitted again, the deal's flags go back */
  function undoPaid(state, l, reason, ctx) {
    const run = runOf(state, l.run_id), ev = payEvent(l, 'paid', run ? 'submitted' : 'open', ctx, reason);
    Object.assign(l, { status: run ? 'submitted' : 'open', paid_date: null });
    if (run && run.status !== 'submitted') run.status = 'submitted';
    syncDeals(state, [l.deal_id]);
    return [ev];
  }
  function reopenRun(state, run, ctx) {
    const events = [];
    run.status = 'draft';
    runLines(state, run.run_id).filter(l => l.status === 'submitted').forEach(l => { events.push(payEvent(l, 'submitted', 'in_run', ctx, 'reopen')); l.status = 'in_run'; });
    return events;
  }
  /* edit the amount of a line in a Draft run (a reason is kept in the note) */
  function editLineAmount(state, l, agreed, reason) {
    const p = payeeOfLine(state, l), t = taxOf(state, { agreed_amount: agreed, price_basis: l.price_basis, wht_rate: l.wht_rate }, p);
    Object.assign(l, { agreed_amount: round2(agreed), gross: t.gross, vat: t.vat, wht: t.wht, net: t.net, note: [l.note, trim(reason)].filter(Boolean).join(' · ') || null });
  }

  /* ===================== R4: history · WHT certificates · manual lines · outside the app · cancel (§4.8) ===================== */
  /* History: lines paid (newest first) */
  const paidLines = state => (state.payment_lines || []).filter(l => l.status === 'paid').sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date)) || b.line_id.localeCompare(a.line_id));
  /* the WHT certificates (50 ทวิ) still to send: paid lines with WHT and no date sent */
  const whtNotSent = lines => lines.filter(l => l.status === 'paid' && l.wht > 0 && !l.wht_cert_sent_date);
  function markWhtSent(lines, date) { lines.forEach(l => { if (l.wht > 0) l.wht_cert_sent_date = date; }); }
  /* WHT summary for Accounting (ภ.ง.ด.) — month · payee type · payee ID · account · gross · rate · WHT — no names, addresses or account numbers */
  function whtSummary(state, lines) {
    const by = new Map();
    lines.filter(l => l.status === 'paid' && l.wht > 0).forEach(l => {
      const p = payeeOfLine(state, l), month = String(l.paid_date || '').slice(0, 7), key = [month, (p && p.payee_id) || l.account_handle, l.wht_rate].join('|');
      const r = by.get(key) || { month, payee_type: (p && p.payee_type) || l.payee_type, payee_id: (p && p.payee_id) || '', account_handle: l.account_handle || (p && p.account_handle) || '', gross: 0, wht_rate: l.wht_rate, wht: 0 };
      r.gross = round2(r.gross + l.gross); r.wht = round2(r.wht + l.wht); by.set(key, r);
    });
    return [...by.values()].sort((a, b) => a.month.localeCompare(b.month) || String(a.account_handle).localeCompare(String(b.account_handle)));
  }
  const WHT_SUMMARY_COLS = ['month', 'payee_type', 'payee_id', 'account_handle', 'gross', 'wht_rate', 'wht'];
  /* a manual line (Affiliate / Other): the payee gives the account, bank details, documents and default WHT · it is not a deal (Committed is not touched) ·
     o: {source, payee_id, campaign_id, project_label, agreed_amount, price_basis, wht_rate, due_date, pay_to, reimburse_user, note, lineId, user, now} */
  function validateManual(state, o) {
    const res = validateRequest(state, o);
    if (!['affiliate', 'other'].includes(o.source)) res.errs.push(issue('source', M.payManualSource));
    if (!o.payee_id || !payeeById(state, o.payee_id)) res.errs.push(issue('payee_id', M.payManualPayee));
    if (!o.campaign_id && !trim(o.project_label)) res.errs.push(issue('project_label', M.payManualProject));
    if (looksSensitive(o.project_label)) res.errs.push(issue('project_label', M.sensitive));
    if (!isISODate(o.due_date)) res.errs.push(issue('due_date', M.payManualDue));
    return res;
  }
  function newManualLine(state, o) {
    const p = payeeById(state, o.payee_id), kol = p && p.kol_id ? R.kolById(state, p.kol_id) : null;
    const item = { source: o.source, deal_id: null, milestone: 'manual', kol_id: p ? p.kol_id : null, account_handle: p ? p.account_handle : '', payee: p, campaign_id: o.campaign_id || null,
      project_label: o.campaign_id ? R.campaignName(state, o.campaign_id) : trim(o.project_label), due_date: o.due_date };
    const l = newLine(state, item, o);
    return Object.assign(l, { source: o.source, payee_id: p ? p.payee_id : null, kol_id: kol ? kol.kol_id : null });
  }
  /* Mark paid outside the app (clearing old work already paid): a line per instalment, source legacy, no run · the deals follow */
  function markPaidOutside(state, items, date, note, ctx) {
    const events = [];
    items.forEach(x => {
      let l = x.line;
      if (!l) { l = newLine(state, x, { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, user: ctx.user, now: ctx.now }); state.payment_lines.push(l); }
      events.push(payEvent(l, l.status, 'paid', ctx, note));
      Object.assign(l, { source: x.line ? l.source : 'legacy', status: 'paid', paid_date: date, note: [l.note, trim(note)].filter(Boolean).join(' · ') || null });
    });
    syncDeals(state, items.map(x => x.deal_id));
    return events;
  }
  /* Cancel line (a reason): a worked-out instalment gets a cancelled line, so it does not come back */
  function cancelLines(state, items, reason, ctx) {
    const events = [];
    items.forEach(x => {
      let l = x.line;
      if (!l) { l = newLine(state, x, { lineId: ctx.lineId(), agreed_amount: x.agreed, price_basis: x.price_basis, wht_rate: x.tax.wht_rate, user: ctx.user, now: ctx.now }); state.payment_lines.push(l); }
      if (l.status === 'paid') return;
      events.push(payEvent(l, l.status, 'cancelled', ctx, reason));
      Object.assign(l, { status: 'cancelled', cancel_reason: trim(reason) });
    });
    return events;
  }
  /* §4.3 a deal cancelled after its lines were made: the lines not paid become Cancelled ("Deal cancelled") · paid ones stay (Needs check) */
  function cancelDealLines(state, ctx) {
    const events = [];
    (state.payment_lines || []).forEach(l => {
      const d = dealOf(state, l.deal_id);
      if (d && d.status === 'Cancel' && l.status !== 'paid' && l.status !== 'cancelled') { events.push(payEvent(l, l.status, 'cancelled', ctx, C.pay.dealCancelled)); Object.assign(l, { status: 'cancelled', cancel_reason: C.pay.dealCancelled }); }
    });
    return events;
  }

  /* ===================== Export PR (§4.7) ===================== */
  /* a file name without personal data: PR_09_10_26.xlsx */
  /* CR-09 §4.15.1 — PR_09_10_26_PR-2026-10-09.xlsx (the pay date, then the run) */
  const prFileName = (payDate, runId) => `PR_${payDate.slice(8, 10)}_${payDate.slice(5, 7)}_${payDate.slice(2, 4)}${runId ? '_' + runId : ''}.xlsx`;
  const PR_TYPE = { deal: 'KOL', legacy: 'KOL', affiliate: 'AFF', other: 'Other' };
  /* run → the sheets of the PR (one per band that has lines + Summary) · details: Map payee_id → decrypted bank details (only while unlocked), or null */
  function prSheets(state, run, details) {
    const P = C.pay, S = paySettings(state.lookups), ddmmyy = `${run.pay_date.slice(8, 10)}${run.pay_date.slice(5, 7)}${run.pay_date.slice(2, 4)}`;
    const lines = runLines(state, run.run_id).filter(l => l.status !== 'cancelled'), sheets = [], bandRows = [], runLine = P.prRunLine(run.run_id, R.dmy(run.pay_date));
    [0, 1, 2].forEach(b => {
      const list = lines.filter(l => bandOf(l.gross, S) === b); if (!list.length) return;
      const rows = [[{ v: runLine, bold: true }], P.prCols.map(h => ({ v: h, bold: true }))];
      list.forEach((l, i) => {
        const p = payeeOfLine(state, l), rec = details && p ? details.get(p.payee_id) || null : null, deal = dealOf(state, l.deal_id);
        const posts = deal ? R.postsOf(state, deal.deal_id).map(x => x.post_link).filter(Boolean) : [];
        const link = [p && p.docs_link, ...posts, l.note, l.pay_to === 'reimburse' && l.reimburse_user ? P.prReimburse(R.changedByName(state, l.reimburse_user)) : null].filter(Boolean).join('\n');
        const pic = picOfLine(state, l, deal);
        rows.push([i + 1, l.project_label || (deal ? R.campaignName(state, deal.campaign_id) : ''), l.account_handle || '', PR_TYPE[l.source] || 'Other',
          rec ? rec.full_name || '' : '', rec ? rec.id_address || '' : '', rec ? rec.phone || '' : '', rec ? rec.wht_contact || '' : '', { v: false, t: 'b' },
          rec ? rec.bank_name || '' : '', rec ? rec.account_no || '' : '', { v: l.gross, money: true }, { v: l.vat, money: true }, { v: l.wht, money: true }, `${l.wht_rate}%`,
          { v: l.net, money: true }, link, pic || '', { v: !!l.printed, t: 'b' }, (p && p.payee_id) || '', l.line_id]);
      });
      const last = rows.length;   // the run line is row 1, the header row 2, lines 3 … last
      const sum = col => ({ v: `SUM(${col}3:${col}${last})`, t: 'f', bold: true, money: true });
      const total = new Array(P.prCols.length).fill(''); total[1] = { v: P.prTotal, bold: true }; total[11] = sum('L'); total[12] = sum('M'); total[13] = sum('N'); total[15] = sum('P');
      rows.push(total);
      sheets.push({ name: `${P.prSheet[b]} ${ddmmyy}`, rows, freeze: 2, widths: [6, 22, 20, 7, 24, 34, 14, 26, 10, 18, 18, 14, 12, 12, 9, 16, 40, 10, 10, 11, 12] });
      const t = runTotals(list); bandRows.push([amountLabels(S)[b], t.n, { v: t.gross, money: true }, { v: t.vat, money: true }, { v: t.wht, money: true }, { v: t.net, money: true }]);
    });
    const t = runTotals(lines);
    const summary = [[{ v: runLine, bold: true }], [{ v: P.prSummary.title, bold: true }], [P.prSummary.run, run.run_id], [P.prSummary.payDate, R.dmy(run.pay_date)], [P.prSummary.preparedBy, R.changedByName(state, run.prepared_by)], [],
      P.prSummary.head.map(h => ({ v: h, bold: true }))].concat(bandRows, [[{ v: P.prTotal, bold: true }, t.n, { v: t.gross, money: true, bold: true }, { v: t.vat, money: true, bold: true }, { v: t.wht, money: true, bold: true }, { v: t.net, money: true, bold: true }],
      [P.prSummary.borne, '', { v: t.borne, money: true }]], details ? [] : [[], [{ v: P.prSummary.noPayee, bold: true }]]);
    sheets.push({ name: 'Summary', rows: summary, widths: [26, 22, 16, 14, 14, 18] });
    return sheets;
  }
  /* Reset vault (§4.4): every encrypted record goes (bank name, last 4 digits and documents stay) — they all need bank details again ·
     CR-10 §4.14: the encrypted shipping details too (No address again) */
  function resetVault(state) {
    let n = 0;
    (state.payee_profiles || []).forEach(p => { if (p.secure) { p.secure = null; n++; } p.needs_verification = false; if (p.secure_ship || p.shipping_on_file) { p.secure_ship = null; p.shipping_on_file = false; } });
    state.lookups.payee_vault = null;
    return n;
  }

  /* ===================== guard on free text (§4.4) ===================== */
  /* Import / Restore: an account or ID number in a field that is not Bank details is dropped → how many were dropped */
  const SCRUB = { kol_master: ['note', 'status_reason'], deals: ['remark', 'cancel_reason'], kol_rate_quotes: ['note', 'source'], deal_status_log: ['note'], deal_events: ['note'],
    campaigns: ['note'], payee_profiles: ['docs_link'], payment_lines: ['note', 'project_label', 'cancel_reason'], payment_runs: ['note'] };
  function scrubSensitive(state) {
    let n = 0;
    Object.entries(SCRUB).forEach(([coll, fields]) => (state[coll] || []).forEach(r => fields.forEach(f => { if (looksSensitive(r[f])) { r[f] = null; n++; } })));
    return n;
  }

  return { PAYMENT_SETTINGS_DEFAULT, paymentSettingsDefault, paySettings, validatePaymentSettings, round2, calcPaymentTax, bandOf, reachedDates, dueLines,
    PAYEE_TYPES, PRICE_BASES, PAYEE_DOCS, BANK_FIELDS, payeeOfKol, payeeById, mainHandle, blankPayee, payeeDocsMissing, last4, validatePayee, validateBankDetails, bankRecord,
    payeeHasPaid, canEditPayee, PAYEE_CSV_COLS, normHandle, planPayeeImport, scrubSensitive,
    LINE_STATUSES, payeeOfLine, postEvidence, docsRequired, lineStatus, taxOf, expectedDue, payItem, payQueue, payCards, canRequest, newLine, validateRequest, dealPayItems,
    RUN_STATUSES, nextRunDate, runIdFor, newRun, runLines, runTotals, runChecks, addToRun, removeFromRun, submitRun, syncDealPayment, syncDeals, markPaid, undoPaid, reopenRun, editLineAmount,
    amountLabels, runStatusKey, runStatusLabel, returnRun, prFileName, prSheets, resetVault, paidLines, whtNotSent, markWhtSent, whtSummary, WHT_SUMMARY_COLS, validateManual, newManualLine, markPaidOutside, cancelLines, cancelDealLines };
})(KT.rules, KT.content));
