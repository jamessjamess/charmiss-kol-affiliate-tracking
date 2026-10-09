/* rules-ship.js — CR-11 R4 §4.10: Shipments — the work of sending, across every Campaign (a Deal says what to send and by when;
   Shipments is where it is packed and sent). Tabs To ship · In transit · Delivered · queue cards · pick lists (a round of packing:
   items summed per TR code, Mark all shipped with one tracking no. a line) · New shipment (with or without a deal — the recipient is
   always a KOL of KOL Master, the address stays in the Payee vault) · who may do what. The collection keeps its name sample_shipments.
   Pure functions. Adds to KT.rules (load after rules-golive.js). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const { isBlank, isISODate, trim, dayDiff } = R;
  const PURPOSES = ['review', 'gifting', 'replacement', 'affiliate', 'other'];
  const SHIP_TABS = ['to-ship', 'in-transit', 'delivered'];
  const TO_SHIP_GROUPS = ['overdue', 'this_week', 'later', 'noShipBy', 'problem', 'kol_purchase'];   // CR-22: KOL buys own last (nothing to pack)
  const TRANSIT_SLOW = 5;   // days in transit above this are amber

  /* the PIC of a shipment: its deal's · without a deal, the person who made it (when they are a PIC) */
  const shipPic = (state, sh, deal) => (deal ? deal.pic || '' : R.picName(R.userById(state, sh.created_by)) || '');
  /* one row a shipment: deal (or null) · KOL · Campaign · PIC · purpose · the status on screen */
  function shipRows(state, today) {
    const deals = new Map(state.deals.map(d => [d.deal_id, d])), kols = new Map(state.kol_master.map(k => [k.kol_id, k]));
    return (state.sample_shipments || []).map(sh => {
      const deal = sh.deal_id ? deals.get(sh.deal_id) || null : null;
      return { sh, deal, kol: kols.get(sh.kol_id || (deal && deal.kol_id)) || null, campaign_id: sh.campaign_id || (deal && deal.campaign_id) || null,
        pic: shipPic(state, sh, deal), purpose: PURPOSES.includes(sh.purpose) ? sh.purpose : 'review', status: R.sampleStatus(sh, today) };
    });
  }
  /* f = { campaign, pic ('' all · '__none' · a name), purpose, q (KOL · @handle · shipment / deal ID · tracking no.), status (a status or 'noShipBy'),
     CR-23 §3.1: product (a TR code · '__none' = no products recorded), phase (the deal is in that Phase — R.phaseIndex) } */
  function filterShipRows(state, rows, f) {
    const q = trim(f.q).toLowerCase().replace(/^@/, ''), handles = new Map();
    const idx = f.phase ? R.phaseIndex(state) : null, inPhase = r => !!r.deal && ((idx.deal.get(r.deal.deal_id) || {}).keys || new Set()).has(f.phase);
    if (q) (state.kol_accounts || []).forEach(a => { handles.set(a.kol_id, (handles.get(a.kol_id) || '') + ' ' + String(a.handle || '').toLowerCase()); });
    return rows.filter(r => {
      if (f.campaign && r.campaign_id !== f.campaign) return false;
      if (f.pic && (f.pic === '__none' ? !isBlank(r.pic) : r.pic !== f.pic)) return false;
      if (f.purpose && r.purpose !== f.purpose) return false;
      if (f.method && (r.sh.method || 'warehouse') !== f.method) return false;   // CR-22 §3.3
      if (f.status && (f.status === 'noShipBy' ? !(r.status === 'to_ship' && !R.shipByDate(r.sh)) : r.status !== f.status)) return false;
      if (f.product && (f.product === '__none' ? (r.sh.items || []).length > 0 : !(r.sh.items || []).some(x => x.tr_code === f.product))) return false;
      if (f.phase && !inPhase(r)) return false;
      if (q) {
        const kid = r.kol && r.kol.kol_id, hay = [r.kol && r.kol.display_name, handles.get(kid), r.sh.shipment_id, r.sh.deal_id, r.sh.tracking_no].map(v => String(v || '').toLowerCase()).join(' ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  const tabOfStatus = st => (st === 'shipped' ? 'in-transit' : st === 'delivered' || st === 'not_required' || st === 'purchased' ? 'delivered' : 'to-ship');
  const toShipGroup = r => (r.status === 'kol_purchase' ? 'kol_purchase' : r.status === 'problem' ? 'problem' : r.status === 'overdue' ? 'overdue' : r.status === 'this_week' ? 'this_week' : R.shipByDate(r.sh) ? 'later' : 'noShipBy');
  const daysInTransit = (sh, today) => (isISODate(sh.shipped_date) ? Math.max(0, dayDiff(today, sh.shipped_date)) : null);
  /* the rows of one tab in their order — To ship: Overdue → This week → Later → No ship-by date → Problem, by Ship by · In transit: the oldest
     shipped first · Delivered: the newest first; what came from the old files (or the clean-up) is hidden unless showImported → { rows, hidden } */
  function shipTab(rows, tab, today, showImported) {
    let list = rows.filter(r => tabOfStatus(r.status) === tab), hidden = 0;
    const id = (a, b) => String(a.sh.shipment_id).localeCompare(String(b.sh.shipment_id));
    if (tab === 'to-ship') list.sort((a, b) => TO_SHIP_GROUPS.indexOf(toShipGroup(a)) - TO_SHIP_GROUPS.indexOf(toShipGroup(b)) || String(R.shipByDate(a.sh) || '9999').localeCompare(String(R.shipByDate(b.sh) || '9999')) || id(a, b));
    else if (tab === 'in-transit') list.sort((a, b) => String(a.sh.shipped_date || '9999').localeCompare(String(b.sh.shipped_date || '9999')) || id(a, b));
    else {
      const imp = list.filter(r => R.isLegacyDelivered(r.sh)); hidden = imp.length;
      if (!showImported) list = list.filter(r => !R.isLegacyDelivered(r.sh));
      list.sort((a, b) => String(b.sh.delivered_date || '').localeCompare(String(a.sh.delivered_date || '')) || id(a, b));
    }
    return { rows: list, hidden };
  }
  /* the queue cards over the scope (before the tab) */
  function shipCards(rows) {
    const c = { overdue: 0, this_week: 0, in_transit: 0, noShipBy: 0, problem: 0 };
    rows.forEach(r => { if (r.status === 'overdue') c.overdue++; else if (r.status === 'this_week') c.this_week++; else if (r.status === 'shipped') c.in_transit++; else if (r.status === 'problem') c.problem++;
      else if (r.status === 'to_ship' && !R.shipByDate(r.sh)) c.noShipBy++; });
    return c;
  }
  const tabCounts = rows => ({ 'to-ship': rows.filter(r => tabOfStatus(r.status) === 'to-ship').length, 'in-transit': rows.filter(r => r.status === 'shipped').length,
    delivered: rows.filter(r => tabOfStatus(r.status) === 'delivered').length });

  /* ===================== who may ===================== */
  /* New shipment · items / ship by / Not required: Admin · KOL Manager · Staff on their deals and on the shipments they made */
  const canEditShip = (user, deal, sh) => !!user && R.can(user, 'shipment.edit') &&
    (user.role !== 'staff' || (!!deal && !!R.picName(user) && deal.pic === R.picName(user)) || (!!sh && !!sh.created_by && sh.created_by === user.user_id));
  /* Create pick list · Mark shipped / delivered · Report problem: Admin · KOL Manager · every Staff (the person packing may not be the PIC) */
  const canShipWork = user => !!user && R.can(user, 'shipment.ship');

  /* ===================== pick lists ===================== */
  /* the items of a set of shipments summed per TR code (TR001 × 24) */
  function itemsSummary(shipments) {
    const m = new Map();
    (shipments || []).forEach(sh => (sh.items || []).forEach(x => m.set(x.tr_code, (m.get(x.tr_code) || 0) + (Number(x.qty) || 1))));
    return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([tr_code, qty]) => ({ tr_code, qty }));
  }
  const pickable = sh => !!sh && ['to_ship', 'problem'].includes(sh.status) && !isISODate(sh.shipped_date) && !sh.pick_list_id;
  const pickListName = today => C.ship.pickDefault(R.dmy(today).slice(0, 5));
  function validatePickList(state, ids, name) {
    const errs = [], list = (ids || []).map(id => (state.sample_shipments || []).find(x => x.shipment_id === id));
    if (!trim(name)) errs.push({ field: 'name', msg: C.msg.pickName });
    if (!list.length) errs.push({ field: 'rows', msg: C.msg.pickNone });
    else if (!list.every(pickable)) errs.push({ field: 'rows', msg: C.msg.pickNotOpen });
    return { errs, warns: [], infos: [] };
  }
  /* a new pick list for these shipments (each in one pick list at most) · o = {id, name, user, now} */
  function newPickList(state, ids, o) {
    const pl = { pick_list_id: o.id, name: trim(o.name), shipment_ids: ids.slice(), created_by: o.user || null, created_at: o.now || null };
    (state.sample_shipments || []).forEach(sh => { if (ids.includes(sh.shipment_id)) sh.pick_list_id = pl.pick_list_id; });
    if (!Array.isArray(state.pick_lists)) state.pick_lists = [];
    state.pick_lists.push(pl);
    return pl;
  }
  const pickListById = (state, id) => (state.pick_lists || []).find(p => p.pick_list_id === id) || null;
  const pickListShipments = (state, pl) => (pl ? pl.shipment_ids.map(id => (state.sample_shipments || []).find(x => x.shipment_id === id)).filter(Boolean) : []);
  /* out of its pick list — until it is shipped */
  const canUnpick = sh => !!sh && !!sh.pick_list_id && sh.status !== 'shipped' && sh.status !== 'delivered' && !isISODate(sh.shipped_date);
  function removeFromPickList(state, sh) {
    if (!canUnpick(sh)) return false;
    const pl = pickListById(state, sh.pick_list_id); if (pl) pl.shipment_ids = pl.shipment_ids.filter(x => x !== sh.shipment_id);
    sh.pick_list_id = null; return true;
  }
  /* tracking nos. pasted from a sheet: one a line, in the order of the rows (blank lines keep their place) */
  const trackingLines = text => { const l = String(text == null ? '' : text).replace(/\r/g, '').split('\n').map(x => trim(x.split('\t')[0])); while (l.length && !l[l.length - 1]) l.pop(); return l; };
  function validateMarkAll(o, n) {
    const errs = [], warns = [];
    if (!isISODate(o.date)) errs.push({ field: 'date', msg: C.msg.dateInvalid(C.samples.col.shipped) });
    if (!trim(o.carrier)) errs.push({ field: 'carrier', msg: C.msg.shipCarrier });
    const t = o.trackings || [];
    if (t.length > n) warns.push({ field: 'tracking', msg: C.msg.shipMoreLines(t.length, n) });
    if (t.filter(Boolean).length < n) warns.push({ field: 'tracking', msg: C.msg.shipNoTracking(n - t.filter(Boolean).length) });
    return { errs, warns, infos: [] };
  }
  /* Mark all shipped: the shipments of the pick list not shipped yet · tracking i = row i · ctx = {eventId(), now, user} → events */
  function markAllShipped(state, pl, o, ctx) {
    const events = [];
    pickListShipments(state, pl).filter(sh => pickable(Object.assign({}, sh, { pick_list_id: null }))).forEach((sh, i) => {
      events.push(R.updateShipment(sh, { kind: 'shipped', date: o.date, carrier: o.carrier, tracking: (o.trackings || [])[i] || '' }, { eventId: ctx.eventId(), now: ctx.now, user: ctx.user }));
      R.pinAddress(state, sh);   // CR-16 §4.3: the address it went to is kept
    });
    return events;
  }

  /* ===================== New shipment ===================== */
  /* d = {purpose, kol_id, deal_id, campaign_id, items [{tr_code, qty}], ship_by, note} */
  function validateNewShipment(state, d) {
    const errs = [], warns = [], M = C.msg;
    if (!PURPOSES.includes(d.purpose)) errs.push({ field: 'purpose', msg: M.shipPurpose });
    if (!d.kol_id || !R.kolById(state, d.kol_id)) errs.push({ field: 'kol_id', msg: M.shipKol });
    const deal = d.deal_id ? state.deals.find(x => x.deal_id === d.deal_id) : null;
    if (d.deal_id && (!deal || deal.kol_id !== d.kol_id)) errs.push({ field: 'deal_id', msg: M.shipDeal });
    if (!isBlank(d.ship_by) && !isISODate(d.ship_by)) errs.push({ field: 'ship_by', msg: M.dateInvalid(C.samples.col.shipBy) });
    if (!isBlank(d.note) && R.looksSensitive(d.note)) errs.push({ field: 'note', msg: M.sensitive });
    if (!(d.items || []).length) warns.push({ field: 'items', msg: C.samples.noProducts });
    return { errs, warns, infos: [] };
  }
  /* o = {id, user, now} → the shipment (To ship) · with a deal: its Campaign · without: source 'other' · CR-23 §3.4: Ship by = the date typed (none → not set) */
  function newManualShipment(state, d, o) {
    const deal = d.deal_id ? state.deals.find(x => x.deal_id === d.deal_id) : null;
    return { shipment_id: o.id, deal_id: deal ? deal.deal_id : null, kol_id: d.kol_id, items: (d.items || []).map(x => ({ tr_code: x.tr_code, qty: Math.max(1, Math.round(Number(x.qty) || 1)) })),
      ship_by: null, ship_by_date: isISODate(d.ship_by) ? d.ship_by : null, status: 'to_ship', ship_by_overridden: false, shipped_date: null, carrier: null, tracking_no: null, delivered_date: null,
      problem_reason: null, not_required_reason: null, source: deal ? 'manual' : 'other', note: trim(d.note) || null, purpose: d.purpose,
      campaign_id: deal ? deal.campaign_id : d.campaign_id || null, pick_list_id: null, address_id: null, created_by: o.user || null, created_at: o.now || null, updated_by: null, updated_at: null };
  }
  /* the products to offer: the deal's, else the Campaign's, else none (any product of the catalog can be added) */
  function shipItemsDefault(state, d) {
    if (d.deal_id) return (state.deal_products || []).filter(x => x.deal_id === d.deal_id).map(x => ({ tr_code: x.tr_code, qty: Number(x.qty) || 1 }));
    if (d.campaign_id) { const list = (state.campaign_products || []).filter(x => x.campaign_id === d.campaign_id); return list.length === 1 ? [{ tr_code: list[0].tr_code, qty: 1 }] : []; }
    return [];
  }
  /* Operations › Shipments to ship (Overdue + Ship this week) for a scope f = {pic, campaign} — with or without a deal */
  function shipmentsToShip(state, f, today) {
    return filterShipRows(state, shipRows(state, today), { campaign: (f || {}).campaign || '', pic: (f || {}).pic || '' }).filter(r => r.status === 'overdue' || r.status === 'this_week');
  }

  return { PURPOSES, SHIP_TABS, TO_SHIP_GROUPS, TRANSIT_SLOW, shipPic, shipRows, filterShipRows, tabOfStatus, toShipGroup, daysInTransit, shipTab, shipCards, tabCounts,
    canEditShip, canShipWork, itemsSummary, pickable, pickListName, validatePickList, newPickList, pickListById, pickListShipments, canUnpick, removeFromPickList, trackingLines,
    validateMarkAll, markAllShipped, validateNewShipment, newManualShipment, shipItemsDefault, shipmentsToShip };
})(KT.rules, KT.content));
