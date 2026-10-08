/* screen-move.js — CR-20 §4.7 · §4.9 · §4.11–4.15: the Move stage dialog — one dialog for every move (Move stage in the Deal modal · ⋯ › Move to… ·
   a card dropped on a stage that needs something). It shows what R.stageRequirements says the target needs (the Confirm QT details with Costs ·
   Steps completed by this move · Brief / Script link · Next expected · Draft n notes · Post), keeps the errors until Move is pressed (Move is
   never faded), and writes everything in one go (R.applyMove) with one Undo for all of it.
   Also §4.13 Draft notes outside a move: the small panel a Draft step of the Journey opens (Note · Links · images · Edit · delete an image).
   → KT.move */
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

  /* ===================== open ===================== */
  /* o = { opener, onDone(dealId), onCancel() (a dropped card goes back) } */
  function open(dealId, preset, o = {}) {
    if (!guard('deal.edit')) return;
    const s = state(), d = dealById(dealId); if (!d) return;
    const nx = R.nextStep(s.lookups, d), to = preset || (nx.step ? nx.step.sub_status : '');
    if (U.modalOpen()) U.closeModal();
    mv = { id: dealId, to, o, f: initForm(s, d, to), submitted: false, applied: false, dirty: false, ed: null };
    const me = mv;
    mv.m = U.createModal({ size: 'M', title: MV.title(d.deal_id, kolName(d.kol_id)), opener: o.opener, focus: '#mv_to',
      onClick: e => onClick(e), isDirty: () => !!(mv && mv.dirty),
      onClose: () => { if (mv !== me) return; mv = null; if (!me.applied) { if (me.ed) KT.photos.removeStepImages(me.ed.added); if (me.o.onCancel) me.o.onCancel(); } } });
    draw(false);
  }
  const isOpen = () => !!mv;
  function initForm(s, d, to) {
    const ref = R.costReference(s, d.kol_id, d.deal_id), latest = ref.latest ? ref.latest.values.rate_card : null;
    const f = { date: today(), note: '', cancelReason: '', addRound: false, nextRound: false,
      pillar: d.pillar || '', paymentTerm: R.termOf(d) || R.kolTerm(s, d.kol_id) || '', packageId: d.package_id || '', packageUnits: str(d.package_units || 1),
      rateCard: !R.isBlank(d.rate_card) ? str(d.rate_card) : latest != null ? str(latest) : '',
      costs: { gencode_expense: str(d.gencode_expense), gencode_period: str(d.gencode_period), gencode_start_date: d.gencode_start_date || '', asset_fee: str(d.asset_fee), expediting_fee: str(d.expediting_fee) },
      postDue: d.expected_post_date || '', linkBrief: d.link_brief || '', scriptLink: d.script_link || '', expected: {}, steps: {}, alsoContacted: false, contactedDate: '',
      drafts: {}, approveDate: '', posts: null, markDelivered: false };
    EXP.forEach(k => { f.expected[k] = d[k] || ''; });
    return f;
  }
  /* the form R.checkMove / R.applyMove get: only what the dialog shows for this target */
  function formFor(s, d, req) {
    const F = req.fields, f = mv.f, out = { date: f.date, today: today(), note: f.note, cancelReason: f.cancelReason, addRound: f.addRound, nextRound: f.nextRound };
    if (req.kind !== 'forward') return out;
    if (F.pillar) out.pillar = f.pillar;
    if (F.payment_term) out.paymentTerm = f.paymentTerm;
    if (F.package_id) { out.packageId = f.packageId; out.packageUnits = f.packageUnits; }
    if (F.rate_card && F.rate_card !== 'auto') out.rateCard = money(f.rateCard);
    const costs = {}; ['gencode_expense', 'gencode_period', 'gencode_start_date', 'asset_fee', 'expediting_fee'].forEach(k => { if (F[k]) costs[k] = k === 'gencode_start_date' ? f.costs[k] : money(f.costs[k]); });
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
    if (req.notesDraft && mv.ed) out.notes = { note: mv.ed.note, links: mv.ed.links, image_ids: mv.ed.image_ids };
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
    if (req.notesDraft && (!mv.ed || mv.ed.k !== req.notesDraft)) { if (mv.ed) KT.photos.removeStepImages(mv.ed.added); mv.ed = notesEditor(d.deal_id, req.notesDraft); }
    if (!req.notesDraft && mv.ed) { KT.photos.removeStepImages(mv.ed.added); mv.ed = null; }
    const plan = R.planOf(d), nx = R.nextStep(s.lookups, d), optional = new Set(nx.optional.map(x => x.sub_status));
    const opts = R.stepsOf(s.lookups).filter(st => st.active !== false && st.sub_status !== d.sub_status && (R.isCancelStep(st) || R.inPlan(st, plan) || R.draftNo(st))).map(st => ({
      value: st.sub_status, label: `${st.sub_status}${nx.step && st.sub_status === nx.step.sub_status ? ` · ${D.moveNext}` : optional.has(st.sub_status) ? ` · ${D.moveOptional}` : !R.inPlan(st, plan) ? ` · ${D.moveNotPlanned}` : ''}` }));
    const isPost = !!req.to && R.isPostStep(req.to), k = req.to ? R.draftNo(req.to) : null, beyond = !!k && k > plan.drafts && req.kind !== 'cancel';
    const head = `<p class="muted small mv-now">${esc(MV.now)} ${stageChip(d)}</p><div class="fields">` +
      fld('to', MV.to, `<select id="mv_to" data-mvsel="to" data-key="to">${optionsHTML(opts, mv.to, D.chooseStep)}</select>`, { req: 1, wide: 1 }) +
      fld('date', isPost ? MV.postDate : MV.date, dateHTML('id="mv_date" data-mv="date" data-key="date"', f.date, { label: isPost ? MV.postDate : MV.date }), { req: 1 }) +
      (beyond ? `<div class="field wide"><label class="tick"><input type="checkbox" data-mvtick="addRound"${f.addRound ? ' checked' : ''}> ${esc(MV.addTargetRound(k))}</label></div>` : '') +
      (req.kind === 'cancel' ? fld('cancel_reason', MV.reason, `<input id="mv_reason" data-mv="cancelReason" data-key="cancel_reason" value="${esc(f.cancelReason)}" autocomplete="off">`, { req: 1, wide: 1 }) : '') + `</div>`;
    const parts = [head];
    if (req.kind === 'forward') {
      parts.push(stepsHTML(s, d, req));
      if (F.payment_term || F.rate_card) parts.push(qtHTML(s, d, req));
      if (F.link_brief || F.script_link) parts.push(sec(MV.secLinks, `<div class="fields">${F.link_brief ? fld('link_brief', MV.briefLink, `<input type="url" data-mv="linkBrief" data-key="link_brief" value="${esc(f.linkBrief)}" placeholder="${esc(MV.linkPh)}" autocomplete="off">`, { wide: 1 }) : ''}` +
        `${F.script_link ? fld('script_link', MV.scriptLink, `<input type="url" data-mv="scriptLink" data-key="script_link" value="${esc(f.scriptLink)}" placeholder="${esc(MV.linkPh)}" autocomplete="off">`, { wide: 1 }) : ''}</div>`));
      if (req.next.length) parts.push(nextHTML(s, d, req));
      if (req.notesDraft && mv.ed) parts.push(sec(NT.title(req.notesDraft), notesEditorHTML(mv.ed, 'mv')));
      if (isPost) parts.push(postHTML(s, d, req));
    }
    const noteReq = F.note === 'req';
    parts.push(`<div class="fields">${fld('note', MV.note, `<textarea id="mv_note" data-mv="note" data-key="note">${esc(f.note)}</textarea>`, { req: noteReq, wide: 1, hint: esc(D.moveNoteHint) })}</div>`);
    mv.m.setBody(`<div class="mv" id="mv_root">${parts.join('')}</div>`, keep);
    mv.m.setFoot(`<div class="mv-foot"><div class="mv-list" id="mv_list"></div><div class="checks" id="mv_checks"></div></div>`,
      `<button type="button" class="btn" data-cmclose>${esc(MV.cancel)}</button><button type="button" class="btn primary" id="mv_ok" data-mvok>${esc(MV.move)}</button>`);
    wire(); live(); fillThumbs($('mv_root'));
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
    const ref = R.costReference(s, d.kol_id, d.deal_id), lat = ref.latest ? ref.latest.total : null, avg = ref.average ? ref.average.total : null;   // the Price reference words (CR-07): Latest · Average
    const terms = R.PAYMENT_TERMS.map(t => ({ value: t, label: C.term[t] }));
    const pk = R.packageById(s, v.package_id), units = Number(f.packageUnits);
    const pkgOpts = R.packageChoices(s, d.kol_id, today(), d).map(x => ({ value: x.pkg.package_id, label: MV.pkgOption(R.packageLabel(x.pkg), Math.max(0, x.left)) }));
    const pkgHTML = term !== 'package' ? '' :
      fld('package_id', MV.package, `<select data-mvsel="packageId" data-key="package_id">${optionsHTML(pkgOpts, f.packageId, MV.choosePackage)}</select>`, { req: 1, hint: `<button type="button" class="link" data-mvact="newPackage">${esc(MV.newPackage)}</button>` }) +
      fld('package_units', MV.uses, `<input type="number" min="1" step="1" inputmode="numeric" data-mv="packageUnits" data-key="package_units" value="${esc(f.packageUnits)}">`, { req: 1,
        hint: pk ? esc(MV.willUse(Number.isInteger(units) && units > 0 ? units : 1, Math.max(0, R.packageRemaining(s, pk, d.deal_id) - (Number.isInteger(units) && units > 0 ? units : 1)))) : '' });
    const pillarF = F.pillar ? fld('pillar', MV.pillar, `<select data-mv="pillar" data-key="pillar">${optionsHTML(activeList('pillar_list', f.pillar), f.pillar, MV.choosePillar)}</select>`, { req: F.pillar === 'req' }) : '';
    const termF = fld('payment_term', MV.term, `<select data-mvsel="paymentTerm" data-key="payment_term">${optionsHTML(terms, f.paymentTerm, MV.chooseTerm)}</select>`, { req: F.payment_term === 'req' });
    const rateHint = F.rate_card === 'auto' ? `<span class="srctag">${esc(MV.fromPackage)}</span>` : [lat != null || avg != null ? esc(MV.latestAvg(lat != null ? R.baht(lat) : '—', avg != null ? R.baht(avg) : '—')) : '', esc(MV.zeroHint)].filter(Boolean).join(' · ');
    const rateF = fld('rate_card', MV.rateCard, moneyIn('rateCard', 'rate_card', F.rate_card === 'auto' ? v.rate_card : f.rateCard, { disabled: F.rate_card === 'auto' }), { req: F.rate_card === 'req', hint: rateHint + '<span class="mv-ratetotal" id="mv_ratetotal"></span>' });
    if (!qt) return sec(MV.secQt, `<div class="fields">${rateF}${termF}${pkgHTML}</div>`);
    const gen = Number(money(f.costs.gencode_expense)) > 0;
    const costs = `<div class="fields mv-costs">${rateF}` +
      fld('gencode_expense', MV.gencodeCost, moneyIn('costs.gencode_expense', 'gencode_expense', f.costs.gencode_expense, { ph: '0' })) +
      (gen ? fld('gencode_period', MV.gencodeDays, `<input type="number" min="1" step="1" inputmode="numeric" data-mv="costs.gencode_period" data-key="gencode_period" value="${esc(f.costs.gencode_period)}">`, { req: 1 }) +
        fld('gencode_start_date', MV.gencodeStart, dateHTML('data-mv="costs.gencode_start_date" data-key="gencode_start_date"', f.costs.gencode_start_date, { label: MV.gencodeStart })) : '') +
      fld('asset_fee', MV.assetFee, moneyIn('costs.asset_fee', 'asset_fee', f.costs.asset_fee, { ph: '0' })) +
      fld('expediting_fee', MV.expeditingFee, moneyIn('costs.expediting_fee', 'expediting_fee', f.costs.expediting_fee, { ph: '0' })) +
      `<div class="field wide mv-total"><div class="kv total"><span>${esc(MV.totalCost)}</span><b id="mv_total"></b></div>${!R.isBlank(d.basket_fee) && Number(d.basket_fee) > 0 ? `<div class="hint">${esc(MV.includesBasket(R.baht(d.basket_fee)))}</div>` : ''}</div></div>`;
    const postDue = F.expected_post_date && !req.next.some(x => x.field === 'expected_post_date')
      ? `<div class="fields">${fld('expected_post_date', MV.postDue, dateHTML('data-mv="postDue" data-key="expected_post_date"', f.postDue, { label: MV.postDue }), { hint: '<span class="mv-phase" data-phasefor="postDue"></span>' })}</div>` : '';
    return sec(MV.secQt, `<div class="fields">${pillarF}${termF}${pkgHTML}</div>`) + sec(MV.secCosts, costs + postDue + `<div id="mv_budget" class="mv-budget"></div>`);
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
  const shipToDeliver = (s, d) => (R.shipmentsOf(s, d.deal_id) || []).find(x => ['to_ship', 'problem', 'shipped'].includes(x.status) && !R.isLegacyDelivered(x)) || null;
  function postHTML(s, d, req) {
    const f = mv.f, accs = R.accountsOfKol(s, d.kol_id), accOpts = accs.map(a => ({ value: a.account_id, label: `${a.platform} @${a.handle}` }));
    const rows = (f.posts || []).map((r, i) => {
      const a = accs.find(x => x.account_id === r.account_id);
      return `<div class="mv-post"><div class="mv-pacc">${r.post_id ? `${U.pfIcon(a ? a.platform : 'Other')} <span>@${esc(a ? a.handle : r.account_id)}</span>` : `<select data-mv="posts.${i}.account_id" data-key="post${i}_account" aria-label="${esc(MV.account)}">${optionsHTML(accOpts, r.account_id, MV.chooseAccount)}</select>`}</div>` +
        `<input type="url" data-mv="posts.${i}.link" data-key="post${i}_link" value="${esc(r.link)}" placeholder="${esc(MV.linkPh)}" aria-label="${esc(MV.postedLink)}" autocomplete="off">` +
        `<button type="button" class="icon-btn" data-mvrmpost="${i}" title="${esc(MV.removePostRow)}" aria-label="${esc(MV.removePostRow)}">×</button><div class="mv-err" data-err="post${i}_link"></div><div class="mv-err" data-err="post${i}_account"></div></div>`;
    }).join('');
    const sh = shipToDeliver(s, d) && R.canShipWork(U.actor());
    return sec(MV.secPost, `<div class="fields">${req.approve ? fld('approve_date', MV.approveDate, dateHTML('data-mv="approveDate" data-key="approve_date"', f.approveDate || f.date, { label: MV.approveDate }), { req: 1 }) : ''}</div>` +
      (req.post ? `<div class="field wide" data-fk="posts"><label>${esc(MV.postedLink)} <span class="req">*</span></label><div class="mv-posts">${rows}</div>` +
        `<button type="button" class="link" data-mvact="addPost"${accs.length ? '' : ' disabled'}>${esc(MV.addPostRow)}</button><div class="mv-err" data-err="posts"></div></div>` : '') +
      (sh ? `<label class="tick"><input type="checkbox" data-mvtick="markDelivered"${f.markDelivered ? ' checked' : ''}> ${esc(MV.markDelivered)}</label>` : ''));
  }

  /* ===================== live parts (no redraw — typing keeps its focus) ===================== */
  function live() {
    if (!mv || !$('mv_root')) return;
    const s = state(), d = dealById(mv.id); if (!d) return;
    const req = R.stageRequirements(s, d, mv.to, mv.f), form = formFor(s, d, req), res = R.checkMove(s, d, mv.to, form), v = req.v; mv.req = req; mv.res = res;
    /* totals · the budget line · the phase of the Post due */
    const total = R.COST_KEYS.reduce((a, k) => a + (R.isBlank(v[k]) || isNaN(v[k]) ? 0 : Number(v[k])), 0);
    if ($('mv_total')) $('mv_total').textContent = R.baht(total);
    if ($('mv_ratetotal')) $('mv_ratetotal').textContent = total !== (Number(v.rate_card) || 0) ? ` · ${MV.totalLine(R.baht(total))}` : '';
    const b = R.moveBudget(s, d, mv.to, form);
    if ($('mv_budget')) $('mv_budget').innerHTML = b ? `<span class="${b.after < 0 ? 'over' : ''}">${esc(MV.budgetLine(R.baht(b.before), R.baht(b.after)))}</span>` + (b.after < 0 ? `<div class="check warn">! <span>${esc(C.msg.campaignOver(R.baht(-b.after)))}</span></div>` : '') : '';
    document.querySelectorAll('#mv_root [data-phasefor]').forEach(el => { el.textContent = phaseHint(d.campaign_id, mv.f.postDue); });
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
    const box = mv.submitted && res.errs.length ? `<div class="mv-errbox"><b>${esc(MV.errBox(res.errs.length))}</b><ul>${res.errs.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul></div>` : '';
    const other = { errs: [], warns: res.warns.filter(w => !placed.has(w.field) && w.code !== 'auto_done'), infos: res.infos };
    $('mv_checks').innerHTML = box + checksHTML(other, '');
    /* §4.14 — the checklist (Post) */
    if ($('mv_list')) $('mv_list').innerHTML = req.to && R.isPostStep(req.to) && req.kind === 'forward' ? checklistHTML(req, res) : '';
  }
  function checklistHTML(req, res) {
    const L = MV.checklist, bad = keys => res.errs.some(e => keys.some(k => e.field === k || String(e.field).startsWith(k)));
    const qtKeys = ['pillar', 'payment_term', 'package_id', 'package_units', 'rate_card', 'gencode_expense', 'gencode_period', 'asset_fee', 'expediting_fee'];
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
      const sel = e.target.closest('[data-mvsel]');
      if (sel) { const p = sel.dataset.mvsel; mv.dirty = true;
        if (p === 'to') { mv.to = sel.value; mv.f.addRound = false; mv.f.nextRound = false; mv.f.posts = null; }
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
  }
  function onClick(e) {
    if (!mv) return;
    const pl = e.target.closest('[data-plus]');
    if (pl) { const [path, n] = pl.dataset.plus.split('|'); if (!R.isISODate(mv.f.date)) return; const iso = R.addDays(mv.f.date, Number(n)); setPath(path, iso); mv.dirty = true;
      const h = $('mv_root').querySelector(`input[type=hidden][data-mv="${CSS.escape(path)}"]`); setDate(h, iso); live(); return; }
    const rm = e.target.closest('[data-mvrmpost]'); if (rm) { mv.f.posts.splice(+rm.dataset.mvrmpost, 1); mv.dirty = true; draw(true); return; }
    const a = e.target.closest('[data-mvact]');
    if (a && !a.disabled) {
      const act = a.dataset.mvact, s = state(), d = dealById(mv.id);
      if (act === 'nextRoundOn' || act === 'nextRoundOff') { mv.f.nextRound = act === 'nextRoundOn'; mv.dirty = true; draw(true); return; }
      if (act === 'addPost') { const used = new Set(mv.f.posts.map(r => r.account_id)), acc = R.accountsOfKol(s, d.kol_id).find(x => !used.has(x.account_id)) || R.accountsOfKol(s, d.kol_id)[0];
        mv.f.posts.push({ post_id: null, account_id: acc ? acc.account_id : '', link: '' }); mv.dirty = true; draw(true); return; }
      if (act === 'newPackage') { newPackagePanel(d); return; }
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
    if (mv.res.errs.length) { const first = $('mv_root').querySelector('.invalid, .mv-err .err'); if (first) first.scrollIntoView({ block: 'center' }); return; }
    const form = formFor(s, d, mv.req), to = mv.to, ed = mv.ed, deliver = mv.f.markDelivered && R.isPostStep(mv.req.to), o = mv.o;
    mv.applied = true;
    U.closeModal();
    apply(d.deal_id, to, form, { ed, deliver, onDone: o.onDone });
  }
  /* the move (dialog or drop): applyMove · its posts · its notes · Undo puts every part back */
  function apply(dealId, to, form, o = {}) {
    const s = state(), d = dealById(dealId); if (!d) return null;
    const key = form.notes && R.draftNo(R.stepOf(s.lookups, to)) ? R.draftKey(R.draftNo(R.stepOf(s.lookups, to))) : null;
    const snap = snapshot(s, dealId, key);
    let pn = parseInt(store.newId('post').slice(1), 10);
    const r = R.applyMove(s, d, to, form, { logId: store.newLogId(), quoteId: store.newId('quote'), eventId: store.newEventId(), now: new Date(), user: userId(), postId: () => 'P' + String(pn++).padStart(6, '0') });
    s.deals[s.deals.indexOf(d)] = r.deal; r.logs.forEach(l => s.deal_status_log.push(l)); if (r.quote) s.kol_rate_quotes.push(r.quote); r.events.forEach(ev => s.deal_events.push(ev));
    if (r.posts) s.deal_posts = s.deal_posts.filter(p => p.deal_id !== dealId).concat(r.posts);
    if (r.note) R.putStepNote(s, r.note);
    if (o.deliver) { const sh = shipToDeliver(s, r.deal); if (sh) { let e = 0; const base = store.newEventId(); const evs = R.shipQuick(s, sh, sh.status === 'shipped' ? 'delivered' : 'both', { date: form.date }, { eventId: () => base + e++, now: new Date().toISOString(), user: userId() }); if (evs) s.deal_events.push(...evs); } }
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
    }, 10000);
    return r;
  }
  const clone = x => (x == null ? x : JSON.parse(JSON.stringify(x)));
  function snapshot(s, id, key) {
    return { id, key, deal: clone(dealById(id)), posts: clone(R.postsOf(s, id)), note: key ? clone(R.stepNoteOf(s, id, key)) : undefined,
      logMax: s.deal_status_log.reduce((m, l) => Math.max(m, Number(l.log_id) || 0), 0), eventMax: s.deal_events.reduce((m, e) => Math.max(m, Number(e.event_id) || 0), 0),
      quotes: new Set(s.kol_rate_quotes.map(q => q.quote_id)), ships: clone((s.sample_shipments || []).filter(x => x.deal_id === id)) };
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

  return { open, isOpen, apply, phaseHint, openNotes, notesEditor, notesEditorHTML, notesWire, notesClick, fillThumbs, snapshot, restore, fmtMoney, money };
})();
