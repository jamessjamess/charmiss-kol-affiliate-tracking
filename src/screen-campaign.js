/* screen-campaign.js — Campaign & Phase (CR-05 §4.7): page tabs Table | Timeline sharing Year · Status · Search.
   Table: Name · Status · Period · Days left · Budget · Committed · Used % · Remaining · Pending · Deals (Campaign → Phase rows) — numbers on the right (CR-09 §4.8).
   Staff edit only the Products of a Campaign (✎ on that section · + New product) — CR-09 §4.7.
   Timeline: a full-width Gantt (Month | Quarter). A drawer for a Campaign (On hold / Cancelled, Plan phases) or a Phase.
   Phases are created and edited in the Phase Planner (screen-planner.js). → KT.screens.campaign */
KT.screens.campaign = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, toastAction, checksHTML, kv, field, range, dm, stChip, phaseChip, info, ICON, dateHTML, confirmDialog, openDialog, closeDialog, openDrawer, fillDrawer, setHash, go, can, guard, userId, optionsHTML, activeList } = U;
  const K = C.campaign;
  const cp = { mode: 'none', kind: null, id: null, draft: null, touched: new Set(), dirty: false, collapsed: new Set(),
    year: null, status: '', q: '', view: U.pref.get('cpview', 'table') === 'timeline' ? 'timeline' : 'table', zoom: 'month', includeCancelled: false, sortDays: null, prodEdit: null,
    camps: null, campsUser: null, campQ: '' };   // CR-10 §4.9: the Campaigns picked (empty = All campaigns), kept for each person
  /* CR-10 §4.9 — the Campaign filter, remembered per person */
  function camps() {
    const uid = U.userId() || '';
    if (cp.campsUser !== uid) { cp.campsUser = uid; let v = []; try { v = JSON.parse(U.pref.get('cpcamps_' + uid, '[]')); } catch (e) { v = []; } cp.camps = new Set(Array.isArray(v) ? v : []); }
    [...cp.camps].forEach(id => { if (!campById(id)) cp.camps.delete(id); });
    return cp.camps;
  }
  function setCamps(ids) {
    const was = camps().size; cp.camps = new Set(ids); U.pref.set('cpcamps_' + (U.userId() || ''), JSON.stringify([...cp.camps]));
    if (!was && cp.camps.size) cp.zoom = 'fit'; else if (was && !cp.camps.size && cp.zoom === 'fit') cp.zoom = 'month';   // picking Campaigns zooms to Fit
  }
  const editing = () => cp.mode === 'edit';
  const campById = id => state().campaigns.find(c => c.campaign_id === id);
  const phaseById = id => state().phases.find(p => p.phase_id === id);
  const phasesOf = cid => R.sortPhases(state().phases.filter(p => p.campaign_id === cid));

  /* ===================== screen ===================== */
  function render(id) {
    const sec = $('tab-campaign');
    if (!sec.dataset.built) build(sec);
    $('cp_new').classList.toggle('hidden', !can('campaign.edit'));
    const p = U.takeParams('campaign'); if (p && (p.newCampaign || p.planCampaign)) { renderTable(); KT.planner.open(p.planCampaign ? { campaignId: p.planCampaign } : {}); return; }
    renderTable();
    /* an unsaved Phase Planner comes back (CR-05 §4.4) */
    if (KT.planner.isOpen()) { KT.planner.reopen(); return; }
    if (id && !editing()) {
      if (phaseById(id)) { Object.assign(cp, { mode: 'view', kind: 'phase', id }); renderPanel(); }
      else if (campById(id)) { Object.assign(cp, { mode: 'view', kind: 'campaign', id }); renderPanel(); }
    } else if (editing()) renderPanel();
  }
  function build(sec) {
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(K.title)}</h1><span class="spacer"></span>
        <details class="menu" id="cp_new"><summary class="btn primary">${esc(K.newMenu)} ▾</summary><div class="menu-list right" id="cp_newMenu">
          <button type="button" class="mi" data-new="campaign">${esc(K.newCampaign)}</button><button type="button" class="mi" data-new="phase">${esc(K.newPhase)}</button></div></details></div>
      <div class="stabs dtabs" id="cp_view" role="tablist"><button type="button" role="tab" data-view="table">${esc(K.viewTable)}</button><button type="button" role="tab" data-view="timeline">${esc(K.viewTimeline)}</button></div>
      <div class="toolbar">
        <select id="cp_year" aria-label="${esc(K.year)}"></select>
        <details class="menu cp-cmenu" id="cp_cmenu"><summary class="btn"><span id="cp_csum"></span> ▾</summary><div class="popover cp-cpop" id="cp_cpop"></div></details>
        <input type="search" class="search" id="cp_q" placeholder="${esc(K.search)}" autocomplete="off">
        <label class="tick small"><input type="checkbox" id="cp_inclCancel"> ${esc(K.includeCancelled)}</label>
        <span class="spacer"></span>
        <div class="seg hidden" id="cp_zoom" role="group" aria-label="${esc(K.zoom)}"><button type="button" data-zoom="month">${esc(K.zoomMonth)}</button><button type="button" data-zoom="quarter">${esc(K.zoomQuarter)}</button><button type="button" data-zoom="fit" title="${esc(K.zoomFitTip)}">${esc(K.zoomFit)}</button></div>
        <button type="button" class="btn small hidden" id="cp_today">${esc(K.today)}</button>
      </div>
      <div class="fchips hidden" id="cp_chips"></div>
      <div class="stabs" id="cp_tabs" role="tablist"></div>
      <div id="cp_body"></div>`;
    $('cp_newMenu').addEventListener('click', e => {
      const b = e.target.closest('[data-new]'); if (!b) return; b.closest('details').open = false;
      const opener = b.closest('details').querySelector('summary');
      if (b.dataset.new === 'campaign') KT.planner.open({ opener });
      else if (cp.kind === 'campaign' && cp.id) KT.planner.open({ campaignId: cp.id, addRow: true, opener });
      else if (cp.kind === 'phase' && cp.id) KT.planner.open({ campaignId: phaseById(cp.id).campaign_id, addRow: true, opener });
      else chooseCampaign(opener);
    });
    $('cp_view').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { cp.view = b.dataset.view; U.pref.set('cpview', cp.view); renderTable(); } });
    $('cp_year').addEventListener('change', e => { cp.year = e.target.value; renderTable(); });
    $('cp_inclCancel').addEventListener('change', e => { cp.includeCancelled = e.target.checked; renderTable(); });
    $('cp_zoom').addEventListener('click', e => { const b = e.target.closest('[data-zoom]'); if (b) { cp.zoom = b.dataset.zoom; renderTable(); } });
    let qT;
    $('cp_q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { cp.q = e.target.value; renderTable(); }, 150); });
    $('cp_tabs').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (b) { cp.status = b.dataset.st; renderTable(); } });
    $('cp_cpop').addEventListener('change', e => { const c = e.target.closest('[data-camp]'); if (!c) return; const set = new Set(camps()); c.checked ? set.add(c.dataset.camp) : set.delete(c.dataset.camp); setCamps(set); renderTable(); $('cp_cmenu').open = true; });
    $('cp_cpop').addEventListener('input', e => { if (e.target.id === 'cp_cq') { cp.campQ = e.target.value; campMenu(state(), today()); const q = $('cp_cq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } });
    $('cp_cpop').addEventListener('click', e => { if (e.target.closest('[data-campsclear]')) { setCamps([]); renderTable(); } });
    $('cp_chips').addEventListener('click', e => {
      if (e.target.closest('[data-clearfilters]')) { cp.q = ''; cp.status = ''; $('cp_q').value = ''; setCamps([]); renderTable(); return; }
      const u = e.target.closest('[data-unset]'); if (u) { const set = new Set(camps()); set.delete(u.dataset.unset.slice(2)); setCamps(set); renderTable(); }
    });
    $('cp_today').addEventListener('click', () => scrollToToday(true));
    $('cp_body').addEventListener('click', e => {
      if (e.target.closest('button.info')) return;
      const ep = e.target.closest('[data-editprod]'); if (ep) { if (editing()) { toast(C.common.blockWhileEditing); return; } Object.assign(cp, { mode: 'view', kind: 'campaign', id: ep.dataset.editprod }); startProducts(); return; }
      const sd = e.target.closest('[data-sortdays]'); if (sd) { cp.sortDays = cp.sortDays === 'asc' ? 'desc' : cp.sortDays === 'desc' ? null : 'asc'; renderTable(); return; }
      const ch = e.target.closest('[data-toggle]');
      if (ch) { const c = ch.dataset.toggle; cp.collapsed.has(c) ? cp.collapsed.delete(c) : cp.collapsed.add(c); renderTable(); return; }
      if (e.target.closest('[data-clear]')) { cp.q = ''; cp.status = ''; $('cp_q').value = ''; setCamps([]); renderTable(); return; }
      const gd = e.target.closest('[data-godeals]'); if (gd) { const [campaign, phaseSel] = gd.dataset.godeals.split('|'); go('deals', { filter: { campaign, phaseSel } }); return; }
      const hit = e.target.closest('[data-id]'); if (hit) select(hit.dataset.kind, hit.dataset.id);
    });
    $('cp_body').addEventListener('keydown', e => { if (e.key !== 'Enter' || e.target.closest('button')) return; const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.kind, tr.dataset.id); });
    document.addEventListener('kt:contentresize', () => { if (U.currentTab() !== 'campaign') return; const y = window.scrollY; renderTable(); window.scrollTo(0, y); });
    sec.dataset.built = '1';
  }
  function select(kind, id) {
    if (editing()) { if (id !== cp.id) toast(C.common.blockWhileEditing); return; }
    if (cp.prodEdit && cp.prodEdit.dirty && id !== cp.id) { toast(C.common.blockWhileEditing); return; }
    if (id !== cp.id) cp.prodEdit = null;
    Object.assign(cp, { mode: 'view', kind, id, draft: null }); cp.touched.clear();
    renderPanel();
  }
  function markSelected() {
    const open = cp.mode !== 'none' ? cp.id : null;
    document.querySelectorAll('#cp_body tr[data-id]').forEach(tr => tr.classList.toggle('selected', tr.dataset.id === open));
  }

  /* ===================== filters ===================== */
  /* a Campaign belongs to a year when one of its Phases overlaps it; a Campaign without Phases shows in every year */
  const overlaps = (p, y) => !!p.start_date && !!p.end_date && p.start_date <= `${y}-12-31` && p.end_date >= `${y}-01-01`;
  function yearsOf(s) {
    const ys = new Set([today().slice(0, 4)]);
    s.phases.forEach(p => { if (p.start_date && p.end_date) for (let y = +p.start_date.slice(0, 4); y <= +p.end_date.slice(0, 4); y++) ys.add(String(y)); });
    return [...ys].sort();
  }
  /* Campaigns in §4.7 order (On going → Not started → On hold → Complete → Cancelled) with the Phases to show, after Year and Search */
  function listed(s, td, all) {
    const q = R.trim(cp.q).toLowerCase(), hit = v => String(v || '').toLowerCase().includes(q), picked = camps();
    return R.sortCampaigns(s.campaigns, s.phases, td).filter(c => all || !picked.size || picked.has(c.campaign_id)).map(c => {
      const all = phasesOf(c.campaign_id), inYear = cp.year === 'all' ? all : all.filter(p => overlaps(p, cp.year));
      if (all.length && !inYear.length) return null;
      const cHit = !q || hit(c.campaign_name);
      const phases = cHit ? inYear : inYear.filter(p => hit(R.phaseName(s, p.phase_id)));
      if (!cHit && !phases.length) return null;
      return { c, phases, status: R.campaignEffectiveStatus(c, all, td) };
    }).filter(Boolean);
  }

  /* ===================== table ===================== */
  const MN = C.money;
  /* Used %: the number and an 80px square bar (red above 100%) · no budget → — */
  const usedHTML = m => (m.usedPct == null ? `<span class="muted">—</span>` : `<span class="used u72"><span class="ub"><span class="${m.usedPct > 100 ? 'over' : ''}" style="width:${Math.min(100, m.usedPct)}%"></span></span><span class="pc${m.usedPct > 100 ? ' late' : ''}">${Math.round(m.usedPct)}%</span></span>`);
  /* Days left (CR-09 §4.3) — a Phase of a Campaign on hold / cancelled says the Campaign's */
  const daysHTML = d => `<span class="dleft ${d.kind}${d.soon ? ' soon' : ''}">${esc(KT.export.daysText(d))}</span>`;
  const remainingHTML = m => (m.remaining == null ? `<span class="muted">—</span>` : m.remaining < 0 ? `<span class="late">−${R.baht(-m.remaining)}</span>` : R.baht(m.remaining));
  const pendingHTML = v => (v ? `<span class="muted">${R.baht(v)}</span>` : `<span class="muted">—</span>`);
  /* inside the selected year the year is implied: dd/mm – dd/mm (full dates in the tooltip) */
  const period = (a, b) => (a && b && cp.year !== 'all' && a.slice(0, 4) === cp.year && b.slice(0, 4) === cp.year
    ? `<span title="${esc(range(a, b))}">${esc(dm(a))} – ${esc(dm(b))}</span>` : esc(range(a, b)));
  /* status chip; a Phase of a Campaign on hold / cancelled shows the Campaign's status, faded */
  const chip = (st, faded) => phaseChip(st).replace('class="st ', `class="st ${faded ? 'faded ' : ''}`);
  function renderTable() {
    const s = state(), td = today();
    if (!cp.year) cp.year = td.slice(0, 4);
    const years = yearsOf(s);
    $('cp_year').innerHTML = years.map(y => `<option value="${y}"${y === cp.year ? ' selected' : ''}>${y}</option>`).join('') + `<option value="all"${cp.year === 'all' ? ' selected' : ''}>${esc(K.allYears)}</option>`;
    $('cp_year').value = cp.year;
    $('cp_inclCancel').checked = cp.includeCancelled;
    document.querySelectorAll('#cp_view [data-view]').forEach(b => { const on = b.dataset.view === cp.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    const tl = cp.view === 'timeline';
    $('cp_zoom').classList.toggle('hidden', !tl); $('cp_today').classList.toggle('hidden', !tl);
    document.querySelectorAll('#cp_zoom [data-zoom]').forEach(b => b.classList.toggle('on', b.dataset.zoom === cp.zoom));
    campMenu(s, td);
    const all = listed(s, td), counts = { '': all.length };
    R.CAMPAIGN_STATUSES.forEach(k => { counts[k] = 0; });
    all.forEach(x => { counts[x.status]++; });
    $('cp_tabs').innerHTML = [['', K.all]].concat(R.CAMPAIGN_STATUSES.map(k => [k, C.phaseStatus[k]]))
      .map(([k, l]) => `<button type="button" role="tab" data-st="${k}" class="${cp.status === k ? 'on' : ''}">${esc(l)}<span class="n">${R.fmtNum(counts[k] || 0)}</span></button>`).join('');
    let items = cp.status ? all.filter(x => x.status === cp.status) : all;
    /* Days left sorts the Campaigns (On going fewest days first) — their Phases stay under them */
    if (cp.sortDays) { const k = cp.sortDays === 'desc' ? -1 : 1, rk = x => R.daysLeftRank(R.daysLeft(R.campaignItem(s, x.c, td), td)); items = items.slice().sort((a, b) => k * ((rk(a)[0] - rk(b)[0]) || (rk(a)[1] - rk(b)[1]))); }
    if (!items.length) {
      $('cp_body').innerHTML = s.campaigns.length ? `<div class="card empty"><b>${esc(K.noMatch)}</b><button type="button" class="btn" data-clear>${esc(K.clearFilters)}</button></div>`
        : `<div class="card empty"><b>${esc(K.noCampaign)}</b></div>`;
      return;
    }
    if (tl) renderTimeline(s, items, td); else renderGrid(s, items, td);
    markSelected();
  }
  /* CR-10 §4.9 — the Campaign multi-select: the Campaigns of the Year (cancelled ones only with Include cancelled), searchable, a status chip each */
  function campMenu(s, td) {
    const picked = camps(), q = R.trim(cp.campQ).toLowerCase();
    const opts = R.sortCampaigns(s.campaigns, s.phases, td).map(c => ({ c, st: R.campaignEffectiveStatus(c, phasesOf(c.campaign_id), td) }))
      .filter(x => picked.has(x.c.campaign_id) || ((cp.includeCancelled || x.st !== 'cancelled') && (cp.year === 'all' || !phasesOf(x.c.campaign_id).length || phasesOf(x.c.campaign_id).some(p => overlaps(p, cp.year)))));
    const shown = opts.filter(x => !q || x.c.campaign_name.toLowerCase().includes(q));
    $('cp_csum').textContent = !picked.size ? K.allCampaigns : picked.size === 1 ? (campById([...picked][0]) || {}).campaign_name || '' : K.campN(picked.size);
    $('cp_cpop').innerHTML = `<input type="search" class="search" id="cp_cq" placeholder="${esc(K.searchCampaign)}" value="${esc(cp.campQ)}" autocomplete="off">` +
      `<div class="cp-copts">${shown.map(x => `<label class="tick"><input type="checkbox" data-camp="${esc(x.c.campaign_id)}"${picked.has(x.c.campaign_id) ? ' checked' : ''}> <span class="cp-cname">${esc(x.c.campaign_name)}</span>${chip(x.st)}</label>`).join('')}</div>` +
      (picked.size ? `<button type="button" class="btn small ghost" data-campsclear>${esc(K.clearCampaigns)}</button>` : '');
    const chips = [...picked].map(id => ['c:' + id, K.campChip((campById(id) || {}).campaign_name || id)]);
    U.filterChips($('cp_chips'), chips, chips.length + (R.trim(cp.q) ? 1 : 0) + (cp.status ? 1 : 0));
  }
  /* a Phase's committed against its budget, in the Campaign drawer */
  const usageHTML = (budget, committed) => (budget == null ? `<span class="muted">${esc(K.noBudget)}</span>` : usedHTML(R.moneyOf(budget, committed, 0, 0)));
  function renderGrid(s, items, td) {
    const rows = [], tot = [], idx = R.phaseIndex(s);
    items.forEach(({ c, phases, status }) => {
      const open = !cp.collapsed.has(c.campaign_id), m = R.campaignMoney(s, c.campaign_id, idx), cs = R.campaignSummary(s, c.campaign_id, idx);
      if (cp.includeCancelled || status !== 'cancelled') tot.push(m);
      const held = status === 'on_hold' || status === 'cancelled';
      /* Allocated vs the Campaign budget (CR-03 §4.3): a chip under the budget, never a block */
      const al = R.allocation(s, c.campaign_id), alChip = al.state === 'unallocated' ? `<span class="alloc">${esc(K.unallocated(R.baht(al.diff)))}</span>`
        : al.state === 'over' ? `<span class="alloc over">${esc(K.overAllocated(R.baht(-al.diff)))}</span>` : '';
      const budgetCell = m.budget == null ? `<span class="muted">${esc(K.noBudget)}</span>` : `<div class="cell2 r" title="${esc(K.allocatedOf(R.baht(al.allocated || 0), R.baht(m.budget)))}"><span>${R.baht(m.budget)}</span>${alChip}</div>`;
      const start = phases.map(p => p.start_date).filter(Boolean).sort()[0] || null, end = phases.map(p => p.end_date).filter(Boolean).sort().pop() || null;
      rows.push(`<tr class="click grp${status === 'cancelled' ? ' cancelled' : ''}" tabindex="0" data-kind="campaign" data-id="${esc(c.campaign_id)}"><td class="nm"><div class="nmw"><button type="button" class="chevbtn${open ? ' open' : ''}" data-toggle="${esc(c.campaign_id)}" aria-label="${esc(open ? K.collapse : K.expand)}" aria-expanded="${open}">${ICON.chevron}</button>` +
        `<b>${esc(c.campaign_name)}</b>${c.cta ? ` <span class="ctachip" title="${esc(K.ctaTip)}">${esc(c.cta)}</span>` : ''}${status !== 'cancelled' && !R.campaignProductCodes(s, c.campaign_id).length ? (can('campaign.products') ? ` <button type="button" class="nopchip" data-editprod="${esc(c.campaign_id)}" title="${esc(K.addProductsTip)}">${esc(C.products.noProductsChip)}</button>` : ` <span class="nopchip" title="${esc(C.products.noProductsTip)}">${esc(C.products.noProductsChip)}</span>`) : ''}</div></td><td title="${esc(c.status_reason || '')}">${chip(status)}</td>` +
        `<td>${start ? period(start, end) : `<span class="muted">${esc(K.noPhase)}</span>`}</td><td class="num">${daysHTML(R.daysLeft(R.campaignItem(s, c, td), td))}</td><td class="num">${budgetCell}</td>` +
        `<td class="num"><span class="${m.remaining < 0 ? 'late' : ''}">${R.baht(m.committed)}</span></td><td>${usedHTML(m)}</td><td class="num">${remainingHTML(m)}</td><td class="num">${pendingHTML(m.pending)}</td><td class="num">${R.fmtNum(m.deals)}</td></tr>`);
      if (!open) return;
      phases.forEach(p => {
        const y = R.phaseSummary(s, p.phase_id, idx), pm = R.moneyOf(y.budget, y.committed, y.shortlist, y.paid), pct = R.pctOfBudget(y.budget, m.budget);
        /* the % of the Campaign budget is in the Budget popover (CR-05 §4.7), not floating in the table */
        const bcell = y.budget == null ? `<span class="muted">${esc(K.noBudget)}</span>`
          : `<button type="button" class="info cellinfo" data-info-h="${esc(R.phaseName(s, p.phase_id))}" data-info-d="${esc(pct == null ? K.phaseBudgetNoCampaign : K.pctOfCampaign(Math.round(pct), R.baht(m.budget)))}" aria-label="${esc(K.budgetOfPhase(R.phaseName(s, p.phase_id)))}">${R.baht(y.budget)}</button>`;
        rows.push(`<tr class="click child" tabindex="0" data-kind="phase" data-id="${esc(p.phase_id)}"><td class="nm"><span class="pn">${esc(R.phaseName(s, p.phase_id))}</span></td>` +
          `<td>${held ? chip(status, true) : chip(R.phaseStatus(p, td))}</td><td>${period(p.start_date, p.end_date)}</td><td class="num">${daysHTML(R.daysLeft(held ? { status } : { status: R.phaseStatus(p, td), from: p.start_date, to: p.end_date }, td))}</td><td class="num">${bcell}</td>` +
          `<td class="num"><span class="${pm.remaining < 0 ? 'late' : ''}">${R.baht(pm.committed)}</span></td><td>${usedHTML(pm)}</td><td class="num">${remainingHTML(pm)}</td><td class="num">${pendingHTML(pm.pending)}</td><td class="num">${R.fmtNum(y.activeCount)}</td></tr>`);
      });
      /* CR-03 §4.5: money that is in no Phase yet, under the last Phase (click → Deals) */
      [[R.UNSCHEDULED, cs.unscheduled, K.unscheduledRow, ''], [R.NEEDS, cs.needs, K.needsRow, ' warn']].forEach(([key, amt, label, cls]) => {
        const n = key === R.NEEDS ? cs.needsPosts : 0;
        if (amt > 0 || n > 0) rows.push(`<tr class="click child extra${cls}" tabindex="0" data-godeals="${esc(c.campaign_id)}|${key}"><td class="nm"><span class="pn">${esc(label)}${n ? ` <span class="muted small">${esc(K.postsN(n))}</span>` : ''}</span></td>` +
          `<td></td><td></td><td></td><td></td><td class="num">${R.baht(amt)}</td><td></td><td></td><td></td><td></td></tr>`);
      });
    });
    const t = R.moneyTotal(tot);
    /* a number column: ⓘ on the left so the label ends on the same right edge as its numbers (CR-09 §4.8) */
    const th = (l, cls, i) => (i && !U.isFormulaInfo(i) ? `<th${cls ? ` class="${cls}"` : ''} title="${esc(U.tipText(i))}"><span class="tiph">${esc(l)}</span></th>`   // CR-11 §4.13 #2
      : `<th${cls ? ` class="${cls}"` : ''}>${i && cls === 'num' ? info(i) + ' ' : ''}${esc(l)}${i && cls !== 'num' ? ' ' + info(i) : ''}</th>`);
    const sd = cp.sortDays, daysTh = `<th class="num"${sd ? ` aria-sort="${sd === 'desc' ? 'descending' : 'ascending'}"` : ''}>${info({ h: C.overview.colDaysLeft, d: C.overview.daysLeftTip })} <button type="button" class="thsort" data-sortdays title="${esc(C.overview.sortBy(C.overview.colDaysLeft))}">${esc(C.overview.colDaysLeft)}${sd ? `<span class="ar">${sd === 'desc' ? '▼' : '▲'}</span>` : ''}</button></th>`;
    $('cp_body').innerHTML = `<div class="tablewrap"><table class="tbl cp-table" id="cp_tbl"><thead><tr>${th(K.colName, 'nmh')}${th(K.colStatus)}${th(K.colPeriod)}${daysTh}${th(MN.budget.h, 'num', MN.budget)}` +
      `${th(MN.committed.h, 'num', MN.committed)}${th(MN.used.h, '', MN.used)}${th(MN.remaining.h, 'num', MN.remaining)}${th(MN.pending.h, 'num', MN.pending)}${th(K.colDeals, 'num')}</tr></thead>` +
      `<tbody>${rows.join('')}<tr class="total"><td>${esc(cp.includeCancelled ? K.totalWithCancelled : K.total)}</td><td></td><td></td><td></td><td class="num">${t.budget == null ? '—' : R.baht(t.budget)}</td>` +
      `<td class="num"><span class="${t.remaining < 0 ? 'late' : ''}">${R.baht(t.committed)}</span></td><td>${usedHTML(t)}</td><td class="num">${remainingHTML(t)}</td><td class="num">${pendingHTML(t.pending)}</td><td class="num">${R.fmtNum(t.deals)}</td></tr></tbody></table></div>`;
  }

  /* ===================== Timeline tab: a full-width Gantt (Month | Quarter) ===================== */
  function renderTimeline(s, items, td) {
    const rows = [];
    items.forEach(({ c, phases, status }) => {
      const start = phases.map(p => p.start_date).filter(Boolean).sort()[0] || null, end = phases.map(p => p.end_date).filter(Boolean).sort().pop() || null;
      rows.push({ kind: 'campaign', id: c.campaign_id, name: c.campaign_name, start, end, status, over: false, camp: c, campStatus: status });
      if (cp.collapsed.has(c.campaign_id)) return;
      phases.forEach(p => { const y = R.phaseSummary(s, p.phase_id); rows.push({ kind: 'phase', id: p.phase_id, name: R.phaseName(s, p.phase_id), start: p.start_date, end: p.end_date, status: R.phaseStatus(p, td), over: y.over, campaign: c.campaign_id, campStatus: status, budget: y.budget, committed: y.committed }); });
    });
    const dated = rows.filter(r => r.start && r.end);
    let from, to, fit = null;
    /* CR-10 §4.9 Fit: a week before the first Phase … a week after the last of the Campaigns shown · the axis of CR-09 (R.timeAxis) */
    if (cp.zoom === 'fit') fit = R.fitRange(s, items.map(x => x.c.campaign_id));
    if (fit) { from = fit.from; to = fit.to; }
    else if (cp.year !== 'all') { from = `${cp.year}-01-01`; to = `${cp.year}-12-31`; }
    else if (dated.length) { from = dated.map(b => b.start).sort()[0].slice(0, 7) + '-01'; const e = dated.map(b => b.end).sort().pop(); to = R.addDays(R.addDays(e.slice(0, 7) + '-01', 32).slice(0, 7) + '-01', -1); }
    else { from = `${td.slice(0, 4)}-01-01`; to = `${td.slice(0, 4)}-12-31`; }
    const months = []; for (let m = from; m <= to; m = R.addDays(m, 32).slice(0, 7) + '-01') months.push(m);
    const days = R.dayDiff(R.addDays(to, 1), from), pct = iso => R.dayDiff(iso, from) / days * 100;
    const minW = fit ? 560 : cp.zoom === 'quarter' ? Math.max(480, months.length * 26) : Math.max(640, months.length * 64);
    const multi = months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
    const ax = fit ? R.timeAxis(from, to) : null, grid = fit ? ax.ticks.map(t => t.date).filter(d => d >= from && d <= to) : months.filter(m => m >= from);
    const ticks = fit ? ax.ticks.filter(t => t.date >= from && t.date <= to).map(t => `<span class="gt-tick" style="left:${pct(t.date)}%">${esc(t.label)}</span><i class="gt-grid" style="left:${pct(t.date)}%"></i>`).join('')
      : cp.zoom === 'quarter'
      ? months.filter(m => ['01', '04', '07', '10'].includes(m.slice(5, 7)) || m === months[0]).map(m => `<span class="gt-tick q" style="left:${pct(m)}%">${esc(`Q${Math.floor((+m.slice(5, 7) - 1) / 3) + 1}${multi || m === months[0] ? ' ' + m.slice(0, 4) : ''}`)}</span>`).join('') +
        months.map(m => `<i class="gt-grid" style="left:${pct(m)}%"></i>`).join('')
      : months.map(m => `<span class="gt-tick" style="left:${pct(m)}%">${esc(K.months[+m.slice(5, 7) - 1])}${multi && m.slice(5, 7) === '01' ? ` ${m.slice(0, 4)}` : ''}</span><i class="gt-grid" style="left:${pct(m)}%"></i>`).join('');
    const showToday = td >= from && td <= to;
    const todayLine = showToday ? `<i class="gt-today" style="left:${pct(td)}%"></i>` : '';
    const when = b => (td < b.start ? K.startsIn(R.dayDiff(b.start, td)) : td > b.end ? K.ended : R.dayDiff(b.end, td) === 0 ? K.endsToday : K.daysLeft(R.dayDiff(b.end, td)));
    const bar = r => {
      if (!r.start || !r.end || r.end < from || r.start > to) return '';
      const l = pct(r.start < from ? from : r.start), w = pct(R.addDays(r.end > to ? to : r.end, 1)) - l;
      const held = r.campStatus === 'on_hold' ? ' hold' : r.campStatus === 'cancelled' ? ' cancelled' : '';
      const tip = `${r.name}\n${R.dmy(r.start)} – ${R.dmy(r.end)} · ${when(r)}${held ? ` · ${C.phaseStatus[r.campStatus]}` : ''}${r.kind === 'phase' ? `\n${K.budgetOf(R.baht(r.committed), r.budget == null ? K.noBudget : R.baht(r.budget))}` : ''}`;
      return `<button type="button" class="gbar ${r.kind} ${r.status}${r.over ? ' over' : ''}${held}" data-kind="${r.kind}" data-id="${esc(r.id)}" title="${esc(tip)}" aria-label="${esc(tip)}" style="left:${l}%;width:${Math.max(0.4, w)}%"></button>`;
    };
    /* where Phases of a Campaign overlap, a hatched band on both bars */
    const hatch = r => (r.kind !== 'phase' ? '' : R.phaseOverlaps(rows.filter(x => x.kind === 'phase' && x.campaign === r.campaign && x.start && x.end).map(x => ({ phase_id: x.id, start_date: x.start, end_date: x.end })))
      .filter(o => o.a === r.id || o.b === r.id).map(o => `<i class="ghatch" title="${esc(C.msg.phaseOverlap(R.phaseName(s, o.a), R.phaseName(s, o.b), dm(o.from), dm(o.to)))}" style="left:${pct(o.from)}%;width:${pct(R.addDays(o.to, 1)) - pct(o.from)}%"></i>`).join(''));
    $('cp_body').innerHTML = `<div class="tablewrap gantt-wrap" id="cp_tl"><table class="tbl gantt" id="cp_tbl"><thead><tr><th class="gn">${esc(K.colName)}</th><th class="gs">${esc(K.colStatus)}</th><th class="gtl" style="min-width:${minW}px"><div class="gt-head">${ticks}</div></th></tr></thead><tbody>` +
      rows.map(r => `<tr class="click ${r.kind === 'campaign' ? 'grp' : 'child'}" tabindex="0" data-kind="${r.kind}" data-id="${esc(r.id)}">` +
        `<td class="gn">${r.kind === 'campaign' ? `<div class="nmw"><button type="button" class="chevbtn${cp.collapsed.has(r.id) ? '' : ' open'}" data-toggle="${esc(r.id)}" aria-label="${esc(cp.collapsed.has(r.id) ? K.expand : K.collapse)}">${ICON.chevron}</button><b>${esc(r.name)}</b></div>` : `<span class="pn">${esc(r.name)}</span>`}</td>` +
        `<td class="gs">${r.kind === 'phase' && (r.campStatus === 'on_hold' || r.campStatus === 'cancelled') ? chip(r.campStatus, true) : chip(r.status)}</td>` +
        `<td class="gtl"><div class="gt-row">${grid.map(m => `<i class="gt-grid" style="left:${pct(m)}%"></i>`).join('')}${todayLine}${bar(r)}${hatch(r)}</div></td></tr>`).join('') +
      `</tbody></table></div>` + legendHTML(rows, showToday, hatch);
    const pane = $('cp_tl'), head = pane.querySelector('th.gtl');
    pane.dataset.today = showToday ? String(head.offsetLeft + head.offsetWidth * pct(td) / 100) : '';
    if (showToday) scrollToToday(false);
  }
  /* CR-11 §4.13 #5 — under the timeline: every colour / line that is on it now, in words */
  function legendHTML(rows, today, hatch) {
    const L = K.legend, shown = rows.filter(r => r.start && r.end), ph = shown.filter(r => r.kind === 'phase'), has = f => shown.some(f), live = r => !['on_hold', 'cancelled'].includes(r.campStatus);
    const items = [
      has(r => r.kind === 'campaign') && ['campaign', L.campaign],
      ph.some(r => r.status === 'ongoing' && live(r)) && ['ongoing', L.ongoing],
      ph.some(r => r.status === 'not_started' && live(r)) && ['not_started', L.planned],
      ph.some(r => r.status === 'complete' && live(r)) && ['complete', L.complete],
      has(r => r.campStatus === 'on_hold') && ['hold', L.hold],
      has(r => r.campStatus === 'cancelled') && ['cancelled', L.cancelled],
      ph.some(r => r.over) && ['over', L.over],
      ph.some(r => hatch(r)) && ['hatch', L.overlap],
      today && ['today', L.today],
    ].filter(Boolean);
    return items.length ? `<div class="gt-legend" aria-label="${esc(L.title)}">${items.map(([k, l]) => `<span class="gl-i"><i class="gl-${k}"></i>${esc(l)}</span>`).join('')}</div>` : '';
  }
  function scrollToToday(smooth) {
    const pane = $('cp_tl'); if (!pane || !pane.dataset.today) return;
    pane.scrollTo({ left: Math.max(0, Number(pane.dataset.today) - pane.clientWidth / 2), behavior: smooth ? 'smooth' : 'auto' });
  }

  /* ===================== drawer ===================== */
  const owner = {
    kind: 'campaign',   // CR-10 §4.13: 60% like every detail drawer
    isDirty: () => (editing() && cp.dirty) || !!(cp.prodEdit && cp.prodEdit.dirty),
    onClose: () => { Object.assign(cp, { mode: 'none', kind: null, id: null, draft: null, prodEdit: null }); cp.touched.clear(); if (U.currentTab() === 'campaign') setHash('campaign'); markSelected(); },
    onSuspend: () => { if (!editing()) Object.assign(cp, { mode: 'none', id: null }); },
  };
  const closeBtn = `<button type="button" class="icon-btn" data-dr-close aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button>`;
  const sec = (title, body, extra) => `<section class="sec"><div class="sec-h"><span>${esc(title)}</span>${extra || ''}</div>${body}</section>`;
  function renderPanel() {
    let html;
    if (cp.mode === 'view') {
      const rec = cp.kind === 'campaign' ? campById(cp.id) : phaseById(cp.id); if (!rec) { U.closeDrawer(); return; }
      html = cp.kind === 'campaign' ? viewCampaignHTML(rec) : viewPhaseHTML(rec); setHash('campaign/' + cp.id);
    } else if (editing()) { html = formCampaignHTML(); setHash('campaign/' + cp.id); }
    else return;
    if (U.drawerOwner() === owner) fillDrawer(html); else openDrawer(owner, html);
    $('drawer_content').onclick = panelClick;
    /* CR-11 §4.11 — the Phase's default pillar, set right here (Admin · KOL Manager) */
    $('drawer_content').onchange = e => { const t = e.target.closest('[data-defpillar]'); if (!t || !guard('campaign.edit')) return; const p = phaseById(cp.id); if (!p) return;
      const s = state(), from = p.default_pillar || null; p.default_pillar = t.value || null;
      s.campaign_events.push({ event_id: store.newCampaignEventId(), campaign_id: p.campaign_id, type: 'default_pillar', from: { phase_id: p.phase_id, default_pillar: from }, to: { phase_id: p.phase_id, default_pillar: p.default_pillar }, changed_at: new Date().toISOString(), changed_by: userId(), note: null });
      commit(C.fill.pillarSaved(p.default_pillar || C.fill.none, R.phaseName(s, p.phase_id))); renderPanel(); };
    if (editing()) wireForm();
    if (cp.prodEdit && cp.mode === 'view' && cp.kind === 'campaign') wireProducts();
    markSelected();
  }
  function viewCampaignHTML(c) {
    const s = state(), x = R.campaignSummary(s, c.campaign_id), phases = phasesOf(c.campaign_id), canDel = R.canDeleteCampaign(s, c.campaign_id);
    const st = R.campaignEffectiveStatus(c, phases, today()), edit = can('campaign.edit');
    /* CR-05 §4.7: On hold / Cancelled are set here (with a reason) and lifted with Resume */
    const statusItems = !edit ? '' : c.status_override ? `<button type="button" class="mi" data-act="resume">${esc(K.resume)}</button>`
      : `<button type="button" class="mi" data-act="hold">${esc(K.putOnHold)}</button><button type="button" class="mi danger" data-act="cancelCampaign">${esc(K.cancelCampaign)}</button>`;
    return `<div class="dr-head"><div class="dr-title"><div class="t"><h2 title="${esc(c.campaign_name)}">${esc(c.campaign_name)}</h2><div class="dr-sub"><span>${esc(K.campaignTag)}</span>${phaseChip(st)}</div></div>
        <details class="menu"><summary class="icon-btn" title="${esc(C.app.more)}" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right">${statusItems}
          <button type="button" class="mi danger" data-act="delete"${canDel && edit ? '' : ` disabled title="${esc(K.cannotDeleteCampaign(phases.length))}"`}>${esc(K.deleteCampaign)}</button></div></details>${closeBtn}</div>
        ${can('campaign.edit') ? `<div class="dr-actions"><button type="button" class="btn primary" data-act="plan">${esc(C.planner.planPhases)}</button><button type="button" class="btn" data-act="addPhase">${esc(K.addPhase)}</button><button type="button" class="btn" data-act="edit">${esc(K.edit)}</button></div>` : ''}</div>
      <div class="dr-body">
        ${c.status_override ? `<section class="sec"><div class="check ${c.status_override === 'cancelled' ? 'err' : 'warn'}">! <span>${esc(K.statusLine(C.phaseStatus[c.status_override], c.status_reason || '', c.status_changed_at ? R.dmy(R.dateOfTimestamp(c.status_changed_at)) : ''))}</span></div></section>` : ''}
        ${sec(K.secDetails, kv(K.fNote, c.note) + kv(K.colPeriod, x.start ? range(x.start, x.end) : '') + kv(K.colBudget, x.budget == null ? '' : R.baht(x.budget)) +
          kv(K.fCta, c.cta) + kv(C.fill.defaultTerm, R.isTerm(c.default_payment_term) ? C.term[c.default_payment_term] : '') + applyTermBtn(c) +
          kv(K.allocated, x.allocated == null ? '' : R.baht(x.allocated)) + kv(K.colShortlist, R.baht(x.shortlist)) + kv(K.pillarTarget, targetText(c)) +
          kv(K.colCommitted, R.baht(x.committed), x.budget != null && x.committed > x.budget ? 'over' : '') + kv(K.colPaid, R.baht(x.paid)) + kv(K.colDeals, R.fmtNum(x.activeDeals)), lockedTag())}
        ${sec(K.secPhases(phases.length), phases.length ? phases.map(p => { const y = R.phaseSummary(s, p.phase_id);
          return `<div class="kv"><span><button type="button" class="link" data-phase="${esc(p.phase_id)}">${esc(R.phaseName(s, p.phase_id))}</button></span><b>${usageHTML(y.budget, y.committed)}</b></div>`; }).join('')
          : `<div class="hint">${esc(K.noPhase)}</div>`, lockedTag())}
        ${productsSec(s, c)}
      </div>`;
  }
  /* CR-11 §4.11 — Apply the Campaign's default term to its open deals without one · the Phase's default pillar to its deals without one */
  function applyTermBtn(c) {
    if (!can('campaign.edit') || !R.isTerm(c.default_payment_term)) return '';
    const n = R.openDealsWithoutTerm(state(), c.campaign_id).length;
    return n ? `<div class="fill-apply"><button type="button" class="btn small" data-act="applyTerm">${esc(C.fill.applyTerm(n))}</button></div>` : '';
  }
  function defaultPillarHTML(p) {
    const s = state(), v = p.default_pillar || '', n = v ? R.dealsWithoutPillar(s, p.phase_id).length : 0;
    if (!can('campaign.edit')) return kv(C.fill.defaultPillar, v);
    return `<div class="kv"><span>${esc(C.fill.defaultPillar)}</span><b><select data-defpillar aria-label="${esc(C.fill.defaultPillar)}">${optionsHTML(activeList('pillar_list', v || null), v, C.fill.none)}</select></b></div>` +
      `<div class="hint">${esc(C.fill.defaultPillarHint)}</div>` + (n ? `<div class="fill-apply"><button type="button" class="btn small" data-act="applyPillar">${esc(C.fill.applyPillar(n))}</button></div>` : '');
  }
  /* deals → one event a deal (a field) · Undo puts back what each had */
  async function applyDefault(field, deals, value, title, body, done) {
    if (!deals.length || !(await confirmDialog(title, body, C.fill.apply))) return;
    const s = state(), before = new Map(deals.map(d => [d.deal_id, d[field] || null]));
    const r = R.fieldChanges(deals, field, value, { eventId: store.newEventId(), now: new Date(), user: userId(), note: C.fill.note });
    const put = list => { const at = new Map(state().deals.map((x, i) => [x.deal_id, i])); list.deals.forEach(x => { state().deals[at.get(x.deal_id)] = x; }); list.events.forEach(e => state().deal_events.push(e)); };
    put(r); commit(); renderPanel();
    toastAction(done(r.deals.length), C.deal.undo, () => {
      const now = r.deals.map(d => state().deals.find(x => x.deal_id === d.deal_id)).filter(Boolean);
      put(R.fieldChanges(now, field, d => before.get(d.deal_id), { eventId: store.newEventId(), now: new Date(), user: userId(), note: 'undo' }));
      commit(C.fill.undone); if (U.drawerOwner() === owner) renderPanel();
    }, 10000);
  }
  /* a section Staff cannot change (CR-09 §4.7): a lock that says who can */
  const lockedTag = () => (can('campaign.edit') || !can('campaign.products') ? '' : `<span class="seclock" title="${esc(K.onlyAdminKm)}" aria-label="${esc(K.onlyAdminKm)}">${ICON.lock}</span>`);
  /* CR-06 §4.3 — the Campaign's products and how many deals picked each · CR-09 §4.7: ✎ here for Admin · KOL Manager · Staff (+ New product) · who changed them last */
  function productsSec(s, c) {
    const list = R.campaignProducts(s, c.campaign_id), P = C.products, pe = cp.prodEdit;
    const last = (s.campaign_events || []).filter(e => e.campaign_id === c.campaign_id && e.type === 'products').slice(-1)[0];
    const updated = last ? `<div class="hint">${esc(K.productsUpdated(R.dmy(R.dateOfTimestamp(last.changed_at)), R.changedByName(s, last.changed_by)))}</div>` : '';
    if (pe) return sec(K.secProducts(pe.codes.length), U.productPickerHTML('cp_prodpick', pe.codes, code => R.productDealsInCampaign(state(), c.campaign_id, code).length, true) +
      `<div class="checks" id="cp_prodchk" style="margin-top:8px"></div><div class="btns" style="margin-top:10px;justify-content:flex-end"><button type="button" class="btn" data-act="prodCancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="prodSave">${esc(C.common.save)}</button></div>` + updated);
    const pen = can('campaign.products') ? `<button type="button" class="icon-btn sm" data-act="editProducts" title="${esc(K.editProducts)}" aria-label="${esc(K.editProducts)}">${ICON.pencil}</button>` : '';
    return sec(K.secProducts(list.length), (list.length ? list.map(p => { const n = R.productDealsInCampaign(s, c.campaign_id, p.tr_code).length;
      return `<div class="kv"><span title="${esc(R.productLabel(p))}">${esc(R.productShort(p))} <span class="muted small">${esc(p.tr_code)}</span></span><b>${n ? esc(P.dealsN(n)) : `<span class="muted">${esc(P.unused)}</span>`}</b></div>`; }).join('')
      : `<div class="check warn">! <span>${esc(P.noProductsTip)}</span></div>`) + updated, pen);
  }
  function startProducts() {
    if (!guard('campaign.products')) return;
    cp.prodEdit = { codes: R.campaignProductCodes(state(), cp.id).slice(), dirty: false };
    renderPanel();
    const q = $('cp_prodpick_q'); if (q) q.focus();
  }
  function wireProducts() {
    const pe = cp.prodEdit, chk = () => { const r = R.checkCampaignProducts(state(), cp.id, pe.codes); $('cp_prodchk').innerHTML = checksHTML(r, ''); return r; };
    const title = () => { const h = $('cp_prodpick').closest('.sec').querySelector('.sec-h span'); if (h) h.textContent = K.secProducts(pe.codes.length); };
    U.wireProductPicker($('cp_prodpick'), { get: () => pe.codes, set: codes => { pe.codes = codes; pe.dirty = true; title(); chk(); }, locked: code => R.productDealsInCampaign(state(), cp.id, code).length,
      canNew: can('campaign.products'), askUsed: true });
    chk();
  }
  /* save: the list · a campaign_events row (from / to = TR codes) · deals keep a product that left (CR-09 §4.7) */
  function saveProducts() {
    if (!guard('campaign.products') || !cp.prodEdit) return;
    const s = state(), before = R.campaignProductCodes(s, cp.id), codes = cp.prodEdit.codes.slice(), c = campById(cp.id);
    if (JSON.stringify(before) !== JSON.stringify(codes)) {
      R.setCampaignProducts(s, cp.id, codes);
      s.campaign_events.push({ event_id: store.newCampaignEventId(), campaign_id: cp.id, type: 'products', from: { products: before }, to: { products: codes }, changed_at: new Date().toISOString(), changed_by: userId(), note: null });
      cp.prodEdit = null; commit(K.productsSaved(c.campaign_name));
    } else { cp.prodEdit = null; toast(K.nothingChanged); }
    renderTable(); renderPanel();
  }
  function viewPhaseHTML(p) {
    const s = state(), c = campById(p.campaign_id) || {}, x = R.phaseSummary(s, p.phase_id), canDel = R.canDeletePhase(s, p.phase_id);
    const sp = ((window.KT_SEED && window.KT_SEED.phases) || []).find(q => q.phase_id === p.phase_id), unconfirmed = sp && sp.budget_kol === p.budget_kol && p.budget_kol != null;
    let budget;
    if (x.budget == null) budget = `<div class="hint">${esc(K.noBudgetSet)}</div>${kv(K.colCommitted, R.baht(x.committed))}${kv(K.colPaid, R.baht(x.paid))}`;
    else {
      const pct = x.budget ? Math.min(100, x.committed / x.budget * 100) : 100;
      budget = `<div class="meter"><span class="${x.over ? 'over' : pct > 85 ? 'warn' : ''}" style="width:${pct}%"></span></div>` +
        kv(K.colBudget, pctText(x.budget, (campById(p.campaign_id) || {}).budget_kol)) + kv(K.colShortlist, R.baht(x.shortlist)) + kv(K.colCommitted, R.baht(x.committed), x.over ? 'over' : '') + kv(K.colPaid, R.baht(x.paid)) + kv(K.remaining, R.baht(x.remaining), x.over ? 'over' : '') +
        (x.over ? `<div class="check warn" style="margin-top:6px">! <span>${esc(K.overBudget(R.baht(-x.remaining)))}</span></div>` : '') +
        (unconfirmed ? `<div class="hint" style="margin-top:6px">${esc(K.budgetNote)}</div>` : '');
    }
    const pname = R.phaseName(s, p.phase_id);
    return `<div class="dr-head"><div class="dr-title"><div class="t"><h2 title="${esc(pname)}">${esc(pname)}</h2><div class="dr-sub"><span>${esc(K.phaseTag)} · ${esc(c.campaign_name || '')}</span>${phaseChip(R.phaseStatus(p, today()))}</div></div>
        <details class="menu"><summary class="icon-btn" title="${esc(C.app.more)}" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right">
          <button type="button" class="mi danger" data-act="delete"${canDel ? '' : ` disabled title="${esc(K.cannotDeletePhase(x.posts))}"`}>${esc(K.deletePhase)}</button></div></details>${closeBtn}</div>
        ${can('campaign.edit') ? `<div class="dr-actions"><button type="button" class="btn primary" data-act="plan">${esc(C.planner.planPhases)}</button>${canDel ? '' : `<span class="muted small">${esc(K.cannotDeletePhase(x.posts))}</span>`}</div>` : ''}</div>
      <div class="dr-body">
        ${sec(K.secDetails, kv(K.fCampaign, c.campaign_name || '') + kv(K.colPeriod, `${range(p.start_date, p.end_date)} (${C.common.days(R.dayDiff(p.end_date, p.start_date) + 1)})`) + defaultPillarHTML(p))}
        ${sec(K.secBudget, budget)}
        ${sec(K.secDeals, `<div class="chips">${['List', 'Inprocess', 'Complete', 'Cancel'].map(k => stChip(k, x.counts[k] || 0)).join('')}</div>`)}
      </div>`;
  }
  const targetText = c => { const t = R.pillarTargetOf(state(), c.campaign_id); return `${R.PILLARS.map(p => t[R.PILLAR_KEY[p]]).join(' / ')}${c.pillar_target ? '' : ` (${K.targetDefault})`}`; };
  const fmtPct = v => `${Math.round(v * 10) / 10}%`;
  const pctText = (amount, campaignBudget) => { const pct = R.pctOfBudget(amount, campaignBudget); return pct == null ? R.baht(amount) : K.pctAndAmount(fmtPct(pct), R.baht(amount)); };
  /* ---------- edit (a Campaign's details; Phases are edited in the Phase Planner) ---------- */
  /* "+ New phase" with no Campaign open: pick one, then its Planner opens with an empty row */
  function chooseCampaign(opener) {
    if (!guard('campaign.edit')) return;
    let id = '';
    U.createModal({ size: 'S', title: C.planner.chooseTitle, sub: C.planner.chooseSub, opener, focus: '#pc_camp',
      body: `<div class="field"><label for="pc_camp">${esc(K.fCampaign)} <span class="req">*</span></label><select id="pc_camp">${U.campaignOptionsHTML('', K.chooseCampaign)}</select></div>`,
      foot: ['', U.cmButtons(C.planner.next, 'pc_ok', { attrs: ' disabled' })] });
    $('pc_camp').addEventListener('change', e => { id = e.target.value; $('pc_ok').disabled = !id; });
    $('pc_ok').addEventListener('click', () => { if (id) KT.planner.open({ campaignId: id, addRow: true, opener }); });
  }
  function startEdit() {
    if (cp.kind !== 'campaign') { const p = phaseById(cp.id); if (p) KT.planner.open({ campaignId: p.campaign_id, focusPhase: p.phase_id }); return; }
    const rec = campById(cp.id); if (!rec || !guard('campaign.edit')) return;
    const draft = Object.assign({}, rec);
    draft.budget_kol = rec.budget_kol == null ? '' : String(rec.budget_kol);
    if (cp.kind === 'campaign') { draft.cta = rec.cta || ''; draft.default_payment_term = R.isTerm(rec.default_payment_term) ? rec.default_payment_term : ''; }
    if (cp.kind === 'campaign') { const t = R.pillarTargetOf(state(), rec.campaign_id); draft.ownTarget = !!rec.pillar_target; draft.target = Object.fromEntries(R.PILLARS.map(p => [R.PILLAR_KEY[p], String(t[R.PILLAR_KEY[p]])])); }
    draft.products = R.campaignProductCodes(state(), rec.campaign_id);
    Object.assign(cp, { mode: 'edit', draft, dirty: false, submitted: false }); cp.touched.clear();
    renderPanel();
  }
  const lockedOf = code => (cp.draft && cp.draft.campaign_id ? R.productDealsInCampaign(state(), cp.draft.campaign_id, code).length : 0);
  function cancelEdit() { if (cp.mode === 'new') { U.closeDrawer(); return; } Object.assign(cp, { mode: 'view', draft: null }); cp.touched.clear(); renderPanel(); }
  const validate = () => {
    const r = R.validateCampaign(state(), cp.draft);
    if (cp.draft.ownTarget) r.errs.push(...R.validatePillarTarget(cp.draft.target).errs);
    const pr = R.checkCampaignProducts(state(), cp.draft.campaign_id, cp.draft.products || []);
    r.errs.push(...pr.errs); r.warns.push(...pr.warns);
    return r;
  };
  const foot = () => `<div class="dr-foot"><div class="checks" id="cp_checks"></div><div class="btns"><button type="button" class="btn" data-act="cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="save">${esc(C.common.save)}</button></div></div>`;
  function formCampaignHTML() {
    const d = cp.draft, isNew = cp.mode === 'new';
    return `<div class="dr-head"><div class="dr-title"><div class="t"><h2>${esc(isNew ? K.newCampaignTitle : K.editTitle(d.campaign_name || ''))}</h2></div>${closeBtn}</div></div>
      <div class="dr-body">${sec(K.secDetails, `<div class="fields one">
        ${field('campaign_name', K.fName, `<input id="f_campaign_name" data-f="campaign_name" value="${esc(d.campaign_name)}" placeholder="${esc(K.namePh)}" autocomplete="off">`, { req: 1 })}
        ${field('note', K.fNote, `<input id="f_note" data-f="note" value="${esc(d.note || '')}" autocomplete="off">`)}
        ${field('budget_kol', K.fCampaignBudget, `<input type="number" min="0" step="1" inputmode="numeric" id="f_budget_kol" data-f="budget_kol" value="${esc(d.budget_kol)}">`, { hint: esc(K.campaignBudgetHint) })}
        ${field('cta', K.fCta, `<select id="f_cta" data-f="cta">${optionsHTML(activeList('cta_list', d.cta), d.cta || '', C.common.none)}</select>`, { hint: esc(K.ctaHint) })}
        ${isNew ? '' : field('default_payment_term', C.fill.defaultTerm, `<select id="f_default_payment_term" data-f="default_payment_term">${optionsHTML(R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), d.default_payment_term || '', C.fill.none)}</select>`, { hint: esc(C.fill.defaultTermHint) })}
        ${field('products', C.planner.fProducts, U.productPickerHTML('cp_products', d.products || [], lockedOf, true), { hint: esc(C.planner.productsHint) })}</div>`)}
        ${isNew ? '' : sec(K.pillarTarget, `<label class="tick"><input type="checkbox" data-owntarget${d.ownTarget ? ' checked' : ''}> ${esc(K.ownTarget)}</label>
          <div class="fields three" style="margin-top:8px">${R.PILLARS.map(p => `<div class="field"><label>${esc(p)} (%)</label><input type="number" min="0" max="100" step="1" inputmode="numeric" data-ptc="${R.PILLAR_KEY[p]}" value="${esc(d.target[R.PILLAR_KEY[p]])}"${d.ownTarget ? '' : ' disabled'}></div>`).join('')}</div>`)}</div>${foot()}`;
  }
  function wireForm() {
    const box = $('drawer_content');
    const own = box.querySelector('[data-owntarget]');
    if (own) {
      own.addEventListener('change', () => { cp.draft.ownTarget = own.checked; cp.dirty = true; box.querySelectorAll('[data-ptc]').forEach(i => { i.disabled = !own.checked; }); check(); });
      box.querySelectorAll('[data-ptc]').forEach(i => i.addEventListener('input', () => { cp.draft.target[i.dataset.ptc] = i.value; cp.dirty = true; check(); }));
    }
    box.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f;
      el.addEventListener('input', () => { cp.draft[f] = el.value; cp.dirty = true; check(); });
      el.addEventListener('change', () => { cp.draft[f] = el.value; cp.dirty = true; cp.touched.add(f); check(); });
      el.addEventListener('blur', () => { if (!R.isBlank(el.value)) cp.touched.add(f); check(); });
    });
    U.enhanceCombos(box);
    U.wireProductPicker($('cp_products'), { get: () => cp.draft.products, set: codes => { cp.draft.products = codes; cp.dirty = true; cp.touched.add('products'); check(); }, locked: lockedOf, canNew: can('campaign.edit'), askUsed: true });
    check();
    const first = box.querySelector('[data-f]:not([disabled]):not([type=hidden])'); if (first && cp.mode === 'new') first.focus();
  }
  function check() {
    const box = $('drawer_content'), res = validate();
    /* errors only for the fields touched, or all of them after the first Save */
    const shown = Object.assign({}, res, { errs: res.errs.filter(e => cp.submitted || cp.touched.has(e.field)) });
    shown.warns = res.warns.filter(w => w.field !== 'products' || cp.submitted || cp.touched.has('products'));
    $('cp_checks').innerHTML = checksHTML(shown, res.errs.length ? '' : C.common.ok);
    box.querySelectorAll('[data-f]').forEach(el => el.classList.toggle('invalid', (cp.submitted || cp.touched.has(el.dataset.f)) && res.errs.some(e => e.field === el.dataset.f)));
    box.querySelector('[data-act="save"]').disabled = cp.submitted && res.errs.length > 0;
  }
  /* the Campaign budget changed and Phases have budgets: keep their % (recalculate) or keep their amounts */
  function askBudgetSplit() {
    return new Promise(resolve => {
      openDialog(`<div class="dlg-h">${esc(K.budgetChangedTitle)}</div><div class="dlg-b">${esc(K.budgetChangedBody)}</div>
        <div class="dlg-f"><button type="button" class="btn" data-r="">${esc(C.common.cancel)}</button><button type="button" class="btn" data-r="amount">${esc(K.keepAmounts)}</button><button type="button" class="btn primary" data-r="pct">${esc(K.keepPct)}</button></div>`);
      const dlg = U.dlg, done = v => { dlg.removeEventListener('close', onClose); closeDialog(); resolve(v); }, onClose = () => done('');
      dlg.addEventListener('close', onClose);
      dlg.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => done(b.dataset.r)));
    });
  }
  async function save() {
    if (!guard('campaign.edit')) return;
    const s = state(), res = validate();
    if (res.errs.length) { cp.submitted = true; res.errs.forEach(x => cp.touched.add(x.field)); check(); return; }
    const d = cp.draft, budget = R.isBlank(d.budget_kol) ? null : Number(d.budget_kol);
    const rec = { campaign_id: d.campaign_id, campaign_name: R.trim(d.campaign_name), note: R.trim(d.note), budget_kol: budget, cta: d.cta || null,
      default_payment_term: R.isTerm(d.default_payment_term) ? d.default_payment_term : null,   // CR-11 §4.11
      pillar_target: d.ownTarget ? Object.fromEntries(Object.entries(d.target).map(([k, v]) => [k, Number(v)])) : null };
    const old = campById(rec.campaign_id), was = old.budget_kol, phases = s.phases.filter(p => p.campaign_id === rec.campaign_id && !R.isBlank(p.budget_kol));
    if (was !== budget && !R.isBlank(was) && Number(was) > 0 && budget != null && phases.length) {
      const how = await askBudgetSplit(); if (!how) return;
      if (how === 'pct') phases.forEach(p => { p.budget_kol = R.budgetFromPct(R.pctOfBudget(p.budget_kol, was), budget); });
    }
    const oldCta = old.cta || null, productsBefore = R.campaignProductCodes(s, rec.campaign_id);
    Object.assign(old, rec);
    if (JSON.stringify(productsBefore) !== JSON.stringify(d.products)) {
      R.setCampaignProducts(s, rec.campaign_id, d.products);
      s.campaign_events.push({ event_id: store.newCampaignEventId(), campaign_id: rec.campaign_id, type: 'products', from: { products: productsBefore }, to: { products: d.products.slice() }, changed_at: new Date().toISOString(), changed_by: userId(), note: null });
    }
    /* the Campaign CTA changed: offer it to the open deals that still use the old one */
    const same = oldCta !== rec.cta ? R.dealsWithCta(s, rec.campaign_id, oldCta) : [];
    if (same.length && await confirmDialog(K.ctaApplyTitle(same.length), K.ctaApplyBody(oldCta || C.common.none, rec.cta || C.common.none, same.length), K.ctaApplyOk)) {
      const r = R.fieldChanges(same, 'cta', rec.cta, { eventId: store.newEventId(), now: new Date(), user: userId(), note: K.ctaNote });
      const at = new Map(s.deals.map((x, i) => [x.deal_id, i]));
      r.deals.forEach(x => { s.deals[at.get(x.deal_id)] = x; }); r.events.forEach(e => s.deal_events.push(e));
      toast(K.ctaApplied(r.deals.length));
    }
    Object.assign(cp, { mode: 'view', id: rec.campaign_id, draft: null }); cp.touched.clear();
    commit(C.common.savedToast(rec.campaign_name));
    renderTable(); renderPanel();
  }
  async function del() {
    if (!guard('campaign.edit')) return;
    const s = state(), isC = cp.kind === 'campaign', id = cp.id;
    if (!(isC ? R.canDeleteCampaign(s, id) : R.canDeletePhase(s, id))) return;
    const rec = isC ? campById(id) : phaseById(id), name = isC ? rec.campaign_name : R.phaseName(s, id);
    if (!(await confirmDialog(isC ? K.deleteCampaign : K.deletePhase, K.confirmDelete(name), K.delete, true))) return;
    if (isC) { s.campaigns.splice(s.campaigns.indexOf(rec), 1); R.setCampaignProducts(s, id, []); } else s.phases.splice(s.phases.indexOf(rec), 1);
    commit(C.common.deletedToast(name));
    U.closeDrawer(); renderTable();
  }
  function panelClick(e) {
    const ph = e.target.closest('[data-phase]'); if (ph) { Object.assign(cp, { mode: 'view', kind: 'phase', id: ph.dataset.phase }); renderPanel(); return; }
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act, m = b.closest('details'); if (m) m.open = false;
    if (act === 'editProducts') startProducts();
    else if (act === 'prodSave') saveProducts();
    else if (act === 'prodCancel') { cp.prodEdit = null; renderPanel(); }
    else if (act === 'edit') startEdit();
    else if (act === 'cancel') cancelEdit();
    else if (act === 'save') save();
    else if (act === 'addPhase') KT.planner.open({ campaignId: cp.id, addRow: true });
    else if (act === 'applyTerm') { const c = campById(cp.id), list = R.openDealsWithoutTerm(state(), c.campaign_id), t = C.term[c.default_payment_term];
      applyDefault('payment_term', list, c.default_payment_term, C.fill.applyTermTitle(list.length), C.fill.applyTermBody(t, list.length), n => C.fill.termApplied(n, t)); }
    else if (act === 'applyPillar') { const p = phaseById(cp.id), list = R.dealsWithoutPillar(state(), p.phase_id);
      applyDefault('pillar', list, p.default_pillar, C.fill.applyPillarTitle(list.length), C.fill.applyPillarBody(p.default_pillar, R.phaseName(state(), p.phase_id), list.length), n => C.fill.pillarApplied(n, p.default_pillar)); }
    else if (act === 'hold' || act === 'cancelCampaign') openStatus(act === 'hold' ? 'on_hold' : 'cancelled');
    else if (act === 'resume') setStatus(null, '');
    else if (act === 'plan') KT.planner.open({ campaignId: cp.kind === 'campaign' ? cp.id : phaseById(cp.id).campaign_id, focusPhase: cp.kind === 'phase' ? cp.id : null });
    else if (act === 'delete') del();
  }

  /* ---------- On hold · Cancelled (CR-05 §4.7) ---------- */
  function openStatus(to) {
    if (!guard('campaign.edit')) return;
    const s = state(), c = campById(cp.id), open = s.deals.filter(d => d.campaign_id === c.campaign_id && R.isOpenDeal(d));
    const cancelling = to === 'cancelled';
    openDialog(`<div class="dlg-h">${esc(cancelling ? K.cancelTitle(c.campaign_name) : K.holdTitle(c.campaign_name))}</div><div class="dlg-b">
        <p style="margin-top:0">${esc(cancelling ? K.cancelBody : K.holdBody)}</p>
        ${cancelling && open.length ? `<div class="check warn">! <span>${esc(K.cancelOpenDeals(open.length))}</span></div>` : ''}
        <div class="field" style="margin-top:10px"><label for="cs_reason">${esc(K.statusReason)} <span class="req">*</span></label><textarea id="cs_reason"></textarea></div><div class="checks" id="cs_checks"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="cs_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn ${cancelling ? 'danger' : 'primary'}" id="cs_ok" disabled>${esc(cancelling ? (open.length ? K.cancelWithDeals(open.length) : K.cancelCampaign) : K.putOnHold)}</button></div>`);
    const chk = () => { const r = R.validateCampaignStatus(to, $('cs_reason').value); $('cs_ok').disabled = r.errs.length > 0; return r; };
    $('cs_reason').addEventListener('input', chk);
    $('cs_cancel').addEventListener('click', closeDialog);
    $('cs_ok').addEventListener('click', () => { if (chk().errs.length) return; const reason = R.trim($('cs_reason').value); closeDialog(); setStatus(to, reason); });
  }
  /* to = 'on_hold' | 'cancelled' | null (Resume) · cancelling also cancels the open deals with the same reason */
  function setStatus(to, reason) {
    if (!guard('campaign.edit')) return;
    const s = state(), c = campById(cp.id), now = new Date(), from = c.status_override || null;
    if (to === 'cancelled') {
      const cancelStep = R.stepsOf(s.lookups).find(R.isCancelStep);
      s.deals.filter(d => d.campaign_id === c.campaign_id && R.isOpenDeal(d)).forEach(d => {
        const r = R.applyMove(s, d, cancelStep.sub_status, { date: today(), note: K.cancelNote(c.campaign_name), cancelReason: reason }, { logId: store.newLogId(), quoteId: store.newId('quote'), eventId: store.newEventId(), now, user: userId() });
        s.deals[s.deals.indexOf(d)] = r.deal; s.deal_status_log.push(r.log); r.events.forEach(e => s.deal_events.push(e));
      });
    }
    Object.assign(c, { status_override: to, status_reason: to ? reason : null, status_changed_at: now.toISOString() });
    s.campaign_events.push({ event_id: store.newCampaignEventId(), campaign_id: c.campaign_id, type: 'status', from, to: to || null, changed_at: now.toISOString(), changed_by: userId(), note: reason || null });
    commit(to ? K.statusSaved(c.campaign_name, C.phaseStatus[to]) : K.resumed(c.campaign_name));
    renderTable(); renderPanel();
  }
  /* after the Planner saved: the table again, that Campaign lit up · the drawer it was opened from shows the new plan (CR-11 §4.1) */
  function afterPlan(id) {
    const open = cp.mode === 'view' && (cp.id === id || (cp.kind === 'phase' && phaseById(cp.id) && phaseById(cp.id).campaign_id === id));
    if (cp.kind === 'phase' && !phaseById(cp.id)) Object.assign(cp, { mode: 'none', kind: null, id: null, draft: null });   // that Phase went
    else if (!open) Object.assign(cp, { mode: 'none', kind: null, id: null, draft: null });
    cp.collapsed.delete(id);
    if (U.currentTab() !== 'campaign') return;
    renderTable(); if (cp.mode === 'view') renderPanel();
    const tr = document.querySelector(`#cp_tbl tr[data-kind="campaign"][data-id="${CSS.escape(id)}"]`);
    if (tr) { tr.classList.add('flash'); tr.scrollIntoView({ block: 'nearest' }); setTimeout(() => tr.classList.remove('flash'), 2400); }
  }
  function reset() { Object.assign(cp, { mode: 'none', kind: null, id: null, draft: null, prodEdit: null }); cp.touched.clear(); }
  /* "Campaign created · Open" */
  function openCampaign(id) { if (U.currentTab() !== 'campaign') { U.go('campaign'); setTimeout(() => select('campaign', id), 0); return; } select('campaign', id); }
  return { render, reset, afterPlan, openCampaign };
})();
