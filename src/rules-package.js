/* rules-package.js — CR-20 §4.8 Payment term Package (prepaid posts of a KOL, used across Campaigns) · §4.13 Draft notes (step_notes) ·
   schema 19 (migrateV19). Pure functions; adds to KT.rules (load after rules-ops.js).
   A package: kol_packages { package_id PKG000001 · kol_id · name · units_total · price_total · start_date · valid_until · payee_id · payment_status
   to_pay / sent / paid · paid_date · note · archived · created_by · created_at · updated_at } — unit price = price / posts · a deal with
   payment_term 'package' points at one (package_id) and uses package_units of it from Confirm QT on (a cancelled deal gives them back) ·
   the deal's Rate card = unit price × uses (locked) · the package is paid as one payment line (package_id, milestone 'package'); a deal's own
   costs on top (Gencode · Asset · Expediting · Basket) are its own line (milestone 'extras', owed at Confirm QT). */
Object.assign(KT.rules, (function (R, C) {
  'use strict';
  const M = C.msg, { isBlank, trim, isISODate, num } = R;
  const issue = (field, msg) => ({ field, msg });
  const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  /* ===================== packages ===================== */
  const PKG_STATUSES = ['active', 'used_up', 'expired', 'archived'];
  const PKG_PAY = ['to_pay', 'sent', 'paid'];
  const packagesOf = (state, kolId) => (state.kol_packages || []).filter(p => p.kol_id === kolId);
  const packageById = (state, id) => (id ? (state.kol_packages || []).find(p => p.package_id === id) || null : null);
  const unitPrice = p => (p && num(p.units_total) > 0 ? round2(num(p.price_total) / num(p.units_total)) : 0);
  const unitsOf = d => { const n = Number(d && d.package_units); return Number.isInteger(n) && n >= 1 ? n : 1; };
  const isPackageDeal = d => !!d && R.termOf(d) === 'package' && !!d.package_id;
  /* a deal uses its package from Confirm QT on and while it is not cancelled */
  const usesPackage = (lookups, d) => isPackageDeal(d) && d.status !== 'Cancel' && R.pillarStepReached(lookups, d.sub_status);
  function packageUsed(state, pkgId, exceptDealId) {
    return state.deals.filter(d => d.package_id === pkgId && d.deal_id !== exceptDealId && usesPackage(state.lookups, d)).reduce((a, d) => a + unitsOf(d), 0);
  }
  const packageRemaining = (state, p, exceptDealId) => num(p.units_total) - packageUsed(state, p.package_id, exceptDealId);
  /* Archived · Used up (none left) · Expired (past Valid until — its unused posts stay counted) · Active — only Active can be picked */
  function packageStatus(state, p, today) {
    if (p.archived) return 'archived';
    if (packageRemaining(state, p) <= 0) return 'used_up';
    if (p.valid_until && today && p.valid_until < today) return 'expired';
    return 'active';
  }
  const packageLabel = p => trim(p && p.name) || C.pkg.label(R.fmtNum(num(p && p.units_total)), R.baht(num(p && p.price_total)));
  /* the packages a deal may pick: Active ones of its KOL (left = what is left for this deal) + the one it has (whatever its status) */
  function packageChoices(state, kolId, today, deal) {
    const own = deal && deal.package_id;
    return packagesOf(state, kolId).filter(p => p.package_id === own || packageStatus(state, p, today) === 'active')
      .map(p => ({ pkg: p, left: packageRemaining(state, p, deal && deal.deal_id), status: packageStatus(state, p, today) }));
  }
  /* Add / Edit package: a name · posts ≥ 1 (not fewer than used) · a price above ฿0 · dates · a payee of this KOL */
  function validatePackage(state, d) {
    const errs = [], used = d.package_id ? packageUsed(state, d.package_id) : 0, n = Number(d.units_total);
    if (!trim(d.name)) errs.push(issue('name', M.pkgName));
    if (isBlank(d.units_total) || !Number.isInteger(n) || n < 1) errs.push(issue('units_total', M.pkgUnits));
    else if (n < used) errs.push(issue('units_total', M.pkgBelowUsed(used)));
    if (isBlank(d.price_total) || isNaN(d.price_total) || Number(d.price_total) <= 0) errs.push(issue('price_total', M.pkgPrice));
    if (!isISODate(d.start_date)) errs.push(issue('start_date', M.pkgStart));
    if (!isBlank(d.valid_until) && !isISODate(d.valid_until)) errs.push(issue('valid_until', M.dateInvalid(C.pkg.fValid)));
    else if (isISODate(d.valid_until) && isISODate(d.start_date) && d.valid_until < d.start_date) errs.push(issue('valid_until', M.pkgValid));
    if (d.payee_id && !(state.payee_profiles || []).some(p => p.payee_id === d.payee_id && p.kol_id === d.kol_id)) errs.push(issue('payee_id', M.pkgPayee));
    if (R.looksSensitive(d.note) || R.looksSensitive(d.name)) errs.push(issue('note', M.sensitive));
    return { errs, warns: [], infos: [] };
  }
  const nextPackageId = state => 'PKG' + String((state.kol_packages || []).reduce((m, p) => Math.max(m, parseInt(String(p.package_id).replace(/\D/g, ''), 10) || 0), 0) + 1).padStart(6, '0');
  /* the record (o: the form · ctx {now, user}) */
  function newPackage(state, o, ctx) {
    const at = (ctx.now || new Date()).toISOString();
    return { package_id: nextPackageId(state), kol_id: o.kol_id, name: trim(o.name), units_total: Number(o.units_total), price_total: round2(o.price_total), start_date: o.start_date,
      valid_until: o.valid_until || null, payee_id: o.payee_id || null, payment_status: 'to_pay', paid_date: null, note: trim(o.note) || null, archived: false,
      created_by: ctx.user || null, created_at: at, updated_at: at };
  }
  const PKG_FIELDS = ['name', 'units_total', 'price_total', 'start_date', 'valid_until', 'payee_id', 'note', 'archived'];
  /* deal_events type package_created · package_updated · package_archived · package_paid (deal_id null · package_id) */
  const packageEvent = (type, p, ctx, from, to) => ({ event_id: ctx.eventId, deal_id: null, package_id: p.package_id, type, from: from || null, to: to || null,
    changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: ctx.note || null });

  /* ---------- money ---------- */
  /* the package's payment line (not cancelled) */
  const packageLine = (state, pkgId) => (state.payment_lines || []).filter(l => l.package_id === pkgId && l.status !== 'cancelled' && !R.isDocsOnly(l)).pop() || null;   // CR-27: not a docs-only line
  /* To pay · Sent (with Accounting) · Paid — from its line (CR-17 Simple mode flows) */
  function packagePayStatus(state, p) {
    const l = packageLine(state, p.package_id);
    return !l ? 'to_pay' : l.status === 'paid' ? 'paid' : l.status === 'submitted' ? 'sent' : 'to_pay';
  }
  /* every save (ui.commit): the package's payment_status / paid_date follow its line · a deal knows whether its package is paid (Dashboard Paid / Pending) ·
     → the package_paid events to log (the status turned paid) */
  function syncPackages(state, ctx) {
    const events = [], paid = new Map();
    (state.kol_packages || []).forEach(p => {
      const st = packagePayStatus(state, p), l = packageLine(state, p.package_id), date = st === 'paid' && l ? l.paid_date || null : null;
      if (st === 'paid' && p.payment_status !== 'paid' && ctx) events.push(packageEvent('package_paid', p, { eventId: ctx.eventId(), now: ctx.now, user: ctx.user }, p.payment_status, 'paid'));
      if (p.payment_status !== st) p.payment_status = st;
      if ((p.paid_date || null) !== date) p.paid_date = date;
      paid.set(p.package_id, st === 'paid');
    });
    state.deals.forEach(d => { const v = !!(d.package_id && R.termOf(d) === 'package' && paid.get(d.package_id)); if (!!d.package_paid !== v) d.package_paid = v; });
    return events;
  }
  /* Payments header — paid packages × the posts not used yet (archived ones left out) · not counted in any Campaign */
  function packageBalance(state) {
    return round2((state.kol_packages || []).filter(p => !p.archived && packagePayStatus(state, p) === 'paid').reduce((a, p) => a + unitPrice(p) * Math.max(0, packageRemaining(state, p)), 0));
  }
  /* the To pay row of a package nobody has paid yet (virtual until a Simple action makes its line) */
  function packagePayBase(state, p) {
    const k = R.kolById(state, p.kol_id) || {};
    return { source: 'package', package_id: p.package_id, deal_id: null, milestone: 'package', kol_id: p.kol_id, agreed_amount: round2(p.price_total), due_date: p.start_date || null,
      price_basis: null, wht_rate: null, pay_to: 'payee', status: 'open', payee_id: p.payee_id || null, created_by: p.created_by || null,
      project_label: C.pkg.payRow(k.display_name || p.kol_id, R.fmtNum(p.units_total)) };
  }

  /* ===================== §4.13 Draft notes (step_notes) ===================== */
  const STEP_NOTE_KEYS = ['draft_1', 'draft_2', 'draft_3'];
  const MAX_STEP_IMAGES = 6, STEP_IMAGE_SIDE = 1600, STEP_IMAGE_QUALITY = 0.8;
  const draftKey = n => `draft_${n}`;
  const stepNoteOf = (state, dealId, key) => (state.step_notes || []).find(x => x.deal_id === dealId && x.step_key === key) || null;
  const noteCounts = n => ({ links: ((n && n.links) || []).length, images: ((n && n.image_ids) || []).length });
  const isHttps = v => /^https:\/\/\S+$/i.test(trim(v));
  /* Note (free text, no account / ID numbers) · Links (https each) · Images (6 at most) */
  function validateStepNote(n) {
    const errs = [];
    if (R.looksSensitive(n.note)) errs.push(issue('note', M.sensitive));
    (n.links || []).forEach((l, i) => { if (!isBlank(l) && !isHttps(l)) errs.push(issue(`link${i}`, M.noteLinks)); });
    if ((n.image_ids || []).length > MAX_STEP_IMAGES) errs.push(issue('images', M.noteImagesMax(MAX_STEP_IMAGES)));
    return { errs, warns: [], infos: [] };
  }
  /* the stored record (blank links dropped) — an empty note with no link and no image is removed */
  function stepNoteRecord(dealId, key, n, ctx) {
    return { deal_id: dealId, step_key: key, note: trim(n.note) || null, links: (n.links || []).map(trim).filter(Boolean), image_ids: (n.image_ids || []).slice(0, MAX_STEP_IMAGES),
      updated_by: ctx.user || null, updated_at: (ctx.now || new Date()).toISOString() };
  }
  const stepNoteEmpty = r => !r.note && !r.links.length && !r.image_ids.length;
  /* write one (or take it away when empty) → the record before (null = none) */
  function putStepNote(state, rec) {
    if (!Array.isArray(state.step_notes)) state.step_notes = [];
    const i = state.step_notes.findIndex(x => x.deal_id === rec.deal_id && x.step_key === rec.step_key), before = i >= 0 ? state.step_notes[i] : null;
    if (stepNoteEmpty(rec)) { if (i >= 0) state.step_notes.splice(i, 1); }
    else if (i >= 0) state.step_notes[i] = rec; else state.step_notes.push(rec);
    return before;
  }
  const sameNote = (a, b) => JSON.stringify([a && a.note, a && a.links, a && a.image_ids]) === JSON.stringify([b && b.note, b && b.links, b && b.image_ids]);
  const stepNoteEvent = (dealId, key, before, after, ctx) => ({ event_id: ctx.eventId, deal_id: dealId, type: 'step_note_updated', step_key: key,
    from: before ? noteCounts(before) : null, to: after && !stepNoteEmpty(after) ? noteCounts(after) : null, changed_at: (ctx.now || new Date()).toISOString(), changed_by: ctx.user || null, note: null });
  /* the long side at most 1600px (never bigger than it is) */
  const fitImage = (w, h, max) => { const m = max || STEP_IMAGE_SIDE, s = Math.min(1, m / Math.max(w, h || 1)); return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }; };

  /* ===================== schema 19 ===================== */
  /* kol_packages · step_notes (new, empty) · deals.package_id null · package_units 1 · script_link null · package_paid false — nothing else changes (the seed has no package) */
  function migrateV19(obj) {
    if (!Array.isArray(obj.kol_packages)) obj.kol_packages = [];
    if (!Array.isArray(obj.step_notes)) obj.step_notes = [];
    (obj.deals || []).forEach(d => {
      if (d.package_id === undefined) d.package_id = null;
      if (d.package_units === undefined) d.package_units = 1;
      if (d.script_link === undefined) d.script_link = null;
      if (d.package_paid === undefined) d.package_paid = false;
    });
    (obj.payment_lines || []).forEach(l => { if (l.package_id === undefined) l.package_id = null; });
    obj.schema_version = Math.max(obj.schema_version || 0, 19);
    return obj;
  }

  return { PKG_STATUSES, PKG_PAY, packagesOf, packageById, unitPrice, unitsOf, isPackageDeal, usesPackage, packageUsed, packageRemaining, packageStatus, packageLabel, packageChoices,
    validatePackage, nextPackageId, newPackage, PKG_FIELDS, packageEvent, packageLine, packagePayStatus, syncPackages, packageBalance, packagePayBase,
    STEP_NOTE_KEYS, MAX_STEP_IMAGES, STEP_IMAGE_SIDE, STEP_IMAGE_QUALITY, draftKey, stepNoteOf, noteCounts, isHttps, validateStepNote, stepNoteRecord, stepNoteEmpty, putStepNote, sameNote, stepNoteEvent, fitImage,
    migrateV19 };
})(KT.rules, KT.content));
