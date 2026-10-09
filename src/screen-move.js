/* screen-move.js — CR-20 §4.7 · §4.9 · §4.11–4.15: the Move stage dialog — one dialog for every move (Move stage in the Deal modal · ⋯ › Move to… ·
   a card dropped on a stage that needs something). It shows what R.stageRequirements says the target needs (the Confirm QT details with Costs ·
   Steps completed by this move · Brief / Script link · Next expected · Draft n notes · Post), keeps the errors until Move is pressed (Move is
   never faded), and writes everything in one go (R.applyMove) with one Undo for all of it.
   Also §4.13 Draft notes outside a move: the small panel a Draft step of the Journey opens (Note · Links · images · Edit · delete an image).
   CR-22 — the Rate card starts empty (the deal's own, if it has one) with "Last rate card ฿x · Campaign · date" to click in (no Avg) · CTA * from
   Contacted · Sample shipment at Confirm QT (Method * · Products * with Qty · Ship to · Purchase amount for KOL buys own · Note) — a deal that has a
   shipment shows it in one line.
   CR-23 — Next expected follows R.stageRequirements (Draft k+1 / Post due required · no Expected approve) · Ship by * / Buy by under Method (empty,
   +3d +5d +7d, "Suggested: …" to click) · a Post due / Post date outside the Campaign warns under the field · Cancel = the Cancel dialog (Reason *
   from the list · Detail · Date · what it undoes: budget · the shipment (Also cancel the sample shipment ✓) · package · money already sent / paid) ·
   o.compact (a card dropped on "Drop to mark as posted"): what is complete folds into "✓ Costs ฿x · ✓ Shipment NPD" lines, the posted link first,
   Enter = Move · Mark sample as delivered ticked when the sample is not delivered yet. → KT.move */
KT.move = (function () {
  'use strict';
  const U = KT.ui;
  const { C, R, $, esc, today, store, state, commit, toast, toastAction, checksHTML, optionsHTML, activeList, dateHTML, setDate, userId, guard, stageChip } = U;
  const MV = C.move, D = C.deal, NT = C.notes;
  const dealById = id => state().deals.find(d => d.deal_id === id);
  const kolName = id => (R.kolById(state(), id) || {}).display_name || id || '';
  const str = v => (v == null ? '' : String(v));
  const money = v => String(v == null ? '' : v).replace(/[,\s฿]/g, '');
  const fmtMoney = v => { const t = money(v); return t === '' || isNaN(t) ? String(v == null ? '' : v) : Number(t).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  const EXP = ['expected_script_date', 'expected_draft1_date', 'expected_draft2_date', 'expected_draft3_date', 'expected_approve_date'];
  let mv = null;   // the open Move dialog

  /* ===================== the phase a date falls in ("→ Phase 2") ===================== */
  function phaseHint(campaignId, iso) {
    if (!R.isISODate(iso)) return '';
    const s = state(), r = R.resolvePostPhase({ expected_post_date: iso, post_date: null, phase_override: null }, R.phasesOfCampaign(s, campaignId));
    return r && r.phase ? MV.toPhase(R.phaseName(s, r.phase)) : '';
  }
  /* CR-23 §3.5 — under a Post due / Post date: "25/10 is before this campaign starts (01/11)" (orange, never blocks) · else "→ Phase 2" */
  function dateHintHTML(campaignId, iso) {
    const t = R.postDateText(R.postDateCheck(state(), campaignId, iso), iso);
    return t ? `<span class="warn">${esc(t)}</span>` : esc(phaseHint(campaignId, iso));
  }

  /* ===================== open ===================== */
  /* o = { opener, onDone(dealId), onCancel() (a dropped card goes back), compact (CR-23 §3.3: the Post drop zone), cancelOnly (§3.6: the Cancel dialog) } */
  function open(dealId, preset, o = {}) {
    if (!guard('deal.edit')) return;
    const s = state(), d = dealById(dealId); if (!d) return;
    const nx = R.nextStep(s.lookups, d), to = preset || (nx.step ? nx.step.sub_status : '');
    if (U.modalOpen()) U.closeModal();
    const cancelOnly = !!o.cancelOnly && R.isCancelStep(R.stepOf(s.lookups, to));
    mv = { id: dealId, to, o, f: initForm(s, d, to), submitted: false, applied: false, dirty: false, ed: null, cancelOnly, compact: !!o.compact, folded: null, opened: new Set() };
    const me = mv;
    mv.m = U.createModal({ size: 'M', title: cancelOnly ? C.cancel.title(d.deal_id, kolName(d.kol_id)) : MV.title(d.deal_id, kolName(d.kol_id)), opener: o.opener,
      focus: cancelOnly ? '[data-key="cancel_reason_key"]' : o.compact ? '[data-key="post0_link"]' : '#mv_to',
      onClick: e => onClick(e), isDirty: () => !!(mv && mv.dirty),
      onClose: () => { if (mv !== me) return; mv = null; if (!me.applied) { if (me.ed) KT.photos.removeStepImages(me.ed.added); if (me.o.onCancel) me.o.onCancel(); } } });
    draw(false);
  }
  const isOpen = () => !!mv;
  function initForm(s, d, to) {
    const prods = R.dealProductList(s, d.deal_id).map(x => ({ tr_code: x.tr_code, qty: '1' }));
    const f = { date: today(), note: '', cancelReason: '', addRound: false, nextRound: false,
      pillar: d.pillar || '', paymentTerm: R.beforeQt(s.lookups, to) ? '' : R.termOf(d) || R.kolTerm(s, d.kol_id) || '', packageId: d.package_id || '', packageUnits: str(d.package_units || 1),
      rateCard: !R.beforeQt(s.lookups, to) && !R.isBlank(d.rate_card) ? str(d.rate_card) : '',   // CR-31 §2.6: Contacted starts empty (empty keeps the deal's)
      cta: d.cta || '', ship: { method: '', items: prods, address_id: '', purchase_amount: '', note: '', ship_by: '' },   // CR-23 §3.4: Ship by starts empty
      cancelReasonKey: '', cancelShipments: true,   // CR-23 §3.6
      costs: { gencode_expense: str(d.gencode_expense), gencode_period: str(d.gencode_period), gencode_start_date: d.gencode_start_date || '', asset_fee: str(d.asset_fee), expediting_fee: str(d.expediting_fee),
        other_fee: Number(d.other_fee) > 0 ? str(d.other_fee) : '', other_fee_note: d.other_fee_note || '' },   // CR-30 §3.2
      gencodes: '',   // CR-30 §3.1: pasted at Post
      postDue: d.expected_post_date || '', linkBrief: d.link_brief || '', scriptLink: d.script_link || '', expected: {}, steps: {}, alsoContacted: false, contactedDate: '',
      drafts: {}, approveDate: '', posts: null, markDelivered: null };   // (null: ticked when the move goes to Post and the sample is not delivered)
    EXP.forEach(k => { f.expected[k] = d[k] || ''; });
    return f;
  }
  /* the form R.checkMove / R.applyMove get: only what the dialog shows for this target */
  function formFor(s, d, req) {
    const F = req.fields, f = mv.f, out = { date: f.date, today: today(), note: f.note, cancelReason: f.cancelReason, addRound: f.addRound, nextRound: f.nextRound };
    if (req.kind === 'cancel') { out.cancelReasonKey = f.cancelReasonKey; out.cancelShipments = f.cancelShipments !== false; out.note = ''; }   // CR-23 §3.6
    if (req.kind !== 'forward') return out;
    if (F.pillar) out.pillar = f.pillar;
    if (F.cta) out.cta = f.cta;
    if (F.ship_method) out.ship = { method: f.ship.method, items: f.ship.items.filter(x => x.tr_code).map(x => ({ tr_code: x.tr_code, qty: x.qty })), address_id: f.ship.address_id && f.ship.address_id !== '__new' ? f.ship.address_id : null,   // (a new one: made at Move)
      purchase_amount: f.ship.method === 'self_purchase' ? money(f.ship.purchase_amount) : '', note: f.ship.note, ship_by: f.ship.ship_by || '' };
    if (F.payment_term) out.paymentTerm = f.paymentTerm;
    if (F.package_id) { out.packageId = f.packageId; out.packageUnits = f.packageUnits; }
    if (F.rate_card && F.rate_card !== 'auto') out.rateCard = money(f.rateCard);
    const costs = {}; ['gencode_expense', 'gencode_period', 'gencode_start_date', 'asset_fee', 'expediting_fee', 'other_fee', 'other_fee_note'].forEach(k => { if (F[k]) costs[k] = k === 'gencode_start_date' || k === 'other_fee_note' ? f.costs[k] : money(f.costs[k]); });
    if (F.gencodes && R.trim(f.gencodes)) out.gencodes = f.gencodes;   // CR-30 §3.1
    if (Object.keys(costs).length) out.costs = costs;
    if (F.expected_post_date) out.postDue = f.postDue;
    if (F.link_brief) out.linkBrief = f.linkBrief;
    if (F.script_link) out.scriptLink = f.scriptLink;
    const exp = {}; req.next.forEach(x => { if (x.field !== 'expected_post_date') exp[x.field] = f.expected[x.field] || ''; }); if (Object.keys(exp).length) out.expected = exp;
    /* every step date shown counts as typed (the default = the move date, or the date the deal already has) */
    const steps = {}; req.skipped.forEach(st => { steps[st.sub_status] = stepValue(d, st); });
    req.drafts.forEach(k => { const st = draftStep(s, k); if (st && f.drafts[k] === 'done') steps[st.sub_status] = stepValue(d, st); });
    if (req.skipped.length || req.drafts.length) out.steps = steps;
    if (req.contacted && f.alsoContacted) { out.alsoContacted = true; out.contactedDate = f.contactedDate || f.date; }
    if (R.isPostStep(req.to)) { out.drafts = {}; req.drafts.forEach(k => { out.drafts[k] = f.drafts[k] === 'done' ? 'done' : 'not_needed'; }); }
    if (req.approve) out.approveDate = f.approveDate || f.date;
    if (req.post) out.posts = (f.posts || []).map(r => ({ post_id: r.post_id || null, account_id: r.account_id || null, link: r.link }));
    if (req.notesDraft && mv.ed) { out.notes = { note: mv.ed.note, links: mv.ed.links, image_ids: mv.ed.image_ids }; out.note = mv.ed.note; }   // CR-31 §2.5: one Note
    return out;
  }
  const draftStep = (s, k) => R.stepsOf(s.lookups).find(x => R.draftNo(x) === k) || null;
  const stepValue = (d, st) => mv.f.steps[st.sub_status] || (st.date_field && d[st.date_field]) || mv.f.date;

  /* ===================== draw ===================== */
  function draw(keep) {
    if (!mv) return;
    const s = state(), d = dealById(mv.id); if (!d) { mv.m.close(); return; }
    const req = R.stageRequirements(s, d, mv.to, mv.f), F = req.fields, f = mv.f; mv.req = req;
    if (R.isPostStep(req.to) && req.post && !f.posts) f.posts = initPosts(s, d);
    if (req.to && R.deliverStep(req.to) && f.markDelivered == null) f.markDelivered = true;   // CR-23 §3.3 · CR-32 §2.2: from Draft 1 on, the KOL has the product
    if (req.notesDraft && (!mv.ed || mv.ed.k !== req.notesDraft)) { if (mv.ed) KT.photos.removeStepImages(mv.ed.added); mv.ed = notesEditor(d.deal_id, req.notesDraft); }
    if (!req.notesDraft && mv.ed) { KT.photos.removeStepImages(mv.ed.added); mv.ed = null; }
    const plan = R.planOf(d), nx = R.nextStep(s.lookups, d), optional = new Set(nx.optional.map(x => x.sub_status));
    const opts = R.stepsOf(s.lookups).filter(st => st.active !== false && st.sub_status !== d.sub_status && (R.isCancelStep(st) || R.inPlan(st, plan) || R.draftNo(st))).map(st => ({
      value: st.sub_status, label: `${st.sub_status}${nx.step && st.sub_status === nx.step.sub_status ? ` · ${D.moveNext}` : optional.has(st.sub_status) ? ` · ${D.moveOptional}` : !R.inPlan(st, plan) ? ` · ${D.moveNotPlanned}` : ''}` }));
    const isPost = !!req.to && R.isPostStep(req.to), k = req.to ? R.draftNo(req.to) : null, beyond = !!k && k > plan.drafts && req.kind !== 'cancel';
    const isCancel = req.kind === 'cancel';
    const head = `<p class="muted small mv-now">${esc(MV.now)} ${stageChip(d)}</p><div class="fields">` +
      (mv.cancelOnly ? '' : fld('to', MV.to, `<select id="mv_to" data-mvsel="to" data-key="to">${optionsHTML(opts, mv.to, D.chooseStep)}</select>`, { req: 1, wide: 1 })) +
      (isCancel ? cancelFieldsHTML(s, d) : '') +
      fld('date', isCancel ? C.cancel.date : R.moveDateLabel(req.to), dateHTML('id="mv_date" data-mv="date" data-key="date"', f.date, { label: isCancel ? C.cancel.date : R.moveDateLabel(req.to) }), { req: 1, hint: isPost ? '<span class="mv-phase" data-phasefor="date"></span>' : '' }) +   // CR-31 §2.4
      (beyond ? `<div class="field wide"><label class="tick"><input type="checkbox" data-mvtick="addRound"${f.addRound ? ' checked' : ''}> ${esc(MV.addTargetRound(k))}</label></div>` : '') + `</div>`;
    const parts = [head];
    if (isCancel) parts.push(cancelImpactHTML(s, d));
    if (req.kind === 'forward') {
      /* CR-23 §3.3 — compact (the Post drop zone): the parts already complete when it opened fold into ✓ lines (a click opens one) */
      const fold = compactFold(s, d, req), done = [];
      const put = (key, html, line) => { if (fold.has(key) && !mv.opened.has(key)) done.push(`<button type="button" class="chipbtn mv-doneline" data-mvopen="${key}" title="${esc(MV.expandTip)}">${esc(line)}</button>`); else parts.push(html); };
      const st = stepsHTML(s, d, req); if (st) put('steps', st, MV.doneSteps);
      if (F.payment_term || F.rate_card || F.cta) put('qt', qtHTML(s, d, req), req.qt ? MV.doneCosts(R.baht(R.totalCost(req.v))) : MV.doneQt);
      if (req.ship || req.shipSummary) put('ship', shipHTML(s, d, req), MV.doneShip(req.shipSummary ? R.shipMethodLabel(s.lookups, req.shipSummary.method || 'warehouse') : ''));
      if ((F.link_brief || F.script_link) && !mv.compact) parts.push(sec(MV.secLinks, `<div class="fields">${F.link_brief ? fld('link_brief', MV.briefLink, `<input type="url" data-mv="linkBrief" data-key="link_brief" value="${esc(f.linkBrief)}" placeholder="${esc(MV.linkPh)}" autocomplete="off">`, { wide: 1 }) : ''}` +
        `${F.script_link ? fld('script_link', MV.scriptLink, `<input type="url" data-mv="scriptLink" data-key="script_link" value="${esc(f.scriptLink)}" placeholder="${esc(MV.linkPh)}" autocomplete="off">`, { wide: 1 }) : ''}</div>`));
      if (req.next.length) parts.push(nextHTML(s, d, req));
      if (req.notesDraft && mv.ed) parts.push(sec(NT.title(req.notesDraft), notesEditorHTML(mv.ed, 'mv')));
      if (isPost) parts.push(postHTML(s, d, req));
      const dv = deliverHTML(s, d, req); if (dv) parts.push(dv);   // CR-32 §2.2
      if (done.length) parts.splice(1, 0, `<div class="mv-done">${done.join('')}</div>`);
    }
    const noteReq = F.note === 'req';
    if (!isCancel && !(mv.compact && isPost) && !(req.notesDraft && mv.ed)) parts.push(`<div class="fields">${fld('note', MV.noteHistory, `<textarea id="mv_note" data-mv="note" data-key="note">${esc(f.note)}</textarea>`, { req: noteReq, wide: 1, hint: esc(D.moveNoteHint) })}</div>`);
    mv.m.setBody(`<div class="mv" id="mv_root">${parts.join('')}</div>`, keep);
    mv.m.setFoot(`<div class="mv-foot"><div class="mv-list" id="mv_list"></div><div class="mv-foot1" id="mv_round"></div><div class="checks" id="mv_checks"></div>${mv.compact && isPost ? `<span class="muted small mv-enter">${esc(MV.enterHint)}</span>` : ''}</div>`,
      isCancel ? `<button type="button" class="btn" data-cmclose>${esc(C.cancel.keep)}</button><button type="button" class="btn danger" id="mv_ok" data-mvok>${esc(C.cancel.ok)}</button>`
        : `<button type="button" class="btn" data-cmclose>${esc(MV.cancel)}</button><button type="button" class="btn primary" id="mv_ok" data-mvok>${esc(MV.move)}</button>`);
    wire(); live(); fillThumbs($('mv_root'));
  }
  /* CR-23 §3.3 — the parts that fold (decided once, when the compact dialog opens: nothing folds while typing): steps passed (their dates
     come from the move) · Confirm QT details with nothing missing · a shipment the deal already has */
  function compactFold(s, d, req) {
    if (!mv.compact || !req.to || !R.isPostStep(req.to)) return new Set();
    if (mv.folded) return mv.folded;
    const res = R.checkMove(s, d, mv.to, formFor(s, d, req)), bad = keys => res.errs.some(e => keys.some(k => e.field === k || String(e.field).startsWith(k)));
    const out = new Set();
    if (!bad(['step:', 'approve_date'])) out.add('steps');
    if (!bad(['cta', 'pillar', 'payment_term', 'package_id', 'package_units', 'rate_card', 'gencode_expense', 'gencode_period', 'asset_fee', 'expediting_fee', 'other_fee', 'other_fee_note', 'expected_post_date'])) out.add('qt');
    if (!req.ship && req.shipSummary) out.add('ship');
    return (mv.folded = out);
  }
  /* CR-23 §3.6 — Reason * (lookups.cancel_reasons) · Detail (needed for Other) */
  function cancelFieldsHTML(s, d) {
    const f = mv.f, list = R.cancelReasonsOf(s.lookups).filter(x => x.active !== false || x.key === f.cancelReasonKey).map(x => ({ value: x.key, label: x.label }));
    return fld('cancel_reason_key', C.cancel.reason, `<select data-mvsel="cancelReasonKey" data-key="cancel_reason_key">${optionsHTML(list, f.cancelReasonKey, C.cancel.chooseReason)}</select>`, { req: 1, wide: 1 }) +
      fld('cancel_reason', C.cancel.detail, `<input id="mv_reason" data-mv="cancelReason" data-key="cancel_reason" value="${esc(f.cancelReason)}" autocomplete="off">`, { req: f.cancelReasonKey === R.CANCEL_OTHER, wide: 1, hint: esc(C.cancel.detailHint) });
  }
  /* what the Cancel undoes, before it is done (R.cancelImpact) */
  function cancelImpactHTML(s, d) {
    const x = R.cancelImpact(s, d), K = C.cancel, rows = [];
    if (x.release > 0) rows.push(`<li>${esc(K.releases(R.baht(x.release)))}</li>`);
    if (x.toCancel.length) rows.push(`<li><label class="tick"><input type="checkbox" data-mvtick="cancelShipments"${mv.f.cancelShipments !== false ? ' checked' : ''}> ${esc(K.alsoShip)}</label>` +
      `<div class="muted small">${x.toCancel.map(sh => esc(KT.samples.summaryText(sh))).join('<br>')}</div></li>`);
    x.kept.forEach(sh => rows.push(`<li class="muted">${esc(K.stays(KT.samples.summaryText(sh)))}</li>`));
    if (x.pkg) rows.push(`<li>${esc(K.pkgReturns(x.pkg.units))}</li>`);
    return sec(K.impact, (rows.length ? `<ul class="mv-impact">${rows.join('')}</ul>` : `<p class="muted small">${esc(K.nothing)}</p>`) +
      (x.paid ? `<div class="check warn">! <span>${esc(K.paidWarn(x.paid === 'paid' ? K.paid : K.sent))}</span></div>` : ''));
  }
  const fld = (key, label, input, o = {}) => `<div class="field${o.wide ? ' wide' : ''}" data-fk="${esc(key)}"><label>${esc(label)}${o.req ? ' <span class="req">*</span>' : ''}</label>${input}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}<div class="mv-err" data-err="${esc(key)}"></div></div>`;
  const sec = (title, body, extra) => `<section class="mv-sec"><div class="mv-sh"><b>${esc(title)}</b>${extra || ''}</div>${body}</section>`;
  const moneyIn = (path, key, v, o = {}) => `<input type="text" inputmode="decimal" class="mv-money" data-mv="${path}" data-key="${key}" value="${esc(fmtMoney(v))}" autocomplete="off"${o.disabled ? ' disabled' : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>`;

  /* §4.9 — Steps completed by this move (+ Also mark Contacted) · Post: Draft 2 / 3 Not needed or Done on */
  function stepsHTML(s, d, req) {
    const f = mv.f, rows = [];
    if (req.contacted) rows.push(`<div class="mv-step"><label class="tick"><input type="checkbox" data-mvtick="alsoContacted"${f.alsoContacted ? ' checked' : ''}> ${esc(MV.alsoContacted)}</label>` +
      (f.alsoContacted ? dateHTML(`data-mv="contactedDate" data-key="step:${esc(req.contacted.sub_status)}"`, f.contactedDate || f.date, { label: req.contacted.sub_status }) : '') + `<div class="mv-err" data-err="step:${esc(req.contacted.sub_status)}"></div></div>`);
    const list = req.skipped.map(st => ({ st, draft: null })).concat(req.drafts.map(k => ({ st: draftStep(s, k), draft: k }))).filter(x => x.st).sort((a, b) => a.st.sort_order - b.st.sort_order);
    list.forEach(x => {
      const key = `step:${x.st.sub_status}`, done = !x.draft || f.drafts[x.draft] === 'done';
      rows.push(`<div class="mv-step"><span class="mv-sn">${esc(x.st.sub_status)}</span>` +
        (x.draft ? `<select data-mvsel="drafts.${x.draft}" aria-label="${esc(x.st.sub_status)}"><option value="not_needed"${done ? '' : ' selected'}>${esc(MV.notNeeded)}</option><option value="done"${done ? ' selected' : ''}>${esc(MV.doneOn)}</option></select>` : '') +
        (done ? dateHTML(`data-mv="steps.${esc(x.st.sub_status)}" data-key="${esc(key)}"`, stepValue(d, x.st), { label: x.st.sub_status }) : '') + `<div class="mv-err" data-err="${esc(key)}"></div></div>`);
    });
    if (!rows.length) return '';
    return sec(MV.secSteps, `<p class="hint mv-sh2">${esc(MV.stepsHint)}</p><div class="mv-steps">${rows.join('')}</div>`);
  }
  /* §4.7 · §4.11 — Confirm QT details (Contacted: Rate + Payment term, optional) */
  function qtHTML(s, d, req) {
    const F = req.fields, f = mv.f, v = req.v, term = R.termOf(v), qt = req.qt;
    const early = R.beforeQt(s.lookups, mv.to);   // CR-31 §2.6: Contacted
    const last = R.lastRateCard(s, d.kol_id, d.deal_id);   // CR-22 §3.1: the last rate card (never an average)
    const terms = R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] }));
    const pk = R.packageById(s, v.package_id), units = Number(f.packageUnits);
    const pkgOpts = R.packageChoices(s, d.kol_id, today(), d).map(x => ({ value: x.pkg.package_id, label: MV.pkgOption(R.packageLabel(x.pkg), Math.max(0, x.left)) }));
    const pkgHTML = term !== 'package' ? '' :
      fld('package_id', MV.package, `<select data-mvsel="packageId" data-key="package_id">${optionsHTML(pkgOpts, f.packageId, MV.choosePackage)}</select>`, { req: 1, hint: `<button type="button" class="link" data-mvact="newPackage">${esc(MV.newPackage)}</button>` }) +
      fld('package_units', MV.uses, `<input type="number" min="1" step="1" inputmode="numeric" data-mv="packageUnits" data-key="package_units" value="${esc(f.packageUnits)}">`, { req: 1,
        hint: pk ? esc(MV.willUse(Number.isInteger(units) && units > 0 ? units : 1, Math.max(0, R.packageRemaining(s, pk, d.deal_id) - (Number.isInteger(units) && units > 0 ? units : 1)))) : '' });
    const pillarF = F.pillar ? fld('pillar', MV.pillar, `<select data-mv="pillar" data-key="pillar">${optionsHTML(activeList('pillar_list', f.pillar), f.pillar, MV.choosePillar)}</select>`, { req: F.pillar === 'req' }) : '';
    const termF = fld('payment_term', MV.term, `<select data-mvsel="paymentTerm" data-key="payment_term">${optionsHTML(terms, f.paymentTerm, MV.chooseTerm)}</select>`, { req: F.payment_term === 'req',
      hint: early && R.termOf(d) ? esc(`${MV.currentTerm(C.term[R.termOf(d)] || R.termOf(d))} · ${MV.keepEmpty}`) : '' });
    const cur = !R.isBlank(d.rate_card) ? `<span class="srctag">${esc(MV.currentRate(R.baht(d.rate_card)))}</span>` : '';
    const rateHint = F.rate_card === 'auto' ? `<span class="srctag">${esc(MV.fromPackage)}</span>` : early ? [cur, esc(MV.keepEmpty), cur && !last ? '' : lastRateHTML(s, last, 'data-mvact="useLast"')].filter(Boolean).join(' · ')
      : [lastRateHTML(s, last, 'data-mvact="useLast"'), esc(MV.zeroHint)].join(' · ');
    const ctaF = F.cta ? fld('cta', MV.cta, `<select data-mvsel="cta" data-key="cta">${optionsHTML(activeList('cta_list', f.cta), f.cta, MV.chooseCta)}</select>`, { req: F.cta === 'req' }) : '';
    const rateF = fld('rate_card', MV.rateCard, moneyIn('rateCard', 'rate_card', F.rate_card === 'auto' ? v.rate_card : f.rateCard, { disabled: F.rate_card === 'auto' }), { req: F.rate_card === 'req', hint: rateHint + '<span class="mv-ratetotal" id="mv_ratetotal"></span>' });
    if (!qt) return sec(early ? MV.secContacted : MV.secQt, `<div class="fields">${ctaF}${F.rate_card ? rateF : ''}${F.payment_term ? termF : ''}${pkgHTML}</div>`);   // CR-31 §2.6
    const gen = Number(money(f.costs.gencode_expense)) > 0;
    const costs = `<div class="fields mv-costs">${rateF}` +
      fld('gencode_expense', MV.gencodeCost, moneyIn('costs.gencode_expense', 'gencode_expense', f.costs.gencode_expense, { ph: '0' })) +
      (gen ? fld('gencode_period', MV.gencodeDays, `<input type="number" min="1" step="1" inputmode="numeric" data-mv="costs.gencode_period" data-key="gencode_period" value="${esc(f.costs.gencode_period)}">`, { req: 1 }) +
        fld('gencode_start_date', MV.gencodeStart, dateHTML('data-mv="costs.gencode_start_date" data-key="gencode_start_date"', f.costs.gencode_start_date, { label: MV.gencodeStart })) : '') +
      fld('asset_fee', MV.assetFee, moneyIn('costs.asset_fee', 'asset_fee', f.costs.asset_fee, { ph: '0' })) +
      fld('expediting_fee', MV.expeditingFee, moneyIn('costs.expediting_fee', 'expediting_fee', f.costs.expediting_fee, { ph: '0' })) +
      fld('other_fee', C.deal.f.other_fee, moneyIn('costs.other_fee', 'other_fee', f.costs.other_fee, { ph: '0' })) +   // CR-30 §3.2
      fld('other_fee_note', C.deal.f.other_fee_note, `<input data-mv="costs.other_fee_note" data-key="other_fee_note" value="${esc(f.costs.other_fee_note)}" placeholder="${esc(D.otherFeePh)}" autocomplete="off">`, { req: F.other_fee_note === 'req' }) +
      `<div class="field wide mv-total"><div class="kv total"><span>${esc(MV.totalCost)}</span><b id="mv_total"></b></div>${!R.isBlank(d.basket_fee) && Number(d.basket_fee) > 0 ? `<div class="hint">${esc(MV.includesBasket(R.baht(d.basket_fee)))}</div>` : ''}</div></div>`;
    const postDue = F.expected_post_date && !req.next.some(x => x.field === 'expected_post_date')
      ? `<div class="fields">${fld('expected_post_date', MV.postDue, dateHTML('data-mv="postDue" data-key="expected_post_date"', f.postDue, { label: MV.postDue }), { hint: '<span class="mv-phase" data-phasefor="postDue"></span>' })}</div>` : '';
    return sec(MV.secQt, `<div class="fields">${ctaF}${pillarF}${termF}${pkgHTML}</div>`) + sec(MV.secCosts, costs + postDue + `<div id="mv_budget" class="mv-budget"></div>`);
  }
  /* CR-22 §3.1 — "Last rate card ฿100,000 · Campaign · dd/mm/yyyy" (the amount is a button: it puts the rate in the box) · "No rate on file" */
  function lastRateHTML(s, last, attr) {
    if (!last) return `<span class="lastrate muted">${esc(MV.noRate)}</span>`;
    const c = (s.campaigns.find(x => x.campaign_id === last.campaign_id) || {}).campaign_name || '';
    const t = MV.lastRate('§', c, last.date ? R.dmy(last.date) : ''), [a, z] = t.split('§');
    return `<span class="lastrate">${esc(a)}<button type="button" class="link" ${attr} data-amount="${esc(String(last.amount))}" title="${esc(MV.useLastTip)}">${esc(R.baht(last.amount))}</button>${esc(z)}</span>`;
  }
  /* CR-22 §3.3 — Sample shipment: Method * (NPD · Warehouse · KOL buys own) · Products * (the Campaign's) with Qty · Ship to (NPD / Warehouse) ·
     Purchase amount (KOL buys own) · Note — a deal with a shipment: it in one line + Edit */
  function shipHTML(s, d, req) {
    if (!req.ship) return sec(MV.secShip, `<p class="mv-shipline">${esc(KT.samples.summaryText(req.shipSummary))} · <button type="button" class="link" data-mvact="editShip">${esc(MV.editShip)}</button></p>`);
    const f = mv.f, sh = f.ship, prods = R.campaignProducts(s, d.campaign_id).filter(p => p.active !== false), picked = new Map(sh.items.map(x => [x.tr_code, x]));
    const methods = R.SHIP_METHODS.map(k => `<label class="tick mv-radio"><input type="radio" name="mv_method" data-mvship="method" value="${k}"${sh.method === k ? ' checked' : ''}> ${esc(R.shipMethodLabel(s.lookups, k))}</label>`).join('');
    const items = prods.length ? `<div class="mv-items">${prods.map(p => { const x = picked.get(p.tr_code);
      return `<div class="mv-item"><label class="tick"><input type="checkbox" data-mvitem="${esc(p.tr_code)}"${x ? ' checked' : ''}> ${esc(R.productShort(p))}</label>` +
        (x ? `<input type="number" min="1" step="1" inputmode="numeric" class="mv-qty" data-mvqty="${esc(p.tr_code)}" value="${esc(x.qty)}" aria-label="${esc(`${MV.qty} · ${R.productShort(p)}`)}">` : '') + `</div>`; }).join('')}</div>`
      : `<div class="hint">${esc(MV.noCampaignProducts)}</div>`;
    const own = sh.method === 'self_purchase', addrs = R.shipToOptions(s, d.kol_id);
    /* CR-23 §3.4 — Ship by * (NPD / Warehouse) · Buy by (KOL buys own): empty · +3d +5d +7d from the move date · the CR-10 sum as a suggestion to click */
    const sbL = own ? MV.buyBy : MV.shipBy, sg = R.shipBySuggest(req.v, s.lookups.sample_settings);
    const plus = [3, 5, 7].map(n => `<button type="button" class="btn small ghost" data-plus="ship.ship_by|${n}">${esc(MV.plusDays(n))}</button>`).join('');
    const shipBy = fld('ship_by', sbL, `<div class="mv-exp">${dateHTML('data-mv="ship.ship_by" data-key="ship_by"', sh.ship_by, { label: sbL })}<span class="mv-plus">${plus}</span></div>`,
      { req: !own, wide: 1, hint: sg && !own ? `<button type="button" class="link" data-mvact="useSuggest" data-date="${esc(sg.date)}" title="${esc(MV.suggestTip)}">${esc(MV.suggested(R.dmy(sg.date).slice(0, 5), sg.days, sg.from))}</button>` : '' });
    return sec(MV.secShip, `<div class="fields">` +
      fld('ship_method', MV.method, `<div class="mv-methods" role="radiogroup" data-key="ship_method">${methods}</div>`, { req: 1, wide: 1 }) + shipBy +
      fld('ship_items', MV.products, items, { req: 1, wide: 1 }) +
      (own ? fld('purchase_amount', MV.purchaseAmount, moneyIn('ship.purchase_amount', 'purchase_amount', sh.purchase_amount, { ph: '0' }), { hint: esc(MV.purchaseHint) })
        : fld('ship_to', MV.shipTo, `<select data-mvsel="ship.address_id" data-key="ship_to">${optionsHTML(addrs.concat([{ value: '__new', label: MV.newAddress }]), sh.address_id, MV.chooseLater)}</select>`,
          { wide: sh.address_id === '__new' }) + (sh.address_id === '__new' ? `<div class="field wide" data-fk="ship_new">${KT.payee.addrInlineHTML('mv', mv.newAddr)}<div class="mv-err" data-err="ai_box"></div></div>` : '')) +   // CR-31 §2.3
      fld('ship_note', MV.shipNote, `<input data-mv="ship.note" data-key="ship_note" value="${esc(sh.note)}" autocomplete="off">`, { wide: !own }) + `</div>`);
  }
  /* §4.15 — Next expected (+3d · +5d · +7d · + Add Draft k round / Remove) */
  function nextHTML(s, d, req) {
    const f = mv.f, rows = req.next.map(x => {
      const lab = x.field === 'expected_post_date' ? MV.postDue : x.field === 'expected_script_date' ? MV.expScript : x.field === 'expected_approve_date' ? MV.expApprove : MV.expDraft(Number(x.field.replace(/\D/g, '')));
      const path = x.field === 'expected_post_date' ? 'postDue' : `expected.${x.field}`, val = x.field === 'expected_post_date' ? f.postDue : f.expected[x.field];
      const plus = [3, 5, 7].map(n => `<button type="button" class="btn small ghost" data-plus="${esc(path)}|${n}">${esc(MV.plusDays(n))}</button>`).join('');
      return fld(x.field, lab, `<div class="mv-exp">${dateHTML(`data-mv="${esc(path)}" data-key="${esc(x.field)}"`, val, { label: lab })}<span class="mv-plus">${plus}</span></div>`,
        { req: x.req, wide: 1, hint: x.field === 'expected_post_date' ? '<span class="mv-phase" data-phasefor="postDue"></span>' : '' });
    });
    const nr = req.nextRound ? (req.nextRound.on ? `<button type="button" class="link" data-mvact="nextRoundOff">${esc(MV.removeRound)}</button>` : `<button type="button" class="link" data-mvact="nextRoundOn">${esc(MV.addRound(req.nextRound.k))}</button>`) : '';
    return sec(MV.secNext, `<div class="fields">${rows.join('')}</div>`, nr ? `<span class="mv-nr">${nr}</span>` : '');
  }
  /* §4.14 — Post: Approve date · the posted link(s) (one row per post not posted yet · + Add another post) · Mark sample as delivered */
  function initPosts(s, d) {
    const open = R.postsOf(s, d.deal_id).filter(p => !R.postDone(p));
    if (open.length) return open.map(p => ({ post_id: p.post_id, account_id: p.account_id, link: p.post_link || '' }));
    const acc = R.accountsOfKol(s, d.kol_id).slice().sort((a, b) => (Number(b.followers) || 0) - (Number(a.followers) || 0))[0];
    return R.postsOf(s, d.deal_id).length ? [] : [{ post_id: null, account_id: acc ? acc.account_id : '', link: '' }];
  }
  /* CR-32 §2.2 — Draft k · Approve · Post and a sample not delivered yet: ☑ Mark sample as delivered (ticked) + the date (the move's) · KOL buys own: Mark product as purchased */
  function deliverHTML(s, d, req) {
    if (!req.to || !R.deliverStep(req.to) || !R.canShipWork(U.actor())) return '';
    const sh = R.shipmentToDeliver(s, d); if (!sh) return '';
    const f = mv.f, buy = sh.status === 'kol_purchase', dl = buy ? MV.purchasedOn : MV.deliveredOn;
    return `<div class="fields mv-deliver" data-fk="deliver"><div class="field wide"><label class="tick"><input type="checkbox" data-mvtick="markDelivered"${f.markDelivered ? ' checked' : ''}> ${esc(buy ? MV.markPurchasedOn : MV.markDeliveredOn)}</label>` +
      `<div class="hint">${esc(KT.samples.summaryText(sh))}</div></div>` +
      (f.markDelivered ? fld('deliver_date', dl, dateHTML('data-mv="deliverDate" data-key="deliver_date"', f.deliverDate || f.date, { label: dl })) : '') + `</div>`;
  }
  function postHTML(s, d, req) {
    const f = mv.f, accs = R.accountsOfKol(s, d.kol_id), accOpts = accs.map(a => ({ value: a.account_id, label: `${a.platform} @${a.handle}` }));
    const rows = (f.posts || []).map((r, i) => {
      const a = accs.find(x => x.account_id === r.account_id);
      return `<div class="mv-post"><div class="mv-pacc">${r.post_id ? `${U.pfIcon(a ? a.platform : 'Other')} <span>@${esc(a ? a.handle : r.account_id)}</span>` : `<select data-mv="posts.${i}.account_id" data-key="post${i}_account" aria-label="${esc(MV.account)}">${optionsHTML(accOpts, r.account_id, MV.chooseAccount)}</select>`}</div>` +
        `<input type="url" data-mv="posts.${i}.link" data-key="post${i}_link" value="${esc(r.link)}" placeholder="${esc(MV.linkPh)}" aria-label="${esc(MV.postedLink)}" autocomplete="off">` +
        `<button type="button" class="icon-btn" data-mvrmpost="${i}" title="${esc(MV.removePostRow)}" aria-label="${esc(MV.removePostRow)}">×</button><div class="mv-err" data-err="post${i}_link"></div><div class="mv-err" data-err="post${i}_account"></div></div>`;
    }).join('');
    return sec(MV.secPost, `<div class="fields">${req.approve ? fld('approve_date', MV.approveDate, dateHTML('data-mv="approveDate" data-key="approve_date"', f.approveDate || f.date, { label: MV.approveDate }), { req: 1 }) : ''}</div>` +
      (req.post ? `<div class="field wide" data-fk="posts"><label>${esc(MV.postedLink)} <span class="req">*</span></label><div class="mv-posts">${rows}</div>` +
        `<button type="button" class="link" data-mvact="addPost"${accs.length ? '' : ' disabled'}>${esc(MV.addPostRow)}</button><div class="mv-err" data-err="posts"></div></div>` : '') +
      (req.fields.gencodes ? `<div class="field wide"><label for="mv_gencodes">${esc(C.gencode.moveL)}</label><textarea id="mv_gencodes" data-mv="gencodes" data-key="gencodes" rows="3" class="gc-code" spellcheck="false" placeholder="${esc(C.gencode.movePh)}">${esc(f.gencodes || '')}</textarea><div class="hint" id="mv_gcprev"></div></div>` : ''));   // CR-30 §3.1
  }

  /* ===================== live parts (no redraw — typing keeps its focus) ===================== */
  function live() {
    if (!mv || !$('mv_root')) return;
    const s = state(), d = dealById(mv.id); if (!d) return;
    const req = R.stageRequirements(s, d, mv.to, mv.f), form = formFor(s, d, req), res = R.checkMove(s, d, mv.to, form), v = req.v; mv.req = req; mv.res = res;
    /* totals · the budget line · the phase of the Post due */
    const total = R.COST_KEYS.concat(['product_purchase_fee']).reduce((a, k) => a + (R.isBlank(v[k]) || isNaN(v[k]) ? 0 : Number(v[k])), 0);
    if ($('mv_total')) $('mv_total').textContent = R.baht(total);
    if ($('mv_ratetotal')) $('mv_ratetotal').textContent = total !== (Number(v.rate_card) || 0) ? ` · ${MV.totalLine(R.baht(total))}` : '';
    const b = R.moveBudget(s, d, mv.to, form);
    if ($('mv_budget')) $('mv_budget').innerHTML = b ? `<span class="${b.after < 0 ? 'over' : ''}">${esc(MV.budgetLine(R.baht(b.before), R.baht(b.after)))}</span>` + (b.after < 0 ? `<div class="check warn">! <span>${esc(C.msg.campaignOver(R.baht(-b.after)))}</span></div>` : '') : '';
    document.querySelectorAll('#mv_root [data-phasefor]').forEach(el => { el.innerHTML = dateHintHTML(d.campaign_id, el.dataset.phasefor === 'date' ? mv.f.date : mv.f.postDue); });   // CR-23 §3.5
    /* warnings show now · errors after Move (§4.7) */
    const show = mv.submitted ? res.errs : [];
    document.querySelectorAll('#mv_root [data-err]').forEach(el => {
      const k = el.dataset.err, e = show.find(x => x.field === k), w = res.warns.find(x => x.field === k);
      el.innerHTML = e ? `<span class="err">${esc(e.msg)}</span>` : w ? `<span class="warn">${esc(w.msg)}</span>` : '';
    });
    document.querySelectorAll('#mv_root [data-key]').forEach(el => {
      const bad = show.some(x => x.field === el.dataset.key), t = el.type === 'hidden' ? el.closest('.dfield') : el;
      if (t) t.classList.toggle('invalid', bad);
    });
    const placed = new Set([...document.querySelectorAll('#mv_root [data-err]')].map(x => x.dataset.err));
    const box = mv.submitted && res.errs.length ? `<div class="mv-errbox"><b>${esc((req.kind === 'cancel' ? C.cancel.errBox : MV.errBox)(res.errs.length))}</b><ul>${res.errs.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul></div>` : '';
    const other = { errs: [], warns: res.warns.filter(w => !placed.has(w.field) && w.code !== 'auto_done'), infos: res.infos.filter(x => x.code !== 'rounds') };
    $('mv_checks').innerHTML = box + checksHTML(other, '');
    const rounds = res.infos.find(x => x.code === 'rounds'); if ($('mv_round')) $('mv_round').textContent = rounds ? `i ${rounds.msg}` : '';   // CR-30 §3.3: one line, no scroll box
    if ($('mv_gcprev')) { const p = R.gencodePreview(s, d, mv.f.gencodes || ''), n = t => p.rows.filter(r => r.type === t).length;   // CR-30 §3.1
      $('mv_gcprev').textContent = p.rows.length ? [C.gencode.countN(p.rows.length), ...R.GENCODE_TYPES.filter(n).map(t => `${C.gencode.types[t]} ${n(t)}`), p.dupes ? C.gencode.dupes(p.dupes) : ''].filter(Boolean).join(' · ') : ''; }
    /* §4.14 — the checklist (Post) */
    if ($('mv_list')) $('mv_list').innerHTML = req.to && R.isPostStep(req.to) && req.kind === 'forward' ? checklistHTML(req, res) : '';
  }
  function checklistHTML(req, res) {
    const L = MV.checklist, bad = keys => res.errs.some(e => keys.some(k => e.field === k || String(e.field).startsWith(k)));
    const qtKeys = ['pillar', 'payment_term', 'package_id', 'package_units', 'rate_card', 'gencode_expense', 'gencode_period', 'asset_fee', 'expediting_fee', 'other_fee', 'other_fee_note'];
    const it = (ok, label, opt) => `<span class="mv-ck${ok ? ' ok' : opt ? ' opt' : ''}">${ok ? '✓' : '○'} ${esc(label)}</span>`;
    return [req.qt ? it(!bad(qtKeys), L.costs) : '', req.approve ? it(!bad(['approve_date']), L.approve) : '', req.post ? it(!bad(['post', 'posts']), L.link) : '',
      req.fields.link_brief ? it(!R.isBlank(mv.f.linkBrief), L.brief, true) : '', req.fields.script_link ? it(!R.isBlank(mv.f.scriptLink), L.script, true) : ''].filter(Boolean).join('');
  }

  /* ===================== events ===================== */
  const setPath = (path, val) => { const ps = path.split('.'); let o = mv.f; for (let i = 0; i < ps.length - 1; i++) { if (o[ps[i]] == null) o[ps[i]] = {}; o = o[ps[i]]; } o[ps[ps.length - 1]] = val; };
  function wire() {
    const root = $('mv_root'); if (!root || root.dataset.wired) return;
    root.dataset.wired = '1';
    root.addEventListener('input', e => {
      const el = e.target.closest('[data-mv]'); if (!el || !mv) return;
      setPath(el.dataset.mv, el.value === 'invalid' ? 'invalid' : el.value); mv.dirty = true;
      if (el.dataset.mv === 'date') { /* the steps not typed follow the date */ }
      live();
    });
    root.addEventListener('change', e => {
      if (!mv) return;
      /* CR-22 §3.3 — the method (a redraw: Ship to ↔ Purchase amount) · a product ticked (its Qty appears) · a Qty */
      const ms = e.target.closest('[data-mvship]'); if (ms) { mv.f.ship.method = ms.value; mv.dirty = true; draw(true); return; }
      const it = e.target.closest('[data-mvitem]'); if (it) { const code = it.dataset.mvitem; mv.f.ship.items = it.checked ? mv.f.ship.items.concat([{ tr_code: code, qty: '1' }]) : mv.f.ship.items.filter(x => x.tr_code !== code); mv.dirty = true; draw(true); return; }
      const q = e.target.closest('[data-mvqty]'); if (q) { const x = mv.f.ship.items.find(y => y.tr_code === q.dataset.mvqty); if (x) x.qty = q.value; mv.dirty = true; live(); return; }
      const sel = e.target.closest('[data-mvsel]');
      if (sel) { const p = sel.dataset.mvsel; mv.dirty = true;
        if (p === 'to') { mv.to = sel.value; mv.f.addRound = false; mv.f.nextRound = false; mv.f.posts = null;
          const s0 = state(), d0 = dealById(mv.id);
          if (R.beforeQt(s0.lookups, mv.to)) { mv.f.rateCard = ''; mv.f.paymentTerm = ''; }
          else { if (mv.f.rateCard === '' && !R.isBlank(d0.rate_card)) mv.f.rateCard = str(d0.rate_card); if (mv.f.paymentTerm === '') mv.f.paymentTerm = R.termOf(d0) || R.kolTerm(s0, d0.kol_id) || ''; } }
        else if (p.startsWith('drafts.')) { const k = Number(p.split('.')[1]), on = sel.value === 'done'; (mv.req.drafts || []).forEach(j => { if (on && j < k) mv.f.drafts[j] = 'done'; if (!on && j > k) mv.f.drafts[j] = 'not_needed'; }); mv.f.drafts[k] = sel.value; }
        else setPath(p, sel.value);
        if (p === 'paymentTerm' && sel.value !== 'package') mv.f.packageId = '';
        draw(true); return; }
      const t = e.target.closest('[data-mvtick]');
      if (t) { mv.f[t.dataset.mvtick] = t.checked; mv.dirty = true; draw(true); return; }
      const el = e.target.closest('[data-mv]');
      if (el) {
        if (el.classList.contains('mv-money')) el.value = fmtMoney(el.value);
        const p = el.dataset.mv;
        /* a Gencode cost above 0 asks for its days (a field appears) */
        if (p === 'costs.gencode_expense') { draw(true); return; }
        live();
      }
    });
    if (mv.ed) notesWire(root, mv.ed, () => { if (mv) { mv.dirty = true; live(); } }, () => draw(true));
    /* CR-31 §2.3 — the new address: kept by the dialog while it is open (never in the state) · Unlock to add */
    root.addEventListener('input', e => { const a = e.target.closest('[data-ai]'); if (!a || !mv) return; mv.newAddr = mv.newAddr || {}; mv.newAddr[a.dataset.ai] = a.type === 'checkbox' ? a.checked : a.value; mv.dirty = true; });
    root.addEventListener('change', e => { const a = e.target.closest('[data-ai="default"]'); if (a && mv) { mv.newAddr = mv.newAddr || {}; mv.newAddr.default = a.checked; } });
    root.addEventListener('click', e => { if (!e.target.closest('[data-aiunlock]') || !mv) return; const me = mv; KT.payee.unlockDialog(() => { if (mv === me) draw(true); }); });
    /* CR-23 §3.3 — compact: Enter in a box = Move (errors show as with the button) */
    root.addEventListener('keydown', e => { if (!mv || !(mv.compact || mv.o.enter) || e.key !== 'Enter' || e.isComposing || !e.target.matches('input:not([type="checkbox"]):not([type="radio"])')) return; e.preventDefault(); submit(); });
  }
  function onClick(e) {
    if (!mv) return;
    const pl = e.target.closest('[data-plus]');
    if (pl) { const [path, n] = pl.dataset.plus.split('|'); if (!R.isISODate(mv.f.date)) return; const iso = R.addDays(mv.f.date, Number(n)); setPath(path, iso); mv.dirty = true;
      const h = $('mv_root').querySelector(`input[type=hidden][data-mv="${CSS.escape(path)}"]`); setDate(h, iso); live(); return; }
    const op = e.target.closest('[data-mvopen]'); if (op) { mv.opened.add(op.dataset.mvopen); draw(true); return; }   // CR-23 §3.3: a ✓ line opens
    const rm = e.target.closest('[data-mvrmpost]'); if (rm) { mv.f.posts.splice(+rm.dataset.mvrmpost, 1); mv.dirty = true; draw(true); return; }
    const a = e.target.closest('[data-mvact]');
    if (a && !a.disabled) {
      const act = a.dataset.mvact, s = state(), d = dealById(mv.id);
      if (act === 'nextRoundOn' || act === 'nextRoundOff') { mv.f.nextRound = act === 'nextRoundOn'; mv.dirty = true; draw(true); return; }
      if (act === 'addPost') { const used = new Set(mv.f.posts.map(r => r.account_id)), acc = R.accountsOfKol(s, d.kol_id).find(x => !used.has(x.account_id)) || R.accountsOfKol(s, d.kol_id)[0];
        mv.f.posts.push({ post_id: null, account_id: acc ? acc.account_id : '', link: '' }); mv.dirty = true; draw(true); return; }
      if (act === 'newPackage') { newPackagePanel(d); return; }
      /* CR-22 §3.1 — the last rate card into the box (only when clicked) */
      if (act === 'useLast') { mv.f.rateCard = a.dataset.amount; mv.dirty = true; const el = $('mv_root').querySelector('[data-mv="rateCard"]'); if (el) el.value = fmtMoney(a.dataset.amount); live(); return; }
      if (act === 'editShip') { const id = mv.id; mv.applied = false; U.closeModal(); KT.screens.deals.openDealModal(id, { tab: 'shipments', focus: 'ship_by', source: 'move' }); return; }   // CR-28
      /* CR-23 §3.4 — the suggested Ship by into the box (only when clicked) */
      if (act === 'useSuggest') { mv.f.ship.ship_by = a.dataset.date; mv.dirty = true; setDate($('mv_root').querySelector('input[type=hidden][data-mv="ship.ship_by"]'), a.dataset.date); live(); return; }
    }
    if (e.target.closest('[data-mvok]')) { submit(); return; }
    if (mv.ed && notesClick(e, mv.ed, () => { mv.dirty = true; draw(true); })) return;
  }
  /* + New package (§4.8): the short form in place of the dialog, then back with it picked */
  function newPackagePanel(d) {
    const me = mv;
    KT.packages.openForm(d.kol_id, null, { panel: true, back: () => { if (mv === me) draw(true); }, after: id => { if (mv !== me) return; mv.f.paymentTerm = 'package'; mv.f.packageId = id; mv.dirty = true; draw(true); } });
  }

  /* ===================== Move ===================== */
  async function submit() {
    if (!mv || !guard('deal.edit')) return;
    const s = state(), d = dealById(mv.id); if (!d) return;
    mv.submitted = true; live();
    if (mv.res.errs.length && mv.folded && mv.folded.size) { const e0 = mv.res.errs.map(e => String(e.field));
      const want = [['steps', x => x.startsWith('step:') || x === 'approve_date'], ['ship', x => x.startsWith('ship') || x === 'purchase_amount'], ['qt', () => true]].find(([k, t]) => mv.folded.has(k) && !mv.opened.has(k) && e0.some(t));
      if (want && !document.querySelector(`#mv_root [data-key="${CSS.escape(e0[0])}"]`)) { mv.opened.add(want[0]); draw(true); live(); } }
    if (mv.res.errs.length) { const first = $('mv_root').querySelector('.invalid, .mv-err .err'); if (first) first.scrollIntoView({ block: 'center' }); return; }
    /* CR-31 §2.3 — Ship to › + New address: checked, then encrypted and saved before the move (the move links it) */
    const newAddr = mv.req.ship && mv.f.ship.method !== 'self_purchase' && mv.f.ship.address_id === '__new';
    if (newAddr) {
      const x = KT.payee.addrInlineRead($('mv_root')), errs = KT.payee.addrInlineCheck(d.kol_id, x);
      document.querySelectorAll('#mv_root [data-err^="ai_"]').forEach(el => { const e = errs.find(y => y.field === el.dataset.err); el.innerHTML = e ? `<span class="err">${esc(e.msg)}</span>` : ''; });
      document.querySelectorAll('#mv_root [data-ai]').forEach(el => el.classList.toggle('invalid', errs.some(y => y.field === 'ai_' + el.dataset.ai)));
      if (errs.length) { const first = $('mv_root').querySelector('[data-fk="ship_new"]'); if (first) first.scrollIntoView({ block: 'center' }); return; }
      let rec = null; try { rec = await KT.payee.addrInlineSave(d.kol_id, x); } catch (e) { toast(C.payee.noCrypto); return; }
      if (!mv) return;
      mv.f.ship.address_id = rec.address_id; mv.newAddr = null;
    }
    const form = formFor(s, d, mv.req), to = mv.to, ed = mv.ed, deliver = mv.f.markDelivered && R.deliverStep(mv.req.to) && R.canShipWork(U.actor()), o = mv.o;   // CR-32 §2.2
    const deliverDate = R.isISODate(mv.f.deliverDate) ? mv.f.deliverDate : form.date;
    mv.applied = true;
    U.closeModal();
    apply(d.deal_id, to, form, { ed, deliver, deliverDate, onDone: o.onDone });
  }
  /* the move (dialog or drop): applyMove · its posts · its notes · Undo puts every part back */
  function apply(dealId, to, form, o = {}) {
    const s = state(), d = dealById(dealId); if (!d) return null;
    const key = form.notes || R.trim(form.note) ? R.stepKeyOf(R.stepOf(s.lookups, to)) : null;   // CR-31 §2.5: every step's note
    const snap = snapshot(s, dealId, key);
    let pn = parseInt(store.newId('post').slice(1), 10);
    const r = R.applyMove(s, d, to, form, { logId: store.newLogId(), quoteId: store.newId('quote'), eventId: store.newEventId(), now: new Date(), user: userId(), postId: () => 'P' + String(pn++).padStart(6, '0'), shipmentId: () => store.newId('shipment') });
    s.deals[s.deals.indexOf(d)] = r.deal; r.logs.forEach(l => s.deal_status_log.push(l)); if (r.quote) s.kol_rate_quotes.push(r.quote); r.events.forEach(ev => s.deal_events.push(ev));
    if (r.shipment) s.sample_shipments.push(r.shipment);   // CR-22 §3.3
    if (r.products) R.setDealProducts(s, dealId, r.products);   // CR-23 §3.8 #3: a deal with no Products takes the shipment's
    if (r.shipments && r.shipments.length) { const by = new Map(r.shipments.map(x => [x.shipment_id, x])); s.sample_shipments = s.sample_shipments.map(x => by.get(x.shipment_id) || x); }   // CR-23 §3.6
    if (r.posts) s.deal_posts = s.deal_posts.filter(p => p.deal_id !== dealId).concat(r.posts);
    if (r.note) R.putStepNote(s, r.note);
    /* CR-30 §3.1 — the Gencodes pasted at Post: on the deal (each to its post by platform) */
    if (form.gencodes) { const pv = R.gencodePreview(s, r.deal, form.gencodes); let e = 0, c = 0; const be = store.newEventId(), bc = parseInt(String(store.newId('gencode')).replace(/\D/g, ''), 10) || 1;
      const x = R.addGencodes(s, r.deal, pv.rows, { eventId: () => be + e++, codeId: () => 'GC-' + String(bc + c++).padStart(5, '0'), now: new Date().toISOString(), user: userId() });
      R.gencodesAll(s).push(...x.records); x.events.forEach(ev => s.deal_events.push(ev)); }
    if (o.deliver) { let e = 0; const base = store.newEventId(); const evs = R.deliverOnMove(s, r.deal, o.deliverDate || form.date, { eventId: () => base + e++, now: new Date().toISOString(), user: userId() }); if (evs) s.deal_events.push(...evs); }   // CR-32 §2.2
    const gone = o.ed ? o.ed.removed.slice() : [];
    commit();
    if (o.onDone) o.onDone(dealId);
    let undone = false;
    if (gone.length) setTimeout(() => { if (!undone) KT.photos.removeStepImages(gone); }, 12000);
    toastAction(MV.done(dealId, to), D.undo, () => {
      undone = true;
      restore(state(), snap);
      if (o.ed) KT.photos.removeStepImages(o.ed.added);
      commit(MV.undone);
      if (o.onDone) o.onDone(dealId);
    }, 10000, o.addNote ? [{ label: MV.addNote, fn: () => openAddNote(dealId, to, o.onDone) }] : undefined);   // CR-31 §2.5: a move at once › Add note
    return r;
  }
  /* CR-31 §2.5 — Add note (after a move at once): the note of the step it reached · in History on the move's line */
  function openAddNote(dealId, toSub, onDone) {
    if (!guard('deal.edit')) return;
    const s = state(), d = dealById(dealId), st = R.stepOf(s.lookups, toSub); if (!d || !st) return;
    const key = R.stepKeyOf(st), old = R.stepNoteOf(s, dealId, key);
    U.openDialog(`<div class="dlg-h">${esc(MV.addNoteTitle(toSub, dealId))}</div><div class="dlg-b"><div class="field"><label for="an_note">${esc(MV.noteHistory)}</label>` +
      `<textarea id="an_note" rows="3">${esc((old && old.note) || '')}</textarea></div><div class="checks" id="an_checks"></div></div>` +
      `<div class="dlg-f"><button type="button" class="btn" id="an_cancel">${esc(C.common.cancel)}</button><button type="button" class="btn primary" id="an_ok">${esc(C.common.save)}</button></div>`);
    $('an_cancel').addEventListener('click', U.closeDialog);
    $('an_ok').addEventListener('click', () => {
      const text = R.trim($('an_note').value);
      if (R.looksSensitive(text)) { $('an_checks').innerHTML = checksHTML({ errs: [{ field: 'note', msg: C.msg.sensitive }], warns: [], infos: [] }, ''); return; }
      const s2 = state(), now = new Date(), before = R.stepNoteOf(s2, dealId, key);
      const rec = R.stepNoteRecord(dealId, key, { note: text, links: before ? before.links : [], image_ids: before ? before.image_ids : [] }, { now, user: userId() });
      R.putStepNote(s2, rec);
      s2.deal_events.push(R.stepNoteEvent(dealId, key, before, rec, { eventId: store.newEventId(), now, user: userId() }));
      /* the move's own line in History says it too */
      const log = R.logsOf(s2, dealId).filter(l => l.sub_status === toSub).pop(); if (log && text) log.note = [log.note, text].filter(Boolean).join(' · ');
      U.closeDialog(); commit(MV.noteSaved(toSub)); if (onDone) onDone(dealId);
    });
    setTimeout(() => $('an_note').focus(), 30);
  }
  const clone = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
  function snapshot(s, id, key) {
    return { id, key, deal: clone(dealById(id)), posts: clone(R.postsOf(s, id)), note: key ? clone(R.stepNoteOf(s, id, key)) : undefined,
      logMax: s.deal_status_log.reduce((m, l) => Math.max(m, Number(l.log_id) || 0), 0), eventMax: s.deal_events.reduce((m, e) => Math.max(m, Number(e.event_id) || 0), 0),
      quotes: new Set(s.kol_rate_quotes.map(q => q.quote_id)), ships: clone((s.sample_shipments || []).filter(x => x.deal_id === id)), products: clone((s.deal_products || []).filter(x => x.deal_id === id)),
      gencodes: clone((s.deal_gencodes || []).filter(x => x.deal_id === id)) };   // CR-30
  }
  function restore(s, snap) {
    const i = s.deals.findIndex(x => x.deal_id === snap.id); if (i < 0) return;
    s.deals[i] = snap.deal;
    s.deal_status_log = s.deal_status_log.filter(l => !(l.deal_id === snap.id && Number(l.log_id) > snap.logMax));
    s.deal_events = s.deal_events.filter(e => !(e.deal_id === snap.id && Number(e.event_id) > snap.eventMax));
    s.kol_rate_quotes = s.kol_rate_quotes.filter(q => snap.quotes.has(q.quote_id));
    s.deal_posts = s.deal_posts.filter(p => p.deal_id !== snap.id).concat(snap.posts);
    if (snap.key) { s.step_notes = (s.step_notes || []).filter(x => !(x.deal_id === snap.id && x.step_key === snap.key)); if (snap.note) s.step_notes.push(snap.note); }
    if (Array.isArray(s.sample_shipments)) s.sample_shipments = s.sample_shipments.filter(x => x.deal_id !== snap.id).concat(snap.ships);
    if (snap.products) s.deal_products = (s.deal_products || []).filter(x => x.deal_id !== snap.id).concat(snap.products);
    if (snap.gencodes) s.deal_gencodes = (s.deal_gencodes || []).filter(x => x.deal_id !== snap.id).concat(snap.gencodes);
  }

  /* ===================== §4.13 Draft notes — the editor (the Move dialog · the Journey panel) ===================== */
  /* ed = { dealId, k, key, note, links [], image_ids [], added [] (images stored while editing), removed [] (to delete once saved) } */
  function notesEditor(dealId, k) {
    const n = R.stepNoteOf(state(), dealId, R.draftKey(k)) || {};
    return { dealId, k, key: R.draftKey(k), note: n.note || '', links: (n.links || []).slice(), image_ids: (n.image_ids || []).slice(), added: [], removed: [] };
  }
  function notesEditorHTML(ed, pre) {
    const off = !KT.photos.available();
    const links = ed.links.map((l, i) => `<div class="nt-link"><input type="url" data-ntlink="${i}" data-key="note_link${i}" value="${esc(l)}" placeholder="${esc(MV.linkPh)}" aria-label="${esc(NT.links)} ${i + 1}" autocomplete="off">` +
      `<button type="button" class="icon-btn" data-ntrmlink="${i}" aria-label="${esc(NT.removeLink)}" title="${esc(NT.removeLink)}">×</button><div class="mv-err" data-err="note_link${i}"></div></div>`).join('');
    const imgs = ed.image_ids.map(id => `<span class="nt-thumb"><img data-img="${esc(id)}" alt=""><button type="button" class="nt-x" data-ntrmimg="${esc(id)}" aria-label="${esc(NT.delImage)}" title="${esc(NT.delImage)}">×</button></span>`).join('');
    return `<div class="nt-ed" data-nted="${pre}"><div class="field wide"><label>${esc(NT.note)}</label><textarea data-ntnote data-key="note_note" placeholder="${esc(NT.notePh)}">${esc(ed.note)}</textarea><div class="mv-err" data-err="note_note"></div></div>` +
      `<div class="field wide"><label>${esc(NT.links)}</label>${links}<button type="button" class="link" data-ntaddlink>${esc(NT.addLink)}</button></div>` +
      `<div class="field wide"><label>${esc(NT.images)} <span class="muted small">${ed.image_ids.length} / ${R.MAX_STEP_IMAGES}</span></label>` +
      (off ? `<div class="hint">${esc(NT.imagesOff)}</div>` : `<div class="nt-drop" data-ntdrop tabindex="0"><div class="nt-thumbs">${imgs}</div><label class="btn small"><input type="file" accept="image/*" multiple data-ntfile hidden>${esc(NT.addImages)}</label><span class="muted small">${esc(NT.dropHint)}</span></div>`) +
      `<div class="hint">${esc(NT.warn)}</div><div class="mv-err" data-err="note_images"></div></div></div>`;
  }
  /* changed(): something typed · redraw(): the list of links / images changed */
  function notesWire(root, ed, changed, redraw) {
    const box = root.querySelector('.nt-ed'); if (!box) return;
    box.addEventListener('input', e => {
      if (e.target.matches('[data-ntnote]')) { ed.note = e.target.value; changed(); }
      const l = e.target.closest('[data-ntlink]'); if (l) { ed.links[+l.dataset.ntlink] = l.value; changed(); }
    });
    const files = async list => {
      const s = [...list].filter(Boolean);
      for (const f of s) {
        if (ed.image_ids.length >= R.MAX_STEP_IMAGES) { toast(C.msg.noteImagesMax(R.MAX_STEP_IMAGES)); break; }
        if (!/^image\//.test(f.type || '')) { toast(C.msg.noteNotImage); continue; }
        try { const r = await KT.photos.addStepImage(f, ed.dealId, ed.key); ed.image_ids.push(r.image_id); ed.added.push(r.image_id); } catch (err) { toast(C.msg.noteNotImage); }
      }
      redraw();
    };
    box.addEventListener('change', e => { if (e.target.matches('[data-ntfile]')) { files(e.target.files); e.target.value = ''; } });
    const drop = box.querySelector('[data-ntdrop]');
    if (drop) {
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('on'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('on'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('on'); files(e.dataTransfer.files || []); });
    }
    box._paste = e => { const it = [...((e.clipboardData && e.clipboardData.items) || [])].filter(x => x.kind === 'file' && /^image\//.test(x.type)); if (!it.length) return; e.preventDefault(); files(it.map(x => x.getAsFile())); };
    const root2 = box.closest('dialog') || document;
    if (root2._ntPaste) root2.removeEventListener('paste', root2._ntPaste);
    root2._ntPaste = e => { if (box.isConnected) box._paste(e); };
    root2.addEventListener('paste', root2._ntPaste);
  }
  /* clicks inside the editor → true when handled */
  function notesClick(e, ed, redraw) {
    if (e.target.closest('[data-ntaddlink]')) { ed.links.push(''); redraw(); const ins = document.querySelectorAll('[data-ntlink]'); if (ins.length) ins[ins.length - 1].focus(); return true; }
    const rl = e.target.closest('[data-ntrmlink]'); if (rl) { ed.links.splice(+rl.dataset.ntrmlink, 1); redraw(); return true; }
    const ri = e.target.closest('[data-ntrmimg]');
    if (ri) { const id = ri.dataset.ntrmimg; ed.image_ids = ed.image_ids.filter(x => x !== id);
      if (ed.added.includes(id)) { ed.added = ed.added.filter(x => x !== id); KT.photos.removeStepImages([id]); } else ed.removed.push(id); redraw(); return true; }
    return false;
  }
  function fillThumbs(root) {
    if (!root || !KT.photos.available()) return;
    root.querySelectorAll('img[data-img]').forEach(img => { const u = KT.photos.stepUrlNow(img.dataset.img); if (u) img.src = u; else KT.photos.stepUrl(img.dataset.img).then(x => { if (x) img.src = x; }); });
  }

  /* ===================== the Journey's Draft panel (Deal modal › Journey › Draft n) ===================== */
  /* "Draft 1 · 12/10/2026": Note · Links · images (a click shows it large · ‹ ›) · Edit · × an image (asks first) · o = { opener, after() } */
  function openNotes(dealId, k, o = {}) {
    const s = state(), d = dealById(dealId); if (!d) return;
    const st = draftStep(s, k), date = st && d[st.date_field] ? R.dmy(d[st.date_field]) : '';
    const nv = { dealId, k, mode: 'view', ed: null, big: null, o };
    const can = U.can('deal.edit') && !R.campaignCancelled(s, d.campaign_id);
    const h = U.createModal({ size: 'M', title: NT.panel(k, date), opener: o.opener, isDirty: () => nv.mode === 'edit' && !!nv.dirty,
      onClose: () => { if (nv.ed) KT.photos.removeStepImages(nv.ed.added); if (o.after) o.after(); },
      onClick: e => {
        if (nv.mode === 'edit') {
          if (e.target.closest('[data-ntsave]')) { saveNotes(nv); return; }
          if (e.target.closest('[data-ntcancel]')) { KT.photos.removeStepImages(nv.ed.added); nv.ed = null; nv.mode = 'view'; nv.dirty = false; drawNotes(nv, h, can); return; }
          if (notesClick(e, nv.ed, () => { nv.dirty = true; drawNotes(nv, h, can, true); })) return;
          return;
        }
        if (e.target.closest('[data-ntedit]')) { nv.ed = notesEditor(dealId, k); nv.mode = 'edit'; nv.dirty = false; drawNotes(nv, h, can); return; }
        const big = e.target.closest('[data-ntbig]'); if (big) { nv.big = +big.dataset.ntbig; drawNotes(nv, h, can); return; }
        const nb = e.target.closest('[data-ntnav]'); if (nb) { const n = (R.stepNoteOf(state(), dealId, R.draftKey(k)) || { image_ids: [] }).image_ids.length; nv.big = (nv.big + Number(nb.dataset.ntnav) + n) % n; drawNotes(nv, h, can); return; }
        if (e.target.closest('[data-ntbigclose]')) { nv.big = null; drawNotes(nv, h, can); return; }
        const del = e.target.closest('[data-ntdel]'); if (del) { deleteImage(nv, del.dataset.ntdel, h, can); return; }
      } });
    drawNotes(nv, h, can);
  }
  function drawNotes(nv, h, can, keep) {
    const s = state(), n = R.stepNoteOf(s, nv.dealId, R.draftKey(nv.k));
    if (nv.mode === 'edit') {
      h.setBody(notesEditorHTML(nv.ed, 'nt'), keep);
      h.setFoot(`<div class="checks" id="nt_checks"></div>`, `<button type="button" class="btn" data-ntcancel>${esc(NT.cancel)}</button><button type="button" class="btn primary" data-ntsave>${esc(NT.save)}</button>`);
      notesWire(h.body(), nv.ed, () => { nv.dirty = true; }, () => drawNotes(nv, h, can, true));
      fillThumbs(h.body()); return;
    }
    const ids = (n && n.image_ids) || [];
    if (nv.big != null && ids[nv.big]) {
      h.setBody(`<div class="nt-big"><img data-img="${esc(ids[nv.big])}" alt=""><div class="nt-bigbar"><button type="button" class="btn small" data-ntnav="-1" aria-label="${esc(NT.prev)}">‹</button><span class="muted small">${esc(NT.imageN(nv.big + 1, ids.length))}</span>` +
        `<button type="button" class="btn small" data-ntnav="1" aria-label="${esc(NT.next)}">›</button><span class="spacer"></span><button type="button" class="btn small" data-ntbigclose>${esc(NT.close)}</button></div></div>`);
      h.setFoot('', `<button type="button" class="btn" data-cmclose>${esc(NT.close)}</button>`); fillThumbs(h.body()); return;
    }
    const body = !n ? `<div class="hint">${esc(NT.none)}</div>` :
      (n.note ? `<p class="nt-note">${esc(n.note)}</p>` : '') +
      (n.links.length ? `<div class="nt-links">${n.links.map(l => `<a href="${esc(l)}" target="_blank" rel="noopener">${esc(l)}</a>`).join('')}</div>` : '') +
      (ids.length ? `<div class="nt-thumbs">${ids.map((id, i) => `<span class="nt-thumb"><button type="button" class="nt-open" data-ntbig="${i}" aria-label="${esc(NT.imageN(i + 1, ids.length))}"><img data-img="${esc(id)}" alt=""></button>` +
        (can ? `<button type="button" class="nt-x" data-ntdel="${esc(id)}" aria-label="${esc(NT.delImage)}" title="${esc(NT.delImage)}">×</button>` : '') + `</span>`).join('')}</div>` : '') +
      `<div class="muted small">${esc(C.notes.counts(n.links.length, ids.length))}</div>`;
    h.setBody(`<div class="nt-view">${body}</div>`);
    h.setFoot('', `<button type="button" class="btn" data-cmclose>${esc(NT.close)}</button>${can ? `<button type="button" class="btn primary" data-ntedit>${esc(NT.edit)}</button>` : ''}`);
    fillThumbs(h.body());
  }
  function saveNotes(nv) {
    if (!guard('deal.edit')) return;
    const s = state(), ed = nv.ed, res = R.validateStepNote(ed);
    if (res.errs.length) { $('nt_checks').innerHTML = checksHTML(res, ''); return; }
    const old = R.stepNoteOf(s, nv.dealId, ed.key), rec = R.stepNoteRecord(nv.dealId, ed.key, ed, { now: new Date(), user: userId() });
    if (!R.sameNote(old, rec)) { R.putStepNote(s, rec); s.deal_events.push(R.stepNoteEvent(nv.dealId, ed.key, old, rec, { eventId: store.newEventId(), now: new Date(), user: userId() })); }
    KT.photos.removeStepImages(ed.removed);
    ed.added = []; nv.ed = null; nv.mode = 'view'; nv.dirty = false;
    commit(NT.saved(nv.k));
    U.closeModal();
  }
  async function deleteImage(nv, id, h, can) {
    if (!(await U.confirmDialog(NT.delAsk, NT.delBody, NT.delOk, true))) return;
    const s = state(), old = R.stepNoteOf(s, nv.dealId, R.draftKey(nv.k)); if (!old) return;
    const rec = R.stepNoteRecord(nv.dealId, old.step_key, Object.assign({}, old, { image_ids: old.image_ids.filter(x => x !== id) }), { now: new Date(), user: userId() });
    R.putStepNote(s, rec); s.deal_events.push(R.stepNoteEvent(nv.dealId, old.step_key, old, rec, { eventId: store.newEventId(), now: new Date(), user: userId() }));
    KT.photos.removeStepImages([id]); commit();
    drawNotes(nv, h, can);
  }

  return { lastRateHTML, open, isOpen, apply, phaseHint, dateHintHTML, openNotes, notesEditor, notesEditorHTML, notesWire, notesClick, fillThumbs, snapshot, restore, fmtMoney, money };
})();
