/* screen-payee.js — CR-08 §4.4: payees (Tax & terms · Bank details, encrypted · Documents) · CR-16 §4.2 · §4.3: the Payee & shipping tab of the
   KOL profile — more than one payee and shipping address for a KOL, each with one default (★) · Edit · Set as default · Archive (a payee a payment
   line used is never deleted) — and the dialogs used from there and from Payments · Unlock / Lock of the Payee vault · Set up / Change passphrase.
   Bank details and addresses go straight from the form into KT.vault.encrypt and are forgotten; only "bank ···last4" and the labels stay readable. → KT.payee */
KT.payee = (function () {
  'use strict';
  const U = KT.ui, V = KT.vault;
  const { C, R, $, esc, state, commit, toast, openDialog, closeDialog, dateHTML, optionsHTML, can, store, userId, ICON } = U;
  const PY = C.payee, VT = C.vault, SM = C.samples;
  const vaultOf = () => state().lookups.payee_vault || null;
  const userName = id => R.changedByName(state(), id);
  const nowISO = () => new Date().toISOString();
  const showArch = { payees: false, addresses: false };
  const canAddr = kol => R.canEditPayee(state(), U.actor(), null, kol);
  const unlockedView = () => V.isUnlocked(vaultOf()) && can('payee.unlock');
  const menuHTML = items => (items.filter(Boolean).length ? `<details class="menu"><summary class="icon-btn" aria-label="${esc(C.app.more)}" title="${esc(C.app.more)}">⋯</summary><div class="menu-list right">${items.join('')}</div></details>` : '');
  const mi = (attr, id, act, label, o = {}) => `<span class="mi-wrap"${o.tip ? ` title="${esc(o.tip)}"` : ''}><button type="button" class="mi${o.danger ? ' danger' : ''}" ${attr}="${esc(act)}" data-id="${esc(id)}"${o.off ? ' disabled' : ''}>${esc(label)}</button></span>`;

  /* ===================== CR-16 — the Payee & shipping tab ===================== */
  function tabHTML(kol) {
    const s = state(), vault = vaultOf(), all = R.payeesOfKol(s, kol.kol_id, true), addrs = R.addressesOfKol(s, kol.kol_id, true);
    const liveP = all.filter(p => !p.archived), archP = all.filter(p => p.archived), liveA = addrs.filter(a => !a.archived), archA = addrs.filter(a => a.archived);
    const anySecure = all.some(p => p.secure) || addrs.some(a => a.secure);
    const unlock = anySecure && vault && V.available() && can('payee.unlock') && !V.isUnlocked(vault) ? `<div class="py-unlock"><span class="muted small">🔒 ${esc(PY.lockedNote)}</span><button type="button" class="btn small" data-payee-unlock>${ICON.lock || ''}${esc(PY.unlockToView)}</button></div>` : '';
    const archToggle = (key, n) => (n ? `<button type="button" class="link small" data-show-arch="${key}">${esc(showArch[key] ? PY.hideArchived(n) : PY.showArchived(n))}</button>` : '');
    const payees = (liveP.length ? liveP.map(p => payeeCardHTML(s, kol, p)).join('') : `<div class="hint">${esc(PY.none)}</div>`) +
      (showArch.payees ? archP.map(p => payeeCardHTML(s, kol, p)).join('') : '') + archToggle('payees', archP.length);
    const addresses = (liveA.length ? liveA.map(a => addressCardHTML(s, kol, a)).join('') : `<div class="hint">${esc(PY.noAddresses)}</div>`) +
      (showArch.addresses ? archA.map(a => addressCardHTML(s, kol, a)).join('') : '') + archToggle('addresses', archA.length);
    const addP = R.canEditPayee(s, U.actor(), null, kol) ? `<button type="button" class="btn small" data-payee-add>${esc(PY.addPayeeBtn)}</button>` : '';
    const addA = canAddr(kol) ? `<button type="button" class="btn small" data-addr-add>${esc(PY.addAddressBtn)}</button>` : '';
    return unlock + `<div class="kpm-2"><div class="kpm-col"><section class="sec"><div class="sec-h"><span>${esc(PY.payeesN(liveP.length))}</span>${addP}</div><div class="pcards">${payees}</div></section></div>` +
      `<div class="kpm-col"><section class="sec"><div class="sec-h"><span>${esc(PY.addressesN(liveA.length))}</span>${addA}</div><p class="hint" style="margin-top:0">${esc(PY.addressHint)}</p><div class="pcards">${addresses}</div></section></div></div>`;
  }
  const defChip = () => `<span class="chip def-chip" title="${esc(PY.defaultTip)}">★ ${esc(PY.default)}</span>`;
  function payeeCardHTML(s, kol, p) {
    const S = R.paySettings(s.lookups), miss = R.payeeDocsMissing(p), a = R.payeeActions(s, p), ok = R.canEditPayee(s, U.actor(), p, kol), use = R.payeeUse(s, p.payee_id);
    const terms = [PY.types[p.payee_type], p.vat_registered ? PY.vatShort : PY.noVat, PY.whtShort(p.default_wht_rate != null ? p.default_wht_rate : S.default_wht_individual), PY.basisShort[p.price_basis]].join(' · ');
    const bank = p.secure ? `<b>${esc(PY.bankLine(p.bank_name, p.account_last4))}</b>${p.details_updated_at ? ` <span class="muted small">${esc(PY.updatedBy(R.dmy(p.details_updated_at.slice(0, 10)), userName(p.details_updated_by)))}</span>` : ''}`
      : `<span class="chip warn-chip">${esc(PY.missing(PY.missingBank))}</span>`;
    const verify = p.needs_verification ? `<div class="chip err-chip" style="margin-top:6px">${esc(PY.needsVerify(R.dmy((p.details_updated_at || '').slice(0, 10)), userName(p.details_updated_by)))}</div>` +
        (can('payee.verify') ? ` <button type="button" class="btn small" data-payee-verify="${esc(p.payee_id)}">${esc(PY.markVerified)}</button>` : '')
      : p.verified_at ? `<div class="muted small">${esc(PY.verifiedBy(R.dmy(p.verified_at.slice(0, 10)), userName(p.verified_by)))}</div>` : '';
    const need = p.payee_type === 'company' ? ['company_cert', 'bank_book'].concat(p.vat_registered ? ['vat_cert'] : []) : ['id_copy', 'bank_book'];
    const docs = need.map(k => { const d = (p.docs || {})[k]; return `<span class="chip${d ? ' ok-chip' : ''}" title="${esc(d ? PY.received(R.dmy(d)) : '')}">${d ? '✓ ' : ''}${esc(PY.docs[k])}${d ? ` ${esc(R.dmy(d).slice(0, 5))}` : ''}</span>`; }).join('');
    const sum = !miss.length ? `<span class="chip ok-chip">✓ ${esc(PY.docsOnFile)}</span>` : `<span class="chip warn-chip">${esc(PY.missing(miss.map(k => (k === 'bank_details' ? PY.missingBank : PY.docs[k])).join(' · ')))}</span>`;
    const menu = ok ? menuHTML([
      a.canSetDefault ? mi('data-payee-act', p.payee_id, 'default', PY.setDefault) : '',
      !p.archived ? mi('data-payee-act', p.payee_id, 'archive', PY.archive, { off: !a.canArchive, tip: p.is_default ? PY.cannotArchiveDefault : '' }) : '',
      a.canRestore ? mi('data-payee-act', p.payee_id, 'restore', PY.restore) : '',
      mi('data-payee-act', p.payee_id, 'delete', PY.del, { danger: true, off: !a.canDelete, tip: a.canDelete ? '' : use.lines || use.deals ? PY.cannotDeleteUsed(use.lines, use.deals) : PY.cannotDeleteDefault }),
    ]) : '';
    return `<div class="pcard${p.archived ? ' arch' : ''}" data-pcard="${esc(p.payee_id)}"><div class="pc-h"><b class="pc-l">${esc(p.label || PY.primary)}</b>${p.is_default ? defChip() : ''}${p.archived ? `<span class="chip">${esc(PY.archived)}</span>` : ''}` +
      `<span class="spacer"></span>${ok && !p.archived ? `<button type="button" class="btn small" data-payee-edit="${esc(p.payee_id)}">${esc(PY.editBtn)}</button>` : ''}${menu}</div>` +
      `<div class="pc-m">${esc(terms)}</div><div class="py-bank">${bank}</div>${verify}` +
      (p.secure && unlockedView() ? `<div class="py-secure" data-payee-secure="${esc(p.payee_id)}"><span class="muted small">…</span></div>` : '') +
      `<div class="py-docs">${sum}${docs}</div>` + (p.docs_link ? `<div class="small" style="margin-top:6px"><a href="${esc(p.docs_link)}" target="_blank" rel="noopener">${esc(PY.openFolder)}</a></div>` : '') + `</div>`;
  }
  function addressCardHTML(s, kol, a) {
    const act = R.addressActions(s, a), ok = canAddr(kol), n = R.addressUse(s, a.address_id);
    const menu = ok ? menuHTML([
      act.canSetDefault ? mi('data-addr-act', a.address_id, 'default', PY.setDefault) : '',
      !a.archived ? mi('data-addr-act', a.address_id, 'archive', PY.archive, { off: !act.canArchive, tip: a.is_default ? PY.cannotArchiveDefaultAddr : '' }) : '',
      act.canRestore ? mi('data-addr-act', a.address_id, 'restore', PY.restore) : '',
      mi('data-addr-act', a.address_id, 'delete', PY.del, { danger: true, off: !act.canDelete, tip: act.canDelete ? '' : n ? PY.cannotDeleteAddr(n) : PY.cannotDeleteDefault }),
    ]) : '';
    return `<div class="pcard${a.archived ? ' arch' : ''}" data-acard="${esc(a.address_id)}"><div class="pc-h"><b class="pc-l">${esc(a.label)}</b>${a.is_default ? defChip() : ''}${a.archived ? `<span class="chip">${esc(PY.archived)}</span>` : ''}` +
      `<span class="spacer"></span>${ok && !a.archived ? `<button type="button" class="btn small" data-addr-edit="${esc(a.address_id)}">${esc(PY.editBtn)}</button>` : ''}${menu}</div>` +
      `<div class="py-bank">${a.secure ? `<span class="chip ok-chip">🔒 ${esc(SM.addressOnFile)}</span>` : `<span class="chip warn-chip">${esc(SM.noAddress)}</span>`}` +
      (a.details_updated_at ? ` <span class="muted small">${esc(PY.updatedBy(R.dmy(a.details_updated_at.slice(0, 10)), userName(a.details_updated_by)))}</span>` : '') + `</div>` +
      (a.secure && unlockedView() ? `<div class="sm-shipsecure" data-addrsecure="${esc(a.address_id)}"><span class="muted small">…</span></div>` : '') +
      (n ? `<div class="muted small">${esc(PY.addrUsed(n))}</div>` : '') + `</div>`;
  }
  /* after the tab is drawn: the payees / addresses decrypted into the page (memory only, while unlocked) */
  async function fillSecure(root) {
    KT.samples.fillSecure(root);
    if (!root) return;
    for (const box of [...root.querySelectorAll('[data-payee-secure]')]) {
      const p = R.payeeById(state(), box.dataset.payeeSecure), rec = p && p.secure ? await V.decrypt(p.secure) : null;
      if (!rec || !box.isConnected) { box.innerHTML = ''; continue; }
      const row = (k, v, o = {}) => (!v ? '' : `<div class="py-row"><span class="l">${esc(PY.bank[k])}</span><span class="v">${o.mask ? `<span class="py-val" data-full="${esc(v)}">${esc(mask(v))}</span>` : `<span>${esc(v)}</span>`}` +
        (o.mask ? `<button type="button" class="icon-btn sm" data-payee-reveal aria-label="${esc(PY.show)}" title="${esc(PY.show)}">👁</button>` : '') +
        (o.copy ? `<button type="button" class="copybtn" data-payee-copy="${esc(v)}" data-label="${esc(PY.bank[k])}" title="${esc(PY.copyField(PY.bank[k]))}" aria-label="${esc(PY.copyField(PY.bank[k]))}">${COPY}</button>` : '') + `</span></div>`);
      box.innerHTML = row('account_name', rec.account_name, { copy: 1 }) + row('bank_name', rec.bank_name) + row('account_no', rec.account_no, { mask: 1, copy: 1 }) + row('full_name', rec.full_name, { copy: 1 }) +
        row('id_address', rec.id_address) + row('phone', rec.phone) + row('wht_contact', rec.wht_contact) + row('tax_id', rec.tax_id);
    }
  }
  const COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>';
  const mask = v => { const d = String(v).replace(/\D/g, ''); return '•••••' + d.slice(-4); };
  /* clicks inside the tab · → true when handled */
  function onClick(e, kol, rerender) {
    const el = sel => e.target.closest(sel);
    if (el('[data-payee-add]')) { openDialog_({ kolId: kol.kol_id, newPayee: true, onSaved: rerender, opener: el('[data-payee-add]') }); return true; }
    const pe = el('[data-payee-edit]'); if (pe) { openDialog_(pe.dataset.payeeEdit ? { payeeId: pe.dataset.payeeEdit, onSaved: rerender, opener: pe } : { kolId: kol.kol_id, onSaved: rerender, opener: pe }); return true; }
    const pa = el('[data-payee-act]'); if (pa) { const m = pa.closest('details'); if (m) m.open = false; if (!pa.disabled) payeeAction(pa.dataset.payeeAct, pa.dataset.id, kol, rerender); return true; }
    if (el('[data-addr-add]')) { addressDialog({ kolId: kol.kol_id, onSaved: rerender, opener: el('[data-addr-add]') }); return true; }
    const ae = el('[data-addr-edit]'); if (ae) { addressDialog({ addressId: ae.dataset.addrEdit, onSaved: rerender, opener: ae }); return true; }
    const aa = el('[data-addr-act]'); if (aa) { const m = aa.closest('details'); if (m) m.open = false; if (!aa.disabled) addressAction(aa.dataset.addrAct, aa.dataset.id, kol, rerender); return true; }
    const sa = el('[data-show-arch]'); if (sa) { showArch[sa.dataset.showArch] = !showArch[sa.dataset.showArch]; rerender(); return true; }
    if (el('[data-smship]')) { KT.samples.shippingDialog(kol.kol_id, rerender); return true; }
    if (el('[data-payee-unlock]')) { unlockDialog(rerender); return true; }
    const vf = el('[data-payee-verify]');
    if (vf) { if (!U.guard('payee.verify')) return true; const p = R.payeeById(state(), vf.dataset.payeeVerify); if (p) { Object.assign(p, { needs_verification: false, verified_at: nowISO(), verified_by: userId() }); commit(PY.verified); rerender(); } return true; }
    const rv = el('[data-payee-reveal]');
    if (rv) { const v = rv.parentElement.querySelector('.py-val'), open = v.dataset.open === '1'; v.textContent = open ? mask(v.dataset.full) : v.dataset.full; v.dataset.open = open ? '' : '1'; rv.title = open ? PY.show : PY.hide; V.touch(); return true; }
    const cp = el('[data-payee-copy]');
    if (cp) { U.copyText(cp.dataset.payeeCopy).then(ok => toast(ok ? PY.copiedField(cp.dataset.label) : C.copy.failed)); V.touch(); return true; }
    return false;
  }
  /* ★ Set as default · Archive (never the default) · Restore · Delete (never used by a payment line or a deal) */
  async function payeeAction(act, id, kol, rerender) {
    const s = state(), p = R.payeeById(s, id); if (!p || !R.canEditPayee(s, U.actor(), p, kol)) { toast(PY.noPermission); return; }
    const a = R.payeeActions(s, p), label = p.label || PY.primary;
    if (act === 'default' && a.canSetDefault) { R.withDefault(s.payee_profiles, 'payee_id', id); commit(PY.defaultSet(label)); }
    else if (act === 'archive' && a.canArchive) { p.archived = true; commit(PY.archivedToast(label)); }
    else if (act === 'restore' && a.canRestore) { p.archived = false; if (!R.payeesOfKol(s, p.kol_id).some(x => x.is_default && x.payee_id !== id)) R.withDefault(s.payee_profiles, 'payee_id', id); commit(PY.restoredToast(label)); }
    else if (act === 'delete' && a.canDelete) {
      if (!(await U.confirmDialog(PY.deleteTitle(label), PY.deleteBody, PY.del, true))) return;
      s.payee_profiles = s.payee_profiles.filter(x => x.payee_id !== id);
      const next = R.payeesOfKol(s, p.kol_id)[0]; if (next && !next.is_default) R.withDefault(s.payee_profiles, 'payee_id', next.payee_id);
      commit(PY.deletedToast(label));
    } else return;
    rerender();
  }
  async function addressAction(act, id, kol, rerender) {
    const s = state(), a0 = R.addressById(s, id); if (!a0 || !canAddr(kol)) { toast(SM.onlyPic); return; }
    const a = R.addressActions(s, a0), label = a0.label;
    if (act === 'default' && a.canSetDefault) { R.withDefault(s.shipping_addresses, 'address_id', id); commit(PY.defaultSet(label)); }
    else if (act === 'archive' && a.canArchive) { a0.archived = true; commit(PY.archivedToast(label)); }
    else if (act === 'restore' && a.canRestore) { a0.archived = false; if (!R.addressesOfKol(s, a0.kol_id).some(x => x.is_default && x.address_id !== id)) R.withDefault(s.shipping_addresses, 'address_id', id); commit(PY.restoredToast(label)); }
    else if (act === 'delete' && a.canDelete) {
      if (!(await U.confirmDialog(PY.deleteTitle(label), PY.deleteAddrBody, PY.del, true))) return;
      s.shipping_addresses = s.shipping_addresses.filter(x => x.address_id !== id);
      const next = R.addressesOfKol(s, a0.kol_id)[0]; if (next && !next.is_default) R.withDefault(s.shipping_addresses, 'address_id', next.address_id);
      commit(PY.deletedToast(label));
    } else return;
    rerender();
  }

  /* ===================== §4.3 — + Add address / Edit (modal M): Label · Recipient · Phone · Address (encrypted at once) · default ===================== */
  /* o: {kolId | addressId, onSaved(rec), opener} */
  function addressDialog(o) {
    const s = state(), stored = o.addressId ? R.addressById(s, o.addressId) : null, kolId = stored ? stored.kol_id : o.kolId, kol = R.kolById(s, kolId), vault = vaultOf();
    if (!kol || !canAddr(kol)) { toast(SM.onlyPic); return; }
    if (!vault) { toast(SM.needVault); return; }
    if (!V.available()) { toast(PY.noCrypto); return; }
    const others = R.addressesOfKol(s, kolId).filter(a => !stored || a.address_id !== stored.address_id), first = !others.length;
    /* a saved address while locked: kept unless Replace is chosen · unlocked: shown to change */
    let mode = stored && stored.secure && !V.isUnlocked(vault) ? 'saved' : 'edit', original = null, typed = false;
    const inputs = () => `<div class="field wide"><label for="ad_recipient">${esc(PY.recipient)} <span class="req">*</span></label><input id="ad_recipient" data-ship="recipient" autocomplete="off" spellcheck="false"></div>` +
      `<div class="field"><label for="ad_phone">${esc(SM.shipPhone)}</label><input id="ad_phone" data-ship="phone" inputmode="tel" autocomplete="off"></div>` +
      `<div class="field wide"><label for="ad_address">${esc(SM.shipAddress)} <span class="req">*</span></label><textarea id="ad_address" data-ship="address" autocomplete="off"></textarea></div>`;
    const shipHTML = () => (mode === 'saved' ? `<div class="py-saved"><b>🔒 ${esc(SM.addressOnFile)}</b><span class="spacer"></span>` +
      (can('payee.unlock') ? `<button type="button" class="btn small" data-ad-unlock>${esc(PY.unlockToEdit)}</button>` : '') + `<button type="button" class="btn small" data-ad-replace>${esc(PY.replaceAddress)}</button></div>`
      : (mode === 'replace' ? `<div class="hint" style="margin-bottom:8px">${esc(PY.replaceAddressHint)} <button type="button" class="link" data-ad-keep>${esc(PY.keepSaved)}</button></div>` : '') + `<div class="fields">${inputs()}</div>`);
    U.createModal({ size: 'M', title: stored ? PY.editAddressTitle(stored.label) : PY.addAddressTitle(kol.display_name), opener: o.opener, isDirty: () => typed, onClose: () => wipe(),
      foot: [`<div class="checks" id="ad_checks"></div>`, U.cmButtons(stored ? C.common.save : PY.addAddressOk, 'ad_ok')], body: `<div class="py-dlg">
      <div class="fields"><div class="field"><label for="ad_label">${esc(PY.label)} <span class="req">*</span></label><input id="ad_label" maxlength="${R.PAYEE_LABEL_MAX}" value="${esc(stored ? stored.label : first ? PY.primary : '')}" placeholder="${esc(PY.addrLabelPh)}" autocomplete="off"></div>
        <div class="field"><label>&nbsp;</label><label class="tick"><input type="checkbox" id="ad_default"${stored ? (stored.is_default ? ' checked disabled' : '') : first ? ' checked disabled' : ''}> ${esc(PY.makeDefault)}</label></div></div>
      <div class="sec-h" style="margin-top:14px"><span>${esc(SM.shippingDetails)}</span></div><p class="hint" style="margin-top:0">${esc(SM.shippingHint)}</p>
      <div id="ad_ship">${shipHTML()}</div></div>` });
    const root = $('cm_root');
    root.addEventListener('input', () => { typed = true; }); root.addEventListener('change', () => { typed = true; });
    const fillOriginal = async () => {
      if (mode !== 'edit' || !stored || !stored.secure) return;
      original = R.readShip(await V.decrypt(stored.secure));
      if (original) ['recipient', 'phone', 'address'].forEach(k => { const el2 = root.querySelector(`[data-ship="${k}"]`); if (el2) el2.value = original[k] || ''; });
    };
    const redraw = () => { $('ad_ship').innerHTML = shipHTML(); fillOriginal(); };
    fillOriginal();
    $('ad_ship').addEventListener('click', e => {
      if (e.target.closest('[data-ad-replace]')) { mode = 'replace'; redraw(); const f = $('ad_recipient'); if (f) f.focus(); return; }
      if (e.target.closest('[data-ad-keep]')) { mode = 'saved'; redraw(); return; }
      if (e.target.closest('[data-ad-unlock]')) { U.closeModal(); unlockDialog(() => addressDialog(o)); }
    });
    function wipe() { root.querySelectorAll('[data-ship]').forEach(el2 => { el2.value = ''; }); original = null; }
    $('ad_ok').addEventListener('click', async () => {
      const s2 = state(), label = R.trim($('ad_label').value), ship = mode === 'saved' ? null : Object.fromEntries(['recipient', 'phone', 'address'].map(k => [k, ($(`ad_${k}`) || {}).value || '']));
      const errs = R.validateAddressLabel(s2, kolId, label, stored ? stored.address_id : null).concat(ship ? R.validateShip(ship) : []);
      if (ship && R.looksSensitive(label)) errs.push({ field: 'label', msg: C.msg.sensitive });
      root.querySelectorAll('#ad_label,[data-ship]').forEach(el2 => el2.classList.toggle('invalid', errs.some(x => x.field === (el2.dataset.ship || 'label'))));
      $('ad_checks').innerHTML = U.checksHTML({ errs, warns: [], infos: [] }, '');
      if (errs.length) return;
      const changed = !!ship && (!original || ['recipient', 'phone', 'address'].some(k => R.trim(ship[k]) !== R.trim(original[k] || '')));
      $('ad_ok').disabled = true; $('ad_ok').textContent = PY.encrypting;
      let secure = null;
      if (changed) { try { secure = await V.encrypt(vaultOf(), R.shipRecord(ship)); } catch (e) { $('ad_ok').disabled = false; $('ad_ok').textContent = C.common.save; toast(PY.noCrypto); return; } }
      wipe();
      const s3 = state(), now = nowISO(), uid = userId(), makeDefault = $('ad_default').checked;
      let rec = stored ? R.addressById(s3, stored.address_id) : null;
      if (!rec) { rec = R.newAddress({ address_id: store.newId('address'), kol_id: kolId, label, is_default: false, secure, now, user: uid }); s3.shipping_addresses.push(rec); }
      else { rec.label = label; if (changed) rec.secure = secure; }
      if (changed) Object.assign(rec, { details_updated_at: now, details_updated_by: uid });
      if (makeDefault || !R.addressesOfKol(s3, kolId).some(a => a.is_default && a.address_id !== rec.address_id)) R.withDefault(s3.shipping_addresses, 'address_id', rec.address_id);
      U.closeModal(); commit(SM.shippingSaved);
      if (o.onSaved) o.onSaved(rec);
    });
  }

  /* ===================== the Payee dialog (the profile · Payments chips) ===================== */
  /* o: {kolId (its default payee, made when there is none) | kolId + newPayee (+ Add payee) | payeeId | newPayee (a payee outside KOL Master), onSaved, opener} ·
     CR-11 §4.3: a modal (M) — Add payee for a new one, Save for one that exists · CR-16 §4.2: Label · Set as default */
  function openDialog_(o) {
    const s = state(), byId = o.payeeId ? R.payeeById(s, o.payeeId) : null, kol = byId ? (byId.kol_id ? R.kolById(s, byId.kol_id) : null) : o.kolId ? R.kolById(s, o.kolId) : null;
    const stored = byId || (kol && !o.newPayee ? R.payeeOfKol(s, kol.kol_id) : null);
    if (!R.canEditPayee(s, U.actor(), stored, kol)) { toast(PY.noPermission); return; }
    const S = R.paySettings(s.lookups), vault = vaultOf();
    const others = kol ? R.payeesOfKol(s, kol.kol_id).filter(p => !stored || p.payee_id !== stored.payee_id) : [], first = !!kol && !others.length;
    const p = stored ? JSON.parse(JSON.stringify(stored)) : R.blankPayee(s, { kol_id: kol ? kol.kol_id : null, user: userId(), now: nowISO(), label: first ? PY.primary : '' });
    if (!stored && kol && !first) p.label = '';
    const name = kol ? kol.display_name : p.account_handle || PY.newPayeeTitle;
    /* how the bank part works now: none (no vault / no crypto) · saved (locked, details saved) · edit (empty or unlocked) · replace */
    let mode = !V.available() ? 'nocrypto' : !vault ? 'novault' : p.secure && !V.isUnlocked(vault) ? 'saved' : 'edit';
    let original = null;
    const bankInputs = () => R.BANK_FIELDS.map(k => `<div class="field${k === 'id_address' || k === 'wht_contact' ? ' wide' : ''}"><label for="py_b_${k}">${esc(PY.bank[k])}${['account_name', 'bank_name', 'account_no', 'full_name'].includes(k) ? ' <span class="req">*</span>' : ''}</label>` +
      `<input id="py_b_${k}" data-bank="${k}" autocomplete="off" spellcheck="false"${k === 'bank_name' ? ' list="py_banks"' : ''}${k === 'account_no' || k === 'tax_id' || k === 'phone' ? ' inputmode="numeric"' : ''}${mode === 'edit' || mode === 'replace' ? '' : ' disabled'}></div>`).join('') +
      `<datalist id="py_banks">${PY.banks.map(b => `<option value="${esc(b)}">`).join('')}</datalist>`;
    const bankHTML = () => {
      if (mode === 'nocrypto') return `<div class="check warn">! <span>${esc(PY.noCrypto)}</span></div><div class="fields">${bankInputs()}</div>`;
      if (mode === 'novault') return `<div class="check warn">! <span>${esc(PY.vaultNotSetUp)}</span>${can('vault.admin') ? ` <button type="button" class="btn small" data-py-setup>${esc(PY.setUpVault)}</button>` : ''}</div><div class="fields">${bankInputs()}</div>`;
      if (mode === 'saved') return `<div class="py-saved"><b>${esc(PY.savedLast4(p.bank_name, p.account_last4))}</b><span class="spacer"></span>` +
        (can('payee.unlock') ? `<button type="button" class="btn small" data-py-unlock>${esc(PY.unlockToEdit)}</button>` : '') + `<button type="button" class="btn small" data-py-replace>${esc(PY.replace)}</button></div>`;
      return (mode === 'replace' ? `<div class="hint" style="margin-bottom:8px">${esc(PY.replaceHint)} <button type="button" class="link" data-py-keep>${esc(PY.keepSaved)}</button></div>` : '') + `<div class="fields">${bankInputs()}</div>`;
    };
    const rates = S.wht_rates.map(r => ({ value: String(r), label: `${r}%` }));
    let typed = false;
    U.createModal({ size: 'M', title: PY.title(name), opener: o.opener, isDirty: () => typed, onClose: () => wipe(),
      foot: [`<div class="checks" id="py_checks"></div>`, U.cmButtons(stored ? C.common.save : PY.addOk, 'py_ok')], body: `<div class="py-dlg">
      ${kol ? `<div class="fields"><div class="field"><label for="py_label">${esc(PY.label)} <span class="req">*</span></label><input id="py_label" maxlength="${R.PAYEE_LABEL_MAX}" value="${esc(p.label || '')}" placeholder="${esc(PY.labelPh)}" autocomplete="off"><div class="hint">${esc(PY.labelHint)}</div></div>
        <div class="field"><label>&nbsp;</label><label class="tick"><input type="checkbox" id="py_default"${stored ? (stored.is_default ? ' checked disabled' : '') : first ? ' checked disabled' : ''}> ${esc(PY.makeDefault)}</label></div></div>` : ''}
      <div class="sec-h"${kol ? ' style="margin-top:14px"' : ''}><span>${esc(PY.groupTax)}</span></div>
      <div class="fields">
        ${kol ? '' : `<div class="field wide"><label for="py_handle">${esc(PY.handle)} <span class="req">*</span></label><input id="py_handle" value="${esc(p.account_handle || '')}" autocomplete="off" placeholder="${esc(PY.handlePh)}"></div>`}
        <div class="field"><label for="py_type">${esc(PY.type)}</label><select id="py_type">${optionsHTML(R.PAYEE_TYPES.map(t => ({ value: t, label: PY.types[t] })), p.payee_type)}</select></div>
        <div class="field"><label for="py_wht">${esc(PY.wht)}</label><select id="py_wht">${optionsHTML(rates, String(p.default_wht_rate))}</select></div>
        <div class="field"><label for="py_basis">${esc(PY.basis)}</label><select id="py_basis">${optionsHTML(R.PRICE_BASES.map(b => ({ value: b, label: PY.bases[b] })), p.price_basis)}</select></div>
        <div class="field"><label>&nbsp;</label><label class="tick"><input type="checkbox" id="py_vat"${p.vat_registered ? ' checked' : ''}> ${esc(PY.vat)}</label></div>
      </div>
      <div class="sec-h" style="margin-top:14px"><span>${esc(PY.groupBank)}</span></div><p class="hint" style="margin-top:0">🔒 ${esc(PY.groupBankHint)}</p>
      <div id="py_bank">${bankHTML()}</div>
      <div class="sec-h" style="margin-top:14px"><span>${esc(PY.groupDocs)}</span></div>
      <div class="fields">${R.PAYEE_DOCS.map(k => `<div class="field"><label>${esc(PY.docs[k])}</label>${dateHTML(`id="py_d_${k}"`, (p.docs || {})[k], { label: PY.docs[k] })}</div>`).join('')}
        <div class="field wide"><label for="py_link">${esc(PY.docsLink)}</label><input id="py_link" type="url" value="${esc(p.docs_link || '')}" placeholder="${esc(PY.docsLinkPh)}" autocomplete="off"></div></div></div>` });
    const dlg = $('cm_root');
    dlg.addEventListener('input', () => { typed = true; }); dlg.addEventListener('change', () => { typed = true; });
    const fillOriginal = async () => {
      if (mode !== 'edit' || !p.secure) return;
      original = await V.decrypt(p.secure);
      if (original) R.BANK_FIELDS.forEach(k => { const el = $('py_b_' + k); if (el) el.value = original[k] || ''; });
    };
    const redrawBank = () => { $('py_bank').innerHTML = bankHTML(); fillOriginal(); };
    fillOriginal();
    $('py_type').addEventListener('change', e => { const t = e.target.value; $('py_wht').value = String(t === 'company' ? S.default_wht_company : S.default_wht_individual); });
    dlg.querySelector('#py_bank').addEventListener('click', e => {
      if (e.target.closest('[data-py-replace]')) { mode = 'replace'; redrawBank(); const f = $('py_b_account_name'); if (f) f.focus(); return; }
      if (e.target.closest('[data-py-keep]')) { mode = 'saved'; redrawBank(); return; }
      if (e.target.closest('[data-py-unlock]')) { U.closeModal(); unlockDialog(() => openDialog_(o)); return; }
      if (e.target.closest('[data-py-setup]')) { U.closeModal(); location.hash = '#settings/payments'; }
    });
    /* the typed values leave the page as soon as the modal closes */
    function wipe() { dlg.querySelectorAll('[data-bank]').forEach(el => { el.value = ''; }); original = null; }
    const read = () => {
      const docs = Object.fromEntries(R.PAYEE_DOCS.map(k => [k, $('py_d_' + k).value || null]));
      return Object.assign({ payee_type: $('py_type').value, default_wht_rate: Number($('py_wht').value), price_basis: $('py_basis').value, vat_registered: $('py_vat').checked, docs, docs_link: R.trim($('py_link').value) || null },
        kol ? { label: R.trim($('py_label').value) } : { account_handle: R.trim($('py_handle').value).replace(/^@+/, '') });
    };
    const readBank = () => (mode === 'edit' || mode === 'replace' ? Object.fromEntries(R.BANK_FIELDS.map(k => [k, ($('py_b_' + k) || {}).value || ''])) : null);
    $('py_ok').addEventListener('click', async () => {
      const s2 = state(), plain = read(), bank = readBank();
      const res = R.validatePayee(s2, plain);
      const typed = bank && R.BANK_FIELDS.some(k => R.trim(bank[k]));
      const changed = typed && (!original || R.BANK_FIELDS.some(k => R.trim(bank[k]) !== R.trim(original[k] || '')));
      if (mode === 'replace' && !typed) res.errs.push({ field: 'b_account_name', msg: C.msg.payeeRequired(PY.bank.account_name) });
      if (!kol && !plain.account_handle) res.errs.push({ field: 'handle', msg: C.msg.payeeRequired(PY.handle) });
      if (!kol && R.looksSensitive(plain.account_handle)) res.errs.push({ field: 'handle', msg: C.msg.sensitive });
      if (kol) R.validatePayeeLabel(s2, kol.kol_id, plain.label, stored ? stored.payee_id : null).forEach(x => res.errs.push(x));   // CR-16 §4.2
      if ($('py_label')) $('py_label').classList.toggle('invalid', res.errs.some(x => x.field === 'label'));
      if (changed) R.validateBankDetails(bank).errs.forEach(x => res.errs.push(x));
      dlg.querySelectorAll('[data-bank]').forEach(el => el.classList.toggle('invalid', res.errs.some(x => x.field === 'b_' + el.dataset.bank)));
      $('py_checks').innerHTML = U.checksHTML(res, '');
      if (res.errs.length) return;
      if (!R.canEditPayee(s2, U.actor(), stored, kol)) { toast(PY.noPermission); return; }
      const makeDefault = !!($('py_default') && $('py_default').checked && !$('py_default').disabled);
      const plainChanged = !stored || makeDefault || ['payee_type', 'default_wht_rate', 'price_basis', 'vat_registered', 'docs_link', 'account_handle', 'label'].some(k => k in plain && plain[k] !== stored[k]) || R.PAYEE_DOCS.some(k => (plain.docs[k] || null) !== ((stored.docs || {})[k] || null));
      if (!changed && !plainChanged) { wipe(); U.closeModal(); toast(PY.nothingChanged); return; }
      $('py_ok').disabled = true; $('py_ok').textContent = PY.encrypting;
      let secure = null;
      if (changed) { try { secure = await V.encrypt(vaultOf(), R.bankRecord(bank)); } catch (e) { $('py_ok').disabled = false; $('py_ok').textContent = C.common.save; toast(PY.noCrypto); return; } }
      const s3 = state(), now = nowISO(), uid = userId();
      let rec = stored ? R.payeeById(s3, stored.payee_id) : null;
      if (!rec) { rec = Object.assign(p, { payee_id: store.newId('payee'), is_default: false }); s3.payee_profiles.push(rec); }
      Object.assign(rec, plain, { updated_at: now, updated_by: uid });
      /* CR-16 §4.2 — one default a KOL: the first payee is it · ticked = it takes over */
      if (kol && (makeDefault || !R.payeesOfKol(s3, kol.kol_id).some(x => x.is_default && x.payee_id !== rec.payee_id))) R.withDefault(s3.payee_profiles, 'payee_id', rec.payee_id);
      if (changed) {
        Object.assign(rec, { secure, bank_name: R.trim(bank.bank_name) || null, account_last4: R.last4(bank.account_no), details_version: (rec.details_version || 0) + 1, details_updated_at: now, details_updated_by: uid });
        /* §4.4 — bank details changed after a payment was made to them → verify with the KOL before the next submit */
        if (R.payeeHasPaid(s3, rec.payee_id)) Object.assign(rec, { needs_verification: true, verified_at: null, verified_by: null });
        s3.deal_events.push({ event_id: store.newEventId(), deal_id: null, payee_id: rec.payee_id, type: 'payee_details_changed', from: null, to: null, changed_at: now, changed_by: uid, note: null });
      }
      wipe(); U.closeModal(); commit(PY.savedToast(kol && rec.label ? `${name} · ${rec.label}` : name));
      if (o.onSaved) o.onSaved(rec);
    });
  }

  /* ===================== vault: unlock · set up · change passphrase ===================== */
  function unlockDialog(after) {
    const vault = vaultOf(); if (!vault || !U.guard('payee.unlock')) return;
    openDialog(`<div class="dlg-h">${esc(VT.unlockTitle)}</div><div class="dlg-b"><p class="hint" style="margin-top:0">${esc(VT.unlockExplain)}</p>
      <div class="field"><label for="vu_pass">${esc(VT.pass)}</label><input type="password" id="vu_pass" autocomplete="off"></div><div class="checks" id="vu_checks" style="margin-top:8px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="vu_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="vu_ok">${esc(VT.unlockOk)}</button></div>`);
    const go2 = async () => {
      const pass = $('vu_pass').value; if (!pass) return;
      $('vu_ok').disabled = true; $('vu_ok').textContent = VT.working;
      const ok = await V.unlock(vault, pass);
      $('vu_pass').value = '';
      if (!ok) { $('vu_ok').disabled = false; $('vu_ok').textContent = VT.unlockOk; $('vu_checks').innerHTML = `<div class="check err">✕ <span>${esc(VT.wrong)}</span></div>`; $('vu_pass').focus(); return; }
      closeDialog(); if (after) after();
    };
    $('vu_ok').addEventListener('click', go2);
    $('vu_pass').addEventListener('keydown', e => { if (e.key === 'Enter') go2(); });
    $('vu_cancel').addEventListener('click', () => { $('vu_pass').value = ''; closeDialog(); });
    $('vu_pass').focus();
  }
  /* passphrase rules: ≥ 12 characters, typed twice the same */
  const passErrs = (a, b) => (a.length < 12 ? [{ field: 'p1', msg: VT.passShort }] : a !== b ? [{ field: 'p2', msg: VT.passMismatch }] : []);
  /* CR-11 §4.3 — Set up the vault: a create modal (M) · the passphrase only lives in these two boxes, cleared on close */
  function setupDialog(after, opener) {
    if (!U.guard('vault.admin') || vaultOf()) return;
    const clear = () => { ['vs_p1', 'vs_p2'].forEach(id => { if ($(id)) $(id).value = ''; }); };
    U.createModal({ size: 'M', title: VT.setUpTitle, opener, onClose: clear, foot: [`<div class="checks" id="vs_checks"></div>`, U.cmButtons(VT.setUp, 'vs_ok')],
      body: `<div class="check warn">! <span>${esc(VT.setUpExplain)}</span></div>
      <div class="fields" style="margin-top:12px"><div class="field wide"><label for="vs_p1">${esc(VT.pass)}</label><input type="password" id="vs_p1" autocomplete="new-password"><div class="hint">${esc(VT.passHint)}</div></div>
        <div class="field wide"><label for="vs_p2">${esc(VT.pass2)}</label><input type="password" id="vs_p2" autocomplete="new-password"></div></div>` });
    $('vs_ok').addEventListener('click', async () => {
      const a = $('vs_p1').value, b = $('vs_p2').value, errs = passErrs(a, b);
      $('vs_checks').innerHTML = U.checksHTML({ errs, warns: [], infos: [] }, ''); if (errs.length || !U.guard('vault.admin')) return;
      $('vs_ok').disabled = true; $('vs_ok').textContent = VT.working;
      const meta = await V.setup(a, { now: nowISO(), user: userId() });
      clear(); state().lookups.payee_vault = meta; U.closeModal(); commit(VT.setUpDone); if (after) after();
    });
  }
  function changeDialog(after) {
    const vault = vaultOf(); if (!vault || !U.guard('vault.admin')) return;
    openDialog(`<div class="dlg-h">${esc(VT.changeTitle)}</div><div class="dlg-b"><div class="fields">
        <div class="field wide"><label for="vc_old">${esc(VT.oldPass)}</label><input type="password" id="vc_old" autocomplete="off"></div>
        <div class="field wide"><label for="vc_p1">${esc(VT.newPass)}</label><input type="password" id="vc_p1" autocomplete="new-password"><div class="hint">${esc(VT.passHint)}</div></div>
        <div class="field wide"><label for="vc_p2">${esc(VT.pass2)}</label><input type="password" id="vc_p2" autocomplete="new-password"></div></div><div class="checks" id="vc_checks" style="margin-top:8px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="vc_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="vc_ok">${esc(VT.change)}</button></div>`);
    const clear = () => { ['vc_old', 'vc_p1', 'vc_p2'].forEach(id => { if ($(id)) $(id).value = ''; }); };
    $('vc_cancel').addEventListener('click', () => { clear(); closeDialog(); });
    $('vc_ok').addEventListener('click', async () => {
      const errs = passErrs($('vc_p1').value, $('vc_p2').value);
      $('vc_checks').innerHTML = U.checksHTML({ errs, warns: [], infos: [] }, ''); if (errs.length) return;
      $('vc_ok').disabled = true; $('vc_ok').textContent = VT.working;
      const next = await V.changePassphrase(vaultOf(), $('vc_old').value, $('vc_p1').value, { now: nowISO() });
      if (!next) { $('vc_ok').disabled = false; $('vc_ok').textContent = VT.change; $('vc_checks').innerHTML = `<div class="check err">✕ <span>${esc(VT.wrong)}</span></div>`; return; }
      clear(); state().lookups.payee_vault = next; closeDialog(); commit(VT.changed); if (after) after();
    });
  }

  /* §4.4 forgotten passphrase: delete every encrypted record (typed RESET) — bank name, last 4 and documents stay */
  function resetDialog(after) {
    if (!vaultOf() || !U.guard('vault.admin')) return;
    openDialog(`<div class="dlg-h">${esc(VT.resetTitle)}</div><div class="dlg-b"><div class="check err">✕ <span>${esc(VT.resetExplain)}</span></div>
      <div class="field" style="margin-top:12px"><label for="vr_word">${esc(VT.resetType)}</label><input id="vr_word" autocomplete="off" spellcheck="false"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="vr_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn danger" id="vr_ok" disabled>${esc(VT.reset)}</button></div>`);
    $('vr_word').addEventListener('input', e => { $('vr_ok').disabled = e.target.value.trim() !== VT.resetWord; });
    $('vr_cancel').addEventListener('click', closeDialog);
    $('vr_ok').addEventListener('click', () => {
      if ($('vr_word').value.trim() !== VT.resetWord || !U.guard('vault.admin')) return;
      V.lock(); const n = R.resetVault(state()); closeDialog(); commit(VT.resetDone(n)); if (after) after();
    });
  }

  /* ===================== CR-30 §3.5 — New KOL › Payee & shipping (optional) ===================== */
  /* the section of a create form: locked until the vault is unlocked (Unlock to add) · a shipping address (Label · Recipient · Address · Phone) and a bank
     account (Bank · Account name · Account number) · what is typed goes straight into KT.vault.encrypt when the KOL is created and the boxes are wiped —
     it never sits in the state, localStorage, a backup or a log · on screen afterwards only labels: "Home" · "Kasikorn Bank (KBank) ···1234" */
  const nkvState = () => { const v = vaultOf(); return !v || !V.available() ? 'none' : V.isUnlocked(v) && can('payee.unlock') ? 'open' : 'locked'; };
  const NKV_SHIP = ['label', 'recipient', 'address', 'phone'], NKV_BANK = ['bank_name', 'account_name', 'account_no'];
  function nkVaultHTML(prefix) {
    const NK = C.newKol, st = nkvState(), id = k => `${prefix}_v_${k}`;
    const inp = (k, label, o = {}) => `<div class="field${o.wide ? ' wide' : ''}"><label for="${id(k)}">${esc(label)}</label>${o.area ? `<textarea id="${id(k)}" data-nkv="${k}" data-key="nkv_${k}" rows="2" spellcheck="false"></textarea>`
      : `<input id="${id(k)}" data-nkv="${k}" data-key="nkv_${k}" autocomplete="off" spellcheck="false"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.list ? ` list="${o.list}"` : ''}${o.num ? ' inputmode="numeric"' : ''}>`}</div>`;
    const body = st === 'none' ? `<div class="hint">${esc(NK.vaultNone)}</div>`
      : st === 'locked' ? `<div class="nk-lock">🔒 <span>${esc(NK.vaultLocked)}</span>${can('payee.unlock') ? `<button type="button" class="btn small" data-nkvunlock>${esc(NK.unlockToAdd)}</button>` : ''}<span class="muted small">${esc(NK.vaultSkip)}</span></div>`
      : `<h4>${esc(NK.shipH)}</h4><div class="fields">${inp('label', PY.label, { ph: PY.addrLabelPh })}${inp('recipient', PY.recipient)}${inp('address', SM.shipAddress, { area: 1, wide: 1 })}${inp('phone', SM.shipPhone, { num: 1 })}</div>` +
        `<h4>${esc(NK.bankH)}</h4><div class="fields">${inp('bank_name', PY.bank.bank_name, { list: prefix + '_banks' })}${inp('account_name', PY.bank.account_name)}${inp('account_no', PY.bank.account_no, { num: 1 })}</div>` +
        `<datalist id="${prefix}_banks">${(PY.banks || []).map(b => `<option value="${esc(b)}">`).join('')}</datalist><div class="hint">${esc(NK.bankLater)}</div>`;
    return `<details class="nk-vault" id="${prefix}_vault"${st === 'open' ? ' open' : ''}><summary>${st === 'open' ? '🔓' : '🔒'} ${esc(NK.vault)}</summary><div class="nk-vb">${body}</div></details>`;
  }
  /* what is typed (nothing kept anywhere else) → { ship | null, bank | null } — a part left empty is skipped */
  function nkVaultRead(root) {
    if (!root || nkvState() !== 'open') return { ship: null, bank: null };
    const val = k => { const el = root.querySelector(`[data-nkv="${k}"]`); return el ? el.value : ''; };
    const ship = Object.fromEntries(NKV_SHIP.map(k => [k, val(k)])), bank = Object.fromEntries(NKV_BANK.map(k => [k, val(k)]));
    return { ship: NKV_SHIP.some(k => R.trim(ship[k])) ? ship : null, bank: NKV_BANK.some(k => R.trim(bank[k])) ? bank : null };
  }
  /* the checks (a part that is started must be complete) · error keys nkv_<field> · Full name and the rest of the bank details: later, in Payee details */
  function nkVaultCheck(x) {
    const errs = [];
    if (x.ship) {
      if (!R.trim(x.ship.label)) errs.push({ field: 'nkv_label', msg: C.msg.payeeRequired(PY.label) });
      else if (R.looksSensitive(x.ship.label)) errs.push({ field: 'nkv_label', msg: C.msg.sensitive });
      R.validateShip(x.ship).forEach(e => errs.push({ field: 'nkv_' + e.field, msg: e.msg }));
    }
    if (x.bank) R.validateBankDetails(Object.assign({ full_name: '-' }, x.bank)).errs.forEach(e => errs.push({ field: 'nkv_' + e.field.replace(/^b_/, ''), msg: e.msg }));
    return errs;
  }
  /* after the KOL is pushed: the address and the payee, encrypted, each the KOL's default → { address, payee } (null for a part not given) · throws when the browser cannot encrypt */
  async function nkVaultSave(kolId, x) {
    const v = vaultOf(), s = state(), now = nowISO(), uid = userId(), out = { address: null, payee: null };
    if (!v || !(x.ship || x.bank)) return out;
    const shipSecure = x.ship ? await V.encrypt(v, R.shipRecord(x.ship)) : null, bankSecure = x.bank ? await V.encrypt(v, R.bankRecord(Object.assign({ full_name: '' }, x.bank))) : null;
    if (x.ship) { const rec = R.newAddress({ address_id: store.newId('address'), kol_id: kolId, label: R.trim(x.ship.label), is_default: true, secure: shipSecure, now, user: uid }); s.shipping_addresses.push(rec); R.withDefault(s.shipping_addresses, 'address_id', rec.address_id); out.address = rec; }
    if (x.bank) {
      const p = R.blankPayee(s, { payee_id: store.newId('payee'), kol_id: kolId, user: uid, now });
      Object.assign(p, { secure: bankSecure, bank_name: R.trim(x.bank.bank_name) || null, account_last4: R.last4(x.bank.account_no), details_version: 1, details_updated_at: now, details_updated_by: uid });
      s.payee_profiles.push(p); R.withDefault(s.payee_profiles, 'payee_id', p.payee_id); out.payee = p;
      s.deal_events.push({ event_id: store.newEventId(), deal_id: null, payee_id: p.payee_id, type: 'payee_details_changed', from: null, to: null, changed_at: now, changed_by: uid, note: null });
    }
    return out;
  }
  /* CR-31 §2.3 — Ship to › + New address, in place (Move stage · Mark shipped · Edit shipment): locked until the vault is unlocked (Unlock to add) ·
     Label · Recipient name · Address · Phone · Set as default · encrypted when the form is saved (addrInlineSave) — the boxes are wiped, only the label stays */
  const AI_FIELDS = ['label', 'recipient', 'address', 'phone'];
  function addrInlineHTML(prefix, v, o = {}) {
    const st = nkvState(), MV = C.move, x = v || {}, id = k => `${prefix}_ai_${k}`;
    if (st === 'none') return `<div class="ai-box hint">${esc(C.newKol.vaultNone)}</div>`;
    /* o.inlinePass — inside a small dialog (Mark shipped · Edit shipment): the passphrase is typed here — the Unlock dialog would take that dialog's place */
    if (st === 'locked') return `<div class="ai-box nk-lock">🔒 <span>${esc(C.newKol.vaultLocked)}</span>${!can('payee.unlock') ? '' : o.inlinePass
      ? `<span class="ai-pass"><input type="password" data-aipass aria-label="${esc(VT.pass)}" placeholder="${esc(VT.pass)}" autocomplete="off"><button type="button" class="btn small" data-aiunlockgo>${esc(VT.unlockOk)}</button></span><span class="err" data-aipasserr></span>`
      : `<button type="button" class="btn small" data-aiunlock>${esc(C.newKol.unlockToAdd)}</button>`}</div>`;
    const inp = (k, label, o = {}) => `<div class="field${o.wide ? ' wide' : ''}"><label for="${id(k)}">${esc(label)}${o.req ? ' <span class="req">*</span>' : ''}</label>` +
      (o.area ? `<textarea id="${id(k)}" data-ai="${k}" data-key="ai_${k}" rows="2" spellcheck="false">${esc(x[k] || '')}</textarea>` : `<input id="${id(k)}" data-ai="${k}" data-key="ai_${k}" value="${esc(x[k] || '')}" autocomplete="off" spellcheck="false"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.num ? ' inputmode="numeric"' : ''}>`) + `<div class="mv-err" data-err="ai_${k}"></div></div>`;
    return `<div class="ai-box"><div class="ai-h">🔓 ${esc(MV.newAddressH)}</div><div class="fields">${inp('label', PY.label, { req: 1, ph: PY.addrLabelPh })}${inp('recipient', PY.recipient, { req: 1 })}${inp('address', SM.shipAddress, { area: 1, wide: 1, req: 1 })}${inp('phone', SM.shipPhone, { num: 1 })}` +
      `<div class="field wide"><label class="tick"><input type="checkbox" data-ai="default"${x.default ? ' checked' : ''}> ${esc(MV.setDefault)}</label></div></div></div>`;
  }
  /* the passphrase typed in the box (o.inlinePass) → true once the vault is open · the box is cleared either way */
  async function addrInlineUnlock(root) {
    const inp = root && root.querySelector('[data-aipass]'), err = root && root.querySelector('[data-aipasserr]'), btn = root && root.querySelector('[data-aiunlockgo]');
    const vault = vaultOf(); if (!inp || !vault || !inp.value) return false;
    if (btn) { btn.disabled = true; btn.textContent = VT.working; }
    const ok = await V.unlock(vault, inp.value); inp.value = '';
    if (!ok) { if (btn) { btn.disabled = false; btn.textContent = VT.unlockOk; } if (err) err.textContent = VT.wrong; inp.focus(); }
    return ok;
  }
  /* what is typed (kept only by the form while it is open) · null while locked / no vault */
  function addrInlineRead(root) {
    if (!root || nkvState() !== 'open' || !root.querySelector('[data-ai="label"]')) return null;
    const out = Object.fromEntries(AI_FIELDS.map(k => [k, (root.querySelector(`[data-ai="${k}"]`) || {}).value || '']));
    out.default = !!(root.querySelector('[data-ai="default"]') || {}).checked;
    return out;
  }
  /* the checks → [{ field: ai_label | ai_recipient | ai_address, msg }] (locked or no vault: one line) */
  function addrInlineCheck(kolId, x) {
    if (!x) return [{ field: 'ai_box', msg: nkvState() === 'none' ? C.newKol.vaultNone : C.newKol.vaultLocked }];
    const s = state(), errs = R.validateAddressLabel(s, kolId, x.label, null).concat(R.validateShip(x));
    return errs.map(e => ({ field: 'ai_' + e.field, msg: e.msg }));
  }
  /* encrypted → the address record (its default when ticked or the KOL has none) */
  async function addrInlineSave(kolId, x) {
    const v = vaultOf(), s = state(), now = nowISO(), uid = userId();
    const secure = await V.encrypt(v, R.shipRecord(x));
    const rec = R.newAddress({ address_id: store.newId('address'), kol_id: kolId, label: R.trim(x.label), is_default: false, secure, now, user: uid });
    s.shipping_addresses.push(rec);
    if (x.default || !R.addressesOfKol(s, kolId).some(a => a.is_default && a.address_id !== rec.address_id)) R.withDefault(s.shipping_addresses, 'address_id', rec.address_id);
    return rec;
  }
  const nkVaultWipe = root => { if (root) root.querySelectorAll('[data-nkv]').forEach(el => { el.value = ''; }); };
  /* the labels left on screen (never the details) */
  const nkVaultLabels = out => [out.address ? out.address.label : '', out.payee ? PY.bankLine(out.payee.bank_name, out.payee.account_last4) : ''].filter(Boolean).join(' · ');

  return { tabHTML, fillSecure, onClick, openDialog: openDialog_, addressDialog, unlockDialog, setupDialog, changeDialog, resetDialog,
    nkVaultHTML, nkVaultRead, nkVaultCheck, nkVaultSave, nkVaultWipe, nkVaultLabels, nkVaultState: nkvState, addrInlineHTML, addrInlineUnlock, addrInlineRead, addrInlineCheck, addrInlineSave };
})();
