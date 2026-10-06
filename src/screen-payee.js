/* screen-payee.js — CR-08 §4.4: the Payee of a KOL (Tax & terms · Bank details, encrypted · Documents) — the section in the KOL drawer and
   the one dialog used from the KOL drawer and from Payments · Unlock / Lock of the Payee vault · Set up / Change passphrase.
   Bank details go straight from the form into KT.vault.encrypt and are forgotten; only "bank ···last4" is kept readable. → KT.payee */
KT.payee = (function () {
  'use strict';
  const U = KT.ui, V = KT.vault;
  const { C, R, $, esc, state, commit, toast, openDialog, closeDialog, dateHTML, optionsHTML, can, store, userId, ICON } = U;
  const PY = C.payee, VT = C.vault;
  const vaultOf = () => state().lookups.payee_vault || null;
  const userName = id => R.changedByName(state(), id);
  const nowISO = () => new Date().toISOString();

  /* ===================== the section in the KOL drawer ===================== */
  function bodyHTML(kol) {
    const s = state(), p = R.payeeOfKol(s, kol.kol_id), vault = vaultOf(), canEdit = R.canEditPayee(s, U.actor(), p, kol);
    if (!p) return `<div class="hint">${esc(PY.none)}</div>` + (canEdit ? `<button type="button" class="btn small" data-payee-edit style="margin-top:8px">${esc(PY.add)}</button>` : '');
    const S = R.paySettings(s.lookups), miss = R.payeeDocsMissing(p);
    const terms = [PY.types[p.payee_type], p.vat_registered ? PY.vatShort : PY.noVat, PY.whtShort(p.default_wht_rate != null ? p.default_wht_rate : S.default_wht_individual), PY.basisShort[p.price_basis]].join(' · ');
    const bank = p.secure ? `<b>${esc(PY.bankLine(p.bank_name, p.account_last4))}</b>${p.details_updated_at ? ` <span class="muted small">${esc(PY.updatedBy(R.dmy(p.details_updated_at.slice(0, 10)), userName(p.details_updated_by)))}</span>` : ''}`
      : `<span class="chip warn-chip">${esc(PY.missing(PY.missingBank))}</span>`;
    const verify = p.needs_verification ? `<div class="chip err-chip" style="margin-top:6px">${esc(PY.needsVerify(R.dmy((p.details_updated_at || '').slice(0, 10)), userName(p.details_updated_by)))}</div>` +
        (can('payee.verify') ? ` <button type="button" class="btn small" data-payee-verify="${esc(p.payee_id)}">${esc(PY.markVerified)}</button>` : '')
      : p.verified_at ? `<div class="muted small">${esc(PY.verifiedBy(R.dmy(p.verified_at.slice(0, 10)), userName(p.verified_by)))}</div>` : '';
    const need = p.payee_type === 'company' ? ['company_cert', 'bank_book'].concat(p.vat_registered ? ['vat_cert'] : []) : ['id_copy', 'bank_book'];
    const docs = need.map(k => { const d = (p.docs || {})[k]; return `<span class="chip${d ? ' ok-chip' : ''}" title="${esc(d ? PY.received(R.dmy(d)) : '')}">${d ? '✓ ' : ''}${esc(PY.docs[k])}${d ? ` ${esc(R.dmy(d).slice(0, 5))}` : ''}</span>`; }).join('');
    const sum = !miss.length ? `<span class="chip ok-chip">✓ ${esc(PY.docsOnFile)}</span>` : `<span class="chip warn-chip">${esc(PY.missing(miss.map(k => (k === 'bank_details' ? PY.missingBank : PY.docs[k])).join(' · ')))}</span>`;
    const unlockBtn = p.secure && vault && V.available() && can('payee.unlock') && !V.isUnlocked(vault) ? `<button type="button" class="btn small" data-payee-unlock>${ICON.lock || ''}${esc(PY.unlockToView)}</button>` : '';
    return `<div class="kv"><span>${esc(PY.groupTax)}</span><b>${esc(terms)}</b></div>` +
      `<div class="py-bank">${bank}</div>${verify}` +
      (p.secure && V.isUnlocked(vault) ? `<div class="py-secure" data-payee-secure="${esc(p.payee_id)}"><span class="muted small">…</span></div>` : '') +
      `<div class="py-docs">${sum}${docs}</div>` +
      (p.docs_link ? `<div class="small" style="margin-top:6px"><a href="${esc(p.docs_link)}" target="_blank" rel="noopener">${esc(PY.openFolder)}</a></div>` : '') +
      (unlockBtn ? `<div style="margin-top:8px">${unlockBtn}</div>` : '');
  }
  const editBtn = kol => (R.canEditPayee(state(), U.actor(), R.payeeOfKol(state(), kol.kol_id), kol) ? `<button type="button" class="icon-btn edit-sec" data-payee-edit title="${esc(PY.edit)}" aria-label="${esc(PY.edit)}">${PENCIL}</button>` : '');
  const PENCIL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 2.6l2.8 2.8L6 12.8H3.2V10z"/></svg>';
  /* after the drawer is drawn: decrypt the open payee into the page (memory only) */
  async function fillSecure(root) {
    const box = root && root.querySelector('[data-payee-secure]'); if (!box) return;
    const p = R.payeeById(state(), box.dataset.payeeSecure), rec = p ? await V.decrypt(p.secure) : null;
    if (!rec || !box.isConnected) { box.innerHTML = ''; return; }
    const row = (k, v, o = {}) => (!v ? '' : `<div class="py-row"><span class="l">${esc(PY.bank[k])}</span><span class="v">${o.mask ? `<span class="py-val" data-full="${esc(v)}">${esc(mask(v))}</span>` : `<span>${esc(v)}</span>`}` +
      (o.mask ? `<button type="button" class="icon-btn sm" data-payee-reveal aria-label="${esc(PY.show)}" title="${esc(PY.show)}">👁</button>` : '') +
      (o.copy ? `<button type="button" class="copybtn" data-payee-copy="${esc(v)}" data-label="${esc(PY.bank[k])}" title="${esc(PY.copyField(PY.bank[k]))}" aria-label="${esc(PY.copyField(PY.bank[k]))}">${COPY}</button>` : '') + `</span></div>`);
    box.innerHTML = row('account_name', rec.account_name, { copy: 1 }) + row('bank_name', rec.bank_name) + row('account_no', rec.account_no, { mask: 1, copy: 1 }) + row('full_name', rec.full_name, { copy: 1 }) +
      row('id_address', rec.id_address) + row('phone', rec.phone) + row('wht_contact', rec.wht_contact) + row('tax_id', rec.tax_id);
  }
  const COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"/></svg>';
  const mask = v => { const d = String(v).replace(/\D/g, ''); return '•••••' + d.slice(-4); };
  /* clicks inside the section · → true when handled */
  function onClick(e, kol, rerender) {
    if (e.target.closest('[data-payee-edit]')) { openDialog_({ kolId: kol.kol_id, onSaved: rerender }); return true; }
    if (e.target.closest('[data-payee-unlock]')) { unlockDialog(rerender); return true; }
    const vf = e.target.closest('[data-payee-verify]');
    if (vf) { if (!U.guard('payee.verify')) return true; const p = R.payeeById(state(), vf.dataset.payeeVerify); if (p) { Object.assign(p, { needs_verification: false, verified_at: nowISO(), verified_by: userId() }); commit(PY.verified); rerender(); } return true; }
    const rv = e.target.closest('[data-payee-reveal]');
    if (rv) { const v = rv.parentElement.querySelector('.py-val'), open = v.dataset.open === '1'; v.textContent = open ? mask(v.dataset.full) : v.dataset.full; v.dataset.open = open ? '' : '1'; rv.title = open ? PY.show : PY.hide; V.touch(); return true; }
    const cp = e.target.closest('[data-payee-copy]');
    if (cp) { U.copyText(cp.dataset.payeeCopy).then(ok => toast(ok ? PY.copiedField(cp.dataset.label) : C.copy.failed)); V.touch(); return true; }
    return false;
  }

  /* ===================== the Payee dialog (KOL drawer ✎ · Payments chips) ===================== */
  /* o: {kolId | payeeId, onSaved} */
  function openDialog_(o) {
    const s = state(), kol = o.kolId ? R.kolById(s, o.kolId) : null, stored = kol ? R.payeeOfKol(s, kol.kol_id) : o.newPayee ? null : R.payeeById(s, o.payeeId);
    if (!R.canEditPayee(s, U.actor(), stored, kol)) { toast(PY.noPermission); return; }
    const S = R.paySettings(s.lookups), vault = vaultOf();
    const p = stored ? JSON.parse(JSON.stringify(stored)) : R.blankPayee(s, { kol_id: kol ? kol.kol_id : null, user: userId(), now: nowISO() });
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
    openDialog(`<div class="dlg-h">${esc(PY.title(name))}</div><div class="dlg-b py-dlg">
      <div class="sec-h"><span>${esc(PY.groupTax)}</span></div>
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
        <div class="field wide"><label for="py_link">${esc(PY.docsLink)}</label><input id="py_link" type="url" value="${esc(p.docs_link || '')}" placeholder="${esc(PY.docsLinkPh)}" autocomplete="off"></div></div>
      <div class="checks" id="py_checks" style="margin-top:12px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="py_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="py_ok">${esc(C.common.save)}</button></div>`, 'mid');
    const dlg = $('dlg');
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
      if (e.target.closest('[data-py-unlock]')) { closeDialog(); unlockDialog(() => openDialog_(o)); return; }
      if (e.target.closest('[data-py-setup]')) { closeDialog(); location.hash = '#settings/payments'; }
    });
    $('py_cancel').addEventListener('click', () => { wipe(); closeDialog(); });
    /* the typed values leave the page as soon as the dialog closes */
    const wipe = () => { dlg.querySelectorAll('[data-bank]').forEach(el => { el.value = ''; }); original = null; };
    dlg.addEventListener('close', wipe, { once: true });
    const read = () => {
      const docs = Object.fromEntries(R.PAYEE_DOCS.map(k => [k, $('py_d_' + k).value || null]));
      return Object.assign({ payee_type: $('py_type').value, default_wht_rate: Number($('py_wht').value), price_basis: $('py_basis').value, vat_registered: $('py_vat').checked, docs, docs_link: R.trim($('py_link').value) || null },
        kol ? {} : { account_handle: R.trim($('py_handle').value).replace(/^@+/, '') });
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
      if (changed) R.validateBankDetails(bank).errs.forEach(x => res.errs.push(x));
      dlg.querySelectorAll('[data-bank]').forEach(el => el.classList.toggle('invalid', res.errs.some(x => x.field === 'b_' + el.dataset.bank)));
      $('py_checks').innerHTML = U.checksHTML(res, '');
      if (res.errs.length) return;
      if (!R.canEditPayee(s2, U.actor(), stored, kol)) { toast(PY.noPermission); return; }
      const plainChanged = !stored || ['payee_type', 'default_wht_rate', 'price_basis', 'vat_registered', 'docs_link', 'account_handle'].some(k => k in plain && plain[k] !== stored[k]) || R.PAYEE_DOCS.some(k => (plain.docs[k] || null) !== ((stored.docs || {})[k] || null));
      if (!changed && !plainChanged) { wipe(); closeDialog(); toast(PY.nothingChanged); return; }
      $('py_ok').disabled = true; $('py_ok').textContent = PY.encrypting;
      let secure = null;
      if (changed) { try { secure = await V.encrypt(vaultOf(), R.bankRecord(bank)); } catch (e) { $('py_ok').disabled = false; $('py_ok').textContent = C.common.save; toast(PY.noCrypto); return; } }
      const s3 = state(), now = nowISO(), uid = userId();
      let rec = kol ? R.payeeOfKol(s3, kol.kol_id) : R.payeeById(s3, p.payee_id);
      if (!rec) { rec = Object.assign(p, { payee_id: store.newId('payee') }); s3.payee_profiles.push(rec); }
      Object.assign(rec, plain, { updated_at: now, updated_by: uid });
      if (changed) {
        Object.assign(rec, { secure, bank_name: R.trim(bank.bank_name) || null, account_last4: R.last4(bank.account_no), details_version: (rec.details_version || 0) + 1, details_updated_at: now, details_updated_by: uid });
        /* §4.4 — bank details changed after a payment was made to them → verify with the KOL before the next submit */
        if (R.payeeHasPaid(s3, rec.payee_id)) Object.assign(rec, { needs_verification: true, verified_at: null, verified_by: null });
        s3.deal_events.push({ event_id: store.newEventId(), deal_id: null, payee_id: rec.payee_id, type: 'payee_details_changed', from: null, to: null, changed_at: now, changed_by: uid, note: null });
      }
      wipe(); closeDialog(); commit(PY.savedToast(name));
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
  function setupDialog(after) {
    if (!U.guard('vault.admin') || vaultOf()) return;
    openDialog(`<div class="dlg-h">${esc(VT.setUpTitle)}</div><div class="dlg-b"><div class="check warn">! <span>${esc(VT.setUpExplain)}</span></div>
      <div class="fields" style="margin-top:12px"><div class="field wide"><label for="vs_p1">${esc(VT.pass)}</label><input type="password" id="vs_p1" autocomplete="new-password"><div class="hint">${esc(VT.passHint)}</div></div>
        <div class="field wide"><label for="vs_p2">${esc(VT.pass2)}</label><input type="password" id="vs_p2" autocomplete="new-password"></div></div><div class="checks" id="vs_checks" style="margin-top:8px"></div></div>
      <div class="dlg-f"><button type="button" class="btn" id="vs_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="vs_ok">${esc(VT.setUp)}</button></div>`);
    const clear = () => { ['vs_p1', 'vs_p2'].forEach(id => { if ($(id)) $(id).value = ''; }); };
    $('vs_cancel').addEventListener('click', () => { clear(); closeDialog(); });
    $('vs_ok').addEventListener('click', async () => {
      const a = $('vs_p1').value, b = $('vs_p2').value, errs = passErrs(a, b);
      $('vs_checks').innerHTML = U.checksHTML({ errs, warns: [], infos: [] }, ''); if (errs.length || !U.guard('vault.admin')) return;
      $('vs_ok').disabled = true; $('vs_ok').textContent = VT.working;
      const meta = await V.setup(a, { now: nowISO(), user: userId() });
      clear(); state().lookups.payee_vault = meta; closeDialog(); commit(VT.setUpDone); if (after) after();
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

  return { bodyHTML, editBtn, fillSecure, onClick, openDialog: openDialog_, unlockDialog, setupDialog, changeDialog, resetDialog };
})();
