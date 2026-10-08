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
  const shipToHTML = (id, kolId, value, blank) => { const opts = R.shipToOptions(state(), kolId);
    return `<select id="${id}" aria-label="${esc(SM.shipTo)}"${opts.length ? '' : ' disabled'}>${blank ? `<option value="">${esc(SM.shipToDefault)}</option>` : ''}` +
      opts.map(o => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.secure ? o.label : SM.noDetails(o.label))}</option>`).join('') +
      (opts.length ? '' : `<option value="">${esc(SM.noAddress)}</option>`) + `</select>`; };
  /* the address a shipment goes to (its own, else the default) — its label */
  const addrLabel = sh => { const a = R.addressOfShipment(state(), sh); return a ? a.label : ''; };
  /* CR-11 §4.10 — what changes the plan (items · ship by · Not required · delete) vs the work of sending (shipped · delivered · problem · carrier / tracking) */
  const EDIT_KINDS = ['ship_by', 'not_required', 'items', 'delete'];
  const canEditSh = sh => R.canEditShip(U.actor(), dealOf(sh.deal_id), sh);
  const allowed = (kind, sh) => (EDIT_KINDS.includes(kind) ? canEditSh(sh) : R.canShipWork(U.actor()));
  const trackCell = sh => { const url = R.trackingLink(settings(), sh.carrier, sh.tracking_no); return !sh.tracking_no ? '' : url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(sh.tracking_no)} ↗</a>` : esc(sh.tracking_no); };
  /* no products: a warning only while the sample is still to ship (a delivered legacy row just shows —) */
  const items = sh => (sh.items && sh.items.length ? esc(R.itemsText(sh.items)) : sh.status === 'to_ship' ? `<span class="chip warn-chip">${esc(SM.noProducts)}</span>` : '<span class="muted">—</span>');

  /* ---------- the Journey's sample track (under the payment track) ---------- */
  function trackHTML(d) {
    const t = R.sampleTrack(R.shipmentsOf(state(), d.deal_id), today()); if (!t) return '';
    const dmy = x => R.dmy(x).slice(0, 5), T = SM.track;
    const steps = t.kind === 'not_required' ? `<span class="chip">${esc(T.not_required)}</span>`
      : t.kind === 'overdue' ? `<span class="smt late">${esc(T.overdue(dmy(t.shipBy), t.late))}</span>`
      : [`<span class="smt ${['shipped', 'delivered'].includes(t.kind) ? 'done' : t.kind === 'this_week' ? 'warn' : ''}">${esc(['shipped', 'delivered'].includes(t.kind) ? T.to_ship(t.shipBy ? dmy(t.shipBy) : '') : T[t.kind === 'problem' ? 'problem' : t.kind](t.shipBy ? dmy(t.shipBy) : ''))}</span>`,
        t.shipped || t.kind === 'shipped' || t.kind === 'delivered' ? `<span class="smt done">${esc(T.shipped(t.shipped ? dmy(t.shipped) : '', t.carrier))}</span>` : '',
        t.kind === 'delivered' ? `<span class="smt done">${esc(T.delivered(t.delivered ? dmy(t.delivered) : ''))}</span>` : ''].filter(Boolean).join('<span class="smt-arrow">→</span>');
    return `<div class="smtrack"><span class="smt-l">${esc(SM.trackL)}</span>${steps}</div>`;
  }
  /* ---------- the Deal drawer's Samples section ---------- */
  function sectionHTML(d) {
    const list = R.shipmentsOf(state(), d.deal_id), ok = R.canEditShip(U.actor(), d, null), td = today();
    const da = defAddr(d.kol_id);
    const addr = `<div class="sm-addr"><span class="muted small">${esc(SM.shipToDefaultL)}:</span> ${da ? `<b>${esc(da.label)}</b> ` : ''}${onFile(d.kol_id) ? `<span class="chip ok-chip">${esc(SM.addressOnFile)}</span>` : `<span class="chip">${esc(SM.noAddress)}</span>`}` +
      (R.canEditPayee(state(), U.actor(), null, R.kolById(state(), d.kol_id)) ? ` <button type="button" class="link" data-smship="${esc(d.kol_id)}">${esc(da ? SM.shippingDetails : SM.addAddress)}</button>` : '') +
      (onFile(d.kol_id) && KT.vault.isUnlocked(state().lookups.payee_vault) && U.can('payee.unlock') ? `<div class="sm-shipsecure" data-smsecure="${esc(d.kol_id)}"><span class="muted small">…</span></div>` : '') + `</div>`;
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
      const shipBy = sh.ship_by ? `${esc(R.dmy(sh.ship_by))}${sh.ship_by_overridden ? ` <span class="muted small">✎</span>` : ''}` : sh.status === 'to_ship' ? `<span class="chip warn-chip">${esc(SM.setShipBy)}</span>` : '—';
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
    return `<tr data-smrow="${esc(sh.shipment_id)}" class="sm-legacy" title="${esc(C.golive.imported)}"><td>${items(sh)}</td><td class="nowrap">${sh.ship_by ? esc(R.dmy(sh.ship_by)) : dash('')}</td><td>${chip(st)}</td>` +
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
  /* "Warehouse · Test 1 ×2 · To ship" — a shipment in one line (Move stage · the Deal modal) */
  function summaryText(sh) {
    if (!sh) return '';
    const s = state(), items = (sh.items || []).map(x => { const p = R.productByCode(s, x.tr_code); return `${p ? R.productShort(p) : x.tr_code} ×${x.qty}`; }).join(', ');
    return SM.summary(R.shipMethodLabel(s.lookups, sh.method || 'warehouse'), items, SM.status[R.sampleStatus(sh, today())] || sh.status);
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
        const s = state(), ctx = quickCtx(); let n = 0;
        ids.forEach(id => { const sh = (s.sample_shipments || []).find(x => x.shipment_id === id); if (!sh || !allowed(kind === 'delivered' ? 'delivered' : 'shipped', sh)) return;
          const evs = R.shipQuick(s, sh, kind, { date, carrier, tracking }, ctx); if (evs) { s.deal_events.push(...evs); n++; } });
        if (n) commit(SM.quick.done(n, kind)); if (after) after();
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

  /* clicks in the drawer or in the Samples tab → true when handled */
  function click(e, after) {
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
      (one && kolIdOf(list[0]) ? `<div class="field wide"><label for="sm_shipto">${esc(SM.shipTo)}</label>${shipToHTML('sm_shipto', kolIdOf(list[0]), list[0].address_id || ((defAddr(kolIdOf(list[0])) || {}).address_id || ''), false)}<div class="hint">${esc(SM.shipToHint)}</div></div>`
        : `<div class="field wide"><div class="hint">${esc(SM.shipToMany)}</div></div>`) +
      `<div class="field wide"><label>${esc(SM.col.tracking)}</label><div class="sm-trk">${list.map(sh => `<label class="sm-trkrow"><span>${esc(shKol(sh))}</span><input data-smtrk="${esc(sh.shipment_id)}" value="${esc(sh.tracking_no || '')}" autocomplete="off"></label>`).join('')}</div></div>` +
      (one ? `<div class="field wide"><label>${esc(SM.col.items)}</label><div class="sm-itemlist">${(list[0].items || []).map((x, i) => `<label class="sm-trkrow"><span>${esc(x.tr_code)}</span><input type="number" min="1" step="1" data-smqty="${i}" value="${esc(x.qty)}"></label>`).join('') || `<span class="muted small">${esc(SM.noProducts)}</span>`}</div></div>` : '');
    else if (kind === 'delivered') body = date('sm_date', td, SM.deliveredOn);
    else if (kind === 'ship_by') body = date('sm_date', one ? list[0].ship_by || '' : '', SM.col.shipBy) + (one && list[0].ship_by_overridden ? `<div class="field"><label>&nbsp;</label><button type="button" class="btn small" id="sm_auto">${esc(SM.resetAuto)}</button></div>` : '');
    else body = `<div class="field wide"><label for="sm_reason">${esc(SM.reason)} <span class="req">*</span></label><input id="sm_reason" autocomplete="off" placeholder="${esc(kind === 'problem' ? SM.problemPh : '')}"></div>`;
    openDialog(`<div class="dlg-h">${esc(title)}</div><div class="dlg-b"><div class="fields">${body}</div><div class="checks" id="sm_checks"></div></div>` +
      `<div class="dlg-f"><button type="button" class="btn" id="sm_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="sm_ok">${esc(C.common.save)}</button></div>`, kind === 'shipped' && list.length > 1 ? 'mid' : false);
    $('sm_cancel').addEventListener('click', closeDialog);
    if ($('sm_auto')) $('sm_auto').addEventListener('click', () => { closeDialog(); apply(ids, { kind: 'ship_by', date: null }, after); });
    $('sm_ok').addEventListener('click', () => {
      const change = { kind, date: $('sm_date') ? $('sm_date').value : null, reason: $('sm_reason') ? $('sm_reason').value : null, carrier: $('sm_carrier') ? $('sm_carrier').value : null };
      if (kind === 'shipped') { change.trackingOf = Object.fromEntries([...document.querySelectorAll('#dlg [data-smtrk]')].map(i => [i.dataset.smtrk, i.value])); if (one) change.items = (list[0].items || []).map((x, i) => ({ tr_code: x.tr_code, qty: Number(($(`dlg`).querySelector(`[data-smqty="${i}"]`) || {}).value) || x.qty }));
        if (one && $('sm_shipto') && $('sm_shipto').value) change.addressOf = { [list[0].shipment_id]: $('sm_shipto').value }; }
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
      (kolIdOf(sh) ? `<div class="field wide"><label for="se_shipto">${esc(SM.shipTo)}</label>${shipToHTML('se_shipto', kolIdOf(sh), sh.address_id || '', sh.status === 'to_ship')}</div>` : '') +
      `</div></div><div class="dlg-f"><button type="button" class="btn" id="se_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="se_ok">${esc(C.common.save)}</button></div>`);
    $('se_cancel').addEventListener('click', closeDialog);
    $('se_ok').addEventListener('click', () => {
      const v = x => (R.isISODate(x) ? x : null), sd = v($('se_sd').value), dd = v($('se_dd').value);
      const change = { kind: 'edit', carrier: $('se_carrier').value || null, tracking_no: R.trim($('se_trk').value) || null, shipped_date: sd, delivered_date: dd };
      if ($('se_shipto') && !$('se_shipto').disabled) change.address_id = $('se_shipto').value || null;
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
    const tip = st === 'shipped' ? SM.track.shipped(sh.shipped_date ? dm(sh.shipped_date) : '', sh.carrier) : SM.icon(SM.status[st], sh.ship_by ? dm(sh.ship_by) : '');
    return `<span class="smicon sm-${st}" title="${esc(tip)}" aria-label="${esc(tip)}">📦</span>`;
  }

  return { summaryText, chip, trackHTML, sectionHTML, fillSecure, click, action, addDialog, shippingDialog, iconHTML, quick, undoDeliver, changeAddress, quickBtnHTML, simpleMenuItems, isSimple: simple };
})();
