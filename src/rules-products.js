/* rules-products.js — CR-06 §4.3: the product catalog (TR codes from TRCLOUD), the products of a Campaign and the
   products of a deal (with qty). Adds to KT.rules (load after rules-deal.js, before rules-overview.js). No DOM, no storage.
     products            {tr_code (unique, case and outer spaces ignored), product_name, variant, active}
     campaign_products   {campaign_id, tr_code, sort_order} — a Campaign has several, a product can be in several Campaigns
     deal_products       {deal_id, tr_code, qty (whole number ≥ 1), note} — only products of the deal's Campaign
   Requisition / stock is out of scope (deal_products.qty is where it would start). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg;
  const { isBlank, trim } = R;
  const issue = (field, msg) => ({ field, msg });
  const codeKey = code => trim(code).toLowerCase();
  const sameCode = (a, b) => codeKey(a) === codeKey(b);

  /* ---------- catalog ---------- */
  const productByCode = (state, code) => (state.products || []).find(p => sameCode(p.tr_code, code)) || null;
  /* "TR code · Product name · Variant" (pickers) · "Product name · Variant" (lists) */
  const productLabel = p => [p.tr_code, p.product_name, p.variant].filter(x => !isBlank(x)).join(' · ');
  const productShort = p => [p.product_name, p.variant].filter(x => !isBlank(x)).join(' · ');
  /* how often a product is used: Campaigns that have it · deals that picked it */
  function productUse(state, code) {
    return { campaigns: (state.campaign_products || []).filter(x => sameCode(x.tr_code, code)).length, deals: (state.deal_products || []).filter(x => sameCode(x.tr_code, code)).length };
  }
  const canDeleteProduct = (state, code) => { const u = productUse(state, code); return !u.campaigns && !u.deals; };
  /* draft {tr_code, product_name, variant} · isNew: the TR code must not exist yet (it is never changed afterwards) */
  function validateProduct(state, draft, isNew) {
    const errs = [], code = trim(draft.tr_code);
    if (!code) errs.push(issue('tr_code', M.productCodeRequired));
    else if (isNew) { const dup = productByCode(state, code); if (dup) errs.push(issue('tr_code', M.productCodeDup(dup.tr_code, dup.product_name))); }
    if (!trim(draft.product_name)) errs.push(issue('product_name', M.productNameRequired));
    return { errs, warns: [], infos: [] };
  }
  const newProduct = draft => ({ tr_code: trim(draft.tr_code), product_name: trim(draft.product_name), variant: trim(draft.variant) || null, active: true });

  /* ---------- Import CSV (tr_code, product_name, variant — the TRCLOUD export) ---------- */
  const PRODUCT_IMPORT_COLS = ['tr_code', 'product_name', 'variant'];
  const PRODUCT_IMPORT_SAMPLE = [PRODUCT_IMPORT_COLS, ['TR-0001', 'Charming Iconic Glow Cushion', '01 Light'], ['TR-0002', 'Kiss Signal Lip Gloss', '03 Rosy']];
  /* rows = parseCSV output (first row = header) → {headerError, rows: [{n, tr_code, product_name, variant, kind, msg, product}]}
     kind: new · update (name or variant differs) · same (already in the catalog) · duplicate (the TR code is on an earlier row) · error */
  function planProductImport(state, rows) {
    const head = (rows[0] || []).map(h => trim(h).toLowerCase());
    const col = k => head.indexOf(k);
    const missing = ['tr_code', 'product_name'].filter(k => col(k) < 0);
    if (missing.length) return { headerError: M.importHeader(missing.join(', ')), rows: [] };
    const seen = new Map(), out = [];
    rows.slice(1).forEach((r, i) => {
      const n = i + 2, get = k => (col(k) < 0 ? '' : trim(r[col(k)]));
      const x = { n, tr_code: get('tr_code'), product_name: get('product_name'), variant: get('variant') || null };
      const key = codeKey(x.tr_code), old = x.tr_code ? productByCode(state, x.tr_code) : null;
      if (!x.tr_code) Object.assign(x, { kind: 'error', msg: M.productCodeRequired });
      else if (!x.product_name) Object.assign(x, { kind: 'error', msg: M.productNameRequired });
      else if (seen.has(key)) Object.assign(x, { kind: 'duplicate', msg: M.importDupRow(seen.get(key)) });
      else if (!old) x.kind = 'new';
      else if (old.product_name !== x.product_name || (old.variant || null) !== x.variant) Object.assign(x, { kind: 'update', product: old, msg: M.productImportRename(productShort(old)) });
      else Object.assign(x, { kind: 'same', product: old });
      if (x.tr_code && !seen.has(key)) seen.set(key, n);
      out.push(x);
    });
    return { headerError: null, rows: out };
  }
  const importCounts = plan => Object.fromEntries(['new', 'update', 'same', 'duplicate', 'error'].map(k => [k, plan.rows.filter(r => r.kind === k).length]));
  /* → the new catalog (new rows added, names / variants updated) + counts */
  function applyProductImport(state, plan) {
    const products = (state.products || []).map(p => Object.assign({}, p));
    plan.rows.forEach(r => {
      if (r.kind === 'new') products.push(newProduct(r));
      if (r.kind === 'update') { const p = products.find(x => sameCode(x.tr_code, r.tr_code)); Object.assign(p, { product_name: r.product_name, variant: r.variant }); }
    });
    return { products, counts: importCounts(plan) };
  }

  /* ---------- products of a Campaign ---------- */
  const campaignProductRows = (state, campaignId) => (state.campaign_products || []).filter(x => x.campaign_id === campaignId).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const campaignProductCodes = (state, campaignId) => campaignProductRows(state, campaignId).map(x => x.tr_code);
  const campaignProducts = (state, campaignId) => campaignProductCodes(state, campaignId).map(code => productByCode(state, code) || { tr_code: code, product_name: code, variant: null, active: true });
  const campaignHasProduct = (state, campaignId, code) => campaignProductCodes(state, campaignId).some(c => sameCode(c, code));
  /* deals of the Campaign that picked the product — the product cannot leave the Campaign while there are any */
  const productDealsInCampaign = (state, campaignId, code) => {
    const ids = new Set(state.deals.filter(d => d.campaign_id === campaignId).map(d => d.deal_id));
    return [...new Set((state.deal_products || []).filter(x => ids.has(x.deal_id) && sameCode(x.tr_code, code)).map(x => x.deal_id))];
  };
  /* the Campaign's list after an edit → errors (a product a deal uses was taken out · a new Campaign needs one) + warnings */
  function checkCampaignProducts(state, campaignId, codes) {
    const errs = [], warns = [];
    if (!codes.length) (campaignId ? warns : errs).push(issue('products', campaignId ? M.campaignNoProducts : M.campaignProductsRequired));
    /* CR-09 §4.7: a product deals use may leave the Campaign (the screen asks first) — those deals keep it */
    if (campaignId) campaignProductCodes(state, campaignId).filter(c => !codes.some(x => sameCode(x, c))).forEach(c => {
      const n = productDealsInCampaign(state, campaignId, c).length;
      if (n) warns.push(issue('products', M.productRemovedUsed(productShort(productByCode(state, c) || { product_name: c }), n)));
    });
    return { errs, warns, infos: [] };
  }
  /* replace the Campaign's products (in the order given) */
  function setCampaignProducts(state, campaignId, codes) {
    state.campaign_products = (state.campaign_products || []).filter(x => x.campaign_id !== campaignId)
      .concat(codes.map((code, i) => ({ campaign_id: campaignId, tr_code: code, sort_order: i + 1 })));
  }
  /* Campaigns still without products (not cancelled) — Operations queue "Campaign without products" */
  const campaignsWithoutProducts = (state, campaignId) => state.campaigns.filter(c => (!campaignId || c.campaign_id === campaignId) && c.status_override !== 'cancelled' && !campaignProductCodes(state, c.campaign_id).length);

  /* ---------- products of a deal ---------- */
  const dealProductList = (state, dealId) => (dealId ? (state.deal_products || []).filter(x => x.deal_id === dealId).map(x => ({ tr_code: x.tr_code, qty: x.qty, note: x.note || null })) : []);
  /* list = [{tr_code, qty}] as in the form → errors per row (product{i}_qty) */
  /* kept: the codes the deal already had — one the Campaign has since dropped stays on the deal (info, CR-09 §4.7), a new pick must be in the list */
  function validateDealProducts(state, campaignId, list, kept) {
    const errs = [];
    (list || []).forEach((x, i) => {
      const p = productByCode(state, x.tr_code), name = p ? productShort(p) : x.tr_code;
      if (campaignId && !campaignHasProduct(state, campaignId, x.tr_code) && !(kept || []).some(c => sameCode(c, x.tr_code))) errs.push(issue(`product${i}_qty`, M.productNotInCampaign(name)));
      const q = Number(x.qty);
      if (isBlank(x.qty) || isNaN(q) || q < 1 || !Number.isInteger(q)) errs.push(issue(`product${i}_qty`, M.productQty(name)));
    });
    return errs;
  }
  function setDealProducts(state, dealId, list) {
    state.deal_products = (state.deal_products || []).filter(x => x.deal_id !== dealId)
      .concat((list || []).map(x => ({ deal_id: dealId, tr_code: x.tr_code, qty: Number(x.qty) || 1, note: trim(x.note) || null })));
  }
  /* "Product name · Variant × qty, …" (drawer) · "TR×qty, …" (Deals CSV) · TR codes one per line (Template) */
  const dealProductsText = (state, list) => (list || []).map(x => `${productShort(productByCode(state, x.tr_code) || { product_name: x.tr_code })} × ${x.qty}`).join(', ');
  const dealProductsCsv = (state, dealId) => dealProductList(state, dealId).map(x => `${x.tr_code}×${x.qty}`).join(', ');
  const dealTrCodes = (state, dealId) => dealProductList(state, dealId).map(x => x.tr_code);
  /* By campaign › Posts card: n products of the Campaign · m units picked by its deals (not cancelled; in the scope's deals when given) */
  function productsPlanned(state, campaignId, dealIds) {
    const ids = dealIds ? new Set(dealIds) : new Set(state.deals.filter(d => d.campaign_id === campaignId && !R.isCancelled(d)).map(d => d.deal_id));
    const live = new Set(state.deals.filter(d => ids.has(d.deal_id) && !R.isCancelled(d)).map(d => d.deal_id));
    return { items: campaignProductCodes(state, campaignId).length, units: (state.deal_products || []).filter(x => live.has(x.deal_id)).reduce((a, x) => a + (Number(x.qty) || 0), 0) };
  }

  return {
    codeKey, sameCode, productByCode, productLabel, productShort, productUse, canDeleteProduct, validateProduct, newProduct,
    PRODUCT_IMPORT_COLS, PRODUCT_IMPORT_SAMPLE, planProductImport, importCounts, applyProductImport,
    campaignProductRows, campaignProductCodes, campaignProducts, campaignHasProduct, productDealsInCampaign, checkCampaignProducts, setCampaignProducts, campaignsWithoutProducts,
    dealProductList, validateDealProducts, setDealProducts, dealProductsText, dealProductsCsv, dealTrCodes, productsPlanned,
  };
})(KT.rules, KT.content));
