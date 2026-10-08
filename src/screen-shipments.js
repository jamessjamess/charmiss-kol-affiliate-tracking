/* screen-shipments.js — CR-11 R4 §4.10: Shipments, the side-menu page for sending (#shipments/to-ship · in-transit · delivered).
   A Deal says what to send and by when (a To ship is made at Confirm QT, CR-10); here the work is done across every Campaign:
   scope bar (Campaign · PIC + Mine · Purpose · Search · Filters · Clear all filters) · queue cards · rows are text (changes go through ⋯
   or a bulk dialog) · pick lists (Items summary per TR code · Print A4 · Export shipping list · Mark all shipped with the tracking nos. pasted
   from a sheet) · New shipment (with or without a deal — the recipient is always a KOL; the address stays in the Payee vault) ·
   a row opens its Deal drawer at Shipments, or the Shipment drawer when there is no deal. Rules: rules-ship.js.
   CR-17 §4.3 — Simple mode: Shipped / Delivered are buttons on the row · bulk Mark shipped / Mark delivered · pick lists move into ⋯. → KT.screens.shipments */
KT.screens.shipments = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, pref, commit, toast, userId, can, ICON, optionsHTML, checksHTML, go, setHash, takeParams, openDrawer, fillDrawer } = U;
  const SM = C.samples, SH = C.ship;
  const sv = { tab: 'to-ship', f: { campaign: '', pic: 'all', purpose: '', method: '', q: '', status: '' }, showImported: false, sel: new Set(), rows: [], scope: [], pl: null, sh: null };
  const settings = () => R.sampleSettings(state().lookups);
  const actor = () => U.actor();
  const myPic = () => R.picName(actor()) || '';
  const picFilter = () => (sv.f.pic === 'all' ? '' : sv.f.pic === 'me' ? myPic() : sv.f.pic);
  const kolOf = sh => R.kolById(state(), sh.kol_id) || (sh.deal_id ? R.kolById(state(), (state().deals.find(d => d.deal_id === sh.deal_id) || {}).kol_id) : null);
  const kolName = sh => { const k = kolOf(sh); return (k && k.display_name) || sh.kol_id || ''; };
  const dealOf = id => (id ? state().deals.find(d => d.deal_id === id) || null : null);
  const shOf = id => (state().sample_shipments || []).find(x => x.shipment_id === id) || null;
  /* CR-16 §4.3 — the KOL's default shipping address on file · a shipment's own address (its address_id, else that default) */
  const onFile = kolId => { const a = R.defaultAddress(state(), kolId); return !!(a && a.secure); };
  const shipAddr = sh => R.addressOfShipment(state(), sh);
  const ctxOf = () => { let e = 0; return { eventId: () => store.newEventId() + e++, now: new Date().toISOString(), user: userId() }; };
  const canWork = () => R.canShipWork(actor());
  const canEditSh = sh => R.canEditShip(actor(), dealOf(sh.deal_id), sh);
  const canNew = () => R.can(actor(), 'shipment.edit');
  const dm = x => R.dmy(x).slice(0, 5);
  const chip = st => KT.samples.chip(st);
  const purposeChip = p => `<span class="chip sh-purpose">${esc(SH.purposes[p] || p)}</span>`;
  /* CR-22 §3.3 — the method of a shipment next to its purpose */
  const methodChip = sh => `<span class="chip sh-method m-${esc(sh.method || 'warehouse')}">${esc(R.shipMethodLabel(state().lookups, sh.method || 'warehouse'))}</span>`;
  const itemsCell = sh => (sh.items && sh.items.length ? esc(R.itemsText(sh.items)) : ['to_ship', 'problem'].includes(sh.status) ? `<span class="chip warn-chip">${esc(SM.noProducts)}</span>` : '<span class="muted">—</span>');
  const dash = '<span class="muted">—</span>';
  const campPhase = r => { const s = state(), c = r.campaign_id ? R.campaignName(s, r.campaign_id) : '', idx = sv.idx, ph = r.deal && idx ? R.primaryPhase(idx, r.deal.deal_id) : null;
    const pn = ph && ph !== R.UNSCHEDULED && ph !== R.NEEDS ? R.phaseName(s, ph) : '';
    return c ? `<span class="cph2"><span class="c1">${esc(c)}</span>${pn ? `<span class="c2">${esc(pn)}</span>` : ''}</span>` : dash; };

  /* ===================== page ===================== */
  function render(id) {
    const sec = $('tab-shipments');
    if (!sec.dataset.built) build(sec);
    const p = takeParams('shipments');
    if (p) {
      if (p.tab && R.SHIP_TABS.includes(p.tab)) sv.tab = p.tab;
      if (p.campaign !== undefined) sv.f.campaign = p.campaign || '';
      if (p.pic !== undefined) sv.f.pic = p.pic && p.pic === myPic() ? 'me' : p.pic || 'all';   // your own name = Mine
      if (p.q !== undefined) sv.f.q = p.q || '';
      if (p.status !== undefined) sv.f.status = p.status || '';
      if (p.purpose !== undefined) sv.f.purpose = p.purpose || '';
      sv.sel.clear(); $('sh_tools').dataset.built = '';
    }
    if (id && R.SHIP_TABS.includes(id)) { if (sv.tab !== id) { sv.tab = id; sv.sel.clear(); sv.f.status = ''; } }
    draw();
    if (id && /^PK\d+$/.test(id)) openPickList(id);
    else if (id && /^SH\d+$/.test(id)) openShipment(id);
  }
  function build(sec) {
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(SH.title)}</h1><span class="spacer"></span><span id="sh_newwrap"></span></div><div id="sh_golive"></div>
      <div class="stabs dtabs" id="sh_tabs" role="tablist"></div>
      <div class="toolbar sh-tools" id="sh_tools"></div><div class="fchips hidden" id="sh_chips"></div>
      <div id="sh_cards"></div><div class="toolbar hidden sh-bulk" id="sh_bulk"></div><div id="sh_body"></div>`;
    $('sh_tabs').addEventListener('click', e => { const b = e.target.closest('[data-shtab]'); if (b && b.dataset.shtab !== sv.tab) { sv.tab = b.dataset.shtab; sv.sel.clear(); sv.f.status = ''; $('sh_tools').dataset.built = ''; draw(); } });
    $('sh_tools').addEventListener('change', toolsChange);
    let qT; $('sh_tools').addEventListener('input', e => { if (e.target.id !== 'sh_q') return; clearTimeout(qT); qT = setTimeout(() => { sv.f.q = e.target.value; sv.sel.clear(); draw(); }, 150); });
    $('sh_tools').addEventListener('click', toolsClick);
    $('sh_chips').addEventListener('click', e => {
      if (e.target.closest('[data-clearfilters]')) { clearAll(); return; }
      const b = e.target.closest('[data-unset]'); if (!b) return;
      const k = b.dataset.unset; if (k === 'pic') sv.f.pic = 'all'; else if (k === 'q') sv.f.q = ''; else sv.f[k] = '';
      $('sh_tools').dataset.built = ''; sv.sel.clear(); draw();
    });
    $('sh_cards').addEventListener('click', e => { const c = e.target.closest('[data-shq]'); if (!c) return; const k = c.dataset.shq;
      if (k === 'in_transit') { sv.tab = 'in-transit'; sv.f.status = ''; } else sv.f.status = sv.f.status === k ? '' : k === 'noShipBy' ? 'noShipBy' : k;
      sv.sel.clear(); $('sh_tools').dataset.built = ''; draw(); });
    $('sh_bulk').addEventListener('click', bulkClick);
    $('sh_body').addEventListener('click', bodyClick);
    $('sh_body').addEventListener('change', bodyChange);
    $('sh_newwrap').addEventListener('click', e => { if (e.target.closest('#sh_new')) newShipment({ opener: e.target.closest('#sh_new'), after: draw }); });
    sec.dataset.built = '1';
  }
  function draw() {
    const s = state(), td = today();
    setHash('shipments/' + sv.tab);
    $('sh_newwrap').innerHTML = canNew() ? `<button type="button" class="btn primary" id="sh_new">${esc(SH.newShipment)}</button>` : '';
    if ($('sh_golive')) $('sh_golive').innerHTML = KT.golive ? KT.golive.bannerHTML() : '';
    sv.idx = R.phaseIndex(s);
    const all = R.shipRows(s, td), f = Object.assign({}, sv.f, { pic: picFilter(), status: '' });
    const scope = R.filterShipRows(s, all, f), counts = R.tabCounts(scope);
    sv.scope = scope;
    $('sh_tabs').innerHTML = R.SHIP_TABS.map(t => `<button type="button" role="tab" data-shtab="${t}" class="${t === sv.tab ? 'on' : ''}" aria-selected="${t === sv.tab}">${esc(SH.tabs[t])}<span class="n">${R.fmtNum(counts[t])}</span></button>`).join('');
    drawTools(s);
    const filtered = sv.f.status ? R.filterShipRows(s, scope, { status: sv.f.status }) : scope;
    const tab = R.shipTab(filtered, sv.tab, td, sv.showImported);
    sv.rows = tab.rows;
    [...sv.sel].forEach(id => { if (!tab.rows.some(r => r.sh.shipment_id === id)) sv.sel.delete(id); });
    drawCards(scope);
    drawBulk();
    drawTable(s, tab, td);
  }
  function pickMenuHTML(s) {
    const open = (s.pick_lists || []).filter(pl => R.pickListShipments(s, pl).some(sh => !['shipped', 'delivered', 'not_required'].includes(sh.status)));
    if (!open.length && KT.samples.isSimple()) return '';   // CR-17 §4.3: Simple — pick lists live in ⋯ (shown here only while one is open)
    return `<details class="menu sh-picks"><summary class="btn small">${esc(SH.pickLists(open.length))}</summary><div class="menu-list right">` +
      (open.length ? open.slice().reverse().map(pl => `<button type="button" class="mi" data-shpl="${esc(pl.pick_list_id)}">${esc(pl.name)} <span class="muted small">${esc(SH.parcels(pl.shipment_ids.length))}</span></button>`).join('') : `<div class="mi muted">${esc(SH.noPickLists)}</div>`) +
      `</div></details>`;
  }

  /* ---------- scope bar ---------- */
  function drawTools(s) {
    const tools = $('sh_tools'), focused = document.activeElement && document.activeElement.id === 'sh_q';
    if (!tools.dataset.built || !focused) {
      const me = myPic(), names = R.picNames(s, true);
      const picOpts = `<option value="all">${esc(SH.allPics)}</option>` + (me ? `<option value="me">${esc(C.deal.picMe(me))}</option>` : '') +
        names.filter(n => n !== me).map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('') + `<option value="__none">${esc(SH.noPic)}</option>`;
      const stOpts = (sv.tab === 'to-ship' ? ['overdue', 'this_week', 'to_ship', 'noShipBy', 'problem'] : sv.tab === 'delivered' ? ['delivered', 'not_required'] : []).map(k => ({ value: k, label: k === 'noShipBy' ? SH.cards.noShipBy : SM.status[k] }));
      tools.innerHTML = `<select id="sh_camp" aria-label="${esc(SH.campaign)}" data-combo="campaign">${U.campaignOptionsHTML(sv.f.campaign, SH.allCampaigns)}</select>` +
        `<label class="tlab">${esc(SH.pic)} <select id="sh_pic">${picOpts}</select></label>` +
        (me ? `<button type="button" class="chipbtn${sv.f.pic === 'me' ? ' on' : ''}" data-shmine aria-pressed="${sv.f.pic === 'me'}">${esc(SH.mine)}</button>` : '') +
        `<label class="tlab">${esc(SH.purpose)} <select id="sh_purpose">${optionsHTML(R.PURPOSES.map(k => ({ value: k, label: SH.purposes[k] })), sv.f.purpose, SH.allPurposes)}</select></label>` +
        `<label class="tlab">${esc(C.samples.colMethod)} <select id="sh_method">${optionsHTML(R.SHIP_METHODS.map(k => ({ value: k, label: R.shipMethodLabel(state().lookups, k) })), sv.f.method, C.samples.allMethods)}</select></label>` +
        `<input type="search" class="search" id="sh_q" placeholder="${esc(SH.search)}" value="${esc(sv.f.q)}" autocomplete="off">` +
        (stOpts.length ? `<details class="menu" id="sh_fmenu"><summary class="btn">${ICON.filter} ${esc(SH.filters)}${sv.f.status ? ' <span class="badge">· 1</span>' : ''}</summary><div class="popover"><div class="field"><label for="sh_status">${esc(SH.status)}</label><select id="sh_status">${optionsHTML(stOpts, sv.f.status, C.deal.any)}</select></div></div></details>` : '') +
        `<span class="spacer"></span>${pickMenuHTML(s)}<details class="menu"><summary class="btn small">${ICON.download}<span>${esc(SH.exportList)}</span></summary><div class="menu-list right"><button type="button" class="mi" data-shdl="xlsx">${esc(C.overview.dlXlsx)}</button><button type="button" class="mi" data-shdl="csv">${esc(C.overview.dlCsv)}</button></div></details>`;
      $('sh_pic').value = ['all', 'me', '__none'].includes(sv.f.pic) || names.includes(sv.f.pic) ? sv.f.pic : 'all';
      U.enhanceCombos(tools); tools.dataset.built = '1';
    }
    const chips = [];
    if (sv.f.campaign) chips.push(['campaign', `${SH.campaign}: ${R.campaignName(s, sv.f.campaign)}`]);
    if (sv.f.pic !== 'all') chips.push(['pic', `${SH.pic}: ${sv.f.pic === 'me' ? C.deal.picMe(myPic()) : sv.f.pic === '__none' ? SH.noPic : sv.f.pic}`]);
    if (sv.f.purpose) chips.push(['purpose', `${SH.purpose}: ${SH.purposes[sv.f.purpose]}`]);
    if (sv.f.method) chips.push(['method', `${C.samples.colMethod}: ${R.shipMethodLabel(state().lookups, sv.f.method)}`]);
    if (sv.f.status) chips.push(['status', `${SH.status}: ${sv.f.status === 'noShipBy' ? SH.cards.noShipBy : SM.status[sv.f.status]}`]);
    const q = R.trim(sv.f.q);
    sv.used = chips.map(c => c[1]).concat(q ? [C.common.searchChip(q)] : []);
    U.filterChips($('sh_chips'), chips, chips.length + (q ? 1 : 0));
  }
  function toolsChange(e) {
    const t = e.target;
    if (t.id === 'sh_camp') sv.f.campaign = t.value;
    else if (t.id === 'sh_pic') sv.f.pic = t.value;
    else if (t.id === 'sh_purpose') sv.f.purpose = t.value;
    else if (t.id === 'sh_method') sv.f.method = t.value;
    else if (t.id === 'sh_status') sv.f.status = t.value;
    else return;
    sv.sel.clear(); $('sh_tools').dataset.built = ''; draw();
  }
  function toolsClick(e) {
    if (e.target.closest('[data-shmine]')) { sv.f.pic = sv.f.pic === 'me' ? 'all' : 'me'; sv.sel.clear(); $('sh_tools').dataset.built = ''; draw(); return; }
    const d = e.target.closest('[data-shdl]'); if (d) { const m = d.closest('details'); if (m) m.open = false; exportList(d.dataset.shdl, sv.rows.map(r => r.sh), null); return; }
    const pl = e.target.closest('[data-shpl]'); if (pl) { const m = pl.closest('details'); if (m) m.open = false; openPickList(pl.dataset.shpl); }
  }
  function clearAll() { sv.f = { campaign: '', pic: 'all', purpose: '', method: '', q: '', status: '' }; sv.sel.clear(); $('sh_tools').dataset.built = ''; draw(); }

  /* ---------- queue cards (To ship) ---------- */
  function drawCards(scope) {
    if (sv.tab !== 'to-ship') { $('sh_cards').innerHTML = ''; return; }
    const c = R.shipCards(scope);
    $('sh_cards').innerHTML = `<div class="qcards sh-cards">` + ['overdue', 'this_week', 'in_transit', 'noShipBy', 'problem'].map(k =>
      `<button type="button" class="qcard${sv.f.status === k ? ' on' : ''}${k === 'overdue' && c[k] ? ' warn' : ''}" data-shq="${k}" aria-pressed="${sv.f.status === k}"><span class="n">${R.fmtNum(c[k])}</span><span class="t">${esc(SH.cards[k])}${k === 'in_transit' ? ' →' : ''}</span></button>`).join('') + `</div>`;
  }
  /* ---------- bulk bar ---------- */
  function drawBulk() {
    const n = sv.sel.size, bar = $('sh_bulk');
    bar.classList.toggle('hidden', !n);
    if (!n) { bar.innerHTML = ''; return; }
    const B = SH.bulk, btn = (k, l) => `<button type="button" class="btn" data-shbulk="${k}">${esc(l)}</button>`;
    /* CR-17 §4.3 — Simple: Mark shipped (one click form) · ⋯ Create pick list / Set ship-by / Not required */
    if (KT.samples.isSimple()) {
      bar.innerHTML = `<b>${esc(SH.selected(n))}</b>` + (sv.tab === 'to-ship' ? `<button type="button" class="btn primary" data-shbulk="qshipped">${esc(SM.quick.markShipped)}</button>` +
          `<details class="menu"><summary class="btn" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list">${['pick', 'ship_by', 'not_required'].map(k => `<button type="button" class="mi" data-shbulk="${k}">${esc({ pick: B.pick, ship_by: B.shipBy, not_required: B.notRequired }[k])}</button>`).join('')}</div></details>`
        : sv.tab === 'in-transit' ? `<button type="button" class="btn primary" data-shbulk="qdelivered">${esc(SM.quick.markDelivered)}</button>` : '') + `<button type="button" class="btn ghost" data-shbulk="clear">${esc(B.clear)}</button>`;
      return;
    }
    bar.innerHTML = `<b>${esc(SH.selected(n))}</b>` + (sv.tab === 'to-ship' ? btn('pick', B.pick) + btn('shipped', B.shipped) + btn('ship_by', B.shipBy) + btn('not_required', B.notRequired)
      : sv.tab === 'in-transit' ? btn('delivered', B.delivered) : '') + `<button type="button" class="btn ghost" data-shbulk="clear">${esc(B.clear)}</button>`;
  }
  function bulkClick(e) {
    const b = e.target.closest('[data-shbulk]'); if (!b) return;
    const k = b.dataset.shbulk, ids = [...sv.sel];
    if (k === 'clear') { sv.sel.clear(); draw(); return; }
    const m = b.closest('details'); if (m) m.open = false;
    if (k === 'pick') { createPickList(ids, b); return; }
    if (k === 'qshipped' || k === 'qdelivered') { KT.samples.quick(k === 'qshipped' ? 'shipped' : 'delivered', ids, b, () => { sv.sel.clear(); draw(); }); return; }   // CR-17
    KT.samples.action(k, ids, () => { sv.sel.clear(); draw(); });
  }

  /* ---------- the table of a tab ---------- */
  function rowMenu(r) {
    const sh = r.sh, st = r.status, work = canWork(), edit = canEditSh(sh), old = R.isLegacyDelivered(sh), it = (k, l, cls) => `<button type="button" class="mi${cls ? ' ' + cls : ''}" data-shact="${k}" data-sh="${esc(sh.shipment_id)}">${esc(l)}</button>`;
    if (old) return '';
    const items = [];
    /* CR-17 §4.3 — Simple: the main step is the button on the row · the rest here */
    if (KT.samples.isSimple()) {
      const mi = (k, l, cls) => ((['ship_by', 'not_required', 'items', 'delete'].includes(k) ? edit : work) ? it(k, l, cls) : '');
      const more = KT.samples.simpleMenuItems(sh, st === 'problem' ? 'problem' : st, mi);
      if (more) items.push(more);
      if (work && sh.pick_list_id && sh.status === 'to_ship') items.push(it('unpick', SH.removePick));
      if (st === 'delivered' && canNew()) items.push(it('reship', SH.reship));
      if (r.deal) items.push(`<button type="button" class="mi" data-shdeal="${esc(r.deal.deal_id)}">${esc(SH.openDeal)}</button>`);
      return items.length ? `<details class="menu sh-menu"><summary class="icon-btn" aria-label="${esc(SH.menu)}" title="${esc(SH.menu)}">⋯</summary><div class="menu-list right">${items.join('')}</div></details>` : '';
    }
    if (st === 'kol_purchase' || st === 'purchased') {   // CR-22: KOL buys own — nothing is sent
      if (work && st === 'kol_purchase') items.push(`<button type="button" class="mi" data-smpurchase="${esc(sh.shipment_id)}">${esc(SM.markPurchased)}</button>`);
      if (work && st === 'purchased') items.push(`<button type="button" class="mi" data-smunpurchase="${esc(sh.shipment_id)}">${esc(SM.unmarkPurchased)}</button>`);
      if (edit && st === 'kol_purchase') items.push(it('items', SM.editItems), it('not_required', SM.notRequired));
    } else if (['overdue', 'this_week', 'to_ship', 'problem'].includes(st)) {
      if (work) items.push(it('shipped', SM.markShipped));
      if (work && st !== 'problem') items.push(it('problem', SM.reportProblem));
      if (edit) items.push(it('ship_by', SM.setShipBy), it('items', SM.editItems), it('not_required', SM.notRequired));
      if (work && sh.pick_list_id) items.push(it('unpick', SH.removePick));
      if (edit && sh.source !== 'auto' && sh.source !== 'legacy') items.push(it('delete', SH.del, 'danger'));
    } else if (st === 'shipped') {
      if (work) items.push(it('delivered', SM.markDelivered), it('problem', SM.reportProblem), it('edit', SM.edit));
    } else if (canNew()) items.push(it('reship', SH.reship));
    if (r.deal) items.push(`<button type="button" class="mi" data-shdeal="${esc(r.deal.deal_id)}">${esc(SH.openDeal)}</button>`);
    return items.length ? `<details class="menu sh-menu"><summary class="icon-btn" aria-label="${esc(SH.menu)}" title="${esc(SH.menu)}">⋯</summary><div class="menu-list right">${items.join('')}</div></details>` : '';
  }
  function drawTable(s, tab, td) {
    const el = $('sh_body'), rows = tab.rows, T = SH.col, pick = (sv.tab === 'to-ship' || sv.tab === 'in-transit') && canWork();
    const more = sv.tab === 'delivered' && tab.hidden ? `<div class="sh-imp"><button type="button" class="link" data-shimp>${esc(sv.showImported ? SH.hideImported : SH.showImported(R.fmtNum(tab.hidden)))}</button></div>` : '';
    if (!rows.length) { el.innerHTML = (sv.used.length ? U.noMatchHTML(SH.noMatch, sv.used) : `<div class="card empty"><b>${esc(SH.empty[sv.tab])}</b></div>`) + more; return; }
    const kolCell = r => `<td class="sh-kol stk${pick ? '' : ' at0'}"><span class="kname"><b>${U.nameHTML((r.kol && r.kol.display_name) || r.sh.kol_id || '')}</b>${U.copyBtnHTML((r.kol && r.kol.display_name) || '')}</span>${r.deal ? '' : `<span class="muted small">${esc(SH.noDeal)}</span>`}</td>`;
    const cb = r => (pick ? `<td class="cb"><input type="checkbox" data-shsel="${esc(r.sh.shipment_id)}"${sv.sel.has(r.sh.shipment_id) ? ' checked' : ''} aria-label="${esc((r.kol && r.kol.display_name) || r.sh.shipment_id)}"></td>` : '');
    /* CR-16 §4.3 — Address: the label of the address it goes to + on file / missing */
    const addr = r => { const a = shipAddr(r.sh); return `<td class="nowrap sh-addr">${a ? `<span class="sh-al">${esc(a.label)}</span> ` : ''}${a && a.secure ? `<span class="chip ok-chip" title="${esc(SM.addressOnFile)}">${esc(SM.onFile)}</span>` : `<span class="muted small" title="${esc(SM.noAddress)}">${esc(SM.missing)}</span>`}</td>`; };
    /* CR-17 §4.3 — Simple mode: the Pick list column only when a row is on one */
    const plCol = !KT.samples.isSimple() || rows.some(r => r.sh.pick_list_id && R.pickListById(s, r.sh.pick_list_id));
    const pl = r => { if (!plCol) return ''; const p = r.sh.pick_list_id && R.pickListById(s, r.sh.pick_list_id); return `<td>${p ? `<button type="button" class="link small" data-shpl="${esc(p.pick_list_id)}">${esc(p.name)}</button>` : dash}</td>`; };
    const old = r => R.isLegacyDelivered(r.sh), tip = r => (old(r) ? ` title="${esc(SH.importedNote)}"` : '');
    const tdv = (v, cls) => `<td class="${cls || 'nowrap'}">${v}</td>`, d = x => (x ? esc(R.dmy(x)) : dash);
    let head, row, span;
    if (sv.tab === 'to-ship') {
      head = `${pick ? `<th class="cb"><input type="checkbox" id="sh_all" aria-label="${esc(C.deal.selectAll)}"${rows.every(r => sv.sel.has(r.sh.shipment_id)) ? ' checked' : ''}></th>` : ''}<th>${esc(T.shipBy)}</th><th class="stk${pick ? '' : ' at0'}">${esc(T.kol)}</th><th>${esc(T.campaignPhase)}</th><th>${esc(T.purpose)}</th><th>${esc(T.items)}</th><th>${esc(T.address)}</th><th>${esc(T.pic)}</th><th>${esc(T.status)}</th>${plCol ? `<th>${esc(T.pickList)}</th>` : ''}<th></th>`;
      span = (pick ? 11 : 10) - (plCol ? 0 : 1);
      row = r => `<tr class="click${r.sh.method === 'self_purchase' ? ' sh-own' : ''}" data-shrow="${esc(r.sh.shipment_id)}">${cb(r)}${tdv(d(r.sh.ship_by))}${kolCell(r)}<td>${campPhase(r)}</td><td>${purposeChip(r.purpose)} ${methodChip(r.sh)}</td><td class="sh-items">${itemsCell(r.sh)}</td>${addr(r)}<td>${r.pic ? esc(r.pic) : dash}</td>` +
        `<td>${chip(r.status)}${r.status === 'problem' && r.sh.problem_reason ? ` <span class="muted small">${esc(r.sh.problem_reason)}</span>` : ''}</td>${pl(r)}<td class="sh-act">${KT.samples.isSimple() ? KT.samples.quickBtnHTML(r.sh, r.status) : ''}${rowMenu(r)}</td></tr>`;
    } else if (sv.tab === 'in-transit') {
      head = `${pick ? `<th class="cb"><input type="checkbox" id="sh_all" aria-label="${esc(C.deal.selectAll)}"${rows.every(r => sv.sel.has(r.sh.shipment_id)) ? ' checked' : ''}></th>` : ''}<th>${esc(T.shipped)}</th><th class="stk${pick ? '' : ' at0'}">${esc(T.kol)}</th><th>${esc(T.campaignPhase)}</th><th>${esc(T.purpose)}</th><th>${esc(T.items)}</th><th>${esc(T.carrier)}</th><th>${esc(T.tracking)}</th><th class="num">${esc(T.days)}</th><th>${esc(T.pic)}</th><th></th>`;
      span = pick ? 11 : 10;
      row = r => { const n = R.daysInTransit(r.sh, td), slow = n != null && n > R.TRANSIT_SLOW;
        return `<tr class="click" data-shrow="${esc(r.sh.shipment_id)}">${cb(r)}${tdv(d(r.sh.shipped_date))}${kolCell(r)}<td>${campPhase(r)}</td><td>${purposeChip(r.purpose)} ${methodChip(r.sh)}</td><td class="sh-items">${itemsCell(r.sh)}</td>` +
          `<td>${r.sh.carrier ? esc(r.sh.carrier) : dash}</td><td>${trackCell(r.sh) || dash}</td><td class="num">${n == null ? dash : `<span class="${slow ? 'sh-slow' : ''}"${slow ? ` title="${esc(SH.slowTip(R.TRANSIT_SLOW))}"` : ''}>${esc(SH.daysN(n))}</span>`}</td><td>${r.pic ? esc(r.pic) : dash}</td><td class="sh-act">${KT.samples.isSimple() ? KT.samples.quickBtnHTML(r.sh, r.status) : ''}${rowMenu(r)}</td></tr>`; };
    } else {
      head = `<th>${esc(T.delivered)}</th><th class="stk at0">${esc(T.kol)}</th><th>${esc(T.campaignPhase)}</th><th>${esc(T.purpose)}</th><th>${esc(T.items)}</th><th>${esc(T.carrier)}</th><th>${esc(T.tracking)}</th><th>${esc(T.shipped)}</th><th>${esc(T.pic)}</th><th>${esc(T.status)}</th><th></th>`;
      span = 11;
      row = r => `<tr class="click${old(r) ? ' sm-legacy' : ''}${r.sh.method === 'self_purchase' ? ' sh-own' : ''}" data-shrow="${esc(r.sh.shipment_id)}"${tip(r)}>${tdv(d(r.sh.delivered_date))}${kolCell(r).replace(' at0', ' at0')}<td>${campPhase(r)}</td><td>${purposeChip(r.purpose)} ${methodChip(r.sh)}</td><td class="sh-items">${itemsCell(r.sh)}</td>` +
        `<td>${r.sh.carrier ? esc(r.sh.carrier) : dash}</td><td>${trackCell(r.sh) || dash}</td>${tdv(d(r.sh.shipped_date))}<td>${r.pic ? esc(r.pic) : dash}</td><td>${chip(r.status)}${r.status === 'not_required' && r.sh.not_required_reason ? ` <span class="muted small">${esc(r.sh.not_required_reason)}</span>` : ''}</td><td class="sh-act">${KT.samples.isSimple() ? KT.samples.quickBtnHTML(r.sh, r.status) : ''}${rowMenu(r)}</td></tr>`;
    }
    let body;
    if (sv.tab === 'to-ship') {
      const groups = new Map(); rows.forEach(r => { const g = R.toShipGroup(r); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });
      body = R.TO_SHIP_GROUPS.filter(g => groups.has(g)).map(g => `<tr class="ghead"><td colspan="${span}"><span class="gname"><b>${esc(SH.groups[g])}</b> <span class="muted">${R.fmtNum(groups.get(g).length)}</span></span></td></tr>` + groups.get(g).map(row).join('')).join('');
    } else body = rows.map(row).join('');
    el.innerHTML = `<div class="tablewrap sh-wrap"><table class="tbl sh-tbl sh-${sv.tab}${pick ? '' : ' nocb'}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` + more;
  }
  const trackCell = sh => { const url = R.trackingLink(settings(), sh.carrier, sh.tracking_no); return !sh.tracking_no ? '' : url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(sh.tracking_no)} ↗</a>` : esc(sh.tracking_no); };

  function bodyClick(e) {
    if (e.target.closest('a') || e.target.closest('[data-copyname]') || e.target.closest('details.menu > summary')) return;
    if (e.target.closest('[data-shimp]')) { sv.showImported = !sv.showImported; draw(); return; }
    if (e.target.id === 'sh_all') { const on = e.target.checked; sv.rows.forEach(r => (on ? sv.sel.add(r.sh.shipment_id) : sv.sel.delete(r.sh.shipment_id))); draw(); return; }
    const cb = e.target.closest('[data-shsel]'); if (cb) { cb.checked ? sv.sel.add(cb.dataset.shsel) : sv.sel.delete(cb.dataset.shsel); drawBulk(); return; }
    if (e.target.closest('td.cb')) return;
    const a = e.target.closest('[data-shact]'); if (a) { const m = a.closest('details'); if (m) m.open = false; rowAction(a.dataset.shact, a.dataset.sh, a); return; }
    if (KT.samples.click(e, draw)) return;   // CR-17: Shipped · Delivered · Shipped & delivered · Undo delivered · Change address
    const dd = e.target.closest('[data-shdeal]'); if (dd) { go('deals', { deal: dd.dataset.shdeal, section: 'shipments' }); return; }
    const p = e.target.closest('[data-shpl]'); if (p) { openPickList(p.dataset.shpl); return; }
    const r = e.target.closest('[data-shrow]'); if (r) { const sh = shOf(r.dataset.shrow); if (!sh) return; if (sh.deal_id && dealOf(sh.deal_id)) go('deals', { deal: sh.deal_id, section: 'shipments' }); else openShipment(sh.shipment_id); }
  }
  function bodyChange() { /* rows are text — nothing to change in place (CR-11 §4.10) */ }
  function rowAction(k, id, opener) {
    const sh = shOf(id); if (!sh) return;
    if (k === 'reship') { newShipment({ kolId: sh.kol_id, dealId: sh.deal_id, campaignId: sh.campaign_id, purpose: 'replacement', items: (sh.items || []).map(x => Object.assign({}, x)), opener, after: draw }); return; }
    if (k === 'items') { itemsDialog(id, draw, opener); return; }
    if (k === 'unpick') { if (!U.guard('shipment.ship')) return; if (R.removeFromPickList(state(), sh)) { commit(SH.removed); draw(); } return; }
    KT.samples.action(k, [id], draw);
  }

  /* ===================== pick lists ===================== */
  function createPickList(ids, opener) {
    if (!U.guard('shipment.ship')) return;
    const s = state(), list = ids.map(shOf).filter(Boolean), res0 = R.validatePickList(s, ids, 'x');
    if (res0.errs.length) { toast(res0.errs[0].msg); return; }
    const sum = R.itemsSummary(list), name0 = R.pickListName(today());
    U.createModal({ size: 'M', title: SH.pickTitle(list.length), opener, focus: '#pl_name',
      body: `<div class="fields"><div class="field wide"><label for="pl_name">${esc(SH.pickName)} <span class="req">*</span></label><input id="pl_name" value="${esc(name0)}" autocomplete="off"></div></div>` +
        `<div class="sh-sum"><div class="sh-sumh"><b>${esc(SH.itemsSummary)}</b> <span class="muted">${esc(SH.parcels(list.length))}</span></div>${sum.length ? `<div class="sh-sumchips">${sum.map(x => `<span class="chip">${esc(x.tr_code)} × ${R.fmtNum(x.qty)}</span>`).join('')}</div>` : `<div class="hint">${esc(SH.noItems)}</div>`}</div>` +
        `<div class="sh-pllist">${list.map(sh => `<div class="sh-plrow"><b>${esc(kolName(sh))}</b><span class="muted small">${esc(R.itemsText(sh.items) || '—')}</span></div>`).join('')}</div>`,
      foot: [`<div class="checks" id="pl_checks"></div>`, U.cmButtons(SH.bulk.pick, 'pl_ok')] });
    $('pl_ok').addEventListener('click', () => {
      const name = $('pl_name').value, st = state(), res = R.validatePickList(st, ids, name);
      $('pl_checks').innerHTML = checksHTML(res, ''); if (res.errs.length) return;
      const pl = R.newPickList(st, ids, { id: store.newId('pickList'), name, user: userId(), now: new Date().toISOString() });
      U.closeModal(); sv.sel.clear(); commit(SH.pickCreated(pl.name)); draw(); openPickList(pl.pick_list_id);
    });
  }
  const plOwner = { kind: null, isDirty: () => false, onClose: () => { sv.pl = null; if (U.currentTab() === 'shipments') setHash('shipments/' + sv.tab); } };
  const closeBtn = () => `<button type="button" class="icon-btn" data-dr-close aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button>`;
  function openPickList(id) {
    const s = state(), pl = R.pickListById(s, id); if (!pl) return;
    sv.pl = id; sv.sh = null;
    const list = R.pickListShipments(s, pl), sum = R.itemsSummary(list), left = list.filter(sh => !['shipped', 'delivered', 'not_required'].includes(sh.status)), td = today();
    const html = `<div class="dr-head"><div class="dr-title"><div class="t"><h2>${esc(pl.name)}</h2><div class="dr-sub muted small">${esc(SH.createdBy(R.changedByName(s, pl.created_by) || '—', R.dmy(R.dateOfTimestamp(pl.created_at || '')) || ''))} · ${esc(SH.parcels(list.length))}</div></div>${closeBtn()}</div></div>` +
      `<div class="dr-body"><section class="sec"><div class="sec-h"><span>${esc(SH.itemsSummary)}</span></div>${sum.length ? `<div class="sh-sumchips">${sum.map(x => `<span class="chip">${esc(x.tr_code)} × ${R.fmtNum(x.qty)}</span>`).join('')}</div>` : `<div class="hint">${esc(SH.noItems)}</div>`}</section>` +
      `<div class="btns sh-plbtns"><button type="button" class="btn" data-plprint>${esc(SH.print)}</button><button type="button" class="btn" data-plexport>${esc(SH.exportList)}</button>` +
      (canWork() && left.length ? `<button type="button" class="btn primary" data-plship>${esc(SH.markAll)}</button>` : '') + `</div>` + (left.length ? '' : `<div class="hint">${esc(SH.allShipped)}</div>`) +
      `<section class="sec"><div class="sec-h"><span>${esc(SH.parcels(list.length))}</span></div><div class="tablewrap"><table class="tbl compact-sm"><thead><tr><th>${esc(SH.col.kol)}</th><th>${esc(SH.col.items)}</th><th>${esc(SH.col.shipBy)}</th><th>${esc(SH.col.status)}</th><th>${esc(SH.col.tracking)}</th><th></th></tr></thead><tbody>` +
      list.map(sh => { const st = R.sampleStatus(sh, td); return `<tr><td><b class="nm">${esc(kolName(sh))}</b></td><td>${itemsCell(sh)}</td><td class="nowrap">${sh.ship_by ? esc(R.dmy(sh.ship_by)) : dash}</td><td>${chip(st)}</td><td>${trackCell(sh) || dash}</td>` +
        `<td>${canWork() && R.canUnpick(sh) ? `<button type="button" class="icon-btn" data-plrm="${esc(sh.shipment_id)}" title="${esc(SH.removePick)}" aria-label="${esc(SH.removePick)}">${ICON.close}</button>` : ''}</td></tr>`; }).join('') +
      `</tbody></table></div></section></div>`;
    if (U.drawerOwner() === plOwner) fillDrawer(html); else openDrawer(plOwner, html);
    $('drawer_content').onclick = plClick;
    setHash('shipments/' + id);
  }
  function plClick(e) {
    const s = state(), pl = R.pickListById(s, sv.pl); if (!pl) return;
    if (e.target.closest('[data-plprint]')) { printPickList(pl); return; }
    if (e.target.closest('[data-plexport]')) { exportList('xlsx', R.pickListShipments(s, pl), pl); return; }
    if (e.target.closest('[data-plship]')) { markAllDialog(pl, e.target.closest('[data-plship]')); return; }
    const rm = e.target.closest('[data-plrm]'); if (rm) { if (!U.guard('shipment.ship')) return; if (R.removeFromPickList(s, shOf(rm.dataset.plrm))) { commit(SH.removed); draw(); openPickList(pl.pick_list_id); } }
  }
  /* Mark all shipped — one date and carrier for the batch · a tracking no. a line, matched to the rows in order (a column pasted from a sheet) */
  function markAllDialog(pl, opener) {
    if (!U.guard('shipment.ship')) return;
    const s = state(), list = R.pickListShipments(s, pl).filter(sh => !['shipped', 'delivered', 'not_required'].includes(sh.status)), S = settings();
    const preview = () => { const t = R.trackingLines($('ma_trk').value);
      $('ma_rows').innerHTML = list.map((sh, i) => `<tr><td class="num muted">${i + 1}</td><td><b class="nm">${esc(kolName(sh))}</b></td><td class="muted small">${esc(R.itemsText(sh.items) || '—')}</td><td>${t[i] ? esc(t[i]) : dash}</td></tr>`).join('');
      const res = R.validateMarkAll({ date: $('ma_date').value, carrier: $('ma_carrier').value, trackings: t }, list.length); $('ma_checks').innerHTML = checksHTML({ errs: [], warns: res.warns, infos: [] }, ''); };
    U.createModal({ size: 'L', title: SH.markAllTitle(pl.name, list.length), opener, focus: '#ma_trk',
      body: `<div class="sh-ma"><div class="fields"><div class="field"><label for="ma_date">${esc(SM.shippedOn)}</label>${U.dateHTML('id="ma_date"', today(), { label: SM.shippedOn })}</div>` +
        `<div class="field"><label for="ma_carrier">${esc(SM.col.carrier)} <span class="req">*</span></label><select id="ma_carrier">${optionsHTML(S.carriers, '', SH.choose)}</select></div>` +
        `<div class="field wide"><label for="ma_trk">${esc(SH.trackingPaste)}</label><textarea id="ma_trk" rows="6" placeholder="${esc(SH.trackingPh)}" spellcheck="false"></textarea></div></div>` +
        `<div class="tablewrap"><table class="tbl compact-sm"><thead><tr><th class="num">#</th><th>${esc(SH.col.kol)}</th><th>${esc(SH.col.items)}</th><th>${esc(SH.col.tracking)}</th></tr></thead><tbody id="ma_rows"></tbody></table></div></div>`,
      foot: [`<div class="checks" id="ma_checks"></div>`, U.cmButtons(SH.markAll, 'ma_ok')] });
    preview();
    $('cm_body').addEventListener('input', preview); $('cm_body').addEventListener('change', preview);
    $('ma_ok').addEventListener('click', () => {
      const o = { date: $('ma_date').value, carrier: $('ma_carrier').value, trackings: R.trackingLines($('ma_trk').value) }, res = R.validateMarkAll(o, list.length);
      if (res.errs.length) { $('ma_checks').innerHTML = checksHTML(res, ''); return; }
      const st = state(), evs = R.markAllShipped(st, R.pickListById(st, pl.pick_list_id), o, ctxOf());
      st.deal_events.push(...evs); U.closeModal(); commit(SH.shippedN(evs.length)); draw(); openPickList(pl.pick_list_id);
    });
  }
  /* the address of each shipment (CR-16 §4.3: its own, else the KOL's default), decrypted in memory only while Payee details are unlocked (CR-10 §4.14) ·
     recs: shipment_id → { recipient, phone, address } */
  async function shippingRecs(list) {
    const s = state(), vault = s.lookups.payee_vault, open = !!vault && KT.vault.isUnlocked(vault) && can('payee.unlock'), recs = new Map(), byAddr = new Map();
    if (open) for (const sh of list) {
      const a = R.addressOfShipment(s, sh); if (!a || !a.secure) continue;
      if (!byAddr.has(a.address_id)) byAddr.set(a.address_id, R.readShip(await KT.vault.decrypt(a.secure)));
      if (byAddr.get(a.address_id)) recs.set(sh.shipment_id, byAddr.get(a.address_id));
    }
    byAddr.clear();
    return { open, recs };
  }
  /* Print (A4): KOL · items × qty · a box to tick · the address only while unlocked, else "See shipping list" — a frame of its own, gone after printing */
  async function printPickList(pl) {
    const s = state(), list = R.pickListShipments(s, pl), sum = R.itemsSummary(list), { open, recs } = await shippingRecs(list);
    const rows = list.map((sh, i) => { const rec = recs.get(sh.shipment_id) || null;
      return `<tr><td class="n">${i + 1}</td><td class="t">☐</td><td><b>${esc(kolName(sh))}</b></td><td>${esc((sh.items || []).map(x => `${x.tr_code} × ${x.qty}`).join(', ') || '—')}</td><td>${open && rec ? esc([rec.recipient, rec.phone, rec.address].filter(Boolean).join(' · ')) : `<i>${esc(SH.seeList)}</i>`}</td></tr>`; }).join('');
    recs.clear();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(pl.name)}</title><style>@page{size:A4;margin:14mm}body{font:12px/1.4 system-ui,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}` +
      `.m{color:#555;margin:0 0 10px}.c{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.c span{border:1px solid #999;border-radius:4px;padding:2px 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}` +
      `th{background:#eee}.n{width:24px;text-align:right}.t{width:22px;text-align:center;font-size:14px}</style></head><body><h1>${esc(pl.name)}</h1><p class="m">${esc(SH.parcels(list.length))} · ${esc(R.dmy(today()))}${open ? '' : ` · ${esc(SH.addrLocked)}`}</p>` +
      `<div class="c">${sum.map(x => `<span>${esc(x.tr_code)} × ${x.qty}</span>`).join('') || esc(SH.noItems)}</div><table><thead><tr><th class="n">#</th><th class="t">${esc(SH.tick)}</th><th>${esc(SH.col.kol)}</th><th>${esc(SH.col.items)}</th><th>${esc(SH.col.address)}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const f = document.createElement('iframe'); f.className = 'print-frame'; f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentDocument; d.open(); d.write(html); d.close();
    sv.lastPrint = { html: open ? '' : html };   // for the dev check: what would print (never with addresses)
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* blocked */ } setTimeout(() => f.remove(), 1000); }, 50);
  }
  /* the shipping list (CR-10 §4.14 rules): rows given · Recipient / Phone / Address only while unlocked */
  async function exportList(fmt, list, pl) {
    const s = state(), { open, recs } = await shippingRecs(list), C2 = SM.col, idx = R.phaseIndex(s);
    const header = [C2.kol, C2.phase, SH.col.purpose, C2.items, C2.qty, C2.shipBy, C2.pic, C2.carrier, C2.tracking, C2.status].concat(open ? [SM.recipient, SM.phone, SM.address] : []);
    const rows = list.map(sh => { const deal = dealOf(sh.deal_id), rec = recs.get(sh.shipment_id) || {}, ph = deal ? R.primaryPhase(idx, deal.deal_id) : null, camp = sh.campaign_id || (deal && deal.campaign_id);
      return [kolName(sh), [camp ? R.campaignName(s, camp) : '', ph && ph !== R.UNSCHEDULED && ph !== R.NEEDS ? R.phaseName(s, ph) : ''].filter(Boolean).join(' › '), SH.purposes[sh.purpose || 'review'], R.itemsText(sh.items),
        (sh.items || []).reduce((a, x) => a + (Number(x.qty) || 0), 0), sh.ship_by ? R.dmy(sh.ship_by) : '', R.shipPic(s, sh, deal), sh.carrier || '', sh.tracking_no || '', SM.status[R.sampleStatus(sh, today())]]
        .concat(open ? [rec.recipient || '', rec.phone || '', rec.address || ''] : []); });
    recs.clear();
    const name = KT.export.fileName(SM.file, KT.export.safeName(pl ? pl.name : sv.f.campaign ? R.campaignName(s, sv.f.campaign) : SH.allCampaigns), today(), fmt);
    if (fmt === 'csv') { U.downloadCSV(name, header, rows); return; }
    U.download(name, KT.xlsx.workbook([KT.export.sheetOf({ name: SM.sheet, header, rows, total: null })]), KT.xlsx.MIME); toast(C.io.exported(name, rows.length));
  }

  /* ===================== the Shipment drawer (no deal) ===================== */
  const shOwner = { kind: null, isDirty: () => false, onClose: () => { sv.sh = null; if (U.currentTab() === 'shipments') setHash('shipments/' + sv.tab); } };
  function openShipment(id) {
    const s = state(), sh = shOf(id); if (!sh) return;
    sv.sh = id; sv.pl = null;
    const st = R.sampleStatus(sh, today()), k = kolOf(sh), r = R.shipRows(s, today()).find(x => x.sh === sh) || { sh, status: st, purpose: sh.purpose || 'review', deal: null, kol: k, campaign_id: sh.campaign_id, pic: R.shipPic(s, sh, null) };
    const kv = (l, v) => `<div class="kv"><span>${esc(l)}</span><b>${v}</b></div>`;
    const menu = rowMenu(r);
    const html = `<div class="dr-head"><div class="dr-title"><div class="t"><h2>${esc(SH.drawerTitle(sh.shipment_id))}</h2><div class="dr-sub muted small">${esc(kolName(sh))} · ${esc(SH.purposes[r.purpose])}</div></div>${closeBtn()}</div>` +
      (menu ? `<div class="dr-actions">${menu}</div>` : '') + `</div>` +
      `<div class="dr-body"><section class="sec"><div class="sec-h"><span>${esc(SM.sec)}</span></div>` +
      kv(SH.recipient, esc(kolName(sh))) +
      kv(SM.shipTo, (a => (a ? `${esc(a.label)} ` : '') + (a && a.secure ? `<span class="chip ok-chip">${esc(SH.addressOnFile)}</span>` : `<span class="chip">${esc(SH.noAddress)}</span>`))(shipAddr(sh))) +
      kv(SH.purpose, esc(SH.purposes[r.purpose])) + kv(SH.campaign, r.campaign_id ? esc(R.campaignName(s, r.campaign_id)) : dash) + kv(SH.col.items, itemsCell(sh)) +
      kv(SH.col.shipBy, sh.ship_by ? esc(R.dmy(sh.ship_by)) : dash) + kv(SH.col.status, chip(st)) + kv(SH.col.carrier, sh.carrier ? esc(sh.carrier) : dash) + kv(SH.col.tracking, trackCell(sh) || dash) +
      kv(SH.col.shipped, sh.shipped_date ? esc(R.dmy(sh.shipped_date)) : dash) + kv(SH.col.delivered, sh.delivered_date ? esc(R.dmy(sh.delivered_date)) : dash) +
      kv(SH.note, sh.note ? esc(sh.note) : dash) + kv(SH.madeBy, esc(R.changedByName(s, sh.created_by) || '—')) + `</section></div>`;
    if (U.drawerOwner() === shOwner) fillDrawer(html); else openDrawer(shOwner, html);
    $('drawer_content').onclick = e => { const a = e.target.closest('[data-shact]'); if (a) { const m = a.closest('details'); if (m) m.open = false; rowAction(a.dataset.shact, a.dataset.sh, a); setTimeout(() => { if (sv.sh === id && shOf(id)) openShipment(id); else U.closeDrawer(); }, 0); } };
    setHash('shipments/' + id);
  }

  /* ===================== New shipment (modal M) ===================== */
  /* o = {kolId, dealId, campaignId, purpose, items, lockDeal, opener, after} */
  function newShipment(o) {
    if (!U.guard('shipment.edit')) return;
    const s = state(), d0 = o.dealId ? dealOf(o.dealId) : null;
    const ns = { d: { purpose: o.purpose || (d0 ? 'review' : ''), kol_id: o.kolId || (d0 && d0.kol_id) || '', deal_id: d0 ? d0.deal_id : '', campaign_id: o.campaignId || (d0 && d0.campaign_id) || '', items: [], ship_by: '', note: '', address_id: '' },
      lock: !!o.lockDeal && !!d0, submitted: false, createKol: null, onlyProduct: false };
    ns.d.items = o.items ? o.items.slice() : R.shipItemsDefault(s, ns.d);
    ns.onlyProduct = !o.items && !ns.d.deal_id && ns.d.items.length === 1;
    sv.ns = ns;
    ns.h = U.createModal({ size: 'M', title: SH.newTitle, opener: o.opener, sub: ns.lock ? `${(R.kolById(s, ns.d.kol_id) || {}).display_name || ''} · ${ns.d.deal_id}` : '', focus: '#ns_purpose',
      isDirty: () => !!sv.ns && sv.ns.dirty, onClose: () => { if (sv.ns === ns) sv.ns = null; }, onClick: e => nsClick(e, o) });
    drawNew(o);
  }
  function nsFormHTML(ns) {
    const s = state(), d = ns.d, deals = d.kol_id ? s.deals.filter(x => x.kol_id === d.kol_id && x.status !== 'Cancel') : [], deal = dealOf(d.deal_id);
    const kolOpts = s.kol_master.slice().sort((a, b) => a.display_name.localeCompare(b.display_name, 'th')).map(k => `<option value="${esc(k.kol_id)}"${k.kol_id === d.kol_id ? ' selected' : ''}>${esc(k.display_name)}</option>`).join('');
    const addr = d.kol_id ? (onFile(d.kol_id) ? `<span class="chip ok-chip">${esc(SH.addressOnFile)}</span>` : `<span class="chip">${esc(SH.noAddress)}</span> <span class="muted small">${esc(SH.addAddress)}</span>`) : '';
    const codes = d.items.map(x => x.tr_code);
    return `<div class="fields ns-f">` +
      U.field('ns_purpose', SH.purpose, `<select id="ns_purpose" data-ns="purpose" data-key="purpose">${optionsHTML(R.PURPOSES.map(k => ({ value: k, label: SH.purposes[k] })), d.purpose, SH.choose)}</select>`, { req: 1 }) +
      (ns.lock ? U.field('ns_kol', SH.recipient, `<div class="kollock"><b>${esc((R.kolById(s, d.kol_id) || {}).display_name || '')}</b> ${ICON.lock}</div>`, { hint: addr })
        : U.field('ns_kol', SH.recipient, `<select id="ns_kol" data-ns="kol_id" data-key="kol_id" data-combo="kol" aria-label="${esc(SH.recipient)}"><option value="">${esc(SH.choose)}</option>${kolOpts}</select>`, { req: 1, hint: `${esc(SH.recipientHint)} ${addr ? '<br>' + addr : ''} <button type="button" class="link small" data-nsck>${esc(SH.createKol)}</button>` })) +
      (ns.lock ? '' : U.field('ns_deal', SH.deal, `<select id="ns_deal" data-ns="deal_id" data-key="deal_id"${d.kol_id ? '' : ' disabled'}><option value="">${esc(SH.noDealOpt)}</option>${deals.map(x => `<option value="${esc(x.deal_id)}"${x.deal_id === d.deal_id ? ' selected' : ''}>${esc(`${x.deal_id} · ${R.campaignName(s, x.campaign_id)} · ${x.sub_status}`)}</option>`).join('')}</select>`, { hint: esc(SH.dealHint) })) +
      U.field('ns_camp', SH.campaign, deal ? `<div><b>${esc(R.campaignName(s, deal.campaign_id))}</b></div>` : `<select id="ns_camp" data-ns="campaign_id" data-key="campaign_id" data-combo="campaign">${U.campaignOptionsHTML(d.campaign_id, C.common.none)}</select>`, { hint: esc(SH.campaignHint) }) +
      /* CR-16 §4.3 — Ship to ▾ (blank = the KOL's default when it is marked shipped) */
      (d.kol_id ? U.field('ns_shipto', SM.shipTo, `<select id="ns_shipto" data-ns="address_id" data-key="address_id"><option value="">${esc(SM.shipToDefault)}</option>${R.shipToOptions(s, d.kol_id).map(x => `<option value="${esc(x.value)}"${x.value === d.address_id ? ' selected' : ''}>${esc(x.secure ? x.label : SM.noDetails(x.label))}</option>`).join('')}</select>`, { hint: esc(SM.shipToHint) }) : '') +
      U.field('ns_shipby', SH.col.shipBy, U.dateHTML('id="ns_shipby" data-ns="ship_by" data-key="ship_by"', d.ship_by || (deal ? R.shipBy(deal, s.lookups.sample_settings) || '' : ''), { label: SH.col.shipBy })) +
      `<div class="field wide"><label for="ns_items_q">${esc(SH.items)}${ns.onlyProduct ? ` <span class="chip sh-from">${esc(SH.onlyProduct)}</span>` : ''}</label>${U.productPickerHTML('ns_items', codes)}` +
      (d.items.length ? `<div class="ns-qty">${d.items.map((x, i) => `<label class="ns-qrow"><span>${esc(x.tr_code)}</span><input type="number" min="1" step="1" data-nsqty="${i}" value="${esc(x.qty)}" aria-label="${esc(SH.qty)} ${esc(x.tr_code)}"></label>`).join('')}</div>` : '') +
      `<div class="hint">${esc(SH.itemsHint)}</div></div>` +
      `<div class="field wide"><label for="ns_note">${esc(SH.note)}</label><input id="ns_note" data-ns="note" data-key="note" value="${esc(d.note)}" placeholder="${esc(SH.notePh)}" autocomplete="off"></div></div>`;
  }
  function drawNew(o) {
    const ns = sv.ns; if (!ns) return;
    if (ns.createKol) {
      U.modalPanel({ title: C.bulk.ck.title, sub: C.bulk.ck.sub, body: U.kolCreateHTML(ns.createKol.draft), left: `<div class="checks" id="ck_checks"></div>`,
        buttons: `<button type="button" class="btn" data-nsckback>${esc(C.bulk.back)}</button><button type="button" class="btn primary" data-act="ckCreate">${esc(C.bulk.ck.create)}</button>`, back: () => { ns.createKol = null; drawNew(o); } });
      U.wireKolCreate($('cm_body'), ns.createKol, () => { ns.dirty = true; U.kolCreateCheck($('cm_body'), ns.createKol); }); U.kolCreateCheck($('cm_body'), ns.createKol);
      return;
    }
    ns.h.setBody(nsFormHTML(ns), true);
    ns.h.setFoot(`<div class="checks" id="ns_checks"></div>`, U.cmButtons(SH.create, 'ns_ok'));
    const body = $('cm_body');
    U.enhanceCombos(body);
    U.wireProductPicker($('ns_items'), { get: () => ns.d.items.map(x => x.tr_code), set: codes => { ns.d.items = codes.map(c => ns.d.items.find(x => x.tr_code === c) || { tr_code: c, qty: 1 }); ns.onlyProduct = false; ns.dirty = true; drawNew(o); }, canNew: can('products.edit') || can('campaign.products') });
    body.oninput = e => { const q = e.target.closest('[data-nsqty]'); if (q) { const x = ns.d.items[+q.dataset.nsqty]; if (x) x.qty = Math.max(1, Math.round(Number(q.value) || 1)); ns.dirty = true; return; }
      const k = e.target.dataset.ns; if (k === 'note') { ns.d.note = e.target.value; ns.dirty = true; } };
    body.onchange = e => { const k = e.target.dataset.ns; if (!k) return; ns.dirty = true;
      if (k === 'kol_id') { ns.d.kol_id = e.target.value; ns.d.deal_id = ''; ns.d.address_id = ''; drawNew(o); return; }
      if (k === 'deal_id') { ns.d.deal_id = e.target.value; const dd = dealOf(ns.d.deal_id); if (dd) { ns.d.campaign_id = dd.campaign_id; ns.d.items = R.shipItemsDefault(state(), ns.d); ns.d.ship_by = ''; } drawNew(o); return; }
      if (k === 'campaign_id') { ns.d.campaign_id = e.target.value; if (!ns.d.items.length) { ns.d.items = R.shipItemsDefault(state(), ns.d); ns.onlyProduct = ns.d.items.length === 1; drawNew(o); } return; }
      if (k === 'ship_by') { ns.d.ship_by = e.target.value; return; }
      ns.d[k] = e.target.value; nsCheck(); };
    nsCheck();
  }
  function nsCheck() {
    const ns = sv.ns; if (!ns || !$('ns_checks')) return null;
    const res = R.validateNewShipment(state(), ns.d), show = res.errs.filter(e => ns.submitted);
    $('ns_checks').innerHTML = checksHTML({ errs: show, warns: ns.submitted ? res.warns : [], infos: [] }, '');
    $('cm_body').querySelectorAll('[data-key]').forEach(el => el.classList.toggle('invalid', show.some(e => e.field === el.dataset.key)));
    return res;
  }
  function nsClick(e, o) {
    const ns = sv.ns; if (!ns) return;
    if (e.target.closest('[data-nsck]')) { ns.createKol = { draft: R.createKolDraft('', U.me()), touched: new Set(), submitted: false, anyway: false }; drawNew(o); return; }
    if (e.target.closest('[data-nsckback]')) { ns.createKol = null; drawNew(o); return; }
    const use = e.target.closest('[data-act="ckUse"]'); if (use && ns.createKol) { ns.createKol = null; ns.d.kol_id = use.dataset.kolid; ns.d.deal_id = ''; drawNew(o); return; }
    if (e.target.closest('[data-act="ckCreate"]') && ns.createKol) {
      const c = ns.createKol; c.submitted = true;
      const r = U.kolCreateCheck($('cm_body'), c); if (!r || r.res.errs.length || (r.dup && !c.anyway)) return;
      const s = state(), recs = R.createKolRecords(c.draft, { kolId: store.newId('kol'), accountId: store.newId('account') });
      s.kol_master.push(recs.kol); if (recs.account) s.kol_accounts.push(recs.account);
      ns.createKol = null; ns.d.kol_id = recs.kol.kol_id; ns.d.deal_id = ''; commit(C.bulk.ck.created(recs.kol.display_name)); drawNew(o); return;
    }
    if (e.target.closest('#ns_ok')) {
      ns.submitted = true; const res = nsCheck(); if (!res || res.errs.length) return;
      const s = state(), sh = R.newManualShipment(s, ns.d, { id: store.newId('shipment'), user: userId(), now: new Date().toISOString() });
      const pick = ns.d.address_id && R.addressById(s, ns.d.address_id); sh.address_id = pick && pick.kol_id === sh.kol_id ? pick.address_id : null;   // CR-16 §4.3
      if (sh.deal_id && !R.canEditShip(actor(), dealOf(sh.deal_id), sh)) { toast(SM.onlyEdit); return; }
      s.sample_shipments.push(sh);
      s.deal_events.push({ event_id: store.newEventId(), deal_id: sh.deal_id, shipment_id: sh.shipment_id, type: 'shipment', from: null, to: 'to_ship', changed_at: sh.created_at, changed_by: userId(), note: SH.purposes[sh.purpose] });
      ns.dirty = false; U.closeModal(); commit(SH.created(sh.shipment_id));
      if (o.after) o.after(); else if (U.currentTab() === 'shipments') draw();
    }
  }
  /* Edit items (⋯): the products and quantities of a shipment still to ship */
  function itemsDialog(id, after, opener) {
    const sh = shOf(id); if (!sh) return;
    if (!canEditSh(sh)) { toast(SM.onlyEdit); return; }
    const st = { items: (sh.items || []).map(x => Object.assign({}, x)) };
    U.createModal({ size: 'M', title: SM.editItems, sub: `${kolName(sh)} · ${sh.shipment_id}`, opener, foot: ['', U.cmButtons(C.common.save, 'it_ok')] });
    const draw2 = () => {
      $('cm_body').innerHTML = `<div class="field wide"><label for="it_items_q">${esc(SH.items)}</label>${U.productPickerHTML('it_items', st.items.map(x => x.tr_code))}` +
        (st.items.length ? `<div class="ns-qty">${st.items.map((x, i) => `<label class="ns-qrow"><span>${esc(x.tr_code)}</span><input type="number" min="1" step="1" data-itqty="${i}" value="${esc(x.qty)}"></label>`).join('')}</div>` : '') + `</div>`;
      U.wireProductPicker($('it_items'), { get: () => st.items.map(x => x.tr_code), set: codes => { st.items = codes.map(c => st.items.find(x => x.tr_code === c) || { tr_code: c, qty: 1 }); draw2(); } });
    };
    draw2();
    $('cm_body').addEventListener('input', e => { const q = e.target.closest('[data-itqty]'); if (q && st.items[+q.dataset.itqty]) st.items[+q.dataset.itqty].qty = Math.max(1, Math.round(Number(q.value) || 1)); });
    $('it_ok').addEventListener('click', () => {
      const s = state(), x = shOf(id); if (!x) return;
      s.deal_events.push(R.updateShipment(x, { kind: 'edit', items: st.items }, { eventId: store.newEventId(), now: new Date().toISOString(), user: userId() }));
      U.closeModal(); commit(SM.done(1)); if (after) after();
    });
  }

  function reset() { sv.sel.clear(); sv.pl = null; sv.sh = null; }
  return { render, reset, newShipment, itemsDialog, openPickList, openShipment, exportList, _sv: sv };
})();
