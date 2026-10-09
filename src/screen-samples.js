/* screen-samples.js — CR-10 §4.14 shipments on screen, shared: the Deal drawer's Shipments section (+ Add shipment · ⋯ actions · shipping
   details on file · Open in Shipments), the Journey's Shipment track, the action dialogs (Mark shipped / delivered · Set ship-by · Not required ·
   Problem · Edit) used by the drawer and by Shipments. CR-16 §4.3: the shipping details are the KOL's shipping addresses (shipping_addresses,
   encrypted — never in plain text) · Ship to ▾ on Mark shipped / Edit (blank = the default when it is marked shipped).
   CR-17 §4.3 — Simple mode: Shipped / Delivered are buttons on the row (a small form: date · carrier · tracking, none needed) · Shipped & delivered ·
   Undo delivered · Change address · the dialogs above stay for Full mode. CR-11 §4.10: Deals › Samples became the Shipments page (screen-shipments.js) · who may: items / ship by / Not required = the
   deal's PIC or whoever made the shipment (R.canEditShip) · shipped / delivered / problem = every Staff (R.canShipWork). → KT.samples */
KT.samples = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, today, store, commit, toast, openDialog, closeDialog, optionsHTML, userId, checksHTML } = U;
  const SM = C.samples;
  const CLS = { overdue: 'err', this_week: 'warn', to_ship: 'muted', shipped: 'progress', delivered: 'done', problem: 'cancel', not_required: 'outline' };
  const chip = st => `<span class="st sm-${st} ${CLS[st] || ''}">${esc(SM.status[st])}</span>`;
  const ctxOf = () => ({ now: new Date().toISOString(), user: userId(), eventId: store.newEventId() });
  const settings = () => R.sampleSettings(state().lookups);
  const dealOf = id => state().deals.find(d => d.deal_id === id);
  const shOf = id => (state().sample_shipments || []).find(x => x.shipment_id === id);
  const kolName = d => (R.kolById(state(), d.kol_id) || {}).display_name || d.kol_id;
  const shKol = sh => kolName(dealOf(sh.deal_id) || { kol_id: sh.kol_id });
  /* CR-16 §4.3 — the KOL's default shipping address (encrypted · "on file") */
  const defAddr = kolId => R.defaultAddress(state(), kolId);
  const onFile = kolId => { const a = defAddr(kolId); return !!(a && a.secure); };
  const kolIdOf = sh => sh.kol_id || (dealOf(sh.deal_id) || {}).kol_id || null;
  /* Ship to ▾ — the KOL's addresses (the default first) · '' = the default when it is marked shipped */
  /* CR-31 §2.3 — o.allowNew: + New address (the in-place form under it, KT.payee.addrInline*) */
  const shipToHTML = (id, kolId, value, blank, o = {}) => { const opts = R.shipToOptions(state(), kolId), canNew = !!o.allowNew;
    return `<select id="${id}" aria-label="${esc(SM.shipTo)}"${opts.length || canNew ? '' : ' disabled'}${canNew ? ' data-ainew' : ''}>${blank ? `<option value="">${esc(SM.shipToDefault)}</option>` : ''}` +
      opts.map(o2 => `<option value="${esc(o2.value)}"${o2.value === value ? ' selected' : ''}>${esc(o2.secure ? o2.label : SM.noDetails(o2.label))}</option>`).join('') +
      (opts.length || !blank && canNew ? '' : `<option value="">${esc(SM.noAddress)}</option>`) + (canNew ? `<option value="__new">${esc(C.move.newAddress)}</option>` : '') + `</select>` +
      (canNew ? `<div class="ai-slot" data-aislot="${id}"></div>` : ''); };
  /* the in-place form follows the pick · Unlock to add · on save: the new address (encrypted) or null when it is not complete (the errors shown) */
  function wireNewAddr(box, selId, kolId) {
    const sel = box.querySelector('#' + selId), slot = box.querySelector(`[data-aislot="${selId}"]`); if (!sel || !slot) return;
    const draw = () => { slot.innerHTML = sel.value === '__new' ? KT.payee.addrInlineHTML(selId, {}, { inlinePass: true }) + '<div class="mv-err" data-err="ai_box"></div>' : ''; };
    const unlock = async () => { if (await KT.payee.addrInlineUnlock(slot)) { draw(); const f = slot.querySelector('[data-ai="label"]'); if (f) f.focus(); } };
    sel.addEventListener('change', draw);
    slot.addEventListener('click', e => { if (e.target.closest('[data-aiunlockgo]')) unlock(); });
    slot.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('[data-aipass]')) { e.preventDefault(); e.stopPropagation(); unlock(); } });
    draw();
  }
  async function newAddrOf(box, selId, kolId) {
    const sel = box.querySelector('#' + selId); if (!sel || sel.value !== '__new') return { id: sel ? sel.value || null : null };
    const x = KT.payee.addrInlineRead(box), errs = KT.payee.addrInlineCheck(kolId, x);
    box.querySelectorAll('[data-err^="ai_"]').forEach(el => { const e = errs.find(y => y.field === el.dataset.err); el.innerHTML = e ? `<span class="err">${esc(e.msg)}</span>` : ''; });
    if (errs.length) return { errs };
    try { const rec = await KT.payee.addrInlineSave(kolId, x); return { id: rec.address_id }; } catch (e) { toast(C.payee.noCrypto); return { errs: [{}] }; }
  }
  /* the address a shipment goes to (its own, else the default) — its label */
  const addrLabel = sh => { const a = R.addressOfShipment(state(), sh); return a ? a.label : ''; };
  /* CR-11 §4.10 — what changes the plan (items · ship by · Not required · delete) vs the work of sending (shipped · delivered · problem · carrier / tracking) */
  const EDIT_KINDS = ['ship_by', 'not_required', 'items', 'delete'];
  const canEditSh = sh => R.canEditShip(U.actor(), dealOf(sh.deal_id), sh);
  const allowed = (kind, sh) => (EDIT_KINDS.includes(kind) ? canEditSh(sh) : R.canShipWork(U.actor()));
  const trackCell = sh => { const url = R.trackingLink(settings(), sh.carrier, sh.tracking_no); return !sh.tracking_no ? '' : url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(sh.tracking_no)} ↗</a>` : esc(sh.tracking_no); };
  /* "Test 1 ×1, Test 2 ×2" — the product names (CR-23 §3.8 #4: not the TR codes) */
  const itemNames = list => (list || []).map(x => { const p = R.productByCode(state(), x.tr_code); return `${p ? R.productShort(p) : x.tr_code} ×${x.qty}`; }).join(', ');
  /* no products: a warning only while the sample is still to ship (a delivered legacy row just shows —) */
  const items = sh => (sh.items && sh.items.length ? esc(itemNames(sh.items)) : sh.status === 'to_ship' ? `<span class="chip warn-chip">${esc(SM.noProducts)}</span>` : '<span class="muted">—</span>');
  /* CR-23 §3.4 — the Ship by cell: the date set · "Ship by not set" (grey) + Set while it is still to ship / to buy */
  const shipByCell = (sh, st) => { const due = R.shipByDate(sh);
    if (due) return `<span class="${st === 'overdue' ? 'late' : ''}">${esc(R.dmy(due))}</span>`;
    if (sh.status !== 'to_ship') return '—';   // (KOL buys own: Buy by is optional)
    return `<span class="muted">${esc(SM.shipByNotSet)}</span>${allowed('ship_by', sh) ? ` <button type="button" class="link small" data-smact="ship_by" data-sm="${esc(sh.shipment_id)}">${esc(SM.setShort)}</button>` : ''}`; };

  /* ---------- the Journey's sample track (under the payment track) — CR-23 §3.8 #4: the same one line as everywhere (summaryText) ---------- */
  function trackHTML(d) {
    const list = R.shipmentsOf(state(), d.deal_id), sh = list.filter(x => x.status !== 'not_required').pop() || list[list.length - 1]; if (!sh) return '';
    const st = R.sampleStatus(sh, today()), cls = st === 'overdue' ? 'late' : st === 'this_week' ? 'warn' : ['shipped', 'delivered', 'purchased'].includes(st) ? 'done' : '';
    return `<div class="smtrack"><span class="smt-l">${esc(SM.trackL)}</span><span class="smt ${cls}">${esc(summaryText(sh))}</span></div>`;
  }
  /* ---------- the Deal drawer's Samples section ---------- */
  function sectionHTML(d) {
    const list = R.shipmentsOf(state(), d.deal_id), ok = R.canEditShip(U.actor(), d, null), td = today();
    const da = defAddr(d.kol_id), canA = R.canEditPayee(state(), U.actor(), null, R.kolById(state(), d.kol_id)), open = canA && addrOpen.has(d.deal_id);
    /* CR-32 §2.1 — No address · Add address: the form here (Unlock to add while the vault is locked) · Open in KOL Master (Payee & shipping, ‹ Back to the deal) */
    const vs = KT.payee.nkVaultState();
    const form = open ? `<div class="sm-ai" data-smai="${esc(d.deal_id)}">${KT.payee.addrInlineHTML('sm' + d.deal_id, {})}<div class="mv-err" data-err="ai_box"></div>` +
      `<div class="btns sm-aibtns"><button type="button" class="btn small" data-smaicancel="${esc(d.deal_id)}">${esc(C.common.cancel)}</button>${vs === 'open' ? `<button type="button" class="btn small primary" data-smaisave="${esc(d.deal_id)}">${esc(SM.addAddressIn)}</button>` : ''}</div></div>` : '';
    const addr = `<div class="sm-addr"><span class="muted small">${esc(SM.shipToDefaultL)}:</span> ${da ? `<b>${esc(da.label)}</b> ` : ''}${onFile(d.kol_id) ? `<span class="chip ok-chip">${esc(SM.addressOnFile)}</span>` : `<span class="chip">${esc(SM.noAddress)}</span>`}` +
      (canA ? (da ? ` <button type="button" class="link" data-smship="${esc(d.kol_id)}">${esc(SM.shippingDetails)}</button>` : open ? '' : ` <button type="button" class="link" data-smaddin="${esc(d.deal_id)}">${esc(SM.addAddressIn)}</button>`) : '') +
      (d.kol_id ? ` · <button type="button" class="link small" data-smkm="${esc(d.kol_id)}" data-deal="${esc(d.deal_id)}">${esc(SM.openInKm)}</button>` : '') +
      (onFile(d.kol_id) && KT.vault.isUnlocked(state().lookups.payee_vault) && U.can('payee.unlock') ? `<div class="sm-shipsecure" data-smsecure="${esc(d.kol_id)}"><span class="muted small">…</span></div>` : '') + form + `</div>`;
    const rows = list.map(sh => { const st = R.sampleStatus(sh, td), old = R.isLegacyDelivered(sh);
      /* CR-11 §4.6 — delivered from the old files: read only, "—" with the reason on hover */
      if (old) return legacyRow(sh, st);
      const mi = (k, l, cls) => (allowed(k, sh) ? `<button type="button" class="mi${cls ? ' ' + cls : ''}" data-smact="${k}" data-sm="${esc(sh.shipment_id)}">${esc(l)}</button>` : '');
      const simp = simple(), qbtn = simp ? quickBtnHTML(sh, st) : '';
      const menu = simp ? simpleMenuItems(sh, st, mi) : [mi('edit', SM.edit),
        !['shipped', 'delivered', 'not_required'].includes(sh.status) ? mi('shipped', SM.markShipped) : '',
        sh.status !== 'delivered' && sh.status !== 'not_required' ? mi('delivered', SM.markDelivered) : '',
        sh.status !== 'delivered' && sh.status !== 'not_required' ? mi('problem', SM.reportProblem) : '',
        sh.status === 'to_ship' ? mi('ship_by', SM.setShipBy) : '', sh.status === 'to_ship' ? mi('items', SM.editItems) : '',
        sh.status === 'to_ship' ? mi('not_required', SM.notRequired) : '',
        sh.source !== 'auto' && sh.source !== 'legacy' && sh.status === 'to_ship' ? mi('delete', SM.del, 'danger') : ''].join('');
      const shipBy = shipByCell(sh, st);
      const to = addrLabel(sh);
      return `<tr data-smrow="${esc(sh.shipment_id)}"><td>${items(sh)}${to ? `<div class="muted small" title="${esc(SM.shipTo)}">📍 ${esc(to)}</div>` : ''}</td><td class="nowrap">${shipBy}</td><td>${chip(st)}${sh.problem_reason && st === 'problem' ? ` <span class="muted small">${esc(sh.problem_reason)}</span>` : ''}${st === 'not_required' && sh.not_required_reason ? ` <span class="muted small">${esc(sh.not_required_reason)}</span>` : ''}</td>` +
        `<td>${esc(sh.carrier || '')}</td><td>${trackCell(sh)}</td><td class="nowrap">${sh.shipped_date ? esc(R.dmy(sh.shipped_date)) : '—'}</td><td class="nowrap">${sh.delivered_date ? esc(R.dmy(sh.delivered_date)) : sh.status === 'delivered' ? `<span class="muted small">${esc(SM.dateNotRecorded)}</span>` : '—'}</td>` +
        `<td class="sm-act">${qbtn}${menu ? `<details class="menu"><summary class="icon-btn" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right">${menu}</div></details>` : ''}</td></tr>`; }).join('');
    const C2 = SM.col;
    return `<section class="sec smsec"><div class="sec-h"><span>${esc(SM.sec)}</span><span class="spacer"></span><button type="button" class="link small" data-smopen="${esc(d.deal_id)}">${esc(SM.openIn)}</button>` +
      `${ok ? `<button type="button" class="btn small" data-smadd="${esc(d.deal_id)}">+ ${esc(SM.addShipment)}</button>` : ''}</div>` +
      (list.length ? `<div class="tablewrap"><table class="tbl compact-sm smtbl"><thead><tr><th>${esc(C2.items)}</th><th>${esc(C2.shipBy)}</th><th>${esc(C2.status)}</th><th>${esc(C2.carrier)}</th><th>${esc(C2.tracking)}</th><th>${esc(C2.shipped)}</th><th>${esc(C2.delivered)}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="hint">${esc(SM.noShipments)}</div>`) + addr + `</section>`;
  }
  /* CR-11 §4.6 — a Delivered shipment from the old files: text only (no ⋯ / inputs) · empty = "—" (not "Date not recorded") */
  const dash = v => (v ? esc(v) : `<span class="muted" title="${esc(C.golive.imported)}">${esc(C.common.none)}</span>`);
  function legacyRow(sh, st) {
    return `<tr data-smrow="${esc(sh.shipment_id)}" class="sm-legacy" title="${esc(C.golive.imported)}"><td>${items(sh)}</td><td class="nowrap">${R.shipByDate(sh) ? esc(R.dmy(R.shipByDate(sh))) : dash('')}</td><td>${chip(st)}</td>` +
      `<td>${dash(sh.carrier)}</td><td>${sh.tracking_no ? trackCell(sh) : dash('')}</td><td class="nowrap">${dash(sh.shipped_date && R.dmy(sh.shipped_date))}</td><td class="nowrap">${dash(sh.delivered_date && R.dmy(sh.delivered_date))}</td><td></td></tr>`;
  }
  /* after the drawer / profile is drawn: the shipping addresses, decrypted in memory while the vault is open ·
     data-smsecure = a KOL (its default) · data-addrsecure = one address */
  async function fillSecure(root) {
    if (!root) return;
    for (const box of [...root.querySelectorAll('[data-smsecure],[data-addrsecure]')]) {
      const a = box.dataset.addrsecure ? R.addressById(state(), box.dataset.addrsecure) : defAddr(box.dataset.smsecure);
      const rec = a && a.secure ? R.readShip(await KT.vault.decrypt(a.secure)) : null;
      if (!box.isConnected) continue;
      box.innerHTML = rec ? [rec.recipient, rec.phone, rec.address].filter(Boolean).map(esc).join(' · ') : '';
    }
  }
  /* ===================== CR-17 §4.3 — Simple mode ===================== */
  const simple = () => R.isSimple(state(), 'shipments');
  const kolIdOfSh = sh => sh.kol_id || (dealOf(sh.deal_id) || {}).kol_id || null;
  /* the button on the row: To ship → Shipped · in transit → Delivered (for those who do the sending) */
  function quickBtnHTML(sh, st) {
    if (R.isLegacyDelivered(sh) || !R.canShipWork(U.actor())) return '';
    if (st === 'kol_purchase') return `<button type="button" class="btn small primary sm-qbtn" data-smpurchase="${esc(sh.shipment_id)}">${esc(SM.markPurchased)}</button>`;   // CR-22: KOL buys own
    if (['overdue', 'this_week', 'to_ship', 'problem'].includes(st)) return `<button type="button" class="btn small primary sm-qbtn" data-smquick="shipped" data-sm="${esc(sh.shipment_id)}">${esc(SM.quick.shipped)}</button>`;
    if (st === 'shipped') return `<button type="button" class="btn small primary sm-qbtn" data-smquick="delivered" data-sm="${esc(sh.shipment_id)}">${esc(SM.quick.delivered)}</button>`;
    return '';
  }
  /* ⋯ in Simple mode: To ship → Shipped & delivered · Set ship-by · Not required · Change address · in transit → Report problem · Edit tracking · Delivered → Undo delivered */
  function simpleMenuItems(sh, st, mi) {
    const work = R.canShipWork(U.actor()), q = (k, l) => (work ? `<button type="button" class="mi" data-smquick="${k}" data-sm="${esc(sh.shipment_id)}">${esc(l)}</button>` : '');
    if (['overdue', 'this_week', 'to_ship', 'problem'].includes(st)) return [q('both', SM.quick.both), mi('ship_by', SM.setShipBy), mi('not_required', SM.notRequired), mi('items', SM.editItems),
      work ? `<button type="button" class="mi" data-smaddr="${esc(sh.shipment_id)}">${esc(SM.quick.changeAddress)}</button>` : '', st !== 'problem' ? mi('problem', SM.reportProblem) : '',
      sh.source !== 'auto' && sh.source !== 'legacy' && sh.status === 'to_ship' ? mi('delete', SM.del, 'danger') : ''].join('');
    if (st === 'shipped') return [mi('problem', SM.reportProblem), mi('edit', SM.quick.editTracking)].join('');
    if (st === 'delivered' && !R.isLegacyDelivered(sh)) return work ? `<button type="button" class="mi" data-smundo="${esc(sh.shipment_id)}">${esc(SM.quick.undoDelivered)}</button>` : '';
    if (st === 'kol_purchase') return [mi('items', SM.editItems), mi('not_required', SM.notRequired)].join('');
    if (st === 'purchased') return work ? `<button type="button" class="mi" data-smunpurchase="${esc(sh.shipment_id)}">${esc(SM.unmarkPurchased)}</button>` : '';
    return '';
  }
  /* CR-22 §3.3 — KOL buys own: Mark purchased (today) · Undo purchased */
  function purchase(id, back, after) {
    const s = state(), sh = shOf(id); if (!sh || !U.guard('shipment.ship')) return;
    s.deal_events.push(R.updateShipment(sh, back ? { kind: 'unpurchased' } : { kind: 'purchased', date: today() }, { eventId: store.newEventId(), now: new Date().toISOString(), user: userId() }));
    commit(back ? SM.quick.undone : SM.purchasedDone(shKol(sh))); if (after) after();
  }
  /* "NPD · Test 1 ×1 · Ship by 12/10" — a shipment in one line, the same everywhere (CR-23 §3.8 #4: Move stage · Deal modal › Next · the Journey's
     track): To ship → Ship by dd/mm (or Ship by not set) · KOL purchase → Buy by dd/mm · Shipped / Delivered / Purchased dd/mm · else the status */
  function summaryText(sh) {
    if (!sh) return '';
    const s = state(), st = R.sampleStatus(sh, today()), due = R.shipByDate(sh), dm = x => R.dmy(x).slice(0, 5);
    const when = ['overdue', 'this_week', 'to_ship'].includes(st) ? (due ? SM.shipByOn(dm(due)) : SM.shipByNotSet) : st === 'kol_purchase' ? (due ? SM.buyByOn(dm(due)) : SM.status.kol_purchase)
      : st === 'shipped' && sh.shipped_date ? SM.shippedLine(dm(sh.shipped_date)) : st === 'delivered' && sh.delivered_date ? SM.deliveredLine(dm(sh.delivered_date)) : st === 'purchased' && sh.purchased_date ? SM.purchasedOn2(dm(sh.purchased_date)) : SM.status[st] || sh.status;
    return SM.summary(R.shipMethodLabel(s.lookups, sh.method || 'warehouse'), itemNames(sh.items), when);
  }
  const quickCtx = () => { let e = 0; const base = store.newEventId(); return { eventId: () => base + e++, now: new Date().toISOString(), user: userId() }; };
  /* Shipped · Shipped & delivered · Delivered: a small form next to the button (today · the carrier last used by this person · tracking for one) */
  function quick(kind, ids, anchor, after) {
    const list = ids.map(shOf).filter(Boolean).filter(sh => !R.isLegacyDelivered(sh));
    if (!list.length || !U.guard('shipment.ship')) return;
    const one = list.length === 1, S = settings(), carrierKey = 'shipcarrier_' + (userId() || ''), last = U.pref.get(carrierKey, '');
    const title = { shipped: one ? SM.quick.shippedOne(shKol(list[0])) : SM.quick.shippedN(list.length), both: one ? SM.quick.bothOne(shKol(list[0])) : SM.quick.bothN(list.length),
      delivered: one ? SM.quick.deliveredOne(shKol(list[0])) : SM.quick.deliveredN(list.length) }[kind];
    const ship = kind !== 'delivered';
    U.popForm(anchor, { title, ok: SM.quick.confirm, focus: ship && one ? '#qs_trk' : null,
      body: `<div class="field"><label for="qs_date">${esc(kind === 'delivered' ? SM.deliveredOn : SM.shippedOn)}</label>${U.dateHTML('id="qs_date"', today(), { label: kind === 'delivered' ? SM.deliveredOn : SM.shippedOn })}</div>` +
        (ship ? `<div class="field"><label for="qs_carrier">${esc(SM.col.carrier)} <span class="muted small">${esc(SM.quick.optional)}</span></label><select id="qs_carrier">${optionsHTML(S.carriers.concat(last && !S.carriers.includes(last) ? [last] : []), last, C.common.none)}</select></div>` +
          (one ? `<div class="field"><label for="qs_trk">${esc(SM.col.tracking)} <span class="muted small">${esc(SM.quick.optional)}</span></label><input id="qs_trk" autocomplete="off" value="${esc(list[0].tracking_no || '')}"></div>` : '') : '') +
        (ship && one && kolIdOfSh(list[0]) && !R.addressOfShipment(state(), list[0]) ? `<div class="hint"><span class="chip">${esc(SM.noAddress)}</span> ${esc(SM.quick.noAddressOk)}</div>` : ''),
      onOk: m => {
        const date = m.querySelector('#qs_date').value; if (!R.isISODate(date)) { U.popFormError(m, C.msg.dateInvalid(kind === 'delivered' ? SM.deliveredOn : SM.shippedOn)); return false; }
        const carrier = ship ? m.querySelector('#qs_carrier').value : '', tracking = ship && one ? R.trim(m.querySelector('#qs_trk').value) : '';
        if (ship && carrier) U.pref.set(carrierKey, carrier);
        const s = state(), ctx = quickCtx(), before = [], evIds = new Set(); let n = 0;
        ids.forEach(id => { const sh = (s.sample_shipments || []).find(x => x.shipment_id === id); if (!sh || !allowed(kind === 'delivered' ? 'delivered' : 'shipped', sh)) return;
          const was = JSON.parse(JSON.stringify(sh)), evs = R.shipQuick(s, sh, kind, { date, carrier, tracking }, ctx); if (evs) { s.deal_events.push(...evs); evs.forEach(e => evIds.add(e.event_id)); before.push(was); n++; } });
        if (n) {
          commit(); if (after) after();
          /* CR-24 §4.3 — Undo puts the shipments (and their events) back */
          U.toastAction(SM.quick.done(n, kind), C.deal.undo, () => { const s2 = state();
            before.forEach(o => { const i = (s2.sample_shipments || []).findIndex(x => x.shipment_id === o.shipment_id); if (i >= 0) s2.sample_shipments[i] = o; });
            s2.deal_events = s2.deal_events.filter(e => !evIds.has(e.event_id)); commit(SM.quick.undone); if (after) after(); }, 10000);
        } else if (after) after();
        return true;
      } });
  }
  function undoDeliver(id, after) {
    const s = state(), sh = shOf(id); if (!sh || !U.guard('shipment.ship')) return;
    const evs = R.undoDelivered(sh, quickCtx()); if (!evs) return;
    s.deal_events.push(...evs); commit(SM.quick.undone); if (after) after();
  }
  /* ⋯ Change address: Ship to ▾ of the KOL (blank = the default when it is shipped) */
  function changeAddress(id, anchor, after) {
    const sh = shOf(id), kolId = sh && kolIdOfSh(sh); if (!sh || !kolId || !U.guard('shipment.ship')) return;
    U.popForm(anchor, { title: SM.quick.changeAddress, ok: C.common.save, focus: '#qs_addr',
      body: `<div class="field"><label for="qs_addr">${esc(SM.shipTo)}</label>${shipToHTML('qs_addr', kolId, sh.address_id || '', true)}</div>`,
      onOk: m => { const v = m.querySelector('#qs_addr').value || null, s = state(), x = shOf(id); if (!x) return true;
        s.deal_events.push(R.updateShipment(x, { kind: 'edit', address_id: v }, { eventId: store.newEventId(), now: new Date().toISOString(), user: userId() })); commit(SM.done(1)); if (after) after(); return true; } });
  }

  /* CR-32 §2.1 — the deals with the Add address form open (Deal modal › Shipments) */
  const addrOpen = new Set();
  /* Add address › Save: checked · encrypted (the KOL's address, default when ticked or the first) · "Use for n open shipments?" (still to ship, no address of their own) */
  async function saveAddrHere(dealId, after) {
    const d = dealOf(dealId), box = document.querySelector(`[data-smai="${CSS.escape(dealId)}"]`); if (!d || !box) return;
    const x = KT.payee.addrInlineRead(box), errs = KT.payee.addrInlineCheck(d.kol_id, x);
    box.querySelectorAll('[data-err^="ai_"]').forEach(el => { const er = errs.find(y => y.field === el.dataset.err); el.innerHTML = er ? `<span class="err">${esc(er.msg)}</span>` : ''; });
    box.querySelectorAll('[data-ai]').forEach(el => el.classList.toggle('invalid', errs.some(y => y.field === 'ai_' + el.dataset.ai)));
    if (errs.length) { const f = box.querySelector('.invalid'); if (f) f.focus(); return; }
    let rec = null; try { rec = await KT.payee.addrInlineSave(d.kol_id, x); } catch (er) { toast(C.payee.noCrypto); return; }
    box.querySelectorAll('[data-ai]').forEach(el => { if (el.type !== 'checkbox') el.value = ''; });   // the typed values leave the page
    addrOpen.delete(dealId); commit(C.payee.addressAdded(rec.label));
    const openShips = R.shipmentsOf(state(), dealId).filter(sh => sh.status === 'to_ship' && !sh.address_id && !R.isLegacyDelivered(sh));
    if (openShips.length && await U.confirmDialog(C.payee.useForOpen(openShips.length), C.payee.useForOpenBody, C.payee.useYes, false, C.payee.useNo)) {
      openShips.forEach(sh => { const s2 = R.shipmentsOf(state(), dealId).find(y => y.shipment_id === sh.shipment_id); if (s2) s2.address_id = rec.address_id; });
      commit(SM.shippingSaved);
    }
    if (after) after();
  }
  /* clicks in the drawer or in the Samples tab → true when handled */
  function click(e, after) {
    const ain = e.target.closest('[data-smaddin]'); if (ain) { addrOpen.add(ain.dataset.smaddin); if (after) after(); setTimeout(() => { const f = document.querySelector(`[data-smai="${CSS.escape(ain.dataset.smaddin)}"] input, [data-smai="${CSS.escape(ain.dataset.smaddin)}"] button`); if (f) f.focus(); }, 30); return true; }
    const aic = e.target.closest('[data-smaicancel]'); if (aic) { addrOpen.delete(aic.dataset.smaicancel); if (after) after(); return true; }
    const ais = e.target.closest('[data-smaisave]'); if (ais) { saveAddrHere(ais.dataset.smaisave, after); return true; }
    if (e.target.closest('.sm-ai [data-aiunlock]')) { KT.payee.unlockDialog(() => { if (after) after(); }); return true; }
    const km = e.target.closest('[data-smkm]'); if (km) { KT.profile.open(km.dataset.smkm, { tab: 'payee', backDeal: km.dataset.deal || null }); return true; }
    const pu = e.target.closest('[data-smpurchase], [data-smunpurchase]'); if (pu) { const m = pu.closest('details'); if (m) m.open = false; purchase(pu.dataset.smpurchase || pu.dataset.smunpurchase, !!pu.dataset.smunpurchase, after); return true; }
    const qk = e.target.closest('[data-smquick]'); if (qk) { const m = qk.closest('details'); if (m) m.open = false; quick(qk.dataset.smquick, [qk.dataset.sm], m ? m.querySelector('summary') : qk, after); return true; }   // CR-17
    const ud = e.target.closest('[data-smundo]'); if (ud) { const m = ud.closest('details'); if (m) m.open = false; undoDeliver(ud.dataset.smundo, after); return true; }
    const ad = e.target.closest('[data-smaddr]'); if (ad) { const m = ad.closest('details'); if (m) m.open = false; changeAddress(ad.dataset.smaddr, m ? m.querySelector('summary') : ad, after); return true; }
    const add = e.target.closest('[data-smadd]'); if (add) { addDialog(add.dataset.smadd, after, add); return true; }
    /* CR-11 §4.10 — the deal's shipments in Shipments: its Campaign, the KOL searched, the tab of its first open shipment */
    const op = e.target.closest('[data-smopen]'); if (op) { const d = dealOf(op.dataset.smopen); if (!d) return true; const list = R.shipmentsOf(state(), d.deal_id), sh = list.find(R.openShipment) || list[0];
      U.go('shipments', { tab: sh ? R.tabOfStatus(R.sampleStatus(sh, today())) : 'to-ship', campaign: d.campaign_id, q: kolName(d), pic: 'all', status: '', purpose: '' }); return true; }
    const sh = e.target.closest('[data-smship]'); if (sh) { shippingDialog(sh.dataset.smship, after); return true; }
    const a = e.target.closest('[data-smact]'); if (a) { const m = a.closest('details'); if (m) m.open = false; action(a.dataset.smact, [a.dataset.sm], after); return true; }
    return false;
  }

  /* ---------- dialogs ---------- */
  function apply(ids, change, after, msg) {
    const s = state(), ctx = ctxOf(); let n = 0;
    ids.forEach((id, i) => { const sh = (s.sample_shipments || []).find(x => x.shipment_id === id); if (!sh || !allowed(change.kind === 'edit' && change.items ? 'items' : change.kind, sh)) return;
      const c = Object.assign({}, change, change.trackingOf ? { tracking: change.trackingOf[id] } : {});
      s.deal_events.push(R.updateShipment(sh, c, Object.assign({}, ctx, { eventId: ctx.eventId + i }))); n++;
      if (change.kind === 'shipped') R.pinAddress(s, sh, (change.addressOf || {})[id]); });   // CR-16 §4.3: Ship to (blank = the default now)
    if (n) { if (msg === '') commit(); else commit(msg || SM.done(n)); }   // '' = an inline edit: saved without a toast
    if (after) after();
  }
  function action(kind, ids, after) {
    const s = state(), list = ids.map(shOf).filter(Boolean); if (!list.length) return;
    if (!EDIT_KINDS.includes(kind) && !U.guard('shipment.ship')) return;
    if (!list.every(sh => allowed(kind, sh))) { toast(EDIT_KINDS.includes(kind) ? SM.onlyEdit : SM.onlyPic); return; }
    if (kind === 'edit') { editDialog(list[0].shipment_id, after); return; }
    if (kind === 'items') { KT.screens.shipments.itemsDialog(list[0].shipment_id, after); return; }
    if (kind === 'delete') { const sh = list[0]; if (sh.source === 'auto' || sh.source === 'legacy' || sh.status !== 'to_ship') return; R.removeFromPickList(s, sh); s.sample_shipments = s.sample_shipments.filter(x => x !== sh); commit(SM.deleted); if (after) after(); return; }
    const td = today(), one = list.length === 1, S = settings();
    const title = { shipped: SM.bulkShippedTitle, delivered: SM.bulkDeliveredTitle, ship_by: SM.shipByTitle, not_required: SM.notRequiredTitle, problem: () => SM.problemTitle }[kind](list.length);
    const date = (id, v, lbl) => `<div class="field"><label for="${id}">${esc(lbl)}</label>${U.dateHTML(`id="${id}"`, v, { label: lbl })}</div>`;
    let body = '';
    if (kind === 'shipped') body = date('sm_date', td, SM.shippedOn) + `<div class="field"><label for="sm_carrier">${esc(SM.col.carrier)}</label><select id="sm_carrier">${optionsHTML(S.carriers, list[0].carrier || '', C.common.none)}</select></div>` +
      (one && kolIdOf(list[0]) ? `<div class="field wide"><label for="sm_shipto">${esc(SM.shipTo)}</label>${shipToHTML('sm_shipto', kolIdOf(list[0]), list[0].address_id || ((defAddr(kolIdOf(list[0])) || {}).address_id || ''), false, { allowNew: true })}<div class="hint">${esc(SM.shipToHint)}</div></div>`
        : `<div class="field wide"><div class="hint">${esc(SM.shipToMany)}</div></div>`) +
      `<div class="field wide"><label>${esc(SM.col.tracking)}</label><div class="sm-trk">${list.map(sh => `<label class="sm-trkrow"><span>${esc(shKol(sh))}</span><input data-smtrk="${esc(sh.shipment_id)}" value="${esc(sh.tracking_no || '')}" autocomplete="off"></label>`).join('')}</div></div>` +
      (one ? `<div class="field wide"><label>${esc(SM.col.items)}</label><div class="sm-itemlist">${(list[0].items || []).map((x, i) => `<label class="sm-trkrow"><span>${esc(x.tr_code)}</span><input type="number" min="1" step="1" data-smqty="${i}" value="${esc(x.qty)}"></label>`).join('') || `<span class="muted small">${esc(SM.noProducts)}</span>`}</div></div>` : '');
    else if (kind === 'delivered') body = date('sm_date', td, SM.deliveredOn);
    else if (kind === 'ship_by') { const d1 = one && list[0].deal_id ? dealOf(list[0].deal_id) : null, sg = d1 ? R.shipBySuggest(d1, state().lookups.sample_settings) : null;
      body = `<div class="field"><label for="sm_date">${esc(SM.col.shipBy)}</label>${U.dateHTML('id="sm_date"', one ? R.shipByDate(list[0]) || '' : '', { label: SM.col.shipBy })}` +
        (sg ? `<div class="hint"><button type="button" class="link" id="sm_suggest" data-date="${esc(sg.date)}" title="${esc(C.move.suggestTip)}">${esc(C.move.suggested(R.dmy(sg.date).slice(0, 5), sg.days, sg.from))}</button></div>` : '') + `</div>`; }
    else body = `<div class="field wide"><label for="sm_reason">${esc(SM.reason)} <span class="req">*</span></label><input id="sm_reason" autocomplete="off" placeholder="${esc(kind === 'problem' ? SM.problemPh : '')}"></div>`;
    openDialog(`<div class="dlg-h">${esc(title)}</div><div class="dlg-b"><div class="fields">${body}</div><div class="checks" id="sm_checks"></div></div>` +
      `<div class="dlg-f"><button type="button" class="btn" id="sm_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="sm_ok">${esc(C.common.save)}</button></div>`, kind === 'shipped' && list.length > 1 ? 'mid' : false);
    $('sm_cancel').addEventListener('click', closeDialog);
    if (one && kolIdOf(list[0]) && $('sm_shipto')) wireNewAddr($('dlg'), 'sm_shipto', kolIdOf(list[0]));   // CR-31 §2.3
    if ($('sm_suggest')) $('sm_suggest').addEventListener('click', () => U.setDate($('sm_date'), $('sm_suggest').dataset.date));   // CR-23 §3.4: the suggestion only when clicked
    $('sm_ok').addEventListener('click', async () => {
      let picked = null; if (kind === 'shipped' && one && $('sm_shipto') && $('sm_shipto').value === '__new') { const na = await newAddrOf($('dlg'), 'sm_shipto', kolIdOf(list[0])); if (na.errs) return; picked = na.id; }   // CR-31 §2.3
      const change = { kind, date: $('sm_date') ? $('sm_date').value : null, reason: $('sm_reason') ? $('sm_reason').value : null, carrier: $('sm_carrier') ? $('sm_carrier').value : null };
      if (kind === 'shipped') { change.trackingOf = Object.fromEntries([...document.querySelectorAll('#dlg [data-smtrk]')].map(i => [i.dataset.smtrk, i.value])); if (one) change.items = (list[0].items || []).map((x, i) => ({ tr_code: x.tr_code, qty: Number(($(`dlg`).querySelector(`[data-smqty="${i}"]`) || {}).value) || x.qty }));
        if (one && $('sm_shipto') && (picked || $('sm_shipto').value)) change.addressOf = { [list[0].shipment_id]: picked || $('sm_shipto').value }; }
      if (kind === 'ship_by' && !change.date) change.date = null;
      const res = R.validateShipment(Object.assign({}, change, kind === 'ship_by' && !change.date ? { kind: 'none' } : {}), td);
      if (res.errs.length) { $('sm_checks').innerHTML = checksHTML(res, ''); return; }
      closeDialog(); apply(ids, change, after);
    });
  }
  /* + Add shipment (Deal drawer) = New shipment (modal M over the drawer) with the deal fixed — CR-11 §4.3 / §4.10 */
  function addDialog(dealId, after, opener) {
    const d = dealOf(dealId); if (!d || !R.canEditShip(U.actor(), d, null)) { toast(SM.onlyEdit); return; }
    KT.screens.shipments.newShipment({ dealId, kolId: d.kol_id, lockDeal: true, purpose: R.shipmentsOf(state(), dealId).length ? 'replacement' : 'review', opener, after });
  }
  function editDialog(id, after) {
    const sh = shOf(id), S = settings(); if (!sh) return;
    openDialog(`<div class="dlg-h">${esc(SM.editTitle(id))}</div><div class="dlg-b"><div class="fields">` +
      `<div class="field"><label for="se_carrier">${esc(SM.col.carrier)}</label><select id="se_carrier">${optionsHTML(S.carriers.concat(sh.carrier && !S.carriers.includes(sh.carrier) ? [sh.carrier] : []), sh.carrier || '', C.common.none)}</select></div>` +
      `<div class="field"><label for="se_trk">${esc(SM.col.tracking)}</label><input id="se_trk" value="${esc(sh.tracking_no || '')}" autocomplete="off"></div>` +
      `<div class="field"><label>${esc(SM.col.shipped)}</label>${U.dateHTML('id="se_sd"', sh.shipped_date || '', { label: SM.col.shipped })}</div><div class="field"><label>${esc(SM.col.delivered)}</label>${U.dateHTML('id="se_dd"', sh.delivered_date || '', { label: SM.col.delivered })}</div>` +
      (kolIdOf(sh) ? `<div class="field wide"><label for="se_shipto">${esc(SM.shipTo)}</label>${shipToHTML('se_shipto', kolIdOf(sh), sh.address_id || '', sh.status === 'to_ship', { allowNew: true })}</div>` : '') +
      `</div></div><div class="dlg-f"><button type="button" class="btn" id="se_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="se_ok">${esc(C.common.save)}</button></div>`);
    $('se_cancel').addEventListener('click', closeDialog);
    if (kolIdOf(sh) && $('se_shipto')) wireNewAddr($('dlg'), 'se_shipto', kolIdOf(sh));   // CR-31 §2.3
    $('se_ok').addEventListener('click', async () => {
      let picked = null; if ($('se_shipto') && $('se_shipto').value === '__new') { const na = await newAddrOf($('dlg'), 'se_shipto', kolIdOf(sh)); if (na.errs) return; picked = na.id; }
      const v = x => (R.isISODate(x) ? x : null), sd = v($('se_sd').value), dd = v($('se_dd').value);
      const change = { kind: 'edit', carrier: $('se_carrier').value || null, tracking_no: R.trim($('se_trk').value) || null, shipped_date: sd, delivered_date: dd };
      if ($('se_shipto') && !$('se_shipto').disabled) change.address_id = picked || $('se_shipto').value || null;
      closeDialog(); apply([id], change, () => { const x = shOf(id); if (x && x.status !== 'not_required' && x.status !== 'problem') { x.status = dd ? 'delivered' : sd ? 'shipped' : x.status === 'delivered' || x.status === 'shipped' ? 'to_ship' : x.status; commit(); } if (after) after(); });
    });
  }
  /* Shipping details (Deal drawer · New shipment) → the KOL's default shipping address (CR-16 §4.3: Edit it, or + Add address when there is none) */
  function shippingDialog(kolId, after) {
    const a = defAddr(kolId);
    KT.payee.addressDialog(a ? { addressId: a.address_id, onSaved: after } : { kolId, onSaved: after });
  }

  /* §4.14 — the Pipeline card's box icon: a shipment not delivered yet, coloured by status */
  function iconHTML(d) {
    const list = R.shipmentsOf(state(), d.deal_id).filter(x => !['delivered', 'not_required'].includes(x.status)); if (!list.length) return '';
    const sh = list[0], st = R.sampleStatus(sh, today()), dm = x => R.dmy(x).slice(0, 5);
    const tip = st === 'shipped' ? SM.track.shipped(sh.shipped_date ? dm(sh.shipped_date) : '', sh.carrier) : SM.icon(SM.status[st], R.shipByDate(sh) ? dm(R.shipByDate(sh)) : '');
    return `<span class="smicon sm-${st}" title="${esc(tip)}" aria-label="${esc(tip)}">📦</span>`;
  }

  return { summaryText, itemNames, chip, trackHTML, sectionHTML, fillSecure, click, action, addDialog, shippingDialog, iconHTML, quick, undoDeliver, changeAddress, quickBtnHTML, simpleMenuItems, isSimple: simple };
})();
