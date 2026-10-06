/* rules-roles.js — CR-04 §4.4 / CR-05 §4.1–4.2: users, roles (admin · KOL Manager · staff · viewer), View as role, what each role may do in this file, the PIC list and the PIC default of a new deal.
   Roles only decide what each person sees and can edit on screen (the note on the Role Management page says so).
   Pure functions; adds to KT.rules (load after rules-deal.js). No DOM, no storage. */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg;
  const { isBlank, trim } = R;
  const ROLES = ['admin', 'kol_manager', 'staff', 'viewer', 'accounting'];   // CR-09 §4.16 — Accounting (the accounts team)
  const EMAIL_DOMAIN = '@lomr.co.th';
  /* the permission matrix (CR-05 §4.1): one row per group of actions · the Role Management page shows it read-only */
  const PERMISSIONS = [
    { key: 'view', actions: ['view', 'export', 'backup'], admin: true, kol_manager: true, staff: true, viewer: true, accounting: true },   // every page but Role Management · Export CSV · Backup
    { key: 'deal.edit', actions: ['deal.edit'], admin: true, kol_manager: true, staff: true, viewer: false, accounting: false },           // deals, posts, Move stage, payment, PIC inline, Set pillar
    { key: 'kol.edit', actions: ['kol.edit'], admin: true, kol_manager: true, staff: true, viewer: false, accounting: false },             // KOLs, accounts, rates · Import KOL CSV
    { key: 'deal.money', actions: ['cost.override', 'deal.campaign'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false }, // costs after a payment (with a reason) · a deal's Campaign
    { key: 'kol.merge', actions: ['kol.merge'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },          // Merge KOL · delete deal / KOL
    /* CR-09 §4.7 — the products of a Campaign (+ New product into the catalog) · Staff too */
    { key: 'campaign.products', actions: ['campaign.products'], admin: true, kol_manager: true, staff: true, viewer: false, accounting: false },
    { key: 'campaign.edit', actions: ['campaign.edit'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },  // Campaign & Phase · Phase Planner · budgets · % Phase · CTA · pillar target
    { key: 'settings.lists', actions: ['settings.lists', 'products.edit'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },// Settings › Lists (Journey steps, Pillar, CTA, Platform) · Pillar targets · Products (CR-06)
    { key: 'settings.tiers', actions: ['settings.tiers'], admin: true, kol_manager: false, staff: false, viewer: false, accounting: false },// Settings › Tier rules
    { key: 'data.restore', actions: ['data.restore'], admin: true, kol_manager: false, staff: false, viewer: false, accounting: false },   // Restore · Reset to seed
    { key: 'roles', actions: ['roles'], admin: true, kol_manager: false, staff: false, viewer: false, accounting: false },                 // Role Management
    /* CR-08 §4.9 — Payments (seeing them is the 'view' row) · Staff edit payees of their own KOLs / payees they created (rules-pay.js canEditPayee) */
    { key: 'payee.edit', actions: ['payee.edit', 'payment.request', 'payment.manual'], admin: true, kol_manager: true, staff: true, viewer: false, accounting: false },
    { key: 'payee.unlock', actions: ['payee.unlock'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },
    { key: 'payee.verify', actions: ['payee.verify'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },
    { key: 'vault.admin', actions: ['vault.admin'], admin: true, kol_manager: false, staff: false, viewer: false, accounting: false },
    { key: 'payee.import', actions: ['payee.import'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },
    { key: 'payment.run', actions: ['payment.run'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },
    { key: 'payment.paid', actions: ['payment.paid'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },
    { key: 'payment.reopen', actions: ['payment.reopen'], admin: true, kol_manager: false, staff: false, viewer: false, accounting: false },
    { key: 'settings.payments', actions: ['settings.payments'], admin: true, kol_manager: true, staff: false, viewer: false, accounting: false },
  ];
  const ROW_OF = new Map(PERMISSIONS.flatMap(p => p.actions.map(a => [a, p])));
  /* can(user, action) — asked when a control is drawn and again right before anything is written ·
     user = the person as they act now (actingAs: an admin viewing as another role) */
  function can(user, action) {
    if (!user || user.active === false) return false;
    const p = ROW_OF.get(action);
    return !!(p && p[user.role]);
  }
  /* CR-05 §4.2 — an admin may view the app as another role (kept for this browser tab only) */
  const effectiveRole = (user, roleOverride) => (!user ? null : user.role === 'admin' && ROLES.includes(roleOverride) ? roleOverride : user.role);
  const actingAs = (user, roleOverride) => (!user ? null : effectiveRole(user, roleOverride) === user.role ? user : Object.assign({}, user, { role: effectiveRole(user, roleOverride) }));
  const userById = (state, id) => (state.users || []).find(u => u.user_id === id) || null;
  const isActive = u => !!u && u.active !== false;
  /* the person working in this browser: meta.current_user_id, else the first active admin */
  function currentUser(state) {
    const u = userById(state, state.meta && state.meta.current_user_id);
    if (isActive(u)) return u;
    return (state.users || []).find(x => x.role === 'admin' && isActive(x)) || null;
  }
  const picName = u => (u && u.is_pic ? (trim(u.pic_name) || trim(u.display_name)) || null : null);
  /* the PIC list = users ticked "Is PIC" and active, by name (all: inactive ones too, for filters) */
  const picNames = (state, all) => (state.users || []).filter(u => u.is_pic && (all || isActive(u))).map(picName).filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'th'));
  /* CR-04 §4.6 — a new deal's PIC: you, when you are an active PIC · else the KOL's PIC · else none (must be chosen) */
  function defaultPic(user, kol) {
    if (isActive(user) && picName(user)) return { pic: picName(user), source: 'user' };
    if (kol && !isBlank(kol.pic)) return { pic: kol.pic, source: 'kol' };
    return { pic: null, source: null };
  }
  /* CR-07 §4.3 — Operations shows one PIC: the one asked for (still an active PIC, or '__none' = deals without a PIC) ·
     else you, when you are an active PIC · else nobody (null: the page asks to pick one) */
  /* CR-09 §4.6 — the PIC Operations shows: the one asked for ('__all' = All PICs · '__none' = no PIC · an active PIC) · else the user when a PIC · else All PICs */
  function opsPic(state, user, wanted) {
    const list = picNames(state);
    if (wanted === '__none' || wanted === '__all' || (wanted && list.includes(wanted))) return wanted;
    const mine = isActive(user) ? picName(user) : null;
    return mine && list.includes(mine) ? mine : '__all';
  }
  /* who made a status log / event row (null = it came with the import) */
  const changedByName = (state, id) => (!id ? C.roles.systemImport : (userById(state, id) || {}).display_name || id);
  /* the last time the user changed something (status log or deal events) — ISO timestamp or null */
  function lastActive(state, userId) {
    let last = null;
    (state.deal_status_log || []).concat(state.deal_events || []).forEach(x => { if (x.changed_by === userId && x.changed_at && (!last || x.changed_at > last)) last = x.changed_at; });
    return last;
  }
  const isOpenDeal = d => d.status === 'List' || d.status === 'Inprocess';
  const dealsAsPic = (state, name, open) => (name ? state.deals.filter(d => d.pic === name && (!open || isOpenDeal(d))).length : 0);

  /* a user being saved (draft: display_name, email, role, is_pic, pic_name, active) */
  function validateUser(state, u) {
    const errs = [], warns = [], infos = [];
    if (!trim(u.display_name)) errs.push({ field: 'display_name', msg: M.userNameRequired });
    if (!isBlank(u.email) && !trim(u.email).toLowerCase().endsWith(EMAIL_DOMAIN)) errs.push({ field: 'email', msg: M.userEmailDomain(EMAIL_DOMAIN) });
    if (!ROLES.includes(u.role)) errs.push({ field: 'role', msg: M.userRoleRequired });
    const pn = u.is_pic ? (trim(u.pic_name) || trim(u.display_name)) : null;
    if (pn && (state.users || []).some(x => x.user_id !== u.user_id && picName(x) && picName(x).toLowerCase() === pn.toLowerCase())) errs.push({ field: 'pic_name', msg: M.userPicTaken(pn) });
    const old = userById(state, u.user_id);
    /* the last active admin keeps the role and stays active */
    const otherAdmins = (state.users || []).filter(x => x.user_id !== u.user_id && x.role === 'admin' && isActive(x));
    if (old && old.role === 'admin' && isActive(old) && !otherAdmins.length && (u.role !== 'admin' || u.active === false)) errs.push({ field: 'role', msg: M.userLastAdmin });
    /* a PIC with open deals is switched off (inactive, or no longer PIC) */
    const was = picName(old);
    if (old && was && isActive(old) && (u.active === false || !u.is_pic)) {
      const n = dealsAsPic(state, was, true);
      if (n) warns.push({ field: 'active', kind: 'reassign', count: n, pic: was, msg: M.userOpenDeals(was, n) });
    }
    /* the PIC name changes → the deals and KOLs that use it follow (asked on save) */
    if (old && was && pn && was !== pn) { const c = picRenameCount(state, was); if (c.deals || c.kols) infos.push({ field: 'pic_name', msg: M.userPicRename(was, pn, c.deals, c.kols) }); }
    return { errs, warns, infos };
  }
  const picRenameCount = (state, from) => ({ deals: state.deals.filter(d => d.pic === from).length, kols: state.kol_master.filter(k => k.pic === from).length });
  /* a new user from the draft (id from the store) */
  const userFromDraft = (u, userId) => ({ user_id: userId, display_name: trim(u.display_name), email: trim(u.email) || null, role: u.role,
    is_pic: !!u.is_pic, pic_name: u.is_pic ? (trim(u.pic_name) || trim(u.display_name)) : null, active: u.active !== false });

  return { ROLES, EMAIL_DOMAIN, PERMISSIONS, can, effectiveRole, actingAs, userById, currentUser, picName, picNames, opsPic, defaultPic, changedByName, lastActive, dealsAsPic,
    validateUser, picRenameCount, userFromDraft };
})(KT.rules, KT.content));
