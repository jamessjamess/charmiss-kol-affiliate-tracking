/* rules-profile.js — CR-16: the KOL profile modal (summary line · rate history · posts · the KOL before / after) · more than one payee and
   shipping address for a KOL (each with a default) · profile photos (the checks and the square crop) · schema 15.
   Pure functions; adds to KT.rules (load after rules-fill.js). Nothing here decrypts — the encrypted parts (secure) only move as they are. */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg, { trim, isBlank, isISODate, totalCost } = R;
  const LABEL_MAX = 40;
  const byLabel = (a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'th');

  /* ===================== §4.2 — payees: more than one for a KOL ===================== */
  /* a KOL's payees: the default first, then by label · archived ones only when asked */
  function payeesOfKol(state, kolId, withArchived) {
    return (state.payee_profiles || []).filter(p => p.kol_id && p.kol_id === kolId && (withArchived || !p.archived))
      .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || byLabel(a, b));
  }
  /* the KOL's default payee: the one marked (not archived), else the first not archived */
  function defaultPayee(state, kolId) {
    const list = payeesOfKol(state, kolId);
    return list.find(p => p.is_default) || list[0] || null;
  }
  /* who a deal pays: the payee picked on the deal (one of that KOL's, not archived) · else the KOL's default (§9 #4) */
  function payeeOfDeal(state, deal) {
    if (!deal) return null;
    const own = deal.payee_id ? (state.payee_profiles || []).find(p => p.payee_id === deal.payee_id && p.kol_id === deal.kol_id && !p.archived) : null;
    return own || defaultPayee(state, deal.kol_id);
  }
  /* the label a line / deal shows: only when the payee is not the KOL's default ("Agency ABC") */
  const payeeTag = (state, payee) => (payee && payee.kol_id && !payee.is_default && trim(payee.label) ? trim(payee.label) : '');
  /* where a payee is used: payment lines and deals that picked it */
  const payeeUse = (state, payeeId) => ({ lines: (state.payment_lines || []).filter(l => l.payee_id === payeeId).length, deals: (state.deals || []).filter(d => d.payee_id === payeeId).length });
  /* what its card may do · delete = never used (and not the default while others are there) · archive = not the default · set default = a live one */
  function payeeActions(state, p) {
    const u = payeeUse(state, p.payee_id), others = payeesOfKol(state, p.kol_id).filter(x => x.payee_id !== p.payee_id).length;
    return { used: u.lines + u.deals > 0, canDelete: !u.lines && !u.deals && (!p.is_default || !others), canArchive: !p.archived && !p.is_default,
      canRestore: !!p.archived, canSetDefault: !p.archived && !p.is_default };
  }
  /* the list after one record becomes the default: the only default among the records of its KOL (payees or addresses) */
  function withDefault(list, idKey, id) {
    const rec = list.find(x => x[idKey] === id); if (!rec) return list;
    return list.map(x => (x.kol_id === rec.kol_id ? Object.assign(x, { is_default: x[idKey] === id }) : x));
  }
  /* a label (payee or address): needed · 40 characters at most · no account / ID / phone number · not twice for the same KOL */
  function validateLabel(list, kolId, label, selfId, idKey) {
    const errs = [], v = trim(label);
    if (!v) errs.push({ field: 'label', msg: M.labelRequired });
    else if (v.length > LABEL_MAX) errs.push({ field: 'label', msg: M.labelLong(LABEL_MAX) });
    else if (R.looksSensitive(v) || R.looksLikePhone(v)) errs.push({ field: 'label', msg: M.sensitive });
    else if (list.some(x => x.kol_id === kolId && x[idKey] !== selfId && !x.archived && trim(x.label).toLowerCase() === v.toLowerCase())) errs.push({ field: 'label', msg: M.labelTaken(v) });
    return errs;
  }
  const validatePayeeLabel = (state, kolId, label, payeeId) => validateLabel(state.payee_profiles || [], kolId, label, payeeId, 'payee_id');
  /* the deal_events row of Pay to (§4.2) */
  const payeeEvent = (deal, toId, ctx) => ({ event_id: ctx.eventId, deal_id: deal.deal_id, type: 'payee', from: deal.payee_id || null, to: toId || null,
    changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: null });

  /* a payment line keeps its payee once it is in a run (§4.2: payee_id + payee_version_at_submit) */
  const linePayeeLocked = l => !!(l && (l.run_id || ['in_run', 'submitted', 'paid'].includes(l.status)));
  /* a stored line not in a run follows a new payee: payee_id · payee_type · the tax worked out again by the same rules (the confirmed WHT rate stays) */
  function repointLine(state, l, payee) {
    const t = R.taxOf(state, { agreed_amount: l.agreed_amount, price_basis: l.price_basis, wht_rate: l.wht_rate }, payee);
    Object.assign(l, { payee_id: payee ? payee.payee_id : null, payee_type: payee ? payee.payee_type : l.payee_type, gross: t.gross, vat: t.vat, wht_rate: t.wht_rate, wht: t.wht, net: t.net });
  }
  /* Pay to ▾ (Deal drawer · Payments ⋯ Change payee): '' / null = the KOL's default · one of that KOL's payees (not archived) ·
     the deal's lines not in a run follow · lines in a run keep theirs → { event, lines } | null (nothing changed / not allowed) */
  function setDealPayee(state, deal, toId, ctx) {
    const ok = !toId || (state.payee_profiles || []).some(p => p.payee_id === toId && p.kol_id === deal.kol_id && !p.archived);
    const next = ok ? toId || null : null;
    if (!ok || (deal.payee_id || null) === next) return null;
    const event = payeeEvent(deal, next, ctx);
    deal.payee_id = next;
    const payee = payeeOfDeal(state, deal), lines = (state.payment_lines || []).filter(l => l.deal_id === deal.deal_id && !linePayeeLocked(l) && l.status !== 'cancelled');
    lines.forEach(l => repointLine(state, l, payee));
    return { event, lines: lines.length };
  }
  /* a line outside a deal (Manual): its own payee — another payee of the same KOL, while it is not in a run */
  function setLinePayee(state, l, toId) {
    const p = (state.payee_profiles || []).find(x => x.payee_id === toId && !x.archived);
    if (!p || linePayeeLocked(l) || l.deal_id || (l.kol_id && p.kol_id !== l.kol_id) || l.payee_id === toId) return false;
    repointLine(state, l, p); return true;
  }
  /* the choices of Pay to: the KOL's payees, the default first ("Default · Primary") */
  const payToOptions = (state, kolId) => payeesOfKol(state, kolId).map(p => ({ value: p.payee_id, label: p.is_default ? C.payee.defaultOpt(p.label || 'Primary') : p.label || 'Primary', payee: p }));

  /* ===================== §4.3 — shipping addresses ===================== */
  function addressesOfKol(state, kolId, withArchived) {
    return (state.shipping_addresses || []).filter(a => a.kol_id === kolId && (withArchived || !a.archived))
      .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0) || (a.archived ? 1 : 0) - (b.archived ? 1 : 0) || byLabel(a, b));
  }
  function defaultAddress(state, kolId) { const list = addressesOfKol(state, kolId); return list.find(a => a.is_default) || list[0] || null; }
  const addressById = (state, id) => (id ? (state.shipping_addresses || []).find(a => a.address_id === id) || null : null);
  /* where a shipment goes: the address it names · else the KOL's default (Mark shipped then keeps the one used, §9 #5) */
  function addressOfShipment(state, sh) {
    if (!sh) return null;
    const own = addressById(state, sh.address_id); if (own) return own;
    const deal = sh.deal_id ? state.deals.find(d => d.deal_id === sh.deal_id) : null, kolId = sh.kol_id || (deal && deal.kol_id);
    return kolId ? defaultAddress(state, kolId) : null;
  }
  /* Mark shipped (§9 #5): the shipment keeps the address it went to — the one picked (that KOL's, not archived), else its own, else the default then */
  function pinAddress(state, sh, chosenId) {
    const deal = sh.deal_id ? (state.deals || []).find(d => d.deal_id === sh.deal_id) : null, kolId = sh.kol_id || (deal && deal.kol_id);
    const pick = chosenId ? addressById(state, chosenId) : null;
    const a = pick && pick.kol_id === kolId && !pick.archived ? pick : addressOfShipment(state, sh);
    sh.address_id = a ? a.address_id : null;
    return sh.address_id;
  }
  /* Ship to ▾: the KOL's addresses (not archived), the default first — "Default · Primary" */
  const shipToOptions = (state, kolId) => addressesOfKol(state, kolId).map(a => ({ value: a.address_id, label: a.is_default ? C.samples.defaultOpt(a.label) : a.label, secure: !!a.secure }));
  const addressUse = (state, addressId) => (state.sample_shipments || []).filter(sh => sh.address_id === addressId).length;
  function addressActions(state, a) {
    const used = addressUse(state, a.address_id) > 0, others = addressesOfKol(state, a.kol_id).filter(x => x.address_id !== a.address_id).length;
    return { used, canDelete: !used && (!a.is_default || !others), canArchive: !a.archived && !a.is_default, canRestore: !!a.archived, canSetDefault: !a.archived && !a.is_default };
  }
  const validateAddressLabel = (state, kolId, label, addressId) => validateLabel(state.shipping_addresses || [], kolId, label, addressId, 'address_id');
  /* the encrypted part: who receives it · their phone · the address — recipient and address are needed */
  function validateShip(d) {
    const errs = [];
    if (isBlank(d.recipient)) errs.push({ field: 'recipient', msg: M.shipRecipient });
    if (isBlank(d.address)) errs.push({ field: 'address', msg: M.shipAddress });
    return errs;
  }
  const shipRecord = d => ({ recipient: trim(d.recipient) || null, phone: trim(d.phone) || null, address: trim(d.address) || null });
  /* a decrypted record of any age → { recipient, phone, address } (CR-10 wrote ship_name · ship_phone · ship_address) */
  const readShip = rec => (!rec ? null : { recipient: rec.recipient || rec.ship_name || null, phone: rec.phone || rec.ship_phone || null, address: rec.address || rec.ship_address || null });
  /* a new address record (its secure comes from KT.vault.encrypt) */
  const newAddress = (o) => ({ address_id: o.address_id, kol_id: o.kol_id, label: trim(o.label), is_default: !!o.is_default, archived: false, secure: o.secure || null,
    details_updated_at: o.now || null, details_updated_by: o.user || null, created_at: o.now || null, created_by: o.user || null });

  /* ===================== §4.1 — the profile ===================== */
  /* the line under the header: Deals · Committed (every deal not cancelled — as History counts it) · Last worked · Last campaign · On-time · Latest rate */
  function kolSummary(state, kolId, today) {
    const deals = R.dealsOfKol(state, kolId), committed = deals.filter(d => !R.isCancelled(d)).reduce((a, d) => a + totalCost(d), 0);
    const last = R.lastWorkedInfo(state, kolId), ref = R.costReference(state, kolId);
    return { deals: deals.length, committed, last: last ? last.date : null, lastCampaign: last ? R.campaignName(state, last.campaignId) || null : null,
      perf: R.kolPerformance(state, kolId, today), latestRate: ref.latest ? ref.latest.total : null, averageRate: ref.average ? ref.average.total : null };
  }
  /* the day a deal's price was agreed: its move into Confirm QT (or the first log after it) · else its Brief date */
  function agreedDate(state, d) {
    const L = state.lookups, qt = R.stepOf(L, 'Confirm QT'), logs = R.logsOf(state, d.deal_id);
    const at = logs.find(l => { const st = R.stepOf(L, l.sub_status); return st && qt && !R.isCancelStep(st) && st.sort_order >= qt.sort_order && l.effective_date; });
    return (at && at.effective_date) || d.brief_date || null;
  }
  /* Rates › Rate history: what was quoted (rate quotes) and what was agreed in a deal (Campaign · ฿ · stage) in one list, newest first ·
     free jobs, cancelled / shortlisted deals and quotes without a price (฿0 rows of the old files) are not prices (CR-07) */
  function rateHistory(state, kolId) {
    const quoted = R.quotesOfKol(state, kolId).filter(q => totalCost(q) > 0).map(q => ({ kind: 'quoted', id: q.quote_id, date: q.quoted_at || null, total: totalCost(q), source: q.source || '', note: q.note || '', account_id: q.account_id || null }));
    const agreed = R.dealsOfKol(state, kolId).filter(d => !R.isCancelled(d) && !R.isShortlist(state.lookups, d) && R.termOf(d) !== 'free' && totalCost(d) > 0)
      .map(d => ({ kind: 'agreed', id: d.deal_id, date: agreedDate(state, d), total: totalCost(d), campaign: R.campaignName(state, d.campaign_id) || '', stage: R.stageLabel(state.lookups, d), deal: d }));
    return quoted.concat(agreed).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (a.kind === b.kind ? String(b.id).localeCompare(String(a.id)) : a.kind === 'agreed' ? -1 : 1));
  }
  /* Performance › the posts of the KOL's deals (not cancelled): Campaign · platform · post date · views · ER · link — newest first, not posted last */
  function kolPosts(state, kolId) {
    const deals = new Map(R.dealsOfKol(state, kolId).filter(d => !R.isCancelled(d)).map(d => [d.deal_id, d])), accs = new Map((state.kol_accounts || []).map(a => [a.account_id, a]));
    return (state.deal_posts || []).filter(p => deals.has(p.deal_id)).map(p => {
      const d = deals.get(p.deal_id), v = Number(p.views) || 0, eng = ['likes', 'comments', 'saves', 'shares'].reduce((a, k) => a + (Number(p[k]) || 0), 0);
      return { post: p, deal: d, campaign: R.campaignName(state, d.campaign_id) || '', platform: (accs.get(p.account_id) || {}).platform || p.platform || '', date: p.post_date || null,
        expected: p.expected_post_date || null, views: v || null, er: v ? eng / v : null, link: p.post_link || null };
    }).sort((a, b) => (b.date ? 1 : 0) - (a.date ? 1 : 0) || String(b.date || b.expected || '').localeCompare(String(a.date || a.expected || '')));
  }
  /* Deals & history: All · Open · Posted · Cancelled */
  const HISTORY_FILTERS = ['all', 'open', 'posted', 'cancelled'];
  const inHistory = (d, f) => f === 'open' ? R.isOpenDeal(d) : f === 'posted' ? d.status === 'Complete' : f === 'cancelled' ? d.status === 'Cancel' : true;
  /* ‹ › and ↑ ↓: the KOL before / after in the table as it is filtered and sorted (null at either end) */
  function kolNav(ids, id, dir) {
    const i = ids.indexOf(id); if (i < 0) return null;
    const j = i + (dir < 0 ? -1 : 1);
    return j >= 0 && j < ids.length ? ids[j] : null;
  }
  const PROFILE_TABS = ['overview', 'deals', 'performance', 'rates', 'payee'];
  /* #kols/K0011/rates → { id, tab } (a tab it does not know → Overview) */
  function profileRoute(text) {
    const [id, tab] = String(text || '').split('/');
    return { id: id || null, tab: PROFILE_TABS.includes(tab) ? tab : 'overview' };
  }

  /* ===================== §4.4 — profile photos ===================== */
  const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024, PHOTO_SIZE = 256, PHOTO_QUALITY = 0.8;
  /* a picked file → 'type' (not JPG / PNG / WebP) · 'size' (over 5 MB) · null */
  const photoProblem = f => (!f || !PHOTO_TYPES.includes(String(f.type || '').toLowerCase()) ? 'type' : Number(f.size) > PHOTO_MAX_BYTES ? 'size' : null);
  /* the square taken from a w × h picture: the short side (÷ zoom ≥ 1), moved by pan (−1 … 1 of the room left on each axis), kept inside */
  function cropSquare(w, h, panX, panY, zoom) {
    const side = Math.min(w, h) / Math.max(1, Number(zoom) || 1), roomX = (w - side) / 2, roomY = (h - side) / 2;
    const clamp = v => Math.max(-1, Math.min(1, Number(v) || 0));
    return { sx: Math.round(roomX + clamp(panX) * roomX), sy: Math.round(roomY + clamp(panY) * roomY), side: Math.round(side) };
  }
  /* "Photos 12 · 0.3 MB" */
  const photoTotals = metas => ({ n: metas.length, bytes: metas.reduce((a, m) => a + (Number(m && m.bytes) || 0), 0) });

  /* ===================== §3 — schema 15 ===================== */
  /* every payee: a label ("Primary"), the default of its KOL (one each), not archived · the shipping details CR-10 kept inside a payee
     (secure_ship — encrypted on its own) become that KOL's first shipping address as they are (nothing is decrypted, so no Unlock is needed) ·
     deals.payee_id · sample_shipments.address_id · kol_master.photo = null · runs twice → the same */
  function migrateV15(obj) {
    const payees = obj.payee_profiles = obj.payee_profiles || [], addrs = obj.shipping_addresses = Array.isArray(obj.shipping_addresses) ? obj.shipping_addresses : [];
    const seenDefault = new Set();
    payees.forEach(p => {
      if (p.label == null) p.label = 'Primary';
      if (p.archived == null) p.archived = false;
      const k = p.kol_id || ('~' + p.payee_id);
      p.is_default = !p.archived && (p.is_default === undefined ? !seenDefault.has(k) : !!p.is_default && !seenDefault.has(k));
      if (p.is_default) seenDefault.add(k);
    });
    let n = addrs.reduce((m, a) => Math.max(m, parseInt(String(a.address_id).replace(/\D/g, ''), 10) || 0), 0);
    payees.forEach(p => {
      if (!p.kol_id || !p.secure_ship) return;
      const first = !addrs.some(a => a.kol_id === p.kol_id);
      n++; addrs.push({ address_id: 'AD-' + String(n).padStart(4, '0'), kol_id: p.kol_id, label: 'Primary', is_default: first, archived: false, secure: p.secure_ship,
        details_updated_at: p.updated_at || null, details_updated_by: p.updated_by || null, created_at: p.created_at || null, created_by: p.created_by || null });
      delete p.secure_ship; delete p.shipping_on_file;
    });
    (obj.deals || []).forEach(d => { if (d.payee_id === undefined) d.payee_id = null; });
    (obj.sample_shipments || []).forEach(sh => { if (sh.address_id === undefined) sh.address_id = null; });
    (obj.kol_master || []).forEach(k => { if (k.photo === undefined) k.photo = null; });
    obj.schema_version = 15;
    return obj;
  }

  return { PAYEE_LABEL_MAX: LABEL_MAX, payeesOfKol, defaultPayee, payeeOfDeal, payeeTag, payeeUse, payeeActions, withDefault, validatePayeeLabel, payeeEvent,
    linePayeeLocked, setDealPayee, setLinePayee, payToOptions,
    addressesOfKol, defaultAddress, addressById, addressOfShipment, pinAddress, shipToOptions, addressUse, addressActions, validateAddressLabel, validateShip, shipRecord, readShip, newAddress,
    kolSummary, agreedDate, rateHistory, kolPosts, HISTORY_FILTERS, inHistory, kolNav, PROFILE_TABS, profileRoute,
    PHOTO_TYPES, PHOTO_MAX_BYTES, PHOTO_SIZE, PHOTO_QUALITY, photoProblem, cropSquare, photoTotals, migrateV15 };
})(KT.rules, KT.content));
