/* screen-roles.js — Role Management (CR-04 §4.4, admin only): the people who use this file, their role and PIC name,
   a user drawer (view before edit) and the read-only Permissions table. The page says, in its one grey line, that roles
   only shape what each person sees and can edit here. → KT.screens.roles */
KT.screens.roles = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, checksHTML, kv, field, initials, ICON, optionsHTML, openDialog, closeDialog, confirmDialog, openDrawer, fillDrawer, setHash, can, guard, userId } = U;
  const K = C.roles;
  const rm = { mode: 'none', id: null, draft: null, touched: new Set(), dirty: false };
  const editing = () => rm.mode === 'edit' || rm.mode === 'new';
  const userById = id => R.userById(state(), id);

  /* ===================== page ===================== */
  function render(id) {
    const sec = $('tab-roles');
    if (!can('roles')) {
      if (U.drawerOwner() === owner) U.closeDrawer();
      sec.dataset.built = '';
      sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(K.title)}</h1></div><div class="card empty"><b>${esc(K.noAccess)}</b></div>`;
      return;
    }
    if (!sec.dataset.built) build(sec);
    renderTable();
    if (id && userById(id) && !editing()) { Object.assign(rm, { mode: 'view', id }); renderPanel(); }
    else if (editing()) renderPanel();
  }
  function build(sec) {
    sec.innerHTML = `<div class="pagehead"><h1 class="page">${esc(K.title)}</h1><span class="spacer"></span><button type="button" class="btn primary" id="rm_new">${esc(K.addUser)}</button></div>
      <p class="rm-note">${esc(K.disclaimer)}</p>
      <div id="rm_body"></div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h3>${esc(K.permTitle)}</h3></div><div id="rm_perm"></div></div>`;
    $('rm_new').addEventListener('click', e => startNew(e.currentTarget));   // CR-11 §4.3: a create modal (M)
    $('rm_body').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id); });
    $('rm_perm').addEventListener('click', e => { const b = e.target.closest('[data-permfold]'); if (!b) return; const set = permFolded(), k = b.dataset.permfold; set.has(k) ? set.delete(k) : set.add(k); U.pref.set(permKey(), JSON.stringify([...set])); renderTable(); });
    $('rm_body').addEventListener('keydown', e => { if (e.key !== 'Enter') return; const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id); });
    sec.dataset.built = '1';
  }
  function select(id) {
    if (editing()) { if (id !== rm.id) toast(C.common.blockWhileEditing); return; }
    Object.assign(rm, { mode: 'view', id, draft: null }); rm.touched.clear(); renderPanel();
  }
  const roleChip = r => `<span class="rchip ${esc(r)}">${esc(K.role[r] || r)}</span>`;
  const statusChip = u => (u.active !== false ? `<span class="st done">${esc(K.active)}</span>` : `<span class="st muted">${esc(K.inactive)}</span>`);
  const lastText = (s, u) => { const t = R.lastActive(s, u.user_id); return t ? R.fmtDateTime(t) : ''; };
  function renderTable() {
    const s = state(), meId = userId();
    const order = { admin: 0, kol_manager: 1, staff: 2, viewer: 3, accounting: 4 };
    const users = (s.users || []).slice().sort((a, b) => (a.active === false) - (b.active === false) || order[a.role] - order[b.role] || a.display_name.localeCompare(b.display_name, 'th'));
    $('rm_body').innerHTML = `<div class="tablewrap"><table class="tbl"><thead><tr><th>${esc(K.colName)}</th><th>${esc(K.colEmail)}</th><th>${esc(K.colRole)}</th><th>${esc(K.colPic)}</th>` +
      `<th>${esc(K.colStatus)}</th><th class="num">${esc(K.colDeals)}</th><th>${esc(K.colLast)}</th></tr></thead><tbody>` +
      users.map(u => { const pn = R.picName(u);
        return `<tr class="click${u.active === false ? ' muted-row' : ''}" tabindex="0" data-id="${esc(u.user_id)}"><td><div class="kolcell"><span class="av">${esc(initials(u.display_name))}</span><div class="cell2"><b>${esc(u.display_name)}${u.user_id === meId ? `<span class="tag-you">${esc(K.you)}</span>` : ''}</b><span class="sub">${esc(u.user_id)}</span></div></div></td>` +
          `<td>${esc(u.email || '')}</td><td>${roleChip(u.role)}</td><td>${pn ? `☑ ${esc(pn)}` : `<span class="muted">—</span>`}</td><td>${statusChip(u)}</td>` +
          `<td class="num">${pn ? R.fmtNum(R.dealsAsPic(s, pn)) : ''}</td><td>${esc(lastText(s, u)) || `<span class="muted">${esc(K.never)}</span>`}</td></tr>`; }).join('') +
      `</tbody></table></div>`;
    /* CR-11 §4.13 #8 — grouped by part of the app, each group folds (remembered per person) · the header row stays on top */
    const shut = permFolded();
    $('rm_perm').innerHTML = `<div class="tablewrap perm-wrap"><table class="tbl perm-tbl"><thead><tr><th>${esc(K.permAction)}</th>${R.ROLES.map(r => `<th class="c">${esc(K.role[r])}</th>`).join('')}</tr></thead>` +
      R.permGroups().map(g => { const open = !shut.has(g.module);
        return `<tbody><tr class="ghead"><td colspan="${R.ROLES.length + 1}"><button type="button" class="gh" data-permfold="${g.module}" aria-expanded="${open}"><span class="chev${open ? ' open' : ''}">${ICON.chevron}</span><b class="gname">${esc(K.modules[g.module])}</b><span class="muted">${R.fmtNum(g.rows.length)}</span></button></td></tr>` +
          (open ? g.rows.map(p => `<tr><td>${esc(K.perm[p.key])}</td>${R.ROLES.map(r => `<td class="c">${p[r] ? '✓' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('') : '') + `</tbody>`; }).join('') + `</table></div>`;
    document.querySelectorAll('#rm_body tr[data-id]').forEach(tr => tr.classList.toggle('selected', rm.mode !== 'none' && tr.dataset.id === rm.id));
  }

  const permKey = () => 'permfold_' + (U.userId() || '');
  const permFolded = () => { try { return new Set(JSON.parse(U.pref.get(permKey(), '[]'))); } catch (e) { return new Set(); } };
  /* ===================== drawer ===================== */
  const owner = {
    isDirty: () => editing() && rm.dirty,
    onClose: () => { Object.assign(rm, { mode: 'none', id: null, draft: null }); rm.touched.clear(); if (U.currentTab() === 'roles') { setHash('roles'); renderTable(); } },
    onSuspend: () => { if (!editing()) Object.assign(rm, { mode: 'none', id: null }); },
  };
  const closeBtn = `<button type="button" class="icon-btn" data-dr-close aria-label="${esc(C.common.close)}" title="${esc(C.common.close)}">${ICON.close}</button>`;
  const sec = (title, body) => `<section class="sec"><div class="sec-h"><span>${esc(title)}</span></div>${body}</section>`;
  function renderPanel() {
    let html;
    if (rm.mode === 'view') { const u = userById(rm.id); if (!u) { U.closeDrawer(); return; } html = viewHTML(u); setHash('roles/' + u.user_id); }
    else if (editing()) { html = formHTML(); setHash(rm.mode === 'edit' ? 'roles/' + rm.id : 'roles'); }
    else return;
    if (U.drawerOwner() === owner) fillDrawer(html); else openDrawer(owner, html);
    $('drawer_content').onclick = panelClick;
    if (editing()) { wireForm(); check(); }
    renderTable();
  }
  function viewHTML(u) {
    const s = state(), pn = R.picName(u);
    return `<div class="dr-head"><div class="dr-title"><span class="av">${esc(initials(u.display_name))}</span><div class="t"><h2 title="${esc(u.display_name)}">${esc(u.display_name)}</h2>
        <div class="dr-sub"><span>${esc(K.userTag)} · ${esc(u.user_id)}</span>${roleChip(u.role)}${statusChip(u)}</div></div>${closeBtn}</div>
        <div class="dr-actions"><button type="button" class="btn primary" data-act="edit">${esc(K.edit)}</button></div></div>
      <div class="dr-body">${sec(K.secDetails, kv(K.fName, u.display_name) + kv(K.fEmail, u.email) + kv(K.fRole, K.role[u.role]) + kv(K.fPicName, pn || '') +
        kv(K.colDeals, pn ? R.fmtNum(R.dealsAsPic(s, pn)) : '') + kv(K.colLast, lastText(s, u)))}</div>`;
  }
  /* + Add user: the user form in a create modal (M) · User created · Open (its drawer) */
  function startNew(opener) {
    if (!guard('roles')) return;
    if (editing()) { toast(C.common.blockWhileEditing); renderPanel(); return; }
    if (U.drawerOwner() === owner) U.closeDrawer();
    Object.assign(rm, { mode: 'new', id: null, dirty: false, draft: { user_id: null, display_name: '', email: '', role: 'staff', is_pic: false, pic_name: '', active: true } });
    rm.touched.clear();
    U.createModal({ size: 'M', title: K.newTitle, opener, isDirty: () => rm.mode === 'new' && rm.dirty, focus: '#f_display_name', onClick: panelClick,
      onClose: () => { if (rm.mode === 'new') { Object.assign(rm, { mode: 'none', id: null, draft: null }); rm.touched.clear(); } },
      body: fieldsHTML(rm.draft), foot: [`<div class="checks" id="rm_checks"></div>`, U.cmButtons(K.addOk, 'rm_ok', { attrs: ' data-act="save"' })] });
    wireForm(); check();
  }
  const box = () => (rm.mode === 'new' ? $('cm_root') : $('drawer_content'));
  function startEdit() {
    const u = userById(rm.id); if (!u || !guard('roles')) return;
    Object.assign(rm, { mode: 'edit', dirty: false, draft: Object.assign({}, u, { email: u.email || '', pic_name: u.pic_name || '' }) });
    rm.touched.clear(); renderPanel();
  }
  function formHTML() {
    const d = rm.draft;
    return `<div class="dr-head"><div class="dr-title"><div class="t"><h2>${esc(K.editTitle(d.display_name || d.user_id))}</h2><div class="dr-sub"><span>${esc(d.user_id)}</span></div></div>${closeBtn}</div></div>
      <div class="dr-body">${sec(K.secDetails, fieldsHTML(d))}</div>
      <div class="dr-foot"><div class="checks" id="rm_checks"></div>
        <div class="btns"><button type="button" class="btn" data-act="cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" data-act="save">${esc(C.common.save)}</button></div></div>`;
  }
  function fieldsHTML(d) {
    return `<div class="fields">
        ${field('display_name', K.fName, `<input id="f_display_name" data-f="display_name" value="${esc(d.display_name)}" autocomplete="off">`, { req: 1, wide: 1 })}
        ${field('email', K.fEmail, `<input type="email" id="f_email" data-f="email" value="${esc(d.email)}" placeholder="${esc(K.emailPh)}" autocomplete="off">`, { wide: 1 })}
        ${field('role', K.fRole, `<select id="f_role" data-f="role">${optionsHTML(R.ROLES.map(r => ({ value: r, label: K.role[r] })), d.role)}</select>`, { req: 1 })}
        <div class="field"><label>&nbsp;</label><label class="tick"><input type="checkbox" data-b="active"${d.active !== false ? ' checked' : ''}> ${esc(K.fActive)}</label><div class="hint">${esc(K.fActiveHint)}</div></div>
        <div class="field"><label>&nbsp;</label><label class="tick"><input type="checkbox" data-b="is_pic"${d.is_pic ? ' checked' : ''}> ${esc(K.fIsPic)}</label><div class="hint">${esc(K.fIsPicHint)}</div></div>
        ${field('pic_name', K.fPicName, `<input id="f_pic_name" data-f="pic_name" value="${esc(d.pic_name)}" placeholder="${esc(d.display_name)}" autocomplete="off"${d.is_pic ? '' : ' disabled'}>`, { hint: esc(K.fPicNameHint) })}
      </div>`;
  }
  function wireForm() {
    const d = rm.draft;
    box().querySelectorAll('[data-f]').forEach(el => {
      const f = el.dataset.f, h = () => { d[f] = el.value; rm.dirty = true; if (f === 'display_name') { const pn = $('f_pic_name'); if (pn) pn.placeholder = el.value; } check(); };
      el.addEventListener('input', h);
      el.addEventListener('change', () => { h(); rm.touched.add(f); check(); });
      el.addEventListener('blur', () => { rm.touched.add(f); check(); });
    });
    box().querySelectorAll('[data-b]').forEach(el => el.addEventListener('change', () => {
      d[el.dataset.b] = el.checked; rm.dirty = true;
      if (el.dataset.b === 'is_pic') $('f_pic_name').disabled = !el.checked;
      check();
    }));
  }
  function check() {
    if (!rm.draft || !box()) return { errs: [], warns: [], infos: [] };
    const res = R.validateUser(state(), rm.draft);
    /* the warning about open deals carries "Reassign PIC…" */
    $('rm_checks').innerHTML = checksHTML(res, C.common.ok) +
      res.warns.filter(w => w.kind === 'reassign').map(w => `<div class="btns" style="margin:4px 0 0 18px"><button type="button" class="btn small" data-act="reassign" data-pic="${esc(w.pic)}">${esc(K.reassign)}</button></div>`).join('');
    box().querySelectorAll('[data-f]').forEach(el => el.classList.toggle('invalid', rm.touched.has(el.dataset.f) && res.errs.some(e => e.field === el.dataset.f)));
    box().querySelector('[data-act="save"]').disabled = res.errs.length > 0;
    return res;
  }
  async function save() {
    if (!guard('roles')) return;
    const s = state(), d = rm.draft, res = R.validateUser(s, d);
    if (res.errs.length) { res.errs.forEach(x => rm.touched.add(x.field)); check(); return; }
    let id = d.user_id;
    if (rm.mode === 'new') {
      id = store.newId('user'); s.users.push(R.userFromDraft(d, id));
      U.closeModal();   // (closing it moves the focus: the form's own handlers still see the draft)
      Object.assign(rm, { mode: 'none', id: null, draft: null }); rm.touched.clear();
      commit(); U.renderNav(); renderTable();
      setTimeout(() => { const tr = document.querySelector(`#rm_body tr[data-id="${CSS.escape(id)}"]`); if (tr) { tr.classList.add('flash'); tr.scrollIntoView({ block: 'nearest' }); setTimeout(() => tr.classList.remove('flash'), 5000); } }, 50);
      U.toastAction(C.common.created(K.thing), C.common.open, () => select(id), 8000);
      return;
    }
    else {
      const old = userById(id), rec = R.userFromDraft(d, id), from = R.picName(old), to = R.picName(rec);
      /* a new PIC name: the deals and KOLs that use the old one follow (asked first, with the counts) */
      if (from && to && from !== to) {
        const c = R.picRenameCount(s, from);
        if (c.deals || c.kols) {
          if (!(await confirmDialog(K.renameTitle, K.renameBody(from, to, c.deals, c.kols), K.renameOk))) return;
          const r = R.fieldChanges(s.deals.filter(x => x.pic === from), 'pic', to, { eventId: store.newEventId(), now: new Date(), user: userId(), note: 'rename' });
          const at = new Map(s.deals.map((x, i) => [x.deal_id, i]));
          r.deals.forEach(x => { s.deals[at.get(x.deal_id)] = x; }); r.events.forEach(e => s.deal_events.push(e));
          s.kol_master.forEach(k => { if (k.pic === from) k.pic = to; });
        }
      }
      Object.assign(old, rec);
    }
    Object.assign(rm, { mode: 'view', id, draft: null }); rm.touched.clear();
    commit(K.saved(R.userById(s, id).display_name));
    U.renderNav();
    if (!can('roles')) { U.closeDrawer(); render(); return; }   // an admin who made themselves staff
    renderPanel();
  }
  /* CR-02 bulk reassign, for the open deals of one PIC */
  function openReassign(from) {
    if (!guard('deal.edit')) return;
    const s = state(), ids = s.deals.filter(x => x.pic === from && (x.status === 'List' || x.status === 'Inprocess')).map(x => x.deal_id), n = ids.length; if (!n) return;
    let to = '';
    openDialog(`<div class="dlg-h">${esc(K.reassignTitle(n, from))}</div><div class="dlg-b">
        <div class="field"><label for="rr_to">${esc(K.reassignTo)}</label><select id="rr_to">${optionsHTML(R.picNames(s).filter(x => x !== from), '', C.deal.choosePic)}</select></div>
        <p id="rr_ask" style="margin:12px 0 0"></p></div>
      <div class="dlg-f"><button type="button" class="btn" id="rr_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="rr_ok" disabled>${esc(K.reassignOk)}</button></div>`);
    $('rr_to').addEventListener('change', e => { to = e.target.value; $('rr_ask').textContent = to ? K.reassignAsk(n, from, to) : ''; $('rr_ok').disabled = !to; });
    $('rr_cancel').addEventListener('click', closeDialog);
    $('rr_ok').addEventListener('click', () => {
      if (!to || !guard('deal.edit')) return;
      const r = R.fieldChanges(ids.map(id => s.deals.find(x => x.deal_id === id)), 'pic', to, { eventId: store.newEventId(), now: new Date(), user: userId() });
      const at = new Map(s.deals.map((x, i) => [x.deal_id, i]));
      r.deals.forEach(x => { s.deals[at.get(x.deal_id)] = x; }); r.events.forEach(e => s.deal_events.push(e));
      closeDialog(); commit(K.reassigned(r.deals.length, to)); renderTable(); if (editing()) check();
    });
  }
  function panelClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'edit') startEdit();
    else if (act === 'cancel') { if (rm.mode === 'new') U.closeDrawer(); else { Object.assign(rm, { mode: 'view', draft: null }); rm.touched.clear(); renderPanel(); } }
    else if (act === 'save') save();
    else if (act === 'reassign') openReassign(b.dataset.pic);
  }

  function reset() { Object.assign(rm, { mode: 'none', id: null, draft: null }); rm.touched.clear(); }
  return { render, reset };
})();
