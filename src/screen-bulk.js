/* screen-bulk.js — CR-20 §4.2–4.3 · §4.10: New deal › From KOL Master (the default tab) — pick 1 or many KOLs that are in KOL Master already
   (the filters of before + Worked in (other Campaigns) + Posted only · Not in this campaign yet · select a page or every match · at most 200)
   and fill only a little per KOL in the Selected panel: Rate (the Latest rate, "Avg ฿x") · Post due ("→ Phase 2") · Payment term when the
   deals start at Contacted (optional) or Confirm QT (required — the rules of R.stageRequirements, through R.checkMove) · Package.
   Add n deals → Deals › Table of that Campaign with the new rows lit up and Undo. The header (Campaign · Phase · Assign to · Pillar · Start at ·
   Products) is the New deal modal's (screen-newdeal.js), the same on both tabs.
   CR-22 — the Rate starts empty with "Last rate card ฿x" to click in (no Avg · no Use latest rates / Clear rates) · CTA and the sample method come
   from the header · a search with no KOL: Create "<name>" as new KOL.
   CR-25 §3.2 — one quick row (Search · Partner type · Tier · Not in this campaign yet · Filters (n)) · the other filters fold under Filters (folded by
   default, remembered per user) · chips of the folded filters in use · Partner type chip (AFF · KOL+AFF) beside a name. → KT.bulk */
KT.bulk = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, today, store, commit, toast, toastAction, optionsHTML, picList, userId, guard, pfIcon, dateHTML, setDate, checksHTML, pref } = U;
  const B = C.bulk, T = C.kol, MV = C.move;
  const PAGE = 50;
  const blank = () => ({ q: '', partner: '', platform: '', tier: '', type: '', category: '', owner: '', status: 'Active', lastWorked: '', perf: '', workedIn: [], postedOnly: false, notIn: true });
  const MAX_CHIPS = 4;   // CR-25 §3.2: more → "+n more"
  /* CR-25 §3.2 — Filters open / folded, per user (folded unless that person opened it) */
  const foldKey = () => 'bkfold_' + (userId() || '');
  const foldOpen = () => pref.get(foldKey(), '') === 'open';
  let bk = null, api = null;   // this tab's values · the New deal modal (header + its modal handle)

  /* KOL Master (rows ticked → Add to campaign) opens New deal on this tab with those KOLs selected */
  function open(o = {}) { KT.newDeal.open({ tab: 'master', kolIds: o.kolIds, campaignId: o.campaignId }); }
  function init(o = {}) {
    bk = { f: blank(), sel: new Map(), page: 0, submitted: false, dirty: false, rows: [] };
    (o.kolIds || []).forEach(id => addSel(id));
    if ((o.kolIds || []).length) bk.f.notIn = false;   // KOL Master picked them already
  }
  const reset = () => { bk = null; api = null; };
  const isDirty = () => !!(bk && bk.dirty);
  /* a selected KOL's row: Rate = the Latest rate (CR-07) · Post due · Payment term = the KOL's default */
  function addSel(id) {
    const s = state(), k = R.kolById(s, id); if (!k || bk.sel.has(id)) return;
    bk.sel.set(id, { rate: '', last: R.lastRateCard(s, id), postDue: '', term: R.isTerm(k.default_payment_term) ? k.default_payment_term : '', packageId: '', units: '1' });   // CR-22 §3.1: never filled in for you
  }
  const selectKols = ids => { if (!bk) return; ids.forEach(addSel); bk.dirty = true; };

  /* ---------- the KOLs that match (R.kolPickerFilter) ---------- */
  function matches() { const h = api.header(); return R.kolPickerFilter(state(), bk.f, h.campaign, today()); }

  /* ---------- draw ---------- */
  function draw(a, top) {
    api = a; if (!bk) init({});
    const s = state(), L = s.lookups, open = foldOpen();
    /* CR-25 §3.2 — the quick row (always there): Search · Partner type (All · KOL · Affiliate — Both is in each) · Tier · Not in this campaign yet · Filters (n) */
    api.m.setBody(api.headerHTML() + `<div class="bk-main"><div class="bk-left"><div class="toolbar bk-tools bk-quick" id="bk_tools"><input type="search" class="search" id="bk_q" placeholder="${esc(T.search)}" value="${esc(bk.f.q)}" autocomplete="off">` +
        `<span class="tlab bk-pt">${esc(C.partner.field)} ${U.partnerSegHTML('data-bkpt', bk.f.partner, { all: true, keys: ['kol', 'affiliate'], id: 'bk_fpartner' })}</span>` +
        `<select id="bk_ftier" aria-label="${esc(T.tier)}">${optionsHTML(R.tierOrder(L.tier_rules), bk.f.tier, T.allTiers)}</select>` +   // "All tiers" says what it is (as on KOL Master)
        `<label class="tick small"><input type="checkbox" id="bk_notin"${bk.f.notIn ? ' checked' : ''}> ${esc(B.notInCampaign)}</label>` +
        `<button type="button" class="btn bk-fbtn" id="bk_fbtn" data-bkfold aria-expanded="${open}" aria-controls="bk_more" title="${esc(B.filtersTip)}">${U.ICON.filter} <span id="bk_fbtnt">${esc(B.filtersN(foldChips().length))}</span></button></div>` +
        `<div class="toolbar bk-tools bk-more${open ? '' : ' hidden'}" id="bk_more">${moreHTML()}</div><div class="fchips bk-chips hidden" id="bk_chips"></div>` +
        `<div id="bk_selbar"></div><div id="bk_list"></div></div>` +
      `<aside class="bk-right" id="bk_right"><div class="bk-rh"><b id="bk_seln"></b><button type="button" class="link" data-bkclearsel>${esc(B.clearSel)}</button></div>` +
        `<div class="bk-ptools"><button type="button" class="btn small" data-bkdueall>${esc(B.setPostDueAll)}</button></div>` +
        `<div id="bk_selected" class="bk-sel"></div><div id="bk_sum" class="bk-sum"></div></aside></div>`, !top, 'flush nd-body');
    api.m.setFoot(`<div class="checks" id="bk_checks"></div>`, `<button type="button" class="btn" data-cmclose>${esc(C.common.cancel)}</button><button type="button" class="btn" data-bkadd="open" id="bk_addopen">${esc(B.addOpenFirst)}</button><button type="button" class="btn primary" id="bk_add" data-bkadd="add"></button>`);
    const root = $('cm_body'); if (!root) return;
    api.wireHeader(root);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    let qT; $('bk_q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { if (!bk) return; bk.f.q = e.target.value; bk.page = 0; drawList(); drawTools(); }, 150); });
    drawList(); drawTools();
  }
  const selHTML = (id, label, items, v, ph, tip) => `<label class="tlab"${tip ? ` title="${esc(tip)}"` : ''}>${esc(label)} <select id="${id}">${optionsHTML(items, v, ph)}</select></label>`;
  /* CR-25 §3.2 — what Filters folds: Platform · Type · Category · KOL owner · Status · Last worked · Performance · Worked in + Posted only · Clear all filters */
  function moreHTML() {
    const s = state(), L = s.lookups;
    return selHTML('bk_fplatform', T.platform, (L.platform_list || []), bk.f.platform, T.allPlatforms) +
      selHTML('bk_ftype', B.type, (L.kol_type_list || []).filter(t => t.active !== false).map(t => ({ value: t.key, label: t.label })), bk.f.type, B.any) +
      selHTML('bk_fcat', B.category, U.distinct(s.kol_master.map(k => k.kol_category)), bk.f.category, B.any) +
      selHTML('bk_fowner', B.kolOwner, picList().map(n => ({ value: n, label: n })).concat([{ value: '__none', label: C.deal.unassigned }]), bk.f.owner, B.any, B.kolOwnerTip) +
      selHTML('bk_fstatus', B.status, R.KOL_STATUSES, bk.f.status, B.any) +
      selHTML('bk_flast', C.perf.colLastWorked, R.LAST_WORKED.map(v => ({ value: v, label: C.perf.last[v] })), bk.f.lastWorked, B.any) +
      selHTML('bk_fperf', B.perf, R.BADGES.map(v => ({ value: v, label: badgeText(v) })), bk.f.perf, B.any) +
      `<span class="tlab bk-worked">${esc(B.workedIn)} ${workedHTML()}</span><label class="tick small"><input type="checkbox" id="bk_posted"${bk.f.postedOnly ? ' checked' : ''}${bk.f.workedIn.length ? '' : ' disabled'}> ${esc(B.postedOnly)}</label>` +
      `<button type="button" class="btn small ghost hidden" data-bkclear id="bk_clear">${U.ICON.close}<span>${esc(C.common.clearAllFilters)}</span></button>`;
  }
  const badgeText = v => (C.perf.badge ? C.perf.badge[v] || v : v);
  /* the folded filters in use → [[key, "Platform: TikTok"]] (Status counts when it is not Active — how the tab opens) · n of Filters (n) */
  function foldChips() {
    const s = state(), f = bk.f, out = [];
    if (f.platform) out.push(['platform', `${T.platform}: ${f.platform}`]);
    if (f.type) out.push(['type', `${B.type}: ${R.kolTypeLabel(s.lookups, f.type)}`]);
    if (f.category) out.push(['category', `${B.category}: ${f.category}`]);
    if (f.owner) out.push(['owner', `${B.kolOwner}: ${f.owner === '__none' ? C.deal.unassigned : f.owner}`]);
    if (f.status !== 'Active') out.push(['status', `${B.status}: ${f.status || B.any}`]);
    if (f.lastWorked) out.push(['lastWorked', `${C.perf.colLastWorked}: ${C.perf.last[f.lastWorked]}`]);
    if (f.perf) out.push(['perf', `${B.perf}: ${badgeText(f.perf)}`]);
    if (f.workedIn.length) out.push(['workedIn', `${B.workedIn}: ${f.workedIn.map(id => R.campaignName(s, id) || id).join(', ')}`]);
    if (f.postedOnly && f.workedIn.length) out.push(['postedOnly', B.postedOnly]);
    return out;
  }
  /* a chip's × → that filter back to how the tab opens */
  function unsetFold(k) {
    if (k === 'workedIn') { bk.f.workedIn = []; bk.f.postedOnly = false; } else bk.f[k] = blank()[k];
    bk.page = 0; $('bk_more').innerHTML = moreHTML(); drawList(); drawTools();
  }
  function setFold(open) {
    pref.set(foldKey(), open ? 'open' : 'folded');
    $('bk_more').classList.toggle('hidden', !open); $('bk_fbtn').setAttribute('aria-expanded', String(open)); drawTools();
  }
  /* Clear all filters shows when a filter differs from how the tab opens (Status Active · Not in this campaign yet ticked) — Worked in counts too (§4.3) */
  const filtersUsed = () => R.pickerActive(Object.assign({}, bk.f, { status: bk.f.status === 'Active' ? '' : bk.f.status || 'any', notIn: !bk.f.notIn })).length > 0;
  /* §4.3 Worked in: the other Campaigns (approved) · drawn again on each change so its button says what is picked */
  function workedHTML() {
    const s = state(), h = api.header(), camps = s.campaigns.filter(c => c.campaign_id !== h.campaign && R.isApproved(c)).map(c => ({ value: c.campaign_id, label: c.campaign_name }));
    bk.f.workedIn = bk.f.workedIn.filter(id => camps.some(c => c.value === id));
    return U.multiSelect({ id: 'bk_worked', options: camps, value: bk.f.workedIn, label: U.msLabel(bk.f.workedIn, camps, B.workedInAny), aria: B.workedIn,
      onChange: v => { bk.f.workedIn = v; if (!v.length) bk.f.postedOnly = false; bk.page = 0; const el = document.querySelector('[data-ms="bk_worked"]'); if (el) el.outerHTML = workedHTML(); drawList(); drawTools(); } });
  }
  function drawTools() {
    const c = $('bk_clear'); if (c) c.classList.toggle('hidden', !filtersUsed()); const p = $('bk_posted'); if (p) p.disabled = !bk.f.workedIn.length;
    /* CR-25 §3.2 — Filters (n) · folded with filters in use → their chips (4 at most, then "+n more" opens the filters) */
    const chips = foldChips(), open = foldOpen(), t = $('bk_fbtnt'), el = $('bk_chips');
    if (t) t.textContent = B.filtersN(chips.length);
    if (!el) return;
    if (open || !chips.length) { el.innerHTML = ''; el.classList.add('hidden'); return; }
    U.filterChips(el, chips.slice(0, MAX_CHIPS), chips.length);
    if (chips.length > MAX_CHIPS) { const more = `<button type="button" class="fchip fmore" data-bkmore>${esc(B.moreChips(chips.length - MAX_CHIPS))}</button>`, cl = el.querySelector('[data-clearfilters]'); if (cl) cl.insertAdjacentHTML('beforebegin', more); else el.insertAdjacentHTML('beforeend', more); }
  }
  function drawList() {
    if (!$('bk_list')) return;
    const s = state(), rows = matches(), pages = Math.max(1, Math.ceil(rows.length / PAGE)); bk.page = Math.min(bk.page, pages - 1); bk.rows = rows;
    const page = rows.slice(bk.page * PAGE, bk.page * PAGE + PAGE), allPage = page.length > 0 && page.every(r => bk.sel.has(r.k.kol_id));
    const fol = n => (n ? R.fmtNum(n) : '—');
    $('bk_list').innerHTML = !rows.length ? emptyHTML() : `<div class="tablewrap bk-wrap"><table class="tbl bk-tbl"><thead><tr><th class="cb"><input type="checkbox" id="bk_page" aria-label="${esc(B.selectPage)}"${allPage ? ' checked' : ''}></th>` +
      `<th>${esc(B.colKol)}</th><th>${esc(T.platform)}</th><th class="num">${esc(B.colFollowers)}</th><th>${esc(T.tier)}</th><th>${esc(B.type)}</th><th class="bk-own" title="${esc(B.kolOwnerTip)}">${esc(B.kolOwner)}</th><th>${esc(B.colLastCampaign)}</th><th>${esc(B.perf)}</th></tr></thead><tbody>` +
      page.map(r => { const li = R.lastWorkedInfo(s, r.k.kol_id);
        return `<tr class="click${bk.sel.has(r.k.kol_id) ? ' selected' : ''}" data-bkrow="${esc(r.k.kol_id)}"><td class="cb"><input type="checkbox" data-bksel="${esc(r.k.kol_id)}"${bk.sel.has(r.k.kol_id) ? ' checked' : ''} aria-label="${esc(r.k.display_name)}"></td>` +
        `<td class="bk-kol"><span class="bk-kn">${U.avatarHTML(r.k, 'sm')}<b>${U.nameHTML(r.k.display_name)}</b>${U.partnerChipHTML(r.k)}</span>${r.inCamp ? ` <span class="chip">${esc(B.inCampaign)}</span>` : ''}${(r.k.kol_status || 'Active') !== 'Active' ? ` <span class="chip warn-chip">${esc(r.k.kol_status)}</span>` : ''}</td>` +
        `<td>${[...new Set(r.accs.map(a => a.platform))].map(p => pfIcon(p, 'posted', p)).join('')}</td><td class="num">${fol(r.mf)}</td><td><span class="chip">${esc(r.tier)}</span></td>` +
        `<td class="bk-type">${esc(R.kolTypeLabel ? R.kolTypeLabel(s.lookups, r.k.kol_type) || '' : r.k.kol_type || '')}</td><td class="bk-own">${esc(r.k.pic || '')}</td>` +
        `<td class="bk-camp">${li ? esc(R.campaignName(s, li.campaignId) || '') : '<span class="muted">—</span>'}</td><td>${r.pf.perf ? U.reliabilityChip(r.pf.perf) : ''}</td></tr>`; }).join('') + `</tbody></table></div>` +
      (pages > 1 ? `<div class="bk-pager"><button type="button" class="btn small" data-bkpage="-1"${bk.page ? '' : ' disabled'}>‹</button><span class="muted small">${esc(B.pageOf(bk.page + 1, pages, rows.length))}</span><button type="button" class="btn small" data-bkpage="1"${bk.page < pages - 1 ? '' : ' disabled'}>›</button></div>` : '');
    const pageSel = page.filter(r => bk.sel.has(r.k.kol_id)).length, allSel = rows.length > 0 && rows.every(r => bk.sel.has(r.k.kol_id));
    $('bk_selbar').innerHTML = allPage && rows.length > page.length && !allSel ? `<div class="bk-banner">${esc(B.pageSelected(pageSel))} · <button type="button" class="link" data-bkall>${esc(B.selectAllMatching(Math.min(rows.length, R.MAX_BULK)))}</button></div>`
      : allSel && rows.length > page.length ? `<div class="bk-banner">${esc(B.allSelected(rows.length))} · <button type="button" class="link" data-bkclearsel>${esc(B.clearSel)}</button></div>` : '';
    drawSide();
  }
  /* CR-22 §3.4 — no KOL for the search: Create "<name>" as new KOL · Clear other filters (when others are on) */
  function emptyHTML() {
    const q = R.trim(bk.f.q); if (!q) return U.noMatchHTML(T.noMatch, []);
    const others = R.pickerActive(Object.assign({}, bk.f, { q: '', status: bk.f.status === 'Active' ? '' : bk.f.status || 'any', notIn: !bk.f.notIn })).length > 0;
    return `<div class="card empty bk-empty"><b>${esc(B.noKolMatch(q))}</b><div class="btns"><button type="button" class="btn primary" data-bknewkol>${esc(B.createNewKol(q))}</button>` +
      (others ? `<button type="button" class="link" data-bkclearother>${esc(B.clearOther)}</button>` : '') + `</div></div>`;
  }
  const startAt = () => api.header().startAt;
  const needsTerm = () => { const st = R.stepOf(state().lookups, startAt()); return !!st && st.sub_status !== (R.shortlistStep(state().lookups) || {}).sub_status && !R.isCancelStep(st); };
  /* the deal a selected row would make (for R.checkMove: what Start at needs — the one rule of R.stageRequirements) */
  function pseudo(id, x) {
    const h = api.header();
    return { deal: Object.assign(JSON.parse(JSON.stringify(R.DEAL_TEMPLATE)), { deal_id: null, kol_id: id, campaign_id: h.campaign, sub_status: null, status: null, pillar: h.pillar || null }),
      form: { date: today(), today: today(), pillar: h.pillar || '', paymentTerm: x.term || '', packageId: x.packageId || '', packageUnits: x.units || '1', rateCard: KT.move.money(x.rate), postDue: x.postDue || '',
        cta: h.cta || '', ship: { method: h.method || '', items: (h.products || []).map(c => ({ tr_code: c, qty: 1 })) } } };
  }
  function rowChecks(id, x) {
    const p = pseudo(id, x), r = R.checkMove(state(), p.deal, startAt(), p.form);
    return r.errs.filter(e => !['to', 'pillar', 'cta', 'ship_method', 'ship_items', 'ship_by'].includes(e.field));   // the pillar · CTA · sample method / products are the header's (one message there)
  }
  function plan() { const h = api.header(); return R.bulkShortlistPlan(state(), [...bk.sel.keys()], h.campaign, { pic: h.assign || 'me', me: R.picName(U.me()) || '' }); }
  function drawSide() {
    if (!$('bk_selected')) return;
    const s = state(), h = api.header(), n = bk.sel.size, p = plan(), over = n > R.MAX_BULK, showTerm = needsTerm(), termReq = R.pillarStepReached(s.lookups, startAt());
    $('bk_seln').textContent = B.selectedH(n);
    const skip = new Set(p.skip.map(x => x.kol.kol_id));
    $('bk_selected').innerHTML = !n ? `<div class="hint">${esc(B.noneSelected)}</div>` : [...bk.sel.entries()].map(([id, x]) => {
      const k = R.kolById(s, id); if (!k) return '';
      const errs = bk.submitted && !skip.has(id) ? rowChecks(id, x) : [], bad = f => errs.some(e => e.field === f);
      const tier = R.tierOf(R.maxFollowers(R.accountsOfKol(s, id)), s.lookups.tier_rules || []) || R.UNKNOWN_TIER;
      const pk = x.term === 'package' ? R.packageChoices(s, id, today(), null).map(c => ({ value: c.pkg.package_id, label: MV.pkgOption(R.packageLabel(c.pkg), Math.max(0, c.left)) })) : [];
      const pkObj = x.term === 'package' && x.packageId ? R.packageById(s, x.packageId) : null, rateAuto = !!pkObj;
      const rateVal = rateAuto ? R.fmtNum(R.unitPrice(pkObj) * (Number(x.units) || 1)) : KT.move.fmtMoney(x.rate);
      return `<div class="bk-srow${skip.has(id) ? ' skipped' : ''}${errs.length ? ' bad' : ''}" data-srow="${esc(id)}"><div class="bk-sk"><b>${U.nameHTML(k.display_name)}</b> <span class="chip">${esc(tier)}</span>${skip.has(id) ? ` <span class="muted small">${esc(B.skipReason[p.skip.find(y => y.kol.kol_id === id).reason])}</span>` : ''}` +
          `<button type="button" class="x" data-bkrm="${esc(id)}" aria-label="${esc(B.removeRow(k.display_name))}">×</button></div>` +
        `<div class="bk-sf"><label class="bk-f"><span>${esc(B.rate)}</span><input type="text" inputmode="decimal" class="mv-money${bad('rate_card') ? ' invalid' : ''}" data-srate="${esc(id)}" value="${esc(rateVal)}"${rateAuto ? ' disabled' : ''} autocomplete="off">` +
          `<span class="muted small">${rateAuto ? esc(MV.fromPackage) : KT.move.lastRateHTML(s, x.last, `data-slast="${esc(id)}"`)}</span></label>` +
        `<label class="bk-f"><span>${esc(B.postDue)}</span>${dateHTML(`data-sdue="${esc(id)}"`, x.postDue, { label: B.postDue })}<span class="muted small" data-sphase="${esc(id)}">${KT.move.dateHintHTML(h.campaign, x.postDue) || '&nbsp;'}</span></label>` +   // CR-23 §3.5
        (showTerm ? `<label class="bk-f"><span>${esc(B.term)}${termReq ? ' <span class="req">*</span>' : ''}</span><select data-sterm="${esc(id)}"${bad('payment_term') ? ' class="invalid"' : ''}>${optionsHTML(R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), x.term, MV.chooseTerm)}</select><span>&nbsp;</span></label>` : '') +
        (showTerm && x.term === 'package' ? `<label class="bk-f"><span>${esc(MV.package)} <span class="req">*</span></span><select data-spkg="${esc(id)}"${bad('package_id') ? ' class="invalid"' : ''}>${optionsHTML(pk, x.packageId, MV.choosePackage)}</select><span>&nbsp;</span></label>` +
          `<label class="bk-f bk-uses"><span>${esc(B.uses)}</span><input type="number" min="1" step="1" data-suses="${esc(id)}" value="${esc(x.units)}"><span>&nbsp;</span></label>` : '') +
        `</div>${errs.length ? `<div class="bk-serr">${errs.map(e => `<span>${esc(e.msg)}</span>`).join('')}</div>` : ''}</div>`;
    }).join('');
    /* the money: Remaining → after adding (the rates of the rows that will be added) */
    const c = s.campaigns.find(x => x.campaign_id === h.campaign), add = p.create.reduce((a, x) => { const r = bk.sel.get(x.kol.kol_id), pk = r.term === 'package' && r.packageId ? R.packageById(s, r.packageId) : null;
      return a + (pk ? R.unitPrice(pk) * (Number(r.units) || 1) : Number(KT.move.money(r.rate)) || 0); }, 0);
    const committedNow = c ? (R.dealContext(s).committedByCampaign.get(c.campaign_id) || 0) : 0;
    const remain = c && !R.isBlank(c.budget_kol) ? Number(c.budget_kol) - committedNow : null, after = remain == null ? null : remain - add;
    const noDue = p.create.filter(x => !bk.sel.get(x.kol.kol_id).postDue).length;
    /* "2 rows need a rate" · "1 row needs a payment term" — each thing a row misses counts once for that row */
    const what = f => (f === 'rate_card' ? B.needRate : f === 'package_id' || f === 'package_units' ? B.needPackage : f === 'payment_term' ? B.needTerm : null);
    const byWhat = new Map();
    if (bk.submitted) p.create.forEach(x => new Set(rowChecks(x.kol.kol_id, bk.sel.get(x.kol.kol_id)).map(e => what(e.field)).filter(Boolean)).forEach(w => byWhat.set(w, (byWhat.get(w) || 0) + 1)));
    $('bk_sum').innerHTML = !h.campaign ? `<div class="hint">${esc(B.chooseCampaign)}</div>` :
      (remain == null ? `<div class="muted small">${esc(B.noBudgetLine)}</div>` : `<div class="bk-budget"><span class="${after < 0 ? 'over' : ''}">${esc(B.remainingLine(R.baht(remain), R.baht(after)))}</span>` +
        (after < 0 && add > 0 ? `<div class="check warn">! <span>${esc(C.msg.campaignOver(R.baht(-after)))}</span></div>` : '') + `</div>`) +
      `<div>${esc(B.willAddSkip(p.create.length, p.skip.length))}</div>` + (noDue ? `<div class="muted small">${esc(B.withoutDue(noDue))}</div>` : '') +
      [...byWhat.entries()].map(([w, k]) => `<div class="check err">✕ <span>${esc(B.rowsNeed(k, w))}</span></div>`).join('');
    $('bk_checks').innerHTML = over ? checksHTML({ errs: [{ msg: B.maxPerBatch(R.MAX_BULK) }], warns: [], infos: [] }, '') : p.errs.length && n ? checksHTML({ errs: p.errs, warns: [], infos: [] }, '') : '';
    const addB = $('bk_add'); addB.textContent = B.addDeals(p.create.length); addB.disabled = over || !p.create.length || p.errs.length > 0;
    $('bk_addopen').disabled = addB.disabled;
  }

  /* ---------- events ---------- */
  function click(e) {
    const t = e.target; if (!bk) return false;
    if (api && api.headerClick(e)) return true;
    if (t.id === 'bk_page') { const on = t.checked; bk.rows.slice(bk.page * PAGE, bk.page * PAGE + PAGE).forEach(r => (on ? addSel(r.k.kol_id) : bk.sel.delete(r.k.kol_id))); bk.dirty = true; drawList(); return true; }
    const cb = t.closest('[data-bksel]'); if (cb) { cb.checked ? addSel(cb.dataset.bksel) : bk.sel.delete(cb.dataset.bksel); bk.dirty = true; drawList(); return true; }
    if (t.closest('[data-bkall]')) { bk.rows.slice(0, R.MAX_BULK).forEach(r => addSel(r.k.kol_id)); bk.dirty = true; drawList(); return true; }
    if (t.closest('[data-bkclearsel]')) { bk.sel.clear(); bk.dirty = true; drawList(); return true; }
    const rm = t.closest('[data-bkrm]'); if (rm) { bk.sel.delete(rm.dataset.bkrm); bk.dirty = true; drawList(); return true; }
    const pg = t.closest('[data-bkpage]'); if (pg) { bk.page += +pg.dataset.bkpage; drawList(); return true; }
    if (t.closest('[data-bkclear]') || t.closest('#bk_chips [data-clearfilters]')) { bk.f = blank(); bk.page = 0; draw(api); return true; }
    /* CR-25 §3.2 — Partner type · Filters (open / fold) · a chip's × · "+n more" */
    const pt = t.closest('[data-bkpt]'); if (pt) { bk.f.partner = U.partnerSegPick(pt, 'data-bkpt'); bk.page = 0; drawList(); drawTools(); return true; }
    if (t.closest('[data-bkfold]')) { setFold(!foldOpen()); return true; }
    if (t.closest('[data-bkmore]')) { setFold(true); return true; }
    const un = t.closest('#bk_chips [data-unset]'); if (un) { unsetFold(un.dataset.unset); return true; }
    const sl = t.closest('[data-slast]'); if (sl) { const x = bk.sel.get(sl.dataset.slast); if (x) { x.rate = sl.dataset.amount; bk.dirty = true; drawSide(); } return true; }   // CR-22 §3.1
    if (t.closest('[data-bknewkol]')) { api.createAsNew(bk.f.q); return true; }   // CR-22 §3.4
    if (t.closest('[data-bkclearother]')) { const q = bk.f.q; bk.f = blank(); bk.f.q = q; bk.page = 0; draw(api); return true; }
    const da = t.closest('[data-bkdueall]'); if (da) { dueAll(da); return true; }
    const row = t.closest('[data-bkrow]'); if (row && !t.closest('a,button,input')) { const id = row.dataset.bkrow; bk.sel.has(id) ? bk.sel.delete(id) : addSel(id); bk.dirty = true; drawList(); return true; }
    const ad = t.closest('[data-bkadd]'); if (ad) { if (!ad.disabled) confirm(ad.dataset.bkadd === 'open'); return true; }
    return false;
  }
  function dueAll(anchor) {
    if (!bk.sel.size) return;
    U.popForm(anchor, { title: B.setDueTitle, ok: B.apply, focus: '.dtext', body: `<div class="field"><label>${esc(B.postDue)}</label>${dateHTML('id="bk_dueall"', '', { label: B.postDue })}</div>`,
      onOk: m => { const v = m.querySelector('#bk_dueall').value; if (!R.isISODate(v)) { U.popFormError(m, C.msg.dateInvalid(B.postDue)); return false; } bk.sel.forEach(x => { x.postDue = v; }); bk.dirty = true; drawSide(); return true; } });
  }
  function onInput(e) {
    if (!bk) return;
    const r = e.target.closest('[data-srate]'); if (r) { bk.sel.get(r.dataset.srate).rate = r.value; bk.dirty = true; return; }
    const u = e.target.closest('[data-suses]'); if (u) { bk.sel.get(u.dataset.suses).units = u.value; bk.dirty = true; return; }
    const du = e.target.closest('[data-sdue]'); if (du && R.isISODate(du.value)) { bk.sel.get(du.dataset.sdue).postDue = du.value; const ph = document.querySelector(`[data-sphase="${CSS.escape(du.dataset.sdue)}"]`); if (ph) ph.innerHTML = KT.move.dateHintHTML(api.header().campaign, du.value) || '&nbsp;'; }
  }
  function onChange(e) {
    const t = e.target, map = { bk_fplatform: 'platform', bk_ftier: 'tier', bk_ftype: 'type', bk_fcat: 'category', bk_fowner: 'owner', bk_fstatus: 'status', bk_flast: 'lastWorked', bk_fperf: 'perf' };
    if (!bk) return;
    if (map[t.id]) { bk.f[map[t.id]] = t.value; bk.page = 0; drawList(); drawTools(); return; }
    if (t.id === 'bk_notin') { bk.f.notIn = t.checked; bk.page = 0; drawList(); drawTools(); return; }
    if (t.id === 'bk_posted') { bk.f.postedOnly = t.checked; bk.page = 0; drawList(); drawTools(); return; }
    const r = t.closest('[data-srate]'); if (r) { r.value = KT.move.fmtMoney(r.value); drawSide(); return; }
    const du = t.closest('[data-sdue]'); if (du) { bk.sel.get(du.dataset.sdue).postDue = R.isISODate(du.value) ? du.value : ''; bk.dirty = true; drawSide(); return; }
    const tm = t.closest('[data-sterm]'); if (tm) { const x = bk.sel.get(tm.dataset.sterm); x.term = tm.value; if (x.term !== 'package') x.packageId = ''; bk.dirty = true; drawSide(); return; }
    const pk = t.closest('[data-spkg]'); if (pk) { bk.sel.get(pk.dataset.spkg).packageId = pk.value; bk.dirty = true; drawSide(); return; }
    const u = t.closest('[data-suses]'); if (u) { drawSide(); }
  }
  /* the header changed (Campaign · Start at …): the list (Not in this campaign) and the panel follow */
  const headerChanged = () => { if (bk && $('bk_list')) { drawList(); drawTools(); } };

  /* ---------- Add n deals (§4.2 · §4.10): the rows that miss what Start at needs → red, scrolled to · else every deal at once, Undo ---------- */
  function confirm(openFirst) {
    if (!guard('deal.edit')) return;
    const s = state(), h = api.header(), p = plan(); if (!p.create.length || p.errs.length) return;
    bk.submitted = true;
    const bad = p.create.filter(x => rowChecks(x.kol.kol_id, bk.sel.get(x.kol.kol_id)).length);
    if (bad.length || api.headerErrors().length) { drawSide(); api.showHeaderErrors(); const el = document.querySelector(`[data-srow="${CSS.escape(bad.length ? bad[0].kol.kol_id : '')}"]`); if (el) el.scrollIntoView({ block: 'center' }); return; }
    const n = p.create.length, batchId = 'B' + Date.now().toString(36), firstLog = store.newLogId(), step = R.stepOf(s.lookups, h.startAt) || R.shortlistStep(s.lookups);
    const dealIds = []; for (let i = 0; i < n; i++) { const id = store.newId('deal'); dealIds.push(id); s.deals.push({ deal_id: id, _reserve: true }); }
    s.deals = s.deals.filter(d => !d._reserve);
    let postN = parseInt(store.newId('post').slice(1), 10);
    const made = [];
    p.create.forEach((x, i) => {
      const r = bk.sel.get(x.kol.kol_id), pk = r.term === 'package' && r.packageId ? R.packageById(s, r.packageId) : null, units = Number(r.units) || 1;
      const rate = pk ? Math.round(R.unitPrice(pk) * units * 100) / 100 : R.isBlank(KT.move.money(r.rate)) ? null : Number(KT.move.money(r.rate));
      const acc = R.accountsOfKol(s, x.kol.kol_id).slice().sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0))[0];
      const withPost = !!acc && (!!r.postDue || !!h.phase);
      const out = R.newDeal(s, { dealId: dealIds[i], logId: firstLog + i, campaignId: h.campaign, kolId: x.kol.kol_id, sub: step.sub_status, pic: h.assign || x.pic || null,
        prefill: Object.assign({ pillar: h.pillar || null, payment_term: R.isTerm(r.term) ? r.term : null, rate_card: rate, expected_post_date: r.postDue || null, package_id: pk ? pk.package_id : null, package_units: pk ? units : 1, created_batch_id: batchId },
          api.atLeast('Contacted') && h.cta ? { cta: h.cta } : {}),
        accountIds: withPost ? [acc.account_id] : [], postIds: withPost ? ['P' + String(postN++).padStart(6, '0')] : [], phaseOverrides: [h.phase || null], date: today(), now: new Date(), user: userId(), note: C.bulk.logNote });
      if (!R.isTerm(r.term)) out.deal.payment_term = R.isTerm(x.term) ? x.term : null;
      out.posts.forEach(pp => Object.assign(pp, { metrics_source: null, metrics_updated_by: null }));
      s.deals.push(out.deal); s.deal_status_log.push(out.log); out.posts.forEach(pp => s.deal_posts.push(pp));
      R.setDealProducts(s, out.deal.deal_id, (h.products || []).map(c => ({ tr_code: c, qty: 1, note: null })));
      const shp = api.newDealShipment(s, out.deal); if (shp) s.sample_shipments.push(shp);   // CR-22 §3.3
      made.push(out.deal);
    });
    const snap = new Map(made.map(d => [d.deal_id, JSON.stringify(d)])), campaignId = h.campaign, after = api.after;
    KT.newDeal.close(); commit();
    if (after) after(dealIds[0]);
    if (openFirst) { KT.screens.deals.showBatch(campaignId, dealIds, dealIds[0]); }
    else KT.screens.deals.showBatch(campaignId, dealIds);
    toastAction(B.added(n), C.deal.undo, () => {
      const st = state(), keep = new Set(R.batchUntouched(st, batchId, snap).map(d => d.deal_id));
      st.deals = st.deals.filter(d => !keep.has(d.deal_id)); st.deal_status_log = st.deal_status_log.filter(l => !keep.has(l.deal_id)); st.deal_posts = st.deal_posts.filter(x => !keep.has(x.deal_id));
      st.deal_products = st.deal_products.filter(x => !keep.has(x.deal_id)); st.sample_shipments = (st.sample_shipments || []).filter(x => !keep.has(x.deal_id));
      commit(B.undone(keep.size)); KT.screens.deals.showBatch(campaignId, []);
    }, 10000);
  }

  return { open, init, reset, isDirty, draw, click, selectKols, headerChanged };
})();
