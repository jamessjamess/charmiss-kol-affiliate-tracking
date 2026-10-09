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
  const PAYMENT_SETTINGS_DEFAULT = { vat_rate: 7, wht_threshold: 1000, wht_rates: [0, 1, 2, 3, 5], default_wht_individual: 3, default_wht_company: 3, bands: [1000, 3000], run_weekday: 5 };   // CR-32 §2.5: the PR's bands
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
      default_wht_individual: n(d.default_wht_individual), default_wht_company: n(d.default_wht_company), bands: b, run_weekday: n(d.run_weekday), bands_cr32: true };
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
  /* CR-09 §4.14 — the amount range words (from the settings' limits) · CR-32 §2.5: Under ฿1,000 · ฿1,000 – ฿3,000 · Over ฿3,000 (as the PR sheets) */
  const amountLabels = settings => { const b = (settings || PAYMENT_SETTINGS_DEFAULT).bands, f = n => '฿' + R.fmtNum(n);
    return [C.pay.amountUnder(f(b[0])), `${f(b[0])} – ${f(b[1])}`, C.pay.amountOver(f(b[1]))]; };
  /* the band of an amount: 0 = under 1,000 · 1 = 1,000–3,000 (both ends in) · 2 = over 3,000 */
  const bandOf = (gross, settings) => { const b = (settings || PAYMENT_SETTINGS_DEFAULT).bands; return gross < b[0] ? 0 : gross <= b[1] ? 1 : 2; };
  /* CR-32 §2.5 — once: the old default bands (1,000 · 10,000) kept in Settings become the PR's (1,000 · 3,000) · bands someone set stay */
  function migrateBandsV32(obj) {
    const ps = obj && obj.lookups && obj.lookups.payment_settings; if (!ps || ps.bands_cr32) return false;
    const old = Array.isArray(ps.bands) && Number(ps.bands[0]) === 1000 && Number(ps.bands[1]) === 10000;
    if (old) ps.bands = [1000, 3000];
    ps.bands_cr32 = true; return old;
  }
  /* "a big amount" (a warning in a run): ฿10,000 and above, whatever the bands are */
  const BIG_AMOUNT = 10000;

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
    const term = termOf(deal), total = term === 'package' ? R.extrasOf(deal) : totalCost(deal);
    if (term === 'free' || deal.status === 'Cancel' || total <= 0) return [];
    const L = state.lookups, qt = R.stepOf(L, 'Confirm QT'), cur = R.stepOf(L, deal.sub_status), complete = deal.status === 'Complete';
    const atQt = complete || (!!cur && !!qt && !R.isCancelStep(cur) && cur.sort_order >= qt.sort_order);
    const d = reachedDates(state, deal);
    const mk = (milestone, amount, reached, due, paid, paidDate) => ({ deal_id: deal.deal_id, milestone, amount: round2(amount), reached, due_date: reached ? due || null : null,
      paid, paid_date: paid ? paidDate || null : null, term_not_set: !term });
    if (term === 'prepaid') return [mk('full', total, atQt, d.qt, !!deal.paid_full, deal.paid_full_date)];
    if (term === 'package') return [mk('extras', total, atQt, d.qt, !!deal.paid_full, deal.paid_full_date)];   // CR-20 §4.11: the costs on top of the package, owed at Confirm QT
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
  const BANK_REQUIRED = ['account_name', 'bank_name', 'account_no', 'full_name', 'id_address'];   // CR-33 §3.1: + ID-card address (a company: Tax ID too)
  /* CR-16 §4.2 — a KOL may have more than one payee: this is its default (R.defaultPayee) */
  const payeeOfKol = (state, kolId) => R.defaultPayee(state, kolId);
  const payeeById = (state, id) => (state.payee_profiles || []).find(p => p.payee_id === id) || null;
  /* the handle a payee goes by: the KOL's account with the most followers */
  function mainHandle(state, kolId) {
    const accs = R.accountsOfKol(state, kolId).slice().sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0));
    return accs.length ? accs[0].handle : ((R.kolById(state, kolId) || {}).display_name || '');
  }
  function blankPayee(state, o) {
    const S = paySettings(state.lookups), type = PAYEE_TYPES.includes(o.payee_type) ? o.payee_type : 'individual';
    return { payee_id: o.payee_id, kol_id: o.kol_id || null, label: trim(o.label) || 'Primary', is_default: o.is_default !== false, archived: false,   // CR-16
      account_handle: o.kol_id ? mainHandle(state, o.kol_id) : trim(o.account_handle).replace(/^@+/, ''), payee_type: type, vat_registered: false,
      default_wht_rate: type === 'company' ? S.default_wht_company : S.default_wht_individual, price_basis: 'gross', bank_name: null, account_last4: null,
      docs: { id_copy: null, bank_book: null, company_cert: null, vat_cert: null }, docs_link: null, secure: null,
      details_version: 0, details_updated_at: null, details_updated_by: null, needs_verification: false, verified_at: null, verified_by: null,
      created_by: o.user || null, created_at: o.now || null, updated_at: o.now || null, updated_by: o.user || null };
  }
  /* CR-33 §3.2 — the payee's documents (used again by every round): Individual = ID copy · Bank book · Company = Company certificate · Bank book (+ VAT certificate when VAT registered) */
  const payeeDocKeys = p => (p && p.payee_type === 'company' ? ['company_cert', 'bank_book'].concat(p.vat_registered ? ['vat_cert'] : []) : ['id_copy', 'bank_book']);
  /* payee.docs = [{ key, kind: file | link, file_id, url, name, mime, bytes, received_at }] (an older { key: date } reads as "Received dd/mm · file not attached") */
  function payeeDocs(p) {
    const d = p && p.docs; if (!d) return [];
    if (Array.isArray(d)) return d.filter(x => x && x.key);
    return Object.entries(d).filter(([, v]) => v).map(([key, v]) => ({ key, kind: 'link', file_id: null, url: null, name: null, received_at: isISODate(v) ? v : null }));
  }
  const payeeDoc = (p, key) => payeeDocs(p).find(x => x.key === key) || null;
  /* a document is there when it has a file or an https link (a date alone = received, file not attached) */
  const docAttached = d => !!d && (!!d.file_id || /^https:\/\//i.test(d.url || d.link || ''));
  /* the documents a payee still needs (+ Bank details while nothing is encrypted) */
  function payeeDocsMissing(payee) {
    if (!payee) return ['id_copy', 'bank_book', 'bank_details'];   // no payee yet: what an Individual needs
    return payeeDocKeys(payee).filter(k => !docAttached(payeeDoc(payee, k))).concat(payee.secure ? [] : ['bank_details']);
  }
  /* CR-33 §3.1 — what a payee is missing of its required fields (Tax & terms · Bank details · Personal data) → [keys] · null = not known yet (an older payee: unlock once) */
  function payeeMissing(p) {
    if (!p) return null;
    const plain = ['payee_type', 'default_wht_rate', 'price_basis'].filter(k => isBlank(p[k]));
    const need = BANK_REQUIRED.concat(p.payee_type === 'company' ? ['tax_id'] : []);
    if (!p.secure) return plain.concat(need);
    if (!Array.isArray(p.details_filled)) return null;
    return plain.concat(need.filter(k => !p.details_filled.includes(k)));
  }
  /* CR-32 §2.5 — the banks: { name, short (KBank — on screen), pr (กสิกร — the PR file) } in lookups.banks · a name typed another way is matched by any of the three */
  const banksDefault = () => (C.payee.bankList || []).map(b => Object.assign({}, b));
  const bankNorm = v => String(v == null ? '' : v).toLowerCase().replace(/[\s.()]/g, '');
  function bankOf(L, name) {
    const v = bankNorm(name); if (!v) return null;
    const list = L && Array.isArray(L.banks) && L.banks.length ? L.banks : banksDefault();
    return list.find(b => [b.name, b.short, b.pr].some(x => bankNorm(x) === v)) || list.find(b => b.short && v.includes(bankNorm(b.short)) && bankNorm(b.short).length >= 3) || null;
  }
  const bankShort = (L, name) => { const b = bankOf(L, name); return b ? b.short : trim(name); };
  const bankPr = (L, name) => { const b = bankOf(L, name); return b ? b.pr || b.short : trim(name); };
  /* "KBank ••• 1234" (no more of the number) */
  const bankLine = (L, p) => C.payee.bankLine(bankShort(L, p && p.bank_name), p && p.account_last4);
  /* which encrypted fields are filled (kept on the payee in plain: only the names of the fields, never their values) */
  const filledFields = rec => (rec ? BANK_FIELDS.filter(k => !isBlank(rec[k]) && trim(String(rec[k])) !== '') : []);
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
  /* the encrypted part (CR-33 §3.1): holder · bank (from lookups.banks) · account number (digits / dashes, 10–15 digits) · full name · ID-card address ·
     a company: Tax ID (13 digits) · o: { type, L (the bank list), only [keys] (New KOL: the bank part only) } */
  function validateBankDetails(d, o = {}) {
    const errs = [], need = o.only || BANK_REQUIRED.concat(o.type === 'company' ? ['tax_id'] : []);
    const label = k => (o.type === 'company' && C.payee.bankCo && C.payee.bankCo[k]) || C.payee.bank[k];
    need.forEach(k => { if (isBlank(d[k])) errs.push(issue('b_' + k, M.payeeRequired(label(k)))); });
    if (!isBlank(d.bank_name) && o.L && !bankOf(o.L, d.bank_name)) errs.push(issue('b_bank_name', C.payee.bankFromList));
    const acc = digitsOf(d.account_no);
    if (!isBlank(d.account_no) && (acc.length < 10 || acc.length > 15 || /[^\d\s-]/.test(d.account_no))) errs.push(issue('b_account_no', M.payeeAccountNo));
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
  const PAYEE_CSV_COLS = ['account_handle', 'payee_type', 'full_name', 'id_address', 'phone', 'wht_contact', 'bank_name', 'account_name', 'account_no', 'tax_id', 'docs_link', 'payee_label'];   // CR-16: + payee_label (not required)
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
      validateBankDetails(row, { type, L: state.lookups }).errs.forEach(e => errs.push(e.msg));   // CR-33 §3.1
      if (!isBlank(row.docs_link) && (looksSensitive(row.docs_link) || !R.isHttpLink(row.docs_link))) errs.push(M.payeeLink);
      /* CR-16 §4.2 — payee_label: the label of a payee added to a KOL that has one already (Add as another payee) */
      const label = trim(row.payee_label) || null;
      if (label && (label.length > R.PAYEE_LABEL_MAX || looksSensitive(label))) errs.push(M.payeeImportLabel);
      rows.push({ n, handle: trim(row.account_handle).replace(/^@+/, ''), kol, payee, kind: errs.length ? 'error' : kol ? 'match' : 'new', has_details: !!(payee && payee.secure),
        payee_type: type, docs_link: row.docs_link || null, label, details: bankRecord(row), errs });
    });
    return { headerError: null, rows };
  }

  /* ===================== payment lines · To pay (§4.3, §4.5) ===================== */
  /* stored line status: open (requested, not in a run) · in_run · submitted · paid · cancelled — what the screen shows comes from lineStatus */
  const LINE_STATUSES = ['not_due', 'missing_docs', 'ready', 'on_hold', 'in_run', 'submitted', 'paid', 'cancelled'];   // on_hold: CR-11 §4.9
  const dealOf = (state, id) => (id ? state.deals.find(d => d.deal_id === id) || null : null);
  const runOf = (state, id) => (id ? (state.payment_runs || []).find(r => r.run_id === id) || null : null);
  /* a line's payee: the one it names, else the payee of its KOL (bank details may be entered after the line was requested) */
  /* CR-16: else the payee its deal picked, else the KOL's default */
  const payeeOfLine = (state, l) => (l.payee_id ? payeeById(state, l.payee_id) : null) || (l.deal_id && dealOf(state, l.deal_id) ? R.payeeOfDeal(state, dealOf(state, l.deal_id)) : null) || (l.kol_id ? payeeOfKol(state, l.kol_id) : null);
  /* post evidence: every post planned for the deal has a link and a post date */
  const postEvidence = (state, dealId) => { const ps = R.postsOf(state, dealId); return ps.length > 0 && ps.every(R.postDone); };
  /* CR-27 §3.2 — the documents kept on a payment line: [{ key, label (own ones), received_at, note, link, custom }] · a document ticked there counts as received */
  const lineDocs = l => (l && Array.isArray(l.docs) ? l.docs : []);
  /* a line kept only for the documents of a row nobody has sent / paid / held yet: its amounts are still worked out from the deal */
  const isDocsOnly = l => !!l && !!l.docs_only && l.status === 'open' && !l.run_id;
  /* what a line still needs (§4.4): its documents (CR-32 §2.3: ID copy · Bank book · Post proof, or All in one file — rules-ops docsChecklist) and the payee's
     bank details · nothing when it reimburses staff */
  function docsRequired(state, line, payee) {
    if (line.pay_to === 'reimburse') return [];
    const p = payee === undefined ? payeeOfLine(state, line) : payee;
    const miss = R.docsChecklist(state, { line, payee: p, deal_id: line.deal_id, milestone: line.milestone, pay_to: line.pay_to }).filter(d => !d.received && !d.custom).map(d => d.key);
    return miss.concat(p && p.secure ? [] : ['bank_details']);
  }
  /* the status on screen: Paid · Cancelled · In run (a Draft run) · Submitted · else Not due (due date ahead) · Missing docs · Ready */
  function lineStatus(state, line, today) {
    if (line.status === 'paid') return 'paid';
    if (line.status === 'cancelled') return 'cancelled';
    if (line.status === 'on_hold') return 'on_hold';   // CR-11 §4.9 — not paid until it is released
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
    if (milestone === 'deposit' || milestone === 'extras' || milestone === 'package' || (milestone === 'full' && termOf(deal) === 'prepaid')) return null;
    return deal.expected_post_date || R.postsOf(state, deal.deal_id).filter(p => !p.post_date).map(p => p.expected_post_date).filter(Boolean).sort()[0] || null;
  }
  const picOfLine = (state, l, deal) => (deal ? deal.pic || null : R.picName(R.userById(state, l.created_by)) || null);
  /* one row of To pay — a stored line, or an instalment worked out from the deal that nobody has requested yet (virtual) */
  function payItem(state, today, o) {
    const l = o.line, deal = o.deal || dealOf(state, l && l.deal_id), pkg = o.pkg ? R.packagePayBase(state, o.pkg) : null;
    /* CR-20 §4.8 — a package's row: its payee, else the KOL's default */
    const conf = !l && o.docsLine && o.docsLine.payee_id ? payeeById(state, o.docsLine.payee_id) : null;   // CR-33 §3.3: the payee confirmed on the row
    const payee = l ? payeeOfLine(state, l) : conf && !conf.archived ? conf : pkg ? (pkg.payee_id ? payeeById(state, pkg.payee_id) : null) || payeeOfKol(state, pkg.kol_id) : deal ? R.payeeOfDeal(state, deal) : null;   // CR-16: the deal's payee
    const base0 = l || pkg || { source: 'deal', deal_id: deal.deal_id, milestone: o.inst.milestone, kol_id: deal.kol_id, agreed_amount: o.inst.amount, due_date: o.inst.reached ? o.inst.due_date || null : expectedDue(state, deal, o.inst.milestone),
      price_basis: null, wht_rate: null, pay_to: 'payee', status: 'open' };
    const base = !l && o.docsLine ? Object.assign({}, base0, { docs: o.docsLine.docs, docs_one: o.docsLine.docs_one, docs_note: o.docsLine.docs_note, payee_id: o.docsLine.payee_id, payee_confirmed_at: o.docsLine.payee_confirmed_at }) : base0;   // CR-27 · CR-32 · CR-33
    const tax = l ? { gross: l.gross, vat: l.vat, wht: l.wht, net: l.net, wht_rate: l.wht_rate } : taxOf(state, base, payee);
    const status = l ? lineStatus(state, l, today) : !pkg && !o.inst.reached ? 'not_due' : docsRequired(state, base, payee).length ? 'missing_docs' : 'ready';
    const kol = base.kol_id ? R.kolById(state, base.kol_id) : null;
    return { key: l ? l.line_id : pkg ? `${pkg.package_id}:package` : `${deal.deal_id}:${base.milestone}`, line: l || null, virtual: !l, source: base.source, deal, deal_id: base.deal_id || null, milestone: base.milestone,
      package_id: base.package_id || null,
      kol, kol_id: base.kol_id || null, payee, account_handle: (payee && payee.account_handle) || (kol ? mainHandle(state, kol.kol_id) : (l && l.account_handle) || ''),
      campaign_id: deal ? deal.campaign_id : (l && l.campaign_id) || null, project_label: l && l.project_label ? l.project_label : deal ? R.campaignName(state, deal.campaign_id) : base.project_label || '',
      pic: picOfLine(state, base, deal), agreed: base.agreed_amount, price_basis: base.price_basis || (payee && payee.price_basis) || 'gross', tax, band: bandOf(tax.gross, paySettings(state.lookups)),
      due_date: base.due_date || null, status, missing: status === 'missing_docs' || status === 'not_due' || status === 'in_run' ? docsRequired(state, base, payee) : [],
      term_not_set: !!deal && !termOf(deal), overdue: !!deal && status !== 'paid' && R.paymentState(deal, today) === 'overdue', run_id: (l && l.run_id) || null,
      paid_date: (l && l.paid_date) || (o.inst && o.inst.paid_date) || null, pay_to: base.pay_to || 'payee', reimburse_user: (l && l.reimburse_user) || null,
      docsLine: !l ? o.docsLine || null : null };
  }
  /* §4.5 To pay — every instalment owed or coming (one per deal + milestone: a stored line wins over the worked-out one, a cancelled line too) + manual lines ·
     paid / cancelled ones are left out · checks = ฿0 deals that are owed something and payments made on cancelled deals */
  function payQueue(state, today) {
    /* CR-27: a docs-only line is not a row of its own — it rides on the worked-out row it keeps the documents of */
    const all = state.payment_lines || [], lines = all.filter(l => !isDocsOnly(l)), docsBy = new Map(all.filter(isDocsOnly).map(l => [l.package_id && !l.deal_id ? `${l.package_id}:package` : `${l.deal_id}:${l.milestone}`, l]));
    const taken = new Set(lines.filter(l => l.deal_id).map(l => `${l.deal_id}:${l.milestone}`));
    const items = [], checks = [];
    lines.forEach(l => { if (l.status !== 'paid' && l.status !== 'cancelled') items.push(payItem(state, today, { line: l })); });
    /* CR-20 §4.8 — a package is one row (its full price) until it is paid · archived ones without a line are left out */
    const pkgTaken = new Set(lines.filter(l => l.package_id).map(l => l.package_id));
    (state.kol_packages || []).forEach(p => { if (!p.archived && !pkgTaken.has(p.package_id) && Number(p.price_total) > 0) items.push(payItem(state, today, { pkg: p, docsLine: docsBy.get(`${p.package_id}:package`) })); });
    state.deals.forEach(d => {
      dueLines(state, d, today).forEach(inst => { if (!inst.paid && !taken.has(`${d.deal_id}:${inst.milestone}`)) items.push(payItem(state, today, { deal: d, inst, docsLine: docsBy.get(`${d.deal_id}:${inst.milestone}`) })); });
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
    return { ready: sum(items.filter(x => x.status === 'ready')), missing: sum(items.filter(x => x.status === 'missing_docs')), hold: sum(items.filter(x => x.status === 'on_hold')),
      upcoming: sum(items.filter(x => x.status === 'not_due' && x.due_date && x.due_date >= today && x.due_date <= end)), check: { n: checks.length } };
  }
  /* who may ask for a payment: Admin / KOL Manager any deal · Staff the deals they are PIC of */
  function canRequest(state, user, deal) {
    if (!R.can(user, 'payment.request')) return false;
    if (user.role === 'admin' || user.role === 'kol_manager') return true;
    const me = R.picName(user); return !!(deal && me && deal.pic === me);
  }
  /* a worked-out instalment becomes a stored line (open) — Add to run · Hold · Paid outside app (CR-11 §4.9: no Request step) with the amount, basis and WHT confirmed · o: {lineId, agreed_amount, price_basis, wht_rate, pay_to, reimburse_user, note, user, now} */
  function newLine(state, item, o) {
    const payee = item.payee, tax = taxOf(state, { agreed_amount: o.agreed_amount, price_basis: o.price_basis, wht_rate: o.wht_rate }, payee), miss = docsRequired(state, Object.assign({}, item, { pay_to: o.pay_to }), payee);
    return { line_id: o.lineId, source: item.source || 'deal', deal_id: item.deal_id, package_id: item.package_id || null, payee_id: payee ? payee.payee_id : null, payee_version_at_submit: null, milestone: item.milestone,
      kol_id: item.kol_id, account_handle: item.account_handle, campaign_id: item.campaign_id, project_label: item.project_label, payee_type: payee ? payee.payee_type : 'individual',
      pay_to: o.pay_to === 'reimburse' ? 'reimburse' : 'payee', reimburse_user: o.pay_to === 'reimburse' ? o.reimburse_user || null : null, price_basis: o.price_basis || 'gross',
      agreed_amount: round2(o.agreed_amount), gross: tax.gross, vat: tax.vat, wht_rate: tax.wht_rate, wht: tax.wht, net: tax.net, due_date: item.due_date || null,
      docs_check: Object.fromEntries(['id_copy', 'bank_book', 'company_cert', 'vat_cert', 'post_proof'].map(k => [k, !miss.includes(k)])),
      status: 'open', run_id: null, printed: false, paid_date: null, wht_cert_sent_date: null, cancel_reason: null, note: trim(o.note) || null, created_by: o.user || null, created_at: o.now || null,
      payee_confirmed_at: null, payee_confirmed_by: null, verified_at: null, verified_by: null, returned_reason: null, returned_at: null, returned_by: null, printed_at: null, printed_by: null, external_ref: null, voucher_status: null };   // CR-33
  }
  /* CR-27 — a row with a docs-only line becomes a full line (Send · Mark paid · Hold): today's amounts, its documents kept */
  function promoteDocsLine(state, item, o) {
    const l = item.docsLine; if (!isDocsOnly(l)) return null;
    const fresh = newLine(state, item, Object.assign({}, o, { lineId: l.line_id }));
    const keep = { payee_id: l.payee_confirmed_at ? l.payee_id : fresh.payee_id, payee_confirmed_at: l.payee_confirmed_at || null, payee_confirmed_by: l.payee_confirmed_by || null, returned_reason: l.returned_reason || null, returned_at: l.returned_at || null, returned_by: l.returned_by || null };
    Object.assign(l, fresh, keep, { docs: lineDocs(l), docs_one: l.docs_one || null, docs_note: l.docs_note != null ? l.docs_note : null, created_by: l.created_by, created_at: l.created_at }); delete l.docs_only;
    return l;
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
    const mine = (state.payment_lines || []).filter(l => l.deal_id === deal.deal_id), lines = mine.filter(l => !isDocsOnly(l)), taken = new Set(lines.map(l => l.milestone));
    const docsOf = m => mine.find(l => isDocsOnly(l) && l.milestone === m);   // CR-27
    return lines.map(l => payItem(state, today, { line: l })).concat(dueLines(state, deal, today).filter(i => !taken.has(i.milestone)).map(inst => Object.assign(payItem(state, today, { deal, inst, docsLine: docsOf(inst.milestone) }), inst.paid ? { status: 'paid' } : {})));
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
  const docLabel = k => (k === 'bank_details' ? C.payee.missingBank : k === 'post_evidence' || k === 'post_proof' ? C.pay.docs.postProof : C.payee.docs[k]);
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
      if (l.gross >= BIG_AMOUNT) warns.push(Object.assign(at(M.runBig(who)), { kind: 'big', who }));
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
      if (x.status === 'on_hold' || (x.line && x.line.status === 'on_hold')) return;   // CR-11 §4.9: held — not into a run
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
    const dep = latest(['deposit']), fin = latest(['final', 'full', 'extras']), out = {};
    if (fin) Object.assign(out, { paid_full: true, paid_full_date: fin.paid_date });
    else if (has(['final', 'full', 'extras'])) Object.assign(out, { paid_full: false, paid_full_date: null });
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
  /* CR-17 §4.4 — the same Mark paid as the Simple mode (rules-ops.js markItemsPaid), the lines it makes marked legacy */
  function markPaidOutside(state, items, date, note, ctx) {
    return R.markItemsPaid(state, items, { date, note, legacy: true }, ctx).events;
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
  /* CR-32 §2.5 — the sheet names of the PR: "ยอดน้อยกว่า 1,000 091026" · "ยอด 1,000-3,000 091026" · "ยอดมากกว่า 3,000 091026" (a sheet name cannot hold "/") */
  const prSheetNames = S => { const f = n => Number(n).toLocaleString('en-US'); return [C.pay.prSheetUnder(f(S.bands[0])), C.pay.prSheetMid(f(S.bands[0]), f(S.bands[1])), C.pay.prSheetOver(f(S.bands[1]))]; };
  /* the columns of a band's sheet: No · Project · ชื่อ Account · Type · ชื่อ-นามสกุล · ที่อยู่ตามบัตรประชาชน · ธนาคาร · เลขบัญชี · จำนวนเงิน · VAT 7% · WHT 3% ·
     จำนวนเงินที่ต้องชำระ · Link · PIC · Print · Email / ที่อยู่ส่งใบ WHT · Payee ID · Deal ID — under the first band there is no VAT / WHT (no tax under ฿1,000) */
  function prColumns(S, band) {
    const P = C.pay, cols = ['no', 'project', 'account', 'type', 'full_name', 'id_address', 'bank', 'account_no', 'gross', 'vat', 'wht', 'net', 'link', 'pic', 'print', 'wht_contact', 'payee_id', 'deal_id', 'round_id', 'line_id'];   // CR-33 §3.7: + Round ID · Line ID
    return cols.filter(k => band > 0 || (k !== 'vat' && k !== 'wht')).map(k => ({ key: k, head: k === 'vat' ? P.prVat(S.vat_rate) : k === 'wht' ? P.prWht(S.default_wht_individual) : P.prCol[k] }));
  }
  /* one PR row of a line (details = the payee's decrypted fields, in memory only) — numbers stay numbers */
  function prRow(state, l, i, details) {
    const P = C.pay, p = payeeOfLine(state, l), rec = details && p ? details.get(p.payee_id) || null : null, deal = dealOf(state, l.deal_id);
    const names = deal ? R.dealProjectNames(state, deal) : [], kol = l.kol_id ? R.kolById(state, l.kol_id) : null;
    const x = { line: l, payee: p, deal, deal_id: l.deal_id, milestone: l.milestone, pay_to: l.pay_to };
    const link = l.pay_to === 'reimburse' && l.reimburse_user ? P.prReimburse(R.changedByName(state, l.reimburse_user)) : R.docsLinks(state, x).join('\n');
    const printed = l.printed_at ? P.printedLine(R.dmy(String(l.printed_at).slice(0, 10)).slice(0, 5), R.changedByName(state, l.printed_by)) : '';   // CR-33 §3.8
    const type = l.source === 'affiliate' || (kol && R.partnerTypeOf(kol) === 'affiliate') ? 'AFF' : PR_TYPE[l.source] || 'Other';
    return { no: i + 1, project: names.length ? names.join(', ') : l.project_label || (deal ? R.campaignName(state, deal.campaign_id) : ''), account: l.account_handle || '', type,
      full_name: rec ? rec.full_name || '' : '', id_address: rec ? rec.id_address || '' : '', bank: rec ? bankPr(state.lookups, rec.bank_name) : p ? bankPr(state.lookups, p.bank_name) || '' : '',
      account_no: rec ? rec.account_no || '' : '', gross: { v: l.gross, money: true }, vat: { v: l.vat, money: true }, wht: { v: l.wht, money: true }, net: { v: l.net, money: true },
      link, pic: picOfLine(state, l, deal) || '', print: printed, wht_contact: rec ? rec.wht_contact || '' : '', payee_id: (p && p.payee_id) || '', deal_id: l.deal_id || '', round_id: l.run_id || '', line_id: l.line_id };
  }
  /* run → the sheets of the PR (one per band that has lines, the run line on top · "รวม" at the bottom) + Summary · details: Map payee_id → decrypted bank details, or null */
  function prSheets(state, run, details) {
    const P = C.pay, S = paySettings(state.lookups), ddmmyy = `${run.pay_date.slice(8, 10)}${run.pay_date.slice(5, 7)}${run.pay_date.slice(2, 4)}`, names = prSheetNames(S);
    const lines = runLines(state, run.run_id).filter(l => l.status !== 'cancelled'), sheets = [], bandRows = [], runLine = P.prRunLine(run.run_id, R.dmy(run.pay_date));
    const colL = n => String.fromCharCode(65 + n);
    [0, 1, 2].forEach(b => {
      const list = lines.filter(l => bandOf(l.gross, S) === b); if (!list.length) return;
      const cols = prColumns(S, b), rows = [[{ v: runLine, bold: true }], cols.map(c => ({ v: c.head, bold: true }))];
      list.forEach((l, i) => { const r = prRow(state, l, i, details); rows.push(cols.map(c => r[c.key])); });
      const last = rows.length, total = cols.map(() => '');   // the run line is row 1, the header row 2, lines 3 … last
      total[1] = { v: P.prTotal, bold: true };
      cols.forEach((c, n) => { if (['gross', 'vat', 'wht', 'net'].includes(c.key)) total[n] = { v: `SUM(${colL(n)}3:${colL(n)}${last})`, t: 'f', bold: true, money: true }; });
      rows.push(total);
      const W = { no: 6, project: 24, account: 20, type: 7, full_name: 24, id_address: 34, bank: 12, account_no: 18, gross: 14, vat: 12, wht: 12, net: 16, link: 40, pic: 10, print: 18, wht_contact: 26, payee_id: 11, deal_id: 11, round_id: 16, line_id: 11 };
      sheets.push({ name: `${names[b]} ${ddmmyy}`, rows, freeze: 2, widths: cols.map(c => W[c.key]) });
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
    (state.shipping_addresses || []).forEach(a => { if (a.secure) { a.secure = null; n++; } });   // CR-16 §4.3: the addresses are encrypted the same way
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
    PAYEE_TYPES, PRICE_BASES, PAYEE_DOCS, BANK_FIELDS, BANK_REQUIRED, payeeOfKol, payeeById, mainHandle, blankPayee, payeeDocsMissing, payeeDocKeys, payeeDocs, payeeDoc, docAttached, payeeMissing, last4, validatePayee, validateBankDetails, bankRecord,
    payeeHasPaid, canEditPayee, PAYEE_CSV_COLS, normHandle, planPayeeImport, scrubSensitive,
    LINE_STATUSES, payeeOfLine, postEvidence, docsRequired, lineDocs, isDocsOnly, promoteDocsLine, docLabel, lineStatus, taxOf, expectedDue, payItem, payQueue, payCards, canRequest, newLine, validateRequest, dealPayItems,
    RUN_STATUSES, nextRunDate, runIdFor, newRun, runLines, runTotals, runChecks, addToRun, removeFromRun, submitRun, syncDealPayment, syncDeals, markPaid, undoPaid, reopenRun, editLineAmount,
    amountLabels, runStatusKey, runStatusLabel, returnRun, prFileName, prSheets, prColumns, prSheetNames, prRow, migrateBandsV32, BIG_AMOUNT, banksDefault, bankOf, bankShort, bankPr, bankLine, filledFields, resetVault, paidLines, whtNotSent, markWhtSent, whtSummary, WHT_SUMMARY_COLS, validateManual, newManualLine, markPaidOutside, cancelLines, cancelDealLines };
})(KT.rules, KT.content));
