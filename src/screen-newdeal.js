/* screen-newdeal.js — CR-20 §4.1–4.5: the New deal modal (L) — two tabs split by "is the KOL in KOL Master already?":
   From KOL Master (default · 1 or many KOLs · fill little — screen-bulk.js) · New KOL (a KOL not in KOL Master + the deal in detail — here).
   One header for both (its values stay when the tab changes): Campaign * (approved ones only · status chip · days left) · Phase (Auto by post date) ·
   Assign to * (the owner of the new deals · Me) · Pillar (the Phase's default) · Start at (Shortlist · Contacted · Confirm QT) · Products.
   No "Adding to …" line · "Assign to" = who owns the deal, "KOL owner" = the PIC of the KOL in KOL Master · no CTA here (Deal modal).
   What a deal needs at its Start at comes from R.stageRequirements (through R.checkMove) — the same rule as Move stage.
   CR-22 — Start at Contacted / Confirm QT: CTA * in the header (every row) · Confirm QT: Sample method * + Products * (a shipment a deal) ·
   Assign to * (no one picked = red, nothing made) · a search with no KOL → Create "<name>" as new KOL (the New KOL tab, the name filled in). → KT.newDeal */
KT.newDeal = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, toastAction, checksHTML, optionsHTML, activeList, field, dateHTML, setDate, userId, guard, can, picList, pfIcon, phaseChip } = U;
  const B = C.bulk, D = C.deal, F = C.deal.f, MV = C.move, T = C.kol;
  let nd = null;   // { m, tab, h (header), after, nk (New KOL tab) }

  /* ===================== open ===================== */
  /* o = { tab 'master' | 'newkol', campaignId, kolIds (selected on From KOL Master), opener, after(dealId) } */
  function open(o = {}) {
    if (!guard('deal.edit')) return;
    if (U.drawerOwner() && U.drawerOwner().kind === 'deal') U.closeDrawer();
    if (U.modalOpen()) U.closeModal();
    const s = state(), myPic = R.picName(U.me()) || '';
    const tab = o.tab === 'newkol' ? 'newkol' : 'master';
    const me = { tab, after: o.after || null, h: { campaign: o.campaignId || KT.screens.deals.currentCampaign() || R.defaultCampaignId(s, today()) || '', phase: '', assign: myPic, pillar: '', pillarFromPhase: false,
      startAt: (R.shortlistStep(s.lookups) || {}).sub_status || 'Shortlist', products: [], onlyProduct: false, cta: '', method: '', shipBy: '', dirty: false, submitted: false }, nk: null };   // CR-23 §3.4: + Ship by
    if (!picList().includes(me.h.assign)) me.h.assign = '';   // CR-22 §3.5: Me only when I am a PIC (an Admin picks)
    nd = me;
    if (!R.isApproved(s.campaigns.find(c => c.campaign_id === me.h.campaign) || {})) me.h.campaign = R.defaultCampaignId(s, today()) || '';
    fillProducts(); fillPillar();
    me.m = U.createModal({ size: 'L', tabs: [{ key: 'master', label: B.tabMaster }, { key: 'newkol', label: B.tabNewKol }], tab, opener: o.opener,
      focus: () => (me.tab === 'master' ? '#bk_q' : '#f_nk_name'),
      onTab: key => { me.tab = key; drawTab(true); me.m.focusFirst(); },
      onClick: e => (me.tab === 'master' ? KT.bulk.click(e) : nkClick(e)),
      isDirty: () => me.h.dirty || KT.bulk.isDirty() || !!(me.nk && me.nk.dirty),   // what was typed on either tab (§4.5)
      onClose: () => { if (nd !== me) return; nd = null; KT.bulk.reset(); } });
    KT.bulk.init({ kolIds: o.kolIds });
    drawTab(true);
  }
  const close = () => { if (nd) nd.m.close(); };
  const isOpen = () => !!nd;
  function drawTab(top) {
    if (!nd) return;
    if (nd.tab === 'master') KT.bulk.draw(api(), top);
    else drawNewKol(top);
  }
  /* what the From KOL Master tab gets from the modal */
  const api = () => ({ m: nd.m, header: () => nd.h, headerHTML, wireHeader, headerClick, headerErrors, showHeaderErrors, after: nd.after, createAsNew, newDealShipment, atLeast });

  /* ===================== the header (§4.1) ===================== */
  function fillProducts() {
    const s = state(), h = nd.h, only = R.onlyProduct(s, h.campaign), all = R.campaignProducts(s, h.campaign).filter(p => p.active !== false).map(p => p.tr_code);
    h.products = h.products.filter(c => all.includes(c));
    if (only && !h.products.length) { h.products = [only]; h.onlyProduct = true; } else if (!only) h.onlyProduct = false;
  }
  function fillPillar() {
    const h = nd.h; if (!h.pillarFromPhase && h.pillar) return;
    const x = R.pillarPrefill(state(), h.campaign, h.phase, null);
    if (x) { h.pillar = x.pillar; h.pillarFromPhase = true; } else if (h.pillarFromPhase) { h.pillar = ''; h.pillarFromPhase = false; }
  }
  function campaignInfo(c) {
    if (!c) return '';
    const s = state(), td = today(), st = R.campaignEffectiveStatus(c, R.phasesOfCampaign(s, c.campaign_id), td), span = R.campaignDates(s, c), end = Array.isArray(span) ? span[1] : span && span.to;
    const left = end ? R.dayDiff(end, td) : null, CA = C.campaign;
    return phaseChip(st) + (left == null ? '' : ` <span class="muted small">${esc(left > 0 ? CA.daysLeft(left) : left === 0 ? CA.endsToday : CA.ended)}</span>`);
  }
  function headerHTML() {
    const s = state(), h = nd.h, c = s.campaigns.find(x => x.campaign_id === h.campaign), myPic = R.picName(U.me()) || '';
    const phases = R.sortPhases(R.phasesOfCampaign(s, h.campaign)).map(p => ({ value: p.phase_id, label: R.phaseName(s, p.phase_id) }));
    const people = picList(h.assign).map(n => ({ value: n, label: n === myPic ? B.me(n) : n }));
    const starts = R.stepsOf(s.lookups).filter(st => st.active !== false && ['Shortlist', 'Contacted', 'Confirm QT'].includes(st.sub_status)).map(st => ({ value: st.sub_status, label: st.sub_status }));
    const prods = R.campaignProducts(s, h.campaign).filter(p => p.active !== false);
    const errs = h.submitted ? headerErrors() : [], bad = k => (errs.some(e => e.field === k) ? ' invalid' : '');
    /* CR-22 §3.2 · §3.3 — CTA (Contacted or later) · Sample method (Confirm QT) — for every deal of the batch */
    const ctaF = atLeast('Contacted') ? `<div class="field"><label for="nd_cta">${esc(B.ctaAll)} <span class="req">*</span></label><select id="nd_cta" data-ndh="cta" class="${bad('cta')}">${optionsHTML(activeList('cta_list', h.cta || null), h.cta, MV.chooseCta)}</select></div>` : '';
    const methodF = atLeast('Confirm QT') ? `<div class="field"><label for="nd_method">${esc(B.methodAll)} <span class="req">*</span></label><select id="nd_method" data-ndh="method" class="${bad('ship_method')}">${optionsHTML(R.SHIP_METHODS.map(k => ({ value: k, label: R.shipMethodLabel(s.lookups, k) })), h.method, MV.chooseMethod)}</select></div>` : '';
    /* CR-23 §3.4 — Ship by * (NPD / Warehouse) · Buy by (KOL buys own) for every deal of the batch · empty until typed */
    const own = h.method === 'self_purchase', sbL = own ? MV.buyBy : MV.shipBy;
    const shipByF = atLeast('Confirm QT') ? `<div class="field"><label>${esc(sbL)}${own ? '' : ' <span class="req">*</span>'}</label><span class="${bad('ship_by').trim()}">${U.dateHTML('id="nd_shipby" data-ndh="shipBy" data-key="ship_by"', h.shipBy || '', { label: sbL })}</span></div>` : '';
    return `<div class="nd-head" id="nd_head"><div class="fields nd-hf">
        <div class="field nd-camp"><label for="nd_camp">${esc(B.campaign)} <span class="req">*</span></label><div class="nd-cw"><select id="nd_camp" data-ndh="campaign" data-combo="campaign" class="${bad('campaign_id')}">${U.campaignOptionsHTML(h.campaign, B.chooseCampaign, { forDeal: true })}</select><span class="nd-cinfo">${campaignInfo(c)}</span></div></div>
        <div class="field"><label for="nd_phase">${esc(B.phase)}</label><select id="nd_phase" data-ndh="phase">${optionsHTML(phases, h.phase, B.autoPhase)}</select></div>
        <div class="field"><label for="nd_assign">${esc(B.assignTo)} <span class="req">*</span></label><select id="nd_assign" data-ndh="assign" class="${bad('pic')}">${optionsHTML(people, h.assign, D.choosePic)}</select><div class="hint">${esc(B.assignHint)}</div></div>
        <div class="field"><label for="nd_pillar">${esc(B.pillar)}${h.pillarFromPhase && h.pillar ? ` <span class="chip sh-from">${esc(C.fill.fromPhase)}</span>` : ''}</label><select id="nd_pillar" data-ndh="pillar" class="${bad('pillar')}">${optionsHTML(activeList('pillar_list', h.pillar), h.pillar, D.none)}</select></div>
        <div class="field"><label for="nd_start">${esc(B.startAt)}</label><select id="nd_start" data-ndh="startAt">${optionsHTML(starts, h.startAt)}</select></div>
        ${ctaF}${methodF}${shipByF}
        <div class="field nd-prods${bad('ship_items')}"><label>${esc(F.products)}${atLeast('Confirm QT') ? ' <span class="req">*</span>' : ''}${h.onlyProduct ? ` <span class="chip sh-from">${esc(C.fill.onlyProduct)}</span>` : ''}</label><div class="nd-pl">${prods.length ? prods.map(p => `<label class="tick small"><input type="checkbox" data-ndprod="${esc(p.tr_code)}"${h.products.includes(p.tr_code) ? ' checked' : ''}> ${esc(R.productShort(p))}</label>`).join('') : `<span class="muted small">${esc(D.noProductsYet)}</span>`}</div></div>
      </div><div class="checks" id="nd_hchecks">${errs.length ? checksHTML({ errs, warns: [], infos: [] }, '') : ''}</div></div>`;
  }
  /* Campaign (approved · not on hold / cancelled) · Assign to · a pillar when the deals start at Confirm QT or later */
  function headerErrors() {
    const s = state(), h = nd.h, errs = [];
    if (!h.campaign || !s.campaigns.some(c => c.campaign_id === h.campaign)) errs.push({ field: 'campaign_id', msg: C.msg.addCampaignRequired });
    else if (R.campaignBlocksNew(s, h.campaign)) errs.push({ field: 'campaign_id', msg: R.campaignBlocksNew(s, h.campaign) });
    if (!h.assign) errs.push({ field: 'pic', msg: C.msg.dealsPicRequired });
    if (R.pillarStepReached(s.lookups, h.startAt) && !h.pillar) errs.push({ field: 'pillar', msg: C.msg.pillarRequired });
    if (atLeast('Contacted') && !h.cta) errs.push({ field: 'cta', msg: C.msg.moveCtaRequired });
    if (atLeast('Confirm QT')) {
      if (!R.SHIP_METHODS.includes(h.method)) errs.push({ field: 'ship_method', msg: C.msg.shipMethodRequired });
      if (!h.products.length) errs.push({ field: 'ship_items', msg: C.msg.shipItemsRequired });
      const sbL = h.method === 'self_purchase' ? MV.buyBy : MV.shipBy;   // CR-23 §3.4
      if (!h.shipBy) { if (h.method !== 'self_purchase') errs.push({ field: 'ship_by', msg: C.msg.shipByRequired }); }
      else if (!R.isISODate(h.shipBy)) errs.push({ field: 'ship_by', msg: C.msg.dateInvalid(sbL) });
      else if (h.shipBy < today()) errs.push({ field: 'ship_by', msg: C.msg.shipByBeforeMove(sbL) });
    }
    return errs;
  }
  /* the header's Start at is at / past a step */
  function atLeast(name) { const L = state().lookups, a = R.stepOf(L, nd.h.startAt), b = R.stepOf(L, name); return !!a && !!b && a.sort_order >= b.sort_order; }
  /* CR-22 §3.3 — the shipment of a deal made at Confirm QT (the header's method and products) */
  function newDealShipment(s, deal) {
    const h = nd.h; if (!atLeast('Confirm QT') || !R.SHIP_METHODS.includes(h.method)) return null;
    const own = h.method === 'self_purchase';
    return Object.assign(R.newShipment({ id: store.newId('shipment'), deal, items: h.products.map(c => ({ tr_code: c, qty: 1 })), shipByDate: R.isISODate(h.shipBy) ? h.shipBy : null,   // CR-23 §3.4: the header's date
      status: own ? 'kol_purchase' : 'to_ship', source: 'new_deal', user: userId(), now: new Date().toISOString(), method: h.method }), { purpose: 'review', campaign_id: deal.campaign_id, pick_list_id: null });
  }
  /* CR-22 §3.4 — a search with no KOL: the New KOL tab with that name (the header stays) */
  function createAsNew(name) {
    if (!nd) return;
    nd.nk = newKolState(); nd.nk.kol.display_name = R.trim(name); nd.nk.dirty = true;
    nd.tab = 'newkol'; nd.m.setTab('newkol'); drawTab(true); nd.m.focusFirst();
  }
  function showHeaderErrors() { nd.h.submitted = true; const el = $('nd_head'); if (el) { el.outerHTML = headerHTML(); wireHeader($('cm_body')); } }
  function wireHeader(root) {
    const head = root.querySelector('#nd_head'); if (!head) return;
    U.enhanceCombos(head);
    head.addEventListener('change', e => {
      const el = e.target.closest('[data-ndh]'), pr = e.target.closest('[data-ndprod]'), h = nd.h;
      if (pr) { h.products = pr.checked ? h.products.concat([pr.dataset.ndprod]) : h.products.filter(x => x !== pr.dataset.ndprod); h.onlyProduct = false; h.dirty = true; return; }
      if (!el) return;
      const k = el.dataset.ndh; h[k] = el.value; h.dirty = true;
      if (k === 'campaign') { h.phase = ''; fillProducts(); fillPillar(); }
      if (k === 'phase') fillPillar();
      if (k === 'pillar') h.pillarFromPhase = false;
      if (k === 'assign' && nd.nk && nd.nk.ownerAuto) nd.nk.kol.pic = h.assign;
      drawTab();
      if (nd.tab === 'master') KT.bulk.headerChanged();
    });
  }
  const headerClick = () => false;

  /* ===================== tab New KOL (§4.4) ===================== */
  const blankAccount = () => ({ profile_link: '', platform: '', handle: '', followers: '' });
  function newKolState() {
    return { kol: { display_name: '', partner_type: 'kol', accounts: [blankAccount()], kol_category: '', kol_type: '', gender: '', pic: nd.h.assign, contact_channel: '', contact_id: '' },
      deal: { payment_term: '', pkg_units: '', pkg_price: '', package_units: '1', rate_card: '', gencode_expense: '', gencode_period: '', gencode_start_date: '', basket_fee: '', asset_fee: '', expediting_fee: '',
        brief_date: '', expected_script_date: '', expected_draft1_date: '', expected_draft2_date: '', expected_draft3_date: '', expected_post_date: '', link_brief: '', remark: '' },
      showD23: false, touched: new Set(), submitted: false, dirty: false, ownerAuto: true, anyway: false };
  }
  function drawNewKol(top) {
    if (!nd.nk) nd.nk = newKolState();
    const s = state(), x = nd.nk, k = x.kol, d = x.deal, L = s.lookups, rules = L.tier_rules || [];
    const inp = (path, key, v, type, extra) => `<input${type ? ` type="${type}"` : ''} id="f_nk_${key}" data-nk="${path}" data-key="${key}" value="${esc(v == null ? '' : v)}" autocomplete="off"${type === 'number' ? ' min="0" step="1" inputmode="numeric"' : ''}${extra || ''}>`;
    const sel = (path, key, items, v, ph) => `<select id="f_nk_${key}" data-nk="${path}" data-key="${key}">${optionsHTML(items, v, ph)}</select>`;
    const types = (L.kol_type_list || []).filter(t => t.active !== false).map(t => ({ value: t.key, label: t.label }));
    const accs = k.accounts.map((a, i) => `<div class="acc-edit nk-acc" data-ai="${i}"><div class="top"><span>${esc(T.accountN(i + 1))}</span>${k.accounts.length > 1 ? `<button type="button" class="link" data-nkdelacc="${i}">${esc(B.removeAccount)}</button>` : ''}</div><div class="fields">` +
      field(`acc${i}_profile_link`, T.fLink, inp(`accounts.${i}.profile_link`, `acc${i}_profile_link`, a.profile_link, 'url', ' placeholder="https://www.tiktok.com/@account"'), { req: 1, wide: 1 }) +
      field(`acc${i}_platform`, T.platform, sel(`accounts.${i}.platform`, `acc${i}_platform`, (L.platform_list || []).map(v => ({ value: v, label: v })), a.platform, T.choose), { req: 1 }) +
      field(`acc${i}_handle`, T.fHandle, inp(`accounts.${i}.handle`, `acc${i}_handle`, a.handle, '', ` placeholder="${esc(T.handlePh)}"`), { req: 1 }) +
      field(`acc${i}_followers`, B.colFollowers, inp(`accounts.${i}.followers`, `acc${i}_followers`, a.followers, 'number'), { req: 1 }) +
      `<div class="field"><label>${esc(B.tierAuto)}</label><input readonly tabindex="-1" data-nktier="${i}" value="${esc(R.tierOf(a.followers, rules))}"></div></div></div>`).join('');
    const left = `<section class="sec"><div class="sec-h"><span>${esc(B.secKol)} <span class="muted small">${esc(B.secKolSub)}</span></span></div><div id="nk_dup"></div><div class="fields">` +
      field('display_name', C.bulk.ck.name, inp('display_name', 'display_name', k.display_name, '', ` placeholder="${esc(T.namePh)}"`), { req: 1, wide: 1 }) +
      field('partner_type', C.partner.field, U.partnerSegHTML('data-nkpt', k.partner_type || 'kol', { id: 'f_nk_partner_type' }), { req: 1, wide: 1 }) + `</div>${accs}` +   // CR-25 §3.1
      `<button type="button" class="link" data-nkaddacc>${esc(B.addAnotherAccount)}</button><div class="fields">` +
      field('kol_category', T.category, inp('kol_category', 'kol_category', k.kol_category, '', ' list="nk_dl_cat"')) + field('kol_type', T.type, sel('kol_type', 'kol_type', types, k.kol_type, C.bulk.ck.notSet)) +
      field('gender', T.gender, sel('gender', 'gender', R.GENDERS.map(v => ({ value: v, label: v })), k.gender, C.bulk.ck.notSet)) +
      `<div class="field"><label title="${esc(B.kolOwnerTip)}">${esc(B.kolOwner)} <span class="req">*</span></label>${sel('pic', 'pic', picList(k.pic).map(v => ({ value: v, label: v })), k.pic, T.choose)}<div class="hint">${esc(B.kolOwnerTip)}</div></div>` +
      field('contact_channel', T.contact, sel('contact_channel', 'contact_channel', R.CONTACT_CHANNELS.map(v => ({ value: v, label: v })), k.contact_channel, C.bulk.ck.notSet)) +
      field('contact_id', T.contactId, inp('contact_id', 'contact_id', k.contact_id, '', ` placeholder="${esc(T.contactIdPh[k.contact_channel || ''] || T.contactIdPh[''])}" maxlength="${R.CONTACT_ID_MAX}"`), { hint: esc(T.contactIdHint) }) +
      `</div><datalist id="nk_dl_cat">${U.distinct(s.kol_master.map(x2 => x2.kol_category)).map(v => `<option value="${esc(v)}">`).join('')}</datalist></section>`;
    const termReq = R.pillarStepReached(L, nd.h.startAt), pkg = d.payment_term === 'package';
    const money = (key, label, o = {}) => field(key, label, `<input type="text" inputmode="decimal" class="mv-money" id="f_nk_${key}" data-nk="deal.${key}" data-key="${key}" value="${esc(KT.move.fmtMoney(d[key]))}" autocomplete="off"${o.disabled ? ' disabled' : ''}>`, o);
    const ref = '';
    const pay = `<section class="sec"><div class="sec-h"><span>${esc(D.secPayment)}</span></div><div class="fields">` +
      field('payment_term', D.term, `<select id="f_nk_payment_term" data-nk="deal.payment_term" data-key="payment_term" data-nkre>${optionsHTML(R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] })), d.payment_term, D.chooseTerm)}</select>`, { req: termReq }) +
      (pkg ? field('pkg_units', C.pkg.fPosts, inp('deal.pkg_units', 'pkg_units', d.pkg_units, 'number'), { req: 1 }) + field('pkg_price', C.pkg.fPrice, inp('deal.pkg_price', 'pkg_price', d.pkg_price, 'number'), { req: 1 }) +
        field('package_units', MV.uses, inp('deal.package_units', 'package_units', d.package_units, 'number'), { req: 1, hint: `<span id="nk_unit"></span>` }) : '') + `</div></section>`;
    const costs = `<section class="sec"><div class="sec-h"><span>${esc(D.secCosts)}</span></div><div class="fields">` +
      money('rate_card', MV.rateCard, { req: termReq && !pkg && d.payment_term !== 'free', disabled: pkg, hint: pkg ? esc(MV.fromPackage) : `<span class="lastrate muted">${esc(MV.noRate)}</span> · ${esc(MV.zeroHint)}` }) + money('gencode_expense', MV.gencodeCost) +
      field('gencode_period', F.gencode_period, inp('deal.gencode_period', 'gencode_period', d.gencode_period, 'number')) +
      field('gencode_start_date', F.gencode_start_date, dateHTML('id="f_nk_gencode_start_date" data-nk="deal.gencode_start_date" data-key="gencode_start_date"', d.gencode_start_date, { label: F.gencode_start_date })) +
      money('basket_fee', F.basket_fee) + money('asset_fee', MV.assetFee) + money('expediting_fee', MV.expeditingFee) +
      `<div class="field wide"><div class="kv total"><span>${esc(MV.totalCost)}</span><b id="nk_total"></b></div></div></div></section>`;
    const dt = f => field(f, F[f], dateHTML(`id="f_nk_${f}" data-nk="deal.${f}" data-key="${f}"`, d[f], { label: F[f] }), f === 'expected_post_date' ? { hint: '<span id="nk_phase"></span>' } : {});
    const tl = `<section class="sec"><div class="sec-h"><span>${esc(D.secTimeline)}</span></div><div class="fields">` + ['brief_date', 'expected_script_date', 'expected_draft1_date'].map(dt).join('') +
      (x.showD23 ? ['expected_draft2_date', 'expected_draft3_date'].map(dt).join('') : `<div class="field"><label>&nbsp;</label><button type="button" class="link" data-nkd23>${esc(D.showDraft23)}</button></div>`) + dt('expected_post_date') + `</div></section>`;
    const more = `<section class="sec"><div class="fields">${field('link_brief', F.link_brief, inp('deal.link_brief', 'link_brief', d.link_brief, 'url', ' placeholder="https://"'), { wide: 1 })}` +
      field('remark', F.remark, `<textarea id="f_nk_remark" data-nk="deal.remark" data-key="remark">${esc(d.remark)}</textarea>`, { wide: 1 }) + `</div><div id="nk_budget"></div></section>`;
    nd.m.setBody(headerHTML() + `<div class="nd-grid"><div class="nd-col">${left}</div><div class="nd-col">${pay}${costs}${tl}${more}</div></div>`, !top, 'nd-body');
    nd.m.setFoot(`<div class="checks" id="nk_checks"></div>`, `<button type="button" class="btn" data-cmclose>${esc(C.common.cancel)}</button><button type="button" class="btn" data-nkcreate="next">${esc(B.createNextKol)}</button><button type="button" class="btn primary" data-nkcreate="one">${esc(B.createKolDeal)}</button>`);
    const root = $('cm_body'); wireHeader(root);
    const box = root.querySelector('.nd-grid');
    box.addEventListener('input', nkInput); box.addEventListener('change', nkChange);
    nkCheck();
  }
  const setPath = (o, path, v) => { const ps = path.split('.'); let t = o; for (let i = 0; i < ps.length - 1; i++) t = t[ps[i]]; t[ps[ps.length - 1]] = v; };
  function nkInput(e) {
    const el = e.target.closest('[data-nk]'); if (!el || !nd || !nd.nk) return;
    const x = nd.nk, p = el.dataset.nk;
    setPath(p.startsWith('deal.') ? x : x.kol, p, el.value); x.dirty = true;
    if (p === 'pic') x.ownerAuto = false;
    const m = /^accounts\.(\d+)\.(profile_link|followers)$/.exec(p);
    if (m) { const a = x.kol.accounts[+m[1]], row = el.closest('.nk-acc');
      if (m[2] === 'profile_link') { const hh = R.handleFromLink(el.value), pp = R.platformFromLink(el.value);
        if (hh && R.isBlank(a.handle)) { a.handle = hh; row.querySelector('[data-nk$=".handle"]').value = hh; }
        if (pp && !a.platform && (state().lookups.platform_list || []).includes(pp)) { a.platform = pp; row.querySelector('[data-nk$=".platform"]').value = pp; } }
      row.querySelector('[data-nktier]').value = R.tierOf(a.followers, state().lookups.tier_rules || []); }
    nkCheck();
  }
  function nkChange(e) {
    if (nd && nd.nk && e.target.matches('[data-nkanyway]')) { nd.nk.anyway = e.target.checked; nkCheck(); return; }
    const el = e.target.closest('[data-nk]'); if (!el || !nd || !nd.nk) return;
    nkInput(e); nd.nk.touched.add(el.dataset.key);
    if (el.classList.contains('mv-money')) el.value = KT.move.fmtMoney(el.value);
    if (el.matches('[data-nkre]')) { drawNewKol(); return; }
    nkCheck();
  }
  /* the KOL (R.validateKol: name · every account: link · platform · handle · followers) · the deal at Start at (R.checkMove — the one rule) · its fields (R.validateDeal) */
  function nkModel() {
    const s = state(), x = nd.nk, h = nd.h, d = x.deal, k = x.kol, mn = v => (R.isBlank(KT.move.money(v)) ? '' : KT.move.money(v));
    const pkg = d.payment_term === 'package', units = Number(d.package_units) || 1, unit = pkg && Number(d.pkg_units) > 0 && Number(d.pkg_price) > 0 ? Number(d.pkg_price) / Number(d.pkg_units) : null;
    const deal = Object.assign(JSON.parse(JSON.stringify(R.DEAL_TEMPLATE)), { deal_id: null, kol_id: null, campaign_id: h.campaign, sub_status: null, status: null, pillar: h.pillar || null, pic: h.assign || null });
    const vals = { payment_term: R.isTerm(d.payment_term) ? d.payment_term : null, rate_card: pkg ? (unit != null ? Math.round(unit * units * 100) / 100 : null) : mn(d.rate_card) === '' ? null : mn(d.rate_card) };
    ['gencode_expense', 'basket_fee', 'asset_fee', 'expediting_fee'].forEach(f => { vals[f] = mn(d[f]) === '' ? null : mn(d[f]); });
    vals.gencode_period = R.isBlank(d.gencode_period) ? null : d.gencode_period;
    ['gencode_start_date', 'brief_date', 'expected_script_date', 'expected_draft1_date', 'expected_draft2_date', 'expected_draft3_date', 'expected_post_date'].forEach(f => { vals[f] = d[f] || null; });
    vals.link_brief = R.trim(d.link_brief) || null; vals.remark = R.trim(d.remark) || null;
    vals.draft_rounds = d.expected_draft3_date ? 3 : d.expected_draft2_date ? 2 : 1;
    return { deal: Object.assign(deal, vals), pkg, units, unit };
  }
  function nkErrors() {
    const s = state(), x = nd.nk, k = x.kol, mdl = nkModel(), errs = [], warns = [];
    const kr = R.validateKol(s, { kol_id: null, display_name: k.display_name, accounts: k.accounts.map(a => Object.assign({ account_id: null }, a)), contact_id: k.contact_id, contact_channel: k.contact_channel, pic: k.pic });
    errs.push(...kr.errs); warns.push(...kr.warns.filter(w => w.field !== 'display_name'));
    if (!k.pic) errs.push({ field: 'pic', msg: C.msg.ckPicRequired });
    /* the stage rule (Payment term · Rate · Package · Gencode days) — a new package is made with the deal, so it is checked here */
    const r = R.checkMove(s, mdl.deal, nd.h.startAt, { date: today(), today: today(), paymentTerm: mdl.deal.payment_term || '', rateCard: mdl.deal.rate_card == null ? '' : String(mdl.deal.rate_card),
      costs: { gencode_expense: mdl.deal.gencode_expense == null ? '' : String(mdl.deal.gencode_expense), gencode_period: mdl.deal.gencode_period == null ? '' : String(mdl.deal.gencode_period), gencode_start_date: mdl.deal.gencode_start_date || '', asset_fee: mdl.deal.asset_fee == null ? '' : String(mdl.deal.asset_fee), expediting_fee: mdl.deal.expediting_fee == null ? '' : String(mdl.deal.expediting_fee) } });
    errs.push(...r.errs.filter(e => !['to', 'pillar', 'package_id', 'package_units', 'cta', 'ship_method', 'ship_items', 'ship_by'].includes(e.field) && !(mdl.pkg && e.field === 'rate_card')));   // (CTA · method · products: the header's)
    if (mdl.pkg) {
      if (R.isBlank(x.deal.pkg_units) || !Number.isInteger(Number(x.deal.pkg_units)) || Number(x.deal.pkg_units) < 1) errs.push({ field: 'pkg_units', msg: C.msg.pkgUnits });
      if (R.isBlank(x.deal.pkg_price) || !(Number(x.deal.pkg_price) > 0)) errs.push({ field: 'pkg_price', msg: C.msg.pkgPrice });
      if (!Number.isInteger(mdl.units) || mdl.units < 1) errs.push({ field: 'package_units', msg: C.msg.packageUnits });
      else if (Number(x.deal.pkg_units) >= 1 && R.pillarStepReached(s.lookups, nd.h.startAt) && mdl.units > Number(x.deal.pkg_units)) errs.push({ field: 'package_units', msg: C.msg.packageNotEnough(Number(x.deal.pkg_units)) });
    }
    /* the deal's own fields (money · dates · links) */
    const dv = R.validateDeal(s, Object.assign({}, mdl.deal, { kol_id: '__new', sub_status: nd.h.startAt, status: R.statusOf(s.lookups, nd.h.startAt) }), [], today(), R.dealContext(s));
    const own = ['rate_card', 'gencode_expense', 'gencode_period', 'gencode_start_date', 'basket_fee', 'asset_fee', 'expediting_fee', 'brief_date', 'expected_script_date', 'expected_draft1_date', 'expected_draft2_date', 'expected_draft3_date', 'expected_post_date', 'link_brief', 'remark'];
    dv.errs.filter(e => own.includes(e.field) && !errs.some(x2 => x2.field === e.field)).forEach(e => errs.push(e));
    return { errs, warns, mdl };
  }
  function nkCheck() {
    if (!nd || !nd.nk || !$('nk_checks')) return null;
    const s = state(), x = nd.nk, r = nkErrors(), show = r.errs.filter(e => x.submitted || x.touched.has(e.field));
    const dup = R.findDuplicateKol(s, x.kol.display_name, (x.kol.accounts[0] || {}).handle);
    $('nk_dup').innerHTML = dup ? `<div class="ck-dup"><span>${esc(B.alreadyIn(dup.kol.display_name + (dup.handle ? ` (@${dup.handle})` : '')))}</span><button type="button" class="btn small" data-nkuse="${esc(dup.kol.kol_id)}">${esc(B.useThisKol)}</button>` +
      `<label class="tick small"><input type="checkbox" data-nkanyway${x.anyway ? ' checked' : ''}> ${esc(C.bulk.ck.createAnyway)}</label></div>` : '';
    $('nk_checks').innerHTML = checksHTML({ errs: show, warns: r.warns, infos: [] }, '');
    document.querySelectorAll('#cm_body .nd-grid [data-key]').forEach(el => { const t = el.type === 'hidden' ? el.closest('.dfield') : el; if (t) t.classList.toggle('invalid', show.some(e => e.field === el.dataset.key)); });
    const v = r.mdl.deal, total = R.COST_KEYS.reduce((a, f) => a + (Number(v[f]) || 0), 0);
    if ($('nk_total')) $('nk_total').textContent = R.baht(total);
    if ($('nk_unit')) $('nk_unit').textContent = r.mdl.unit != null ? `${C.pkg.fUnit} ${R.baht(r.mdl.unit)}` : '';
    if ($('f_nk_rate_card') && r.mdl.pkg) $('f_nk_rate_card').value = v.rate_card == null ? '' : R.fmtNum(v.rate_card);
    if ($('nk_phase')) $('nk_phase').innerHTML = KT.move.dateHintHTML(nd.h.campaign, x.deal.expected_post_date);   // CR-23 §3.5
    const c = s.campaigns.find(y => y.campaign_id === nd.h.campaign);
    if ($('nk_budget')) {
      const committed = c ? (R.dealContext(s).committedByCampaign.get(c.campaign_id) || 0) : 0, remain = c && !R.isBlank(c.budget_kol) ? Number(c.budget_kol) - committed : null, after = remain == null ? null : remain - total;
      $('nk_budget').innerHTML = remain == null ? `<div class="muted small">${esc(B.noBudgetLine)}</div>` : `<div class="bk-budget"><span class="${after < 0 ? 'over' : ''}">${esc(B.remainingLine(R.baht(remain), R.baht(after)))}</span>` +
        (after < 0 && total > 0 ? `<div class="check warn">! <span>${esc(C.msg.campaignOver(R.baht(-after)))}</span></div>` : '') + `</div>`;
    }
    return { r, dup };
  }
  function nkClick(e) {
    if (!nd || !nd.nk) return;
    const x = nd.nk;
    if (e.target.closest('[data-nkaddacc]')) { x.kol.accounts.push(blankAccount()); x.dirty = true; drawNewKol(); const rows = document.querySelectorAll('.nk-acc'); const last = rows[rows.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); last.querySelector('input').focus(); } return; }
    const da = e.target.closest('[data-nkdelacc]'); if (da) { x.kol.accounts.splice(+da.dataset.nkdelacc, 1); x.dirty = true; drawNewKol(); return; }
    if (e.target.closest('[data-nkd23]')) { x.showD23 = true; drawNewKol(); return; }
    const pt = e.target.closest('[data-nkpt]'); if (pt) { x.kol.partner_type = U.partnerSegPick(pt, 'data-nkpt'); x.dirty = true; return; }   // CR-25
    const use = e.target.closest('[data-nkuse]'); if (use) { useKol(use.dataset.nkuse); return; }
    const cr = e.target.closest('[data-nkcreate]'); if (cr) create(cr.dataset.nkcreate === 'next');
  }
  /* "Already in KOL Master · Use this KOL" → From KOL Master with that KOL selected (§4.4) */
  function useKol(id) {
    KT.bulk.selectKols([id]);
    nd.tab = 'master'; nd.m.setTab('master'); drawTab(true);
  }
  function create(next) {
    if (!guard('deal.edit')) return;
    const x = nd.nk, h = nd.h; x.submitted = true; h.submitted = true;
    const chk = nkCheck(), herr = headerErrors();
    if (herr.length) showHeaderErrors();
    if (!chk || chk.r.errs.length || herr.length || (chk.dup && !x.anyway)) { const bad = document.querySelector('#cm_body .invalid'); if (bad) bad.scrollIntoView({ block: 'center' }); return; }
    const s = state(), k = x.kol, mdl = chk.r.mdl, now = new Date(), td = today();
    /* the KOL + its accounts (KOL owner = Assign to unless changed) */
    const kolId = store.newId('kol'), v = t => R.trim(t) || null;
    const kol = { kol_id: kolId, display_name: R.trim(k.display_name), kol_category: v(k.kol_category), kol_type: v(k.kol_type), gender: k.gender || null, pic: v(k.pic), kol_status: 'Active', status_reason: null,
      contact_channel: k.contact_channel || null, contact_id: v(k.contact_id), note: null, sources: ['manual'], default_payment_term: R.BASIC_TERMS.includes(mdl.deal.payment_term) ? mdl.deal.payment_term : null, kol_type_legacy: null,
      partner_type: R.partnerTypeOf(k) };   // CR-25
    s.kol_master.push(kol);
    const accIds = k.accounts.map(a => { const id = store.newId('account'); s.kol_accounts.push(R.newAccountRecord(kolId, a, id)); return id; });
    /* a package made with it (Payment term Package) */
    let pkg = null;
    if (mdl.pkg) {
      pkg = R.newPackage(s, { kol_id: kolId, name: C.pkg.defaultName(R.fmtNum(Number(x.deal.pkg_units)), R.baht(Number(x.deal.pkg_price))), units_total: x.deal.pkg_units, price_total: x.deal.pkg_price, start_date: td }, { now, user: userId() });
      if (!Array.isArray(s.kol_packages)) s.kol_packages = [];
      s.kol_packages.push(pkg); s.deal_events.push(R.packageEvent('package_created', pkg, { eventId: store.newEventId(), now, user: userId() }, null, { name: pkg.name, units_total: pkg.units_total, price_total: pkg.price_total }));
    }
    /* the deal: one planned post on the first account (its Phase from the Post due, or the Phase picked) */
    const dealId = store.newId('deal'), step = R.stepOf(s.lookups, h.startAt) || R.shortlistStep(s.lookups), postId = 'P' + String(parseInt(store.newId('post').slice(1), 10)).padStart(6, '0');
    const extra = {}; ['pillar', 'payment_term', 'rate_card', 'gencode_expense', 'gencode_period', 'gencode_start_date', 'basket_fee', 'asset_fee', 'expediting_fee', 'brief_date', 'expected_script_date', 'expected_draft1_date',
      'expected_draft2_date', 'expected_draft3_date', 'expected_post_date', 'link_brief', 'remark', 'draft_rounds'].forEach(f => { const val = mdl.deal[f]; extra[f] = val == null || val === '' ? null : ['rate_card', 'gencode_expense', 'basket_fee', 'asset_fee', 'expediting_fee', 'gencode_period'].includes(f) ? Number(val) : val; });
    extra.draft_rounds = mdl.deal.draft_rounds || 1;
    if (pkg) Object.assign(extra, { package_id: pkg.package_id, package_units: mdl.units });
    if (atLeast('Contacted') && h.cta) extra.cta = h.cta;   // CR-22 §3.2
    const out = R.newDeal(s, { dealId, logId: store.newLogId(), campaignId: h.campaign, kolId, sub: step.sub_status, pic: h.assign, extra, accountIds: [accIds[0]], postIds: [postId], phaseOverrides: [h.phase || null], date: td, now, user: userId(), note: null });
    out.posts.forEach(p => Object.assign(p, { metrics_source: null, metrics_updated_by: null }));
    s.deals.push(out.deal); s.deal_status_log.push(out.log); out.posts.forEach(p => s.deal_posts.push(p));
    R.setDealProducts(s, dealId, h.products.map(c => ({ tr_code: c, qty: 1, note: null })));
    const shp = newDealShipment(s, out.deal); if (shp) s.sample_shipments.push(shp);   // CR-22 §3.3
    const after = nd.after, campaignId = h.campaign;
    commit(B.kolDealCreated(kol.display_name, dealId));
    if (after) after(dealId);
    if (next) { nd.nk = newKolState(); drawNewKol(true); nd.m.focusFirst(); }
    else { close(); KT.screens.deals.showBatch(campaignId, [dealId]); }
  }

  return { open, close, isOpen, headerErrors };
})();
