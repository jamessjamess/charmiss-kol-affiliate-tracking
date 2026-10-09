/* screen-kol.js — KOL Master: page header, toolbar / bulk bar, sortable list · Import and New KOL are dialogs.
   CR-16 §4.1: a row opens the KOL profile (a large modal with tabs — screen-profile.js, KT.profile) in place of the KOL drawer;
   ‹ › / ↑ ↓ there walk this table as it is filtered and sorted. → KT.screens.kol */
KT.screens.kol = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, downloadCSV, checksHTML, ICON, pfIcon, tierRules, distinct, optionsHTML, sortBy, takeParams, can, guard } = U;
  const T = C.kol, PT = C.partner, PAGE = 100;
  const blankFilter = () => ({ q: '', platform: '', tier: '', partner: '', lastWorked: '', category: '', type: [], pic: '', status: '', term: '', history: '', source: '', contact: '' });
  const KTY = C.kolTypes, PR = C.priceRef;
  const typeName = (L, v) => (v ? R.kolTypeLabel(L, v) : KTY.notSet);
  const P = C.perf;
  const km = { selected: new Set(), rows: [], f: blankFilter(), sort: { key: 'id', dir: 'asc' }, limit: PAGE };
  const POP_KEYS = ['category', 'type', 'pic', 'status', 'term', 'history', 'source', 'contact'];   // CR-14 §4.5: + Contact (has / missing contact ID)
  const statusChip = st => (st === 'Blacklist' ? `<span class="st cancel">${esc(st)}</span>` : st === 'Inactive' ? `<span class="st muted">${esc(st)}</span>` : `<span class="st done">${esc(st || 'Active')}</span>`);
  const priceText = q => { if (!q) return ''; const t = R.totalCost(q); return t > 0 ? R.baht(t) : ''; };

  /* ===================== screen ===================== */
  function render(id) {
    const sec = $('tab-kol');
    if (!sec.dataset.built) build(sec);
    const p = takeParams('kol');
    renderList();
    if (p) {
      if (p.newKol) { openNewKol(); return; }
      if (p.id && R.kolById(state(), p.id)) { KT.profile.open(p.id, { edit: !!p.edit, backDeal: p.back || null, tab: p.tab, ids: rowIds }); return; }
    }
    /* #kols/K0011/rates (a link · reload) → that KOL's profile at that tab */
    const r = R.profileRoute(id);
    if (r.id && R.kolById(state(), r.id) && KT.profile.currentId() !== r.id) KT.profile.open(r.id, { tab: r.tab, ids: rowIds });
  }
  function build(sec) {
    const sel = (k, label) => `<select data-kf="${k}" aria-label="${esc(label)}"></select>`;
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(T.title)} <span class="count" id="km_count"></span></h1><span class="spacer"></span><button type="button" class="btn primary" id="km_new">${esc(T.newKol)}</button></div>
      <div class="toolbar" id="km_tools">
        <input type="search" class="search" id="km_q" placeholder="${esc(T.search)}" autocomplete="off">
        ${sel('platform', T.platform)}${sel('tier', T.tier)}${sel('partner', PT.field)}${sel('lastWorked', P.colLastWorked)}
        <details class="menu"><summary class="btn">${ICON.filter} ${esc(T.filters)} <span class="badge hidden" id="km_fbadge"></span></summary><div class="popover" id="km_fpop"></div></details>
        <span class="spacer"></span>
        <details class="menu"><summary class="btn icon" title="${esc(C.app.more)}" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right" id="km_more">
          <button type="button" class="mi" data-m="import">${esc(T.importCsv)}</button><button type="button" class="mi" data-m="kols">${esc(T.exportKols)}</button>
          <button type="button" class="mi" data-m="accounts">${esc(T.exportAccounts)}</button><button type="button" class="mi" data-m="quotes">${esc(T.exportRates)}</button></div></details>
      </div>
      <div class="toolbar hidden" id="km_bulk"><b id="km_selN"></b><button type="button" class="btn primary" id="km_bulkAdd">${esc(T.bulkAdd)}</button><button type="button" class="btn" id="km_bulkPartner">${esc(PT.setBulk)}</button><button type="button" class="btn" id="km_selClear">${esc(T.clear)}</button></div>
      <div class="fchips hidden" id="km_chips"></div>
      <div id="km_body"></div>`;
    let qT;
    $('km_q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { km.f.q = e.target.value; km.limit = PAGE; renderList(); }, 150); });
    sec.querySelectorAll('[data-kf]').forEach(el => el.addEventListener('change', () => { km.f[el.dataset.kf] = el.value; km.limit = PAGE; renderList(); }));
    $('km_fpop').addEventListener('change', e => {
      const k = e.target.dataset.ff; if (k) { km.f[k] = e.target.value; km.limit = PAGE; renderList(); }
    });
    $('km_fpop').addEventListener('click', e => { if (e.target.closest('[data-clearall]')) { POP_KEYS.forEach(k => { km.f[k] = blankFilter()[k]; }); renderList(); } });
    $('km_chips').addEventListener('click', e => {
      if (e.target.closest('[data-clearfilters]')) { clearFilters(); return; }
      const b = e.target.closest('[data-unset]'); if (b) { km.f[b.dataset.unset] = blankFilter()[b.dataset.unset]; renderList(); }
    });
    $('km_more').addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return; b.closest('details').open = false;
      if (b.dataset.m === 'import') openImport(b.closest('details').querySelector('summary')); else exportKols(b.dataset.m);
    });
    $('km_new').addEventListener('click', e => openNewKol(e.currentTarget));   // CR-11 §4.3: a modal (M)
    $('km_bulkAdd').addEventListener('click', openBulkAdd);
    $('km_bulkPartner').addEventListener('click', e => setPartnerBulk(e.currentTarget));   // CR-25 §3.1
    $('km_selClear').addEventListener('click', () => { km.selected.clear(); renderList(); });
    const body = $('km_body');
    body.addEventListener('click', e => {
      if (e.target.id === 'km_all') { const on = e.target.checked; km.rows.forEach(r => (on ? km.selected.add(r.k.kol_id) : km.selected.delete(r.k.kol_id))); renderList(); return; }
      const cb = e.target.closest('input[data-sel]');
      if (cb) { cb.checked ? km.selected.add(cb.dataset.sel) : km.selected.delete(cb.dataset.sel); bulkBar(); return; }
      if (e.target.closest('td.cb')) return;
      const s = e.target.closest('[data-sort]'); if (s) { const k = s.dataset.sort; km.sort = { key: k, dir: km.sort.key === k ? (km.sort.dir === 'asc' ? 'desc' : 'asc') : (k === 'followers' || k === 'rate' || k === 'deals' || k === 'ontime' || k === 'last' ? 'desc' : 'asc') }; renderList(); return; }
      if (e.target.closest('[data-more]')) { km.limit += PAGE; renderList(); return; }
      if (e.target.closest('[data-clearfilters]')) { clearFilters(); return; }
      const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id, tr);
    });
    body.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.target.matches('input')) return; const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id, tr); });
    sec.dataset.built = '1';
  }
  /* CR-07 §4.4 — Clear all filters: every filter back to empty in one go */
  function clearFilters() { km.f = blankFilter(); $('km_q').value = ''; km.limit = PAGE; renderList(); }
  /* CR-16 §4.1 — a row → the KOL profile (‹ › follow this table) */
  function select(id, opener) { KT.profile.open(id, { ids: rowIds, opener }); }
  function markSelected() { const open = KT.profile.currentId(); document.querySelectorAll('#km_body tbody tr[data-id]').forEach(tr => tr.classList.toggle('selected', tr.dataset.id === open)); }

  /* ===================== list ===================== */
  function renderList() {
    const s = state(), ix = R.kolIndex(s), pidx = R.phaseIndex(s), f = km.f, rules = tierRules(), L = s.lookups, td = today(), perf = R.kolPerfAll(s, td);
    /* CR-04 §4.4: create / import for KOL editors · Add to campaign for deal editors */
    $('km_new').classList.toggle('hidden', !can('kol.edit')); $('km_bulkAdd').classList.toggle('hidden', !can('deal.edit')); $('km_bulkPartner').classList.toggle('hidden', !can('kol.edit'));
    const imp = $('km_more').querySelector('[data-m="import"]'); if (imp) imp.classList.toggle('hidden', !can('kol.edit'));
    const lists = {
      platform: [L.platform_list || [], T.allPlatforms], tier: [[...rules].sort((a, b) => a.min_followers - b.min_followers).map(t => t.tier), T.allTiers],
      lastWorked: [R.LAST_WORKED.map(v => ({ value: v, label: P.last[v] })), P.lastAll],
      partner: [R.partnerTypesOf(L).map(t => ({ value: t.key, label: t.label })), PT.allPartners],   // CR-25: Both is in KOL and in Affiliate
    };
    document.querySelectorAll('#km_tools [data-kf]').forEach(el => { const [items, ph] = lists[el.dataset.kf]; el.innerHTML = optionsHTML(items, f[el.dataset.kf], ph); });
    const pop = { category: [T.category, distinct(s.kol_master.map(k => k.kol_category))], type: [T.type, []],
      pic: [T.pic, R.picNames(s, true)], status: [T.kolStatus, R.KOL_STATUSES], term: [T.defaultTerm, R.PAYMENT_TERMS.concat(['none']).map(v => ({ value: v, label: C.term[v] }))], history: [T.dealHistory, [{ value: 'yes', label: T.hasDeals }, { value: 'no', label: T.noDeals }]],
      source: [T.source, distinct(s.kol_master.flatMap(k => k.sources || []))], contact: [T.contact, [{ value: 'has', label: T.hasContact }, { value: 'missing', label: T.missingContact }]] };
    /* CR-07 §4.6 · CR-14 §4.2 — Type: any of the presets (+ Not set) in the one multi-select · nothing ticked = all */
    const tc = R.kolTypeCounts(s), typeOpts = R.kolTypeList(L).filter(t => t.active !== false).map(t => ({ value: t.key, label: t.label })).concat([{ value: '', label: KTY.notSet }]).map(o => Object.assign(o, { sub: R.fmtNum(tc.get(o.value) || 0) }));
    const typeTicks = `<div class="field"><label>${esc(T.type)}</label>` + U.multiSelect({ id: 'km_types', inline: true, options: typeOpts, value: f.type.filter(v => typeOpts.some(o => o.value === v)), aria: T.type,
      searchable: typeOpts.length > 7, placeholder: T.searchType, onChange: v => { km.f.type = v; km.limit = PAGE; renderList(); } }) + `</div>`;
    $('km_fpop').innerHTML = POP_KEYS.map(k => (k === 'type' ? typeTicks : `<div class="field"><label>${esc(pop[k][0])}</label><select data-ff="${k}">${optionsHTML(pop[k][1], f[k], T.any)}</select></div>`)).join('') +
      `<button type="button" class="btn small" data-clearall>${esc(T.clearAll)}</button>`;
    const on = POP_KEYS.filter(k => (Array.isArray(f[k]) ? f[k].length : f[k]));
    $('km_fbadge').textContent = `· ${on.length}`; $('km_fbadge').classList.toggle('hidden', !on.length);
    const chips = on.map(k => [k, `${pop[k][0]}: ${k === 'history' ? (f[k] === 'yes' ? T.hasDeals : T.noDeals) : k === 'term' ? C.term[f[k]] : k === 'type' ? f.type.map(v => typeName(L, v)).join(', ') : k === 'contact' ? (f[k] === 'has' ? T.hasContact : T.missingContact) : f[k]}`]);
    const active = R.activeKolFilters(f), inBar = { platform: T.platform, tier: T.tier, partner: PT.field, lastWorked: P.colLastWorked };
    km.used = [].concat(active.includes('q') ? [C.common.searchChip(R.trim(f.q))] : [],
      Object.keys(inBar).filter(k => f[k]).map(k => `${inBar[k]}: ${k === 'lastWorked' ? P.last[f[k]] : k === 'partner' ? R.partnerTypeLabel(L, f[k]) : f[k]}`), chips.map(c => c[1]));
    U.filterChips($('km_chips'), chips, active.length);

    const q = f.q.trim().toLowerCase(), qh = q.replace(/^@/, ''), rows = [];
    s.kol_master.forEach(k => {
      const accs = ix.accounts.get(k.kol_id) || [], deals = ix.deals.get(k.kol_id) || [];
      if (q && !String(k.display_name).toLowerCase().includes(q) && !accs.some(a => String(a.handle).toLowerCase().includes(qh)) && k.kol_id.toLowerCase() !== q &&
        !String(k.contact_id || '').toLowerCase().includes(q)) return;   // CR-14 §4.5: the contact ID is searched too
      if ((f.contact === 'has' && R.isBlank(k.contact_id)) || (f.contact === 'missing' && !R.isBlank(k.contact_id))) return;
      const mf = R.maxFollowers(accs), tier = R.tierOf(mf, rules);
      if ((f.platform && !accs.some(a => a.platform === f.platform)) || (f.category && k.kol_category !== f.category) || (f.type.length && !f.type.includes(k.kol_type || '')) ||
        (f.tier && tier !== f.tier) || (f.pic && k.pic !== f.pic) || (f.term && (R.isTerm(k.default_payment_term) ? k.default_payment_term : 'none') !== f.term) || (f.status && (k.kol_status || 'Active') !== f.status) ||
        (f.history === 'yes' && !deals.length) || (f.history === 'no' && deals.length) || (f.source && !(k.sources || []).includes(f.source)) || (f.partner && !R.partnerMatch(k, f.partner))) return;
      const pf = perf.get(k.kol_id);
      if (f.lastWorked && pf.bucket !== f.lastWorked) return;
      const quote = (ix.quotes.get(k.kol_id) || [])[0] || null;
      /* CR-14 §4.4 — Last campaign: the Campaign of the deal that gave Last worked (its Phase in the tooltip) */
      const li = pf.lastInfo, lp = li ? (pidx.post.get(li.postId) || {}).phase || R.primaryPhase(pidx, li.dealId) : null;
      const lastCamp = li ? { name: R.campaignName(s, li.campaignId) || '', phase: lp && ix.phases.get(lp) ? R.phaseName(s, lp) : '' } : null;
      rows.push({ k, accs, deals, mf, tier, quote, rate: quote ? R.totalCost(quote) || null : null, lastCamp, pf });
    });
    /* On-time: by rate, Not enough data last · Last worked: by date, Never last */
    const key = { id: r => r.k.kol_id, kol: r => String(r.k.display_name).toLowerCase(), followers: r => r.mf, rate: r => r.rate, deals: r => r.deals.length || null,
      ontime: r => (r.pf.perf.badge === 'none' ? null : r.pf.perf.rate), last: r => r.pf.last,
      lastcamp: r => (r.lastCamp ? `${r.lastCamp.name.toLowerCase()}|${r.pf.last}` : null) }[km.sort.key];
    km.rows = sortBy(rows, key, km.sort.dir, (a, b) => a.k.kol_id.localeCompare(b.k.kol_id));
    const filtered = rows.length !== s.kol_master.length;
    $('km_count').textContent = filtered ? T.countOf(R.fmtNum(rows.length), R.fmtNum(s.kol_master.length)) : countText(s);
    const shown = km.rows.slice(0, km.limit), allSel = km.rows.length > 0 && km.rows.every(r => km.selected.has(r.k.kol_id));
    const th = (label, k, cls) => k ? `<th class="sort${cls ? ' ' + cls : ''}" data-sort="${k}">${esc(label)}${km.sort.key === k ? `<span class="arr">${km.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>` : `<th${cls ? ` class="${cls}"` : ''}>${esc(label)}</th>`;
    if (!rows.length) { $('km_body').innerHTML = U.noMatchHTML(T.noMatch, km.used); bulkBar(); return; }
    $('km_body').innerHTML = `<div class="tablewrap" style="max-height:calc(100vh - 250px)"><table class="tbl km-tbl"><thead><tr>
        <th class="cb" style="width:44px"><input type="checkbox" id="km_all"${allSel ? ' checked' : ''} aria-label="${esc(T.selectAll)}" title="${esc(T.selectAll)}"></th>
        ${th(T.colKol, 'kol')}${th(PT.col, null, 'kpt')}${th(T.colPlatforms)}${th(T.colFollowers, 'followers', 'num')}${th(T.colTier)}${th(T.colCategoryType)}${th(T.colPic)}${th(T.colRate, 'rate', 'num')}${th(T.colDeals, 'deals', 'num')}${th(P.colOnTime, 'ontime')}${th(P.colLastWorked, 'last')}${th(T.colLastCampaign, 'lastcamp')}
      </tr></thead><tbody>` +
      shown.map(r => `<tr class="click" tabindex="0" data-id="${esc(r.k.kol_id)}"><td class="cb"><input type="checkbox" data-sel="${esc(r.k.kol_id)}"${km.selected.has(r.k.kol_id) ? ' checked' : ''} aria-label="${esc(r.k.display_name)}"></td>` +
        `<td class="kcol"><div class="kolcell">${U.avatarHTML(r.k)}<div class="cell2"><span class="kname"><b>${U.nameHTML(r.k.display_name)}</b>${U.copyBtnHTML(r.k.display_name)}</span><span class="sub">${esc(r.k.kol_id)}${r.k.kol_status && r.k.kol_status !== 'Active' ? ` · ${esc(r.k.kol_status)}` : ''}</span></div></div></td>` +
        `<td class="kpt">${U.partnerTagHTML(r.k)}</td><td><span class="pfs">${[...new Set(r.accs.map(a => a.platform))].map(p => pfIcon(p)).join('')}</span></td>` +
        `<td class="num">${R.fmtNum(r.mf)}</td><td>${esc(r.tier)}</td><td class="kcat" title="${esc([r.k.kol_category, R.kolTypeLabel(L, r.k.kol_type)].filter(Boolean).join(' · '))}"><span class="cell2"><span>${esc(r.k.kol_category || '')}</span>${r.k.kol_type ? `<span class="sub">${esc(R.kolTypeLabel(L, r.k.kol_type))}</span>` : ''}</span></td><td>${esc(r.k.pic || '')}</td>` +
        `<td class="num" title="${esc(r.quote ? r.quote.source : '')}">${priceText(r.quote)}</td><td class="num">${r.deals.length || ''}</td><td>${r.pf.perf.measured ? U.reliabilityChip(r.pf.perf) : ''}</td><td>${lastWorkedHTML(r.pf.last, td)}</td>` +
        `<td class="kphase"${r.lastCamp ? ` title="${esc(T.lastCampTip(r.lastCamp.name, r.lastCamp.phase))}"` : ''}>${r.lastCamp ? esc(r.lastCamp.name) : `<span class="muted">—</span>`}</td></tr>`).join('') +
      `</tbody></table></div>` + (km.rows.length > shown.length ? `<div class="loadmore"><button type="button" class="btn" data-more>${esc(T.loadMore(km.rows.length - shown.length))}</button></div>` : '');
    markSelected(); bulkBar();
  }
  /* CR-25 §3.1 — "911 partners (KOL 900 · Affiliate 8 · Both 3) · 928 accounts" */
  function countText(s) {
    const n = R.partnerCounts(s.kol_master), parts = R.partnerTypesOf(s.lookups).map(t => `${t.label} ${R.fmtNum(n[t.key])}`).join(' · ');
    return PT.count(R.fmtNum(s.kol_master.length), parts, R.fmtNum(s.kol_accounts.length));
  }
  /* CR-25 §3.1 — the ticked KOLs → one Partner type (KOL · Affiliate · Both) */
  function setPartnerBulk(anchor) {
    if (!guard('kol.edit')) return;
    const ids = [...km.selected]; if (!ids.length) return;
    let pick = '';
    const m = U.popForm(anchor, { title: PT.setTitle(ids.length), ok: PT.setOk, body: `<div class="field"><label>${esc(PT.field)} <span class="req">*</span></label>${U.partnerSegHTML('data-bpt', '')}</div>`,
      focus: '[data-bpt]',
      onOk: f => {
        if (!pick) { U.popFormError(f, PT.required); return false; }
        if (!guard('kol.edit')) return false;
        const s = state(), list = ids.map(id => R.kolById(s, id)).filter(k => k && R.partnerTypeOf(k) !== pick);
        if (!list.length) { toast(PT.setSame); return true; }
        list.forEach(k => { k.partner_type = pick; });
        commit(PT.setDone(list.length, R.partnerTypeLabel(s.lookups, pick))); renderList();
        return true;
      } });
    m.addEventListener('click', e => { const b = e.target.closest('[data-bpt]'); if (b) { pick = U.partnerSegPick(b, 'data-bpt'); U.popFormError(m, ''); } });
  }
  /* "04/09/2026 · 31 days ago" · Never = — */
  const lastWorkedHTML = (date, td) => (date ? `<span class="cell2"><span>${esc(R.dmy(date))}</span><span class="sub">${esc(P.daysAgo(R.dayDiff(td, date)))}</span></span>` : `<span class="muted">—</span>`);
  function bulkBar() {
    const n = km.selected.size;
    $('km_bulk').classList.toggle('hidden', !n); $('km_tools').classList.toggle('hidden', !!n);
    $('km_selN').textContent = T.selected(n);
    const all = $('km_all'); if (all) all.checked = km.rows.length > 0 && km.rows.every(r => km.selected.has(r.k.kol_id));
  }

  /* ===================== CR-11 §4.3 — create modals ===================== */
  /* + New KOL (M): the Create KOL form of New deal · a KOL with that name / handle already → Use this KOL (its drawer) · KOL created · Open */
  function openNewKol(opener) {
    if (!guard('kol.edit')) return;
    const c = { draft: Object.assign(R.createKolDraft('', U.me()), { _forDeal: false }), touched: new Set(), submitted: false, anyway: false };
    let dirty = false;
    U.createModal({ size: 'M', title: T.newTitle, sub: T.newSub, opener, isDirty: () => dirty, focus: '#f_ck_display_name', body: U.kolCreateHTML(c.draft, { vault: true }),   // CR-30 §3.5: + Payee & shipping
      foot: [`<div class="checks" id="ck_checks"></div>`, U.cmButtons(C.bulk.ck.create, 'ck_ok', { attrs: ' data-act="ckCreate"' })],
      onClick: e => {
        const u = e.target.closest('[data-act="ckUse"]'); if (u) { const id = u.dataset.kolid; U.closeModal(); select(id); return; }
        const b = e.target.closest('[data-act="ckCreate"]'); if (b && !b.disabled) create();
      } });
    const root = $('cm_root'), chk = () => U.kolCreateCheck(root, c);
    U.wireKolCreate(root, c, () => { dirty = true; chk(); }); chk();
    async function create() {
      c.submitted = true; const r = chk(); if (r.res.errs.length || (r.dup && !c.anyway) || !guard('kol.edit')) { const bad = root.querySelector('.invalid'); if (bad) bad.scrollIntoView({ block: 'center' }); return; }
      const vx = KT.payee.nkVaultRead(root);   // CR-30 §3.5 — Payee & shipping: read once, encrypted below, the boxes wiped
      const s = state(), recs = R.createKolRecords(c.draft, { kolId: store.newId('kol'), accountId: store.newId('account') });
      s.kol_master.push(recs.kol); if (recs.account) s.kol_accounts.push(recs.account);
      let vaultMsg = '';
      if (vx.ship || vx.bank) { try { vaultMsg = KT.payee.nkVaultLabels(await KT.payee.nkVaultSave(recs.kol.kol_id, vx)); } catch (e) { vaultMsg = null; } }
      KT.payee.nkVaultWipe(root);
      U.closeModal(); commit(); renderList(); flashRow(recs.kol.kol_id);
      U.toastAction(C.common.created(T.thing) + (vaultMsg ? ` · ${C.newKol.vaultSaved(vaultMsg)}` : vaultMsg === null ? ` · ${C.newKol.vaultFailed}` : ''), C.common.open, () => select(recs.kol.kol_id), 8000);
    }
  }
  /* a new row lit up for 5 s (the list shows enough rows to reach it) */
  function flashRow(id) {
    const i = km.rows.findIndex(r => r.k.kol_id === id); if (i >= km.limit) { km.limit = i + 1; renderList(); }
    setTimeout(() => { const tr = document.querySelector(`#km_body tr[data-id="${CSS.escape(id)}"]`); if (!tr) return; tr.classList.add('flash'); tr.scrollIntoView({ block: 'center' }); setTimeout(() => tr.classList.remove('flash'), 5000); }, 200);
  }
  /* CR-10 §4.11 · CR-20 §4.2 — the ticked KOLs go to New deal › From KOL Master (already in its Selected panel) */
  function openBulkAdd() {
    if (!guard('deal.edit')) return;
    const ids = [...km.selected]; if (!ids.length) return;
    KT.bulk.open({ kolIds: ids });
  }
  function exportKols(kind) {
    const s = state(), kols = km.rows.map(r => r.k), ids = new Set(kols.map(k => k.kol_id));
    if (kind === 'kols') downloadCSV('kol_master.csv', R.KOL_COLS, R.kolRows(s, kols));
    if (kind === 'accounts') downloadCSV('kol_accounts.csv', R.ACCOUNT_COLS, R.accountRows(s, s.kol_accounts.filter(a => ids.has(a.kol_id))));
    if (kind === 'quotes') downloadCSV('kol_rate_quotes.csv', R.QUOTE_COLS, R.quoteRows(s, s.kol_rate_quotes.filter(q => ids.has(q.kol_id))));
  }
  function openImport(opener) {
    if (!guard('kol.edit')) return;
    const IO = C.io;
    let plan = null, fileName = ''; const confirmed = new Set();
    U.createModal({ size: 'L', title: IO.importTitle, opener, isDirty: () => !!plan, foot: ['', U.cmButtons(IO.importApply, 'im_ok', { attrs: ' disabled' })],
      body: `<div class="toolbar"><input type="file" id="im_file" accept=".csv,text/csv,.xlsx" style="width:auto"><button type="button" class="btn small" id="im_sample">${ICON.download}<span>${esc(IO.downloadTemplate)}</span></button></div>
      <p class="hint">${esc(IO.importCols(R.IMPORT_REQUIRED.join(', '), R.TEMPLATE_COLS.filter(c => !R.IMPORT_REQUIRED.includes(c)).join(', ')))}</p><p class="hint">${esc(IO.importRules)}</p><div id="im_prev"></div>` });
    /* CR-14 §4.6 — the template: the 10 columns of KOL_Master_Import_Template.csv (UTF-8 with BOM) */
    $('im_sample').addEventListener('click', () => { U.download('KOL_Master_Import_Template.csv', R.templateCSV(), 'text/csv;charset=utf-8'); toast(IO.templateDone); });
    const show = () => {
      if (!plan) return;
      if (plan.headerError) { $('im_prev').innerHTML = checksHTML({ errs: [{ msg: plan.headerError }] }, ''); $('im_ok').disabled = true; return; }
      const n = k => plan.rows.filter(r => r.kind === k).length, KIND_CLS = { match: 'muted', new_account: 'warn', new_kol: 'done', error: 'cancel' };
      $('im_prev').innerHTML = (plan.ignored || []).map(c => `<div class="check info">i <span>${esc(IO.importIgnoredCol(c))}</span></div>`).join('') + (plan.rows.length ? `<div class="check info">i <span>${esc(IO.importSummary(n('match'), n('new_account'), n('new_kol'), n('error')))}</span></div>` +
        (n('new_account') ? `<div class="check warn" style="margin-top:6px">! <span>${esc(IO.importTick)}</span></div>` : '') +
        `<div class="tablewrap" style="max-height:52vh;margin-top:8px"><table class="tbl compact-sm"><thead><tr><th>${esc(IO.importRow)}</th><th></th><th>${esc(IO.importConfirmCol)}</th><th>${esc(IO.cName)}</th><th>${esc(IO.cPlatform)}</th><th>${esc(IO.cHandle)}</th><th class="num">${esc(IO.cFollowers)}</th><th class="num">${esc(IO.cRate)}</th><th>KOL</th><th>${esc(IO.cNotes)}</th></tr></thead><tbody>` +
        plan.rows.map(r => `<tr><td>${r.n}</td><td><span class="st ${KIND_CLS[r.kind]}">${esc(IO.importKind[r.kind])}</span></td>` +
          `<td>${r.needsConfirm ? `<input type="checkbox" data-imok="${r.n}"${confirmed.has(r.n) ? ' checked' : ''}>` : ''}</td><td>${esc(r.name)}</td><td>${esc(r.platform)}</td><td>${r.handle ? '@' + esc(r.handle) : ''}</td>` +
          `<td class="num">${R.fmtNum(r.followers)}</td><td class="num">${R.fmtNum(r.prices.rate_card)}</td><td>${r.kol ? esc(r.kol.display_name + ' · ' + r.kol.kol_id) : ''}</td>` +
          `<td style="max-width:320px" title="${esc(r.errs.concat(r.warns).join('\n'))}">${r.errs.map(m => `<span class="late">✕ ${esc(m)}</span>`).join(' ')}${r.warns.map(m => `<span class="muted">! ${esc(m)}</span>`).join(' ')}</td></tr>`).join('') + `</tbody></table></div>`
        : `<div class="hint">${esc(IO.importNoRows)}</div>`);
      $('im_prev').querySelectorAll('[data-imok]').forEach(cb => cb.addEventListener('change', () => { cb.checked ? confirmed.add(+cb.dataset.imok) : confirmed.delete(+cb.dataset.imok); }));
      $('im_ok').disabled = !plan.rows.some(r => r.kind !== 'error');
    };
    $('im_file').addEventListener('change', async e => {
      const f = e.target.files[0]; plan = null; confirmed.clear(); $('im_ok').disabled = true; $('im_prev').innerHTML = '';
      if (!f) return;
      fileName = f.name;
      plan = R.planImport(state(), await importTable(f));
      show();
    });
    $('im_ok').addEventListener('click', () => {
      if (!plan || plan.headerError) return;
      const out = R.applyImport(state(), plan, confirmed, fileName, today());
      Object.assign(state(), { kol_master: out.kol_master, kol_accounts: out.kol_accounts, kol_rate_quotes: out.kol_rate_quotes });
      U.closeModal(); commit(IO.importDone(out.summary));
      renderList();
    });
  }

  /* the rows of a chosen file: a CSV (UTF-8 · Thai Windows) or the Excel template (sheet KOL_Import, else the first sheet with display_name) · read in memory only */
  async function importTable(f) {
    if (!/\.xlsx$/i.test(f.name)) return R.parseCSV(await U.readText(f));
    try {
      const book = await KT.xlsx.read(new Uint8Array(await f.arrayBuffer())), sheets = book.sheets || [];
      const sh = sheets.find(x => x.name === 'KOL_Import') || sheets.find(x => (x.rows[0] || []).some(v => String(v == null ? '' : v).trim().toLowerCase() === 'display_name')) || sheets[0];
      return sh ? sh.rows.map(r => r.map(v => (v == null ? '' : String(v)))) : [];
    } catch (e) { return [[]]; }
  }
  function reset() { KT.profile.reset(); Object.assign(km, { f: blankFilter(), limit: PAGE }); km.selected.clear(); }
  /* CR-16 — what the profile needs from the table: its order (‹ › / ↑ ↓) · draw it again · the open row lit */
  const rowIds = () => km.rows.map(r => r.k.kol_id);
  const refreshList = () => { if ($('tab-kol').dataset.built) renderList(); };
  return { render, reset, rowIds, refreshList, markSelected, unselect: id => km.selected.delete(id) };
})();
