/* screen-kol.js — KOL Master: page header, toolbar / bulk bar, sortable list, and the KOL drawer
   (Profile · Accounts · Rates · Current deals · History; edit with Merge in ⋯). Rates, Add to phase, Import and Merge are dialogs.
   → KT.screens.kol */
KT.screens.kol = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, downloadCSV, checksHTML, kv, field, range, stChip, stageChip, stepTitle, initials, ICON, pfIcon, tierRules,
    distinct, optionsHTML, activeList, campaignOptionsHTML, sortBy, dateHTML, dlg, openDialog, closeDialog, openDrawer, fillDrawer, setHash, go, takeParams, userId, can, guard, picList } = U;
  const T = C.kol, PAGE = 100;
  const blankFilter = () => ({ q: '', platform: '', tier: '', lastWorked: '', category: '', type: [], pic: '', status: '', term: '', history: '', source: '' });
  const KTY = C.kolTypes, PR = C.priceRef;
  const typeName = (L, v) => (v ? R.kolTypeLabel(L, v) : KTY.notSet);
  const P = C.perf;
  const km = { mode: 'none', id: null, draft: null, touched: new Set(), dirty: false, selected: new Set(), rows: [], f: blankFilter(), sort: { key: 'id', dir: 'asc' }, limit: PAGE, backDeal: null };
  const editing = () => km.mode === 'edit' || km.mode === 'new';
  const POP_KEYS = ['category', 'type', 'pic', 'status', 'term', 'history', 'source'];
  const statusChip = st => (st === 'Blacklist' ? `<span class="st cancel">${esc(st)}</span>` : st === 'Inactive' ? `<span class="st muted">${esc(st)}</span>` : `<span class="st done">${esc(st || 'Active')}</span>`);
  const priceText = q => { if (!q) return ''; const t = R.totalCost(q); return t > 0 ? R.baht(t) : ''; };
  const openDeal = id => go('deals', { deal: id, kol: km.id });

  /* ===================== screen ===================== */
  function render(id) {
    const sec = $('tab-kol');
    if (!sec.dataset.built) build(sec);
    const p = takeParams('kol');
    renderList();
    if (p) {
      if (editing()) { toast(C.common.blockWhileEditing); renderPanel(); return; }
      if (p.newKol) { km.backDeal = p.back || null; openNewKol(); return; }
      if (p.id && R.kolById(state(), p.id)) { Object.assign(km, { mode: 'view', id: p.id, backDeal: p.back || null }); renderPanel(); if (p.edit) startEdit(); return; }
    }
    if (id && R.kolById(state(), id) && !editing()) { Object.assign(km, { mode: 'view', id }); renderPanel(); }
    else if (editing()) renderPanel();
  }
  function build(sec) {
    const sel = (k, label) => `<select data-kf="${k}" aria-label="${esc(label)}"></select>`;
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(T.title)} <span class="count" id="km_count"></span></h1><span class="spacer"></span><button type="button" class="btn primary" id="km_new">${esc(T.newKol)}</button></div>
      <div class="toolbar" id="km_tools">
        <input type="search" class="search" id="km_q" placeholder="${esc(T.search)}" autocomplete="off">
        ${sel('platform', T.platform)}${sel('tier', T.tier)}${sel('lastWorked', P.colLastWorked)}
        <details class="menu"><summary class="btn">${ICON.filter} ${esc(T.filters)} <span class="badge hidden" id="km_fbadge"></span></summary><div class="popover" id="km_fpop"></div></details>
        <span class="spacer"></span>
        <details class="menu"><summary class="btn icon" title="${esc(C.app.more)}" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right" id="km_more">
          <button type="button" class="mi" data-m="import">${esc(T.importCsv)}</button><button type="button" class="mi" data-m="kols">${esc(T.exportKols)}</button>
          <button type="button" class="mi" data-m="accounts">${esc(T.exportAccounts)}</button><button type="button" class="mi" data-m="quotes">${esc(T.exportRates)}</button></div></details>
      </div>
      <div class="toolbar hidden" id="km_bulk"><b id="km_selN"></b><button type="button" class="btn primary" id="km_bulkAdd">${esc(T.bulkAdd)}</button><button type="button" class="btn" id="km_selClear">${esc(T.clear)}</button></div>
      <div class="fchips hidden" id="km_chips"></div>
      <div id="km_body"></div>`;
    let qT;
    $('km_q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { km.f.q = e.target.value; km.limit = PAGE; renderList(); }, 150); });
    sec.querySelectorAll('[data-kf]').forEach(el => el.addEventListener('change', () => { km.f[el.dataset.kf] = el.value; km.limit = PAGE; renderList(); }));
    $('km_fpop').addEventListener('change', e => {
      /* CR-07 §4.6 — Type: tick any of the presets (+ Not set) */
      const tv = e.target.dataset.typev; if (tv != null) { const on = new Set(km.f.type); e.target.checked ? on.add(tv) : on.delete(tv); km.f.type = [...on]; km.limit = PAGE; renderList(); return; }
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
    $('km_new').addEventListener('click', e => { km.backDeal = null; openNewKol(e.currentTarget); });   // CR-11 §4.3: a modal (M)
    $('km_bulkAdd').addEventListener('click', openBulkAdd);
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
      const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id);
    });
    body.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.target.matches('input')) return; const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id); });
    sec.dataset.built = '1';
  }
  /* CR-07 §4.4 — Clear all filters: every filter back to empty in one go */
  function clearFilters() { km.f = blankFilter(); $('km_q').value = ''; km.limit = PAGE; renderList(); }
  /* the open KOL is drawn again when the vault locks / unlocks (decrypted details never stay on screen once locked) */
  KT.vault.onChange(() => { if (U.currentTab() === 'kol' && km.mode === 'view' && U.drawerOwner() === owner) renderPanel(); });
  function select(id) {
    if (editing()) { if (id !== km.id) toast(C.common.blockWhileEditing); return; }
    Object.assign(km, { mode: 'view', id, draft: null, backDeal: null }); km.touched.clear();
    markSelected(); renderPanel();
  }
  function markSelected() { const open = km.mode !== 'none' ? km.id : null; document.querySelectorAll('#km_body tbody tr[data-id]').forEach(tr => tr.classList.toggle('selected', tr.dataset.id === open)); }

  /* ===================== list ===================== */
  function renderList() {
    const s = state(), ix = R.kolIndex(s), pidx = R.phaseIndex(s), f = km.f, rules = tierRules(), L = s.lookups, td = today(), perf = R.kolPerfAll(s, td);
    /* CR-04 §4.4: create / import for KOL editors · Add to campaign for deal editors */
    $('km_new').classList.toggle('hidden', !can('kol.edit')); $('km_bulkAdd').classList.toggle('hidden', !can('deal.edit'));
    const imp = $('km_more').querySelector('[data-m="import"]'); if (imp) imp.classList.toggle('hidden', !can('kol.edit'));
    const lists = {
      platform: [L.platform_list || [], T.allPlatforms], tier: [[...rules].sort((a, b) => a.min_followers - b.min_followers).map(t => t.tier), T.allTiers],
      lastWorked: [R.LAST_WORKED.map(v => ({ value: v, label: P.last[v] })), P.lastAll],
    };
    document.querySelectorAll('#km_tools [data-kf]').forEach(el => { const [items, ph] = lists[el.dataset.kf]; el.innerHTML = optionsHTML(items, f[el.dataset.kf], ph); });
    const pop = { category: [T.category, distinct(s.kol_master.map(k => k.kol_category))], type: [T.type, []],
      pic: [T.pic, R.picNames(s, true)], status: [T.kolStatus, R.KOL_STATUSES], term: [T.defaultTerm, R.PAYMENT_TERMS.concat(['none']).map(v => ({ value: v, label: C.term[v] }))], history: [T.dealHistory, [{ value: 'yes', label: T.hasDeals }, { value: 'no', label: T.noDeals }]],
      source: [T.source, distinct(s.kol_master.flatMap(k => k.sources || []))] };
    const tc = R.kolTypeCounts(s), tick = (v, label) => `<label class="tick"><input type="checkbox" data-typev="${esc(v)}"${f.type.includes(v) ? ' checked' : ''}> ${esc(label)} <span class="muted">${R.fmtNum(tc.get(v) || 0)}</span></label>`;
    const typeTicks = `<div class="field"><label>${esc(T.type)}</label><div class="ticks typeticks">${R.kolTypeList(L).filter(t => t.active !== false).map(t => tick(t.key, t.label)).join('')}${tick('', KTY.notSet)}</div></div>`;
    $('km_fpop').innerHTML = POP_KEYS.map(k => (k === 'type' ? typeTicks : `<div class="field"><label>${esc(pop[k][0])}</label><select data-ff="${k}">${optionsHTML(pop[k][1], f[k], T.any)}</select></div>`)).join('') +
      `<button type="button" class="btn small" data-clearall>${esc(T.clearAll)}</button>`;
    const on = POP_KEYS.filter(k => (Array.isArray(f[k]) ? f[k].length : f[k]));
    $('km_fbadge').textContent = `· ${on.length}`; $('km_fbadge').classList.toggle('hidden', !on.length);
    const chips = on.map(k => [k, `${pop[k][0]}: ${k === 'history' ? (f[k] === 'yes' ? T.hasDeals : T.noDeals) : k === 'term' ? C.term[f[k]] : k === 'type' ? f.type.map(v => typeName(L, v)).join(', ') : f[k]}`]);
    const active = R.activeKolFilters(f), inBar = { platform: T.platform, tier: T.tier, lastWorked: P.colLastWorked };
    km.used = [].concat(active.includes('q') ? [C.common.searchChip(R.trim(f.q))] : [],
      Object.keys(inBar).filter(k => f[k]).map(k => `${inBar[k]}: ${k === 'lastWorked' ? P.last[f[k]] : f[k]}`), chips.map(c => c[1]));
    U.filterChips($('km_chips'), chips, active.length);

    const q = f.q.trim().toLowerCase(), qh = q.replace(/^@/, ''), rows = [];
    s.kol_master.forEach(k => {
      const accs = ix.accounts.get(k.kol_id) || [], deals = ix.deals.get(k.kol_id) || [];
      if (q && !String(k.display_name).toLowerCase().includes(q) && !accs.some(a => String(a.handle).toLowerCase().includes(qh)) && k.kol_id.toLowerCase() !== q) return;
      const mf = R.maxFollowers(accs), tier = R.tierOf(mf, rules);
      if ((f.platform && !accs.some(a => a.platform === f.platform)) || (f.category && k.kol_category !== f.category) || (f.type.length && !f.type.includes(k.kol_type || '')) ||
        (f.tier && tier !== f.tier) || (f.pic && k.pic !== f.pic) || (f.term && (R.isTerm(k.default_payment_term) ? k.default_payment_term : 'none') !== f.term) || (f.status && (k.kol_status || 'Active') !== f.status) ||
        (f.history === 'yes' && !deals.length) || (f.history === 'no' && deals.length) || (f.source && !(k.sources || []).includes(f.source))) return;
      const pf = perf.get(k.kol_id);
      if (f.lastWorked && pf.bucket !== f.lastWorked) return;
      const quote = (ix.quotes.get(k.kol_id) || [])[0] || null;
      rows.push({ k, accs, deals, mf, tier, quote, rate: quote ? R.totalCost(quote) || null : null, lastPhase: R.latestPhaseOf(deals, ix.phases, pidx), pf });
    });
    /* On-time: by rate, Not enough data last · Last worked: by date, Never last */
    const key = { id: r => r.k.kol_id, kol: r => String(r.k.display_name).toLowerCase(), followers: r => r.mf, rate: r => r.rate, deals: r => r.deals.length || null,
      ontime: r => (r.pf.perf.badge === 'none' ? null : r.pf.perf.rate), last: r => r.pf.last }[km.sort.key];
    km.rows = sortBy(rows, key, km.sort.dir, (a, b) => a.k.kol_id.localeCompare(b.k.kol_id));
    const filtered = rows.length !== s.kol_master.length;
    $('km_count').textContent = filtered ? T.countOf(R.fmtNum(rows.length), R.fmtNum(s.kol_master.length)) : T.count(R.fmtNum(s.kol_master.length), R.fmtNum(s.kol_accounts.length));
    const shown = km.rows.slice(0, km.limit), allSel = km.rows.length > 0 && km.rows.every(r => km.selected.has(r.k.kol_id));
    const th = (label, k, cls) => k ? `<th class="sort${cls ? ' ' + cls : ''}" data-sort="${k}">${esc(label)}${km.sort.key === k ? `<span class="arr">${km.sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>` : `<th${cls ? ` class="${cls}"` : ''}>${esc(label)}</th>`;
    if (!rows.length) { $('km_body').innerHTML = U.noMatchHTML(T.noMatch, km.used); bulkBar(); return; }
    $('km_body').innerHTML = `<div class="tablewrap" style="max-height:calc(100vh - 250px)"><table class="tbl km-tbl"><thead><tr>
        <th class="cb" style="width:44px"><input type="checkbox" id="km_all"${allSel ? ' checked' : ''} aria-label="${esc(T.selectAll)}" title="${esc(T.selectAll)}"></th>
        ${th(T.colKol, 'kol')}${th(T.colPlatforms)}${th(T.colFollowers, 'followers', 'num')}${th(T.colTier)}${th(T.colCategoryType)}${th(T.colPic)}${th(T.colRate, 'rate', 'num')}${th(T.colDeals, 'deals', 'num')}${th(P.colOnTime, 'ontime')}${th(P.colLastWorked, 'last')}${th(T.colLastPhase)}
      </tr></thead><tbody>` +
      shown.map(r => `<tr class="click" tabindex="0" data-id="${esc(r.k.kol_id)}"><td class="cb"><input type="checkbox" data-sel="${esc(r.k.kol_id)}"${km.selected.has(r.k.kol_id) ? ' checked' : ''} aria-label="${esc(r.k.display_name)}"></td>` +
        `<td class="kcol"><div class="kolcell"><span class="av">${esc(initials(r.k.display_name))}</span><div class="cell2"><span class="kname"><b>${U.nameHTML(r.k.display_name)}</b>${U.copyBtnHTML(r.k.display_name)}</span><span class="sub">${esc(r.k.kol_id)}${r.k.kol_status && r.k.kol_status !== 'Active' ? ` · ${esc(r.k.kol_status)}` : ''}</span></div></div></td>` +
        `<td><span class="pfs">${[...new Set(r.accs.map(a => a.platform))].map(p => pfIcon(p)).join('')}</span></td>` +
        `<td class="num">${R.fmtNum(r.mf)}</td><td>${esc(r.tier)}</td><td class="kcat" title="${esc([r.k.kol_category, R.kolTypeLabel(L, r.k.kol_type)].filter(Boolean).join(' · '))}"><span class="cell2"><span>${esc(r.k.kol_category || '')}</span>${r.k.kol_type ? `<span class="sub">${esc(R.kolTypeLabel(L, r.k.kol_type))}</span>` : ''}</span></td><td>${esc(r.k.pic || '')}</td>` +
        `<td class="num" title="${esc(r.quote ? r.quote.source : '')}">${priceText(r.quote)}</td><td class="num">${r.deals.length || ''}</td><td>${r.pf.perf.measured ? U.reliabilityChip(r.pf.perf) : ''}</td><td>${lastWorkedHTML(r.pf.last, td)}</td>` +
        `<td class="kphase" title="${esc(r.lastPhase ? R.phaseLabel(s, r.lastPhase.phase_id, false) : '')}">${r.lastPhase ? esc(R.phaseLabel(s, r.lastPhase.phase_id, false)) : ''}</td></tr>`).join('') +
      `</tbody></table></div>` + (km.rows.length > shown.length ? `<div class="loadmore"><button type="button" class="btn" data-more>${esc(T.loadMore(km.rows.length - shown.length))}</button></div>` : '');
    markSelected(); bulkBar();
  }
  /* "04/09/2026 · 31 days ago" · Never = — */
  const lastWorkedHTML = (date, td) => (date ? `<span class="cell2"><span>${esc(R.dmy(date))}</span><span class="sub">${esc(P.daysAgo(R.dayDiff(td, date)))}</span></span>` : `<span class="muted">—</span>`);
  function bulkBar() {
    const n = km.selected.size;
    $('km_bulk').classList.toggle('hidden', !n); $('km_tools').classList.toggle('hidden', !!n);
    $('km_selN').textContent = T.selected(n);
    const all = $('km_all'); if (all) all.checked = km.rows.length > 0 && km.rows.every(r => km.selected.has(r.k.kol_id));
  }

  /* ===================== drawer ===================== */
  const owner = {
    kind: 'kol',
    isDirty: () => editing() && km.dirty,
    onClose: () => { Object.assign(km, { mode: 'none', id: null, draft: null, backDeal: null }); km.touched.clear(); if (U.currentTab() === 'kol') setHash('kol'); markSelected(); },
    onSuspend: () => { if (!editing()) Object.assign(km, { mode: 'none', id: null }); },
  };
  const closeBtn = `<button type="button" class="icon-btn" data-dr-close aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button>`;
  const backHTML = () => (km.backDeal ? `<button type="button" class="link small" data-deal="${esc(km.backDeal)}">${esc(T.backToDeal(km.backDeal))}</button>` : '');
  function renderPanel() {
    let html;
    if (km.mode === 'view') { const k = R.kolById(state(), km.id); if (!k) { U.closeDrawer(); return; } html = viewHTML(k); setHash('kol/' + k.kol_id); }
    else if (editing()) { html = formHTML(); setHash(km.mode === 'edit' ? 'kol/' + km.id : 'kol'); }
    else return;
    if (U.drawerOwner() === owner) fillDrawer(html); else openDrawer(owner, html);
    $('drawer_content').onclick = panelClick;
    if (editing()) { wireForm(); check(); } else KT.payee.fillSecure($('drawer_content'));
    markSelected();
  }
  const sec = (title, body, extra) => `<section class="sec"><div class="sec-h"><span>${esc(title)}</span>${extra || ''}</div>${body}</section>`;
  /* the deal's planned steps only (CR-02 §4.2) */
  function miniStepper(s, d) {
    const cur = R.stepOf(s.lookups, d.sub_status), curSort = cur ? cur.sort_order : -Infinity;
    return `<div class="stepper-mini" aria-hidden="true">` + R.planSteps(s.lookups, d).map(st =>
      `<span class="${st.sort_order < curSort ? 'done' : st.sort_order === curSort ? 'cur' : ''}" title="${esc(st.sub_status)}"></span>`).join('') + `</div>`;
  }
  function viewHTML(k) {
    const s = state(), rules = tierRules(), td = today(), O = C.kolOptions;
    const accs = R.accountsOfKol(s, k.kol_id), deals = R.dealsOfKol(s, k.kol_id), quotes = R.quotesOfKol(s, k.kol_id), mf = R.maxFollowers(accs);
    const postsByDeal = new Map(); s.deal_posts.forEach(p => { if (!postsByDeal.has(p.deal_id)) postsByDeal.set(p.deal_id, []); postsByDeal.get(p.deal_id).push(p); });
    const accById = new Map(s.kol_accounts.map(a => [a.account_id, a])), phaseById = new Map(s.phases.map(p => [p.phase_id, p])), campById = new Map(s.campaigns.map(c => [c.campaign_id, c]));
    /* CR-03: a deal belongs to a Campaign; its Phase here is the primary Phase (of its earliest post) */
    const pidx = R.phaseIndex(s), primaryOf = d => R.primaryPhase(pidx, d.deal_id);
    const profile = kv(T.category, k.kol_category) + kv(T.type, R.kolTypeLabel(s.lookups, k.kol_type)) + kv(T.gender, k.gender ? O.gender[k.gender] : '') + kv(T.contact, k.contact_channel) +
      kv(T.kolStatus, (k.kol_status || 'Active') + (k.status_reason ? ` · ${k.status_reason}` : '')) + kv(T.defaultTerm, C.term[R.isTerm(k.default_payment_term) ? k.default_payment_term : 'none']) + kv(T.note, k.note) +
      `<div class="kv"><span>${esc(T.source)}</span><b class="chips" style="justify-content:flex-end">${(k.sources || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</b></div>`;
    const accounts = accs.map(a => { const n = R.postsOnAccount(s, a.account_id);
      return `<div class="kv"><span>${pfIcon(a.platform)} ${a.profile_link ? `<a href="${esc(a.profile_link)}" target="_blank" rel="noopener">@${esc(a.handle)}</a>` : `@${esc(a.handle)}`}` +
        `${a.is_legacy ? ` <span class="badge-legacy" title="${esc(T.legacyTip)}">${esc(T.incomplete)}</span>` : ''}</span><b>${esc(T.followersTier(R.fmtNum(a.followers) || '—', R.tierOf(a.followers, rules) || '—'))} · ${esc(T.posts(n))}</b></div>`; }).join('');
    const perfHead = R.kolPerformance(s, k.kol_id, td);
    /* CR-07 §4.5 — Latest rate · Average first, then the quote history (date · source + note · total; the parts in the tooltip) */
    const L5 = PR.rows, parts = q => R.COST_KEYS.filter(f => !R.isBlank(q[f])).map(f => `${L5[f]} ${R.fmtNum(q[f])}`).join(' · ');
    const rates = `<div class="rsum">${esc(U.priceRefSummary(k.kol_id))}</div>` +
      (quotes.length ? `<div class="tablewrap"><table class="tbl compact-sm qhist"><thead><tr><th>${esc(T.qDate)}</th><th>${esc(T.qSource)}</th><th class="num">${esc(T.qTotal)}</th></tr></thead><tbody>` +
        quotes.map(q => { const a = accById.get(q.account_id);
          return `<tr title="${esc([a ? `${a.platform} @${a.handle}` : '', parts(q)].filter(Boolean).join('\n'))}"><td>${q.quoted_at ? R.dmy(q.quoted_at) : `<span class="muted">${esc(T.undated)}</span>`}</td>` +
            `<td class="qsrc"><span>${esc(q.source)}</span>${q.note ? `<span class="sub">${esc(q.note)}</span>` : ''}</td><td class="num">${R.totalCost(q) ? R.fmtNum(R.totalCost(q)) : ''}</td></tr>`; }).join('') + `</tbody></table></div>` : '');
    const open = deals.filter(d => d.status === 'List' || d.status === 'Inprocess');
    const current = open.length ? open.map(d => {
      const p = phaseById.get(primaryOf(d)) || {}, c = campById.get(d.campaign_id) || {}, due = R.dueDate(s, d), late = R.isOverdue(s, d, td);
      return `<div class="post"><div class="top"><span><button type="button" class="link" data-deal="${esc(d.deal_id)}">${esc(d.deal_id)}</button> · ${esc(c.campaign_name || '')}${p.phase_id ? ` › ${esc(R.phaseName(s, p.phase_id))}` : ''}</span>${stageChip(d)}</div>${miniStepper(s, d)}` +
        `${due ? `<div class="${late ? 'late' : 'muted'} small">${esc(T.due(R.dmy(due)))}</div>` : ''}</div>`;
    }).join('') : `<div class="hint">${esc(T.noOpenDeal)}</div>`;
    let history = `<div class="hint">${esc(T.noHistory)}</div>`;
    if (deals.length) {
      const byCamp = new Map();
      deals.forEach(d => { const pid = primaryOf(d), c = d.campaign_id || '-';
        if (!byCamp.has(c)) byCamp.set(c, new Map()); const m = byCamp.get(c); if (!m.has(pid)) m.set(pid, []); m.get(pid).push(d); });
      const startOf = pid => String((phaseById.get(pid) || {}).start_date || '');
      const latest = m => [...m.keys()].map(startOf).sort().pop() || '';
      const active = deals.filter(d => !R.isCancelled(d));
      history = `<div class="hint" style="margin-bottom:8px">${esc(T.histSummary(deals.length, byCamp.size, R.baht(active.reduce((x, d) => x + R.totalCost(d), 0))))}</div>` +
        [...byCamp.entries()].sort((a, b) => latest(b[1]).localeCompare(latest(a[1]))).map(([cid, phases]) => `<div style="margin-bottom:10px"><b>${esc((campById.get(cid) || {}).campaign_name || cid)}</b>` +
          [...phases.entries()].sort((a, b) => startOf(b[0]).localeCompare(startOf(a[0]))).map(([pid, list]) => {
            const p = phaseById.get(pid) || {};
            const head = p.phase_id ? `${esc(R.phaseName(s, p.phase_id))}${p.start_date ? ` · ${range(p.start_date, p.end_date)}` : ''}` : esc(pid === R.NEEDS ? C.deal.needsPhase : C.deal.unscheduled);
            return `<div class="muted small" style="margin:6px 0 2px">${head}</div>` +
              list.map(d => { const ps = postsByDeal.get(d.deal_id) || [], dates = ps.map(x => x.post_date).filter(Boolean).sort();
                return `<div class="kv"><span><button type="button" class="link" data-deal="${esc(d.deal_id)}">${esc(d.deal_id)}</button> ${stageChip(d)}</span><b>${R.baht(R.totalCost(d))}${dates.length ? ` · ${range(dates[0], dates[dates.length - 1])}` : ''}</b></div>`; }).join('');
          }).join('') + `</div>`).join('');
    }
    return `<div class="dr-head">${backHTML()}
        <div class="dr-title"><span class="av">${esc(initials(k.display_name))}</span><div class="t"><h2>${esc(k.display_name)}${U.copyBtnHTML(k.display_name)}</h2>
          <div class="dr-sub"><span>${esc(k.kol_id)}</span><span class="chip">${esc(T.tierMax(R.tierOf(mf, rules) || '—'))}</span>${statusChip(k.kol_status)}${perfHead.measured ? U.reliabilityChip(perfHead) : ''}` +
          `<span class="pfs">${[...new Set(accs.map(a => a.platform))].map(p => pfIcon(p)).join('')}</span><span>${esc(T.followersShort(R.fmtNum(mf) || '—'))}</span>${k.pic ? `<span>${esc(T.picOf(k.pic))}</span>` : ''}</div></div>${closeBtn}</div>
        <div class="dr-actions">${can('deal.edit') ? `<button type="button" class="btn primary" data-act="addPhase">${esc(T.addToPhase)}</button>` : ''}${can('kol.edit') ? `<button type="button" class="btn" data-act="edit">${esc(T.edit)}</button>` : ''}</div>
      </div>
      <div class="dr-body kgrid">
        <div class="kg-l">${sec(T.secProfile, profile)}
        ${sec(T.secAccounts(accs.length), accounts || `<div class="hint">${esc(C.common.none)}</div>`, can('kol.edit') ? `<button type="button" class="btn small" data-act="addAccount">${esc(T.addAccount)}</button>` : '')}
        ${sec(C.payee.sec, KT.payee.bodyHTML(k), KT.payee.editBtn(k))}</div>
        <div class="kg-r">${sec(T.secRates(quotes.length), rates, can('kol.edit') ? `<button type="button" class="btn small" data-act="addQuote">${esc(T.addRate)}</button>` : '')}
        ${sec(P.sec, perfHTML(s, k, td), U.info({ h: P.info.h, d: P.info.d(R.perfSettings(s.lookups).grace, R.perfSettings(s.lookups).minPosts), f: P.info.f }))}</div>
        <div class="kg-full">${sec(T.secCurrent, current)}
        ${sec(T.secHistory, history)}</div>
      </div>`;
  }

  /* CR-06 §4.4 — on-time, delays, rounds, completion, views · the late posts */
  function perfHTML(s, k, td) {
    const p = R.kolPerformance(s, k.kol_id, td), last = R.lastWorked(s, k.kol_id), pct = v => (v == null ? '—' : `${Math.round(v * 1000) / 10}%`);
    const line = (l, v, cls) => `<div class="kv${cls ? ' ' + cls : ''}"><span>${esc(l)}</span><b>${v}</b></div>`;
    const head = `<div class="perf-head">${U.reliabilityChip(p)}<span class="muted small">${esc(p.measured ? P.postsOf(p.onTime, p.measured) : P.noData)}</span></div>`;
    const rows = line(P.onTime, esc(p.measured ? `${pct(p.rate)} (${P.ofN(p.onTime, p.measured)})` : '—')) +
      line(P.avgDelay, esc(p.avgDelay == null ? '—' : P.days(p.avgDelay))) + line(P.latePosts, esc(R.fmtNum(p.late))) +
      line(P.overdueNow, p.overdue ? `<span class="late">${esc(R.fmtNum(p.overdue))}</span>` : '0') +
      line(P.avgDrafts, esc(p.avgDrafts == null ? '—' : String(Math.round(p.avgDrafts * 10) / 10))) +
      line(P.completion, esc(p.completion == null ? '—' : `${pct(p.completion)} (${P.ofN(p.completeDeals, p.dealsPastList)})`)) +
      line(P.avgViews, esc(p.avgViews == null ? '—' : U.shortNum(p.avgViews))) + line(P.er, esc(p.er == null ? '—' : `${(Math.round(p.er * 10000) / 100).toFixed(2)}%`)) +
      line(P.cpv, esc(p.cpv == null ? '—' : `฿${p.cpv < 1 ? p.cpv.toFixed(3) : p.cpv.toFixed(2)}`)) +
      line(P.colLastWorked, last ? esc(`${R.dmy(last)} · ${P.daysAgo(R.dayDiff(td, last))}`) : '—');
    const acc = new Map(s.kol_accounts.map(a => [a.account_id, a])), idx = R.phaseIndex(s), where = l => { const r = idx.post.get(l.post.post_id), c = s.campaigns.find(x => x.campaign_id === l.deal.campaign_id) || {};
      return `${c.campaign_name || ''}${r && r.phase ? ` › ${R.phaseName(s, r.phase)}` : ''}`; };
    const late = p.latePosts.length ? `<div class="tablewrap" style="margin-top:8px"><table class="tbl compact-sm"><thead><tr><th>${esc(P.colWhere)}</th><th></th><th>${esc(P.colExpected)}</th><th>${esc(P.colPosted)}</th><th class="num">${esc(P.colLate)}</th></tr></thead><tbody>` +
      p.latePosts.map(l => { const a = acc.get(l.post.account_id) || {}; return `<tr><td title="${esc(where(l))}"><button type="button" class="link" data-deal="${esc(l.deal.deal_id)}">${esc(where(l))}</button></td><td>${pfIcon(a.platform || l.post.platform || 'Other')}</td>` +
        `<td>${esc(R.dmy(l.expected))}</td><td>${esc(R.dmy(l.posted))}</td><td class="num late">${esc(P.plusDays(l.days))}</td></tr>`; }).join('') + `</tbody></table></div>`
      : p.measured ? `<div class="hint" style="margin-top:6px">${esc(P.noLate)}</div>` : '';
    return head + rows + late;
  }

  /* ---------- edit / new ---------- */
  const blankAccount = () => ({ account_id: null, platform: '', handle: '', profile_link: '', followers: '', is_legacy: false });
  function startEdit() {
    const s = state(), k = R.kolById(s, km.id); if (!k || !guard('kol.edit')) return;
    const draft = Object.assign({ status_reason: '' }, k);
    ['kol_category', 'kol_type', 'gender', 'pic', 'contact_channel', 'note', 'status_reason', 'default_payment_term'].forEach(f => { if (draft[f] == null) draft[f] = ''; });
    draft.kol_status = draft.kol_status || 'Active';
    draft.accounts = R.accountsOfKol(s, k.kol_id).map(a => Object.assign({}, a, { profile_link: a.profile_link || '', followers: a.followers == null ? '' : String(a.followers) }));
    Object.assign(km, { mode: 'edit', draft, dirty: false }); km.touched.clear();
    renderPanel();
  }
  function cancelEdit() { if (km.mode === 'new') { U.closeDrawer(); return; } Object.assign(km, { mode: 'view', draft: null }); km.touched.clear(); renderPanel(); }
  function accountEditHTML(a, i) {
    const s = state(), used = a.account_id ? R.postsOnAccount(s, a.account_id) : 0, key = k => `acc${i}_${k}`;
    const fld = (k, label, input, wide) => `<div class="field${wide ? ' wide' : ''}"><label for="f_${key(k)}">${esc(label)} <span class="req">*</span></label>${input}</div>`;
    return `<div class="acc-edit" data-i="${i}">
      <div class="top"><span>${esc(T.accountN(i + 1))}${a.account_id ? ` <span class="muted small">${esc(a.account_id)}</span>` : ''}${a.is_legacy ? ` <span class="badge-legacy">${esc(T.incomplete)}</span>` : ''}</span>
        <button type="button" class="link" data-del="${i}"${used ? ` disabled title="${esc(T.cannotDeleteAccount(used))}"` : ''}>${esc(T.removeAccount)}</button></div>
      ${a.is_legacy ? `<div class="hint" style="margin-bottom:6px">${esc(T.legacyHint)}</div>` : ''}
      <div class="fields">
        ${fld('profile_link', T.fLink, `<input type="url" id="f_${key('profile_link')}" data-a="profile_link" data-key="${key('profile_link')}" value="${esc(a.profile_link)}" placeholder="https://www.tiktok.com/@account" autocomplete="off">`, 1)}
        ${fld('platform', T.platform, `<select id="f_${key('platform')}" data-a="platform" data-key="${key('platform')}">${optionsHTML(activeList('platform_list', a.platform), a.platform, T.choose)}</select>`)}
        ${fld('handle', T.fHandle, `<input id="f_${key('handle')}" data-a="handle" data-key="${key('handle')}" value="${esc(a.handle)}" placeholder="${esc(T.handlePh)}" autocomplete="off">`)}
        ${fld('followers', T.colFollowers, `<input type="number" min="0" step="1" inputmode="numeric" id="f_${key('followers')}" data-a="followers" data-key="${key('followers')}" value="${esc(a.followers)}">`)}
        <div class="field"><label>${esc(T.tier)}</label><input readonly data-tier value="${esc(R.tierOf(a.followers, tierRules()))}"></div>
      </div></div>`;
  }
  function formHTML() {
    const s = state(), O = C.kolOptions, d = km.draft, isNew = km.mode === 'new';
    const inp = (f, extra = '') => `<input id="f_${f}" data-f="${f}" data-key="${f}" value="${esc(d[f])}" autocomplete="off"${extra}>`;
    const selF = (f, items, ph) => `<select id="f_${f}" data-f="${f}" data-key="${f}">${optionsHTML(items, d[f], ph)}</select>`;
    return `<div class="dr-head">${backHTML()}<div class="dr-title"><div class="t"><h2>${esc(isNew ? T.newTitle : T.editTitle(d.display_name || d.kol_id))}</h2>${isNew ? '' : `<div class="dr-sub"><span>${esc(d.kol_id)}</span></div>`}</div>
        ${isNew || !can('kol.merge') ? '' : `<details class="menu"><summary class="icon-btn" title="${esc(C.app.more)}" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right"><button type="button" class="mi" data-act="merge">${esc(T.merge)}</button></div></details>`}${closeBtn}</div></div>
      <div class="dr-body">
        ${sec(T.secProfile, `<div class="fields">
          ${field('display_name', T.fName, inp('display_name', ` placeholder="${esc(T.namePh)}"`), { req: 1, wide: 1 })}
          ${field('kol_category', T.category, inp('kol_category', ' list="km_dl_cat"'))}
          ${field('kol_type', T.type, selF('kol_type', R.kolTypeList(s.lookups).filter(t => t.active !== false || t.key === d.kol_type).map(t => ({ value: t.key, label: R.kolTypeLabel(s.lookups, t.key) })), KTY.notSet),
            { hint: km.mode === 'edit' && d.kol_type_legacy && d.kol_type_legacy !== R.kolTypeLabel(s.lookups, d.kol_type) ? esc(KTY.oldValue(d.kol_type_legacy)) : '' })}
          ${field('gender', T.gender, selF('gender', R.GENDERS.map(g => ({ value: g, label: O.gender[g] })), T.choose))}
          ${field('pic', T.pic, selF('pic', picList(d.pic), T.choose))}
          ${field('contact_channel', T.contact, selF('contact_channel', R.CONTACT_CHANNELS, T.choose))}
          ${field('kol_status', T.kolStatus, selF('kol_status', R.KOL_STATUSES))}
          ${field('default_payment_term', T.defaultTerm, selF('default_payment_term', R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), C.term.none))}
          <div class="field wide${d.kol_status === 'Active' ? ' hidden' : ''}" id="km_reason"><label for="f_status_reason">${esc(T.reason)}</label>${inp('status_reason', ` placeholder="${esc(T.reasonPh)}"`)}</div>
          ${field('note', T.note, `<textarea id="f_note" data-f="note" data-key="note">${esc(d.note)}</textarea>`, { wide: 1 })}
        </div>
        <datalist id="km_dl_cat">${distinct(s.kol_master.map(k => k.kol_category)).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`)}
        ${sec(T.secAccounts(d.accounts.length), d.accounts.map(accountEditHTML).join(''), `<button type="button" class="btn small" data-act="addAcc">${esc(T.addAccount)}</button>`)}
      </div>
      <div class="dr-foot"><div class="checks" id="km_checks"></div>
        <div class="btns"><button type="button" class="btn" data-act="cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="save">${esc(C.common.save)}</button></div></div>`;
  }
  function wireForm() {
    const box = $('drawer_content'), d = km.draft;
    box.querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f;
      const h = () => { d[f] = el.value; km.dirty = true; if (f === 'kol_status') $('km_reason').classList.toggle('hidden', el.value === 'Active'); check(); };
      el.addEventListener('input', h);
      el.addEventListener('change', () => { h(); km.touched.add(el.dataset.key); check(); });
      el.addEventListener('blur', () => { km.touched.add(el.dataset.key); check(); });
    });
    box.querySelectorAll('.acc-edit').forEach(row => {
      const a = d.accounts[+row.dataset.i];
      row.querySelectorAll('[data-a]').forEach(el => {
        const k = el.dataset.a;
        const h = () => {
          a[k] = el.value; km.dirty = true;
          if (k === 'profile_link') {   // paste a profile link → fill handle / platform when still empty
            const hh = R.handleFromLink(el.value), pp = R.platformFromLink(el.value);
            if (hh && R.isBlank(a.handle)) { a.handle = hh; row.querySelector('[data-a="handle"]').value = hh; }
            if (pp && !a.platform && (state().lookups.platform_list || []).includes(pp)) { a.platform = pp; row.querySelector('[data-a="platform"]').value = pp; }
          }
          row.querySelector('[data-tier]').value = R.tierOf(a.followers, tierRules());
          check();
        };
        el.addEventListener('input', h);
        el.addEventListener('change', () => { h(); km.touched.add(el.dataset.key); check(); });
        el.addEventListener('blur', () => { km.touched.add(el.dataset.key); check(); });
      });
    });
  }
  function check() {
    const box = $('drawer_content'), res = R.validateKol(state(), km.draft);
    $('km_checks').innerHTML = checksHTML(res, C.common.ok);
    box.querySelectorAll('[data-key]').forEach(el => el.classList.toggle('invalid', km.touched.has(el.dataset.key) && res.errs.some(e => e.field === el.dataset.key)));
    box.querySelector('[data-act="save"]').disabled = res.errs.length > 0;
  }
  async function save() {
    if (!guard('kol.edit')) return;
    const s = state(), d = km.draft, res = R.validateKol(s, d);
    if (res.errs.length) { res.errs.forEach(x => km.touched.add(x.field)); check(); return; }
    const isNew = !d.kol_id, kolId = isNew ? store.newId('kol') : d.kol_id, old = isNew ? null : R.kolById(s, kolId);
    const val = v => R.trim(v) || null;
    const rec = { kol_id: kolId, display_name: R.trim(d.display_name), kol_category: val(d.kol_category), kol_type: val(d.kol_type), gender: d.gender || null,
      pic: d.pic || null, kol_status: d.kol_status || 'Active', status_reason: d.kol_status && d.kol_status !== 'Active' ? val(d.status_reason) : null,
      contact_channel: d.contact_channel || null, note: val(d.note), sources: isNew ? ['manual'] : (old.sources || []),   // CR-10 §3: a KOL made in the app
      default_payment_term: R.isTerm(d.default_payment_term) ? d.default_payment_term : null };
    const termChanged = !isNew && (R.isTerm(old.default_payment_term) ? old.default_payment_term : null) !== rec.default_payment_term;
    if (isNew) s.kol_master.push(Object.assign(rec, { kol_type_legacy: null })); else Object.assign(old, rec);
    const keep = new Set(d.accounts.map(a => a.account_id).filter(Boolean));
    s.kol_accounts = s.kol_accounts.filter(a => a.kol_id !== kolId || keep.has(a.account_id));
    d.accounts.forEach(a => {
      const vals = { platform: a.platform, handle: R.trim(a.handle), profile_link: val(a.profile_link), followers: R.isBlank(a.followers) ? null : Number(a.followers) };
      const orig = a.account_id ? s.kol_accounts.find(x => x.account_id === a.account_id) : null;
      if (!orig) s.kol_accounts.push(Object.assign({ account_id: store.newId('account'), kol_id: kolId }, vals, { is_legacy: false }));
      else if (R.ACCOUNT_FIELDS.some(k => R.trim(orig[k]) !== R.trim(a[k]))) Object.assign(orig, vals, { is_legacy: !R.accountComplete(vals) });
    });
    Object.assign(km, { mode: 'view', id: kolId, draft: null }); km.touched.clear();
    commit(T.saved(kolId));
    renderList(); renderPanel();
    /* CR-02 §4.3 — a new default can be copied to this KOL's open deals (List / In process) */
    if (!termChanged) return;
    const open = s.deals.filter(x => x.kol_id === kolId && R.isOpenDeal(x) && R.termOf(x) !== rec.default_payment_term);
    if (!open.length || !(await U.confirmDialog(T.applyTitle(open.length), T.applyBody(C.term[rec.default_payment_term || 'none']), T.applyOk))) return;
    const r = R.applyTermToOpenDeals(s, kolId, rec.default_payment_term, { eventId: store.newEventId(), now: new Date(), user: userId() });
    const at = new Map(s.deals.map((x, i) => [x.deal_id, i]));
    r.deals.forEach(x => { s.deals[at.get(x.deal_id)] = x; }); r.events.forEach(e => s.deal_events.push(e));
    commit(T.applied(r.deals.length)); renderList(); renderPanel();
  }
  function panelClick(e) {
    /* CR-08 §4.4 — the Payee section (edit · unlock · show / copy) */
    if (km.mode === 'view' && KT.payee.onClick(e, R.kolById(state(), km.id), () => { if (km.mode === 'view') renderPanel(); })) return;
    const dl = e.target.closest('[data-deal]'); if (dl) { openDeal(dl.dataset.deal); return; }
    const del = e.target.closest('[data-del]');
    if (del) { if (del.disabled) return; km.draft.accounts.splice(+del.dataset.del, 1); km.dirty = true; renderPanel(); return; }
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'edit') startEdit();
    else if (act === 'cancel') cancelEdit();
    else if (act === 'save') save();
    else if (act === 'addAcc') {
      km.draft.accounts.push(blankAccount()); km.dirty = true; renderPanel();
      const rows = $('drawer_content').querySelectorAll('.acc-edit'), last = rows[rows.length - 1];
      last.scrollIntoView({ block: 'nearest' }); last.querySelector('input').focus();
    }
    else if (act === 'merge') { const m = b.closest('details'); if (m) m.open = false; openMerge(); }
    else if (act === 'addQuote') openQuote(b);
    else if (act === 'addAccount') openAddAccount(b);
    /* CR-11 §4.3 — Add to campaign: the New deal modal, Single KOL, this KOL locked (Change frees it) · the drawer shows the new deal after */
    else if (act === 'addPhase') { const id = km.id; KT.screens.deals.openNewDeal({ tab: 'single', kolId: id, lockKol: true, opener: b, after: () => { renderList(); if (km.mode === 'view' && km.id === id) renderPanel(); } }); }
  }

  /* ===================== dialogs ===================== */
  const PRICE_LABEL = () => ({ rate_card: T.qRate, gencode_expense: T.qGencode, gencode_period: T.qGencodeDays, basket_fee: T.qBasket, asset_fee: T.qAsset, expediting_fee: T.qExpedite });
  function openQuote(opener) {
    if (!guard('kol.edit')) return;
    const s = state(), k = R.kolById(s, km.id), accs = R.accountsOfKol(s, k.kol_id);
    const q = { kol_id: k.kol_id, account_id: accs.length === 1 ? accs[0].account_id : '', quoted_at: today(), source: T.quoteSourceDefault, note: '' };
    R.PRICE_KEYS.forEach(f => { q[f] = ''; });
    const num = f => `<div class="field"><label for="q_${f}">${esc(PRICE_LABEL()[f])}</label><input type="number" min="0" step="1" id="q_${f}" data-q="${f}"></div>`;
    U.createModal({ size: 'M', title: T.quoteTitle(k.display_name), opener, foot: [`<div class="checks" id="q_checks"></div>`, U.cmButtons(T.addRateOk, 'q_ok')], body: `
      <div class="fields">
        <div class="field wide"><label for="q_account_id">${esc(T.qAccount)}</label><select id="q_account_id" data-q="account_id">${optionsHTML(accs.map(a => ({ value: a.account_id, label: `${a.platform} @${a.handle}` })), q.account_id, T.noAccount)}</select></div>
        <div class="field"><label>${esc(T.qDate)}</label>${dateHTML('id="q_quoted_at" data-q="quoted_at"', q.quoted_at, { label: T.qDate })}</div>
        <div class="field"><label for="q_source">${esc(T.qSource)}</label><input id="q_source" data-q="source" value="${esc(q.source)}"></div>
        ${R.PRICE_KEYS.map(num).join('')}
        <div class="field wide"><label for="q_note">${esc(T.qNote)}</label><input id="q_note" data-q="note"></div>
      </div>` });
    const chk = () => { const res = R.validateQuote(s, q); $('q_checks').innerHTML = checksHTML(res, ''); $('q_ok').disabled = res.errs.length > 0; return res; };
    $('cm_root').querySelectorAll('[data-q]').forEach(el => { el.addEventListener('input', () => { q[el.dataset.q] = el.value; chk(); }); el.addEventListener('change', () => { q[el.dataset.q] = el.value; chk(); }); });
    $('q_ok').addEventListener('click', () => {
      if (chk().errs.length) return;
      const rec = { quote_id: store.newId('quote'), kol_id: k.kol_id, account_id: q.account_id || null, quoted_at: q.quoted_at, source: R.trim(q.source), source_row: null };
      R.PRICE_KEYS.forEach(f => { rec[f] = R.isBlank(q[f]) ? null : Number(q[f]); });
      rec.note = R.trim(q.note) || null;
      s.kol_rate_quotes.push(rec);
      U.closeModal(); commit(T.rateSaved(rec.quote_id)); renderList(); renderPanel();
    });
    chk();
  }
  /* ===================== CR-11 §4.3 — create modals ===================== */
  /* + New KOL (M): the Create KOL form of New deal · a KOL with that name / handle already → Use this KOL (its drawer) · KOL created · Open */
  function openNewKol(opener) {
    if (!guard('kol.edit')) return;
    if (editing()) { toast(C.common.blockWhileEditing); renderPanel(); return; }
    const c = { draft: Object.assign(R.createKolDraft('', U.me()), { _forDeal: false }), touched: new Set(), submitted: false, anyway: false };
    let dirty = false;
    U.createModal({ size: 'M', title: T.newTitle, sub: T.newSub, opener, isDirty: () => dirty, focus: '#f_ck_display_name', body: U.kolCreateHTML(c.draft),
      foot: [`<div class="checks" id="ck_checks"></div>`, U.cmButtons(C.bulk.ck.create, 'ck_ok', { attrs: ' data-act="ckCreate"' })],
      onClick: e => {
        const u = e.target.closest('[data-act="ckUse"]'); if (u) { const id = u.dataset.kolid; U.closeModal(); select(id); return; }
        const b = e.target.closest('[data-act="ckCreate"]'); if (b && !b.disabled) create();
      } });
    const root = $('cm_root'), chk = () => U.kolCreateCheck(root, c);
    U.wireKolCreate(root, c, () => { dirty = true; chk(); }); chk();
    function create() {
      c.submitted = true; const r = chk(); if (r.res.errs.length || (r.dup && !c.anyway) || !guard('kol.edit')) return;
      const s = state(), recs = R.createKolRecords(c.draft, { kolId: store.newId('kol'), accountId: store.newId('account') });
      s.kol_master.push(recs.kol); if (recs.account) s.kol_accounts.push(recs.account);
      U.closeModal(); commit(); renderList(); flashRow(recs.kol.kol_id);
      U.toastAction(C.common.created(T.thing), C.common.open, () => select(recs.kol.kol_id), 8000);
    }
  }
  /* + Add account (M, over the KOL drawer): the KOL Master account checks · back to the drawer with it */
  function openAddAccount(opener) {
    if (!guard('kol.edit')) return;
    const k = R.kolById(state(), km.id); if (!k) return;
    const a = { draft: { platform: '', handle: '', followers: '', profile_link: '' }, touched: new Set(), submitted: false };
    U.createModal({ size: 'M', title: C.deal.aaTitle(k.display_name), opener, body: U.accountFieldsHTML(a.draft), foot: [`<div class="checks" id="aa_checks"></div>`, U.cmButtons(C.deal.aaCreate, 'aa_ok')] });
    const root = $('cm_root'), chk = () => U.accountCheck(root, k.kol_id, a);
    U.wireAccount(root, a, chk); chk();
    $('aa_ok').addEventListener('click', () => {
      a.submitted = true; if (chk().errs.length || !guard('kol.edit')) return;
      const rec = R.newAccountRecord(k.kol_id, a.draft, store.newId('account')); state().kol_accounts.push(rec);
      U.closeModal(); commit(C.deal.aaDone(rec.handle)); renderList(); renderPanel();
    });
  }
  /* a new row lit up for 5 s (the list shows enough rows to reach it) */
  function flashRow(id) {
    const i = km.rows.findIndex(r => r.k.kol_id === id); if (i >= km.limit) { km.limit = i + 1; renderList(); }
    setTimeout(() => { const tr = document.querySelector(`#km_body tr[data-id="${CSS.escape(id)}"]`); if (!tr) return; tr.classList.add('flash'); tr.scrollIntoView({ block: 'center' }); setTimeout(() => tr.classList.remove('flash'), 5000); }, 200);
  }
  /* CR-10 §4.11 — the ticked KOLs go to Bulk shortlist (Campaign · Phase · PIC · Pillar · preview · Undo) */
  function openBulkAdd() {
    if (!guard('deal.edit')) return;
    const ids = [...km.selected]; if (!ids.length) return;
    KT.bulk.open({ kolIds: ids });
  }
  function openMerge() {
    if (!guard('kol.merge')) return;
    const s = state(), cur = R.kolById(s, km.id);
    const label = k => `${k.display_name} (${k.kol_id})`;
    openDialog(`<div class="dlg-h">${esc(T.mergeTitle(cur.display_name))}</div><div class="dlg-b">
      <div class="field"><label for="mg_pick">${esc(T.mergePick)}</label><input id="mg_pick" list="mg_list" autocomplete="off">
        <datalist id="mg_list">${s.kol_master.filter(k => k.kol_id !== cur.kol_id).map(k => `<option value="${esc(k.display_name)} · ${esc(k.kol_id)}">`).join('')}</datalist></div>
      <div id="mg_keep" style="margin-top:12px"></div><div class="checks" id="mg_prev" style="margin-top:12px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="mg_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="mg_ok" disabled>${esc(T.mergeConfirm)}</button></div>`);
    let otherId = null, keepId = null;
    const resolve = v => {
      const m = /(K\d+)\s*$/i.exec(v.trim()), byId = m && R.kolById(s, m[1].toUpperCase());
      if (byId && byId.kol_id !== cur.kol_id) return byId.kol_id;
      const byName = s.kol_master.filter(k => k.kol_id !== cur.kol_id && k.display_name.toLowerCase() === v.trim().toLowerCase());
      return byName.length === 1 ? byName[0].kol_id : null;
    };
    const refresh = () => {
      if (!otherId) { $('mg_keep').innerHTML = ''; $('mg_prev').innerHTML = ''; $('mg_ok').disabled = true; return; }
      const other = R.kolById(s, otherId), into = R.kolById(s, keepId), fromId = keepId === cur.kol_id ? otherId : cur.kol_id, from = R.kolById(s, fromId);
      $('mg_keep').innerHTML = `<label>${esc(T.mergeKeep)}</label>` + [other, cur].map(k =>
        `<label class="tick block"><input type="radio" name="mg_k" value="${esc(k.kol_id)}"${k.kol_id === keepId ? ' checked' : ''}> ${esc(label(k))}</label>`).join('');
      $('mg_keep').querySelectorAll('input[name="mg_k"]').forEach(r => r.addEventListener('change', () => { keepId = r.value; refresh(); }));
      const p = R.mergePreview(s, fromId, keepId);
      $('mg_prev').innerHTML = `<div class="check info">i <span>${esc(T.mergeExplain(label(from), label(into)))}</span></div>` +
        `<div class="check info">i <span>${esc(T.mergeMoves(p.accounts, p.deals, p.quotes))}</span></div>` + checksHTML(p, '') +
        (km.mode === 'edit' ? `<div class="check warn">! <span>${esc(T.mergeUnsaved)}</span></div>` : '');
      $('mg_ok').disabled = p.errs.length > 0;
    };
    $('mg_pick').addEventListener('input', e => { otherId = resolve(e.target.value); keepId = otherId; refresh(); });
    $('mg_cancel').addEventListener('click', closeDialog);
    $('mg_ok').addEventListener('click', () => {
      if (!otherId) return;
      const intoId = keepId, fromId = keepId === cur.kol_id ? otherId : cur.kol_id;
      if (R.mergePreview(s, fromId, intoId).errs.length) return;
      Object.assign(s, R.applyMerge(s, fromId, intoId));
      km.selected.delete(fromId);
      Object.assign(km, { mode: 'view', id: intoId, draft: null, dirty: false }); km.touched.clear();
      closeDialog(); commit(T.mergeDone(fromId, intoId));
      renderList(); renderPanel();
    });
    $('mg_pick').focus();
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
      body: `<div class="toolbar"><input type="file" id="im_file" accept=".csv,text/csv" style="width:auto"><button type="button" class="btn small" id="im_sample">${esc(IO.importSample)}</button></div>
      <p class="hint">${esc(IO.importCols(R.IMPORT_COLS.join(', ')))}</p><p class="hint">${esc(IO.importRules)}</p><div id="im_prev"></div>` });
    $('im_sample').addEventListener('click', () => downloadCSV('kol_import_sample.csv', R.IMPORT_SAMPLE[0], R.IMPORT_SAMPLE.slice(1)));
    const show = () => {
      if (!plan) return;
      if (plan.headerError) { $('im_prev').innerHTML = checksHTML({ errs: [{ msg: plan.headerError }] }, ''); $('im_ok').disabled = true; return; }
      const n = k => plan.rows.filter(r => r.kind === k).length, KIND_CLS = { match: 'muted', new_account: 'warn', new_kol: 'done', error: 'cancel' };
      $('im_prev').innerHTML = (plan.rows.length ? `<div class="check info">i <span>${esc(IO.importSummary(n('match'), n('new_account'), n('new_kol'), n('error')))}</span></div>` +
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
      plan = R.planImport(state(), R.parseCSV(await U.readText(f)));
      show();
    });
    $('im_ok').addEventListener('click', () => {
      if (!plan || plan.headerError) return;
      const out = R.applyImport(state(), plan, confirmed, fileName, today());
      Object.assign(state(), { kol_master: out.kol_master, kol_accounts: out.kol_accounts, kol_rate_quotes: out.kol_rate_quotes });
      U.closeModal(); commit(IO.importDone(out.summary));
      renderList(); if (km.mode === 'view') renderPanel();
    });
  }

  function reset() { Object.assign(km, { mode: 'none', id: null, draft: null, backDeal: null, f: blankFilter(), limit: PAGE }); km.touched.clear(); km.selected.clear(); }
  return { render, reset };
})();
