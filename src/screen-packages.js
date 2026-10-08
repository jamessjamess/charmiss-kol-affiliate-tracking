/* screen-packages.js — CR-20 §4.8: a KOL's packages (prepaid posts used across Campaigns) — KOL modal › Rates › Packages (the table · + Add package ·
   Edit · Archive) and the package form, also opened inside another modal (Move stage · New deal: "+ New package" in place, then back).
   The money side (one Payments row per package, Prepaid package balance) is in rules-package.js / screen-payments.js. → KT.packages */
KT.packages = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, checksHTML, optionsHTML, field, dateHTML, userId, can, guard } = U;
  const PK = C.pkg;
  const canEdit = () => can('kol.edit');

  /* the chip of the KOL modal header: "Package · 6 left" (the Active ones) */
  function chipHTML(kolId) {
    const s = state(), act = R.packagesOf(s, kolId).filter(p => R.packageStatus(s, p, today()) === 'active');
    if (!act.length) return '';
    const left = act.reduce((a, p) => a + Math.max(0, R.packageRemaining(s, p)), 0);
    return `<span class="chip pkg-chip" title="${esc(act.map(p => R.packageLabel(p)).join(' · '))}">${esc(PK.chip(R.fmtNum(left)))}</span>`;
  }
  const statusChip = st => `<span class="st ${st === 'active' ? 'done' : st === 'archived' ? 'muted' : st === 'expired' ? 'warn' : 'cancel'}">${esc(PK.status[st])}</span>`;
  const payChip = st => `<span class="pchip ${st === 'paid' ? 'ok' : st === 'sent' ? 'info' : 'warn'}">${esc(PK.pay[st])}</span>`;
  /* KOL modal › Rates › Packages */
  function sectionHTML(kol) {
    const s = state(), td = today(), list = R.packagesOf(s, kol.kol_id);
    const rows = list.map(p => {
      const used = R.packageUsed(s, p.package_id), left = R.packageRemaining(s, p), st = R.packageStatus(s, p, td);
      const acts = canEdit() ? `<button type="button" class="link" data-pkedit="${esc(p.package_id)}">${esc(PK.edit)}</button>` + (p.archived ? '' : ` · <button type="button" class="link" data-pkarchive="${esc(p.package_id)}">${esc(PK.archive)}</button>`) : '';
      return `<tr data-pkg="${esc(p.package_id)}"><td><b>${esc(R.packageLabel(p))}</b><span class="sub muted small">${esc(p.package_id)}</span></td><td class="num">${R.fmtNum(p.units_total)}</td><td class="num">${esc(R.baht(p.price_total))}</td>` +
        `<td class="num">${esc(R.baht(R.unitPrice(p)))}</td><td class="num">${R.fmtNum(used)}</td><td class="num"><b>${R.fmtNum(Math.max(0, left))}</b></td>` +
        `<td class="nowrap">${p.valid_until ? esc(R.dmy(p.valid_until)) : '<span class="muted">—</span>'}${st === 'expired' && left > 0 ? `<span class="sub muted small">${esc(PK.unused(R.fmtNum(left)))}</span>` : ''}</td>` +
        `<td>${payChip(R.packagePayStatus(s, p))}</td><td>${statusChip(st)}</td><td class="nowrap">${acts}</td></tr>`;
    }).join('');
    const C2 = PK.col;
    const table = list.length ? `<div class="tablewrap"><table class="tbl compact-sm pk-tbl"><thead><tr><th>${esc(C2.name)}</th><th class="num">${esc(C2.posts)}</th><th class="num">${esc(C2.price)}</th><th class="num">${esc(C2.unit)}</th>` +
      `<th class="num">${esc(C2.used)}</th><th class="num">${esc(C2.remaining)}</th><th>${esc(C2.valid)}</th><th>${esc(C2.payment)}</th><th>${esc(C2.status)}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="hint">${esc(PK.none)}</div>`;
    return `<section class="sec" id="pk_sec"><div class="sec-h"><span>${esc(PK.sec)}</span>${canEdit() ? `<button type="button" class="btn small" data-pkadd>${esc(PK.add)}</button>` : ''}</div>` +
      `<p class="hint" style="margin-top:0">${esc(PK.hint)}</p>${table}</section>`;
  }
  /* clicks of that section → true when handled · after(): draw the page again */
  function click(e, kolId, after) {
    if (e.target.closest('[data-pkadd]')) { openForm(kolId, null, { opener: e.target.closest('[data-pkadd]'), after }); return true; }
    const ed = e.target.closest('[data-pkedit]'); if (ed) { openForm(kolId, ed.dataset.pkedit, { opener: ed, after }); return true; }
    const ar = e.target.closest('[data-pkarchive]'); if (ar) { archive(ar.dataset.pkarchive, after); return true; }
    return false;
  }

  /* ---------- Add / Edit package ---------- */
  /* o = { opener, after(packageId), panel (in place of the modal that is open: Move stage · New deal), back() } */
  function openForm(kolId, pkgId, o = {}) {
    if (!guard('kol.edit')) return;
    const s = state(), k = R.kolById(s, kolId); if (!k) return;
    const old = pkgId ? R.packageById(s, pkgId) : null;
    const d = old ? { package_id: old.package_id, kol_id: kolId, name: old.name, units_total: String(old.units_total), price_total: String(old.price_total), start_date: old.start_date, valid_until: old.valid_until || '', payee_id: old.payee_id || '', note: old.note || '' }
      : { package_id: null, kol_id: kolId, name: '', units_total: '', price_total: '', start_date: today(), valid_until: '', payee_id: '', note: '' };
    const st = { d, touched: new Set(), submitted: false, autoName: !old };
    const payees = R.payeesOfKol(s, kolId).map(p => ({ value: p.payee_id, label: p.label || C.payee.primary }));
    const body = `<div class="fields pk-form">
        ${field('pk_name', PK.fName, `<input id="f_pk_name" data-pk="name" data-key="name" value="${esc(d.name)}" autocomplete="off">`, { req: 1, wide: 1 })}
        ${field('pk_units', PK.fPosts, `<input type="number" min="1" step="1" inputmode="numeric" id="f_pk_units" data-pk="units_total" data-key="units_total" value="${esc(d.units_total)}">`, { req: 1 })}
        ${field('pk_price', PK.fPrice, `<input type="number" min="0" step="1" inputmode="numeric" id="f_pk_price" data-pk="price_total" data-key="price_total" value="${esc(d.price_total)}">`, { req: 1 })}
        ${field('pk_unit', PK.fUnit, `<input id="f_pk_unit" readonly tabindex="-1">`)}
        ${field('pk_start', PK.fStart, dateHTML('id="f_pk_start" data-pk="start_date" data-key="start_date"', d.start_date, { label: PK.fStart }), { req: 1 })}
        ${field('pk_valid', PK.fValid, dateHTML('id="f_pk_valid" data-pk="valid_until" data-key="valid_until"', d.valid_until, { label: PK.fValid }))}
        ${field('pk_payee', PK.fPayee, `<select id="f_pk_payee" data-pk="payee_id" data-key="payee_id">${optionsHTML(payees, d.payee_id, PK.payeeDefault)}</select>`)}
        ${field('pk_note', PK.fNote, `<textarea id="f_pk_note" data-pk="note" data-key="note">${esc(d.note)}</textarea>`, { wide: 1 })}
      </div>`;
    const ok = old ? PK.save : PK.create;
    if (o.panel && U.modalOpen()) U.modalPanel({ title: PK.addTitle(k.display_name), body: `<div id="pk_root">${body}</div>`, left: `<div class="checks" id="pk_checks"></div>`,
      buttons: `<button type="button" class="btn" data-cmback>${esc(C.common.back)}</button><button type="button" class="btn primary" id="pk_ok">${esc(ok)}</button>`, back: o.back });
    else U.createModal({ size: 'M', title: old ? PK.editTitle(R.packageLabel(old)) : PK.addTitle(k.display_name), opener: o.opener, body: `<div id="pk_root">${body}</div>`,
      foot: [`<div class="checks" id="pk_checks"></div>`, U.cmButtons(ok, 'pk_ok')], isDirty: () => st.dirty });
    const root = $('pk_root');
    const chk = () => {
      const res = R.validatePackage(state(), st.d), show = res.errs.filter(e => st.submitted || st.touched.has(e.field));
      $('pk_checks').innerHTML = checksHTML({ errs: show, warns: [], infos: [] }, '');
      root.querySelectorAll('[data-key]').forEach(el => { const t = el.type === 'hidden' ? el.closest('.dfield') : el; if (t) t.classList.toggle('invalid', show.some(e => e.field === el.dataset.key)); });
      const n = Number(st.d.units_total), p = Number(st.d.price_total);
      $('f_pk_unit').value = n > 0 && p > 0 ? R.baht(R.unitPrice({ units_total: n, price_total: p })) : '';
      return res;
    };
    root.addEventListener('input', e => {
      const el = e.target.closest('[data-pk]'); if (!el) return;
      st.d[el.dataset.pk] = el.value; st.dirty = true;
      if (el.dataset.pk === 'name') st.autoName = false;
      if (st.autoName && (el.dataset.pk === 'units_total' || el.dataset.pk === 'price_total')) { const n = Number(st.d.units_total), p = Number(st.d.price_total); st.d.name = n > 0 && p > 0 ? PK.defaultName(R.fmtNum(n), R.baht(p)) : ''; $('f_pk_name').value = st.d.name; }
      chk();
    });
    root.addEventListener('change', e => { const el = e.target.closest('[data-pk]'); if (el) { st.d[el.dataset.pk] = el.value; st.touched.add(el.dataset.key); chk(); } });
    $('pk_ok').addEventListener('click', () => {
      st.submitted = true; if (chk().errs.length || !guard('kol.edit')) return;
      const s2 = state(), now = new Date();
      let id;
      if (old) {
        const rec = R.packageById(s2, old.package_id), before = {}, after = {};
        const next = { name: R.trim(st.d.name), units_total: Number(st.d.units_total), price_total: Math.round(Number(st.d.price_total) * 100) / 100, start_date: st.d.start_date, valid_until: st.d.valid_until || null, payee_id: st.d.payee_id || null, note: R.trim(st.d.note) || null };
        Object.keys(next).forEach(f => { if ((rec[f] == null ? null : rec[f]) !== next[f]) { before[f] = rec[f] == null ? null : rec[f]; after[f] = next[f]; } });
        if (Object.keys(after).length) {
          Object.assign(rec, next, { updated_at: now.toISOString() });
          s2.deal_events.push(R.packageEvent('package_updated', rec, { eventId: store.newEventId(), now, user: userId() }, before, after));
          /* the deals using it: the Rate card follows the new unit price */
          s2.deals.forEach((dl, i) => { if (dl.package_id === rec.package_id && R.termOf(dl) === 'package') s2.deals[i] = Object.assign({}, dl, { rate_card: Math.round(R.unitPrice(rec) * R.unitsOf(dl) * 100) / 100 }); });
        }
        id = rec.package_id; commit(PK.saved(R.packageLabel(rec)));
      } else {
        const rec = R.newPackage(s2, Object.assign({}, st.d, { name: R.trim(st.d.name) }), { now, user: userId() });
        if (!Array.isArray(s2.kol_packages)) s2.kol_packages = [];
        s2.kol_packages.push(rec); s2.deal_events.push(R.packageEvent('package_created', rec, { eventId: store.newEventId(), now, user: userId() }, null, { name: rec.name, units_total: rec.units_total, price_total: rec.price_total }));
        id = rec.package_id; commit(PK.created(R.packageLabel(rec)));
      }
      if (o.panel) { if (o.after) o.after(id); }
      else { U.closeModal(); if (o.after) o.after(id); }
    });
    chk();
  }
  async function archive(id, after) {
    if (!guard('kol.edit')) return;
    const s = state(), p = R.packageById(s, id); if (!p) return;
    if (!(await U.confirmDialog(PK.archiveAsk(R.packageLabel(p)), PK.archiveBody, PK.archive))) return;
    p.archived = true; p.updated_at = new Date().toISOString();
    s.deal_events.push(R.packageEvent('package_archived', p, { eventId: store.newEventId(), now: new Date(), user: userId() }, { archived: false }, { archived: true }));
    commit(PK.archived(R.packageLabel(p))); if (after) after();
  }

  return { chipHTML, sectionHTML, click, openForm, archive };
})();
