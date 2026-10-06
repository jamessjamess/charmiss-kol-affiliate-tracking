/* screen-deals.js — Deals (CR-06 §4.6): page header (+ New deal) · View tabs Table | Pipeline · Scope: Campaign (one) → Phase → PIC
   (Me by default for a PIC) → search → Filters (Tier, Pillar, CTA, Payment term, Sub-status) → ⋯ (Export · Compact | Template) or the
   bulk bar · Group by → state tabs (Open · Needs action · Complete · Cancelled · All) → summary · Table or Pipeline,
   and the Deal drawer: every section reads, ✎ opens one section as a form with its locks (CR-04 §4.5) · New deal · Move stage.
   → KT.screens.deals */
KT.screens.deals = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, pref, commit, toast, toastAction, downloadCSV, checksHTML, kv, field, range, stChip, stageChip, stageCell, payCell,
    phaseChip, stepTitle, bahtShort, dm, initials, info, ICON, pfIcon, optionsHTML, activeList, phaseOptionsHTML, sortBy, dateHTML, setDate, setDateDisabled,
    campaignOptionsHTML, openDialog, closeDialog, openDrawer, fillDrawer, setHash, go, takeParams, userId, can, guard, picList } = U;
  const D = C.deal, F = D.f;
  const PAGE = 100;
  /* phaseSel: 'all' (default) · 'ongoing' · one phase_id of the Campaign · '__needs' / '__unscheduled' only when a link asks for it (CR-03) */
  const blankFilter = R.blankDealFilter;
  const myPic = () => R.picName(U.me());
  const POP_KEYS = ['sub', 'pillar', 'cta', 'term', 'sample'];
  const VIEWS = ['table', 'pipeline', 'samples', 'performance'];   // CR-10 §4.14: Samples (screen-samples.js)   // CR-08: the Payments view moved to its own page · CR-10: Performance (screen-perf.js)
  const readSet = k => { try { return new Set(JSON.parse(pref.get(k, '[]'))); } catch (e) { return new Set(); } };
  const dl = {
    view: VIEWS.includes(pref.get('dealview', 'table')) ? pref.get('dealview', 'table') : 'table', cols: pref.get('dealcols', 'compact') === 'template' ? 'template' : 'compact',
    tab: 'open', reason: '', f: blankFilter(), pic: null, picUser: null, pf: R.blankPerfFilter(), sf: { sstatus: '' },
    sort: { key: 'due', dir: 'asc' }, limit: PAGE, openCols: new Set(), cancelOpen: false, rows: [], selected: new Set(), groupLimit: new Map(),
    collapsed: readSet('dealgroups2'), opened: readSet('dealgroupsopen'), groupKeys: [],
    mode: 'none', id: null, draft: null, posts: null, ticks: null, touched: new Set(), showDraft23: false, dirty: false,
    /* CR-04 §4.5: the one section open for editing in the drawer (header · info · payment · costs · timeline · posts) */
    sec: null, costReason: '', picSource: null, ctaFromCampaign: false, saveTerm: false, updateKolTerm: false,
  };
  const editing = () => dl.mode === 'new' || !!dl.sec;
  const dealById = id => state().deals.find(d => d.deal_id === id);
  const phaseById = id => state().phases.find(p => p.phase_id === id);
  const kolName = id => (R.kolById(state(), id) || {}).display_name || '';
  const money = v => (R.isBlank(v) ? '' : R.fmtNum(v));
  const asText = v => (v == null ? '' : String(v));
  const grouped = () => dl.f.phaseSel === 'ongoing' || dl.f.phaseSel === 'all';
  /* CR-06 §4.6 — Group by (Stage first) is the same for Compact and Template */
  const GROUP_BYS = ['stage', 'phase', 'tier', 'pic', 'none'];
  const groupBy = () => { const v = pref.get('dealgroupby3', 'stage'); return GROUP_BYS.includes(v) ? v : 'stage'; };
  const startsCollapsed = gk => gk === 'stage:Cancelled';
  const isCollapsed = gk => (startsCollapsed(gk) ? !dl.opened.has(gk) : dl.collapsed.has(gk));
  const special = k => k === R.NEEDS || k === R.UNSCHEDULED;
  /* Overview links still pass the old scope ('' · 'c:CH' · a phase_id) */
  function fromScope(scope) {
    if (!scope) return { campaign: '', phaseSel: 'all' };
    if (scope.startsWith('c:')) return { campaign: scope.slice(2), phaseSel: 'all' };
    const p = phaseById(scope); return { campaign: p ? p.campaign_id : '', phaseSel: p ? scope : 'all' };
  }
  /* CR-06 §4.6 PIC: 'me' · 'all' · a PIC name · '__none' (Unassigned) — remembered for each person; a PIC starts with Me, anyone else with All PICs */
  /* CR-07 §4.4: one value for the PIC box, its chip and the filter — your own name is always 'me' · a remembered PIC that is no longer an active PIC → the default */
  const picValid = v => ['me', 'all', '__none'].includes(v) || R.picNames(state()).includes(v);
  const normPic = v => (v && v === myPic() ? 'me' : v || 'all');
  function picSel() {
    const uid = userId();
    if (dl.picUser !== uid) { dl.picUser = uid; const saved = pref.get('dealpic_' + uid, ''), v = normPic(saved); dl.pic = saved && picValid(v) ? v : (myPic() ? 'me' : 'all'); }
    if (dl.pic === 'me' && !myPic()) dl.pic = 'all';
    return dl.pic;
  }
  const choosePic = v => { picSel(); dl.pic = normPic(v); pref.set('dealpic_' + userId(), dl.pic); };
  const filtersNow = () => Object.assign({}, dl.f, { pic: picSel(), reason: dl.view === 'table' && dl.tab === 'needs' ? dl.reason : '' });
  const picFilter = () => { const v = picSel(); return v === 'all' ? '' : v === 'me' ? myPic() : v; };
  const picLabel = v => (v === 'me' ? D.picMe(myPic()) : v === '__none' ? D.unassigned : v === 'all' ? D.allPics : v);
  /* one Campaign at a time: the last one used, else the first On going */
  function ensureCampaign(s, td) { if (!dl.f.campaign || !s.campaigns.some(c => c.campaign_id === dl.f.campaign)) dl.f.campaign = R.defaultDealsCampaign(s, td, pref.get('dealcamp', '')); }
  /* CR-03: Phase filter = deals with a post in the Phase(s) · All phases = the whole Campaign · money follows the same scope */
  function currentScope(s, td) {
    const ids = special(dl.f.phaseSel) ? [dl.f.phaseSel] : phaseList(s, td).map(p => p.phase_id), whole = dl.f.phaseSel === 'all';
    return { base: Object.assign({}, dl.f, { phases: whole ? undefined : ids, pic: picFilter() }), scope: { campaignId: dl.f.campaign || null, phaseIds: whole ? null : ids } };
  }
  /* the Phases on screen, in group order (CR-02 §4.4, §4.8) */
  function phaseList(s, td) {
    const all = R.orderedPhases(s.campaigns, s.phases, td).filter(p => !dl.f.campaign || p.campaign_id === dl.f.campaign);
    if (dl.f.phaseSel === 'all') return all;
    if (dl.f.phaseSel === 'ongoing') return all.filter(p => R.phaseStatus(p, td) === 'ongoing');
    return all.filter(p => p.phase_id === dl.f.phaseSel);
  }

  /* ===================== screen ===================== */
  function render(id) {
    /* CR-08 §4.2: the Payments view moved to its own page — a remembered or linked "payments" view goes there (same Campaign) */
    if (pref.get('dealview', '') === 'payments') { pref.set('dealview', 'table'); dl.view = 'table'; go('payments', { campaign: dl.f.campaign || '' }); return; }
    const sec = $('tab-deals');
    if (!sec.dataset.built) build(sec);
    const p = takeParams('deals');
    if (p) {
      if (p.filter) {
        /* old links: Needs phase / overdue / unpaid → the Needs action tab with that reason · a PIC → the PIC box */
        const { scope, overdue, unpaid, pic, ...rest } = p.filter;
        dl.f = Object.assign(blankFilter(), fromScope(scope), rest); dl.tab = 'open'; dl.reason = '';
        if (dl.f.phaseSel === R.NEEDS) { dl.f.phaseSel = 'all'; dl.tab = 'needs'; dl.reason = 'needsPhase'; }
        if (overdue) { dl.tab = 'needs'; dl.reason = 'overdue'; }
        if (unpaid) { dl.tab = 'needs'; dl.reason = 'unpaid'; }
        if (pic !== undefined) choosePic(pic);
        dl.view = 'table'; dl.limit = PAGE; $('dl_q').value = dl.f.q || '';
      }
      /* CR-10 §4.14: Operations › Samples to ship → Deals › Samples of that PIC */
      if (p.samples) { dl.view = 'samples'; pref.set('dealview', 'samples'); if (p.samples.campaign) dl.f.campaign = p.samples.campaign; if (p.samples.pic !== undefined) choosePic(p.samples.pic || 'all'); dl.sf.sstatus = p.samples.sstatus || ''; }
      if (p.deal === '__new__') { if (dl.mode === 'new' && p.kol && R.kolById(state(), p.kol) && !dl.draft.kol_id) { dl.draft.kol_id = ''; setDraftKol(p.kol); } }
      else if (p.deal) { id = p.deal; const d0 = dealById(id); if (d0 && d0.campaign_id !== dl.f.campaign) { dl.f.campaign = d0.campaign_id; dl.f.phaseSel = 'all'; } }
    }
    renderLeft();
    if (id && dealById(id) && !(dl.id === id && editing())) {
      if (editing() && dl.id !== id) toast(C.common.blockWhileEditing);
      else { Object.assign(dl, { mode: 'view', id }); renderPanel(); }
    } else if (editing()) renderPanel();
    markSelected();
  }
  function build(sec) {
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(D.title)}</h1><span class="spacer"></span><button type="button" class="btn primary" id="dl_new">${esc(D.newDeal)}</button></div>
      <div class="stabs dtabs" id="dl_view" role="tablist">${VIEWS.map(v => `<button type="button" role="tab" data-v="${v}">${esc(D.views[v])}</button>`).join('')}</div>
      <div class="toolbar dl-scope" id="dl_tools">
        <span class="dl-camp"><select id="dl_camp" aria-label="${esc(D.campaign)}" data-combo="campaign" data-combo-new="campaign"></select><span id="dl_campSt"></span></span>
        <select id="dl_phase" aria-label="${esc(D.phase)}" data-combo="phase"></select>
        <label class="tlab">${esc(D.pic)} <select id="dl_pic" aria-label="${esc(D.pic)}"></select></label>
        <input type="search" class="search" id="dl_q" placeholder="${esc(D.search)}" autocomplete="off">
        <details class="menu" id="dl_fmenu"><summary class="btn">${ICON.filter} ${esc(D.filters)} <span class="badge hidden" id="dl_fbadge"></span></summary><div class="popover" id="dl_fpop"></div></details>
        <span class="spacer"></span>
        <details class="menu" id="dl_more"><summary class="btn icon" title="${esc(C.app.more)}" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right" id="dl_export">
          <div class="mh">${esc(D.export)}</div>
          <button type="button" class="mi" data-export="deals">${esc(D.exportDeals)}</button><button type="button" class="mi" data-export="posts">${esc(D.exportPosts)}</button>
          <button type="button" class="mi" data-export="template">${esc(D.exportTemplate)}</button>
          <div class="mh">${esc(D.density)}</div><div class="mi-seg"><div class="seg" role="group" aria-label="${esc(D.density)}"><button type="button" data-cols="compact">${esc(D.compact)}</button><button type="button" data-cols="template">${esc(D.template)}</button></div></div>
        </div></details>
      </div>
      <div class="toolbar hidden" id="dl_bulk"><b id="dl_selN"></b><button type="button" class="btn" id="dl_moveTo">${esc(C.bulk.moveTo)}</button><button type="button" class="btn" id="dl_setDetails">${esc(C.bulk.setDetails)}</button><button type="button" class="btn" id="dl_reassign">${esc(D.reassign)}</button><button type="button" class="btn" id="dl_setPillar">${esc(D.setPillar)}</button>
        <button type="button" class="btn" id="dl_selExport">${esc(D.exportSelected)}</button><button type="button" class="btn ghost" id="dl_selClear">${esc(D.clear)}</button></div>
      <div class="fchips" id="dl_chips"></div>
      <div class="dl-row3" id="dl_row3"></div>
      <div class="fchips hidden" id="dl_reasons"></div>
      <div id="dl_body"></div>`;
    U.enhanceCombos(sec);
    $('dl_view').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === dl.view) return;
      dl.view = b.dataset.v; pref.set('dealview', dl.view); renderLeft();
    });
    let qT;
    $('dl_q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { dl.f.q = e.target.value; dl.limit = PAGE; renderLeft(); }, 150); });
    $('dl_camp').addEventListener('change', e => {
      if (!e.target.value) return;
      dl.f.campaign = e.target.value; pref.set('dealcamp', dl.f.campaign);
      const p = phaseById(dl.f.phaseSel); if (p && p.campaign_id !== dl.f.campaign) dl.f.phaseSel = 'all';
      dl.limit = PAGE; renderLeft();
    });
    $('dl_phase').addEventListener('change', e => { dl.f.phaseSel = e.target.value; dl.limit = PAGE; renderLeft(); });
    $('dl_pic').addEventListener('change', e => { choosePic(e.target.value); dl.limit = PAGE; renderLeft(); });
    $('dl_fpop').addEventListener('change', e => {
      const pk = e.target.dataset.pf; if (pk) { dl.pf[pk] = e.target.value; renderLeft(); return; }   // CR-10 Performance filters
      if (e.target.dataset.sf) { dl.sf.sstatus = e.target.value; renderLeft(); return; }   // CR-10 Samples
      const cb = e.target.closest('input[data-tierv]');
      if (cb) {
        const all = [...$('dl_fpop').querySelectorAll('input[data-tierv]:not([data-tierv=""])')];
        if (cb.dataset.tierv === '') dl.f.tiers = null;
        else { const on = all.filter(x => x.checked).map(x => x.dataset.tierv); dl.f.tiers = on.length && on.length < all.length ? on : null; }
        dl.limit = PAGE; renderLeft(); return;
      }
      const k = e.target.dataset.ff; if (k) { dl.f[k] = e.target.value; dl.limit = PAGE; renderLeft(); }
    });
    $('dl_fpop').addEventListener('click', e => { if (e.target.closest('[data-clearall]')) { dl.f.tiers = null; POP_KEYS.forEach(k => { dl.f[k] = ''; }); dl.pf = R.blankPerfFilter(); dl.sf = { sstatus: '' }; dl.limit = PAGE; renderLeft(); } });
    $('dl_chips').addEventListener('click', e => {
      if (e.target.closest('[data-clearfilters]')) { clearFilters(); return; }
      const b = e.target.closest('[data-unset]'); if (!b) return;
      const k = b.dataset.unset; if (k === 'pic') choosePic('all'); else if (k.startsWith('pf:')) dl.pf[k.slice(3)] = ''; else if (k === 'sstatus') dl.sf.sstatus = ''; else dl.f[k] = blankFilter()[k];
      renderLeft();
    });
    $('dl_row3').addEventListener('click', e => {
      const t = e.target.closest('[data-tab]'); if (t) { dl.tab = t.dataset.tab; dl.reason = ''; dl.limit = PAGE; renderLeft(); return; }
      const ga = e.target.closest('[data-groupall]'); if (ga) setAllGroups(ga.dataset.groupall === 'collapse');
    });
    $('dl_row3').addEventListener('change', e => { if (e.target.id === 'dl_groupby') { pref.set('dealgroupby3', e.target.value); dl.groupLimit.clear(); renderLeft(); } });
    $('dl_reasons').addEventListener('click', e => { const b = e.target.closest('[data-reason]'); if (b) { dl.reason = dl.reason === b.dataset.reason ? '' : b.dataset.reason; dl.limit = PAGE; renderLeft(); } });
    $('dl_export').addEventListener('click', e => {
      const b = e.target.closest('[data-export]'); if (b) { exportFiltered(b.dataset.export); b.closest('details').open = false; return; }
      const c = e.target.closest('[data-cols]'); if (c) { dl.cols = c.dataset.cols; pref.set('dealcols', dl.cols); c.closest('details').open = false; renderLeft(); }
    });
    $('dl_new').addEventListener('click', () => startNew());
    $('dl_reassign').addEventListener('click', openReassign);
    $('dl_moveTo').addEventListener('click', () => openBulkMove([...dl.selected]));
    $('dl_setDetails').addEventListener('click', () => openSetDetails([...dl.selected]));
    $('dl_setPillar').addEventListener('click', () => openBulkField('pillar'));
    $('dl_selExport').addEventListener('click', exportSelected);
    $('dl_selClear').addEventListener('click', () => { dl.selected.clear(); renderLeft(); });
    $('dl_body').addEventListener('click', e => {
      if (dl.view === 'performance') { if (e.target.closest('[data-clearfilters]')) clearFilters(); else KT.perf.click(e); return; }
      if (dl.view === 'samples') { if (e.target.closest('[data-clearfilters]')) clearFilters(); else KT.samples.tabClick(e); return; }
      if (e.target.closest('a')) return;
      if (e.target.id === 'dl_all') { const on = e.target.checked; dl.rows.forEach(d => (on ? dl.selected.add(d.deal_id) : dl.selected.delete(d.deal_id))); renderLeft(); return; }
      const cb = e.target.closest('input[data-sel]'); if (cb) { cb.checked ? dl.selected.add(cb.dataset.sel) : dl.selected.delete(cb.dataset.sel); bulkBar(); return; }
      if (e.target.closest('.ptick')) return;
      if (e.target.closest('td.cb')) return;
      const cm = e.target.closest('[data-cardmenu]'); if (cm) { openCardMenu(cm); return; }
      const pb = e.target.closest('[data-pic]'); if (pb) { openPicMenu(pb, 'pic'); return; }
      const lb = e.target.closest('[data-pillar]'); if (lb) { openPicMenu(lb, 'pillar'); return; }
      const g = e.target.closest('[data-group]'); if (g) { toggleGroup(g.dataset.group); return; }
      const s = e.target.closest('[data-sort]'); if (s) { const k = s.dataset.sort; dl.sort = { key: k, dir: dl.sort.key === k && dl.sort.dir === 'asc' ? 'desc' : 'asc' }; renderLeft(); return; }
      if (e.target.closest('[data-more]')) { dl.limit += PAGE; renderLeft(); return; }
      const gm = e.target.closest('[data-moregroup]'); if (gm) { const k = gm.dataset.moregroup; dl.groupLimit.set(k, (dl.groupLimit.get(k) || PAGE) + PAGE); renderLeft(); return; }
      if (e.target.closest('[data-clearfilters]')) { clearFilters(); return; }
      if (e.target.closest('[data-lanetoggle]')) { const lane = e.target.closest('.clane'); U.pref.set('cancellane_' + (userId() || ''), lane.classList.contains('shut') ? '1' : '0'); renderLeft(); return; }
      if (e.target.closest('[data-showall]')) { openStagePop(C.stage.cancelled); return; }
      const sp = e.target.closest('[data-stagepop]'); if (sp) { e.stopPropagation(); openStagePop(sp.dataset.stagepop); return; }
      const col = e.target.closest('[data-opencol]'); if (col) { const k = col.dataset.opencol; if (k === 'Cancel') dl.cancelOpen = !dl.cancelOpen; else dl.openCols.has(k) ? dl.openCols.delete(k) : dl.openCols.add(k); renderLeft(); return; }
      const row = e.target.closest('[data-id]'); if (row) select(row.dataset.id);
    });
    $('dl_body').addEventListener('change', e => { if (dl.view === 'performance') KT.perf.change(e); else if (dl.view === 'samples') KT.samples.tabChange(e); });
    $('dl_body').addEventListener('keydown', e => { if (dl.view === 'performance') { KT.perf.keydown(e); return; } if (e.key !== 'Enter' || e.target.closest('button,input,a')) return; const row = e.target.closest('[data-id]'); if (row) select(row.dataset.id); });
    const body = $('dl_body');
    body.addEventListener('dragstart', dragStart); body.addEventListener('dragend', dragEnd);
    body.addEventListener('dragover', dragOver); body.addEventListener('dragleave', dragLeave); body.addEventListener('drop', dropOn);
    sec.dataset.built = '1';
  }
  /* CR-07 §4.4 — every filter back to empty in one go (Campaign, View, Group by, state tab and sort stay) · remembered: All PICs */
  function clearFilters() {
    const c = R.clearFilters(dl.f); choosePic(c.pic); dl.reason = c.reason; dl.pf = R.blankPerfFilter(); dl.sf = { sstatus: '' };
    delete c.pic; delete c.reason; dl.f = c; $('dl_q').value = '';
    dl.limit = PAGE; renderLeft();
  }
  const saveGroups = () => { pref.set('dealgroups2', JSON.stringify([...dl.collapsed])); pref.set('dealgroupsopen', JSON.stringify([...dl.opened])); };
  function setCollapsed(gk, on) {
    if (startsCollapsed(gk)) { on ? dl.opened.delete(gk) : dl.opened.add(gk); } else { on ? dl.collapsed.add(gk) : dl.collapsed.delete(gk); }
  }
  function toggleGroup(gk) { setCollapsed(gk, !isCollapsed(gk)); saveGroups(); renderLeft(); }
  function setAllGroups(collapse) { dl.groupKeys.forEach(gk => setCollapsed(gk, collapse)); saveGroups(); renderLeft(); }
  function select(id) {
    if (editing()) { if (id !== dl.id) toast(C.common.blockWhileEditing); return; }
    Object.assign(dl, { mode: 'view', id, draft: null, posts: null });
    markSelected(); renderPanel();
  }
  function markSelected() {
    const open = dl.mode !== 'none' ? dl.id : null;
    document.querySelectorAll('#dl_body [data-id]').forEach(el => el.classList.toggle('selected', el.dataset.id === open));
  }

  /* ===================== left: toolbar state, table, pipeline ===================== */
  function renderLeft() {
    const s = state(), ctx = R.dealContext(s), td = today();
    /* CR-04 §4.4: what this person may not do is not shown */
    const edit = can('deal.edit');
    ['dl_new', 'dl_reassign', 'dl_setPillar', 'dl_moveTo', 'dl_setDetails'].forEach(id => $(id).classList.toggle('hidden', !edit));
    ensureCampaign(s, td);
    document.querySelectorAll('#dl_view [data-v]').forEach(b => { const on = b.dataset.v === dl.view; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll('#dl_export [data-cols]').forEach(b => b.classList.toggle('on', b.dataset.cols === dl.cols));
    renderScope(s, td);
    renderFilterPop(s);
    const perf = dl.view === 'performance', smp = dl.view === 'samples'; $('dl_q').placeholder = perf ? D.searchPerf : D.search;
    $('dl_more').classList.toggle('hidden', perf || smp); $('dl_row3').classList.toggle('hidden', perf || smp);
    if (perf || smp) { $('dl_reasons').classList.add('hidden'); dl.selected.clear(); dl.rows = []; if (perf) renderPerfView(s, ctx, td); else renderSamplesView(s, ctx, td); bulkBar(); return; }
    const cur = currentScope(s, td), scoped = R.filterDeals(s, cur.base, td, ctx).filter(d => !dl.f.sample || R.shipmentsOf(s, d.deal_id).some(x => R.sampleStatus(x, td) === dl.f.sample)), tabs = R.dealTabs(s, scoped, td, ctx);
    dl.scoped = scoped;   // the Stage popup (CR-09 §4.13) lists from the page's scope (Campaign · Phase · PIC · Filters), not the state tab
    /* the tabs count the same scope · the Pipeline has no tabs (its columns are the stages) · Payments has due-state tabs */
    const rows = dl.view === 'pipeline' ? scoped : scoped.filter(d => R.inDealTab(d, dl.tab, dl.reason, tabs.why));
    dl.rows = rows;
    renderRow3(s, scoped, tabs, td, cur.scope, ctx);
    if (dl.view === 'pipeline') renderPipeline(s, ctx, rows, td); else renderTable(s, ctx, rows, td);
    markSelected(); bulkBar();
  }
  function renderScope(s, td) {
    const f = dl.f, c = s.campaigns.find(x => x.campaign_id === f.campaign);
    $('dl_camp').innerHTML = U.campaignOptionsHTML(f.campaign, null);
    $('dl_camp').value = f.campaign;
    $('dl_campSt').innerHTML = c ? phaseChip(R.campaignEffectiveStatus(c, R.phasesOfCampaign(s, c.campaign_id), td)) : '';
    /* the Phases of this Campaign only — posts that need a Phase are in the Needs action tab (CR-06 §4.6) */
    const top = [['all', D.allPhases], ['ongoing', D.ongoingPhases]].map(([v, l]) => `<option value="${v}" data-special${f.phaseSel === v ? ' selected' : ''}>${esc(l)}</option>`).join('');
    const own = R.sortPhases(s.phases.filter(p => p.campaign_id === f.campaign)).map(p => U.phaseOptionHTML(p, f.phaseSel)).join('');
    const link = special(f.phaseSel) ? `<option value="${f.phaseSel}" data-special selected>${esc(f.phaseSel === R.NEEDS ? D.needsPhase : D.unscheduled)}</option>` : '';
    if (!special(f.phaseSel) && !['all', 'ongoing'].includes(f.phaseSel) && !(phaseById(f.phaseSel) && phaseById(f.phaseSel).campaign_id === f.campaign)) f.phaseSel = 'all';
    $('dl_phase').innerHTML = top + own + link;
    $('dl_phase').value = f.phaseSel;
    const me = myPic(), names = R.picNames(s, true), v = picSel();
    $('dl_pic').innerHTML = (me ? `<option value="me">${esc(D.picMe(me))}</option>` : '') + `<option value="all">${esc(D.allPics)}</option>` +
      names.filter(n => n !== me).concat(v !== 'all' && v !== 'me' && v !== '__none' && !names.includes(v) ? [v] : []).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
      `<option value="__none">${esc(D.unassigned)}</option>`;
    $('dl_pic').value = v;
  }
  /* CR-10 §4.1 — Performance: Campaign · Phase (the posts in it) · PIC from the scope bar · Search and its own Filters at post level */
  function renderPerfView(s, ctx, td) {
    const cur = currentScope(s, td), deals = R.filterDeals(s, { campaign: dl.f.campaign, pic: picFilter() }, td, ctx);
    KT.perf.render($('dl_body'), { s, td, ctx, deals, phaseIds: dl.f.phaseSel === 'all' ? null : cur.scope.phaseIds, f: Object.assign({ q: dl.f.q }, dl.pf),
      campaignId: dl.f.campaign, used: dl.used, setFilter: (k, v) => { dl.pf[k] = v; renderLeft(); }, openPost, rerender: () => renderLeft() });
  }
  /* CR-10 §4.14 — Samples: the shipments of the deals in scope (Campaign · Phase · PIC) · Search · Sample status */
  function renderSamplesView(s, ctx, td) {
    const cur = currentScope(s, td), deals = R.filterDeals(s, { campaign: dl.f.campaign, phases: cur.base.phases, pic: picFilter() }, td, ctx);
    KT.samples.render($('dl_body'), { s, td, ctx, deals, f: { q: dl.f.q, sstatus: dl.sf.sstatus }, campaignId: dl.f.campaign, used: dl.used,
      setFilter: (k, v) => { dl.sf[k] = v; renderLeft(); }, rerender: () => renderLeft(), openDeal: id => { select(id); const el = $('drawer_content') && $('drawer_content').querySelector('.smsec'); if (el) el.scrollIntoView({ block: 'start' }); } });
  }
  /* open the deal at its Posts section with the post lit up (CR-10 §4.2) */
  function openPost(dealId, postId) {
    select(dealId);
    if (dl.mode !== 'view' || dl.id !== dealId) return;
    const el = $('drawer_content').querySelector(`[data-post="${CSS.escape(postId)}"]`);
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('pf-hit'); setTimeout(() => el.classList.remove('pf-hit'), 2400); }
  }
  const phaseChipText = (s, f) => { const ph = s.phases.find(p => p.phase_id === f.phaseSel); return `${D.phase}: ${ph ? R.phaseName(s, ph.phase_id) : f.phaseSel === 'ongoing' ? D.ongoingPhases : f.phaseSel === R.NEEDS ? D.needsPhase : D.unscheduled}`; };
  function perfFilterPop(s) {
    const P = C.perfTab, f = dl.pf, sel = (k, label, items) => `<div class="field"><label>${esc(label)}</label><select data-pf="${k}">${optionsHTML(items, f[k], D.any)}</select></div>`;
    $('dl_fpop').innerHTML = sel('platform', P.filters.platform, R.PERF_PLATFORMS.map(v => ({ value: v, label: v }))) +
      sel('tier', P.filters.tier, R.tierOrder(s.lookups.tier_rules).map(v => ({ value: v, label: v }))) +
      sel('mstatus', P.filters.mstatus, R.METRICS_STATUSES.map(v => ({ value: v, label: P.status[v] }))) +
      sel('link', P.filters.link, [{ value: 'has', label: P.filters.has }, { value: 'none', label: P.filters.none }]) +
      `<button type="button" class="btn small" data-clearall>${esc(D.clearAll)}</button>`;
    const chips = picSel() !== 'all' ? [['pic', `${D.pic}: ${picLabel(picSel())}`]] : [];
    R.PERF_FILTER_KEYS.forEach(k => { if (f[k]) chips.push(['pf:' + k, `${P.filters[k]}: ${k === 'mstatus' ? P.status[f[k]] : k === 'link' ? P.filters[f[k]] : f[k]}`]); });
    const n = R.PERF_FILTER_KEYS.filter(k => f[k]).length, q = R.trim(dl.f.q), ph = dl.f.phaseSel !== 'all';
    $('dl_fbadge').textContent = `· ${n}`; $('dl_fbadge').classList.toggle('hidden', !n);
    dl.used = [].concat(ph ? [phaseChipText(s, dl.f)] : [], q ? [C.common.searchChip(q)] : [], chips.map(c => c[1]));
    U.filterChips($('dl_chips'), chips, (ph ? 1 : 0) + (q ? 1 : 0) + chips.length);
  }
  function samplesFilterPop(s) {
    const SM = C.samples, v = dl.sf.sstatus, opts = R.SAMPLE_STATUSES.map(k => ({ value: k, label: SM.status[k] })).concat([{ value: 'noShipBy', label: SM.queue.noShipBy }, { value: 'toShip', label: SM.toShipCard }]);
    $('dl_fpop').innerHTML = `<div class="field"><label>${esc(SM.filter)}</label><select data-sf="sstatus">${optionsHTML(opts, v, D.any)}</select></div><button type="button" class="btn small" data-clearall>${esc(D.clearAll)}</button>`;
    const chips = picSel() !== 'all' ? [['pic', `${D.pic}: ${picLabel(picSel())}`]] : [];
    if (v) chips.push(['sstatus', `${SM.filter}: ${(opts.find(o => o.value === v) || {}).label || v}`]);
    const q = R.trim(dl.f.q), ph = dl.f.phaseSel !== 'all';
    $('dl_fbadge').textContent = `· ${v ? 1 : 0}`; $('dl_fbadge').classList.toggle('hidden', !v);
    dl.used = [].concat(ph ? [phaseChipText(s, dl.f)] : [], q ? [C.common.searchChip(q)] : [], chips.map(c => c[1]));
    U.filterChips($('dl_chips'), chips, (ph ? 1 : 0) + (q ? 1 : 0) + chips.length);
  }
  function renderFilterPop(s) {
    if (dl.view === 'performance') { perfFilterPop(s); return; }
    if (dl.view === 'samples') { samplesFilterPop(s); return; }
    const f = dl.f, L = s.lookups, order = R.tierOrder(L.tier_rules), on = t => !f.tiers || f.tiers.includes(t);
    const sel = (k, label, items) => `<div class="field"><label>${esc(label)}</label><select data-ff="${k}">${optionsHTML(items, f[k], D.any)}</select></div>`;
    $('dl_fpop').innerHTML = `<div class="field"><label>${esc(D.tier)}</label><div class="ticks"><label class="tick"><input type="checkbox" data-tierv=""${f.tiers ? '' : ' checked'}> ${esc(D.allTiers)}</label>` +
        order.map(t => `<label class="tick"><input type="checkbox" data-tierv="${esc(t)}"${on(t) ? ' checked' : ''}> ${esc(t)}</label>`).join('') + `</div></div>` +
      sel('pillar', D.pillar, (L.pillar_list || []).map(v => ({ value: v, label: v })).concat([{ value: '__none', label: D.pillarNotSet }])) +
      sel('cta', F.cta, (L.cta_list || []).map(v => ({ value: v, label: v })).concat([{ value: '__none', label: D.ctaNotSet }])) +
      sel('term', D.term, R.PAYMENT_TERMS.concat(['none']).map(v => ({ value: v, label: C.term[v] }))) +
      sel('sub', D.subStatus, R.stepsOf(L).map(st => ({ value: st.sub_status, label: st.sub_status }))) +
      sel('sample', C.samples.filter, R.SAMPLE_STATUSES.map(k => ({ value: k, label: C.samples.status[k] }))) +
      `<button type="button" class="btn small" data-clearall>${esc(D.clearAll)}</button>`;
    const chips = [];
    if (picSel() !== 'all') chips.push(['pic', `${D.pic}: ${picLabel(picSel())}`]);
    if (f.tiers) chips.push(['tiers', `${D.tier}: ${f.tiers.join(', ')}`]);
    if (f.sub) chips.push(['sub', `${D.subStatus}: ${f.sub}`]);
    if (f.pillar) chips.push(['pillar', `${D.pillar}: ${f.pillar === '__none' ? D.pillarNotSet : f.pillar}`]);
    if (f.cta) chips.push(['cta', `${F.cta}: ${f.cta === '__none' ? D.ctaNotSet : f.cta}`]);
    if (f.term) chips.push(['term', `${D.term}: ${C.term[f.term]}`]);
    if (f.sample) chips.push(['sample', `${C.samples.filter}: ${C.samples.status[f.sample]}`]);
    if (f.payState) chips.push(['payState', `${D.payState}: ${C.payState[f.payState]}`]);
    if (f.open) chips.push(['open', D.chipOpen]);
    if (f.noDate) chips.push(['noDate', D.chipNoDate]);
    if (f.outside) chips.push(['outside', D.chipOutside(R.dmy(f.outside.from), R.dmy(f.outside.to))]);
    const n = POP_KEYS.filter(k => f[k]).length + (f.tiers ? 1 : 0);
    $('dl_fbadge').textContent = `· ${n}`; $('dl_fbadge').classList.toggle('hidden', !n);
    /* what the empty list names: Phase and Search sit in the toolbar, the Needs action reason in its own row */
    const active = R.activeFilters(filtersNow()), ph = s.phases.find(p => p.phase_id === f.phaseSel);
    dl.used = [].concat(active.includes('phaseSel') ? [`${D.phase}: ${ph ? R.phaseName(s, ph.phase_id) : f.phaseSel === 'ongoing' ? D.ongoingPhases : f.phaseSel === R.NEEDS ? D.needsPhase : D.unscheduled}`] : [],
      active.includes('q') ? [C.common.searchChip(R.trim(f.q))] : [], chips.map(c => c[1]), active.includes('reason') ? [D.reasons[dl.reason]] : []);
    U.filterChips($('dl_chips'), chips, active.length);
  }
  /* Row 3: Group by → state tabs → one line of money for the whole scope (CR-05 §4.5 words) · Needs action: a chip per reason */
  function renderRow3(s, scoped, tabs, td, scope, ctx) {
    const t = R.dealTiles(s, scoped, scope, td, ctx.phaseIdx), m = R.moneyOf(t.budget, t.committed, t.shortlist, t.paid), MN = C.money;
    const sum = `<span class="dl-sum">${esc(MN.committed.h)} ${U.info(MN.committed)} <b class="${m.remaining < 0 ? 'over' : ''}">${R.baht(m.committed)}</b>${m.budget == null ? '' : `<span class="muted"> / ${R.baht(m.budget)}</span>`}` +
      `<span class="sep">·</span>${esc(MN.pending.h)} ${U.info(MN.pending)} <b>${R.baht(m.pending)}</b><span class="sep">·</span>${esc(D.paidShort)} <b>${R.baht(m.paid)}</b></span>`;
    if (dl.view === 'pipeline') { $('dl_row3').innerHTML = `<span class="spacer"></span>${sum}`; $('dl_reasons').classList.add('hidden'); return; }
    const by = groupBy();
    $('dl_row3').innerHTML = `<label class="tlab">${esc(D.groupBy)} <select id="dl_groupby">${GROUP_BYS.map(v => `<option value="${v}"${v === by ? ' selected' : ''}>${esc(D.groupByOpt[v])}</option>`).join('')}</select></label><span id="dl_gall"></span>` +
      `<div class="stabs dl-tabs" role="tablist">${R.DEAL_TABS.map(k => `<button type="button" role="tab" data-tab="${k}" class="${dl.tab === k ? 'on' : ''}" aria-selected="${dl.tab === k}">${esc(D.tabs[k])}<span class="n">${R.fmtNum(tabs.counts[k])}</span></button>`).join('')}</div>` + sum;
    const rs = R.NEEDS_REASONS.filter(k => tabs.reasons[k] || dl.reason === k);
    $('dl_reasons').innerHTML = rs.map(k => `<button type="button" class="tgl${dl.reason === k ? ' on' : ''}" data-reason="${k}" aria-pressed="${dl.reason === k}">${esc(D.reasons[k])} <b>${R.fmtNum(tabs.reasons[k])}</b></button>`).join('');
    $('dl_reasons').classList.toggle('hidden', dl.tab !== 'needs' || !rs.length);
  }
  function bulkBar() {
    const n = dl.selected.size;
    $('dl_bulk').classList.toggle('hidden', !n); $('dl_tools').classList.toggle('hidden', !!n);
    $('dl_selN').textContent = D.selected(n);
    const all = $('dl_all'); if (all) all.checked = dl.rows.length > 0 && dl.rows.every(d => dl.selected.has(d.deal_id));
  }

  /* ---------- table ---------- */
  const PLAT = KT.icons.PLATFORMS;
  const platKey = (ctx, p) => { const pl = R.postPlatform(ctx, p); return PLAT.includes(pl) ? pl : 'Other'; };
  /* one icon per platform: posted = every post on it is done · tooltip lists each post */
  function platIcon(k, list) {
    const done = list.every(R.postDone);
    const tip = list.map(p => R.postDone(p) ? D.tipPosted(k, R.dmy(p.post_date)) : D.tipPlanned(k, R.dmy(p.expected_post_date))).join('\n');
    return pfIcon(k, done ? 'posted' : 'planned', tip);
  }
  function platformsHTML(ctx, d) {
    const ps = R.postsOfCtx(ctx, d.deal_id); if (!ps.length) return '';
    const by = new Map();
    ps.forEach(p => { const k = platKey(ctx, p); if (!by.has(k)) by.set(k, []); by.get(k).push(p); });
    const icons = PLAT.filter(k => by.has(k)).map(k => platIcon(k, by.get(k)));
    return `<span class="pfs">${icons[0]}${icons.length > 1 ? `<span class="pf-rest">${icons.slice(1).join('')}</span><span class="pf-n">+${icons.length - 1}</span>` : ''}</span>`;
  }
  /* CR-07 §4.5: no cost typed in yet (and not a Free job) → "Cost not set" (it counts ฿0) */
  const totalHTML = d => (R.costNotSet(d) ? `<span class="muted small">${esc(C.priceRef.costNotSet)}</span>` : R.baht(R.totalCost(d)));
  const dmShort = (iso, td) => (iso && iso.slice(0, 4) !== td.slice(0, 4) ? R.dmy(iso) : dm(iso));
  function dueHTML(s, d, td, short) {
    const due = R.dueDate(s, d); if (!due) return '';
    if (!R.isOverdue(s, d, td)) return esc(short ? dmShort(due, td) : R.dmy(due));
    return `<span class="late" title="${esc(R.dmy(due))}">${esc(dmShort(due, td))} · ${esc(D.late(R.dayDiff(td, due)))}</span>`;
  }
  /* KOL name only (deal ID stays searchable and shows in the drawer) · imported = small grey dot */
  const keyLabel = k => R.phaseLabel(state(), k, true);
  /* CR-03 §4.5: a deal with posts in more than one Phase sits in its primary Phase with "+n phase" (tooltip: where the money went) */
  function morePhases(d, idx) {
    const info = idx && idx.deal.get(d.deal_id); if (!info) return '';
    const others = [...info.keys].filter(k => k !== info.primary); if (!others.length) return '';
    const amt = k => (info.share.get(k) || 0) + (info.slShare.get(k) || 0);
    const tip = [info.primary].concat(others).map(k => `${keyLabel(k)} ${R.baht(amt(k))}`).join('\n');
    return `<span class="chip-ph" title="${esc(tip)}">${esc(D.plusPhase(others.length))}</span>`;
  }
  function tierChip(ctx, d) {
    const t = ctx.tiers.get(d.deal_id) || { tier: R.UNKNOWN_TIER };
    const tip = t.account ? D.tierTip(t.account.handle, R.fmtNum(t.followers)) : D.tierUnknownTip;
    return `<span class="tchip" title="${esc(tip)}">${esc(t.tier)}</span>`;
  }
  const kolCell = (k, d, ctx) => `<div class="kolname"><b title="${esc(k.display_name || '')}">${esc(k.display_name || d.kol_id)}</b>${tierChip(ctx, d)}${d.is_legacy ? `<span class="legacy-dot" title="${esc(D.legacyTip)}"></span>` : ''}${morePhases(d, ctx.phaseIdx)}</div>`;
  /* CR-02 §4.7 — PIC changes inline (the documented exception to view-before-edit) */
  const picCell = d => (!can('deal.edit') ? (d.pic ? `<span class="picplain"><span class="av sm">${esc(initials(d.pic))}</span><span class="nm">${esc(d.pic)}</span></span>` : '')
    : d.pic ? `<button type="button" class="picbtn" data-pic="${esc(d.deal_id)}" title="${esc(D.changePic)}"><span class="av sm">${esc(initials(d.pic))}</span><span class="nm">${esc(d.pic)}</span></button>`
    : `<button type="button" class="btn ghost small picbtn" data-pic="${esc(d.deal_id)}">${esc(D.assign)}</button>`);
  /* a group = deals whose primary Phase is this one · header money = what the listed deals put in this Phase (by post) */
  /* a Stage group gets its status colour (CR-09 §4.10): a 4px bar on the left + the group's background */
  const GROUP_CLS = { List: 'g-list', Inprocess: 'g-prog', Complete: 'g-done', Cancel: 'g-cancel' };
  const groupHead = (gk, span, cls) => { const open = !isCollapsed(gk);
    return `<tr class="ghead${cls ? ' ' + cls : ''}"><td colspan="${span}"><button type="button" class="gh" data-group="${esc(gk)}" aria-expanded="${open}" title="${esc(D.groupToggle)}"><span class="chev${open ? ' open' : ''}">${ICON.chevron}</span>`; };
  /* Stage / KOL Tier group headers: the numbers of the listed deals (CR-04 §4.3) */
  function statsGroupRow(s, by, key, groupRows, td, span, ctx) {
    const x = R.groupStats(s, groupRows, td, ctx), sl = x.shortlist ? `<span class="muted">${esc(D.plusShortlist(R.baht(x.shortlist)))}</span>` : '';
    const name = by === 'pic' ? (key ? `<span class="av sm">${esc(initials(key))}</span> ${esc(key)}` : esc(D.unassigned)) : esc(key);
    const head = groupHead(by + ':' + key, span) + `<b class="gname">${name}</b>`, deals = `<span class="muted">${esc(D.groupDeals(groupRows.length))}</span>`;
    /* CR-06 §4.6 Group by PIC: deals · Committed (+ Pending) · overdue */
    if (by === 'pic') return head + deals + `<span class="gmoney">${R.baht(x.committed)}</span>${sl}` + (x.overdue ? `<span class="late">${esc(D.groupOverdue(x.overdue))}</span>` : '') + `</button></td></tr>`;
    if (by === 'stage') {
      /* CR-09 §4.9: the stage's name · status · n deals · its money (the same as its Pipeline column) · overdue */
      const st = (R.stageOrder(s.lookups).find(g => g.key === key) || {}).status, m = R.stageMoney(s, groupRows);
      const money = m.kind === 'pending' ? `<span class="muted">${esc(D.plusShortlist(R.baht(m.amount)))}</span>` : m.kind === 'cancelled' ? `<span class="gmoney muted">${R.baht(m.amount)}</span>` : `<span class="gmoney">${R.baht(m.amount)}</span>`;
      return groupHead(by + ':' + key, span, GROUP_CLS[st]) + `<b class="gname">${esc(key)}</b>` + (st ? U.stChip(st) : '') + deals + money +
        (x.overdue ? `<span class="late">${esc(D.groupOverdue(x.overdue))}</span>` : '') + `</button>${stagePopBtn(key)}</td></tr>`;
    }
    const rg = R.tierRange(s.lookups.tier_rules, key), range2 = !rg ? D.noFollowers : rg.max == null ? D.followersFrom(U.shortNum(rg.min)) : D.followersRange(U.shortNum(rg.min), U.shortNum(rg.max));
    return head + `<span class="muted">${esc(range2)}</span>` + deals + `<span class="gmoney">${R.baht(x.committed)}</span>${sl}` +
      (x.avg != null ? `<span class="muted">${esc(D.avgDeal(R.baht(Math.round(x.avg))))}</span>` : '') +
      (x.views ? `<span class="muted">${esc(D.groupViews(U.shortNum(x.views)))}</span><span class="muted">${esc(D.groupCpv(x.cpv < 1 ? x.cpv.toFixed(3) : x.cpv.toFixed(2)))}</span>` : '') + `</button></td></tr>`;
  }
  function groupRow(s, key, groupRows, allRows, td, span, idx) {
    const p = phaseById(key), head = groupHead('phase:' + key, span);
    const t = R.dealTiles(s, allRows, { phaseIds: [key] }, td, idx), sl = t.shortlist ? `<span class="muted">${esc(D.plusShortlist(R.baht(t.shortlist)))}</span>` : '';
    if (!p) return head + `<b class="gname">${esc(keyLabel(key))}</b><span class="muted">${esc(D.groupDeals(groupRows.length))}</span><span class="gmoney">${R.baht(t.committed)}</span>${sl}</button></td></tr>`;
    const c = s.campaigns.find(x => x.campaign_id === p.campaign_id) || {};
    const bar = t.budget ? `<span class="minibar"><span class="${t.committed > t.budget ? 'over' : ''}" style="width:${Math.min(100, t.committed / t.budget * 100)}%"></span></span>` : '';
    return head + `<b class="gname">${esc(c.campaign_name || p.campaign_id)} › ${esc(R.phaseName(s, p.phase_id))}</b>${phaseChip(R.phaseStatus(p, td))}` +
      `<span class="muted">${esc(dm(p.start_date))}–${esc(dm(p.end_date))}</span><span class="muted">${esc(D.groupDeals(groupRows.length))}</span>` +
      `<span class="gmoney">${esc(D.budgetOf(R.baht(t.committed), t.budget == null ? D.noBudget : R.baht(t.budget)))}${bar}</span>${sl}</button></td></tr>`;
  }
  function renderTable(s, ctx, rows, td) {
    const dueOf = new Map(rows.map(d => [d.deal_id, R.dueDate(s, d)]));
    const key = { kol: d => (ctx.kols.get(d.kol_id) || {}).display_name || '', total: d => R.totalCost(d), due: d => dueOf.get(d.deal_id) }[dl.sort.key] || (d => dueOf.get(d.deal_id));
    const sorted = sortBy(rows, key, dl.sort.dir, (a, b) => a.deal_id.localeCompare(b.deal_id));
    const logsBy = new Map(); s.deal_status_log.forEach(l => { if (!logsBy.has(l.deal_id)) logsBy.set(l.deal_id, []); logsBy.get(l.deal_id).push(l); });
    logsBy.forEach(v => v.sort((a, b) => a.log_id - b.log_id));
    const th = (label, k, cls) => k ? `<th class="sort${cls ? ' ' + cls : ''}" data-sort="${k}">${esc(label)}${dl.sort.key === k ? `<span class="arr">${dl.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>` : `<th${cls ? ` class="${cls}"` : ''}>${label}</th>`;
    const warnCell = d => { const w = R.rowWarnings(s, d, td, ctx); return w.length ? `<span class="wcount" title="${esc(w.map(x => x.msg).join('\n'))}">${w.length}</span>` : ''; };
    /* CR-09 TC-54: no row ticks for Viewer / Accounting (nothing to do in bulk) — Export stays in ⋯ */
    const pick = can('deal.edit'); if (!pick && dl.selected.size) { dl.selected.clear(); bulkBar(); }
    const allSel = rows.length > 0 && rows.every(d => dl.selected.has(d.deal_id));
    const cbHead = !pick ? '' : `<th class="cb"><input type="checkbox" id="dl_all"${allSel ? ' checked' : ''} aria-label="${esc(D.selectAll)}" title="${esc(D.selectAll)}"></th>`;
    const cbCell = (d, k) => !pick ? '' : `<td class="cb"><input type="checkbox" data-sel="${esc(d.deal_id)}"${dl.selected.has(d.deal_id) ? ' checked' : ''} aria-label="${esc(D.selectRow(k.display_name || d.deal_id))}"></td>`;
    let head, rowHTML, span;
    /* the PIC column goes away while one person is picked (Me, a name or Unassigned) */
    const showPic = picSel() === 'all';
    if (dl.cols === 'compact') {
      head = cbHead + th(D.colKol, 'kol', 'sticky2') + th(D.colStage) + th(D.colPlatforms) + (showPic ? th(D.colPic) : '') + th(D.colTotal, 'total', 'num') +
        th(D.colPayment) + th(D.colNextDue, 'due') + th(`<span title="${esc(D.warnTip)}">⚠</span>`, null, 'num');
      span = (showPic ? 9 : 8) - (pick ? 0 : 1);
      rowHTML = d => { const k = ctx.kols.get(d.kol_id) || {};
        return `<tr class="click" tabindex="0" data-id="${esc(d.deal_id)}">${cbCell(d, k)}<td class="sticky2" style="max-width:260px">${kolCell(k, d, ctx)}</td>` +
          `<td>${stageCell(d, logsBy.get(d.deal_id))}</td><td>${platformsHTML(ctx, d)}</td>${showPic ? `<td>${picCell(d)}</td>` : ''}<td class="num">${totalHTML(d)}</td>` +
          `<td>${payCell(d, td)}</td><td>${dueHTML(s, d, td, true)}</td><td class="num">${warnCell(d)}</td></tr>`; };
    } else {
      const H = R.TEMPLATE_HEADERS;
      head = cbHead + th(D.colKol, 'kol', 'sticky2') + th(`<span title="${esc(D.warnTip)}">⚠</span>`, null, 'num') +
        H.map((h, i) => (i === 20 ? th(h, 'total', 'num') : th(esc(h), null, [13, 14, 15, 17, 18, 19].includes(i) ? 'num' : '')) + (i === 6 ? th(esc(D.colTier)) : '')).join('');
      span = 4 + H.length - (pick ? 0 : 1);
      const slash = v => (v ? '/' : '');
      rowHTML = d => {
        const k = ctx.kols.get(d.kol_id) || {}, sum = R.dealPostSummary(ctx, d.deal_id);
        const mark = pl => { const list = sum.posts.filter(p => platKey(ctx, p) === pl); return list.length ? platIcon(pl, list) : ''; };
        const pillarCell = !can('deal.edit') ? esc(d.pillar || '') : d.pillar ? `<button type="button" class="picbtn" data-pillar="${esc(d.deal_id)}" title="${esc(D.changePillar)}"><span class="nm">${esc(d.pillar)}</span></button>`
          : `<button type="button" class="btn ghost small picbtn" data-pillar="${esc(d.deal_id)}">${esc(D.setPillarBtn)}</button>`;
        const cells = [pillarCell, esc(C.status[d.status] || d.status), `<span title="${esc(stepTitle(d.sub_status))}">${esc(d.sub_status)}</span>`, slash(d.docs_done), slash(d.paid_50), slash(d.paid_full),
          esc(k.display_name || ''), mark('TikTok'), mark('Instagram'), mark('Facebook'), mark('X'), mark('Lemon8'), esc(d.pic || ''),
          money(d.rate_card), money(d.gencode_expense), money(d.gencode_period), R.dmy(d.gencode_start_date), money(d.basket_fee), money(d.asset_fee), money(d.expediting_fee),
          `<b>${R.fmtNum(R.totalCost(d))}</b>`, d.delivered ? `/ ${R.dmy(d.delivery_date)}` : '', R.dealTrCodes(s, d.deal_id).map(esc).join('<br>'), R.dmy(d.brief_date),
          R.dmy(d.expected_draft1_date), R.dmy(d.approved_draft1_date), R.dmy(d.expected_draft2_date), R.dmy(d.approved_draft2_date), R.dmy(d.expected_draft3_date), R.dmy(d.approved_draft3_date),
          R.dmy(d.expected_post_date), range(sum.first, sum.last), d.link_brief ? `<a href="${esc(d.link_brief)}" target="_blank" rel="noopener">↗</a>` : '',
          sum.links ? esc(D.links(sum.links)) : '', esc(sum.posts.map(p => p.gencode_code).filter(Boolean).join(', ')), esc(d.cta || '')];
        const tier = ctx.tiers.get(d.deal_id) || {};
        return `<tr class="click" tabindex="0" data-id="${esc(d.deal_id)}">${cbCell(d, k)}<td class="sticky2" style="max-width:240px">${kolCell(k, d, ctx)}</td><td class="num">${warnCell(d)}</td>` +
          cells.map((c, i) => `<td class="${[3, 4, 5, 7, 8, 9, 10, 11].includes(i) ? 'c' : [13, 14, 15, 17, 18, 19, 20].includes(i) ? 'num' : ''}">${c}</td>` +
            (i === 6 ? `<td title="${esc(tier.account ? D.tierTip(tier.account.handle, R.fmtNum(tier.followers)) : D.tierUnknownTip)}">${esc(tier.tier || R.UNKNOWN_TIER)}</td>` : '')).join('') + `</tr>`;
      };
    }
    /* CR-04 §4.3 — Group by Phase (CR-03 primary phase) · Stage · KOL Tier · None; every group header shows, each group has its own Load more */
    const parts = [], by = groupBy();
    let rest = 0;
    dl.groupKeys = [];
    const pushGroup = (gk, head, list) => {
      dl.groupKeys.push(gk); parts.push(head);
      if (isCollapsed(gk)) return;
      const lim = dl.groupLimit.get(gk) || PAGE;
      list.slice(0, lim).forEach(d => parts.push(rowHTML(d)));
      if (list.length > lim) parts.push(`<tr class="gmore"><td colspan="${span}"><button type="button" class="btn small" data-moregroup="${esc(gk)}">${esc(D.loadMore(list.length - lim))}</button></td></tr>`);
    };
    if (by === 'phase' && !grouped()) {
      /* one Phase (or Needs phase / Unscheduled): a single header with that Phase's money (CR-03 TC-12) */
      const key = dl.f.phaseSel, gk = 'phase:' + key;
      if (phaseById(key) || special(key)) { dl.groupKeys.push(gk); parts.push(groupRow(s, key, sorted, rows, td, span, ctx.phaseIdx)); }
      if (!(phaseById(key) || special(key)) || !isCollapsed(gk)) {
        sorted.slice(0, dl.limit).forEach(d => parts.push(rowHTML(d)));
        rest = Math.max(0, sorted.length - dl.limit);
      }
    } else if (by === 'none') {
      sorted.slice(0, dl.limit).forEach(d => parts.push(rowHTML(d)));
      rest = Math.max(0, sorted.length - dl.limit);
    } else {
      R.groupDeals(s, sorted, by, ctx, td).forEach(g => pushGroup(by + ':' + g.key,
        by === 'phase' ? groupRow(s, g.key, g.rows, rows, td, span, ctx.phaseIdx) : statsGroupRow(s, by, g.key, g.rows, td, span, ctx), g.rows));
    }
    /* one icon for every group: ⊟ folds them all while one is open, ⊞ opens them all */
    const anyOpen = dl.groupKeys.some(gk => !isCollapsed(gk));
    if ($('dl_gall')) $('dl_gall').innerHTML = dl.groupKeys.length > 1 ? `<button type="button" class="icon-btn gall" data-groupall="${anyOpen ? 'collapse' : 'expand'}" title="${esc(anyOpen ? D.collapseAll : D.expandAll)}" aria-label="${esc(anyOpen ? D.collapseAll : D.expandAll)}">${anyOpen ? '⊟' : '⊞'}</button>` : '';
    if (!rows.length) { $('dl_body').innerHTML = U.noMatchHTML(D.noMatch, dl.used || []); return; }
    $('dl_body').innerHTML = `<div class="tablewrap" style="max-height:calc(100vh - 300px)"><table class="tbl dl${pick ? '' : ' nocb'}"><thead><tr>${head}</tr></thead><tbody>${parts.join('')}</tbody></table></div>` +
      (rest ? `<div class="loadmore"><button type="button" class="btn" data-more>${esc(D.loadMore(rest))}</button></div>` : '');
  }

  /* ---------- PIC (CR-02 §4.7) and Pillar (CR-03 §4.6): inline menu, bulk change, Undo ---------- */
  const FIELDS = {
    pic: { values: () => picList(), changed: D.picChanged, undone: D.picUndone, item: v => `<span class="av sm">${esc(initials(v))}</span> ${esc(v)}` },
    pillar: { values: () => activeList('pillar_list', null), changed: D.pillarChanged, undone: D.pillarUndone, item: v => esc(v) },
  };
  const closePicMenu = () => { const m = $('dl_picmenu'); if (m) m.remove(); };
  document.addEventListener('click', e => { const m = $('dl_picmenu'); if (m && !m.contains(e.target) && !e.target.closest('[data-pic],[data-pillar],[data-cardmenu]')) m.remove(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePicMenu(); });
  document.addEventListener('scroll', e => { const m = $('dl_picmenu'); if (m && !m.contains(e.target)) m.remove(); }, true);
  function openPicMenu(btn, field = 'pic') {
    const id = btn.dataset[field], d = dealById(id), F2 = FIELDS[field]; if (!d || !guard('deal.edit')) return;
    const m0 = $('dl_picmenu'); if (m0 && m0.dataset.for === field + id) { closePicMenu(); return; }
    if (editing() && dl.id === id) { toast(C.common.blockWhileEditing); return; }
    closePicMenu();
    const m = document.createElement('div');
    m.className = 'menu-list floating'; m.id = 'dl_picmenu'; m.dataset.for = field + id; m.setAttribute('role', 'menu');
    m.innerHTML = F2.values().map(v => `<button type="button" class="mi${v === d[field] ? ' on' : ''}" data-setval="${esc(v)}" role="menuitem">${F2.item(v)}</button>`).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    m.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    m.addEventListener('click', e => { const b = e.target.closest('[data-setval]'); if (b) { closePicMenu(); setField([id], field, b.dataset.setval); } });
    const first = m.querySelector('.mi.on') || m.querySelector('.mi'); if (first) first.focus();
  }
  function applyDeals(deals, events) {
    const s = state(), at = new Map(s.deals.map((d, i) => [d.deal_id, i]));
    deals.forEach(d => { s.deals[at.get(d.deal_id)] = d; });
    events.forEach(e => s.deal_events.push(e));
    commit();
    /* the change may come from Dashboard › Operations (CR-05 §4.6): that page draws itself again */
    if (U.currentTab() === 'deals') renderLeft(); else U.refresh();
    if (dl.mode === 'view' && deals.some(d => d.deal_id === dl.id)) renderPanel();
  }
  /* every change is a deal_events row; Undo (5 s) writes the reverse change, marked 'undo' */
  function setField(idsIn, field, value) {
    if (!guard('deal.edit')) return;
    const ids = idsIn.filter(id => { const d = dealById(id); return d && !R.campaignCancelled(state(), d.campaign_id); });
    if (ids.length < idsIn.length) toast(C.msg.campaignCancelledEdit);
    if (!ids.length) return;
    if (editing() && ids.includes(dl.id)) { toast(C.common.blockWhileEditing); return; }
    const deals = ids.map(dealById).filter(Boolean), before = new Map(deals.map(d => [d.deal_id, d[field] || null]));
    const r = R.fieldChanges(deals, field, value, { eventId: store.newEventId(), now: new Date(), user: userId() });
    if (!r.deals.length) return;
    applyDeals(r.deals, r.events);
    toastAction(FIELDS[field].changed(value, r.deals.length), D.undo, () => {
      if (editing() && before.has(dl.id)) { toast(C.common.blockWhileEditing); return; }
      const back = R.fieldChanges(r.deals.map(d => dealById(d.deal_id)).filter(Boolean), field, d => before.get(d.deal_id), { eventId: store.newEventId(), now: new Date(), user: userId(), note: 'undo' });
      applyDeals(back.deals, back.events); toast(FIELDS[field].undone);
    });
  }
  const setPic = (ids, pic) => setField(ids, 'pic', pic);
  /* bulk: pick a value, see "Change PIC of n deals to Amp?" / "Set pillar of n deals to Consideration?", confirm */
  function openBulkField(field, idsIn) {
    const ids = (idsIn || [...dl.selected]).filter(id => dealById(id)), n = ids.length; if (!n || !guard('deal.edit')) return;
    const T2 = field === 'pic' ? { title: D.reassignTitle(n), label: D.pic, choose: D.choosePic, ask: v => D.reassignAsk(n, v), ok: D.reassignOk }
      : { title: D.setPillarTitle(n), label: D.pillar, choose: D.choosePillar, ask: v => D.setPillarAsk(n, v), ok: D.setPillar };
    let value = '';
    openDialog(`<div class="dlg-h">${esc(T2.title)}</div><div class="dlg-b">
        <div class="field"><label for="ra_val">${esc(T2.label)}</label><select id="ra_val">${optionsHTML(FIELDS[field].values(), '', T2.choose)}</select></div>
        <p id="ra_ask" style="margin:12px 0 0"></p></div>
      <div class="dlg-f"><button type="button" class="btn" id="ra_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="ra_ok" disabled>${esc(T2.ok)}</button></div>`);
    $('ra_val').addEventListener('change', e => { value = e.target.value; $('ra_ask').textContent = value ? T2.ask(value) : ''; $('ra_ok').disabled = !value; });
    $('ra_cancel').addEventListener('click', closeDialog);
    $('ra_ok').addEventListener('click', () => { if (!value) return; closeDialog(); dl.selected.clear(); setField(ids, field, value); });
  }
  const openReassign = () => openBulkField('pic');
  function exportSelected() {
    const s = state(), deals = s.deals.filter(d => dl.selected.has(d.deal_id));
    downloadCSV('deals_selected.csv', R.DEALS_COLS, R.dealsRows(s, deals, today(), R.dealContext(s)));
  }

  /* ---------- pipeline ---------- */
  /* CR-09 §4.10–4.11 — Row 1: the stages in their status groups (List · In process · Complete), every stage always (an optional one that is
     empty folds to 40px) · Row 2: the Cancelled lane across the board · compact cards (52px) */
  const stagePopBtn = key => `<button type="button" class="icon-btn gpop" data-stagepop="${esc(key)}" title="${esc(D.openStage(key))}" aria-label="${esc(D.openStage(key))}">⤢</button>`;
  function renderPipeline(s, ctx, rows, td) {
    const L = s.lookups, steps = R.stepsOf(L).filter(st => st.active !== false || rows.some(d => d.sub_status === st.sub_status));
    const listFirst = steps.find(st => st.status === 'List'), cancelStep = R.stepsOf(L).find(R.isCancelStep);
    const optional = st => R.isScriptStep(st) || R.draftNo(st) > 1 || (st === listFirst && st.is_optional);
    const dealsOf = st => rows.filter(d => R.stageKey(L, d) === R.stageName(st));
    const movable = d => can('deal.edit') && !R.campaignCancelled(s, d.campaign_id);
    const card = d => {
      const k = ctx.kols.get(d.kol_id) || {}, name = k.display_name || d.kol_id, due = R.dueDate(s, d), late = R.isOverdue(s, d, td), mv = movable(d), tier = (ctx.tiers.get(d.deal_id) || {}).tier;
      const notSet = R.costNotSet(d), total = R.totalCost(d);
      return `<div class="dcard${mv ? ' drag' : ''}" role="button" tabindex="0" data-id="${esc(d.deal_id)}" title="${esc(name)}"${mv ? ' draggable="true"' : ''}>
        <div class="r1"><b class="nm">${esc(name)}</b><span class="amt${notSet ? ' muted' : ''}"${notSet ? ` title="${esc(C.priceRef.costNotSet)}"` : ''}>${notSet ? '฿—' : esc(R.baht(total))}</span>${mv ? `<button type="button" class="icon-btn cmenu" data-cardmenu="${esc(d.deal_id)}" aria-label="${esc(D.cardMenu)}" title="${esc(D.moveToMenu)}">⋯</button>` : ''}</div>
        <div class="r2"><span class="l">${platformsHTML(ctx, d)}${d.pic ? `<span class="av sm" title="${esc(d.pic)}">${esc(initials(d.pic))}</span>` : ''}${tier ? `<span class="tier">${esc(tier)}</span>` : ''}${KT.samples.iconHTML(d)}</span>
          <span class="${late ? 'late' : 'muted'}">${due ? esc(dmShort(due, td)) : ''}</span></div></div>`;
    };
    const head = (st, list) => { const m = R.stageMoney(s, list), k = R.stageName(st);
      return `<button type="button" class="bc-name" data-stagepop="${esc(k)}" title="${esc(`${stepTitle(st.sub_status)} — ${D.openStage(k)}`)}">${esc(k)}</button><span>${m.n} · ${esc(m.kind === 'pending' ? '+' + bahtShort(m.amount) : bahtShort(m.amount))}</span>`; };
    const col = st => {
      const list = dealsOf(st), n = list.length, k = st.sub_status;
      if (optional(st) && !n && !dl.openCols.has(k)) return `<button type="button" class="bcol mini" data-step="${esc(k)}" data-opencol="${esc(k)}" title="${esc(R.stageName(st))} · 0"><span class="vt">${esc(R.stageName(st))}</span><span class="n">0</span></button>`;
      return `<div class="bcol" data-step="${esc(k)}"><div class="bc-h">${head(st, list)}${optional(st) && !n ? `<button type="button" class="icon-btn" data-opencol="${esc(k)}" aria-label="${esc(D.collapse)}" style="width:20px;height:20px">−</button>` : ''}</div>` +
        `<div class="bc-b">${list.map(card).join('')}</div></div>`;
    };
    const groups = [];
    steps.filter(st => !R.isCancelStep(st)).forEach(st => { const g = groups[groups.length - 1]; if (g && g.status === st.status) g.steps.push(st); else groups.push({ status: st.status, steps: [st] }); });
    const cancelled = cancelStep ? dealsOf(cancelStep) : [], cm = R.stageMoney(s, cancelled);
    const laneOpen = (v => (v === '1' ? true : v === '0' ? false : cancelled.length > 0))(U.pref.get('cancellane_' + (userId() || ''), ''));
    const lane = !cancelStep ? '' : `<div class="clane g-cancel${laneOpen ? '' : ' shut'}" data-step="${esc(cancelStep.sub_status)}"><div class="cl-h">` +
      `<button type="button" class="chevbtn${laneOpen ? ' open' : ''}" data-lanetoggle aria-expanded="${laneOpen}" aria-label="${esc(laneOpen ? D.collapse : D.expand)}">${ICON.chevron}</button>` +
      `<button type="button" class="bc-name" data-stagepop="${esc(R.stageName(cancelStep))}">${esc(R.stageName(cancelStep))}</button><span class="muted">${cm.n} · ${esc(R.baht(cm.amount))}</span>` +
      `<button type="button" class="btn small ghost hidden" data-showall>${esc(D.showAll(cm.n))}</button></div>` +
      (laneOpen ? `<div class="cl-b">${cancelled.map(card).join('') || `<div class="muted small">${esc(D.noCancelled)}</div>`}</div>` : '') + `</div>`;
    const GC = { List: 'g-list', Inprocess: 'g-prog', Complete: 'g-done' };
    $('dl_body').innerHTML = (can('deal.edit') ? `<p class="hint dl-draghint">${esc(D.dragHint)}</p>` : '') +
      `<div class="pipe"><div class="board">${groups.map((g, i) => `${i ? '<div class="bgsep" aria-hidden="true"></div>' : ''}<div class="bgroup ${GC[g.status] || ''}"><div class="bg-h"><span>${esc(C.status[g.status])}</span></div><div class="bcols">${g.steps.map(col).join('')}</div></div>`).join('')}</div>${lane}</div>`;
    /* the lane shows two rows of cards; more → Show all */
    const lb = document.querySelector('#dl_body .cl-b'), sa = document.querySelector('#dl_body [data-showall]');
    if (lb && sa) sa.classList.toggle('hidden', lb.scrollHeight <= lb.clientHeight + 2);
  }
  /* ===================== CR-09 §4.13 — Stage popup: one stage of the page's scope in a large view ===================== */
  const POP_COLS = () => [['kol', D.colKol], ['phase', D.colPhase], ['platforms', D.colPlatforms], ['pic', D.colPic], ['total', D.colTotal, 'num'], ['payment', D.colPayment],
    ['days', D.colDaysIn, 'num'], ['due', D.colNextDue], ['warn', '⚠', 'num']];
  const platformsOf = (ctx, d) => [...new Set(R.postsOfCtx(ctx, d.deal_id).map(p => R.postPlatform(ctx, p)).filter(Boolean))];
  function popItems(s, key, ctx, td) {
    return (dl.scoped || []).filter(d => R.stageKey(s.lookups, d) === key).map(d => {
      const k = ctx.kols.get(d.kol_id) || {}, p = ctx.phases.get(R.primaryPhase(ctx.phaseIdx, d.deal_id)), since = R.stageSince(s, d), w = R.rowWarnings(s, d, td, ctx);
      return { d, kol: k.display_name || d.kol_id, tier: (ctx.tiers.get(d.deal_id) || {}).tier || R.UNKNOWN_TIER, phase: p ? R.phaseName(s, p.phase_id) : '', platforms: platformsOf(ctx, d).join(', '),
        pic: d.pic || '', total: R.totalCost(d), payment: `${C.termShort[R.termOf(d) || 'none']} · ${C.payState[R.paymentState(d, td)] || ''}`, days: since ? R.dayDiff(td, since) : null,
        due: R.dueDate(s, d) || null, warn: w.length, warnText: w.map(x => x.msg).join('\n') };
    });
  }
  /* Staff move / reassign the deals they are the PIC of (CR-05) · Viewer / Accounting only look and export */
  const popCan = (s, d) => can('deal.edit') && !R.campaignCancelled(s, d.campaign_id) && (U.actor().role !== 'staff' || (!!myPic() && d.pic === myPic()));
  function openStagePop(key, keep) {
    if (!keep || !dl.pop || dl.pop.key !== key) dl.pop = { key, sort: { k: 'days', dir: 'desc' }, q: '', sel: new Set() };
    if (dl.mode !== 'none' && !editing()) U.closeDrawer();
    renderStagePop(true);
  }
  function renderStagePop(first) {
    const s = state(), ctx = R.dealContext(s), td = today(), P = dl.pop, L = s.lookups;
    const st = (R.stageOrder(L).find(x => x.key === P.key) || {}).step, status = st ? st.status : '';
    const all = popItems(s, P.key, ctx, td), m = R.stageMoney(s, all.map(x => x.d)), q = R.trim(P.q).toLowerCase();
    const list = all.filter(x => !q || [x.kol, x.pic, x.phase, x.d.deal_id].some(v => String(v).toLowerCase().includes(q.replace(/^@/, ''))));
    const val = (x, k) => (k === 'days' ? (x.days == null ? -1 : x.days) : k === 'due' ? x.due || '9999' : x[k]);
    list.sort((a, b) => { const A = val(a, P.sort.k), B = val(b, P.sort.k), c = typeof A === 'number' ? A - B : String(A).localeCompare(String(B), 'th'); return (P.sort.dir === 'desc' ? -c : c) || a.d.deal_id.localeCompare(b.d.deal_id); });
    [...P.sel].forEach(id => { if (!list.some(x => x.d.deal_id === id && popCan(s, x.d))) P.sel.delete(id); });
    const camp = s.campaigns.find(c => c.campaign_id === dl.f.campaign), ph = phaseById(dl.f.phaseSel), pv = picSel();
    const scope = [camp ? camp.campaign_name : '', ph ? R.phaseName(s, ph.phase_id) : dl.f.phaseSel === 'ongoing' ? D.ongoingPhases : D.allPhases].filter(Boolean).join(' › ') +
      ` · ${D.pic}: ${pv === 'all' ? D.allPics : pv === 'me' ? D.picMe(myPic()) : pv === '__none' ? D.unassigned : pv}`;
    const bulkOK = list.some(x => popCan(s, x.d)), n = P.sel.size;
    const targets = R.stepsOf(L).filter(x => x.active !== false && R.stageName(x) !== P.key), next = all.length ? (R.nextStep(L, all[0].d) || {}).step || null : null;   // the next step of the deals' plan
    const GC = { List: 'g-list', Inprocess: 'g-prog', Complete: 'g-done', Cancel: 'g-cancel' };
    const th = ([k, l, cls]) => `<th class="${cls || ''}"><button type="button" class="thsort" data-popsort="${k}">${esc(l)}${P.sort.k === k ? `<span class="ar">${P.sort.dir === 'desc' ? '▼' : '▲'}</span>` : ''}</button></th>`;
    const rowHTML = x => { const d = x.d, ok = popCan(s, d);
      return `<tr class="click" data-popopen="${esc(d.deal_id)}" tabindex="0">${bulkOK ? `<td class="cb">${ok ? `<input type="checkbox" data-popsel="${esc(d.deal_id)}"${P.sel.has(d.deal_id) ? ' checked' : ''} aria-label="${esc(x.kol)}">` : ''}</td>` : ''}` +
        `<td><span class="kname"><b>${esc(x.kol)}</b>${U.copyBtnHTML(x.kol)}</span> <span class="chip">${esc(x.tier)}</span></td><td class="muted">${esc(x.phase)}</td><td>${platformsHTML(ctx, d)}</td><td>${esc(x.pic)}</td>` +
        `<td class="num">${totalHTML(d)}</td><td>${payCell(d, td)}</td><td class="num">${x.days == null ? '<span class="muted">—</span>' : esc(C.common.days(x.days))}</td>` +
        `<td>${dueHTML(s, d, td, true)}</td><td class="num">${x.warn ? `<span class="wcount" title="${esc(x.warnText)}">${x.warn}</span>` : ''}</td></tr>`; };
    const html = `<div class="dlg-h pop-h ${GC[status] || ''}"><span class="pop-t"><b>${esc(P.key)}</b> ${status ? U.stChip(status) : ''} <span class="muted">${esc(D.groupDeals(all.length))} · ${esc(m.kind === 'pending' ? D.plusShortlist(R.baht(m.amount)) : R.baht(m.amount))}</span>` +
        `<span class="muted small pop-scope">${esc(scope)}</span></span><button type="button" class="icon-btn" data-popclose aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button></div>` +
      `<div class="dlg-b pop-b"><div class="toolbar pop-tools"><input type="search" class="search" id="sp_q" value="${esc(P.q)}" placeholder="${esc(D.popSearch)}" autocomplete="off">` +
        (n ? `<b>${esc(D.selected(n))}</b><label class="tlab">${esc(D.popMoveTo)} <select id="sp_to">${targets.map(x => `<option value="${esc(x.sub_status)}"${next && x === next ? ' selected' : ''}>${esc(R.stageName(x))}${next && x === next ? ` · ${esc(D.popNext)}` : ''}</option>`).join('')}</select></label>` +
          `<button type="button" class="btn small primary" data-popmove>${esc(D.popMove)}</button><label class="tlab">${esc(D.pic)} <select id="sp_pic">${optionsHTML(picList(), '', D.choosePic)}</select></label><button type="button" class="btn small" data-popreassign>${esc(D.reassign)}</button>` +
          `<button type="button" class="btn small" data-popdetails>${esc(C.bulk.setDetails)}</button>` : '') +
        `<span class="spacer"></span><details class="menu"><summary class="btn small">${ICON.download}<span>${esc(D.popExport)}</span></summary><div class="menu-list right"><button type="button" class="mi" data-popdl="xlsx">${esc(C.overview.dlXlsx)}</button><button type="button" class="mi" data-popdl="csv">${esc(C.overview.dlCsv)}</button></div></details></div>` +
        (P.result ? moveResultHTML(P.result) : '') +
        (!list.length ? `<div class="card empty"><b>${esc(all.length ? D.noMatch : D.popNone)}</b></div>` : `<div class="tablewrap pop-wrap"><table class="tbl sp-tbl"><thead><tr>${bulkOK ? `<th class="cb"><input type="checkbox" id="sp_all" aria-label="${esc(D.selectAll)}"${list.filter(x => popCan(s, x.d)).every(x => P.sel.has(x.d.deal_id)) && n ? ' checked' : ''}></th>` : ''}${POP_COLS().map(th).join('')}</tr></thead><tbody>${list.map(rowHTML).join('')}</tbody></table></div>`) + `</div>`;
    const focusQ = !first && document.activeElement && document.activeElement.id === 'sp_q', caret = focusQ ? document.activeElement.selectionStart : null;
    openDialog(html, 'xl');
    P.list = list;
    const box = $('dlg');
    if (!box.dataset.popwired) {
      box.dataset.popwired = '1';
      box.addEventListener('click', popClick); box.addEventListener('input', e => { if (e.target.id === 'sp_q' && dl.pop) { dl.pop.q = e.target.value; renderStagePop(); } });
      box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('tr[data-popopen]') && !e.target.closest('input,button')) popOpen(e.target.closest('tr[data-popopen]').dataset.popopen); });
      box.addEventListener('close', () => { delete box.dataset.popwired; box.removeEventListener('click', popClick); });
    }
    if (focusQ) { const qi = $('sp_q'); qi.focus(); qi.setSelectionRange(caret, caret); }
  }
  function popOpen(id) { const key = dl.pop.key; closeDialog(); select(id); dl.backTo = key; renderPanel(); }
  function popClick(e) {
    if (!dl.pop || !$('dlg').querySelector('.pop-h')) return;
    if (e.target.closest('[data-popclose]')) { closeDialog(); return; }
    const so = e.target.closest('[data-popsort]'); if (so) { const k = so.dataset.popsort, P = dl.pop; P.sort = { k, dir: P.sort.k === k && P.sort.dir === 'asc' ? 'desc' : 'asc' }; renderStagePop(); return; }
    if (e.target.id === 'sp_all') { const s = state(), on = e.target.checked; dl.pop.list.filter(x => popCan(s, x.d)).forEach(x => (on ? dl.pop.sel.add(x.d.deal_id) : dl.pop.sel.delete(x.d.deal_id))); renderStagePop(); return; }
    const cb = e.target.closest('[data-popsel]'); if (cb) { cb.checked ? dl.pop.sel.add(cb.dataset.popsel) : dl.pop.sel.delete(cb.dataset.popsel); renderStagePop(); return; }
    if (e.target.closest('[data-popmove]')) { popMove($('sp_to').value); return; }
    if (e.target.closest('[data-popdetails]')) { openSetDetails([...dl.pop.sel], { back: 'pop' }); return; }
    const bt = e.target.closest('[data-setterm]'); if (bt) { openSetDetails(bt.dataset.setterm.split(','), { back: 'pop', term: true }); return; }
    if (e.target.closest('[data-popreassign]')) { const v = $('sp_pic').value; if (!v) return; const ids = [...dl.pop.sel]; dl.pop.sel.clear(); setField(ids, 'pic', v); renderStagePop(); return; }
    const dlb = e.target.closest('[data-popdl]'); if (dlb) { const m = dlb.closest('details'); if (m) m.open = false; popExport(dlb.dataset.popdl); return; }
    if (e.target.closest('input,button,a,details,summary,.copybtn')) return;
    const tr = e.target.closest('tr[data-popopen]'); if (tr) popOpen(tr.dataset.popopen);
  }
  /* CR-10 §4.12 — Move to… for many deals: each goes when Move stage would let it (warnings such as a skipped step are fine, date = today) ·
     an error leaves it where it is with the reason · "Moved n · Blocked m (Payment term not set)" + Set payment term for m */
  function bulkMove(ids, to) {
    const s = state(), td = today(), out = { moved: 0, blocked: [], to };
    ids.forEach(id => {
      const d = dealById(id); if (!d) return;
      if (!popCan(s, d)) { out.blocked.push({ id, kind: 'rights', msg: C.bulk.blockedRights }); return; }
      const res = R.checkMove(s, d, to, { date: td, note: '' });
      if (res.errs.length) { const t = res.errs.find(e => e.field === 'payment_term'); out.blocked.push({ id, kind: t ? 'term' : 'other', msg: (t || res.errs[0]).msg }); return; }
      const r = R.applyMove(s, d, to, { date: td, note: '' }, { logId: store.newLogId(), quoteId: store.newId('quote'), eventId: store.newEventId(), now: new Date(), user: userId() });
      s.deals[s.deals.indexOf(d)] = r.deal; s.deal_status_log.push(r.log); if (r.quote) s.kol_rate_quotes.push(r.quote); r.events.forEach(ev => s.deal_events.push(ev)); out.moved++;
    });
    if (out.moved) commit();
    return out;
  }
  function moveResultHTML(r) {
    const term = r.blocked.filter(b => b.kind === 'term'), other = r.blocked.filter(b => b.kind !== 'term');
    return `<div class="bk-result"><span>${esc(C.bulk.moveResult(r.moved, r.blocked.length, R.stageName(R.stepOf(state().lookups, r.to) || { sub_status: r.to })))}</span>` +
      (term.length ? ` <span class="muted">${esc(C.bulk.blockedTerm(term.length))}</span> <button type="button" class="btn small" data-setterm="${esc(term.map(b => b.id).join(','))}">${esc(C.bulk.setTermFor(term.length))}</button>` : '') +
      (other.length ? ` <span class="muted" title="${esc(other.map(b => `${kolName((dealById(b.id) || {}).kol_id)}: ${b.msg}`).join('\n'))}">${esc(C.bulk.blockedOther(other.length))}</span>` : '') + `</div>`;
  }
  function popMove(to) {
    if (!guard('deal.edit')) return;
    const r = bulkMove([...dl.pop.sel], to);
    dl.pop.sel.clear(); dl.pop.result = r;
    renderLeft(); renderStagePop();
  }
  /* the Table's bulk bar: pick a stage, then the same result */
  function openBulkMove(ids) {
    if (!guard('deal.edit') || !ids.length) return;
    const s = state(), L = s.lookups;
    openDialog(`<div class="dlg-h">${esc(C.bulk.moveTitle(ids.length))}</div><div class="dlg-b"><div class="field"><label for="bm_to">${esc(D.popMoveTo)}</label><select id="bm_to">${R.stepsOf(L).filter(x => x.active !== false && !R.isCancelStep(x)).map(x => `<option value="${esc(x.sub_status)}">${esc(R.stageName(x))}</option>`).join('')}</select></div>` +
      `<p class="hint">${esc(C.bulk.moveHint)}</p><div id="bm_res"></div></div><div class="dlg-f"><button type="button" class="btn" id="bm_cancel">${esc(C.common.close)}</button><button type="button" class="btn primary" id="bm_ok">${esc(D.popMove)}</button></div>`);
    $('bm_cancel').addEventListener('click', closeDialog);
    $('bm_ok').addEventListener('click', () => {
      const r = bulkMove(ids, $('bm_to').value); dl.selected.clear(); renderLeft();
      $('bm_res').innerHTML = moveResultHTML(r); $('bm_ok').disabled = true;
      const b = $('bm_res').querySelector('[data-setterm]'); if (b) b.addEventListener('click', () => openSetDetails(b.dataset.setterm.split(','), { term: true }));
    });
  }
  /* CR-10 §4.12 — Set details: tick the fields to set (PIC · Pillar · Payment term · Phase · CTA) — the others stay as they are */
  function openSetDetails(idsIn, o = {}) {
    if (!guard('deal.edit')) return;
    const s = state(), ids = idsIn.filter(id => { const d = dealById(id); return d && popCan(s, d); }); if (!ids.length) return;
    const camps = new Set(ids.map(id => dealById(id).campaign_id)), phases = camps.size === 1 ? R.sortPhases(s.phases.filter(p => camps.has(p.campaign_id))) : [];
    const SD = C.bulk.sd, row = (k, label, input, on) => `<div class="sd-row"><label class="tick"><input type="checkbox" data-sdon="${k}"${on ? ' checked' : ''}> ${esc(label)}</label>${input}</div>`;
    openDialog(`<div class="dlg-h">${esc(SD.title(ids.length))}</div><div class="dlg-b"><p class="hint" style="margin-top:0">${esc(SD.hint)}</p><div class="sd">` +
      row('pic', D.pic, `<select data-sd="pic">${optionsHTML(picList(), '', D.choosePic)}</select>`) +
      row('pillar', D.pillar, `<select data-sd="pillar">${optionsHTML(activeList('pillar_list', null), '', D.choosePillar)}</select>`) +
      row('payment_term', D.term, `<select data-sd="payment_term">${optionsHTML(R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), '', D.chooseTerm)}</select>`, !!o.term) +
      (phases.length ? row('phase', D.phase, `<select data-sd="phase">${optionsHTML(phases.map(p => ({ value: p.phase_id, label: R.phaseName(s, p.phase_id) })), '', D.choosePhase || C.common.none)}</select>`) : '') +
      row('cta', F.cta, `<select data-sd="cta">${optionsHTML(activeList('cta_list', null), '', D.none)}</select>`) +
      `</div><div class="checks" id="sd_checks"></div></div><div class="dlg-f"><button type="button" class="btn" id="sd_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="sd_ok">${esc(SD.apply(ids.length))}</button></div>`);
    const box = $('dlg'), val = k => box.querySelector(`[data-sd="${k}"]`).value, on = k => { const c = box.querySelector(`[data-sdon="${k}"]`); return !!c && c.checked; };
    box.querySelectorAll('[data-sd]').forEach(el => el.addEventListener('change', () => { const c = box.querySelector(`[data-sdon="${el.dataset.sd}"]`); if (c && el.value) c.checked = true; }));
    $('sd_cancel').addEventListener('click', () => { closeDialog(); if (o.back === 'pop' && dl.pop) renderStagePop(); });
    $('sd_ok').addEventListener('click', () => {
      const fields = {}; ['pic', 'pillar', 'payment_term', 'cta'].forEach(k => { if (on(k)) fields[k] = val(k); });
      const errs = []; if ('payment_term' in fields && !R.isTerm(fields.payment_term)) errs.push({ msg: C.msg.termRequired || D.chooseTerm });
      if (!Object.keys(fields).length && !on('phase')) errs.push({ msg: SD.nothing });
      if (errs.length) { $('sd_checks').innerHTML = checksHTML({ errs, warns: [], infos: [] }, ''); return; }
      if (!guard('deal.edit')) return;
      const st = state(), deals = ids.map(dealById).filter(Boolean), ctx = { eventId: store.newEventId(), now: new Date(), user: userId() };
      let changed = new Map(deals.map(d => [d.deal_id, d])), events = [];
      Object.keys(fields).forEach(f => { const r = R.fieldChanges([...changed.values()], f, fields[f] || null, Object.assign({}, ctx, { eventId: ctx.eventId + events.length })); r.deals.forEach(d => changed.set(d.deal_id, d)); events = events.concat(r.events); });
      if (on('phase') && val('phase')) {
        let postN = parseInt(store.newId('post').slice(1), 10);
        deals.forEach(d => { const posts = st.deal_posts.filter(x => x.deal_id === d.deal_id), ph = R.phasesOfCampaign(st, d.campaign_id);
          if (posts.length) posts.forEach(x => { if (R.resolvePostPhase(x, ph).kind !== 'auto') x.phase_override = val('phase'); });
          else { const acc = R.accountsOfKol(st, d.kol_id).slice().sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0))[0]; if (acc) st.deal_posts.push(Object.assign(R.blankPost(d.deal_id, acc.account_id, acc.platform, null), { post_id: 'P' + String(postN++).padStart(6, '0'), phase_override: val('phase'), metrics_source: null, metrics_updated_by: null })); } });
      }
      closeDialog(); dl.selected.clear(); applyDeals([...changed.values()], events); toast(SD.done(ids.length));
      if (o.back === 'pop' && dl.pop) { dl.pop.result = null; renderStagePop(); }
    });
  }
  function popExport(fmt) {
    const s = state(), P = dl.pop, list = P.list || [], name = `${KT.export.safeName(P.key)}_${KT.export.safeName((s.campaigns.find(c => c.campaign_id === dl.f.campaign) || {}).campaign_name)}_${today()}.${fmt}`;
    const t = { name: P.key.slice(0, 31), header: [D.colKol, D.colTier, D.colPhase, D.colPlatforms, D.colPic, D.colTotal, D.colPayment, D.colDaysIn, D.colNextDue, D.colWarnings],
      rows: list.map(x => [x.kol, x.tier, x.phase, x.platforms, x.pic, x.total, x.payment, x.days == null ? '' : x.days, x.due ? R.dmy(x.due) : '', x.warn]), total: null };
    if (fmt === 'csv') { downloadCSV(name, t.header, t.rows); return; }
    U.download(name, KT.xlsx.workbook([KT.export.sheetOf(t)]), KT.xlsx.MIME); toast(C.io.exported(name, t.rows.length));
  }

  /* ---------- CR-06 §4.7: drag & drop = Move stage ---------- */
  let drag = null;
  const cols = () => [...document.querySelectorAll('#dl_body [data-step]')];
  function dragStart(e) {
    const c = e.target.closest('.dcard[draggable]'); if (!c || !can('deal.edit')) return;
    const s = state(), d = dealById(c.dataset.id), td = today(); if (!d) return;
    /* Draft rounds nobody plans have no column (CR-02): while a card moves they show folded, so a round can be added by dropping (TC-32) */
    R.stepsOf(s.lookups).filter(st => st.active !== false && R.draftNo(st) > 1 && !document.querySelector(`#dl_body [data-step="${CSS.escape(st.sub_status)}"]`)).forEach(st => {
      const prev = R.stepsOf(s.lookups).filter(x => x.sort_order < st.sort_order).reverse().map(x => document.querySelector(`#dl_body [data-step="${CSS.escape(x.sub_status)}"]`)).find(Boolean);
      if (prev) prev.insertAdjacentHTML('afterend', `<button type="button" class="bcol mini ghost" data-step="${esc(st.sub_status)}" title="${esc(st.sub_status)}"><span class="vt">${esc(st.sub_status)}</span><span class="n">0</span></button>`);
    });
    drag = { id: d.deal_id, plans: new Map(cols().map(col => [col.dataset.step, R.dropPlan(s, d, col.dataset.step, td)])) };
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.deal_id);
    c.classList.add('dragging');
    cols().forEach(col => { const p = drag.plans.get(col.dataset.step);
      col.classList.toggle('drop-ok', p.kind === 'instant' || p.kind === 'dialog');
      col.classList.toggle('drop-no', p.kind === 'blocked');
      col.classList.toggle('drop-bad', p.kind === 'blocked' && col.dataset.step === 'Post');
      if (p.kind === 'blocked') { col.dataset.tip = col.title; col.title = p.msg; } });
  }
  function dragEnd() {
    document.querySelectorAll('#dl_body .dragging').forEach(x => x.classList.remove('dragging'));
    document.querySelectorAll('#dl_body .bcol.ghost').forEach(x => x.remove());
    cols().forEach(col => { col.classList.remove('drop-ok', 'drop-no', 'drop-bad', 'over', 'peek'); if (col.dataset.tip != null) { col.title = col.dataset.tip; delete col.dataset.tip; } });
    drag = null;
  }
  function dragOver(e) {
    if (!drag) return;
    const col = e.target.closest('[data-step]'); if (!col) return;
    const p = drag.plans.get(col.dataset.step);
    /* a folded column opens while a card passes over it */
    if (col.classList.contains('mini')) col.classList.add('peek');
    if (p && (p.kind === 'instant' || p.kind === 'dialog')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); }
    else e.dataTransfer.dropEffect = 'none';
  }
  function dragLeave(e) { const col = e.target.closest('[data-step]'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('over', 'peek'); }
  function dropOn(e) {
    if (!drag) return;
    const col = e.target.closest('[data-step]'); if (!col) return;
    e.preventDefault();
    const id = drag.id, to = col.dataset.step; dragEnd();
    moveTo(id, to);
  }
  /* a drop / Move to…: straight away with Undo, or the Move stage dialog on that step, or a message why not */
  function moveTo(id, toSub) {
    const s = state(), d = dealById(id); if (!d || !guard('deal.edit')) return;
    const p = R.dropPlan(s, d, toSub, today());
    if (p.kind === 'same') return;
    if (p.kind === 'blocked') { toast(p.msg); renderLeft(); return; }
    if (p.kind === 'dialog') { openMove(id, toSub); return; }
    if (R.zeroCostMove(s, d, toSub)) { zeroCostAsk().then(ok => { if (ok) applyInstant(id, toSub); else renderLeft(); }); return; }
    applyInstant(id, toSub);
  }
  /* CR-07 §4.5 — Total is ฿0 at Confirm QT: Continue / Cancel (a warning, not a block) */
  const zeroCostAsk = () => U.confirmDialog(C.priceRef.zeroTitle, C.priceRef.zeroBody, C.priceRef.zeroContinue);
  function applyInstant(id, toSub) {
    const s = state(), d = dealById(id); if (!d) return;
    const r = R.applyMove(s, d, toSub, { date: today(), note: '' }, { logId: store.newLogId(), quoteId: store.newId('quote'), eventId: store.newEventId(), now: new Date(), user: userId() });
    s.deals[s.deals.indexOf(d)] = r.deal; s.deal_status_log.push(r.log); if (r.quote) s.kol_rate_quotes.push(r.quote); r.events.forEach(ev => s.deal_events.push(ev));
    commit(); renderLeft(); if (dl.mode === 'view' && dl.id === id) renderPanel();
    /* Undo puts the deal back as it was and takes the log (and the rate / plan rows of that move) out again */
    toastAction(D.movedTo(toSub), D.undo, () => {
      const s2 = state(), i = s2.deals.findIndex(x => x.deal_id === id); if (i < 0) return;
      s2.deals[i] = d;
      s2.deal_status_log = s2.deal_status_log.filter(l => l !== r.log);
      if (r.quote) s2.kol_rate_quotes = s2.kol_rate_quotes.filter(q => q !== r.quote);
      if (r.events.length) s2.deal_events = s2.deal_events.filter(ev => !r.events.includes(ev));
      commit(D.moveUndone); renderLeft(); if (dl.mode === 'view' && dl.id === id) renderPanel();
    });
  }
  /* ⋯ › Move to… on a card (keyboard / phone): the plan's steps + Cancel */
  function openCardMenu(btn) {
    const id = btn.dataset.cardmenu, s = state(), d = dealById(id); if (!d || !guard('deal.edit')) return;
    const m0 = $('dl_picmenu'); if (m0 && m0.dataset.for === 'move' + id) { closePicMenu(); return; }
    closePicMenu();
    const plan = R.planOf(d), td = today();
    const steps = R.stepsOf(s.lookups).filter(st => st.active !== false && st.sub_status !== d.sub_status && (R.isCancelStep(st) || R.inPlan(st, plan) || R.draftNo(st)));
    const m = document.createElement('div');
    m.className = 'menu-list floating'; m.id = 'dl_picmenu'; m.dataset.for = 'move' + id; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="mh">${esc(D.moveToMenu)}</div>` + steps.map(st => { const p = R.dropPlan(s, d, st.sub_status, td);
      return `<button type="button" class="mi" data-moveto="${esc(st.sub_status)}" role="menuitem"${p.kind === 'blocked' ? ` disabled title="${esc(p.msg)}"` : ''}>${esc(st.sub_status)}${p.kind === 'blocked' ? ` <span class="muted small">· ${esc(p.msg)}</span>` : ''}</button>`; }).join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth;
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    m.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    m.addEventListener('click', e => { const b = e.target.closest('[data-moveto]'); if (b && !b.disabled) { closePicMenu(); moveTo(id, b.dataset.moveto); } });
    const first = m.querySelector('.mi:not([disabled])'); if (first) first.focus();
  }
  function exportFiltered(kind) {
    const s = state(), ctx = R.dealContext(s), td = today();
    /* what is on screen: the scope and, in the table, the state tab */
    const deals = dl.rows.length || dl.view !== 'table' ? dl.rows : R.filterDeals(s, currentScope(s, td).base, td, ctx), dealIds = new Set(deals.map(d => d.deal_id));
    if (kind === 'template') { const t = R.templateExport(s, deals, ctx); downloadCSV(`kol_template_${td.replace(/-/g, '')}.csv`, t.header, t.rows); }
    if (kind === 'deals') downloadCSV('deals.csv', R.DEALS_COLS, R.dealsRows(s, deals, td, ctx));
    if (kind === 'posts') downloadCSV('deal_posts.csv', R.POSTS_COLS, R.postsRows(s, s.deal_posts.filter(p => dealIds.has(p.deal_id)), ctx));
  }

  /* ===================== drawer ===================== */
  const owner = {
    kind: 'deal',   // CR-10 §4.13: 60% wide (was 50%, CR-09 §4.12), resizable, the page beside it stays usable
    isDirty: () => editing() && dl.dirty,
    onClose: () => { Object.assign(dl, { mode: 'none', id: null, sec: null, draft: null, posts: null, ticks: null, backTo: null }); dl.touched.clear(); if (U.currentTab() === 'deals') setHash('deals'); markSelected(); },
    /* leaving the tab: keep unsaved edits so the drawer can come back; a plain view just closes */
    onSuspend: () => { if (!editing()) Object.assign(dl, { mode: 'none', id: null }); },
  };
  function renderPanel() {
    let html;
    if (dl.mode === 'view') { const d = dealById(dl.id); if (!d) { U.closeDrawer(); return; } html = viewHTML(d); setHash('deals/' + d.deal_id); }
    else if (dl.mode === 'new') { html = dl.createKol ? createKolHTML() : formHTML(); setHash('deals'); }
    else return;
    const keep = dl.sec && $('drawer_content').querySelector('.dr-body') ? $('drawer_content').querySelector('.dr-body').scrollTop : null;
    if (U.drawerOwner() === owner) fillDrawer(html); else openDrawer(owner, html);
    $('drawer_content').onclick = panelClick;
    U.fitJourney($('drawer_content'));
    if (dl.mode === 'view') KT.samples.fillSecure($('drawer_content'));
    if (dl.mode === 'new' && dl.createKol) wireCreateKol();
    else if (editing()) { wireForm(); check(); }
    if (keep != null) $('drawer_content').querySelector('.dr-body').scrollTop = keep;
  }
  const closeBtn = `<button type="button" class="icon-btn" data-dr-close aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button>`;

  /* ---------- shared pieces ---------- */
  /* CR-07 §4.9 — Journey: the timeline (+ "Brief → Post: n d" / "In progress n d since Brief"), the payment track, then the content plan */
  function journeySecHTML(s, d, posts) {
    const j = U.journeyHTML(d, R.logsOf(s, d.deal_id), posts);
    return `<section class="sec jsec"><div class="sec-h"><span>${esc(D.secJourney)}</span>${j.summary ? `<span class="jt-sum">${esc(j.summary)}</span>` : ''}</div>${j.html}${U.payTrackHTML(d)}${KT.samples.trackHTML(d)}${planLineHTML(s, d)}</section>`;
  }
  /* CR-02 §4.2 — Content plan: changed right here (an action like Move stage, no Edit needed) */
  function planLineHTML(s, d) {
    const plan = R.planOf(d), lim = R.planLimits(s, d);
    if (!can('deal.edit')) return `<div class="cplan"><span class="muted">${esc(D.contentPlan)}</span><span class="cp-item">${esc(D.planText(plan.drafts, plan.script))}</span></div>`;
    const minus = plan.drafts <= lim.minDrafts, plus = plan.drafts >= lim.maxDrafts, lockScript = plan.script && lim.scriptLocked;
    return `<div class="cplan"><span class="muted">${esc(D.contentPlan)}</span>
      <span class="cp-item">${esc(D.drafts)} <span class="stepper-n"><button type="button" class="icon-btn" data-plan="minus"${minus ? ' disabled' : ''} aria-label="${esc(D.fewerDrafts)}" title="${esc(minus ? D.cannotFewer(lim.minDrafts) : D.fewerDrafts)}">−</button>` +
      `<b>${plan.drafts}</b><button type="button" class="icon-btn" data-plan="plus"${plus ? ' disabled' : ''} aria-label="${esc(D.moreDrafts)}" title="${esc(plus ? D.maxDrafts(lim.maxDrafts) : D.moreDrafts)}">+</button></span></span>
      <label class="cp-item tick"${lockScript ? ` title="${esc(C.msg.planScriptPassed)}"` : ''}><input type="checkbox" data-plan="script"${plan.script ? ' checked' : ''}${lockScript ? ' disabled' : ''}> ${esc(D.script)}</label></div>`;
  }
  function changePlan(kind, on) {
    const s = state(), d = dealById(dl.id); if (!d || !guard('deal.edit')) { renderPanel(); return; }
    if (dl.sec) { toast(C.common.blockWhileEditing); renderPanel(); return; }
    const plan = R.planOf(d), next = { drafts: plan.drafts + (kind === 'plus' ? 1 : kind === 'minus' ? -1 : 0), script: kind === 'script' ? !!on : plan.script };
    const chk = R.checkPlan(s, d, next);
    if (chk.errs.length) { toast(chk.errs[0].msg); renderPanel(); return; }
    const r = R.applyPlan(d, next, { eventId: store.newEventId(), now: new Date(), user: userId() });
    if (!r.event) return;
    s.deals[s.deals.indexOf(d)] = r.deal; s.deal_events.push(r.event);
    commit(D.planSaved(D.planText(next.drafts, next.script)));
    renderLeft(); renderPanel();
  }
  /* Payment (CR-08 §4.5): the term and its state, then the deal's instalments from Payments with Request payment ·
     CR-09 §4.12: the drawer's right column is narrow and must not scroll sideways — each instalment is a block that wraps:
     Milestone + status · Gross · Net · run / paid date · Request */
  function payViewHTML(d) {
    const s = state(), term = R.termOf(d), st = R.paymentState(d, today()), PM = C.pay, P2 = KT.screens.payments, items = d.deal_id ? R.dealPayItems(s, d, today()) : [];
    const canReq = R.canRequest(s, U.actor(), d);
    const reqOf = x => x.virtual && (x.status === 'ready' || x.status === 'missing_docs');
    const rows = items.map(x => { const meta = [x.run_id ? `<span>${esc(PM.run)} <button type="button" class="link" data-payrun="${esc(x.run_id)}">${esc(x.run_id)}</button></span>` : '',
        x.paid_date ? `<span>${esc(PM.paidOn)} ${esc(R.dmy(x.paid_date))}</span>` : ''].filter(Boolean).join('');
      return `<div class="dpl-r"><div class="dpl-a"><b>${esc(PM.milestone[x.milestone] || x.milestone)}</b>${P2.statusChip(x.status)}</div>` +
        `<div class="dpl-m"><span>${esc(PM.col.gross)} <b>${P2.money(x.tax.gross)}</b></span><span>${esc(PM.col.net)} <b>${P2.money(x.tax.net)}</b></span></div>` +
        (meta || reqOf(x) ? `<div class="dpl-b">${meta}${reqOf(x) ? `<button type="button" class="btn small" data-payreq="${esc(x.key)}"${canReq ? '' : ` disabled title="${esc(PM.requestOnlyPic)}"`}>${esc(PM.request)}</button>` : ''}</div>` : '') + `</div>`; }).join('');
    return `<div class="kv"><span>${esc(D.term)}</span><b>${esc(C.term[term || 'none'])}${st === 'free' ? '' : ` · <span class="pay"><b class="${U.PAY_CLS[st]}">${esc(C.payState[st])}</b></span>`}</b></div>` +
      (term === 'free' ? `<div class="hint">${esc(D.freeNoPay)}</div>` : !items.length ? `<div class="hint">${esc(PM.dealPayNone)}</div>`
        : `<div class="dpl">${rows}</div>`);
  }
  /* CR-03: the deal's money counts against its Campaign budget (Phase budgets follow the posts) */
  function budgetHTML(s, d, ctx) {
    const p = ctx.campaigns.get(d.campaign_id); if (!p) return '';
    const stored = d.deal_id ? dealById(d.deal_id) : null;
    const others = (ctx.committedByCampaign.get(p.campaign_id) || 0) - (stored && stored.status !== 'Cancel' && stored.campaign_id === p.campaign_id ? R.totalCost(stored) : 0);
    const mine = d.status === 'Cancel' ? 0 : R.totalCost(d), after = others + mine;
    const head = `<div class="sec-h" style="margin:12px 0 0"><span>${esc(D.campaignBudget)} <span class="muted">${esc(p.campaign_name)}</span></span></div>`;
    if (R.isBlank(p.budget_kol)) return head + `<div class="hint">${esc(D.campaignNoBudget)}</div>${kv(D.committedOthers, R.baht(others))}${kv(D.thisDeal, R.baht(mine))}`;
    const b = Number(p.budget_kol), pct = b ? Math.min(100, after / b * 100) : 100, cls = after > b ? 'over' : pct > 85 ? 'warn' : '';
    return head + `<div class="meter"><span class="${cls}" style="width:${pct}%"></span></div>${kv(D.budget, R.baht(b))}${kv(D.committedOthers, R.baht(others))}` +
      `${kv(D.thisDeal, R.baht(mine))}${kv(D.remaining, R.baht(b - after), after > b ? 'over' : '')}` +
      (after > b ? `<div class="check warn" style="margin-top:6px">! <span>${esc(C.msg.campaignOver(R.baht(after - b)))}</span></div>` : '');
  }
  /* CR-07 §4.5 — the cost fields with the Price reference beside them (under them in a narrow drawer) */
  const costBlock = (fieldsHTML, totalHTML2, kolId, d, excludeDealId) => `<div class="costwrap"><div class="costgrid"><div>${fieldsHTML}${totalHTML2}</div>${U.priceRefHTML(kolId, { excludeDealId, free: R.termOf(d) === 'free' })}</div></div>`;
  const asCost = (html, f) => html.replace('<input ', `<input data-cost="${f}" placeholder="${esc(C.priceRef.zeroPh)}" `);
  /* status log + deal_events (PIC, content plan, payment term), newest first */
  function eventText(e) {
    if (e.type === 'pic') return D.histPic(e.from, e.to);
    if (e.type === 'pillar') return D.histPillar(e.from, e.to);
    if (e.type === 'cta') return D.histCta(e.from, e.to);
    if (e.type === 'payment_term') return D.histTerm(C.term[e.from || 'none'], C.term[e.to || 'none']);
    if (e.type === 'plan') { const t = v => D.planText((v || {}).draft_rounds || 1, !!(v || {}).script_required); return D.histPlan(t(e.from), t(e.to)); }
    if (e.type === 'metrics') { const v = x => (x == null ? '—' : R.fmtNum(x)); return D.histMetrics(e.post_id || '') + ' · ' + R.METRICS.filter(k => (e.from || {})[k] !== (e.to || {})[k]).map(k => `${F[k]} ${v((e.from || {})[k])} → ${v((e.to || {})[k])}`).join(' · ') + (e.note === 'undo' ? ` (${D.undo})` : ''); }
    if (e.type === 'edit' || e.type === 'cost') return (e.type === 'cost' ? D.histCost : D.histEdit) + ' · ' + Object.keys(e.to || {}).map(k => `${fieldLabel(k)}: ${valText(k, (e.from || {})[k])} → ${valText(k, e.to[k])}`).join(' · ');
    return e.type;
  }
  /* "P000046.post_date" → "Post P000046 · Post date" */
  const fieldLabel = k => { const [a, b] = k.split('.'); return b ? `${D.postWord} ${a} · ${F[b] || b}` : /^P\d+$/.test(a) || a === 'new' ? `${D.postWord} ${a}` : F[a] || a; };
  const valText = (k, v) => { const f = k.split('.').pop();
    if (v == null || v === '') return C.common.none;
    if (v === 'added') return D.postAdded; if (v === 'removed') return D.postRemoved;
    if (typeof v === 'boolean') return v ? '✓' : C.common.none;
    if (Array.isArray(v)) return v.join(', ') || C.common.none;
    if (/date|_at$/.test(f)) return R.dmy(v);
    return typeof v === 'number' ? R.fmtNum(v) : String(v); };
  function historyHTML(s, d) {
    const items = R.logsOf(s, d.deal_id).map((l, i) => ({ at: l.changed_at || (l.effective_date ? l.effective_date + 'T00:00:00Z' : ''), n: i,
      html: `<span class="dt">${R.dmy(l.effective_date) || R.fmtDateTime(l.changed_at)}</span><span>${esc(D.histFrom(l.from_sub_status || '', l.sub_status))}</span>` +
        `<span class="muted">${esc(C.roles.byLine(R.changedByName(s, l.changed_by)))} · ${esc(D.source[l.source] || l.source || '')}${l.note ? ` · ${esc(l.note)}` : ''}</span>` }))
      .concat((s.deal_events || []).filter(e => e.deal_id === d.deal_id).map(e => ({ at: e.changed_at || '', n: 100000 + Number(e.event_id || 0),
        html: `<span class="dt">${R.fmtDateTime(e.changed_at)}</span><span>${esc(eventText(e))}</span><span class="muted">${esc(C.roles.byLine(R.changedByName(s, e.changed_by)))}${e.note ? ` · ${esc(e.note === 'undo' ? D.histUndo : e.note)}` : ''}</span>` })));
    if (!items.length) return `<div class="hint">${esc(D.noHistory)}</div>`;
    items.sort((a, b) => (a.at === b.at ? a.n - b.n : a.at < b.at ? -1 : 1)).reverse();
    return `<ul class="hist-log">${items.map(x => `<li>${x.html}</li>`).join('')}</ul>`;
  }
  const sec = (title, body, extra) => `<section class="sec"><div class="sec-h"><span>${esc(title)}</span>${extra || ''}</div>${body}</section>`;

  /* ---------- the Phase of a post (CR-03 §4.4) ---------- */
  /* auto = from the date · picked = phase_override · Unscheduled (grey) · Needs phase (yellow) · an override the date no longer needs is faded */
  function phaseTagHTML(r) {
    const unused = r.overrideUnused ? ` <span class="ptag unused" title="${esc(D.overrideUnused(r.phase ? R.phaseName(state(), r.phase) : D.needsPhase))}">${esc(R.phaseName(state(), r.override))}</span>` : '';
    if (r.kind === 'auto') return `<span class="ptag">${esc(R.phaseName(state(), r.phase))}</span>${unused}`;
    if (r.phase) return `<span class="ptag" title="${esc(D.phasePickedTip)}">${esc(R.phaseName(state(), r.phase))} · ${esc(D.picked)}</span>`;
    if (r.slot === 'unscheduled') return `<span class="ptag muted">${esc(D.unscheduled)}</span>`;
    return `<span class="ptag warn">${esc(D.needsPhase)}</span>${unused}`;
  }
  /* the Phase field of a post in the form: read-only when the date decides, otherwise a choice
     (no date = optional, outside / overlapping = required; overlapping offers only the Phases that overlap) */
  function phaseFieldHTML(r, phases, attrs, selected) {
    if (r.kind === 'auto') return `<div class="ptag-box">${phaseTagHTML(r)}</div>`;
    const list = R.pickablePhases(r, phases).map(p => ({ value: p.phase_id, label: R.phaseName(state(), p.phase_id) }));
    const ph = r.kind === 'none' ? D.unscheduled : D.choosePhase;
    return `<select ${attrs}>${optionsHTML(list, list.some(o => o.value === selected) ? selected : '', ph)}</select>` +
      (r.slot === 'needs' ? `<div class="hint warn">${esc(r.kind === 'overlap' ? D.needsPhaseOverlap : D.needsPhaseOutside)}</div>` : r.kind === 'none' ? `<div class="hint">${esc(D.noDateYet)}</div>` : '');
  }

  /* ---------- view: every section reads · ✎ opens one section as a form (CR-04 §4.5) ---------- */
  const PENCIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 2.6l2.8 2.8L6 12.8H3.2V10z"/></svg>';
  const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  const lockOf = (d, f, post) => R.fieldEditable(state(), d, f, U.actor(), post);
  /* 🔒 with its reason · "Auto" for computed values · nothing for people who only view */
  function lockMark(fe) {
    if (!fe || fe.editable) return '';
    if (fe.auto) return ` <span class="autotag">${esc(C.lock.auto)}</span>`;
    if (fe.reason === C.lock.viewOnly) return '';
    return ` <span class="lock" title="${esc(fe.reason)}" aria-label="${esc(fe.reason)}">${LOCK}</span>`;
  }
  const kvF = (d, f, value, label, post) => `<div class="kv"><span>${esc(label || F[f])}</span><b>${R.isBlank(value) ? `<span class="muted">${C.common.none}</span>` : esc(value)}${lockMark(lockOf(d, f, post))}</b></div>`;
  const kvAuto = (label, value, cls) => `<div class="kv${cls ? ' ' + cls : ''}"><span>${esc(label)}</span><b>${value}${lockMark({ editable: false, auto: true })}</b></div>`;
  const secFoot = () => `<div class="sec-foot"><div class="checks" id="dl_checks"></div><div class="btns"><button type="button" class="btn" data-act="secCancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="secSave">${esc(C.common.save)}</button></div></div>`;
  function penBtn(d, key, title) {
    if (dl.sec === key || !R.sectionEditable(state(), d, key, U.actor())) return '';
    return `<button type="button" class="icon-btn edit-sec" data-edsec="${key}" title="${esc(D.editSec(title))}" aria-label="${esc(D.editSec(title))}">${PENCIL}</button>`;
  }
  const secCard = (d, key, title, body) => `<section class="sec${dl.sec === key ? ' editing' : ''}" data-secbox="${key}"><div class="sec-h"><span>${esc(title)}</span>${penBtn(d, key, title)}</div>${dl.sec === key ? sectionFormHTML(key) + secFoot() : body}</section>`;
  const showD23 = (d, n) => n <= R.planOf(d).drafts || !R.isBlank(d[`expected_draft${n}_date`]) || !R.isBlank(d[`approved_draft${n}_date`]);
  const timelineFields = d => ['brief_date', 'expected_draft1_date', 'approved_draft1_date'].concat(showD23(d, 2) ? ['expected_draft2_date', 'approved_draft2_date'] : [])
    .concat(showD23(d, 3) ? ['expected_draft3_date', 'approved_draft3_date'] : []).concat(['expected_post_date']);
  const ctaChip = d => (R.ctaDiffers(state(), d) ? ` <span class="chip-diff" title="${esc(D.ctaCampaign(R.campaignCta(state(), d.campaign_id)))}">${esc(D.ctaDiffers)}</span>` : '');
  const termChip = d => (R.termDiffers(d, R.kolById(state(), d.kol_id)) ? ` <span class="chip-diff" title="${esc(D.kolTerm(C.term[R.kolById(state(), d.kol_id).default_payment_term]))}">${esc(D.termDiffers)}</span>` : '');
  function viewHTML(d) {
    const s = state(), ctx = R.dealContext(s), td = today(), k = R.kolById(s, d.kol_id) || {}, camp = ctx.campaigns.get(d.campaign_id) || {}, p = phaseById(R.primaryPhase(ctx.phaseIdx, d.deal_id)) || {};
    const posts = R.postsOfCtx(ctx, d.deal_id), res = R.validateDeal(s, d, posts, td, ctx);
    const issues = { errs: res.errs, warns: res.warns.filter(w => w.kind !== 'phase'), infos: [] };
    const tier = ctx.tiers.get(d.deal_id) || {};
    const pay = payViewHTML(d);
    const timeline = timelineFields(d).map(f => kvF(d, f, R.dmy(d[f]))).join('');
    const costs = ['rate_card', 'gencode_expense', 'gencode_period'].map(f => kvF(d, f, money(d[f]))).join('') +
      kvF(d, 'gencode_start_date', R.dmy(d.gencode_start_date)) + kvAuto(F.gencode_end_date, esc(R.dmy(R.gencodeEndDate(d)) || C.common.none)) +
      ['basket_fee', 'asset_fee', 'expediting_fee'].map(f => kvF(d, f, money(d[f]))).join('') +
      kvAuto(D.tier, esc(tier.tier || R.UNKNOWN_TIER)) + kvAuto(F.total_cost, R.baht(R.totalCost(d)), 'total') + (d.kol_id ? `<div class="hint" style="margin-top:6px">${esc(U.priceRefSummary(d.kol_id, d.deal_id))}</div>` : '') + budgetHTML(s, d, ctx);
    const info2 = kvF(d, 'pillar', d.pillar) + kvF(d, 'pic', d.pic) + `<div class="kv"><span>${esc(F.cta)}</span><b>${d.cta ? esc(d.cta) : `<span class="muted">${C.common.none}</span>`}${ctaChip(d)}${lockMark(lockOf(d, 'cta'))}</b></div>` +
      kvF(d, 'products', [R.dealProductsText(s, R.dealProductList(s, d.deal_id))].concat(R.dealProductList(s, d.deal_id).filter(x => d.campaign_id && !R.campaignHasProduct(s, d.campaign_id, x.tr_code))   // CR-09 §4.7: kept after it left the Campaign
        .map(x => C.msg.productKeptNotInCampaign(R.productShort(R.productByCode(s, x.tr_code) || { product_name: x.tr_code })))).filter(Boolean).join(' · ')) +   // CR-10 §4.14: delivery lives in Samples
      `<div class="kv"><span>${esc(F.link_brief)}</span><b>${d.link_brief ? `<a href="${esc(d.link_brief)}" target="_blank" rel="noopener">${esc(D.open)} ↗</a>` : `<span class="muted">${C.common.none}</span>`}${lockMark(lockOf(d, 'link_brief'))}</b></div>` +
      kvF(d, 'remark', d.remark) + (d.status === 'Cancel' ? kvF(d, 'cancel_reason', d.cancel_reason) : '');
    const phases = R.phasesOfCampaign(s, d.campaign_id);
    const postCards = posts.map(x => { const a = ctx.accounts.get(x.account_id) || {}, done = R.postDone(x);
      return `<div class="post" data-post="${esc(x.post_id)}"><div class="top"><span>${pfIcon(a.platform || x.platform || 'Other', done ? 'posted' : 'planned', done ? D.tipPosted(a.platform || x.platform, R.dmy(x.post_date)) : D.tipPlanned(a.platform || x.platform, R.dmy(x.expected_post_date)))} @${esc(a.handle || '')}${lockMark(lockOf(d, 'account_id', x))}</span><span class="st ${done ? 'done' : 'list'}">${esc(done ? D.posted : D.planned)}</span></div>` +
        `<div class="meta"><span>${esc(F.phase_override)} ${phaseTagHTML(R.resolvePostPhase(x, phases))}</span><span>${esc(F.expected_post_date)} ${R.dmy(x.expected_post_date) || '—'}</span><span>${esc(F.post_date)} ${R.dmy(x.post_date) || '—'}</span>${x.gencode_code ? `<span>${esc(F.gencode_code)} ${esc(x.gencode_code)}</span>` : ''}</div>` +
        (x.post_link ? `<a href="${esc(x.post_link)}" target="_blank" rel="noopener" class="small">${esc(x.post_link.length > 70 ? x.post_link.slice(0, 70) + '…' : x.post_link)}</a>` : '') +
        `<div class="meta">${R.METRIC_KEYS.map(m => `<span>${esc(F[m])} ${R.fmtNum(x[m]) || '—'}</span>`).join('')}${x.metrics_updated_at ? `<span>${esc(D.asOf(R.dmy(x.metrics_updated_at)))}</span>` : ''}</div></div>`; }).join('');
    const ids = (d.legacy_job_ids || []).concat(d.source_record_ids || []);
    const source = ids.length ? `<details class="sec"><summary><span>${esc(D.secSource)}</span><span class="chev">${ICON.chevron}</span></summary>` +
      kvF(d, 'legacy_job_ids', (d.legacy_job_ids || []).join(', '), D.legacyJobs) + kvF(d, 'source_record_ids', (d.source_record_ids || []).join(', '), D.sourceRecords) + `</details>` : '';
    /* header: KOL and deal ID never change · Campaign: ✎ for an admin while the deal has no dated post and is before Confirm QT */
    const campFe = lockOf(d, 'campaign_id');
    const head = dl.sec === 'header' ? `<div class="hdr-edit">${sectionFormHTML('header')}${secFoot()}</div>` : '';
    return `<div class="dr-head">
        <div class="dr-title"><div class="t"><h2><button type="button" data-kol="${esc(d.kol_id)}" title="${esc(D.openKol)}">${esc(k.display_name || d.kol_id)}</button>${U.copyBtnHTML(k.display_name || d.kol_id)}${lockMark(lockOf(d, 'kol_id'))}</h2>
          ${dl.backTo ? `<button type="button" class="link backstage" data-backstage>${esc(D.backTo(dl.backTo))}</button>` : ''}
          <div class="dr-sub"><span>${esc(d.deal_id)}${lockMark(lockOf(d, 'deal_id'))} · ${esc(camp.campaign_name || '')}${campFe.editable ? penBtn(d, 'header', F.campaign_id) : lockMark(campFe)}${p.phase_id ? ` · ${esc(R.phaseName(s, p.phase_id))}` : ''}</span>${stageChip(d)}${d.is_legacy ? `<span class="badge-legacy" title="${esc(D.legacyTip)}">${esc(D.legacy)}</span>` : ''}</div></div>${closeBtn}</div>
        ${head}
        ${can('deal.edit') && !R.campaignCancelled(s, d.campaign_id) ? `<div class="dr-actions"><button type="button" class="btn primary" data-act="move">${esc(D.move)}</button></div>` : ''}
      </div>
      <div class="dr-body">
        ${issues.errs.length || issues.warns.length ? `<section class="sec"><div class="checks">${checksHTML(issues, '')}</div></section>` : ''}
        ${journeySecHTML(s, d, posts)}
        ${KT.samples.sectionHTML(d)}
        <div class="dgrid"><div class="dg-l">
          ${secCard(d, 'info', D.secDeal, info2)}
          ${secCard(d, 'costs', D.secCosts, costs)}
          ${secCard(d, 'timeline', D.secTimeline, timeline)}
        </div><div class="dg-r">
          ${secCard(d, 'payment', D.secPayment, pay.replace('</b></div>', `${termChip(d)}${lockMark(lockOf(d, 'payment_term'))}</b></div>`))}
          ${secCard(d, 'posts', D.secPosts(posts.length), posts.length ? postCards : `<div class="hint">${esc(D.noPosts)}</div>`)}
        </div></div>
        ${source}
        <details class="sec"><summary><span>${esc(D.secHistory)}</span><span class="chev">${ICON.chevron}</span></summary>${historyHTML(s, d)}</details>
      </div>`;
  }
  /* ---------- the open section's form: inputs for open fields, the value + 🔒 for locked ones ---------- */
  const inpF = (d, f, type) => `<input type="${type || 'text'}" id="f_${f}" data-f="${f}" data-key="${f}" value="${esc(asText(d[f]))}"${type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''} autocomplete="off">`;
  const selF = (d, f, items, ph) => `<select id="f_${f}" data-f="${f}" data-key="${f}">${optionsHTML(items, d[f], ph)}</select>`;
  function fieldOr(stored, f, label, input, o = {}, shown) {
    const fe = lockOf(stored, f);
    if (fe.editable) return field(f, label, input, o);
    return `<div class="field${o.wide ? ' wide' : ''}"><label>${esc(label)}</label><div class="ro">${R.isBlank(shown) ? `<span class="muted">${C.common.none}</span>` : esc(shown)}${lockMark(fe)}</div></div>`;
  }
  function sectionFormHTML(key) {
    const s = state(), d = dl.draft, stored = dealById(dl.id), accs = R.accountsOfKol(s, d.kol_id);
    if (key === 'header') return `<div class="fields">${field('campaign_id', F.campaign_id, `<select id="f_campaign_id" data-f="campaign_id" data-key="campaign_id" data-combo="campaign">${campaignOptionsHTML(d.campaign_id, D.chooseCampaign)}</select>`, { req: 1, wide: 1, hint: esc(D.campaignMoveHint) })}</div>`;
    if (key === 'info') return `<div class="fields">
        ${fieldOr(stored, 'pillar', F.pillar, selF(d, 'pillar', activeList('pillar_list', d.pillar), D.none), {}, d.pillar)}
        ${fieldOr(stored, 'pic', F.pic, selF(d, 'pic', picList(d.pic), D.none), { req: !d.is_legacy }, d.pic)}
        ${fieldOr(stored, 'cta', F.cta, selF(d, 'cta', activeList('cta_list', d.cta), D.none), { hint: '<span id="dl_ctaHint"></span>' }, d.cta)}
        ${lockOf(stored, 'products').editable ? productsField() : fieldOr(stored, 'products', F.products, '', { wide: 1 }, R.dealProductsText(s, d.products))}
        ${fieldOr(stored, 'link_brief', F.link_brief, inpF(d, 'link_brief', 'url'), { wide: 1 }, d.link_brief)}
        ${field('remark', F.remark, `<textarea id="f_remark" data-f="remark" data-key="remark">${esc(asText(d.remark))}</textarea>`, { wide: 1 })}
        ${d.status === 'Cancel' ? field('cancel_reason', F.cancel_reason, inpF(d, 'cancel_reason'), { wide: 1 }) : ''}
      </div>`;
    if (key === 'payment') return payFormHTML(d, false, R.kolById(s, d.kol_id), stored);
    if (key === 'costs') {
      const needs = R.DEAL_SECTIONS.costs.some(f => lockOf(stored, f).needsReason);
      const ci = f => (R.COST_KEYS.includes(f) ? asCost(inpF(d, f, 'number'), f) : inpF(d, f, 'number'));
      return costBlock(`<div class="fields">
          ${['rate_card', 'gencode_expense', 'gencode_period'].map(f => fieldOr(stored, f, F[f], ci(f), {}, money(d[f]))).join('')}
          ${fieldOr(stored, 'gencode_start_date', F.gencode_start_date, dateF('gencode_start_date', d), { hint: `<button type="button" class="link" data-act="firstPost">${esc(D.useFirstPost)}</button> · ${esc(F.gencode_end_date)} <b id="dl_gend"></b> <span class="autotag">${esc(C.lock.auto)}</span>` }, R.dmy(d.gencode_start_date))}
          ${['basket_fee', 'asset_fee', 'expediting_fee'].map(f => fieldOr(stored, f, F[f], ci(f), {}, money(d[f]))).join('')}
          ${needs ? `<div class="field wide"><label for="f_cost_reason">${esc(D.costReason)} <span class="req">*</span></label><textarea id="f_cost_reason" data-reason data-key="cost_reason">${esc(dl.costReason)}</textarea><div class="hint">${esc(C.lock.paymentRecordedAdmin)}</div></div>` : ''}
        </div>`, `<div class="kv total" style="margin-top:8px"><span>${esc(F.total_cost)}</span><b><span id="dl_total"></span> <span class="autotag">${esc(C.lock.auto)}</span></b></div>`, d.kol_id, d, d.deal_id) + `<div id="dl_budget"></div>`;
    }
    if (key === 'timeline') return `<div class="fields">${timelineFields(d).map(f => fieldOr(stored, f, F[f], dateF(f, d), {}, R.dmy(d[f]))).join('')}</div>`;
    if (key === 'posts') return `<div id="dl_posts">${dl.posts.map((p, i) => postCardHTML(p, i, accs)).join('') || `<div class="hint">${esc(D.noPosts)}</div>`}</div>` +
      `<div class="btns" style="margin-top:8px"><button type="button" class="btn small" data-act="addPost">${esc(D.addPost)}</button>${d.kol_id ? `<button type="button" class="link" data-act="addAccount">${esc(D.addAccount)}</button>` : ''}</div>`;
    return '';
  }
  /* Payment fields — new deal (CR-04 §4.8: the KOL's default, "From KOL Master" / "Changed for this deal") or the drawer's Payment section */
  function payFormHTML(d, isNew, k, stored) {
    const src = R.termSource(k, d.payment_term);
    const termFe = stored ? lockOf(stored, 'payment_term') : { editable: true };
    const termSel = `<select id="f_payment_term" data-f="payment_term" data-key="payment_term">${optionsHTML(R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), d.payment_term, isNew ? D.chooseTerm : C.term.none)}</select>`;
    const hint = !isNew || !k ? '' : src === 'kol' ? `<span class="srctag">${esc(D.termFromKol)}</span>` : src === 'changed' ? `<span class="srctag">${esc(D.termChanged)}</span>` : '';
    const box = !isNew || !k ? '' : src === 'none' ? `<label class="tick"><input type="checkbox" data-saveterm${dl.saveTerm ? ' checked' : ''}> ${esc(D.saveAsDefault)}</label>`
      : src === 'changed' ? `<label class="tick"><input type="checkbox" data-updterm${dl.updateKolTerm ? ' checked' : ''}> ${esc(D.alsoUpdateKol)}</label>` : '';
    return `<div class="fields">${termFe.editable ? field('payment_term', D.term, termSel, { req: isNew, hint }) : fieldOr(stored, 'payment_term', D.term, '', {}, C.term[R.termOf(d) || 'none'])}` +
      (box ? `<div class="field"><label>&nbsp;</label>${box}</div>` : '') + `</div>` +
      `<div class="hint">${esc(R.termOf(d) === 'free' ? D.freeNoPay : C.pay.paidFromPayments)}</div>`;
  }

  /* ---------- open / close a section ---------- */
  function copyForEdit(d) {
    const draft = JSON.parse(JSON.stringify(d));
    R.MONEY_KEYS.concat(['gencode_period']).forEach(k => { draft[k] = asText(draft[k]); });
    draft.products = R.dealProductList(state(), d.deal_id).map(x => ({ tr_code: x.tr_code, qty: String(x.qty), note: x.note }));
    return draft;
  }
  async function startSection(key) {
    const d = dealById(dl.id); if (!d || !guard('deal.edit') || !R.sectionEditable(state(), d, key, U.actor())) return;
    if (dl.sec === key) return;
    if (dl.sec && dl.dirty && !(await U.confirmDialog(C.common.discardTitle, C.common.discardBody, C.common.discard, true))) return;
    dl.posts = R.postsOf(state(), d.deal_id).map(p => { const c = JSON.parse(JSON.stringify(p)); R.METRIC_KEYS.forEach(k => { c[k] = asText(c[k]); }); return c; });
    Object.assign(dl, { sec: key, draft: copyForEdit(d), ticks: null, dirty: false, costReason: '' }); dl.touched.clear();
    renderPanel();
    const box = $('drawer_content').querySelector(`[data-secbox="${key}"], .hdr-edit`); if (box) box.scrollIntoView({ block: 'nearest' });
  }
  function cancelSection() { Object.assign(dl, { sec: null, draft: null, posts: null }); dl.touched.clear(); renderPanel(); }
  /* CR-10 §4.10 — + New deal opens the tab used last (Single KOL · Bulk shortlist) */
  const ndTabKey = () => 'newdealtab_' + (userId() || '');
  function startNewSingle() { pref.set(ndTabKey(), 'single'); startNew(); }
  function startNew(keep) {
    if (!guard('deal.edit')) return;
    if (!keep && pref.get(ndTabKey(), 'single') === 'bulk' && !editing()) { KT.bulk.open({ campaignId: dl.f.campaign }); return; }
    if (editing()) { toast(C.common.blockWhileEditing); renderPanel(); return; }
    const s = state(), step = R.shortlistStep(s.lookups), picked = dl.f.campaign || (phaseById(dl.f.phaseSel) || {}).campaign_id || '';
    const draft = JSON.parse(JSON.stringify(R.DEAL_TEMPLATE));
    R.MONEY_KEYS.concat(['gencode_period']).forEach(k => { draft[k] = ''; });
    draft.products = [];
    /* CR-04 §4.6: PIC = you when you are a PIC (else the KOL's, once a KOL is chosen) · §4.7: CTA from the Campaign */
    const pic = R.defaultPic(U.me(), null);
    Object.assign(draft, { deal_id: null, campaign_id: picked || R.defaultCampaignId(s, today()) || '', kol_id: '', sub_status: step ? step.sub_status : '', status: step ? step.status : 'List', pic: pic.pic || '' }, keep || {});
    if (R.isBlank(draft.cta)) draft.cta = R.campaignCta(s, draft.campaign_id) || '';
    Object.assign(dl, { mode: 'new', id: null, sec: null, draft, posts: [], ticks: new Set(), showDraft23: false, dirty: false, saveTerm: false, updateKolTerm: false, newOverrides: new Map(),
      submitted: false, createKol: null, kolText: null, termFromKol: false,
      picSource: keep && keep.pic ? (keep.pic === pic.pic ? pic.source : null) : pic.source, ctaFromCampaign: !R.isBlank(draft.cta) && draft.cta === R.campaignCta(s, draft.campaign_id) }); dl.touched.clear();
    markSelected(); renderPanel();
  }
  function cancelEdit() {
    if (dl.mode === 'new') { U.closeDrawer(); return; }
    cancelSection();
  }
  function setDraftKol(kolId) {
    const s = state(), d = dl.draft, k = R.kolById(s, kolId); if (!k) return;
    d.kol_id = kolId; dl.dirty = true;
    if (dl.mode === 'new') {
      /* CR-04 §4.6: you (a PIC) → the KOL's PIC → none; a PIC picked by hand stays */
      if (!d.pic || dl.picSource) { const dp = R.defaultPic(U.me(), k); d.pic = dp.pic || ''; dl.picSource = dp.source; }
      /* CR-04 §4.8: the KOL's default term (a KOL without one: choose, and "Save as this KOL's default" is ticked) */
      d.payment_term = R.isTerm(k.default_payment_term) ? k.default_payment_term : '';
      dl.saveTerm = !R.isTerm(k.default_payment_term); dl.updateKolTerm = false; dl.termFromKol = R.isTerm(k.default_payment_term); dl.kolText = null;
      const accs = R.accountsOfKol(s, kolId); dl.ticks = new Set(accs.length === 1 ? [accs[0].account_id] : []);
    }
    renderPanel();
  }
  const kolLabel = k => `${k.display_name} · ${k.kol_id}`;
  /* what was typed → one KOL: "name · K0002" · or a name / @handle that only one KOL has (case, @ and spaces ignored) */
  function resolveKol(text) {
    const s = state(), v = R.trim(text), m = /(K\d+)\s*$/i.exec(v);
    if (m && R.kolById(s, m[1].toUpperCase())) return m[1].toUpperCase();
    const q = R.normKey(v); if (!q) return '';
    const same = R.kolMatches(s, v, 50).filter(k => R.normKey(k.display_name) === q || R.accountsOfKol(s, k.kol_id).some(a => R.normKey(a.handle) === q));
    return same.length === 1 ? same[0].kol_id : '';
  }
  /* CR-10 §4.10 — the KOL box no longer names a KOL: what came with the old one goes (payment term from it, accounts, PIC from it) · the text stays */
  function clearDraftKol(text) {
    const d = dl.draft; d.kol_id = ''; dl.kolText = text;
    if (dl.termFromKol) d.payment_term = '';
    Object.assign(dl, { termFromKol: false, saveTerm: false, updateKolTerm: false, ticks: new Set() });
    if (dl.picSource === 'kol') { const dp = R.defaultPic(U.me(), null); d.pic = dp.pic || ''; dl.picSource = dp.source; }
    renderPanel();
  }
  /* ---------- CR-10 §4.10 — Create KOL inside New deal (the form keeps everything typed) ---------- */
  function openCreateKol(text) {
    if (!guard('kol.edit') && !guard('deal.edit')) return;
    dl.createKol = { draft: R.createKolDraft(text, U.me()), touched: new Set(), submitted: false, anyway: false };
    renderPanel();
    const n = $('f_ck_display_name'); if (n) n.focus();
  }
  function createKolHTML() {
    const s = state(), c = dl.createKol, x = c.draft, L = s.lookups, CK = C.bulk.ck;
    const inp = (k, type) => `<input${type ? ` type="${type}"` : ''} id="f_ck_${k}" data-ck="${k}" data-key="ck_${k}" value="${esc(x[k] == null ? '' : x[k])}" autocomplete="off"${type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''}>`;
    const sel = (k, items, ph) => `<select id="f_ck_${k}" data-ck="${k}" data-key="ck_${k}">${optionsHTML(items, x[k], ph)}</select>`;
    const types = (L.kol_type_list || []).filter(t => t.active !== false).map(t => ({ value: t.key, label: t.label }));
    return `<div class="dr-head"><div class="dr-title"><div class="t"><button type="button" class="link" data-act="ckBack">← ${esc(CK.back)}</button><h2>${esc(CK.title)}</h2><div class="dr-sub"><span>${esc(CK.sub)}</span></div></div>${closeBtn}</div></div>
      <div class="dr-body"><section class="sec"><div id="ck_dup"></div><div class="fields">
        ${field('ck_display_name', CK.name, inp('display_name'), { req: 1, wide: 1 })}
        ${field('ck_platform', CK.platform, sel('platform', (L.platform_list || []).map(v => ({ value: v, label: v })), CK.choose))}${field('ck_handle', CK.handle, inp('handle'), { hint: esc(CK.handleHint) })}
        ${field('ck_followers', CK.followers, inp('followers', 'number'))}${field('ck_profile_link', CK.profileLink, inp('profile_link', 'url'))}
        ${field('ck_kol_type', CK.type, sel('kol_type', types, CK.notSet))}${field('ck_kol_category', CK.category, inp('kol_category'))}
        ${field('ck_gender', CK.gender, sel('gender', R.GENDERS.map(v => ({ value: v, label: v })), CK.notSet))}${field('ck_contact_channel', CK.contact, sel('contact_channel', R.CONTACT_CHANNELS.map(v => ({ value: v, label: v })), CK.notSet))}
        ${field('ck_pic', CK.pic, sel('pic', picList(x.pic).map(v => ({ value: v, label: v })), CK.choose), { req: 1 })}
        ${field('ck_default_payment_term', CK.term, sel('default_payment_term', R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), C.term.none), { hint: esc(CK.termHint) })}
      </div></section></div>
      <div class="dr-foot"><div class="checks" id="ck_checks"></div><div class="btns"><button type="button" class="btn" data-act="ckBack">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="ckCreate">${esc(CK.create)}</button></div></div>`;
  }
  function ckCheck() {
    const c = dl.createKol; if (!c) return null;
    const s = state(), res = R.validateCreateKol(s, c.draft), dup = R.findDuplicateKol(s, c.draft.display_name, c.draft.handle), CK = C.bulk.ck;
    $('ck_dup').innerHTML = dup ? `<div class="ck-dup"><span>${esc(CK.already(dup.kol.display_name, dup.handle))}</span><button type="button" class="btn small" data-act="ckUse" data-kolid="${esc(dup.kol.kol_id)}">${esc(CK.useThis)}</button>` +
      `<label class="tick small"><input type="checkbox" data-ckanyway${c.anyway ? ' checked' : ''}> ${esc(CK.createAnyway)}</label></div>` : '';
    const show = res.errs.filter(e => c.submitted || c.touched.has(e.field));
    $('ck_checks').innerHTML = checksHTML({ errs: show, warns: [], infos: [] }, '');
    $('drawer_content').querySelectorAll('[data-ck]').forEach(el => el.classList.toggle('invalid', show.some(e => e.field === el.dataset.key)));
    const btn = $('drawer_content').querySelector('[data-act="ckCreate"]'); if (btn) btn.disabled = (c.submitted && res.errs.length > 0) || (!!dup && !c.anyway);
    return { res, dup };
  }
  function wireCreateKol() {
    const box = $('drawer_content'), c = dl.createKol;
    box.querySelectorAll('[data-ck]').forEach(el => {
      const h = () => { c.draft[el.dataset.ck] = el.value; dl.dirty = true; ckCheck(); };
      el.addEventListener('input', h); el.addEventListener('change', () => { c.touched.add(el.dataset.key); h(); }); el.addEventListener('blur', () => { c.touched.add(el.dataset.key); ckCheck(); });
    });
    box.addEventListener('change', e => { if (e.target.matches('[data-ckanyway]') && dl.createKol) { dl.createKol.anyway = e.target.checked; ckCheck(); } });
    ckCheck();
  }
  /* Create KOL → KOL Master (+ the account) → back to New deal with that KOL picked · everything else typed stays */
  function ckCreate() {
    const c = dl.createKol; if (!c || !guard('deal.edit')) return;
    c.submitted = true;
    const r = ckCheck(); if (!r || r.res.errs.length || (r.dup && !c.anyway)) return;
    const s = state(), recs = R.createKolRecords(c.draft, { kolId: store.newId('kol'), accountId: store.newId('account') });
    s.kol_master.push(recs.kol); if (recs.account) s.kol_accounts.push(recs.account);
    dl.createKol = null; commit(C.bulk.ck.created(recs.kol.display_name));
    setDraftKol(recs.kol.kol_id);
  }
  function draftPosts() {
    if (dl.mode !== 'new') return dl.posts;
    const s = state();
    return [...dl.ticks].map(aid => Object.assign(R.blankPost(null, aid, (s.kol_accounts.find(a => a.account_id === aid) || {}).platform, dl.draft.expected_post_date || null),
      { phase_override: (dl.newOverrides && dl.newOverrides.get(aid)) || null }));
  }
  const dateF = (f, d, extra) => dateHTML(`id="f_${f}" data-f="${f}" data-key="${f}"${extra || ''}`, d[f], { label: F[f] });
  function formHTML() {
    const s = state(), d = dl.draft, isNew = dl.mode === 'new', L = s.lookups, k = R.kolById(s, d.kol_id), accs = d.kol_id ? R.accountsOfKol(s, d.kol_id) : [];
    const inp = (f, type) => `<input type="${type || 'text'}" id="f_${f}" data-f="${f}" data-key="${f}" value="${esc(asText(d[f]))}"${type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''} autocomplete="off">`;
    const sel = (f, items, ph) => `<select id="f_${f}" data-f="${f}" data-key="${f}">${optionsHTML(items, d[f], ph)}</select>`;
    const startSteps = R.stepsOf(L).filter(st => st.active !== false && !R.isCancelStep(st)).map(st => ({ value: st.sub_status, label: st.sub_status }));
    /* CR-02 §4.3 — the term decides which ticks apply; a new deal must have one (CR-04 §4.8: from the KOL default, or chosen here) */
    const pay = payFormHTML(d, isNew, k, null);
    const d23 = dl.showDraft23 ? ['expected_draft2_date', 'approved_draft2_date', 'expected_draft3_date', 'approved_draft3_date'].map(f => field(f, F[f], dateF(f, d))).join('')
      : `<div class="field wide"><button type="button" class="link" data-act="showD23">${esc(D.showDraft23)}</button></div>`;
    const posts = isNew ? (d.kol_id ? `<div class="hint" style="margin-bottom:6px">${esc(D.postAccounts)}</div>` + accs.map(a => `<label class="tick block"><input type="checkbox" data-tick="${esc(a.account_id)}"${dl.ticks.has(a.account_id) ? ' checked' : ''}> ` +
      `${pfIcon(a.platform)} @${esc(a.handle)} <span class="muted">${R.fmtNum(a.followers)}</span></label><div class="newphase" data-newphase="${esc(a.account_id)}"></div>`).join('') : `<div class="hint">${esc(D.chooseKolFirst)}</div>`)
      : dl.posts.map((p, i) => postCardHTML(p, i, accs)).join('') || `<div class="hint">${esc(D.noPosts)}</div>`;
    const title = isNew ? D.newTitle : D.editTitle(d.deal_id);
    const tabs = isNew ? `<div class="stabs nd-tabs" role="tablist"><button type="button" role="tab" class="on" aria-selected="true">${esc(C.bulk.tabSingle)}</button><button type="button" role="tab" data-act="bulkTab">${esc(C.bulk.tabBulk)}</button></div>` : '';
    return `<div class="dr-head">${tabs}<div class="dr-title"><div class="t"><h2>${esc(title)}</h2><div class="dr-sub">${k ? `<span>${esc(k.display_name)}</span>` : ''}${!isNew ? stageChip(d) : ''}${!isNew && d.is_legacy ? `<span class="badge-legacy">${esc(D.legacy)}</span>` : ''}</div></div>${closeBtn}</div></div>
      <div class="dr-body">
        ${sec(D.secDeal, `<div class="fields">
          ${field('campaign_id', F.campaign_id, `<select id="f_campaign_id" data-f="campaign_id" data-key="campaign_id" data-combo="campaign">${campaignOptionsHTML(d.campaign_id, D.chooseCampaign)}</select>`, { req: 1, wide: 1 })}
          ${field('kol_id', F.kol_id, `<div class="kolbox"><input id="f_kol_id" data-kolin data-key="kol_id" role="combobox" aria-expanded="false" aria-controls="dl_kolpop" aria-autocomplete="list" value="${esc(k ? kolLabel(k) : dl.kolText || '')}" placeholder="${esc(D.kolSearch)}" autocomplete="off"><div class="kolpop hidden" id="dl_kolpop" role="listbox"></div></div>`,
            { req: 1, wide: 1, hint: (k ? `${U.reliabilityChip(R.kolPerformance(s, k.kol_id, today()))} ` : '') + (isNew ? `<button type="button" class="link" data-act="newKol">${esc(D.newKol)}</button>` : '') })}
          ${isNew ? field('sub_status', D.startStep, sel('sub_status', startSteps), { req: 1, wide: 1 }) : `<div class="field wide"><label>${esc(D.stage)}</label><div class="hint">${esc(D.moveInView)}</div></div>`}
          ${!isNew && d.status === 'Cancel' ? field('cancel_reason', F.cancel_reason, inp('cancel_reason'), { wide: 1 }) : ''}
          ${field('pillar', F.pillar, sel('pillar', activeList('pillar_list', d.pillar), D.none))}
          ${field('pic', F.pic, sel('pic', picList(d.pic), D.none), { req: !d.is_legacy, hint: dl.picSource ? `<span class="srctag">${esc(dl.picSource === 'user' ? D.picYou : D.picKol)}</span>` : '' })}
          ${field('cta', F.cta, sel('cta', activeList('cta_list', d.cta), D.none), { hint: '<span id="dl_ctaHint"></span>' })}
          ${productsField()}
          ${field('link_brief', F.link_brief, inp('link_brief', 'url'), { wide: 1 })}
          ${field('remark', F.remark, `<textarea id="f_remark" data-f="remark" data-key="remark">${esc(asText(d.remark))}</textarea>`, { wide: 1 })}
        </div>`)}
        ${sec(D.secPayment, pay)}
        ${sec(D.secCosts, costBlock(`<div class="fields">
          ${field('rate_card', F.rate_card, asCost(inp('rate_card', 'number'), 'rate_card'))}${field('gencode_expense', F.gencode_expense, asCost(inp('gencode_expense', 'number'), 'gencode_expense'))}
          ${field('gencode_period', F.gencode_period, inp('gencode_period', 'number'))}
          ${field('gencode_start_date', F.gencode_start_date, dateF('gencode_start_date', d), { hint: `<button type="button" class="link" data-act="firstPost">${esc(D.useFirstPost)}</button> · ${esc(F.gencode_end_date)} <b id="dl_gend"></b>` })}
          ${['basket_fee', 'asset_fee', 'expediting_fee'].map(f => field(f, F[f], asCost(inp(f, 'number'), f))).join('')}
        </div>`, `<div class="kv total" style="margin-top:8px"><span>${esc(F.total_cost)}</span><b id="dl_total"></b></div>`, d.kol_id, d) + `<div id="dl_budget"></div>`)}
        ${sec(D.secTimeline, `<div class="fields">${['brief_date', 'expected_draft1_date', 'approved_draft1_date'].map(f => field(f, F[f], dateF(f, d))).join('')}${d23}
          ${field('expected_post_date', F.expected_post_date, dateF('expected_post_date', d))}</div>`)}
        ${sec(D.secPosts(isNew ? dl.ticks.size : dl.posts.length), `<div id="dl_posts">${posts}</div>` +
          `<div class="btns" style="margin-top:8px">${!isNew ? `<button type="button" class="btn small" data-act="addPost">${esc(D.addPost)}</button>` : ''}${d.kol_id ? `<button type="button" class="link" data-act="addAccount">${esc(D.addAccount)}</button>` : ''}</div>`)}
      </div>
      <div class="dr-foot"><div class="checks" id="dl_checks"></div>
        <div class="btns">${isNew ? `<button type="button" class="btn" data-act="saveNext">${esc(D.saveNext)}</button>` : ''}<button type="button" class="btn" data-act="cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="save">${esc(C.common.save)}</button></div></div>`;
  }
  /* CR-06 §4.3 — a deal's products: only the Campaign's products, each with a qty (default 1) */
  const productsField = () => `<div class="field wide"><label for="f_padd">${esc(F.products)}</label><div class="dprods" id="dl_prods">${productsBox()}</div></div>`;
  function productsBox() {
    const s = state(), d = dl.draft, P = C.products, list = d.products || [], all = R.campaignProducts(s, d.campaign_id).filter(p => p.active !== false);
    const free = all.filter(p => !list.some(x => R.sameCode(x.tr_code, p.tr_code)));
    const rows = list.map((x, i) => { const p = R.productByCode(s, x.tr_code) || { tr_code: x.tr_code, product_name: x.tr_code };
      return `<div class="dprod"><span class="pn" title="${esc(R.productLabel(p))}">${esc(R.productShort(p))} <span class="muted small">${esc(p.tr_code)}</span></span>` +
        `<label class="qty"><span class="muted small">${esc(P.qty)}</span><input type="number" min="1" step="1" inputmode="numeric" data-pq="${i}" data-key="product${i}_qty" value="${esc(x.qty)}" aria-label="${esc(`${P.qty} ${p.tr_code}`)}"></label>` +
        `<button type="button" class="x" data-pdel="${i}" aria-label="${esc(`${P.remove} ${p.tr_code}`)}">×</button></div>`; }).join('');
    const add = !d.campaign_id ? '' : !all.length ? `<div class="hint">${esc(P.dealNoCampaignProducts)}</div>`
      : free.length ? `<select id="f_padd" data-padd aria-label="${esc(P.dealAdd)}"><option value="">${esc(P.dealAdd)}</option>${free.map(p => `<option value="${esc(p.tr_code)}">${esc(R.productLabel(p))}</option>`).join('')}</select>` : '';
    return (rows || `<div class="hint">${esc(P.dealNone)}</div>`) + add;
  }
  const redrawProducts = () => { const el = $('dl_prods'); if (el) el.innerHTML = productsBox(); };
  /* "TR×qty, …" for the change log */
  const productsLog = list => (list || []).map(x => `${x.tr_code}×${x.qty}`).join(', ') || null;
  function postCardHTML(p, i, accs) {
    const key = k => `post${i}_${k}`, inp = (k, type) => `<input type="${type || 'text'}" id="f_${key(k)}" data-p="${k}" data-key="${key(k)}" value="${esc(asText(p[k]))}"${type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''} autocomplete="off">`;
    const dateP = k => dateHTML(`id="f_${key(k)}" data-p="${k}" data-key="${key(k)}"`, p[k], { label: F[k] });
    const accOpts = accs.map(a => ({ value: a.account_id, label: `${a.platform} @${a.handle}` }));
    if (p.account_id && !accs.some(a => a.account_id === p.account_id)) accOpts.push({ value: p.account_id, label: D.otherAccount(p.account_id) });
    const f = (k, label, input, wide) => `<div class="field${wide ? ' wide' : ''}"><label for="f_${key(k)}">${esc(label)}</label>${input}</div>`;
    return `<div class="acc-edit" data-pi="${i}"><div class="top"><span>${esc(D.postN(i + 1))}${p.is_legacy ? ` <span class="badge-legacy">${esc(D.legacy)}</span>` : ''}</span>
        <button type="button" class="link" data-postdel="${i}">${esc(D.removePost)}</button></div>
      <div class="fields">
        ${p.post_id && !R.isBlank((R.postsOf(state(), p.deal_id).find(x => x.post_id === p.post_id) || {}).post_link)
          ? `<div class="field wide"><label>${esc(F.account_id)}</label><div class="ro">${esc((accOpts.find(o => o.value === p.account_id) || {}).label || p.account_id)}${lockMark({ editable: false, reason: C.lock.postHasLink })}</div></div>`
          : f('account_id', F.account_id, `<select id="f_${key('account_id')}" data-p="account_id" data-key="${key('account_id')}">${optionsHTML(accOpts, p.account_id, D.chooseAccount)}</select>`, 1)}
        ${f('expected_post_date', F.expected_post_date, dateP('expected_post_date'))}${f('post_date', F.post_date, dateP('post_date'))}
        <div class="field wide" data-phasebox="${i}"><label>${esc(F.phase_override)}</label><div class="pbox"></div></div>
        ${f('post_link', F.post_link, inp('post_link', 'url'), 1)}<div class="field wide"><div class="hint" data-hint="${i}"></div></div>
        ${f('gencode_code', F.gencode_code, inp('gencode_code'))}${R.METRIC_KEYS.map(m => f(m, F[m], inp(m, 'text'))).join('')}
        ${f('metrics_updated_at', F.metrics_updated_at, dateP('metrics_updated_at'))}
      </div></div>`;
  }
  function wireForm() {
    const box = $('drawer_content'), d = dl.draft;
    U.enhanceCombos(box);
    /* the Phase pickers are drawn by check(): one delegated listener for the drawer (added once) */
    if (!box.dataset.phaseWired) {
      box.dataset.phaseWired = '1';
      box.addEventListener('change', e => {
        if (!editing()) return;
        const pp = e.target.closest('[data-pphase]'), np = e.target.closest('[data-newpick]');
        if (pp) { dl.posts[+pp.dataset.pphase].phase_override = pp.value || null; dl.dirty = true; check(); }
        if (np) { if (!dl.newOverrides) dl.newOverrides = new Map(); dl.newOverrides.set(np.dataset.newpick, np.value || null); dl.dirty = true; check(); }
      });
    }
    const dirty = () => { dl.dirty = true; };
    box.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f, h = () => { d[f] = el.value; dirty(); if (f === 'sub_status') d.status = R.statusOf(state().lookups, el.value) || d.status; check(); };
      el.addEventListener('input', h);
      el.addEventListener('change', () => {
        h(); dl.touched.add(el.dataset.key);
        if (f === 'pic') dl.picSource = null;
        if (f === 'cta') dl.ctaFromCampaign = false;
        if (f === 'campaign_id') { d.products = (d.products || []).filter(x => R.campaignHasProduct(state(), d.campaign_id, x.tr_code)); redrawProducts(); }
        /* a new deal takes the Campaign's CTA unless one was picked by hand */
        if (f === 'campaign_id' && dl.mode === 'new' && (dl.ctaFromCampaign || R.isBlank(d.cta))) { d.cta = R.campaignCta(state(), d.campaign_id) || ''; dl.ctaFromCampaign = !R.isBlank(d.cta); renderPanel(); return; }
        if (f === 'payment_term') { if (dl.mode === 'new') { dl.updateKolTerm = false; dl.termFromKol = false; } renderPanel(); return; }
        check();
      });
      el.addEventListener('blur', () => { dl.touched.add(el.dataset.key); check(); });
    });
    /* CR-10 §4.10 — the KOL box: names and @handles as you type · the last item creates a KOL from the text when nothing matches it exactly */
    const kin = box.querySelector('[data-kolin]'), pop = $('dl_kolpop');
    if (kin && pop) {
      let act = -1;
      const opts = () => [...pop.querySelectorAll('[data-kolopt]')];
      const show = () => {
        const s = state(), txt = kin.value.replace(/\s·\sK\d+$/, ''), q = R.normKey(txt), list = R.kolMatches(s, txt, 8);
        const exact = list.some(k => R.normKey(k.display_name) === q || R.accountsOfKol(s, k.kol_id).some(a => R.normKey(a.handle) === q));
        const create = dl.mode === 'new' && q && !exact ? `<button type="button" class="kolopt create" data-kolopt="__create" role="option">${esc(D.createKolOpt(R.trim(txt).replace(/^@+/, '')))}</button>` : '';
        pop.innerHTML = list.map(k => `<button type="button" class="kolopt" data-kolopt="${esc(k.kol_id)}" role="option"><b>${esc(k.display_name)}</b> <span class="muted small">${esc(R.accountsOfKol(s, k.kol_id).slice(0, 2).map(a => '@' + a.handle).concat([k.kol_id]).join(' · '))}</span></button>`).join('') + create;
        act = -1; pop.classList.toggle('hidden', !pop.innerHTML); kin.setAttribute('aria-expanded', String(!!pop.innerHTML));
      };
      const pick = v => { pop.classList.add('hidden'); kin.setAttribute('aria-expanded', 'false'); if (v === '__create') openCreateKol(kin.value); else if (v) { dl.touched.add('kol_id'); dirty(); setDraftKol(v); } };
      kin.addEventListener('input', () => { dl.kolText = kin.value; show(); });
      kin.addEventListener('focus', () => { if (R.trim(kin.value) && !d.kol_id) show(); });
      kin.addEventListener('keydown', e => {
        const it = opts();
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && it.length) { e.preventDefault(); act = Math.max(0, Math.min(it.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); it.forEach((b, i) => b.classList.toggle('on', i === act)); }
        else if (e.key === 'Enter' && act >= 0 && it[act]) { e.preventDefault(); pick(it[act].dataset.kolopt); }
        else if (e.key === 'Escape') { pop.classList.add('hidden'); kin.setAttribute('aria-expanded', 'false'); }
      });
      pop.addEventListener('mousedown', e => { const b = e.target.closest('[data-kolopt]'); if (b) { e.preventDefault(); pick(b.dataset.kolopt); } });
      kin.addEventListener('change', () => setTimeout(() => {
        if (!kin.isConnected || !dl.draft) return;
        pop.classList.add('hidden');
        const id = resolveKol(kin.value); dl.touched.add('kol_id'); dirty();
        if (id && id !== d.kol_id) setDraftKol(id);
        else if (!id && d.kol_id) clearDraftKol(kin.value);
        else check();
      }, 150));
    }
    box.querySelectorAll('[data-bool]').forEach(el => el.addEventListener('change', () => { d[el.dataset.bool] = el.checked; dirty(); check(); }));
    box.querySelectorAll('[data-saveterm]').forEach(el => el.addEventListener('change', () => { dl.saveTerm = el.checked; }));
    box.querySelectorAll('[data-updterm]').forEach(el => el.addEventListener('change', () => { dl.updateKolTerm = el.checked; }));
    box.querySelectorAll('[data-reason]').forEach(el => el.addEventListener('input', () => { dl.costReason = el.value; dirty(); check(); }));
    if (!box.dataset.prodWired) {
      box.dataset.prodWired = '1';
      box.addEventListener('change', e => {
        if (!editing() || !e.target.matches('[data-padd]') || !e.target.value) return;
        dl.draft.products = (dl.draft.products || []).concat([{ tr_code: e.target.value, qty: '1', note: null }]); dl.dirty = true; redrawProducts(); check();
      });
      box.addEventListener('input', e => {
        const q = e.target.closest('[data-pq]'); if (!editing() || !q) return;
        dl.draft.products[+q.dataset.pq].qty = q.value; dl.dirty = true; dl.touched.add(q.dataset.key); check();
      });
    }
    box.querySelectorAll('[data-tick]').forEach(el => el.addEventListener('change', () => { el.checked ? dl.ticks.add(el.dataset.tick) : dl.ticks.delete(el.dataset.tick); dirty(); check(); }));
    box.querySelectorAll('[data-pi]').forEach(card => {
      const p = dl.posts[+card.dataset.pi];
      card.querySelectorAll('[data-p]').forEach(el => {
        const h = () => { p[el.dataset.p] = el.value; dirty(); if (el.dataset.p === 'account_id') p.platform = (state().kol_accounts.find(a => a.account_id === el.value) || {}).platform || null; check(); };
        el.addEventListener('input', h);
        el.addEventListener('change', () => { h(); dl.touched.add(el.dataset.key); check(); });
        el.addEventListener('blur', () => { dl.touched.add(el.dataset.key); check(); });
      });
    });
  }
  /* live checks: only checks, totals, hints, outlines and buttons change, so typing never loses focus */
  function check() {
    const s = state(), box = $('drawer_content'), d = dl.draft, ctx = R.dealContext(s), posts = draftPosts();
    const res = R.validateDeal(s, d, posts, today(), ctx);
    if (dl.mode === 'new') res.errs.push(...R.checkNewDealTerm(d).errs, ...R.checkNewDealPillar(s.lookups, d).errs);
    if (dl.mode === 'new' && R.campaignBlocksNew(s, d.campaign_id)) res.errs.push({ field: 'campaign_id', msg: R.campaignBlocksNew(s, d.campaign_id) });
    /* a section in the drawer: only its own checks (CR-04 §4.5) */
    if (dl.sec) {
      const stored = dealById(dl.id), fields = R.DEAL_SECTIONS[dl.sec] || [];
      const mine = f => (dl.sec === 'posts' ? /^post\d/.test(f || '') : fields.includes(f) || f === 'cost_reason' || (dl.sec === 'info' && /^product\d/.test(f || '')));
      res.errs = res.errs.filter(e => mine(e.field)); res.warns = res.warns.filter(w => mine(w.field)); res.infos = res.infos.filter(i => mine(i.field));
      if (dl.sec === 'info' && R.pillarCleared(s.lookups, stored, d)) res.errs.push({ field: 'pillar', msg: C.msg.pillarCannotClear });
      if (dl.sec === 'costs' && fields.some(f => lockOf(stored, f).needsReason) && !R.trim(dl.costReason)) res.errs.push({ field: 'cost_reason', msg: C.msg.costReasonRequired });
    }
    /* CR-10 §4.10: a new deal shows an error after Save, or after you leave that field — never on a fresh form */
    const quiet = dl.mode === 'new' && !dl.submitted, shown = quiet ? res.errs.filter(e => dl.touched.has(e.field)) : res.errs;
    $('dl_checks').innerHTML = checksHTML({ errs: shown, warns: res.warns.filter(w => w.kind !== 'phase'), infos: res.infos }, res.errs.length ? '' : C.common.ok);
    if ($('dl_total')) $('dl_total').textContent = R.baht(R.totalCost(d));
    U.priceRefFree(box, R.termOf(d) === 'free');
    if ($('dl_gend')) $('dl_gend').textContent = R.dmy(R.gencodeEndDate(d)) || C.common.none;
    if ($('dl_budget')) $('dl_budget').innerHTML = budgetHTML(s, d, ctx);
    if ($('dl_ctaHint')) { const c = R.campaignCta(s, d.campaign_id); $('dl_ctaHint').innerHTML = !c ? '' : R.isBlank(d.cta) || d.cta === c ? `<span class="srctag">${esc(D.ctaFromCampaign(c))}</span>` : `<span class="chip-diff">${esc(D.ctaDiffers)}</span> <span class="muted">${esc(D.ctaCampaign(c))}</span>`; }
    box.querySelectorAll('[data-key]').forEach(el => el.classList.toggle('invalid', dl.touched.has(el.dataset.key) && res.errs.some(e => e.field === el.dataset.key)));
    box.querySelectorAll('[data-act="save"],[data-act="saveNext"],[data-act="secSave"]').forEach(b => { b.disabled = !quiet && res.errs.length > 0; });
    const phases = R.phasesOfCampaign(s, d.campaign_id);
    const paint = (el, sig, html) => { if (el && el.dataset.sig !== sig) { el.dataset.sig = sig; el.innerHTML = html; } };
    if (dl.mode === 'new') posts.forEach(p => {
      const r = R.resolvePostPhase(p, phases), el = box.querySelector(`[data-newphase="${p.account_id}"]`);
      paint(el, `${d.campaign_id}|${r.kind}|${r.candidates}|${p.phase_override || ''}`, r.kind === 'auto' ? `<span class="muted small">${esc(D.phaseFromDate)}</span> ${phaseTagHTML(r)}`
        : phaseFieldHTML(r, phases, `data-newpick="${esc(p.account_id)}" aria-label="${esc(F.phase_override)}"`, p.phase_override));
    });
    if (dl.mode !== 'new' && dl.sec === 'posts') dl.posts.forEach((p, i) => {
      const r = R.resolvePostPhase(p, phases), pb = box.querySelector(`[data-phasebox="${i}"] .pbox`);
      paint(pb, `${d.campaign_id}|${r.kind}|${r.candidates}|${r.phase}|${p.phase_override || ''}`, phaseFieldHTML(r, phases, `data-pphase="${i}" data-key="post${i}_phase_override" aria-label="${esc(F.phase_override)}"`, p.phase_override));
      if (pb) { const sel = pb.querySelector('select'); if (sel) sel.classList.toggle('invalid', res.warns.some(w => w.field === `post${i}_phase_override`)); }
    });
    if (dl.mode !== 'new' && dl.sec === 'posts') dl.posts.forEach((p, i) => {
      const el = box.querySelector(`[data-hint="${i}"]`); if (!el) return;
      const td = R.tiktokDate(p.post_link);
      let cls = 'hint', html = esc(D.tiktokHint);
      if (td) { cls = 'hint ok'; html = `${esc(D.tiktokDate(R.dmy(td)))} ` + (p.post_date !== td ? `<button type="button" class="link" data-usedate="${i}|${td}">${esc(D.useThisDate)}</button>` : '✓'); }
      else if (R.isShortTiktok(p.post_link)) { cls = 'hint warn'; html = esc(D.shortLink); }
      if (el.className !== cls) el.className = cls;
      if (el.innerHTML !== html) el.innerHTML = html;   // re-render only on change so a click in progress is not lost
    });
    return res;
  }
  function normDeal(d) {
    const x = Object.assign({}, d);
    R.MONEY_KEYS.concat(['gencode_period']).forEach(k => { x[k] = R.isBlank(x[k]) ? null : Number(x[k]); });
    R.DATE_KEYS.forEach(k => { x[k] = R.isBlank(x[k]) ? null : x[k]; });
    ['pillar', 'pic', 'cta', 'link_brief', 'remark', 'cancel_reason'].forEach(k => { x[k] = R.trim(x[k]) || null; });
    x.payment_term = R.isTerm(x.payment_term) ? x.payment_term : null;
    x.products = (x.products || []).map(p => ({ tr_code: p.tr_code, qty: Number(p.qty), note: R.trim(p.note) || null }));
    return x;
  }
  function normPost(p) {
    const x = Object.assign({}, p);
    R.METRIC_KEYS.forEach(k => { x[k] = R.isBlank(x[k]) ? null : R.parseCount(x[k]).value; });   // CR-10 §4.5: 12.5K · 1,300,000 · 1.3M
    ['expected_post_date', 'post_date', 'metrics_updated_at'].forEach(k => { x[k] = R.isBlank(x[k]) ? null : x[k]; });
    x.phase_override = x.phase_override || null;
    ['post_link', 'gencode_code'].forEach(k => { x[k] = R.trim(x[k]) || null; });
    if (R.METRIC_KEYS.some(k => x[k] != null && x[k] > 0) && !x.metrics_updated_at) x.metrics_updated_at = today();
    return x;
  }
  function nextPostIds(n) {
    const first = parseInt(store.newId('post').slice(1), 10);
    return Array.from({ length: n }, (_, i) => 'P' + String(first + i).padStart(6, '0'));
  }
  function save(next) {
    if (!guard('deal.edit')) return;
    if (dl.mode === 'new') dl.submitted = true;
    const s = state(), td = today(), res = check();
    if (res.errs.length) { res.errs.forEach(e => dl.touched.add(e.field)); check(); return; }
    const d = normDeal(dl.draft);
    if (dl.mode === 'new') {
      const accountIds = [...dl.ticks], dealId = store.newId('deal');
      const extra = {}; Object.keys(R.DEAL_TEMPLATE).forEach(k => { if (!['deal_id', 'campaign_id', 'legacy_phase_id', 'kol_id', 'status', 'sub_status', 'pic'].includes(k)) extra[k] = d[k]; });
      const out = R.newDeal(s, { dealId, logId: store.newLogId(), campaignId: d.campaign_id, kolId: d.kol_id, sub: d.sub_status, pic: d.pic, extra, accountIds,
        postIds: nextPostIds(accountIds.length), phaseOverrides: accountIds.map(aid => (dl.newOverrides && dl.newOverrides.get(aid)) || null), date: td, now: new Date(), user: userId(), note: null });
      s.deals.push(out.deal); s.deal_status_log.push(out.log); out.posts.forEach(p => s.deal_posts.push(p));
      R.setDealProducts(s, dealId, d.products);
      const kol = R.kolById(s, d.kol_id);
      /* CR-04 §4.8: keep the term as the KOL's default (no default yet) · or replace it ("Also update KOL default") */
      if (kol && R.isTerm(d.payment_term) && ((dl.saveTerm && !R.isTerm(kol.default_payment_term)) || (dl.updateKolTerm && R.termSource(kol, d.payment_term) === 'changed'))) kol.default_payment_term = d.payment_term;
      commit(D.created(dealId));
      if (next) { Object.assign(dl, { mode: 'none' }); startNew({ campaign_id: d.campaign_id, pic: d.pic, cta: d.cta || '', sub_status: d.sub_status, status: d.status }); }
      else { Object.assign(dl, { mode: 'view', id: dealId, draft: null, posts: null, ticks: null }); renderPanel(); }
      renderLeft();
      return;
    }
    saveSection(res);
  }
  /* CR-04 §4.5 — one section is saved: only its open fields change · one event (edit, or cost with the admin's reason) ·
     PIC / pillar / payment term keep their own events (CR-02 / CR-03) */
  function saveSection(res) {
    const s = state(), sec = dl.sec, stored = dealById(dl.id), d = normDeal(dl.draft), me = U.me(), now = new Date();
    const push = make => s.deal_events.push(make(store.newEventId()));
    const next = Object.assign({}, stored);
    let changes = [], type = 'edit', note = null;
    if (sec === 'posts') {
      const before = R.postsOf(s, stored.deal_id), posts = dl.posts.map(normPost), fresh = nextPostIds(posts.filter(p => !p.post_id).length);
      posts.forEach(p => { if (!p.post_id) { p.post_id = fresh.shift(); p.deal_id = stored.deal_id; } if (!stored.is_legacy) p.is_legacy = false; });
      /* CR-10 §4.5: changed metrics → updated today (unless the date was changed here) by this person · 'manual' · a 'metrics' event */
      posts.forEach(p => {
        const o = before.find(b => b.post_id === p.post_id);
        if (o ? R.sameMetrics(o, p) : !R.METRICS.some(k => p[k] != null)) return;
        if (!o || (o.metrics_updated_at || null) === (p.metrics_updated_at || null)) p.metrics_updated_at = today();
        Object.assign(p, { metrics_updated_by: me.user_id, metrics_source: 'manual' });
        push(id => ({ event_id: id, deal_id: stored.deal_id, post_id: p.post_id, type: 'metrics', from: R.metricsOf(o), to: R.metricsOf(p), changed_at: now.toISOString(), changed_by: me.user_id, note: null }));
      });
      changes = R.diffPosts(before, posts);
      s.deal_posts = s.deal_posts.filter(p => p.deal_id !== stored.deal_id).concat(posts);
    } else {
      const open = (R.DEAL_SECTIONS[sec] || []).filter(f => lockOf(stored, f).editable);
      open.forEach(f => { next[f] = d[f]; });
      delete next.products;
      /* CR-06 §4.3: products live in deal_products — one change in the same event · moving to another Campaign drops the old Campaign's products */
      const before = R.dealProductList(s, stored.deal_id);
      let after = open.includes('products') ? d.products : before;
      if (sec === 'header' && next.campaign_id !== stored.campaign_id) {
        s.deal_posts.forEach(p => { if (p.deal_id === stored.deal_id) p.phase_override = null; });
        after = after.filter(x => R.campaignHasProduct(s, next.campaign_id, x.tr_code));
      }
      if (productsLog(before) !== productsLog(after)) { R.setDealProducts(s, stored.deal_id, after); changes.push({ field: 'products', from: productsLog(before), to: productsLog(after) }); }
      if (sec === 'payment' && open.includes('payment_term') && R.termOf(stored) !== next.payment_term) push(id => R.termEvent(stored, next.payment_term, { eventId: id, now, user: me.user_id }));
      ['pic', 'pillar'].forEach(f => { if (open.includes(f) && (stored[f] || null) !== (next[f] || null)) push(id => R.fieldChange(stored, f, next[f], { eventId: id, now, user: me.user_id }).event); });
      changes = changes.concat(R.diffFields(stored, next, open.filter(f => !['payment_term', 'pic', 'pillar', 'products'].includes(f))));
      if (sec === 'costs' && open.some(f => lockOf(stored, f).needsReason)) { type = 'cost'; note = R.trim(dl.costReason) || null; }
    }
    if (stored.is_legacy) next.is_legacy = res.strict.length > 0;
    if (changes.length) push(id => R.editEvent(stored, changes, { eventId: id, now, user: me.user_id, note }, type));
    s.deals[s.deals.indexOf(stored)] = next;
    Object.assign(dl, { sec: null, draft: null, posts: null }); dl.touched.clear();
    commit(D.saved(stored.deal_id));
    renderLeft(); renderPanel();
  }

  function panelClick(e) {
    if (e.target.closest('[data-backstage]')) { if (dl.backTo) openStagePop(dl.backTo, true); return; }
    if (dl.mode === 'view' && KT.samples.click(e, () => { renderLeft(); renderPanel(); })) return;   // CR-10 §4.14
    /* CR-08 §4.5 — the Payment section: Request payment on an instalment owed · a run opens in Payments */
    const prq = e.target.closest('[data-payreq]');
    if (prq) { const d = dealById(dl.id), item = d && R.dealPayItems(state(), d, today()).find(x => x.key === prq.dataset.payreq); if (item) KT.screens.payments.openRequest(item, () => renderPanel()); return; }
    const prun = e.target.closest('[data-payrun]'); if (prun) { go('payments', { tab: 'runs', run: prun.dataset.payrun }); return; }
    const kb = e.target.closest('[data-kol]'); if (kb) { go('kol', { id: kb.dataset.kol, back: dl.id }); return; }
    const ud = e.target.closest('[data-usedate]');
    if (ud) { const [i, date] = ud.dataset.usedate.split('|'); dl.posts[+i].post_date = date; dl.dirty = true; setDate($(`f_post${i}_post_date`), date); check(); return; }
    const pdel = e.target.closest('[data-pdel]'); if (pdel) { dl.draft.products.splice(+pdel.dataset.pdel, 1); dl.dirty = true; redrawProducts(); check(); return; }
    const pd = e.target.closest('[data-postdel]'); if (pd) { dl.posts.splice(+pd.dataset.postdel, 1); dl.dirty = true; renderPanel(); return; }
    const pl = e.target.closest('[data-plan]');
    if (pl && !pl.disabled) { if (pl.dataset.plan === 'script') changePlan('script', pl.checked); else changePlan(pl.dataset.plan); return; }
    const es = e.target.closest('[data-edsec]'); if (es) { startSection(es.dataset.edsec); return; }
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act, d = dl.draft;
    if (act === 'secCancel') cancelSection();
    else if (act === 'secSave') save(false);
    else if (act === 'move') openMove(dl.id);
    else if (act === 'cancel') cancelEdit();
    else if (act === 'save') save(false);
    else if (act === 'saveNext') save(true);
    else if (act === 'showD23') { dl.showDraft23 = true; renderPanel(); }
    else if (act === 'firstPost') {
      const dates = draftPosts().map(p => p.post_date || p.expected_post_date).filter(Boolean).sort(), first = dates[0] || d.expected_post_date;
      if (first) { d.gencode_start_date = first; setDate($('f_gencode_start_date'), first); dl.dirty = true; check(); }
    }
    else if (act === 'addPost') {
      const accs = R.accountsOfKol(state(), d.kol_id), used = new Set(dl.posts.map(p => p.account_id)), a = accs.find(x => !used.has(x.account_id)) || accs[0];
      dl.posts.push(R.blankPost(d.deal_id, a ? a.account_id : '', a ? a.platform : null, d.expected_post_date || null));
      R.METRIC_KEYS.forEach(k => { dl.posts[dl.posts.length - 1][k] = ''; });
      dl.dirty = true; renderPanel();
      const cards = $('drawer_content').querySelectorAll('[data-pi]'); if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'nearest' });
    }
    else if (act === 'addAccount') go('kol', { id: d.kol_id, edit: true, back: dl.mode === 'new' ? '__new__' : d.deal_id });
    else if (act === 'newKol') openCreateKol(($('f_kol_id') || {}).value || '');   // CR-10 §4.10: never opens another KOL's edit page
    else if (act === 'ckBack') { dl.createKol = null; renderPanel(); }
    else if (act === 'ckCreate') ckCreate();
    else if (act === 'ckUse') { const id = e.target.closest('[data-kolid]').dataset.kolid; dl.createKol = null; setDraftKol(id); }
    else if (act === 'bulkTab') { (async () => { if (!(await U.requestCloseDrawer())) return; pref.set(ndTabKey(), 'bulk'); KT.bulk.open({ campaignId: (dl.draft && dl.draft.campaign_id) || dl.f.campaign }); })(); }
  }

  /* ===================== Move stage ===================== */
  function openMove(id = dl.id, preset) {
    if (!guard('deal.edit')) return;
    if (dl.sec && dl.id === id) { toast(C.common.blockWhileEditing); return; }
    const s = state(), d = dealById(id), L = s.lookups, nx = R.nextStep(L, d);
    const o = { to: preset || (nx.step ? nx.step.sub_status : ''), date: today(), note: '', cancelReason: '', addRound: false };
    const optional = new Set(nx.optional.map(x => x.sub_status)), plan = R.planOf(d);
    /* the plan's steps + Cancel; a Draft beyond the plan is offered with "+ Add draft round" (CR-02 §4.2) */
    const opts = R.stepsOf(L).filter(st => st.active !== false && st.sub_status !== d.sub_status && (R.isCancelStep(st) || R.inPlan(st, plan) || R.draftNo(st))).map(st => ({
      value: st.sub_status, label: `${st.sub_status}${nx.step && st.sub_status === nx.step.sub_status ? ` · ${D.moveNext}` : optional.has(st.sub_status) ? ` · ${D.moveOptional}`
        : !R.inPlan(st, plan) ? ` · ${D.moveNotPlanned}` : ''}` }));
    openDialog(`<div class="dlg-h">${esc(D.moveTitle(d.deal_id, kolName(d.kol_id)))}</div><div class="dlg-b">
      <p class="muted small" style="margin-top:0">${esc(D.moveFrom)} ${stageChip(d)}</p>
      <div class="fields">
        <div class="field wide"><label for="mv_to">${esc(D.moveTo)} <span class="req">*</span></label><select id="mv_to">${optionsHTML(opts, o.to, D.chooseStep)}</select></div>
        <div class="field"><label for="mv_date">${esc(D.moveDate)} <span class="req">*</span></label>${dateHTML('id="mv_date"', o.date, { label: D.moveDate })}</div>
        <div class="field wide hidden" id="mv_reasonW"><label for="mv_reason">${esc(D.moveReason)} <span class="req">*</span></label><input id="mv_reason" autocomplete="off"></div>
        <div class="field wide"><label for="mv_note">${esc(D.moveNote)}</label><textarea id="mv_note"></textarea><div class="hint">${esc(D.moveNoteHint)}</div></div>
        <div class="field wide hidden" id="mv_roundW"><label class="tick"><input type="checkbox" id="mv_round"> ${esc(D.addRound)}</label></div>
        <div class="field wide hidden" id="mv_termW"><label for="mv_term">${esc(D.term)} <span class="req">*</span></label><select id="mv_term">${optionsHTML(R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), '', D.chooseTerm)}</select><div class="hint">${esc(D.moveTermHint)}</div></div>
        <div class="field wide hidden" id="mv_pillarW"><label for="mv_pillar">${esc(D.pillar)} <span class="req">*</span></label><select id="mv_pillar">${optionsHTML(activeList('pillar_list', null), '', D.choosePillar)}</select></div>
      </div><div class="checks" id="mv_checks" style="margin-top:12px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="mv_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="mv_ok">${esc(D.moveConfirm)}</button></div>`);
    const chk = () => {
      $('mv_reasonW').classList.toggle('hidden', !R.isCancelStep(R.stepOf(L, o.to)));
      const k = R.draftNo(R.stepOf(L, o.to)), beyond = !!k && k > plan.drafts;
      $('mv_roundW').classList.toggle('hidden', !beyond); if (!beyond) { o.addRound = false; $('mv_round').checked = false; }
      /* CR-03 §4.6: a pillar is needed from Confirm QT on (imported deals are only reminded) */
      $('mv_pillarW').classList.toggle('hidden', !(o.to && R.isBlank(d.pillar) && R.pillarStepReached(L, o.to)));
      $('mv_termW').classList.toggle('hidden', !(o.to && !d.is_legacy && !R.isTerm(R.termOf(d)) && R.pillarStepReached(L, o.to) && !R.pillarStepReached(L, d.sub_status)));
      const res = o.to ? R.checkMove(s, d, o.to, o) : { errs: [{ field: 'to', msg: C.msg.moveStepUnknown }], warns: [], infos: [] };
      $('mv_checks').innerHTML = checksHTML(res, ''); $('mv_ok').disabled = res.errs.length > 0; return res;
    };
    $('mv_to').addEventListener('change', e => { o.to = e.target.value; chk(); });
    $('mv_date').addEventListener('input', e => { o.date = e.target.value; chk(); });
    $('mv_reason').addEventListener('input', e => { o.cancelReason = e.target.value; chk(); });
    $('mv_note').addEventListener('input', e => { o.note = e.target.value; chk(); });
    $('mv_round').addEventListener('change', e => { o.addRound = e.target.checked; chk(); });
    $('mv_pillar').addEventListener('change', e => { o.pillar = e.target.value; chk(); });
    $('mv_term').addEventListener('change', e => { o.paymentTerm = e.target.value; chk(); });
    $('mv_cancel').addEventListener('click', () => { closeDialog(); if (preset) renderLeft(); });
    $('mv_ok').addEventListener('click', async () => {
      if (chk().errs.length || !guard('deal.edit')) return;
      if (R.zeroCostMove(s, d, o.to) && !(await zeroCostAsk())) { if (preset) renderLeft(); return; }
      const r = R.applyMove(s, d, o.to, o, { logId: store.newLogId(), quoteId: store.newId('quote'), eventId: store.newEventId(), now: new Date(), user: userId() });
      s.deals[s.deals.indexOf(d)] = r.deal; s.deal_status_log.push(r.log); if (r.quote) s.kol_rate_quotes.push(r.quote); r.events.forEach(ev => s.deal_events.push(ev));
      closeDialog(); commit(D.moveDone(d.deal_id, o.to));
      renderLeft(); if (dl.mode === 'view' && dl.id === d.deal_id) renderPanel();
    });
    chk();
  }

  function reset() { Object.assign(dl, { mode: 'none', id: null, draft: null, posts: null, ticks: null, status: '', f: blankFilter(), selected: new Set(), limit: PAGE }); dl.touched.clear(); }
  /* used by Dashboard › Operations: the same inline PIC menu, bulk Reassign / Set pillar and PIC cell */
  /* CR-10 §4.11 — after Bulk shortlist: Deals › Table of that Campaign, Group by Stage, the Shortlist group open, the new rows lit up for 5 s */
  function showBatch(campaignId, dealIds) {
    Object.assign(dl, { view: 'table', tab: 'open', reason: '' }); pref.set('dealview', 'table'); pref.set('dealgroupby3', 'stage');
    dl.f = Object.assign(blankFilter(), { campaign: campaignId }); pref.set('dealcamp', campaignId); choosePic('all');
    const sl = (R.shortlistStep(state().lookups) || {}).sub_status; if (sl) { setCollapsed('stage:' + R.stageName(R.stepOf(state().lookups, sl)), false); saveGroups(); }
    if (U.currentTab() !== 'deals') go('deals'); else renderLeft();
    setTimeout(() => { const ids = new Set(dealIds); document.querySelectorAll('#dl_body tr[data-id]').forEach(tr => { if (ids.has(tr.dataset.id)) tr.classList.add('flash'); });
      const first = document.querySelector('#dl_body tr.flash'); if (first) first.scrollIntoView({ block: 'center' });
      setTimeout(() => document.querySelectorAll('#dl_body tr.flash').forEach(tr => tr.classList.remove('flash')), 5000); }, 300);
  }

  return { render, reset, onSuspend: owner.onSuspend, picCell, openPicMenu, openBulkField, startNewSingle, showBatch, openSetDetails };
})();
