/* screen-payments.js — CR-08 Payments (side menu, between Deals and KOL Master): header with Due now · In runs · Paid this month,
   tabs To pay · Runs · History (remembered), one scope bar for the three (PIC · Campaign · Source · Search · Clear all filters).
   To pay = every instalment owed or coming (worked out from the deals until someone requests it) + manual lines · queue cards ·
   table grouped by Readiness / PIC / Campaign / Band · Request payment · the Payee dialog from the "Missing" chips. → KT.screens.payments */
KT.screens.payments = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, state, pref, commit, toast, can, openDialog, closeDialog, checksHTML, optionsHTML, downloadCSV, store, userId, takeParams, ICON } = U;
  const PM = C.pay, PY = C.payee;
  const TABS = ['topay', 'runs', 'history'];
  const GROUPS = ['readiness', 'pic', 'campaign', 'band'];
  const DUE = ['ready', 'missing_docs', 'in_run', 'submitted'];
  const pv = { tab: TABS.includes(pref.get('paytab', 'topay')) ? pref.get('paytab', 'topay') : 'topay', f: { campaign: '', source: '', q: '' }, pic: null, picUser: null,
    queue: null, groupBy: GROUPS.includes(pref.get('paygroup', 'readiness')) ? pref.get('paygroup', 'readiness') : 'readiness', selected: new Set(), items: [], run: null,
    hist: { preset: 'this_year', from: '', to: '', run: '', wht: false } };
  const money = v => (v == null ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const myPic = () => R.picName(U.me());
  /* PIC: 'me' · 'all' · a name · '__none' — a PIC starts with Me, anyone else with All PICs (remembered per person) */
  function picSel() {
    const uid = userId();
    if (pv.picUser !== uid) { pv.picUser = uid; const v = pref.get('paypic_' + uid, ''); pv.pic = v && (['me', 'all', '__none'].includes(v) || R.picNames(state()).includes(v)) ? v : myPic() ? 'me' : 'all'; }
    if (pv.pic === 'me' && !myPic()) pv.pic = 'all';
    return pv.pic;
  }
  const choosePic = v => { picSel(); pv.pic = v && v === myPic() ? 'me' : v || 'all'; pref.set('paypic_' + userId(), pv.pic); };
  const picFilter = () => { const v = picSel(); return v === 'all' ? '' : v === 'me' ? myPic() : v; };

  /* ===================== shell ===================== */
  function render(id) {
    const sec = $('tab-payments');
    if (!sec.dataset.built) build(sec);
    const p = takeParams('payments');
    if (p) {
      if (p.campaign !== undefined) pv.f.campaign = p.campaign || '';
      if (p.pic !== undefined) choosePic(p.pic);
      if (p.queue !== undefined) pv.queue = p.queue;
      if (p.tab) pv.tab = p.tab;
      if (p.run !== undefined) { pv.run = p.run; pv.tab = 'runs'; }
    }
    if (id && TABS.includes(id)) pv.tab = id;
    pref.set('paytab', pv.tab);
    U.setHash('payments/' + pv.tab);
    draw();
  }
  function build(sec) {
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(PM.title)}</h1><span class="spacer"></span><span class="pm-sum" id="pm_sum"></span></div>
      <div class="stabs dtabs" id="pm_tabs" role="tablist">${TABS.map(t => `<button type="button" role="tab" data-ptab="${t}">${esc(PM.tabs[t])}</button>`).join('')}</div>
      <div class="toolbar" id="pm_tools"></div><div class="fchips hidden" id="pm_chips"></div><div id="pm_body"></div>`;
    $('pm_tabs').addEventListener('click', e => { const b = e.target.closest('[data-ptab]'); if (b) { pv.tab = b.dataset.ptab; pv.queue = null; pv.selected.clear(); render(); } });
    $('pm_tools').addEventListener('change', onToolsChange);
    let qT; $('pm_tools').addEventListener('input', e => { if (e.target.id !== 'pm_q') return; clearTimeout(qT); qT = setTimeout(() => { pv.f.q = e.target.value; draw(); }, 150); });
    $('pm_chips').addEventListener('click', e => {
      if (e.target.closest('[data-clearfilters]')) { clearAll(); return; }
      const b = e.target.closest('[data-unset]'); if (!b) return;
      const k = b.dataset.unset; if (k === 'pic') choosePic('all'); else if (k === 'queue') pv.queue = null; else pv.f[k] = ''; draw();
    });
    $('pm_body').addEventListener('click', onBodyClick);
    $('pm_body').addEventListener('change', onBodyChange);
    sec.dataset.built = '1';
  }
  function draw() {
    const s = state(), td = today();
    document.querySelectorAll('#pm_tabs [data-ptab]').forEach(b => { const on = b.dataset.ptab === pv.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    const q = R.payQueue(s, td);
    pv.queue_ = q;
    drawSummary(s, q, td);
    drawTools(s);
    if (pv.tab === 'topay') drawToPay(s, q, td);
    else if (pv.tab === 'runs') drawRuns(s, td);
    else drawHistory(s, td);
  }
  /* Due now · In runs · Paid this month (gross) */
  function drawSummary(s, q, td) {
    const sum = list => R.round2(list.reduce((a, x) => a + x.tax.gross, 0)), month = td.slice(0, 7);
    const paidMonth = (s.payment_lines || []).filter(l => l.status === 'paid' && String(l.paid_date || '').slice(0, 7) === month).reduce((a, l) => a + (l.gross || 0), 0);
    $('pm_sum').innerHTML = `${esc(PM.dueNow)} <b>${esc(R.baht(sum(q.items.filter(x => x.status === 'ready' || x.status === 'missing_docs'))))}</b><span class="sep">·</span>` +
      `${esc(PM.inRuns)} <b>${esc(R.baht(sum(q.items.filter(x => x.status === 'in_run' || x.status === 'submitted'))))}</b><span class="sep">·</span>${esc(PM.paidMonth)} <b>${esc(R.baht(R.round2(paidMonth)))}</b>`;
  }
  /* PIC · Campaign · Source · Search — the same for the three tabs */
  function drawTools(s) {
    const me = myPic(), names = R.picNames(s, true), v = picSel();
    const picOpts = (me ? `<option value="me">${esc(C.deal.picMe(me))}</option>` : '') + `<option value="all">${esc(C.deal.allPics)}</option>` +
      names.filter(n => n !== me).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + `<option value="__none">${esc(C.deal.unassigned)}</option>`;
    const tools = $('pm_tools'), focused = document.activeElement && document.activeElement.id === 'pm_q';
    if (!tools.dataset.built || !focused) {
      tools.innerHTML = `<label class="tlab">${esc(PM.pic)} <select id="pm_pic">${picOpts}</select></label>` +
        `<select id="pm_camp" aria-label="${esc(PM.campaign)}" data-combo="campaign">${U.campaignOptionsHTML(pv.f.campaign, PM.allCampaigns)}</select>` +
        `<label class="tlab">${esc(PM.source)} <select id="pm_src">${optionsHTML(['deal', 'affiliate', 'other'].map(k => ({ value: k, label: PM.sources[k] })), pv.f.source, PM.allSources)}</select></label>` +
        `<input type="search" class="search" id="pm_q" placeholder="${esc(PM.search)}" value="${esc(pv.f.q)}" autocomplete="off">`;
      $('pm_pic').value = v; U.enhanceCombos(tools); tools.dataset.built = '1';
    }
    const chips = [];
    if (v !== 'all') chips.push(['pic', `${PM.pic}: ${v === 'me' ? C.deal.picMe(me) : v === '__none' ? C.deal.unassigned : v}`]);
    if (pv.f.source) chips.push(['source', `${PM.source}: ${PM.sources[pv.f.source]}`]);
    if (pv.queue && pv.tab === 'topay') chips.push(['queue', PM.cards[pv.queue]]);
    const n = chips.length + (pv.f.campaign ? 1 : 0) + (R.trim(pv.f.q) ? 1 : 0);
    if (pv.f.campaign) chips.unshift(['campaign', `${PM.campaign}: ${R.campaignName(s, pv.f.campaign)}`]);
    U.filterChips($('pm_chips'), chips, n);
    pv.used = chips.filter(c => c[0] !== 'queue').map(c => c[1]).concat(R.trim(pv.f.q) ? [`"${R.trim(pv.f.q)}"`] : []);
  }
  function clearAll() { pv.f = { campaign: '', source: '', q: '' }; choosePic('all'); pv.queue = null; const q = $('pm_q'); if (q) q.value = ''; draw(); }
  function onToolsChange(e) {
    const t = e.target;
    if (t.id === 'pm_pic') choosePic(t.value);
    else if (t.id === 'pm_camp') pv.f.campaign = t.value;
    else if (t.id === 'pm_src') pv.f.source = t.value;
    else return;
    pv.selected.clear(); draw();
  }
  /* the scope of the three tabs */
  function inScope(s, x) {
    const pic = picFilter(), q = R.trim(pv.f.q).toLowerCase();
    if (pic && (pic === '__none' ? !!x.pic : x.pic !== pic)) return false;
    if (pv.f.campaign && x.campaign_id !== pv.f.campaign) return false;
    if (pv.f.source && (pv.f.source === 'deal' ? !(x.source === 'deal' || x.source === 'legacy') : x.source !== pv.f.source)) return false;
    if (q && ![x.kol && x.kol.display_name, x.account_handle, x.payee && x.payee.payee_id, x.deal_id, x.line && x.line.line_id].some(v => String(v || '').toLowerCase().includes(q.replace(/^@/, '')))) return false;
    return true;
  }

  /* ===================== To pay ===================== */
  function drawToPay(s, q, td) {
    const scoped = q.items.filter(x => inScope(s, x)), checks = q.checks.filter(c => inScope(s, { pic: c.deal.pic, campaign_id: c.deal.campaign_id, source: 'deal', deal_id: c.deal.deal_id, kol: R.kolById(s, c.deal.kol_id) }));
    const cards = R.payCards(scoped, checks, td), end = R.addDays(td, 14);
    const list = pv.queue === 'ready' ? scoped.filter(x => x.status === 'ready') : pv.queue === 'missing' ? scoped.filter(x => x.status === 'missing_docs')
      : pv.queue === 'upcoming' ? scoped.filter(x => x.status === 'not_due' && x.due_date && x.due_date >= td && x.due_date <= end) : scoped.filter(x => DUE.includes(x.status));
    pv.items = list;
    [...pv.selected].forEach(k => { if (!list.some(x => x.key === k)) pv.selected.delete(k); });
    const card = (k, c) => `<button type="button" class="qcard${pv.queue === k ? ' on' : ''}" data-pqueue="${k}" aria-pressed="${pv.queue === k}"><span class="n">${R.fmtNum(c.n)}</span><span class="t">${esc(PM.cards[k])}${c.gross != null ? ` · ${esc(R.baht(c.gross))}` : ''}</span></button>`;
    const bulk = bulkHTML();
    $('pm_body').innerHTML = `<div class="qcards">${card('ready', cards.ready)}${card('missing', cards.missing)}${card('upcoming', cards.upcoming)}${card('check', cards.check)}</div>
      <div class="toolbar pm-row2"><label class="tlab">${esc(C.deal.groupBy)} <select id="pm_group">${GROUPS.map(g => `<option value="${g}"${g === pv.groupBy ? ' selected' : ''}>${esc(PM.groupBy[g])}</option>`).join('')}</select></label>
        <span class="spacer"></span>${bulk}${!pv.selected.size && can('payment.manual') ? `<button type="button" class="btn small" data-pact="manual">${esc(PM.addManual)}</button>` : ''}<button type="button" class="btn small ghost" data-pact="csv">${esc(PM.csv)}</button></div>
      <div id="pm_table"></div>`;
    if (pv.queue === 'check') { drawChecks(s, checks); return; }
    drawTable(s, list, td);
  }
  /* bulk actions on the ticked rows (Admin / KOL Manager) — the runs and the "outside the app" actions come with the runs (R3 / R4) */
  function bulkHTML() {
    const n = pv.selected.size; if (!n) return '';
    const s = state(), drafts = (s.payment_runs || []).filter(r => r.status === 'draft').sort((a, b) => b.run_id.localeCompare(a.run_id));
    const next = R.nextRunDate(today(), R.paySettings(s.lookups).run_weekday);
    const toRun = can('payment.run') ? `<select id="pm_torun" aria-label="${esc(PM.addToRun)}">${drafts.map(r => `<option value="${esc(r.run_id)}"${r.run_id === pv.addTo ? ' selected' : ''}>${esc(r.run_id)}</option>`).join('')}` +
      `<option value="__new"${pv.addTo ? '' : ''}>${esc(PM.newRunOn(C.pay.weekdays[new Date(next + 'T00:00:00Z').getUTCDay()].slice(0, 3), R.dmy(next).slice(0, 5)))}</option></select><button type="button" class="btn small primary" data-pact="addrun">${esc(PM.addToRun)}</button>` : '';
    const outside = can('payment.paid') ? `<button type="button" class="btn small" data-pact="outside">${esc(PM.paidOutside)}</button>` : '';
    const cancel = can('payment.run') ? `<button type="button" class="btn small" data-pact="cancellines">${esc(PM.cancelLine)}</button>` : '';
    return `<b class="pm-seln">${esc(C.deal.selected(n))}</b>${toRun}${outside}${cancel}<button type="button" class="btn small ghost" data-pact="clearsel">${esc(C.deal.clear)}</button>`;
  }
  const STATUS_CLS = { not_due: 'muted', missing_docs: 'warn', ready: 'readyc', in_run: 'progress', submitted: 'subm', paid: 'done', cancelled: 'cancel' };
  const statusChip = st => `<span class="st ${STATUS_CLS[st] || ''}">${esc(PM.status[st])}</span>`;
  const missingLabel = k => (k === 'bank_details' ? PY.missingBank : k === 'post_evidence' ? PM.postEvidence : PY.docs[k]);
  /* Missing: … → the Payee dialog (documents / bank details) · the deal's Posts (post evidence) */
  function docsCell(x) {
    if (!x.missing.length) return x.status === 'not_due' ? '' : `<span class="ok">✓</span>`;
    const payeePart = x.missing.filter(k => k !== 'post_evidence'), post = x.missing.includes('post_evidence');
    return `<span class="pm-docs">` + (payeePart.length ? `<button type="button" class="chip warn-chip" data-ppayee="${esc(x.kol_id || '')}" data-ppayeeid="${esc(x.payee ? x.payee.payee_id : '')}">${esc(PY.missing(payeePart.map(missingLabel).join(' · ')))}</button>` : '') +
      (post ? `<button type="button" class="chip warn-chip" data-pposts="${esc(x.deal_id)}">${esc(PY.missing(PM.postEvidence))}</button>` : '') + `</span>`;
  }
  function phaseLine(s, x, ctx) {
    if (!x.deal) return esc(x.project_label || '');
    const p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, x.deal_id));
    return esc(`${R.campaignName(s, x.deal.campaign_id)}${p ? ` › ${R.phaseName(s, p.phase_id)}` : ''}`);
  }
  function groupKeyOf(s, x) {
    if (pv.groupBy === 'pic') return x.pic || '';
    if (pv.groupBy === 'campaign') return x.campaign_id || '';
    if (pv.groupBy === 'band') return String(x.band);
    return x.status;
  }
  function groupLabel(s, k) {
    if (pv.groupBy === 'pic') return k || C.deal.unassigned;
    if (pv.groupBy === 'campaign') return k ? R.campaignName(s, k) : PM.noCampaign;
    if (pv.groupBy === 'band') return PM.bands[+k];
    return PM.status[k];
  }
  const GROUP_ORDER = { readiness: ['missing_docs', 'ready', 'in_run', 'submitted', 'not_due'], band: ['0', '1', '2'] };
  function drawTable(s, list, td) {
    const ctx = R.dealContext(s), actor = U.actor(), sel = pv.selected, canBulk = can('payment.run') || can('payment.paid');
    if (!list.length) { $('pm_table').innerHTML = `<div class="card empty"><b>${esc(PM.empty)}</b></div>`; return; }
    const groups = new Map(); list.forEach(x => { const k = groupKeyOf(s, x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const order = GROUP_ORDER[pv.groupBy] ? GROUP_ORDER[pv.groupBy].filter(k => groups.has(k)) : [...groups.keys()].sort((a, b) => groupLabel(s, a).localeCompare(groupLabel(s, b), 'th'));
    const span = canBulk ? 12 : 11;
    const row = x => {
      const name = x.kol ? x.kol.display_name : x.account_handle || (x.payee && x.payee.account_handle) || '';
      const req = x.virtual && x.status !== 'not_due' && x.deal ? (R.canRequest(s, actor, x.deal) ? `<button type="button" class="btn small" data-preq="${esc(x.key)}">${esc(PM.request)}</button>`
        : `<button type="button" class="btn small" disabled title="${esc(PM.requestOnlyPic)}">${esc(PM.request)}</button>`) : (x.line ? `<span class="muted small">${esc(x.line.line_id)}</span>` : '');
      return `<tr data-pkey="${esc(x.key)}">${canBulk ? `<td class="cb"><input type="checkbox" data-psel="${esc(x.key)}"${sel.has(x.key) ? ' checked' : ''} aria-label="${esc(name)}"></td>` : ''}` +
        `<td class="sticky2 pm-kol"><span class="kname"><b>${esc(name)}</b>${name ? U.copyBtnHTML(name) : ''}</span>${x.source !== 'deal' ? ` <span class="chip">${esc(PM.sources[x.source] || x.source)}</span>` : ''}</td>` +
        `<td class="muted cph">${phaseLine(s, x, ctx)}</td><td>${esc(C.pay.milestone[x.milestone] || x.milestone)}${x.term_not_set ? ` <span class="chip warn-chip" title="${esc(PM.termNotSetTip)}">${esc(PM.termNotSet)}</span>` : ''}</td>` +
        `<td class="nowrap${x.overdue ? ' late' : ''}">${x.due_date ? esc(R.dmy(x.due_date).slice(0, 5)) : '<span class="muted">—</span>'}</td>` +
        `<td class="num">${money(x.tax.gross)}</td><td class="num">${x.tax.wht ? money(x.tax.wht) : '<span class="muted">0.00</span>'}</td><td class="num"><b>${money(x.tax.net)}</b></td>` +
        `<td class="pm-docscell">${docsCell(x)}</td><td>${statusChip(x.status)}</td><td>${esc(x.pic || '')}</td><td>${req}</td></tr>`;
    };
    const tot = rows => ['gross', 'wht', 'net'].map(k => R.round2(rows.reduce((a, x) => a + x.tax[k], 0)));
    const body = order.map(k => { const rows = groups.get(k), t = tot(rows);
      return `<tr class="ghead pm-gh"><td colspan="${span}"><b>${esc(groupLabel(s, k))}</b> <span class="muted">${esc(PM.groupLine(rows.length, money(t[0]), money(t[1]), money(t[2])))}</span></td></tr>` + rows.map(row).join(''); }).join('');
    const all = tot(list);
    $('pm_table').innerHTML = `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl"><thead><tr>${canBulk ? `<th class="cb"><input type="checkbox" id="pm_all" aria-label="${esc(C.deal.selectAll)}"${list.every(x => sel.has(x.key)) ? ' checked' : ''}></th>` : ''}` +
      `<th class="sticky2">${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th>${esc(PM.col.milestone)}</th><th>${esc(PM.col.due)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th>` +
      `<th>${esc(PM.col.docs)}</th><th>${esc(PM.col.status)}</th><th>${esc(PM.col.pic)}</th><th></th></tr></thead><tbody>${body}` +
      `<tr class="total"><td colspan="${canBulk ? 5 : 4}">${esc(PM.totalLine(list.length))}</td><td class="num">${money(all[0])}</td><td class="num">${money(all[1])}</td><td class="num">${money(all[2])}</td><td colspan="4"></td></tr></tbody></table></div>`;
  }
  /* Needs check: ฿0 deals that are owed something · payments made on deals that were cancelled */
  function drawChecks(s, checks) {
    if (!checks.length) { $('pm_table').innerHTML = `<div class="card empty"><b>${esc(PM.noChecks)}</b></div>`; return; }
    $('pm_table').innerHTML = `<div class="tablewrap"><table class="tbl pm-tbl"><thead><tr><th>${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th>${esc(PM.col.issue)}</th><th>${esc(PM.col.pic)}</th><th></th></tr></thead><tbody>` +
      checks.map(c => `<tr><td><b>${esc((R.kolById(s, c.deal.kol_id) || {}).display_name || '')}</b></td><td class="muted">${esc(R.campaignName(s, c.deal.campaign_id))}</td><td class="late">${esc(PM.checks[c.kind])}</td><td>${esc(c.deal.pic || '')}</td>` +
        `<td><button type="button" class="btn small" data-pdeal="${esc(c.deal.deal_id)}">${esc(C.overview.open)}</button></td></tr>`).join('') + `</tbody></table></div>`;
  }

  /* ===================== Request payment (§4.5) ===================== */
  /* item: a To pay row (worked out from a deal) · after: what to draw again */
  function openRequest(item, after) {
    const s = state(), actor = U.actor();
    if (!item || !item.deal || !R.canRequest(s, actor, item.deal)) { toast(PM.requestOnlyPic); return; }
    const S = R.paySettings(s.lookups), payee = item.payee, users = (s.users || []).filter(u => u.active !== false);
    const o = { agreed_amount: String(item.agreed), price_basis: item.price_basis, wht_rate: String(item.tax.wht_rate), pay_to: 'payee', reimburse_user: '', note: '' };
    openDialog(`<div class="dlg-h">${esc(PM.requestTitle(item.kol ? item.kol.display_name : item.account_handle, C.pay.milestone[item.milestone]))}</div><div class="dlg-b">
      <p class="muted small" style="margin-top:0">${esc(R.campaignName(s, item.campaign_id))} · ${esc(C.pay.milestone[item.milestone])}${item.due_date ? ` · ${esc(PM.col.due)} ${esc(R.dmy(item.due_date))}` : ''}</p>
      <div class="py-bank">${payee && payee.secure ? `<b>${esc(PY.bankLine(payee.bank_name, payee.account_last4))}</b>` : `<span class="chip warn-chip">${esc(PY.missing(PY.missingBank))}</span>`} <span class="muted small">${esc(PM.bankFromPayee)}</span></div>
      <div class="fields" style="margin-top:10px">
        <div class="field"><label for="rq_amt">${esc(PM.agreed)}</label><input id="rq_amt" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(o.agreed_amount)}"></div>
        <div class="field"><label for="rq_basis">${esc(PY.basis)}</label><select id="rq_basis">${optionsHTML(R.PRICE_BASES.map(b => ({ value: b, label: PY.bases[b] })), o.price_basis)}</select></div>
        <div class="field"><label for="rq_wht">${esc(PM.whtRate)}</label><select id="rq_wht">${optionsHTML(S.wht_rates.map(r => ({ value: String(r), label: `${r}%` })), o.wht_rate)}</select></div>
        <div class="field"><label for="rq_payto">${esc(PM.payTo)}</label><select id="rq_payto">${optionsHTML([{ value: 'payee', label: PM.payToPayee }, { value: 'reimburse', label: PM.payToReimburse }], 'payee')}</select></div>
        <div class="field hidden" id="rq_userW"><label for="rq_user">${esc(PM.reimburseUser)}</label><select id="rq_user">${optionsHTML(users.map(u => ({ value: u.user_id, label: u.display_name })), '', PM.chooseUser)}</select></div>
        <div class="field wide"><label for="rq_note">${esc(PM.note)}</label><input id="rq_note" autocomplete="off"></div>
      </div><div class="pm-tax" id="rq_tax"></div><div class="checks" id="rq_checks" style="margin-top:8px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="rq_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="rq_ok">${esc(PM.request)}</button></div>`, 'mid');
    const read = () => ({ agreed_amount: $('rq_amt').value, price_basis: $('rq_basis').value, wht_rate: $('rq_wht').value, pay_to: $('rq_payto').value, reimburse_user: $('rq_user').value, note: $('rq_note').value });
    const chk = () => {
      const v = read(), res = R.validateRequest(state(), v);
      $('rq_userW').classList.toggle('hidden', v.pay_to !== 'reimburse');
      const t = res.errs.some(e => e.field === 'agreed_amount') ? null : R.taxOf(state(), v, payee);
      $('rq_tax').innerHTML = t ? taxBox(t, v.price_basis === 'net' ? R.round2(t.gross - Number(v.agreed_amount)) : 0) : '';
      $('rq_checks').innerHTML = checksHTML(res, ''); $('rq_ok').disabled = res.errs.length > 0; return res;
    };
    ['rq_amt', 'rq_basis', 'rq_wht', 'rq_payto', 'rq_user', 'rq_note'].forEach(id => { $(id).addEventListener('input', chk); $(id).addEventListener('change', chk); });
    $('rq_cancel').addEventListener('click', closeDialog);
    $('rq_ok').addEventListener('click', () => {
      if (chk().errs.length || !R.canRequest(state(), U.actor(), item.deal)) return;
      const s2 = state(), line = R.newLine(s2, item, Object.assign(read(), { lineId: store.newId('line'), user: userId(), now: new Date().toISOString() }));
      s2.payment_lines.push(line);
      s2.deal_events.push(paymentEvent(line, null, 'open', null));
      closeDialog(); commit(PM.requested(line.line_id)); if (after) after(); else draw();
    });
    chk();
  }
  const taxBox = (t, borne) => `<div class="pm-taxgrid"><span>${esc(PM.col.gross)}</span><b>${money(t.gross)}</b><span>${esc(PM.vat)}</span><b>${money(t.vat)}</b><span>${esc(PM.col.wht)} (${t.wht_rate}%)</span><b>${money(t.wht)}</b><span>${esc(PM.col.net)}</span><b>${money(t.net)}</b></div>` +
    (borne > 0 ? `<div class="hint">${esc(PM.borne(money(borne)))}</div>` : '');
  /* deal_events type 'payment' (§3): every change of a line's status */
  const paymentEvent = (line, from, to, note) => ({ event_id: store.newEventId(), deal_id: line.deal_id || null, line_id: line.line_id, type: 'payment', from, to,
    changed_at: new Date().toISOString(), changed_by: userId(), note: note || null });

  /* ===================== Runs (§4.6) ===================== */
  const RUN_CLS = { draft: 'list', submitted: 'progress', paid: 'done', closed: 'muted' };
  const runChip = st => `<span class="st ${RUN_CLS[st] || ''}">${esc(PM.runStatus[st])}</span>`;
  function drawRuns(s, td) {
    if (pv.run && (s.payment_runs || []).some(r => r.run_id === pv.run)) { drawRun(s, td); return; }
    pv.run = null;
    const runs = (s.payment_runs || []).slice().sort((a, b) => b.pay_date.localeCompare(a.pay_date) || b.run_id.localeCompare(a.run_id));
    const scoped = r => R.runLines(s, r.run_id).filter(l => inScope(s, R.payItem(s, td, { line: l })));
    $('pm_body').innerHTML = `<div class="toolbar pm-row2"><span class="spacer"></span>${can('payment.run') ? `<button type="button" class="btn primary" data-pact="newrun">${esc(PM.newRun)}</button>` : ''}</div>` +
      (!runs.length ? `<div class="card empty"><b>${esc(PM.noRuns)}</b></div>` : `<div class="tablewrap"><table class="tbl pm-tbl"><thead><tr><th>${esc(PM.run)}</th><th>${esc(PM.payDate)}</th><th>${esc(PM.preparedBy)}</th><th>${esc(PM.col.status)}</th>` +
        `<th class="num">${esc(PM.lines)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.vat)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th><th></th></tr></thead><tbody>` +
        runs.map(r => { const t = R.runTotals(scoped(r));
          return `<tr><td><b>${esc(r.run_id)}</b></td><td>${esc(R.dmy(r.pay_date))}</td><td>${esc(R.changedByName(s, r.prepared_by))}</td><td>${runChip(r.status)}</td><td class="num">${t.n}</td>` +
            `<td class="num">${money(t.gross)}</td><td class="num">${money(t.vat)}</td><td class="num">${money(t.wht)}</td><td class="num"><b>${money(t.net)}</b></td><td><button type="button" class="btn small" data-prun="${esc(r.run_id)}">${esc(C.overview.open)}</button></td></tr>`; }).join('') + `</tbody></table></div>`);
  }
  /* Run detail: header · Checks · lines by band (No. · Project · Account · Type · Payee type · Bank · Gross · VAT · WHT · Net · Docs · Printed · PIC · ⋯) · totals */
  function drawRun(s, td) {
    const run = s.payment_runs.find(r => r.run_id === pv.run), lines = R.runLines(s, run.run_id), chk = R.runChecks(s, run, td), S = R.paySettings(s.lookups), canRun = can('payment.run'), canPaid = can('payment.paid');
    const draft = run.status === 'draft', sub = run.status === 'submitted';
    const acts = [
      draft && canRun ? `<button type="button" class="btn" data-pact="addlines">${esc(PM.addLines)}</button>` : '',
      (draft || sub || run.status === 'paid') && canRun ? `<button type="button" class="btn" data-pact="export">${esc(PM.exportPr)}</button>` : '',
      draft && canRun ? `<button type="button" class="btn primary" data-pact="submit"${chk.errs.length ? ` disabled title="${esc(PM.fixErrors)}"` : ''}>${esc(PM.submit)}</button>` : '',
      sub && canPaid ? `<button type="button" class="btn primary" data-pact="markpaid">${esc(PM.markPaid)}</button>` : '',
      sub && can('payment.reopen') ? `<button type="button" class="btn" data-pact="reopen">${esc(PM.reopen)}</button>` : '',
      run.status === 'paid' && canPaid ? `<button type="button" class="btn primary" data-pact="close">${esc(PM.closeRun)}</button>` : ''].join('');
    const payDate = draft && canRun ? U.dateHTML('id="pm_paydate"', run.pay_date, { label: PM.payDate }) : `<b>${esc(R.dmy(run.pay_date))}</b>`;
    /* the same warning on many lines (term not set · 10,000 and above) is said once, with the names */
    const group = list => { const out = [], seen = new Map(); list.forEach(x => { if (!x.kind) { out.push(x); return; } if (!seen.has(x.kind)) { const g = Object.assign({}, x, { names: [] }); seen.set(x.kind, g); out.push(g); } seen.get(x.kind).names.push(x.who); });
      return out.map(x => (x.names && x.names.length > 1 ? Object.assign(x, { msg: PM.checkGroups[x.kind](x.names.join(', ')) }) : x)); };
    chk.warns = group(chk.warns);
    const checks = chk.errs.length + chk.warns.length + chk.infos.length ? `<div class="card pm-checks"><div class="checks">${['errs', 'warns', 'infos'].map(k => chk[k].map(x =>
      `<div class="check ${k === 'errs' ? 'err' : k === 'warns' ? 'warn' : 'info'}">${k === 'errs' ? '✕' : k === 'warns' ? '!' : 'i'} <button type="button" class="link" data-pgoto="${esc(x.line_id)}">${esc(x.msg)}</button>` +
      (x.verify && can('payee.verify') ? ` <button type="button" class="btn small" data-pverify="${esc(x.payee_id)}">${esc(PY.markVerified)}</button>` : '') + `</div>`).join('')).join('')}</div></div>` : '';
    const sel = pv.selected, cols = 15;
    const row = (l, i) => {
      const p = R.payeeOfLine(s, l), it = R.payItem(s, td, { line: l }), st = it.status;
      const menu = [draft && canRun ? `<button type="button" class="mi" data-plremove="${esc(l.line_id)}">${esc(PM.removeFromRun)}</button><button type="button" class="mi" data-pledit="${esc(l.line_id)}">${esc(PM.editAmount)}</button>` : '',
        sub && canRun && l.status !== 'paid' ? `<button type="button" class="mi" data-plback="${esc(l.line_id)}">${esc(PM.moveBack)}</button>` : '',
        l.status === 'paid' && can('payment.reopen') ? `<button type="button" class="mi" data-plundo="${esc(l.line_id)}">${esc(PM.undoPaid)}</button>` : ''].join('');
      return `<tr id="pmline_${esc(l.line_id)}" class="${l.status === 'cancelled' ? 'faded-row' : ''}">${sub && canPaid ? `<td class="cb">${l.status === 'submitted' ? `<input type="checkbox" data-plsel="${esc(l.line_id)}"${sel.has(l.line_id) ? ' checked' : ''} aria-label="${esc(l.account_handle)}">` : ''}</td>` : '<td></td>'}` +
        `<td class="num">${i + 1}</td><td class="cph">${esc(l.project_label || '')}</td><td class="pm-kol"><span class="kname"><b>${esc(l.account_handle || '')}</b>${l.account_handle ? U.copyBtnHTML(l.account_handle) : ''}</span></td>` +
        `<td>${esc({ deal: 'KOL', legacy: 'KOL', affiliate: 'AFF', other: 'Other' }[l.source] || 'Other')}</td><td>${esc(PY.types[(p && p.payee_type) || l.payee_type] || '')}</td>` +
        `<td class="nowrap">${p && p.secure ? esc(PY.bankLine(p.bank_name, p.account_last4)) : '<span class="muted">—</span>'}</td><td class="num">${money(l.gross)}</td><td class="num">${money(l.vat)}</td>` +
        `<td class="num">${money(l.wht)} <span class="muted small">${l.wht_rate}%</span></td><td class="num"><b>${money(l.net)}</b></td><td class="pm-docscell">${docsCell(it)}</td>` +
        `<td class="c"><input type="checkbox" data-plprint="${esc(l.line_id)}"${l.printed ? ' checked' : ''}${canRun && run.status !== 'closed' ? '' : ' disabled'} aria-label="${esc(PM.printed)}"></td>` +
        `<td>${esc(it.pic || '')}</td><td>${l.status === 'paid' ? `<span class="muted small">${esc(R.dmy(l.paid_date))}</span> ` : ''}${statusChip(st)}${menu ? `<details class="menu pm-menu"><summary class="icon-btn" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right">${menu}</div></details>` : ''}</td></tr>`;
    };
    const bands = [0, 1, 2].map(b => ({ b, list: lines.filter(l => R.bandOf(l.gross, S) === b) })).filter(x => x.list.length);
    let no = 0;
    const body = bands.map(({ b, list }) => { const t = R.runTotals(list);
      return `<tr class="ghead pm-gh"><td colspan="${cols}"><b>${esc(PM.bands[b])}</b> <span class="muted">${esc(PM.bandLine(t.n, money(t.gross), money(t.vat), money(t.wht), money(t.net)))}</span></td></tr>` + list.map(l => row(l, no++)).join(''); }).join('');
    const t = R.runTotals(lines);
    $('pm_body').innerHTML = `<div class="pm-runhead"><button type="button" class="link" data-pact="backruns">← ${esc(PM.allRuns)}</button>
        <h2>${esc(run.run_id)}</h2>${runChip(run.status)}<span class="pm-rmeta"><span>${esc(PM.payDate)} ${payDate}</span><span>${esc(PM.preparedBy)} <b>${esc(R.changedByName(s, run.prepared_by))}</b></span></span><span class="spacer"></span>${acts}</div>` +
      checks + (sub && canPaid && sel.size ? `<div class="toolbar pm-row2"><b>${esc(C.deal.selected(sel.size))}</b><button type="button" class="btn small primary" data-pact="markpaidsel">${esc(PM.markPaidSel)}</button></div>` : '') +
      (!lines.length ? `<div class="card empty"><b>${esc(PM.runEmpty)}</b>${draft && canRun ? `<button type="button" class="btn" data-pact="addlines">${esc(PM.addLines)}</button>` : ''}</div>` :
        `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl pm-runtbl"><thead><tr><th class="cb"></th><th class="num">${esc(PM.no)}</th><th>${esc(PM.project)}</th><th class="sticky2">${esc(PM.account)}</th><th>${esc(PM.type)}</th><th>${esc(PY.type)}</th><th>${esc(PY.bank.bank_name)}</th>` +
        `<th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.vat)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th><th>${esc(PM.col.docs)}</th><th>${esc(PM.printed)}</th><th>${esc(PM.col.pic)}</th><th>${esc(PM.col.status)}</th></tr></thead><tbody>${body}` +
        `<tr class="total"><td></td><td colspan="6">${esc(PM.totalLine(t.n))}${t.borne ? ` · ${esc(PM.borne(money(t.borne)))}` : ''}</td><td class="num">${money(t.gross)}</td><td class="num">${money(t.vat)}</td><td class="num">${money(t.wht)}</td><td class="num">${money(t.net)}</td><td colspan="4"></td></tr></tbody></table></div>`);
    if ($('pm_paydate')) $('pm_paydate').addEventListener('change', e => { const v = e.target.value; if (R.isISODate(v) && can('payment.run')) { run.pay_date = v; commit(); draw(); } });
  }
  /* ids for one action: a new line goes into the state at once (so the next id follows) · events are added together at the end */
  const ctxOf = () => { let e = 0; return { lineId: () => store.newId('line'), eventId: () => store.newEventId() + e++, now: new Date().toISOString(), user: userId() }; };
  function newRunNow(open) {
    if (!U.guard('payment.run')) return null;
    const s = state(), run = R.newRun(s, { pay_date: R.nextRunDate(today(), R.paySettings(s.lookups).run_weekday), user: userId(), now: new Date().toISOString() });
    s.payment_runs.push(run); commit(PM.runCreated(run.run_id));
    if (open) { pv.tab = 'runs'; pv.run = run.run_id; pv.selected.clear(); render(); }
    return run;
  }
  function addSelectedToRun() {
    if (!U.guard('payment.run')) return;
    const s = state(), v = $('pm_torun') ? $('pm_torun').value : '__new';
    const run = v === '__new' ? newRunNow(false) : s.payment_runs.find(r => r.run_id === v);
    if (!run || run.status !== 'draft') return;
    const items = pv.items.filter(x => pv.selected.has(x.key)), ctx = ctxOf();
    const evs = R.addToRun(s, run, items, ctx); s.deal_events.push(...evs);
    pv.selected.clear(); pv.addTo = null; commit(PM.addedToRun(items.length, run.run_id));
    pv.tab = 'runs'; pv.run = run.run_id; render();
  }
  function submitRun() {
    if (!U.guard('payment.run')) return;
    const s = state(), run = s.payment_runs.find(r => r.run_id === pv.run), evs = R.submitRun(s, run, today(), ctxOf());
    if (!evs) { toast(PM.fixErrors); draw(); return; }
    s.deal_events.push(...evs); commit(PM.submitted(run.run_id)); draw();
  }
  function markPaidDialog(lineIds) {
    if (!U.guard('payment.paid')) return;
    const s = state(), run = s.payment_runs.find(r => r.run_id === pv.run), n = lineIds ? lineIds.length : R.runLines(s, run.run_id).filter(l => l.status === 'submitted').length;
    openDialog(`<div class="dlg-h">${esc(PM.markPaidTitle(n, run.run_id))}</div><div class="dlg-b"><div class="field"><label for="mp_date">${esc(PM.paidOnDate)}</label>${U.dateHTML('id="mp_date"', run.pay_date, { label: PM.paidOnDate })}</div></div>
      <div class="dlg-f"><button type="button" class="btn" id="mp_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="mp_ok">${esc(PM.markPaid)}</button></div>`);
    $('mp_cancel').addEventListener('click', closeDialog);
    $('mp_ok').addEventListener('click', () => {
      const date = $('mp_date').value; if (!R.isISODate(date) || !U.guard('payment.paid')) return;
      const s2 = state(), r2 = s2.payment_runs.find(r => r.run_id === pv.run), evs = R.markPaid(s2, r2, lineIds, date, ctxOf());
      s2.deal_events.push(...evs); pv.selected.clear(); closeDialog(); commit(PM.paidDone(evs.length)); draw();
    });
  }
  /* a reason, then f(reason) */
  function askReason(title, okLabel, f) {
    openDialog(`<div class="dlg-h">${esc(title)}</div><div class="dlg-b"><div class="field"><label for="ar_text">${esc(PM.reason)}</label><input id="ar_text" autocomplete="off"></div><div class="checks" id="ar_checks"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ar_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="ar_ok">${esc(okLabel)}</button></div>`);
    $('ar_cancel').addEventListener('click', closeDialog);
    $('ar_ok').addEventListener('click', () => {
      const v = R.trim($('ar_text').value);
      if (!v) { $('ar_checks').innerHTML = `<div class="check err">✕ <span>${esc(PM.reasonRequired)}</span></div>`; return; }
      if (R.looksSensitive(v)) { $('ar_checks').innerHTML = `<div class="check err">✕ <span>${esc(C.msg.sensitive)}</span></div>`; return; }
      closeDialog(); f(v);
    });
    $('ar_text').focus();
  }
  function editAmountDialog(lineId) {
    const s = state(), l = s.payment_lines.find(x => x.line_id === lineId); if (!l || !U.guard('payment.run')) return;
    openDialog(`<div class="dlg-h">${esc(PM.editAmountTitle(l.account_handle))}</div><div class="dlg-b"><div class="fields"><div class="field"><label for="ea_amt">${esc(PM.agreed)}</label><input id="ea_amt" type="number" min="0" step="0.01" value="${esc(l.agreed_amount)}"></div>
      <div class="field wide"><label for="ea_reason">${esc(PM.reason)}</label><input id="ea_reason" autocomplete="off"></div></div><div class="checks" id="ea_checks"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ea_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="ea_ok">${esc(C.common.save)}</button></div>`);
    $('ea_cancel').addEventListener('click', closeDialog);
    $('ea_ok').addEventListener('click', () => {
      const a = $('ea_amt').value, why = R.trim($('ea_reason').value), errs = [];
      if (!(Number(a) > 0)) errs.push({ msg: C.msg.payAmountPositive }); if (!why) errs.push({ msg: PM.reasonRequired }); if (R.looksSensitive(why)) errs.push({ msg: C.msg.sensitive });
      if (errs.length) { $('ea_checks').innerHTML = checksHTML({ errs, warns: [], infos: [] }, ''); return; }
      R.editLineAmount(state(), l, Number(a), why); closeDialog(); commit(PM.amountSaved); draw();
    });
  }
  /* Export PR (§4.7): unlocked → the six payee columns are filled in memory and dropped right after the download · locked → ask */
  async function exportPr(withDetails) {
    if (!U.guard('payment.run')) return;
    const s = state(), run = s.payment_runs.find(r => r.run_id === pv.run), vault = s.lookups.payee_vault, V = KT.vault;
    const needs = R.runLines(s, run.run_id).some(l => { const p = R.payeeOfLine(s, l); return p && p.secure; });
    if (withDetails === undefined && needs && vault && !V.isUnlocked(vault)) {
      openDialog(`<div class="dlg-h">${esc(PM.exportTitle(run.run_id))}</div><div class="dlg-b"><p style="margin-top:0">${esc(PM.exportLocked)}</p></div>
        <div class="dlg-f"><button type="button" class="btn" id="ex_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn" id="ex_without">${esc(PM.exportWithout)}</button>` +
        (can('payee.unlock') ? `<button type="button" class="btn primary" id="ex_unlock">${esc(PM.unlockExport)}</button>` : '') + `</div>`);
      $('ex_cancel').addEventListener('click', closeDialog);
      $('ex_without').addEventListener('click', () => { closeDialog(); exportPr(false); });
      if ($('ex_unlock')) $('ex_unlock').addEventListener('click', () => { closeDialog(); KT.payee.unlockDialog(() => exportPr(true)); });
      return;
    }
    let details = null;
    if (withDetails !== false && vault && V.isUnlocked(vault) && can('payee.unlock')) {
      details = new Map();
      for (const l of R.runLines(s, run.run_id)) { const p = R.payeeOfLine(s, l); if (p && p.secure && !details.has(p.payee_id)) details.set(p.payee_id, await V.decrypt(p.secure)); }
    }
    const missing = R.runLines(s, run.run_id).filter(l => l.status !== 'cancelled' && !((R.payeeOfLine(s, l) || {}).secure)).length;
    U.download(R.prFileName(run.pay_date), KT.xlsx.workbook(R.prSheets(s, run, details)), KT.xlsx.MIME);
    if (details) details.clear(); details = null;
    toast(PM.exported(R.prFileName(run.pay_date)) + (missing ? ' · ' + PM.missingBankN(missing) : ''));
  }
  function verifyPayee(payeeId) {
    if (!U.guard('payee.verify')) return;
    const p = R.payeeById(state(), payeeId); if (!p) return;
    Object.assign(p, { needs_verification: false, verified_at: new Date().toISOString(), verified_by: userId() }); commit(PY.verified); draw();
  }
  /* ===================== History · WHT certificates (§4.8) ===================== */
  function histRange(td) { const h = pv.hist; return h.preset === 'custom' && h.from && h.to ? [h.from, h.to] : R.dateRangePreset(h.preset, td); }
  function drawHistory(s, td) {
    const h = pv.hist, [from, to] = histRange(td), runs = (s.payment_runs || []).slice().sort((a, b) => b.run_id.localeCompare(a.run_id));
    const all = R.paidLines(s).filter(l => l.paid_date >= from && l.paid_date <= to && (!h.run || l.run_id === h.run)).map(l => R.payItem(s, td, { line: l })).filter(x => inScope(s, x));
    const notSent = R.whtNotSent(all.map(x => x.line)), list = h.wht ? all.filter(x => notSent.includes(x.line)) : all;
    pv.items = list; [...pv.selected].forEach(k => { if (!list.some(x => x.key === k)) pv.selected.delete(k); });
    const presets = R.PRESETS.concat(['custom']).map(k => `<button type="button" class="${h.preset === k ? 'on' : ''}" data-hpreset="${k}">${esc(C.overview.presets[k])}</button>`).join('');
    const canMark = can('payment.paid'), sel = pv.selected;
    const t = ['gross', 'wht', 'net'].map(k => R.round2(list.reduce((a, x) => a + x.tax[k], 0)));
    $('pm_body').innerHTML = `<div class="toolbar pm-row2"><div class="seg" role="group" aria-label="${esc(PM.paidDate)}">${presets}</div>` +
      (h.preset === 'custom' ? `<span class="pm-custom">${U.dateHTML('id="ph_from"', h.from || from, { label: C.overview.from })}<span>–</span>${U.dateHTML('id="ph_to"', h.to || to, { label: C.overview.to })}</span>` : `<span class="muted small">${esc(R.dmy(from))} – ${esc(R.dmy(to))}</span>`) +
      `<label class="tlab">${esc(PM.run)} <select id="ph_run">${optionsHTML(runs.map(r => r.run_id), h.run, PM.allRunsOpt)}</select></label><span class="spacer"></span>` +
      `<button type="button" class="btn small ghost" data-pact="whtcsv">${esc(PM.whtSummary)}</button><button type="button" class="btn small ghost" data-pact="csv">${esc(PM.csv)}</button></div>` +
      `<div class="qcards"><button type="button" class="qcard${h.wht ? ' on' : ''}" data-pact="whtq" aria-pressed="${h.wht}"><span class="n">${R.fmtNum(notSent.length)}</span><span class="t">${esc(PM.whtNotSent)}</span></button></div>` +
      (sel.size && canMark ? `<div class="toolbar pm-row2"><b>${esc(C.deal.selected(sel.size))}</b><button type="button" class="btn small primary" data-pact="whtsent">${esc(PM.markWhtSent)}</button><button type="button" class="btn small ghost" data-pact="clearsel">${esc(C.deal.clear)}</button></div>` : '') +
      (!list.length ? (pv.used.length ? U.noMatchHTML(PM.noHistoryMatch, pv.used) : `<div class="card empty"><b>${esc(PM.noHistory)}</b></div>`) : `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl"><thead><tr>${canMark ? `<th class="cb"><input type="checkbox" id="pm_all" aria-label="${esc(C.deal.selectAll)}"${list.every(x => sel.has(x.key)) ? ' checked' : ''}></th>` : ''}` +
        `<th>${esc(PM.paidDate)}</th><th>${esc(PM.run)}</th><th>${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th>${esc(PM.col.milestone)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th><th>${esc(PM.whtCert)}</th><th>${esc(PM.col.pic)}</th></tr></thead><tbody>` +
        list.map(x => { const l = x.line, name = x.kol ? x.kol.display_name : x.account_handle;
          return `<tr>${canMark ? `<td class="cb">${l.wht > 0 ? `<input type="checkbox" data-psel="${esc(x.key)}"${sel.has(x.key) ? ' checked' : ''} aria-label="${esc(name)}">` : ''}</td>` : ''}<td class="nowrap">${esc(R.dmy(l.paid_date))}</td>` +
            `<td>${l.run_id ? `<button type="button" class="link" data-prun="${esc(l.run_id)}">${esc(l.run_id)}</button>` : `<span class="muted small">${esc(PM.sources[l.source] || '')}</span>`}</td>` +
            `<td class="pm-kol"><b>${esc(name)}</b></td><td class="muted cph">${esc(x.project_label || '')}</td><td>${esc(C.pay.milestone[x.milestone] || x.milestone)}</td>` +
            `<td class="num">${money(l.gross)}</td><td class="num">${money(l.wht)} <span class="muted small">${l.wht_rate}%</span></td><td class="num"><b>${money(l.net)}</b></td>` +
            `<td>${l.wht > 0 ? (l.wht_cert_sent_date ? `✓ <span class="muted small">${esc(R.dmy(l.wht_cert_sent_date))}</span>` : `<span class="chip warn-chip">${esc(PM.notSent)}</span>`) : '<span class="muted">—</span>'}</td><td>${esc(x.pic || '')}</td></tr>`; }).join('') +
        `<tr class="total"><td colspan="${canMark ? 6 : 5}">${esc(PM.totalLine(list.length))}</td><td class="num">${money(t[0])}</td><td class="num">${money(t[1])}</td><td class="num">${money(t[2])}</td><td colspan="2"></td></tr></tbody></table></div>`);
    ['ph_from', 'ph_to'].forEach(id => { if ($(id)) $(id).addEventListener('change', e => { h[id === 'ph_from' ? 'from' : 'to'] = e.target.value; if (h.from && h.to && h.from <= h.to) draw(); }); });
    if ($('ph_run')) $('ph_run').addEventListener('change', e => { h.run = e.target.value; draw(); });
  }
  function whtSentDialog() {
    if (!U.guard('payment.paid')) return;
    const lines = pv.items.filter(x => pv.selected.has(x.key)).map(x => x.line).filter(l => l.wht > 0);
    openDialog(`<div class="dlg-h">${esc(PM.markWhtSentTitle(lines.length))}</div><div class="dlg-b"><div class="field"><label for="ws_date">${esc(PM.sentOn)}</label>${U.dateHTML('id="ws_date"', today(), { label: PM.sentOn })}</div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ws_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="ws_ok">${esc(PM.markWhtSent)}</button></div>`);
    $('ws_cancel').addEventListener('click', closeDialog);
    $('ws_ok').addEventListener('click', () => { const d = $('ws_date').value; if (!R.isISODate(d) || !U.guard('payment.paid')) return; R.markWhtSent(lines, d); pv.selected.clear(); closeDialog(); commit(PM.whtSentDone(lines.length)); draw(); });
  }
  function exportWht() {
    const s = state(), [from, to] = histRange(today()), lines = R.paidLines(s).filter(l => l.paid_date >= from && l.paid_date <= to);
    downloadCSV(`wht_summary_${from.replace(/-/g, '')}_${to.replace(/-/g, '')}.csv`, R.WHT_SUMMARY_COLS, R.whtSummary(s, lines).map(r => R.WHT_SUMMARY_COLS.map(k => r[k])));
  }

  /* ===================== Manual line · outside the app · cancel (§4.5, §4.8) ===================== */
  /* mo: the dialog's values (kept when "+ New payee" opens the Payee dialog in between) */
  function openManual(mo) {
    if (!U.guard('payment.manual')) return;
    const s = state(), S = R.paySettings(s.lookups), payees = (s.payee_profiles || []).slice().sort((a, b) => String(a.account_handle).localeCompare(String(b.account_handle)));
    const m = Object.assign({ source: 'affiliate', payee_id: '', campaign_id: '', project_label: '', agreed_amount: '', price_basis: 'gross', wht_rate: '', due_date: today(), pay_to: 'payee', reimburse_user: '', note: '' }, mo || {});
    const payee = () => R.payeeById(state(), $('mn_payee').value);
    const label = p => `${p.account_handle}${p.kol_id ? ` · KOL` : ''}${p.secure ? ` · ${p.bank_name || ''} ···${p.account_last4}` : ''}`;
    const users = (s.users || []).filter(u => u.active !== false);
    openDialog(`<div class="dlg-h">${esc(PM.manualTitle)}</div><div class="dlg-b"><div class="fields">
        <div class="field"><label for="mn_src">${esc(PM.source)}</label><select id="mn_src">${optionsHTML(['affiliate', 'other'].map(k => ({ value: k, label: PM.sources[k] })), m.source)}</select></div>
        <div class="field wide"><label for="mn_payee">${esc(PM.payee)} <span class="req">*</span></label><div class="pm-payeepick"><select id="mn_payee">${optionsHTML(payees.map(p => ({ value: p.payee_id, label: label(p) })), m.payee_id, PM.choosePayee)}</select>` +
        `<button type="button" class="btn small" id="mn_newpayee">${esc(PM.newPayee)}</button></div><div class="hint" id="mn_payeeinfo"></div></div>
        <div class="field"><label for="mn_camp">${esc(PM.campaign)}</label><select id="mn_camp">${U.campaignOptionsHTML(m.campaign_id, PM.noCampaign)}</select></div>
        <div class="field"><label for="mn_proj">${esc(PM.project)}</label><input id="mn_proj" value="${esc(m.project_label)}" autocomplete="off" placeholder="${esc(PM.projectPh)}"></div>
        <div class="field"><label for="mn_amt">${esc(PM.agreed)} <span class="req">*</span></label><input id="mn_amt" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(m.agreed_amount)}"></div>
        <div class="field"><label for="mn_basis">${esc(PY.basis)}</label><select id="mn_basis">${optionsHTML(R.PRICE_BASES.map(b => ({ value: b, label: PY.bases[b] })), m.price_basis)}</select></div>
        <div class="field"><label for="mn_wht">${esc(PM.whtRate)}</label><select id="mn_wht">${optionsHTML(S.wht_rates.map(r => ({ value: String(r), label: `${r}%` })), m.wht_rate || String(S.default_wht_individual))}</select></div>
        <div class="field"><label for="mn_due">${esc(PM.col.due)} <span class="req">*</span></label>${U.dateHTML('id="mn_due"', m.due_date, { label: PM.col.due })}</div>
        <div class="field"><label for="mn_payto">${esc(PM.payTo)}</label><select id="mn_payto">${optionsHTML([{ value: 'payee', label: PM.payToPayee }, { value: 'reimburse', label: PM.payToReimburse }], m.pay_to)}</select></div>
        <div class="field hidden" id="mn_userW"><label for="mn_user">${esc(PM.reimburseUser)}</label><select id="mn_user">${optionsHTML(users.map(u => ({ value: u.user_id, label: u.display_name })), m.reimburse_user, PM.chooseUser)}</select></div>
        <div class="field wide"><label for="mn_note">${esc(PM.note)}</label><input id="mn_note" value="${esc(m.note)}" autocomplete="off"></div>
      </div><div id="mn_tax"></div><div class="checks" id="mn_checks" style="margin-top:8px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="mn_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="mn_ok">${esc(PM.addManualOk)}</button></div>`, 'mid');
    U.enhanceCombos($('dlg'));
    const read = () => ({ source: $('mn_src').value, payee_id: $('mn_payee').value, campaign_id: $('mn_camp').value, project_label: $('mn_proj').value, agreed_amount: $('mn_amt').value, price_basis: $('mn_basis').value,
      wht_rate: $('mn_wht').value, due_date: $('mn_due').value, pay_to: $('mn_payto').value, reimburse_user: $('mn_user').value, note: $('mn_note').value });
    let lastPayee = m.payee_id, touched = !!mo;
    const chk = () => {
      const v = read(), p = payee();
      if (p && v.payee_id !== lastPayee) { lastPayee = v.payee_id; if (p.default_wht_rate != null) $('mn_wht').value = String(p.default_wht_rate); if (p.price_basis) $('mn_basis').value = p.price_basis; return chk(); }
      $('mn_userW').classList.toggle('hidden', v.pay_to !== 'reimburse');
      $('mn_payeeinfo').innerHTML = !p ? '' : p.secure ? esc(PY.bankLine(p.bank_name, p.account_last4)) : `<span class="warn">${esc(PY.missing(PY.missingBank))}</span>`;
      const res = R.validateManual(state(), v), t = !(Number(v.agreed_amount) > 0) ? null : R.taxOf(state(), v, p);
      $('mn_tax').innerHTML = t ? taxBox(t, v.price_basis === 'net' ? R.round2(t.gross - Number(v.agreed_amount)) : 0) : '';
      $('mn_checks').innerHTML = touched ? checksHTML(res, '') : ''; return res;
    };
    const touch = () => { touched = true; chk(); };
    ['mn_src', 'mn_payee', 'mn_camp', 'mn_proj', 'mn_amt', 'mn_basis', 'mn_wht', 'mn_due', 'mn_payto', 'mn_user', 'mn_note'].forEach(id => { $(id).addEventListener('input', touch); $(id).addEventListener('change', touch); });
    $('mn_newpayee').addEventListener('click', () => { const keep = read(); closeDialog(); KT.payee.openDialog({ newPayee: true, onSaved: rec => openManual(Object.assign(keep, { payee_id: rec.payee_id })) }); });
    $('mn_cancel').addEventListener('click', closeDialog);
    $('mn_ok').addEventListener('click', () => {
      touched = true;
      if (chk().errs.length || !U.guard('payment.manual')) return;
      const s2 = state(), line = R.newManualLine(s2, Object.assign(read(), { lineId: store.newId('line'), user: userId(), now: new Date().toISOString() }));
      s2.payment_lines.push(line); s2.deal_events.push(paymentEvent(line, null, 'open', null));
      closeDialog(); commit(PM.manualAdded(line.line_id)); pv.tab = 'topay'; draw();
    });
    chk();
  }
  function outsideDialog() {
    if (!U.guard('payment.paid')) return;
    const items = pv.items.filter(x => pv.selected.has(x.key));
    openDialog(`<div class="dlg-h">${esc(PM.outsideTitle(items.length))}</div><div class="dlg-b"><p class="hint" style="margin-top:0">${esc(PM.outsideHint)}</p><div class="fields">
        <div class="field"><label for="po_date">${esc(PM.paidOnDate)}</label>${U.dateHTML('id="po_date"', today(), { label: PM.paidOnDate })}</div>
        <div class="field wide"><label for="po_note">${esc(PM.note)} <span class="req">*</span></label><input id="po_note" autocomplete="off"></div></div><div class="checks" id="po_checks"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="po_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="po_ok">${esc(PM.paidOutside)}</button></div>`);
    $('po_cancel').addEventListener('click', closeDialog);
    $('po_ok').addEventListener('click', () => {
      const d = $('po_date').value, note = R.trim($('po_note').value), errs = [];
      if (!R.isISODate(d)) errs.push({ msg: C.msg.dateInvalid(PM.paidOnDate) }); if (!note) errs.push({ msg: PM.noteRequired }); if (R.looksSensitive(note)) errs.push({ msg: C.msg.sensitive });
      if (errs.length) { $('po_checks').innerHTML = checksHTML({ errs, warns: [], infos: [] }, ''); return; }
      if (!U.guard('payment.paid')) return;
      const s = state(), evs = R.markPaidOutside(s, items, d, note, ctxOf()); s.deal_events.push(...evs);
      pv.selected.clear(); closeDialog(); commit(PM.outsideDone(items.length)); draw();
    });
  }
  function cancelLinesDialog() {
    if (!U.guard('payment.run')) return;
    const items = pv.items.filter(x => pv.selected.has(x.key));
    askReason(PM.cancelTitle(items.length), PM.cancelLine, why => { const s = state(), evs = R.cancelLines(s, items, why, ctxOf()); s.deal_events.push(...evs); pv.selected.clear(); commit(PM.cancelledN(items.length)); draw(); });
  }

  /* ===================== events ===================== */
  function onBodyClick(e) {
    if (e.target.closest('[data-clearfilters]')) { clearAll(); return; }
    const hp = e.target.closest('[data-hpreset]'); if (hp) { Object.assign(pv.hist, { preset: hp.dataset.hpreset }); if (hp.dataset.hpreset === 'custom') { const [a, z] = R.dateRangePreset('this_month', today()); pv.hist.from = pv.hist.from || a; pv.hist.to = pv.hist.to || z; } draw(); return; }
    const qc = e.target.closest('[data-pqueue]'); if (qc) { pv.queue = pv.queue === qc.dataset.pqueue ? null : qc.dataset.pqueue; pv.selected.clear(); draw(); return; }
    const rq = e.target.closest('[data-preq]'); if (rq) { openRequest(pv.items.find(x => x.key === rq.dataset.preq)); return; }
    const py = e.target.closest('[data-ppayee]');
    if (py) { if (py.dataset.ppayee) KT.payee.openDialog({ kolId: py.dataset.ppayee, onSaved: draw }); else if (py.dataset.ppayeeid) KT.payee.openDialog({ payeeId: py.dataset.ppayeeid, onSaved: draw }); return; }
    const po = e.target.closest('[data-pposts]'); if (po) { U.go('deals', { deal: po.dataset.pposts }); return; }
    const pd = e.target.closest('[data-pdeal]'); if (pd) { U.go('deals', { deal: pd.dataset.pdeal }); return; }
    if (e.target.id === 'pm_all') { const on = e.target.checked; pv.items.forEach(x => (on ? pv.selected.add(x.key) : pv.selected.delete(x.key))); draw(); return; }
    const cb = e.target.closest('[data-psel]'); if (cb) { cb.checked ? pv.selected.add(cb.dataset.psel) : pv.selected.delete(cb.dataset.psel); draw(); return; }
    const rn = e.target.closest('[data-prun]'); if (rn) { pv.run = rn.dataset.prun; pv.selected.clear(); draw(); window.scrollTo(0, 0); return; }
    const gt = e.target.closest('[data-pgoto]'); if (gt) { const r = $('pmline_' + gt.dataset.pgoto); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1200); } return; }
    const vf = e.target.closest('[data-pverify]'); if (vf) { verifyPayee(vf.dataset.pverify); return; }
    const rm = e.target.closest('[data-plremove]'); if (rm) { const s = state(), l = s.payment_lines.find(x => x.line_id === rm.dataset.plremove); if (l && U.guard('payment.run')) { s.deal_events.push(...R.removeFromRun(s, l, ctxOf())); commit(PM.removed); draw(); } return; }
    const ed = e.target.closest('[data-pledit]'); if (ed) { editAmountDialog(ed.dataset.pledit); return; }
    const bk = e.target.closest('[data-plback]'); if (bk) { const id = bk.dataset.plback; askReason(PM.moveBack, PM.moveBack, why => { const s = state(), l = s.payment_lines.find(x => x.line_id === id); if (!l || !U.guard('payment.run')) return; s.deal_events.push(...R.removeFromRun(s, l, ctxOf(), why)); l.note = [l.note, why].filter(Boolean).join(' · '); commit(PM.movedBack); draw(); }); return; }
    const ud = e.target.closest('[data-plundo]'); if (ud) { const id = ud.dataset.plundo; askReason(PM.undoPaid, PM.undoPaid, why => { const s = state(), l = s.payment_lines.find(x => x.line_id === id); if (!l || !U.guard('payment.reopen')) return; s.deal_events.push(...R.undoPaid(s, l, why, ctxOf())); commit(PM.undone); draw(); }); return; }
    const ls = e.target.closest('[data-plsel]'); if (ls) { ls.checked ? pv.selected.add(ls.dataset.plsel) : pv.selected.delete(ls.dataset.plsel); draw(); return; }
    const pr = e.target.closest('[data-plprint]'); if (pr) { const l = state().payment_lines.find(x => x.line_id === pr.dataset.plprint); if (l && can('payment.run')) { l.printed = pr.checked; commit(); } return; }
    const a = e.target.closest('[data-pact]'); if (a) { const fn = (pv.actions || {})[a.dataset.pact] || ACTIONS[a.dataset.pact]; if (fn) fn(a); }
  }
  function onBodyChange(e) { if (e.target.id === 'pm_group') { pv.groupBy = e.target.value; pref.set('paygroup', pv.groupBy); draw(); } }
  const ACTIONS = {
    clearsel: () => { pv.selected.clear(); draw(); },
    csv: () => exportCsv(),
    addrun: () => addSelectedToRun(),
    newrun: () => newRunNow(true),
    backruns: () => { pv.run = null; pv.selected.clear(); draw(); },
    addlines: () => { pv.addTo = pv.run; pv.tab = 'topay'; pv.selected.clear(); render(); },
    submit: () => submitRun(),
    markpaid: () => markPaidDialog(null),
    markpaidsel: () => markPaidDialog([...pv.selected]),
    reopen: () => { if (!U.guard('payment.reopen')) return; const s = state(), run = s.payment_runs.find(r => r.run_id === pv.run); s.deal_events.push(...R.reopenRun(s, run, ctxOf())); commit(PM.reopened); draw(); },
    close: () => { if (!U.guard('payment.paid')) return; const run = state().payment_runs.find(r => r.run_id === pv.run); run.status = 'closed'; commit(PM.closed(run.run_id)); draw(); },
    export: () => exportPr(),
    manual: () => openManual(),
    outside: () => outsideDialog(),
    cancellines: () => cancelLinesDialog(),
    whtq: () => { pv.hist.wht = !pv.hist.wht; pv.selected.clear(); draw(); },
    whtsent: () => whtSentDialog(),
    whtcsv: () => exportWht(),
  };
  /* Payments CSV — no personal data */
  function exportCsv() {
    const s = state(), rows = (pv.tab !== 'runs' ? pv.items : (s.payment_lines || []).map(l => R.payItem(s, today(), { line: l })));
    downloadCSV(`payments_${today().replace(/-/g, '')}.csv`, ['line_id', 'run_id', 'campaign', 'kol', 'milestone', 'gross', 'vat', 'wht', 'net', 'status', 'paid_date', 'pic'],
      rows.map(x => [x.line ? x.line.line_id : '', x.run_id || '', R.campaignName(s, x.campaign_id) || x.project_label || '', x.kol ? x.kol.display_name : x.account_handle, x.milestone, x.tax.gross, x.tax.vat, x.tax.wht, x.tax.net, x.status, x.paid_date || '', x.pic || '']));
  }
  function reset() { Object.assign(pv, { f: { campaign: '', source: '', q: '' }, picUser: null, queue: null, run: null }); pv.selected.clear(); }

  return { render, reset, openRequest, payItemsOfDeal: (s, d) => R.dealPayItems(s, d, today()), _pv: pv, _draw: () => draw(), money, statusChip, paymentEvent, taxBox };
})();
