/* screen-docs.js — CR-33 §3.2: one document slot, the same in the Payee form and in Payment details:
   [Upload file] (PDF / JPG / PNG / WEBP · 5 MB · encrypted with the vault into IndexedDB — KT.docfiles) or [Link] (https · shown as "Google Drive ↗") ·
   a file shows its name + 👁 Preview (the vault unlocked) · Replace · Remove · a link: Change · Remove · Received dd/mm (set by itself · it can be changed).
   The caller keeps the references ({ file_id, name, mime, bytes } | { url }) and decides when they are saved. → KT.docs */
KT.docs = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, esc, state, toast, dateHTML } = U;
  const DK = () => C.pay.docs;
  const kb = n => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  /* "Google Drive ↗" · else the site */
  function linkLabel(url) {
    let h = ''; try { h = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return DK().linkWord; }
    return /(^|\.)(drive|docs)\.google\.com$/.test(h) ? 'Google Drive' : h;
  }
  /* o = { id, label, doc ({ file_id, name, bytes, url, received_at }), edit, fromPayee (read-only · "From payee"), editLink (html: where to change it), hint, extra (html under it), req } */
  function slotHTML(o) {
    const d = o.doc || {}, has = !!d.file_id || /^https:\/\//i.test(d.url || ''), D = DK();
    const status = has ? `<span class="chip ok-chip">✓ ${esc(o.fromPayee ? D.fromPayee : D.attached)}</span>` : d.received_at ? `<span class="chip">${esc(D.notAttached)}</span>` : `<span class="chip warn-chip">${esc(D.missingDoc)}</span>`;
    const body = d.file_id ? `<span class="ds-file">📄 <span class="ds-name">${esc(d.name || D.file)}</span>${d.bytes ? ` <span class="muted small">${esc(kb(d.bytes))}</span>` : ''}</span>` +
        `<button type="button" class="link small" data-dsprev="${esc(d.file_id)}" data-dsname="${esc(d.name || '')}">👁 ${esc(D.preview)}</button>` +
        (o.edit ? `<button type="button" class="link small" data-dspick>${esc(D.replace)}</button><button type="button" class="link small danger" data-dsrm>${esc(D.remove)}</button>` : '')
      : /^https:\/\//i.test(d.url || '') ? `<a class="link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel(d.url))} ↗</a>` +
        (o.edit ? `<button type="button" class="link small" data-dslinkon>${esc(D.change)}</button><button type="button" class="link small danger" data-dsrm>${esc(D.remove)}</button>` : '')
      : (d.received_at ? `<span class="muted small">${esc(D.receivedNoFile(R.dmy(d.received_at).slice(0, 5)))}</span>` : '') +
        (o.edit ? `<button type="button" class="btn small" data-dspick>${esc(D.upload)}</button><button type="button" class="btn small" data-dslinkon>${esc(D.link)}</button>` : '');
    const linkRow = o.edit ? `<div class="ds-linkrow hidden"><input type="url" data-dsurl placeholder="${esc(D.linkPh)}" value="${esc(d.url || '')}" aria-label="${esc(D.link)} · ${esc(o.label)}" autocomplete="off">` +
      `<button type="button" class="btn small primary" data-dslinkok>${esc(D.saveLink)}</button><button type="button" class="btn small" data-dslinkoff>${esc(C.common.cancel)}</button></div>` : '';
    const rec = has && o.edit && !o.fromPayee ? `<span class="ds-rec"><label class="muted small" for="${esc(o.id)}_rec">${esc(D.received)}</label>${dateHTML(`data-dsrec id="${esc(o.id)}_rec"`, d.received_at || '', { label: D.received })}</span>`
      : has && d.received_at ? `<span class="muted small">${esc(D.receivedOn(R.dmy(d.received_at)))}</span>` : '';
    return `<div class="dslot${has ? ' got' : ''}" data-dslot="${esc(o.id)}"><div class="ds-h"><b>${esc(o.label)}</b>${o.req ? ' <span class="req">*</span>' : ''} ${status}${o.fromPayee && o.editLink ? ` <span class="ds-from">${o.editLink}</span>` : ''}</div>` +
      `<div class="ds-b">${body}${rec}</div>${linkRow}${o.extra ? `<div class="ds-x">${o.extra}</div>` : ''}${o.hint ? `<div class="hint">${esc(o.hint)}</div>` : ''}` +
      (o.edit ? `<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" data-dsfile hidden>` : '') + `<div class="ds-err" data-dserr></div></div>`;
  }
  /* clicks / changes inside root → h.onFile(slotId, file) · h.onLink(slotId, url) · h.onRemove(slotId) · h.onDate(slotId, date) (each may be async) · Preview here */
  function wire(root, h) {
    if (!root || root._dsWired) return; root._dsWired = true;
    const slotOf = el => el.closest('[data-dslot]');
    const err = (slot, msg) => { const e = slot && slot.querySelector('[data-dserr]'); if (e) e.innerHTML = msg ? `<div class="check err">✕ <span>${esc(msg)}</span></div>` : ''; };
    root.addEventListener('click', e => {
      const slot = slotOf(e.target); if (!slot) return;
      const t = e.target.closest('[data-dspick],[data-dslinkon],[data-dslinkoff],[data-dslinkok],[data-dsrm],[data-dsprev]'); if (!t) return;
      e.preventDefault();
      if (t.matches('[data-dspick]')) { slot.querySelector('[data-dsfile]').click(); return; }
      if (t.matches('[data-dslinkon]')) { slot.querySelector('.ds-linkrow').classList.remove('hidden'); const i = slot.querySelector('[data-dsurl]'); i.focus(); return; }
      if (t.matches('[data-dslinkoff]')) { slot.querySelector('.ds-linkrow').classList.add('hidden'); err(slot, ''); return; }
      if (t.matches('[data-dslinkok]')) {
        const v = R.trim(slot.querySelector('[data-dsurl]').value);
        if (!/^https:\/\/\S+$/i.test(v)) { err(slot, DK().linkHttps); return; }
        if (R.looksSensitive(v) || /\d{9,}/.test(v.replace(/[-\s]/g, ''))) { err(slot, DK().noNumbers); return; }
        err(slot, ''); h.onLink(slot.dataset.dslot, v); return;
      }
      if (t.matches('[data-dsrm]')) { h.onRemove(slot.dataset.dslot); return; }
      if (t.matches('[data-dsprev]')) { preview(t.dataset.dsprev, t.dataset.dsname); }
    });
    root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-dsurl]')) { e.preventDefault(); e.stopPropagation(); const b = slotOf(e.target).querySelector('[data-dslinkok]'); if (b) b.click(); } });
    root.addEventListener('change', async e => {
      const slot = slotOf(e.target); if (!slot) return;
      if (e.target.matches('[data-dsfile]')) {
        const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
        const p = KT.docfiles.problem(f); if (p) { err(slot, p === 'size' ? DK().tooBig : DK().wrongType); return; }
        err(slot, ''); slot.classList.add('busy');
        try { await h.onFile(slot.dataset.dslot, f); } catch (x) { err(slot, x && x.message === 'novault' ? C.newKol.vaultNone : DK().uploadFailed); }
        slot.classList.remove('busy'); return;
      }
      if (e.target.matches('[data-dsrec]') && h.onDate) { e.stopPropagation(); h.onDate(slot.dataset.dslot, R.isISODate(e.target.value) ? e.target.value : null); }
    });
  }
  /* a picked file → encrypted and kept (IndexedDB) → { file_id, name, mime, bytes } · throws 'novault' without a vault */
  async function upload(file, owner) {
    const vault = state().lookups.payee_vault; if (!vault || !KT.vault.available()) throw new Error('novault');
    return KT.docfiles.add(vault, file, owner);
  }
  /* 👁 Preview: the vault unlocked first · a picture or a PDF in a dialog (the bytes only in memory · the URL goes when it closes) */
  async function preview(fileId, nm) {
    const vault = state().lookups.payee_vault;
    if (!vault) return;
    if (!KT.vault.isUnlocked(vault)) { KT.payee.unlockDialog(() => setTimeout(() => preview(fileId, nm), 60), { for: 'export' }); return; }   // after its close event
    const f = await KT.docfiles.read(fileId); if (!f) { toast(DK().cannotOpen); return; }
    const url = URL.createObjectURL(new Blob([f.bytes], { type: f.mime })); f.bytes.fill(0);
    U.openDialog(`<div class="dlg-h">${esc(nm || f.name)}</div><div class="dlg-b ds-prev">${/^image\//.test(f.mime) ? `<img src="${url}" alt="${esc(nm || f.name)}">` : `<iframe src="${url}" title="${esc(nm || f.name)}"></iframe>`}</div>` +
      `<div class="dlg-f"><button type="button" class="btn" id="ds_close">${esc(C.common.close)}</button></div>`, 'xl');
    const done = () => { URL.revokeObjectURL(url); U.dlg.removeEventListener('close', done); if (!U.can('payee.unlock')) KT.vault.lock(); };   // unlocked for this look only
    U.dlg.addEventListener('close', done);
    document.getElementById('ds_close').addEventListener('click', U.closeDialog);
  }
  return { slotHTML, wire, upload, preview, linkLabel, kb };
})();
