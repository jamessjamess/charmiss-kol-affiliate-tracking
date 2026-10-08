/* rules-samples.js — CR-10 R6 §4.14 Samples: product samples sent to KOLs before they make content. A shipment per send (a deal can have
   several: a second send, a replacement) · Ship by = 7 days (Settings) before Draft 1, else before the expected post · the status on screen
   comes from the shipment and today (To ship · Ship this week · Overdue · Shipped · Delivered · Problem · Not required) · the reconcile at
   every save (ui.commit): a deal reaching Confirm QT gets a To ship shipment, a cancelled deal's To ship become Not required, Ship by follows
   the deal's dates unless set by hand, and deals.delivered / delivery_date follow the shipments. Shipping details (recipient, phone, address)
   are only in the Payee vault (payee_profiles.secure_ship, encrypted) — never here. Pure functions. Adds to KT.rules (load after rules-bulk.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { isBlank, isISODate, trim, addDays, dayDiff } = R;
  const CARRIERS = ['Kerry Express', 'Flash Express', 'Thailand Post', 'J&T Express', 'Lalamove', 'Grab', 'Messenger', 'Hand delivered', 'Other'];
  /* the group order on screen */
  const SAMPLE_STATUSES = ['overdue', 'this_week', 'to_ship', 'kol_purchase', 'shipped', 'problem', 'delivered', 'purchased', 'not_required'];
  /* CR-22 §3.3 — how the samples go: NPD · Warehouse · KOL buys own (self_purchase: nothing is sent — KOL purchase → Purchased) ·
     lookups.shipment_methods keeps the words (Settings › Samples · the keys never change) */
  const SHIP_METHODS = ['npd', 'warehouse', 'self_purchase'];
  const shipMethodsDefault = () => SHIP_METHODS.map(key => ({ key, label: C.samples.method[key] }));
  const shipMethodLabel = (lookups, key) => { const x = ((lookups || {}).shipment_methods || []).find(m => m.key === key); return (x && R.trim(x.label)) || (C.samples.method[key] || key || ''); };
  const sampleSettingsDefault = () => ({ lead_days: 7, carriers: CARRIERS.slice(), tracking_url: {} });
  const sampleSettings = lookups => { const s = Object.assign(sampleSettingsDefault(), (lookups || {}).sample_settings || {}); s.lead_days = Number(s.lead_days) >= 0 ? Math.round(Number(s.lead_days)) : 7; return s; };
  const shipmentsOf = (state, dealId) => (state.sample_shipments || []).filter(x => x.deal_id === dealId);

  /* Ship by = (expected Draft 1, else the expected post date) − lead days · neither → null ("Set ship-by date") */
  function shipBy(deal, settings) {
    const base = isISODate(deal.expected_draft1_date) ? deal.expected_draft1_date : isISODate(deal.expected_post_date) ? deal.expected_post_date : null;
    return base ? addDays(base, -sampleSettings({ sample_settings: settings }).lead_days) : null;
  }
  /* stored status + today → the status on screen: a shipment not sent yet is Overdue (ship by < today) · Ship this week (≤ 7 days) · To ship */
  function sampleStatus(sh, today) {
    if (sh.status === 'not_required') return 'not_required';
    if (sh.status === 'kol_purchase' || sh.status === 'purchased') return sh.status;   // CR-22: KOL buys own
    if (sh.status === 'problem') return 'problem';
    if (sh.status === 'delivered' || isISODate(sh.delivered_date)) return 'delivered';
    if (sh.status === 'shipped' || isISODate(sh.shipped_date)) return 'shipped';
    if (!isISODate(sh.ship_by)) return 'to_ship';
    if (sh.ship_by < today) return 'overdue';
    return sh.ship_by <= addDays(today, 7) ? 'this_week' : 'to_ship';
  }
  const openShipment = sh => !['delivered', 'not_required', 'purchased'].includes(sh.status) && !isISODate(sh.delivered_date);
  /* a deal that should have a sample on the way: not cancelled · Confirm QT or later · not Complete */
  const needsSample = (lookups, d) => d.status !== 'Cancel' && d.status !== 'Complete' && R.pillarStepReached(lookups, d.sub_status);
  const itemsOf = (dealProducts, dealId) => (dealProducts || []).filter(x => x.deal_id === dealId).map(x => ({ tr_code: x.tr_code, qty: Number(x.qty) || 1 }));
  function newShipment(o) {
    return { shipment_id: o.id, deal_id: o.deal.deal_id, kol_id: o.deal.kol_id, items: o.items || [], ship_by: o.shipBy || null, status: o.status || 'to_ship', ship_by_overridden: false,
      method: o.method || 'warehouse', purchase_amount: o.purchaseAmount == null ? null : o.purchaseAmount, purchased_date: null,   // CR-22 §4
      shipped_date: null, carrier: null, tracking_no: null, delivered_date: o.deliveredDate || null, problem_reason: null, not_required_reason: null, source: o.source || 'manual',
      note: null, address_id: null, created_by: o.user || null, created_at: o.now || null, updated_by: null, updated_at: null };   // CR-16: address_id null = the default at Mark shipped
  }

  /* §3 — schema 10 → 11 (store.js): delivered deals get a Delivered shipment (legacy · the date when there was one) · open deals from Confirm QT
     on without one get a To ship (auto) · Complete without delivery data: none · ids SH000001 … */
  function migrateSamples(obj) {
    if (!Array.isArray(obj.sample_shipments)) obj.sample_shipments = [];
    if (!obj.lookups.sample_settings) obj.lookups.sample_settings = sampleSettingsDefault();
    let n = obj.sample_shipments.reduce((m, x) => Math.max(m, parseInt(String(x.shipment_id).replace(/\D/g, ''), 10) || 0), 0);
    const has = new Set(obj.sample_shipments.map(x => x.deal_id)), id = () => 'SH' + String(++n).padStart(6, '0'), set = obj.lookups.sample_settings;
    obj.deals.forEach(d => {
      if (has.has(d.deal_id)) return;
      if (d.delivered) { obj.sample_shipments.push(newShipment({ id: id(), deal: d, items: itemsOf(obj.deal_products, d.deal_id), status: 'delivered', deliveredDate: isISODate(d.delivery_date) ? d.delivery_date : null, source: 'legacy' })); has.add(d.deal_id); }
    });
    obj.deals.forEach(d => {
      if (has.has(d.deal_id) || !needsSample(obj.lookups, d)) return;
      obj.sample_shipments.push(newShipment({ id: id(), deal: d, items: itemsOf(obj.deal_products, d.deal_id), shipBy: shipBy(d, set), source: 'auto' }));
    });
  }

  /* the reconcile at every save → events [{type: 'sample'}] · ctx = {shipmentId(), eventId(), now, user} */
  function syncShipments(state, ctx) {
    if (!Array.isArray(state.sample_shipments)) return [];
    const set = state.lookups.sample_settings, events = [], by = new Map();
    state.sample_shipments.forEach(x => { if (!by.has(x.deal_id)) by.set(x.deal_id, []); by.get(x.deal_id).push(x); });
    const ev = (sh, from, to, note) => events.push({ event_id: ctx.eventId(), deal_id: sh.deal_id, shipment_id: sh.shipment_id, type: 'sample', from, to, changed_at: ctx.now, changed_by: ctx.user || null, note: note || null });
    state.deals.forEach(d => {
      const list = by.get(d.deal_id) || [];
      /* reaching Confirm QT: a To ship with the deal's products (a deal with any shipment — even Not required — is left as it is) */
      if (!list.length && needsSample(state.lookups, d)) {
        const sh = newShipment({ id: ctx.shipmentId(), deal: d, items: itemsOf(state.deal_products, d.deal_id), shipBy: shipBy(d, set), source: 'auto', user: ctx.user, now: ctx.now });
        state.sample_shipments.push(sh); list.push(sh); ev(sh, null, 'to_ship', C.samples.autoNote);
      }
      list.forEach(sh => {
        if (d.status === 'Cancel' && (sh.status === 'to_ship' || sh.status === 'kol_purchase')) { const was = sh.status; Object.assign(sh, { status: 'not_required', not_required_reason: C.samples.dealCancelled, updated_at: ctx.now, updated_by: ctx.user || null }); ev(sh, was, 'not_required', C.samples.dealCancelled); }
        else if (sh.status === 'to_ship' && !sh.ship_by_overridden) { const sb = shipBy(d, set); if ((sh.ship_by || null) !== sb) sh.ship_by = sb; }
      });
      /* the deal's own fields follow its shipments (Template view / export unchanged) */
      if (list.length) {
        const dv = list.filter(x => x.status === 'delivered'), dates = dv.map(x => x.delivered_date).filter(isISODate).sort();
        const delivered = dv.length > 0, date = dates.length ? dates[dates.length - 1] : null;
        if (!!d.delivered !== delivered || (d.delivery_date || null) !== date) Object.assign(d, { delivered, delivery_date: date });
      }
    });
    return events;
  }

  /* who may change shipments: Admin · KOL Manager · Staff on deals they are the PIC of */
  const canEditShipment = (user, deal) => !!user && !!deal && R.can(user, 'deal.edit') && (user.role !== 'staff' || (!!R.picName(user) && deal.pic === R.picName(user)));
  /* a tracking link from Settings › Samples ({tracking} in the template) */
  const trackingLink = (settings, carrier, no) => { const t = ((settings || {}).tracking_url || {})[carrier]; return t && trim(no) && /^https?:\/\//i.test(t) ? t.replace('{tracking}', encodeURIComponent(trim(no))) : null; };
  /* Mark shipped / delivered / problem / not required · Set ship-by (null = back to auto) → the 'sample' event */
  function updateShipment(sh, change, ctx) {
    const from = sh.status;
    if (change.kind === 'shipped') Object.assign(sh, { status: 'shipped', shipped_date: change.date, carrier: change.carrier || sh.carrier || null, tracking_no: trim(change.tracking) || sh.tracking_no || null, items: change.items || sh.items });
    else if (change.kind === 'delivered') Object.assign(sh, { status: 'delivered', delivered_date: change.date, shipped_date: sh.shipped_date || null });
    else if (change.kind === 'purchased') Object.assign(sh, { status: 'purchased', purchased_date: change.date });   // CR-22: the KOL bought it
    else if (change.kind === 'unpurchased') Object.assign(sh, { status: 'kol_purchase', purchased_date: null });
    else if (change.kind === 'problem') Object.assign(sh, { status: 'problem', problem_reason: trim(change.reason) });
    else if (change.kind === 'not_required') Object.assign(sh, { status: 'not_required', not_required_reason: trim(change.reason) });
    else if (change.kind === 'ship_by') Object.assign(sh, change.date ? { ship_by: change.date, ship_by_overridden: true } : { ship_by_overridden: false });
    else if (change.kind === 'edit') ['carrier', 'tracking_no', 'shipped_date', 'delivered_date', 'items', 'note'].forEach(k => { if (k in change) sh[k] = change[k]; });
    if ((change.kind === 'shipped' || change.kind === 'edit') && change.address_id !== undefined) sh.address_id = change.address_id || null;   // CR-16 §4.3: Ship to
    Object.assign(sh, { updated_at: ctx.now, updated_by: ctx.user || null });
    return { event_id: ctx.eventId, deal_id: sh.deal_id, shipment_id: sh.shipment_id, type: 'sample', from, to: sh.status, changed_at: ctx.now, changed_by: ctx.user || null, note: trim(change.reason) || null };
  }
  function validateShipment(change, today) {
    const errs = [], M = C.msg;
    if (['shipped', 'delivered', 'purchased'].includes(change.kind) && !isISODate(change.date)) errs.push({ field: 'date', msg: M.dateInvalid(C.samples.col[change.kind === 'shipped' ? 'shipped' : 'delivered']) });
    if (['problem', 'not_required'].includes(change.kind) && !trim(change.reason)) errs.push({ field: 'reason', msg: M.sampleReason });
    if (change.kind === 'ship_by' && change.date && !isISODate(change.date)) errs.push({ field: 'date', msg: M.dateInvalid(C.samples.col.shipBy) });
    if (['problem', 'not_required'].includes(change.kind) && R.looksSensitive(change.reason)) errs.push({ field: 'reason', msg: M.sensitive });
    return { errs, warns: [], infos: [] };
  }

  /* the Journey's sample track (§4.14): the latest shipment that is not Not required, in words */
  function sampleTrack(shipments, today) {
    const list = shipments.filter(x => x.status !== 'not_required'), last = list[list.length - 1];
    if (!last) return shipments.length ? { kind: 'not_required' } : null;
    const st = sampleStatus(last, today);
    return { kind: st, shipBy: last.ship_by, shipped: last.shipped_date, carrier: last.carrier, delivered: last.delivered_date, late: st === 'overdue' ? dayDiff(today, last.ship_by) : 0 };
  }
  /* the rows of Deals › Samples: one a shipment of the deals given */
  function sampleRows(state, deals, today) {
    const ids = new Set(deals.map(d => d.deal_id)), by = new Map(deals.map(d => [d.deal_id, d]));
    /* the screen's and the shipping list's order: Overdue → … → Not required, then the earliest ship-by (none last) */
    const rank = r => SAMPLE_STATUSES.indexOf(r.status);
    return (state.sample_shipments || []).filter(x => ids.has(x.deal_id)).map(sh => ({ sh, deal: by.get(sh.deal_id), status: sampleStatus(sh, today) }))
      .sort((a, b) => rank(a) - rank(b) || String(a.sh.ship_by || '9999').localeCompare(String(b.sh.ship_by || '9999')) || String(a.sh.shipment_id).localeCompare(String(b.sh.shipment_id)));
  }
  const sampleCounts = rows => {
    const c = { overdue: 0, this_week: 0, shipped: 0, delivered: 0, noShipBy: 0 };
    rows.forEach(r => { if (r.status in c) c[r.status]++; if (r.status === 'to_ship' && !isISODate(r.sh.ship_by)) c.noShipBy++; });
    return c;
  };
  const itemsText = items => (items || []).map(x => `${x.tr_code}×${x.qty}`).join(', ');
  /* §4.14 Operations — Samples to ship (Overdue + Ship this week) and the Due list's "Ship sample" rows for a scope (f = {pic, campaign}) */
  function samplesToShip(state, f, today) {
    const deals = state.deals.filter(d => (!f.campaign || d.campaign_id === f.campaign) && (!f.pic || (f.pic === '__none' ? isBlank(d.pic) : d.pic === f.pic)));
    return sampleRows(state, deals, today).filter(r => r.status === 'overdue' || r.status === 'this_week');
  }
  function sampleDues(state, f, today, days) {
    const end = addDays(today, days == null ? 7 : days), deals = state.deals.filter(d => (!f.campaign || d.campaign_id === f.campaign) && (!f.pic || (f.pic === '__none' ? isBlank(d.pic) : d.pic === f.pic)));
    return sampleRows(state, deals, today).filter(r => (r.status === 'this_week' || r.status === 'to_ship') && isISODate(r.sh.ship_by) && r.sh.ship_by >= today && r.sh.ship_by <= end)
      .map(r => ({ deal: r.deal, due: r.sh.ship_by, sample: r.sh }));
  }
  function validateSampleSettings(d) {
    const errs = [], n = Number(d.lead_days);
    if (isBlank(d.lead_days) || !Number.isInteger(n) || n < 0 || n > 60) errs.push({ field: 'lead_days', msg: C.msg.sampleLead });
    Object.values(d.tracking_url || {}).forEach(t => { if (trim(t) && (!/^https?:\/\//i.test(trim(t)) || !t.includes('{tracking}'))) errs.push({ field: 'tracking_url', msg: C.msg.sampleTracking }); });
    return { errs, warns: [], infos: [] };
  }

  /* ===================== schema 21 (CR-22 §4) ===================== */
  /* every shipment there is: method Warehouse · items = the deal's products (qty 1) when it has none · purchase_amount null · deals + product_purchase_fee
     null · lookups.shipment_methods · the money does not change · twice → the same */
  function migrateV21(obj) {
    const L = obj.lookups || (obj.lookups = {});
    if (!Array.isArray(L.shipment_methods)) L.shipment_methods = shipMethodsDefault();
    const prods = new Map();
    (obj.deal_products || []).forEach(x => { if (!prods.has(x.deal_id)) prods.set(x.deal_id, []); prods.get(x.deal_id).push({ tr_code: x.tr_code, qty: 1 }); });
    (obj.sample_shipments || []).forEach(sh => {
      if (!SHIP_METHODS.includes(sh.method)) sh.method = 'warehouse';
      if ((!Array.isArray(sh.items) || !sh.items.length) && sh.deal_id && prods.has(sh.deal_id)) sh.items = prods.get(sh.deal_id).map(x => Object.assign({}, x));
      if (!Array.isArray(sh.items)) sh.items = [];
      if (sh.purchase_amount === undefined) sh.purchase_amount = null;
      if (sh.purchased_date === undefined) sh.purchased_date = null;
    });
    (obj.deals || []).forEach(d => { if (d.product_purchase_fee === undefined) d.product_purchase_fee = null; });
    obj.schema_version = Math.max(obj.schema_version || 0, 21);
    return obj;
  }

  return { SHIP_METHODS, shipMethodsDefault, shipMethodLabel, migrateV21, CARRIERS, SAMPLE_STATUSES, sampleSettingsDefault, sampleSettings, shipmentsOf, shipBy, sampleStatus, openShipment, needsSample, newShipment, migrateSamples,
    syncShipments, canEditShipment, trackingLink, updateShipment, validateShipment, sampleTrack, sampleRows, sampleCounts, itemsText, samplesToShip, sampleDues, validateSampleSettings };
})(KT.rules, KT.content));
