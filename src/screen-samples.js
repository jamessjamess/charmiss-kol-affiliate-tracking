/* screen-samples.js — CR-10 §4.14 Samples on screen: the Deal drawer's Samples section (shipments · + Add shipment · ⋯ actions · shipping
   details on file), the Journey's sample track, Deals › Samples (queue cards · one row a shipment grouped by Status / PIC / Phase · Carrier and
   Tracking in the row · bulk Mark shipped / delivered · Set ship-by · Not required · Export shipping list) and the shipping details dialog
   (encrypted into payee_profiles.secure_ship — never in plain text). Rules: rules-samples.js. → KT.samples */
KT.samples = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, state, today, store, commit, toast, openDialog, closeDialog, optionsHTML, userId, checksHTML, pref, ICON } = U;
  const SM = C.samples;
  const CLS = { overdue: 'err', this_week: 'warn', to_ship: 'muted', shipped: 'progress', delivered: 'done', problem: 'cancel', not_required: 'outline' };
  const chip = st => `<span class="st sm-${st} ${CLS[st] || ''}">${esc(SM.status[st])}</span>`;
  const ctxOf = () => ({ now: new Date().toISOString(), user: userId(), eventId: store.newEventId() });
  const settings = () => R.sampleSettings(state().lookups);
  const dealOf = id => state().deals.find(d => d.deal_id === id);
  const shOf = id => (state().sample_shipments || []).find(x => x.shipment_id === id);
  const kolName = d => (R.kolById(state(), d.kol_id) || {}).display_name || d.kol_id;
  const payeeOf = kolId => R.payeeOfKol(state(), kolId);
  const onFile = kolId => { const p = payeeOf(kolId); return !!(p && p.shipping_on_file && p.secure_ship); };
  const canEdit = d => R.canEditShipment(U.actor(), d);
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
        t.kind === 'delivered' ? `<span class="smt done">${esc(T.delivered(t.delivered ? dmy(t.delivered) : SM.dateNotRecorded))}</span>` : ''].filter(Boolean).join('<span class="smt-arrow">→</span>');
    return `<div class="smtrack"><span class="smt-l">${esc(SM.sec)}</span>${steps}</div>`;
  }
  /* ---------- the Deal drawer's Samples section ---------- */
  function sectionHTML(d) {
    const list = R.shipmentsOf(state(), d.deal_id), ok = canEdit(d), td = today();
    const addr = `<div class="sm-addr"><span class="muted small">${esc(SM.shippingDetails)}:</span> ${onFile(d.kol_id) ? `<span class="chip ok-chip">${esc(SM.addressOnFile)}</span>` : `<span class="chip">${esc(SM.noAddress)}</span>`}` +
      (R.canEditPayee(state(), U.actor(), payeeOf(d.kol_id), R.kolById(state(), d.kol_id)) ? ` <button type="button" class="link" data-smship="${esc(d.kol_id)}">${esc(SM.shippingDetails)}</button>` : '') +
      (onFile(d.kol_id) && KT.vault.isUnlocked(state().lookups.payee_vault) && U.can('payee.unlock') ? `<div class="sm-shipsecure" data-smsecure="${esc(d.kol_id)}"><span class="muted small">…</span></div>` : '') + `</div>`;
    const rows = list.map(sh => { const st = R.sampleStatus(sh, td);
      const menu = ok ? [`<button type="button" class="mi" data-smact="edit" data-sm="${esc(sh.shipment_id)}">${esc(SM.edit)}</button>`,
        !['shipped', 'delivered', 'not_required'].includes(sh.status) ? `<button type="button" class="mi" data-smact="shipped" data-sm="${esc(sh.shipment_id)}">${esc(SM.markShipped)}</button>` : '',
        sh.status !== 'delivered' && sh.status !== 'not_required' ? `<button type="button" class="mi" data-smact="delivered" data-sm="${esc(sh.shipment_id)}">${esc(SM.markDelivered)}</button>` : '',
        sh.status !== 'delivered' && sh.status !== 'not_required' ? `<button type="button" class="mi" data-smact="problem" data-sm="${esc(sh.shipment_id)}">${esc(SM.reportProblem)}</button>` : '',
        sh.status === 'to_ship' ? `<button type="button" class="mi" data-smact="ship_by" data-sm="${esc(sh.shipment_id)}">${esc(SM.setShipBy)}</button>` : '',
        sh.status === 'to_ship' ? `<button type="button" class="mi" data-smact="not_required" data-sm="${esc(sh.shipment_id)}">${esc(SM.notRequired)}</button>` : '',
        sh.source === 'manual' && sh.status === 'to_ship' ? `<button type="button" class="mi danger" data-smact="delete" data-sm="${esc(sh.shipment_id)}">${esc(SM.del)}</button>` : ''].join('') : '';
      const shipBy = sh.ship_by ? `${esc(R.dmy(sh.ship_by))}${sh.ship_by_overridden ? ` <span class="muted small">✎</span>` : ''}` : sh.status === 'to_ship' ? `<span class="chip warn-chip">${esc(SM.setShipBy)}</span>` : '—';
      return `<tr data-smrow="${esc(sh.shipment_id)}"><td>${items(sh)}</td><td class="nowrap">${shipBy}</td><td>${chip(st)}${sh.problem_reason && st === 'problem' ? ` <span class="muted small">${esc(sh.problem_reason)}</span>` : ''}${st === 'not_required' && sh.not_required_reason ? ` <span class="muted small">${esc(sh.not_required_reason)}</span>` : ''}</td>` +
        `<td>${esc(sh.carrier || '')}</td><td>${trackCell(sh)}</td><td class="nowrap">${sh.shipped_date ? esc(R.dmy(sh.shipped_date)) : '—'}</td><td class="nowrap">${sh.delivered_date ? esc(R.dmy(sh.delivered_date)) : sh.status === 'delivered' ? `<span class="muted small">${esc(SM.dateNotRecorded)}</span>` : '—'}</td>` +
        `<td>${menu ? `<details class="menu"><summary class="icon-btn" aria-label="${esc(C.app.more)}">⋯</summary><div class="menu-list right">${menu}</div></details>` : ''}</td></tr>`; }).join('');
    const C2 = SM.col;
    return `<section class="sec smsec"><div class="sec-h"><span>${esc(SM.sec)}</span>${ok ? `<button type="button" class="btn small" data-smadd="${esc(d.deal_id)}">+ ${esc(SM.addShipment)}</button>` : ''}</div>` +
      (list.length ? `<div class="tablewrap"><table class="tbl compact-sm smtbl"><thead><tr><th>${esc(C2.items)}</th><th>${esc(C2.shipBy)}</th><th>${esc(C2.status)}</th><th>${esc(C2.carrier)}</th><th>${esc(C2.tracking)}</th><th>${esc(C2.shipped)}</th><th>${esc(C2.delivered)}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="hint">${esc(SM.noShipments)}</div>`) + addr + `</section>`;
  }
  /* after the drawer is drawn: the shipping details, decrypted in memory while the vault is open */
  async function fillSecure(root) {
    const box = root && root.querySelector('[data-smsecure]'); if (!box) return;
    const p = payeeOf(box.dataset.smsecure), rec = p && p.secure_ship ? await KT.vault.decrypt(p.secure_ship) : null;
    if (!box.isConnected) return;
    box.innerHTML = rec ? [rec.ship_name, rec.ship_phone, rec.ship_address].filter(Boolean).map(esc).join(' · ') : '';
  }
  /* clicks in the drawer or in the Samples tab → true when handled */
  function click(e, after) {
    const add = e.target.closest('[data-smadd]'); if (add) { addDialog(add.dataset.smadd, after); return true; }
    const sh = e.target.closest('[data-smship]'); if (sh) { shippingDialog(sh.dataset.smship, after); return true; }
    const a = e.target.closest('[data-smact]'); if (a) { const m = a.closest('details'); if (m) m.open = false; action(a.dataset.smact, [a.dataset.sm], after); return true; }
    return false;
  }

  /* ---------- dialogs ---------- */
  function apply(ids, change, after, msg) {
    const s = state(), ctx = ctxOf(); let n = 0;
    ids.forEach((id, i) => { const sh = (s.sample_shipments || []).find(x => x.shipment_id === id), d = sh && dealOf(sh.deal_id); if (!sh || !canEdit(d)) return;
      const c = Object.assign({}, change, change.trackingOf ? { tracking: change.trackingOf[id] } : {});
      s.deal_events.push(R.updateShipment(sh, c, Object.assign({}, ctx, { eventId: ctx.eventId + i }))); n++; });
    if (n) { if (msg === '') commit(); else commit(msg || SM.done(n)); }   // '' = an inline edit: saved without a toast
    if (after) after();
  }
  function action(kind, ids, after) {
    const s = state(), list = ids.map(shOf).filter(Boolean); if (!list.length) return;
    if (!list.every(sh => canEdit(dealOf(sh.deal_id)))) { toast(SM.onlyPic); return; }
    if (kind === 'edit') { editDialog(list[0].shipment_id, after); return; }
    if (kind === 'delete') { const sh = list[0]; if (sh.source !== 'manual' || sh.status !== 'to_ship') return; s.sample_shipments = s.sample_shipments.filter(x => x !== sh); commit(SM.deleted); if (after) after(); return; }
    const td = today(), one = list.length === 1, S = settings();
    const title = { shipped: SM.bulkShippedTitle, delivered: SM.bulkDeliveredTitle, ship_by: SM.shipByTitle, not_required: SM.notRequiredTitle, problem: () => SM.problemTitle }[kind](list.length);
    const date = (id, v, lbl) => `<div class="field"><label for="${id}">${esc(lbl)}</label>${U.dateHTML(`id="${id}"`, v, { label: lbl })}</div>`;
    let body = '';
    if (kind === 'shipped') body = date('sm_date', td, SM.shippedOn) + `<div class="field"><label for="sm_carrier">${esc(SM.col.carrier)}</label><select id="sm_carrier">${optionsHTML(S.carriers, list[0].carrier || '', C.common.none)}</select></div>` +
      `<div class="field wide"><label>${esc(SM.col.tracking)}</label><div class="sm-trk">${list.map(sh => `<label class="sm-trkrow"><span>${esc(kolName(dealOf(sh.deal_id)))}</span><input data-smtrk="${esc(sh.shipment_id)}" value="${esc(sh.tracking_no || '')}" autocomplete="off"></label>`).join('')}</div></div>` +
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
      if (kind === 'shipped') { change.trackingOf = Object.fromEntries([...document.querySelectorAll('#dlg [data-smtrk]')].map(i => [i.dataset.smtrk, i.value])); if (one) change.items = (list[0].items || []).map((x, i) => ({ tr_code: x.tr_code, qty: Number(($(`dlg`).querySelector(`[data-smqty="${i}"]`) || {}).value) || x.qty })); }
      if (kind === 'ship_by' && !change.date) change.date = null;
      const res = R.validateShipment(Object.assign({}, change, kind === 'ship_by' && !change.date ? { kind: 'none' } : {}), td);
      if (res.errs.length) { $('sm_checks').innerHTML = checksHTML(res, ''); return; }
      closeDialog(); apply(ids, change, after);
    });
  }
  function addDialog(dealId, after) {
    const d = dealOf(dealId); if (!d || !canEdit(d)) { toast(SM.onlyPic); return; }
    const s = state(), its = (s.deal_products || []).filter(x => x.deal_id === dealId).map(x => ({ tr_code: x.tr_code, qty: Number(x.qty) || 1 }));
    openDialog(`<div class="dlg-h">${esc(SM.addTitle)}</div><div class="dlg-b"><div class="fields"><div class="field wide"><label>${esc(SM.col.items)}</label><div>${its.length ? esc(R.itemsText(its)) : `<span class="chip warn-chip">${esc(SM.noProducts)}</span>`}</div></div>` +
      `<div class="field"><label for="sm_sb">${esc(SM.col.shipBy)}</label>${U.dateHTML('id="sm_sb"', R.shipBy(d, s.lookups.sample_settings) || '', { label: SM.col.shipBy })}</div></div></div>` +
      `<div class="dlg-f"><button type="button" class="btn" id="sm_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="sm_ok">${esc(SM.addShipment)}</button></div>`);
    $('sm_cancel').addEventListener('click', closeDialog);
    $('sm_ok').addEventListener('click', () => {
      const st = state(), sb = $('sm_sb').value, auto = R.shipBy(d, st.lookups.sample_settings), id = store.newId('shipment');
      const sh = R.newShipment({ id, deal: d, items: its, shipBy: R.isISODate(sb) ? sb : null, source: 'manual', user: userId(), now: new Date().toISOString() });
      if (R.isISODate(sb) && sb !== auto) sh.ship_by_overridden = true;
      st.sample_shipments.push(sh); st.deal_events.push({ event_id: store.newEventId(), deal_id: d.deal_id, shipment_id: id, type: 'sample', from: null, to: 'to_ship', changed_at: sh.created_at, changed_by: userId(), note: null });
      closeDialog(); commit(SM.added(id)); if (after) after();
    });
  }
  function editDialog(id, after) {
    const sh = shOf(id), S = settings(); if (!sh) return;
    openDialog(`<div class="dlg-h">${esc(SM.editTitle(id))}</div><div class="dlg-b"><div class="fields">` +
      `<div class="field"><label for="se_carrier">${esc(SM.col.carrier)}</label><select id="se_carrier">${optionsHTML(S.carriers.concat(sh.carrier && !S.carriers.includes(sh.carrier) ? [sh.carrier] : []), sh.carrier || '', C.common.none)}</select></div>` +
      `<div class="field"><label for="se_trk">${esc(SM.col.tracking)}</label><input id="se_trk" value="${esc(sh.tracking_no || '')}" autocomplete="off"></div>` +
      `<div class="field"><label>${esc(SM.col.shipped)}</label>${U.dateHTML('id="se_sd"', sh.shipped_date || '', { label: SM.col.shipped })}</div><div class="field"><label>${esc(SM.col.delivered)}</label>${U.dateHTML('id="se_dd"', sh.delivered_date || '', { label: SM.col.delivered })}</div>` +
      `</div></div><div class="dlg-f"><button type="button" class="btn" id="se_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="se_ok">${esc(C.common.save)}</button></div>`);
    $('se_cancel').addEventListener('click', closeDialog);
    $('se_ok').addEventListener('click', () => {
      const v = x => (R.isISODate(x) ? x : null), sd = v($('se_sd').value), dd = v($('se_dd').value);
      const change = { kind: 'edit', carrier: $('se_carrier').value || null, tracking_no: R.trim($('se_trk').value) || null, shipped_date: sd, delivered_date: dd };
      closeDialog(); apply([id], change, () => { const x = shOf(id); if (x && x.status !== 'not_required' && x.status !== 'problem') { x.status = dd ? 'delivered' : sd ? 'shipped' : x.status === 'delivered' || x.status === 'shipped' ? 'to_ship' : x.status; commit(); } if (after) after(); });
    });
  }
  /* Shipping details → encrypted into the KOL's payee (made when there is none) · needs a vault, not the passphrase */
  function shippingDialog(kolId, after) {
    const s = state(), k = R.kolById(s, kolId), vault = s.lookups.payee_vault;
    if (!R.canEditPayee(s, U.actor(), payeeOf(kolId), k)) { toast(SM.onlyPic); return; }
    if (!vault) { toast(SM.needVault); return; }
    openDialog(`<div class="dlg-h">${esc(SM.shippingDetails)} · ${esc(k.display_name)}</div><div class="dlg-b"><p class="hint" style="margin-top:0">${esc(SM.shippingHint)}</p><div class="fields">` +
      `<div class="field wide"><label for="sp_name">${esc(SM.shipName)}</label><input id="sp_name" autocomplete="off"></div><div class="field"><label for="sp_phone">${esc(SM.shipPhone)}</label><input id="sp_phone" inputmode="tel" autocomplete="off"></div>` +
      `<div class="field wide"><label for="sp_addr">${esc(SM.shipAddress)}</label><textarea id="sp_addr"></textarea></div></div></div>` +
      `<div class="dlg-f"><button type="button" class="btn" id="sp_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="sp_ok">${esc(C.common.save)}</button></div>`);
    $('sp_cancel').addEventListener('click', closeDialog);
    $('sp_ok').addEventListener('click', async () => {
      const rec = { ship_name: R.trim($('sp_name').value) || null, ship_phone: R.trim($('sp_phone').value) || null, ship_address: R.trim($('sp_addr').value) || null };
      const secure = await KT.vault.encrypt(vault, rec);
      ['sp_name', 'sp_phone', 'sp_addr'].forEach(i => { $(i).value = ''; });   // nothing stays in the page
      const st = state(); let p = R.payeeOfKol(st, kolId);
      if (!p) { p = R.blankPayee(st, { payee_id: store.newId('payee'), kol_id: kolId, user: userId(), now: new Date().toISOString() }); st.payee_profiles.push(p); }
      Object.assign(p, { secure_ship: secure, shipping_on_file: !!(rec.ship_name || rec.ship_phone || rec.ship_address), updated_at: new Date().toISOString(), updated_by: userId() });
      closeDialog(); commit(SM.shippingSaved); if (after) after();
    });
  }

  /* ---------- Deals › Samples ---------- */
  const sv = { sel: new Set(), o: null, rows: [] };
  const GROUPS = ['status', 'pic', 'phase'];
  const groupBy = () => { const v = pref.get('smgroup_' + (userId() || ''), 'status'); return GROUPS.includes(v) ? v : 'status'; };
  const foldKey = () => `smfold_${userId() || ''}_${groupBy()}`;
  const folded = () => { try { return new Set(JSON.parse(pref.get(foldKey(), '[]'))); } catch (e) { return new Set(); } };
  /* o = { s, td, ctx, deals, f {q, sstatus}, campaignId, used, setFilter, rerender, openDeal } */
  function render(el, o) {
    sv.o = o;
    const { s, td } = o, all = R.sampleRows(s, o.deals, td), q = R.trim(o.f.q).toLowerCase().replace(/^@/, '');
    const match = r => (!q || [kolName(r.deal), r.deal.deal_id, r.sh.tracking_no].some(v => String(v || '').toLowerCase().includes(q))) &&
      (!o.f.sstatus || (o.f.sstatus === 'noShipBy' ? r.status === 'to_ship' && !r.sh.ship_by : o.f.sstatus === 'toShip' ? r.status === 'overdue' || r.status === 'this_week' : r.status === o.f.sstatus));
    const rows = all.filter(match), cnt = R.sampleCounts(all), edit = U.can('deal.edit');
    sv.rows = rows; [...sv.sel].forEach(id => { if (!rows.some(r => r.sh.shipment_id === id)) sv.sel.delete(id); });
    const card = (k, n) => `<button type="button" class="qcard${o.f.sstatus === k ? ' on' : ''}" data-smq="${k}" aria-pressed="${o.f.sstatus === k}"><span class="n">${R.fmtNum(n)}</span><span class="t">${esc(SM.queue[k])}</span></button>`;
    const cards = `<div class="qcards">${card('overdue', cnt.overdue)}${card('this_week', cnt.this_week)}${card('shipped', cnt.shipped)}${card('delivered', cnt.delivered)}${card('noShipBy', cnt.noShipBy)}</div>`;
    const by = groupBy(), n = sv.sel.size;
    const tools = `<div class="toolbar sm-tools">${n && edit ? `<b>${esc(SM.selected(n))}</b><button type="button" class="btn small primary" data-smbulk="shipped">${esc(SM.markShipped)}</button><button type="button" class="btn small" data-smbulk="delivered">${esc(SM.markDelivered)}</button>` +
      `<button type="button" class="btn small" data-smbulk="ship_by">${esc(SM.setShipByBulk)}</button><button type="button" class="btn small" data-smbulk="not_required">${esc(SM.notRequired)}</button><button type="button" class="btn small ghost" data-smclear>${esc(C.deal.clear)}</button>`
      : `<label class="tlab">${esc(SM.groupBy)} <select id="sm_group">${GROUPS.map(g => `<option value="${g}"${g === by ? ' selected' : ''}>${esc(SM.groupOpt[g])}</option>`).join('')}</select></label>`}` +
      `<span class="spacer"></span><details class="menu"><summary class="btn small">${ICON.download}<span>${esc(SM.exportList)}</span></summary><div class="menu-list right"><button type="button" class="mi" data-smdl="xlsx">${esc(C.overview.dlXlsx)}</button><button type="button" class="mi" data-smdl="csv">${esc(C.overview.dlCsv)}</button></div></details></div>`;
    if (!all.length) { el.innerHTML = cards + `<div class="card empty"><b>${esc(SM.empty)}</b></div>`; return; }
    if (!rows.length) { el.innerHTML = cards + tools + U.noMatchHTML(SM.noMatch, o.used || []); return; }
    const S = settings(), idx = o.ctx.phaseIdx, phaseOf = d => { const k = R.primaryPhase(idx, d.deal_id); return k === R.UNSCHEDULED ? C.deal.unscheduled : k === R.NEEDS ? C.deal.needsPhase : R.phaseName(s, k); };
    const keyOf = { status: r => r.status, pic: r => r.deal.pic || '', phase: r => phaseOf(r.deal) }[by];
    const groups = new Map(); rows.forEach(r => { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    const order = by === 'status' ? R.SAMPLE_STATUSES.filter(k => groups.has(k)) : [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'th')));
    const shut = folded(), cols = 12;
    const row = r => { const sh = r.sh, d = r.deal, ok = edit && canEdit(d);
      return `<tr class="click" data-smrow="${esc(sh.shipment_id)}" data-deal="${esc(d.deal_id)}">${edit ? `<td class="cb">${ok ? `<input type="checkbox" data-smsel="${esc(sh.shipment_id)}"${sv.sel.has(sh.shipment_id) ? ' checked' : ''} aria-label="${esc(kolName(d))}">` : ''}</td>` : ''}` +
        `<td class="sm-kol sticky2"><span class="kname"><b>${esc(kolName(d))}</b>${U.copyBtnHTML(kolName(d))}</span></td><td class="sm-stage">${U.stageChip(d)}</td><td class="sm-items">${items(sh)}</td>` +
        `<td class="nowrap">${sh.ship_by ? esc(R.dmy(sh.ship_by)) : '—'}</td><td>${chip(r.status)}</td>` +
        `<td>${ok ? `<select class="sm-in" data-smcar="${esc(sh.shipment_id)}" aria-label="${esc(SM.col.carrier)}">${optionsHTML(S.carriers.concat(sh.carrier && !S.carriers.includes(sh.carrier) ? [sh.carrier] : []), sh.carrier || '', '—')}</select>` : esc(sh.carrier || '')}</td>` +
        `<td>${ok ? `<input class="sm-in" data-smtrkin="${esc(sh.shipment_id)}" value="${esc(sh.tracking_no || '')}" aria-label="${esc(SM.col.tracking)}" autocomplete="off">` : trackCell(sh)}</td>` +
        `<td class="nowrap">${sh.shipped_date ? esc(R.dmy(sh.shipped_date)) : '—'}</td><td class="${sh.delivered_date ? 'nowrap' : 'sm-dd'}">${sh.delivered_date ? esc(R.dmy(sh.delivered_date)) : sh.status === 'delivered' ? `<span class="muted small">${esc(SM.dateNotRecorded)}</span>` : '—'}</td>` +
        `<td class="nowrap">${onFile(d.kol_id) ? `<span class="chip ok-chip" title="${esc(SM.addressOnFile)}">${esc(SM.onFile)}</span>` : `<span class="muted small" title="${esc(SM.noAddress)}">${esc(SM.missing)}</span>`}</td><td>${esc(d.pic || '')}</td></tr>`; };
    const label = k => (by === 'status' ? SM.status[k] : k || C.deal.unassigned);
    const body = order.map(k => { const list = groups.get(k), open = !shut.has(k);
      return `<tr class="ghead"><td colspan="${cols}"><button type="button" class="gh" data-smfold="${esc(k)}" aria-expanded="${open}"><span class="chev${open ? ' open' : ''}">${ICON.chevron}</span><b class="gname">${esc(label(k))}</b><span class="muted">${R.fmtNum(list.length)}</span></button></td></tr>` + (open ? list.map(row).join('') : ''); }).join('');
    const C2 = SM.col, allSel = rows.filter(r => canEdit(r.deal)).every(r => sv.sel.has(r.sh.shipment_id));
    el.innerHTML = cards + tools + `<div class="tablewrap sm-wrap"><table class="tbl smtab${edit ? '' : ' nocb'}"><thead><tr>${edit ? `<th class="cb"><input type="checkbox" id="sm_all"${allSel && n ? ' checked' : ''} aria-label="${esc(C.deal.selectAll)}"></th>` : ''}` +
      `<th class="sticky2">${esc(C2.kol)}</th><th>${esc(C2.stage)}</th><th>${esc(C2.items)}</th><th>${esc(C2.shipBy)}</th><th>${esc(C2.status)}</th><th>${esc(C2.carrier)}</th><th>${esc(C2.tracking)}</th><th>${esc(C2.shipped)}</th><th>${esc(C2.delivered)}</th><th>${esc(C2.address)}</th><th>${esc(C2.pic)}</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function tabClick(e) {
    const o = sv.o; if (!o) return false;
    if (e.target.closest('a') || e.target.closest('[data-copyname]') || e.target.closest('details.menu > summary') || e.target.closest('.sm-in')) return true;
    const q = e.target.closest('[data-smq]'); if (q) { o.setFilter('sstatus', o.f.sstatus === q.dataset.smq ? '' : q.dataset.smq); return true; }
    if (e.target.id === 'sm_all') { const on = e.target.checked; sv.rows.filter(r => canEdit(r.deal)).forEach(r => (on ? sv.sel.add(r.sh.shipment_id) : sv.sel.delete(r.sh.shipment_id))); o.rerender(); return true; }
    const cb = e.target.closest('[data-smsel]'); if (cb) { cb.checked ? sv.sel.add(cb.dataset.smsel) : sv.sel.delete(cb.dataset.smsel); o.rerender(); return true; }
    if (e.target.closest('td.cb')) return true;
    const b = e.target.closest('[data-smbulk]'); if (b) { const ids = [...sv.sel]; action(b.dataset.smbulk, ids, () => { sv.sel.clear(); o.rerender(); }); return true; }
    if (e.target.closest('[data-smclear]')) { sv.sel.clear(); o.rerender(); return true; }
    const f = e.target.closest('[data-smfold]'); if (f) { const set = folded(), k = f.dataset.smfold; set.has(k) ? set.delete(k) : set.add(k); pref.set(foldKey(), JSON.stringify([...set])); o.rerender(); return true; }
    const d = e.target.closest('[data-smdl]'); if (d) { const m = d.closest('details'); if (m) m.open = false; exportList(d.dataset.smdl); return true; }
    const r = e.target.closest('[data-smrow]'); if (r) { o.openDeal(r.dataset.deal); return true; }
    return false;
  }
  function tabChange(e) {
    const o = sv.o; if (!o) return;
    if (e.target.id === 'sm_group') { pref.set('smgroup_' + (userId() || ''), e.target.value); o.rerender(); return; }
    const car = e.target.closest('[data-smcar]'); if (car) { apply([car.dataset.smcar], { kind: 'edit', carrier: car.value || null }, null, ''); return; }
    const trk = e.target.closest('[data-smtrkin]'); if (trk) apply([trk.dataset.smtrkin], { kind: 'edit', tracking_no: R.trim(trk.value) || null }, null, '');
  }
  /* §4.14 — the shipping list: rows on screen · Recipient / Phone / Address only while Payee details are unlocked (like Export PR) */
  async function exportList(fmt) {
    const o = sv.o, s = o.s, vault = s.lookups.payee_vault, open = vault && KT.vault.isUnlocked(vault) && U.can('payee.unlock'), idx = o.ctx.phaseIdx;
    const C2 = SM.col, header = [C2.kol, C2.phase, C2.items, C2.qty, C2.shipBy, C2.pic, C2.carrier, C2.tracking, C2.status].concat(open ? [SM.recipient, SM.phone, SM.address] : []);
    const recs = new Map();
    if (open) for (const r of sv.rows) { const p = payeeOf(r.deal.kol_id); if (p && p.secure_ship && !recs.has(r.deal.kol_id)) recs.set(r.deal.kol_id, await KT.vault.decrypt(p.secure_ship)); }
    const rows = sv.rows.map(r => { const ph = R.primaryPhase(idx, r.deal.deal_id), rec = recs.get(r.deal.kol_id) || {};
      return [kolName(r.deal), [R.campaignName(s, r.deal.campaign_id), ph && ph !== R.UNSCHEDULED && ph !== R.NEEDS ? R.phaseName(s, ph) : ''].filter(Boolean).join(' › '), R.itemsText(r.sh.items),
        (r.sh.items || []).reduce((a, x) => a + (Number(x.qty) || 0), 0), r.sh.ship_by ? R.dmy(r.sh.ship_by) : '', r.deal.pic || '', r.sh.carrier || '', r.sh.tracking_no || '', SM.status[r.status]]
        .concat(open ? [rec.ship_name || '', rec.ship_phone || '', rec.ship_address || ''] : []); });
    recs.clear();
    const camp = (s.campaigns.find(c => c.campaign_id === o.campaignId) || {}).campaign_name, name = KT.export.fileName(SM.file, KT.export.safeName(camp), o.td, fmt);
    if (fmt === 'csv') { U.downloadCSV(name, header, rows); return; }
    U.download(name, KT.xlsx.workbook([KT.export.sheetOf({ name: SM.sheet, header, rows, total: null })]), KT.xlsx.MIME); toast(C.io.exported(name, rows.length));
  }
  /* §4.14 — the Pipeline card's box icon: a shipment not delivered yet, coloured by status */
  function iconHTML(d) {
    const list = R.shipmentsOf(state(), d.deal_id).filter(x => !['delivered', 'not_required'].includes(x.status)); if (!list.length) return '';
    const sh = list[0], st = R.sampleStatus(sh, today()), dm = x => R.dmy(x).slice(0, 5);
    const tip = st === 'shipped' ? SM.track.shipped(sh.shipped_date ? dm(sh.shipped_date) : '', sh.carrier) : SM.icon(SM.status[st], sh.ship_by ? dm(sh.ship_by) : '');
    return `<span class="smicon sm-${st}" title="${esc(tip)}" aria-label="${esc(tip)}">📦</span>`;
  }

  return { trackHTML, sectionHTML, fillSecure, click, action, addDialog, shippingDialog, render, tabClick, tabChange, iconHTML, exportList, _sv: sv };
})();
