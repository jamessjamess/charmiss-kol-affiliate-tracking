/* screen-payments.js — CR-08 Payments (side menu, between Deals and KOL Master): header with Due now · In runs · Paid this month,
   tabs To pay · Runs · History (remembered), one scope bar for the three (PIC · Campaign · Source · Search · Clear all filters).
   To pay = every instalment owed or coming (worked out from the deals until it goes into a run) + manual lines · queue cards ·
   table grouped by Readiness / Amount / PIC / Campaign (each group folds · Expand all / Collapse all, remembered per person) ·
   one Status column with "Missing n" (a list of what is missing, each opens where to fix it) — CR-09 §4.14.
   CR-11 §4.9: no Request step (owed + documents = Ready) · ⋯ Hold (a reason) / Release · header Ready · Missing docs · On hold · each tab has its own
   filters (To pay: PIC · Campaign · Source · Status · Search — Payment runs: Run status · Pay date · Search — Accounting: View · Pay date · Search) ·
   the Accounting tab only for Admin · Accounting · KOL Manager (read only).
   CR-17 §4.2 — Simple mode (Settings › Operations mode): tabs To pay · Sent · Paid · Mark paid on the row (the KOL team records it) · Export for accounting →
   Sent · Mark unpaid · documents never block · the same lines and runs as Full mode.
   CR-27 §3.2 — a row (outside its buttons) opens Payment details (Amount · Pay to · Status To pay → Sent → Paid · Documents checklist · History · ‹ ›) ·
   Docs n/m opens it at Documents · To pay: Mark paid + Send on the row · bulk Send to accounting · Mark paid · Mark docs received · a deal opens on this page. → KT.screens.payments */
KT.screens.payments = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, state, pref, commit, toast, can, openDialog, closeDialog, checksHTML, optionsHTML, downloadCSV, store, userId, takeParams, ICON } = U;
  const PM = C.pay, PY = C.payee;
  const TABS = ['topay', 'runs', 'accounting'];   // CR-09 §4.15: To pay · Payment runs · Accounting (History lives in Accounting › Paid)
  const TABS_SIMPLE = ['topay', 'sent', 'paid'];   // CR-17 §4.2: Simple mode
  const simple = () => R.isSimple(state(), 'payments');
  const tabsNow = () => (simple() ? TABS_SIMPLE : TABS);
  /* a tab (or an old link) of the other mode → the nearest one of this mode */
  const mapTab = t => (simple() ? ({ runs: 'topay', accounting: 'sent', history: 'paid' }[t] || (TABS_SIMPLE.includes(t) ? t : 'topay'))
    : ({ sent: 'runs', paid: 'accounting', history: 'accounting' }[t] || (TABS.includes(t) ? t : 'topay')));
  const SCOPED_TABS = ['topay', 'sent', 'paid'];   // the To pay filters (PIC · Campaign · Source · Search) serve Sent and Paid too
  const GROUPS = ['readiness', 'amount', 'pic', 'campaign'];
  const DUE = ['ready', 'missing_docs', 'on_hold', 'in_run', 'submitted'];
  const QUEUES = ['ready', 'missing', 'hold', 'upcoming', 'check'];
  const QUEUES_SIMPLE = ['due', 'hold', 'upcoming', 'check'];   // CR-17: documents do not block — Ready and Missing docs are one Due
  const ACC_VIEWS = ['transfer', 'wht', 'paid'];
  /* CR-11 §4.9 — the Accounting tab: Admin · Accounting · KOL Manager (read only) */
  const accOk = () => ['admin', 'accounting', 'kol_manager'].includes((U.actor() || {}).role);
  const pv = { tab: (v => (v === 'history' ? 'accounting' : TABS.includes(v) || TABS_SIMPLE.includes(v) ? v : 'topay'))(pref.get('paytab', 'topay')), runFilter: '', wsel: new Set(), f: { campaign: '', source: '', q: '' }, pic: null, picUser: null,
    queue: null, groupBy: (v => (v === 'band' ? 'amount' : GROUPS.includes(v) ? v : 'readiness'))(pref.get('paygroup', 'readiness')), selected: new Set(), items: [], run: null,
    hist: { preset: 'this_month', from: '', to: '', run: '', wht: false },
    rf: { from: '', to: '', q: '' },   // Payment runs: pay date range · search
    af: { view: (v => (ACC_VIEWS.includes(v) ? v : 'transfer'))(pref.get('payaccview', 'transfer')), from: '', to: '', q: '' } };   // Accounting
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
    const p = takeParams('payments'), was = pv.tab;
    if (p) {
      if (p.campaign !== undefined) pv.f.campaign = p.campaign || '';
      if (p.pic !== undefined) choosePic(p.pic);
      if (p.queue !== undefined) pv.queue = p.queue;
      if (p.tab) pv.tab = p.tab === 'history' ? 'accounting' : p.tab;
      if (p.run !== undefined) { pv.run = p.run; if (!p.tab) pv.tab = 'runs'; }
    }
    if (id === 'history') id = 'accounting';   // an old link #payments/history
    if (id && (TABS.includes(id) || TABS_SIMPLE.includes(id))) pv.tab = id;
    if (simple()) { if (p && p.run) { pv.f.q = p.run; pv.tab = 'sent'; $('pm_tools').dataset.built = ''; } pv.run = null; }   // CR-17: a run → Sent, searched
    pv.tab = mapTab(pv.tab);
    if (pv.tab === 'accounting' && !accOk()) pv.tab = 'topay';
    if (pv.tab !== was && !(p && p.run !== undefined)) { pv.run = null; pv.selected.clear(); }   // another tab (a link · Switch user) starts on its list
    pref.set('paytab', pv.tab);
    U.setHash('payments/' + pv.tab);
    draw();
  }
  function build(sec) {
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(PM.title)}</h1><span class="spacer"></span><span class="pm-sum" id="pm_sum"></span></div><div id="pm_golive"></div>
      <div class="stabs dtabs" id="pm_tabs" role="tablist"></div>
      <div class="toolbar" id="pm_tools"></div><div class="fchips hidden" id="pm_chips"></div><div id="pm_body"></div>`;
    $('pm_tabs').addEventListener('click', e => { const b = e.target.closest('[data-ptab]'); if (b) { pv.tab = b.dataset.ptab; pv.queue = null; pv.run = null; pv.selected.clear(); pv.wsel.clear(); render(); } });
    KT.vault.onChange(() => { if (U.currentTab() === 'payments' && pv.tab === 'accounting') draw(); });
    $('pm_tools').addEventListener('change', onToolsChange);
    let qT; $('pm_tools').addEventListener('input', e => { if (e.target.id !== 'pm_q') return; clearTimeout(qT); qT = setTimeout(() => { (SCOPED_TABS.includes(pv.tab) ? pv.f : pv.tab === 'runs' ? pv.rf : pv.af).q = e.target.value; draw(); }, 150); });
    $('pm_chips').addEventListener('click', e => {
      if (e.target.closest('[data-clearfilters]')) { clearAll(); return; }
      const b = e.target.closest('[data-unset]'); if (!b) return;
      const k = b.dataset.unset; if (k === 'pic') choosePic('all'); else if (k === 'queue') pv.queue = null; else if (k === 'runst') pv.runFilter = '';
      else if (k === 'range') Object.assign(pv.tab === 'runs' ? pv.rf : pv.af, { from: '', to: '' }); else pv.f[k] = '';
      $('pm_tools').dataset.built = ''; draw();
    });
    $('pm_body').addEventListener('click', onBodyClick);
    $('pm_body').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-pkey]')) { e.preventDefault(); openDetails(e.target.dataset.pkey, { opener: e.target }); } });   // CR-27: a row → Payment details
    $('pm_body').addEventListener('change', onBodyChange);
    sec.dataset.built = '1';
  }
  function draw() {
    if ($('pm_golive')) $('pm_golive').innerHTML = KT.golive ? KT.golive.bannerHTML() : '';   // CR-11 §4.7
    const s = state(), td = today();
    pv.tab = mapTab(pv.tab);
    if (pv.tab === 'accounting' && !accOk()) pv.tab = 'topay';
    /* the tabs of the mode (Settings › Operations mode may have changed it) */
    const mode = simple() ? 'simple' : 'full';
    if ($('pm_tabs').dataset.mode !== mode) { $('pm_tabs').innerHTML = tabsNow().map(t => `<span class="ptab-w"><button type="button" role="tab" data-ptab="${t}" title="${esc(PM.tabTip[t])}">${esc(PM.tabs[t])}</button></span>`).join(''); $('pm_tabs').dataset.mode = mode; $('pm_tools').dataset.built = ''; }
    document.querySelectorAll('#pm_tabs [data-ptab]').forEach(b => { const on = b.dataset.ptab === pv.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
      b.closest('.ptab-w').classList.toggle('hidden', b.dataset.ptab === 'accounting' && !accOk()); });
    const q = R.payQueue(s, td);
    pv.queue_ = q;
    drawSummary(s, q, td);
    drawTools(s);
    if (pv.tab === 'topay') drawToPay(s, q, td);
    else if (pv.tab === 'runs') drawRuns(s, td);
    else if (pv.tab === 'sent') drawSent(s, q, td);   // CR-17
    else if (pv.tab === 'paid') drawPaid(s, td);
    else drawAccounting(s, td);
  }
  /* To pay: Ready · Missing docs · On hold (gross, in the filters of the tab · a click filters) — the other tabs: In runs · Paid this month */
  function drawSummary(s, q, td) {
    drawSummary0(s, q, td);
    /* CR-20 §4.8 — what was paid for packages and is not used yet (in no Campaign) */
    if ((s.kol_packages || []).length) $('pm_sum').insertAdjacentHTML('beforeend', `<span class="sep">·</span><span class="pm-pkgbal" title="${esc(C.pkg.balanceTip)}">${esc(C.pkg.balance)} <b>${esc(R.baht(R.packageBalance(s)))}</b></span>`);
  }
  function drawSummary0(s, q, td) {
    const sum = list => R.round2(list.reduce((a, x) => a + x.tax.gross, 0)), month = td.slice(0, 7);
    /* CR-17 §4.2 — Simple: Due now · Sent, not yet paid · Paid this month (a click = that tab) */
    if (simple()) {
      const scoped = q.items.filter(x => inScope(s, x)), paid = (s.payment_lines || []).filter(l => l.status === 'paid' && String(l.paid_date || '').slice(0, 7) === month).map(l => R.payItem(s, td, { line: l })).filter(x => inScope(s, x));
      const b = (t, label, v) => `<button type="button" class="pm-sumb${pv.tab === t ? ' on' : ''}" data-ptabgo="${t}">${esc(label)} <b>฿${money(v)}</b></button>`;
      $('pm_sum').innerHTML = b('topay', PS.sumDue, sum(scoped.filter(x => ['ready', 'missing_docs', 'in_run'].includes(x.status)))) + `<span class="sep">·</span>` +
        b('sent', PS.sumSent, sum(scoped.filter(x => x.status === 'submitted'))) + `<span class="sep">·</span>` + b('paid', PS.sumPaid, sum(paid));
      return;
    }
    if (pv.tab === 'topay') {
      const scoped = q.items.filter(x => inScope(s, x)), b = (k, label, st) => `<button type="button" class="pm-sumb${pv.queue === k ? ' on' : ''}" data-pqueue="${k}">${esc(label)} <b>฿${money(sum(scoped.filter(x => x.status === st)))}</b></button>`;
      $('pm_sum').innerHTML = b('ready', PM.sumReady, 'ready') + `<span class="sep">·</span>` + b('missing', PM.sumMissing, 'missing_docs') + `<span class="sep">·</span>` + b('hold', PM.sumHold, 'on_hold');
      return;
    }
    const paidMonth = (s.payment_lines || []).filter(l => l.status === 'paid' && String(l.paid_date || '').slice(0, 7) === month).reduce((a, l) => a + (l.gross || 0), 0);
    $('pm_sum').innerHTML = `${esc(PM.inRuns)} <b>${esc(R.baht(sum(q.items.filter(x => x.status === 'in_run' || x.status === 'submitted'))))}</b><span class="sep">·</span>${esc(PM.paidMonth)} <b>${esc(R.baht(R.round2(paidMonth)))}</b>`;
  }
  /* CR-11 §4.9 — each tab its own filters (kept while you move between tabs) · Clear all filters clears that tab only */
  function drawTools(s) {
    const tools = $('pm_tools'), focused = document.activeElement && document.activeElement.id === 'pm_q', tab = pv.tab;
    const range = (from, to) => `<label class="tlab">${esc(PM.payDateRange)} ${U.rangeHTML('id="pm_prange"', from, to, { label: PM.payDateRange, clearable: true })}</label>`;
    if (!tools.dataset.built || tools.dataset.tab !== tab || !focused) {
      if (SCOPED_TABS.includes(tab)) {
        const me = myPic(), names = R.picNames(s, true), v = picSel();
        const picOpts = (me ? `<option value="me">${esc(C.deal.picMe(me))}</option>` : '') + `<option value="all">${esc(C.deal.allPics)}</option>` +
          names.filter(n => n !== me).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + `<option value="__none">${esc(C.deal.unassigned)}</option>`;
        tools.innerHTML = `<label class="tlab">${esc(PM.pic)} <select id="pm_pic">${picOpts}</select></label>` +
          `<select id="pm_camp" aria-label="${esc(PM.campaign)}" data-combo="campaign">${U.campaignOptionsHTML(pv.f.campaign, PM.allCampaigns)}</select>` +
          `<label class="tlab">${esc(PM.source)} <select id="pm_src">${optionsHTML(['deal', 'package', 'affiliate', 'other'].map(k => ({ value: k, label: PM.sources[k] })), pv.f.source, PM.allSources)}</select></label>` +
          (tab === 'topay' ? `<label class="tlab">${esc(PM.statusL)} <select id="pm_status">${optionsHTML((simple() ? QUEUES_SIMPLE : QUEUES).map(k => ({ value: k, label: (simple() ? PS.filterStatus : PM.filterStatus)[k] })), pv.queue || '', PM.statusAll)}</select></label>` : '') +
          (tab === 'topay' && simple() ? `<label class="tlab">${esc(RD.filter)} <select id="pm_ready">${optionsHTML([{ value: 'ready', label: RD.ready }, { value: 'not', label: RD.notReady }], pv.f.ready || '', RD.all)}</select></label>` : '') +   // CR-32 §2.5
          `<input type="search" class="search" id="pm_q" placeholder="${esc(PM.search)}" value="${esc(pv.f.q)}" autocomplete="off">`;
        $('pm_pic').value = v;
      } else if (tab === 'runs') {
        const keys = ['draft', 'returned', 'with_accounting', 'paid', 'closed'];
        tools.innerHTML = `<label class="tlab">${esc(PM.statusL)} <select id="pm_runst">${optionsHTML(keys.map(k => ({ value: k, label: PM.runStatus[k] })), pv.runFilter, PM.runFilterAll)}</select></label>` +
          range(pv.rf.from, pv.rf.to) + `<input type="search" class="search" id="pm_q" placeholder="${esc(PM.runSearch)}" value="${esc(pv.rf.q)}" autocomplete="off">`;
      } else {
        tools.innerHTML = `<label class="tlab">${esc(PM.view)} <select id="pm_view">${optionsHTML(ACC_VIEWS.map(k => ({ value: k, label: PM.accViews[k] })), pv.af.view)}</select></label>` +
          (pv.af.view === 'paid' ? '' : range(pv.af.from, pv.af.to)) + `<input type="search" class="search" id="pm_q" placeholder="${esc(PM.accSearch)}" value="${esc(pv.af.q)}" autocomplete="off">`;
      }
      U.enhanceCombos(tools); tools.dataset.built = '1'; tools.dataset.tab = tab;
    }
    const chips = [], dr = (a, z) => (a && z ? `${PM.payDateRange}: ${R.dmy(a)} – ${R.dmy(z)}` : '');
    let n = 0;
    if (SCOPED_TABS.includes(tab)) {
      const v = picSel(), me = myPic();
      if (pv.f.campaign) chips.push(['campaign', `${PM.campaign}: ${R.campaignName(s, pv.f.campaign)}`]);
      if (v !== 'all') chips.push(['pic', `${PM.pic}: ${v === 'me' ? C.deal.picMe(me) : v === '__none' ? C.deal.unassigned : v}`]);
      if (pv.f.source) chips.push(['source', `${PM.source}: ${PM.sources[pv.f.source]}`]);
      if (pv.queue && tab === 'topay') chips.push(['queue', `${PM.statusL}: ${(simple() ? PS.filterStatus : PM.filterStatus)[pv.queue] || pv.queue}`]);
      if (pv.f.ready && tab === 'topay' && simple()) chips.push(['ready', `${RD.filter}: ${pv.f.ready === 'ready' ? RD.ready : RD.notReady}`]);
      n = chips.length + (R.trim(pv.f.q) ? 1 : 0);
      pv.used = chips.map(c => c[1]).concat(R.trim(pv.f.q) ? [`"${R.trim(pv.f.q)}"`] : []);
    } else if (tab === 'runs') {
      if (pv.runFilter) chips.push(['runst', `${PM.statusL}: ${PM.runStatus[pv.runFilter]}`]);
      if (pv.rf.from) chips.push(['range', dr(pv.rf.from, pv.rf.to)]);
      n = chips.length + (R.trim(pv.rf.q) ? 1 : 0);
      pv.used = chips.map(c => c[1]).concat(R.trim(pv.rf.q) ? [`"${R.trim(pv.rf.q)}"`] : []);
    } else {
      if (pv.af.from && pv.af.view !== 'paid') chips.push(['range', dr(pv.af.from, pv.af.to)]);
      n = chips.length + (R.trim(pv.af.q) ? 1 : 0);
      pv.used = chips.map(c => c[1]).concat(R.trim(pv.af.q) ? [`"${R.trim(pv.af.q)}"`] : []);
    }
    U.filterChips($('pm_chips'), chips, n);
  }
  function clearAll() {
    if (SCOPED_TABS.includes(pv.tab)) { pv.f = { campaign: '', source: '', q: '' }; choosePic('all'); pv.queue = null; }
    else if (pv.tab === 'runs') { pv.runFilter = ''; pv.rf = { from: '', to: '', q: '' }; }
    else pv.af = Object.assign(pv.af, { from: '', to: '', q: '' });
    const q = $('pm_q'); if (q) q.value = ''; $('pm_tools').dataset.built = ''; draw();
  }
  function onToolsChange(e) {
    const t = e.target;
    if (t.id === 'pm_pic') choosePic(t.value);
    else if (t.id === 'pm_camp') pv.f.campaign = t.value;
    else if (t.id === 'pm_src') pv.f.source = t.value;
    else if (t.id === 'pm_status') pv.queue = t.value || null;
    else if (t.id === 'pm_ready') pv.f.ready = t.value || '';
    else if (t.id === 'pm_runst') pv.runFilter = t.value;
    else if (t.id === 'pm_view') { pv.af.view = t.value; pref.set('payaccview', t.value); $('pm_tools').dataset.built = ''; }
    else if (t.id === 'pm_prange') { const x = t.dataset, f = pv.tab === 'runs' ? pv.rf : pv.af; Object.assign(f, R.isISODate(x.from) && R.isISODate(x.to) ? { from: x.from, to: x.to } : { from: '', to: '' }); $('pm_tools').dataset.built = ''; }
    else return;
    pv.selected.clear(); draw();
  }
  /* the words a search looks in (KOL · @handle · payee · deal · line · run) */
  const matchQ = (x, q) => !q || [x.kol && x.kol.display_name, x.account_handle, x.payee && x.payee.payee_id, x.deal_id, x.line && x.line.line_id, x.run_id || (x.line && x.line.run_id)].some(v => String(v || '').toLowerCase().includes(q.replace(/^@/, '')));
  /* the scope of To pay (the other tabs use their own filters) */
  function inScope(s, x) {
    const pic = picFilter(), q = R.trim(pv.f.q).toLowerCase();
    if (pic && (pic === '__none' ? !!x.pic : x.pic !== pic)) return false;
    if (pv.f.campaign && x.campaign_id !== pv.f.campaign) return false;
    if (pv.f.source && (pv.f.source === 'deal' ? !(x.source === 'deal' || x.source === 'legacy') : x.source !== pv.f.source)) return false;
    return matchQ(x, q);
  }

  /* ===================== To pay ===================== */
  function drawToPay(s, q, td) {
    const scoped = q.items.filter(x => inScope(s, x)), checks = q.checks.filter(c => inScope(s, { pic: c.deal.pic, campaign_id: c.deal.campaign_id, source: 'deal', deal_id: c.deal.deal_id, kol: R.kolById(s, c.deal.kol_id) }));
    const cards = R.payCards(scoped, checks, td), end = R.addDays(td, 14);
    if (simple()) { drawToPaySimple(s, q, td, scoped, checks, cards, end); return; }
    const list = pv.queue === 'ready' ? scoped.filter(x => x.status === 'ready') : pv.queue === 'missing' ? scoped.filter(x => x.status === 'missing_docs')
      : pv.queue === 'hold' ? scoped.filter(x => x.status === 'on_hold') : pv.queue === 'upcoming' ? scoped.filter(x => x.status === 'not_due' && x.due_date && x.due_date >= td && x.due_date <= end) : scoped.filter(x => DUE.includes(x.status));
    pv.items = list;
    [...pv.selected].forEach(k => { if (!list.some(x => x.key === k)) pv.selected.delete(k); });
    const card = (k, c) => `<button type="button" class="qcard${pv.queue === k ? ' on' : ''}" data-pqueue="${k}" aria-pressed="${pv.queue === k}"><span class="n">${R.fmtNum(c.n)}</span><span class="t">${esc(PM.cards[k])}${c.gross != null ? ` · ${esc(R.baht(c.gross))}` : ''}</span></button>`;
    const bulk = bulkHTML();
    pv.emptyNote = !q.items.some(x => DUE.includes(x.status)) ? PM.emptyTopay : null;
    $('pm_body').innerHTML = `<div class="qcards">${card('ready', cards.ready)}${card('missing', cards.missing)}${card('hold', cards.hold)}${card('upcoming', cards.upcoming)}${card('check', cards.check)}</div>
      <div class="toolbar pm-row2"><label class="tlab">${esc(C.deal.groupBy)} <select id="pm_group">${GROUPS.map(g => `<option value="${g}"${g === pv.groupBy ? ' selected' : ''}>${esc(PM.groupBy[g])}</option>`).join('')}</select></label>` +
        `<button type="button" class="btn small ghost" data-pact="expandall">${esc(PM.expandAll)}</button><button type="button" class="btn small ghost" data-pact="collapseall">${esc(PM.collapseAll)}</button>
        <span class="spacer"></span>${bulk}${!pv.selected.size && can('payment.manual') ? `<button type="button" class="btn small" data-pact="manual">${esc(PM.addManual)}</button>` : ''}<button type="button" class="btn small ghost" data-pact="csv" title="${esc(PM.csvTip)}">${esc(PM.csv)}</button></div>
      <div id="pm_table"></div>`;
    if (pv.queue === 'check') { drawChecks(s, checks); return; }
    drawTable(s, list, td);
  }
  /* CR-17 §4.2 — To pay in Simple mode: Due · On hold · Upcoming · Needs check · the row's Mark paid · bulk Export for accounting / Mark paid */
  function drawToPaySimple(s, q, td, scoped, checks, cards, end) {
    const due = scoped.filter(x => ['ready', 'missing_docs', 'in_run'].includes(x.status)), sumOf = l => ({ n: l.length, gross: R.round2(l.reduce((a, x) => a + x.tax.gross, 0)) });
    const list = pv.queue === 'due' ? due : pv.queue === 'hold' ? scoped.filter(x => x.status === 'on_hold') : pv.queue === 'upcoming' ? scoped.filter(x => x.status === 'not_due' && x.due_date && x.due_date >= td && x.due_date <= end)
      : scoped.filter(x => SIMPLE_DUE.includes(x.status));
    list.forEach(x => { x.docs = R.docsTally(s, x); x.rd = R.paymentReadiness(s, x); });   // CR-32 §2.5: Ready to send
    const list2 = pv.f.ready ? list.filter(x => (pv.f.ready === 'ready') === x.rd.ready) : list;
    pv.items = list2;
    [...pv.selected].forEach(k => { if (!list2.some(x => x.key === k)) pv.selected.delete(k); });
    const cs = { due: sumOf(due), hold: cards.hold, upcoming: cards.upcoming, check: cards.check };
    const card = (k, c) => `<button type="button" class="qcard${pv.queue === k ? ' on' : ''}" data-pqueue="${k}" aria-pressed="${pv.queue === k}"><span class="n">${R.fmtNum(c.n)}</span><span class="t">${esc(PS.cards[k])}${c.gross != null ? ` · ${esc(R.baht(c.gross))}` : ''}</span></button>`;
    pv.emptyNote = !q.items.some(x => SIMPLE_DUE.includes(x.status)) ? PM.emptyTopay : null;
    $('pm_body').innerHTML = `<div class="hint pm-flow">${esc(PS.flow)}</div><div class="qcards">${QUEUES_SIMPLE.map(k => card(k, cs[k])).join('')}</div>
      <div class="toolbar pm-row2"><label class="tlab">${esc(C.deal.groupBy)} <select id="pm_group">${GROUPS.map(g => `<option value="${g}"${g === pv.groupBy ? ' selected' : ''}>${esc(PM.groupBy[g])}</option>`).join('')}</select></label>` +
        `<button type="button" class="btn small ghost" data-pact="expandall">${esc(PM.expandAll)}</button><button type="button" class="btn small ghost" data-pact="collapseall">${esc(PM.collapseAll)}</button>
        <span class="spacer"></span>${bulkHTML()}${!pv.selected.size && can('payment.manual') ? `<button type="button" class="btn small" data-pact="manual">${esc(PM.addManual)}</button>` : ''}<button type="button" class="btn small ghost" data-pact="csv" title="${esc(PM.csvTip)}">${esc(PM.csv)}</button></div>
      <div id="pm_table"></div>`;
    if (pv.queue === 'check') { drawChecks(s, checks); return; }
    drawTable(s, list2, td);
  }
  /* bulk actions on the ticked rows (Admin / KOL Manager) — the runs and the "outside the app" actions come with the runs (R3 / R4) */
  function bulkHTML() {
    const n = pv.selected.size; if (!n) return '';
    if (simple()) {   // CR-17: Export for accounting · Mark paid (the rows the person may pay)
      const s0 = state(), mine = pv.items.filter(x => pv.selected.has(x.key) && canPayX(s0, x));
      /* CR-27 §3.2 — Send to accounting (no file) · Export for accounting (as before) · Mark paid · Mark docs received */
      const exp = isMgr() ? `<button type="button" class="btn small" data-pact="sexport" title="${esc(PS.exportPii)}">${esc(PS.exportAcc)}</button>` : `<button type="button" class="btn small" disabled title="${esc(PS.exportPii)}">${esc(PS.exportNeedsManager)}</button>`;   // CR-32 §2.5
      return `<b class="pm-seln">${esc(C.deal.selected(n))}</b>` + (mine.length ? `<button type="button" class="btn small" data-pact="ssend">${esc(PS.sendAcc)}</button>${exp}` +
        `<button type="button" class="btn small" data-pact="sdocs">${esc(PM.docs.markDocs)}</button><button type="button" class="btn small primary" data-pact="spaid">${esc(PS.markPaid)}</button>` : '') +
        `<button type="button" class="btn small ghost" data-pact="clearsel">${esc(C.deal.clear)}</button>`;
    }
    const s = state(), drafts = (s.payment_runs || []).filter(r => r.status === 'draft').sort((a, b) => b.run_id.localeCompare(a.run_id));
    /* CR-09 §4.15.1: Create payment run (a pay date · who prepares it) · or Add to run ▾ (a Draft that is there) */
    const create = can('payment.run') ? `<button type="button" class="btn small primary" data-pact="createrun">${esc(PM.createRun)}</button>` : '';
    const toRun = can('payment.run') && drafts.length ? `<select id="pm_torun" aria-label="${esc(PM.addToRun)}">${drafts.map(r => `<option value="${esc(r.run_id)}"${r.run_id === pv.addTo ? ' selected' : ''}>${esc(r.run_id)}${r.returned_at ? ` · ${esc(PM.runStatus.returned)}` : ''}</option>`).join('')}</select>` +
      `<button type="button" class="btn small" data-pact="addrun">${esc(PM.addToRun)}</button>` : '';
    const cancel = can('payment.run') ? `<button type="button" class="btn small" data-pact="cancellines">${esc(PM.cancelLine)}</button>` : '';
    return `<b class="pm-seln">${esc(C.deal.selected(n))}</b>${create}${toRun}${cancel}<button type="button" class="btn small ghost" data-pact="clearsel">${esc(C.deal.clear)}</button>`;
  }
  const STATUS_CLS = { not_due: 'muted', missing_docs: 'warn', ready: 'readyc', on_hold: 'holdc', in_run: 'progress', submitted: 'subm', paid: 'done', cancelled: 'cancel' };   // submitted reads "With Accounting"
  const statusChip = st => `<span class="st ${STATUS_CLS[st] || ''}">${esc(PM.status[st])}</span>`;
  const missingLabel = k => R.docLabel(k);   // CR-32: ID copy · Bank book · Post proof · Bank details
  /* Missing: … → Bank details: the payee · a document: Payment details › Documents */
  function docsCell(x) {
    if (!x.missing.length) return x.status === 'not_due' ? '' : `<span class="ok">✓</span>`;
    const bank = x.missing.includes('bank_details'), docs = x.missing.filter(k => k !== 'bank_details');
    return `<span class="pm-docs">` + (bank ? `<button type="button" class="chip warn-chip" data-ppayee="${esc(x.kol_id || '')}" data-ppayeeid="${esc(x.payee ? x.payee.payee_id : '')}">${esc(PY.missing(PY.missingBank))}</button>` : '') +
      (docs.length ? `<button type="button" class="chip warn-chip" data-pdocs="${esc(x.key)}">${esc(PY.missing(docs.map(missingLabel).join(' · ')))}</button>` : '') + `</span>`;
  }
  /* CR-32 §2.5 — Ready (green) · Missing n (orange — what is missing on hover · a click opens Payment details at Ready to send) */
  const readyChip = x => (!x.rd || !['ready', 'missing_docs', 'not_due'].includes(x.status) ? '' : x.rd.ready ? `<span class="chip ok-chip pm-ready" title="${esc(RD.readyTip)}">✓ ${esc(RD.ready)}</span>`
    : `<button type="button" class="chip warn-chip pm-notready" data-pmready="${esc(x.key)}" title="${esc(RD.notReadyTip(readyLabels(x.rd)))}">${esc(RD.missingN(x.rd.missing.length))}</button>`);
  const readyLabels = rd => rd.missing.map(k => RD.items[k]).join(' · ');
  function phaseLine(s, x, ctx) {
    if (!x.deal) return esc(x.project_label || '');
    const p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, x.deal_id));
    return esc(`${R.campaignName(s, x.deal.campaign_id)}${p ? ` › ${R.phaseName(s, p.phase_id)}` : ''}`);
  }
  function groupKeyOf(s, x) {
    if (pv.groupBy === 'pic') return x.pic || '';
    if (pv.groupBy === 'campaign') return x.campaign_id || '';
    if (pv.groupBy === 'amount') return String(x.band);
    return simple() ? SIMPLE_ST[x.status] || x.status : x.status;   // CR-17: Simple — Due (documents or not) · On hold · In a run · Not due
  }
  function groupLabel(s, k) {
    if (pv.groupBy === 'pic') return k || C.deal.unassigned;
    if (pv.groupBy === 'campaign') return k ? R.campaignName(s, k) : PM.noCampaign;
    if (pv.groupBy === 'amount') return R.amountLabels(R.paySettings(s.lookups))[+k];
    return simple() ? PS.status[k] || k : PM.status[k];
  }
  const GROUP_ORDER_FULL = { readiness: ['missing_docs', 'ready', 'on_hold', 'in_run', 'submitted', 'not_due'], amount: ['0', '1', '2'] };
  const GROUP_ORDER_SIMPLE = { readiness: ['due', 'on_hold', 'in_run', 'not_due', 'sent'], amount: ['0', '1', '2'] };
  const groupOrder = () => (simple() ? GROUP_ORDER_SIMPLE : GROUP_ORDER_FULL)[pv.groupBy];
  /* folded groups: remembered per person and per Group by */
  const foldKey = () => `payfold_${userId() || ''}_${pv.groupBy}`;
  const folded = () => { try { return new Set(JSON.parse(pref.get(foldKey(), '[]'))); } catch (e) { return new Set(); } };
  const setFolded = set => pref.set(foldKey(), JSON.stringify([...set]));
  const missingLabelOf = k => missingLabel(k);
  function drawTable(s, list, td) {
    const ctx = R.dealContext(s), actor = U.actor(), sel = pv.selected, simp = simple(), canBulk = simp ? list.some(x => canPayX(s, x)) : can('payment.run') || can('payment.paid'), fold = folded(), S = R.paySettings(s.lookups);
    if (!list.length) { $('pm_table').innerHTML = pv.used && pv.used.length ? U.noMatchHTML(PM.empty, pv.used) : `<div class="card empty"><b>${esc(pv.emptyNote || PM.empty)}</b></div>`; return; }
    const groups = new Map(); list.forEach(x => { const k = groupKeyOf(s, x); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
    const order = groupOrder() ? groupOrder().filter(k => groups.has(k)) : [...groups.keys()].sort((a, b) => groupLabel(s, a).localeCompare(groupLabel(s, b), 'th'));
    /* CR-09 §4.14: a column nobody can use is not drawn (no empty ☐ column) · CR-11 §4.9: Hold / Release for the deal's PIC · Admin · KOL Manager */
    const mayHold = x => (simp ? canPayX(s, x) : x.deal ? R.canHold(s, actor, x.deal) : can('payment.run'));   // CR-17: Simple — whoever may pay it
    const canHoldX = x => !x.run_id && ['ready', 'missing_docs', 'not_due'].includes(x.status) && mayHold(x), canRelease = x => x.status === 'on_hold' && mayHold(x);
    /* CR-16 §4.2 — ⋯ Change payee: before it is in a run, when the KOL has another payee · a deal's change goes on the deal (Pay to) */
    const canPayee = x => !x.run_id && !R.linePayeeLocked(x.line) && !!x.kol_id && R.payeesOfKol(s, x.kol_id).length > 1 && (x.deal ? can('deal.edit') && R.canRequest(s, actor, x.deal) : can('payment.manual'));
    const showPic = picFilter() === '', span = (canBulk ? 1 : 0) + 8 + (showPic ? 1 : 0) + 1;
    const row = x => {
      const name = x.kol ? x.kol.display_name : x.account_handle || (x.payee && x.payee.account_handle) || '';
      const camp = x.deal ? R.campaignName(s, x.deal.campaign_id) : (x.project_label || ''), ph = x.deal ? ctx.phases.get(R.primaryPhase(ctx.phaseIdx, x.deal_id)) : null;
      const miss = x.missing.length ? `<button type="button" class="pm-miss" data-pmiss="${esc(x.key)}" title="${esc(x.missing.map(missingLabelOf).join(' · '))}" aria-haspopup="true">${esc(PM.missingN(x.missing.length))}</button>` : '';
      const menu = `<details class="menu pm-menu"><summary class="icon-btn" aria-label="${esc(PM.rowMenu)}" title="${esc(PM.rowMenu)}">⋯</summary><div class="menu-list right">` +
        (canHoldX(x) ? `<button type="button" class="mi" data-phold="${esc(x.key)}">${esc(PM.hold)}</button>` : '') +
        (canPayee(x) ? `<button type="button" class="mi" data-ppayto="${esc(x.key)}">${esc(PM.changePayee)}</button>` : '') + (canRelease(x) ? `<button type="button" class="mi" data-prelease="${esc(x.key)}">${esc(PM.release)}</button>` : '') +
        (simp ? '' : x.missing.map(k => (k !== 'bank_details' ? `<button type="button" class="mi" data-pdocs="${esc(x.key)}">${esc(missingLabelOf(k))} ↗</button>`
          : `<button type="button" class="mi" data-ppayee="${esc(x.kol_id || '')}" data-ppayeeid="${esc(x.payee ? x.payee.payee_id : '')}">${esc(missingLabelOf(k))} ↗</button>`)).join('')) +   // CR-11 §4.13 #9: what is missing, in ⋯ too
        (x.deal ? `<button type="button" class="mi" data-pdeal="${esc(x.deal_id)}">${esc(PM.openDeal)}</button>` : '') +
        `<button type="button" class="mi" data-ppayee="${esc(x.kol_id || '')}" data-ppayeeid="${esc(x.payee ? x.payee.payee_id : '')}">${esc(PM.payeeDetails)}</button></div></details>`;
      const held = x.status === 'on_hold';
      return `<tr tabindex="0" data-pkey="${esc(x.key)}"${held ? ' class="pm-held"' : ''}>${canBulk ? (simp && !canPayX(s, x) ? '<td class="cb"></td>' : `<td class="cb"><input type="checkbox" data-psel="${esc(x.key)}"${sel.has(x.key) && !held ? ' checked' : ''}${held ? ` disabled title="${esc(PM.holdNoRun)}"` : ''} aria-label="${esc(name)}"></td>`) : ''}` +
        `<td class="pm-kol stk${canBulk ? '' : ' at0'}"><span class="kname"><b>${U.nameHTML(name)}</b></span>${x.source !== 'deal' ? ` <span class="chip">${esc(PM.sources[x.source] || x.source)}</span>` : ''}` +
          `${R.payeeTag(s, x.payee) ? ` <span class="chip pm-ptag" title="${esc(PM.payToTip)}">→ ${esc(R.payeeTag(s, x.payee))}</span>` : ''}</td>` +
        `<td class="cph2"><span class="c1">${esc(camp)}</span>${ph ? `<span class="c2">${esc(R.phaseName(s, ph.phase_id))}</span>` : ''}</td>` +
        `<td class="nowrap">${esc(C.pay.milestone[x.milestone] || x.milestone)}${x.term_not_set ? ` <span class="tns" title="${esc(PM.termNotSetTip)}" aria-label="${esc(PM.termNotSet)}">!</span>` : ''}` +
          `<span class="due${x.overdue ? ' late' : ''}">${x.due_date ? esc(R.dmy(x.due_date).slice(0, 5)) : '—'}</span></td>` +
        `<td class="num">${money(x.tax.gross)}</td><td class="num">${x.tax.wht ? money(x.tax.wht) : '<span class="muted">0.00</span>'}</td><td class="num"><b>${money(x.tax.net)}</b></td>` +
        `<td class="pm-stc">${simp ? simpleChip(x.status) + docsChip(x) + readyChip(x) : statusChip(x.status) + miss}${held && x.line && x.line.hold_reason ? `<span class="pm-holdr" title="${esc(PM.heldBy(R.changedByName(s, x.line.hold_by), R.dmy(String(x.line.hold_at || '').slice(0, 10))))}">${esc(x.line.hold_reason)}</span>` : ''}</td>${showPic ? `<td class="nowrap">${esc(x.pic || '')}</td>` : ''}` +
        `<td class="pm-act">${simp ? payBtn(s, x) + sendBtn(s, x) : ''}${menu}</td></tr>`;
    };
    const tot = rows => ['gross', 'wht', 'net'].map(k => R.round2(rows.reduce((a, x) => a + x.tax[k], 0)));
    const body = order.map(k => { const rows = groups.get(k), t = tot(rows), shut = fold.has(k), note = pv.groupBy === 'amount' ? PM.amountNote[+k] : '';
      return `<tr class="ghead pm-gh${shut ? ' shut' : ''}"><td colspan="${span}"><button type="button" class="gh" data-pfold="${esc(k)}" aria-expanded="${!shut}"><span class="chev${shut ? '' : ' open'}">${ICON.chevron}</span>` +
        `<b>${esc(groupLabel(s, k))}</b>${note ? ` <span class="muted small">${esc(note)}</span>` : ''} <span class="muted">${esc(PM.groupLine(rows.length, money(t[0]), money(t[1]), money(t[2])))}</span></button></td></tr>` + (shut ? '' : rows.map(row).join('')); }).join('');
    const all = tot(list);
    $('pm_table').innerHTML = `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl"><thead><tr>${canBulk ? `<th class="cb"><input type="checkbox" id="pm_all" aria-label="${esc(C.deal.selectAll)}"${list.every(x => sel.has(x.key)) ? ' checked' : ''}></th>` : ''}` +
      `<th class="stk${canBulk ? '' : ' at0'}">${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th class="th2">${esc(PM.col.milestone)}<span>${esc(PM.col.due)}</span></th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th>` +
      `<th>${esc(PM.col.status)}</th>${showPic ? `<th>${esc(PM.col.pic)}</th>` : ''}<th></th></tr></thead><tbody>${body}` +
      `<tr class="total"><td colspan="${(canBulk ? 1 : 0) + 3}">${esc(PM.totalLine(list.length))}</td><td class="num">${money(all[0])}</td><td class="num">${money(all[1])}</td><td class="num">${money(all[2])}</td><td colspan="${2 + (showPic ? 1 : 0)}"></td></tr></tbody></table></div>`;
  }
  /* CR-16 §4.2 — ⋯ Change payee (S): the KOL's payees, the default first · a deal: its Pay to (lines not in a run follow, deal_events payee) · a manual line: its own */
  function changePayeeDialog(key, opener, after, item) {
    const s = state(), x = pv.items.find(i => i.key === key) || item; if (!x || !x.kol_id) return;
    const opts = R.payToOptions(s, x.kol_id), cur = x.payee ? x.payee.payee_id : '';
    const line = p => [PY.types[p.payee_type], p.secure ? R.bankLine(state().lookups, p) : PY.missing(PY.missingBank), R.payeeDocsMissing(p).length ? PY.missing(R.payeeDocsMissing(p).map(k => (k === 'bank_details' ? PY.missingBank : PY.docs[k])).join(' · ')) : PY.docsOnFile].join(' · ');
    U.createModal({ size: 'S', title: PM.changePayeeTitle(x.kol ? x.kol.display_name : x.account_handle), opener, sub: x.deal ? PM.changePayeeSub(x.deal_id) : '',
      foot: ['', U.cmButtons(C.common.save, 'cp_ok')],
      body: `<div class="cp-list" role="radiogroup" aria-label="${esc(PM.changePayee)}">` + opts.map(o => `<label class="tick block cp-opt"><input type="radio" name="cp_p" value="${esc(o.value)}"${o.value === cur ? ' checked' : ''}> <span><b>${esc(o.label)}</b><span class="muted small">${esc(line(o.payee))}</span></span></label>`).join('') + `</div>` });
    $('cp_ok').addEventListener('click', () => {
      const v = (document.querySelector('#cm_root input[name="cp_p"]:checked') || {}).value; if (!v) return;
      const s2 = state(), it = pv.items.find(i => i.key === key) || findItem(s2, refOf(x)) || x;
      if (it.deal) {
        const d = s2.deals.find(dd => dd.deal_id === it.deal_id); if (!d || !U.guard('deal.edit')) return;
        const def = R.defaultPayee(s2, d.kol_id), r = R.setDealPayee(s2, d, def && v === def.payee_id ? null : v, { eventId: store.newEventId(), now: new Date(), user: userId() });
        if (r) s2.deal_events.push(r.event);
      } else if (it.line) { if (!U.guard('payment.manual') || !R.setLinePayee(s2, it.line, v)) { U.closeModal(); return; } }
      const p = R.payeeById(s2, v); U.closeModal(); commit(PM.payeeChanged(p ? p.label || PY.primary : '')); if ($('pm_body')) draw(); if (after) after();
    });
  }
  /* "Missing n" → what is missing, each opening where it is fixed (the Payee dialog · the deal's posts) */
  function missingPop(btn) {
    const old = $('pm_misspop'); if (old) { old.remove(); if (old.dataset.for === btn.dataset.pmiss) return; }
    const x = pv.items.find(i => i.key === btn.dataset.pmiss); if (!x) return;
    const m = document.createElement('div'); m.className = 'menu-list floating pm-misspop'; m.id = 'pm_misspop'; m.dataset.for = x.key; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="mh">${esc(PM.missingTitle)}</div>` + ((x.docs && x.docs.missing) || x.missing).map(k => k !== 'bank_details'
      ? `<button type="button" class="mi" data-pdocs="${esc(x.key)}">${esc(missingLabelOf(k))} ↗</button>`
      : `<button type="button" class="mi" data-ppayee="${esc(x.kol_id || '')}" data-ppayeeid="${esc(x.payee ? x.payee.payee_id : '')}">${esc(missingLabelOf(k))} ↗</button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.top = (r.bottom + m.offsetHeight + 8 > innerHeight ? Math.max(8, r.top - m.offsetHeight - 4) : r.bottom + 4) + 'px';
    m.addEventListener('click', e => { const b = e.target.closest('.mi'); if (!b) return; m.remove(); onBodyClick({ target: b }); });
  }
  document.addEventListener('click', e => { const m = $('pm_misspop'); if (m && !m.contains(e.target) && !e.target.closest('[data-pmiss]')) m.remove(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('pm_misspop'); if (m) m.remove(); } });
  /* Needs check: ฿0 deals that are owed something · payments made on deals that were cancelled */
  function drawChecks(s, checks) {
    if (!checks.length) { $('pm_table').innerHTML = `<div class="card empty"><b>${esc(PM.noChecks)}</b></div>`; return; }
    $('pm_table').innerHTML = `<div class="tablewrap"><table class="tbl pm-tbl"><thead><tr><th>${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th>${esc(PM.col.issue)}</th><th>${esc(PM.col.pic)}</th><th></th></tr></thead><tbody>` +
      checks.map(c => `<tr><td><b>${esc((R.kolById(s, c.deal.kol_id) || {}).display_name || '')}</b></td><td class="muted">${esc(R.campaignName(s, c.deal.campaign_id))}</td><td class="late">${esc(PM.checks[c.kind])}</td><td>${esc(c.deal.pic || '')}</td>` +
        `<td><button type="button" class="btn small" data-pdeal="${esc(c.deal.deal_id)}">${esc(C.overview.open)}</button></td></tr>`).join('') + `</tbody></table></div>`;
  }

  /* ===================== CR-11 §4.9 — Hold (a reason) / Release ===================== */
  function holdDialog(key, opener) {
    const x = pv.items.find(i => i.key === key) || R.payQueue(state(), today()).items.find(i => i.key === key); if (!x) return;
    const name = x.kol ? x.kol.display_name : x.account_handle;
    U.createModal({ size: 'S', title: PM.holdTitle(name, C.pay.milestone[x.milestone] || x.milestone), opener, focus: '#hd_reason',
      body: `<p class="hint" style="margin-top:0">${esc(PM.holdHint)}</p><div class="field"><label for="hd_reason">${esc(PM.holdReasonL)} <span class="req">*</span></label><textarea id="hd_reason" rows="3" placeholder="${esc(PM.holdPh)}"></textarea></div>`,
      foot: [`<div class="checks" id="hd_checks"></div>`, U.cmButtons(PM.holdOk, 'hd_ok')] });
    $('hd_ok').addEventListener('click', () => {
      const reason = $('hd_reason').value, res = R.validateHold(reason);
      $('hd_checks').innerHTML = checksHTML(res, ''); $('hd_reason').classList.toggle('invalid', res.errs.length > 0);
      if (res.errs.length) return;
      const s = state(), it = R.payQueue(s, today()).items.find(i => i.key === key) || x;
      if (simple() ? !canPayX(s, it) : it.deal ? !R.canHold(s, U.actor(), it.deal) : !can('payment.run')) { toast(PM.holdOnlyPic); return; }
      const h = R.holdItem(s, it, reason, ctxOf()); if (!h) return;
      s.deal_events.push(h.event); U.closeModal(); commit(PM.heldDone(name)); draw();
    });
  }
  function releaseItem(key, after) {
    const s = state(), x = pv.items.find(i => i.key === key) || findItem(s, { key }); if (!x || !x.line) return;
    if (simple() ? !canPayX(s, x) : x.deal ? !R.canHold(s, U.actor(), x.deal) : !can('payment.run')) { toast(PM.holdOnlyPic); return; }
    const ev = R.releaseLine(s, x.line, today(), ctxOf()); if (!ev) return;
    s.deal_events.push(ev); commit(PM.releasedDone(x.kol ? x.kol.display_name : x.account_handle)); if (after) after(); else draw();
  }
  const taxBox = (t, borne) => `<div class="pm-taxgrid"><span>${esc(PM.col.gross)}</span><b>${money(t.gross)}</b><span>${esc(PM.vat)}</span><b>${money(t.vat)}</b><span>${esc(PM.col.wht)} (${t.wht_rate}%)</span><b>${money(t.wht)}</b><span>${esc(PM.col.net)}</span><b>${money(t.net)}</b></div>` +
    (borne > 0 ? `<div class="hint">${esc(PM.borne(money(borne)))}</div>` : '');
  /* deal_events type 'payment' (§3): every change of a line's status */
  const paymentEvent = (line, from, to, note) => ({ event_id: store.newEventId(), deal_id: line.deal_id || null, line_id: line.line_id, type: 'payment', from, to,
    changed_at: new Date().toISOString(), changed_by: userId(), note: note || null });

  /* ===================== Payment runs (§4.6 · CR-09 §4.15) ===================== */
  const RUN_CLS = { draft: 'list', returned: 'warn', with_accounting: 'progress', paid: 'done', closed: 'muted' };
  const runChip = run => `<span class="st ${RUN_CLS[R.runStatusKey(run)] || ''}">${esc(R.runStatusLabel(run))}</span>`;
  const runRow = (s, td, r, actions) => { const t = R.runTotals(R.runLines(s, r.run_id));
    return `<tr><td><b>${esc(r.run_id)}</b></td><td>${esc(R.dmy(r.pay_date))}</td><td>${esc(R.changedByName(s, r.prepared_by))}</td><td>${runChip(r)}</td><td class="num">${t.n}</td>` +
      `<td class="num">${money(t.gross)}</td><td class="num">${money(t.vat)}</td><td class="num">${money(t.wht)}</td><td class="num"><b>${money(t.net)}</b></td><td class="pm-runacts">${actions}</td></tr>`; };
  const runHead = () => `<th>${esc(PM.run)}</th><th>${esc(PM.payDate)}</th><th>${esc(PM.preparedBy)}</th><th>${esc(PM.col.status)}</th><th class="num">${esc(PM.lines)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.vat)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th><th></th>`;
  function drawRuns(s, td) {
    if (pv.run && (s.payment_runs || []).some(r => r.run_id === pv.run)) { drawRun(s, td); return; }
    pv.run = null;
    const f = pv.runFilter, rf = pv.rf, q = R.trim(rf.q).toLowerCase();
    const runs = (s.payment_runs || []).filter(r => (f ? R.runStatusKey(r) === f : r.status !== 'closed') && (!rf.from || (r.pay_date >= rf.from && r.pay_date <= rf.to)) &&
      (!q || r.run_id.toLowerCase().includes(q) || R.runLines(s, r.run_id).some(l => matchQ(R.payItem(s, td, { line: l }), q)))).sort((a, b) => b.pay_date.localeCompare(a.pay_date) || b.run_id.localeCompare(a.run_id));
    const empty = rf.from || q ? U.noMatchHTML(PM.noRunsMatch, pv.used || []) : `<div class="card empty"><b>${esc(f ? PM.noRunsStatus(PM.runStatus[f]) : PM.noRuns)}</b></div>`;
    $('pm_body').innerHTML = `<div class="toolbar pm-row2"><span class="spacer"></span>${can('payment.run') ? `<button type="button" class="btn primary" data-pact="newrun">${esc(PM.newRun)}</button>` : ''}</div>` +
      (!runs.length ? empty : `<div class="tablewrap"><table class="tbl pm-tbl"><thead><tr>${runHead()}</tr></thead><tbody>` +
        runs.map(r => runRow(s, td, r, `<button type="button" class="btn small" data-prun="${esc(r.run_id)}">${esc(C.overview.open)}</button>`)).join('') + `</tbody></table></div>`);
  }
  /* Run detail — the KOL team (Payment runs): a Draft / Returned run is changed and sent with Submit to Accounting; after that it is read only ·
     Accounting (the Accounting tab): Export PR · Mark paid (all / ticked) · Return to team · Close run */
  function drawRun(s, td) {
    const acc = pv.tab === 'accounting', run = s.payment_runs.find(r => r.run_id === pv.run), lines = R.runLines(s, run.run_id), chk = R.runChecks(s, run, td), S = R.paySettings(s.lookups);
    const canRun = can('payment.run'), canPaid = can('payment.paid'), draft = run.status === 'draft', sub = run.status === 'submitted';
    const acts = acc ? [
      `<button type="button" class="btn" data-pact="export">${esc(PM.exportPr)}</button>`,
      sub && canPaid ? `<button type="button" class="btn" data-pact="returnrun">${esc(PM.returnToTeam)}</button><button type="button" class="btn primary" data-pact="markpaid">${esc(PM.markPaid)}</button>` : '',
      run.status === 'paid' && canPaid ? `<button type="button" class="btn primary" data-pact="close">${esc(PM.closeRun)}</button>` : ''].join('') : [
      draft && canRun ? `<button type="button" class="btn" data-pact="addlines">${esc(PM.addLines)}</button>` : '',
      `<button type="button" class="btn" data-pact="export">${esc(PM.exportPr)}</button>`,
      draft && canRun ? `<button type="button" class="btn primary" data-pact="submit"${chk.errs.length ? ` disabled title="${esc(PM.fixErrors)}"` : ''}>${esc(PM.submitAcc)}</button>` : '',
      !draft && canPaid && run.status !== 'closed' ? `<button type="button" class="btn" data-pact="openacc">${esc(PM.openInAcc)}</button>` : '',
      sub && can('payment.reopen') ? `<button type="button" class="btn" data-pact="reopen">${esc(PM.reopen)}</button>` : ''].join('');
    const payDate = !acc && draft && canRun ? U.dateHTML('id="pm_paydate"', run.pay_date, { label: PM.payDate }) : `<b>${esc(R.dmy(run.pay_date))}</b>`;
    /* the same warning on many lines (term not set · 10,000 and above) is said once, with the names */
    const group = list => { const out = [], seen = new Map(); list.forEach(x => { if (!x.kind) { out.push(x); return; } if (!seen.has(x.kind)) { const g = Object.assign({}, x, { names: [] }); seen.set(x.kind, g); out.push(g); } seen.get(x.kind).names.push(x.who); });
      return out.map(x => (x.names && x.names.length > 1 ? Object.assign(x, { msg: PM.checkGroups[x.kind](x.names.join(', ')) }) : x)); };
    chk.warns = group(chk.warns);
    const checks = chk.errs.length + chk.warns.length + chk.infos.length ? `<div class="card pm-checks"><div class="checks">${['errs', 'warns', 'infos'].map(k => chk[k].map(x =>
      `<div class="check ${k === 'errs' ? 'err' : k === 'warns' ? 'warn' : 'info'}">${k === 'errs' ? '✕' : k === 'warns' ? '!' : 'i'} <button type="button" class="link" data-pgoto="${esc(x.line_id)}">${esc(x.msg)}</button>` +
      (x.verify && can('payee.verify') ? ` <button type="button" class="btn small" data-pverify="${esc(x.payee_id)}">${esc(PY.markVerified)}</button>` : '') + `</div>`).join('')).join('')}</div></div>` : '';
    const returned = draft && run.returned_at ? `<div class="check warn pm-returned">! <span>${esc(PM.returnedBanner(R.changedByName(s, run.returned_by), R.dmy(String(run.returned_at).slice(0, 10)), run.returned_reason || ''))}</span></div>` : '';
    const sel = pv.selected, cols = 15, tick = acc && sub && canPaid;
    const row = (l, i) => {
      const p = R.payeeOfLine(s, l), it = R.payItem(s, td, { line: l }), st = it.status;
      const menu = [!acc && draft && canRun ? `<button type="button" class="mi" data-plremove="${esc(l.line_id)}">${esc(PM.removeFromRun)}</button><button type="button" class="mi" data-pledit="${esc(l.line_id)}">${esc(PM.editAmount)}</button>` : '',
        acc && l.status === 'paid' && can('payment.reopen') ? `<button type="button" class="mi" data-plundo="${esc(l.line_id)}">${esc(PM.undoPaid)}</button>` : ''].join('');
      return `<tr id="pmline_${esc(l.line_id)}" class="${l.status === 'cancelled' ? 'faded-row' : ''}">${tick ? `<td class="cb">${l.status === 'submitted' ? `<input type="checkbox" data-plsel="${esc(l.line_id)}"${sel.has(l.line_id) ? ' checked' : ''} aria-label="${esc(l.account_handle)}">` : ''}</td>` : '<td></td>'}` +
        `<td class="num">${i + 1}</td><td class="cph">${esc(l.project_label || '')}</td><td class="pm-kol"><span class="kname"><b>${esc(l.account_handle || '')}</b>${l.account_handle ? U.copyBtnHTML(l.account_handle) : ''}</span></td>` +
        `<td>${esc({ deal: 'KOL', legacy: 'KOL', affiliate: 'AFF', other: 'Other' }[l.source] || 'Other')}</td><td>${esc(PY.types[(p && p.payee_type) || l.payee_type] || '')}</td>` +
        `<td class="nowrap">${p && p.secure ? esc(R.bankLine(state().lookups, p)) : '<span class="muted">—</span>'}</td><td class="num">${money(l.gross)}</td><td class="num">${money(l.vat)}</td>` +
        `<td class="num">${money(l.wht)} <span class="muted small">${l.wht_rate}%</span></td><td class="num"><b>${money(l.net)}</b></td><td class="pm-docscell">${docsCell(it)}</td>` +
        `<td class="c"><input type="checkbox" data-plprint="${esc(l.line_id)}"${l.printed ? ' checked' : ''}${(canRun && draft && !acc) || (acc && canPaid && run.status !== 'closed') ? '' : ' disabled'} aria-label="${esc(PM.printed)}"></td>` +
        `<td>${esc(it.pic || '')}</td><td>${l.status === 'paid' ? `<span class="muted small">${esc(R.dmy(l.paid_date))}</span> ` : ''}${statusChip(st)}${menu ? `<details class="menu pm-menu"><summary class="icon-btn" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right">${menu}</div></details>` : ''}</td></tr>`;
    };
    const bands = [0, 1, 2].map(b => ({ b, list: lines.filter(l => R.bandOf(l.gross, S) === b) })).filter(x => x.list.length);
    let no = 0;
    const body = bands.map(({ b, list }) => { const t = R.runTotals(list);
      return `<tr class="ghead pm-gh"><td colspan="${cols}"><b>${esc(R.amountLabels(S)[b])}</b>${PM.amountNote[b] ? ` <span class="muted small">${esc(PM.amountNote[b])}</span>` : ''} <span class="muted">${esc(PM.bandLine(t.n, money(t.gross), money(t.vat), money(t.wht), money(t.net)))}</span></td></tr>` + list.map(l => row(l, no++)).join(''); }).join('');
    const t = R.runTotals(lines);
    $('pm_body').innerHTML = `<div class="pm-runhead"><button type="button" class="link" data-pact="backruns">← ${esc(acc ? PM.backToAcc : PM.allRuns)}</button>
        <h2>${esc(run.run_id)}</h2>${runChip(run)}<span class="pm-rmeta"><span>${esc(PM.payDate)} ${payDate}</span><span>${esc(PM.preparedBy)} <b>${esc(R.changedByName(s, run.prepared_by))}</b></span></span><span class="spacer"></span>${acts}</div>` +
      returned + checks + (tick && sel.size ? `<div class="toolbar pm-row2"><b>${esc(C.deal.selected(sel.size))}</b><button type="button" class="btn small primary" data-pact="markpaidsel">${esc(PM.markPaidSel)}</button></div>` : '') +
      (!lines.length ? `<div class="card empty"><b>${esc(PM.runEmpty)}</b>${!acc && draft && canRun ? `<button type="button" class="btn" data-pact="addlines">${esc(PM.addLines)}</button>` : ''}</div>` :
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
  /* CR-09 §4.15.1 — the ticked lines make a new run: its pay date (next run day) and who prepares it */
  /* CR-11 §4.3 — Create payment run / + New run: a create modal (S) · Pay date + Prepared by · the ticked lines go in (none from + New run) */
  function createRunDialog(lineless, opener) {
    if (!U.guard('payment.run')) return;
    const s = state(), n = lineless ? 0 : pv.selected.size, next = R.nextRunDate(today(), R.paySettings(s.lookups).run_weekday), users = (s.users || []).filter(u => u.active !== false);
    U.createModal({ size: 'S', title: PM.createRunTitle(n), opener, foot: ['', U.cmButtons(PM.createRunOk, 'cr_ok')],
      body: `<div class="fields">` +
        `<div class="field"><label for="cr_date">${esc(PM.payDate)}</label>${U.dateHTML('id="cr_date"', next, { label: PM.payDate })}</div>` +
        `<div class="field"><label for="cr_by">${esc(PM.preparedBy)}</label><select id="cr_by">${optionsHTML(users.map(u => ({ value: u.user_id, label: u.display_name })), userId())}</select></div></div>` });
    $('cr_ok').addEventListener('click', () => {
      const d = $('cr_date').value; if (!R.isISODate(d) || !U.guard('payment.run')) return;
      const s2 = state(), run = R.newRun(s2, { pay_date: d, preparedBy: $('cr_by').value, user: userId(), now: new Date().toISOString() }); s2.payment_runs.push(run);
      const items = lineless ? [] : pv.items.filter(x => pv.selected.has(x.key)), evs = R.addToRun(s2, run, items, ctxOf()); s2.deal_events.push(...evs);
      pv.selected.clear(); U.closeModal(); commit(items.length ? PM.addedToRun(items.length, run.run_id) : PM.runCreated(run.run_id));
      pv.tab = 'runs'; pv.run = run.run_id; render();
    });
  }
  function addSelectedToRun() {
    if (!U.guard('payment.run')) return;
    const s = state(), v = $('pm_torun') ? $('pm_torun').value : '';
    const run = s.payment_runs.find(r => r.run_id === v);
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
  function markPaidDialog(lineIds, runId) {
    if (!U.guard('payment.paid')) return;
    const id = runId || pv.run, s = state(), run = s.payment_runs.find(r => r.run_id === id); if (!run) return;
    const n = lineIds ? lineIds.length : R.runLines(s, run.run_id).filter(l => l.status === 'submitted').length;
    openDialog(`<div class="dlg-h">${esc(PM.markPaidTitle(n, run.run_id))}</div><div class="dlg-b"><div class="field"><label for="mp_date">${esc(PM.paidOnDate)}</label>${U.dateHTML('id="mp_date"', run.pay_date, { label: PM.paidOnDate })}</div></div>
      <div class="dlg-f"><button type="button" class="btn" id="mp_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="mp_ok">${esc(PM.markPaid)}</button></div>`);
    $('mp_cancel').addEventListener('click', closeDialog);
    $('mp_ok').addEventListener('click', () => {
      const date = $('mp_date').value; if (!R.isISODate(date) || !U.guard('payment.paid')) return;
      const s2 = state(), r2 = s2.payment_runs.find(r => r.run_id === id), evs = R.markPaid(s2, r2, lineIds, date, ctxOf());
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
  /* everyone who sees the run may export it · bank details and names only for someone who can unlock the vault (CR-09 §4.15) */
  /* CR-32 §2.5 — the PR file has personal and bank details: Manager / Admin only, with the vault unlocked (no file without them) */
  async function exportPr(withDetails, runId) {
    const id = runId || pv.run, s = state(), run = s.payment_runs.find(r => r.run_id === id); if (!run) return;
    if (!isMgr()) { toast(PS.exportNeedsManager); return; }
    if (!(await askExport(R.runLines(s, run.run_id).filter(l => l.status !== 'cancelled').length, 0, run.run_id))) return;
    await writePr(run, true);
  }
  /* the PR file of a run: unlocked → the payee columns filled in memory and dropped right after the download */
  async function writePr(run, withDetails) {
    const s = state(), vault = s.lookups.payee_vault, V = KT.vault;
    let details = null;
    if (withDetails !== false && vault && V.isUnlocked(vault) && can('payee.unlock')) {
      details = new Map();
      for (const l of R.runLines(s, run.run_id)) { const p = R.payeeOfLine(s, l); if (p && p.secure && !details.has(p.payee_id)) details.set(p.payee_id, await V.decrypt(p.secure)); }
    }
    const missing = R.runLines(s, run.run_id).filter(l => l.status !== 'cancelled' && !((R.payeeOfLine(s, l) || {}).secure)).length;
    U.download(R.prFileName(run.pay_date, run.run_id), KT.xlsx.workbook(R.prSheets(s, run, details)), KT.xlsx.MIME);
    if (details) details.clear(); details = null;
    /* CR-32 §2.5 — the log keeps only "exported n lines · PR-…" (never the file) */
    const n = R.runLines(s, run.run_id).filter(l => l.status !== 'cancelled').length;
    s.deal_events.push({ event_id: store.newEventId(), deal_id: null, run_id: run.run_id, type: 'payment_export', from: null, to: run.run_id, changed_at: new Date().toISOString(), changed_by: userId(), note: PS.exportLog(n, run.run_id) }); commit();
    toast(PM.exported(R.prFileName(run.pay_date, run.run_id)) + (missing ? ' · ' + PM.missingBankN(missing) : ''));
  }
  function verifyPayee(payeeId) {
    if (!U.guard('payee.verify')) return;
    const p = R.payeeById(state(), payeeId); if (!p) return;
    Object.assign(p, { needs_verification: false, verified_at: new Date().toISOString(), verified_by: userId() }); commit(PY.verified); draw();
  }
  /* ===================== Accounting (CR-09 §4.15.2): Runs to pay · WHT certificates · Paid ===================== */
  function drawAccounting(s, td) {
    if (pv.run && (s.payment_runs || []).some(r => r.run_id === pv.run)) { drawRun(s, td); return; }
    pv.run = null;
    const canPaid = can('payment.paid'), month = td.slice(0, 7);
    const af = pv.af, q = R.trim(af.q).toLowerCase(), inRange = d => !af.from || (d >= af.from && d <= af.to);
    const allToPay = (s.payment_runs || []).filter(r => r.status === 'submitted' || r.status === 'paid');
    const toPay = allToPay.filter(r => inRange(r.pay_date) && (!q || r.run_id.toLowerCase().includes(q) || R.runLines(s, r.run_id).some(l => matchQ(R.payItem(s, td, { line: l }), q))))
      .sort((a, b) => a.pay_date.localeCompare(b.pay_date) || a.run_id.localeCompare(b.run_id));
    const withAcc = allToPay.filter(r => r.status === 'submitted'), transferNet = R.round2(withAcc.reduce((a, r) => a + R.runTotals(R.runLines(s, r.run_id).filter(l => l.status === 'submitted')).net, 0));
    const whtAll = R.whtNotSent(R.paidLines(s)).map(l => R.payItem(s, td, { line: l })), wht = whtAll.filter(x => inRange(x.line.paid_date) && matchQ(x, q));
    const paidMonth = R.round2((s.payment_lines || []).filter(l => l.status === 'paid' && String(l.paid_date || '').slice(0, 7) === month).reduce((a, l) => a + (l.gross || 0), 0));
    pv.whtItems = wht; [...pv.wsel].forEach(k => { if (!wht.some(x => x.key === k)) pv.wsel.delete(k); });
    const card = (v, label, n) => `<button type="button" class="qcard${af.view === v ? ' on' : ''}" data-paccview="${v}" aria-pressed="${af.view === v}"><span class="n">${n}</span><span class="t">${esc(label)}</span></button>`;
    const runs = !toPay.length ? (af.from || q ? U.noMatchHTML(PM.noRunsMatch, pv.used || []) : `<div class="hint">${esc(PM.noTransfer)}</div>`) : `<div class="tablewrap"><table class="tbl pm-tbl"><thead><tr>${runHead()}</tr></thead><tbody>` +
      toPay.map(r => runRow(s, td, r, `<button type="button" class="btn small" data-paccrun="${esc(r.run_id)}">${esc(PM.open)}</button><button type="button" class="btn small" data-paccexp="${esc(r.run_id)}">${esc(PM.exportPr)}</button>` +
        (canPaid && r.status === 'submitted' ? `<button type="button" class="btn small primary" data-paccpaid="${esc(r.run_id)}">${esc(PM.markPaid)}</button><button type="button" class="btn small" data-paccret="${esc(r.run_id)}">${esc(PM.returnToTeam)}</button>` : '') +
        (canPaid && r.status === 'paid' ? `<button type="button" class="btn small primary" data-pacclose="${esc(r.run_id)}">${esc(PM.closeRun)}</button>` : ''))).join('') + `</tbody></table></div>`;
    const unlocked = s.lookups.payee_vault && KT.vault.isUnlocked(s.lookups.payee_vault) && can('payee.unlock');
    const whtTbl = !wht.length ? (whtAll.length ? U.noMatchHTML(PM.noWhtMatch, pv.used || []) : `<div class="hint">${esc(PM.noWhtToSend)}</div>`) : `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl"><thead><tr>${canPaid ? `<th class="cb"><input type="checkbox" id="pm_wall" aria-label="${esc(C.deal.selectAll)}"${wht.every(x => pv.wsel.has(x.key)) ? ' checked' : ''}></th>` : ''}` +
      `<th>${esc(PM.paidDate)}</th><th>${esc(PM.run)}</th><th>${esc(PM.account)}</th><th>${esc(PY.type)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.wht)}</th><th>${esc(PM.sendTo)}</th><th>${esc(PM.col.pic)}</th></tr></thead><tbody>` +
      wht.map(x => { const l = x.line, p = R.payeeOfLine(s, l);
        return `<tr>${canPaid ? `<td class="cb"><input type="checkbox" data-pwsel="${esc(x.key)}"${pv.wsel.has(x.key) ? ' checked' : ''} aria-label="${esc(l.account_handle)}"></td>` : ''}<td class="nowrap">${esc(R.dmy(l.paid_date))}</td><td>${esc(l.run_id || PM.sources[l.source] || '')}</td>` +
          `<td><b>${esc(l.account_handle || '')}</b></td><td>${esc(PY.types[(p && p.payee_type) || l.payee_type] || '')}</td><td class="num">${money(l.gross)}</td><td class="num">${money(l.wht)} <span class="muted small">${l.wht_rate}%</span></td>` +
          `<td class="pm-sendto"${unlocked && p && p.secure ? ` data-whtto="${esc(p.payee_id)}"` : ''}><span class="muted small">${esc(unlocked ? '…' : PM.sendToLocked)}</span></td><td>${esc(x.pic || '')}</td></tr>`; }).join('') + `</tbody></table></div>`;
    $('pm_body').innerHTML = `<div class="qcards">${card('transfer', PM.accCards.transfer(withAcc.length), esc(R.baht(transferNet)))}${card('wht', PM.accCards.wht, R.fmtNum(whtAll.length))}${card('paid', PM.accCards.paid, esc(R.baht(paidMonth)))}</div>` +
      (af.view === 'transfer' ? `<section class="card pm-sec"><div class="card-head"><h3>${esc(PM.runsToPay)}</h3></div>${runs}</section>` : '') +
      (af.view === 'wht' ? `<section class="card pm-sec"><div class="card-head"><h3>${esc(PM.whtCerts)} <span class="muted">${R.fmtNum(wht.length)}</span></h3><div class="btns">` +
        (canPaid && pv.wsel.size ? `<b>${esc(C.deal.selected(pv.wsel.size))}</b><button type="button" class="btn small primary" data-pact="whtsent">${esc(PM.markSent)}</button>` : '') +
        (canPaid ? `<button type="button" class="btn small ghost" data-pact="whtcsv">${esc(PM.whtSummary)}</button>` : '') + `</div></div>${whtTbl}</section>` : '') +
      (af.view === 'paid' ? `<section class="card pm-sec"><div class="card-head"><h3>${esc(PM.paidSec)}</h3></div><div id="pm_paidsec"></div></section>` : '');
    if (af.view === 'paid') drawHistory(s, td, $('pm_paidsec'));
    /* Send to: the WHT contact, decrypted in memory while the vault is open — never stored */
    if (unlocked) document.querySelectorAll('#pm_body [data-whtto]').forEach(async el => { const p = R.payeeById(state(), el.dataset.whtto); const rec = p && p.secure ? await KT.vault.decrypt(p.secure) : null; el.textContent = (rec && rec.wht_contact) || '—'; });
  }
  /* ===================== Paid (was History) ===================== */
  function histRange(td) { const h = pv.hist; return h.preset === 'custom' && h.from && h.to ? [h.from, h.to] : R.dateRangePreset(h.preset, td); }
  function drawHistory(s, td, box) {
    const h = pv.hist, [from, to] = histRange(td), runs = (s.payment_runs || []).slice().sort((a, b) => b.run_id.localeCompare(a.run_id));
    const all = R.paidLines(s).filter(l => l.paid_date >= from && l.paid_date <= to && (!h.run || l.run_id === h.run)).map(l => R.payItem(s, td, { line: l })).filter(x => matchQ(x, R.trim(pv.af.q).toLowerCase()));
    const list = all;
    pv.items = list;
    const presets = R.PRESETS.concat(['custom']).map(k => `<button type="button" class="${h.preset === k ? 'on' : ''}" data-hpreset="${k}">${esc(C.overview.presets[k])}</button>`).join('');
    const t =['gross', 'wht', 'net'].map(k => R.round2(list.reduce((a, x) => a + x.tax[k], 0)));
    box.innerHTML = `<div class="toolbar pm-row2"><div class="seg" role="group" aria-label="${esc(PM.paidDate)}">${presets}</div>` +
      (h.preset === 'custom' ? '' : `<span class="muted small">${esc(R.dmy(from))} – ${esc(R.dmy(to))}</span>`) +
      `<span class="${h.preset === 'custom' ? 'pm-custom' : 'hidden'}">${U.rangeHTML('id="ph_range"', from, to, { label: C.overview.presets.custom })}</span>` +   // CR-10 §4.8
      `<label class="tlab">${esc(PM.run)} <select id="ph_run">${optionsHTML(runs.map(r => r.run_id), h.run, PM.allRunsOpt)}</select></label><span class="spacer"></span>` +
      (can('payment.paid') ? `<button type="button" class="btn small" data-pact="outsidepick">${esc(PM.paidOutside)}</button>` : '') + `<button type="button" class="btn small ghost" data-pact="csv">${esc(PM.csv)}</button></div>` +
      (!list.length ? (pv.used.length ? U.noMatchHTML(PM.noHistoryMatch, pv.used) : `<div class="hint">${esc(PM.noHistory)}</div>`) : `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl"><thead><tr>` +
        `<th>${esc(PM.paidDate)}</th><th>${esc(PM.run)}</th><th>${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th>${esc(PM.col.milestone)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th><th>${esc(PM.whtCert)}</th><th>${esc(PM.col.pic)}</th></tr></thead><tbody>` +
        list.map(x => { const l = x.line, name = x.kol ? x.kol.display_name : x.account_handle;
          return `<tr><td class="nowrap">${esc(R.dmy(l.paid_date))}</td>` +
            `<td>${l.run_id ? `<button type="button" class="link" data-prun="${esc(l.run_id)}">${esc(l.run_id)}</button>` : `<span class="muted small">${esc(PM.sources[l.source] || '')}</span>`}</td>` +
            `<td class="pm-kol"><b>${esc(name)}</b></td><td class="muted cph">${esc(x.project_label || '')}</td><td>${esc(C.pay.milestone[x.milestone] || x.milestone)}</td>` +
            `<td class="num">${money(l.gross)}</td><td class="num">${money(l.wht)} <span class="muted small">${l.wht_rate}%</span></td><td class="num"><b>${money(l.net)}</b></td>` +
            `<td>${l.wht > 0 ? (l.wht_cert_sent_date ? `✓ <span class="muted small">${esc(R.dmy(l.wht_cert_sent_date))}</span>` : `<span class="chip warn-chip">${esc(PM.notSent)}</span>`) : '<span class="muted">—</span>'}</td><td>${esc(x.pic || '')}</td></tr>`; }).join('') +
        `<tr class="total"><td colspan="5">${esc(PM.totalLine(list.length))}</td><td class="num">${money(t[0])}</td><td class="num">${money(t[1])}</td><td class="num">${money(t[2])}</td><td colspan="2"></td></tr></tbody></table></div>`);
    if ($('ph_range')) $('ph_range').addEventListener('change', e => { const x = e.target.dataset; if (R.isISODate(x.from) && R.isISODate(x.to)) { Object.assign(h, { preset: 'custom', from: x.from, to: x.to }); draw(); } });
    if ($('ph_run')) $('ph_run').addEventListener('change', e => { h.run = e.target.value; draw(); });
  }
  function whtSentDialog() {
    if (!U.guard('payment.paid')) return;
    const lines = (pv.whtItems || []).filter(x => pv.wsel.has(x.key)).map(x => x.line).filter(l => l.wht > 0);
    openDialog(`<div class="dlg-h">${esc(PM.markWhtSentTitle(lines.length))}</div><div class="dlg-b"><div class="field"><label for="ws_date">${esc(PM.sentOn)}</label>${U.dateHTML('id="ws_date"', today(), { label: PM.sentOn })}</div></div>
      <div class="dlg-f"><button type="button" class="btn" id="ws_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="ws_ok">${esc(PM.markWhtSent)}</button></div>`);
    $('ws_cancel').addEventListener('click', closeDialog);
    $('ws_ok').addEventListener('click', () => { const d = $('ws_date').value; if (!R.isISODate(d) || !U.guard('payment.paid')) return; R.markWhtSent(lines, d); pv.wsel.clear(); closeDialog(); commit(PM.whtSentDone(lines.length)); draw(); });
  }
  function exportWht() {
    const s = state(), [from, to] = histRange(today()), lines = R.paidLines(s).filter(l => l.paid_date >= from && l.paid_date <= to);
    downloadCSV(`wht_summary_${from.replace(/-/g, '')}_${to.replace(/-/g, '')}.csv`, R.WHT_SUMMARY_COLS, R.whtSummary(s, lines).map(r => R.WHT_SUMMARY_COLS.map(k => r[k])));
  }

  /* ===================== Manual line · outside the app · cancel (§4.5, §4.8) ===================== */
  /* mo: the dialog's values (kept when "+ New payee" opens the Payee dialog in between) */
  function openManual(mo, opener) {
    if (!U.guard('payment.manual')) return;
    const s = state(), S = R.paySettings(s.lookups), payees = (s.payee_profiles || []).slice().sort((a, b) => String(a.account_handle).localeCompare(String(b.account_handle)));
    const m = Object.assign({ source: 'affiliate', payee_id: '', campaign_id: '', project_label: '', agreed_amount: '', price_basis: 'gross', wht_rate: '', due_date: today(), pay_to: 'payee', reimburse_user: '', note: '' }, mo || {});
    const payee = () => R.payeeById(state(), $('mn_payee').value);
    const label = p => `${p.account_handle}${p.kol_id ? ` · KOL` : ''}${p.secure ? ` · ${p.bank_name || ''} ···${p.account_last4}` : ''}`;
    const users = (s.users || []).filter(u => u.active !== false);
    U.createModal({ size: 'M', title: PM.manualTitle, opener, isDirty: () => touched, foot: [`<div class="checks" id="mn_checks"></div>`, U.cmButtons(PM.addManualOk, 'mn_ok')], body: `<div class="fields">
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
      </div><div id="mn_tax"></div>` });
    U.enhanceCombos($('cm_root'));
    const read = () => ({ source: $('mn_src').value, payee_id: $('mn_payee').value, campaign_id: $('mn_camp').value, project_label: $('mn_proj').value, agreed_amount: $('mn_amt').value, price_basis: $('mn_basis').value,
      wht_rate: $('mn_wht').value, due_date: $('mn_due').value, pay_to: $('mn_payto').value, reimburse_user: $('mn_user').value, note: $('mn_note').value });
    let lastPayee = m.payee_id, touched = !!mo;
    const chk = () => {
      const v = read(), p = payee();
      if (p && v.payee_id !== lastPayee) { lastPayee = v.payee_id; if (p.default_wht_rate != null) $('mn_wht').value = String(p.default_wht_rate); if (p.price_basis) $('mn_basis').value = p.price_basis; return chk(); }
      $('mn_userW').classList.toggle('hidden', v.pay_to !== 'reimburse');
      $('mn_payeeinfo').innerHTML = !p ? '' : p.secure ? esc(R.bankLine(state().lookups, p)) : `<span class="warn">${esc(PY.missing(PY.missingBank))}</span>`;
      const res = R.validateManual(state(), v), t = !(Number(v.agreed_amount) > 0) ? null : R.taxOf(state(), v, p);
      $('mn_tax').innerHTML = t ? taxBox(t, v.price_basis === 'net' ? R.round2(t.gross - Number(v.agreed_amount)) : 0) : '';
      $('mn_checks').innerHTML = touched ? checksHTML(res, '') : ''; return res;
    };
    const touch = () => { touched = true; chk(); };
    ['mn_src', 'mn_payee', 'mn_camp', 'mn_proj', 'mn_amt', 'mn_basis', 'mn_wht', 'mn_due', 'mn_payto', 'mn_user', 'mn_note'].forEach(id => { $(id).addEventListener('input', touch); $(id).addEventListener('change', touch); });
    /* + New payee: this modal steps aside (what was typed is kept) and comes back with the new payee picked — never two modals at once */
    $('mn_newpayee').addEventListener('click', () => { const keep = read(); U.closeModal(); KT.payee.openDialog({ newPayee: true, onSaved: rec => openManual(Object.assign(keep, { payee_id: rec.payee_id }), opener) }); });
    $('mn_ok').addEventListener('click', () => {
      touched = true;
      if (chk().errs.length || !U.guard('payment.manual')) return;
      const s2 = state(), line = R.newManualLine(s2, Object.assign(read(), { lineId: store.newId('line'), user: userId(), now: new Date().toISOString() }));
      s2.payment_lines.push(line); s2.deal_events.push(paymentEvent(line, null, 'open', null));
      U.closeModal(); commit(PM.manualAdded(line.line_id)); pv.tab = 'topay'; draw();
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
  /* CR-09 §4.15.2 — Mark paid outside app lives in Accounting › Paid: pick the lines (owed, not in a run), then the date and a note */
  function outsidePick() {
    if (!U.guard('payment.paid')) return;
    pv.pick = { q: '', sel: new Set() };
    openDialog(`<div class="dlg-h">${esc(PM.outsidePickTitle)}</div><div class="dlg-b"><input type="search" class="search" id="op_q" placeholder="${esc(PM.search)}" autocomplete="off"><div id="op_list" style="margin-top:8px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="op_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="op_next" disabled>${esc(PM.paidOutside)}</button></div>`, 'mid');
    $('op_q').addEventListener('input', e => { pv.pick.q = e.target.value; drawPick(); });
    $('op_list').addEventListener('change', e => { const c = e.target.closest('[data-opsel]'); if (c) { c.checked ? pv.pick.sel.add(c.dataset.opsel) : pv.pick.sel.delete(c.dataset.opsel); $('op_next').disabled = !pv.pick.sel.size; } });
    $('op_cancel').addEventListener('click', closeDialog);
    $('op_next').addEventListener('click', () => { pv.items = pv.pick.items.filter(x => pv.pick.sel.has(x.key)); pv.selected.clear(); pv.items.forEach(x => pv.selected.add(x.key)); closeDialog(); outsideDialog(); });
    drawPick();
  }
  function drawPick() {
    const s = state(), td = today(), q = R.trim(pv.pick.q).toLowerCase();
    const items = R.payQueue(s, td).items.filter(x => (x.status === 'ready' || x.status === 'missing_docs' || x.status === 'not_due' || x.status === 'on_hold') && !x.run_id)
      .filter(x => !q || [x.kol && x.kol.display_name, x.account_handle, x.deal_id].some(v => String(v || '').toLowerCase().includes(q.replace(/^@/, ''))));
    pv.pick.items = items;
    $('op_list').innerHTML = `<div class="tablewrap" style="max-height:50vh"><table class="tbl compact-sm"><tbody>` + items.slice(0, 300).map(x => `<tr><td class="cb"><input type="checkbox" data-opsel="${esc(x.key)}"${pv.pick.sel.has(x.key) ? ' checked' : ''}></td>` +
      `<td><b>${esc(x.kol ? x.kol.display_name : x.account_handle)}</b></td><td class="muted">${esc(x.project_label || '')}</td><td>${esc(C.pay.milestone[x.milestone] || x.milestone)}</td><td class="num">${money(x.tax.gross)}</td><td>${statusChip(x.status)}</td></tr>`).join('') + `</tbody></table></div>`;
  }
  function cancelLinesDialog() {
    if (!U.guard('payment.run')) return;
    const items = pv.items.filter(x => pv.selected.has(x.key));
    askReason(PM.cancelTitle(items.length), PM.cancelLine, why => { const s = state(), evs = R.cancelLines(s, items, why, ctxOf()); s.deal_events.push(...evs); pv.selected.clear(); commit(PM.cancelledN(items.length)); draw(); });
  }

  /* ===================== CR-17 §4.2 — Simple mode: To pay · Sent · Paid ===================== */
  const PS = C.pay.simple, RD = C.pay.ready;   // CR-32 §2.5: Ready to send
  const SIMPLE_DUE = ['ready', 'missing_docs', 'on_hold', 'in_run'];
  const canPayX = (s, x) => R.canPaySimple(s, U.actor(), x);
  /* rows by key, worked out again from the data as it is now (a row may have changed since the table was drawn) */
  const itemsNow = keys => { const set = new Set(keys); return R.payQueue(state(), today()).items.filter(x => set.has(x.key)); };
  const rowName = x => (x.kol ? x.kol.display_name : x.account_handle || (x.payee && x.payee.account_handle) || '');
  /* Mark paid: a small form (Paid date · Ref) → Paid · Undo for 10 seconds */
  function markPaidPop(anchor, keys, after) {
    const s = state(), items = itemsNow(keys).filter(x => canPayX(s, x) && x.status !== 'paid' && x.status !== 'on_hold');
    if (!items.length) { toast(PS.noneToPay); return; }
    const one = items.length === 1 ? items[0] : null;
    const gaps = [...new Set(items.flatMap(x => R.paymentReadiness(s, x).missing))].map(k => RD.items[k]);   // CR-32 §2.5: a warning, never a block
    U.popForm(anchor, { title: one ? PS.markPaidOne(rowName(one), C.pay.milestone[one.milestone] || one.milestone) : PS.markPaidN(items.length), ok: PS.confirm, focus: '#mpp_ref',
      body: (gaps.length ? `<div class="check warn pm-paidwarn">! <span>${esc(RD.markPaidWarn(gaps.join(' · ')))}</span></div>` : '') + `<div class="field"><label for="mpp_date">${esc(PM.paidOnDate)}</label>${U.dateHTML('id="mpp_date"', today(), { label: PM.paidOnDate })}</div>` +
        `<div class="field"><label for="mpp_ref">${esc(PS.ref)} <span class="muted small">${esc(PS.optional)}</span></label><input id="mpp_ref" autocomplete="off" placeholder="${esc(PS.refPh)}"></div>` +
        (items.length > 1 ? `<div class="hint">${esc(PS.sameForAll)}</div>` : ''),
      onOk: m => {
        const date = m.querySelector('#mpp_date').value, ref = R.trim(m.querySelector('#mpp_ref').value);
        if (!R.isISODate(date)) { U.popFormError(m, C.msg.dateInvalid(PM.paidOnDate)); return false; }
        if (R.looksSensitive(ref)) { U.popFormError(m, C.msg.sensitive); return false; }
        const s2 = state(), now = itemsNow(items.map(x => x.key)).filter(x => canPayX(s2, x));
        const r = R.markItemsPaid(s2, now, { date, ref }, ctxOf()); s2.deal_events.push(...r.events);
        pv.selected.clear(); commit(); if (after) after();
        U.toastAction(PS.paidDone(r.n), C.deal.undo, () => { const s3 = state(); s3.deal_events.push(...R.undoMarkPaid(s3, r.undo, ctxOf())); commit(PS.undone); if (after) after(); }, 10000);
        return true;
      } });
  }
  /* Mark unpaid (Admin · KOL Manager · Accounting) — a reason */
  function markUnpaidAsk(lineId, after) {
    if (!R.canUnpay(U.actor())) { toast(PS.onlyManagers); return; }
    const l = state().payment_lines.find(x => x.line_id === lineId); if (!l || l.status !== 'paid') return;
    askReason(PS.unpaidTitle(l.account_handle || ''), PS.markUnpaid, why => {
      const s = state(), l2 = s.payment_lines.find(x => x.line_id === lineId); if (!l2 || !R.canUnpay(U.actor())) return;
      const evs = R.markUnpaid(s, l2, why, ctxOf()); if (!evs) return;
      s.deal_events.push(...evs); commit(PS.unpaidDone); if (after) after();
    });
  }
  /* CR-32 §2.5 — Manager / Admin (the file has personal and bank details) */
  const isMgr = () => ['admin', 'kol_manager'].includes((U.actor() || {}).role);
  /* before a PR file: n lines (+ how many were left out) · "This file contains personal and bank details — share only with accounting" · the vault unlocked
     (Unlock and export) — a promise: true = go on · false = cancelled */
  function askExport(n, skipped, label) {
    const s = state(), vault = s.lookups.payee_vault, V = KT.vault, locked = !!vault && !V.isUnlocked(vault);
    if (locked && !can('payee.unlock')) { toast(PS.exportNeedsManager); return Promise.resolve(false); }
    return new Promise(resolve => {
      openDialog(`<div class="dlg-h">${esc(PS.exportTitle(n))}${label ? ` <span class="muted small">· ${esc(label)}</span>` : ''}</div><div class="dlg-b">` +
        (skipped ? `<p class="hint" style="margin-top:0">${esc(PS.exportOnlyReady(n, n + skipped))}</p>` : '') + `<div class="check warn">! <span>${esc(PS.exportPii)}</span></div></div>` +
        `<div class="dlg-f"><button type="button" class="btn" id="ex_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="ex_ok">${esc(locked ? PS.unlockExport : PS.exportOk)}</button></div>`);
      let done = false; const onClose = () => { if (!U.dlg.open) end(false); }, end = v => { if (done) return; done = true; U.dlg.removeEventListener('close', onClose); resolve(v); };
      U.dlg.addEventListener('close', onClose);   // a late close event of the dialog before is not an answer
      $('ex_cancel').addEventListener('click', () => { closeDialog(); end(false); });
      $('ex_ok').addEventListener('click', () => { U.dlg.removeEventListener('close', onClose); done = true; closeDialog(); if (locked) KT.payee.unlockDialog(() => resolve(true)); else resolve(true); });
    });
  }
  /* Export for accounting (To pay): only the rows Ready to send (the others stay · "n lines skipped — missing details") → the PR file → "Mark n lines as sent to accounting?" (Yes = Sent · No = nothing changes) */
  async function exportForAccounting(keys) {
    if (!isMgr()) { toast(PS.exportNeedsManager); return; }
    const s = state(), all = itemsNow(keys).filter(x => canPayX(s, x) && !['paid', 'on_hold', 'submitted'].includes(x.status));
    if (!all.length) { toast(PS.noneToSend); return; }
    const items = all.filter(x => R.paymentReadiness(s, x).ready), skipped = all.length - items.length;
    if (!items.length) { toast(RD.skipped(skipped)); return; }
    if (!(await askExport(items.length, skipped))) return;
    const ctx = ctxOf(), r = R.sendToAccounting(state(), itemsNow(items.map(x => x.key)), { date: today() }, ctx); if (!r) return;
    await writePr(r.run, true);
    const yes = await new Promise(resolve => {
      openDialog(`<div class="dlg-h">${esc(PS.sentAsk(r.lines.length))}</div><div class="dlg-b"><p style="margin-top:0">${esc(PS.sentAskBody)}</p></div>
        <div class="dlg-f"><button type="button" class="btn" data-r="0">${esc(PS.sentNo)}</button><button type="button" class="btn primary" data-r="1">${esc(PS.sentYes)}</button></div>`);
      let done = false; const onClose = () => { if (!U.dlg.open) end(false); }, end = v => { if (done) return; done = true; U.dlg.removeEventListener('close', onClose); closeDialog(); resolve(v); };
      U.dlg.addEventListener('close', onClose);   // a late close event of the dialog before is not an answer
      U.dlg.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => end(b.dataset.r === '1')));
      U.dlg.querySelector('[data-r="1"]').focus();   // Yes is the default
    });
    const s2 = state();
    if (!yes) { R.undoSend(s2, r.undo); draw(); return; }
    s2.deal_events.push(...r.events); pv.selected.clear(); commit(PS.sentDone(r.lines.length, r.run.label) + (skipped ? ' · ' + RD.skipped(skipped) : '')); draw();
  }
  /* Sent › Export again: the PR of each run the ticked rows are in (Manager / Admin · unlocked) */
  async function exportAgain(keys) {
    if (!isMgr()) { toast(PS.exportNeedsManager); return; }
    const s = state(), runs = [...new Set(itemsNow(keys).map(x => x.run_id).filter(Boolean))].map(id => s.payment_runs.find(r => r.run_id === id)).filter(Boolean);
    if (!runs.length || !(await askExport(runs.reduce((a, run) => a + R.runLines(s, run.run_id).length, 0), 0, runs.map(r => r.label || r.run_id).join(' · ')))) return;
    for (const run of runs) await writePr(run, true);
  }
  /* Sent › ⋯ Move back to To pay */
  function moveBack(key, after) {
    const s = state(), x = itemsNow([key])[0]; if (!x || !x.line || !canPayX(s, x)) return;
    askReason(PM.details.moveBackTitle, PS.moveBack, why => {   // CR-27 §5 U1: a reason
      const s2 = state(), x2 = itemsNow([key])[0]; if (!x2 || !x2.line) return;
      const evs = R.moveBackToPay(s2, x2.line, ctxOf(), why); if (!evs) return;
      s2.deal_events.push(...evs); commit(PS.movedBack); draw(); if (after) after();
    });
  }
  /* the status of a row in Simple mode: Due · Not due · On hold · In a run (a Draft from Full mode) */
  const SIMPLE_ST = { ready: 'due', missing_docs: 'due', not_due: 'not_due', on_hold: 'on_hold', in_run: 'in_run', submitted: 'sent', paid: 'paid' };
  const simpleChip = st => { const k = SIMPLE_ST[st] || st; return `<span class="st ${{ due: 'warn', not_due: 'muted', on_hold: 'holdc', in_run: 'progress', sent: 'subm', paid: 'done' }[k] || ''}">${esc(PS.status[k] || k)}</span>`; };
  /* CR-27 — Send (to accounting) beside Mark paid: a row that is owed or coming, not in a run */
  const sendBtn = (s, x) => (canPayX(s, x) && ['ready', 'missing_docs', 'not_due'].includes(x.status) ? (x.rd && !x.rd.ready   // CR-32 §2.5: not Ready → grey (what is missing on hover)
    ? `<span class="pm-sendw" title="${esc(RD.notReadyTip(readyLabels(x.rd)))}"><button type="button" class="btn small pm-sendbtn" disabled>${esc(PS.send)}</button></span>`
    : `<button type="button" class="btn small pm-sendbtn" data-psend="${esc(x.key)}">${esc(PS.send)}</button>`) : '');
  /* Docs 2/4 — grey · a click opens Payment details at Documents (CR-27 · Full mode: the list of what is missing) · never blocks */
  const docsChip = x => { const t = x.docs; if (!t) return '';
    return t.have < t.need ? `<button type="button" class="pm-docs-n" data-pmiss="${esc(x.key)}" title="${esc(t.missing.map(missingLabelOf).join(' · '))}" aria-haspopup="true">${esc(PS.docsN(t.have, t.need))}</button>`
      : `<span class="pm-docs-n ok" title="${esc(PY.docsOnFile)}">${esc(PS.docsN(t.have, t.need))} ✓</span>`; };
  const payBtn = (s, x) => (canPayX(s, x) ? (x.status === 'on_hold' ? `<button type="button" class="btn small" disabled title="${esc(PS.heldTip)}">${esc(PS.markPaid)}</button>`
    : `<button type="button" class="btn small primary pm-paybtn" data-ppaid="${esc(x.key)}">${esc(PS.markPaid)}</button>`) : '');
  /* Sent: what went to Accounting and waits to be paid (more than 7 days = yellow) */
  function drawSent(s, q, td) {
    const list = q.items.filter(x => x.status === 'submitted' && inScope(s, x)).sort((a, b) => String(R.sentAt(s, a.line)).localeCompare(String(R.sentAt(s, b.line))));
    pv.items = list; [...pv.selected].forEach(k => { if (!list.some(x => x.key === k)) pv.selected.delete(k); });
    const sel = [...pv.selected], canBulk = list.some(x => canPayX(s, x));
    const bulk = sel.length ? `<b class="pm-seln">${esc(C.deal.selected(sel.length))}</b><button type="button" class="btn small primary" data-pact="spaid">${esc(PS.markPaid)}</button>` +
      `<button type="button" class="btn small" data-pact="sagain">${esc(PS.exportAgain)}</button><button type="button" class="btn small ghost" data-pact="clearsel">${esc(C.deal.clear)}</button>` : '';
    const ctx = R.dealContext(s);
    list.forEach(x => { x.docs = R.docsTally(s, x); });   // CR-27: documents can still be checked here
    const rows = list.map(x => { const days = R.sentDays(s, x.line, td), late = days != null && days > R.SENT_LATE_DAYS, run = s.payment_runs.find(r => r.run_id === x.run_id) || {};
      const ph = x.deal ? ctx.phases.get(R.primaryPhase(ctx.phaseIdx, x.deal_id)) : null;
      const menu = canPayX(s, x) || x.deal ? `<details class="menu pm-menu"><summary class="icon-btn" aria-label="${esc(PM.rowMenu)}" title="${esc(PM.rowMenu)}">⋯</summary><div class="menu-list right">` +
        (canPayX(s, x) ? `<button type="button" class="mi" data-pback="${esc(x.key)}">${esc(PS.moveBack)}</button>` : '') + (x.deal ? `<button type="button" class="mi" data-pdeal="${esc(x.deal_id)}">${esc(PM.openDeal)}</button>` : '') + `</div></details>` : '';
      return `<tr tabindex="0" data-pkey="${esc(x.key)}">${canBulk ? `<td class="cb">${canPayX(s, x) ? `<input type="checkbox" data-psel="${esc(x.key)}"${pv.selected.has(x.key) ? ' checked' : ''} aria-label="${esc(rowName(x))}">` : ''}</td>` : ''}` +
        `<td class="pm-kol stk${canBulk ? '' : ' at0'}"><span class="kname"><b>${U.nameHTML(rowName(x))}</b></span>${R.payeeTag(s, x.payee) ? ` <span class="chip pm-ptag">→ ${esc(R.payeeTag(s, x.payee))}</span>` : ''}</td>` +
        `<td class="cph2"><span class="c1">${esc(x.deal ? R.campaignName(s, x.deal.campaign_id) : x.project_label || '')}</span>${ph ? `<span class="c2">${esc(R.phaseName(s, ph.phase_id))}</span>` : ''}</td>` +
        `<td class="nowrap">${esc(C.pay.milestone[x.milestone] || x.milestone)} ${docsChip(x)}</td><td class="num">${money(x.tax.gross)}</td><td class="num">${x.tax.wht ? money(x.tax.wht) : '<span class="muted">0.00</span>'}</td><td class="num"><b>${money(x.tax.net)}</b></td>` +
        `<td class="nowrap"><span class="${late ? 'pm-late' : ''}">${esc(R.dmy(R.dateOfTimestamp(R.sentAt(s, x.line))).slice(0, 5))}</span> <span class="muted small${late ? ' pm-late' : ''}">${esc(PS.waitingDays(days || 0))}</span></td>` +
        `<td class="muted small">${esc(run.label || run.run_id || '')}</td><td class="nowrap">${esc(x.pic || '')}</td><td class="pm-act">${payBtn(s, x)}${menu}</td></tr>`; }).join('');
    const t = ['gross', 'wht', 'net'].map(k => R.round2(list.reduce((a, x) => a + x.tax[k], 0)));
    $('pm_body').innerHTML = `<div class="toolbar pm-row2"><span class="hint">${esc(PS.sentHint)}</span><span class="spacer"></span>${bulk}</div>` +
      (!list.length ? `<div class="card empty"><b>${esc(PS.noSent)}</b></div>` : `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl pm-simple"><thead><tr>${canBulk ? `<th class="cb"><input type="checkbox" id="pm_all" aria-label="${esc(C.deal.selectAll)}"${list.filter(x => canPayX(s, x)).every(x => pv.selected.has(x.key)) ? ' checked' : ''}></th>` : ''}` +
        `<th class="stk${canBulk ? '' : ' at0'}">${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th>${esc(PM.col.milestone)}</th><th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th>` +
        `<th>${esc(PS.colSent)}</th><th>${esc(PM.run)}</th><th>${esc(PM.col.pic)}</th><th></th></tr></thead><tbody>${rows}` +
        `<tr class="total"><td colspan="${(canBulk ? 1 : 0) + 3}">${esc(PM.totalLine(list.length))}</td><td class="num">${money(t[0])}</td><td class="num">${money(t[1])}</td><td class="num">${money(t[2])}</td><td colspan="4"></td></tr></tbody></table></div>`);
  }
  /* Paid: paid date · paid by · ref · WHT certificate ticked on the row · ⋯ Mark unpaid (managers) */
  function drawPaid(s, td) {
    const h = pv.hist, [from, to] = histRange(td), actor = U.actor();
    const list = R.paidLines(s).filter(l => l.paid_date >= from && l.paid_date <= to).map(l => R.payItem(s, td, { line: l })).filter(x => inScope(s, x));
    pv.items = list; [...pv.selected].forEach(k => { if (!list.some(x => x.key === k)) pv.selected.delete(k); });
    list.forEach(x => { x.docs = R.docsTally(s, x); });   // CR-27: e.g. the WHT certificate kept later
    const canW = x => canPayX(s, x) && x.line.wht > 0, canBulk = list.some(canW);
    const presets = R.PRESETS.concat(['custom']).map(k => `<button type="button" class="${h.preset === k ? 'on' : ''}" data-hpreset="${k}">${esc(C.overview.presets[k])}</button>`).join('');
    const sel = [...pv.selected];
    const bulk = sel.length ? `<b class="pm-seln">${esc(C.deal.selected(sel.length))}</b><button type="button" class="btn small primary" data-pact="swht">${esc(PS.markWht)}</button><button type="button" class="btn small ghost" data-pact="clearsel">${esc(C.deal.clear)}</button>` : '';
    const rows = list.map(x => { const l = x.line;
      const menu = R.canUnpay(actor) || x.deal ? `<details class="menu pm-menu"><summary class="icon-btn" aria-label="${esc(PM.rowMenu)}" title="${esc(PM.rowMenu)}">⋯</summary><div class="menu-list right">` +
        (R.canUnpay(actor) ? `<button type="button" class="mi danger" data-punpaid="${esc(l.line_id)}">${esc(PS.markUnpaid)}</button>` : '') + (x.deal ? `<button type="button" class="mi" data-pdeal="${esc(x.deal_id)}">${esc(PM.openDeal)}</button>` : '') + `</div></details>` : '';
      const wht = l.wht > 0 ? `<label class="tick pm-whtt"${l.wht_cert_sent_date ? ` title="${esc(PS.whtSentOn(R.dmy(l.wht_cert_sent_date)))}"` : ''}><input type="checkbox" data-pwht="${esc(l.line_id)}"${l.wht_cert_sent_date ? ' checked' : ''}${canW(x) ? '' : ' disabled'} aria-label="${esc(PM.whtCert)}">${l.wht_cert_sent_date ? ` <span class="muted small">${esc(R.dmy(l.wht_cert_sent_date).slice(0, 5))}</span>` : ''}</label>` : '<span class="muted">—</span>';
      return `<tr tabindex="0" data-pkey="${esc(x.key)}">${canBulk ? `<td class="cb">${canW(x) ? `<input type="checkbox" data-psel="${esc(x.key)}"${pv.selected.has(x.key) ? ' checked' : ''} aria-label="${esc(rowName(x))}">` : ''}</td>` : ''}` +
        `<td class="nowrap">${esc(R.dmy(l.paid_date))}</td><td class="pm-kol"><b>${U.nameHTML(rowName(x))}</b></td><td class="muted cph">${esc(x.project_label || '')}</td><td>${esc(C.pay.milestone[x.milestone] || x.milestone)} ${docsChip(x)}</td>` +
        `<td class="num">${money(l.gross)}</td><td class="num">${money(l.wht)} <span class="muted small">${l.wht_rate}%</span></td><td class="num"><b>${money(l.net)}</b></td>` +
        `<td class="nowrap">${esc(l.paid_by ? R.changedByName(s, l.paid_by) : l.run_id ? PS.byAccounting : PM.sources[l.source] || '—')}</td><td class="small">${l.paid_ref ? esc(l.paid_ref) : '<span class="muted">—</span>'}</td>` +
        `<td>${wht}</td><td class="nowrap">${esc(x.pic || '')}</td><td class="pm-act">${menu}</td></tr>`; }).join('');
    const t = ['gross', 'wht', 'net'].map(k => R.round2(list.reduce((a, x) => a + x.tax[k], 0)));
    $('pm_body').innerHTML = `<div class="toolbar pm-row2"><div class="seg" role="group" aria-label="${esc(PM.paidDate)}">${presets}</div>` +
      (h.preset === 'custom' ? '' : `<span class="muted small">${esc(R.dmy(from))} – ${esc(R.dmy(to))}</span>`) +
      `<span class="${h.preset === 'custom' ? 'pm-custom' : 'hidden'}">${U.rangeHTML('id="ph_range"', from, to, { label: C.overview.presets.custom })}</span><span class="spacer"></span>${bulk}` +
      (!sel.length && can('payment.paid') ? `<button type="button" class="btn small" data-pact="outsidepick">${esc(PM.paidOutside)}</button>` : '') +
      `<button type="button" class="btn small ghost" data-pact="csv">${esc(PS.export)}</button>${!sel.length && R.canUnpay(actor) ? `<button type="button" class="btn small ghost" data-pact="whtcsv">${esc(PM.whtSummary)}</button>` : ''}</div>` +
      (!list.length ? (pv.used && pv.used.length ? U.noMatchHTML(PM.noHistoryMatch, pv.used) : `<div class="hint">${esc(PM.noHistory)}</div>`) : `<div class="tablewrap pm-wrap"><table class="tbl pm-tbl pm-simple"><thead><tr>` +
        `${canBulk ? `<th class="cb"><input type="checkbox" id="pm_all" aria-label="${esc(C.deal.selectAll)}"${list.filter(canW).every(x => pv.selected.has(x.key)) ? ' checked' : ''}></th>` : ''}<th>${esc(PM.paidDate)}</th><th>${esc(PM.col.kol)}</th><th>${esc(PM.col.campaign)}</th><th>${esc(PM.col.milestone)}</th>` +
        `<th class="num">${esc(PM.col.gross)}</th><th class="num">${esc(PM.col.wht)}</th><th class="num">${esc(PM.col.net)}</th><th>${esc(PS.colPaidBy)}</th><th>${esc(PS.ref)}</th><th>${esc(PM.whtCert)}</th><th>${esc(PM.col.pic)}</th><th></th></tr></thead><tbody>${rows}` +
        `<tr class="total"><td colspan="${(canBulk ? 1 : 0) + 4}">${esc(PM.totalLine(list.length))}</td><td class="num">${money(t[0])}</td><td class="num">${money(t[1])}</td><td class="num">${money(t[2])}</td><td colspan="5"></td></tr></tbody></table></div>`);
    if ($('ph_range')) $('ph_range').addEventListener('change', e => { const x = e.target.dataset; if (R.isISODate(x.from) && R.isISODate(x.to)) { Object.assign(h, { preset: 'custom', from: x.from, to: x.to }); draw(); } });
  }
  /* Paid › Mark WHT cert sent (the ticked rows · today) · a row's ☐ ticks / unticks it */
  function whtSimple(lineIds, on) {
    const s = state(), lines = lineIds.map(id => s.payment_lines.find(l => l.line_id === id)).filter(Boolean)
      .filter(l => canPayX(s, R.payItem(s, today(), { line: l })) && l.wht > 0);
    if (!lines.length) return;
    lines.forEach(l => R.setWhtSent(l, on ? today() : null)); pv.selected.clear();
    commit(on ? PM.whtSentDone(lines.length) : PS.whtCleared); draw();
  }

  /* ===================== CR-27 §3.2 — Send to accounting (no file) · Mark docs received ===================== */
  /* o.anyway = Manager / Admin send a row that is not Ready (a reason, kept in History) */
  function sendPop(anchor, keys, after, o = {}) {
    const s = state(), all = itemsNow(keys).filter(x => canPayX(s, x) && !['paid', 'on_hold', 'submitted', 'in_run', 'cancelled'].includes(x.status));
    if (!all.length) { toast(PS.noneToSend); return; }
    const items = o.anyway ? all : all.filter(x => R.paymentReadiness(s, x).ready), skipped = all.length - items.length;   // CR-32 §2.5: Ready rows only
    if (!items.length) { toast(RD.skipped(skipped)); return; }
    const one = items.length === 1 ? items[0] : null, gaps = o.anyway ? [...new Set(items.flatMap(x => R.paymentReadiness(s, x).missing))].map(k => RD.items[k]).join(' · ') : '';
    U.popForm(anchor, { title: o.anyway ? RD.sendAnywayTitle(rowName(items[0])) : one ? PS.sendOne(rowName(one), C.pay.milestone[one.milestone] || one.milestone) : PS.sendN(items.length), ok: o.anyway ? RD.sendAnyway : PS.sendOk, focus: o.anyway ? '#sdp_why' : '#sdp_ref',
      body: (o.anyway ? `<p class="hint" style="margin-top:0">${esc(RD.sendAnywayHint)}</p><div class="field"><label for="sdp_why">${esc(RD.reasonL)} <span class="req">*</span></label><textarea id="sdp_why" rows="2"></textarea></div>` : '') +
        (skipped ? `<div class="hint">${esc(RD.skipped(skipped))}</div>` : '') +
        `<div class="field"><label for="sdp_date">${esc(PS.sentOn)}</label>${U.dateHTML('id="sdp_date"', today(), { label: PS.sentOn })}</div>` +
        `<div class="field"><label for="sdp_ref">${esc(PS.ref)} <span class="muted small">${esc(PS.optional)}</span></label><input id="sdp_ref" autocomplete="off" placeholder="${esc(PS.refPh)}"></div>`,
      onOk: m => {
        const date = m.querySelector('#sdp_date').value, ref = R.trim(m.querySelector('#sdp_ref').value), why = o.anyway ? R.trim(m.querySelector('#sdp_why').value) : '';
        if (o.anyway && !why) { U.popFormError(m, PM.reasonRequired); return false; }
        if (o.anyway && R.looksSensitive(why)) { U.popFormError(m, C.msg.sensitive); return false; }
        if (!R.isISODate(date)) { U.popFormError(m, C.msg.dateInvalid(PS.sentOn)); return false; }
        if (R.looksSensitive(ref)) { U.popFormError(m, C.msg.sensitive); return false; }
        if (o.anyway && !isMgr()) { toast(PS.exportNeedsManager); return true; }
        const s2 = state(), now = itemsNow(items.map(x => x.key)).filter(x => canPayX(s2, x) && (o.anyway || R.paymentReadiness(s2, x).ready));
        const r = R.sendToAccounting(s2, now, { date, ref }, ctxOf()); if (!r) { toast(PS.noneToSend); return true; }
        if (o.anyway) r.events.forEach(ev => { ev.note = [ev.note, RD.anywayNote(why, gaps)].filter(Boolean).join(' · '); });   // CR-32: why it went anyway
        s2.deal_events.push(...r.events); pv.selected.clear(); commit(); if (after) after();
        U.toastAction(PS.sentDone(r.lines.length, r.run.label) + (skipped ? ' · ' + RD.skipped(skipped) : ''), C.deal.undo, () => {
          const s3 = state(); R.undoSend(s3, r.undo);
          r.lines.forEach(l => { const still = s3.payment_lines.find(y => y.line_id === l.line_id); s3.deal_events.push({ event_id: store.newEventId(), deal_id: l.deal_id || null, line_id: l.line_id, type: 'payment', from: 'submitted', to: still ? still.status : null, changed_at: new Date().toISOString(), changed_by: userId(), note: 'undo' }); });
          commit(PS.undone); if (after) after();
        }, 10000);
        return true;
      } });
  }
  const mayDocs = (s, x) => !!x && x.pay_to !== 'reimburse' && (simple() ? canPayX(s, x) : can('payment.run') || can('payment.paid'));
  function markDocsReceived(keys) {
    const s = state(); let n = 0;
    itemsNow(keys).filter(x => mayDocs(s, x)).forEach(x => { const r = R.setItemDocs(s, x, R.allReceived(s, x, today()), ctxOf()); if (r.event && r.event.from !== r.event.to) { s.deal_events.push(r.event); n++; } });
    pv.selected.clear(); commit(PM.docs.bulkDone(n)); draw();
  }

  /* ===================== CR-27 §3.2 — Payment details (M · ‹ › the rows of the table) ===================== */
  const pd = { ref: null, keys: [], section: null, adding: false, after: null, addPayee: false };
  /* every row the details can show (To pay · Sent · Paid) · the same row again after a change (a worked-out row gets a line: a new key) */
  const allItems = s => { const td = today(); return R.payQueue(s, td).items.concat(R.paidLines(s).map(l => R.payItem(s, td, { line: l }))); };
  function findItem(s, ref) {
    if (!ref) return null;
    const list = allItems(s);
    return list.find(x => x.key === ref.key) || (ref.line_id && list.find(x => (x.line && x.line.line_id === ref.line_id) || (x.docsLine && x.docsLine.line_id === ref.line_id)))
      || (ref.deal_id && list.find(x => x.deal_id === ref.deal_id && x.milestone === ref.milestone && x.status !== 'cancelled')) || (ref.package_id && list.find(x => x.package_id === ref.package_id && !x.deal_id)) || null;
  }
  const refOf = x => ({ key: x.key, line_id: x.line ? x.line.line_id : x.docsLine ? x.docsLine.line_id : null, deal_id: x.deal_id, milestone: x.milestone, package_id: x.package_id });
  const tableKeys = () => [...document.querySelectorAll('#pm_body tr[data-pkey]')].map(tr => tr.dataset.pkey);
  /* o = { section: 'docs', opener, after (the screen that opened it — e.g. the Deal modal — draws again) } */
  function openDetails(key, o = {}) {
    const s = state(), x = (pv.items || []).find(i => i.key === key) || findItem(s, { key }); if (!x) return;
    Object.assign(pd, { ref: refOf(x), keys: tableKeys(), section: o.section || null, adding: false, after: o.after || null, addPayee: !!o.addPayee });
    U.createModal({ size: 'M', title: rowName(x), opener: o.opener, isDirty: () => false, body: '', foot: ['', `<button type="button" class="btn" data-cmclose>${esc(C.common.close)}</button>`], onClick: detailsClick });
    $('cm_body').addEventListener('change', detailsChange);
    $('cm_body').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'pd_newname') { e.preventDefault(); addDoc(); } });
    drawDetails();
  }
  const reopenDetails = () => { const s = state(), x = findItem(s, pd.ref); if (x) openDetails(x.key, { after: pd.after }); };
  const afterChange = () => { if ($('pm_body') && U.currentTab() === 'payments') draw(); if (pd.after) pd.after(); if (U.modalOpen() && $('pd_root')) drawDetails(); };
  function drawDetails() {
    const s = state(), x = findItem(s, pd.ref), box = $('cm_body'); if (!box) return;
    if (!x) { U.closeModal(); return; }
    pd.ref = refOf(x); pd.keys = $('pm_body') ? tableKeys() : pd.keys;
    const D = PM.details, DK = PM.docs, simp = simple(), may = canPayX(s, x), st = x.status, l = x.line, ctx = R.dealContext(s);
    $('cm_title').textContent = rowName(x);
    const ph = x.deal ? ctx.phases.get(R.primaryPhase(ctx.phaseIdx, x.deal_id)) : null, camp = x.deal ? R.campaignName(s, x.deal.campaign_id) : x.project_label || '';
    const i = pd.keys.indexOf(x.key), nav = pd.keys.length > 1 && i >= 0 ? `<span class="pd-nav"><button type="button" class="icon-btn" data-pdnav="-1"${i > 0 ? '' : ' disabled'} aria-label="${esc(D.prev)}" title="${esc(D.prev)}">‹</button>` +
      `<span class="muted small">${esc(D.navOf(i + 1, pd.keys.length))}</span><button type="button" class="icon-btn" data-pdnav="1"${i < pd.keys.length - 1 ? '' : ' disabled'} aria-label="${esc(D.next)}" title="${esc(D.next)}">›</button></span>` : '';
    const head = `<div class="pd-top"><div class="pd-meta"><span>${esc(camp)}${ph ? ` › ${esc(R.phaseName(s, ph.phase_id))}` : ''}</span>` +
      (x.deal ? `<button type="button" class="link" data-pddeal="${esc(x.deal_id)}" title="${esc(D.openDeal)}">${esc(x.deal_id)}</button>` : '') + (simp ? simpleChip(st) : statusChip(st)) + `</div>${nav}</div>`;
    const kv = (k, v) => `<div class="kv"><span>${esc(k)}</span><b>${v}</b></div>`;
    const amount = `<section class="pd-sec"><h4>${esc(D.amount)}</h4>` + kv(D.milestone, esc(C.pay.milestone[x.milestone] || x.milestone)) + kv(D.due, x.due_date ? esc(R.dmy(x.due_date)) : `<span class="muted">${esc(D.noDue)}</span>`) +
      kv(D.gross, money(x.tax.gross)) + kv(D.wht(x.tax.wht_rate || 0), money(x.tax.wht)) + kv(D.net, `<span class="pd-net">${money(x.tax.net)}</span>`) +
      (x.deal && Number(x.deal.other_fee) > 0 ? `<div class="hint">${esc(C.pay.otherLine(R.baht(x.deal.other_fee), x.deal.other_fee_note || ''))}</div>` : '') + `</section>`;   // CR-30 §3.2: "Other: <note>" in the deal's Total cost
    const canChange = !x.run_id && !R.linePayeeLocked(x.line) && !!x.kol_id && R.payeesOfKol(s, x.kol_id).length > 1 && (x.deal ? can('deal.edit') && R.canRequest(s, U.actor(), x.deal) : can('payment.manual'));
    const payee = x.payee ? `${esc(x.payee.label || PY.primary)} <span class="muted small">· ${esc(PY.types[x.payee.payee_type] || '')}</span>${x.payee.secure ? ` <b class="pd-bank">${esc(R.bankLine(s.lookups, x.payee))}</b>` : ''}`
      : `<span class="muted">${esc(PY.noPayeeYet)}</span>`;   // CR-16: no account number · CR-32: "KBank ••• 1234"
    /* CR-32 §2.1 — No payee yet · Add payee: the form here (through the vault) · saved → this row pays it · Open in KOL Master */
    const canAdd = !x.payee && !!x.kol_id && x.pay_to !== 'reimburse' && R.canEditPayee(s, U.actor(), null, x.kol || R.kolById(s, x.kol_id));
    const piOpen = canAdd && pd.addPayee, piState = KT.payee.nkVaultState();
    const piForm = piOpen ? `<div class="pd-pi" id="pd_pi">${KT.payee.payeeInlineHTML('pd', x.kol_id)}<div class="mv-err" data-err="pi_box"></div><div class="btns pd-pibtns"><button type="button" class="btn small" data-pdpicancel>${esc(C.common.cancel)}</button>` +
      (piState === 'open' ? `<button type="button" class="btn small primary" data-pdpisave>${esc(PY.addPayeeIn)}</button>` : '') + `</div></div>` : '';
    const payTo = `<section class="pd-sec" id="pd_payto"><h4>${esc(D.payTo)}</h4><div class="pd-row">${payee}${canChange ? ` <button type="button" class="link" data-pdpayto>${esc(D.change)}</button>` : ''}` +
      (canAdd && !piOpen ? ` · <button type="button" class="link" data-pdaddpayee>${esc(PY.addPayeeIn)}</button>` : '') +
      (x.kol_id ? ` · <button type="button" class="link small" data-pdpayee>${esc(PY.openInKm)}</button>` : x.payee ? ` · <button type="button" class="link" data-pdpayee>${esc(PM.payeeDetails)} ↗</button>` : '') + `</div>${piForm}</section>`;
    /* To pay → Sent to accounting → Paid: the dates · ref · who · the buttons of the step */
    const who = id => (id ? R.changedByName(s, id) : ''), sentAt = l ? R.sentAt(s, l) : null, at = st === 'paid' ? 2 : st === 'submitted' ? 1 : 0;
    const step = (k, n, line) => `<div class="pd-step${at > n ? ' done' : at === n ? ' cur' : ''}"><span class="pd-dot"></span><b>${esc(D.steps[k])}</b>${line ? `<span class="muted small">${esc(line)}</span>` : ''}</div>`;
    const track = `<div class="pd-track">` + step('topay', 0, x.due_date ? D.dueOn(R.dmy(x.due_date)) : '') +
      step('sent', 1, sentAt ? D.stepLine(R.dmy(R.dateOfTimestamp(sentAt)), l && l.sent_ref, who(l && l.sent_by)) : '') +
      step('paid', 2, st === 'paid' && l ? D.stepLine(R.dmy(l.paid_date), l.paid_ref, who(l.paid_by)) : '') + `</div>` +
      (st === 'on_hold' && l ? `<div class="hint pd-held">${esc(D.heldLine(l.hold_reason || '', who(l.hold_by)))}</div>` : '');
    const btn = (act, label, primary) => `<button type="button" class="btn small${primary ? ' primary' : ''}" data-pdact="${act}">${esc(label)}</button>`;
    const rd = R.paymentReadiness(s, x), toPay = ['ready', 'missing_docs', 'not_due'].includes(st);
    const sendB = rd.ready ? btn('send', PS.sendAcc) : `<span title="${esc(RD.notReadyTip(rd.missing.map(k => RD.items[k]).join(' · ')))}"><button type="button" class="btn small" disabled>${esc(PS.sendAcc)}</button></span>` + (isMgr() ? btn('anyway', RD.sendAnyway) : '');
    const acts = !simp ? `<div class="hint">${esc(D.fullMode)}</div>` : !may ? '' : toPay ? sendB + btn('paid', PS.markPaid, true) + (!x.run_id ? btn('hold', D.hold) : '')
      : st === 'submitted' ? btn('paid', PS.markPaid, true) + btn('back', D.moveBack) : st === 'on_hold' ? btn('release', D.release) : st === 'paid' && R.canUnpay(U.actor()) ? btn('unpaid', D.unpaid) : '';
    const status = `<section class="pd-sec"><h4>${esc(D.status)}</h4>${track}${acts ? `<div class="btns pd-acts">${acts}</div>` : ''}</section>`;
    /* CR-32 §2.5 — Ready to send: ✓ / ✗ for each thing Accounting needs · a missing one is filled from here */
    const fixLabel = i => (i.act === 'payee' ? (x.payee ? RD.acts.payeeEdit : RD.acts.payee) : RD.acts[i.act] || '');
    const ready = rd && x.pay_to !== 'reimburse' && (toPay || st === 'in_run') ? `<section class="pd-sec pd-ready" id="pd_ready"><h4>${esc(RD.title)} ${rd.ready ? `<span class="chip ok-chip">✓ ${esc(RD.ready)}</span>` : `<span class="chip warn-chip">${esc(RD.missingN(rd.missing.length))}</span>`}</h4><ul class="pd-rl">` +
      rd.items.map(i => `<li class="${i.ok ? 'ok' : i.warn ? 'warn' : 'bad'}" data-rk="${esc(i.key)}"><span class="pd-ri" aria-hidden="true">${i.ok ? '✓' : i.warn ? '!' : '✗'}</span><span class="pd-rt">${esc(RD.items[i.key])}` +
        (!i.ok && i.unknown ? ` <span class="muted small">· ${esc(RD.unknown)}</span>` : '') + (!i.ok && i.warn ? ` <span class="muted small">· ${esc(RD.warnOnly)}</span>` : '') + `</span>` +
        (!i.ok && i.act && fixLabel(i) ? `<button type="button" class="link small" data-pdfix="${esc(i.act)}">${esc(fixLabel(i))}</button>` : '') + `</li>`).join('') + `</ul></section>` : '';
    /* Documents (CR-32 §2.3): ☐ All documents in one file (one link) · else ID copy · Bank book · Post proof (Received + date · Link · Posted on) + your own · one Note */
    const list = R.docsChecklist(s, x), edit = mayDocs(s, x), got = list.filter(d => d.received).length, meta = R.docsMeta(x), one = meta.one.on;
    const docRow = (d, n) => {
      const autoNote = d.auto ? DK.auto.payee : '';
      return `<div class="pd-doc${d.received ? ' got' : ''}" data-doc="${n}"><div class="pd-d1"><label class="tick"><input type="checkbox" data-dk="received"${d.received ? ' checked' : ''}${d.auto || !edit ? ' disabled' : ''}> <b>${esc(d.label)}</b></label>` +
        (d.auto ? `<span class="muted small">${esc(autoNote)}${d.received_at ? ` · ${esc(R.dmy(d.received_at))}` : ''}</span>`
          : d.received ? `<span class="pd-dd">${U.dateHTML(`data-dk="received_at" id="pd_d${n}"`, d.received_at, { label: DK.date, disabled: !edit })}</span>` : '') +
        (d.custom && edit ? `<button type="button" class="link small" data-pdrm="${n}">${esc(DK.remove)}</button>` : '') + `</div>` +
        `<div class="pd-d2"><input data-dk="link" id="pd_l${n}" type="url" value="${esc(d.link)}" placeholder="${esc(DK.linkPh)}" aria-label="${esc(DK.link)} · ${esc(d.label)}" autocomplete="off"${edit && !d.auto ? '' : ' disabled'}>` +
        (/^https:\/\//i.test(d.link) ? `<a class="link small" href="${esc(d.link)}" target="_blank" rel="noopener noreferrer">${esc(DK.openLink)} ↗</a>` : '') + `</div>` +
        (d.key === 'post_proof' ? `<div class="pd-d3"><label class="muted small" for="pd_p${n}">${esc(DK.postedOn)}</label>${U.dateHTML(`data-dk="posted_on" id="pd_p${n}"`, d.posted_on || '', { label: DK.postedOn, disabled: !edit })}<span class="hint">${esc(DK.postProofHint)}</span></div>` : '') +
        `<div class="pd-derr" id="pd_e${n}"></div></div>`;
    };
    const oneBox = x.pay_to === 'reimburse' ? '' : `<label class="tick pd-one"><input type="checkbox" data-pdone${one ? ' checked' : ''}${edit ? '' : ' disabled'}> <b>${esc(DK.oneFile)}</b></label>` +
      (one ? `<div class="pd-onef"><div class="field"><label for="pd_onelink">${esc(DK.oneLink)} <span class="req">*</span></label><input id="pd_onelink" type="url" data-pdonek="link" value="${esc(meta.one.link)}" placeholder="${esc(DK.linkPh)}" autocomplete="off"${edit ? '' : ' disabled'}>` +
        (!meta.one.link ? `<div class="check warn">! <span>${esc(DK.oneNeedsLink)}</span></div>` : /^https:\/\//i.test(meta.one.link) ? `<a class="link small" href="${esc(meta.one.link)}" target="_blank" rel="noopener noreferrer">${esc(DK.openLink)} ↗</a>` : '') + `<div class="pd-derr" id="pd_eone"></div></div>` +
        `<div class="field"><label>${esc(DK.date)}</label>${U.dateHTML('data-pdonek="received_at" id="pd_onedate"', meta.one.received_at || '', { label: DK.date, disabled: !edit })}</div><div class="hint pd-onehint">${esc(DK.oneHint)}</div></div>` : '');
    const docs = `<section class="pd-sec" id="pd_docs"><div class="pd-sh"><h4>${esc(DK.title)} <span class="muted">${got}/${list.length}</span></h4>` +
      (edit && list.length && !one ? `<div class="btns">${list.some(d => !d.received) ? `<button type="button" class="btn small" data-pdact="allrec">${esc(DK.markAll)}</button>` : ''}<button type="button" class="btn small" data-pdact="adddoc">${esc(DK.add)}</button></div>` : '') + `</div>` +
      (x.pay_to === 'reimburse' ? `<div class="hint">${esc(DK.none)}</div>` : oneBox + (one ? '' : list.map(docRow).join(''))) +
      (pd.adding && !one ? `<div class="pd-doc pd-new"><input id="pd_newname" placeholder="${esc(DK.namePh)}" aria-label="${esc(DK.namePh)}" autocomplete="off"><button type="button" class="btn small primary" data-pdact="addok">${esc(DK.addOk)}</button><div class="pd-derr" id="pd_enew"></div></div>` : '') +
      (x.pay_to === 'reimburse' ? '' : `<div class="field wide pd-note"><label for="pd_note">${esc(DK.note)}</label><textarea id="pd_note" data-pdnote rows="2" placeholder="${esc(DK.notePh)}"${edit ? '' : ' disabled'}>${esc(meta.note || '')}</textarea><div class="pd-derr" id="pd_enote"></div></div>`) +
      `<p class="hint pd-dhint">${esc(DK.hint)}</p></section>`;
    const hist = R.lineHistory(s, x), evText = e => (e.type === 'payment_docs' ? D.evDocs(e.from, e.to) : e.note === 'undo' ? `${D.evUndo} · ${D.ev[e.from] || e.from || ''} → ${D.ev[e.to] || e.to || ''}` : `${D.ev[e.from] || e.from || '—'} → ${D.ev[e.to] || e.to || ''}`);
    const history = `<section class="pd-sec"><h4>${esc(D.history)}</h4>` + (hist.length ? `<ul class="pd-hist">${hist.slice().reverse().map(e => `<li><span class="muted small">${esc(R.dmy(String(e.changed_at || '').slice(0, 10)))} · ${esc(who(e.changed_by))}</span> <b>${esc(evText(e))}</b>` +
      (e.note && e.note !== 'undo' ? ` <span class="muted small">${esc(e.note)}</span>` : '') + `</li>`).join('')}</ul>` : `<div class="hint">${esc(D.noHistory)}</div>`) + `</section>`;
    const y = box.scrollTop;
    box.innerHTML = `<div class="pd-root" id="pd_root">${head}<div class="pd-grid"><div>${amount}${payTo}</div><div>${status}${ready}</div></div>${docs}${history}</div>`;
    box.scrollTop = y;
    if (pd.section === 'docs') { const el = $('pd_docs'); if (el) el.scrollIntoView({ block: 'start' }); const f = box.querySelector('#pd_docs input:not([disabled])'); if (f) f.focus({ preventScroll: true }); pd.section = null; }
    if (pd.section === 'ready') { const el = $('pd_ready'); if (el) el.scrollIntoView({ block: 'start' }); pd.section = null; }
    if (pd.section === 'payee') { const el = $('pd_payto'); if (el) el.scrollIntoView({ block: 'start' }); const f = box.querySelector('#pd_pi input:not([disabled]),#pd_pi button'); if (f) f.focus({ preventScroll: true }); pd.section = null; }
    if (pd.adding) { const n = $('pd_newname'); if (n) n.focus(); }
  }
  /* the checklist as it is kept (an "auto" document keeps only its own date, if any) with one row changed */
  function entriesWith(s, x, n, change) {
    const own = R.lineDocsOf(x.line || x.docsLine || x).items;
    return R.docsChecklist(s, x).map((d, i) => { const kept = own.find(o => o.key === d.key && !!o.custom === d.custom) || {};
      const e = { key: d.key, label: d.label, custom: d.custom, received_at: kept.received_at || null, link: kept.link || '', posted_on: d.key === 'post_proof' ? kept.posted_on || null : null };
      return i === n ? Object.assign(e, change) : e; }).filter(e => !(e.remove));
  }
  function saveDocs(entries, n, meta) {
    const s = state(), x = findItem(s, pd.ref); if (!x || !mayDocs(s, x)) return;
    const r = R.setItemDocs(s, x, entries, ctxOf(), meta);
    if (r.errs) {   // not kept: the message under the row · the field stays as typed
      const e = r.errs[0];
      if (/^docs_/.test(e.field)) { const el = $(e.field === 'docs_note' ? 'pd_enote' : 'pd_eone'); if (el) el.innerHTML = `<div class="check err">✕ <span>${esc(e.msg)}</span></div>`; return; }   // CR-32: the Note · All in one file
      const i = Number(String(e.field).replace(/\D+/g, ' ').trim().split(' ')[0]), el = $(n === 'new' ? 'pd_enew' : 'pd_e' + (isNaN(i) ? n : i));
      if (el) el.innerHTML = `<div class="check err">✕ <span>${esc(e.msg)}</span></div>`;
      const fld = String(e.field).split('_').pop(), inp = n === 'new' ? $('pd_newname') : document.querySelector(`#pd_root [data-doc="${isNaN(i) ? n : i}"] [data-dk="${fld === 'date' ? 'received_at' : fld}"]`);
      if (inp) { inp.classList.add('invalid'); const t = inp.type === 'hidden' ? inp.closest('.dfield').querySelector('.dtext') : inp; if (t) t.focus(); }
      return;
    }
    if (r.event) s.deal_events.push(r.event);
    pd.adding = false; commit(PM.docs.saved); afterChange();
  }
  function detailsChange(e) {
    const t = e.target, s = state(), x = findItem(s, pd.ref); if (!x) return;
    /* CR-32 §2.3 — All in one file (on / its link / its date) · the one Note */
    if (t.matches('[data-pdone]')) { saveDocs(entriesWith(s, x, -1, {}), 'one', { one: { on: t.checked, received_at: t.checked ? R.docsMeta(x).one.received_at || today() : R.docsMeta(x).one.received_at } }); return; }
    if (t.dataset.pdonek) { saveDocs(entriesWith(s, x, -1, {}), 'one', { one: { [t.dataset.pdonek]: t.dataset.pdonek === 'received_at' ? (R.isISODate(t.value) ? t.value : null) : t.value } }); return; }
    if (t.matches('[data-pdnote]')) { saveDocs(entriesWith(s, x, -1, {}), 'note', { note: t.value }); return; }
    const row = t.closest('[data-doc]'), k = t.dataset.dk; if (!row || !k) return;
    const n = +row.dataset.doc, today0 = today();
    const change = k === 'received' ? { received_at: t.checked ? today0 : null } : k === 'received_at' ? { received_at: R.isISODate(t.value) ? t.value : today0 } : k === 'posted_on' ? { posted_on: R.isISODate(t.value) ? t.value : null } : { [k]: t.value };
    saveDocs(entriesWith(s, x, n, change), n);
  }
  /* CR-32 §2.1 — + Add payee here: checked · encrypted · this row pays it (a deal: its Pay to, unless it is the KOL's default now) */
  async function savePayeeHere() {
    const s = state(), x = findItem(s, pd.ref), root = $('pd_pi'); if (!x || !root || !x.kol_id) return;
    const v = KT.payee.payeeInlineRead(root), errs = KT.payee.payeeInlineCheck(v);
    root.querySelectorAll('[data-err^="pi_"]').forEach(el => { const er = errs.find(y => y.field === el.dataset.err); el.innerHTML = er ? `<span class="err">${esc(er.msg)}</span>` : ''; });
    root.querySelectorAll('[data-pi]').forEach(el => el.classList.toggle('invalid', errs.some(y => y.field === 'pi_' + el.dataset.pi)));
    if (errs.length) { const f = root.querySelector('.invalid'); if (f) f.focus(); return; }
    let p = null; try { p = await KT.payee.payeeInlineSave(x.kol_id, v); } catch (er) { toast(PY.noCrypto); return; }
    root.querySelectorAll('[data-pi]').forEach(el => { if (el.type !== 'checkbox') el.value = ''; });   // the typed values leave the page
    const s2 = state(), it = findItem(s2, pd.ref) || x;
    if (it.deal) { const d = s2.deals.find(dd => dd.deal_id === it.deal_id), def = d ? R.defaultPayee(s2, d.kol_id) : null;
      if (d && !(def && def.payee_id === p.payee_id)) { const r = R.setDealPayee(s2, d, p.payee_id, { eventId: store.newEventId(), now: new Date(), user: userId() }); if (r) s2.deal_events.push(r.event); } }
    else if (it.line) R.setLinePayee(s2, it.line, p.payee_id);
    pd.addPayee = false; commit(PY.payeeSaved(R.bankLine(s2.lookups, p))); afterChange();
  }
  function addDoc() {
    const v = R.trim(($('pd_newname') || {}).value || ''), s = state(), x = findItem(s, pd.ref); if (!x) return;
    if (!v) { const el = $('pd_enew'); if (el) el.innerHTML = `<div class="check err">✕ <span>${esc(PM.docs.nameRequired)}</span></div>`; return; }
    saveDocs(entriesWith(s, x, -1, {}).concat([{ key: null, label: v, custom: true, received_at: null, link: '' }]), 'new');
  }
  function detailsClick(e) {
    const s = state(), x = findItem(s, pd.ref); if (!x) return;
    const nv = e.target.closest('[data-pdnav]'); if (nv) { const k = pd.keys[pd.keys.indexOf(x.key) + Number(nv.dataset.pdnav)], y = k && ((pv.items || []).find(i => i.key === k) || findItem(s, { key: k })); if (y) { pd.ref = refOf(y); pd.adding = false; drawDetails(); } return; }
    const dd = e.target.closest('[data-pddeal]'); if (dd) { const id = dd.dataset.pddeal, keys = pd.keys; U.closeModal(); openDealHere(id, 'costs', keys); return; }
    if (e.target.closest('[data-pdpayto]')) { changePayeeDialog(x.key, e.target, reopenDetails, x); return; }
    if (e.target.closest('[data-pdpayee]')) { U.closeModal(); if (x.kol_id) KT.profile.open(x.kol_id, { tab: 'payee' }); else if (x.payee) KT.payee.openDialog({ payeeId: x.payee.payee_id, onSaved: () => { if ($('pm_body')) draw(); } }); return; }
    /* CR-32 §2.1 — Add payee in place · Unlock to add · Save · Cancel */
    if (e.target.closest('[data-pdaddpayee]')) { pd.addPayee = true; pd.section = 'payee'; drawDetails(); return; }
    if (e.target.closest('[data-piunlock]')) { KT.payee.unlockDialog(() => { pd.section = 'payee'; drawDetails(); }); return; }
    if (e.target.closest('[data-pdpicancel]')) { pd.addPayee = false; drawDetails(); return; }
    if (e.target.closest('[data-pdpisave]')) { savePayeeHere(); return; }
    /* CR-32 §2.5 — Ready to send › fill a missing one */
    const fx = e.target.closest('[data-pdfix]');
    if (fx) {
      const act = fx.dataset.pdfix;
      if (act === 'payee') { if (!x.payee) { pd.addPayee = true; pd.section = 'payee'; drawDetails(); } else if (x.payee.secure && !Array.isArray(x.payee.details_filled)) KT.payee.unlockDialog(() => KT.payee.backfillFilled().then(() => drawDetails())); else { U.closeModal(); KT.payee.openDialog({ payeeId: x.payee.payee_id, onSaved: reopenDetails }); } return; }
      if (act === 'docs') { const el = $('pd_docs'); if (el) el.scrollIntoView({ block: 'start' }); return; }
      if (act === 'posts' && x.deal) { const keys = pd.keys; U.closeModal(); openDealHere(x.deal_id, 'ships', keys); return; }
      if (act === 'products' && x.deal) { U.closeModal(); KT.screens.deals.openDealModal(x.deal_id, { tab: 'overview', focus: 'products', source: 'payments', after: () => { if (U.currentTab() === 'payments') draw(); } }); return; }
      if (act === 'pic' && x.deal) { U.closeModal(); KT.screens.deals.openDealModal(x.deal_id, { tab: 'overview', focus: 'pic', source: 'payments', after: () => { if (U.currentTab() === 'payments') draw(); } }); return; }
      if (act === 'deal' && x.deal) { const keys = pd.keys; U.closeModal(); openDealHere(x.deal_id, 'costs', keys); return; }
      return;
    }
    const rm = e.target.closest('[data-pdrm]'); if (rm) { saveDocs(entriesWith(s, x, +rm.dataset.pdrm, { remove: true }), +rm.dataset.pdrm); return; }
    const a = e.target.closest('[data-pdact]'); if (!a) return;
    const act = a.dataset.pdact;
    if (act === 'send') sendPop(a, [x.key], afterChange);
    else if (act === 'anyway') sendPop(a, [x.key], afterChange, { anyway: true });   // CR-32 §2.5: Manager / Admin, with a reason
    else if (act === 'paid') markPaidPop(a, [x.key], afterChange);
    else if (act === 'back') moveBack(x.key, afterChange);
    else if (act === 'hold') holdPop(a, x);
    else if (act === 'release') { releaseItem(x.key, afterChange); }
    else if (act === 'unpaid' && x.line) markUnpaidAsk(x.line.line_id, afterChange);
    else if (act === 'allrec') saveDocs(R.allReceived(s, x, today()), -1);
    else if (act === 'adddoc') { pd.adding = true; drawDetails(); }
    else if (act === 'addok') addDoc();
  }
  /* Hold from the details: a reason (a small form) */
  function holdPop(anchor, x) {
    U.popForm(anchor, { title: PM.holdTitle(rowName(x), C.pay.milestone[x.milestone] || x.milestone), ok: PM.holdOk, focus: '#hp_reason',
      body: `<div class="field"><label for="hp_reason">${esc(PM.holdReasonL)} <span class="req">*</span></label><textarea id="hp_reason" rows="2" placeholder="${esc(PM.holdPh)}"></textarea></div>`,
      onOk: m => {
        const reason = m.querySelector('#hp_reason').value, res = R.validateHold(reason); if (res.errs.length) { U.popFormError(m, res.errs[0].msg); return false; }
        const s = state(), it = findItem(s, pd.ref); if (!it || !canPayX(s, it)) { toast(PM.holdOnlyPic); return true; }
        const h = R.holdItem(s, it, reason, ctxOf()); if (!h) return true;
        s.deal_events.push(h.event); commit(PM.heldDone(rowName(it))); afterChange(); return true;
      } });
  }
  /* CR-27 §3.3 — a deal opens on this page (Costs & payment) · ‹ › the deals of the rows on screen · closed → this page as it was */
  function openDealHere(id, tab, keys) {
    const s = state(), deals = [...new Set((keys || tableKeys()).map(k => ((pv.items || []).find(i => i.key === k) || {}).deal_id).filter(Boolean))];
    KT.screens.deals.openDealModal(id, { tab: tab === 'ships' ? 'shipments' : tab || 'costs', nav: deals.length > 1 ? deals : null, source: 'payments', after: () => { if (U.currentTab() === 'payments') { draw(); const r = document.querySelector(`#pm_body tr[data-pkey] [data-pdeal="${CSS.escape(id)}"]`); const tr = r && r.closest('tr'); if (tr) tr.focus && tr.focus(); } } });
  }

  /* ===================== events ===================== */
  function onBodyClick(e) {
    if (e.target.closest('[data-clearfilters]')) { clearAll(); return; }
    const hp = e.target.closest('[data-hpreset]');
    if (hp) {
      if (hp.dataset.hpreset === 'custom') { const [a, z] = histRange(today()); U.openRange($('ph_range'), { from: pv.hist.from || a, to: pv.hist.to || z, anchor: hp }); return; }   // nothing changes until Apply
      Object.assign(pv.hist, { preset: hp.dataset.hpreset }); draw(); return;
    }
    const mp = e.target.closest('[data-pmiss]'); if (mp) { if (simple()) openDetails(mp.dataset.pmiss, { section: 'docs', opener: mp }); else missingPop(mp); return; }   // CR-27: Docs n/m → Documents
    const pdk = e.target.closest('[data-pdocs]'); if (pdk) { const m = pdk.closest('details'); if (m) m.open = false; openDetails(pdk.dataset.pdocs, { section: 'docs', opener: pdk }); return; }   // CR-32: a document → Payment details › Documents
    const prd = e.target.closest('[data-pmready]'); if (prd) { openDetails(prd.dataset.pmready, { section: 'ready', opener: prd }); return; }   // CR-32 §2.5: Missing n → Ready to send
    const ps = e.target.closest('[data-psend]'); if (ps) { sendPop(ps, [ps.dataset.psend], draw); return; }   // CR-27: Send on the row
    /* CR-17 §4.2 — Simple mode */
    const tg = e.target.closest('[data-ptabgo]'); if (tg) { pv.tab = tg.dataset.ptabgo; pv.queue = null; pv.selected.clear(); render(); return; }
    const pp = e.target.closest('[data-ppaid]'); if (pp) { markPaidPop(pp, [pp.dataset.ppaid], draw); return; }
    const pb = e.target.closest('[data-pback]'); if (pb) { const m = pb.closest('details'); if (m) m.open = false; moveBack(pb.dataset.pback); return; }
    const pu = e.target.closest('[data-punpaid]'); if (pu) { const m = pu.closest('details'); if (m) m.open = false; markUnpaidAsk(pu.dataset.punpaid, draw); return; }
    const pw = e.target.closest('[data-pwht]'); if (pw) { whtSimple([pw.dataset.pwht], pw.checked); return; }
    const pf = e.target.closest('[data-pfold]'); if (pf) { const f = folded(), k = pf.dataset.pfold; f.has(k) ? f.delete(k) : f.add(k); setFolded(f); draw(); return; }
    const qc = e.target.closest('[data-pqueue]'); if (qc) { pv.queue = pv.queue === qc.dataset.pqueue ? null : qc.dataset.pqueue; pv.selected.clear(); $('pm_tools').dataset.built = ''; draw(); return; }
    const hd = e.target.closest('[data-phold]'); if (hd) { const m = hd.closest('details'); if (m) m.open = false; holdDialog(hd.dataset.phold, m ? m.querySelector('summary') : hd); return; }
    const rl = e.target.closest('[data-prelease]'); if (rl) { const m = rl.closest('details'); if (m) m.open = false; releaseItem(rl.dataset.prelease); return; }
    const av = e.target.closest('[data-paccview]'); if (av) { pv.af.view = av.dataset.paccview; pref.set('payaccview', pv.af.view); $('pm_tools').dataset.built = ''; draw(); return; }
    /* CR-16 §4.1 — Missing: Bank details / Payee details → the KOL's profile at Payee & shipping (a payee outside KOL Master → its dialog) */
    const py = e.target.closest('[data-ppayee]');
    if (py) { const m = py.closest('details'); if (m) m.open = false; if (py.dataset.ppayee) KT.profile.open(py.dataset.ppayee, { tab: 'payee', opener: py }); else if (py.dataset.ppayeeid) KT.payee.openDialog({ payeeId: py.dataset.ppayeeid, onSaved: draw }); return; }
    const pt = e.target.closest('[data-ppayto]'); if (pt) { const m = pt.closest('details'); if (m) m.open = false; changePayeeDialog(pt.dataset.ppayto, m ? m.querySelector('summary') : pt); return; }
    const po = e.target.closest('[data-pposts]'); if (po) { const m = po.closest('details'); if (m) m.open = false; openDealHere(po.dataset.pposts, 'ships'); return; }   // CR-27 §3.3: on this page
    const pdl = e.target.closest('[data-pdeal]'); if (pdl) { const m = pdl.closest('details'); if (m) m.open = false; openDealHere(pdl.dataset.pdeal, 'costs'); return; }   // CR-22 §3.6: Costs & payment
    if (e.target.id === 'pm_all') { const on = e.target.checked, s0 = state(); pv.items.filter(x => x.status !== 'on_hold' && (!simple() || (canPayX(s0, x) && (pv.tab !== 'paid' || x.line.wht > 0)))).forEach(x => (on ? pv.selected.add(x.key) : pv.selected.delete(x.key))); draw(); return; }
    const cb = e.target.closest('[data-psel]'); if (cb) { cb.checked ? pv.selected.add(cb.dataset.psel) : pv.selected.delete(cb.dataset.psel); draw(); return; }
    const rn = e.target.closest('[data-prun]'); if (rn) { pv.run = rn.dataset.prun; pv.selected.clear(); draw(); window.scrollTo(0, 0); return; }
    /* Accounting › Runs to pay */
    const ar = e.target.closest('[data-paccrun]'); if (ar) { pv.run = ar.dataset.paccrun; pv.selected.clear(); draw(); window.scrollTo(0, 0); return; }
    const ax = e.target.closest('[data-paccexp]'); if (ax) { exportPr(undefined, ax.dataset.paccexp); return; }
    const ap = e.target.closest('[data-paccpaid]'); if (ap) { markPaidDialog(null, ap.dataset.paccpaid); return; }
    const at = e.target.closest('[data-paccret]'); if (at) { returnRunDialog(at.dataset.paccret); return; }
    const ac = e.target.closest('[data-pacclose]'); if (ac) { closeRun(ac.dataset.pacclose); return; }
    if (e.target.id === 'pm_wall') { const on = e.target.checked; (pv.whtItems || []).forEach(x => (on ? pv.wsel.add(x.key) : pv.wsel.delete(x.key))); draw(); return; }
    const ws = e.target.closest('[data-pwsel]'); if (ws) { ws.checked ? pv.wsel.add(ws.dataset.pwsel) : pv.wsel.delete(ws.dataset.pwsel); draw(); return; }
    const gt = e.target.closest('[data-pgoto]'); if (gt) { const r = $('pmline_' + gt.dataset.pgoto); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1200); } return; }
    const vf = e.target.closest('[data-pverify]'); if (vf) { verifyPayee(vf.dataset.pverify); return; }
    const rm = e.target.closest('[data-plremove]'); if (rm) { const s = state(), l = s.payment_lines.find(x => x.line_id === rm.dataset.plremove); if (l && U.guard('payment.run')) { s.deal_events.push(...R.removeFromRun(s, l, ctxOf())); commit(PM.removed); draw(); } return; }
    const ed = e.target.closest('[data-pledit]'); if (ed) { editAmountDialog(ed.dataset.pledit); return; }
    const bk = e.target.closest('[data-plback]'); if (bk) { const id = bk.dataset.plback; askReason(PM.moveBack, PM.moveBack, why => { const s = state(), l = s.payment_lines.find(x => x.line_id === id); if (!l || !U.guard('payment.run')) return; s.deal_events.push(...R.removeFromRun(s, l, ctxOf(), why)); l.note = [l.note, why].filter(Boolean).join(' · '); commit(PM.movedBack); draw(); }); return; }
    const ud = e.target.closest('[data-plundo]'); if (ud) { const id = ud.dataset.plundo; askReason(PM.undoPaid, PM.undoPaid, why => { const s = state(), l = s.payment_lines.find(x => x.line_id === id); if (!l || !U.guard('payment.reopen')) return; s.deal_events.push(...R.undoPaid(s, l, why, ctxOf())); commit(PM.undone); draw(); }); return; }
    const ls = e.target.closest('[data-plsel]'); if (ls) { ls.checked ? pv.selected.add(ls.dataset.plsel) : pv.selected.delete(ls.dataset.plsel); draw(); return; }
    const pr = e.target.closest('[data-plprint]'); if (pr) { const l = state().payment_lines.find(x => x.line_id === pr.dataset.plprint); if (l && can('payment.run')) { l.printed = pr.checked; commit(); } return; }
    const a = e.target.closest('[data-pact]'); if (a) { const fn = (pv.actions || {})[a.dataset.pact] || ACTIONS[a.dataset.pact]; if (fn) fn(a); return; }
    /* CR-27 §3.2 — a row (outside its buttons) → Payment details */
    const tr = e.target.closest('#pm_body tr[data-pkey]'); if (tr && !e.target.closest('button,a,input,select,label,details,summary,textarea')) openDetails(tr.dataset.pkey, { opener: tr });
  }
  /* Return to team (a reason): the run goes back to the KOL team as a Draft, marked Returned */
  function returnRunDialog(runId) {
    if (!U.guard('payment.paid')) return;
    const id = runId || pv.run, run = state().payment_runs.find(r => r.run_id === id); if (!run || run.status !== 'submitted') return;
    askReason(PM.returnTitle(run.run_id), PM.returnToTeam, why => {
      const s = state(), r2 = s.payment_runs.find(r => r.run_id === id); if (!r2 || !U.guard('payment.paid')) return;
      s.deal_events.push(...R.returnRun(s, r2, why, ctxOf())); pv.run = null; pv.selected.clear(); commit(PM.returnedDone(r2.run_id)); draw();
    });
  }
  function closeRun(runId) {
    if (!U.guard('payment.paid')) return;
    const run = state().payment_runs.find(r => r.run_id === (runId || pv.run)); if (!run || run.status !== 'paid') return;
    run.status = 'closed'; commit(PM.closed(run.run_id)); if (runId) pv.run = null; draw();
  }
  function onBodyChange(e) { if (e.target.id === 'pm_group') { pv.groupBy = e.target.value; pref.set('paygroup', pv.groupBy); draw(); } }
  const ACTIONS = {
    clearsel: () => { pv.selected.clear(); draw(); },
    csv: () => exportCsv(),
    addrun: () => addSelectedToRun(),
    newrun: b => createRunDialog(true, b),
    backruns: () => { pv.run = null; pv.selected.clear(); draw(); },
    createrun: b => createRunDialog(false, b),
    returnrun: () => returnRunDialog(),
    openacc: () => { if (!can('payment.paid')) return; pv.tab = 'accounting'; pv.selected.clear(); render(); },
    outsidepick: () => outsidePick(),
    addlines: () => { pv.addTo = pv.run; pv.tab = 'topay'; pv.selected.clear(); render(); },
    submit: () => submitRun(),
    markpaid: () => markPaidDialog(null),
    markpaidsel: () => markPaidDialog([...pv.selected]),
    reopen: () => { if (!U.guard('payment.reopen')) return; const s = state(), run = s.payment_runs.find(r => r.run_id === pv.run); s.deal_events.push(...R.reopenRun(s, run, ctxOf())); commit(PM.reopened); draw(); },
    close: () => closeRun(),
    export: () => exportPr(),
    expandall: () => { setFolded(new Set()); draw(); },
    collapseall: () => { const s = state(), f = new Set(pv.items.map(x => groupKeyOf(s, x))); setFolded(f); draw(); },
    manual: b => openManual(null, b),
    outside: () => outsideDialog(),
    cancellines: () => cancelLinesDialog(),
    whtsent: () => whtSentDialog(),
    whtcsv: () => exportWht(),
    /* CR-17 §4.2 — Simple mode */
    spaid: b => markPaidPop(b, [...pv.selected], draw),
    sexport: () => exportForAccounting([...pv.selected]),
    ssend: b => sendPop(b, [...pv.selected], draw),   // CR-27
    sdocs: () => markDocsReceived([...pv.selected]),
    sagain: () => exportAgain([...pv.selected]),
    swht: () => whtSimple(pv.items.filter(x => pv.selected.has(x.key)).map(x => x.line.line_id), true),
  };
  /* Payments CSV — no personal data */
  function exportCsv() {
    const s = state(), rows = (pv.tab !== 'runs' ? pv.items : (s.payment_lines || []).map(l => R.payItem(s, today(), { line: l })));
    downloadCSV(`payments_${today().replace(/-/g, '')}.csv`, ['line_id', 'run_id', 'campaign', 'kol', 'milestone', 'gross', 'vat', 'wht', 'net', 'status', 'paid_date', 'pic'],
      rows.map(x => [x.line ? x.line.line_id : '', x.run_id || '', R.campaignName(s, x.campaign_id) || x.project_label || '', x.kol ? x.kol.display_name : x.account_handle, x.milestone, x.tax.gross, x.tax.vat, x.tax.wht, x.tax.net, x.status, x.paid_date || '', x.pic || '']));
  }
  function reset() { Object.assign(pv, { f: { campaign: '', source: '', q: '' }, picUser: null, queue: null, run: null, rf: { from: '', to: '', q: '' } }); pv.af.from = ''; pv.af.to = ''; pv.af.q = ''; pv.selected.clear(); }

  return { render, reset, payItemsOfDeal: (s, d) => R.dealPayItems(s, d, today()), _pv: pv, _draw: () => draw(), money, statusChip, paymentEvent, taxBox,
    markPaid: markPaidPop, markUnpaid: markUnpaidAsk, simpleChip: st => simpleChip(st), openDetails, findItem };
})();
