/* screen-bulk.js — CR-10 §4.11: New deal › Bulk shortlist. Pick many KOLs from KOL Master (the same filters · Not in this campaign yet ·
   select a page or every match · at most 200) and add them to a Campaign as Shortlist deals: preview who is added / skipped, Confirm,
   then Deals › Table of that Campaign (Group by Stage) with the new rows lit up and Undo for 10 seconds.
   CR-11 §4.4: a tab of the New deal modal (screen-deals.js openNewDeal) — no dialog of its own · its values stay while you switch tabs ·
   KOL Master (rows ticked → Add to campaign as shortlist) opens the modal on this tab. → KT.bulk */
KT.bulk = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, today, store, commit, toastAction, optionsHTML, campaignOptionsHTML, picList, userId, guard, pfIcon, activeList } = U;
  const B = C.bulk, T = C.kol;
  const PAGE = 50;
  const blank = () => ({ q: '', platform: '', tier: '', type: '', category: '', pic: '', status: 'Active', lastWorked: '', perf: '', notIn: true });
  let bk = null, m = null;   // this tab's values · the modal it is drawn in

  /* KOL Master → the New deal modal on this tab, those KOLs ticked */
  function open(o = {}) { KT.screens.deals.openNewDeal({ tab: 'bulk', kolIds: o.kolIds, campaignId: o.campaignId }); }
  /* the modal opened: this tab starts with its own values (kept while you switch tabs) */
  function init(o = {}) {
    const s = state();
    bk = { campaign: o.campaignId || R.defaultCampaignId(s, today()) || '', phase: '', pic: 'me', pillar: '', f: blank(), sel: new Set(o.kolIds || []), page: 0, stage: 'pick', fromKol: !!(o.kolIds && o.kolIds.length), dirty: false };
    if (bk.fromKol) bk.f.notIn = false;   // KOL Master picked them already
  }
  const reset = () => { bk = null; m = null; };
  /* something chosen here (KOLs ticked · Campaign · Phase · PIC · Pillar) — the filters do not count */
  const isDirty = () => !!(bk && bk.dirty);

  /* ---------- the KOLs that match ---------- */
  function matches() {
    const s = state(), rules = s.lookups.tier_rules || [], f = bk.f, q = R.normKey(f.q), perf = R.kolPerfAll(s, today());
    const accBy = new Map(); s.kol_accounts.forEach(a => { if (!accBy.has(a.kol_id)) accBy.set(a.kol_id, []); accBy.get(a.kol_id).push(a); });
    const inCamp = new Set(s.deals.filter(d => d.campaign_id === bk.campaign && !R.isCancelled(d)).map(d => d.kol_id));
    return s.kol_master.map(k => {
      const accs = accBy.get(k.kol_id) || [], mf = R.maxFollowers(accs), tier = R.tierOf(mf, rules) || R.UNKNOWN_TIER, pf = perf.get(k.kol_id) || {};
      if (q && ![k.display_name].concat(accs.map(a => a.handle)).some(v => R.normKey(v).includes(q))) return null;
      if ((f.platform && !accs.some(a => a.platform === f.platform)) || (f.tier && tier !== f.tier) || (f.type && (k.kol_type || '') !== f.type) || (f.category && k.kol_category !== f.category) ||
        (f.pic && (k.pic || '') !== (f.pic === '__none' ? '' : f.pic)) || (f.status && (k.kol_status || 'Active') !== f.status) || (f.lastWorked && pf.bucket !== f.lastWorked) ||
        (f.perf && ((pf.perf || {}).badge || 'none') !== f.perf) || (f.notIn && inCamp.has(k.kol_id))) return null;
      const quote = R.latestQuote(s, k.kol_id);
      return { k, accs, mf, tier, pf, rate: quote ? R.totalCost(quote) || null : null, inCamp: inCamp.has(k.kol_id) };
    }).filter(Boolean).sort((a, b) => a.k.display_name.localeCompare(b.k.display_name, 'th'));
  }

  /* ---------- draw (into the modal: body + footer) ---------- */
  function draw(modal, top) {
    m = modal; if (!bk) init({});
    const s = state(), L = s.lookups, myPic = R.picName(U.me()), c = s.campaigns.find(x => x.campaign_id === bk.campaign);
    m.setSub(c ? C.deal.addingTo(c.campaign_name) : '');
    if (bk.stage === 'preview') { drawPreview(); return; }
    const sel = (id, label, items, v, ph) => `<label class="tlab">${esc(label)} <select id="${id}">${optionsHTML(items, v, ph)}</select></label>`;
    const phases = R.sortPhases(s.phases.filter(p => p.campaign_id === bk.campaign));
    m.setBody(`<div class="bk" id="bk_root">` +
      `<div class="bk-top"><div class="field"><label for="bk_camp">${esc(B.campaign)} <span class="req">*</span></label><select id="bk_camp" data-combo="campaign">${campaignOptionsHTML(bk.campaign, B.chooseCampaign)}</select></div>` +
      `<div class="field"><label for="bk_phase">${esc(B.phase)}</label><select id="bk_phase">${optionsHTML(phases.map(p => ({ value: p.phase_id, label: R.phaseName(s, p.phase_id) })), bk.phase, B.autoPhase)}</select></div>` +
      `<div class="field"><label for="bk_pic">${esc(B.pic)}</label><select id="bk_pic">${optionsHTML([{ value: 'me', label: myPic ? B.picMe(myPic) : B.picMeNone }, { value: 'kol', label: B.picKol }].concat(picList().map(n => ({ value: n, label: n }))), bk.pic)}</select></div>` +
      `<div class="field"><label for="bk_pillar">${esc(B.pillar)}${bk.pillarFromPhase && bk.pillar ? ` <span class="chip sh-from">${esc(C.fill.fromPhase)}</span>` : ''}</label><select id="bk_pillar">${optionsHTML(activeList('pillar_list', null), bk.pillar, C.deal.none)}</select></div>` +
      `<div class="field"><label>${esc(B.stage)}</label><div class="bk-lock" title="${esc(B.stageTip)}">${esc((R.shortlistStep(L) || {}).sub_status || 'Shortlist')} 🔒</div></div>` +
      (R.onlyProduct(s, bk.campaign) ? `<div class="field"><label>${esc(C.deal.f.products)}</label><div class="bk-lock">${esc(R.productLabel(R.productByCode(s, R.onlyProduct(s, bk.campaign)) || { tr_code: R.onlyProduct(s, bk.campaign), product_name: '' }))} <span class="chip sh-from">${esc(C.fill.onlyProduct)}</span></div></div>` : '') + `</div>` +
      `<div class="bk-main"><div class="bk-left"><div class="toolbar bk-tools"><input type="search" class="search" id="bk_q" placeholder="${esc(T.search)}" value="${esc(bk.f.q)}" autocomplete="off">` +
        sel('bk_fplatform', T.platform, (L.platform_list || []), bk.f.platform, T.allPlatforms) + sel('bk_ftier', T.tier, R.tierOrder(L.tier_rules), bk.f.tier, T.allTiers) +
        sel('bk_ftype', B.type, (L.kol_type_list || []).filter(t => t.active !== false).map(t => ({ value: t.key, label: t.label })), bk.f.type, B.any) +
        sel('bk_fcat', B.category, U.distinct(s.kol_master.map(k => k.kol_category)), bk.f.category, B.any) +
        sel('bk_fpic', B.picCol, picList().map(n => ({ value: n, label: n })).concat([{ value: '__none', label: C.deal.unassigned }]), bk.f.pic, B.any) +
        sel('bk_fstatus', B.status, R.KOL_STATUSES, bk.f.status, B.any) +
        sel('bk_flast', C.perf.colLastWorked, R.LAST_WORKED.map(v => ({ value: v, label: C.perf.last[v] })), bk.f.lastWorked, B.any) +
        sel('bk_fperf', B.perf, R.BADGES.map(v => ({ value: v, label: C.perf.badge ? C.perf.badge[v] || v : v })), bk.f.perf, B.any) +
        `<label class="tick small"><input type="checkbox" id="bk_notin"${bk.f.notIn ? ' checked' : ''}> ${esc(B.notInCampaign)}</label>` +
        `<button type="button" class="btn small ghost" data-bkclear>${U.ICON.close}<span>${esc(C.common.clearAllFilters)}</span></button></div>` +
        `<div id="bk_selbar"></div><div id="bk_list"></div></div>` +
      `<aside class="bk-right"><div class="bk-rh"><b id="bk_seln"></b><button type="button" class="link" data-bkclearsel>${esc(B.clearSel)}</button></div><div id="bk_selected" class="bk-sel"></div><div id="bk_sum" class="bk-sum"></div></aside></div></div>`, !top, 'flush');
    m.setFoot(`<span class="muted small" id="bk_max"></span>`, `<button type="button" class="btn" data-cmclose>${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="bk_add" data-bkadd></button>`);
    const root = $('bk_root'); if (!root) return;   // the modal closed meanwhile
    root.addEventListener('change', onChange);
    let qT; root.addEventListener('input', e => { if (e.target.id === 'bk_q') { clearTimeout(qT); qT = setTimeout(() => { if (!bk) return; bk.f.q = e.target.value; bk.page = 0; drawList(); }, 150); } });
    U.enhanceCombos(root);
    drawList();
  }
  function drawList() {
    const rows = matches(), pages = Math.max(1, Math.ceil(rows.length / PAGE)); bk.page = Math.min(bk.page, pages - 1); bk.rows = rows;
    const page = rows.slice(bk.page * PAGE, bk.page * PAGE + PAGE), allPage = page.length > 0 && page.every(r => bk.sel.has(r.k.kol_id));
    const fol = n => (n ? R.fmtNum(n) : '—');
    $('bk_list').innerHTML = !rows.length ? U.noMatchHTML(T.noMatch, []) : `<div class="tablewrap bk-wrap"><table class="tbl bk-tbl"><thead><tr><th class="cb"><input type="checkbox" id="bk_page" aria-label="${esc(B.selectPage)}"${allPage ? ' checked' : ''}></th>` +
      `<th>${esc(B.colKol)}</th><th>${esc(T.platform)}</th><th class="num">${esc(B.colFollowers)}</th><th>${esc(T.tier)}</th><th>${esc(B.type)}</th><th>${esc(C.perf.colLastWorked)}</th><th>${esc(B.perf)}</th><th>${esc(B.picCol)}</th><th class="num">${esc(B.colRate)}</th></tr></thead><tbody>` +
      page.map(r => `<tr class="click${bk.sel.has(r.k.kol_id) ? ' selected' : ''}" data-bkrow="${esc(r.k.kol_id)}"><td class="cb"><input type="checkbox" data-bksel="${esc(r.k.kol_id)}"${bk.sel.has(r.k.kol_id) ? ' checked' : ''} aria-label="${esc(r.k.display_name)}"></td>` +
        `<td class="bk-kol"><b>${esc(r.k.display_name)}</b>${r.inCamp ? ` <span class="chip">${esc(B.inCampaign)}</span>` : ''}${(r.k.kol_status || 'Active') !== 'Active' ? ` <span class="chip warn-chip">${esc(r.k.kol_status)}</span>` : ''}</td>` +
        `<td>${[...new Set(r.accs.map(a => a.platform))].map(p => pfIcon(p, 'posted', p)).join('')}</td><td class="num">${fol(r.mf)}</td><td><span class="chip">${esc(r.tier)}</span></td>` +
        `<td>${esc(R.kolTypeLabel ? R.kolTypeLabel(state().lookups, r.k.kol_type) || '' : r.k.kol_type || '')}</td><td>${r.pf.last ? esc(R.dmy(r.pf.last)) : '<span class="muted">—</span>'}</td>` +
        `<td>${r.pf.perf ? U.reliabilityChip(r.pf.perf) : ''}</td><td>${esc(r.k.pic || '')}</td><td class="num">${r.rate ? R.baht(r.rate) : '<span class="muted">—</span>'}</td></tr>`).join('') + `</tbody></table></div>` +
      (pages > 1 ? `<div class="bk-pager"><button type="button" class="btn small" data-bkpage="-1"${bk.page ? '' : ' disabled'}>‹</button><span class="muted small">${esc(B.pageOf(bk.page + 1, pages, rows.length))}</span><button type="button" class="btn small" data-bkpage="1"${bk.page < pages - 1 ? '' : ' disabled'}>›</button></div>` : '');
    const pageSel = page.filter(r => bk.sel.has(r.k.kol_id)).length, allSel = rows.length > 0 && rows.every(r => bk.sel.has(r.k.kol_id));
    $('bk_selbar').innerHTML = allPage && rows.length > page.length && !allSel ? `<div class="bk-banner">${esc(B.pageSelected(pageSel))} · <button type="button" class="link" data-bkall>${esc(B.selectAllMatching(rows.length))}</button></div>`
      : allSel && rows.length > page.length ? `<div class="bk-banner">${esc(B.allSelected(rows.length))} · <button type="button" class="link" data-bkclearsel>${esc(B.clearSel)}</button></div>` : '';
    drawSide();
  }
  function plan() { return R.bulkShortlistPlan(state(), [...bk.sel], bk.campaign, { pic: bk.pic, me: R.picName(U.me()) || '' }); }
  function drawSide() {
    const s = state(), n = bk.sel.size, p = plan(), over = n > R.MAX_BULK;
    $('bk_seln').textContent = B.selectedN(n);
    $('bk_selected').innerHTML = !n ? `<div class="hint">${esc(B.noneSelected)}</div>` : [...bk.sel].map(id => { const k = R.kolById(s, id); return k ? `<div class="bk-si"><span>${esc(k.display_name)}</span><button type="button" class="x" data-bkrm="${esc(id)}" aria-label="${esc(B.remove(k.display_name))}">×</button></div>` : ''; }).join('');
    $('bk_sum').innerHTML = bk.campaign ? `<div>${esc(B.willAdd(p.create.length))} · <span class="muted">${esc(B.willSkip(p.skip.length))}</span></div>` : `<div class="hint">${esc(B.chooseCampaign)}</div>`;
    $('bk_max').textContent = over ? B.maxPerBatch(R.MAX_BULK) : '';
    const add = $('bk_add'); add.textContent = B.addN(p.create.length); add.disabled = over || !p.create.length || p.errs.length > 0;
  }
  function drawPreview() {
    const s = state(), p = plan(), camp = (s.campaigns.find(c => c.campaign_id === bk.campaign) || {}).campaign_name || '';
    m.setBody(`<h3 class="nd-ph">${esc(B.previewTitle)}</h3><p style="margin-top:0"><b>${esc(B.previewLine(p.create.length, camp, p.skip.length))}</b></p>` +
      (p.warns.length ? `<div class="checks">${p.warns.map(w => `<div class="check warn">! <span>${esc(w.msg)}</span></div>`).join('')}</div>` : '') +
      (p.skip.length ? `<div class="tablewrap" style="max-height:40vh"><table class="tbl compact-sm"><thead><tr><th>${esc(B.colKol)}</th><th>${esc(B.reason)}</th></tr></thead><tbody>` +
        p.skip.map(x => `<tr><td>${esc(x.kol.display_name)}</td><td>${esc(B.skipReason[x.reason])}</td></tr>`).join('') + `</tbody></table></div>` : '') +
      `<p class="muted small">${esc(B.previewHint)}</p>`);
    m.setFoot('', `<button type="button" class="btn" data-bkback>${esc(B.back)}</button><button type="button" class="btn primary" data-bkconfirm${p.create.length && !p.errs.length ? '' : ' disabled'}>${esc(B.confirm(p.create.length))}</button>`);
  }

  /* ---------- events (the modal sends its clicks here while this tab is open) ---------- */
  function click(e) {
    const t = e.target; if (!bk) return;
    if (t.id === 'bk_page') { const on = t.checked; bk.rows.slice(bk.page * PAGE, bk.page * PAGE + PAGE).forEach(r => (on ? bk.sel.add(r.k.kol_id) : bk.sel.delete(r.k.kol_id))); bk.dirty = true; drawList(); return; }
    const cb = t.closest('[data-bksel]'); if (cb) { cb.checked ? bk.sel.add(cb.dataset.bksel) : bk.sel.delete(cb.dataset.bksel); bk.dirty = true; drawList(); return; }
    if (t.closest('[data-bkall]')) { bk.rows.forEach(r => bk.sel.add(r.k.kol_id)); bk.dirty = true; drawList(); return; }
    if (t.closest('[data-bkclearsel]')) { bk.sel.clear(); bk.dirty = true; drawList(); return; }
    const rm = t.closest('[data-bkrm]'); if (rm) { bk.sel.delete(rm.dataset.bkrm); bk.dirty = true; drawList(); return; }
    const pg = t.closest('[data-bkpage]'); if (pg) { bk.page += +pg.dataset.bkpage; drawList(); return; }
    if (t.closest('[data-bkclear]')) { bk.f = Object.assign(blank(), { notIn: bk.f.notIn }); bk.page = 0; draw(m); return; }
    const row = t.closest('[data-bkrow]'); if (row && !t.closest('a,button,input')) { const id = row.dataset.bkrow; bk.sel.has(id) ? bk.sel.delete(id) : bk.sel.add(id); bk.dirty = true; drawList(); return; }
    if (t.closest('[data-bkadd]')) { if (!$('bk_add').disabled) { bk.stage = 'preview'; draw(m, true); } return; }
    if (t.closest('[data-bkback]')) { bk.stage = 'pick'; draw(m, true); return; }
    if (t.closest('[data-bkconfirm]')) confirm();
  }
  function onChange(e) {
    const t = e.target, map = { bk_fplatform: 'platform', bk_ftier: 'tier', bk_ftype: 'type', bk_fcat: 'category', bk_fpic: 'pic', bk_fstatus: 'status', bk_flast: 'lastWorked', bk_fperf: 'perf' };
    if (!bk) return;
    if (map[t.id]) { bk.f[map[t.id]] = t.value; bk.page = 0; drawList(); return; }
    if (t.id === 'bk_notin') { bk.f.notIn = t.checked; bk.page = 0; drawList(); return; }
    if (t.id === 'bk_camp') { bk.campaign = t.value; bk.phase = ''; if (bk.pillarFromPhase) { bk.pillar = ''; bk.pillarFromPhase = false; } bk.dirty = true; draw(m); return; }
    /* CR-11 §4.11 — the Phase's default pillar (a pillar picked by hand stays) */
    if (t.id === 'bk_phase') { bk.phase = t.value; bk.dirty = true;
      if (bk.pillarFromPhase || !bk.pillar) { const p = bk.phase ? R.phaseDefaultPillar(state(), bk.phase) : null; bk.pillar = p || ''; bk.pillarFromPhase = !!p; draw(m); } return; }
    if (t.id === 'bk_pic') { bk.pic = t.value; bk.dirty = true; drawSide(); return; }
    if (t.id === 'bk_pillar') { bk.pillar = t.value; bk.pillarFromPhase = false; bk.dirty = true; draw(m); }
  }
  /* create the deals · a Phase picked = one planned post on the KOL's biggest account in that Phase · then Deals › Table with Undo */
  function confirm() {
    if (!guard('deal.edit')) return;
    const s = state(), p = plan(); if (!p.create.length || p.errs.length) return;
    const n = p.create.length, batchId = 'B' + Date.now().toString(36), firstLog = store.newLogId();
    const dealIds = []; for (let i = 0; i < n; i++) { const id = store.newId('deal'); dealIds.push(id); s.deals.push({ deal_id: id, _reserve: true }); }
    s.deals = s.deals.filter(d => !d._reserve);
    const made = R.bulkShortlistDeals(s, p, bk.campaign, { batchId, dealIds, logIds: dealIds.map((_, i) => firstLog + i), date: today(), now: new Date(), user: userId(), pillar: bk.pillar });
    let postN = parseInt(store.newId('post').slice(1), 10);
    const only = R.onlyProduct(s, bk.campaign);   // CR-11 §4.11: the Campaign's only product goes on every deal
    made.forEach(({ deal, log }) => {
      s.deals.push(deal); s.deal_status_log.push(log);
      if (only) s.deal_products.push({ deal_id: deal.deal_id, tr_code: only, qty: 1, note: null });
      if (bk.phase) {
        const acc = R.accountsOfKol(s, deal.kol_id).slice().sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0))[0];
        if (acc) s.deal_posts.push(Object.assign(R.blankPost(deal.deal_id, acc.account_id, acc.platform, null), { post_id: 'P' + String(postN++).padStart(6, '0'), phase_override: bk.phase, metrics_source: null, metrics_updated_by: null }));
      }
    });
    const snap = new Map(made.map(x => [x.deal.deal_id, JSON.stringify(x.deal)])), campaignId = bk.campaign;
    KT.screens.deals.closeNewDeal(); commit();
    KT.screens.deals.showBatch(campaignId, dealIds);
    toastAction(B.added(n), C.deal.undo, () => {
      const st = state(), keep = new Set(R.batchUntouched(st, batchId, snap).map(d => d.deal_id));
      st.deals = st.deals.filter(d => !keep.has(d.deal_id)); st.deal_status_log = st.deal_status_log.filter(l => !keep.has(l.deal_id)); st.deal_posts = st.deal_posts.filter(x => !keep.has(x.deal_id));
      st.deal_products = st.deal_products.filter(x => !keep.has(x.deal_id));
      commit(B.undone(keep.size)); KT.screens.deals.showBatch(campaignId, []);
    }, 10000);
  }

  return { open, init, reset, isDirty, draw, click };
})();
